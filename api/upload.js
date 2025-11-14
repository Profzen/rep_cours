// api/upload.js
'use strict';

const multer = require('multer');
const stream = require('stream');
const { connectMongoOnce, cloudinary, verifyAdminTokenFromHeader } = require('./_utils');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: (Number(process.env.MAX_FILE_MB || 100) * 1024 * 1024) } });

// small wrapper to run multer in lambda
function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // verify admin JWT
    try {
      verifyAdminTokenFromHeader(req);
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await runMulter(req, res);

    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    const mimetype = req.file.mimetype || 'application/octet-stream';
    const resourceType = mimetype.startsWith('image/') ? 'image' : 'raw';

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    // upload to Cloudinary (upload_stream)
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
      tags: req.body.tags ? String(req.body.tags).split(',').map(t => t.trim()).filter(Boolean) : [],
      url: uploadResult.secure_url,
      size: uploadResult.bytes || req.file.size || 0,
      uploadedAt: new Date(),
      uploadedBy: (req.user && req.user.username) || 'admin',
      cloudinary: { public_id: uploadResult.public_id, provider_raw: uploadResult }
    };

    const c = await connectMongoOnce();
    if (!c || !c.collections || !c.collections.files_meta) {
      return res.status(503).json({ error: 'DB non disponible' });
    }
    const insertRes = await c.collections.files_meta.insertOne(meta);
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
    console.error('api/upload error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erreur upload' });
  }
};
