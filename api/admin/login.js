// api/admin/login.js
'use strict';

const { ADMIN_USER, ADMIN_PASS, signAdminToken } = require('../_utils');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = signAdminToken({ username });
      return res.json({ ok: true, token, username });
    } else {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('api/admin/login error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
