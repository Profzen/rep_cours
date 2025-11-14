// api/contact.js
'use strict';

const { connectMongoOnce, transporter, CONTACT_RECEIVER, escapeHtml } = require('./_utils');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });

    const c = await connectMongoOnce();
    if (!c || !c.collections || !c.collections.contacts) {
      // Still save nowhere — return success to avoid blocking front-end if DB not configured
      console.warn('contact: DB not available, skipping save');
    } else {
      await c.collections.contacts.insertOne({ name, email, subject: subject || '', message, receivedAt: new Date() });
    }

    // Send email (best-effort)
    const mailOptions = {
      from: `"Rep Cours" <${process.env.SMTP_USER || 'no-reply@example.com'}>`,
      to: CONTACT_RECEIVER || process.env.CONTACT_RECEIVER || 'profzzen@gmail.com',
      subject: `Nouveau message contact - ${name}`,
      text: `Message reçu de ${name} <${email}>:\n\n${message}`,
      html: `<p>Message reçu de <strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt; :</p><p>${escapeHtml(message).replace(/\n/g,'<br>')}</p>`
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('Contact email sent');
    } catch (mailErr) {
      console.error('contact email error', mailErr && mailErr.message ? mailErr.message : mailErr);
      // continue, don't fail the request
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('api/contact error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Impossible d\'envoyer le message' });
  }
};
