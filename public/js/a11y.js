import { t, currentLang } from './i18n.js';

export function wireFormLabel(forId, labelKey, required = false) {
    const label = document.querySelector(`label[for="${forId}"]`);
    if (!label) return;
    label.replaceChildren();
    label.appendChild(document.createTextNode(t(labelKey)));
    if (required) {
        label.appendChild(document.createTextNode(' '));
        const star = document.createElement('span');
        star.className = 'required-star';
        star.setAttribute('aria-hidden', 'true');
        star.textContent = '*';
        label.appendChild(star);
    }
}

export function wireAuthFormLabels() {
    const fields = [
        ['email', 'Email Address'],
        ['password', 'Password'],
        ['verifyCode', '6-Digit Code'],
        ['forgotEmail', 'Email Address'],
        ['resetCode', '6-Digit Code'],
        ['resetNewPassword', 'New Password (Min 6 chars)'],
        ['resetConfirmPassword', 'Confirm Password'],
        ['recoveryEmail', 'Email Address'],
        ['recoveryCode', '6-Digit Code'],
        ['recoveryNewPassword', 'New Password (Min 6 chars)'],
        ['recoveryConfirmPassword', 'Confirm Password']
    ];
    fields.forEach(([id, key]) => wireFormLabel(id, key));
}

export function linkInputHint(inputId, hintId) {
    const input = document.getElementById(inputId);
    const hint = document.getElementById(hintId);
    if (!input || !hint) return;
    input.setAttribute('data-hint-id', hintId);
    const ids = [hintId];
    const alertId = input.getAttribute('data-alert-id');
    if (alertId && input.getAttribute('aria-invalid') === 'true') ids.push(alertId);
    input.setAttribute('aria-describedby', ids.join(' '));
}

export function setFieldInvalid(inputEl, invalid, alertEl = null) {
    if (!inputEl) return;
    inputEl.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    if (alertEl?.id) inputEl.setAttribute('data-alert-id', alertEl.id);

    const ids = [];
    const hintId = inputEl.getAttribute('data-hint-id');
    if (hintId) ids.push(hintId);
    if (invalid && alertEl?.id) ids.push(alertEl.id);
    if (ids.length) inputEl.setAttribute('aria-describedby', ids.join(' '));
    else if (hintId) inputEl.setAttribute('aria-describedby', hintId);
    else inputEl.removeAttribute('aria-describedby');
}

let confirmOverlay = null;

export function confirmDialog(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = t('Confirm action'),
            confirmLabel = t('Confirm'),
            cancelLabel = t('Cancel'),
            destructive = false
        } = options;

        if (!confirmOverlay) {
            confirmOverlay = document.createElement('div');
            confirmOverlay.id = 'a11yConfirmOverlay';
            confirmOverlay.className = 'payment-modal-overlay';
            Object.assign(confirmOverlay.style, {
                position: 'fixed',
                inset: '0',
                background: 'rgba(0,0,0,0.85)',
                zIndex: '100001',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
            });
            document.body.appendChild(confirmOverlay);
        }

        confirmOverlay.innerHTML = `
            <div class="card payment-modal-panel" data-modal-panel style="max-width:480px;width:100%;">
                <h3 id="a11yConfirmTitle" class="gold-text" style="margin-top:0;">${title}</h3>
                <p id="a11yConfirmMessage" style="color:#ccc;line-height:1.6;margin-bottom:20px;"></p>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button type="button" id="a11yConfirmCancel" style="flex:1;min-width:120px;background:transparent;border:1px solid var(--primary-gold);color:var(--primary-gold);padding:10px;border-radius:4px;cursor:pointer;font-weight:bold;">${cancelLabel}</button>
                    <button type="button" id="a11yConfirmOk" style="flex:1;min-width:120px;padding:10px;border-radius:4px;cursor:pointer;font-weight:bold;border:none;">${confirmLabel}</button>
                </div>
            </div>`;

        document.getElementById('a11yConfirmMessage').textContent = t(message);

        const okBtn = document.getElementById('a11yConfirmOk');
        if (destructive) {
            okBtn.style.background = 'var(--accent-red)';
            okBtn.style.color = '#fff';
        } else {
            okBtn.style.background = 'var(--primary-gold)';
            okBtn.style.color = 'var(--dark-bg)';
        }

        const finish = (result) => {
            deactivateAccessibleModal(confirmOverlay);
            confirmOverlay.style.display = 'none';
            if (!document.querySelector('.payment-modal-overlay:not(.hidden)[style*="flex"], #a11yConfirmOverlay[style*="flex"]')) {
                document.body.style.overflow = '';
            }
            resolve(result);
        };

        const cancel = () => finish(false);
        document.getElementById('a11yConfirmCancel').onclick = cancel;
        okBtn.onclick = () => finish(true);
        confirmOverlay.onclick = (e) => {
            if (e.target === confirmOverlay) cancel();
        };

        confirmOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        activateAccessibleModal(confirmOverlay, {
            labelId: 'a11yConfirmTitle',
            onClose: cancel,
            initialFocusSelector: '#a11yConfirmCancel'
        });
    });
}

export function syncDocumentLang(lang = currentLang) {
    document.documentElement.lang = lang === 'es' ? 'es' : 'en';
}

export function initSkipLink() {
    if (document.getElementById('skipToMain')) return;

    const skip = document.createElement('a');
    skip.id = 'skipToMain';
    skip.href = '#main-content';
    skip.className = 'skip-link';
    skip.textContent = t('Skip to main content');
    document.body.insertBefore(skip, document.body.firstChild);

    ensureMainLandmark();
}

function ensureMainLandmark() {
    const skip = document.getElementById('skipToMain');

    const main = document.querySelector('main');
    if (main) {
        if (!main.id) main.id = 'main-content';
        if (!main.hasAttribute('role')) main.setAttribute('role', 'main');
        if (skip) skip.href = `#${main.id}`;
        return;
    }

    if (document.getElementById('main-content')) {
        if (skip) skip.href = '#main-content';
        return;
    }

    const selectors = ['#landing', '#loginPage', '#registerMain', '#profDashboardLayout', '#dashboardContent', '.container'];
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            if (!el.id) el.id = 'main-content';
            if (!el.hasAttribute('role')) el.setAttribute('role', 'main');
            if (skip) skip.href = `#${el.id}`;
            return;
        }
    }
}

export function getFocusableElements(root) {
    if (!root) return [];
    const selector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(', ');
    return Array.from(root.querySelectorAll(selector)).filter((el) => {
        if (el.getAttribute('aria-hidden') === 'true') return false;
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
    });
}

const modalState = new WeakMap();

function resolveModalPanel(modalEl) {
    return modalEl.querySelector('.payment-modal-panel, [data-modal-panel], .card') || modalEl;
}

export function activateAccessibleModal(modalEl, { labelId, onClose, initialFocusSelector } = {}) {
    if (!modalEl) return;

    const panel = resolveModalPanel(modalEl);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (labelId) panel.setAttribute('aria-labelledby', labelId);
    modalEl.setAttribute('aria-hidden', 'false');

    const previousFocus = document.activeElement;

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (typeof onClose === 'function') onClose();
            return;
        }
        if (e.key !== 'Tab') return;

        const focusables = getFocusableElements(panel);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    document.addEventListener('keydown', onKeyDown);

    modalState.set(modalEl, { previousFocus, onKeyDown, panel });

    const initialFocus = initialFocusSelector
        ? panel.querySelector(initialFocusSelector)
        : panel.querySelector('.payment-modal-close, [data-modal-close], button, input, select, textarea, a[href]');

    requestAnimationFrame(() => initialFocus?.focus());
}

export function deactivateAccessibleModal(modalEl) {
    if (!modalEl) return;

    const state = modalState.get(modalEl);
    if (state) {
        document.removeEventListener('keydown', state.onKeyDown);
        state.panel?.removeAttribute('aria-modal');
        state.panel?.removeAttribute('aria-labelledby');
        state.panel?.removeAttribute('role');
        modalState.delete(modalEl);
        if (state.previousFocus?.focus) {
            try {
                state.previousFocus.focus();
            } catch (_) { /* ignore */ }
        }
    }

    modalEl.setAttribute('aria-hidden', 'true');
}

export function ensureLiveRegion() {
    let region = document.getElementById('a11yAnnounce');
    if (region) return region;

    region = document.createElement('div');
    region.id = 'a11yAnnounce';
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
    return region;
}

export function announceMessage(message, { isError = false } = {}) {
    const region = ensureLiveRegion();
    region.setAttribute('role', isError ? 'alert' : 'status');
    region.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    region.textContent = '';
    requestAnimationFrame(() => {
        region.textContent = t(message);
    });
}

export function initA11y() {
    syncDocumentLang();
    initSkipLink();
    ensureLiveRegion();
}

if (typeof document !== 'undefined' && document.documentElement) {
    syncDocumentLang();
}
