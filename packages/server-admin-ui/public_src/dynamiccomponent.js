(function () {
  class Hello extends GReact.Component {
    render () {
      return GReact.createElement('div', null, `Hello World`)
    }
  }

  window.Hello = Hello
})()
