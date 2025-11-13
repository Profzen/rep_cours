// api/[...slug].js
'use strict';

/**
 * Catch-all Vercel function that proxies /api/* requests
 * to the Express app exported by server/server.js via serverless-http.
 */

const serverless = require('serverless-http');
const path = require('path');

let app;
try {
  // require the express app from server/server.js
  // __dirname is /{project}/api
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
