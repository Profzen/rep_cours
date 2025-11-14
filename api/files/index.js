// api/files/index.js
'use strict';

const { connectMongoOnce } = require('../_utils');

module.exports = async (req, res) => {
  try {
    // only allow GET
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // try to connect to DB
    const c = await connectMongoOnce();
    if (!c || !c.collections || !c.collections.files_meta) {
      // fallback sample (makes frontend usable without DB)
      const sample = [{
        _id: 'test-1',
        title: 'Exemple - ressource test',
        url: '',
        tags: ['test'],
        uploadedAt: new Date().toISOString()
      }];
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
      return res.json({ items: sample.slice(0, pageSize), total: sample.length, page, pageSize, totalPages: 1 });
    }

    const coll = c.collections.files_meta;

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
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

    const total = await coll.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const skip = (page - 1) * pageSize;

    const rawItems = await coll.find(filter).sort({ uploadedAt: -1 }).skip(skip).limit(pageSize).toArray();

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
    console.error('api/files error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erreur lecture fichiers' });
  }
};
