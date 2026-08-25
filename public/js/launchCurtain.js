import { API_URL } from './globals.js';
import { t, applyStaticTranslations, formatOpeningDateTime } from './i18n.js';

let countdownTimer = null;
let openingHandled = false;

function pad(n) {
  return String(n).padStart(2, '0');
}

function splitCountdown(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export async function fetchLaunchCurtainStatus() {
  try {
    const res = await fetch(`${API_URL}/public/launch-curtain`);
    // A non-OK response (e.g. 429 rate limit) must NOT be treated as
    // "curtain off"; return an error sentinel so callers keep the current
    // state instead of wrongly opening the curtain.
    if (!res.ok) return { error: true };
    const data = await res.json();
    return data.success ? data.data : { error: true };
  } catch {
    return { error: true };
  }
}

function ensureGridSlot() {
  const grid = document.getElementById('treasureGrid');
  if (!grid) return null;

  let slot = document.getElementById('treasureGridSlot');
  if (slot) return slot;

  const loader = document.getElementById('pageLoader');
  const parent = grid.parentElement;
  if (!parent) return null;

  slot = document.createElement('div');
  slot.id = 'treasureGridSlot';
  slot.className = 'treasure-grid-slot';

  parent.insertBefore(slot, loader || grid);
  if (loader) slot.appendChild(loader);
  slot.appendChild(grid);
  return slot;
}

function getGridStage() {
  return document.getElementById('treasureGridSlot') || ensureGridSlot();
}

function hideGridChrome() {
  const grid = document.getElementById('treasureGrid');
  const loader = document.getElementById('pageLoader');
  const filterCard = document.querySelector('.categories-filter-source');
  const progress = document.getElementById('floatingProgressWrapper');

  if (grid) {
    grid.classList.add('hidden');
    grid.innerHTML = '';
  }
  if (loader) loader.style.display = 'none';
  if (filterCard) filterCard.style.display = 'none';
  if (progress) progress.style.display = 'none';
}

function showGridChrome() {
  const grid = document.getElementById('treasureGrid');
  const loader = document.getElementById('pageLoader');
  const filterCard = document.querySelector('.categories-filter-source');

  if (loader) loader.style.display = '';
  if (filterCard) filterCard.style.display = '';
  if (grid) grid.classList.remove('hidden');
}

function updateCountdownDisplay(status) {
  const root = document.getElementById('launchCurtainStage');
  if (!root) return;

  const parts = splitCountdown(status.msRemaining);
  const daysEl = root.querySelector('[data-countdown-days]');
  const hoursEl = root.querySelector('[data-countdown-hours]');
  const minutesEl = root.querySelector('[data-countdown-minutes]');
  const secondsEl = root.querySelector('[data-countdown-seconds]');

  if (daysEl) daysEl.textContent = pad(parts.days);
  if (hoursEl) hoursEl.textContent = pad(parts.hours);
  if (minutesEl) minutesEl.textContent = pad(parts.minutes);
  if (secondsEl) secondsEl.textContent = pad(parts.seconds);
}

function buildCurtainMarkup() {
  return `
    <div class="launch-curtain-stage" id="launchCurtainStage" role="region" aria-live="polite" aria-label="${t('Grand opening curtain')}">
      <div class="launch-curtain-gauze" aria-hidden="true"></div>
      <div class="launch-curtain-panel launch-curtain-panel-left" aria-hidden="true"></div>
      <div class="launch-curtain-panel launch-curtain-panel-right" aria-hidden="true"></div>
      <div class="launch-curtain-center">
        <p class="launch-curtain-kicker gold-text">${t('Grand Opening')}</p>
        <h2 class="launch-curtain-title">${t('The curtain rises soon')}</h2>
        <p class="launch-curtain-subtitle" data-curtain-subtitle></p>
        <div class="launch-curtain-countdown" aria-label="${t('Countdown to opening')}">
          <div class="launch-curtain-unit">
            <span class="launch-curtain-value" data-countdown-days>00</span>
            <span class="launch-curtain-label">${t('Days')}</span>
          </div>
          <div class="launch-curtain-unit">
            <span class="launch-curtain-value" data-countdown-hours>00</span>
            <span class="launch-curtain-label">${t('Hours')}</span>
          </div>
          <div class="launch-curtain-unit">
            <span class="launch-curtain-value" data-countdown-minutes>00</span>
            <span class="launch-curtain-label">${t('Minutes')}</span>
          </div>
          <div class="launch-curtain-unit">
            <span class="launch-curtain-value" data-countdown-seconds>00</span>
            <span class="launch-curtain-label">${t('Seconds')}</span>
          </div>
        </div>
        <p class="launch-curtain-footnote">${t('Until then, the treasure grids remain veiled.')}</p>
      </div>
    </div>
  `;
}

// Build the localized "revealed on <date>" copy from the resolved opening date.
// Returns '' when the date is missing/unparseable so the line can be hidden.
function buildOpeningCopy(status) {
  const formatted = formatOpeningDateTime(status?.openingAtLocal || status?.openingAt, { withTime: true });
  if (!formatted) return '';
  return t('Our Living Treasures will be revealed on {date}.').replace('{date}', formatted);
}

// Set the subtitle via textContent (after applyStaticTranslations has run) so it
// always reflects the resolved opening date in the active language, and hide the
// line entirely when no valid date is available.
function updateCurtainSubtitle(status) {
  const el = document.querySelector('#launchCurtainStage [data-curtain-subtitle]');
  if (!el) return;
  const copy = buildOpeningCopy(status);
  el.textContent = copy;
  el.style.display = copy ? '' : 'none';
}

function mountCurtain(status) {
  const stage = getGridStage();
  if (!stage || document.getElementById('launchCurtainStage')) return;

  stage.classList.add('launch-curtain-slot-active');
  stage.insertAdjacentHTML('beforeend', buildCurtainMarkup());
  applyStaticTranslations(document.getElementById('launchCurtainStage'));
  updateCurtainSubtitle(status);
  document.body.classList.add('launch-curtain-active');
  hideGridChrome();
}

export function removeLaunchCurtain() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  openingHandled = false;
  document.getElementById('launchCurtainStage')?.remove();
  document.getElementById('treasureGridSlot')?.classList.remove('launch-curtain-slot-active');
  document.body.classList.remove('launch-curtain-active', 'launch-curtain-opening');
  showGridChrome();
}

function playCurtainOpen(onComplete) {
  const root = document.getElementById('launchCurtainStage');
  if (!root) {
    onComplete?.();
    return;
  }

  document.body.classList.add('launch-curtain-opening');
  root.addEventListener('transitionend', () => {
    removeLaunchCurtain();
    onComplete?.();
  }, { once: true });

  setTimeout(() => {
    if (document.getElementById('launchCurtainStage')) {
      removeLaunchCurtain();
      onComplete?.();
    }
  }, 3200);
}

// Re-check with the server every 30s (not every second) to avoid tripping the
// API rate limit. The visible countdown ticks locally from this anchor.
const RESYNC_EVERY_TICKS = 30;

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

function openNow(onOpen) {
  stopCountdown();
  if (!openingHandled) {
    openingHandled = true;
    playCurtainOpen(onOpen);
  }
}

function startCountdown(status, onOpen) {
  stopCountdown();

  // Anchor the opening moment from the server's remaining time at fetch moment,
  // so we can count down locally without further requests (avoids 429).
  let openingTime = Date.now() + Math.max(0, Number(status.msRemaining) || 0);
  let ticksSinceSync = 0;

  const tick = async () => {
    const msRemaining = openingTime - Date.now();
    updateCountdownDisplay({ msRemaining: Math.max(0, msRemaining) });

    if (msRemaining <= 0) {
      stopCountdown();
      // Confirm with the server before opening to respect any clock skew.
      const fresh = await fetchLaunchCurtainStatus();
      if (!fresh.error && fresh.curtainVisible) {
        startCountdown(fresh, onOpen); // still closed per server; re-anchor
        return;
      }
      openNow(onOpen);
      return;
    }

    // Periodic re-sync to catch the admin turning the curtain off early.
    if (++ticksSinceSync >= RESYNC_EVERY_TICKS) {
      ticksSinceSync = 0;
      const fresh = await fetchLaunchCurtainStatus();
      if (fresh.error) return; // transient error: keep counting locally
      if (!fresh.curtainVisible) {
        openNow(onOpen);
        return;
      }
      openingTime = Date.now() + Math.max(0, Number(fresh.msRemaining) || 0);
      // Keep the displayed opening date in sync if the admin reschedules it.
      updateCurtainSubtitle(fresh);
    }
  };

  updateCountdownDisplay({ msRemaining: Math.max(0, openingTime - Date.now()) });
  countdownTimer = setInterval(tick, 1000);
}

/**
 * Returns true when grids should stay hidden (curtain shown).
 * @param {() => void} onOpen - called after curtain opens at launch time
 */
export async function resolveLaunchCurtain(onOpen) {
  const status = await fetchLaunchCurtainStatus();

  // On a transient error (e.g. 429) we cannot know the real state; leave the
  // current state untouched and let the grids load normally.
  if (status.error || !status.curtainVisible) {
    removeLaunchCurtain();
    return false;
  }

  mountCurtain(status);
  startCountdown(status, onOpen);
  return true;
}

function buildAuthHeaders(extra = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...extra };
  // Only attach the bearer token when it is a real value. Sending
  // "Bearer null"/"Bearer undefined" makes the server prefer the broken
  // header over the valid auth cookie and reply 401 Not authorized.
  if (token && token !== 'null' && token !== 'undefined') {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function saveLaunchCurtainEnabled(enabled) {
  const res = await fetch(`${API_URL}/admin/launch-curtain`, {
    method: 'PUT',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ enabled: Boolean(enabled) })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Could not update launch curtain');
  }
  return data.data;
}

export async function saveLaunchCurtainOpeningAt(openingAt) {
  const res = await fetch(`${API_URL}/admin/launch-curtain`, {
    method: 'PUT',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ openingAt })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Could not update launch curtain');
  }
  return data.data;
}

export async function loadLaunchCurtainAdminState() {
  const res = await fetch(`${API_URL}/admin/launch-curtain`, {
    headers: buildAuthHeaders(),
    credentials: 'include'
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Could not load launch curtain settings');
  }
  return data.data;
}
