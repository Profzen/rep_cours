// api/files/[id].js
'use strict';

const { connectMongoOnce, ObjectId, verifyAdminTokenFromHeader, cloudinary } = require('../_utils');

module.exports = async (req, res) => {
  try {
    const method = (req.method || '').toUpperCase();
    const id = req.params && req.params.id ? req.params.id : (req.query && (req.query.id || req.query._id) ? (req.query.id || req.query._id) : null);

    if (!id) {
      return res.status(400).json({ error: 'Missing id' });
    }

    // DELETE -> admin only
    if (method === 'DELETE') {
      try {
        verifyAdminTokenFromHeader(req);
      } catch (authErr) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const c = await connectMongoOnce();
      if (!c || !c.collections || !c.collections.files_meta) {
        return res.status(500).json({ error: 'DB not configured' });
      }

      // find doc
      let doc = null;
      try {
        doc = await c.collections.files_meta.findOne({ _id: new ObjectId(id) });
      } catch (e) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }

      // delete remote storage if public_id present (best-effort)
      if (doc.public_id && cloudinary && cloudinary.uploader && typeof cloudinary.uploader.destroy === 'function') {
        try {
          await cloudinary.uploader.destroy(doc.public_id);
        } catch (cloudErr) {
          console.warn('cloudinary destroy error', cloudErr && cloudErr.message ? cloudErr.message : cloudErr);
          // continue to delete DB record anyway
        }
      }

      // delete DB record
      try {
        await c.collections.files_meta.deleteOne({ _id: new ObjectId(id) });
      } catch (delErr) {
        console.error('delete meta error', delErr && delErr.message ? delErr.message : delErr);
        return res.status(500).json({ error: 'Failed to delete metadata' });
      }

      return res.json({ ok: true, deletedId: id });
    }

    // GET -> return metadata
    if (method === 'GET') {
      const c = await connectMongoOnce();
      if (!c || !c.collections || !c.collections.files_meta) {
        return res.status(500).json({ error: 'DB not configured' });
      }
      let doc = null;
      try {
        doc = await c.collections.files_meta.findOne({ _id: new ObjectId(id) });
      } catch (e) {
        return res.status(400).json({ error: 'Invalid id' });
      }
      if (!doc) return res.status(404).json({ error: 'Not found' });
      return res.json(doc);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('api/files/[id] error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
