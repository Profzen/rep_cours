// api/contact.js
'use strict';

const { connectMongoOnce, sendMail, CONTACT_RECEIVER, escapeHtml } = require('./_utils');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });

    const c = await connectMongoOnce();
    if (!c || !c.collections || !c.collections.contacts) {
      // No DB available; log and continue
      console.warn('contact: DB not available, skipping save');
    } else {
      await c.collections.contacts.insertOne({ name, email, subject: subject || '', message, receivedAt: new Date() });
    }

    const mailOptions = {
      from: `"Rep Cours" <${process.env.SMTP_USER || 'no-reply@example.com'}>`,
      to: CONTACT_RECEIVER || process.env.CONTACT_RECEIVER || 'profzzen@gmail.com',
      subject: `Nouveau message contact - ${name} ${subject ? '— ' + subject : ''}`,
      text: `Message reçu de ${name} <${email}>:\n\n${message}`,
      html: `<p>Message reçu de <strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt; :</p><p>${escapeHtml(message).replace(/\n/g,'<br>')}</p>`
    };

    try {
      const result = await sendMail(mailOptions);
      // If using ethereal, return preview URL for debugging
      if (result && result.preview) {
        return res.json({ ok: true, previewUrl: result.preview });
      }
      return res.json({ ok: true });
    } catch (mailErr) {
      console.error('contact sendMail error', mailErr && mailErr.message ? mailErr.message : mailErr);
      // return the error to client in dev, but don't leak sensitive details in prod
      const isDev = (process.env.NODE_ENV !== 'production');
      return res.status(502).json({ error: 'Failed to send email', details: isDev ? (mailErr && (mailErr.message || mailErr.code || mailErr)) : undefined });
    }

  } catch (err) {
    console.error('api/contact error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Impossible d\'envoyer le message' });
  }
};
