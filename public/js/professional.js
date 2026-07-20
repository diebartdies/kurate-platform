import { BASE_ORIGIN, API_URL, CATEGORY_META, resolvePhotoSrc, appPath } from './globals.js';
import { showAlert, getPendingApprovalBannerHtml, getResubmissionBannerHtml, getGeneralRejectionBannerHtml } from './uiHelpers.js';
import { t, applyStaticTranslations } from './i18n.js';
import { activateAccessibleModal, deactivateAccessibleModal, announceMessage, confirmDialog } from './a11y.js';
import { renderSpecialtyDropdown, setupLocationDropdowns } from './helpers.js';
import { beginDashboardLoad, finishDashboardLoad, failDashboardLoad } from './dashboardShell.js';
import { navigateBack } from './ui.js';
import { logoutToEntrance } from './navReturn.js';
import { beginModalSession, endModalSession } from './navReturn.js';
import {
    buildQualitySelectOptions,
    loadCategoryPricingTable,
    needsProfessionalCategorySetup
} from './professionalSetup.js';

import {
    resolvePaymentInstructions,
    renderHowToPayHtml,
    DEFAULT_PAYMENT_INSTRUCTIONS
} from './paymentInstructions.js';

import {
    buildFullPhoneNumber,
    splitE164Phone,
    phonePickerHtml,
    initPhonePicker
} from './phoneCountryCodes.js';

let currentPaymentInstructions = DEFAULT_PAYMENT_INSTRUCTIONS;

const AVAILABILITY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function renderAvailabilityDayControls(container, selectedDays = []) {
    if (!container) return;
    const effectiveDays = Array.isArray(selectedDays) && selectedDays.length > 0 ? selectedDays : AVAILABILITY_DAYS;
    container.innerHTML = '';

    const presetWrap = document.createElement('div');
    presetWrap.style.cssText = 'display:flex; gap:15px; flex-wrap:wrap; flex-basis:100%; margin-bottom:4px;';
    const daysWrap = document.createElement('div');
    daysWrap.style.cssText = 'display:flex; gap:15px; flex-wrap:wrap; flex-basis:100%;';

    const syncPresets = () => {
        const checkedDays = Array.from(daysWrap.querySelectorAll('.avail-day-cb:checked')).map(cb => cb.value);
        const hasSameDays = (expected) => checkedDays.length === expected.length && expected.every(day => checkedDays.includes(day));
        const allPreset = presetWrap.querySelector('[data-availability-preset="all"]');
        const weekdaysPreset = presetWrap.querySelector('[data-availability-preset="weekdays"]');
        if (allPreset) allPreset.checked = hasSameDays(AVAILABILITY_DAYS);
        if (weekdaysPreset) weekdaysPreset.checked = hasSameDays(WEEKDAY_DAYS);
    };

    const setCheckedDays = (days) => {
        daysWrap.querySelectorAll('.avail-day-cb').forEach(cb => {
            cb.checked = days.includes(cb.value);
        });
        syncPresets();
    };

    [
        { label: 'All days', value: 'all', days: AVAILABILITY_DAYS },
        { label: 'Weekdays', value: 'weekdays', days: WEEKDAY_DAYS }
    ].forEach((preset) => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer; color: var(--primary-gold);';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.availabilityPreset = preset.value;
        cb.addEventListener('change', () => {
            if (cb.checked) setCheckedDays(preset.days);
            else syncPresets();
        });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(t(preset.label)));
        presetWrap.appendChild(lbl);
    });

    AVAILABILITY_DAYS.forEach((day) => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = day;
        cb.className = 'avail-day-cb';
        cb.checked = effectiveDays.includes(day);
        cb.addEventListener('change', syncPresets);
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(t(day)));
        daysWrap.appendChild(lbl);
    });

    container.appendChild(presetWrap);
    container.appendChild(daysWrap);
    syncPresets();
}

function attachOverlayToBody(id) {
    const el = document.getElementById(id);
    if (!el || el.parentElement === document.body) return;
    document.body.appendChild(el);
}

export function hideProfessionalPaymentOverlays() {
    const overlays = document.getElementById('dashboardOverlays');
    const sidebar = document.getElementById('profPaymentSidebar');
    const paymentSection = document.getElementById('paymentSection');
    if (overlays) {
        overlays.classList.add('hidden');
        overlays.style.display = 'none';
    }
    if (sidebar) sidebar.classList.add('hidden');
    if (paymentSection) paymentSection.classList.add('hidden');
}

export function mountProfessionalPaymentOverlays() {
    attachOverlayToBody('paymentModalOverlay');
    attachOverlayToBody('howToPayOverlay');
    attachOverlayToBody('deleteProfileOverlay');

    const sidebar = document.getElementById('profPaymentSidebar');
    const paymentSection = document.getElementById('paymentSection');
    if (sidebar) sidebar.classList.remove('hidden');
    if (paymentSection) paymentSection.classList.remove('hidden');
}

export function renderProfessionalMainDashboardShell(content) {
    content.innerHTML = `
        <h2 class="gold-text" style="margin-bottom: 16px;">Your Sanctuary Dashboard</h2>
        <div style="text-align: center; margin-bottom: 28px;">
            <a href="${appPath('notas-interes.html')}" class="interest-notes-dashboard-link" style="display:inline-block;padding:12px 22px;border:1px solid rgba(212,175,55,0.45);border-radius:8px;color:var(--primary-gold);text-decoration:none;font-weight:600;letter-spacing:0.5px;">${t('Notes of Interest')}</a>
        </div>
        <div class="grid">
            <div class="card">
                <h3 class="gold-text">Identity Status</h3>
                <p id="verificationStatus" style="margin: 15px 0; font-size: 1.2rem;">Checking...</p>
                <div id="revelationStatus" class="tag" style="display: inline-block;">Veiled</div>
            </div>
            <div class="card">
                <h3 class="gold-text">Duo Connection</h3>
                <div id="duoStatus" style="margin: 15px 0;"><p>Not currently in a Duo.</p></div>
            </div>
            <div class="card">
                <h3 class="gold-text">Your Performance</h3>
                <div style="margin: 15px 0; display: flex; justify-content: space-around;">
                    <div style="text-align: center;">
                        <h4 id="statProfileViews" style="font-size: 2rem; color: var(--primary-gold);">0</h4>
                        <p style="font-size: 0.8rem; opacity: 0.8;">Profile Views</p>
                    </div>
                    <div style="text-align: center;">
                        <h4 id="statWaClicks" style="font-size: 2rem; color: #00ff50;">0</h4>
                        <p style="font-size: 0.8rem; opacity: 0.8;">WhatsApp Clicks</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="card" style="margin-top: 40px;">
            <h3 class="gold-text" style="margin-bottom: 25px;">Edit Profile</h3>
            <form id="updateProfileForm">
                <div id="updateAlert" class="alert hidden"></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                    <div style="grid-column: 1 / -1;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
                            <div><label>First Name</label><input type="text" id="upFirstName"></div>
                            <div><label>Surname</label><input type="text" id="upSurname"></div>
                            <div><label>Middle Name</label><input type="text" id="upMiddleName"></div>
                            <div><label>ID Number</label><input type="text" id="upIdNumber"></div>
                            <div><label>Birth Date</label><input type="date" id="upBirthDate"></div>
                            <div><label>Age</label><input type="text" id="upAge" readonly></div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
                            <div><label>Mobile</label>${phonePickerHtml('upMobile', '', 'upMobilePhone')}</div>
                            <div><label>Street</label><input type="text" id="upStreet"></div>
                            <div><label>Number</label><input type="text" id="upStreetNumber"></div>
                            <div><label>Floor</label><input type="text" id="upFloor"></div>
                            <div><label>Apartment</label><input type="text" id="upApartment"></div>
                        </div>
                    </div>
                    <div>
                        <label>Alias</label><input type="text" id="upAlias">
                        <label>Bio</label><textarea id="upBio" rows="4"></textarea>
                    </div>
                    <div>
                        <label>Category</label><div id="displayQuality" class="quality-badge quality-standard">Standard</div>
                        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="upOwnApartment"> Own apartment</label>
                        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="upFantasyWardrobe"> Fantasy wardrobe</label>
                        <select id="upServices" multiple size="5" style="display:none;">
                            <option value="Massage">Massage</option>
                            <option value="Virtual Connection">Virtual Connection</option>
                        </select>
                        <label>Attributes</label><input type="text" id="upAttributes">
                        <label>Measurements</label><input type="text" id="upMeasurements">
                        <label>Height</label><input type="text" id="upHeight">
                    </div>
                </div>
                <button type="submit">Update Profile</button>
            </form>
        </div>
    `;
}

/** Welcome guide, billing reminders, and payment upload UI — professionals only (not admin). */
export function injectProfessionalDashboardGuides(content, data, insertRef) {
    const user = data.data;
    const prof = user.professionalProfile || {};
    const isApproved = user.verificationStatus === 'approved';

    if (!localStorage.getItem('hideWelcomeGuide') && !document.getElementById('welcomeGuideSection')) {
        const welcomeSection = document.createElement('div');
        welcomeSection.id = 'welcomeGuideSection';
        welcomeSection.className = 'card';
        welcomeSection.style.marginBottom = '20px';
        welcomeSection.style.background = 'rgba(212, 175, 55, 0.05)';
        welcomeSection.style.border = '1px solid rgba(212, 175, 55, 0.4)';

        welcomeSection.innerHTML = `
            <div class="welcome-guide-header">
                <h3 class="gold-text welcome-guide-title">📖 ${t('Welcome Guide & How It Works')}</h3>
                <button type="button" id="dismissWelcomeBtn" class="welcome-guide-dismiss">${t('Dismiss')}</button>
            </div>
            <ul class="welcome-guide-list">
                <li style="margin-bottom: 10px;"><strong>${t('Free evaluation month:')}</strong> ${t('Your first 30 days are free. During this period your profile appears in a random category so you can experience how visibility works.')}</li>
                <li style="margin-bottom: 10px;"><strong>${t('Your chosen category:')}</strong> ${t('After approval, choose your category and specialties in your model dashboard. After your first validated payment, you move to that category rate.')}</li>
                <li style="margin-bottom: 10px;"><strong>${t('Vacations:')}</strong> ${t('While on vacation your profile shows as inactive. Up to 15 vacation days per month are discounted from your monthly balance.')}</li>
                <li style="margin-bottom: 10px;"><strong>${t('Monthly payment:')}</strong> ${t('Use Pago mensual to upload your receipt. Tap Cómo pagar for transfer details.')}</li>
                <li style="margin-bottom: 10px;"><strong>${t('Privacy Guarantee:')}</strong> ${t('Our platform uses zero cookies and zero third-party trackers. Your identity and client interactions remain completely confidential.')}</li>
            </ul>
        `;
        content.insertBefore(welcomeSection, insertRef);

        document.getElementById('dismissWelcomeBtn').addEventListener('click', () => {
            localStorage.setItem('hideWelcomeGuide', 'true');
            welcomeSection.remove();
        });
    }

    if (!document.getElementById('notificationCenter')) {
        const notifSection = document.createElement('div');
        notifSection.id = 'notificationCenter';
        notifSection.className = 'card fileteado-section';
        notifSection.style.marginBottom = '20px';
        notifSection.style.border = '1px solid var(--primary-gold)';

        let alertsHtml = '';

        if (user.allowResubmission) {
            alertsHtml += getResubmissionBannerHtml(user).replace('id="resubmissionSection"', 'id="dashboardResubmissionNotice"');
            alertsHtml += `<div style="margin-bottom: 10px;"><a href="${appPath('profDashboard.html')}" style="display:inline-block;padding:10px 16px;background:var(--primary-gold);color:var(--dark-bg);text-decoration:none;font-weight:bold;border-radius:4px;">${t('Open profile editor to fix verification')}</a></div>`;
        } else if (user.verificationStatus === 'pending') {
            alertsHtml += `<div style="background: rgba(255,165,0,0.12); border-left: 4px solid orange; padding: 12px 15px; margin-bottom: 10px; line-height: 1.5;">⏳ <strong>${t('Pending Admin Approval')}</strong><br><span style="font-size: 0.9rem; color: #ddd;">${t('Your profile is under review (typically up to 48 hours). Profile changes can only be made after admin approval. You will receive an email when your account is approved — please check your Spam folder too.')}</span></div>`;
        } else if (user.verificationStatus === 'rejected') {
            alertsHtml += getGeneralRejectionBannerHtml(user.rejectionDetails);
        }

        if (isApproved && (!prof.photos || prof.photos.length === 0)) {
            alertsHtml += `<div style="background: rgba(212,175,55,0.1); border-left: 4px solid var(--primary-gold); padding: 15px; margin-bottom: 10px; line-height: 1.5;">🎉 <strong style="color: var(--primary-gold);">${t('Welcome to KuraTe!')}</strong><br>${t('You are now approved and ready to upload your personal photos. Note: The first photo will be treated as your profile Thumbnail. You can drag and drop photos below to change their order at any time.')}</div>`;
        }

        if (!data.isReadyForTransactions && isApproved) {
            alertsHtml += `<div style="background: rgba(255,0,0,0.1); border-left: 4px solid var(--accent-red); padding: 10px; margin-bottom: 10px;">💰 ${t('Rate Update: Please acknowledge the new pricing rates in the alert above to maintain your visibility.')}</div>`;
        }

        if (prof.isEvaluationPeriod && prof.subscriptionStatus === 'trial') {
            const trialEnd = new Date(prof.trialEndDate);
            const desired = prof.desiredQuality || prof.quality || 'Standard';
            alertsHtml += `<div style="background: rgba(212,175,55,0.1); border-left: 4px solid var(--primary-gold); padding: 15px; margin-bottom: 10px;">
                💎 <strong>${t('Evaluation period (free month)')}</strong><br>
                ${t('Visible category now')}: <strong>${prof.quality || 'Standard'}</strong> (${t('random during evaluation')}).<br>
                ${t('Your chosen category after first validated payment')}: <strong>${desired}</strong>.<br>
                ${t('Trial ends')}: ${trialEnd.toLocaleDateString()}.
            </div>`;
        } else if (prof.subscriptionStatus === 'trial') {
            const trialEnd = new Date(prof.trialEndDate);
            const now = new Date();
            if (trialEnd > now) {
                const endYear = trialEnd.getFullYear();
                const endMonth = trialEnd.getMonth();
                const daysInMonth = new Date(endYear, endMonth + 1, 0).getDate();
                const remainingDays = daysInMonth - trialEnd.getDate() + 1;

                let proratedAmt = 0;
                if (remainingDays > 0 && trialEnd.getDate() !== 1) {
                    const globalPrices = data.globalPricing || { Standard: 15000, Silver: 20000, Gold: 30000, Premium: 40000, verificados: 50000 };
                    const catPrice = globalPrices[prof.quality || 'Standard'];
                    const pricePerDay = catPrice / daysInMonth;
                    proratedAmt = Math.round(pricePerDay * remainingDays);
                }

                let trialBlock = t('First Month Free: Your trial ends on {date}.').replace('{date}', trialEnd.toLocaleDateString());
                if (proratedAmt > 0) {
                    trialBlock += `<br>${t('Since your trial ends mid-month, you will only be charged a prorated amount of {amount} ARS for the remainder of that month.').replace('{amount}', `<strong>${new Intl.NumberFormat('es-AR').format(proratedAmt)}</strong>`)}`;
                }
                alertsHtml += `<div style="background: rgba(212,175,55,0.1); border-left: 4px solid var(--primary-gold); padding: 15px; margin-bottom: 10px;">💎 ${trialBlock}</div>`;
            }
        }

        if (prof.subscriptionStatus === 'suspended') {
            const pendingInv = (prof.invoices || []).find(i => i.status === 'pending');
            const feeText = pendingInv && pendingInv.lateFeeApplied
                ? ` ${t('A 2% late fee has been applied. Your new balance is {amount} ARS.').replace('{amount}', `$${new Intl.NumberFormat('es-AR').format(pendingInv.amount)}`)}`
                : '';
            alertsHtml += `<div style="background: rgba(255,0,0,0.1); border-left: 4px solid var(--accent-red); padding: 10px; margin-bottom: 10px;">🛑 <strong>${t('Account Suspended: Your profile is hidden due to unpaid balances.')}</strong>${feeText} ${t('Upload your receipt to restore access.')}</div>`;
        }

        if (!alertsHtml) {
            alertsHtml = `<div style="color: #888; font-style: italic;">${t('No pending actions at this time.')}</div>`;
        }

        notifSection.innerHTML = `
            <h3 class="gold-text" style="margin-bottom: 15px;">🔔 ${t('Notifications & Pending Items')}</h3>
            ${alertsHtml}
        `;
        content.insertBefore(notifSection, insertRef);
    }

    injectProfessionalSupportSection(content, insertRef);

    mountProfessionalPaymentOverlays();
    setupProfessionalPaymentUI(data.paymentInstructions);
}

/** "Request help" section + modal that posts an internal support message to the admin. */
export function injectProfessionalSupportSection(content, insertRef) {
    if (document.getElementById('supportHelpSection')) return;

    const supportSection = document.createElement('div');
    supportSection.id = 'supportHelpSection';
    supportSection.className = 'card';
    supportSection.style.marginBottom = '20px';
    supportSection.style.border = '1px solid rgba(37, 211, 102, 0.5)';

    supportSection.innerHTML = `
        <h3 class="gold-text" style="margin-bottom: 10px;">🆘 ${t('Need help?')}</h3>
        <p style="color: #ccc; line-height: 1.6; margin-bottom: 15px;">${t('Have a question or a problem? Send a message to the platform admin and we will get back to you.')}</p>
        <button type="button" id="btnRequestAdminHelp" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;border:none;padding:10px 18px;border-radius:4px;font-weight:bold;cursor:pointer;">
            💬 ${t('Request help / Solicitar ayuda al admin')}
        </button>
    `;
    content.insertBefore(supportSection, insertRef);

    document.getElementById('btnRequestAdminHelp')?.addEventListener('click', () => {
        openSupportModal();
    });
}

let supportModalOverlay = null;

function openSupportModal() {
    if (!supportModalOverlay) {
        supportModalOverlay = document.createElement('div');
        supportModalOverlay.id = 'supportRequestOverlay';
        supportModalOverlay.className = 'payment-modal-overlay';
        Object.assign(supportModalOverlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.85)',
            zIndex: '100001',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        });
        document.body.appendChild(supportModalOverlay);
    }

    supportModalOverlay.innerHTML = `
        <div class="card payment-modal-panel" data-modal-panel style="max-width:480px;width:100%;">
            <h3 id="supportModalTitle" class="gold-text" style="margin-top:0;">🆘 ${t('Request help / Solicitar ayuda al admin')}</h3>
            <p style="color:#ccc;line-height:1.6;margin-bottom:12px;">${t('Describe your problem or question below. The admin will get back to you.')}</p>
            <label for="supportProblemText" style="display:block;margin-bottom:6px;color:#ddd;">${t('Your problem or question')}</label>
            <textarea id="supportProblemText" rows="5" style="width:100%;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:10px;box-sizing:border-box;"></textarea>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">
                <button type="button" id="supportCancelBtn" style="flex:1;min-width:120px;background:transparent;border:1px solid var(--primary-gold);color:var(--primary-gold);padding:10px;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Cancel')}</button>
                <button type="button" id="supportSendBtn" style="flex:1;min-width:120px;padding:10px;border-radius:4px;cursor:pointer;font-weight:bold;border:none;background:#25D366;color:#fff;">${t('Send request')}</button>
            </div>
        </div>`;

    const close = () => {
        deactivateAccessibleModal(supportModalOverlay);
        supportModalOverlay.style.display = 'none';
        document.body.style.overflow = '';
    };

    document.getElementById('supportCancelBtn').onclick = close;
    supportModalOverlay.onclick = (e) => {
        if (e.target === supportModalOverlay) close();
    };

    document.getElementById('supportSendBtn').onclick = async () => {
        const sendBtn = document.getElementById('supportSendBtn');
        const problem = (document.getElementById('supportProblemText')?.value || '').trim();
        if (!problem) {
            announceMessage('Please describe your problem or question.', { isError: true });
            document.getElementById('supportProblemText')?.focus();
            return;
        }
        sendBtn.disabled = true;
        const ok = await submitSupportRequest(problem);
        sendBtn.disabled = false;
        if (ok) {
            close();
            showAlert(null, 'Your request was sent. The admin will get back to you.', false);
        }
    };

    supportModalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    activateAccessibleModal(supportModalOverlay, {
        labelId: 'supportModalTitle',
        onClose: close,
        initialFocusSelector: '#supportProblemText'
    });
}

function supportAuthHeaders(extra = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...extra };
    if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

async function submitSupportRequest(problem) {
    try {
        const res = await fetch(`${API_URL}/support`, {
            method: 'POST',
            headers: supportAuthHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ message: problem })
        });
        const json = await res.json();
        if (res.ok && json.success) return true;
        showAlert(null, json.error || 'Could not send your request. Please try again later.', true);
        return false;
    } catch (_) {
        showAlert(null, 'Could not send your request. Please try again later.', true);
        return false;
    }
}

function showPaymentOverlay(overlayId) {
    const el = document.getElementById(overlayId);
    if (!el) return;
    const wasHidden = el.classList.contains('hidden');
    el.classList.remove('hidden');
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (wasHidden) beginModalSession();
    const titleIds = {
        paymentModalOverlay: 'paymentModalTitle',
        howToPayOverlay: 'howToPayModalTitle'
    };
    activateAccessibleModal(el, {
        labelId: titleIds[overlayId],
        onClose: () => hidePaymentOverlay(overlayId),
        initialFocusSelector: '.payment-modal-close'
    });
}

function hidePaymentOverlay(overlayId) {
    const el = document.getElementById(overlayId);
    if (!el) return;
    deactivateAccessibleModal(el);
    const wasVisible = !el.classList.contains('hidden');
    el.classList.add('hidden');
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    const payOpen = !document.getElementById('paymentModalOverlay')?.classList.contains('hidden');
    const howOpen = !document.getElementById('howToPayOverlay')?.classList.contains('hidden');
    if (!payOpen && !howOpen) document.body.style.overflow = '';
    if (wasVisible) endModalSession();
}

function fillHowToPayContent(paymentInstructions) {
    currentPaymentInstructions = resolvePaymentInstructions(paymentInstructions);
    const howToPayContent = document.getElementById('howToPayContent');
    if (howToPayContent) {
        howToPayContent.innerHTML = renderHowToPayHtml(currentPaymentInstructions);
    }
}

let professionalPaymentUiBound = false;

function onPaymentEscapeKey(e) {
    if (e.key !== 'Escape') return;
    hidePaymentOverlay('howToPayOverlay');
    hidePaymentOverlay('paymentModalOverlay');
}

// Upload Payment Receipt
export function setupProfessionalPaymentUI(paymentInstructions) {
    mountProfessionalPaymentOverlays();

    const paymentSection = document.getElementById('paymentSection');
    if (paymentSection) paymentSection.classList.remove('hidden');
    currentPaymentInstructions = resolvePaymentInstructions(paymentInstructions);

    if (professionalPaymentUiBound) return;
    professionalPaymentUiBound = true;

    document.getElementById('btnOpenPaymentModal')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPaymentOverlay('paymentModalOverlay');
    });

    document.getElementById('btnHowToPay')?.addEventListener('click', (e) => {
        e.preventDefault();
        fillHowToPayContent(currentPaymentInstructions);
        showPaymentOverlay('howToPayOverlay');
    });

    document.getElementById('closePaymentModal')?.addEventListener('click', (e) => {
        e.preventDefault();
        hidePaymentOverlay('paymentModalOverlay');
    });

    document.getElementById('closeHowToPayModal')?.addEventListener('click', (e) => {
        e.preventDefault();
        hidePaymentOverlay('howToPayOverlay');
    });

    document.getElementById('btnCloseHowToPayFooter')?.addEventListener('click', (e) => {
        e.preventDefault();
        hidePaymentOverlay('howToPayOverlay');
    });

    document.getElementById('paymentModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'paymentModalOverlay') hidePaymentOverlay('paymentModalOverlay');
    });

    document.getElementById('howToPayOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'howToPayOverlay') hidePaymentOverlay('howToPayOverlay');
    });

    document.addEventListener('keydown', onPaymentEscapeKey);
}

let profileFormBound = false;

export function bindProfessionalProfileForm() {
    const updateProfileForm = document.getElementById('updateProfileForm');
    if (!updateProfileForm || updateProfileForm.dataset.bound === '1') return;
    updateProfileForm.dataset.bound = '1';

    let isSaving = false;
    
    window.saveProfessionalProfile = async (silent = false) => {
        if (isSaving) return;
        isSaving = true;
        const alertEl = document.getElementById('updateAlert');
        const formData = new FormData();

        // Append all text fields
        formData.append('firstName', document.getElementById('upFirstName')?.value || '');
        formData.append('surname', document.getElementById('upSurname')?.value || '');
        formData.append('middleName', document.getElementById('upMiddleName')?.value || '');
        formData.append('idNumber', document.getElementById('upIdNumber')?.value || '');
        formData.append('birthDate', document.getElementById('upBirthDate')?.value || '');
        {
            const upDial = document.getElementById('upMobileDial')?.value || '+54';
            const upLocal = document.getElementById('upMobilePhone')?.value || '';
            formData.append('mobilePhone', buildFullPhoneNumber(upDial, upLocal));
        }
        formData.append('street', document.getElementById('upStreet')?.value || '');
        formData.append('number', document.getElementById('upStreetNumber')?.value || '');
        formData.append('floor', document.getElementById('upFloor')?.value || '');
        formData.append('apartment', document.getElementById('upApartment')?.value || '');

        formData.append('alias', document.getElementById('upAlias').value);
        formData.append('bio', document.getElementById('upBio').value);
        formData.append('hasOwnApartment', document.getElementById('upOwnApartment').checked);
        formData.append('hasFantasyWardrobe', document.getElementById('upFantasyWardrobe').checked);
        formData.append('quality', document.getElementById('upQuality')?.value || '');
        
        const upIsExposed = document.getElementById('upIsExposed');
        if (upIsExposed) formData.append('isExposed', upIsExposed.checked);

        const upPaysMonthly = document.getElementById('upPaysMonthly');
        if (upPaysMonthly) formData.append('paysMonthlyCharges', upPaysMonthly.checked);
        
        const dashboardSpecCbs = document.querySelectorAll('.dashboard-specialty-cb');
        if (dashboardSpecCbs.length > 0) {
            const selectedSpecs = Array.from(dashboardSpecCbs).filter(cb => cb.checked).map(cb => cb.value).join(',');
            formData.set('services', selectedSpecs);
        } else {
            const upServicesEl = document.getElementById('upServices');
            let servicesVal = '';
            if (upServicesEl) {
                if (upServicesEl.tagName === 'SELECT') {
                    servicesVal = Array.from(upServicesEl.selectedOptions).map(opt => opt.value).join(',');
                } else {
                    servicesVal = upServicesEl.value;
                }
            }
            formData.append('services', servicesVal);
        }
        
        const upProv = document.getElementById('upProvince');
        const upCity = document.getElementById('upCity');
        const upNeigh = document.getElementById('upNeighborhood');
        
        if (upProv) {
            formData.append('province', upProv.value);
            if (upProv.value.trim().toLowerCase() === 'caba') {
                formData.append('city', '');
                if (upCity) formData.append('neighborhood', upCity.value);
            } else {
                if (upCity) formData.append('city', upCity.value);
                if (upNeigh) formData.append('neighborhood', upNeigh.value);
            }
        }

        formData.append('measurements', document.getElementById('upMeasurements').value);
        formData.append('height', document.getElementById('upHeight').value);
        {
            const waDial = document.getElementById('upWaDial')?.value || '+54';
            const waLocal = document.getElementById('upWaInput')?.value || '';
            const waFull = buildFullPhoneNumber(waDial, waLocal);
            const mobDial = document.getElementById('upMobileDial')?.value || '+54';
            const mobLocal = document.getElementById('upMobilePhone')?.value || '';
            formData.append('whatsappNumber', waFull || buildFullPhoneNumber(mobDial, mobLocal));
        }

        formData.append('postalCode', document.getElementById('upPostCode')?.value || '');
        formData.append('instagram', document.getElementById('upInstagram')?.value || '');
        formData.append('facebook', document.getElementById('upFacebook')?.value || '');
        
        const upWhStart = document.getElementById('upWorkingHoursStart');
        const upWhEnd = document.getElementById('upWorkingHoursEnd');
        const upWDays = document.getElementById('upWorkingDays');
        if (upWhStart) formData.append('workingHoursStart', upWhStart.value);
        if (upWhEnd) formData.append('workingHoursEnd', upWhEnd.value);
        
        formData.append('vacationStart', document.getElementById('upVacationStart')?.value || '');
        formData.append('vacationEnd', document.getElementById('upVacationEnd')?.value || '');
        if (upWDays) {
            const dVal = upWDays.tagName === 'SELECT' ? Array.from(upWDays.selectedOptions).map(o => o.value).join(',') : upWDays.value;
            formData.append('workingDays', dVal);
        }

        // Overwrite the FormData payload with values from the new Availability block if they exist
        const availStart = document.getElementById('upAvailStart');
        const availEnd = document.getElementById('upAvailEnd');
        if (availStart) formData.set('workingHoursStart', availStart.value);
        if (availEnd) formData.set('workingHoursEnd', availEnd.value);
        
        const availCbs = document.querySelectorAll('.avail-day-cb');
        if (availCbs && availCbs.length > 0) {
            const selectedDays = Array.from(availCbs).filter(cb => cb.checked).map(cb => cb.value).join(',');
            formData.set('workingDays', selectedDays);
        }

        const existingPhotos = [];
        const photoElements = document.querySelectorAll('#photoGrid .photo-item img');

        photoElements.forEach(img => {
            if (newFilesMap.has(img.src)) {
                // It's a new file, append the File object for multer
                formData.append('photos', newFilesMap.get(img.src));
            } else {
                // It's an existing photo URL that we want to keep
                let photoUrl = img.getAttribute('data-original-url') || img.getAttribute('src');
                if (photoUrl && photoUrl.startsWith('http')) {
                    try {
                        // Strip domain to only save the relative path if it's a local upload
                        const urlObj = new URL(photoUrl);
                        if (urlObj.pathname.startsWith('/uploads/')) {
                            photoUrl = urlObj.pathname;
                        }
                    } catch(e) {}
                }
                existingPhotos.push(photoUrl);
            }
        });

        // Append the list of existing photos as a JSON string (skip when only text fields changed)
        if (photosDirty) {
            formData.append('existingPhotos', JSON.stringify(existingPhotos));
        } else {
            formData.append('existingPhotos', '__preserve__');
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/professionals/updateprofile`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: formData
            });
            
            if (!res.ok) {
                if (res.status === 413) throw new Error("Payload Too Large. Nginx limit exceeded.");
                if (res.status === 502) throw new Error("Bad Gateway. The server is restarting.");
            }

            const data = await res.json();
            if (data.success && photosDirty) {
                photosDirty = false;
            }
            let justFinishedCategorySetup = false;
            if (data.success && data.data) {
                localStorage.setItem('user', JSON.stringify(data.data));
                if (window.profNeedsCategorySetup && !needsProfessionalCategorySetup(data.data)) {
                    justFinishedCategorySetup = true;
                    window.profNeedsCategorySetup = false;
                    document.getElementById('profSetupBanner')?.remove();
                    const personalSection = document.getElementById('profPersonalInfoSection');
                    if (personalSection) personalSection.style.boxShadow = '';
                }
            }
            if (!silent) {
                if (data.success) {
                    if (justFinishedCategorySetup) {
                        showAlert(alertEl, t('Category and specialties saved. Continue completing your profile below.'), false);
                    } else {
                        showAlert(alertEl, 'Profile updated successfully!', false);
                    }
                } else {
                    showAlert(alertEl, data.error || 'Update failed');
                }
            }
        } catch (err) {
            if (!silent) showAlert(alertEl, err.message || 'Server connection error');
        } finally {
            isSaving = false;
        }
    };

    // Manual Submit Fallback
    updateProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        window.saveProfessionalProfile(false);
    });

    // Auto-Save Triggers
    const formInputs = updateProfileForm.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
        if (input.type === 'file') return; // Handled specially by addPhotoToGrid
        input.addEventListener('blur', () => window.saveProfessionalProfile(true));
        if (input.type === 'checkbox' || input.type === 'radio' || input.tagName === 'SELECT') {
            input.addEventListener('change', () => window.saveProfessionalProfile(true));
        }
    });

    window.addEventListener('beforeunload', () => {
        window.saveProfessionalProfile(true);
    });
}

bindProfessionalProfileForm();

const receiptForm = document.getElementById('receiptForm');
if (receiptForm) {
    receiptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const receiptFile = document.getElementById('receiptFile').files[0];
        const alert = document.getElementById('receiptAlert');
        
        if (!receiptFile) {
            showAlert(alert, 'Please select a file or photo to upload.', true);
            return;
        }
        
        const formData = new FormData();
        formData.append('receipt', receiptFile);
        
        try {
            const token = localStorage.getItem('token');
            const btn = receiptForm.querySelector('button[type="submit"]') || document.getElementById('btnUploadReceipt');
            const originalText = btn ? btn.textContent : 'Upload';
            if (btn) { btn.textContent = t('Uploading...'); btn.disabled = true; }
            // Added credentials: 'include' to ensure auth cookie is sent
            const res = await fetch(`${API_URL}/professionals/upload-receipt`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: formData
            });
            const data = await res.json();
            
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
            
            if (data.success) {
                showAlert(alert, 'Receipt submitted. It will be verified by admin.', false);
                receiptForm.reset();
                hidePaymentOverlay('paymentModalOverlay');
            } else {
                showAlert(alert, data.error || 'Failed to upload receipt');
            }
        } catch (err) {
            showAlert(alert, 'Server connection error');
        }
    });
}

// Acknowledge Rate
const ackRateBtn = document.getElementById('ackRateBtn');
if (ackRateBtn) {
    ackRateBtn.addEventListener('click', async () => {
        try {
            const token = localStorage.getItem('token');
            // Added credentials: 'include' to ensure auth cookie is sent
            const res = await fetch(`${API_URL}/professionals/acknowledge-rate`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('rateAlert').classList.add('hidden');
            }
        } catch (err) {
            console.error('Failed to acknowledge rate');
        }
    });
}

export async function openPendingConnectionsModal() {
    let modal = document.getElementById('pendingConnectionsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pendingConnectionsModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&#8592; Back to Dashboard';
        Object.assign(closeBtn.style, {
            alignSelf: 'flex-start', marginBottom: '15px', padding: '8px 12px',
            background: 'transparent', border: '1px solid var(--primary-gold)',
            color: 'var(--primary-gold)', borderRadius: '4px', cursor: 'pointer'
        });
        closeBtn.onclick = () => {
            modal.style.display = 'none';
            endModalSession();
        };

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '1000px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 20px;">Pending Connection Requests</h2>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--primary-gold);">
                            <th style="padding: 10px;">Date</th>
                            <th style="padding: 10px;">Requester</th>
                            <th style="padding: 10px;">Message</th>
                            <th style="padding: 10px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="connectionsTableBody">
                        <tr><td colspan="4" style="padding: 10px; text-align: center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        modal.appendChild(closeBtn);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);
    }

    beginModalSession();
    modal.style.display = 'flex';
    loadPendingConnections();
}

export async function loadPendingConnections() {
    const tbody = document.getElementById('connectionsTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="padding: 10px; text-align: center;">Loading...</td></tr>';
    
    try {
        const token = localStorage.getItem('token');
        // Added credentials: 'include' to ensure auth cookie is sent
        const res = await fetch(`${API_URL}/transactions/requests`, { 
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success) {
            tbody.innerHTML = '';
            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding: 10px; text-align: center;">No pending requests.</td></tr>';
                return;
            }
            
            data.data.forEach(req => {
                const requesterName = req.requester ? (req.requester.name || req.requester.email) : 'Unknown User';
                const message = req.message || 'No message provided';

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #333';
                tr.innerHTML = `
                    <td style="padding: 10px;">${new Date(req.createdAt).toLocaleString()}</td>
                    <td style="padding: 10px;">${requesterName}</td>
                    <td style="padding: 10px;">${message}</td>
                    <td style="padding: 10px; display: flex; gap: 5px;">
                        <button class="accept-conn-btn" data-id="${req._id}" style="padding: 5px 10px; background: green; color: white; border: none; border-radius: 4px; cursor: pointer;">Accept</button>
                        <button class="decline-conn-btn" data-id="${req._id}" style="padding: 5px 10px; background: red; color: white; border: none; border-radius: 4px; cursor: pointer;">Decline</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.accept-conn-btn').forEach(btn => {
                btn.onclick = () => updateConnectionStatus(btn.getAttribute('data-id'), 'accepted');
            });
            document.querySelectorAll('.decline-conn-btn').forEach(btn => {
                btn.onclick = () => updateConnectionStatus(btn.getAttribute('data-id'), 'declined');
            });
            applyStaticTranslations(tbody);

        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="padding: 10px; color: var(--accent-red);">Error: ${data.error}</td></tr>`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 10px; color: var(--accent-red);">Network Error</td></tr>`;
    }
}

export async function updateConnectionStatus(id, status) {
    try {
        const token = localStorage.getItem('token');
        // Added credentials: 'include' to ensure auth cookie is sent
        const res = await fetch(`${API_URL}/transactions/requests/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.success) {
            const msg = status === 'accepted'
                ? 'Request accepted successfully.'
                : status === 'declined'
                    ? 'Request declined successfully.'
                    : `Request ${status} successfully.`;
            announceMessage(msg, { isError: false });
            loadPendingConnections(); 
        } else {
            announceMessage(data.error || 'Failed to update status');
        }
    } catch (err) {
        announceMessage('Server connection error');
    }
}


// This map will hold the mapping from blob URLs to the actual File objects
const newFilesMap = new Map();
let photosDirty = false;

function markPhotosDirty() {
    photosDirty = true;
}

// Highlights the photo currently in the FIRST position as the cover/thumbnail
// shown in the public grid. Always re-evaluates so exactly one photo (the new
// first) is highlighted after uploads, removals, or drag-and-drop reordering.
function refreshCoverHighlight() {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;
    const items = grid.querySelectorAll('.photo-item');
    const coverLabel = t('Cover photo');
    items.forEach((item, idx) => {
        const existingBadge = item.querySelector('.cover-badge');
        if (idx === 0) {
            item.classList.add('is-cover-photo');
            item.setAttribute('aria-label', coverLabel);
            item.title = coverLabel;
            if (!existingBadge) {
                const badge = document.createElement('span');
                badge.className = 'cover-badge';
                badge.textContent = `⭐ ${coverLabel}`;
                item.appendChild(badge);
            }
        } else {
            item.classList.remove('is-cover-photo');
            item.removeAttribute('aria-label');
            if (item.title === coverLabel) item.removeAttribute('title');
            if (existingBadge) existingBadge.remove();
        }
    });
}

export function addPhotoToGrid(fileOrUrl) {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;

    let imageUrl;
    let isNew = false;

    if (typeof fileOrUrl === 'string') {
        // This is an existing photo URL from the server
        let sanitizedUrl = fileOrUrl;
        if (sanitizedUrl.startsWith('http')) {
            try {
                const urlObj = new URL(sanitizedUrl);
                if (urlObj.pathname.startsWith('/uploads/')) {
                    sanitizedUrl = urlObj.pathname;
                }
            } catch (e) {}
        }
        imageUrl = sanitizedUrl.startsWith('/') && window.location.protocol === 'file:' ? `${BASE_ORIGIN}${sanitizedUrl}` : resolvePhotoSrc(sanitizedUrl);
    } else {
        // This is a new File object from the user's computer
        imageUrl = URL.createObjectURL(fileOrUrl);
        newFilesMap.set(imageUrl, fileOrUrl);
        isNew = true;
        markPhotosDirty();
    }

    const item = document.createElement('div');
    item.className = 'photo-item';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    if (typeof fileOrUrl === 'string') img.setAttribute('data-original-url', imageUrl); // Save the sanitized relative URL
    img.alt = 'User Photo';
    img.title = t('Click to enlarge');
    img.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openImageModal === 'function') window.openImageModal(img.src);
    });
    img.onerror = () => {
        if (isNew) {
            URL.revokeObjectURL(imageUrl);
            item.remove();
            const alertEl = document.getElementById('photoUpdateAlert');
            if (alertEl) {
                showAlert(alertEl, `Could not load image from URL.`);
                setTimeout(() => alertEl.classList.add('hidden'), 3000);
            }
            return;
        }
        img.src = '/images/no-photo.svg';
    };

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-overlay';
    removeBtn.setAttribute('aria-label', t('Remove photo'));
    removeBtn.innerHTML = '&times;';

    item.appendChild(img);
    item.appendChild(removeBtn);

    // --- Drag and Drop Logic ---
    item.draggable = true;
    item.addEventListener('dragstart', function(e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', img.src); // Required for Firefox
        item.classList.add('dragging');
        setTimeout(() => item.style.opacity = '0.5', 0);
    });
    item.addEventListener('dragend', function() {
        item.classList.remove('dragging');
        item.style.opacity = '1';
    });
    item.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('dragenter', function(e) {
        e.preventDefault();
        if (this !== document.querySelector('.dragging')) this.style.transform = 'scale(1.05)';
    });
    item.addEventListener('dragleave', function() {
        this.style.transform = 'scale(1)';
    });
    item.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.transform = 'scale(1)';
        const draggedItem = document.querySelector('.dragging');
        if (draggedItem && draggedItem !== this) {
            let allItems = [...grid.querySelectorAll('.photo-item')];
            let draggedIndex = allItems.indexOf(draggedItem);
            let targetIndex = allItems.indexOf(this);
            if (draggedIndex < targetIndex) this.after(draggedItem);
            else this.before(draggedItem);
            refreshCoverHighlight();
            markPhotosDirty();
            const explicitSaveBtn = document.getElementById('explicitSaveBtn');
            if (explicitSaveBtn) {
                explicitSaveBtn.classList.remove('hidden');
                explicitSaveBtn.click();
            } else if (typeof window.saveProfessionalProfile === 'function') {
                window.saveProfessionalProfile(true);
            }
        }
    });

    removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevents accidental dragging interference
        if (!(await confirmDialog('Are you sure you want to remove this photo from your gallery?', { destructive: true, confirmLabel: t('Remove photo') }))) return;
        if (newFilesMap.has(img.src)) {
            URL.revokeObjectURL(img.src);
            newFilesMap.delete(img.src);
        }
        item.remove();
        refreshCoverHighlight();
        markPhotosDirty();
        const explicitSaveBtn = document.getElementById('explicitSaveBtn');
        if (explicitSaveBtn) {
            explicitSaveBtn.classList.remove('hidden');
            explicitSaveBtn.click();
        } else if (typeof window.saveProfessionalProfile === 'function') {
            window.saveProfessionalProfile(true);
        }
    });

    const frame = grid.querySelector('.add-photo-frame');
    if (frame) grid.insertBefore(item, frame);
    else grid.appendChild(item);

    refreshCoverHighlight();
}

const newPhotoInput = document.getElementById('newPhotoInput');
if (newPhotoInput) {
    newPhotoInput.addEventListener('change', (e) => {
        if (e.target.files) {
            for (const file of e.target.files) {
                if (!file.type.startsWith('image/')) {
                    announceMessage('Please select valid image files only.');
                    continue;
                }
                addPhotoToGrid(file);
            }
            setTimeout(() => {
                const explicitSaveBtn = document.getElementById('explicitSaveBtn');
                if (explicitSaveBtn) {
                    explicitSaveBtn.classList.remove('hidden');
                    explicitSaveBtn.click();
                } else if (typeof window.saveProfessionalProfile === 'function') {
                    window.saveProfessionalProfile(true);
                }
            }, 100);
        }
    });
}

// --- Professional Dedicated 5-Block Editing Dashboard ---

function showDeleteProfileOverlay() {
    const el = document.getElementById('deleteProfileOverlay');
    if (!el) return;
    const wasHidden = el.classList.contains('hidden');
    el.classList.remove('hidden');
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (wasHidden) beginModalSession();
    activateAccessibleModal(el, {
        labelId: 'deleteProfileModalTitle',
        onClose: () => hideDeleteProfileOverlay(),
        initialFocusSelector: '#deleteProfilePassword'
    });
}

function hideDeleteProfileOverlay() {
    const el = document.getElementById('deleteProfileOverlay');
    if (!el) return;
    deactivateAccessibleModal(el);
    const wasVisible = !el.classList.contains('hidden');
    el.classList.add('hidden');
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    const payOpen = !document.getElementById('paymentModalOverlay')?.classList.contains('hidden');
    const howOpen = !document.getElementById('howToPayOverlay')?.classList.contains('hidden');
    if (!payOpen && !howOpen) document.body.style.overflow = '';
    if (wasVisible) endModalSession();
}

function setupDeleteProfileUI() {
    const openBtn = document.getElementById('btnOpenDeleteProfile');
    const overlay = document.getElementById('deleteProfileOverlay');
    if (!openBtn || !overlay) return;

    const closeBtn = document.getElementById('closeDeleteProfileModal');
    const cancelBtn = document.getElementById('cancelDeleteProfileBtn');
    const confirmBtn = document.getElementById('confirmDeleteProfileBtn');
    const passwordInput = document.getElementById('deleteProfilePassword');
    const confirmCheckbox = document.getElementById('deleteProfileConfirm');
    const alertEl = document.getElementById('deleteProfileAlert');

    const resetModal = () => {
        if (passwordInput) passwordInput.value = '';
        if (confirmCheckbox) confirmCheckbox.checked = false;
        if (alertEl) alertEl.classList.add('hidden');
    };

    openBtn.onclick = () => {
        resetModal();
        showDeleteProfileOverlay();
        passwordInput?.focus();
    };

    closeBtn && (closeBtn.onclick = () => { hideDeleteProfileOverlay(); resetModal(); });
    cancelBtn && (cancelBtn.onclick = () => { hideDeleteProfileOverlay(); resetModal(); });

    overlay.onclick = (e) => {
        if (e.target === overlay) {
            hideDeleteProfileOverlay();
            resetModal();
        }
    };

    confirmBtn.onclick = async () => {
        const password = passwordInput?.value?.trim() || '';
        if (!confirmCheckbox?.checked) {
            showAlert(alertEl, t('Please confirm that you understand this action is permanent.'));
            return;
        }
        if (!password) {
            showAlert(alertEl, t('Please enter your password to confirm account deletion'));
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = t('Deleting...');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/professionals/me`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) {
                try {
                    if (token) {
                        await fetch(`${API_URL}/auth/logout`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            credentials: 'include'
                        });
                    }
                } catch (err) {
                    console.error('Logout error:', err);
                } finally {
                    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('is18Plus');
                    logoutToEntrance();
                }
                return;
            }
            showAlert(alertEl, data.error || t('Unable to delete profile. Please try again.'));
        } catch {
            showAlert(alertEl, t('Server connection error'));
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('Delete permanently');
        }
    };
}

let profDashboardLoadInFlight = null;

export async function loadProfDashboard() {
    if (profDashboardLoadInFlight) return profDashboardLoadInFlight;

    profDashboardLoadInFlight = (async () => {
    const formObj = document.getElementById('updateProfileForm');
    const loader = document.getElementById('loader');
    const content = document.getElementById('profDashboardContent');
    const layout = document.getElementById('profDashboardLayout');
    if (!formObj || !content || !layout) return;

    mountProfessionalPaymentOverlays();

    beginDashboardLoad('profDashboardLayout', 'loader', { clearContent: false });
    formObj.innerHTML = '';

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/professionals/me?_=${new Date().getTime()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success && data.data.role === 'professional') {
            photosDirty = false;
            const user = data.data;
            const prof = user.professionalProfile || {};
            const stats = data.stats || { photoCount: 0, whatsappcCount: 0, callCount: 0 };
            const isApproved = user.verificationStatus === 'approved';
            const allowResubmission = user.allowResubmission === true;
            const needsCategorySetup = needsProfessionalCategorySetup(user);
            window.profNeedsCategorySetup = needsCategorySetup;

            let statusBannerHtml = '';
            if (allowResubmission) {
                statusBannerHtml = getResubmissionBannerHtml(user);
            } else if (!isApproved && user.verificationStatus === 'pending') {
                statusBannerHtml = getPendingApprovalBannerHtml();
            } else if (user.verificationStatus === 'rejected') {
                statusBannerHtml = getGeneralRejectionBannerHtml(user.rejectionDetails);
            }

            const resubmitSectionHtml = allowResubmission ? `
                <div class="card fileteado-section" id="verificationResubmitSection" style="margin-bottom: 20px; border: 1px solid var(--primary-gold);">
                    <h3 class="gold-text" style="margin-bottom: 12px;">${t('Re-upload verification photos')}</h3>
                    <p style="font-size: 0.85rem; color: #ccc; margin-bottom: 16px;">${t('Upload clear replacements for ID front, ID back, and selfie with gesture.')}</p>
                    <div class="reg-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div><label>${t('ID Front photo')}</label><input type="file" id="resubmitIdFront" accept="image/*" class="reg-input" style="padding: 8px;"></div>
                        <div><label>${t('ID Back photo')}</label><input type="file" id="resubmitIdBack" accept="image/*" class="reg-input" style="padding: 8px;"></div>
                    </div>
                    <div style="margin-bottom: 16px;"><label>${t('Selfie photo')}</label><input type="file" id="resubmitSelfie" accept="image/*" class="reg-input" style="padding: 8px; width: 100%; box-sizing: border-box;"></div>
                    <button type="button" id="btnResubmitVerification" style="width: 100%; padding: 12px; background: var(--primary-gold); color: #111; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">${t('Submit verification for review')}</button>
                </div>
            ` : '';
            if (!isApproved && !allowResubmission) {
                formObj.style.maxWidth = '600px';
                formObj.style.width = '100%';
                formObj.style.margin = '0 auto';
                formObj.innerHTML = `
                    ${statusBannerHtml}
                    <button type="button" id="bottomBackBtn" style="background: var(--primary-gold); color: var(--dark-bg); font-weight: bold; width: 100%; padding: 12px; border-radius: 4px; border: none; cursor: pointer;">&#8592; ${t('Back to Main Dashboard')}</button>
                `;
                document.getElementById('bottomBackBtn').onclick = () => navigateBack();
                loader.classList.add('hidden');
                layout.classList.remove('hidden');
                finishDashboardLoad('profDashboardLayout', 'loader');
                applyStaticTranslations(layout);
                return;
            }

            if (user.firstApprovedLogin) {
                fetch(`${API_URL}/professionals/acknowledge-first-login`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
                }).catch(() => {});
                if (localStorage.getItem('user')) {
                    try {
                        const cached = JSON.parse(localStorage.getItem('user'));
                        cached.firstApprovedLogin = false;
                        localStorage.setItem('user', JSON.stringify(cached));
                    } catch (e) {}
                }
            }

            const firstApprovedBannerHtml = user.firstApprovedLogin ? `
                <div class="card fileteado-section" style="margin-bottom: 20px; border: 2px solid var(--primary-gold); background: rgba(212,175,55,0.12);">
                    <h3 class="gold-text" style="margin-top: 0;">${t('Welcome to KuraTe!')}</h3>
                    <p style="color: #eee; line-height: 1.55; margin-bottom: 0;">${t('Your account has been approved. Complete your profile below — choose a category, add specialties, write your bio, and upload photos. Once you save, your public profile will be visible on the directory.')}</p>
                </div>
            ` : '';

            formObj.style.maxWidth = '1200px';
            formObj.style.width = '100%';
            formObj.style.margin = '0 auto';

            const safeBio = String(prof.bio || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const qualitySelectOptions = buildQualitySelectOptions(prof);
            const setupBannerHtml = needsCategorySetup ? `
                <div id="profSetupBanner" class="card fileteado-section" style="margin-bottom: 20px; border: 2px solid var(--primary-gold); background: rgba(212,175,55,0.08);">
                    <h3 class="gold-text" style="margin-top: 0;">${t('Complete your profile setup')}</h3>
                    <p style="color: #ddd; line-height: 1.55; margin-bottom: 0;">${t('Choose your category and at least one specialty below. You can also complete your bio, address, availability, and photos on this page before saving.')}</p>
                </div>
            ` : '';

            formObj.innerHTML = `
                <div class="prof-dash-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 class="gold-text" style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        Professional Dashboard <span style="font-size: 1.5rem; text-shadow: 0 0 5px rgba(212,175,55,0.5);">✏️</span>
                    </h2>
                    <button type="button" id="profDashHeaderBackBtn" onmouseover="this.style.background='rgba(212, 175, 55, 0.1)'" onmouseout="this.style.background='transparent'" style="padding: 6px 12px; background: transparent; border: 1px solid var(--primary-gold); color: var(--primary-gold); border-radius: 4px; cursor: pointer; transition: background 0.3s ease; font-weight: bold; font-size: 0.85rem;">&#8592; Back</button>
                </div>

                ${statusBannerHtml}
                ${firstApprovedBannerHtml}
                ${setupBannerHtml}
                ${resubmitSectionHtml}
                
                <!-- 1. Statistics Top Frame -->
                <div class="card fileteado-section" style="margin-bottom: 20px; border: 1px solid var(--primary-gold);">
                    <h3 class="gold-text" style="margin-bottom: 15px;">Statistics</h3>
                    <div style="display: flex; gap: 20px; justify-content: space-around; text-align: center; flex-wrap: wrap;">
                        <div><div style="font-size: 2.5rem; color: var(--primary-gold);">${stats.photoCount || 0}</div><div style="font-size: 0.9rem; color: #ccc;">Dashboard Photo Clicks</div></div>
                        <div><div style="font-size: 2.5rem; color: var(--primary-gold);">${stats.whatsappcCount || 0}</div><div style="font-size: 0.9rem; color: #ccc;">WhatsApp Button Pushes</div></div>
                        <div><div style="font-size: 2.5rem; color: var(--primary-gold);">${stats.callCount || 0}</div><div style="font-size: 0.9rem; color: #ccc;">Call Button Pushes</div></div>
                        <div><div style="font-size: 2.5rem; color: var(--primary-gold);">0</div><div style="font-size: 0.9rem; color: #ccc;">Hourly Hits (Peak Time)</div></div>
                    </div>
                </div>
                
                <input type="hidden" id="upIdNumber" value="${prof.idNumber || ''}">
                <input type="hidden" id="upBirthDate" value="${prof.birthDate ? new Date(prof.birthDate).toISOString().split('T')[0] : ''}">
                <input type="checkbox" id="upIsExposed" style="display:none;" ${prof.isExposed !== false ? 'checked' : ''}>
                <input type="checkbox" id="upPaysMonthly" style="display:none;" ${prof.paysMonthlyCharges !== false ? 'checked' : ''}>
                <input type="hidden" id="upInstagram" value="${prof.instagram || ''}">
                <input type="hidden" id="upFacebook" value="${prof.facebook || ''}">

                <!-- 2. Personal Information -->
                <div id="profPersonalInfoSection" class="card fileteado-section" style="margin-bottom: 20px; border: 1px solid var(--primary-gold);${needsCategorySetup ? ' box-shadow: 0 0 0 2px rgba(212,175,55,0.35);' : ''}">
                    <h3 class="gold-text" style="margin-bottom: 15px;">Personal Information</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;">
                        <div style="flex: 1; min-width: 150px;"><label>Name</label><input type="text" id="upFirstName" value="${prof.firstName || ''}" style="width: 100%; padding: 8px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px;" disabled></div>
                        <div style="flex: 1; min-width: 150px;"><label>Surname</label><input type="text" id="upSurname" value="${prof.surname || ''}" style="width: 100%; padding: 8px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px;" disabled></div>
                        <div style="flex: 1; min-width: 150px;"><label>Middle Name</label><input type="text" id="upMiddleName" value="${prof.middleName || ''}" style="width: 100%; padding: 8px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px;" disabled></div>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;">
                        <div style="flex: 1; min-width: 150px;"><label>Alias</label><input type="text" id="upAlias" value="${prof.alias || ''}" style="width: 100%; padding: 8px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px;" disabled></div>
                        <div style="flex: 1; min-width: 150px;"><label>Birth Date</label><input type="date" id="upBirthDate" value="${prof.birthDate ? new Date(prof.birthDate).toISOString().split('T')[0] : ''}" style="width: 100%; padding: 8px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px; cursor: not-allowed;" disabled></div>
                        <div style="flex: 1; min-width: 150px;"><label>Height</label><input type="text" id="upHeight" value="${prof.height || ''}" style="width: 100%; padding: 8px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px;" disabled></div>
                        <div style="flex: 1; min-width: 150px;"><label>Measures</label><input type="text" id="upMeasurements" value="${prof.measurements || ''}" style="width: 100%; padding: 8px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px;" disabled></div>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 100%;">
                            <label>${t('Category pricing')}</label>
                            <table id="profCategoryTable" style="width:100%;border-collapse:collapse;font-size:0.85rem;margin:10px 0 16px;">
                                <thead>
                                    <tr>
                                        <th style="border:1px solid rgba(212,175,55,0.25);padding:8px;background:rgba(212,175,55,0.1);color:var(--primary-gold);text-align:left;">${t('Category')}</th>
                                        <th style="border:1px solid rgba(212,175,55,0.25);padding:8px;background:rgba(212,175,55,0.1);color:var(--primary-gold);text-align:left;">${t('Alias')}</th>
                                        <th style="border:1px solid rgba(212,175,55,0.25);padding:8px;background:rgba(212,175,55,0.1);color:var(--primary-gold);text-align:left;">${t('Monthly Price')}</th>
                                        <th style="border:1px solid rgba(212,175,55,0.25);padding:8px;background:rgba(212,175,55,0.1);color:var(--primary-gold);text-align:left;">${t('Unit')}</th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>
                        <div style="flex: 1; min-width: 150px;">
                            <label>${t('Category')}${needsCategorySetup ? ' <span style="color:var(--accent-red);">*</span>' : ''}</label>
                            <select id="upQuality" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid var(--primary-gold); border-radius: 4px;">
                                ${qualitySelectOptions}
                            </select>
                        </div>
                        <div style="flex: 2; min-width: 250px;">
                            <label>${t('Specialties')}${needsCategorySetup ? ' <span style="color:var(--accent-red);">*</span>' : ''}</label>
                            <div id="specsContainer" style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;"></div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px; border-top: 1px solid #444; padding-top: 15px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #ccc; font-size: 0.9rem;">
                            <input type="checkbox" id="upOwnApartment" ${prof.hasOwnApartment ? 'checked' : ''}>
                            ${t('Has own apartment')}
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #ccc; font-size: 0.9rem;">
                            <input type="checkbox" id="upFantasyWardrobe" ${prof.hasFantasyWardrobe ? 'checked' : ''}>
                            ${t('Has fantasy wardrobe (sexy costumes, high heels)')}
                        </label>
                    </div>
                </div>

                <!-- Service Description -->
                <div class="card fileteado-section" style="margin-bottom: 20px; border: 1px solid var(--primary-gold);">
                    <h3 class="gold-text" style="margin-bottom: 10px;">${t('Service Description')}</h3>
                    <p style="font-size: 0.85rem; color: #aaa; margin-bottom: 12px;">${t('Describe your services for visitors on your public profile.')}</p>
                    <textarea id="upBio" rows="6" maxlength="500" style="width: 100%; padding: 10px; background: #222; color: white; border: 1px solid #444; border-radius: 4px; resize: vertical; box-sizing: border-box; min-height: 120px;">${safeBio}</textarea>
                </div>

                <!-- Contact -->
                <div class="card fileteado-section" style="margin-bottom: 20px; border: 1px solid var(--primary-gold);">
                    <h3 class="gold-text" style="margin-bottom: 15px;">${t('Contact')}</h3>
                    <div style="margin-bottom: 12px;">
                        <label>${t('Mobile phone')}</label>
                        ${phonePickerHtml('upMobile', prof.mobilePhone, 'upMobilePhone')}
                        <div id="phoneVerifyContainer" style="margin-top: 8px;">
                            <div id="phoneVerifyStatus" style="font-size: 0.85rem; margin-bottom: 6px;">
                                ${user.phoneVerified ? `<span style="color: #25D366;">✓ ${t('Phone verified')}</span>` : `<span style="color: #aaa;">${t('Not verified')}</span>`}
                            </div>
                            ${!user.phoneVerified ? `
                            <div id="phoneVerifyAction">
                                <button type="button" id="btnSendPhoneCode" style="padding: 6px 14px; background: var(--primary-gold); color: #111; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">${t('Send verification code')}</button>
                                <div id="phoneCodeInputRow" class="hidden" style="gap: 8px; margin-top: 8px; align-items: center;">
                                    <input type="text" id="phoneVerificationCode" maxlength="6" placeholder="${t('6-digit code')}" style="width: 120px; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px; text-align: center; letter-spacing: 4px; font-size: 1.1rem;">
                                    <button type="button" id="btnVerifyPhoneCode" style="padding: 6px 14px; background: #25D366; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">${t('Verify')}</button>
                                    <span id="phoneCodeDeliveryStatus" style="font-size: 0.8rem; color: #aaa;"></span>
                                </div>
                                <div id="phoneCodeAlert" class="hidden" style="margin-top: 6px; font-size: 0.8rem; color: var(--accent-red);"></div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    <div>
                        <label>${t('WhatsApp Number')}</label>
                        ${phonePickerHtml('upWa', prof.whatsappNumber, 'upWaInput')}
                    </div>
                </div>

                <!-- 3. Address -->
                <div class="card fileteado-section" style="margin-bottom: 20px; border: 1px solid var(--primary-gold);">
                    <h3 class="gold-text" style="margin-bottom: 15px;">Address</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;">
                        <div style="flex: 2; min-width: 200px;"><label>Street</label><input type="text" id="upStreet" value="${prof.location?.street || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                        <div style="flex: 1; min-width: 100px;"><label>Number</label><input type="text" id="upStreetNumber" value="${prof.location?.number || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                        <div style="flex: 1; min-width: 80px;"><label>Floor</label><input type="text" id="upFloor" value="${prof.location?.floor || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                        <div style="flex: 1; min-width: 80px;"><label>Appartment</label><input type="text" id="upApartment" value="${prof.location?.apartment || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                        <div style="flex: 1; min-width: 100px;"><label>Postal Code</label><input type="text" id="upPostCode" value="${prof.location?.postalCode || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 150px;"><label>Province</label><select id="upProvince" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></select></div>
                        <div style="flex: 1; min-width: 150px;"><label>Ciudad-Barrio (City)</label><select id="upCity" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></select></div>
                        <div style="flex: 1; min-width: 150px;"><label>Ciudad-Barrio (Neighborhood)</label><input type="text" id="upNeighborhood" value="${prof.location?.neighborhood || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;" placeholder="Neighborhood..."></div>
                    </div>
                </div>

                <!-- 4. Availability -->
                <div class="card fileteado-section" style="margin-bottom: 20px; border: 1px solid var(--primary-gold);">
                    <h3 class="gold-text" style="margin-bottom: 15px;">Availability</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                        <div style="flex: 1; min-width: 150px;"><label>Avail-start</label><input type="time" id="upAvailStart" value="${prof.workingHours?.start || '00:00'}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                        <div style="flex: 1; min-width: 150px;"><label>Avail-end</label><input type="time" id="upAvailEnd" value="${prof.workingHours?.end || '23:59'}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                        <div style="flex: 1; min-width: 150px;"><label>Vac-start</label><input type="date" id="upVacationStart" value="${prof.vacation?.startDate ? new Date(prof.vacation.startDate).toISOString().split('T')[0] : ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                        <div style="flex: 1; min-width: 150px;"><label>Vac-end</label><input type="date" id="upVacationEnd" value="${prof.vacation?.endDate ? new Date(prof.vacation.endDate).toISOString().split('T')[0] : ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                    </div>
                    <div id="daysContainer" style="display: flex; gap: 15px; flex-wrap: wrap; margin-top: 10px;"></div>
                </div>

                <!-- 5. Photos -->
                <div class="card fileteado-section" style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 class="gold-text" style="margin: 0;">Photos</h3>
                        <button type="button" id="btnUploadPhoto" style="padding: 8px 16px; background: var(--primary-gold); color: #111; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Upload</button>
                    </div>
                    <p style="font-size: 0.85rem; color: #ccc; margin-bottom: 15px;">Admin upload, update, remove actions. Drag photos to reorder. ${t('Click a photo to enlarge and review its content.')}</p>
                    <input type="file" id="newPhotoInput" accept="image/png, image/jpeg, image/jpg, image/webp" multiple style="display: none;">
                    <div id="photoGrid">
                        <label class="add-photo-frame"><span>+</span></label>
                    </div>
                    <p id="photoApprovalMsg" style="color: var(--accent-red); font-size: 0.85rem; margin-top: 10px; display: ${isApproved ? 'none' : 'block'};">Profile photos can only be uploaded after your account is approved.</p>
                </div>
                
                <div id="updateAlert" class="alert hidden" style="padding: 10px; border-radius: 4px; border: 1px solid transparent; margin-bottom: 20px;"></div>

                <div class="card fileteado-section" style="margin-top: 20px; margin-bottom: 20px; border: 1px solid var(--accent-red);">
                    <h3 style="color: var(--accent-red); margin-bottom: 10px;">${t('Leave the platform')}</h3>
                    <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 16px;">${t('If you no longer wish to remain on KuraTe, you can permanently delete your profile and all associated data.')}</p>
                    <button type="button" id="btnOpenDeleteProfile" style="width: 100%; padding: 12px; background: transparent; border: 1px solid var(--accent-red); color: var(--accent-red); font-weight: bold; border-radius: 4px; cursor: pointer;">${t('Delete my profile')}</button>
                </div>

                <button type="button" id="explicitSaveBtn" class="hidden" style="background: #25D366; color: white; font-weight: bold; width: 100%; padding: 12px; border-radius: 4px; border: none; cursor: pointer; margin-bottom: 15px;">💾 Save Changes</button>
                <button type="button" id="bottomBackBtn" style="background: var(--primary-gold); color: var(--dark-bg); font-weight: bold; width: 100%; padding: 12px; border-radius: 4px; border: none; cursor: pointer;">&#8592; Back to Main Dashboard</button>
            `;

            // Logic to populate the components
            const specsContainer = document.getElementById('specsContainer');
            const specs = [
                { name: 'Love Alchemy', tooltip: 'Sex' }, { name: 'Massage', tooltip: 'Conventional massage' },
                { name: 'Virtual Connection', tooltip: 'Virtual call' }, { name: 'Media Content', tooltip: 'Share hot content pics or videos' },
                { name: 'Streaming Kisses', tooltip: 'Live streaming kisses' }
            ];
            const userServices = prof.services || [];
            specs.forEach(spec => {
                const lbl = document.createElement('label');
                lbl.title = t(spec.tooltip);
                lbl.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer; padding:8px 12px; background:rgba(212,175,55,0.1); border-radius:4px; border:1px solid rgba(212,175,55,0.3); font-size:0.9rem;';
                const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = spec.name; cb.className = 'dashboard-specialty-cb';
                cb.checked = userServices.includes(spec.name) || userServices.includes(spec.name.toLowerCase());
                lbl.appendChild(cb); lbl.appendChild(document.createTextNode(t(spec.name)));
                specsContainer.appendChild(lbl);
            });

            loadCategoryPricingTable(document.querySelector('#profCategoryTable tbody'));

            if (needsCategorySetup) {
                setTimeout(() => {
                    document.getElementById('profPersonalInfoSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.getElementById('upQuality')?.focus();
                }, 450);
            }

            const daysContainer = document.getElementById('daysContainer');
            renderAvailabilityDayControls(daysContainer, prof.workingDays);

            setupLocationDropdowns('upProvince', 'upCity', 'upNeighborhood', false, prof.location || {});

            initPhonePicker('upMobile');
            initPhonePicker('upWa');

            initPhoneVerification();

            injectProfessionalDashboardGuides(content, data, formObj);

            if (!data.isReadyForTransactions) {
                const rateAlert = document.getElementById('rateAlert');
                if (rateAlert) rateAlert.classList.remove('hidden');
            }

            if (prof.subscriptionStatus === 'suspended') {
                const suspensionAlert = document.createElement('div');
                suspensionAlert.className = 'card alert';
                suspensionAlert.style.marginBottom = '20px';
                suspensionAlert.style.border = '2px solid var(--accent-red)';
                const pendingInv = (prof.invoices || []).find(i => i.status === 'pending');
                const feeText = pendingInv && pendingInv.lateFeeApplied
                    ? ` ${t('A 2% late fee has been applied. Your new total is {amount} ARS.').replace('{amount}', `<strong>$${new Intl.NumberFormat('es-AR').format(pendingInv.amount)}</strong>`)}`
                    : '';
                suspensionAlert.innerHTML = `<h3 style="color: var(--accent-red); margin-top: 0;">${t('Account Suspended')}</h3><p>${t('Your profile has been removed from the public grid due to an unpaid balance past the 5-business-day grace period.')}${feeText}</p><p>${t('To restore your access, please upload your payment receipt below. Once verified by an admin, your profile will reappear on the directory.')}</p>`;
                content.insertBefore(suspensionAlert, formObj);
                formObj.style.opacity = '0.3';
                formObj.style.pointerEvents = 'none';
            }

            const photoGrid = document.getElementById('photoGrid');
            const newPhotoInput = document.getElementById('newPhotoInput');
            const btnUploadPhoto = document.getElementById('btnUploadPhoto');
            
            if (newPhotoInput) {
                if (!isApproved) {
                    newPhotoInput.disabled = true; btnUploadPhoto.disabled = true; btnUploadPhoto.style.opacity = '0.5';
                    photoGrid.style.opacity = '0.3'; photoGrid.style.pointerEvents = 'none';
                }
                btnUploadPhoto.onclick = () => newPhotoInput.click();
                const frameLabel = photoGrid.querySelector('.add-photo-frame');
                if (frameLabel) frameLabel.appendChild(newPhotoInput);
                (prof.photos || []).forEach(url => addPhotoToGrid(url));
                newPhotoInput.addEventListener('change', (e) => {
                    if (e.target.files) {
                        for (const file of e.target.files) {
                            if (!file.type.startsWith('image/')) continue;
                            addPhotoToGrid(file);
                        }
                    const explicitSaveBtn = document.getElementById('explicitSaveBtn');
                    if (explicitSaveBtn) { explicitSaveBtn.classList.remove('hidden'); explicitSaveBtn.click(); }
                    }
                });
            }

            if (!isApproved && !allowResubmission) {
                formObj.querySelectorAll('input:not([type="hidden"]), select, textarea, button').forEach(el => {
                    if (el.id === 'bottomBackBtn') return;
                    el.disabled = true;
                    if (el.type === 'checkbox') el.parentElement.style.opacity = '0.6';
                });
                formObj.querySelectorAll('label').forEach(lbl => {
                    if (!lbl.querySelector('#bottomBackBtn')) lbl.style.cursor = 'not-allowed';
                });
            }

            if (allowResubmission) {
                ['upFirstName', 'upSurname', 'upMiddleName', 'upAlias', 'upBirthDate', 'upHeight', 'upMeasurements',
                    'upStreet', 'upStreetNumber', 'upFloor', 'upApartment', 'upPostCode', 'upProvince', 'upCity', 'upNeighborhood', 'upQuality',
                    'upAvailStart', 'upAvailEnd', 'upVacationStart', 'upVacationEnd', 'upBio'
                ].forEach((id) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.disabled = false;
                    el.style.background = '#222';
                    el.style.color = 'white';
                });
                formObj.querySelectorAll('.dashboard-specialty-cb, .avail-day-cb, #upOwnApartment, #upFantasyWardrobe').forEach((el) => {
                    el.disabled = false;
                    if (el.parentElement) el.parentElement.style.opacity = '1';
                });

                const resubmitBtn = document.getElementById('btnResubmitVerification');
                if (resubmitBtn) {
                    resubmitBtn.addEventListener('click', async () => {
                        const front = document.getElementById('resubmitIdFront');
                        const back = document.getElementById('resubmitIdBack');
                        const selfie = document.getElementById('resubmitSelfie');
                        const alertEl = document.getElementById('updateAlert');
                        if (!front?.files?.[0] || !back?.files?.[0] || !selfie?.files?.[0]) {
                            showAlert(alertEl, t('All three verification photos are required (ID front, ID back, selfie).'));
                            return;
                        }
                        resubmitBtn.disabled = true;
                        resubmitBtn.textContent = t('Submitting...');
                        try {
                            if (typeof window.saveProfessionalProfile === 'function') {
                                await window.saveProfessionalProfile(true);
                            }
                            const formData = new FormData();
                            formData.append('verificationDocuments', front.files[0]);
                            formData.append('verificationDocuments', back.files[0]);
                            formData.append('verificationDocuments', selfie.files[0]);
                            const token = localStorage.getItem('token');
                            const res = await fetch(`${API_URL}/professionals/resubmit-verification`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}` },
                                credentials: 'include',
                                body: formData
                            });
                            const data = await res.json();
                            if (data.success) {
                                showAlert(alertEl, data.message || t('Verification submitted for review.'), false);
                                setTimeout(() => { window.location.href = appPath('profDashboard.html'); }, 1500);
                            } else {
                                showAlert(alertEl, data.error || t('Submission failed'));
                            }
                        } catch {
                            showAlert(alertEl, t('Server connection error'));
                        } finally {
                            resubmitBtn.disabled = false;
                            resubmitBtn.textContent = t('Submit verification for review');
                        }
                    });
                }

                setTimeout(() => {
                    document.getElementById('verificationResubmitSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 400);
            }

            // Show Save Button on any form modification to avoid focus-out issues
            const markDirty = (e) => {
                if (e.target.matches('input, select, textarea')) {
                    document.getElementById('explicitSaveBtn').classList.remove('hidden');
                }
            };
            formObj.addEventListener('input', markDirty);
            formObj.addEventListener('change', markDirty);

            document.getElementById('explicitSaveBtn').onclick = async () => {
                if (typeof window.saveProfessionalProfile === 'function') {
                    const btn = document.getElementById('explicitSaveBtn');
                    btn.textContent = t('Saving...');
                    btn.style.opacity = '0.7';
                    await window.saveProfessionalProfile(false); // False = show success alert to the user
                    btn.textContent = t('💾 Save Changes');
                    btn.style.opacity = '1';
                    btn.classList.add('hidden'); // Hide the button again until next change
                }
            };

            document.getElementById('bottomBackBtn').onclick = async () => {
                if (typeof window.saveProfessionalProfile === 'function') await window.saveProfessionalProfile(true);
                navigateBack(() => {
                    window.location.href = '/perfil/' + encodeURIComponent(prof.alias || '');
                });
            };

            document.getElementById('profDashHeaderBackBtn')?.addEventListener('click', () => navigateBack());

            loader.classList.add('hidden');
            layout.classList.remove('hidden');
            delete formObj.dataset.bound;
            bindProfessionalProfileForm();
            setupDeleteProfileUI();
            const deleteOverlay = document.getElementById('deleteProfileOverlay');
            if (deleteOverlay) applyStaticTranslations(deleteOverlay);
            finishDashboardLoad('profDashboardLayout', 'loader');
            applyStaticTranslations(layout);
        } else {
            window.location.href = '/index.html';
        }
    } catch (err) {
        failDashboardLoad('profDashboardLayout', 'loader', `<p class="alert" style="text-align:center;padding:40px;">${t('Server connection error')}</p>`);
    } finally {
        profDashboardLoadInFlight = null;
    }
    })();

    return profDashboardLoadInFlight;
}

function initPhoneVerification() {
    const btnSend = document.getElementById('btnSendPhoneCode');
    const codeInputRow = document.getElementById('phoneCodeInputRow');
    const codeInput = document.getElementById('phoneVerificationCode');
    const btnVerify = document.getElementById('btnVerifyPhoneCode');
    const alertEl = document.getElementById('phoneCodeAlert');
    const statusEl = document.getElementById('phoneCodeDeliveryStatus');
    const verifyStatus = document.getElementById('phoneVerifyStatus');

    if (!btnSend) return;

    btnSend.addEventListener('click', async () => {
        btnSend.disabled = true;
        btnSend.textContent = t('Sending...');
        if (alertEl) { alertEl.classList.add('hidden'); alertEl.textContent = ''; }
        if (statusEl) statusEl.textContent = '';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/professionals/send-phone-code`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                if (codeInputRow) { codeInputRow.classList.remove('hidden'); codeInputRow.style.display = 'flex'; }
                if (codeInput) codeInput.value = '';
                if (statusEl) statusEl.textContent = t('Code sent!');
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
            } else {
                if (alertEl) { alertEl.textContent = data.error || t('Failed to send code'); alertEl.classList.remove('hidden'); }
            }
        } catch {
            if (alertEl) { alertEl.textContent = t('Server connection error'); alertEl.classList.remove('hidden'); }
        } finally {
            btnSend.disabled = false;
            btnSend.textContent = t('Send verification code');
        }
    });

    if (btnVerify && codeInput) {
        btnVerify.addEventListener('click', async () => {
            const code = codeInput.value.trim();
            if (!code || code.length !== 6) {
                if (alertEl) { alertEl.textContent = t('Enter a valid 6-digit code'); alertEl.classList.remove('hidden'); }
                return;
            }
            btnVerify.disabled = true;
            btnVerify.textContent = t('Verifying...');
            if (alertEl) { alertEl.classList.add('hidden'); alertEl.textContent = ''; }

            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/professionals/verify-phone-code`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });
                const data = await res.json();
                if (data.success) {
                    if (btnSend) btnSend.remove();
                    if (codeInputRow) codeInputRow.remove();
                    if (alertEl) alertEl.remove();
                    if (verifyStatus) verifyStatus.innerHTML = '<span style="color: #25D366;">✓ ' + t('Phone verified') + '</span>';
                } else {
                    if (alertEl) { alertEl.textContent = data.error || t('Invalid code'); alertEl.classList.remove('hidden'); }
                }
            } catch {
                if (alertEl) { alertEl.textContent = t('Server connection error'); alertEl.classList.remove('hidden'); }
            } finally {
                btnVerify.disabled = false;
                btnVerify.textContent = t('Verify');
            }
        });
    }
}
