// public/js/admin.js
// Admin client — version corrigée pour supporter la réponse paginée du serveur.
// - gère ancien format (array) et nouveau format { items, total, page, pageSize, totalPages }
// - UI: affichage en grille, actions Télécharger / Source (boutons)
// - support "Charger plus" si le serveur renvoie totalPages (on peut itérer pages)

const TOKEN_KEY = 'rep_admin_token';

const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const closeLoginBtn = document.getElementById('close-login');

const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file');
const selectedFileInfo = document.getElementById('selected-file');
const uploadStatus = document.getElementById('upload-status');

const uploadsDiv = document.getElementById('uploads');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');

// pagination/admin state (utile si le serveur renvoie pagination)
let adminPage = 1;
let adminPageSize = 50; // on récupère par défaut jusqu'à 50 éléments en admin
let adminTotalPages = 1;

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function setToken(t){ localStorage.setItem(TOKEN_KEY, t); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

function showLogin(){ loginModal.classList.remove('hidden'); loginModal.setAttribute('aria-hidden','false'); }
function hideLogin(){ loginModal.classList.add('hidden'); loginModal.setAttribute('aria-hidden','true'); }

// show selected file info
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) { selectedFileInfo.textContent = ''; return; }
  const kb = Math.round(f.size / 1024);
  selectedFileInfo.textContent = `Fichier sélectionné : ${f.name} — ${kb} Ko — ${f.type || 'type inconnu'}`;
});

// verify token
async function verifyToken(){
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/admin/verify', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('invalid');
    return true;
  } catch {
    clearToken();
    return false;
  }
}

// login submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!username || !password) { loginError.textContent = 'Renseignez identifiant et mot de passe.'; return; }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const j = await res.json();
    if (!res.ok) {
      loginError.textContent = j.error || 'Identifiants invalides';
      return;
    }
    setToken(j.token);
    hideLogin();
    uploadStatus.textContent = '';
    adminPage = 1;
    await refreshUploads();
  } catch (err) {
    console.error('Login error', err);
    loginError.textContent = 'Erreur réseau';
  }
});

closeLoginBtn.addEventListener('click', () => hideLogin());

// logout
logoutBtn.addEventListener('click', () => {
  clearToken();
  showLogin();
});

// upload submit
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  uploadStatus.textContent = '';
  const token = getToken();
  if (!token) { uploadStatus.textContent = 'Non authentifié. Veuillez vous connecter.'; showLogin(); return; }

  const fileEl = fileInput;
  if (!fileEl.files || fileEl.files.length === 0) { uploadStatus.textContent = 'Sélectionnez un fichier.'; return; }
  const file = fileEl.files[0];

  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', document.getElementById('title').value || file.name);
  fd.append('class', document.getElementById('class').value);
  fd.append('subject', document.getElementById('subject').value);
  fd.append('trimester', document.getElementById('trimester').value);
  fd.append('type', document.getElementById('type').value);
  fd.append('tags', document.getElementById('tags').value);

  try {
    uploadStatus.textContent = 'Envoi en cours...';
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: fd
    });

    const j = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        uploadStatus.textContent = '⚠️ Session expirée — reconnectez-vous.';
        clearToken();
        showLogin();
      } else {
        uploadStatus.textContent = 'Erreur : ' + (j.error || 'Impossible d’uploader');
      }
      return;
    }

    // upload ok, server now returns meta with _id (grâce au patch serveur)
    if (j.meta && j.meta._id) {
      uploadStatus.innerHTML = `✅ Upload réussi — <a class="btn-inline" href="/api/files/${j.meta._id}/download" target="_blank">Télécharger</a>`;
    } else if (j.url) {
      uploadStatus.innerHTML = `✅ Upload réussi — <a class="btn-inline" href="${j.url}" target="_blank">Ouvrir source</a>`;
    } else {
      uploadStatus.textContent = '✅ Upload réussi.';
    }

    // Reset form and refresh list (start at page 1)
    uploadForm.reset();
    selectedFileInfo.textContent = '';
    adminPage = 1;
    await refreshUploads();
  } catch (err) {
    console.error('Upload error', err);
    uploadStatus.textContent = 'Erreur réseau lors de l\'upload';
  }
});

// refresh uploads (robuste)
async function refreshUploads({ page = adminPage, pageSize = adminPageSize } = {}) {
  try {
    // call paginated endpoint (server returns either array (legacy) or { items,... })
    const res = await fetch(`/api/files?page=${page}&pageSize=${pageSize}`);
    if (res.status === 401) {
      // not authorized for some reason
      clearToken();
      showLogin();
      uploadsDiv.innerHTML = '<p class="small">Non autorisé. Connectez-vous.</p>';
      return;
    }
    const data = await res.json();

    // Determine items array:
    // - new server format: { items, total, page, pageSize, totalPages }
    // - old format: array
    let list = [];
    if (Array.isArray(data)) {
      list = data;
      adminTotalPages = 1;
      adminPage = 1;
    } else if (data && Array.isArray(data.items)) {
      list = data.items;
      adminPage = Number(data.page) || 1;
      adminPageSize = Number(data.pageSize) || adminPageSize;
      adminTotalPages = Number(data.totalPages) || 1;
    } else {
      // unexpected shape
      console.warn('refreshUploads: réponse inattendue', data);
      uploadsDiv.innerHTML = '<p class="small">Impossible de charger la liste (format inattendu).</p>';
      return;
    }

    // ensure list is an array before calling sort
    if (!Array.isArray(list)) list = [];

    // sort by date desc if uploadedAt present
    list.sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return tb - ta;
    });

    // render list as responsive grid (4 per row visually in CSS if available)
    renderUploadsGrid(list);

    // If server supports pagination, show a "Charger plus" when pages remain
    renderAdminPaginationControls();

  } catch (err) {
    console.error('refreshUploads error', err);
    uploadsDiv.innerHTML = '<p class="small">Impossible de charger la liste.</p>';
  }
}

// render uploads into uploadsDiv as cards/grid
function renderUploadsGrid(list) {
  uploadsDiv.innerHTML = '';
  if (!list || list.length === 0) {
    uploadsDiv.innerHTML = '<p class="small">Aucun upload.</p>';
    return;
  }

  // create grid container
  const grid = document.createElement('div');
  grid.className = 'admin-uploads-grid';
  // minimal inline grid styling if CSS not yet present
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
  grid.style.gap = '12px';

  list.forEach(f => {
    const card = document.createElement('div');
    card.className = 'file-card card';
    card.style.padding = '12px';

    // title
    const title = document.createElement('div');
    title.innerHTML = `<strong>${escapeHtml(f.title || f.originalFilename || 'Document')}</strong>`;
    card.appendChild(title);

    // meta
    const meta = document.createElement('div');
    meta.className = 'file-meta small';
    const date = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : '';
    meta.textContent = `${f.class || '—'} • ${f.subject || '—'} • ${f.type || '—'} • ${date}`;
    card.appendChild(meta);

    // tags
    if (Array.isArray(f.tags) && f.tags.length) {
      const tagWrap = document.createElement('div');
      tagWrap.style.marginTop = '8px';
      f.tags.slice(0,6).forEach(t => {
        const tspan = document.createElement('span');
        tspan.className = 'tag';
        tspan.textContent = t;
        tspan.style.marginRight = '6px';
        tspan.style.fontSize = '0.8rem';
        card.appendChild(tagWrap);
        tagWrap.appendChild(tspan);
      });
      card.appendChild(tagWrap);
    }

    // actions
    const actions = document.createElement('div');
    actions.className = 'file-actions';
    actions.style.marginTop = '10px';

    const dl = document.createElement('a');
    dl.className = 'btn-inline';
    dl.href = `/api/files/${f._id}/download`;
    dl.target = '_blank';
    dl.rel = 'noopener';
    dl.textContent = 'Télécharger';
    actions.appendChild(dl);

    const src = document.createElement('a');
    src.className = 'btn-inline secondary';
    src.href = f.url || '#';
    src.target = '_blank';
    src.rel = 'noopener';
    src.textContent = 'Source';
    actions.appendChild(src);

    card.appendChild(actions);

    grid.appendChild(card);
  });

  uploadsDiv.appendChild(grid);
}

// Render admin pagination controls (Charger plus)
function renderAdminPaginationControls() {
  // Remove existing control if any
  let ctrl = document.getElementById('admin-loadmore-control');
  if (ctrl) ctrl.remove();

  // If server pagination indicates more pages, add a "Charger plus" button
  if (adminTotalPages > adminPage) {
    ctrl = document.createElement('div');
    ctrl.id = 'admin-loadmore-control';
    ctrl.style.marginTop = '12px';
    ctrl.style.textAlign = 'center';

    const btn = document.createElement('button');
    btn.textContent = 'Charger plus';
    btn.className = 'btn';
    btn.addEventListener('click', async () => {
      // increment page and fetch that page, then append items
      adminPage += 1;
      try {
        const res = await fetch(`/api/files?page=${adminPage}&pageSize=${adminPageSize}`);
        const data = await res.json();
        const newItems = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
        if (newItems.length > 0) {
          // append to existing grid
          appendUploads(newItems);
          if (adminPage >= adminTotalPages) btn.disabled = true;
        } else {
          btn.disabled = true;
        }
      } catch (err) {
        console.error('Load more error', err);
        btn.disabled = true;
      }
    });

    ctrl.appendChild(btn);
    uploadsDiv.parentNode.appendChild(ctrl);
  }
}

// Append uploads to existing grid (used by "Charger plus")
function appendUploads(items) {
  const grid = uploadsDiv.querySelector('.admin-uploads-grid');
  if (!grid) {
    // If no grid, re-render full list
    renderUploadsGrid(items);
    return;
  }
  items.forEach(f => {
    const card = document.createElement('div');
    card.className = 'file-card card';
    card.style.padding = '12px';

    const title = document.createElement('div');
    title.innerHTML = `<strong>${escapeHtml(f.title || f.originalFilename || 'Document')}</strong>`;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'file-meta small';
    const date = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : '';
    meta.textContent = `${f.class || '—'} • ${f.subject || '—'} • ${f.type || '—'} • ${date}`;
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'file-actions';
    actions.style.marginTop = '10px';

    const dl = document.createElement('a');
    dl.className = 'btn-inline';
    dl.href = `/api/files/${f._id}/download`;
    dl.target = '_blank';
    dl.rel = 'noopener';
    dl.textContent = 'Télécharger';
    actions.appendChild(dl);

    const src = document.createElement('a');
    src.className = 'btn-inline secondary';
    src.href = f.url || '#';
    src.target = '_blank';
    src.rel = 'noopener';
    src.textContent = 'Source';
    actions.appendChild(src);

    card.appendChild(actions);
    grid.appendChild(card);
  });
}

// escape minimal
function escapeHtml(s){ return s ? s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;') : ''; }

// refresh button
refreshBtn.addEventListener('click', () => { adminPage = 1; refreshUploads(); });

// init
window.addEventListener('DOMContentLoaded', async () => {
  const ok = await verifyToken();
  if (!ok) {
    showLogin();
  } else {
    hideLogin();
    await refreshUploads();
  }
});
