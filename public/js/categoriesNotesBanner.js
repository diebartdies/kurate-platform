import { API_URL, appPath } from './globals.js';
import { t, currentLang } from './i18n.js';

function resolveNoteHref(noteId) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.role === 'professional' || user?.role === 'admin') {
      return appPath(`nota-interes.html?id=${encodeURIComponent(noteId)}`);
    }
  } catch {
    /* ignore */
  }
  return appPath('login.html');
}

function resolveMoreHref() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.role === 'professional' || user?.role === 'admin') {
      return appPath('notas-interes.html');
    }
  } catch {
    /* ignore */
  }
  return appPath('login.html');
}

function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function isProfessionalOrAdmin(user) {
  return Boolean(user && (user.role === 'professional' || user.role === 'admin'));
}

export async function initCategoriesNotesBanner() {
  const banner = document.getElementById('categoriesNotesBanner');
  if (!banner) return;
  const user = getSessionUser();
  if (!isProfessionalOrAdmin(user)) {
    banner.hidden = true;
    return;
  }

  const label = t('NOTES');
  const moreLabel = t('VIEW ALL →');

  try {
    const res = await fetch(
      `${API_URL}/public/interest-note-headlines?lang=${encodeURIComponent(currentLang || 'es')}`
    );
    const data = await res.json();
    const notes = data.success ? (data.data || []) : [];

    if (!notes.length) {
      banner.hidden = true;
      return;
    }

    const parts = [`<span class="blueprint-notes-banner__label">${label}</span>`];
    const maxShow = 5;
    notes.slice(0, maxShow).forEach((note) => {
      parts.push('<span class="blueprint-notes-banner__sep" aria-hidden="true">·</span>');
      const title = String(note.title || '').replace(/</g, '&lt;');
      parts.push(
        `<a class="blueprint-notes-banner__link" href="${resolveNoteHref(note._id)}">${title}</a>`
      );
    });
    parts.push(
      `<a class="blueprint-notes-banner__more" href="${resolveMoreHref()}">${moreLabel}</a>`
    );

    banner.innerHTML = parts.join('');
    banner.hidden = false;
  } catch {
    banner.hidden = true;
  }
}
