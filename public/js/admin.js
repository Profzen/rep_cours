// public/js/admin.js
// Admin client — version avec suppression d'un fichier depuis l'UI.

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

// pagination/admin state
let adminPage = 1;
let adminPageSize = 50;
let adminTotalPages = 1;

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function setToken(t){ localStorage.setItem(TOKEN_KEY, t); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

function showLogin(){ loginModal.classList.remove('hidden'); loginModal.setAttribute('aria-hidden','false'); }
function hideLogin(){ loginModal.classList.add('hidden'); loginModal.setAttribute('aria-hidden','true'); }

// show selected file info
if (fileInput) {
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) { selectedFileInfo.textContent = ''; return; }
    const kb = Math.round(f.size / 1024);
    selectedFileInfo.textContent = `Fichier sélectionné : ${f.name} — ${kb} Ko — ${f.type || 'type inconnu'}`;
  });
}

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
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const usernameEl = document.getElementById('login-username');
    const passwordEl = document.getElementById('login-password');
    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value.trim() : '';
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
}

if (closeLoginBtn) closeLoginBtn.addEventListener('click', () => hideLogin());

// logout
if (logoutBtn) logoutBtn.addEventListener('click', () => {
  clearToken();
  showLogin();
});

// upload submit
if (uploadForm) {
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

      if (j.meta && j.meta._id) {
        uploadStatus.innerHTML = `✅ Upload réussi — <a class="btn-inline" href="/api/files/${j.meta._id}/download" target="_blank">Télécharger</a>`;
      } else if (j.url) {
        uploadStatus.innerHTML = `✅ Upload réussi — <a class="btn-inline" href="${j.url}" target="_blank">Ouvrir source</a>`;
      } else {
        uploadStatus.textContent = '✅ Upload réussi.';
      }

      uploadForm.reset();
      selectedFileInfo.textContent = '';
      adminPage = 1;
      await refreshUploads();
    } catch (err) {
      console.error('Upload error', err);
      uploadStatus.textContent = 'Erreur réseau lors de l\'upload';
    }
  });
}

// refresh uploads (robuste)
async function refreshUploads({ page = adminPage, pageSize = adminPageSize } = {}) {
  try {
    const res = await fetch(`/api/files?page=${page}&pageSize=${pageSize}`);
    if (res.status === 401) {
      clearToken();
      showLogin();
      uploadsDiv.innerHTML = '<p class="small">Non autorisé. Connectez-vous.</p>';
      return;
    }
    const data = await res.json();

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
      console.warn('refreshUploads: réponse inattendue', data);
      uploadsDiv.innerHTML = '<p class="small">Impossible de charger la liste (format inattendu).</p>';
      return;
    }

    if (!Array.isArray(list)) list = [];

    list.sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return tb - ta;
    });

    renderUploadsGrid(list);
    renderAdminPaginationControls();
  } catch (err) {
    console.error('refreshUploads error', err);
    uploadsDiv.innerHTML = '<p class="small">Impossible de charger la liste.</p>';
  }
}

// render uploads into uploadsDiv as cards/grid (with Delete button)
function renderUploadsGrid(list) {
  uploadsDiv.innerHTML = '';
  if (!list || list.length === 0) {
    uploadsDiv.innerHTML = '<p class="small">Aucun upload.</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'admin-uploads-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
  grid.style.gap = '12px';

  list.forEach(f => {
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

    if (Array.isArray(f.tags) && f.tags.length) {
      const tagWrap = document.createElement('div');
      tagWrap.style.marginTop = '8px';
      f.tags.slice(0,6).forEach(t => {
        const tspan = document.createElement('span');
        tspan.className = 'tag';
        tspan.textContent = t;
        tspan.style.marginRight = '6px';
        tspan.style.fontSize = '0.8rem';
        tagWrap.appendChild(tspan);
      });
      card.appendChild(tagWrap);
    }

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

    // Delete button (remplace "Source")
    const del = document.createElement('button');
    del.className = 'btn-inline secondary';
    del.style.background = '#dc3545';
    del.textContent = 'Supprimer';
    del.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const ok = confirm(`Supprimer définitivement "${f.title || f.originalFilename || 'Document'}" ?`);
      if (!ok) return;
      await deleteFile(f._id, card, del);
    });
    actions.appendChild(del);

    card.appendChild(actions);
    grid.appendChild(card);
  });

  uploadsDiv.appendChild(grid);
}

// deleteFile: call DELETE /api/files/:id with Authorization header
async function deleteFile(id, cardEl, buttonEl) {
  const token = getToken();
  if (!token) {
    alert('Non authentifié. Connectez-vous en tant qu\'admin.');
    showLogin();
    return;
  }
  buttonEl.disabled = true;
  const previousText = buttonEl.textContent;
  buttonEl.textContent = 'Suppression...';

  try {
    const res = await fetch(`/api/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    });
    let j = {};
    try { j = await res.json(); } catch(e){ /* ignore */ }
    if (!res.ok) {
      console.error('delete error', j);
      alert('Erreur lors de la suppression : ' + (j.error || res.statusText));
      buttonEl.disabled = false;
      buttonEl.textContent = previousText;
      if (res.status === 401) { clearToken(); showLogin(); }
      return;
    }
    // success: remove card from DOM
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    setTimeout(() => refreshUploads({ page: 1, pageSize: adminPageSize }), 300);
  } catch (err) {
    console.error('deleteFile error', err);
    alert('Erreur réseau lors de la suppression.');
    buttonEl.disabled = false;
    buttonEl.textContent = previousText;
  }
}

// Render admin pagination controls (Charger plus)
function renderAdminPaginationControls() {
  let ctrl = document.getElementById('admin-loadmore-control');
  if (ctrl) ctrl.remove();

  if (adminTotalPages > adminPage) {
    ctrl = document.createElement('div');
    ctrl.id = 'admin-loadmore-control';
    ctrl.style.marginTop = '12px';
    ctrl.style.textAlign = 'center';

    const btn = document.createElement('button');
    btn.textContent = 'Charger plus';
    btn.className = 'btn';
    btn.addEventListener('click', async () => {
      adminPage += 1;
      try {
        const res = await fetch(`/api/files?page=${adminPage}&pageSize=${adminPageSize}`);
        const data = await res.json();
        const newItems = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
        if (newItems.length > 0) {
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

    const del = document.createElement('button');
    del.className = 'btn-inline secondary';
    del.style.background = '#dc3545';
    del.textContent = 'Supprimer';
    del.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const ok = confirm(`Supprimer définitivement "${f.title || f.originalFilename || 'Document'}" ?`);
      if (!ok) return;
      await deleteFile(f._id, card, del);
    });
    actions.appendChild(del);

    card.appendChild(actions);
    grid.appendChild(card);
  });
}

// escape minimal
function escapeHtml(s){ return s ? s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;') : ''; }

// refresh button
if (refreshBtn) refreshBtn.addEventListener('click', () => { adminPage = 1; refreshUploads(); });

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
