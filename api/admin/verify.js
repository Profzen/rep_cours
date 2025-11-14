// api/admin/verify.js
'use strict';

const { verifyAdminTokenFromHeader } = require('../_utils');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const payload = verifyAdminTokenFromHeader(req);
      return res.json({ ok: true, user: payload });
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (err) {
    console.error('api/admin/verify error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
