// api/files/[id].js
'use strict';

const { connectMongoOnce, ObjectId } = require('../_utils');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const id = req.query.id || (req.url && req.url.split('/').pop());
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const c = await connectMongoOnce();
    if (!c || !c.collections || !c.collections.files_meta) {
      return res.status(503).json({ error: 'DB non disponible' });
    }

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const it = await c.collections.files_meta.findOne({ _id: new ObjectId(id) });
    if (!it) return res.status(404).json({ error: 'Not found' });
    it._id = it._id.toString();
    return res.json({ item: it });
  } catch (err) {
    console.error('api/files/:id error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
