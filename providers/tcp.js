/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@decipher.industries>
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

var net       = require('net')
  , Transform = require('stream').Transform
  , debug     = require('debug')('signalk-provider-tcp')
  , TIMEOUT   = 150000
;

function TcpStream(options) {
  if (!(this instanceof TcpStream)) {
    return new TcpStream(options)
  }

  Transform.call(this, options)

  this.options = options
  this.reconnect = (typeof options.reconnect === 'boolean' && options.reconnect === false) ? false : true
  this.socket = null
  this.retries = 0
  this.maxRetries = (typeof options.maxRetries === 'number' && options.maxRetries > 0) ? options.maxRetries : 10

  this.__reset = null
  this.__timeout = null
  this.__last = -1

  this.on('error', (err) => {
    debug('Stream: "error". Message: ' + err.message)
  })

  this.start(true)
}

require('util').inherits(TcpStream, Transform)

TcpStream.prototype.handleTimeout = function () {
  if ((Date.now() - this.__last) > 18000000 && this.__reset === null) {
    debug('Connection timed out. Resetting.')
    return this.start()
  }

  if (this.__timeout !== null) {
    clearTimeout(this.__timeout)
  }

  this.__timeout = setTimeout(this.handleTimeout.bind(this), TIMEOUT)
}

TcpStream.prototype.start = function(force) {
  if (this.socket !== null) {
    this.socket.unpipe(this)
    this.socket.removeAllListeners('error')
    this.socket.removeAllListeners('close')
    this.socket.removeAllListeners('end')
    this.socket.destroy()
    this.socket = null
  }

  if (this.__timeout !== null) {
    clearTimeout(this.__timeout)
  }

  if (force !== true && this.reconnect !== true) {
    return
  }

  this.socket = net.connect(this.options)
  this.__timeout = setTimeout(this.handleTimeout.bind(this), TIMEOUT)

  this.socket.on('close', () => {
    if (this.__reset === null) {
      this.start()
    }
  })

  this.socket.on('connect', () => {
    if (this.__reset !== null) {
      clearTimeout(this.__reset)
    }

    debug('TCP: connected')
  })

  this.socket.on('error', (err) => {
    debug('TCP: error - ' + err.message)
    this.retries++

    if(this.retries < this.maxRetries) {
      debug('TCP: retrying (' + this.retries + ' / ' + this.maxRetries + ')')
      return this.start()
    }

    if (this.__reset !== null) {
      return
    }

    if (this.__timeout !== null) {
      clearTimeout(this.__timeout)
    }

    this.__reset = setTimeout(() => {
      this.maxRetries = 10
      this.retries = 0
      this.__reset = null
      this.start()
    }, TIMEOUT)
  })

  this.socket.pipe(this)
}

TcpStream.prototype._transform = function(chunk, encoding, done) {
  this.__last = Date.now()
  this.push(chunk)
  done()
}

TcpStream.prototype.end = function() {
  this.start()
}

module.exports = TcpStream
