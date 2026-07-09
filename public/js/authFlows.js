import { API_URL, BASE_ORIGIN, appPath } from './globals.js';
import { showAlert } from './uiHelpers.js';
import { announceMessage, wireAuthFormLabels } from './a11y.js';
import { t, applyStaticTranslations } from './i18n.js';
import { openInlinePasswordRecovery, initRecoverPage, bindForgotPasswordTriggers } from './passwordRecovery.js';
import { pushReturnPoint, logoutToEntrance } from './navReturn.js';
import { needsProfessionalCategorySetup } from './professionalSetup.js';
import { mountGoogleSignIn } from './googleAuth.js';

function whenDomReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

function revealLoginAlert(alert) {
    if (!alert) return;
    alert.classList.remove('hidden');
    alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cacheAdminCertWarnings(warnings) {
    if (!Array.isArray(warnings) || warnings.length === 0) return;
    try {
        sessionStorage.setItem('admin_cert_expiry_warnings', JSON.stringify(warnings));
    } catch (err) {
        console.warn('[Login] Could not cache admin cert warnings:', err);
    }
}

export function redirectAfterLogin(user = {}) {
    let intended = sessionStorage.getItem('intended_destination');
    sessionStorage.removeItem('intended_destination');

    // Admins always land on their dashboard, regardless of any intended destination.
    if (user.role === 'admin') {
        window.location.replace(appPath('dashboard.html'));
        return;
    }

    if (intended && intended.includes('dashboard.html') && user.role === 'user') {
        intended = null;
    }

    if (intended) {
        window.location.replace(intended);
    } else if (user.role === 'professional') {
        if (user.allowResubmission || user.firstApprovedLogin || needsProfessionalCategorySetup(user)) {
            window.location.replace(appPath('profDashboard.html'));
        } else if (user.professionalProfile?.alias) {
            window.location.replace('/perfil/' + encodeURIComponent(user.professionalProfile.alias));
        } else {
            window.location.replace(appPath('profDashboard.html'));
        }
    } else if (user.role === 'admin') {
        window.location.replace(appPath('dashboard.html'));
    } else {
        window.location.replace(appPath('categories.html'));
    }
}

function showLoginFailure(alert, data, email) {
    if (!alert) return;

    alert.classList.remove('hidden');
    alert.style.color = 'var(--accent-red)';

    if (data.code === 'USER_NOT_FOUND') {
        alert.innerHTML = `
            <p><strong>${t('No account found with this email address.')}</strong></p>
            <p style="margin-top:8px;font-size:0.92rem;">${t('Did you mistype your email? Check it and try again, or register as a model.')}</p>
            <div class="login-error-actions">
                <button type="button" data-login-retry="email">${t('Try again')}</button>
                <a href="${appPath('register.html')}">${t('Professional Registration')}</a>
            </div>
        `;
        alert.querySelector('[data-login-retry="email"]')?.addEventListener('click', () => {
            alert.classList.add('hidden');
            alert.textContent = '';
            const emailInput = document.getElementById('email');
            if (emailInput) {
                emailInput.focus();
                emailInput.select();
            }
        });
        return;
    }

    if (data.code === 'INVALID_PASSWORD') {
        alert.innerHTML = `
            <p><strong>${t('Incorrect password. Please try again.')}</strong></p>
            <div class="login-error-actions">
                <button type="button" data-login-retry="password">${t('Try again')}</button>
                <button type="button" data-login-forgot>${t('I forgot my password')}</button>
            </div>
        `;
        alert.querySelector('[data-login-retry="password"]')?.addEventListener('click', () => {
            alert.classList.add('hidden');
            alert.textContent = '';
            const passwordInput = document.getElementById('password');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        });
        alert.querySelector('[data-login-forgot]')?.addEventListener('click', () => {
            const email = document.getElementById('email')?.value.trim() || '';
            alert.classList.add('hidden');
            openInlinePasswordRecovery(email);
        });
        return;
    }

    showAlert(alert, t(data.error || 'Access Denied'));
    revealLoginAlert(alert);
}

async function submitLoginForm(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    const alert = document.getElementById('loginAlert');
    const submitBtn = form?.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn?.textContent;

    if (!email || !password) {
        showAlert(alert, t('Please provide an email and password'), true, !email ? 'email' : 'password');
        revealLoginAlert(alert);
        return;
    }

    if (alert) {
        alert.textContent = '';
        alert.innerHTML = '';
        alert.classList.add('hidden');
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t('Submitting...');
    }

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        let data;
        try {
            data = await res.json();
        } catch {
            showAlert(alert, t('Server connection error'));
            revealLoginAlert(alert);
            return;
        }

        if (data.success && data.token) {
            try {
                localStorage.setItem('token', data.token);
                localStorage.setItem('is18Plus', 'true');
                sessionStorage.setItem('valid_entry', 'true');
                if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
                if (data.user?.role === 'admin') cacheAdminCertWarnings(data.certExpiryWarnings);
            } catch (storageErr) {
                console.warn('[Login] Storage unavailable:', storageErr);
            }
            redirectAfterLogin(data.user || {});
            return;
        }

        if (data.error && String(data.error).toLowerCase().includes('verify your email')) {
            window.location.href = `${appPath('verify.html')}?email=${encodeURIComponent(email)}`;
            return;
        }

        showLoginFailure(alert, data, email);
        revealLoginAlert(alert);
    } catch (err) {
        console.error('[Login]', err);
        showAlert(alert, t('Server connection error'));
        revealLoginAlert(alert);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText || t('Enter Sanctuary');
        }
    }
}

function bindLoginFormOnce() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm || loginForm.dataset.authBound === '1') return;
    loginForm.dataset.authBound = '1';
    loginForm.addEventListener('submit', submitLoginForm);
}

const LANDING_ENTER_LABEL = ' ';

export function resetLandingEnterButton() {
    const btn = document.getElementById('btn-enter');
    if (!btn) return;
    btn.textContent = t(LANDING_ENTER_LABEL);
    btn.style.pointerEvents = '';
    btn.style.opacity = '';
    btn.disabled = false;
}

function handleAgeGateEnter(btn) {
    if (window.location.protocol === 'file:') {
        announceMessage(`ERROR: You must open the site via a local server (e.g., ${BASE_ORIGIN}). The buttons will not work if you double-click the HTML file!`);
        return;
    }

    btn.disabled = true;
    btn.textContent = t('');
    btn.style.opacity = '0.7';

    try {
        localStorage.setItem('is18Plus', 'true');
        sessionStorage.setItem('ancestor_code', 'index.html');
        sessionStorage.setItem('valid_entry', 'true');
    } catch (err) {
        console.warn('[Age gate] Storage unavailable:', err);
    }

    const intended = sessionStorage.getItem('intended_destination');
    let targetUrl = appPath('categories.html');
    let cachedUser = null;
    try { cachedUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { /* ignore */ }
    if (cachedUser && cachedUser.role === 'admin') {
        // A logged-in admin entering through the age gate goes straight to their home.
        sessionStorage.removeItem('intended_destination');
        targetUrl = appPath('dashboard.html');
    } else if (intended) {
        sessionStorage.removeItem('intended_destination');
        targetUrl = intended;
    }

    try {
        pushReturnPoint();
    } catch (err) {
        console.warn('[Age gate] Could not save return point:', err);
    }

    window.location.assign(targetUrl);
}

function bindAgeGateButtons() {
    const enterBtn = document.getElementById('btn-enter');
    const exitBtn = document.getElementById('btn-exit');

    if (enterBtn && enterBtn.dataset.bound !== '1') {
        enterBtn.dataset.bound = '1';
        enterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleAgeGateEnter(enterBtn);
        });
    }

    if (exitBtn && exitBtn.dataset.bound !== '1') {
        exitBtn.dataset.bound = '1';
        exitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'https://www.google.com';
        });
    }
}

export function setupLandingPageAgeGate() {
    window.addEventListener('pageshow', () => {
        const landing = document.getElementById('landing');
        const platformDetails = document.getElementById('platformDetails');

        if (landing) {
            document.documentElement.classList.remove('page-pending');
            resetLandingEnterButton();
            applyStaticTranslations(landing);
        }
        if (platformDetails) {
            applyStaticTranslations(platformDetails);
        }
    });

    whenDomReady(() => {
        if (!document.getElementById('landing')) return;
        bindAgeGateButtons();
    });
}

export function initAuthForms() {
    whenDomReady(() => {
        wireAuthFormLabels();
        bindLoginFormOnce();

        const loginForm = document.getElementById('loginForm');
        const isDedicatedLoginPage = window.location.pathname.endsWith('login.html');

        if (loginForm && isDedicatedLoginPage) {
            const blogReminder = document.createElement('div');
            blogReminder.innerHTML = `
                <p style="text-align: center; color: var(--primary-gold); background-color: rgba(212, 175, 55, 0.1); padding: 10px; border-radius: 4px; border: 1px solid var(--primary-gold); margin-bottom: 20px;">
                    <strong>${t('Coming Soon:')}</strong> ${t('Users will be able to post their experiences on our new community blog!')}
                </p>
            `;
            loginForm.parentNode.insertBefore(blogReminder, loginForm);

            mountGoogleSignIn({
                mountEl: document.getElementById('loginGoogleMount'),
                alertEl: document.getElementById('loginAlert'),
                onSuccess: redirectAfterLogin,
                intent: 'login',
                dividerKey: 'or sign in with email'
            });
        }

        document.getElementById('landingFocusLogin')?.addEventListener('click', () => {
            document.getElementById('email')?.focus();
        });

        bindForgotPasswordTriggers();
        initRecoverPage();
    });
}

// Register — handled in registerProfessional.js

// Verify
async function resendVerificationCode(email, alertEl) {
    const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    let data = {};
    try {
        data = await res.json();
    } catch {
        showAlert(alertEl, t('Server connection error'));
        return false;
    }
    if (!data.success) {
        if (data.code === 'REGISTRATION_NOT_FOUND') {
            showAlert(alertEl, t('No pending registration found. Please register again.'), true);
            return false;
        }
        showAlert(alertEl, t(data.error || 'Could not send email right now. Please try again in a few minutes.'));
        return false;
    }
    showAlert(alertEl, t('Verification code sent. Please check your inbox and spam folder.'), false);
    const codeEl = document.getElementById('verifyCode');
    if (codeEl) codeEl.value = '';
    codeEl?.focus();
    return true;
}

function showExpiredVerifyPrompt(alertEl, email) {
    if (!alertEl) return;
    alertEl.classList.remove('hidden');
    alertEl.style.color = 'var(--accent-red)';
    alertEl.innerHTML = `
        <p><strong>${t('Your verification code has expired.')}</strong></p>
        <p style="margin-top:8px;font-size:0.92rem;">${t('This registration was removed. Please sign up again.')}</p>
        <div class="recovery-error-actions">
            <a href="${appPath('register.html')}">${t('Register again')}</a>
        </div>
    `;
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const verifyForm = document.getElementById('verifyForm');
if (verifyForm) {
    // Extract email from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const emailFromUrl = urlParams.get('email');
    const emailInput = document.getElementById('verifyEmail');

    // Auto-fill the email input if it exists and we have it in the URL
    if (emailInput && emailFromUrl) {
        emailInput.value = emailFromUrl;
    }

    if (urlParams.get('emailWarning') === '1') {
        const alert = document.getElementById('verifyAlert');
        showAlert(
            alert,
            t('We could not send the verification email. Check spam/junk or tap "Send new code" below.'),
            true
        );
    }

    document.getElementById('verifyResendBtn')?.addEventListener('click', async () => {
        const alert = document.getElementById('verifyAlert');
        const email = (emailInput && emailInput.value.trim()) || emailFromUrl || '';
        if (!email) {
            showAlert(alert, t('Please provide an email address'), true);
            return;
        }
        const btn = document.getElementById('verifyResendBtn');
        if (btn) btn.disabled = true;
        try {
            await resendVerificationCode(email, alert);
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Use the input value if it exists, otherwise fall back to the URL parameter
        const email = (emailInput && emailInput.value) ? emailInput.value.trim() : new URLSearchParams(window.location.search).get('email');
        const code = document.getElementById('verifyCode') ? document.getElementById('verifyCode').value : '';
        const alert = document.getElementById('verifyAlert');

        try {
            const res = await fetch(`${API_URL}/auth/verify-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('is18Plus', 'true');
                sessionStorage.setItem('valid_entry', 'true');
                if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
                
                let intended = sessionStorage.getItem('intended_destination');
                sessionStorage.removeItem('intended_destination');

                // Admins always land on their dashboard, regardless of intended destination.
                if (data.user.role === 'admin') {
                    window.location.replace(appPath('dashboard.html'));
                    return;
                }

                // Prevent regular users from being forced into the dashboard by a stale intended_destination
                if (intended && intended.includes('dashboard.html') && data.user.role === 'user') {
                    intended = null;
                }

                if (intended) {
                    window.location.replace(intended);
                } else if (data.user.role === 'professional') {
                    if (needsProfessionalCategorySetup(data.user)) {
                        window.location.replace(appPath('profDashboard.html'));
                    } else if (data.user.professionalProfile?.alias) {
                        window.location.replace('/perfil/' + encodeURIComponent(data.user.professionalProfile.alias));
                    } else {
                        window.location.replace(appPath('profDashboard.html'));
                    }
                } else if (data.user.role === 'admin') {
                    window.location.replace('/dashboard.html');
                } else {
                    window.location.replace('/categories.html');
                }
            } else if (data.code === 'VERIFY_CODE_EXPIRED') {
                showExpiredVerifyPrompt(alert, email);
            } else {
                showAlert(alert, t(data.error || 'Invalid code'), true, 'verifyCode');
            }
        } catch (err) {
            showAlert(alert, 'Server connection error');
        }
    });
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            if (token) {
                await fetch(`${API_URL}/auth/logout`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${token}`
                    },
                    credentials: 'include'
                });
            }
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('is18Plus');
            logoutToEntrance();
        }
    });
}
