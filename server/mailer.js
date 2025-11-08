// server/mailer.js
// Wrapper nodemailer pour envoyer les emails via SMTP.
// Exporte `sendContactMail({ name, email, subject, message })`

const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE, // 'true' or 'false' as string in .env
  SMTP_USER,
  SMTP_PASS,
  CONTACT_TO // email destination (ex: profzzen@gmail.com)
} = process.env;

// Create transporter — we build it lazily and cache
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER) {
    throw new Error('SMTP configuration manquante dans .env (SMTP_HOST/SMTP_USER/SMTP_PASS).');
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: (String(SMTP_SECURE || 'false') === 'true'),
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  return transporter;
}

/**
 * Send contact email.
 * @param {{name:string,email:string,subject:string,message:string,ip?:string}} payload
 * @returns {Promise<object>} nodemailer info
 */
async function sendContactMail(payload) {
  const t = getTransporter();
  const to = CONTACT_TO || 'profzzen@gmail.com';
  const from = `"Rep Cours - Contact" <${SMTP_USER}>`;

  const html = `
    <h2>Nouveau message contact — Rep Cours</h2>
    <p><strong>Nom :</strong> ${escapeHtml(payload.name)}</p>
    <p><strong>Email :</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>Sujet :</strong> ${escapeHtml(payload.subject || '—')}</p>
    <p><strong>Message :</strong><br/>${nl2br(escapeHtml(payload.message))}</p>
    <p style="color:#666;font-size:0.9rem;">IP: ${escapeHtml(payload.ip || '—')}</p>
  `;

  const info = await t.sendMail({
    from,
    to,
    subject: `Contact site — ${payload.subject || 'Nouveau message'}`,
    html
  });
  return info;
}

// small helpers
function escapeHtml(str = '') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function nl2br(s){ return String(s).replace(/\n/g,'<br/>'); }

module.exports = { sendContactMail };
