import { API_URL } from './globals.js';
import { t } from './i18n.js';
import { showAlert } from './uiHelpers.js';

let cachedClientId = null;

function readMetaClientId() {
    const meta = document.querySelector('meta[name="google-signin-client_id"]');
    return meta?.content?.trim() || '';
}

async function resolveGoogleClientId() {
    if (cachedClientId !== null) return cachedClientId;
    try {
        const res = await fetch(`${API_URL}/public/client-config`);
        const data = await res.json();
        cachedClientId = data.success && data.data?.googleClientId
            ? String(data.data.googleClientId).trim()
            : '';
    } catch {
        cachedClientId = '';
    }
    if (!cachedClientId) {
        cachedClientId = readMetaClientId();
    }
    return cachedClientId;
}

function loadGoogleSdk() {
    if (document.getElementById('google-jssdk')) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'google-jssdk';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google SDK failed to load'));
        document.head.appendChild(script);
    });
}

function waitForGoogle() {
    return new Promise((resolve) => {
        if (window.google?.accounts?.id) {
            resolve();
            return;
        }
        const timer = setInterval(() => {
            if (window.google?.accounts?.id) {
                clearInterval(timer);
                resolve();
            }
        }, 100);
        setTimeout(() => {
            clearInterval(timer);
            resolve();
        }, 8000);
    });
}

async function handleGoogleCredential(credential, alertEl, onSuccess, intent) {
    try {
        const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: credential, intent })
        });
        const data = await res.json();
        if (data.success && data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('is18Plus', 'true');
            sessionStorage.setItem('valid_entry', 'true');
            if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
            if (typeof onSuccess === 'function') {
                onSuccess(data.user || {}, data);
            }
            return;
        }
        showAlert(alertEl, t(data.error || 'Google login failed'));
    } catch {
        showAlert(alertEl, t('Server connection error'));
    }
}

function clearGoogleMount(mountEl) {
    if (!mountEl) return;
    mountEl.innerHTML = '';
    mountEl.classList.add('hidden');
    mountEl.dataset.googleMounted = '0';
    const divider = mountEl.nextElementSibling;
    if (divider?.classList.contains('google-signin-divider')) {
        divider.classList.add('hidden');
    }
}

function resolveButtonWidth(host, insertBefore) {
    const anchor = host || insertBefore;
    const container = anchor?.closest('form, .card, .reg-page, .landing-login-form, .landing-frame-inner');
    const measured = container?.getBoundingClientRect().width
        || anchor?.getBoundingClientRect().width
        || anchor?.offsetWidth
        || 0;
    if (measured > 48) {
        return Math.min(Math.max(Math.floor(measured - 32), 260), 400);
    }
    return Math.min(Math.max(window.innerWidth - 48, 260), 400);
}

function waitForLayout() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

function hasRenderedGoogleButton(wrapper) {
    return Boolean(wrapper?.querySelector('iframe, div[role="button"]'));
}

/**
 * Mount Google Sign-In above the email field (login or registration).
 * No-op when GOOGLE_CLIENT_ID is not configured on the server.
 */
export async function mountGoogleSignIn({
    mountEl,
    insertBefore,
    alertEl,
    onSuccess,
    width,
    intent = 'login',
    dividerKey = 'or sign in with email'
} = {}) {
    const host = mountEl || null;
    if (!host && !insertBefore) return;

    const clientId = await resolveGoogleClientId();
    if (!clientId) {
        clearGoogleMount(host);
        return;
    }

    if (host?.dataset.googleMounted === '1' && hasRenderedGoogleButton(host.querySelector('.google-signin-wrapper'))) {
        return;
    }
    if (insertBefore?.dataset.googleMounted === '1') {
        const existing = insertBefore.previousElementSibling;
        if (existing?.classList.contains('google-signin-block')
            && hasRenderedGoogleButton(existing.querySelector('.google-signin-wrapper'))) {
            return;
        }
    }

    let block;
    let wrapper;

    if (host) {
        host.dataset.googleMounted = '1';
        host.classList.remove('hidden');
        host.innerHTML = `
            <p class="google-signin-label">${t('Continue with Google')}</p>
            <div class="google-signin-wrapper"></div>
        `;
        wrapper = host.querySelector('.google-signin-wrapper');

        let divider = host.nextElementSibling;
        if (!divider?.classList.contains('google-signin-divider')) {
            divider = document.createElement('p');
            divider.className = 'google-signin-divider';
            host.insertAdjacentElement('afterend', divider);
        }
        divider.textContent = t(dividerKey);
        divider.classList.remove('hidden');
    } else {
        insertBefore.dataset.googleMounted = '1';

        block = document.createElement('div');
        block.className = 'google-signin-block';
        block.innerHTML = `
            <p class="google-signin-label">${t('Continue with Google')}</p>
            <div class="google-signin-wrapper"></div>
            <p class="google-signin-divider">${t(dividerKey)}</p>
        `;
        insertBefore.parentNode.insertBefore(block, insertBefore);
        wrapper = block.querySelector('.google-signin-wrapper');
    }

    try {
        await loadGoogleSdk();
        await waitForGoogle();
        await waitForLayout();
    } catch {
        if (host) clearGoogleMount(host);
        else block?.remove();
        if (insertBefore) insertBefore.dataset.googleMounted = '0';
        return;
    }

    if (!window.google?.accounts?.id) {
        if (host) clearGoogleMount(host);
        else block?.remove();
        if (insertBefore) insertBefore.dataset.googleMounted = '0';
        return;
    }

    const btnWidth = width || resolveButtonWidth(host, insertBefore);

    window.handleGoogleCallback = (response) => {
        handleGoogleCredential(response.credential, alertEl, onSuccess, intent);
    };

    window.google.accounts.id.initialize({
        client_id: clientId,
        callback: window.handleGoogleCallback
    });
    window.google.accounts.id.renderButton(wrapper, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        width: btnWidth,
        text: intent === 'login' ? 'signin_with' : 'continue_with',
        locale: (localStorage.getItem('platform_lang') || 'es') === 'es' ? 'es' : 'en'
    });
}
