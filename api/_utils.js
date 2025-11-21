// api/_utils.js
'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');
const url = require('url');

const MONGO_URL = process.env.MONGO_URL || '';
const DB_NAME = process.env.DB_NAME || 'Rep';
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'MaCleJWTTresSecrete2025';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'motDePasseAdmin123';
const CONTACT_RECEIVER = process.env.CONTACT_RECEIVER || 'profzzen@gmail.com';

// Cloudinary config (may be empty if not used)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

// Build transporter factory so we can verify and fallback to Ethereal for debug
let transporter = null;
let transporterInfo = { usingEthereal: false, configured: false, details: null };

async function createTransporter() {
  // if already created, return it
  if (transporter) return transporter;

  const host = (process.env.SMTP_HOST || '').trim();
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
  const secure = secureEnv === 'true' || secureEnv === '1' || (port === 465);

  if (host && user && pass) {
    // create real transporter
    transporter = nodemailer.createTransport({
      host,
      port: port || (secure ? 465 : 587),
      secure: !!secure,
      auth: { user, pass },
      // helpful when some providers use self-signed certs; keep commented unless needed
      // tls: { rejectUnauthorized: false }
    });
    transporterInfo.configured = true;
    transporterInfo.usingEthereal = false;
    transporterInfo.details = { host, port: port || (secure ? 465 : 587), secure, user: user.replace(/.(?=.{2,}@)/g,'*') };

    // verify transporter right away (best-effort)
    try {
      await transporter.verify();
      console.log('✅ SMTP transporter verified:', transporterInfo.details);
    } catch (e) {
      console.error('❌ SMTP transporter verification failed:', e && e.message ? e.message : e);
      // keep transporter (we still attempt sendMail to collect detailed errors)
    }
    return transporter;
  }

  // No SMTP creds provided — create Ethereal account for local debug (not for prod)
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    transporterInfo.configured = true;
    transporterInfo.usingEthereal = true;
    transporterInfo.details = { host: 'smtp.ethereal.email', user: testAccount.user };
    console.warn('⚠️ No SMTP credentials provided — using Ethereal test account (debug only). See nodemailer test URL in logs.');
    return transporter;
  } catch (ethErr) {
    console.error('❌ Failed to create Ethereal test account:', ethErr && ethErr.message ? ethErr.message : ethErr);
    // leave transporter null -> callers should handle it
    transporter = null;
    transporterInfo.configured = false;
    transporterInfo.usingEthereal = false;
    transporterInfo.details = null;
    return null;
  }
}

// helper to send mail with good logging and fallback
async function sendMail(mailOptions) {
  const t = await createTransporter();
  if (!t) {
    const err = new Error('No mail transporter available');
    err.code = 'NO_TRANSPORTER';
    throw err;
  }

  try {
    const info = await t.sendMail(mailOptions);
    // If using ethereal, log preview url
    if (transporterInfo.usingEthereal && nodemailer.getTestMessageUrl) {
      const preview = nodemailer.getTestMessageUrl(info);
      console.log('📨 Email sent (ethereal) preview URL:', preview);
      return { info, preview };
    }
    console.log('📨 Email sent:', info && info.messageId ? info.messageId : info);
    return { info };
  } catch (err) {
    // Attach some diagnostic details
    console.error('❌ sendMail error:', err && err.message ? err.message : err);
    err._transporterInfo = transporterInfo;
    throw err;
  }
}

// Mongo connection cache
let _mongoClient = null;
let _db = null;
let _collections = {};

async function connectMongoOnce() {
  if (_db) return { db: _db, collections: _collections };
  if (!MONGO_URL) {
    // no DB configured
    return null;
  }
  if (!_mongoClient) {
    _mongoClient = new MongoClient(MONGO_URL, { useUnifiedTopology: true });
    await _mongoClient.connect();
    _db = _mongoClient.db(DB_NAME);
    // prepare collections
    _collections.files_meta = _db.collection('files_meta');
    _collections.contacts = _db.collection('contacts');
    try {
      await _collections.files_meta.createIndex({ title: "text", tags: "text", subject: 1, class: 1 });
    } catch (e) {
      // index may already exist or fail in restricted env
    }
  }
  return { db: _db, collections: _collections };
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function signAdminToken(payload = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function verifyAdminTokenFromHeader(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (!auth) throw new Error('No auth header');
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') throw new Error('Bad auth header');
  return jwt.verify(parts[1], JWT_SECRET);
}

function proxyGetStream(fileUrl, res) {
  const parsed = url.parse(fileUrl);
  const client = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    client.get(fileUrl, cloudRes => {
      if (!cloudRes || (cloudRes.statusCode && cloudRes.statusCode >= 400)) {
        const err = new Error('Upstream status ' + (cloudRes && cloudRes.statusCode));
        err.status = cloudRes && cloudRes.statusCode;
        return reject(err);
      }
      cloudRes.pipe(res);
      cloudRes.on('end', () => resolve());
      cloudRes.on('error', e => reject(e));
    }).on('error', e => reject(e));
  });
}

module.exports = {
  connectMongoOnce,
  ObjectId,
  escapeHtml,
  signAdminToken,
  verifyAdminTokenFromHeader,
  cloudinary,
  // expose sendMail helper and transporter info
  sendMail,
  createTransporter,
  transporterInfo,
  ADMIN_USER,
  ADMIN_PASS,
  CONTACT_RECEIVER,
  proxyGetStream
};
