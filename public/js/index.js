// public/js/index.js
// Mise à jour : récupère les dernières ressources, anime les compteurs statistiques,
// et fournit une logique simple et accessible.

(function () {
  const latestListEl = document.getElementById('latest-list');

  // util
  const escapeHtml = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;') : '';

  // Build a small resource card (compact)
  function buildSmallCard(f) {
    const card = document.createElement('div');
    card.className = 'resource-card card';
    card.style.padding = '12px';

    const title = document.createElement('h3');
    title.textContent = f.title || f.originalFilename || 'Document';
    title.style.fontSize = '1rem';
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta small';
    const date = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : '—';
    meta.textContent = `${f.class || '—'} • ${f.subject || '—'} • ${date}`;
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'file-actions';

    const openA = document.createElement('a');
    openA.className = 'btn btn-outline';
    openA.href = f.url || '#';
    openA.target = '_blank';
    openA.rel = 'noopener';
    openA.textContent = 'Ouvrir';
    actions.appendChild(openA);

    const dlA = document.createElement('a');
    dlA.className = 'download-btn';
    dlA.href = `/api/files/${f._id}/download`;
    dlA.target = '_blank';
    dlA.rel = 'noopener';
    dlA.textContent = 'Télécharger';
    actions.appendChild(dlA);

    card.appendChild(actions);
    return card;
  }

  // fetch latest N items (server paginated). We'll fetch page=1 pageSize=n to show latest n.
  async function fetchLatest(n = 6) {
    if (!latestListEl) return;
    latestListEl.innerHTML = '<p class="small">Chargement des ressources...</p>';
    try {
      const res = await fetch(`/api/files?page=1&pageSize=${n}`);
      if (!res.ok) throw new Error('Erreur serveur ' + res.status);
      const data = await res.json();
      let items = [];
      if (Array.isArray(data)) items = data.slice(0, n);
      else if (Array.isArray(data.items)) items = data.items.slice(0, n);
      else items = [];

      if (items.length === 0) {
        latestListEl.innerHTML = '<p class="small">Aucune ressource pour le moment.</p>';
        return;
      }

      // Render responsive grid
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
      grid.style.gap = '12px';

      items.forEach(f => grid.appendChild(buildSmallCard(f)));

      latestListEl.innerHTML = '';
      latestListEl.appendChild(grid);
    } catch (err) {
      console.error('fetchLatest error', err);
      latestListEl.innerHTML = `<p class="small">Impossible de charger les ressources (${escapeHtml(err.message)}).</p>`;
    }
  }

  // Animate stats counters (data-target on .num elements)
  function animateCounters(duration = 1400) {
    const els = document.querySelectorAll('.num[data-target]');
    els.forEach(el => {
      const target = Number(el.dataset.target) || 0;
      let start = 0;
      const startTime = performance.now();
      function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const current = Math.floor(progress * target);
        el.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = target.toLocaleString();
      }
      requestAnimationFrame(step);
    });
  }

  // ensure hero image file exists? we assume developer will place file in public/assets/
  function checkHeroImage() {
    // nothing to do – hero visual uses CSS background on .hero-visual .image
    // We could optionally test load via an Image object, but browsers will handle.
  }

  // apply subtle entrance animations to card elements
  function applyEntrance() {
    document.querySelectorAll('.card').forEach((el, i) => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(6px)';
      setTimeout(() => {
        el.style.transition = 'opacity 420ms ease, transform 420ms ease';
        el.style.opacity = 1;
        el.style.transform = 'translateY(0)';
      }, 100 + i * 60);
    });
  }

  // init
  window.addEventListener('DOMContentLoaded', async () => {
    await fetchLatest(6);
    animateCounters(1600);
    applyEntrance();
    checkHeroImage();
  });

})();
