import { API_URL } from './globals.js';
import { logoutToEntrance } from './navReturn.js';

/** Inactivity limit for non-admin sessions (ms). Minimum 10 minutes. */
export const SESSION_IDLE_MS = 10 * 60 * 1000;

const PUBLIC_AUTH_PAGES = new Set(['login.html', 'register.html', 'verify.html', 'recover.html']);

function isPublicAuthPage() {
    const segment = window.location.pathname.split('/').pop();
    const page = !segment || segment === '/' ? 'index.html' : segment;
    return PUBLIC_AUTH_PAGES.has(page);
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];

let idleTimer = null;
let started = false;
let loggingOut = false;
let lastActivityAt = Date.now();
const cleanupFns = new Set();
const abortControllers = new Set();

function getStoredUserRole() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        return user?.role || null;
    } catch {
        return null;
    }
}

function hasAuthToken() {
    const token = localStorage.getItem('token');
    return Boolean(token && token !== 'null' && token !== 'undefined');
}

export function isAdminSession() {
    return getStoredUserRole() === 'admin';
}

export function shouldEnforceSessionIdle() {
    if (isPublicAuthPage()) return false;
    return hasAuthToken() && !isAdminSession();
}

/** Modules register pollers / timers to stop on idle logout. */
export function registerSessionCleanup(fn) {
    if (typeof fn !== 'function') return () => {};
    cleanupFns.add(fn);
    return () => cleanupFns.delete(fn);
}

/** Optional: abort in-flight authenticated requests on logout. */
export function registerSessionAbortController(controller) {
    if (!controller) return;
    abortControllers.add(controller);
}

export function touchSessionActivity() {
    if (!started || loggingOut) return;
    lastActivityAt = Date.now();
    resetIdleTimer();
}

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdleTimeout, SESSION_IDLE_MS);
}

function runCleanups() {
    cleanupFns.forEach((fn) => {
        try { fn(); } catch (e) { console.warn('[SessionIdle] cleanup error', e); }
    });
    abortControllers.forEach((c) => {
        try { c.abort(); } catch (_) { /* ignore */ }
    });
    abortControllers.clear();
}

function detachActivityListeners() {
    ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, onUserActivity, true));
    document.removeEventListener('visibilitychange', onVisibilityChange);
}

function clearClientSession() {
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('valid_entry');
    sessionStorage.removeItem('ancestor_code');
}

export async function endSessionDueToIdle() {
    if (loggingOut) return;
    if (!shouldEnforceSessionIdle()) return;

    loggingOut = true;
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
    detachActivityListeners();
    runCleanups();

    try {
        const token = localStorage.getItem('token');
        if (token) {
            const controller = new AbortController();
            registerSessionAbortController(controller);
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                credentials: 'include',
                signal: controller.signal
            }).catch(() => {});
            clearTimeout(timeoutId);
        }
    } catch (_) { /* ignore */ }

    clearClientSession();
    logoutToEntrance();
}

function onIdleTimeout() {
    endSessionDueToIdle();
}

function onUserActivity() {
    touchSessionActivity();
}

function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastActivityAt >= SESSION_IDLE_MS) {
        onIdleTimeout();
    }
}

export function initSessionIdleTimeout() {
    if (!shouldEnforceSessionIdle()) {
        if (started) {
            started = false;
            loggingOut = false;
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = null;
            detachActivityListeners();
        }
        return;
    }
    if (started) return;

    started = true;
    loggingOut = false;
    lastActivityAt = Date.now();

    ACTIVITY_EVENTS.forEach((ev) => {
        document.addEventListener(ev, onUserActivity, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', onVisibilityChange);

    resetIdleTimer();
}
