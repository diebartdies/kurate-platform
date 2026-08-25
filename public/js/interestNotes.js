import { API_URL, appPath } from './globals.js';
import { t, applyStaticTranslations, currentLang } from './i18n.js';

function langQuery() {
  return `lang=${encodeURIComponent(currentLang || 'es')}`;
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'X-Platform-Lang': currentLang || 'es',
    ...extra
  };
  if (token && token !== 'null' && token !== 'undefined') {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function requireProfessionalSession() {
  const token = localStorage.getItem('token');
  if (!token || token === 'null' || token === 'undefined') {
    sessionStorage.setItem('intended_destination', window.location.href);
    window.location.replace(appPath('login.html'));
    return false;
  }

  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || (user.role !== 'professional' && user.role !== 'admin')) {
      window.location.replace(appPath('index.html'));
      return false;
    }
  } catch {
    window.location.replace(appPath('login.html'));
    return false;
  }

  return true;
}

export async function loadInterestNotesList() {
  const listEl = document.getElementById('interestNotesList');
  if (!listEl || !requireProfessionalSession()) return;

  const backBtn = document.getElementById('interestNotesBackBtn');
  if (backBtn) {
    backBtn.textContent = `← ${t('Back to dashboard')}`;
    backBtn.href = appPath('dashboard.html');
  }

  listEl.innerHTML = `<p class="interest-notes-empty">${t('Loading...')}</p>`;

  try {
    const res = await fetch(`${API_URL}/interest-notes?${langQuery()}`, {
      headers: authHeaders(),
      credentials: 'include'
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      listEl.innerHTML = `<p class="interest-notes-error">${escapeHtml(data.error || t('Failed to load articles.'))}</p>`;
      return;
    }

    const notes = data.data || [];
    if (!notes.length) {
      listEl.innerHTML = `<p class="interest-notes-empty">${t('No articles yet.')}</p>`;
      return;
    }

    listEl.innerHTML = '';
    notes.forEach((note) => {
      const card = document.createElement('a');
      card.className = 'interest-note-card';
      card.href = appPath(`nota-interes.html?id=${encodeURIComponent(note._id)}`);
      card.innerHTML = `
        <h2 class="interest-note-card-title">${escapeHtml(note.title)}</h2>
        <p class="interest-note-card-preview">${escapeHtml(note.preview || '')}</p>
      `;
      listEl.appendChild(card);
    });

    applyStaticTranslations(listEl);
  } catch {
    listEl.innerHTML = `<p class="interest-notes-error">${t('Failed to load articles.')}</p>`;
  }
}

export async function loadInterestNoteArticle() {
  const articleEl = document.getElementById('interestNoteArticle');
  if (!articleEl || !requireProfessionalSession()) return;

  const backBtn = document.getElementById('interestNoteBackBtn');
  if (backBtn) {
    backBtn.textContent = `← ${t('Back to Notes of Interest')}`;
    backBtn.href = appPath('notas-interes.html');
  }

  const noteId = new URLSearchParams(window.location.search).get('id');
  if (!noteId) {
    articleEl.innerHTML = `<p class="interest-notes-error">${t('Article not found.')}</p>`;
    return;
  }

  articleEl.innerHTML = `<p class="interest-notes-empty">${t('Loading...')}</p>`;

  try {
    const res = await fetch(`${API_URL}/interest-notes/${encodeURIComponent(noteId)}?${langQuery()}`, {
      headers: authHeaders(),
      credentials: 'include'
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      articleEl.innerHTML = `<p class="interest-notes-error">${escapeHtml(data.error || t('Article not found.'))}</p>`;
      return;
    }

    const note = data.data;
    document.title = `${note.title} | SexAppeal`;
    articleEl.innerHTML = `
      <h1 class="interest-note-article-title">${escapeHtml(note.title)}</h1>
      <div class="interest-note-article">${escapeHtml(note.body)}</div>
    `;
  } catch {
    articleEl.innerHTML = `<p class="interest-notes-error">${t('Failed to load article.')}</p>`;
  }
}
