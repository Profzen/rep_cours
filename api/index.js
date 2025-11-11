// api/index.js
const serverless = require('serverless-http');
const path = require('path');

// require l'app Express que l'on a dans server/server.js
const app = require('../server/server');

// serverless wrapper
module.exports = serverless(app);
