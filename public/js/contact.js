// public/js/contact.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const resetBtn = document.getElementById('resetBtn');
  const statusEl = document.getElementById('formStatus');

  function setStatus(msg, ok=true) {
    statusEl.textContent = msg;
    statusEl.style.color = ok ? '#064E3B' : '#B91C1C';
  }

  resetBtn && resetBtn.addEventListener('click', () => {
    form.reset();
    setStatus('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Envoi en cours...', true);

    // Simple client-side validation
    const fd = new FormData(form);
    const data = {
      name: (fd.get('name') || '').trim(),
      email: (fd.get('email') || '').trim(),
      subject: (fd.get('subject') || '').trim(),
      message: (fd.get('message') || '').trim()
    };
    if (!data.name || !data.email || !data.message) {
      setStatus('Veuillez renseigner votre nom, email et message.', false);
      return;
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const j = await res.json();
      if (!res.ok) {
        setStatus('Erreur : ' + (j?.error || 'Impossible d’envoyer le message.'), false);
        return;
      }
      setStatus('✅ Message envoyé — nous revenons vers vous rapidement.');
      form.reset();
    } catch (err) {
      console.error(err);
      setStatus('Erreur réseau — vérifiez votre connexion.', false);
    }
  });
});
