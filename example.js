'use strict'

const parser = require('./kaya')

console.log(parser.parseReplaySync(process.argv[2]))
