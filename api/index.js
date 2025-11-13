// api/index.js
'use strict';

const serverless = require('serverless-http');
const path = require('path');

let app;
try {
  // require the express app from server/server.js
  // using path.join to be robust across OS
  app = require(path.join(__dirname, '..', 'server', 'server'));
  if (!app || typeof app !== 'function') {
    console.error('require(server) did not return an express app.');
    module.exports = async (req, res) => {
      res.statusCode = 500;
      res.end('Server app not available');
    };
    return;
  }
} catch (err) {
  console.error('Failed to require server app:', err && err.message ? err.message : err);
  module.exports = async (req, res) => {
    res.statusCode = 500;
    res.end('Server app not available');
  };
  return;
}

// Wrap express app into serverless handler
const handler = serverless(app);

// Export handler for Vercel
module.exports = handler;
