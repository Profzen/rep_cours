// server/server.js
'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();

// serve static public for local dev
app.use(express.static(path.join(process.cwd(), 'public')));

// body parsers
app.use(bodyParser.json({ limit: '800kb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// mount same handlers as serverless
// We require the API modules and call them with (req,res)
function mountRoute(routePath, handlerPath) {
  const handler = require(handlerPath);
  app.all(routePath, (req, res, next) => handler(req, res, next));
}

// files list & query
mountRoute('/api/files', path.join(process.cwd(), 'api', 'files', 'index.js'));
// file by id (express param)
mountRoute('/api/files/:id', path.join(process.cwd(), 'api', 'files', '[id].js'));
// download
mountRoute('/api/files/:id/download', path.join(process.cwd(), 'api', 'files', '[id]', 'download.js'));
// upload
mountRoute('/api/upload', path.join(process.cwd(), 'api', 'upload.js'));
// contact
mountRoute('/api/contact', path.join(process.cwd(), 'api', 'contact.js'));
// admin
mountRoute('/api/admin/login', path.join(process.cwd(), 'api', 'admin', 'login.js'));
mountRoute('/api/admin/verify', path.join(process.cwd(), 'api', 'admin', 'verify.js'));

// simple health-check
app.get('/', (req, res) => res.send('Rep Cours - dev server running'));

// start only when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Local dev server running on http://localhost:${PORT}`));
}

module.exports = app;
