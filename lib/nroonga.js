'use strict'
if (process.platform === 'win32') {
  const path = require('path')
  process.env.PATH = path.resolve(__dirname, '../win/groonga/bin') + ';' + process.env.PATH
}
module.exports = require('../build/Release/nroonga_bindings.node')
