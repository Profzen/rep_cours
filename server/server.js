// server/server.js
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { MongoClient, ObjectId } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const stream = require('stream');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const https = require('https');
const http = require('http');
const url = require('url');

const app = express();
app.use(express.json({ limit: '800kb' }));
app.use(express.static('public'));

// ---------------- config ----------------
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'Rep';
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'MaCleJWTTresSecrete2025';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'motDePasseAdmin123';
const CONTACT_RECEIVER = process.env.CONTACT_RECEIVER || 'profzzen@gmail.com';

// multer (in-memory)
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_MB || 100) * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

// cloudinary config (ensure env vars set)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

// nodemailer transporter (SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 465),
  secure: (String(process.env.SMTP_SECURE || '') === 'true') || Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// ---------------- MongoDB connexion (cached for serverless) ----------------
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  if (!MONGO_URL) {
    console.warn('⚠️ MONGO_URL not set. Database routes will fail until MONGO_URL is configured.');
    throw new Error('MONGO_URL missing');
  }
  if (!cachedClient) {
    const client = new MongoClient(MONGO_URL, { useUnifiedTopology: true });
    await client.connect();
    cachedClient = client;
  }
  cachedDb = cachedClient.db(DB_NAME);
  try {
    await cachedDb.collection('files_meta').createIndex({ title: "text", tags: "text", subject: 1, class: 1 });
  } catch (e) { /* ignore index errors */ }
  console.log('✅ MongoDB connecté -> DB:', DB_NAME);
  return cachedDb;
}

// ---------------- Auth middleware ----------------
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No auth header' });
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Bad auth header' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------------- Helpers ----------------
function safeIdString(id) {
  try { return (id instanceof ObjectId) ? id.toString() : String(id); } catch { return String(id); }
}
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ---------------- Routes ----------------

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ ok: true, token, username });
  } else {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/admin/verify', adminAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.post('/api/upload', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
    const db = await getDb();
    const metaColl = db.collection('files_meta');

    const mimetype = req.file.mimetype || 'application/octet-stream';
    const resourceType = mimetype.startsWith('image/') ? 'image' : 'raw';

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    const uploadResult = await new Promise((resolve, reject) => {
      const opts = { folder: 'rep-cours', resource_type: resourceType, overwrite: false };
      const ups = cloudinary.uploader.upload_stream(opts, (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      });
      bufferStream.pipe(ups);
    });

    const meta = {
      title: (req.body.title || req.file.originalname || '').trim(),
      originalFilename: req.file.originalname || '',
      mimetype,
      resource_type: resourceType,
      class: req.body.class || '',
      subject: req.body.subject || '',
      trimester: req.body.trimester ? Number(req.body.trimester) : null,
      type: req.body.type || '',
      tags: req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      url: uploadResult.secure_url,
      size: uploadResult.bytes || req.file.size || 0,
      uploadedAt: new Date(),
      uploadedBy: req.user ? req.user.username : 'unknown',
      cloudinary: {
        public_id: uploadResult.public_id,
        provider_raw: uploadResult
      }
    };

    const insertRes = await metaColl.insertOne(meta);
    meta._id = insertRes.insertedId.toString();

    const returnMeta = {
      _id: meta._id,
      title: meta.title,
      originalFilename: meta.originalFilename,
      mimetype: meta.mimetype,
      resource_type: meta.resource_type,
      class: meta.class,
      subject: meta.subject,
      trimester: meta.trimester,
      type: meta.type,
      tags: meta.tags,
      url: meta.url,
      size: meta.size,
      uploadedAt: meta.uploadedAt,
      uploadedBy: meta.uploadedBy
    };

    return res.json({ ok: true, url: meta.url, meta: returnMeta });
  } catch (err) {
    console.error('Upload error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erreur upload' });
  }
});

app.get('/api/files', async (req, res) => {
  try {
    const db = await getDb();
    const metaColl = db.collection('files_meta');

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 12));
    const filter = {};

    if (req.query.class) filter.class = req.query.class;
    if (req.query.subject) filter.subject = req.query.subject;
    if (req.query.trimester) filter.trimester = Number(req.query.trimester);
    if (req.query.type) filter.type = req.query.type;
    if (req.query.tag) filter.tags = req.query.tag;

    if (req.query.q) {
      const q = String(req.query.q || '').trim();
      if (q.length > 0) {
        filter.$or = [
          { title: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } }
        ];
      }
    }

    const total = await metaColl.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const skip = (page - 1) * pageSize;

    const rawItems = await metaColl.find(filter).sort({ uploadedAt: -1 }).skip(skip).limit(pageSize).toArray();

    const items = rawItems.map(it => ({
      _id: it._id ? it._id.toString() : undefined,
      title: it.title,
      originalFilename: it.originalFilename,
      mimetype: it.mimetype,
      resource_type: it.resource_type,
      class: it.class,
      subject: it.subject,
      trimester: it.trimester,
      type: it.type,
      tags: it.tags || [],
      url: it.url,
      size: it.size,
      uploadedAt: it.uploadedAt,
      uploadedBy: it.uploadedBy
    }));

    return res.json({ items, total, page, pageSize, totalPages });
  } catch (err) {
    console.error('List files error:', err);
    return res.status(500).json({ error: 'Erreur lecture fichiers' });
  }
});

app.get('/api/files/:id', async (req, res) => {
  try {
    const db = await getDb();
    const metaColl = db.collection('files_meta');

    const metaId = req.params.id;
    if (!ObjectId.isValid(metaId)) return res.status(400).json({ error: 'Invalid id' });
    const it = await metaColl.findOne({ _id: new ObjectId(metaId) });
    if (!it) return res.status(404).json({ error: 'Not found' });
    it._id = it._id.toString();
    return res.json({ item: it });
  } catch (err) {
    console.error('Get meta error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/files/:id/download', async (req, res) => {
  try {
    const db = await getDb();
    const metaColl = db.collection('files_meta');

    const metaId = req.params.id;
    if (!ObjectId.isValid(metaId)) return res.status(400).json({ error: 'Invalid id' });

    const meta = await metaColl.findOne({ _id: new ObjectId(metaId) });
    if (!meta || !meta.url) return res.status(404).json({ error: 'Fichier introuvable' });

    const fileUrl = meta.url;
    const filename = meta.originalFilename || (fileUrl.split('/').pop() || 'file');

    res.setHeader('Content-Type', meta.mimetype || 'application/octet-stream');
    const safeFilename = filename.replace(/["\\]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const parsed = url.parse(fileUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    client.get(fileUrl, cloudRes => {
      if (cloudRes.statusCode && cloudRes.statusCode !== 200) {
        console.error('Proxy download upstream status', cloudRes.statusCode);
        return res.status(cloudRes.statusCode).end();
      }
      cloudRes.pipe(res);
    }).on('error', err => {
      console.error('Proxy download error:', err);
      res.sendStatus(500);
    });

  } catch (err) {
    console.error('Download route error:', err);
    return res.status(500).json({ error: 'Impossible de télécharger le fichier' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const db = await getDb();
    const contactsColl = db.collection('contacts');

    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });

    const doc = { name, email, subject: subject || '', message, receivedAt: new Date() };
    const insertRes = await contactsColl.insertOne(doc);

    const mailOptions = {
      from: `"Rep Cours" <${process.env.SMTP_USER || 'no-reply@example.com'}>`,
      to: CONTACT_RECEIVER,
      subject: `Nouveau message contact - ${name}`,
      text: `Message reçu de ${name} <${email}>:\n\n${message}`,
      html: `<p>Message reçu de <strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt; :</p><p>${escapeHtml(message).replace(/\n/g,'<br>')}</p>`
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Contact email sent:', info && info.messageId ? info.messageId : '(no-id)');
    } catch (mailErr) {
      console.error('Erreur envoi mail contact:', mailErr && mailErr.message ? mailErr.message : mailErr);
    }

    return res.json({ ok: true, id: insertRes.insertedId.toString() });
  } catch (err) {
    console.error('Contact send error:', err);
    return res.status(500).json({ error: 'Impossible d\'envoyer le message' });
  }
});

// If the file is run directly (dev), start the server.
// When used in serverless (imported from api/index.js), this block won't run.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  (async () => {
    try {
      // ensure DB connect attempt (will warn if MONGO_URL missing)
      await getDb();
    } catch (err) {
      console.error('⚠️ getDb() failed at startup (dev). Some routes will error until DB configured:', err && err.message ? err.message : err);
      // continue anyway so static pages and non-db routes still respond
    }
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })();
}

// Export the app for serverless wrapper or tests
module.exports = app;
