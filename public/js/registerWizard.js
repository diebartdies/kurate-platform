/**
 * Wizard de registro unico de KuraTe.
 *
 * Un solo flujo para todos los accesos (home, /register.html, login, avisos):
 *   1. email + telefono        -> codigo SMS
 *   2. codigo SMS              -> codigo de email
 *   3. codigo de email o Google (con Google igual se pide telefono y DNI)
 *   4. escaneo del DNI         -> creacion de cuenta (contrasena + alias + rol)
 *
 * El backend (preRegistrationController) exige el escaneo del DNI y las dos
 * verificaciones antes de crear el usuario: este modulo solo centraliza la UI
 * que antes estaba duplicada (modal inline en index.html + formulario propio
 * de register.html, que con Google no pedia DNI ni codigo SMS).
 *
 * Si el codigo de barras PDF417 no se puede leer (foto movida, poco contraste,
 * reflejo, DNI viejo), el wizard NO vuelve a pedir la foto en loop: muestra el
 * error, deja reintentar y ofrece completar los datos a mano. El backend
 * guarda igual la foto y marca el DNI como verificado manualmente.
 *
 * Uso:
 *   import { mountRegisterWizard } from '/js/registerWizard.js?v=2';
 *   mountRegisterWizard('#preregWizardHost', { modal: true });
 *   mountRegisterWizard('#registerWizardMount', { defaultRole: 'user' });
 */

const WIZARD_STYLES = `
.register-wizard .fm-step { display: none; }
.register-wizard .fm-step.active { display: block; }
.register-wizard h2 { color: #B8922E; margin: 0 0 0.25rem; font-size: 1.25rem; }
.register-wizard p { color: #888; font-size: 0.85rem; margin: 0 0 1.25rem; }
.register-wizard .fm-card { background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; }
.register-wizard .fm-card label { display: block; margin-bottom: 0.5rem; color: #B8922E; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; }
.register-wizard .fm-input { width: 100%; height: 48px; padding: 0 0.85rem; font-size: 0.95rem; border: 2px solid #2a2a3e; border-radius: 8px; background: #0f0f1a; color: #e0e0e0; box-sizing: border-box; transition: border-color 0.2s; }
.register-wizard .fm-input:focus { border-color: #B8922E; outline: none; }
.register-wizard .fm-btn { display: inline-flex; align-items: center; justify-content: center; height: 48px; padding: 0 2rem; background: #B8922E; color: #0f0f1a; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: background 0.2s; text-transform: uppercase; letter-spacing: 1px; text-decoration: none; }
.register-wizard .fm-btn:hover { background: #d4af37; }
.register-wizard .fm-btn:disabled { background: #555; cursor: not-allowed; }
.register-wizard .fm-btn-outline { background: transparent; color: #B8922E; border: 2px solid #B8922E; }
.register-wizard .fm-btn-outline:hover { background: rgba(184,146,46,0.1); }
.register-wizard .fm-btn-block { width: 100%; }
.register-wizard .fm-btn-sm { height: 40px; padding: 0 1.25rem; font-size: 0.85rem; }
.register-wizard .fm-btn-ghost { background: transparent; color: #888; border: 1px solid #333; }
.register-wizard .fm-btn-ghost:hover { color: #B8922E; border-color: #B8922E; background: transparent; }
.register-wizard .fm-error { color: #e74c3c; font-size: 0.85rem; margin-top: 0.35rem; display: none; }
.register-wizard .fm-code-inputs { display: flex; gap: 0.5rem; justify-content: center; margin: 1rem 0; }
.register-wizard .fm-code-inputs input { width: 44px; height: 52px; padding: 0; text-align: center; font-size: 1.3rem; font-weight: 700; border: 2px solid #2a2a3e; border-radius: 8px; background: #0f0f1a; color: #e0e0e0; box-sizing: border-box; }
.register-wizard .fm-code-inputs input:focus { border-color: #B8922E; outline: none; }
.register-wizard .fm-field { margin-bottom: 0.75rem; }
.register-wizard .fm-field label { font-size: 0.8rem; }
.register-wizard .fm-label { display: block; font-size: 0.8rem; color: #B8922E; font-weight: 600; margin-bottom: 0.35rem; }
.register-wizard .fm-note { color: #7e7e7e; font-size: 0.78rem; line-height: 1.4; }
.register-wizard .dni-frame { border: 2px dashed #2a2a3e; border-radius: 12px; padding: 0.5rem; background: #0f0f1a; text-align: center; min-height: 140px; display: flex; align-items: center; justify-content: center; }
.register-wizard .dni-frame img { max-width: 100%; max-height: 200px; border-radius: 8px; display: block; }
`;

const WIZARD_HTML = `
    <div class="fm-step active" data-step="1">
        <h2 id="preregModalTitle">Cre&aacute; tu cuenta</h2>
        <p>Primero contanos qui&eacute;n sos para registrarte.</p>
        <div class="fm-card" style="padding:0;border:none;background:none;">
            <div class="fm-field">
                <label for="preregEmail">Email</label>
                <input type="email" id="preregEmail" class="fm-input" placeholder="tucorreo@ejemplo.com" autocomplete="email">
            </div>
            <div class="fm-field">
                <label for="preregPhone">Tel&eacute;fono</label>
                <input type="tel" id="preregPhone" class="fm-input" placeholder="11 2345-6789" autocomplete="tel">
            </div>
            <div class="fm-error" id="preregStep1Error"></div>
            <button class="fm-btn fm-btn-block" id="preregStep1Btn">Enviar c&oacute;digo SMS</button>
        </div>
    </div>

    <div class="fm-step" data-step="2">
        <h2>Verific&aacute; tu tel&eacute;fono</h2>
        <p id="smsCodeLabel">Ingres&aacute; el c&oacute;digo de 6 d&iacute;gitos que enviamos por SMS.</p>
        <div class="fm-code-inputs" role="group" aria-labelledby="smsCodeLabel">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit" data-idx="0" id="smsCode0" name="smsCode0" aria-label="D&iacute;gito 1 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit" data-idx="1" id="smsCode1" name="smsCode1" aria-label="D&iacute;gito 2 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit" data-idx="2" id="smsCode2" name="smsCode2" aria-label="D&iacute;gito 3 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit" data-idx="3" id="smsCode3" name="smsCode3" aria-label="D&iacute;gito 4 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit" data-idx="4" id="smsCode4" name="smsCode4" aria-label="D&iacute;gito 5 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit" data-idx="5" id="smsCode5" name="smsCode5" aria-label="D&iacute;gito 6 de 6">
        </div>
        <div class="fm-error" id="preregStep2Error"></div>
        <button class="fm-btn fm-btn-block" id="preregStep2Btn" disabled>Verificar</button>
        <button class="fm-btn fm-btn-ghost fm-btn-block fm-btn-sm" id="preregResendSms" style="margin-top:0.5rem;">Reenviar c&oacute;digo</button>
    </div>

    <div class="fm-step" data-step="3">
        <h2>Verific&aacute; tu email</h2>
        <p>Eleg&iacute; c&oacute;mo verificar tu correo.</p>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
            <div id="preregGoogleMount"></div>
            <button class="fm-btn fm-btn-outline fm-btn-block" id="preregEmailCodeBtn">Verificar con c&oacute;digo por email</button>
        </div>
        <div class="fm-error" id="preregStep3Error"></div>
    </div>

    <div class="fm-step" data-step="3b">
        <h2>C&oacute;digo de email</h2>
        <p id="emailCodeLabel">Enviamos un c&oacute;digo a tu email. Ingresalo abajo.</p>
        <div class="fm-code-inputs" role="group" aria-labelledby="emailCodeLabel">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit-email" data-idx="0" id="emailCode0" name="emailCode0" aria-label="D&iacute;gito 1 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit-email" data-idx="1" id="emailCode1" name="emailCode1" aria-label="D&iacute;gito 2 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit-email" data-idx="2" id="emailCode2" name="emailCode2" aria-label="D&iacute;gito 3 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit-email" data-idx="3" id="emailCode3" name="emailCode3" aria-label="D&iacute;gito 4 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit-email" data-idx="4" id="emailCode4" name="emailCode4" aria-label="D&iacute;gito 5 de 6">
            <input type="text" maxlength="1" inputmode="numeric" class="fm-code-digit-email" data-idx="5" id="emailCode5" name="emailCode5" aria-label="D&iacute;gito 6 de 6">
        </div>
        <div class="fm-error" id="preregStep3bError"></div>
        <button class="fm-btn fm-btn-block" id="preregStep3bBtn" disabled>Verificar</button>
        <button class="fm-btn fm-btn-ghost fm-btn-block fm-btn-sm" id="preregResendEmail" style="margin-top:0.5rem;">Reenviar c&oacute;digo</button>
        <button class="fm-btn fm-btn-ghost fm-btn-block fm-btn-sm" id="preregBackToGoogle" style="margin-top:0.25rem;">Volver y elegir otra opci&oacute;n</button>
    </div>

    <div class="fm-step" data-step="4">
        <h2>Ya casi est&aacute;</h2>
        <div id="preregDeviceMsg"></div>
    </div>
`;

function injectStyles() {
    if (document.getElementById('registerWizardStyles')) return;
    const style = document.createElement('style');
    style.id = 'registerWizardStyles';
    style.textContent = WIZARD_STYLES;
    document.head.appendChild(style);
}

/**
 * true cuando la pagina corre dentro de la app (Capacitor) o de una WebView.
 * Google Identity Services no funciona en WebViews embebidas (Google bloquea
 * el flujo): el boton queda en blanco. En ese caso mostramos una nota y
 * dejamos la verificacion por codigo de email, que si funciona.
 */
function isNativeWebView() {
    try {
        if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
            return true;
        }
    } catch (e) { /* noop */ }
    const ua = navigator.userAgent || '';
    return /; wv\)/i.test(ua) || /Capacitor/i.test(ua);
}

/**
 * Monta el wizard dentro de `target` (selector o nodo). Idempotente: si el
 * host ya esta montado devuelve la misma api.
 * options.defaultRole: 'professional' | 'user' -> preselecciona el rol final.
 */
export function mountRegisterWizard(target, options = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) {
        console.error('mountRegisterWizard: host no encontrado', target);
        return null;
    }
    if (root.dataset.wizardMounted === '1') return root._wizardApi;

    injectStyles();
    root.classList.add('register-wizard');
    root.innerHTML = WIZARD_HTML;
    root.dataset.wizardMounted = '1';

    const q = (sel) => root.querySelector(sel);
    const qa = (sel) => root.querySelectorAll(sel);
    const defaultRole = (options.defaultRole === 'user' || options.defaultRole === 'professional')
        ? options.defaultRole
        : null;

    let preregId = null;
    // true si el email se verifico con Google: no se le pide contrasena
    let usedGoogle = false;
    const steps = qa('.fm-step');
    const step1Btn = q('#preregStep1Btn');
    const step2Btn = q('#preregStep2Btn');
    const step3bBtn = q('#preregStep3bBtn');

    function showStep(n) {
        steps.forEach(s => s.classList.remove('active'));
        const el = root.querySelector('[data-step="' + n + '"]');
        if (el) el.classList.add('active');
    }

    function reset() {
        preregId = null;
        usedGoogle = false;
        q('#preregEmail').value = '';
        q('#preregPhone').value = '';
        ['preregStep1Error', 'preregStep2Error', 'preregStep3Error', 'preregStep3bError'].forEach(id => {
            const e = q('#' + id);
            if (e) { e.style.display = 'none'; e.style.color = ''; }
        });
        qa('.fm-code-digit').forEach(i => { i.value = ''; });
        qa('.fm-code-digit-email').forEach(i => { i.value = ''; });
        step2Btn.disabled = true;
        step3bBtn.disabled = true;
        q('#preregGoogleMount').innerHTML = '';
        showStep(1);
    }

    // Code input auto-advance
    function wireCodeInputs(selector, btnId) {
        const inputs = qa(selector);
        inputs.forEach((inp, i) => {
            inp.addEventListener('input', function () {
                this.value = this.value.replace(/\D/g, '').slice(0, 1);
                if (this.value && i < inputs.length - 1) inputs[i + 1].focus();
                const full = Array.from(inputs).map(x => x.value).join('');
                q('#' + btnId).disabled = full.length !== 6;
            });
            inp.addEventListener('keydown', function (e) {
                if (e.key === 'Backspace' || e.key === 'Left') {
                    if (!this.value && i > 0) inputs[i - 1].focus();
                }
            });
            inp.addEventListener('paste', function (e) {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const digits = text.replace(/\D/g, '').slice(0, 6);
                if (!digits) return;
                e.preventDefault();
                digits.split('').forEach((d, idx) => { if (inputs[idx]) inputs[idx].value = d; });
                q('#' + btnId).disabled = digits.length !== 6;
                const next = inputs[Math.min(digits.length, inputs.length - 1)];
                if (next) next.focus();
            });
        });
    }
    wireCodeInputs('.fm-code-digit', 'preregStep2Btn');
    wireCodeInputs('.fm-code-digit-email', 'preregStep3bBtn');

    async function postJson(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        return { res, data };
    }

    // Step 1: email + telefono -> envia codigo SMS
    step1Btn.addEventListener('click', async function () {
        const email = q('#preregEmail').value.trim();
        const phone = q('#preregPhone').value.trim();
        const err = q('#preregStep1Error');
        err.style.display = 'none';

        if (!email) { err.textContent = 'Ingres\u00e1 tu email.'; err.style.display = 'block'; return; }
        if (!phone) { err.textContent = 'Ingres\u00e1 tu tel\u00e9fono.'; err.style.display = 'block'; return; }

        this.disabled = true;
        this.textContent = 'Enviando...';

        try {
            const { res, data } = await postJson('/api/v1/public/pre-register', { email, phone });
            if (!res.ok) {
                err.textContent = data.error || 'Error al enviar SMS.';
                err.style.display = 'block';
            } else {
                preregId = data.id;
                showStep(2);
                const first = q('#smsCode0');
                if (first) first.focus();
            }
        } catch (e) {
            err.textContent = 'Error de conexi\u00f3n.';
            err.style.display = 'block';
        }
        this.disabled = false;
        this.textContent = 'Enviar c\u00f3digo SMS';
    });

    // Step 2: verifica codigo SMS
    step2Btn.addEventListener('click', async function () {
        const err = q('#preregStep2Error');
        err.style.display = 'none';
        const code = Array.from(qa('.fm-code-digit')).map(i => i.value).join('');
        if (code.length !== 6) { err.textContent = 'Ingres\u00e1 los 6 d\u00edgitos.'; err.style.display = 'block'; return; }
        this.disabled = true; this.textContent = 'Verificando...';
        try {
            const { res, data } = await postJson('/api/v1/public/pre-register/verify-phone', { id: preregId, code });
            if (!res.ok) {
                err.textContent = data.error || 'C\u00f3digo incorrecto.';
                err.style.display = 'block';
            } else {
                showStep(3);
                tryMountGoogle();
            }
        } catch (e) {
            err.textContent = 'Error de conexi\u00f3n.';
            err.style.display = 'block';
        }
        this.disabled = false; this.textContent = 'Verificar';
    });

    // Reenviar SMS
    q('#preregResendSms').addEventListener('click', async function () {
        const err = q('#preregStep2Error');
        err.style.display = 'none';
        try {
            const { res, data } = await postJson('/api/v1/public/pre-register/resend-code', { id: preregId });
            if (!res.ok) {
                err.textContent = data.error || 'Error.';
                err.style.display = 'block';
                return;
            }
            err.textContent = 'C\u00f3digo reenviado.';
            err.style.color = '#2ecc71';
            err.style.display = 'block';
            setTimeout(() => { err.style.display = 'none'; err.style.color = '#e74c3c'; }, 3000);
        } catch (e) {
            err.textContent = 'Error de conexi\u00f3n.';
            err.style.display = 'block';
        }
    });

    // Step 3: elegir verificar con codigo por email
    q('#preregEmailCodeBtn').addEventListener('click', async function () {
        const err = q('#preregStep3Error');
        err.style.display = 'none';
        showStep('3b');
        await sendEmailCode();
        const first = q('#emailCode0');
        if (first) first.focus();
    });

    async function sendEmailCode() {
        const err = q('#preregStep3bError');
        err.style.display = 'none';
        try {
            const { res, data } = await postJson('/api/v1/public/pre-register/resend-code', { id: preregId });
            if (!res.ok) {
                err.textContent = data.error || 'Error.';
                err.style.display = 'block';
            }
        } catch (e) {
            err.textContent = 'Error de conexi\u00f3n.';
            err.style.display = 'block';
        }
    }

    // Step 3b: verifica codigo de email
    step3bBtn.addEventListener('click', async function () {
        const err = q('#preregStep3bError');
        err.style.display = 'none';
        const code = Array.from(qa('.fm-code-digit-email')).map(i => i.value).join('');
        if (code.length !== 6) { err.textContent = 'Ingres\u00e1 los 6 d\u00edgitos.'; err.style.display = 'block'; return; }
        this.disabled = true; this.textContent = 'Verificando...';
        try {
            const { res, data } = await postJson('/api/v1/public/pre-register/verify-email', { id: preregId, code });
            if (!res.ok) {
                err.textContent = data.error || 'C\u00f3digo incorrecto.';
                err.style.display = 'block';
            } else {
                usedGoogle = false;
                showDeviceStep();
            }
        } catch (e) {
            err.textContent = 'Error de conexi\u00f3n.';
            err.style.display = 'block';
        }
        this.disabled = false; this.textContent = 'Verificar';
    });

    // Reenviar codigo de email
    q('#preregResendEmail').addEventListener('click', async function () {
        const err = q('#preregStep3bError');
        err.style.display = 'none';
        try {
            const { res, data } = await postJson('/api/v1/public/pre-register/resend-code', { id: preregId });
            if (!res.ok) {
                err.textContent = data.error || 'Error.';
                err.style.display = 'block';
                return;
            }
            err.textContent = 'C\u00f3digo reenviado.';
            err.style.color = '#2ecc71';
            err.style.display = 'block';
            setTimeout(() => { err.style.display = 'none'; err.style.color = '#e74c3c'; }, 3000);
        } catch (e) {
            err.textContent = 'Error de conexi\u00f3n.';
            err.style.display = 'block';
        }
    });

    q('#preregBackToGoogle').addEventListener('click', function () {
        showStep(3);
        tryMountGoogle();
    });

    // Google: verifica el email (el telefono y el DNI se piden igual)
    async function tryMountGoogle() {
        const mount = q('#preregGoogleMount');
        if (!mount) return;
        mount.innerHTML = '';

        if (isNativeWebView()) {
            mount.innerHTML = '<p class="fm-note" style="margin:0 0 0.25rem;">La verificaci&oacute;n con Google no est&aacute; disponible dentro de la app. Us&aacute; el c&oacute;digo por email (funciona igual y es m&aacute;s r&aacute;pido).</p>';
            return;
        }

        try {
            const r = await fetch('/api/v1/public/client-config');
            const data = await r.json();
            const clientId = data.success && data.data && data.data.googleClientId ? data.data.googleClientId : '';
            if (!clientId) { mount.innerHTML = ''; return; }
            mount.innerHTML = '<p class="fm-note" style="margin:0 0 0.35rem;">O verific\u00e1 con Google</p><div id="googleBtnMount"></div>';
            await loadGoogleSdk();
            if (!window.google || !window.google.accounts || !window.google.accounts.id) {
                mount.innerHTML = '';
                return;
            }
            window.handleGooglePrereg = async (response) => {
                const err = q('#preregStep3Error');
                err.style.display = 'none';
                try {
                    const { res, data } = await postJson('/api/v1/public/pre-register/verify-email-google', {
                        id: preregId,
                        token: response.credential
                    });
                    if (!res.ok) {
                        err.textContent = data.error || 'Error con Google.';
                        err.style.display = 'block';
                        return;
                    }
                    usedGoogle = true;
                    showDeviceStep();
                } catch (e) {
                    err.textContent = 'Error de conexi\u00f3n.';
                    err.style.display = 'block';
                }
            };
            window.google.accounts.id.initialize({ client_id: clientId, callback: window.handleGooglePrereg });
            window.google.accounts.id.renderButton(mount.querySelector('#googleBtnMount'), {
                theme: 'outline',
                size: 'large',
                type: 'standard',
                width: 380,
                text: 'continue_with',
                locale: 'es'
            });
        } catch (e) { /* sin google: queda solo el codigo por email */ }
    }

    function loadGoogleSdk() {
        if (document.getElementById('google-jssdk')) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.id = 'google-jssdk';
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true; s.defer = true;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // ---------------------------------------------------------------------
    // Step 4: DNI
    //
    // Estados:
    //   idle      -> no hay foto, se ofrecen camara y galeria
    //   scanning  -> foto elegida, esperando al backend
    //   failed    -> el PDF417 no se pudo leer: error visible + reintentar/carga manual
    //   ok        -> datos del DNI listos, se muestra el formulario final
    // ---------------------------------------------------------------------
    function showDeviceStep() {
        showStep(4);
        const msg = q('#preregDeviceMsg');
        const isMobile = /Mobi|Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);

        let dniFront = null;
        let dniScanState = 'idle';
        let dniError = '';
        let dniData = null;

        function dniFrameHtml() {
            return `
                <div class="dni-frame" data-side="front">
                    ${dniFront
                        ? `<img src="${dniFront}" alt="Frente del DNI">`
                        : `<span style="color:#555;font-size:0.85rem;">${isMobile ? 'Todav&iacute;a no cargaste la foto' : 'Todav&iacute;a no elegiste una imagen'}</span>`}
                </div>
            `;
        }

        function statusHtml() {
            if (dniScanState === 'scanning') {
                return '<div id="dniStatus" class="fm-note" style="margin-top:0.75rem;">Analizando la foto del DNI...</div>';
            }
            if (dniScanState === 'failed') {
                return `<div id="dniStatus" style="margin-top:0.75rem;">
                    <p style="color:#e74c3c;font-size:0.85rem;margin:0 0 0.35rem;">${escapeHtml(dniError || 'No pudimos leer el c\u00f3digo de barras del DNI.')}</p>
                    <p class="fm-note" style="margin:0;">La foto qued&oacute; guardada. Pod&eacute;s probar con otra foto m&aacute;s n&iacute;tida o completar los datos a mano.</p>
                </div>`;
            }
            return '<div id="dniStatus" style="margin-top:0.75rem;"></div>';
        }

        function renderDniUi() {
            const lead = isMobile
                ? 'Necesitamos el frente de tu DNI. Sac&aacute; la foto con el c&oacute;digo de barras completo y con buena luz.'
                : 'Sub&iacute; una foto o escaneo del frente de tu DNI (con el c&oacute;digo de barras) con buena luz.';
            msg.innerHTML = `
                <p style="margin-bottom:1rem;">${lead}</p>
                ${dniFrameHtml()}
                <div id="dniActions" style="display:flex;flex-direction:column;gap:0.75rem;margin-top:0.75rem;"></div>
                ${statusHtml()}
            `;
            const actions = q('#dniActions');

            if (dniScanState === 'ok' && dniData) {
                renderCompleteForm();
                return;
            }

            if (dniScanState === 'scanning') {
                const btn = document.createElement('button');
                btn.className = 'fm-btn fm-btn-block';
                btn.disabled = true;
                btn.textContent = 'Analizando...';
                actions.appendChild(btn);
                return;
            }

            if (!dniFront) {
                // Dos opciones explicitas: camara y galeria/archivos.
                const camBtn = document.createElement('button');
                camBtn.className = 'fm-btn fm-btn-block';
                camBtn.textContent = isMobile ? 'Tomar foto con la c\u00e1mara' : 'Elegir foto del DNI';
                camBtn.addEventListener('click', () => captureDni('front', isMobile));
                actions.appendChild(camBtn);

                if (isMobile) {
                    const galBtn = document.createElement('button');
                    galBtn.className = 'fm-btn fm-btn-outline fm-btn-block';
                    galBtn.textContent = 'Elegir de la galer\u00eda';
                    galBtn.addEventListener('click', () => captureDni('front', false));
                    actions.appendChild(galBtn);
                }
                return;
            }

            // Hay foto pero la lectura fallo: reintentar o completar a mano.
            const retryBtn = document.createElement('button');
            retryBtn.className = 'fm-btn fm-btn-block';
            retryBtn.textContent = isMobile ? 'Probar con otra foto' : 'Elegir otra imagen';
            retryBtn.addEventListener('click', () => {
                dniFront = null;
                dniScanState = 'idle';
                dniError = '';
                dniData = null;
                renderDniUi();
                captureDni('front', isMobile);
            });
            actions.appendChild(retryBtn);

            const manualBtn = document.createElement('button');
            manualBtn.className = 'fm-btn fm-btn-outline fm-btn-block';
            manualBtn.textContent = 'Completar los datos del DNI a mano';
            manualBtn.addEventListener('click', renderManualDniForm);
            actions.appendChild(manualBtn);
        }

        function renderManualDniForm() {
            const actions = q('#dniActions');
            actions.innerHTML = `
                <p class="fm-note" style="margin:0 0 0.75rem;">Escrib&iacute; los datos tal como figuran en el DNI. La foto que ya subiste queda guardada para revisi&oacute;n.</p>
                <div class="fm-field">
                    <label for="dniManualNombre">Nombre</label>
                    <input type="text" id="dniManualNombre" class="fm-input" autocomplete="given-name">
                </div>
                <div class="fm-field">
                    <label for="dniManualApellido">Apellido</label>
                    <input type="text" id="dniManualApellido" class="fm-input" autocomplete="family-name">
                </div>
                <div class="fm-field">
                    <label for="dniManualNumero">N&uacute;mero de DNI</label>
                    <input type="text" id="dniManualNumero" class="fm-input" inputmode="numeric" placeholder="Sin puntos" autocomplete="off">
                </div>
                <div class="fm-field">
                    <label for="dniManualFecha">Fecha de nacimiento</label>
                    <input type="text" id="dniManualFecha" class="fm-input" inputmode="numeric" placeholder="DD/MM/AAAA" autocomplete="bday">
                </div>
                <div class="fm-error" id="dniManualError"></div>
                <button class="fm-btn fm-btn-block" id="dniManualSubmit">Guardar datos del DNI</button>
                <button class="fm-btn fm-btn-ghost fm-btn-block fm-btn-sm" id="dniManualCancel">Volver</button>
            `;
            q('#dniManualCancel').addEventListener('click', () => {
                renderDniUi();
            });
            q('#dniManualSubmit').addEventListener('click', submitManualDni);
        }

        async function submitManualDni() {
            const err = q('#dniManualError');
            const btn = q('#dniManualSubmit');
            const nombre = q('#dniManualNombre').value.trim();
            const apellido = q('#dniManualApellido').value.trim();
            const numero = q('#dniManualNumero').value.replace(/[^\d]/g, '');
            const fecha = q('#dniManualFecha').value.trim();
            err.style.display = 'none';

            if (!nombre || !apellido) {
                err.textContent = 'Complet\u00e1 nombre y apellido.';
                err.style.display = 'block';
                return;
            }
            if (numero.length < 7 || numero.length > 8) {
                err.textContent = 'El n\u00famero de DNI debe tener 7 u 8 d\u00edgitos.';
                err.style.display = 'block';
                return;
            }
            if (!/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(fecha) && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                err.textContent = 'La fecha debe ser DD/MM/AAAA.';
                err.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Guardando...';
            try {
                const { res, data } = await postJson('/api/v1/public/pre-register/dni-manual', {
                    id: preregId,
                    image: dniFront,
                    nombre,
                    apellido,
                    dni: numero,
                    fechaNacimiento: fecha
                });
                if (!res.ok) {
                    err.textContent = data.error || 'No pudimos guardar los datos del DNI.';
                    err.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Guardar datos del DNI';
                    return;
                }
                dniData = data.dni || { nombre, apellido, dni: numero, fechaNacimiento: fecha };
                dniScanState = 'ok';
                dniError = '';
                renderDniUi();
            } catch (e) {
                err.textContent = 'Error de conexi\u00f3n.';
                err.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Guardar datos del DNI';
            }
        }

        function renderCompleteForm() {
            const actions = q('#dniActions');
            const dni = dniData || {};
            const proSel = defaultRole === 'professional' ? 'selected' : '';
            const userSel = defaultRole === 'user' ? 'selected' : '';
            // Con Google no se pide contrasena: la cuenta entra con Google
            // (el backend guarda un hash aleatorio, igual que googleAuth).
            const passwordBlock = usedGoogle ? '' : `
                <div class="fm-field">
                    <label for="preregFinalPassword">Contrase\u00f1a</label>
                    <input type="password" id="preregFinalPassword" class="fm-input" placeholder="M\u00ednimo 6 caracteres" autocomplete="new-password">
                </div>
                <div class="fm-field">
                    <label for="preregFinalPasswordConfirm">Confirmar contrase\u00f1a</label>
                    <input type="password" id="preregFinalPasswordConfirm" class="fm-input" placeholder="Repet\u00ed la contrase\u00f1a" autocomplete="new-password">
                </div>`;
            const googleNote = usedGoogle
                ? '<p class="fm-note" style="margin:0 0 0.75rem;">Verificaste el email con Google: no hace falta crear una contrase\u00f1a.</p>'
                : '';
            const nombreCompleto = [dni.nombre, dni.apellido].filter(Boolean).join(' ');
            actions.innerHTML = `
                <p style="color:#2ecc71;font-size:0.85rem;margin:0 0 0.75rem;">DNI listo${nombreCompleto ? ': ' + escapeHtml(nombreCompleto) : ''}${dni.dni ? ' (DNI ' + escapeHtml(String(dni.dni)) + ')' : ''}. Complet\u00e1 tu perfil.</p>
                ${passwordBlock}
                ${googleNote}
                <div class="fm-field">
                    <label for="preregFinalAlias">Alias (se muestra p&uacute;blicamente)</label>
                    <input type="text" id="preregFinalAlias" class="fm-input" placeholder="Tu nombre de fantas\u00eda" autocomplete="nickname">
                </div>
                <div class="fm-field">
                    <label for="preregFinalRole">Tipo de cuenta</label>
                    <select id="preregFinalRole" class="fm-input">
                        <option value="professional" ${proSel}>Profesional</option>
                        <option value="user" ${userSel}>Usuario</option>
                    </select>
                </div>
                <div class="fm-error" id="preregFinalError"></div>
                <button class="fm-btn fm-btn-block" id="preregFinalBtn">Crear cuenta</button>
            `;
            q('#preregFinalBtn').addEventListener('click', submitCompleteForm);
        }

        async function submitCompleteForm() {
            const err = q('#preregFinalError');
            err.style.display = 'none';
            const passwordEl = q('#preregFinalPassword');
            const passwordConfirmEl = q('#preregFinalPasswordConfirm');
            const password = passwordEl ? passwordEl.value : '';
            const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value : '';
            const alias = q('#preregFinalAlias').value.trim();
            const role = q('#preregFinalRole').value;
            if (!usedGoogle) {
                if (!password || password.length < 6) {
                    err.textContent = 'La contrase\u00f1a debe tener al menos 6 caracteres.';
                    err.style.display = 'block';
                    return;
                }
                if (password !== passwordConfirm) {
                    err.textContent = 'Las contrase\u00f1as no coinciden.';
                    err.style.display = 'block';
                    return;
                }
            }
            const btn = q('#preregFinalBtn');
            btn.disabled = true; btn.textContent = 'Creando cuenta...';
            try {
                const { res, data } = await postJson('/api/v1/public/pre-register/complete', {
                    id: preregId,
                    password,
                    role,
                    alias
                });
                if (!res.ok) {
                    err.textContent = data.error || 'Error al crear la cuenta.';
                    err.style.display = 'block';
                    btn.disabled = false; btn.textContent = 'Crear cuenta';
                    return;
                }
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('is18Plus', 'true');
                sessionStorage.setItem('valid_entry', 'true');
                window.location.href = role === 'professional' ? '/profDashboard.html' : '/hogar.html';
            } catch (e) {
                err.textContent = 'Error de conexi\u00f3n.';
                err.style.display = 'block';
                btn.disabled = false; btn.textContent = 'Crear cuenta';
            }
        }

        function resizeImage(file) {
            return new Promise(function (resolve, reject) {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = function () {
                    const maxW = 1800;
                    const maxH = 1350;
                    let w = img.width;
                    let h = img.height;
                    if (w > maxW) { h = h * maxW / w; w = maxW; }
                    if (h > maxH) { w = w * maxH / h; h = maxH; }
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(w));
                    c.height = Math.max(1, Math.round(h));
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    const dataUrl = c.toDataURL('image/jpeg', 0.9);
                    URL.revokeObjectURL(url);
                    resolve(dataUrl);
                };
                img.onerror = function () {
                    URL.revokeObjectURL(url);
                    reject(new Error('No se pudo leer la imagen'));
                };
                img.src = url;
            });
        }

        function captureDni(side, useCamera) {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'image/*';
            // capture solo cuando el usuario pidio la camara. Sin capture, Android
            // muestra el selector con camara y galeria; con capture abre la camara.
            if (useCamera) inp.setAttribute('capture', 'environment');
            inp.style.display = 'none';
            document.body.appendChild(inp);
            inp.onchange = function (e) {
                const file = e.target.files && e.target.files[0];
                if (inp.parentNode) inp.parentNode.removeChild(inp);
                if (!file) return;
                processDniFile(file);
            };
            inp.click();
            // Si el usuario cancela el picker no hay evento: limpiamos el nodo.
            setTimeout(function () {
                if (inp.parentNode) inp.parentNode.removeChild(inp);
            }, 120000);
        }

        async function processDniFile(file) {
            if (!file.type || file.type.indexOf('image/') !== 0) {
                dniError = 'El archivo elegido no es una imagen.';
                dniScanState = 'failed';
                renderDniUi();
                return;
            }
            dniScanState = 'scanning';
            dniError = '';
            renderDniUi();
            let dataUrl;
            try {
                dataUrl = await resizeImage(file);
            } catch (e) {
                dniError = 'No pudimos leer la imagen. Prob\u00e1 con otra foto.';
                dniScanState = 'failed';
                renderDniUi();
                return;
            }
            dniFront = dataUrl;
            renderDniUi();
            await scanDni();
        }

        async function scanDni() {
            try {
                const { res, data } = await postJson('/api/v1/public/pre-register/scan-dni', {
                    id: preregId,
                    image: dniFront
                });
                if (!res.ok) {
                    dniError = data.error || 'No se pudo leer el c\u00f3digo de barras del DNI.';
                    dniScanState = 'failed';
                    renderDniUi();
                    return;
                }
                dniData = data.dni || {};
                dniScanState = 'ok';
                dniError = '';
                renderDniUi();
            } catch (e) {
                dniError = 'Error de conexi\u00f3n al validar el DNI.';
                dniScanState = 'failed';
                renderDniUi();
            }
        }

        renderDniUi();
    }

    const api = { reset, showStep, isNativeWebView };
    root._wizardApi = api;
    return api;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
