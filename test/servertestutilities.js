const WebSocket = require('ws')
const _ = require('lodash')

// Connects to the url via ws
// and provides Promises that are either resolved within
// timeout period as the next message from the ws or
// the string "timeout" in case timeout fires
function WsPromiser (url) {
  this.ws = new WebSocket(url)
  this.ws.on('message', this.onMessage.bind(this))
  this.callees = []
}

WsPromiser.prototype.nextMsg = function () {
  const callees = this.callees
  return new Promise((resolve, reject) => {
    callees.push(resolve)
    setTimeout(_ => {
      resolve('timeout')
    }, 250)
  })
}

WsPromiser.prototype.onMessage = function (message) {
  const theCallees = this.callees
  this.callees = []
  theCallees.forEach(callee => callee(message))
}

WsPromiser.prototype.send = function (message) {
  const that = this
  return new Promise((resolve, reject) => {
    that.ws.send(JSON.stringify(message))
    setTimeout(() => resolve('wait over'), 100)
  })
}

module.exports = {
  WsPromiser: WsPromiser,
  startServerP: function startServerP (port, settings) {
    const Server = require('../lib')
    var opts = {
      config: {
        defaults: {
          vessels: {
            self: {
              uuid: 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
            }
          }
        },
        settings: {
          port,
          pipedProviders: [
            {
              id: 'deltaFromHttp',
              pipeElements: [
                {
                  type: 'test/httpprovider'
                }
              ]
            }
          ],
          interfaces: {
            plugins: false
          }
        }
      }
    }
    if (!_.isUndefined(settings)) {
      _.merge(opts.config.settings, settings)
    }
    const server = new Server(opts)
    return server.start()
  }
}
