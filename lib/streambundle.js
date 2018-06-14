/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

var Bacon = require('baconjs')
const _ = require('lodash')
const { getMetadata } = require('@signalk/signalk-schema')

function StreamBundle (app, selfId) {
  this.selfContext = 'vessels.' + selfId
  this.buses = {}
  this.selfBuses = {}
  this.streams = {}
  this.keys = new Bacon.Bus()
  this.availableSelfPaths = []
  this.metaSent = {}
  this.app = app
}

StreamBundle.prototype.pushDelta = function (delta) {
  try {
    if (delta.updates) {
      delta.updates.forEach(update => {
        var items = update.values || update.meta
        if (items) {
          items.forEach(pathValue => {
            let outgoingPath = pathValue.path
            if (update.meta) {
              outgoingPath = outgoingPath + '.meta'
            }
            var paths =
              pathValue.path === ''
                ? getPathsFromObjectValue(pathValue.value)
                : [outgoingPath]
            /*
              For values with empty path and object value we enumerate all the paths in the object
              and push the original delta's value to all those buses, so that subscriptionmanager
              can track hits also for paths of naked values (no path, just object value) and when
              regenerating the outgoing delta will use the unmodified, original delta pathvalue.
            */
            paths.forEach(path => {
              if (_.isUndefined(update.meta)) {
                addMetaDelta(
                  this,
                  delta.context,
                  pathValue.path,
                  update.timestamp
                )
              }
              this.push(path, {
                path: outgoingPath,
                value: pathValue.value,
                context: delta.context,
                source: update.source,
                $source: update.$source,
                timestamp: update.timestamp
              })
            })
          }, this)
        }
      }, this)
    }
  } catch (e) {
    console.error(e)
  }
}

function addMetaDelta (that, contextPath, path, timestamp) {
  if (!that.metaSent[contextPath]) {
    that.metaSent[contextPath] = []
  } else if (that.metaSent[contextPath].indexOf(path) != -1) {
    return
  }
  that.metaSent[contextPath].push(path)
  let meta = getMetadata(contextPath + '.' + path)
  if (meta) {
    that.app.handleMessage('schema', {
      context: contextPath,
      updates: [
        {
          timestamp: timestamp,
          meta: [
            {
              path: path,
              value: meta
            }
          ]
        }
      ]
    })
  }
}

function getPathsFromObjectValue (objectValue) {
  return Object.keys(objectValue).reduce((acc, propName) => {
    const propValue = objectValue[propName]
    if (_.isObject(propValue)) {
      accumulatePathsFromValues(acc, propName + '.', propValue)
    } else {
      acc.push(propName)
    }
    return acc
  }, [])
}

function accumulatePathsFromValues (acc, prefix, objectValue) {
  Object.keys(objectValue).forEach(propName => {
    const propValue = objectValue[propName]
    if (_.isObject(propValue)) {
      accumulatePathsFromValues(acc, `${prefix}.${propName}`, propValue)
    }
  })
}

StreamBundle.prototype.push = function (path, pathValueWithSourceAndContext) {
  if (this.availableSelfPaths.indexOf(path) == -1) {
    this.availableSelfPaths.push(path)
  }
  this.getBus(path).push(pathValueWithSourceAndContext)
  if (pathValueWithSourceAndContext.context === this.selfContext) {
    this.getSelfBus(path).push(pathValueWithSourceAndContext)
    this.getSelfStream(path).push(pathValueWithSourceAndContext.value)
  }
}

StreamBundle.prototype.getBus = function (path) {
  var result = this.buses[path]
  if (!result) {
    result = this.buses[path] = new Bacon.Bus()
    this.keys.push(path)
  }
  return result
}

StreamBundle.prototype.getSelfStream = function (path) {
  var result = this.streams[path]
  if (!result) {
    result = this.streams[path] = new Bacon.Bus()
  }
  return result
}

StreamBundle.prototype.getSelfBus = function (path) {
  var result = this.selfBuses[path]
  if (!result) {
    result = this.selfBuses[path] = new Bacon.Bus()
  }
  return result
}

StreamBundle.prototype.getAvailablePaths = function () {
  return this.availableSelfPaths
}

function toDelta (normalizedDeltaData) {
  var parts = normalizedDeltaData.path.split('.')
  var type = parts[parts.length - 1] === 'meta' ? 'meta' : 'values'
  var path
  if (type === 'meta') {
    path = parts.slice(0, parts.length - 1).join('.')
  } else {
    path = normalizedDeltaData.path
  }
  return {
    context: normalizedDeltaData.context,
    updates: [
      {
        source: normalizedDeltaData.source,
        $source: normalizedDeltaData['$source'],
        timestamp: normalizedDeltaData.timestamp,
        [type]: [
          {
            path: path,
            value: normalizedDeltaData.value
          }
        ]
      }
    ]
  }
}

module.exports = { StreamBundle, toDelta }
