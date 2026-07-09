// --- Global Constants ---
export const BASE_ORIGIN = window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin;
export const API_URL = `${BASE_ORIGIN}/api/v1`;

/**
 * Age-verification + Terms & Conditions version (for future legal gate).
 * MUST stay in sync with config/appConfig.js -> terms.version on the backend.
 */
export const TERMS_VERSION = '2026-06-18';

/** Known static pages — must not be treated as profile aliases under /perfil/ */
export const APP_PAGES = new Set([
    'index.html', 'login.html', 'register.html', 'recover.html', 'verify.html',
    'categories.html', 'dashboard.html', 'profDashboard.html', 'treasure.html',
    'discover.html', 'home.html', 'services.html', 'admin.html', 'admin-potentials.html', 'whatsapp-inbox.html', 'plataforma.html',
    'notas-interes.html', 'nota-interes.html'
]);

/** Root-absolute path so navigation works from /perfil/Alias URLs */
export function appPath(page) {
    if (!page) return '/';
    if (/^https?:\/\//i.test(page)) return page;
    if (page.startsWith('/')) return page;
    return '/' + page.replace(/^\.\//, '');
}

export function isReservedAppPage(segment) {
    return APP_PAGES.has(String(segment || '').toLowerCase());
}

/** Unsplash removed these; swap before setting img.src */
const DEAD_UNSPLASH_IDS = {
    'photo-1611601322175-28e659d4d484': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=800&auto=format&fit=crop',
    'photo-1589466725882-6cf1b8957b37': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=800&auto=format&fit=crop'
};

export function resolvePhotoSrc(url) {
    if (!url || typeof url !== 'string') return url;
    for (const [deadId, replacement] of Object.entries(DEAD_UNSPLASH_IDS)) {
        if (url.includes(deadId)) return replacement;
    }
    return url;
}

/** Verification selfie hand gestures (code stored in DB, emoji shown in UI). */
export const VERIFICATION_GESTURES = [
    { code: '1FU', emoji: '☝️', labelKey: '1 finger up ☝️' },
    { code: '2FU', emoji: '✌️', labelKey: '2 fingers up ✌️' },
    { code: '3FU', emoji: '🖖', labelKey: '3 fingers up 🖖' },
    { code: 'TU', emoji: '👍', labelKey: 'Thumbs up 👍' },
    { code: 'OS', emoji: '👌', labelKey: 'OK sign 👌' }
];

const LEGACY_GESTURE_MAP = {
    '1 finger': VERIFICATION_GESTURES[0],
    '2 fingers': VERIFICATION_GESTURES[1],
    '3 fingers': VERIFICATION_GESTURES[2],
    'thumbs up': VERIFICATION_GESTURES[3]
};

export function getVerificationGesture(code) {
    if (!code) return null;
    const byCode = VERIFICATION_GESTURES.find((g) => g.code === code);
    if (byCode) return byCode;
    return LEGACY_GESTURE_MAP[code] || null;
}

export function formatVerificationGesture(code, tFn = (s) => s) {
    const gesture = getVerificationGesture(code);
    if (!gesture) return code || 'N/A';
    return `${gesture.emoji} ${tFn(gesture.labelKey)}`;
}

export const CATEGORY_META = {
    'verificados': { name: '⭐ verificados', alias: 'Rolls-Royce', logo: '<svg viewBox="0 0 40 50" width="100%"><rect x="2" y="2" width="36" height="46" fill="none" stroke="currentColor" stroke-width="2" rx="4"/><text x="20" y="22" font-family="serif" font-size="14" fill="currentColor" text-anchor="middle" font-weight="bold">R</text><text x="20" y="36" font-family="serif" font-size="14" fill="currentColor" text-anchor="middle" font-weight="bold">R</text></svg>', desc: 'Peak Luxury & Royalty', price: '$50.000.- ARS', monthlyPrice: 50000, priceUnit: 'ARS' },
    'Premium': { name: '✨ Premium', alias: 'Bentley', logo: '<svg viewBox="0 0 100 40" width="100%"><path d="M10,20 Q30,0 50,20 Q30,40 10,20 Z M90,20 Q70,0 50,20 Q70,40 90,20 Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="20" r="10" fill="none" stroke="currentColor" stroke-width="2"/><text x="50" y="25" font-family="serif" font-size="14" fill="currentColor" text-anchor="middle" font-weight="bold">B</text></svg>', desc: 'Performance & Elegance', price: '$40.000.- ARS', monthlyPrice: 40000, priceUnit: 'ARS' },
    'Gold': { name: '🟡 Gold', alias: 'Mercedes-Benz', logo: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" width="100%"><circle cx="32" cy="32" r="28"/><path d="M32 4 L32 32 L10 46 M32 32 L54 46"/></svg>', desc: 'Executive Success & Status', price: '$30.000.- ARS', monthlyPrice: 30000, priceUnit: 'ARS' },
    'Silver': { name: '⚪ Silver', alias: 'Audi', logo: '<svg viewBox="0 0 100 40" width="100%"><circle cx="26" cy="20" r="12"/><circle cx="42" cy="20" r="12"/><circle cx="58" cy="20" r="12"/><circle cx="74" cy="20" r="12"/></svg>', desc: 'Modern High-Tech Style', price: '$20.000.- ARS', monthlyPrice: 20000, priceUnit: 'ARS' },
    'Standard': { name: '🟤 Standard', alias: 'Toyota', logo: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" width="100%"><ellipse cx="32" cy="32" rx="28" ry="18" /><ellipse cx="32" cy="32" rx="18" ry="7" /><ellipse cx="32" cy="20" rx="6" ry="12" /></svg>', desc: 'Everyday Functional Reliability', price: '$15.000.- ARS', monthlyPrice: 15000, priceUnit: 'ARS' },
    'Uncategorized': { name: 'Uncategorized', logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="100%"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', desc: 'Needs Review', price: 'N/A' }
};
