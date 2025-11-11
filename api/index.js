// api/index.js
const serverless = require('serverless-http');
const path = require('path');

let app;
try {
  app = require(path.join(__dirname, '..', 'server', 'server'));
} catch (err) {
  console.error('Failed to require server app:', err && err.message ? err.message : err);
  // provide a fallback handler so Vercel function doesn't 500 during build
  module.exports = async (req, res) => {
    res.statusCode = 500;
    res.end('Server app not available');
  };
  return;
}

module.exports = serverless(app);
