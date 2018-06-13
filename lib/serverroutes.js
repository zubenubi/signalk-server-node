/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const fs = require('fs')
const page = require('./page')
const debug = require('debug')('signalk-server:serverroutes')
const path = require('path')
const _ = require('lodash')
const config = require('./config/config')
const { getHttpPort, getSslPort } = require('./ports')

const defaultSecurityStrategy = './tokensecurity'

module.exports = function(app, saveSecurityConfig, getSecurityConfig) {
  var securityWasEnabled

  app.get('/', (req, res) => {
    res.redirect('@signalk/server-admin-ui')
  })
  app.get('/admin', (req, res) => {
    res.redirect('/@signalk/server-admin-ui')
  })

  app.get('/apps', (req, res, next) => {
    var html = fs.readFileSync(__dirname + '/appindex.html', {
      encoding: 'utf8'
    })
    var insertionIndex = html.indexOf('<div/>')
    var sliceToInsertion = html.slice(0, insertionIndex)
    var sliceToEnd = html.slice(insertionIndex)

    var result = sliceToInsertion
    result += '<ul class="list-group">'
    result += app.webapps.reduce(function(result, componentInfo) {
      result += '<li class="list-group-item">'
      result +=
        '<b><a href="' +
        componentInfo.name +
        '">' +
        componentInfo.name +
        '</a></b> '
      result += componentInfo.description
      result += '</li>\n'
      return result
    }, '')
    result += '</ul>'
    result += sliceToEnd
    res.send(result)
  })

  app.put('/restart', (req, res, next) => {
    if (app.securityStrategy.allowRestart(req)) {
      res.send('Restarting...')
      setTimeout(function() {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  app.get('/loginStatus', (req, res, next) => {
    result = app.securityStrategy.getLoginStatus(req)
    result.securityWasEnabled = !_.isUndefined(securityWasEnabled)

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', 0)
    res.json(result)
  })

  app.get('/security/config', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      res.json(app.securityStrategy.getConfig(config))
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put('/security/config', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      var config = app.securityStrategy.setConfig(config, req.body)
      saveSecurityConfig(app, config, err => {
        if (err) {
          console.log(err)
          res.status(500)
          res.send('Unable to save configuration change')
          return
        }
        res.send('security config saved')
      })
    } else {
      res.status(401).send('Security config not allowed')
    }
  })

  app.get('/security/users', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      res.json(app.securityStrategy.getUsers(config))
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put('/security/users/:id', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.updateUser(
        config,
        req.params.id,
        req.body,
        (err, config) => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send('Unable to add user')
          } else if (config) {
            saveSecurityConfig(app, config, err => {
              if (err) {
                console.log(err)
                res.status(500)
                res.send('Unable to save configuration change')
                return
              }
              res.send('User updated')
            })
          } else {
            res.send('User updated')
          }
        }
      )
    } else {
      res.status(401).json('security config not allowed')
    }
  })

  app.post('/security/users/:id', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      var user = req.body
      user.userId = req.params.id
      app.securityStrategy.addUser(config, user, (err, config) => {
        if (err) {
          console.log(err)
          res.status(500)
          res.send('Unable to add user')
        } else if (config) {
          saveSecurityConfig(app, config, err => {
            if (err) {
              console.log(err)
              res.status(500)
              res.send('Unable to save configuration change')
              return
            }
            res.send('User added')
          })
        } else {
          res.send('User added')
        }
      })
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put('/security/user/:username/password', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.setPassword(
        config,
        req.params.username,
        req.body,
        (err, config) => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send(err)
            res.send('Unable to change password')
            return
          }
          if (config) {
            saveSecurityConfig(app, config, err => {
              if (err) {
                console.log(err)
                res.status(500)
                res.send('Unable to save configuration change')
                return
              }
              res.send('Password changed')
            })
          } else {
            res.send('Password changed')
          }
        }
      )
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.delete('/security/users/:username', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.deleteUser(
        config,
        req.params.username,
        (err, config) => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send('Unable to delete user')
            return
          }
          if (config) {
            saveSecurityConfig(app, config, err => {
              if (err) {
                console.log(err)
                res.status(500)
                res.send('Unable to save configuration change')
                return
              }
              res.send('User deleted')
            })
          } else {
            res.send('User deleted')
          }
        }
      )
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.get('/security/token/:id/:expiration', (req, res, next) => {
    app.securityStrategy.generateToken(
      req,
      res,
      next,
      req.params.id,
      req.params.expiration
    )
  })

  app.get('/settings', (req, res, next) => {
    var settings = {
      interfaces: {},
      options: {
        ssl: app.config.settings.ssl || false,
        mdns: app.config.settings.mdns || false,
        enablePluginLogging:
          _.isUndefined(app.config.settings.enablePluginLogging) ||
          app.config.settings.enablePluginLogging
      },
      loggingDirectory: app.config.settings.loggingDirectory,
      port: getHttpPort(app),
      sslport: getSslPort(app)
    }

    var availableInterfaces = require('./interfaces')
    _.forIn(availableInterfaces, function(interface, name) {
      settings.interfaces[name] =
        _.isUndefined(app.config.settings.interfaces) ||
        _.isUndefined(app.config.settings.interfaces[name]) ||
        app.config.settings.interfaces[name]
    })

    res.json(settings)
  })

  if (app.securityStrategy.getUsers().length == 0) {
    app.post('/enableSecurity', (req, res, next) => {
      if (app.securityStrategy.isDummy()) {
        app.config.settings.security = { strategy: defaultSecurityStrategy }
        config.writeSettingsFile(app, app.config.settings, err => {
          if (err) {
            console.log(err)
            res.status(500).send('Unable to save to settings file')
          } else {
            var config = {}
            var securityStrategy = require(defaultSecurityStrategy)(
              app,
              config,
              saveSecurityConfig
            )
            addUser(req, res, securityStrategy, config)
          }
        })
      } else {
        addUser(req, res, app.securityStrategy)
      }
      securityWasEnabled = true

      function addUser(req, res, securityStrategy, config) {
        if (!config) {
          config = app.securityStrategy.getConfiguration()
        }
        securityStrategy.addUser(config, req.body, (err, config) => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send('Unable to add user')
          } else {
            saveSecurityConfig(app, config, err => {
              if (err) {
                console.log(err)
                res.status(500)
                res.send('Unable to save security configuration change')
              }
              res.send('Security enabled')
            })
          }
        })
      }
    })
  }

  app.put('/settings', (req, res, next) => {
    var settings = req.body

    _.forIn(settings.interfaces, (enabled, name) => {
      app.config.settings.interfaces[name] = enabled
    })

    if (!_.isUndefined(settings.options.mdns)) {
      app.config.settings.mdns = settings.options.mdns
    }

    if (!_.isUndefined(settings.options.ssl)) {
      app.config.settings.ssl = settings.options.ssl
    }

    if (!_.isUndefined(settings.options.enablePluginLogging)) {
      app.config.settings.enablePluginLogging =
        settings.options.enablePluginLogging
    }

    if (!_.isUndefined(settings.port)) {
      app.config.settings.port = Number(settings.port)
    }

    if (!_.isUndefined(settings.sslport)) {
      app.config.settings.sslport = Number(settings.sslport)
    }

    if (!_.isUndefined(settings.loggingDirectory)) {
      app.config.settings.loggingDirectory = settings.loggingDirectory
    }

    config.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        res.send('Settings changed')
      }
    })
  })

  app.get('/vessel', (req, res, next) => {
    var json = {
      name: config.getDefaultValue(app, 'name'),
      mmsi: config.getDefaultValue(app, 'mmsi'),
      uuid: config.getDefaultValue(app, 'uuid'),
      beam: config.getDefaultValue(app, 'design.beam'),
      height: config.getDefaultValue(app, 'design.airHeight'),
      gpsFromBow: config.getDefaultValue(app, 'sensors.gps.fromBow'),
      gpsFromCenter: config.getDefaultValue(app, 'sensors.gps.fromCenter')
    }

    let draft = config.getDefaultValue(app, 'design.draft')
    if (draft && !_.isUndefined(draft.maximum)) {
      json.draft = draft.maximum
    }

    let length = config.getDefaultValue(app, 'design.length')
    if (length && !_.isUndefined(length.overall)) {
      json.length = length.overall
    }

    res.json(json)
  })

  app.put('/vessel', (req, res, next) => {
    var newVessel = req.body

    function set(path, value) {
      config.setDefaultValue(app, path, value)
    }

    if (newVessel.name) {
      set('name', newVessel.name)
    }

    if (newVessel.mmsi) {
      set('mmsi', newVessel.mmsi)
    } else {
      config.removeDefaultValue(app, 'mmsi')
    }

    if (
      newVessel.uuid &&
      (_.isUndefined(newVessel.mmsi) || newVessel.mmsi.length == 0)
    ) {
      console.log('setting uuid')
      set('uuid', newVessel.uuid)
    } else {
      config.removeDefaultValue(app, 'uuid')
    }

    if (newVessel.draft) {
      set('design.draft', { maximum: Number(newVessel.draft) })
    } else {
      config.removeDefaultValue(app, 'design.draft')
    }

    if (newVessel.length) {
      set('design.length', { overall: Number(newVessel.length) })
    } else {
      config.removeDefaultValue(app, 'design.length')
    }

    if (newVessel.beam) {
      set('design.beam', Number(newVessel.beam))
    } else {
      config.removeDefaultValue(app, 'design.beam')
    }

    if (newVessel.height) {
      set('design.airHeight', Number(newVessel.height))
    } else {
      config.removeDefaultValue(app, 'design.airHeight')
    }

    if (newVessel.gpsFromBow) {
      set('sensors.gps.fromBow', Number(newVessel.gpsFromBow))
    } else {
      config.removeDefaultValue(app, 'sensors.gps.fromBow')
    }

    if (newVessel.gpsFromCenter) {
      set('sensors.gps.fromCenter', Number(newVessel.gpsFromCenter))
    } else {
      config.removeDefaultValue(app, 'sensors.gps.fromCenter')
    }

    config.writeDefaultDeltasFile(app, app.config.defaultDeltas, err => {
      if (err) {
        res.status(500).send('Unable to save to defaults file')
      } else {
        res.send('Vessel changed')
      }
    })
  })

  app.get('/availablePaths', (req, res, next) => {
    res.json(app.streambundle.getAvailablePaths())
  })
}
