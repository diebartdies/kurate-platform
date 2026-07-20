import { API_URL, appPath } from './globals.js';
import { showAlert, attachPasswordToggles } from './uiHelpers.js';
import { t, applyStaticTranslations } from './i18n.js';
import { confirmDialog, wireFormLabel, setFieldInvalid } from './a11y.js';
import { navigateWithReturn } from './navReturn.js';
import { PHONE_COUNTRIES, defaultPhoneCountry, buildFullPhoneNumber, getPhoneCountryFlagUrl, getPhoneCountryName } from './phoneCountryCodes.js';
import { mountGoogleSignIn } from './googleAuth.js';
import { redirectAfterLogin } from './authFlows.js';

function isInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /WhatsApp|Instagram|FBAN|FBAV|Line\//i.test(ua);
}

function showInAppBrowserTipIfNeeded() {
    const tip = document.getElementById('regInAppBrowserTip');
    if (!tip || tip.dataset.bound === '1') return;
    if (!isInAppBrowser()) return;
    tip.dataset.bound = '1';
    tip.classList.remove('hidden');
    tip.textContent = t('For Google sign-in, open this page in Chrome or Safari (WhatsApp browser often blocks it). Use the menu ⋮ → Open in browser.');
}

function markGoogleProfileCompletionPending() {
    sessionStorage.setItem('reg_google_pending_complete', '1');
}

function clearGoogleProfileCompletionPending() {
    sessionStorage.removeItem('reg_google_pending_complete');
}

function isGoogleProfileCompletionPending() {
    return sessionStorage.getItem('reg_google_pending_complete') === '1';
}

function isAdminSession() {
    try {
        const raw = localStorage.getItem('user');
        if (!raw) return false;
        return JSON.parse(raw)?.role === 'admin';
    } catch {
        return false;
    }
}

function registrationTrackingPayload(extra = {}) {
    const form = document.getElementById('registerForm');
    return {
        hadFormData: registrationFormHasChanges(form),
        ...extra
    };
}

function revealRegisterAlert(alert) {
    if (!alert) return;
    alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function redirectToLogin(email, message) {
    const alert = document.getElementById('registerAlert');
    const trimmed = String(email || '').trim();
    const q = trimmed ? `?email=${encodeURIComponent(trimmed)}` : '';
    const destination = appPath(`login.html${q}`);

    if (message && alert) {
        showAlert(alert, message, false);
        revealRegisterAlert(alert);
        window.setTimeout(() => {
            window.location.href = destination;
        }, 1400);
        return;
    }
    window.location.href = destination;
}

async function getEmailRegistrationStatus(email) {
    const trimmed = String(email || '').trim().toLowerCase();
    if (!trimmed || !/.+@.+\..+/.test(trimmed)) return null;
    try {
        const res = await fetch(`${API_URL}/auth/check-email?email=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        return data.success ? data.data : null;
    } catch {
        return null;
    }
}

async function isEmailAlreadyRegistered(email) {
    const status = await getEmailRegistrationStatus(email);
    // Verified professionals/admins block registration; verified guests may upgrade
    return Boolean(status?.registered);
}

function goToVerifyPage(email, alert, submitBtn, successMessage) {
    showAlert(alert, successMessage, false);
    revealRegisterAlert(alert);
    if (submitBtn) submitBtn.textContent = t('Registration saved');
    window.setTimeout(() => {
        window.location.href = `${appPath('verify.html')}?email=${encodeURIComponent(email)}`;
    }, 1200);
}

function setupEmailExistsGuard() {
    const emailEl = document.getElementById('regEmail');
    if (!emailEl || emailEl.dataset.regEmailGuard === '1') return;
    emailEl.dataset.regEmailGuard = '1';
    emailEl.addEventListener('blur', async () => {
        const email = emailEl.value.trim();
        if (!email) return;
        try {
            if (await isEmailAlreadyRegistered(email)) {
                redirectToLogin(email);
            }
        } catch {
            /* network error — submit will re-check */
        }
    });
}

function trackRegistrationEvent(event, extra = {}) {
    if (isAdminSession()) return;
    fetch(`${API_URL}/public/registration-track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ event, ...registrationTrackingPayload(extra) })
    }).catch(() => {});
}

function trackRegistrationAbandon(reason) {
    trackRegistrationEvent('abandon', { reason });
}

function getRegistrationLocale() {
    return (localStorage.getItem('platform_lang') || 'es') === 'es' ? 'es-AR' : 'en-US';
}

function isSpanishLocale() {
    return getRegistrationLocale() === 'es-AR';
}

function birthDatePlaceholder() {
    return isSpanishLocale() ? 'dd/mm/aaaa' : 'mm/dd/yyyy';
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function isoFromParts(year, month, day) {
    if (!year || !month || !day) return '';
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    const iso = `${year}-${pad2(month)}-${pad2(day)}`;
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) return '';
    return iso;
}

function parseDisplayBirthDate(str) {
    const raw = String(str || '').trim();
    if (!raw) return '';
    const parts = raw.split(/[/.\\-]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length !== 3) return '';
    let day;
    let month;
    let year = Number(parts[2]);
    if (parts[2].length === 2) year += year >= 50 ? 1900 : 2000;
    if (isSpanishLocale()) {
        day = Number(parts[0]);
        month = Number(parts[1]);
    } else {
        month = Number(parts[0]);
        day = Number(parts[1]);
    }
    return isoFromParts(year, month, day);
}

function formatDisplayBirthDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return '';
    const [, y, mo, d] = m;
    return isSpanishLocale() ? `${d}/${mo}/${y}` : `${mo}/${d}/${y}`;
}

function getBirthDateIsoValue() {
    const textEl = document.getElementById('regBirthDate');
    const nativeEl = document.getElementById('regBirthDateNative');
    const fromText = parseDisplayBirthDate(textEl?.value);
    if (fromText) return fromText;
    return nativeEl?.value || '';
}

function highlightField(el, on = true) {
    if (!el) return;
    el.classList.toggle('reg-field-error', on);
    setFieldInvalid(el, on, document.getElementById('registerAlert'));
    if (on) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
    }
}

function clearFieldErrors(form) {
    form.querySelectorAll('.reg-field-error').forEach((el) => {
        el.classList.remove('reg-field-error');
        setFieldInvalid(el, false, document.getElementById('registerAlert'));
    });
}

function setRegLabel(forId, key, required = false) {
    wireFormLabel(forId, key, required);
}

function registrationFormHasChanges(form) {
    if (!form) return false;
    const fields = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    for (const el of fields) {
        if (String(el.value || '').trim()) return true;
    }
    return false;
}

function confirmLeaveRegistration(form) {
    if (!registrationFormHasChanges(form)) return Promise.resolve(true);
    return confirmDialog(t('Registration is not finished. If you leave now, your changes will be lost. Continue?'));
}

function goToRegistrationEntrance() {
    sessionStorage.setItem('ancestor_code', 'index.html');
    window.location.href = appPath('index.html');
}

let currentRegistrationType = null;

function getRegistrationTypeFromUrl() {
    const type = new URLSearchParams(window.location.search).get('type');
    if (type === 'guest') return 'guest';
    return 'professional';
}

function isGuestRegistrationType() {
    return currentRegistrationType === 'guest';
}

function setRegistrationFormFieldsRequired(type) {
    const guestAlias = document.getElementById('regGuestAlias');
    if (guestAlias) guestAlias.required = false;
    ['regMobilePhone', 'regBirthDate', 'regPassword', 'regPasswordConfirm'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.required = type === 'professional';
    });
}

function showRegistrationForm(type) {
    currentRegistrationType = type;
    document.getElementById('regFormPanel')?.classList.remove('hidden');
    document.getElementById('regRole').value = type === 'guest' ? 'user' : 'professional';
    document.getElementById('regRegistrationMode').value = type === 'guest' ? 'guest' : 'express';

    document.querySelectorAll('.reg-pro-only').forEach((el) => {
        el.classList.toggle('hidden', type === 'guest');
    });
    document.querySelectorAll('.reg-guest-only').forEach((el) => {
        el.classList.toggle('hidden', type !== 'guest');
    });

    setRegistrationFormFieldsRequired(type);
    applyRegistrationPageLabels(type);
    setupInstructions(type);
    bindRegistrationFooterLinks();
    setupEmailExistsGuard();

    mountGoogleSignIn({
        mountEl: document.getElementById('regGoogleMount'),
        alertEl: document.getElementById('registerAlert'),
        onSuccess: handleGoogleRegistrationSuccess,
        intent: type === 'guest' ? 'guest' : 'professional',
        dividerKey: 'or register with email'
    });

    showInAppBrowserTipIfNeeded();

    if (!isAdminSession() && !sessionStorage.getItem('regVisitTracked')) {
        sessionStorage.setItem('regVisitTracked', '1');
        trackRegistrationEvent('visit', { registrationType: type });
    }
}

function initRegistrationRoute() {
    showRegistrationForm(getRegistrationTypeFromUrl());
}

function leaveRegistration(onLeave, reason = 'leave') {
    const form = document.getElementById('registerForm');
    confirmLeaveRegistration(form).then((ok) => {
        if (!ok) return;
        trackRegistrationAbandon(reason);
        if (typeof onLeave === 'function') {
            onLeave();
            return;
        }
        goToRegistrationEntrance();
    });
}

function bindRegistrationFooterLinks() {
    const loginLink = document.getElementById('regLoginLink');
    if (loginLink && !loginLink.dataset.regLeaveBound) {
        loginLink.dataset.regLeaveBound = '1';
        loginLink.addEventListener('click', () => {
            leaveRegistration(() => {
                navigateWithReturn(appPath('login.html'));
            }, 'login_link');
        });
    }

    const backOrigin = document.getElementById('regBackOrigin');
    if (backOrigin && !backOrigin.dataset.regLeaveBound) {
        backOrigin.dataset.regLeaveBound = '1';
        backOrigin.addEventListener('click', () => leaveRegistration(undefined, 'back_footer'));
    }
}

function setupRegistrationLeaveGuard(form) {
    const backBtn = document.getElementById('regBackToEntrance');
    if (backBtn) {
        backBtn.textContent = `\u2190 ${t('Back to entrance')}`;
        backBtn.onclick = () => leaveRegistration(undefined, 'back_to_entrance');
    }

    const topBack = document.querySelector('.left-group-back');
    if (topBack && !topBack.dataset.regLeaveBound) {
        topBack.dataset.regLeaveBound = '1';
        topBack.onclick = () => leaveRegistration(undefined, 'top_back');
    }

    const brandLogo = document.querySelector('.brand-logo');
    if (brandLogo && !brandLogo.dataset.regLeaveBound) {
        brandLogo.dataset.regLeaveBound = '1';
        brandLogo.addEventListener('click', (e) => {
            e.preventDefault();
            leaveRegistration(undefined, 'brand_logo');
        });
    }
}

function applyRegistrationPageLabels(type = currentRegistrationType || 'professional') {
    const main = document.getElementById('registerMain');
    if (!main) return;

    const isGuest = type === 'guest';
    document.title = `KuraTe - ${t(isGuest ? 'Guest registration' : 'Professional Registration')}`;

    const h1 = document.getElementById('regFormTitle') || main.querySelector('#regFormPanel > h1');
    if (h1) h1.textContent = t(isGuest ? 'Guest registration' : 'Professional Registration');

    const intro = document.getElementById('regFormIntro') || main.querySelector('#regFormPanel > p');
    if (intro) {
        intro.textContent = t(isGuest
            ? 'Email only — optional display name. Confirm your email to browse.'
            : 'Create your model profile — first time only. If you already have an account, use Login.');
    }

    const noPayNote = document.getElementById('regNoPaymentNote');
    if (noPayNote) {
        noPayNote.textContent = t('We never ask you to register a payment method — no card, no automatic debit.');
    }

    setRegLabel('regEmail', 'Email', true);
    setRegLabel('regGuestAlias', 'Display name (alias)', false);
    setRegLabel('regMobilePhone', 'Mobile phone', true);
    setRegLabel('regBirthDate', 'Birth date', true);
    setRegLabel('regPassword', 'Password (min 6)', true);
    setRegLabel('regPasswordConfirm', 'Confirm password', true);

    const backBtn = document.getElementById('regBackToEntrance');
    if (backBtn) backBtn.textContent = `\u2190 ${t('Back to account type')}`;

    const submitBtn = document.querySelector('#registerForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = t(isGuest ? 'Create guest account' : 'Submit Registration');

    const footer = main.querySelector('.card > p:last-of-type');
    if (footer) {
        footer.setAttribute('data-skip-nav-return', '1');
        footer.innerHTML = `${t('Already registered?')} <button type="button" id="regLoginLink" class="reg-inline-link">${t('Login here')}</button> &nbsp;|&nbsp; <button type="button" id="regBackOrigin" class="reg-inline-link muted">${t('Back')}</button>`;
    }

    const guestHint = main.querySelector('#regGuestAlias + .reg-hint');
    if (guestHint) guestHint.textContent = t('Optional — how you appear as a guest. Leave blank to use your email name.');

    const phoneHint = main.querySelector('#regMobilePhone + .reg-hint');
    if (phoneHint) phoneHint.textContent = t('WhatsApp number — we will contact you here to finish your profile.');

    const passHint = main.querySelector('#regPassword + .reg-hint');
    if (passHint) passHint.textContent = t('To sign in to your panel after email verification.');

    const birthHint = document.getElementById('regBirthDateHint');
    if (birthHint) birthHint.textContent = t('We calculate your age automatically — you must be 18 or older.');
}

function formatBirthDateInput(raw) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function setupBirthDateField() {
    const textInput = document.getElementById('regBirthDate');
    const nativeInput = document.getElementById('regBirthDateNative');
    const pickerBtn = document.getElementById('regBirthDatePickerBtn');
    const hint = document.getElementById('regBirthDateHint');
    if (!textInput || !nativeInput) return;

    textInput.readOnly = false;
    textInput.removeAttribute('readonly');

    const lang = getRegistrationLocale();
    document.documentElement.lang = lang;
    textInput.lang = lang;
    nativeInput.lang = lang;
    textInput.placeholder = birthDatePlaceholder();
    textInput.setAttribute('aria-describedby', 'regBirthDateHint');
    textInput.setAttribute('inputmode', 'text');
    if (pickerBtn) pickerBtn.setAttribute('aria-label', t('Open calendar'));
    if (hint) {
        hint.textContent = isSpanishLocale()
            ? t('Format: dd/mm/aaaa. We calculate your age automatically — you must be 18 or older.')
            : t('Format: mm/dd/yyyy. We calculate your age automatically — you must be 18 or older.');
    }

    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() - 18);
    nativeInput.max = maxDate.toISOString().slice(0, 10);

    const syncTextFromNative = () => {
        if (!nativeInput.value) return;
        textInput.value = formatDisplayBirthDate(nativeInput.value);
        textInput.classList.remove('reg-field-error');
    };

    const syncNativeFromText = () => {
        const iso = parseDisplayBirthDate(textInput.value);
        if (iso) {
            nativeInput.value = iso;
            textInput.value = formatDisplayBirthDate(iso);
        }
        return iso;
    };

    const openPicker = () => {
        syncNativeFromText();
        try {
            if (typeof nativeInput.showPicker === 'function') {
                nativeInput.showPicker();
                return;
            }
        } catch (_) {
            /* fall through */
        }
        nativeInput.focus({ preventScroll: true });
        nativeInput.click();
    };

    pickerBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        openPicker();
    });
    nativeInput.addEventListener('change', syncTextFromNative);
    nativeInput.addEventListener('input', syncTextFromNative);

    textInput.addEventListener('input', () => {
        const formatted = formatBirthDateInput(textInput.value);
        if (formatted !== textInput.value) {
            textInput.value = formatted;
            textInput.setSelectionRange(formatted.length, formatted.length);
        }
        textInput.classList.remove('reg-field-error');
        const iso = parseDisplayBirthDate(textInput.value);
        if (iso) nativeInput.value = iso;
    });

    textInput.addEventListener('blur', () => {
        syncNativeFromText();
    });
}

function setupPhoneCountrySelect() {
    const menu = document.getElementById('regCountryMenu');
    const btn = document.getElementById('regCountryBtn');
    const hiddenDial = document.getElementById('regPhoneDial');
    const codeEl = document.getElementById('regCountryCode');
    const flagImg = document.getElementById('regCountryFlagImg');
    if (!menu || !btn || !hiddenDial) return;

    let selected = defaultPhoneCountry();
    const lang = () => (localStorage.getItem('platform_lang') || 'es');

    const renderMenu = () => {
        menu.innerHTML = PHONE_COUNTRIES.map((c) => `
            <li class="reg-country-option" role="option" data-dial="${c.dial}" data-iso="${c.iso}" aria-selected="${c.iso === selected.iso ? 'true' : 'false'}">
                <span class="reg-country-option-dial">${c.dial}</span>
                <span class="reg-country-option-name">${getPhoneCountryName(c, lang())}</span>
            </li>`).join('');

        menu.querySelectorAll('.reg-country-option').forEach((opt) => {
            opt.addEventListener('click', () => {
                const iso = opt.getAttribute('data-iso');
                selected = PHONE_COUNTRIES.find((c) => c.iso === iso) || selected;
                menu.querySelectorAll('.reg-country-option').forEach((o) => {
                    o.setAttribute('aria-selected', o.getAttribute('data-iso') === selected.iso ? 'true' : 'false');
                });
                renderSelected();
                closeMenu();
            });
        });
    };

    const renderSelected = () => {
        hiddenDial.value = selected.dial;
        if (codeEl) codeEl.textContent = selected.dial;
        if (flagImg) {
            flagImg.src = getPhoneCountryFlagUrl(selected.iso);
            flagImg.alt = getPhoneCountryName(selected, lang());
        }
        btn.setAttribute('aria-label', `${t('Country code')} ${getPhoneCountryName(selected, lang())} ${selected.dial}`);
    };

    const closeMenu = () => {
        menu.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.classList.contains('hidden');
        if (open) {
            menu.classList.remove('hidden');
            btn.setAttribute('aria-expanded', 'true');
        } else {
            closeMenu();
        }
    });

    document.addEventListener('click', (e) => {
        if (!document.getElementById('regCountrySelect')?.contains(e.target)) closeMenu();
    });

    renderMenu();
    renderSelected();
}

function buildFullMobilePhone() {
    const dial = document.getElementById('regPhoneDial')?.value || '+54';
    const local = document.getElementById('regMobilePhone')?.value || '';
    return buildFullPhoneNumber(dial, local);
}

function computeAgeFromBirthDate(dateStr) {
    const dob = new Date(dateStr);
    if (Number.isNaN(dob.getTime())) return null;
    const today = new Date();
    let years = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) years -= 1;
    return years;
}

function validateRegistrationForm(form) {
    clearFieldErrors(form);

    if (isGuestRegistrationType()) {
        const emailEl = document.getElementById('regEmail');
        if (!emailEl || !String(emailEl.value || '').trim()) {
            highlightField(emailEl, true);
            showAlert(document.getElementById('registerAlert'), `${t('Required field missing:')} ${t('Email')}`, true, 'regEmail');
            return false;
        }
        return true;
    }

    const required = [
        { id: 'regEmail', label: t('Email') },
        { id: 'regMobilePhone', label: t('Mobile phone') },
        { id: 'regBirthDate', label: t('Birth date') },
        { id: 'regPassword', label: t('Password') },
        { id: 'regPasswordConfirm', label: t('Confirm password') }
    ];

    for (const field of required) {
        const el = document.getElementById(field.id);
        if (!el) continue;
        const empty = !String(el.value || '').trim();
        if (empty) {
            highlightField(el, true);
            showAlert(document.getElementById('registerAlert'), `${t('Required field missing:')} ${field.label}`, true, field.id);
            return false;
        }
    }

    const birthEl = document.getElementById('regBirthDate');
    const birthValue = getBirthDateIsoValue();
    const ageYears = birthValue ? computeAgeFromBirthDate(birthValue) : null;
    if (!birthValue || ageYears === null || ageYears < 18 || ageYears > 99) {
        highlightField(birthEl, true);
        showAlert(document.getElementById('registerAlert'), t('You must be at least 18 years old to register as a model.'), true, 'regBirthDate');
        return false;
    }

    const passEl = document.getElementById('regPassword');
    if (passEl && String(passEl.value).length < 6) {
        highlightField(passEl, true);
        showAlert(document.getElementById('registerAlert'), t('Password must be at least 6 characters.'), true, 'regPassword');
        return false;
    }

    const confirmEl = document.getElementById('regPasswordConfirm');
    if (confirmEl && String(confirmEl.value).length < 6) {
        highlightField(confirmEl, true);
        showAlert(document.getElementById('registerAlert'), t('Password must be at least 6 characters.'), true, 'regPasswordConfirm');
        return false;
    }

    if (passEl && confirmEl && passEl.value !== confirmEl.value) {
        highlightField(passEl, true);
        highlightField(confirmEl, true);
        showAlert(document.getElementById('registerAlert'), t('Passwords do not match'), true, 'regPasswordConfirm');
        return false;
    }

    return true;
}

function handleGoogleRegistrationSuccess(user, data = {}) {
    const needsCompletion = data.needsProfileCompletion === true || userNeedsGoogleProfileCompletion(user);
    if (needsCompletion && !isGuestRegistrationType()) {
        markGoogleProfileCompletionPending();
        showGoogleProfileCompletionUI(user);
        return;
    }
    clearGoogleProfileCompletionPending();
    redirectAfterLogin(user);
}

function userNeedsGoogleProfileCompletion(user) {
    if (!user || user.role !== 'professional') return false;
    const prof = user.professionalProfile || {};
    const hasPhone = Boolean(String(prof.mobilePhone || prof.whatsappNumber || '').trim());
    const hasBirth = Boolean(prof.birthDate) || (Number.isFinite(prof.age) && prof.age >= 18);
    return !hasPhone || !hasBirth;
}

async function resumeAuthenticatedRegistration() {
    if (isGuestRegistrationType()) return;

    const token = localStorage.getItem('token');
    const pendingGoogle = isGoogleProfileCompletionPending();
    if (!token && !pendingGoogle) return;

    if (token && pendingGoogle) {
        showGoogleProfileCompletionUI(JSON.parse(localStorage.getItem('user') || '{}'));
    }

    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/professionals/me`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok || !data.success || !data.data) return;

        const user = data.data;
        localStorage.setItem('user', JSON.stringify(user));

        if (user.role === 'professional' && userNeedsGoogleProfileCompletion(user)) {
            markGoogleProfileCompletionPending();
            showGoogleProfileCompletionUI(user);
            return;
        }

        clearGoogleProfileCompletionPending();
        if (user.role === 'professional' || user.role === 'user') {
            redirectAfterLogin(user);
        }
    } catch {
        /* keep manual registration available if session check fails */
    }
}

function showGoogleProfileCompletionUI(user = {}) {
    const form = document.getElementById('registerForm');
    if (!form) return;

    form.dataset.googleComplete = '1';
    document.body.classList.add('register-google-complete');
    document.getElementById('regGoogleCompleteIntro')?.classList.remove('hidden');
    applyStaticTranslations(document.getElementById('regGoogleCompleteIntro'));
    document.getElementById('regInstructions')?.classList.add('hidden');
    document.getElementById('regNoPaymentNote')?.classList.add('hidden');

    const emailEl = document.getElementById('regEmail');
    if (emailEl && user.email) emailEl.value = user.email;

    const intro = document.getElementById('regFormIntro');
    if (intro) {
        intro.textContent = t('Google sign-in complete. Add your WhatsApp and birth date to finish.');
    }

    ['regEmail', 'regPassword', 'regPasswordConfirm'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.required = false;
    });
    document.getElementById('regMobilePhone')?.setAttribute('required', 'required');
    document.getElementById('regBirthDate')?.setAttribute('required', 'required');

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = t('Finish registration');

    const alert = document.getElementById('registerAlert');
    showAlert(alert, t('Signed in with Google. Please add your WhatsApp and birth date below.'), false);
    revealRegisterAlert(alert);
    document.getElementById('regGoogleCompleteIntro')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('regMobilePhone')?.focus({ preventScroll: true });
}

function validateGoogleProfileCompletionForm(form) {
    clearFieldErrors(form);
    const alert = document.getElementById('registerAlert');

    const phoneEl = document.getElementById('regMobilePhone');
    if (!phoneEl || !String(phoneEl.value || '').trim()) {
        highlightField(phoneEl, true);
        showAlert(alert, `${t('Required field missing:')} ${t('Mobile phone')}`, true, 'regMobilePhone');
        return false;
    }

    const birthEl = document.getElementById('regBirthDate');
    const birthValue = getBirthDateIsoValue();
    const ageYears = birthValue ? computeAgeFromBirthDate(birthValue) : null;
    if (!birthValue || ageYears === null || ageYears < 18 || ageYears > 99) {
        highlightField(birthEl, true);
        showAlert(alert, t('You must be at least 18 years old to register as a model.'), true, 'regBirthDate');
        return false;
    }

    return true;
}

async function submitGoogleProfileCompletion(form) {
    const alert = document.getElementById('registerAlert');
    if (!validateGoogleProfileCompletionForm(form)) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent || t('Finish registration');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t('Submitting...');
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/auth/google/complete-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify({
                mobilePhone: buildFullMobilePhone(),
                birthDate: getBirthDateIsoValue()
            })
        });
        const data = await res.json();
        if (data.success && data.user) {
            if (data.token) localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            clearGoogleProfileCompletionPending();
            showAlert(alert, t('Registration complete! Redirecting to your panel...'), false);
            revealRegisterAlert(alert);
            if (submitBtn) submitBtn.textContent = t('Registration saved');
            window.setTimeout(() => redirectAfterLogin(data.user), 800);
            return;
        }
        showAlert(alert, t(data.error || 'Registration failed'));
        revealRegisterAlert(alert);
    } catch {
        showAlert(alert, t('Server connection error'));
        revealRegisterAlert(alert);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

function setupInstructions(type = currentRegistrationType || 'professional') {
    const host = document.getElementById('regInstructions');
    if (!host) return;
    host.classList.remove('hidden');

    if (type === 'guest') {
        host.innerHTML = `
        <h3 class="gold-text" style="margin-top:0;">${t('Guest signup')}</h3>
        <p style="font-size:0.95rem;line-height:1.5;margin:0 0 12px;">${t('Use Google for instant access (no verification code), or register with email. Email signup sends a 6-digit code — check Spam if needed.')}</p>
        <ol style="font-size:0.9rem;margin:0 0 0 20px;line-height:1.6;padding:0;">
            <li>${t('Sign in with Google, or enter your email (alias optional).')}</li>
            <li>${t('If you used email: confirm with the 6-digit code we send you.')}</li>
            <li>${t('Browse the collection once signed in.')}</li>
        </ol>`;
        applyStaticTranslations(host);
        return;
    }

    host.innerHTML = `
        <h3 class="gold-text" style="margin-top:0;">${t('Quick registration')}</h3>
        <p style="font-size:0.95rem;line-height:1.5;margin:0 0 12px;">${t('Use Google for instant access (no verification code), or fill in email, phone and birth date below. Our team completes your profile and uploads your photos.')}</p>
        <p style="font-size:0.88rem;line-height:1.5;margin:0 0 12px;color:#8fdfb0;">${t('Already browsing as a guest? You can register here as a model with the same email.')}</p>
        <ol style="font-size:0.9rem;margin:0 0 0 20px;line-height:1.6;padding:0;">
            <li>${t('Sign in with Google, or fill in the fields below.')}</li>
            <li>${t('If you used email: confirm with the 6-digit code we send you.')}</li>
            <li>${t('We contact you on WhatsApp and finish the rest together.')}</li>
        </ol>
        <p style="font-size:0.88rem;margin:12px 0 0;color:#8fdfb0;line-height:1.5;">${t('We never ask you to register a payment method — no card, no automatic debit.')}</p>
        <div id="regEmailSpamWarning" style="margin-top:14px;padding:12px;background:rgba(255,193,7,0.12);border:1px solid #ffc107;border-radius:6px;">
            <strong style="color:#ffc107;">⚠️ ${t('Important — check your email')}</strong>
            <p style="font-size:0.9rem;margin:8px 0 0;color:#eee;">${t('Manual email registration sends a 6-digit verification code. It may arrive in Spam or Junk. Google sign-in skips this step.')}</p>
        </div>`;
    applyStaticTranslations(host);
}

export function initProfessionalRegistration() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    initRegistrationRoute();
    setupBirthDateField();
    setupPhoneCountrySelect();
    setupRegistrationLeaveGuard(form);
    attachPasswordToggles(form);
    resumeAuthenticatedRegistration();

    window.addEventListener('pageshow', (event) => {
        if (event.persisted || isGoogleProfileCompletionPending()) {
            resumeAuthenticatedRegistration();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alert = document.getElementById('registerAlert');

        if (form.dataset.googleComplete === '1') {
            await submitGoogleProfileCompletion(form);
            return;
        }

        if (!validateRegistrationForm(form)) return;

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = t('Submitting...');

        const formData = new FormData();
        const emailValue = document.getElementById('regEmail').value.trim();
        formData.append('email', emailValue);

        const emailStatus = await getEmailRegistrationStatus(emailValue);
        if (emailStatus?.registered) {
            redirectToLogin(emailValue, t('This email is already registered. Redirecting to sign in...'));
            return;
        }
        if (emailStatus?.pendingVerification) {
            goToVerifyPage(
                emailValue,
                alert,
                submitBtn,
                t('We already sent a verification code to this email. Taking you to verification...')
            );
            return;
        }

        if (isGuestRegistrationType()) {
            formData.append('role', 'user');
            formData.append('registrationMode', 'guest');
            const aliasValue = document.getElementById('regGuestAlias')?.value.trim();
            if (aliasValue) formData.append('alias', aliasValue);
        } else {
            formData.append('role', 'professional');
            formData.append('registrationMode', document.getElementById('regRegistrationMode')?.value || 'express');
            formData.append('password', document.getElementById('regPassword').value);
            formData.append('mobilePhone', buildFullMobilePhone());
            formData.append('birthDate', getBirthDateIsoValue());
        }

        let navigated = false;
        try {
            const res = await fetch(`${API_URL}/auth/register`, { method: 'POST', body: formData });
            let data = {};
            try {
                data = await res.json();
            } catch {
                showAlert(alert, t('Server connection error'));
                revealRegisterAlert(alert);
                return;
            }

            if (data.success) {
                if (data.token) {
                    navigated = true;
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('is18Plus', 'true');
                    sessionStorage.setItem('valid_entry', 'true');
                    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
                    showAlert(alert, t('Registration complete! Redirecting to your panel...'), false);
                    revealRegisterAlert(alert);
                    submitBtn.textContent = t('Registration saved');
                    window.setTimeout(() => redirectAfterLogin(data.user || {}), 800);
                    return;
                }
                navigated = true;
                goToVerifyPage(
                    emailValue,
                    alert,
                    submitBtn,
                    t('Registration saved! Check your email for the 6-digit code (also spam/junk). Redirecting...')
                );
                return;
            }

            if (data.code === 'EMAIL_SEND_FAILED' || data.code === 'EMAIL_NOT_CONFIGURED') {
                showAlert(alert, t(data.error || 'We could not send the verification email. Your registration was not saved — please try again and check spam/junk.'));
            } else if (data.code === 'EMAIL_ALREADY_REGISTERED') {
                redirectToLogin(emailValue, t('This email is already registered. Redirecting to sign in...'));
                navigated = true;
                return;
            } else if (
                data.error && (
                    /verification photo/i.test(data.error)
                    || /verification document/i.test(data.error)
                    || /three verification/i.test(data.error)
                    || /no verification documents/i.test(data.error)
                )
            ) {
                showAlert(alert, t('Express registration does not require ID photos. Please try again — if this persists, refresh the page and submit once more.'));
            } else {
                showAlert(alert, data.error || t('Registration failed'));
            }
            revealRegisterAlert(alert);
        } catch {
            showAlert(alert, t('Server connection error'));
            revealRegisterAlert(alert);
        } finally {
            if (!navigated) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        }
    });

    applyStaticTranslations(form);

    window.addEventListener('beforeunload', () => {
        if (isAdminSession()) return;
        const payload = registrationTrackingPayload({ reason: 'browser_close' });
        if (!payload.hadFormData) return;
        const blob = new Blob([JSON.stringify({ event: 'abandon', ...payload })], { type: 'application/json' });
        if (typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(`${API_URL}/public/registration-track`, blob);
        }
    });
}
