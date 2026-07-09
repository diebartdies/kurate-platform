import { API_URL, appPath } from './globals.js';
import { showAlert, attachPasswordToggles } from './uiHelpers.js';
import { t } from './i18n.js';
import { wireAuthFormLabels } from './a11y.js';

let inlinePanel = null;
let activeEmail = '';

function whenDomReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

function revealRecoveryAlert(alertEl) {
    if (!alertEl) return;
    alertEl.classList.remove('hidden');
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function recoveryMarkup() {
    return `
        <div id="passwordRecoveryPanel" class="password-recovery-panel hidden">
            <div id="recoveryStepEmail">
                <p class="recovery-step-text">${t('Confirm your email to receive a recovery code.')}</p>
                <div id="recoveryAlert" class="alert hidden"></div>
                <label for="recoveryEmail">${t('Email Address')}</label>
                <input type="email" id="recoveryEmail" placeholder="${t('Email Address')}" required autocomplete="username">
                <button type="button" id="recoverySendCodeBtn" class="landing-btn landing-btn-login">${t('Send recovery code')}</button>
            </div>
            <div id="recoveryStepReset" class="hidden">
                <p class="recovery-step-text">${t('Recovery code sent to:')}</p>
                <p id="recoveryDisplayEmail" class="gold-text recovery-email-display"></p>
                <input type="hidden" id="recoveryHiddenEmail">
                <label for="recoveryCode">${t('6-Digit Code')}</label>
                <input type="text" id="recoveryCode" placeholder="${t('6-Digit Code')}" required maxlength="6" inputmode="numeric" autocomplete="one-time-code" class="recovery-code-input">
                <label for="recoveryNewPassword">${t('New Password (Min 6 chars)')}</label>
                <input type="password" id="recoveryNewPassword" placeholder="${t('New Password (Min 6 chars)')}" required minlength="6" autocomplete="new-password">
                <label for="recoveryConfirmPassword">${t('Confirm Password')}</label>
                <input type="password" id="recoveryConfirmPassword" placeholder="${t('Confirm Password')}" required minlength="6" autocomplete="new-password">
                <button type="button" id="recoverySubmitBtn" class="landing-btn landing-btn-login">${t('Reset Password')}</button>
                <p class="recovery-resend-row">
                    <button type="button" id="recoveryResendCodeBtn" class="recovery-resend-link">${t('Send new code')}</button>
                </p>
            </div>
            <button type="button" id="recoveryBackToLoginBtn" class="recovery-back-btn">${t('Back to login')}</button>
        </div>
    `;
}

function getLoginShell() {
    return {
        card: document.querySelector('.landing-login-card') || document.getElementById('loginForm')?.closest('.card'),
        loginForm: document.getElementById('loginForm'),
        loginHeading: document.querySelector('.landing-login-heading'),
        loginSub: document.querySelector('.landing-login-sub'),
        forgotBlock: document.querySelector('.landing-forgot'),
        proLinks: document.querySelector('.landing-pro-links'),
        loginAlert: document.getElementById('loginAlert')
    };
}

function hideLoginShell(shell) {
    shell.loginForm?.classList.add('hidden');
    shell.loginHeading?.classList.add('hidden');
    shell.loginSub?.classList.add('hidden');
    shell.forgotBlock?.classList.add('hidden');
    shell.proLinks?.classList.add('hidden');
    shell.loginAlert?.classList.add('hidden');
}

function showLoginShell(shell) {
    shell.loginForm?.classList.remove('hidden');
    shell.loginHeading?.classList.remove('hidden');
    shell.loginSub?.classList.remove('hidden');
    shell.forgotBlock?.classList.remove('hidden');
    shell.proLinks?.classList.remove('hidden');
    inlinePanel?.classList.add('hidden');
    if (shell.loginHeading) shell.loginHeading.textContent = t('Professional Login');
}

function ensureInlinePanel(shell) {
    if (inlinePanel && inlinePanel.isConnected) return inlinePanel;

    shell.card.insertAdjacentHTML('beforeend', recoveryMarkup());
    inlinePanel = document.getElementById('passwordRecoveryPanel');
    wireAuthFormLabels();
    bindInlineRecoveryEvents(shell);
    return inlinePanel;
}

function setStepVisible(el, visible) {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.style.display = visible ? 'block' : 'none';
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function showRecoveryStep(step) {
    const emailStep = document.getElementById('recoveryStepEmail');
    const resetStep = document.getElementById('recoveryStepReset');
    setStepVisible(emailStep, step === 'email');
    setStepVisible(resetStep, step === 'reset');
}

function showRecoverPageStep(step) {
    const forgotForm = document.getElementById('forgotPasswordForm');
    const resetForm = document.getElementById('resetPasswordForm');
    setStepVisible(forgotForm, step === 'email');
    setStepVisible(resetForm, step === 'reset');
}

function updateRecoveryHeading(step) {
    const inlineHeading = document.querySelector('.landing-login-heading');
    const pageHeading = document.querySelector('.password-recovery-page > h2');
    const title = step === 'reset'
        ? t('Enter recovery code')
        : t('Recover Access');
    if (inlineHeading && !inlineHeading.classList.contains('hidden')) {
        inlineHeading.textContent = title;
    }
    if (pageHeading) pageHeading.textContent = title;
}

function advanceToCodeEntryStep(email, alertEl) {
    activeEmail = email;

    const hiddenEmail = document.getElementById('recoveryHiddenEmail');
    const displayEmail = document.getElementById('recoveryDisplayEmail');
    const resetEmail = document.getElementById('resetEmail');
    const pageDisplayEmail = document.getElementById('displayEmail');

    if (hiddenEmail) hiddenEmail.value = email;
    if (displayEmail) displayEmail.textContent = email;
    if (resetEmail) resetEmail.value = email;
    if (pageDisplayEmail) pageDisplayEmail.textContent = email;

    showRecoveryStep('reset');
    showRecoverPageStep('reset');
    updateRecoveryHeading('reset');

    const resetScope = document.getElementById('recoveryStepReset') || document.getElementById('resetPasswordForm');
    attachPasswordToggles(resetScope || document);

    const panel = document.getElementById('passwordRecoveryPanel');
    (panel || resetScope)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window.setTimeout(() => {
        document.getElementById('recoveryCode')?.focus();
        document.getElementById('resetCode')?.focus();
    }, 50);
}

async function sendRecoveryCode(email, alertEl) {
    const res = await fetch(`${API_URL}/auth/forgotpassword`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });

    let data = {};
    try {
        data = await res.json();
    } catch {
        showAlert(alertEl, t('Server connection error'));
        revealRecoveryAlert(alertEl);
        return false;
    }

    if (data.success === true || (res.ok && data.message)) {
        return true;
    }

    showAlert(alertEl, t(data.error || 'Error sending code'));
    revealRecoveryAlert(alertEl);
    return false;
}

async function submitPasswordReset(email, code, password, confirmPassword, alertEl, fieldIds = { password: 'recoveryNewPassword', confirm: 'recoveryConfirmPassword', code: 'recoveryCode' }) {
    if (password !== confirmPassword) {
        showAlert(alertEl, t('Passwords do not match'), true, fieldIds.confirm);
        revealRecoveryAlert(alertEl);
        return { ok: false };
    }
    if (password.length < 6) {
        showAlert(alertEl, t('Password must be at least 6 characters'), true, fieldIds.password);
        revealRecoveryAlert(alertEl);
        return { ok: false };
    }

    const res = await fetch(`${API_URL}/auth/resetpassword`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password })
    });
    let data = {};
    try {
        data = await res.json();
    } catch {
        showAlert(alertEl, t('Server connection error'));
        revealRecoveryAlert(alertEl);
        return { ok: false };
    }
    if (!data.success) {
        if (data.code === 'RESET_CODE_EXPIRED') {
            showExpiredCodePrompt(alertEl, email, fieldIds);
            return { ok: false, code: data.code };
        }
        showAlert(alertEl, t(data.error || 'Reset failed'), true, fieldIds.code);
        revealRecoveryAlert(alertEl);
        return { ok: false, code: data.code };
    }
    return { ok: true };
}

function clearRecoveryCodeFields(fieldIds = { code: 'recoveryCode' }) {
    const codeEl = document.getElementById(fieldIds.code);
    if (codeEl) codeEl.value = '';
}

async function resendRecoveryCode(email, alertEl, fieldIds = { code: 'recoveryCode' }) {
    if (!email) {
        showAlert(alertEl, t('Please provide an email address'));
        revealRecoveryAlert(alertEl);
        return false;
    }
    alertEl?.classList.add('hidden');
    alertEl && (alertEl.textContent = '');

    const ok = await sendRecoveryCode(email, alertEl);
    if (!ok) return false;

    clearRecoveryCodeFields(fieldIds);
    showAlert(alertEl, t('A new recovery code was sent to your email.'), false);
    revealRecoveryAlert(alertEl);
    window.setTimeout(() => {
        document.getElementById(fieldIds.code)?.focus();
    }, 50);
    return true;
}

function showExpiredCodePrompt(alertEl, email, fieldIds = { code: 'recoveryCode' }) {
    if (!alertEl) return;
    alertEl.classList.remove('hidden');
    alertEl.style.color = 'var(--accent-red)';
    alertEl.innerHTML = `
        <p><strong>${t('Your recovery code has expired.')}</strong></p>
        <p style="margin-top:8px;font-size:0.92rem;">${t('Request a new code and we will email it to you.')}</p>
        <div class="recovery-error-actions">
            <button type="button" data-recovery-resend>${t('Send new code')}</button>
        </div>
    `;
    alertEl.querySelector('[data-recovery-resend]')?.addEventListener('click', async () => {
        const btn = alertEl.querySelector('[data-recovery-resend]');
        if (btn) btn.disabled = true;
        try {
            await resendRecoveryCode(email, alertEl, fieldIds);
        } finally {
            if (btn) btn.disabled = false;
        }
    });
    revealRecoveryAlert(alertEl);
}

function bindInlineRecoveryEvents(shell) {
    const panel = document.getElementById('passwordRecoveryPanel');
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';

    document.getElementById('recoverySendCodeBtn')?.addEventListener('click', async () => {
        const emailInput = document.getElementById('recoveryEmail');
        const alertEl = document.getElementById('recoveryAlert');
        const email = emailInput?.value.trim();
        if (!email) {
            showAlert(alertEl, t('Please provide an email address'), true, 'recoveryEmail');
            emailInput?.focus();
            return;
        }
        alertEl?.classList.add('hidden');
        const btn = document.getElementById('recoverySendCodeBtn');
        if (btn) btn.disabled = true;
        try {
            const ok = await sendRecoveryCode(email, alertEl);
            if (ok) advanceToCodeEntryStep(email, alertEl);
        } catch (err) {
            showAlert(alertEl, t('Server connection error'));
            revealRecoveryAlert(alertEl);
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    document.getElementById('recoverySubmitBtn')?.addEventListener('click', async () => {
        const alertEl = document.getElementById('recoveryAlert');
        const email = document.getElementById('recoveryHiddenEmail')?.value.trim() || activeEmail;
        const code = document.getElementById('recoveryCode')?.value.trim();
        const password = document.getElementById('recoveryNewPassword')?.value || '';
        const confirmPassword = document.getElementById('recoveryConfirmPassword')?.value || '';
        alertEl?.classList.add('hidden');

        const btn = document.getElementById('recoverySubmitBtn');
        if (btn) btn.disabled = true;
        try {
            const result = await submitPasswordReset(email, code, password, confirmPassword, alertEl);
            if (result.ok) {
                showAlert(alertEl, t('Password reset successful!'), false);
                setTimeout(() => closeInlinePasswordRecovery(), 1800);
            }
        } catch (err) {
            showAlert(alertEl, t('Server connection error'));
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    document.getElementById('recoveryBackToLoginBtn')?.addEventListener('click', () => {
        closeInlinePasswordRecovery();
    });

    document.getElementById('recoveryResendCodeBtn')?.addEventListener('click', async () => {
        const alertEl = document.getElementById('recoveryAlert');
        const email = document.getElementById('recoveryHiddenEmail')?.value.trim() || activeEmail;
        const btn = document.getElementById('recoveryResendCodeBtn');
        if (btn) btn.disabled = true;
        try {
            await resendRecoveryCode(email, alertEl);
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}

export function openInlinePasswordRecovery(prefillEmail = '') {
    const shell = getLoginShell();
    if (!shell.card) {
        const q = prefillEmail ? `?email=${encodeURIComponent(prefillEmail)}` : '';
        window.location.href = appPath(`recover.html${q}`);
        return;
    }

    ensureInlinePanel(shell);
    hideLoginShell(shell);

    if (shell.loginHeading) shell.loginHeading.textContent = t('Recover Access');
    shell.loginHeading?.classList.remove('hidden');

    inlinePanel.classList.remove('hidden');
    inlinePanel.style.display = 'block';
    showRecoveryStep('email');
    showRecoverPageStep('email');
    updateRecoveryHeading('email');

    const emailInput = document.getElementById('recoveryEmail');
    const alertEl = document.getElementById('recoveryAlert');
    alertEl?.classList.add('hidden');
    alertEl && (alertEl.textContent = '');

    if (emailInput) {
        emailInput.value = prefillEmail || document.getElementById('email')?.value.trim() || '';
        emailInput.focus();
        if (emailInput.value) emailInput.select();
    }

    ['recoveryCode', 'recoveryNewPassword', 'recoveryConfirmPassword'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

export function closeInlinePasswordRecovery() {
    const shell = getLoginShell();
    showLoginShell(shell);
    if (inlinePanel) {
        inlinePanel.remove();
        inlinePanel = null;
    }
    activeEmail = '';
}

export function initRecoverPage() {
    const forgotForm = document.getElementById('forgotPasswordForm');
    const resetForm = document.getElementById('resetPasswordForm');
    if (!forgotForm && !resetForm) return;
    if (document.body.dataset.recoverBound === '1') return;
    document.body.dataset.recoverBound = '1';
    wireAuthFormLabels();

    const params = new URLSearchParams(window.location.search);
    const emailFromUrl = params.get('email');
    const forgotEmail = document.getElementById('forgotEmail');
    if (forgotEmail && emailFromUrl) forgotEmail.value = emailFromUrl;

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail')?.value.trim();
        const alert = document.getElementById('forgotAlert');
        if (!email) {
            showAlert(alert, t('Please provide an email address'), true, 'forgotEmail');
            revealRecoveryAlert(alert);
            return;
        }
        alert?.classList.add('hidden');
        const submitBtn = forgotForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const ok = await sendRecoveryCode(email, alert);
            if (ok) advanceToCodeEntryStep(email, alert);
        } catch (err) {
            showAlert(alert, t('Server connection error'));
            revealRecoveryAlert(alert);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    };

    forgotForm?.addEventListener('submit', handleForgotSubmit);

    resetForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('resetEmail')?.value.trim();
        const code = document.getElementById('resetCode')?.value.trim();
        const password = document.getElementById('resetNewPassword')?.value || '';
        const confirmPassword = document.getElementById('resetConfirmPassword')?.value || '';
        const alert = document.getElementById('resetAlert');

        try {
            const result = await submitPasswordReset(email, code, password, confirmPassword, alert, {
                password: 'resetNewPassword',
                confirm: 'resetConfirmPassword',
                code: 'resetCode'
            });
            if (result.ok) {
                showAlert(alert, t('Password reset successful!'), false);
                setTimeout(() => { window.location.href = appPath('index.html'); }, 2000);
            }
        } catch (err) {
            showAlert(alert, t('Server connection error'));
            revealRecoveryAlert(alert);
        }
    });

    document.getElementById('recoveryResendPageBtn')?.addEventListener('click', async () => {
        const email = document.getElementById('resetEmail')?.value.trim() || activeEmail;
        const alert = document.getElementById('resetAlert');
        const btn = document.getElementById('recoveryResendPageBtn');
        if (btn) btn.disabled = true;
        try {
            await resendRecoveryCode(email, alert, { code: 'resetCode' });
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    attachPasswordToggles(resetForm || document);
}

export function bindForgotPasswordTriggers() {
    document.querySelectorAll('[data-open-password-recovery]').forEach((el) => {
        if (el.dataset.recoveryTriggerBound === '1') return;
        el.dataset.recoveryTriggerBound = '1';
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const email = document.getElementById('email')?.value.trim()
                || document.getElementById('forgotEmail')?.value.trim()
                || '';
            openInlinePasswordRecovery(email);
        });
    });
}

whenDomReady(() => {
    if (document.getElementById('forgotPasswordForm') || document.getElementById('resetPasswordForm')) {
        initRecoverPage();
    }
});
