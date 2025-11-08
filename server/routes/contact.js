// server/routes/contact.js
const express = require('express');
const router = express.Router();
const { sendContactMail } = require('../mailer');

// POST /api/contact
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'name, email et message sont requis.' });
    }

    // Optional: rate limiting, spam checks, CAPTCHA verification can be added here.

    // Send email via mailer
    const ip = req.ip || req.headers['x-forwarded-for'] || '';
    await sendContactMail({ name, email, subject, message, ip });

    return res.json({ ok: true, message: 'Envoyé' });
  } catch (err) {
    console.error('contact route error', err);
    return res.status(500).json({ error: 'Erreur serveur lors de l’envoi du message.' });
  }
});

module.exports = router;
