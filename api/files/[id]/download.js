// api/files/[id]/download.js
'use strict';

const { connectMongoOnce, ObjectId, proxyGetStream } = require('../../_utils');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const id = req.query.id || (req.url && req.url.split('/')[2]) || req.url.split('/').pop();

    if (!id) return res.status(400).json({ error: 'Missing id' });

    const c = await connectMongoOnce();
    if (!c || !c.collections || !c.collections.files_meta) {
      return res.status(503).json({ error: 'DB non disponible' });
    }

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const meta = await c.collections.files_meta.findOne({ _id: new ObjectId(id) });
    if (!meta || !meta.url) return res.status(404).json({ error: 'Fichier introuvable' });

    const fileUrl = meta.url;
    const filename = meta.originalFilename || (fileUrl.split('/').pop() || 'file');
    res.setHeader('Content-Type', meta.mimetype || 'application/octet-stream');
    const safeFilename = filename.replace(/["\\]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    await proxyGetStream(fileUrl, res);
    // done by proxy
  } catch (err) {
    console.error('api/files/:id/download error', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ error: 'Impossible de télécharger le fichier' });
  }
};
