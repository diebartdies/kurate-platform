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
 * Uso:
 *   import { mountRegisterWizard } from '/js/registerWizard.js?v=1';
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
.register-wizard .dni-frame { cursor: pointer; }
`;

const WIZARD_HTML = `
    <div class="fm-step active" data-step="1">
        <h2 id="preregModalTitle">CreÃ¡ tu cuenta</h2>
        <p>Primero contanos quiÃ©n sos para registrarte.</p>
        <div class="fm-card" style="padding:0;border:none;background:none;">
            <div style="margin-bottom:1rem;">
                <label for="preregEmail">Email</label>
                <input type="email" id="preregEmail" class="fm-input" placeholder="tucorreo@ejemplo.com" autocomplete="email">
            </div>
            <div style="margin-bottom:1rem;">
                <label for="preregPhone">TelÃ©fono</label>
                <input type="tel" id="preregPhone" class="fm-input" placeholder="11 2345-6789" autocomplete="tel">
            </div>
            <div class="fm-error" id="preregStep1Error"></div>
            <button class="fm-btn fm-btn-block" id="preregStep1Btn">Enviar cÃ³digo SMS</button>
        </div>
    </div>

    <div class="fm-step" data-step="2">
        <h2>VerificÃ¡ tu telÃ©fono</h2>
        <p id="smsCodeLabel">IngresÃ¡ el cÃ³digo de 6 dÃ­gitos que enviamos por SMS.</p>
        <div class="fm-code-inputs" role="group" aria-labelledby="smsCodeLabel">
            <input type="text" maxlength="1" class="fm-code-digit" data-idx="0" id="smsCode0" name="smsCode0" aria-label="DÃ­gito 1 de 6">
            <input type="text" maxlength="1" class="fm-code-digit" data-idx="1" id="smsCode1" name="smsCode1" aria-label="DÃ­gito 2 de 6">
            <input type="text" maxlength="1" class="fm-code-digit" data-idx="2" id="smsCode2" name="smsCode2" aria-label="DÃ­gito 3 de 6">
            <input type="text" maxlength="1" class="fm-code-digit" data-idx="3" id="smsCode3" name="smsCode3" aria-label="DÃ­gito 4 de 6">
            <input type="text" maxlength="1" class="fm-code-digit" data-idx="4" id="smsCode4" name="smsCode4" aria-label="DÃ­gito 5 de 6">
            <input type="text" maxlength="1" class="fm-code-digit" data-idx="5" id="smsCode5" name="smsCode5" aria-label="DÃ­gito 6 de 6">
        </div>
        <div class="fm-error" id="preregStep2Error"></div>
        <button class="fm-btn fm-btn-block" id="preregStep2Btn" disabled>Verificar</button>
        <button class="fm-btn fm-btn-ghost fm-btn-block fm-btn-sm" id="preregResendSms" style="margin-top:0.5rem;">Reenviar cÃ³digo</button>
    </div>

    <div class="fm-step" data-step="3">
        <h2>VerificÃ¡ tu email</h2>
        <p>ElegÃ­ cÃ³mo verificar tu correo.</p>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
            <div id="preregGoogleMount"></div>
            <button class="fm-btn fm-btn-outline fm-btn-block" id="preregEmailCodeBtn">Verificar con cÃ³digo por email</button>
        </div>
        <div class="fm-error" id="preregStep3Error"></div>
    </div>

    <div class="fm-step" data-step="3b">
        <h2>CÃ³digo de email</h2>
        <p id="emailCodeLabel">Enviamos un cÃ³digo a tu email. Ingresalo abajo.</p>
        <div class="fm-code-inputs" role="group" aria-labelledby="emailCodeLabel">
            <input type="text" maxlength="1" class="fm-code-digit-email" data-idx="0" id="emailCode0" name="emailCode0" aria-label="DÃ­gito 1 de 6">
            <input type="text" maxlength="1" class="fm-code-digit-email" data-idx="1" id="emailCode1" name="emailCode1" aria-label="DÃ­gito 2 de 6">
            <input type="text" maxlength="1" class="fm-code-digit-email" data-idx="2" id="emailCode2" name="emailCode2" aria-label="DÃ­gito 3 de 6">
            <input type="text" maxlength="1" class="fm-code-digit-email" data-idx="3" id="emailCode3" name="emailCode3" aria-label="DÃ­gito 4 de 6">
            <input type="text" maxlength="1" class="fm-code-digit-email" data-idx="4" id="emailCode4" name="emailCode4" aria-label="DÃ­gito 5 de 6">
            <input type="text" maxlength="1" class="fm-code-digit-email" data-idx="5" id="emailCode5" name="emailCode5" aria-label="DÃ­gito 6 de 6">
        </div>
        <div class="fm-error" id="preregStep3bError"></div>
        <button class="fm-btn fm-btn-block" id="preregStep3bBtn" disabled>Verificar</button>
        <button class="fm-btn fm-btn-ghost fm-btn-block fm-btn-sm" id="preregResendEmail" style="margin-top:0.5rem;">Reenviar cÃ³digo</button>
        <button class="fm-btn fm-btn-ghost fm-btn-block fm-btn-sm" id="preregBackToGoogle" style="margin-top:0.25rem;">Volver y elegir otra opciÃ³n</button>
    </div>

    <div class="fm-step" data-step="4">
        <h2>Ya casi estÃ¡</h2>
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
 * Monta el wizard dentro de `target` (selector o nodo). Idempotente: si el
 * host ya esta montado devuelve la misma api.
 * options.defaultRole: 'professional' | 'user' â€” preselecciona el rol final.
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
                if (e.key === 'Backward' || e.key === 'Backspace') {
                    if (!this.value && i > 0) inputs[i - 1].focus();
                }
            });
        });
    }
    wireCodeInputs('.fm-code-digit', 'preregStep2Btn');
    wireCodeInputs('.fm-code-digit-email', 'preregStep3bBtn');

    // Step 1: email + telefono -> envia codigo SMS
    step1Btn.addEventListener('click', async function () {
        const email = q('#preregEmail').value.trim();
        const phone = q('#preregPhone').value.trim();
        const err = q('#preregStep1Error');
        err.style.display = 'none';

        if (!email) { err.textContent = 'IngresÃ¡ tu email.'; err.style.display = 'block'; return; }
        if (!phone) { err.textContent = 'IngresÃ¡ tu telÃ©fono.'; err.style.display = 'block'; return; }

        this.disabled = true;
        this.textContent = 'Enviando...';

        try {
            const r = await fetch('/api/v1/public/pre-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone })
            });
            const data = await r.json();
            if (!r.ok) { err.textContent = data.error || 'Error al enviar SMS.'; err.style.display = 'block'; this.disabled = false; this.textContent = 'Enviar cÃ³digo SMS'; return; }
            preregId = data.id;
            showStep(2);
        } catch (e) { err.textContent = 'Error de conexiÃ³n.'; err.style.display = 'block'; }
        this.disabled = false;
        this.textContent = 'Enviar cÃ³digo SMS';
    });

    // Step 2: verifica codigo SMS
    step2Btn.addEventListener('click', async function () {
        const err = q('#preregStep2Error');
        err.style.display = 'none';
        const code = Array.from(qa('.fm-code-digit')).map(i => i.value).join('');
        if (code.length !== 6) { err.textContent = 'IngresÃ¡ los 6 dÃ­gitos.'; err.style.display = 'block'; return; }
        this.disabled = true; this.textContent = 'Verificando...';
        try {
            const r = await fetch('/api/v1/public/pre-register/verify-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: preregId, code })
            });
            const data = await r.json();
            if (!r.ok) { err.textContent = data.error || 'CÃ³digo incorrecto.'; err.style.display = 'block'; this.disabled = false; this.textContent = 'Verificar'; return; }
            showStep(3);
            tryMountGoogle();
        } catch (e) { err.textContent = 'Error de conexiÃ³n.'; err.style.display = 'block'; }
        this.disabled = false; this.textContent = 'Verificar';
    });

    // Reenviar SMS
    q('#preregResendSms').addEventListener('click', async function () {
        const err = q('#preregStep2Error');
        err.style.display = 'none';
        try {
            const r = await fetch('/api/v1/public/pre-register/resend-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: preregId })
            });
            const data = await r.json();
            if (!r.ok) { err.textContent = data.error || 'Error.'; err.style.display = 'block'; return; }
            err.textContent = 'CÃ³digo reenviado.'; err.style.color = '#2ecc71'; err.style.display = 'block';
            setTimeout(() => { err.style.display = 'none'; err.style.color = '#e74c3c'; }, 3000);
        } catch (e) { err.textContent = 'Error de conexiÃ³n.'; err.style.display = 'block'; }
    });

    // Step 3: elegir verificar con codigo por email
    q('#preregEmailCodeBtn').addEventListener('click', async function () {
        const err = q('#preregStep3Error');
        err.style.display = 'none';
        showStep('3b');
        await sendEmailCode();
    });

    async function sendEmailCode() {
        const err = q('#preregStep3bError');
        err.style.display = 'none';
        try {
            const r = await fetch('/api/v1/public/pre-register/resend-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: preregId })
            });
            const data = await r.json();
            if (!r.ok) { err.textContent = data.error || 'Error.'; err.style.display = 'block'; }
        } catch (e) { err.textContent = 'Error de conexiÃ³n.'; err.style.display = 'block'; }
    }

    // Step 3b: verifica codigo de email
    step3bBtn.addEventListener('click', async function () {
        const err = q('#preregStep3bError');
        err.style.display = 'none';
        const code = Array.from(qa('.fm-code-digit-email')).map(i => i.value).join('');
        if (code.length !== 6) { err.textContent = 'IngresÃ¡ los 6 dÃ­gitos.'; err.style.display = 'block'; return; }
        this.disabled = true; this.textContent = 'Verificando...';
        try {
            const r = await fetch('/api/v1/public/pre-register/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: preregId, code })
            });
            const data = await r.json();
            if (!r.ok) { err.textContent = data.error || 'CÃ³digo incorrecto.'; err.style.display = 'block'; this.disabled = false; this.textContent = 'Verificar'; return; }
            showDeviceStep();
        } catch (e) { err.textContent = 'Error de conexiÃ³n.'; }
        this.disabled = false; this.textContent = 'Verificar';
    });

    // Reenviar codigo de email
    q('#preregResendEmail').addEventListener('click', async function () {
        const err = q('#preregStep3bError');
        err.style.display = 'none';
        try {
            const r = await fetch('/api/v1/public/pre-register/resend-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: preregId })
            });
            const data = await r.json();
            if (!r.ok) { err.textContent = data.error || 'Error.'; err.style.display = 'block'; return; }
            err.textContent = 'CÃ³digo reenviado.'; err.style.color = '#2ecc71'; err.style.display = 'block';
            setTimeout(() => { err.style.display = 'none'; err.style.color = '#e74c3c'; }, 3000);
        } catch (e) { err.textContent = 'Error de conexiÃ³n.'; err.style.display = 'block'; }
    });

    q('#preregBackToGoogle').addEventListener('click', function () {
        showStep(3);
        tryMountGoogle();
    });

    // Google: verifica el email (el telefono y el DNI se piden igual)
    async function tryMountGoogle() {
        const mount = q('#preregGoogleMount');
        mount.innerHTML = '';
        try {
            const r = await fetch('/api/v1/public/client-config');
            const data = await r.json();
            const clientId = data.success && data.data && data.data.googleClientId ? data.data.googleClientId : '';
            if (!clientId) { mount.innerHTML = ''; return; }
            mount.innerHTML = '<p style="font-size:0.85rem;margin-bottom:0.5rem;">O verificÃ¡ con Google</p><div id="googleBtnMount"></div>';
            await loadGoogleSdk();
            window.handleGooglePrereg = async (response) => {
                const err = q('#preregStep3Error');
                err.style.display = 'none';
                try {
                    const r2 = await fetch('/api/v1/public/pre-register/verify-email-google', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: preregId, token: response.credential })
                    });
                    const data2 = await r2.json();
                    if (!r2.ok) { err.textContent = data2.error || 'Error con Google.'; err.style.display = 'block'; return; }
                    usedGoogle = true;
                    showDeviceStep();
                } catch (e) { err.textContent = 'Error de conexiÃ³n.'; err.style.display = 'block'; }
            };
            window.google.accounts.id.initialize({ client_id: clientId, callback: window.handleGooglePrereg });
            window.google.accounts.id.renderButton(mount.querySelector('#googleBtnMount'), { theme: 'outline', size: 'large', type: 'standard', width: 380, text: 'continue_with', locale: 'es' });
        } catch (e) { /* sin google */ }
    }

    function loadGoogleSdk() {
        if (document.getElementById('google-jssdk')) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script'); s.id = 'google-jssdk';
            s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // Step 4: escaneo del DNI (funciona en celular con la camara y en
    // escritorio subiendo un archivo: antes la desktop quedaba bloqueada
    // pidiendo "seguir desde el celular").
    function showDeviceStep() {
        showStep(4);
        const msg = q('#preregDeviceMsg');
        const isMobile = /Mobi|Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
        let dniFront = null, dniBack = null;

        function dniFrame(side, label) {
            const filled = side === 'front' ? dniFront : dniBack;
            return `
                <div style="margin-bottom:1.5rem;">
                    <p style="font-weight:600;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 0.5rem;">${label}</p>
                    <div style="border:2px dashed #2a2a3e;border-radius:12px;padding:0.5rem;background:#0f0f1a;text-align:center;min-height:140px;display:flex;align-items:center;justify-content:center;transition:border-color 0.2s;" class="dni-frame" data-side="${side}">
                        ${filled ? `<img src="${filled}" style="max-width:100%;max-height:200px;border-radius:8px;display:block;">` : `<span style="color:#555;font-size:0.85rem;">${isMobile ? 'Toque para tomar foto' : 'Clic para elegir una foto'}</span>`}
                    </div>
                </div>
            `;
        }

        function renderDniUi() {
            const lead = isMobile
                ? 'TomÃ¡ la foto del frente de tu DNI para escanear el cÃ³digo de barras.'
                : 'SubÃ­ una foto o escaneo del frente de tu DNI (con el cÃ³digo de barras). Si la tenÃ©s en el celular, pasala a la computadora o usÃ¡ la webcam.';
            msg.innerHTML = `
                <p style="margin-bottom:1rem;">${lead}</p>
                ${dniFrame('front', 'Frente del DNI (con cÃ³digo de barras)')}
                <div id="dniActions" style="display:flex;flex-direction:column;gap:0.75rem;"></div>
                <div id="dniStatus" style="margin-top:0.75rem;"></div>
            `;
            const actions = q('#dniActions');

            if (!dniFront) {
                const btn = document.createElement('button');
                btn.className = 'fm-btn fm-btn-block';
                btn.textContent = isMobile ? 'Tomar foto frente del DNI' : 'Elegir foto del frente del DNI';
                btn.addEventListener('click', () => captureDni('front'));
                actions.appendChild(btn);
            } else {
                renderCompleteForm();
            }

            // Clic en el marco: si hay errorMostrado, muestra botÃ³n "Reintentar",
            // sino permite recargar la foto existente.
            msg.querySelectorAll('.dni-frame').forEach(frame => {
                frame.addEventListener('click', () => {
                    const side = frame.dataset.side;
                    if (side === 'front' && dniFront && window.dniErrorCount) {
                        // Ya fallÃ³ antes: preguntamos si quiere reintentar limpio
                        if (confirm('La lectura anterior fallÃ³. Â¿QuerÃ©s tomar una foto nueva del DNI?')) {
                            window.dniErrorCount = 0; // resetear contador
                            dniFront = null;
                            captureDni(side);
                        }
                        // si no hace nada, no vuelve a abrir el input automÃ¡ticamente
                        return;
                    }
                    // caso normal: permite cargar/change la foto
                    if (side === 'front' && dniFront) {
                        if (confirm('Â¿QuerÃ©s volver a tomar esta foto?')) {
                            dniFront = null;
                            captureDni(side);
                        }
                    }
                });
            });
        }

        function renderCompleteForm() {
            const actions = q('#dniActions');
            const proSel = defaultRole === 'professional' ? 'selected' : '';
            const userSel = defaultRole === 'user' ? 'selected' : '';
            // Con Google no se pide contraseÃ±a: la cuenta entra con Google
            // (el backend guarda un hash aleatorio, igual que googleAuth).
            const passwordBlock = usedGoogle ? '' : `
                <div style="margin-bottom:0.75rem;">
                    <label style="font-size:0.8rem;">ContraseÃ±a</label>
                    <input type="password" id="preregFinalPassword" placeholder="MÃ­nimo 6 caracteres" style="width:100%;padding:0.6rem;border:1px solid #2a2a3e;border-radius:8px;background:#0f0f1a;color:#fff;font-size:0.9rem;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:0.75rem;">
                    <label style="font-size:0.8rem;">Confirmar contraseÃ±a</label>
                    <input type="password" id="preregFinalPasswordConfirm" placeholder="RepetÃ­ la contraseÃ±a" style="width:100%;padding:0.6rem;border:1px solid #2a2a3e;border-radius:8px;background:#0f0f1a;color:#fff;font-size:0.9rem;box-sizing:border-box;">
                </div>`;
            const googleNote = usedGoogle ? '<p style="color:#7e7e7e;font-size:0.8rem;margin-bottom:0.75rem;">Entraste con Google: no hace falta crear una contraseÃ±a.</p>' : '';
            actions.innerHTML = `
                <p style="color:#2ecc71;font-size:0.85rem;margin-bottom:0.75rem;">DNI escaneado correctamente. CompletÃ¡ tu perfil.</p>
                ${passwordBlock}
                ${googleNote}
                <div style="margin-bottom:0.75rem;">
                    <label style="font-size:0.8rem;">Alias (mostrado pÃºblicamente)</label>
                    <input type="text" id="preregFinalAlias" placeholder="Tu nombre de fantasÃ­a" style="width:100%;padding:0.6rem;border:1px solid #2a2a3e;border-radius:8px;background:#0f0f1a;color:#fff;font-size:0.9rem;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:0.75rem;">
                    <label style="font-size:0.8rem;">Tipo de cuenta</label>
                    <select id="preregFinalRole" style="width:100%;padding:0.6rem;border:1px solid #2a2a3e;border-radius:8px;background:#0f0f1a;color:#fff;font-size:0.9rem;box-sizing:border-box;">
                        <option value="professional" ${proSel}>Profesional</option>
                        <option value="user" ${userSel}>Usuario</option>
                    </select>
                </div>
                <div id="preregFinalError" style="color:#e74c3c;font-size:0.85rem;display:none;margin-bottom:0.5rem;"></div>
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
                if (!password || password.length < 6) { err.textContent = 'La contraseÃ±a debe tener al menos 6 caracteres.'; err.style.display = 'block'; return; }
                if (password !== passwordConfirm) { err.textContent = 'Las contraseÃ±as no coinciden.'; err.style.display = 'block'; return; }
            }
            const btn = q('#preregFinalBtn');
            btn.disabled = true; btn.textContent = 'Creando cuenta...';
            try {
                const r = await fetch('/api/v1/public/pre-register/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: preregId, password, role, alias })
                });
                const data = await r.json();
                if (!r.ok) { err.textContent = data.error || 'Error al crear la cuenta.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Crear cuenta'; return; }
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('is18Plus', 'true');
                sessionStorage.setItem('valid_entry', 'true');
                window.location.href = role === 'professional' ? '/profDashboard.html' : '/hogar.html';
            } catch (e) { err.textContent = 'Error de conexiÃ³n.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Crear cuenta'; }
        }

        function _resizeImg(file, maxW, maxH, quality) {
            return new Promise(function (resolve) {
                var img = new Image();
                img.onload = function () {
                    var w = img.width, h = img.height;
                    if (w > maxW) { h = h * maxW / w; w = maxW; }
                    if (h > maxH) { w = w * maxH / h; h = maxH; }
                    var c = document.createElement('canvas'); c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    c.toBlob(function (b) { resolve(URL.createObjectURL(b)); }, 'image/jpeg', quality);
                };
                img.src = URL.createObjectURL(file);
            });
        }

        async function captureDni(side) { /* NEW FUNCTION STARTS HERE */
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'user';  // Permite elegir cámara O galería
            inp.onchange = function (e) {
                const file = e.target.files[0];
                if (!file) return;
                _resizeImg(file, 1600, 1200, 0.85).then(function (resizedUrl) {
                    var reader = new FileReader();
                    reader.onload = async function (ev) {
                        if (side === 'front') {
                            dniFront = ev.target.result;
                            renderDniUi();
                            const status = q('#dniStatus');
                            status.innerHTML = '<p style="font-size:0.85rem;">Analizando DNI...</p>';
                            try {
                                const r = await fetch('/api/v1/public/pre-register/scan-dni', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: preregId, image: dniFront })
                                });
                                const data = await r.json();
                                if (!r.ok) {
                                    // Incrementar contador de errores y mostrar mensaje mejorado
                                    window.dniErrorCount = (window.dniErrorCount || 0) + 1;
                                    const errMsg = data.error || 'Error al validar el DNI';
                                    status.innerHTML = '<p style="color:#e74c3c;font-size:0.85rem;">' + errMsg + '</p>';
                                    // Mostrar contador solo si hubo varios intentos
                                    if (window.dniErrorCount >= 2) {
                                        status.innerHTML += ' <span style="color:#7e7e7e;font-size:0.7rem;">Intento ' + window.dniErrorCount + ' fallido - la foto debe mostrar el DNI completo y bien iluminado, con el cÃ³digo de barras visible.</span>';
                                    }
                                    dniFront = null;
                                    renderDniUi();
                                    return;
                                }
                                const dni = data.dni || {};
                                // Resetear contador en Ã©xito
                                window.dniErrorCount = 0;
                                status.innerHTML = '<p style="color:#2ecc71;font-size:0.85rem;">DNI escaneado: ' + (dni.apellido || '') + ', ' + (dni.nombre || '') + ' (DNI ' + (dni.dni || '') + ')</p>';
                                renderCompleteForm();
                            } catch (err) {
                                window.dniErrorCount = (window.dniErrorCount || 0) + 1;
                                status.innerHTML = '<p style="color:#e74c3c;font-size:0.85rem;">Error de conexiÃ³n al validar el DNI.</p>';
                                if (window.dniErrorCount >= 2) {
                                    status.innerHTML += ' <span style="color:#7e7e7e;font-size:0.7rem;">Intento ' + window.dniErrorCount + ' fallido.</span>';
                                }
                                dniFront = null;
                                renderDniUi();
                            }
                        } else {
                            dniBack = ev.target.result;
                            renderDniUi();
                        }
                    };
                    fetch(resizedUrl).then(function (r) { return r.blob(); }).then(function (blob) { reader.readAsDataURL(blob); });
                });
            };
            inp.click();
        }

        renderDniUi();
    }

    const api = { reset, showStep };
    root._wizardApi = api;
    return api;
}
