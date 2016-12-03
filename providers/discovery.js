/*
 * Copyright 2016-2017 Fabian Tollenaar <fabian@decipher.industries>
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

'use strict'

const Address6 = require('ip-address').Address6
const WebSocket = require('ws')
const mdns = require('mdns')
const Transform = require('stream').Transform
const debug = require('debug')('signalk-provider-discovery')

function DiscoveryService(options) {
  if (!(this instanceof DiscoveryService)) {
    return new DiscoveryService(options)
  }

  options.objectMode = true
  
  this.options = options
  this.sockets = {}
  this.localHosts = []

  Transform.call(this, options)

  if (Array.isArray(options.hosts) && options.hosts.length > 0) {
    options.hosts.forEach(host => {
      if (host.charAt(host.length - 1) === '/') {
        host = host.slice(0, -1)
      }

      this.startListeningToHost(host)
    })
  }

  if (options.autodiscover === true) {
    this.discoverLocalSignalKServers()
  }
}

DiscoveryService.prototype.parseService = function (cb) {
  return function(service) {
    let ip = null

    if (service.name === 'signalk') {
      ip = service.addresses.reduce((found, address) => {
        if (typeof address === 'string' && address.trim().length > 0 && address.indexOf(':') === -1 && address.indexOf('.') !== -1) {
          found = address
        }

        return found
      }, null)
    }

    if (ip === null) {
      return cb(null)
    }

    return cb({
      ip,
      name: service.name,
      port: service.port,
      host: `${ip}:${service.port}`
    })
  }
}

DiscoveryService.prototype.discoverLocalSignalKServers = function () {
  const browser = mdns.createBrowser(mdns.tcp('signalk-ws'))
  
  browser.on('serviceUp', this.parseService(service => {
    if (service === null || this.localHosts.indexOf(service.host) !== -1) {
      return
    }
    
    debug(`Found ${service.host}. Adding to localHosts.`)
    
    this.localHosts.push(service.host)
    this.localHosts.forEach(host => {
      debug(`Connecting to ${host}.`)
      this.startListeningToHost(host)
    })
  }))

  browser.on('serviceDown', this.parseService(service => {
    if (service === null || this.localHosts.indexOf(service.host) === -1) {
      return
    }

    debug(`Removing ${service.host} from "localHosts"`)
    
    const toRemove = this.localHosts.reduce((found, h, i) => {
      if (h === service.host) {
        found = i
      }
      return found
    }, -1)

    if (toRemove > -1) {
      this.localHosts.splice(toRemove, 1)
    }

    if (typeof this.sockets[service.host] !== 'undefined') {
      sockets[service.host].close()
      this.sockets[service.host] = null
      delete this.sockets[service.host]
    }
  }))

  browser.start()
}

DiscoveryService.prototype.startListeningToHost = function (host) {
  if (typeof this.sockets[host] !== 'undefined') {
    return
  }

  host = host.replace('http', 'ws').replace('https', 'wss')

  if (host.indexOf('ws://') === -1 && host.indexOf('wss://') === -1) {
    host = `ws://${host}`
  }

  debug(`Attempting to connect to ${host}/signalk/v1/stream?stream=delta`)
  const socket = new WebSocket(`${host}/signalk/v1/stream?stream=delta`)

  socket.on('open', () => {
    debug(`WebSocket from ${host} is open.`)
    this.sockets[host] = socket
  })

  socket.on('error', err => {
    debug(`WebSocket error from ${host}: ${err.message}`)
  })

  socket.on('close', (code, message) => {
    debug(`WebSocket from ${host} closed with code ${code}: ${message}`)
    this.sockets[host] = null
    delete this.sockets[host]
    this.startListeningToHost(host)
  })

  socket.on('message', data => {
    this.write(data)
  })
}

DiscoveryService.prototype._transform = function (chunk, encoding, callback) {  
  if (Buffer.isBuffer(chunk)) {
    chunk = chunk.toString('utf-8')
  }

  if (typeof chunk === 'string') {
    try {
      chunk = JSON.parse(chunk)
    } catch (e) {
      debug(`Error parsing chunk: ${e.message}, chunk: ${chunk}`)
      chunk = null
    }
  }

  if (chunk !== null) {
    this.push(chunk)
  }

  callback()
}

require('util').inherits(DiscoveryService, Transform)

module.exports = DiscoveryService

