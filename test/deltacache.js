var chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
chai.use(require('@signalk/signalk-schema').chaiModule)
const _ = require('lodash')
const assert = require('assert')
const freeport = require('freeport-promise')
const WebSocket = require('ws')
const rp = require('request-promise')
const startServerP = require('./servertestutilities').startServerP

const testDelta = {
  context: 'vessels.self',
  updates: [
    {
      timestamp: '2014-05-03T09:14:11.100Z',
      values: [
        {
          path: 'navigation.trip.log',
          value: 43374
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.099Z',
      values: [
        {
          path: 'navigation.log',
          value: 17404540
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.098Z',
      values: [
        {
          path: 'navigation.courseOverGroundTrue',
          value: 172.9
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.097Z',
      values: [
        {
          path: 'navigation.speedOverGround',
          value: 3.85
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.096Z',
      values: [
        {
          path: '',
          value: { name: 'TestBoat' }
        }
      ]
    }
  ]
}

const expectedOrder = [
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.096Z',
        values: [
          {
            path: '',
            value: {
              name: 'TestBoat'
            }
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'schema',
        timestamp: '2014-05-03T09:14:11.097Z',
        meta: [
          {
            path: 'navigation.speedOverGround',
            value: {
              units: 'm/s',
              description:
                "Vessel speed over ground. If converting from AIS 'HIGH' value, set to 102.2 (Ais max value) and add warning in notifications"
            }
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.097Z',
        values: [
          {
            path: 'navigation.speedOverGround',
            value: 3.85
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'schema',
        timestamp: '2014-05-03T09:14:11.098Z',
        meta: [
          {
            path: 'navigation.courseOverGroundTrue',
            value: {
              units: 'rad',
              description: 'Course over ground (true)'
            }
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.098Z',
        values: [
          {
            path: 'navigation.courseOverGroundTrue',
            value: 172.9
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'schema',
        timestamp: '2014-05-03T09:14:11.099Z',
        meta: [
          {
            path: 'navigation.log',
            value: {
              units: 'm',
              description: 'Total distance traveled'
            }
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.099Z',
        values: [
          {
            path: 'navigation.log',
            value: 17404540
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'schema',
        timestamp: '2014-05-03T09:14:11.100Z',
        meta: [
          {
            path: 'navigation.trip.log',
            value: {
              units: 'm',
              description:
                'Total distance traveled on this trip / since trip reset'
            }
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.100Z',
        values: [
          {
            path: 'navigation.trip.log',
            value: 43374
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'defaults',
        timestamp: '2018-06-14T18:19:39.083Z',
        values: [
          {
            path: '',
            value: {
              uuid: 'urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e'
            }
          }
        ]
      }
    ]
  }
]

describe('deltacache', () => {
  var serverP, port, deltaUrl, deltaP

  function sendDelta (delta) {
    return rp({ url: deltaUrl, method: 'POST', json: delta })
  }

  before(() => {
    serverP = freeport().then(p => {
      port = p
      deltaUrl = 'http://localhost:' + port + '/signalk/v1/api/_test/delta'
      return startServerP(p)
    })
    deltaP = serverP.then(() => {
      return sendDelta(testDelta)
    })
  })

  after(done => {
    serverP.then(server => server.stop()).then(() => {
      done()
    })
  })

  it('returns valid full tree', function () {
    return serverP.then(server => {
      return deltaP.then(() => {
        var fullTree = server.app.deltaCache.buildFull(null, [])
        fullTree.should.be.validSignalK

        var self = _.get(fullTree, fullTree.self)
        self.should.have.nested.property('navigation.trip.log.value', 43374)
        self.should.have.nested.property('navigation.log.value', 17404540)
        self.should.have.nested.property(
          'navigation.courseOverGroundTrue.value',
          172.9
        )
        self.should.have.nested.property(
          'navigation.speedOverGround.value',
          3.85
        )
        self.should.have.nested.property('name', 'TestBoat')
      })
    })
  })

  it('deltas ordered properly', function () {
    return serverP.then(server => {
      return deltaP.then(() => {
        var deltas = server.app.deltaCache.getCachedDeltas(null, delta => true)
        assert(deltas.length == expectedOrder.length)
        for (var i = 0; i < expectedOrder.length; i++) {
          if (deltas[i].updates[0].values) {
            deltas[i].updates[0].values[0].path.should.equal(
              expectedOrder[i].updates[0].values[0].path
            )
          } else {
            deltas[i].updates[0].meta[0].path.should.equal(
              expectedOrder[i].updates[0].meta[0].path
            )
          }
        }
      })
    })
  })

  it('returns /sources correctly', function () {
    return serverP.then(server => {
      return deltaP.then(() => {
        var fullTree = server.app.deltaCache.buildFull(null, ['sources'])
        fullTree.should.be.validSignalK
        fullTree.sources.should.deep.equal({ deltaFromHttp: {} })
      })
    })
  })
})
