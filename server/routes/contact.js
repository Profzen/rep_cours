// server/routes/contact.js
'use strict';

const express = require('express');
const router = express.Router();
const { sendContactMail } = require('../mailer');
const { connectMongoOnce, escapeHtml } = require('../_utils'); // si tu as _utils

router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'name, email et message sont requis.' });
    }

    // Save to DB if available (best-effort)
    try {
      const c = await connectMongoOnce();
      if (c && c.collections && c.collections.contacts) {
        await c.collections.contacts.insertOne({
          name: String(name),
          email: String(email),
          subject: String(subject || ''),
          message: String(message),
          receivedAt: new Date()
        });
      }
    } catch (dbErr) {
      console.warn('contact: saving to DB failed (non fatal):', dbErr && dbErr.message ? dbErr.message : dbErr);
    }

    const ip = (req.ip || req.headers['x-forwarded-for'] || '').toString();
    const info = await sendContactMail({ name, email, subject, message, ip });

    // If ethereal: include preview URL to help debugging (only non-prod)
    const response = { ok: true, sent: true };
    if (info && info.previewUrl) response.previewUrl = info.previewUrl;
    if (info && info.messageId) response.messageId = info.messageId;

    return res.json(response);
  } catch (err) {
    console.error('contact route error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erreur serveur lors de l’envoi du message.' });
  }
});

module.exports = router;
