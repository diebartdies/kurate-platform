import { appPath } from './globals.js';

const STACK_KEY = 'nav_return_stack';
const SCROLL_RESTORE_KEY = 'nav_restore_scroll';

function readStack() {
    try {
        const raw = sessionStorage.getItem(STACK_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeStack(stack) {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
}

/** Snapshot current URL + scroll — call before leaving a page or opening a full-screen flow. */
export function captureReturnPoint(label) {
    return {
        href: window.location.pathname + window.location.search + window.location.hash,
        scrollY: window.scrollY || 0,
        label: label || null
    };
}

export function pushReturnPoint(point = captureReturnPoint()) {
    const stack = readStack();
    stack.push(point);
    writeStack(stack);
}

export function peekReturnPoint() {
    const stack = readStack();
    return stack.length ? stack[stack.length - 1] : null;
}

export function popReturnPoint() {
    const stack = readStack();
    const point = stack.pop();
    writeStack(stack);
    return point || null;
}

export function clearReturnStack() {
    sessionStorage.removeItem(STACK_KEY);
}

/** Logout / close session — always return to index, never use return stack. */
export function logoutToEntrance() {
    clearReturnStack();
    sessionStorage.removeItem('intended_destination');
    window.location.replace(appPath('index.html'));
}

function currentHref() {
    return window.location.pathname + window.location.search + window.location.hash;
}

function scheduleScrollRestore(y) {
    sessionStorage.setItem(SCROLL_RESTORE_KEY, String(Math.max(0, y || 0)));
}

/** Apply scroll saved by returnToOrigin() after a full page load. */
export function applyPendingScrollRestore() {
    const raw = sessionStorage.getItem(SCROLL_RESTORE_KEY);
    if (raw === null) return;
    sessionStorage.removeItem(SCROLL_RESTORE_KEY);
    const y = parseInt(raw, 10);
    if (Number.isNaN(y)) return;
    const restore = () => window.scrollTo({ top: y, behavior: 'auto' });
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 100);
}

/**
 * Go back to the last saved origin. Returns true if handled.
 * @param {() => void} [fallback] when stack is empty
 */
export function returnToOrigin(fallback) {
    const point = popReturnPoint();
    if (!point?.href) {
        if (typeof fallback === 'function') fallback();
        return false;
    }

    if (point.href === currentHref()) {
        if (typeof fallback === 'function') fallback();
        return false;
    }

    scheduleScrollRestore(point.scrollY);
    window.location.href = point.href;
    return true;
}

/** Save origin then navigate to another page. */
export function navigateWithReturn(url, returnPoint = captureReturnPoint()) {
    pushReturnPoint(returnPoint);
    window.location.href = url;
}

// --- Same-page modal sessions (preserve scroll while overlay is open) ---

let modalSessionDepth = 0;
let modalReturnPoint = null;

export function beginModalSession(returnPoint = captureReturnPoint()) {
    if (modalSessionDepth === 0) {
        modalReturnPoint = returnPoint;
    }
    modalSessionDepth++;
}

export function endModalSession() {
    modalSessionDepth = Math.max(0, modalSessionDepth - 1);
    if (modalSessionDepth === 0 && modalReturnPoint) {
        window.scrollTo({ top: modalReturnPoint.scrollY || 0, behavior: 'smooth' });
        modalReturnPoint = null;
    }
}

export function isModalSessionActive() {
    return modalSessionDepth > 0;
}

/** Close a visible DOM overlay and restore modal scroll session. */
export function closeOverlay(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const visible = style.display !== 'none' && !el.classList.contains('hidden');
    if (!visible) return false;
    el.style.display = 'none';
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    endModalSession();
    return true;
}

/** Try to dismiss known full-screen overlays before leaving the page. */
export function closeKnownOverlays() {
    const ids = [
        'editProfModal',
        'pendingModal',
        'paymentVerificationsModal',
        'logsModal',
        'leadsModal',
        'rejectVerificationModal',
        'imageViewerModal',
        'editPricingModal',
        'mailBroadcastModal',
        'mailSpecialModal',
        'waSpecialModal',
        'deleteProfileOverlay',
        'paymentModalOverlay',
        'howToPayOverlay',
        'pendingConnectionsModal'
    ];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el && closeOverlay(el)) return true;
    }
    return false;
}

/** Global back: pop return stack, else close overlay, else optional fallback. */
export function navigateBack(fallback) {
    if (closeKnownOverlays()) return;

    if (returnToOrigin(fallback)) return;

    if (typeof fallback === 'function') {
        fallback();
        return;
    }

    window.history.back();
}

/** Push origin when following an in-app link (top bar, buttons). */
export function bindReturnOnClick(element, href) {
    if (!element || !href) return;
    element.addEventListener('click', (e) => {
        e.preventDefault();
        navigateWithReturn(href);
    });
}

/** Safe fallback when no return point exists. */
export function defaultGuestFallback() {
    window.location.href = appPath('categories.html');
}
