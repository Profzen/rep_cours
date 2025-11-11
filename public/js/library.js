// public/js/library.js
// Library page client script (full) - updated to open PDFs in pdf-viewer.html and keep images opening normally
(function () {
  // CONFIG
  const INITIAL_WANTED = 30;
  const SERVER_PAGE_SIZE = 20;

  // DOM helpers (defensive: check presence)
  const $ = id => document.getElementById(id);
  const filterClass = $('filter-class');
  const filterSubject = $('filter-subject');
  const filterTrimester = $('filter-trimester');
  const filterType = $('filter-type');
  const filterKey = $('filter-key');
  const btnFilter = $('btn-filter');
  const btnClear = $('btn-clear');
  const tagCloud = $('tag-cloud');
  const resultsCount = $('results-count');
  const resultsSection = $('results');
  const loadMoreBtn = $('load-more-btn');
  const loadMoreNote = $('loadmore-note');
  const sortBy = $('sort-by');

  if (!resultsSection) {
    console.warn('library.js: #results element not found — script will stop.');
    return;
  }

  // State
  let serverPagePointer = 0;
  let serverTotalPages = Infinity;
  let allItems = [];
  let activeFilters = {};
  let loading = false;

  // util
  const escapeHtml = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;') : '';
  const debounce = (fn, ms=300) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };

  function buildUrl(page) {
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('pageSize', SERVER_PAGE_SIZE);
    if (activeFilters.class) params.append('class', activeFilters.class);
    if (activeFilters.subject) params.append('subject', activeFilters.subject);
    if (activeFilters.trimester) params.append('trimester', activeFilters.trimester);
    if (activeFilters.type) params.append('type', activeFilters.type);
    if (activeFilters.q) params.append('q', activeFilters.q);
    // IMPORTANT: leading slash to ensure absolute path from site root
    return '/api/files?' + params.toString();
  }

  async function fetchServerPage(page) {
    const url = buildUrl(page);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        // try to read body for better debug info
        let body = '';
        try { body = await res.text(); } catch (e) { body = ''; }
        throw new Error(`Erreur ${res.status} ${res.statusText} — ${body || url}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        serverTotalPages = 1;
        return data;
      }
      if (data && Array.isArray(data.items)) {
        serverTotalPages = typeof data.totalPages === 'number' ? data.totalPages : serverTotalPages;
        return data.items;
      }
      return [];
    } catch (err) {
      // Network errors and parsing errors end up here
      throw new Error(`Fetch failed for ${url} — ${err && err.message ? err.message : err}`);
    }
  }

  function appendItems(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const seen = new Set(allItems.map(i => String(i._id || i.url || (i.title + i.uploadedAt))));
    for (const it of items) {
      const key = String(it._id || it.url || (it.title + it.uploadedAt));
      if (!seen.has(key)) { allItems.push(it); seen.add(key); }
    }
  }

  // helper to detect likely pdf by url or type
  function isPdfResource(f) {
    if (!f) return false;
    if (f.type && String(f.type).toLowerCase().includes('pdf')) return true;
    if (f.url && /\.pdf(\?|$)/i.test(f.url)) return true;
    if (f.originalFilename && /\.pdf(\?|$)/i.test(f.originalFilename)) return true;
    return false;
  }

  function renderAllItems() {
    resultsSection.innerHTML = '';
    if (!allItems || allItems.length === 0) {
      resultsSection.innerHTML = '<p class="small">Aucun résultat pour ces filtres.</p>';
      if (resultsCount) resultsCount.textContent = '0 ressource';
      return;
    }

    const sorted = [...allItems];
    const s = sortBy && sortBy.value;
    if (s === 'date_desc') sorted.sort((a,b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    else if (s === 'date_asc') sorted.sort((a,b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));
    else if (s === 'title_asc') sorted.sort((a,b) => String((a.title||'')).localeCompare(String((b.title||''))));
    else if (s === 'title_desc') sorted.sort((a,b) => String((b.title||'')).localeCompare(String((a.title||''))));

    const grid = document.createElement('div');
    grid.className = 'results-grid-inner';

    sorted.forEach(f => {
      const card = document.createElement('article');
      card.className = 'resource-card card';

      const title = document.createElement('h3');
      title.textContent = f.title || f.originalFilename || 'Document';
      card.appendChild(title);

      const meta = document.createElement('p');
      meta.className = 'meta small';
      const date = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : '—';
      meta.textContent = `${f.class || '—'} • ${f.subject || '—'} • ${f.type || '—'} • ${date}`;
      card.appendChild(meta);

      if (Array.isArray(f.tags) && f.tags.length) {
        const tagWrap = document.createElement('div');
        tagWrap.className = 'tags';
        f.tags.forEach(t => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tag';
          btn.textContent = t;
          btn.addEventListener('click', () => {
            if (filterKey) filterKey.value = t;
            applyFilters();
            window.scrollTo({ top: resultsSection.offsetTop - 120, behavior: 'smooth' });
          });
          tagWrap.appendChild(btn);
        });
        card.appendChild(tagWrap);
      }

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      // OPEN: open image directly; for pdf open pdf-viewer.html?src=...
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn btn-outline';
      openBtn.textContent = 'Ouvrir';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Prefer public url (Cloud, S3, etc.)
        if (f.url) {
          if (isPdfResource(f)) {
            const viewerUrl = 'pdf-viewer.html?src=' + encodeURIComponent(f.url);
            window.open(viewerUrl, '_blank', 'noopener');
          } else {
            window.open(f.url, '_blank', 'noopener');
          }
          return;
        }

        // fallback to server endpoint if _id present
        if (f._id) {
          const downloadEndpoint = `/api/files/${f._id}/download`;
          if (isPdfResource(f)) {
            const viewerUrl = 'pdf-viewer.html?src=' + encodeURIComponent(downloadEndpoint);
            window.open(viewerUrl, '_blank', 'noopener');
          } else {
            window.open(downloadEndpoint, '_blank', 'noopener');
          }
          return;
        }

        alert('Aucun fichier disponible à l\'ouverture.');
      });
      actions.appendChild(openBtn);

      // DOWNLOAD: force download via server proxy when _id present, else link to url
      const dlA = document.createElement('a');
      dlA.className = 'download-btn';
      if (f._id) {
        dlA.href = `/api/files/${f._id}/download`;
        try { dlA.setAttribute('download', ''); } catch(e){}
      } else if (f.url) {
        dlA.href = f.url;
        try { dlA.setAttribute('download', ''); } catch(e){}
      } else {
        dlA.href = '#';
        dlA.style.opacity = 0.6;
        dlA.style.pointerEvents = 'none';
      }
      dlA.target = '_blank';
      dlA.rel = 'noopener';
      dlA.textContent = 'Télécharger';
      actions.appendChild(dlA);

      card.appendChild(actions);
      grid.appendChild(card);
    });

    resultsSection.appendChild(grid);
    if (resultsCount) resultsCount.textContent = `${allItems.length} ressource(s) affichée(s)`;
  }

  function updateTagCloud() {
    if (!tagCloud) return;
    tagCloud.innerHTML = '';
    const counts = {};
    allItems.forEach(f => { if (Array.isArray(f.tags)) f.tags.forEach(t => counts[t] = (counts[t] || 0) + 1); });
    const tags = Object.keys(counts).sort((a,b) => counts[b]-counts[a]).slice(0, 20);
    tags.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-chip';
      btn.textContent = `${t}`;
      btn.addEventListener('click', () => {
        if (filterKey) filterKey.value = t;
        applyFilters();
        window.scrollTo({ top: resultsSection.offsetTop - 120, behavior: 'smooth' });
      });
      tagCloud.appendChild(btn);
    });
  }

  function setLoading(v) {
    loading = !!v;
    if (loadMoreBtn) loadMoreBtn.disabled = loading;
    if (loading) {
      if (!resultsSection.querySelector('.loading-indicator')) {
        resultsSection.innerHTML = '<p class="small loading-indicator">Chargement...</p>';
      }
    } else {
      const li = resultsSection.querySelector('.loading-indicator');
      if (li) li.remove();
    }
  }

  async function initialLoad() {
    setLoading(true);
    serverPagePointer = 0;
    serverTotalPages = Infinity;
    allItems = [];

    activeFilters = {
      class: filterClass ? filterClass.value : '',
      subject: filterSubject ? filterSubject.value : '',
      trimester: filterTrimester ? filterTrimester.value : '',
      type: filterType ? filterType.value : '',
      q: (filterKey && filterKey.value ? filterKey.value.trim() : '')
    };

    const pagesNeeded = Math.ceil(INITIAL_WANTED / SERVER_PAGE_SIZE);

    try {
      for (let p = 1; p <= pagesNeeded; p++) {
        const items = await fetchServerPage(p);
        serverPagePointer = p;
        appendItems(items);
        if (allItems.length >= INITIAL_WANTED) break;
        if (serverPagePointer >= serverTotalPages) break;
      }
      if (allItems.length > INITIAL_WANTED) allItems = allItems.slice(0, INITIAL_WANTED);
      renderAllItems();
      updateTagCloud();
      updateLoadMoreVisibility();
    } catch (err) {
      console.error('initialLoad error', err);
      resultsSection.innerHTML = `<p class="small">Erreur lors du chargement : ${escapeHtml(err.message)}</p>`;
      if (resultsCount) resultsCount.textContent = 'Erreur';
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading) return;
    if (serverTotalPages !== Infinity && serverPagePointer >= serverTotalPages) {
      if (loadMoreNote) loadMoreNote.textContent = 'Toutes les ressources ont été chargées.';
      if (loadMoreBtn) loadMoreBtn.disabled = true;
      return;
    }

    setLoading(true);
    try {
      const nextPage = serverPagePointer + 1;
      const items = await fetchServerPage(nextPage);
      serverPagePointer = nextPage;
      appendItems(items);
      renderAllItems();
      updateTagCloud();
      updateLoadMoreVisibility();
    } catch (err) {
      console.error('loadMore error', err);
      if (loadMoreNote) loadMoreNote.textContent = 'Erreur lors du chargement.';
    } finally {
      setLoading(false);
    }
  }

  function updateLoadMoreVisibility() {
    if (!loadMoreBtn || !loadMoreNote) return;
    if (serverTotalPages === Infinity) {
      loadMoreBtn.disabled = false;
      loadMoreNote.textContent = '';
      return;
    }
    if (serverPagePointer >= serverTotalPages) {
      loadMoreBtn.disabled = true;
      loadMoreNote.textContent = 'Toutes les ressources ont été chargées.';
    } else {
      loadMoreBtn.disabled = false;
      loadMoreNote.textContent = `Chargé(s) ${allItems.length} — page ${serverPagePointer}/${serverTotalPages}`;
    }
  }

  function applyFilters() { initialLoad(); }
  function clearFilters() {
    if (filterClass) filterClass.value = '';
    if (filterSubject) filterSubject.value = '';
    if (filterTrimester) filterTrimester.value = '';
    if (filterType) filterType.value = '';
    if (filterKey) filterKey.value = '';
    if (sortBy) sortBy.value = 'date_desc';
    initialLoad();
  }

  // event wiring (defensive)
  if (btnFilter) btnFilter.addEventListener('click', (e) => { e.preventDefault(); applyFilters(); });
  if (btnClear) btnClear.addEventListener('click', (e) => { e.preventDefault(); clearFilters(); });
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', (e) => { e.preventDefault(); loadMore(); });
  if (filterKey) filterKey.addEventListener('input', debounce(() => applyFilters(), 350));
  if (sortBy) sortBy.addEventListener('change', () => renderAllItems());

  // initial on DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    initialLoad();
  });

  // expose for debug
  window._repLibrary = {
    state: () => ({ serverPagePointer, serverTotalPages, allItems }),
    initialLoad, loadMore, applyFilters
  };

})();
