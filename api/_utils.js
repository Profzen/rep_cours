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

// Nodemailer transporter (may be no-op if creds not set)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 465),
  secure: (String(process.env.SMTP_SECURE || '') === 'true') || Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

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
  transporter,
  ADMIN_USER,
  ADMIN_PASS,
  CONTACT_RECEIVER,
  proxyGetStream
};
