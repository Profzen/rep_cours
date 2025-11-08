// server/server.js
/**
 * Serveur Express complet et mis à jour :
 * - /api/admin/login, /api/admin/verify (JWT)
 * - POST /api/upload (protected) -> Cloudinary + meta MongoDB -> retourne meta avec _id (string)
 * - GET /api/files -> pagination + filtres -> retourne { items, total, page, pageSize, totalPages }
 * - GET /api/files/:id -> retourne meta (utilitaire)
 * - GET /api/files/:id/download -> proxy + force download (original filename + Content-Type)
 * - POST /api/contact -> sauvegarde en DB + envoi email (nodemailer)
 *
 * Remarque : Assure-toi d'avoir les variables d'env nécessaires.
 */

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
  secure: String(process.env.SMTP_SECURE || (process.env.SMTP_PORT === '465')) === 'true' || Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// ---------------- MongoDB connexion ----------------
let db = null;
let metaColl = null;
let contactsColl = null;

async function connectMongo() {
  if (!MONGO_URL) {
    console.error('❌ MONGO_URL manquant dans .env');
    process.exit(1);
  }
  const client = new MongoClient(MONGO_URL, { useUnifiedTopology: true });
  await client.connect();
  db = client.db(DB_NAME);
  metaColl = db.collection('files_meta');
  contactsColl = db.collection('contacts');
  // Indexes optionally
  await metaColl.createIndex({ title: "text", tags: "text", subject: 1, class: 1 });
  console.log('✅ MongoDB connecté -> DB:', DB_NAME);
}
connectMongo().catch(err => {
  console.error('❌ Erreur connexion MongoDB:', err);
  process.exit(1);
});

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

// ---------------- Routes ----------------

/**
 * POST /api/admin/login
 * Body: { username, password }
 */
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

/**
 * GET /api/admin/verify
 * Header: Authorization: Bearer <token>
 */
app.get('/api/admin/verify', adminAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

/**
 * POST /api/upload
 * Protected: adminAuth
 * multipart/form-data: file + fields (title,class,subject,trimester,type,tags)
 * Uploads to Cloudinary then inserts meta into Mongo and returns meta (with _id as string)
 */
app.post('/api/upload', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    const mimetype = req.file.mimetype || 'application/octet-stream';
    // Use resource_type image/raw depending on mime
    const resourceType = mimetype.startsWith('image/') ? 'image' : 'raw';

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    // upload_stream wrapper as promise
    const uploadResult = await new Promise((resolve, reject) => {
      const opts = { folder: 'rep-cours', resource_type: resourceType, overwrite: false };
      const ups = cloudinary.uploader.upload_stream(opts, (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      });
      bufferStream.pipe(ups);
    });

    // Build metadata
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

    // Insert and return meta with _id as string
    const insertRes = await metaColl.insertOne(meta);
    meta._id = insertRes.insertedId.toString();

    // Optional: return a cleaned meta (avoid returning full cloudinary raw provider)
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

/**
 * GET /api/files
 * Query:
 *   page (1), pageSize (12)
 *   class, subject, trimester, type, tag, q (search)
 * Returns: { items, total, page, pageSize, totalPages }
 * Each item._id is string
 */
app.get('/api/files', async (req, res) => {
  try {
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

    // Convert ObjectId to string and remove heavy cloudinary.provider_raw if present
    const items = rawItems.map(it => {
      return {
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
      };
    });

    return res.json({ items, total, page, pageSize, totalPages });
  } catch (err) {
    console.error('List files error:', err);
    return res.status(500).json({ error: 'Erreur lecture fichiers' });
  }
});

/**
 * GET /api/files/:id
 * Return single meta (utility)
 */
app.get('/api/files/:id', async (req, res) => {
  try {
    const metaId = req.params.id;
    if (!ObjectId.isValid(metaId)) return res.status(400).json({ error: 'Invalid id' });
    const it = await metaColl.findOne({ _id: new ObjectId(metaId) });
    if (!it) return res.status(404).json({ error: 'Not found' });
    // convert _id to string
    it._id = it._id.toString();
    return res.json({ item: it });
  } catch (err) {
    console.error('Get meta error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/files/:id/download
 * Proxy remote file (Cloudinary) and force download with original filename/mimetype
 */
app.get('/api/files/:id/download', async (req, res) => {
  try {
    const metaId = req.params.id;
    if (!ObjectId.isValid(metaId)) return res.status(400).json({ error: 'Invalid id' });

    const meta = await metaColl.findOne({ _id: new ObjectId(metaId) });
    if (!meta || !meta.url) return res.status(404).json({ error: 'Fichier introuvable' });

    const fileUrl = meta.url;
    const filename = meta.originalFilename || (fileUrl.split('/').pop() || 'file');

    // Set headers to force download in original format
    res.setHeader('Content-Type', meta.mimetype || 'application/octet-stream');
    // protect filename header (avoid injection)
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

/**
 * POST /api/contact
 * Save contact in DB and send mail via nodemailer
 * Body: { name, email, subject?, message }
 */
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });

    // Save in DB
    const doc = { name, email, subject: subject || '', message, receivedAt: new Date() };
    const insertRes = await contactsColl.insertOne(doc);

    // Send email
    const mailOptions = {
      from: `"Rep Cours" <${process.env.SMTP_USER || 'no-reply@example.com'}>`,
      to: CONTACT_RECEIVER,
      subject: `Nouveau message contact - ${name}`,
      text: `Message reçu de ${name} <${email}>:\n\n${message}`,
      html: `<p>Message reçu de <strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt; :</p><p>${escapeHtml(message).replace(/\n/g,'<br>')}</p>`
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Contact email sent:', info.messageId);
    } catch (mailErr) {
      // Log and continue — don't fail the whole request if mail provider has a transient error
      console.error('Erreur envoi mail contact:', mailErr && mailErr.message ? mailErr.message : mailErr);
    }

    return res.json({ ok: true, id: insertRes.insertedId.toString() });
  } catch (err) {
    console.error('Contact send error:', err);
    return res.status(500).json({ error: 'Impossible d\'envoyer le message' });
  }
});

// ----------------- Start server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

/* small helper */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
