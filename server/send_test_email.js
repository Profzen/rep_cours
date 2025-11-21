// server/send_test_email.js
'use strict';
const { createTransporter, verifyTransporter, sendContactMail } = require('./mailer');

(async () => {
  try {
    await createTransporter();
    const ok = await verifyTransporter();
    console.log('transporter ok?', ok);

    const r = await sendContactMail({
      name: 'Test envoi',
      email: 'test@example.com',
      subject: 'Test de fonctionnement',
      message: 'Bonjour — ceci est un test envoyé depuis server/send_test_email.js',
      ip: '127.0.0.1'
    });

    console.log('send result:', r);
    if (r.previewUrl) console.log('Preview URL (ethereal):', r.previewUrl);
    process.exit(0);
  } catch (err) {
    console.error('test send error', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
