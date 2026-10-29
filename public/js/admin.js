import { BASE_ORIGIN, API_URL, CATEGORY_META, getVerificationGesture, appPath, getDeviceId } from './globals.js';
import { showAlert, getPendingApprovalBannerHtml, getResubmissionBannerHtml, getGeneralRejectionBannerHtml } from './uiHelpers.js';
import { t, applyStaticTranslations, formatOpeningDateTime, currentLang } from './i18n.js';
import { activateAccessibleModal, deactivateAccessibleModal, announceMessage, confirmDialog, fixUnassociatedLabels } from './a11y.js';
import { beginDashboardLoad, finishDashboardLoad, failDashboardLoad } from './dashboardShell.js';
import { renderSpecialtyDropdown, setupLocationDropdowns, initCpaAutofill, collectTreeServices, renderProfessionsPicker, collectProfessions } from './helpers.js';
import { addPhotoToGrid, openPendingConnectionsModal, bindProfessionalProfileForm, hideProfessionalPaymentOverlays, renderProfessionalMainDashboardShell, injectProfessionalDashboardGuides, renderAvailabilityDayControls } from './professional.js';

import {
    buildFullPhoneNumber,
    phonePickerHtml,
    initPhonePicker
} from './phoneCountryCodes.js';
import { beginModalSession, endModalSession, navigateWithReturn } from './navReturn.js';
import { saveLaunchCurtainEnabled, saveLaunchCurtainOpeningAt, loadLaunchCurtainAdminState } from './launchCurtain.js';

const ADMIN_CATEGORY_ORDER = ['verificados', 'Premium', 'Gold', 'Silver', 'Standard', 'Uncategorized'];

// Build request headers with the bearer token only when it is a real value.
// Sending "Bearer null"/"Bearer undefined" makes the server prefer the broken
// header over the valid auth cookie and reply 401 Not authorized. When the
// token is valid this returns exactly the same headers as before.
function authHeaders(extra = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...extra };
    if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

/** Parse admin API responses; surfaces nginx 502/HTML as readable errors instead of a generic network error. */
async function parseAdminApiResponse(res) {
    const text = await res.text();
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            const hint = res.status === 502 || res.status === 504
                ? 'Gateway error — the app container may be down or restarting. Check: docker logs KuraTe_app --tail 50'
                : res.status === 429
                    ? 'Too many requests — wait a minute and refresh the page.'
                    : res.status === 401
                        ? 'Session expired — log out and log in again.'
                        : `Non-JSON response (HTTP ${res.status})`;
            throw new Error(hint);
        }
    }
    if (!res.ok && data.success !== false) {
        data.success = false;
        data.error = data.error || data.message || `HTTP ${res.status}`;
    }
    return data;
}

function adminConnectionErrorMessage(err) {
    const msg = err && typeof err.message === 'string' ? err.message.trim() : '';
    return msg || t('Server connection error');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function openAdminOverlay(modal) {
    if (!modal) return;
    modal.classList.add('admin-overlay-modal');
    beginModalSession();
    modal.style.display = 'flex';
    const titleEl = modal.querySelector('h2, h3');
    if (titleEl && !titleEl.id) {
        titleEl.id = `admin-modal-title-${Math.random().toString(36).slice(2, 9)}`;
    }
    activateAccessibleModal(modal, {
        labelId: titleEl?.id,
        onClose: () => closeAdminOverlay(modal)
    });
}

function closeAdminOverlay(modal, afterClose) {
    if (!modal) return;
    deactivateAccessibleModal(modal);
    modal.style.display = 'none';
    endModalSession();
    if (typeof afterClose === 'function') afterClose();
}

/** Top-right close control aligned with the modal card (full button hit area). */
function createAdminModalCloseBar({ maxWidth = '1000px', label, onClick } = {}) {
    const closeBar = document.createElement('div');
    closeBar.className = 'modal-close-bar';
    if (maxWidth) closeBar.style.maxWidth = maxWidth;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'admin-modal-close-btn modal-close-external';
    closeBtn.textContent = label || t('Close');
    closeBtn.onclick = onClick;

    closeBar.appendChild(closeBtn);
    return closeBar;
}

function buildAdminProfCard(p, eagerImages = false) {
    const card = document.createElement('div');
    card.className = 'admin-prof-card';

    const alias = p.professionalProfile?.alias || 'No Alias';
    const photo = (p.professionalProfile?.photos && p.professionalProfile.photos.length > 0) ? p.professionalProfile.photos[0] : '/images/no-photo.svg';
    const vStatus = p.verificationStatus || 'pending';
    const statusColor = vStatus === 'approved' ? '#15803d' : (vStatus === 'rejected' ? '#dc2626' : '#a16207');
    const thumbWrap = document.createElement('button');
    thumbWrap.type = 'button';
    thumbWrap.className = 'admin-prof-thumb';
    thumbWrap.title = `${t('View details')} — ${alias}`;
    const thumbImg = document.createElement('img');
    thumbImg.src = photo;
    thumbImg.alt = alias;
    thumbImg.className = 'admin-prof-thumb-img';
    if (!eagerImages) thumbImg.loading = 'lazy';
    const statusBadge = document.createElement('div');
    statusBadge.className = 'admin-prof-status-badge';
    statusBadge.style.background = statusColor;
    statusBadge.textContent = t(vStatus) || vStatus.toUpperCase();
    thumbWrap.appendChild(thumbImg);
    thumbWrap.appendChild(statusBadge);

    const aliasEl = document.createElement('div');
    aliasEl.className = 'admin-prof-alias';
    aliasEl.textContent = alias;
    const emailEl = document.createElement('div');
    emailEl.className = 'admin-prof-email';
    emailEl.textContent = p.email;

    const actions = document.createElement('div');
    actions.className = 'admin-prof-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-btn admin-icon-btn';
    editBtn.setAttribute('aria-label', t('Edit'));
    editBtn.title = t('Edit');
    editBtn.textContent = '✏️';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn admin-icon-btn';
    deleteBtn.setAttribute('aria-label', t('Delete professional'));
    deleteBtn.title = t('Delete');
    deleteBtn.textContent = '🗑️';
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(thumbWrap);
    card.appendChild(aliasEl);
    card.appendChild(emailEl);
    card.appendChild(actions);

    // The photo thumbnail is the interactive "view details" control so the card
    // itself stays a plain container (a focusable card would nest the action
    // buttons and break keyboard/AT semantics).
    const goToDetails = () => openEditProfessionalModal(p);
    thumbWrap.style.cssText = 'display:block;width:100%;border:none;padding:0;background:none;cursor:pointer;text-align:left;';
    thumbWrap.onclick = goToDetails;

    editBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        openEditProfessionalModal(p);
    };

    deleteBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        handleDeleteProfessional(p, card);
    };

    return card;
}

function renderAdminAllGrid(content, items, eagerImages = false) {
    const section = document.createElement('div');
    section.className = 'fileteado-section admin-prof-category admin-prof-all';
    section.innerHTML = `
        <div class="category-section-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div>
                    <h4 style="color: var(--primary-gold); margin: 0;">
                        ${t('All professionals')} <span style="font-size: 0.8rem; color: #aaa; font-weight: normal; font-family: sans-serif;">(${items.length})</span>
                    </h4>
                </div>
            </div>
        </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'five-column-grid admin-prof-grid';

    items.forEach(p => {
        grid.appendChild(buildAdminProfCard(p, eagerImages));
    });

    section.appendChild(grid);
    content.appendChild(section);
}

// Permanently delete a professional from the admin grid, with confirmation.
async function handleDeleteProfessional(p, card) {
    const alias = p.professionalProfile?.alias || p.email || '';
    const confirmed = await confirmDialog(
        `${t('This will permanently delete this professional and all their data. This action cannot be undone.')}${alias ? `\n\n${alias}` : ''}`,
        {
            title: t('Delete professional'),
            confirmLabel: t('Delete'),
            cancelLabel: t('Cancel'),
            destructive: true
        }
    );
    if (!confirmed) return;

    try {
        const res = await fetch(`${API_URL}/admin/professionals/${p._id}`, {
            method: 'DELETE',
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);

        if (!res.ok || !data.success) {
            announceMessage(data.error || t('Failed to delete professional'));
            return;
        }

        if (card && card.parentNode) card.parentNode.removeChild(card);
        announceMessage(t('Professional deleted successfully.'), { isError: false });
    } catch (err) {
        announceMessage(adminConnectionErrorMessage(err));
    }
}

export async function renderAdminGrid(container) {
    container.innerHTML = `
        <h3 class="gold-text" style="margin-bottom: 15px; font-size: 1.5rem; border-bottom: 1px solid rgba(212, 175, 55, 0.3); padding-bottom: 10px;">${t('Models Directory')}</h3>
        <div class="admin-grid-layout" style="display: flex; gap: 20px; align-items: flex-start; flex-direction: row; flex-wrap: wrap;">
            <div class="card admin-grid-sidebar" style="width: 100%; max-width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; position: sticky; top: 70px;">
                <h4 class="gold-text" style="margin-bottom: 5px;">${t('Filters')}</h4>
                <select id="adminFilterProv" aria-label="${t('All Provinces')}" class="form-select" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"><option value="">${t('All Provinces')}</option></select>
                <select id="adminFilterCity" aria-label="${t('All Cities')}" class="form-select" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"><option value="">${t('All Cities')}</option></select>
                <select id="adminFilterNeigh" aria-label="${t('All Neighborhoods')}" class="form-select" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"><option value="">${t('All Neighborhoods')}</option></select>
                <select id="adminFilterSpecialty" aria-label="${t('All Specialties')}" class="form-select" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                    <option value="">${t('All Specialties')}</option>
                </select>
                <select id="adminFilterQuality" aria-label="${t('All Qualities')}" class="form-select" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                    <option value="">${t('All Qualities')}</option>
                    <option value="verificados">${t(CATEGORY_META['verificados'].name)}</option>
                    <option value="Premium">${t(CATEGORY_META['Premium'].name)}</option>
                    <option value="Gold">${t(CATEGORY_META['Gold'].name)}</option>
                    <option value="Silver">${t(CATEGORY_META['Silver'].name)}</option>
                    <option value="Standard">${t(CATEGORY_META['Standard'].name)}</option>
                </select>
                <button id="adminFilterBtn" style="padding: 8px 20px; width: 100%;">${t('Filter')}</button>
            </div>
            <div id="adminGridContent" class="admin-grid-main">Loading...</div>
        </div>
    `;

    setupLocationDropdowns('adminFilterProv', 'adminFilterCity', 'adminFilterNeigh', true, {});

    document.getElementById('adminFilterBtn').onclick = () => {
        loadAdminGridData();
    };

    await loadAdminGridData();
    applyStaticTranslations(container);
}

export async function loadAdminGridData() {
    const content = document.getElementById('adminGridContent');
    content.innerHTML = '<p>Loading...</p>';
    try {
        const token = localStorage.getItem('token');
        
        let url;
        url = new URL(`${API_URL}/admin/professionals`);
        url.searchParams.set('limit', '0');
        url.searchParams.set('_', new Date().getTime());
        let res = await fetch(url, { headers: authHeaders(), credentials: 'include' });
        
        if (!res.ok) {
            // Fallback to public endpoint if the custom admin route isn't available
            url = new URL(`${API_URL}/professionals`);
            url.searchParams.set('limit', '0');
            res = await fetch(url, { headers: authHeaders(), credentials: 'include' });
        }
        const data = await parseAdminApiResponse(res);

        if (!data.success) {
            content.innerHTML = `<p style="color: var(--accent-red);">Error: ${data.error}</p>`;
            return;
        }

        let profs = data.data;

        // Apply frontend filters
        const provEl = document.getElementById('adminFilterProv');
        const cityEl = document.getElementById('adminFilterCity');
        const neighEl = document.getElementById('adminFilterNeigh');
        const qualityEl = document.getElementById('adminFilterQuality');
        const specialtyEl = document.getElementById('adminFilterSpecialty');
        
        // Populate specialty filter dynamically from loaded data
        if (specialtyEl && specialtyEl.options.length <= 1) {
            const allSpecialties = new Set();
            profs.forEach(p => {
                const prof = p.professionalProfile || {};
                (prof.services || []).forEach(s => { if (s) allSpecialties.add(s); });
            });
            const prev = specialtyEl.value;
            const sorted = [...allSpecialties].sort();
            sorted.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s.split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                specialtyEl.appendChild(opt);
            });
            specialtyEl.value = prev;
        }
        
        const prov = provEl ? provEl.value.trim().toLowerCase() : '';
        const city = cityEl ? cityEl.value.trim().toLowerCase() : '';
        const neigh = neighEl ? neighEl.value.trim().toLowerCase() : '';
        const quality = qualityEl ? qualityEl.value : '';
        const filterSpecialty = specialtyEl ? specialtyEl.value.toLowerCase() : '';

        profs = profs.filter(p => {
            if (!p) return false;
            const prof = p.professionalProfile || {};
            const loc = prof.location || {};
            
            const lProv = (loc.province || '').trim().toLowerCase();
            if (prov && (!lProv || (!lProv.includes(prov) && !prov.includes(lProv)))) return false;
            
            if (prov === 'caba') {
                const lNeigh = (loc.neighborhood || '').trim().toLowerCase();
                if (city && (!lNeigh || !lNeigh.includes(city))) return false;
            } else {
                const lCity = (loc.city || '').trim().toLowerCase();
                const lNeigh = (loc.neighborhood || '').trim().toLowerCase();
                if (city && (!lCity || !lCity.includes(city))) return false;
                if (neigh && (!lNeigh || !lNeigh.includes(neigh))) return false;
            }
            
            if (quality && (!prof.quality || prof.quality !== quality)) return false;
            if (filterSpecialty && (!prof.services || !prof.services.map(s => s.toLowerCase()).includes(filterSpecialty))) return false;
            return true;
        });

        // One single grid for all (no per-category sections). Keep quality
        // ordering so Premium/verified surface first, then sort by alias.
        const qualityRank = (p) => {
            const q = p.professionalProfile?.quality || 'Uncategorized';
            const i = ADMIN_CATEGORY_ORDER.indexOf(q);
            return i === -1 ? ADMIN_CATEGORY_ORDER.length : i;
        };
        const aliasOf = (p) => String(p.professionalProfile?.alias || p.email || '').toLowerCase();
        profs.sort((a, b) => (qualityRank(a) - qualityRank(b)) || (aliasOf(a) < aliasOf(b) ? -1 : aliasOf(a) > aliasOf(b) ? 1 : 0));

        content.innerHTML = '';

        if (profs.length === 0) {
            content.innerHTML = '<p>No professionals match your filters.</p>';
            applyStaticTranslations(content);
            return;
        }

        renderAdminAllGrid(content, profs, true);
        applyStaticTranslations(content);
        highlightFindMeCard();

    } catch (err) {
        content.innerHTML = `<p style="color: var(--accent-red);">${t('Error connecting to the vault:')} ${err.message}</p>`;
    }
}

function highlightFindMeCard() {
    const params = new URLSearchParams(window.location.search);
    const findMe = params.get('findMe');
    if (!findMe) return;

    const allCards = document.querySelectorAll('.admin-prof-card');
    for (const card of allCards) {
        const aliasEl = card.querySelector('.admin-prof-alias');
        if (aliasEl && aliasEl.textContent.trim().toLowerCase() === findMe.trim().toLowerCase()) {
            card.style.transition = 'box-shadow 0.3s, border-color 0.3s, transform 0.3s';
            card.style.boxShadow = '0 0 0 3px var(--primary-gold), 0 0 20px rgba(212,175,55,0.5)';
            card.style.borderColor = 'var(--primary-gold)';
            card.style.transform = 'scale(1.05)';
            card.style.zIndex = '10';
            card.style.position = 'relative';
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                card.style.boxShadow = '0 0 0 2px var(--primary-gold)';
                card.style.transform = 'scale(1)';
            }, 2000);
            setTimeout(() => {
                card.style.boxShadow = '';
                card.style.borderColor = '';
                card.style.transform = '';
                card.style.zIndex = '';
                card.style.position = '';
            }, 5000);
            break;
        }
    }

    params.delete('findMe');
    const newUrl = params.toString() ? '?' + params.toString() : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
}

// --- Dashboard ---

let dashboardLoadInFlight = null;

function formatCertWarningLine(item) {
    const domain = item?.domain || item?.id || 'unknown-cert';
    if (item?.status === 'missing') {
        return t('SSL cert {domain}: file missing on server').replace('{domain}', domain);
    }
    if (item?.status === 'error') {
        return t('SSL cert {domain}: read failed ({error})')
            .replace('{domain}', domain)
            .replace('{error}', item.error || 'unknown');
    }
    if (Number.isFinite(item?.daysRemaining)) {
        return t('SSL cert {domain}: expires in {days} day(s)')
            .replace('{domain}', domain)
            .replace('{days}', String(item.daysRemaining));
    }
    return t('SSL cert {domain}: expiration unknown').replace('{domain}', domain);
}

function maybeShowAdminCertExpiryPopup() {
    let warnings = null;
    try {
        const raw = sessionStorage.getItem('admin_cert_expiry_warnings');
        if (!raw) return;
        sessionStorage.removeItem('admin_cert_expiry_warnings');
        warnings = JSON.parse(raw);
    } catch {
        return;
    }
    if (!Array.isArray(warnings) || warnings.length === 0) return;

    const details = warnings.map(formatCertWarningLine).join('\n');
    const hints = [...new Set(warnings.map((w) => w.renewalHint).filter(Boolean))].join('\n');

    window.alert(
        `${t('SSL certificate warning')}\n\n`
        + `${t('One or more TLS certificates expire within 10 days or are missing on the server. Certbot is not used on the VPS — renew at source and upload.')}\n\n`
        + `${details}\n\n`
        + `${t('What to do')}:\n${hints || t('Run scripts/upload-ssl-certs-to-prod.bat then reload nginx (full deploy or docker compose exec nginx nginx -s reload).')}`
    );
}

export async function loadDashboard() {
    if (dashboardLoadInFlight) return dashboardLoadInFlight;

    dashboardLoadInFlight = (async () => {
    const content = document.getElementById('dashboardContent');
    const loader = document.getElementById('loader');
    if (!content) return;

    beginDashboardLoad('dashboardContent', 'loader', { clearContent: true });

    try {
        const token = localStorage.getItem('token');
        // Added credentials: 'include' to ensure the auth cookie is sent with the request.
        // This is the likely fix for the login redirect loop.
        const res = await fetch(`${API_URL}/professionals/me?_=${new Date().getTime()}`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);

        if (data.success) {
            const user = data.data;
            localStorage.setItem('user', JSON.stringify(user)); // Ensure local storage is synced

            if (user.role === 'professional') {
                window.location.replace(appPath('profile.html'));
                return;
            }

            const stats = data.stats || { photoCount: 0, whatsappcCount: 0, callCount: 0 };

            // Apply global dynamic pricing
            if (data.globalPricing) {
                const fmt = (num) => new Intl.NumberFormat('es-AR').format(num) + ' ARS';
                CATEGORY_META['verificados'].price = fmt(data.globalPricing.verificados);
                CATEGORY_META['Premium'].price = fmt(data.globalPricing.Premium);
                CATEGORY_META['Gold'].price = fmt(data.globalPricing.Gold);
                CATEGORY_META['Silver'].price = fmt(data.globalPricing.Silver);
                CATEGORY_META['Standard'].price = fmt(data.globalPricing.Standard);
            }

            // --- Admin Specific Injection ---
            if (user.role === 'admin' && content) {
                maybeShowAdminCertExpiryPopup();
                hideProfessionalPaymentOverlays();
                content.innerHTML = ''; // Clear out the professional profile form
                
                const adminLayout = document.createElement('div');
                adminLayout.id = 'adminLayout';
                adminLayout.className = 'admin-shell';
                adminLayout.style.display = 'flex';
                adminLayout.style.gap = '20px';
                adminLayout.style.alignItems = 'flex-start';
                adminLayout.style.flexWrap = 'wrap';

                const adminPanel = document.createElement('div');
                adminPanel.id = 'adminPanelSection';
                adminPanel.className = 'card admin-sidebar';
                adminPanel.style.marginBottom = '20px';
                adminPanel.style.border = '1px solid var(--primary-gold)';
                adminPanel.style.width = '320px';
                adminPanel.style.flexShrink = '0';
                adminPanel.style.position = 'sticky';
                adminPanel.style.top = '70px';
                adminPanel.style.maxHeight = 'calc(100vh - 90px)';
                adminPanel.style.overflowY = 'auto';
                adminPanel.style.overscrollBehavior = 'contain';
                adminPanel.style.scrollbarWidth = 'thin';
                adminPanel.style.scrollbarColor = 'rgba(212,175,55,0.3) transparent';
                adminPanel.style.padding = '0';
                
                adminPanel.innerHTML = `
                    <div style="padding: 10px;">
                        <h1 class="gold-text" style="margin-bottom: 25px; font-size: 1.5rem; text-align: center; border-bottom: 1px solid rgba(212, 175, 55, 0.3); padding-bottom: 15px;">Admin Control Panel</h1>
                        
                        <div class="admin-menu-section" style="margin-bottom: 25px;">
                            <h2 style="color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 10px;">Core Management</h2>
                            <div style="display: flex; flex-direction: column; gap: 5px;">
                                <button id="btnProfProfileAdmin" class="admin-nav-btn">👥 Professional Profiles</button>
                                <button id="btnPendingApprovals" class="admin-nav-btn active-nav">✅ Pending Approvals</button>
                                <button id="btnPaymentVerifications" class="admin-nav-btn">💳 Payment Verifications</button>
                                <button id="btnSupportMessages" class="admin-nav-btn">📩 ${t('Support messages')}</button>
                                <button id="btnInterestNotes" class="admin-nav-btn">📰 ${t('Notes of Interest')}</button>
                                <button id="btnAvisos" class="admin-nav-btn">📋 Avisos</button>
                                <button id="btnStats" class="admin-nav-btn">📊 Estadísticas KPI</button>
                                <button id="btnServerLogs" class="admin-nav-btn">Logs del servidor</button>
                                <button id="btnDashboardConfig" class="admin-nav-btn">⚙️ ${t('Dashboard Config')}</button>
                            </div>
                        </div>

                        <div class="admin-menu-section" style="margin-bottom: 25px;">
                            <h2 style="color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 10px;">Communications</h2>
                            <div style="display: flex; flex-direction: column; gap: 5px;">
                                <button id="btnApplyInvitations" class="admin-nav-btn">📨 ${t('Apply Invitations')}</button>
                                <button id="btnMailSpecial" class="admin-nav-btn">📧 Mail: Special Messages</button>
                                <button id="btnMailBroadcast" class="admin-nav-btn">📢 Mail: Broadcast Messages</button>
                                <button id="btnWaSpecial" class="admin-nav-btn">💬 WA: Special Messages</button>
                                <button id="btnWaBroadcast" class="admin-nav-btn">📲 WA: Broadcast Messages</button>
                            </div>
                        </div>

                        <div class="admin-menu-section" style="margin-bottom: 25px;">
                            <h2 style="color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 10px;">Analytics & Traces</h2>
                            <div style="display: flex; flex-direction: column; gap: 5px;">
                                <button id="btnGuestTraffic" class="admin-nav-btn">🕵️‍♂️ Guest Traffic</button>
                                <button id="btnTreasuresSteps" class="admin-nav-btn">💎 Treasures Steps</button>
                                <button id="btnViewLogs" class="admin-nav-btn">📊 Full Activity Logs</button>
                                <button id="btnAccessLogs" class="admin-nav-btn">🔒 Access Logs</button>
                                <button id="btnReportePerformance" class="admin-nav-btn">⚡ ${t('Reporte de performance')}</button>
                            </div>
                        </div>

                        <div class="admin-menu-section">
                            <h2 style="color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 10px;">System Settings</h2>
                            <div style="display: flex; flex-direction: column; gap: 5px;">
                                <button id="btnEditPricing" class="admin-nav-btn" style="color: var(--primary-gold); border-color: rgba(212, 175, 55, 0.3);">💰 ${t('Change prices')}</button>
                                <div class="admin-launch-switch" style="margin: 8px 4px 0;">
                                    <span class="admin-launch-switch-label">🎭 ${t('Hide grids (launch curtain)')}</span>
                                    <label class="admin-toggle-switch" title="${t('Launch curtain')}">
                                        <input type="checkbox" id="adminLaunchCurtainQuickToggle" aria-label="${t('Hide grids (launch curtain)')}">
                                        <span class="admin-toggle-slider"></span>
                                    </label>
                                </div>
                                <a id="btnPreviewGrid" class="admin-nav-btn" href="/hogar.html" target="_blank" rel="noopener" style="display: block; text-align: left; text-decoration: none; margin-top: 8px;" title="${t('Preview the live grid (admins bypass the curtain)')}">👁️ ${t('Preview live grid')}</a>
                            </div>
                        </div>
                    </div>
                `;
                
                const gridContainer = document.createElement('div');
                gridContainer.id = 'adminGridContainer';
                gridContainer.className = 'admin-main';
                gridContainer.style.flexGrow = '1';
                gridContainer.style.minWidth = '300px';
                
                adminLayout.appendChild(adminPanel);
                adminLayout.appendChild(gridContainer);
                content.appendChild(adminLayout);
                
                document.getElementById('btnEditPricing').addEventListener('click', () => openEditPricingModal(data.globalPricing));
                document.getElementById('btnViewLogs').addEventListener('click', () => openActivityLogsModal());
                document.getElementById('btnAccessLogs').addEventListener('click', () => openAccessLogsModal());
                document.getElementById('btnReportePerformance').addEventListener('click', () => openReportePerformanceModal());
                document.getElementById('btnGuestTraffic').addEventListener('click', () => openActivityLogsModal('Guest Traffic', { isGuest: 'true' }));
                document.getElementById('btnTreasuresSteps').addEventListener('click', () => openActivityLogsModal('Treasures Steps', { isGuest: 'false' }));
                document.getElementById('btnApplyInvitations').addEventListener('click', openViewLeadsModal);
                document.getElementById('btnPendingApprovals').addEventListener('click', openPendingVerificationsModal);
                document.getElementById('btnPaymentVerifications').addEventListener('click', openPaymentVerificationsModal);
                document.getElementById('btnSupportMessages').addEventListener('click', openSupportMessagesModal);
                document.getElementById('btnInterestNotes').addEventListener('click', openInterestNotesAdminModal);
                document.getElementById('btnAvisos').addEventListener('click', openAvisosModal);
                document.getElementById('btnStats').addEventListener('click', openStatsModal);
                
                document.getElementById('btnProfProfileAdmin').addEventListener('click', () => {
                    document.getElementById('adminGridContainer').scrollIntoView({ behavior: 'smooth' });
                });

                ['btnDashboardConfig', 'btnServerLogs'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('click', id === 'btnServerLogs' ? openServerLogsModal : openDashboardConfigModal);
                });

                initLaunchCurtainQuickToggle();

                document.getElementById('btnMailSpecial').addEventListener('click', openMailSpecialModal);
                document.getElementById('btnMailBroadcast').addEventListener('click', openMailBroadcastModal);
                document.getElementById('btnWaSpecial').addEventListener('click', openWaSpecialModal);
                document.getElementById('btnWaBroadcast').addEventListener('click', openViewLeadsModal);

                renderAdminGrid(gridContainer);
                
                finishDashboardLoad('dashboardContent', 'loader');
                applyStaticTranslations(content);
                fixUnassociatedLabels(content);
                maybeWarnWhatsAppDisconnected();
                return; // Stop execution to prevent loading professional specific data
            }

            renderProfessionalMainDashboardShell(content);
            bindProfessionalProfileForm();
            initPhonePicker('upMobile');
            initPhonePicker('upWa');

            const prof = user.professionalProfile || {};
            const isApproved = user.verificationStatus === 'approved';

            const insertRef = document.querySelector('#dashboardContent > .grid') || content.firstChild;

            injectProfessionalDashboardGuides(content, data, insertRef);
            
            // Analytics Frame (Last Month)
            let analyticsSection = document.getElementById('analyticsSection');
            if (!analyticsSection && user.role === 'professional') {
                analyticsSection = document.createElement('div');
                analyticsSection.id = 'analyticsSection';
                analyticsSection.className = 'card fileteado-section';
                analyticsSection.style.marginBottom = '20px';
                analyticsSection.style.border = '1px solid var(--primary-gold)';
                analyticsSection.innerHTML = `
                    <h3 class="gold-text" style="margin-bottom: 15px;">Performance Analytics (Last Month)</h3>
                    <div style="display: flex; gap: 20px; justify-content: space-around; text-align: center;">
                        <div><div style="font-size: 2.5rem; color: var(--primary-gold);">${stats.photoCount || 0}</div><div style="font-size: 0.9rem; color: #ccc;">Dashboard Photo Clicks</div></div>
                        <div><div style="font-size: 2.5rem; color: var(--primary-gold);">${stats.whatsappcCount || 0}</div><div style="font-size: 0.9rem; color: #ccc;">WhatsApp Button Pushes</div></div>
                        <div><div style="font-size: 2.5rem; color: var(--primary-gold);">${stats.callCount || 0}</div><div style="font-size: 0.9rem; color: #ccc;">Call Button Pushes</div></div>
                    </div>
                `;
                content.insertBefore(analyticsSection, insertRef);
            }

            // Connection Requests section
            let connSection = document.getElementById('connectionRequestsSection');
            if (!connSection && user.role === 'professional') {
                connSection = document.createElement('div');
                connSection.id = 'connectionRequestsSection';
                connSection.className = 'card fileteado-section';
                connSection.style.marginBottom = '20px';
                connSection.style.border = '1px solid var(--primary-gold)';
                
                connSection.innerHTML = `
                    <h3 class="gold-text" style="margin-bottom: 15px;">Connection Requests</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button id="btnViewConnections" style="width: auto; padding: 10px 20px; background: var(--primary-gold); color: var(--dark-bg);">View Pending Requests</button>
                    </div>
                `;
                content.insertBefore(connSection, insertRef);
                
                document.getElementById('btnViewConnections').addEventListener('click', openPendingConnectionsModal);
            }

            // Services and Category Block (Checkboxes with Tooltips)
            if (!document.getElementById('servicesBlock')) {
                const servicesBlock = document.createElement('div');
                servicesBlock.id = 'servicesBlock';
                servicesBlock.className = 'card fileteado-section';
                servicesBlock.style.marginTop = '20px';
                servicesBlock.style.border = '1px solid var(--primary-gold)';
                
                const title = document.createElement('h3');
                title.className = 'gold-text';
                title.textContent = 'Category & Specialties';
                title.style.marginBottom = '15px';
                servicesBlock.appendChild(title);
                
                const catInfo = document.createElement('div');
                const qMeta = CATEGORY_META[prof.quality || 'Standard'];
                const desiredQ = prof.desiredQuality || prof.quality || 'Standard';
                const evalNote = prof.isEvaluationPeriod
                    ? `<p style="font-size:0.85rem;color:#aaa;margin-bottom:10px;">${t('Evaluation period')}: ${t('visible now')} <strong style="color:var(--primary-gold);">${prof.quality}</strong>. ${t('Chosen category')}: <strong>${desiredQ}</strong> (${t('applied after first validated payment')}).</p>`
                    : '';
                catInfo.innerHTML = `<p style="margin-bottom: 15px;"><strong>${t('Category:')}</strong> <span style="color: var(--primary-gold);">${qMeta ? t(qMeta.name) : (prof.quality || 'Standard')}</span></p>
                    ${evalNote}
                    <label style="display: block; margin-bottom: 5px;">${prof.isEvaluationPeriod ? t('Desired category:') : t('Category:')}</label>
                    <select id="upQuality" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid var(--primary-gold); border-radius: 4px; margin-bottom: 15px;">
                        <option value="verificados" ${(prof.isEvaluationPeriod ? desiredQ : prof.quality) === 'verificados' ? 'selected' : ''}>${t(CATEGORY_META['verificados'].name)}</option>
                        <option value="Premium" ${(prof.isEvaluationPeriod ? desiredQ : prof.quality) === 'Premium' ? 'selected' : ''}>${t(CATEGORY_META['Premium'].name)}</option>
                        <option value="Gold" ${(prof.isEvaluationPeriod ? desiredQ : prof.quality) === 'Gold' ? 'selected' : ''}>${t(CATEGORY_META['Gold'].name)}</option>
                        <option value="Silver" ${(prof.isEvaluationPeriod ? desiredQ : prof.quality) === 'Silver' ? 'selected' : ''}>${t(CATEGORY_META['Silver'].name)}</option>
                        <option value="Standard" ${(prof.isEvaluationPeriod ? desiredQ : prof.quality) === 'Standard' ? 'selected' : ''}>${t(CATEGORY_META['Standard'].name)}</option>
                    </select>
                `;
                const catSelect = catInfo.querySelector('#upQuality');
                if (catSelect) catSelect.addEventListener('change', () => { if (typeof window.saveProfessionalProfile === 'function') window.saveProfessionalProfile(true); });
                servicesBlock.appendChild(catInfo);
                
                const specLabel = document.createElement('label');
                specLabel.textContent = t('Specialties:');
                specLabel.style.display = 'block';
                specLabel.style.marginBottom = '10px';
                servicesBlock.appendChild(specLabel);
                
                const specs = [
                    { name: 'Love Alchemy', tooltip: 'Sex' },
                    { name: 'Massage', tooltip: 'Conventional massage' },
                    { name: 'Virtual Connection', tooltip: 'Virtual call' },
                    { name: 'Media Content', tooltip: 'Share hot content pics or videos' },
                    { name: 'Streaming Kisses', tooltip: 'Live streaming kisses' }
                ];
                
                const specsContainer = document.createElement('div');
                specsContainer.style.display = 'flex';
                specsContainer.style.flexWrap = 'wrap';
                specsContainer.style.gap = '10px';
                
                const userServices = prof.services || [];
                
                specs.forEach(spec => {
                    const lbl = document.createElement('label');
                    lbl.title = spec.tooltip;
                    lbl.style.display = 'flex';
                    lbl.style.alignItems = 'center';
                    lbl.style.gap = '5px';
                    lbl.style.cursor = 'pointer';
                    lbl.style.padding = '8px 12px';
                    lbl.style.background = 'rgba(212,175,55,0.1)';
                    lbl.style.borderRadius = '4px';
                    lbl.style.border = '1px solid rgba(212,175,55,0.3)';
                    lbl.style.fontSize = '0.9rem';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = spec.name;
                    cb.className = 'dashboard-specialty-cb';
                    cb.checked = userServices.includes(spec.name) || userServices.includes(spec.name.toLowerCase());
                    
                    cb.addEventListener('change', () => {
                        if (typeof window.saveProfessionalProfile === 'function') window.saveProfessionalProfile(true);
                    });

                    lbl.appendChild(cb);
                    lbl.appendChild(document.createTextNode(t(spec.name)));
                    specsContainer.appendChild(lbl);
                });
                
                servicesBlock.appendChild(specsContainer);
                
                const formObj = document.getElementById('updateProfileForm');
                const bioEl = document.getElementById('upBio');
                
                // Hide old services dropdown if exists
                const oldServ = document.getElementById('upServices');
                if (oldServ) {
                    oldServ.style.display = 'none';
                    if (oldServ.previousElementSibling) oldServ.previousElementSibling.style.display = 'none';
                }

                if (bioEl && bioEl.parentNode && bioEl.parentNode.tagName === 'DIV' && bioEl.parentNode.querySelector('#goldPenIcon')) {
                    formObj.insertBefore(servicesBlock, bioEl.parentNode);
                } else if (bioEl) {
                    formObj.insertBefore(servicesBlock, bioEl);
                } else if (formObj) {
                    formObj.appendChild(servicesBlock);
                }
            }

            // Extended Contact block
            if (!document.getElementById('extraContactBlock')) {
                const extraBlock = document.createElement('div');
                extraBlock.id = 'extraContactBlock';
                extraBlock.className = 'card fileteado-section';
                extraBlock.style.marginTop = '20px';
                extraBlock.style.border = '1px solid var(--primary-gold)';
                extraBlock.innerHTML = `
                    <h3 class="gold-text" style="margin-bottom: 15px;">Extended Contact & Address</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;">
                        <div style="flex: 1; min-width: 200px;">
                            <label style="display: block; margin-bottom: 5px;">Post Code</label>
                        <input type="text" id="upPostCode" value="${prof.location?.postalCode || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px;">
                            <label style="display: block; margin-bottom: 5px;">Instagram</label>
                            <input type="text" id="upInstagram" value="${prof.instagram || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                        </div>
                        <div style="flex: 1; min-width: 200px;">
                            <label style="display: block; margin-bottom: 5px;">Facebook</label>
                            <input type="text" id="upFacebook" value="${prof.facebook || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                        </div>
                    </div>
                `;
                const formObj = document.getElementById('updateProfileForm');
                const vacBlock = document.getElementById('vacationBlock');
                if (vacBlock) {
                    formObj.insertBefore(extraBlock, vacBlock);
                } else {
                    formObj.appendChild(extraBlock);
                }
                extraBlock.querySelectorAll('input').forEach(input => {
                    input.addEventListener('blur', () => { if (typeof window.saveProfessionalProfile === 'function') window.saveProfessionalProfile(true); });
                });
            }

            // Safe value setter (ignores missing HTML elements)
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            };

            // Fill fields
            setVal('upFirstName', prof.firstName || '');
            setVal('upSurname', prof.surname || '');
            setVal('upMiddleName', prof.middleName || '');
            setVal('upIdNumber', prof.idNumber || '');
            if (prof.birthDate) {
                const d = new Date(prof.birthDate);
                setVal('upBirthDate', d.toISOString().split('T')[0]);
            }
            setVal('upAge', prof.age || '');
            setVal('upMobilePhone', prof.mobilePhone || '');
            setVal('upStreet', prof.location?.street || '');
            setVal('upStreetNumber', prof.location?.number || '');
            setVal('upFloor', prof.location?.floor || '');
            setVal('upApartment', prof.location?.apartment || '');

            const upBirthDate = document.getElementById('upBirthDate');
            if (upBirthDate) {
                upBirthDate.addEventListener('change', (e) => {
                    if (e.target.value) {
                        const dob = new Date(e.target.value);
                        const ageDifMs = Date.now() - dob.getTime();
                        document.getElementById('upAge').value = Math.abs(new Date(ageDifMs).getUTCFullYear() - 1970);
                    }
                });
            }

            // Make non-editable fields grey and build Profile UI
            if (user.role === 'professional') {
                // Only Address and Connection blocks remain editable
                const readOnlyFields = ['upFirstName', 'upSurname', 'upMiddleName', 'upIdNumber', 'upBirthDate'];
                readOnlyFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.readOnly = true; el.disabled = true;
                        el.style.background = '#333'; el.style.color = '#888'; el.style.borderColor = '#444'; el.style.cursor = 'not-allowed';
                    }
                });
                const readOnlyToggles = ['upOwnApartment', 'upFantasyWardrobe', 'upServices'];
                readOnlyToggles.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) { el.disabled = true; el.style.opacity = '0.6'; el.style.cursor = 'not-allowed'; }
                });

                // Main Profile Frame (Yellow Pen)
                const formEl = document.getElementById('updateProfileForm');
                if (formEl && !document.getElementById('yellowPenIcon')) {
                    formEl.style.position = 'relative';
                    const yellowPen = document.createElement('button');
                    yellowPen.type = 'button';
                    yellowPen.id = 'yellowPenIcon';
                    yellowPen.setAttribute('aria-label', t('Edit Profile (Address and Connection Info Only)'));
                    yellowPen.innerHTML = '✏️';
                    yellowPen.style.cssText = 'position: absolute; top: 10px; right: 10px; color: yellow; font-size: 1.5rem; cursor: pointer; text-shadow: 0 0 5px rgba(255,255,0,0.5); z-index: 10; background: transparent; border: none; padding: 0;';
                    formEl.appendChild(yellowPen);
                }

                // Service Description Frame (Gold Pen)
                const bioEl = document.getElementById('upBio');
                if (bioEl && !document.getElementById('goldPenIcon')) {
                    const wrapper = document.createElement('div');
                    wrapper.style.position = 'relative';
                    wrapper.style.marginTop = '20px';
                    wrapper.style.padding = '15px';
                    wrapper.style.border = '1px solid var(--primary-gold)';
                    wrapper.style.borderRadius = '8px';
                    
                    const goldPen = document.createElement('button');
                    goldPen.type = 'button';
                    goldPen.id = 'goldPenIcon';
                    goldPen.setAttribute('aria-label', t('Edit Service Description'));
                    goldPen.innerHTML = '✏️';
                    goldPen.style.cssText = 'position: absolute; top: 10px; right: 10px; color: gold; font-size: 1.5rem; cursor: pointer; text-shadow: 0 0 5px rgba(212,175,55,0.5); z-index: 10; background: transparent; border: none; padding: 0;';
                    
                    const title = document.createElement('h3');
                    title.className = 'gold-text';
                    title.textContent = 'Service description';
                    title.style.marginBottom = '10px';
                    
                    bioEl.parentNode.insertBefore(wrapper, bioEl);
                    wrapper.appendChild(title);
                    wrapper.appendChild(goldPen);
                    wrapper.appendChild(bioEl);
                    
                    bioEl.style.width = '100%';
                    bioEl.style.minHeight = '100px';
                }

                // Availability Schedule Block
                if (!document.getElementById('availabilityBlock')) {
                    const availBlock = document.createElement('div');
                    availBlock.id = 'availabilityBlock';
                    availBlock.className = 'card fileteado-section';
                    availBlock.style.marginTop = '20px';
                    availBlock.style.border = '1px solid var(--primary-gold)';
                    availBlock.style.position = 'relative';

                    const goldPenAvail = document.createElement('button');
                    goldPenAvail.type = 'button';
                    goldPenAvail.setAttribute('aria-label', t('Edit Availability'));
                    goldPenAvail.innerHTML = '✏️';
                    goldPenAvail.style.cssText = 'position: absolute; top: 10px; right: 10px; color: gold; font-size: 1.5rem; cursor: pointer; text-shadow: 0 0 5px rgba(212,175,55,0.5); z-index: 10; background: transparent; border: none; padding: 0;';
                    availBlock.appendChild(goldPenAvail);
                    
                    const title = document.createElement('h3');
                    title.className = 'gold-text';
                    title.textContent = 'Availability Schedule';
                    title.style.marginBottom = '15px';
                    availBlock.appendChild(title);
                    
                    // Days checkboxes
                    const daysContainer = document.createElement('div');
                    daysContainer.style.display = 'flex';
                    daysContainer.style.gap = '10px';
                    daysContainer.style.flexWrap = 'wrap';
                    daysContainer.style.marginBottom = '15px';
                    
                    renderAvailabilityDayControls(daysContainer, prof.workingDays);
                    availBlock.appendChild(daysContainer);
                    
                    // Times
                    const timeContainer = document.createElement('div');
                    timeContainer.style.display = 'flex';
                    timeContainer.style.gap = '15px';
                    
                    const startDiv = document.createElement('div');
                    startDiv.style.flex = '1';
                    startDiv.innerHTML = '<label style="display:block; margin-bottom:5px;">Start Time (AM/PM)</label>';
                    const startInput = document.createElement('input');
                    startInput.type = 'time';
                    startInput.id = 'upAvailStart';
                    startInput.value = prof.workingHours?.start || '00:00';
                    startInput.style.cssText = 'width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;';
                    startDiv.appendChild(startInput);
                    
                    const endDiv = document.createElement('div');
                    endDiv.style.flex = '1';
                    endDiv.innerHTML = '<label style="display:block; margin-bottom:5px;">End Time (AM/PM)</label>';
                    const endInput = document.createElement('input');
                    endInput.type = 'time';
                    endInput.id = 'upAvailEnd';
                    endInput.value = prof.workingHours?.end || '23:59';
                    endInput.style.cssText = 'width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;';
                    endDiv.appendChild(endInput);
                    
                    timeContainer.appendChild(startDiv);
                    timeContainer.appendChild(endDiv);
                    availBlock.appendChild(timeContainer);
                    
                    // Disable inputs by default
                    const inputs = [startInput, endInput, ...availBlock.querySelectorAll('.avail-day-cb, [data-availability-preset]')];
                    inputs.forEach(el => {
                        el.disabled = true;
                        if(el.type !== 'checkbox') el.style.background = '#333';
                    });
                    
                    goldPenAvail.addEventListener('click', () => {
                        inputs.forEach(el => {
                            el.disabled = false;
                            if(el.type !== 'checkbox') el.style.background = '#222';
                        });
                        goldPenAvail.style.color = '#fff';
                        goldPenAvail.style.textShadow = '0 0 10px #fff';
                        setTimeout(() => {
                            goldPenAvail.style.color = 'gold';
                            goldPenAvail.style.textShadow = '0 0 5px rgba(212,175,55,0.5)';
                        }, 500);
                    });

                    // Hide the old legacy inputs cleanly
                    const oldStart = document.getElementById('upWorkingHoursStart');
                    if (oldStart && oldStart.parentNode && oldStart.parentNode.parentNode) {
                        oldStart.parentNode.parentNode.style.display = 'none';
                    }
                    const oldDays = document.getElementById('upWorkingDays');
                    if (oldDays) {
                        oldDays.style.display = 'none';
                        const oldDaysLabel = oldDays.previousElementSibling;
                        if (oldDaysLabel && oldDaysLabel.tagName === 'LABEL') oldDaysLabel.style.display = 'none';
                    }

                    // Insert before Vacation Block if exists, else before photos
                    const vacBlock = document.getElementById('vacationBlock');
                    if (vacBlock) {
                        vacBlock.parentNode.insertBefore(availBlock, vacBlock);
                    } else {
                        const formObj = document.getElementById('updateProfileForm');
                        const photoGridEl = document.getElementById('photoGrid');
                        if (formObj && photoGridEl) {
                            formObj.insertBefore(availBlock, photoGridEl.parentNode);
                        } else if (formObj) {
                            formObj.appendChild(availBlock);
                        }
                    }
                }

                // Vacation Block
                if (!document.getElementById('vacationBlock')) {
                    const vacBlock = document.createElement('div');
                    vacBlock.id = 'vacationBlock';
                    vacBlock.className = 'card fileteado-section';
                    vacBlock.style.marginTop = '20px';
                    vacBlock.style.border = '1px solid var(--primary-gold)';
                    vacBlock.innerHTML = `
                        <h3 class="gold-text" style="margin-bottom: 5px;">Miscellaneous (Vacation)</h3>
                        <p style="font-size: 0.85rem; color: #aaa; margin-bottom: 15px;">${t('Max 20 calendar days per request. Up to 15 days per month are discounted from your monthly balance. One vacation request per year.')}</p>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 150px;">
                                <label style="display: block; margin-bottom: 5px;">Start Date</label>
                                <input type="date" id="upVacationStart" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                            </div>
                            <div style="flex: 1; min-width: 150px;">
                                <label style="display: block; margin-bottom: 5px;">End Date</label>
                                <input type="date" id="upVacationEnd" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                            </div>
                        </div>
                        <div id="vacationWarn" style="color: var(--accent-red); font-size: 0.85rem; margin-top: 10px;"></div>
                    `;
                    
                    const formObj = document.getElementById('updateProfileForm');
                    const photoGridEl = document.getElementById('photoGrid');
                    if (formObj && photoGridEl) {
                        formObj.insertBefore(vacBlock, photoGridEl.parentNode);
                    } else if (formObj) {
                        formObj.appendChild(vacBlock);
                    }

                    if (prof.vacation) {
                        if (prof.vacation.startDate) document.getElementById('upVacationStart').value = new Date(prof.vacation.startDate).toISOString().split('T')[0];
                        if (prof.vacation.endDate) document.getElementById('upVacationEnd').value = new Date(prof.vacation.endDate).toISOString().split('T')[0];
                        
                        const reqYear = new Date(prof.vacation.requestedAt).getFullYear();
                        if (reqYear === new Date().getFullYear()) {
                            document.getElementById('vacationWarn').textContent = 'You have already submitted a vacation request for this year. It cannot be modified.';
                            document.getElementById('vacationWarn').style.color = '#ccc';
                            document.getElementById('upVacationStart').disabled = true;
                            document.getElementById('upVacationEnd').disabled = true;
                            document.getElementById('upVacationStart').style.background = '#333';
                            document.getElementById('upVacationEnd').style.background = '#333';
                        }
                    }

                    document.getElementById('upVacationEnd').addEventListener('change', () => {
                        const start = new Date(document.getElementById('upVacationStart').value);
                        const end = new Date(document.getElementById('upVacationEnd').value);
                        const warn = document.getElementById('vacationWarn');
                        warn.textContent = '';
                        if (start && end) {
                            const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                            if (diff > 20) {
                                warn.textContent = 'Maximum 20 calendar days exceeded. End date automatically adjusted to highest value (20 days).';
                                const newEnd = new Date(start.getTime() + 20 * 24 * 60 * 60 * 1000);
                                document.getElementById('upVacationEnd').value = newEnd.toISOString().split('T')[0];
                            } else if (diff < 0) {
                                warn.textContent = 'End date cannot be before start date.';
                                document.getElementById('upVacationEnd').value = document.getElementById('upVacationStart').value;
                            }
                        }
                    });
                }
            }

            setVal('upAlias', prof.alias || '');
            setVal('upBio', prof.bio || '');

            // Populate hogarProfile fields (companyName, taxId)
            const hp = user.hogarProfile || {};
            setVal('upCompanyName', hp.companyName || '');
            setVal('upTaxId', hp.taxId || '');
            
            // Update read-only quality display instead of dropdown
            const displayQuality = document.getElementById('displayQuality');
            if (displayQuality) {
                const q = prof.quality || 'Standard';
                const meta = CATEGORY_META[q];
                displayQuality.textContent = meta ? `${meta.name}` : q;
                displayQuality.className = `quality-badge quality-${q.toLowerCase()}`;
            }
            
            const aptEl = document.getElementById('upOwnApartment');
            if (aptEl) aptEl.checked = !!prof.hasOwnApartment;
            const wardEl = document.getElementById('upFantasyWardrobe');
            if (wardEl) wardEl.checked = !!prof.hasFantasyWardrobe;
            
            const expEl = document.getElementById('upIsExposed');
            if (expEl) expEl.checked = prof.isExposed !== false; // default true
            
            // Pre-select options in the multiple dropdown
            const upServicesEl = document.getElementById('upServices');
            if (upServicesEl && upServicesEl.tagName === 'SELECT') {
                const userServices = prof.services || [];
                Array.from(upServicesEl.options).forEach(opt => {
                    opt.selected = userServices.includes(opt.value);
                });
            } else {
                setVal('upServices', (prof.services || []).join(', '));
            }
            // Render specialties dropdown
            renderSpecialtyDropdown('upServices', prof.services || []);
            setVal('upWhatsapp', prof.whatsappNumber || '');
            
            setVal('upWorkingHoursStart', prof.workingHours?.start || '00:00');
            setVal('upWorkingHoursEnd', prof.workingHours?.end || '23:59');
            
            const upWDaysEl = document.getElementById('upWorkingDays');
            if (upWDaysEl && upWDaysEl.tagName === 'SELECT') {
                const wDays = prof.workingDays || [];
                Array.from(upWDaysEl.options).forEach(opt => {
                    opt.selected = wDays.includes(opt.value);
                });
            } else {
                setVal('upWorkingDays', (prof.workingDays || []).join(', '));
            }
            
            setupLocationDropdowns('upProvince', 'upCity', 'upNeighborhood', false, prof.location || {});
            initCpaAutofill({ streetId: 'upStreet', numberId: 'upStreetNumber', provinceId: 'upProvince', cityId: 'upCity', postCodeId: 'upPostCode' });

            const photoGrid = document.getElementById('photoGrid');
            const newPhotoInput = document.getElementById('newPhotoInput');
            if (photoGrid) {
                photoGrid.innerHTML = '';
                
                const frameLabel = document.createElement('label');
                frameLabel.className = 'add-photo-frame';
                frameLabel.innerHTML = '<span>+</span>';
                
                if (newPhotoInput) {
                    newPhotoInput.style.display = 'none';
                    newPhotoInput.accept = 'image/png, image/jpeg, image/jpg, image/webp';
                    newPhotoInput.multiple = true;
                    frameLabel.appendChild(newPhotoInput);
                }
                
                photoGrid.appendChild(frameLabel);

                (prof.photos || []).forEach(url => addPhotoToGrid(url));
                
                let photoWrapper = document.getElementById('photoWrapperCustom');
                if (!photoWrapper) {
                    photoWrapper = document.createElement('div');
                    photoWrapper.id = 'photoWrapperCustom';
                    photoWrapper.className = 'card fileteado-section';
                    photoWrapper.style.display = 'flex';
                    photoWrapper.style.justifyContent = 'space-between';
                    photoWrapper.style.alignItems = 'center';
                    photoWrapper.style.position = 'relative';
                    photoWrapper.style.marginTop = '20px';
                    
                    const title = document.createElement('h3');
                    title.className = 'gold-text';
                    title.textContent = 'Personal Photos';
                    title.style.position = 'absolute';
                    title.style.top = '15px';
                    title.style.left = '15px';
                    
                    photoGrid.parentNode.insertBefore(photoWrapper, photoGrid);
                    
                    const leftDiv = document.createElement('div');
                    leftDiv.style.flex = '1';
                    leftDiv.style.marginTop = '40px'; 
                    leftDiv.appendChild(photoGrid);
                    
                    const uploadBtn = document.createElement('button');
                    uploadBtn.type = 'button';
                    uploadBtn.textContent = 'Upload';
                    uploadBtn.style.padding = '10px 20px';
                    uploadBtn.style.marginLeft = '20px';
                    uploadBtn.style.background = 'var(--primary-gold)';
                    uploadBtn.style.color = '#111';
                    uploadBtn.style.fontWeight = 'bold';
                    uploadBtn.style.whiteSpace = 'nowrap';
                    uploadBtn.onclick = () => { if (newPhotoInput) newPhotoInput.click(); };
                    
                    photoWrapper.appendChild(title);
                    photoWrapper.appendChild(leftDiv);
                    photoWrapper.appendChild(uploadBtn);
                }

                if (!isApproved) {
                    photoGrid.style.opacity = '0.3';
                    photoGrid.style.pointerEvents = 'none';
                }
            }

            if (newPhotoInput) {
                if (!isApproved) {
                    newPhotoInput.disabled = true;
                    if (!document.getElementById('photoApprovalMsg')) {
                        const msg = document.createElement('p');
                        msg.id = 'photoApprovalMsg';
                        msg.style.color = 'var(--accent-red)';
                        msg.style.fontSize = '0.85rem';
                        msg.style.marginTop = '5px';
                        msg.textContent = 'Profile photos can only be uploaded after your account is approved.';
                        newPhotoInput.parentNode.appendChild(msg);
                    }
                } else {
                    newPhotoInput.disabled = false;
                    const msg = document.getElementById('photoApprovalMsg');
                    if (msg) msg.remove();
                }

                // Inject Bottom Back Button
                if (!document.getElementById('bottomBackBtn')) {
                    const bottomBackBtn = document.createElement('button');
                    bottomBackBtn.id = 'bottomBackBtn';
                    bottomBackBtn.type = 'button';
                    bottomBackBtn.innerHTML = '&#8592; Back to Main Dashboard';
                    bottomBackBtn.style.cssText = 'background: var(--primary-gold); color: var(--dark-bg); font-weight: bold; margin-top: 25px; width: 100%;';
                    bottomBackBtn.onclick = async () => {
                        if (typeof window.saveProfessionalProfile === 'function') {
                            await window.saveProfessionalProfile(true);
                        }
                        window.location.href = appPath('profile.html');
                    };
                    document.getElementById('updateProfileForm').appendChild(bottomBackBtn);
                }
            }

            // Status
            const vStatus = document.getElementById('verificationStatus');
            if (vStatus) vStatus.textContent = (user.verificationStatus || 'pending').toUpperCase();

            const rStatus = document.getElementById('revelationStatus');
            if (rStatus) {
                rStatus.textContent = user.isVerified ? 'REVEALED' : 'VEILED';
                rStatus.style.background = user.isVerified ? 'var(--primary-gold)' : 'transparent';
                rStatus.style.color = user.isVerified ? 'var(--dark-bg)' : 'var(--primary-gold)';
            }

            // Duo Status
            const duoStatus = document.getElementById('duoStatus');
            if (duoStatus) {
                duoStatus.innerHTML = prof.isDuo ? `<p>Connected in Duo mode.</p>` : `<p>Not currently in a Duo.</p>`;
            }

            // Rate Alert
            if (!data.isReadyForTransactions) {
                const rateAlert = document.getElementById('rateAlert');
                if (rateAlert) rateAlert.classList.remove('hidden');
            }

            // Suspension Overlay logic
            if (prof.subscriptionStatus === 'suspended') {
                const suspensionAlert = document.createElement('div');
                suspensionAlert.className = 'card alert';
                suspensionAlert.style.marginBottom = '20px';
                suspensionAlert.style.border = '2px solid var(--accent-red)';
                let pendingInv = (prof.invoices || []).find(i => i.status === 'pending');
                let feeText = pendingInv && pendingInv.lateFeeApplied ? ` A 2% late fee has been applied. Your new total is <strong>$${new Intl.NumberFormat('es-AR').format(pendingInv.amount)} ARS</strong>.` : '';
                suspensionAlert.innerHTML = `<h3 style="color: var(--accent-red); margin-top: 0;">Account Suspended</h3><p>Your profile has been removed from the public grid due to an unpaid balance past the 5-business-day grace period.${feeText}</p><p>To restore your access, please upload your payment receipt below. Once verified by an admin, your profile will reappear on the directory.</p>`;
                content.prepend(suspensionAlert);
                
                // Disable the update profile form so they know they are restricted
                const upForm = document.getElementById('updateProfileForm');
                if (upForm) { upForm.style.opacity = '0.3'; upForm.style.pointerEvents = 'none'; }
            }

            finishDashboardLoad('dashboardContent', 'loader');
            applyStaticTranslations(content);
            fixUnassociatedLabels(content);
        } else {
            console.error('Dashboard auth error:', data.error);
            content.innerHTML = `
                <div class="card" style="text-align: center; padding: 40px; margin-top: 20px;">
                    <h2 class="gold-text">${t('Access Denied')}</h2>
                    <p style="margin-bottom: 25px;">${t('Please log in or register to access the dashboard.')}</p>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button type="button" id="dashGuestLogin">${t('Login')}</button>
                        <button type="button" id="dashGuestRegister" style="background: transparent; border: 1px solid var(--primary-gold); color: var(--primary-gold);">${t('Register')}</button>
                    </div>
                </div>
            `;
            content.querySelector('#dashGuestLogin')?.addEventListener('click', () => {
                navigateWithReturn(appPath('login.html'));
            });
            content.querySelector('#dashGuestRegister')?.addEventListener('click', () => {
                navigateWithReturn(appPath('register.html'));
            });
            finishDashboardLoad('dashboardContent', 'loader');
            applyStaticTranslations(content);
        }
    } catch (err) {
        console.error('Dashboard rendering error:', err);
        failDashboardLoad('dashboardContent', 'loader', `<p style="color: var(--accent-red); text-align:center; padding:40px;">Error loading vault. See console.</p>`);
    } finally {
        dashboardLoadInFlight = null;
    }
    })();

    return dashboardLoadInFlight;
}

let currentLogFilters = {};
let currentLogBaseFilters = {};
let cachedActivityLogs = [];
let selectedLogId = '';

function formatLogShortWhen(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString();
}

function getFilteredActivityLogs() {
    const q = (document.getElementById('logSearch')?.value || '').trim().toLowerCase();
    if (!q) return cachedActivityLogs;
    return cachedActivityLogs.filter((log) => {
        const hay = [
            formatLogActor(log),
            log.action,
            log.ipAddress,
            log.userAgent,
            log.details?.reason,
            log.details?.userEmail,
            log.professional?.email,
            log.professional?.professionalProfile?.alias,
            log.actorType
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    });
}

function formatLogDetailsGrouped(details) {
    if (!details || !Object.keys(details).length) return '';

    const rows = Object.entries(details).map(([key, val]) => {
        const display = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
        return `<div class="log-detail-field">
            <span class="log-detail-label">${escapeHtml(key)}</span>
            <div class="log-detail-value">${escapeHtml(display)}</div>
        </div>`;
    }).join('');

    return `<div class="log-detail-section">
        <span class="log-detail-section-title">${t('Details')}</span>
        <div class="log-detail-grid log-detail-grid--compact">${rows}</div>
    </div>`;
}

function formatIpIntelGrouped(intel) {
    if (!intel) {
        return `<div class="log-detail-section">
            <span class="log-detail-section-title">${t('IP intelligence')}</span>
            <p class="log-detail-value log-detail-muted">${t('No public IP data yet — lookup runs automatically in the background.')}</p>
        </div>`;
    }
    if (intel.status !== 'success') {
        return `<div class="log-detail-section">
            <span class="log-detail-section-title">${t('IP intelligence')}</span>
            <p class="log-detail-value log-detail-muted">${escapeHtml(intel.lookupError || t('Lookup failed'))}</p>
        </div>`;
    }

    const location = [intel.city, intel.regionName, intel.country].filter(Boolean).join(', ');
    const coords = (intel.lat != null && intel.lon != null)
        ? `${intel.lat}, ${intel.lon}`
        : '—';
    const flags = [
        intel.mobile ? t('Mobile') : '',
        intel.proxy ? t('Proxy/VPN') : '',
        intel.hosting ? t('Hosting/DC') : ''
    ].filter(Boolean).join(' · ') || '—';

    const rows = [
        ['Location', location || '—'],
        ['Coordinates', coords],
        ['ISP', intel.isp || '—'],
        ['Organization', intel.org || '—'],
        ['ASN', intel.as ? `${intel.as} (${intel.asname || '—'})` : '—'],
        ['Reverse DNS', intel.reverse || '—'],
        ['Timezone', intel.timezone ? `${intel.timezone} (UTC${intel.offset != null ? intel.offset / 3600 : '?'})` : '—'],
        ['Flags', flags],
        ['Last lookup', intel.lastLookupAt ? new Date(intel.lastLookupAt).toLocaleString() : '—']
    ].map(([label, value]) => `<div class="log-detail-field">
        <span class="log-detail-label">${escapeHtml(t(label))}</span>
        <div class="log-detail-value">${escapeHtml(value)}</div>
    </div>`).join('');

    const mapLink = (intel.lat != null && intel.lon != null)
        ? `<p style="margin:10px 0 0;"><a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(intel.lat)}&amp;mlon=${encodeURIComponent(intel.lon)}#map=12/${encodeURIComponent(intel.lat)}/${encodeURIComponent(intel.lon)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-gold);">${t('View on map')}</a></p>`
        : '';

    return `<div class="log-detail-section">
        <span class="log-detail-section-title">${t('IP intelligence')}</span>
        <div class="log-detail-grid log-detail-grid--compact">${rows}</div>
        ${mapLink}
    </div>`;
}

function buildActivityLogDetailHtml(log) {
    const actor = formatLogActor(log);
    const when = new Date(log.createdAt).toLocaleString();
    const reason = log.details?.reason;
    let actionHtml = escapeHtml(log.action || '—');
    if (reason) {
        actionHtml += ` <span style="color:#8696a0;">(${escapeHtml(reason)})</span>`;
    }

    const metaParts = [actorTypeLabel(log.actorType)];
    if (log.highlight) metaParts.push(t('Highlighted'));

    return `
        <div class="wa-thread-header">
            <h2>${escapeHtml(log.action || '—')}</h2>
            <p>${escapeHtml(actor)} · ${escapeHtml(when)}</p>
        </div>
        <div class="log-detail-card">
            <div class="log-detail-grid">
                <div class="log-detail-field log-detail-field--full">
                    <span class="log-detail-label">${t('Action')}</span>
                    <div class="log-detail-value log-detail-value--action">${actionHtml}</div>
                </div>
                <div class="log-detail-field">
                    <span class="log-detail-label">${t('Actor')}</span>
                    <div class="log-detail-value">${escapeHtml(actor)}</div>
                </div>
                <div class="log-detail-field">
                    <span class="log-detail-label">${t('When')}</span>
                    <div class="log-detail-value">${escapeHtml(when)}</div>
                </div>
                <div class="log-detail-field">
                    <span class="log-detail-label">${t('Type')}</span>
                    <div class="log-detail-value">${escapeHtml(metaParts.filter(Boolean).join(' · '))}</div>
                </div>
                <div class="log-detail-field">
                    <span class="log-detail-label">${t('IP Address')}</span>
                    <div class="log-detail-value log-detail-mono">${escapeHtml(log.ipAddress || 'N/A')}</div>
                </div>
                <div class="log-detail-field log-detail-field--full">
                    <span class="log-detail-label">${t('User Agent')}</span>
                    <div class="log-detail-value log-detail-muted log-detail-wrap">${escapeHtml(log.userAgent || 'N/A')}</div>
                </div>
            </div>
            ${formatIpIntelGrouped(log.ipIntel)}
            ${formatLogDetailsGrouped(log.details)}
        </div>`;
}

function renderActivityLogList() {
    const list = document.getElementById('logsThreadList');
    if (!list) return;

    const logs = getFilteredActivityLogs();
    if (!logs.length) {
        list.innerHTML = `<p class="wa-empty">${t('No logs found.')}</p>`;
        return;
    }

    list.innerHTML = logs.map((log) => {
        const id = String(log._id || '');
        const actor = formatLogActor(log);
        const action = log.action || '';
        const active = id === String(selectedLogId) ? ' is-active' : '';
        const highlight = log.highlight ? ' is-highlighted' : '';
        const highlightBadge = log.highlight
            ? `<span class="log-badge-highlight">${t('Highlighted')}</span>`
            : '';
        const actorBadge = log.actorType
            ? `<span class="log-badge-actor">${escapeHtml(actorTypeLabel(log.actorType))}</span>`
            : '';
        return `<button type="button" class="wa-thread-item${active}${highlight}" data-log-id="${escapeHtml(id)}">
            <div class="wa-thread-top">
                <span class="wa-thread-name">${escapeHtml(actor)}</span>
                <span class="wa-thread-time">${escapeHtml(formatLogShortWhen(log.createdAt))}</span>
            </div>
            <div class="wa-thread-preview">${escapeHtml(action)}</div>
            <div class="wa-thread-preview">
                <span class="log-badge-actor">${log.ipAddress ? escapeHtml(log.ipAddress) : t('No IP')}</span>
                ${log.ipIntel && log.ipIntel.status === 'success'
                    ? `<span class="log-badge-actor">${escapeHtml([log.ipIntel.city, log.ipIntel.regionName, log.ipIntel.country].filter(Boolean).join(', '))}</span>
                       <span class="log-badge-actor">${escapeHtml(log.ipIntel.isp || log.ipIntel.org || '')}</span>`
                    : ''}
            </div>
            ${highlightBadge}${actorBadge}
        </button>`;
    }).join('');

    list.querySelectorAll('.wa-thread-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedLogId = btn.dataset.logId || '';
            renderActivityLogList();
            renderActivityLogDetail();
        });
    });
}

function renderActivityLogDetail() {
    const view = document.getElementById('logsThreadView');
    if (!view) return;

    const log = cachedActivityLogs.find((entry) => String(entry._id) === String(selectedLogId));
    if (!log) {
        view.innerHTML = `<div class="wa-thread-placeholder"><p>${t('Select a log entry to view details.')}</p></div>`;
        return;
    }

    view.innerHTML = buildActivityLogDetailHtml(log);
}

const LOG_ACTOR_TYPE_LABELS = {
    admin: 'Admin',
    admin_ho: 'Admin-ho',
    professional: 'Model',
    guest: 'Guest',
    registration_visitor: 'Registration visitor',
    unknown: 'Unknown'
};

function actorTypeLabel(value) {
    return t(LOG_ACTOR_TYPE_LABELS[value] || value || 'Unknown');
}

function formatLogActionCell(log) {
    let html = escapeHtml(log.action || '');
    const reason = log.details?.reason;
    if (reason) {
        html += ` <span style="color:#aaa;font-size:0.8rem;">(${escapeHtml(reason)})</span>`;
    }
    return html;
}

function formatLogActor(log) {
    if (log.action && log.action.startsWith('registration_')) {
        const email = log.details?.userEmail || log.professional?.email;
        const base = email ? `${t('Registration visitor')} (${email})` : t('Registration visitor');
        return base;
    }

    const homeAdmin = log.adminIpLabel === 'ho' || log.isAdminHomeIp
        || log.details?.adminIpLabel === 'ho';

    if (homeAdmin) {
        const email = log.adminUser?.email || log.details?.adminEmail;
        if (log.action && log.action.startsWith('admin_') && log.action !== 'admin_login') {
            const target = log.professional?.professionalProfile?.alias || log.professional?.email;
            if (target && log.professional?.role !== 'admin') {
                return `${t('Admin-ho')}${email ? ` (${email})` : ''} → ${target}`;
            }
        }
        return email ? `${t('Admin-ho')} (${email})` : t('Admin-ho');
    }

    const adminEmail = log.adminUser?.email || log.details?.adminEmail;
    const adminLabel = adminEmail ? `${t('Admin')} (${adminEmail})` : t('Admin');

    if (log.action && (log.action.startsWith('admin_') || log.action === 'admin_browsing')) {
        const target = log.professional?.professionalProfile?.alias || log.professional?.email;
        if (target && log.professional?.role !== 'admin') {
            return `${adminLabel} → ${target}`;
        }
        return adminLabel;
    }

    if (log.isGuest) {
        return log.isTrustedAdminIp ? adminLabel : t('Guest');
    }

    if (log.professional) {
        if (log.professional.role === 'admin') {
            return adminLabel;
        }
        return log.professional.professionalProfile?.alias || log.professional.email || t('Unknown');
    }

    if (log.isTrustedAdminIp) {
        return adminLabel;
    }

    return t('Unknown');
}

async function loadLogFilterOptions() {
    try {
        const res = await fetch(`${API_URL}/admin/logs/filters`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) return;

        const fillSelect = (el, values, emptyLabel, labelFn = (v) => v) => {
            if (!el) return;
            const current = el.value;
            el.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>`
                + values.map((v) => `<option value="${escapeHtml(String(v))}">${escapeHtml(labelFn(v))}</option>`).join('');
            if (current) el.value = current;
        };

        fillSelect(document.getElementById('logFilterAction'), data.data.actions || [], t('All actions'));
        fillSelect(
            document.getElementById('logFilterActor'),
            data.data.actorTypes || [],
            t('All actors'),
            (v) => actorTypeLabel(v)
        );
        fillSelect(document.getElementById('logFilterIp'), data.data.ips || [], t('All IPs'));
        fillSelect(
            document.getElementById('logFilterAgent'),
            data.data.userAgents || [],
            t('All user agents'),
            (v) => (String(v).length > 72 ? `${String(v).slice(0, 72)}…` : String(v))
        );

        const statsEl = document.getElementById('logFilterStats');
        if (statsEl && data.data.stats) {
            statsEl.textContent = t('Highlighted: {n} · Registration events: {r}')
                .replace('{n}', String(data.data.stats.highlighted || 0))
                .replace('{r}', String(data.data.stats.registrationEvents || 0));
        }
    } catch (err) {
        console.error('Failed to load log filter options', err);
    }
}

function readLogFiltersFromUi() {
    currentLogFilters = { ...currentLogBaseFilters };
    const action = document.getElementById('logFilterAction')?.value;
    const actorType = document.getElementById('logFilterActor')?.value;
    const ip = document.getElementById('logFilterIp')?.value;
    const agent = document.getElementById('logFilterAgent')?.value;
    const highlight = document.getElementById('logFilterHighlight')?.value;
    if (action) currentLogFilters.action = action;
    if (actorType) currentLogFilters.actorType = actorType;
    if (ip) currentLogFilters.ipAddress = ip;
    if (agent) currentLogFilters.userAgent = agent;
    if (highlight) currentLogFilters.highlight = highlight;
}

// Reporte de performance: latencia de la busqueda publica, cobertura de
// indices, herramientas de load testing y que falta para llegar a produccion.
// Los datos vienen de /api/v1/admin/reporte-performance (solo admin).
export async function openReportePerformanceModal() {
    let modal = document.getElementById('reportePerformanceModal');
    if (modal) { modal.remove(); }

    modal = document.createElement('div');
    modal.id = 'reportePerformanceModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border:1px solid var(--primary-gold);border-radius:8px;max-width:1150px;width:100%;max-height:88vh;display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #333;">
                <h3 style="color:var(--primary-gold);margin:0;">⚡ Reporte de performance</h3>
                <button id="closeReportePerformanceBtn" style="background:none;border:none;color:#aaa;font-size:1.5rem;cursor:pointer;">&times;</button>
            </div>
            <div style="padding:10px 20px;border-bottom:1px solid #333;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button id="rpReloadBtn" style="padding:5px 10px;background:var(--primary-gold);color:#111;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;font-weight:600;">Recargar</button>
                <span id="rpGenerated" style="color:#777;font-size:0.75rem;"></span>
                <div style="flex:1;"></div>
                <input type="text" id="rpService" placeholder="service (ej. hogar/linea-blanca/heladera)" style="padding:5px 9px;background:#222;color:white;border:1px solid #444;border-radius:4px;font-size:0.78rem;width:280px;">
                <input type="text" id="rpProfession" placeholder="profesion" style="padding:5px 9px;background:#222;color:white;border:1px solid #444;border-radius:4px;font-size:0.78rem;width:120px;">
                <button id="rpExplainBtn" style="padding:5px 10px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;">explain()</button>
            </div>
            <div id="reportePerformanceContent" style="overflow-y:auto;flex:1;padding:14px 20px;font-size:0.85rem;">
                <div style="color:#888;text-align:center;padding:30px;">Cargando…</div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const cerrar = () => modal.remove();
    document.getElementById('closeReportePerformanceBtn').addEventListener('click', cerrar);
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

    const box = 'padding:8px 11px;background:#16162a;border:1px solid #333;border-radius:5px;margin-bottom:9px;';
    const th = 'padding:6px 8px;text-align:left;color:var(--primary-gold);font-size:0.74rem;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #444;';
    const td = 'padding:6px 8px;border-bottom:1px solid #2a2a3a;font-size:0.8rem;color:#ddd;';

    function tabla(cabeceras, filas) {
        return `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
            <thead><tr>${cabeceras.map(c => `<th style="${th}">${c}</th>`).join('')}</tr></thead>
            <tbody>${filas.map(f => `<tr>${f.map(c => `<td style="${td}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
    }

    function colorLatencia(ms) {
        if (ms >= 1000) return 'color:#e05c5c;font-weight:700;';
        if (ms >= 500) return 'color:#e0a44a;font-weight:600;';
        return 'color:#6fbf73;';
    }

    function render(d) {
        const resumen = (d.resumen || []).map(r =>
            `<div style="${box}"><div style="color:var(--primary-gold);font-size:0.74rem;text-transform:uppercase;letter-spacing:0.5px;">${r.metrica}</div>
             <div style="font-size:1.3rem;font-weight:700;margin:3px 0;">${r.valor}</div>
             <div style="color:#999;font-size:0.78rem;">${r.detalle || ''}</div></div>`).join('');

        const mediciones = (d.mediciones || []).map(m =>
            [m.etapa === 'post-deploy' ? '<span style="color:#6fbf73;">post</span>' : '<span style="color:#777;">pre</span>',
             m.consulta, `<code style="color:#8ab4f8;font-size:0.75rem;">${m.q}</code>`,
             `n=${m.n}`,
             `<span style="${colorLatencia(m.p50)}">${m.p50} ms</span>`,
             `<span style="${colorLatencia(m.p95)}">${m.p95} ms</span>`,
             `<span style="${colorLatencia(m.max)}">${m.max} ms</span>`,
             m.http429 ? `<span style="color:#e0a44a;">${m.http429}/32 429</span>` : '<span style="color:#6fbf73;">ok</span>']
        );

        const deploy = d.deploy || {};
        const pasosDeploy = (deploy.pasos || []).map(p =>
            `<div style="${box}">
                <div style="display:flex;justify-content:space-between;gap:10px;">
                    <strong style="color:#eee;">${p.paso}</strong>
                    <span style="font-size:0.72rem;color:#6fbf73;">● ${p.estado}</span>
                </div>
                <div style="color:#999;font-size:0.79rem;margin-top:4px;">${p.detalle}</div>
            </div>`).join('');

        const explain = (d.explain || []).map(e =>
            [`<span style="color:#6fbf73;font-weight:600;">${e.tipo}</span>`, e.caso,
             e.keys, e.docs, e.n,
             `<code style="color:#8ab4f8;font-size:0.72rem;">${e.indice}</code>`]);

        const metodos = (d.metodos || []).map(m => {
            const badge = m.estado === 'implementado' ? 'color:#6fbf73;' : (m.estado === 'descartado' ? 'color:#777;' : 'color:#e0a44a;');
            return `<div style="${box}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                    <strong style="color:#eee;">${m.nombre}</strong>
                    <span style="font-size:0.72rem;${badge}">● ${m.estado}</span>
                </div>
                <div style="color:#999;font-size:0.78rem;margin-top:4px;">${m.licencia || ''}</div>
                ${m.archivo ? `<div style="color:#8ab4f8;font-size:0.75rem;margin-top:4px;"><code>${m.archivo}</code></div>` : ''}
                ${m.comando ? `<div style="color:#6fbf73;font-size:0.75rem;margin-top:3px;"><code>${m.comando}</code></div>` : ''}
                ${m.cuando ? `<div style="color:#bbb;font-size:0.79rem;margin-top:6px;">${m.cuando}</div>` : ''}
                ${m.cobertura ? `<div style="color:#888;font-size:0.77rem;margin-top:4px;">${m.cobertura}</div>` : ''}
            </div>`;
        }).join('');

        const pendiente = (d.pendiente || []).map(p =>
            `<div style="${box}">
                <div style="display:flex;justify-content:space-between;gap:10px;">
                    <strong style="color:#eee;">${p.area}</strong>
                    <span style="font-size:0.72rem;color:#e0a44a;">● ${p.estado}</span>
                </div>
                <div style="color:#999;font-size:0.79rem;margin-top:4px;">${p.detalle}</div>
            </div>`).join('');

        const pruebas = (d.pruebas || []).map(p =>
            [p.script, `<span style="color:#6fbf73;">${p.resultado}</span>`]);

        const padrones = (d.padrones || {});
        const padrRows = ((padrones.ejemplos || []).map(e =>
            [e.oficio, e.provincia, e.ente || '—', e.ok ? '<span style="color:#6fbf73;">ok</span>' : '<span style="color:#e05c5c;">error</span>']));

        const arbol = d.arbol || {};

        return `
            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:4px 0 8px;">Objetivo</div>
            <div style="color:#ccc;margin-bottom:14px;">${d.objetivo || ''}</div>

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:4px 0 8px;">Resumen</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:9px;margin-bottom:16px;">${resumen}</div>

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:4px 0 8px;">Arbol de servicios (local vs produccion)</div>
            <div style="${box}">
                areas: <strong>${arbol.areas}</strong> (${(arbol.areaIds || []).join(', ')}) · categorias: <strong>${arbol.categorias}</strong> · dispositivos: <strong>${arbol.dispositivos}</strong> · paths: <strong>${arbol.pathsTotales}</strong> <span style="color:#777;">(profundidad 3: ${arbol.pathsProfundidad3})</span>
                <div style="color:#999;font-size:0.78rem;margin-top:5px;">El arbol local y la coleccion de produccion quedaron alineados: 182 servicios, sin huerfanos.</div>
            </div>

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">Latencia por consulta</div>
            ${tabla(['', 'consulta', 'query', 'muestras', 'p50', 'p95', 'max', 'errores'], mediciones)}
            <div style="color:#888;font-size:0.77rem;margin-bottom:16px;">${d.notaMediciones || ''}</div>

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:4px 0 8px;">explain() en produccion</div>
            ${tabla(['plan', 'caso', 'keys', 'docs', 'n', 'indice'], explain)}
            <div style="color:#888;font-size:0.77rem;margin-bottom:16px;">keysExamined igual a docsExamined significa que el indice resuelve sin descartar documentos.</div>

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">Deploy a produccion</div>
            ${deploy.carpeta ? `<div style="${box}"><span style="color:#999;">carpeta de backup: </span><code style="color:#8ab4f8;">${deploy.carpeta}</code></div>` : ''}
            ${pasosDeploy}

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">Herramientas de load testing</div>
            ${metodos}

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">Pendiente</div>
            ${pendiente}

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">Pruebas</div>
            ${tabla(['script', 'resultado'], pruebas)}

            <div style="color:var(--primary-gold);font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">Padrones de matricula</div>
            <div style="color:#999;font-size:0.79rem;margin-bottom:8px;">${padrones.nota || ''}</div>
            ${tabla(['oficio', 'provincia', 'ente emisor', 'estado'], padrRows)}
            <div style="height:16px;"></div>
        `;
    }

    async function cargar() {
        const content = document.getElementById('reportePerformanceContent');
        try {
            const res = await fetch('/api/v1/admin/reporte-performance', { headers: authHeaders(), credentials: 'include' });
            if (res.status === 401 || res.status === 403) {
                content.innerHTML = '<div style="color:#e05c5c;text-align:center;padding:30px;">Solo los administradores pueden ver este reporte.</div>';
                return;
            }
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'error');
            document.getElementById('rpGenerated').textContent = 'generado ' + new Date(json.data.generadoEn).toLocaleString('es-AR');
            content.innerHTML = render(json.data);
        } catch (e) {
            content.innerHTML = `<div style="color:#e05c5c;text-align:center;padding:30px;">No se pudo cargar el reporte: ${e.message}</div>`;
        }
    }

    async function explicar() {
        const content = document.getElementById('reportePerformanceContent');
        const service = document.getElementById('rpService').value.trim();
        const profession = document.getElementById('rpProfession').value.trim();
        content.innerHTML = '<div style="color:#888;text-align:center;padding:30px;">Consultando explain()…</div>';
        try {
            const res = await fetch('/api/v1/admin/reporte-performance/explain', {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ service, profession, matriculado: true })
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'error');
            const d = json.data;
            const badge = d.usaIndice
                ? '<span style="color:#6fbf73;font-weight:700;">IXSCAN — hay indice en uso</span>'
                : '<span style="color:#e05c5c;font-weight:700;">COLLSCAN — escanea toda la coleccion</span>';
            content.innerHTML = `
                <div style="${box}">
                    <div style="color:var(--primary-gold);font-size:0.74rem;text-transform:uppercase;">Resultado</div>
                    <div style="margin:6px 0;">${badge}</div>
                    <div style="color:#bbb;font-size:0.83rem;">${d.interpretacion}</div>
                </div>
                <div style="${box}"><div style="color:var(--primary-gold);font-size:0.74rem;text-transform:uppercase;">Query</div>
                    <pre style="color:#8ab4f8;font-size:0.75rem;overflow-x:auto;margin:6px 0 0;">${JSON.stringify(d.query, null, 2)}</pre></div>
                <div style="${box}"><div style="color:var(--primary-gold);font-size:0.74rem;text-transform:uppercase;">Winning plan</div>
                    <pre style="color:#9ccc65;font-size:0.72rem;overflow-x:auto;max-height:260px;margin:6px 0 0;">${JSON.stringify(d.winningPlan, null, 2)}</pre></div>
                ${d.executionStats ? `<div style="${box}"><div style="color:var(--primary-gold);font-size:0.74rem;text-transform:uppercase;">Execution stats</div>
                    <pre style="color:#ce93d8;font-size:0.72rem;overflow-x:auto;max-height:260px;margin:6px 0 0;">${JSON.stringify(d.executionStats, null, 2)}</pre></div>` : ''}
                <button id="rpBackBtn" style="padding:6px 12px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer;">← Volver al reporte</button>
            `;
            document.getElementById('rpBackBtn').addEventListener('click', cargar);
        } catch (e) {
            content.innerHTML = `<div style="color:#e05c5c;text-align:center;padding:30px;">explain() fallo: ${e.message}</div>`;
        }
    }

    document.getElementById('rpReloadBtn').addEventListener('click', cargar);
    document.getElementById('rpExplainBtn').addEventListener('click', explicar);
    await cargar();
}

export async function openAccessLogsModal() {
    let modal = document.getElementById('accessLogsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'accessLogsModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;';
        modal.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid var(--primary-gold);border-radius:8px;max-width:1100px;width:100%;max-height:85vh;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #333;">
                    <h3 style="color:var(--primary-gold);margin:0;">🔒 Access Logs</h3>
                    <button id="closeAccessLogsBtn" style="background:none;border:none;color:#aaa;font-size:1.5rem;cursor:pointer;">&times;</button>
                </div>
                <div style="padding:12px 20px;border-bottom:1px solid #333;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <input type="text" id="alSearch" placeholder="Search path..." style="padding:6px 10px;background:#222;color:white;border:1px solid #444;border-radius:4px;flex:1;min-width:120px;font-size:0.82rem;">
                    <div style="display:flex;gap:4px;">
                        <button class="al-day-btn" data-days="0" style="padding:5px 10px;background:var(--primary-gold);color:#111;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;font-weight:600;">Hoy</button>
                        <button class="al-day-btn" data-days="1" style="padding:5px 10px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;">1 día</button>
                        <button class="al-day-btn" data-days="7" style="padding:5px 10px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;">7 días</button>
                        <button class="al-day-btn" data-days="30" style="padding:5px 10px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;">30 días</button>
                        <button class="al-day-btn" data-days="90" style="padding:5px 10px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;">90 días</button>
                    </div>
                    <button id="alClearBtn" style="padding:5px 10px;background:none;color:#888;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:0.78rem;">Limpiar</button>
                </div>
                <div id="accessLogsContent" style="overflow-y:auto;flex:1;padding:10px 20px;font-size:0.85rem;"></div>
                <div id="accessLogsPagination" style="padding:12px 20px;border-top:1px solid #333;display:flex;justify-content:center;gap:8px;"></div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('closeAccessLogsBtn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        document.querySelectorAll('.al-day-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.al-day-btn').forEach(b => { b.style.background = '#333'; b.style.color = '#ccc'; });
                btn.style.background = 'var(--primary-gold)';
                btn.style.color = '#111';
                const days = parseInt(btn.dataset.days);
                const now = new Date();
                if (days === 0) {
                    document.getElementById('alFrom').value = now.toISOString().slice(0, 10);
                    document.getElementById('alTo').value = now.toISOString().slice(0, 10);
                } else {
                    const from = new Date(now);
                    from.setDate(from.getDate() - days);
                    document.getElementById('alFrom').value = from.toISOString().slice(0, 10);
                    document.getElementById('alTo').value = now.toISOString().slice(0, 10);
                }
                loadAccessLogs(1);
            });
        });
        document.getElementById('alClearBtn')?.addEventListener('click', () => {
            document.getElementById('alSearch').value = '';
            document.getElementById('alFrom').value = '';
            document.getElementById('alTo').value = '';
            document.querySelectorAll('.al-day-btn').forEach((b, i) => {
                b.style.background = i === 0 ? 'var(--primary-gold)' : '#333';
                b.style.color = i === 0 ? '#111' : '#ccc';
            });
            loadAccessLogs(1);
        });
        document.getElementById('alSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadAccessLogs(1); });
    }
    modal.style.display = 'flex';
    loadAccessLogs(1);
}

async function loadAccessLogs(page = 1) {
    const content = document.getElementById('accessLogsContent');
    const pagination = document.getElementById('accessLogsPagination');
    const search = document.getElementById('alSearch')?.value || '';
    const from = document.getElementById('alFrom')?.value || '';
    const to = document.getElementById('alTo')?.value || '';
    const token = localStorage.getItem('token');
    
    content.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">Loading...</p>';
    
    try {
        const params = new URLSearchParams({ page, limit: 200 });
        if (search) params.set('path', search);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        
        const res = await fetch(`${API_URL}/admin/access-logs?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let data;
        try {
            data = await res.json();
        } catch {
            content.innerHTML = `<p style="color:red;text-align:center;padding:20px;">Server returned non-JSON response (${res.status})</p>`;
            pagination.innerHTML = '';
            return;
        }
        
        if (!data.success || !data.data.length) {
            content.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">No logs found</p>';
            pagination.innerHTML = '';
            return;
        }
        
        content.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                <thead>
                    <tr style="border-bottom:1px solid #444;">
                        <th style="padding:5px 8px;text-align:left;color:var(--primary-gold);font-size:0.75rem;">Timestamp</th>
                        <th style="padding:5px 8px;text-align:left;color:var(--primary-gold);font-size:0.75rem;">Email</th>
                        <th style="padding:5px 8px;text-align:left;color:var(--primary-gold);font-size:0.75rem;">Method</th>
                        <th style="padding:5px 8px;text-align:left;color:var(--primary-gold);font-size:0.75rem;">Path</th>
                        <th style="padding:5px 8px;text-align:left;color:var(--primary-gold);font-size:0.75rem;">Status</th>
                        <th style="padding:5px 8px;text-align:left;color:var(--primary-gold);font-size:0.75rem;">IP</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data.map(log => `
                        <tr style="border-bottom:1px solid #2a2a3e;">
                            <td style="padding:3px 8px;color:#ccc;white-space:nowrap;font-size:0.75rem;">${new Date(log.timestamp).toLocaleString('es-AR')}</td>
                            <td style="padding:3px 8px;color:#aaa;font-size:0.75rem;">${log.email || log.user?.email || '—'}</td>
                            <td style="padding:3px 8px;"><span style="padding:1px 5px;border-radius:3px;font-size:0.7rem;font-weight:bold;${log.method === 'GET' ? 'background:#1a4a1a;color:#4caf50;' : 'background:#4a3a1a;color:#ff9800;'}">${log.method}</span></td>
                            <td style="padding:3px 8px;color:#ccc;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.75rem;" title="${log.path}">${log.path}</td>
                            <td style="padding:3px 8px;"><span style="padding:1px 5px;border-radius:3px;font-size:0.7rem;${log.status < 400 ? 'background:#1a4a1a;color:#4caf50;' : 'background:#4a1a1a;color:#f44336;'}">${log.status}</span></td>
                            <td style="padding:3px 8px;color:#888;font-size:0.75rem;">${log.ip || '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        let pagHtml = '';
        for (let i = 1; i <= data.pages; i++) {
            pagHtml += `<button onclick="window.__loadAccessLogs(${i})" style="padding:4px 10px;background:${i === data.page ? 'var(--primary-gold)' : '#333'};color:${i === data.page ? '#111' : '#ccc'};border:none;border-radius:4px;cursor:pointer;">${i}</button>`;
        }
        pagination.innerHTML = pagHtml;
        window.__loadAccessLogs = loadAccessLogs;
    } catch (err) {
        content.innerHTML = `<p style="color:red;text-align:center;padding:20px;">Error: ${err.message}</p>`;
    }
}

export async function openActivityLogsModal(title = 'Activity Logs', baseFilters = {}) {
    let modal = document.getElementById('logsModal');
    currentLogBaseFilters = baseFilters;
    currentLogFilters = { ...baseFilters };
    selectedLogId = '';

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'logsModal';
        modal.className = 'logs-modal-overlay';

        const closeBar = createAdminModalCloseBar({
            maxWidth: '1400px',
            onClick: () => closeAdminOverlay(modal)
        });

        const panel = document.createElement('div');
        panel.className = 'logs-modal-panel';
        panel.setAttribute('data-modal-panel', '');

        panel.innerHTML = `
            <header class="wa-inbox-header">
                <div class="wa-inbox-header-main">
                    <h2 id="logsModalTitle">${escapeHtml(title)}</h2>
                    <p id="logsModalSubtitle">${t('Activity trail for admins, professionals, guests and registration visitors.')}</p>
                </div>
                <div class="wa-inbox-header-actions">
                    <button type="button" class="wa-btn" id="logsRefreshBtn">${t('Refresh')}</button>
                </div>
            </header>

            <div id="logsModalAlert" class="wa-inbox-alert hidden" role="alert"></div>

            <div class="wa-inbox-meta">
                <p id="logFilterStats">—</p>
            </div>

            <div class="wa-inbox-toolbar">
                <input type="search" id="logSearch" class="wa-inbox-search" placeholder="${t('Search actor, action, IP…')}" autocomplete="off">
                <select id="logFilterActor" class="wa-inbox-select">
                    <option value="">${t('All actors')}</option>
                </select>
                <select id="logFilterAction" class="wa-inbox-select">
                    <option value="">${t('All actions')}</option>
                </select>
                <select id="logFilterIp" class="wa-inbox-select">
                    <option value="">${t('All IPs')}</option>
                </select>
                <select id="logFilterAgent" class="wa-inbox-select">
                    <option value="">${t('All user agents')}</option>
                </select>
                <select id="logFilterHighlight" class="wa-inbox-select">
                    <option value="">${t('All rows')}</option>
                    <option value="true">${t('Highlighted only')}</option>
                    <option value="false">${t('Normal only')}</option>
                </select>
                <div class="logs-toolbar-actions">
                    <button type="button" class="wa-btn" id="applyLogFiltersBtn">${t('Apply Filters')}</button>
                    <button type="button" class="wa-btn" id="clearLogFiltersBtn">${t('Clear')}</button>
                </div>
            </div>

            <div class="wa-inbox-layout logs-inbox-layout">
                <aside class="wa-thread-list" id="logsThreadList" aria-label="${t('Activity logs')}">
                    <p class="wa-empty">${t('Loading...')}</p>
                </aside>
                <main class="wa-thread-view logs-detail-panel" id="logsThreadView" aria-live="polite">
                    <div class="wa-thread-placeholder">
                        <p>${t('Select a log entry to view details.')}</p>
                    </div>
                </main>
            </div>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(panel);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);

        document.getElementById('applyLogFiltersBtn').onclick = () => {
            readLogFiltersFromUi();
            loadActivityLogs();
        };

        document.getElementById('clearLogFiltersBtn').onclick = () => {
            ['logFilterAction', 'logFilterActor', 'logFilterIp', 'logFilterAgent', 'logFilterHighlight', 'logSearch'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            currentLogFilters = { ...currentLogBaseFilters };
            loadActivityLogs();
        };

        document.getElementById('logsRefreshBtn').onclick = () => loadActivityLogs();

        document.getElementById('logSearch')?.addEventListener('input', () => {
            const filtered = getFilteredActivityLogs();
            if (selectedLogId && !filtered.some((log) => String(log._id) === String(selectedLogId))) {
                selectedLogId = filtered[0]?._id ? String(filtered[0]._id) : '';
            }
            renderActivityLogList();
            renderActivityLogDetail();
        });
    } else {
        const titleEl = document.getElementById('logsModalTitle');
        if (titleEl) titleEl.textContent = title;
        ['logFilterAction', 'logFilterActor', 'logFilterIp', 'logFilterAgent', 'logFilterHighlight', 'logSearch'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    openAdminOverlay(modal);
    await loadLogFilterOptions();
    loadActivityLogs();
}

export async function loadActivityLogs() {
    const list = document.getElementById('logsThreadList');
    const alertEl = document.getElementById('logsModalAlert');
    if (list) {
        list.innerHTML = `<p class="wa-empty">${t('Loading...')}</p>`;
    }
    if (alertEl) alertEl.classList.add('hidden');

    try {
        const url = new URL(`${API_URL}/admin/logs`);
        url.searchParams.set('limit', '100');
        Object.keys(currentLogFilters).forEach((key) => {
            if (currentLogFilters[key]) url.searchParams.append(key, currentLogFilters[key]);
        });

const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        let res;
        try {
            res = await fetch(url, {
                headers: authHeaders(),
                credentials: 'include',
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }
        const data = await parseAdminApiResponse(res);

        if (data.success) {
            cachedActivityLogs = data.data || [];
            if (!selectedLogId || !cachedActivityLogs.some((log) => String(log._id) === String(selectedLogId))) {
                selectedLogId = cachedActivityLogs[0]?._id ? String(cachedActivityLogs[0]._id) : '';
            }

            const statsEl = document.getElementById('logFilterStats');
            if (statsEl) {
                const total = data.pagination?.total ?? cachedActivityLogs.length;
                const shown = cachedActivityLogs.length;
                const highlighted = cachedActivityLogs.filter((log) => log.highlight).length;
                statsEl.textContent = `${total} ${t('entries')} · ${shown} ${t('loaded')} · ${highlighted} ${t('highlighted on page')}`;
            }

            renderActivityLogList();
            renderActivityLogDetail();
            applyStaticTranslations(document.getElementById('logsModal'));
        } else {
            cachedActivityLogs = [];
            selectedLogId = '';
            if (list) {
                list.innerHTML = `<p class="wa-empty">${escapeHtml(data.error || t('Could not load logs.'))}</p>`;
            }
            renderActivityLogDetail();
            if (alertEl) {
                alertEl.textContent = data.error || t('Could not load logs.');
                alertEl.classList.remove('hidden');
            }
        }
    } catch (err) {
        cachedActivityLogs = [];
        selectedLogId = '';
        if (list) {
            list.innerHTML = `<p class="wa-empty">${escapeHtml(err.message || t('Network Error'))}</p>`;
        }
        renderActivityLogDetail();
        if (alertEl) {
            alertEl.textContent = err.message || t('Network Error');
            alertEl.classList.remove('hidden');
        }
    }
}

// --- Admin View Scraped Leads Modal ---
export async function openViewLeadsModal() {
    let modal = document.getElementById('leadsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'leadsModal';
        modal.className = 'admin-overlay-modal admin-leads-modal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', overflowY: 'auto', boxSizing: 'border-box'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '1000px',
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        container.className = 'admin-leads-panel admin-modal-panel';
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', margin: '0 auto'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 10px;">${t('Apply Invitations to Potential Professionals')}</h2>
            <p style="color: #aaa; font-size: 0.9rem; margin-bottom: 12px;">${t('Send the welcome WhatsApp invitation with platform and registration links from the potential professionals table.')}</p>
            <p style="color: #bbb; font-size: 0.85rem; margin: 0 0 16px; padding: 10px 12px; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; background: rgba(212, 175, 55, 0.08);">${t('Prefer a small selected batch first, then Apply to all pending if all looks good.')}</p>
            <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; padding: 10px 12px; border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 8px;">
                <span style="color: var(--primary-gold); font-weight: bold;">${t('Channel')}:</span>
                <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: #ddd;">
                    <input type="radio" name="inviteChannel" value="whatsapp" checked style="width:auto;"> ${t('WhatsApp')}
                </label>
                <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: #ddd;">
                    <input type="radio" name="inviteChannel" value="sms" style="width:auto;"> ${t('SMS')}
                </label>
                <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: #ddd;">
                    <input type="radio" name="inviteChannel" value="email" style="width:auto;"> ${t('Email')}
                </label>
            </div>
            <div class="admin-leads-filters" style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;">
                <label for="leadsFilterStatus" style="color: var(--primary-gold); font-weight: bold;">${t('Status')}:</label>
                <select id="leadsFilterStatus" style="padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; min-width: 160px;">
                    <option value="">${t('All Statuses')}</option>
                    <option value="pending">${t('pending')}</option>
                    <option value="contacted">${t('contacted')}</option>
                    <option value="joined">${t('joined')}</option>
                    <option value="rejected">${t('rejected')}</option>
                    <option value="blocked">${t('Blocked')}</option>
                </select>
                <button id="leadsFilterBtn" type="button" style="background: #333; color: white; border: 1px solid #555; padding: 8px 12px; border-radius: 4px; cursor: pointer;">${t('Filter')}</button>
                <input id="leadsSearch" type="search" placeholder="${t('Search name, matricula, email, locality...')}" style="flex: 1 1 240px; min-width: 200px; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;">
                <button id="leadsClearSearchBtn" type="button" style="background: transparent; color: #aaa; border: 1px solid #555; padding: 8px 12px; border-radius: 4px; cursor: pointer;">${t('Clear')}</button>
                <span id="leadsTotalInfo" style="color: #888; font-size: 0.85rem; margin-left: auto;"></span>
            </div>
            <div class="admin-leads-toolbar" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
                <button id="refreshLeadsBtn">${t('Refresh List')}</button>
                <button id="previewInviteBtn" type="button" style="background: transparent; border: 1px solid var(--primary-gold); color: var(--primary-gold);">${t('Preview invite message')}</button>
                <button id="selectPendingLeadsBtn" type="button" style="background: #333; color: white; border: 1px solid #555; padding: 8px 12px; border-radius: 4px; cursor: pointer;">${t('Select pending')}</button>
                <button id="clearLeadSelectionBtn" type="button" style="background: #333; color: white; border: 1px solid #555; padding: 8px 12px; border-radius: 4px; cursor: pointer;">${t('Clear selection')}</button>
                <span id="leadSelectionCount" style="color:#888;font-size:0.8rem;" aria-live="polite"></span>
                <button id="applySelectedInviteBtn" type="button" style="background: #25D366; color: #fff; font-weight: bold; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer;">${t('Apply invitation to selected')}</button>
                <button id="bulkWhatsappBtn" type="button" style="background: transparent; border: 1px solid #25D366; color: #25D366; font-weight: bold; padding: 10px 16px; border-radius: 4px; cursor: pointer;">${t('Apply to all pending')}</button>
            </div>
            <div id="leadBlockedNotice" class="hidden" style="margin-bottom:16px;padding:12px 14px;border:1px solid rgba(220,38,38,.35);border-radius:8px;background:rgba(220,38,38,.08);">
                <div id="leadBlockedNoticeText" style="color:#f1a4a4;font-size:.9rem;line-height:1.5;margin-bottom:10px;"></div>
                <button id="unblockVisibleLeadsBtn" type="button" style="background:#b91c1c;color:#fff;font-weight:bold;border:1px solid #7f1d1d;border-radius:4px;padding:8px 12px;cursor:pointer;"></button>
            </div>
            <div id="bulkWhatsappPanel" class="hidden" style="margin-bottom: 20px; padding: 16px; border: 1px solid rgba(37,211,102,0.4); border-radius: 8px; background: rgba(37,211,102,0.08);">
                <h4 class="gold-text" style="margin: 0 0 10px 0;">${t('Bulk outreach progress')}</h4>
                <p id="bulkWhatsappStatusText" style="color: #ccc; margin: 0 0 12px 0; font-size: 0.9rem;">—</p>
                <div id="bulkWhatsappQrWrap" class="hidden" style="margin-bottom: 12px; text-align: center;">
                    <p style="color: #aaa; font-size: 0.85rem; margin-bottom: 8px;">${t('Scan QR with WhatsApp on your phone')}</p>
                    <img id="bulkWhatsappQrImg" alt="WhatsApp QR" style="max-width: 220px; background: white; padding: 8px; border-radius: 8px;">
                </div>
                <div style="background: #222; border-radius: 4px; height: 10px; overflow: hidden; margin-bottom: 8px;">
                    <div id="bulkWhatsappBar" style="height: 100%; width: 0%; background: #25D366; transition: width 0.3s ease;"></div>
                </div>
                <p id="bulkWhatsappCounts" style="color: #888; font-size: 0.85rem; margin: 0;">0 / 0</p>
            </div>
            <div class="admin-leads-table-wrap">
                <table class="admin-leads-table">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--primary-gold);">
                            <th style="padding: 10px;">${t('Select')}</th>
                            <th class="col-date-added" style="padding: 10px;">${t('Date Added')}</th>
                            <th style="padding: 10px;">${t('Name')}</th>
                            <th style="padding: 10px;">${t('Matricula')}</th>
                            <th style="padding: 10px;">${t('Locality')}</th>
                            <th style="padding: 10px;">${t('Email')}</th>
                            <th style="padding: 10px;">${t('Phone Number')}</th>
                            <th class="col-source" style="padding: 10px;">${t('Source')}</th>
                            <th class="col-status" style="padding: 10px; min-width: 88px;">${t('Status')}</th>
                            <th style="padding: 10px;">${t('Invitation')}</th>
                        </tr>
                    </thead>
                    <tbody id="leadsTableBody">
                        <tr><td colspan="10" style="padding: 10px; text-align: center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="admin-leads-pagination" style="display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
                <button type="button" id="leadsBtnPrev" style="padding: 8px 16px; background: transparent; color: var(--primary-gold); border: 1px solid var(--primary-gold); border-radius: 4px; cursor: pointer;">${t('Previous')}</button>
                <span id="leadsPageInfo" style="color: #ccc; font-size: 0.9rem;">${t('Page {page} of {total}').replace('{page}', '1').replace('{total}', '1')}</span>
                <button type="button" id="leadsBtnNext" style="padding: 8px 16px; background: transparent; color: var(--primary-gold); border: 1px solid var(--primary-gold); border-radius: 4px; cursor: pointer;">${t('Next')}</button>
            </div>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);

        document.getElementById('refreshLeadsBtn').onclick = () => loadLeads(leadsCurrentPage);
        document.getElementById('leadsFilterBtn').onclick = () => loadLeads(1);
        document.getElementById('leadsFilterStatus').addEventListener('change', () => loadLeads(1));

        // Con ~1700 leads del padron, escribir a mano no es una opcion: se
        // busca mientras se tipea, con debounce para no pegarle al endpoint
        // en cada tecla.
        let leadsSearchTimer = null;
        const leadsSearch = document.getElementById('leadsSearch');
        if (leadsSearch) {
            leadsSearch.addEventListener('input', () => {
                clearTimeout(leadsSearchTimer);
                leadsSearchTimer = setTimeout(() => loadLeads(1), 350);
            });
            leadsSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { clearTimeout(leadsSearchTimer); loadLeads(1); }
            });
        }
        const leadsClearSearch = document.getElementById('leadsClearSearchBtn');
        if (leadsClearSearch) {
            leadsClearSearch.onclick = () => {
                if (leadsSearch) leadsSearch.value = '';
                loadLeads(1);
            };
        }
        document.getElementById('leadsBtnPrev').onclick = () => {
            if (leadsCurrentPage > 1) loadLeads(leadsCurrentPage - 1);
        };
        document.getElementById('leadsBtnNext').onclick = () => {
            if (leadsCurrentPage < leadsTotalPages) loadLeads(leadsCurrentPage + 1);
        };
        document.getElementById('previewInviteBtn').onclick = previewInviteMessage;
// Con el padron de gasistas los leads vienen bloqueados (doNotContact),
        // asi que los checkboxes estan deshabilitados y estos botones trabajan
        // sobre cero elementos. Antes no pasaba nada y parecian rotos: ahora
        // avisan por que.
        const selectableCbs = () => [...document.querySelectorAll('.lead-invite-cb:not(:disabled)')];
        document.getElementById('selectPendingLeadsBtn').onclick = () => {
            const cbs = selectableCbs();
            if (!cbs.length) { notifyNoSelectableLeads(); return; }
            cbs.forEach((cb) => { cb.checked = true; });
            updateLeadSelectionCount();
            showAlert(selectionFeedbackEl(), t('Selected {count} pending lead(s).').replace('{count}', String(cbs.length)), false);
        };
        document.getElementById('clearLeadSelectionBtn').onclick = () => {
            const cbs = document.querySelectorAll('.lead-invite-cb');
            const cleared = [...cbs].filter((cb) => cb.checked).length;
            cbs.forEach((cb) => { cb.checked = false; });
            updateLeadSelectionCount();
            if (!cleared) {
                const msg = t('There was no selection to clear.');
                showAlert(selectionFeedbackEl(), msg, true);
            } else {
                showAlert(selectionFeedbackEl(), t('Cleared selection ({count}).').replace('{count}', String(cleared)), false);
            }
        };
        document.getElementById('unblockVisibleLeadsBtn').onclick = unblockVisibleLeads;
        document.getElementById('applySelectedInviteBtn').onclick = applyInvitationToSelected;
        document.getElementById('bulkWhatsappBtn').onclick = startBulkWhatsappOutreach;
        modal.querySelectorAll('input[name="inviteChannel"]').forEach((radio) => {
            radio.addEventListener('change', onInviteChannelChange);
        });
    }

    openAdminOverlay(modal);
    loadLeads(1);
    pollBulkWhatsappStatus();
}

let leadsCurrentPage = 1;
let leadsTotalPages = 1;
// Leads de la pagina renderizada, indexados por _id (ver loadLeads).
const leadsById = new Map();
const LEADS_PAGE_SIZE = 50;

function updateLeadsPagination(pagination) {
    const total = pagination?.total || 0;
    const page = pagination?.page || leadsCurrentPage;
    const limit = pagination?.limit || LEADS_PAGE_SIZE;
    leadsTotalPages = Math.max(1, Math.ceil(total / limit) || 1);
    leadsCurrentPage = page;

    const pageInfo = document.getElementById('leadsPageInfo');
    const totalInfo = document.getElementById('leadsTotalInfo');
    const prevBtn = document.getElementById('leadsBtnPrev');
    const nextBtn = document.getElementById('leadsBtnNext');

    if (pageInfo) {
        pageInfo.textContent = t('Page {page} of {total} ({count} total)')
            .replace('{page}', String(page))
            .replace('{total}', String(leadsTotalPages))
            .replace('{count}', String(total));
    }
    if (totalInfo && total > 0) {
        const from = (page - 1) * limit + 1;
        const to = Math.min(page * limit, total);
        totalInfo.textContent = t('Showing {from}-{to} of {total}')
            .replace('{from}', String(from))
            .replace('{to}', String(to))
            .replace('{total}', String(total));
    } else if (totalInfo) {
        totalInfo.textContent = '';
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= leadsTotalPages;
}

export async function loadLeads(page = leadsCurrentPage) {
    leadsCurrentPage = Math.max(1, page);
    const tbody = document.getElementById('leadsTableBody');
    tbody.innerHTML = `<tr><td colspan="10" style="padding: 10px; text-align: center;">${t('Loading...')}</td></tr>`;
    
    try {
        const statusEl = document.getElementById('leadsFilterStatus');
        const status = statusEl ? statusEl.value : '';
        const searchEl = document.getElementById('leadsSearch');
        const term = searchEl ? searchEl.value.trim() : '';
        let url = `${API_URL}/admin/potential-professionals?page=${leadsCurrentPage}&limit=${LEADS_PAGE_SIZE}`;
        if (status) {
            if (status === 'blocked') url += '&blocked=true';
            else url += `&status=${encodeURIComponent(status)}`;
        }
        if (term) url += `&q=${encodeURIComponent(term)}`;

        const res = await fetch(url, { 
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);

if (data.success) {
              tbody.innerHTML = '';
              updateLeadsPagination(data.pagination);
              // Cache de la pagina actual: el modal de mail lo usa para saber el
              // alias y el oficio del lead antes de pedir la plantilla.
              leadsById.clear();
              data.data.forEach((lead) => leadsById.set(String(lead._id), lead));

            if (data.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="padding: 10px; text-align: center;">${t('No leads found.')}</td></tr>`;
                updateLeadBlockedNotice(data.data);
                return;
            }
            
            data.data.forEach(lead => {
                const dateAdded = lead.createdAt ? new Date(lead.createdAt).toLocaleString() : 'Unknown';
                let sourceHost = lead.sourceUrl;
                try { sourceHost = new URL(lead.sourceUrl).hostname; } catch(e) {}

                const statusColor = lead.status === 'contacted' ? '#15803d' : (lead.status === 'rejected' ? '#dc2626' : '#a16207');
                const smsState = lead.smsStatus || 'pending';
                const smsColor = smsState === 'sent' ? '#15803d' : (smsState === 'failed' ? '#dc2626' : '#a16207');
                const waLink = lead.whatsappLink || '#';
                const blocked = Boolean(lead.doNotContact);
                const waDisabled = !lead.whatsappLink || blocked;
                // El checkbox solo se habilita para leads todavia pendientes y no
                // bloqueados. Un lead ya enviado por correo (emailStatus 'sent') queda
                // deshabilitado —y por tanto desmarcado— tambien, aunque el status
                // principal no se haya actualizado: asi "seleccionar pendiente" nunca
                // vuelve a ofrecer un lead que ya recibio la invitacion.
                const isPending = (lead.status || 'pending') === 'pending'
                    && !blocked
                    && (lead.emailStatus || 'pending') !== 'sent';

                const statusLabel = t(lead.status || 'pending');
                const smsLabel = `${t('SMS')}: ${t(smsState)}`;
                const blockBadge = blocked
                    ? `<span class="admin-status-badge admin-status-badge--blocked" style="background:#6b1d1d;" title="${(lead.doNotContactReason || '').replace(/"/g, '&quot;')}">${t('Do not contact')}</span>`
                    : '';

                const mailState = lead.emailStatus || 'pending';
                const mailColor = mailState === 'sent' ? '#15803d' : (mailState === 'failed' ? '#dc2626' : '#a16207');
                // Un envio ya aceptado por el relay se muestra como "entregado".
                // En la base el valor sigue siendo 'sent': lo unico que el sistema
                // conoce es que el relay acepto el mensaje, no que llego a la
                // bandeja. El rotulo cambia para que el estado se lea igual en la
                // tabla, y el boton queda deshabilitado para no reenviar al mismo
                // lead (evita invitaciones duplicadas).
                const mailDelivered = mailState === 'sent';
                const mailLabel = mailDelivered ? t('Delivered') : t(mailState);
                const mailDisabled = blocked || !lead.email || mailDelivered;
                const mailTip = blocked
                    ? (lead.doNotContactReason || 'Blocked')
                    : (mailDelivered
                        ? t('Already delivered — not re-sent.')
                        : (lead.email ? '' : 'No email'));

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #333';
                tr.innerHTML = `
                    <td style="padding: 10px;">
                        <input type="checkbox" class="lead-invite-cb" value="${lead._id}" ${isPending ? '' : 'disabled'} style="width:auto;">
                    </td>
                    <td class="col-date-added" style="padding: 10px;">${dateAdded}</td>
                    <td style="padding: 10px;">${escapeHtml(lead.name || lead.alias || '—')}</td>
                    <td style="padding: 10px;">${escapeHtml(lead.matricula || '—')}</td>
                    <td style="padding: 10px;">${escapeHtml(lead.locality || '—')}</td>
                    <td style="padding: 10px;">${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}" style="color: var(--primary-gold);">${escapeHtml(lead.email)}</a>` : '—'}</td>
                    <td style="padding: 10px;">${escapeHtml(lead.phone || '—')}</td>
                    <td class="col-source" style="padding: 10px;">${lead.sourceUrl ? `<a href="${escapeHtml(lead.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-gold);">${escapeHtml(sourceHost || '—')}</a>` : escapeHtml(lead.fuente || '—')}</td>
                    <td style="padding: 10px;" class="lead-status-cell">
                        <div class="lead-status-stack">
                            <span class="admin-status-badge admin-status-badge--${lead.status || 'pending'}" style="background: ${statusColor};">${statusLabel}</span>
                            <span class="admin-status-badge admin-status-badge--sms" style="background: ${smsColor};">${smsLabel}</span>
                            <span class="admin-status-badge admin-status-badge--email" style="background: ${mailColor};" title="${escapeHtml(mailTip)}">${t('Email')}: ${mailLabel}</span>
                            ${blockBadge}
                        </div>
                    </td>
                    <td style="padding: 10px;">
                        <a href="${waLink}" target="_blank" rel="noopener noreferrer" data-lead-id="${lead._id}" data-lead-phone="${lead.phone || ''}" class="lead-whatsapp-btn"${waDisabled ? ' aria-disabled="true" style="opacity:0.4;pointer-events:none;"' : ''}>${t('Send invite')}</a>
                        <button type="button" class="lead-email-btn" data-lead-id="${lead._id}"${mailDisabled ? ' disabled title="' + escapeHtml(mailTip) + '" style="margin-left:6px;font-size:0.85em;opacity:0.4;cursor:not-allowed;"' : ' style="margin-left:6px;font-size:0.85em;"'}>${t('Send email')}</button>
                        ${blocked ? `<button type="button" class="lead-unblock-btn" data-lead-id="${lead._id}" style="margin-left:6px;font-size:0.85em;">${t('Unblock')}</button>` : `<button type="button" class="lead-block-btn" data-lead-phone="${lead.phone || ''}" style="margin-left:6px;font-size:0.85em;">${t('Block')}</button>`}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.lead-whatsapp-btn').forEach((btn) => {
                btn.addEventListener('click', () => markLeadContacted(btn.getAttribute('data-lead-id')));
            });
            document.querySelectorAll('.lead-block-btn').forEach((btn) => {
                btn.addEventListener('click', () => blockLeadPhone(btn.getAttribute('data-lead-phone')));
            });
            document.querySelectorAll('.lead-unblock-btn').forEach((btn) => {
                btn.addEventListener('click', () => unblockLead(btn.getAttribute('data-lead-id')));
            });
            document.querySelectorAll('.lead-email-btn').forEach((btn) => {
                btn.addEventListener('click', () => sendLeadInviteEmail(btn.getAttribute('data-lead-id')));
            });

            // El contador tiene que reflejar cambios hechos a mano en los
            // checkbox, no solo los botones de seleccionar todo / limpiar.
            tbody.querySelectorAll('.lead-invite-cb').forEach((cb) => {
                cb.addEventListener('change', updateLeadSelectionCount);
            });

            updateLeadSelectionCount();
            updateLeadBlockedNotice(data.data);
        }
    } catch (err) {
        const timedOut = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')));
        tbody.innerHTML = `<tr><td colspan="10" style="padding: 10px; text-align: center; color: var(--accent-red);">${t(timedOut ? 'Timed out loading leads.' : 'Failed to load leads.')}</td></tr>`;
    }
}

async function applyInvitationToSelectedLeads() {
    const leadIds = Array.from(document.querySelectorAll('.lead-invite-cb:checked')).map((cb) => cb.value);
    if (!leadIds.length) {
        announceMessage(t('Select at least one pending lead'));
        return;
    }

    if (!(await confirmDialog(t('Apply the platform invitation to {count} selected potential professional(s)?').replace('{count}', leadIds.length)))) {
        return;
    }

    const btn = document.getElementById('applySelectedInviteBtn');
    if (btn) btn.disabled = true;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(outreachEndpoints().targeted, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ leadIds, professionalIds: [], message: '' })
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not start invitation outreach'));
            if (btn) btn.disabled = false;
            return;
        }

        document.getElementById('bulkWhatsappPanel').classList.remove('hidden');
        if (bulkWhatsappPollTimer) clearInterval(bulkWhatsappPollTimer);
        bulkWhatsappPollTimer = setInterval(pollBulkWhatsappStatus, 2500);
        pollBulkWhatsappStatus();
    } catch {
        announceMessage(t('Could not start invitation outreach'));
        if (btn) btn.disabled = false;
    }
}

async function markLeadContacted(id) {
    if (!id) return;
    try {
        const token = localStorage.getItem('token');
        await fetch(`${API_URL}/admin/potential-professionals/${id}`, {
            method: 'PUT',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ status: 'contacted' })
        });
    } catch (err) {
        console.error('Failed to mark lead as contacted', err);
    }
}

// Quita el bloqueo doNotContact de UN lead. El padron se importa con todos
// bloqueados (sin consentimiento), asi que sin esto no hay forma de volver a
// habilitar un lead desde la UI: habia endpoint PUT pero ningun boton.
async function unblockLead(leadId) {
    if (!leadId) return;
    try {
        const res = await fetch(`${API_URL}/admin/potential-professionals/${encodeURIComponent(leadId)}`, {
            method: 'PUT',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            credentials: 'include',
            // Volver a 'pending': al desbloquear queda 'rejected' y el lead
            // seguiria fuera de los filtros de outreach.
            body: JSON.stringify({ doNotContact: false, status: 'pending' })
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not unblock lead'));
            return;
        }
        announceMessage(t('Lead unblocked.'));
        loadLeads(leadsCurrentPage);
    } catch (err) {
        console.error('Failed to unblock lead', err);
        announceMessage(t('Could not unblock lead'));
    }
}

// Cuenta y muestra el aviso cuando la pagina actual tiene leads bloqueados
// (el padron se importa entero con doNotContact). Sin esto la tabla aparece
// pero nada es seleccionable y parece rota.
function updateLeadBlockedNotice(leads) {
    const notice = document.getElementById('leadBlockedNotice');
    if (!notice) return;
    const list = Array.isArray(leads) ? leads : [];
    const blocked = list.filter((l) => Boolean(l.doNotContact));
    if (!blocked.length) {
        notice.classList.add('hidden');
        return;
    }
    const btn = document.getElementById('unblockVisibleLeadsBtn');
    if (btn) btn.textContent = t('Unblock {count} visible').replace('{count}', String(blocked.length));
    const textEl = document.getElementById('leadBlockedNoticeText');
    if (textEl) {
        textEl.textContent = t('{count} of {total} leads on this page are blocked. They were imported without contact consent, so nothing is selectable. Unblock them to invite them, or unblock row by row.')
            .replace('{count}', String(blocked.length))
            .replace('{total}', String(list.length));
    }
    notice.classList.remove('hidden');
}

// Desbloqueo en lote de los leads bloqueados visibles en la pagina actual.
// Quita doNotContact y los devuelve a 'pending' (misma logica que unblockLead
// por fila) sin enviar nada: la salvaguarda de consentimiento queda intacta.
async function unblockVisibleLeads() {
    const blocked = [...leadsById.values()].filter((l) => Boolean(l.doNotContact));
    if (!blocked.length) return;
    if (!(await confirmDialog(t('Unblock {count} visible lead(s)? They become pending again and can be selected.').replace('{count}', String(blocked.length))))) return;
    const btn = document.getElementById('unblockVisibleLeadsBtn');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/admin/potential-professionals/unblock-batch`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ids: blocked.map((l) => l._id) })
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not unblock leads'));
            return;
        }
        announceMessage(t('Unblocked {count} lead(s).').replace('{count}', String(data.data?.modified ?? blocked.length)));
        loadLeads(leadsCurrentPage);
    } catch {
        announceMessage(t('Could not unblock leads'));
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function blockLeadPhone(phone) {
    if (!phone) return;
    const reason = prompt(t('Reason for blocking outreach (optional):'), t('Requested stop'));
    if (reason === null) return;

    try {
        const res = await fetch(`${API_URL}/admin/potential-professionals/block-phone`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ phone, reason: reason || 'Blocked in admin' })
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not block phone'));
            return;
        }
        const n = data.data?.modified ?? data.data?.matched ?? 0;
        announceMessage(t('Blocked outreach for {count} lead(s).').replace('{count}', String(n)));
        loadLeads(leadsCurrentPage);
    } catch (err) {
        console.error('Failed to block lead phone', err);
        announceMessage(t('Could not block phone'));
    }
}

function resolvePreviewInviteAlias() {
    const checked = document.querySelector('.lead-invite-cb:checked');
    const pickRow = checked || document.querySelector('.lead-invite-cb:not(:disabled)');
    if (!pickRow) return 'María';
    const aliasCell = pickRow.closest('tr')?.querySelector('td:nth-child(3)');
    const alias = aliasCell?.textContent?.trim();
    return alias && alias !== '—' ? alias : 'María';
}

function openInvitePreviewModal(payload) {
    let modal = document.getElementById('invitePreviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'invitePreviewModal';
        modal.className = 'payment-modal-overlay';
        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.88)',
            zIndex: '100002',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        });
        document.body.appendChild(modal);
    }

    const alias = escapeHtml(payload.alias || 'María');
    const message = escapeHtml(payload.message || '');
    const registerUrl = payload.registerUrl ? escapeHtml(payload.registerUrl) : '';
    const brandImageUrl = payload.brandImageUrl ? escapeHtml(payload.brandImageUrl) : '';
    const metaParts = [
        `${t('Sample alias')}: <strong style="color:var(--primary-gold);">${alias}</strong>`,
        t('Cold WhatsApp step 1 — same text as automatic drip / Twilio template watext')
    ];
    if (brandImageUrl) {
        metaParts.push(`${t('Logo image')}: <code style="color:#9cf;font-size:0.8rem;word-break:break-all;">${brandImageUrl}</code>`);
    }

    modal.innerHTML = `
        <div class="card payment-modal-panel" data-modal-panel style="max-width:640px;width:100%;max-height:90vh;overflow:auto;background:var(--dark-bg,#1a1a1a);padding:20px;border-radius:8px;color:#fff;">
            <h3 class="gold-text" style="margin:0 0 8px 0;">${t('Invite message preview')}</h3>
            <p style="color:#888;font-size:0.85rem;margin:0 0 12px;line-height:1.5;">${metaParts.join('<br>')}</p>
            <pre id="invitePreviewBody" style="white-space:pre-wrap;word-break:break-word;background:#111;border:1px solid #333;border-radius:6px;padding:14px;color:#eee;font-size:0.9rem;line-height:1.55;margin:0 0 16px;max-height:50vh;overflow:auto;">${message}</pre>
            ${registerUrl ? `<p style="color:#666;font-size:0.8rem;margin:0 0 16px;word-break:break-all;">${t('Register link')}: ${registerUrl}</p>` : ''}
            <button type="button" id="invitePreviewCloseBtn" style="padding:10px 18px;background:var(--primary-gold);color:var(--dark-bg);border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Close')}</button>
        </div>`;

    const close = () => {
        deactivateAccessibleModal(modal);
        modal.style.display = 'none';
    };

    modal.onclick = (event) => {
        if (event.target === modal) close();
    };
    document.getElementById('invitePreviewCloseBtn').onclick = close;

    modal.style.display = 'flex';
    const titleEl = modal.querySelector('h3');
    if (titleEl && !titleEl.id) titleEl.id = 'invitePreviewModalTitle';
    activateAccessibleModal(modal, {
        labelId: titleEl?.id,
        onClose: close,
        initialFocusSelector: '#invitePreviewCloseBtn'
    });
}

async function previewInviteMessage() {
    const btn = document.getElementById('previewInviteBtn');
    const alias = resolvePreviewInviteAlias();
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/admin/outreach/invite-message?alias=${encodeURIComponent(alias)}`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not load invite message preview.'));
            return;
        }
        openInvitePreviewModal(data.data);
    } catch (err) {
        announceMessage(adminConnectionErrorMessage(err));
    } finally {
        if (btn) btn.disabled = false;
    }
}

let bulkWhatsappPollTimer = null;

// Selected outreach channel for the invitations panel. Defaults to WhatsApp so
// the existing behavior is preserved unless the admin explicitly picks SMS.
let inviteChannel = 'whatsapp';

// Per-channel endpoint map so the shared list / buttons / polling can drive
// either the WhatsApp or the SMS outreach engine without duplicating logic.
function outreachEndpoints() {
    return inviteChannel === 'sms'
        ? {
            bulk: `${API_URL}/admin/outreach/bulk-sms`,
            targeted: `${API_URL}/admin/outreach/sms/targeted`,
            status: `${API_URL}/admin/outreach/bulk-sms/status`
        }
        : {
            bulk: `${API_URL}/admin/outreach/bulk-whatsapp`,
            targeted: `${API_URL}/admin/outreach/whatsapp/targeted`,
            status: `${API_URL}/admin/outreach/bulk-whatsapp/status`
        };
}

function onInviteChannelChange(e) {
    const picked = e.target.value;
    inviteChannel = (picked === 'sms' || picked === 'email') ? picked : 'whatsapp';
    if (bulkWhatsappPollTimer) {
        clearInterval(bulkWhatsappPollTimer);
        bulkWhatsappPollTimer = null;
    }
    const panel = document.getElementById('bulkWhatsappPanel');
    const qrWrap = document.getElementById('bulkWhatsappQrWrap');
    if (qrWrap) qrWrap.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
    const bulkBtn = document.getElementById('bulkWhatsappBtn');
    const selectedBtn = document.getElementById('applySelectedInviteBtn');
    if (selectedBtn) selectedBtn.disabled = false;
    // Email no tiene envio masivo: el backend solo admite ids tildados (max 100
    // por tanda) para no disparar un envio sin consentimiento a todo el padron.
    // El boton "a todas las pendientes" queda deshabilitado cuando el canal es
    // Correo; el verde "Aplicar a seleccionadas" abre el modal de correo.
    if (bulkBtn) {
        const isEmail = inviteChannel === 'email';
        bulkBtn.disabled = isEmail;
        bulkBtn.title = isEmail ? t('Bulk email is not available. Select recipients and use Apply invitation to selected.') : '';
        bulkBtn.style.opacity = isEmail ? '0.5' : '';
        bulkBtn.style.cursor = isEmail ? 'not-allowed' : 'pointer';
    }
    if (inviteChannel !== 'email') pollBulkWhatsappStatus();
}

// Un solo boton verde "Aplicar invitacion a seleccionadas" que respeta el canal
// elegido: WhatsApp/SMS disparan el outreach del servidor; Email abre el modal
// de correo con su plantilla propia para los prospectos tildados.
async function applyInvitationToSelected() {
    if (inviteChannel === 'email') {
        const ids = selectedLeadIds();
        if (!ids.length) {
            notifyNoSelectableLeads();
            return;
        }
        await sendLeadInviteEmail(null);
        return;
    }
    return applyInvitationToSelectedLeads();
}

function renderBulkWhatsappStatus(status) {
    const panel = document.getElementById('bulkWhatsappPanel');
    const textEl = document.getElementById('bulkWhatsappStatusText');
    const barEl = document.getElementById('bulkWhatsappBar');
    const countsEl = document.getElementById('bulkWhatsappCounts');
    const qrWrap = document.getElementById('bulkWhatsappQrWrap');
    const qrImg = document.getElementById('bulkWhatsappQrImg');
    if (!panel || !status) return;

    panel.classList.remove('hidden');

    const processed = (status.sent || 0) + (status.failed || 0) + (status.skipped || 0);
    const total = status.total || 0;
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    if (barEl) barEl.style.width = `${pct}%`;
    if (countsEl) countsEl.textContent = `${processed} / ${total} — ${t('Sent')}: ${status.sent || 0}, ${t('Failed')}: ${status.failed || 0}, ${t('Skipped')}: ${status.skipped || 0}`;

    if (status.phase === 'qr' && status.qr && qrWrap && qrImg) {
        qrWrap.classList.remove('hidden');
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(status.qr)}`;
        if (textEl) textEl.textContent = t('Waiting for WhatsApp login — scan the QR code.');
    } else if (qrWrap) {
        qrWrap.classList.add('hidden');
    }

    const phaseText = {
        idle: t('Ready'),
        initializing: t('Connecting to WhatsApp...'),
        qr: t('Waiting for WhatsApp login — scan the QR code.'),
        sending: `${t('Sending messages...')} ${status.currentLead ? `(${status.currentLead})` : ''}`,
        waiting_window: t('Paused — waiting for the sending window.'),
        complete: t('Bulk outreach complete.'),
        error: status.lastError || t('Bulk outreach failed.')
    };

    if (textEl && status.phase !== 'qr') {
        textEl.textContent = phaseText[status.phase] || status.phase;
    }

    if (status.phase === 'complete' || status.phase === 'error') {
        if (bulkWhatsappPollTimer) {
            clearInterval(bulkWhatsappPollTimer);
            bulkWhatsappPollTimer = null;
        }
        const bulkBtn = document.getElementById('bulkWhatsappBtn');
        const selectedBtn = document.getElementById('applySelectedInviteBtn');
        if (bulkBtn) bulkBtn.disabled = false;
        if (selectedBtn) selectedBtn.disabled = false;
        loadLeads(leadsCurrentPage);
    } else if (status.phase === 'sending' || status.phase === 'qr' || status.phase === 'initializing' || status.phase === 'waiting_window') {
        const bulkBtn = document.getElementById('bulkWhatsappBtn');
        const selectedBtn = document.getElementById('applySelectedInviteBtn');
        if (bulkBtn) bulkBtn.disabled = true;
        if (selectedBtn) selectedBtn.disabled = true;
        if (!bulkWhatsappPollTimer) {
            bulkWhatsappPollTimer = setInterval(pollBulkWhatsappStatus, 2500);
        }
    }
}

async function pollBulkWhatsappStatus() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(outreachEndpoints().status, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) renderBulkWhatsappStatus(data.data);
    } catch (err) {
        console.error('Bulk outreach status poll failed', err);
    }
}

async function startBulkWhatsappOutreach() {
    if (inviteChannel === 'email') {
        announceMessage(t('Bulk email is not available. Select recipients and use Apply invitation to selected.'));
        return;
    }
    if (!(await confirmDialog(t('Apply the platform invitation to ALL pending potential professionals? This cannot be undone easily.')))) return;

    const btn = document.getElementById('bulkWhatsappBtn');
    if (btn) btn.disabled = true;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(outreachEndpoints().bulk, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not start bulk outreach'));
            if (btn) btn.disabled = false;
            return;
        }

        renderBulkWhatsappStatus(data.data);

        if (bulkWhatsappPollTimer) clearInterval(bulkWhatsappPollTimer);
        bulkWhatsappPollTimer = setInterval(pollBulkWhatsappStatus, 2500);
        pollBulkWhatsappStatus();
    } catch (err) {
        announceMessage(t('Could not start bulk outreach'));
        if (btn) btn.disabled = false;
    }
}

// --- Admin View Payment Verifications Modal ---
export async function openPaymentVerificationsModal() {
    let modal = document.getElementById('paymentVerificationsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'paymentVerificationsModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '1000px',
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '1000px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 20px;">Pagos Pendientes</h2>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--primary-gold);">
                            <th style="padding: 10px;">Nombre</th>
                            <th style="padding: 10px;">Apellido</th>
                            <th style="padding: 10px;">Alias</th>
                            <th style="padding: 10px;">Tipo</th>
                            <th style="padding: 10px;">Monto</th>
                            <th style="padding: 10px;">Comprobante</th>
                            <th style="padding: 10px;">Acción</th>
                        </tr>
                    </thead>
                    <tbody id="paymentsTableBody">
                        <tr><td colspan="7" style="padding: 10px; text-align: center;">Cargando...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);
    }

    openAdminOverlay(modal);
    loadPaymentVerifications();
}

export async function loadPaymentVerifications() {
    const tbody = document.getElementById('paymentsTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 10px; text-align: center;">Cargando...</td></tr>';
    
    try {
        const res = await fetch(`${API_URL}/admin/payments/pending`, { 
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);

        if (data.success) {
            tbody.innerHTML = '';
            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="padding: 10px; text-align: center; color: #888;">No hay pagos pendientes.</td></tr>';
                return;
            }
            
            data.data.forEach(item => {
                const typeLabel = item.type === 'aviso' ? '📋 Aviso' : '👤 Suscripción';
                const typeColor = item.type === 'aviso' ? '#a855f7' : '#3b82f6';
                const priceText = item.price ? `$${item.price.toLocaleString('es-AR')}` : '-';
                const receiptIsPdf = item.receiptType === 'pdf' || item.receiptUrl?.endsWith('.pdf');

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #333';
                tr.innerHTML = `
                    <td style="padding: 10px;">${item.firstName || ''}</td>
                    <td style="padding: 10px;">${item.lastName || ''}</td>
                    <td style="padding: 10px; color: var(--primary-gold); font-weight: 600;">${item.alias || '-'}</td>
                    <td style="padding: 10px;"><span style="font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; background: ${typeColor}22; color: ${typeColor}; font-weight: 600;">${typeLabel}</span></td>
                    <td style="padding: 10px; font-weight: 600;">${priceText}</td>
                    <td style="padding: 10px; text-align: center;">
                        ${item.receiptUrl ? `<a href="${item.receiptUrl}" target="_blank" style="color: var(--primary-gold); text-decoration: none; font-size: 1.2rem;" title="Ver comprobante">${receiptIsPdf ? '📄' : '🖼️'}</a>` : '<span style="color: #666;">-</span>'}
                    </td>
                    <td style="padding: 10px; text-align: center;">
                        <button class="ack-payment-btn" data-id="${item._id}" data-type="${item.type}" style="padding: 5px 12px; background: #15803d; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">✓ Aprobar</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.ack-payment-btn').forEach(btn => {
                btn.onclick = (e) => {
                    approvePayment(btn.getAttribute('data-id'), btn.getAttribute('data-type'));
                };
            });

        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="padding: 10px; color: var(--accent-red);">Error: ${data.error}</td></tr>`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 10px; color: var(--accent-red);">${err.message || 'Error de red'}</td></tr>`;
    }
}

export async function approvePayment(id, type) {
    try {
        let url, method;
        if (type === 'aviso') {
            url = `${API_URL}/admin/avisos/${id}/approve`;
            method = 'POST';
        } else {
            url = `${API_URL}/admin/payments/${id}/acknowledge`;
            method = 'PUT';
        }
        const res = await fetch(url, {
            method,
            headers: { 
                'Content-Type': 'application/json',
                ...authHeaders()
            },
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) {
            loadPaymentVerifications(); 
        } else {
            announceMessage(data.error || 'Error al aprobar pago');
        }
    } catch (err) {
        announceMessage(err.message || 'Error de red');
    }
}

// --- Admin Interest Notes (Notas de Interés) ---
export async function openInterestNotesAdminModal() {
    let modal = document.getElementById('interestNotesAdminModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'interestNotesAdminModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '900px',
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '900px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;">
                <h2 class="gold-text" style="margin:0;">${t('Notes of Interest')}</h2>
                <button type="button" id="interestNotesAddBtn" class="admin-nav-btn" style="width:auto;">+ ${t('Add article')}</button>
            </div>
            <div id="interestNotesAdminList" style="display:flex;flex-direction:column;gap:14px;">
                <div style="text-align:center;padding:10px;">${t('Loading...')}</div>
            </div>
            <div id="interestNotesEditor" class="hidden" style="margin-top:24px;border-top:1px solid rgba(212,175,55,0.25);padding-top:20px;">
                <h3 class="gold-text" id="interestNotesEditorTitle" style="margin-top:0;">${t('Edit article')}</h3>
                <input type="hidden" id="interestNotesEditId" value="">
                <label style="display:block;margin-bottom:6px;">${t('Title')}</label>
                <input type="text" id="interestNotesEditTitle" maxlength="200" style="width:100%;margin-bottom:16px;padding:10px;">
                <label style="display:block;margin-bottom:6px;">${t('Body')}</label>
                <textarea id="interestNotesEditBody" rows="14" style="width:100%;margin-bottom:10px;padding:10px;"></textarea>
                <p style="margin:0 0 16px;font-size:0.85rem;color:#aaa;line-height:1.45;">${t('Write in Spanish or English. The other language is generated automatically when you save.')}</p>
                <div style="display:flex;flex-wrap:wrap;gap:10px;">
                    <button type="button" id="interestNotesSaveBtn" class="admin-nav-btn" style="width:auto;">${t('Save')}</button>
                    <button type="button" id="interestNotesCancelEditBtn" class="admin-nav-btn" style="width:auto;">${t('Cancel')}</button>
                    <button type="button" id="interestNotesDeleteBtn" class="admin-nav-btn hidden" style="width:auto;color:var(--accent-red);">${t('Delete')}</button>
                </div>
            </div>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);

        document.getElementById('interestNotesAddBtn').addEventListener('click', () => openInterestNoteEditor());
        document.getElementById('interestNotesSaveBtn').addEventListener('click', saveInterestNoteFromEditor);
        document.getElementById('interestNotesCancelEditBtn').addEventListener('click', closeInterestNoteEditor);
        document.getElementById('interestNotesDeleteBtn').addEventListener('click', deleteInterestNoteFromEditor);
    }

    openAdminOverlay(modal);
    loadInterestNotesAdminList();
}

function openInterestNoteEditor(note = null) {
    const editor = document.getElementById('interestNotesEditor');
    const titleEl = document.getElementById('interestNotesEditorTitle');
    const idEl = document.getElementById('interestNotesEditId');
    const titleInput = document.getElementById('interestNotesEditTitle');
    const bodyInput = document.getElementById('interestNotesEditBody');
    const deleteBtn = document.getElementById('interestNotesDeleteBtn');
    if (!editor || !titleInput || !bodyInput) return;

    idEl.value = note?._id || '';
    titleInput.value = note?.title || '';
    bodyInput.value = note?.body || '';
    titleEl.textContent = note ? t('Edit article') : t('Add article');
    deleteBtn.classList.toggle('hidden', !note?._id);
    editor.classList.remove('hidden');
    titleInput.focus();
}

function closeInterestNoteEditor() {
    const editor = document.getElementById('interestNotesEditor');
    if (editor) editor.classList.add('hidden');
}

async function loadInterestNotesAdminList() {
    const list = document.getElementById('interestNotesAdminList');
    if (!list) return;
    list.innerHTML = `<div style="text-align:center;padding:10px;">${t('Loading...')}</div>`;

    try {
        const res = await fetch(`${API_URL}/interest-notes?lang=${encodeURIComponent(currentLang || 'es')}`, {
            headers: {
                ...authHeaders(),
                'X-Platform-Lang': currentLang || 'es'
            },
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            list.innerHTML = `<div style="padding:10px;color:var(--accent-red);">Error: ${data.error}</div>`;
            return;
        }

        const notes = data.data || [];
        if (!notes.length) {
            list.innerHTML = `<div style="padding:10px;text-align:center;">${t('No articles yet.')}</div>`;
            return;
        }

        list.innerHTML = '';
        for (const note of notes) {
            const full = await fetchInterestNoteForAdmin(note._id);
            const card = document.createElement('div');
            Object.assign(card.style, {
                border: '1px solid rgba(212,175,55,0.35)',
                borderRadius: '8px',
                padding: '14px',
                background: 'rgba(212,175,55,0.05)'
            });
            card.innerHTML = `
                <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-bottom:8px;">
                    <strong style="color:var(--primary-gold);">${escapeAdminHtml(note.title)}</strong>
                    <span style="font-size:0.8rem;color:#aaa;">${note.sourceLocale ? note.sourceLocale.toUpperCase() + ' · ' : ''}${note.updatedAt ? new Date(note.updatedAt).toLocaleString() : ''}</span>
                </div>
                <p style="margin:0 0 12px;color:#ccc;font-size:0.9rem;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;">${escapeAdminHtml(note.preview || '')}</p>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    <button type="button" class="admin-nav-btn interest-note-edit-btn" data-id="${note._id}" style="width:auto;">${t('Edit')}</button>
                    <a class="admin-nav-btn" href="${appPath(`nota-interes.html?id=${encodeURIComponent(note._id)}`)}" target="_blank" rel="noopener" style="display:inline-block;width:auto;text-decoration:none;text-align:center;">${t('View')}</a>
                </div>
            `;
            card.querySelector('.interest-note-edit-btn').addEventListener('click', () => {
                openInterestNoteEditor(full || note);
            });
            list.appendChild(card);
        }
    } catch (err) {
        list.innerHTML = `<div style="padding:10px;color:var(--accent-red);">${err.message || t('Network Error')}</div>`;
    }
}

async function fetchInterestNoteForAdmin(id) {
    const res = await fetch(`${API_URL}/interest-notes/${encodeURIComponent(id)}?edit=1`, {
        headers: authHeaders(),
        credentials: 'include'
    });
    const data = await parseAdminApiResponse(res);
    return data.success ? data.data : null;
}

function escapeAdminHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function saveInterestNoteFromEditor() {
    const id = document.getElementById('interestNotesEditId')?.value;
    const title = document.getElementById('interestNotesEditTitle')?.value?.trim();
    const body = document.getElementById('interestNotesEditBody')?.value?.trim();
    if (!title || !body) {
        announceMessage(t('Title and body are required.'));
        return;
    }

    const saveBtn = document.getElementById('interestNotesSaveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = t('Translating and saving...');
    }

    try {
        const url = id
            ? `${API_URL}/admin/interest-notes/${encodeURIComponent(id)}`
            : `${API_URL}/admin/interest-notes`;
        const res = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ title, body })
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not save article.'));
            return;
        }
        closeInterestNoteEditor();
        await loadInterestNotesAdminList();
        announceMessage(data.message || t('Article saved.'));
    } catch {
        announceMessage(t('Could not save article.'));
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = t('Save');
        }
    }
}

async function deleteInterestNoteFromEditor() {
    const id = document.getElementById('interestNotesEditId')?.value;
    if (!id) return;
    if (!(await confirmDialog(t('Delete this article?')))) return;

    try {
        const res = await fetch(`${API_URL}/admin/interest-notes/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            announceMessage(data.error || t('Could not delete article.'));
            return;
        }
        closeInterestNoteEditor();
        await loadInterestNotesAdminList();
        announceMessage(t('Article deleted.'));
    } catch {
        announceMessage(t('Could not delete article.'));
    }
}

// --- Admin Support Messages Inbox ---
export async function openSupportMessagesModal() {
    let modal = document.getElementById('supportMessagesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'supportMessagesModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '1000px',
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '1000px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 20px;">${t('Support messages')}</h2>
            <div id="supportMessagesList" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="text-align: center; padding: 10px;">${t('Loading...')}</div>
            </div>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);
    }

    openAdminOverlay(modal);
    loadSupportMessages();
}

export async function loadSupportMessages() {
    const list = document.getElementById('supportMessagesList');
    if (!list) return;
    list.innerHTML = `<div style="text-align: center; padding: 10px;">${t('Loading...')}</div>`;

    try {
        const res = await fetch(`${API_URL}/admin/support`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);

        if (!data.success) {
            list.innerHTML = `<div style="padding: 10px; color: var(--accent-red);">Error: ${data.error}</div>`;
            return;
        }

        const messages = data.data || [];
        if (messages.length === 0) {
            list.innerHTML = `<div style="padding: 10px; text-align: center;">${t('No support messages.')}</div>`;
            updateSupportBadge(data.openCount || 0);
            return;
        }

        list.innerHTML = '';
        messages.forEach(msg => list.appendChild(buildSupportMessageCard(msg)));
        updateSupportBadge(data.openCount || 0);
    } catch (err) {
        list.innerHTML = `<div style="padding: 10px; color: var(--accent-red);">${err.message || t('Network Error')}</div>`;
    }
}

function buildSupportMessageCard(msg) {
    const isResolved = msg.status === 'resolved';

    const card = document.createElement('div');
    Object.assign(card.style, {
        border: `1px solid ${isResolved ? '#333' : 'var(--primary-gold)'}`,
        background: isResolved ? 'transparent' : 'rgba(212,175,55,0.06)',
        borderRadius: '8px', padding: '14px'
    });

    // Header: name (alias) + email + status + date
    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' });

    const idBlock = document.createElement('div');
    const nameLine = document.createElement('div');
    nameLine.style.fontWeight = 'bold';
    const aliasPart = msg.alias ? ` (${msg.alias})` : '';
    nameLine.textContent = (msg.name || msg.alias || t('Unknown')) + (msg.name ? aliasPart : '');
    const emailLine = document.createElement('div');
    emailLine.style.fontSize = '0.8rem';
    emailLine.style.color = '#aaa';
    emailLine.textContent = msg.email || '';
    idBlock.appendChild(nameLine);
    idBlock.appendChild(emailLine);

    const metaBlock = document.createElement('div');
    metaBlock.style.textAlign = 'right';
    const statusLine = document.createElement('div');
    statusLine.textContent = isResolved ? t('Resolved') : t('Open');
    statusLine.style.color = isResolved ? '#00ff50' : 'var(--primary-gold)';
    statusLine.style.fontWeight = 'bold';
    const dateLine = document.createElement('div');
    dateLine.style.fontSize = '0.8rem';
    dateLine.style.color = '#aaa';
    dateLine.textContent = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';
    metaBlock.appendChild(statusLine);
    metaBlock.appendChild(dateLine);

    header.appendChild(idBlock);
    header.appendChild(metaBlock);
    card.appendChild(header);

    // Contact links (tel / WhatsApp) or "no phone on file"
    const contactRow = document.createElement('div');
    Object.assign(contactRow.style, { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '0.9rem' });
    const phoneDigits = (msg.phone || '').replace(/\D/g, '');
    if (phoneDigits) {
        const phoneLabel = document.createElement('span');
        phoneLabel.style.color = '#ccc';
        phoneLabel.textContent = msg.phone;
        contactRow.appendChild(phoneLabel);

        const callLink = document.createElement('a');
        callLink.href = `tel:${phoneDigits}`;
        callLink.textContent = `📞 ${t('Call')}`;
        Object.assign(callLink.style, { color: 'var(--primary-gold)', textDecoration: 'none', border: '1px solid var(--primary-gold)', padding: '4px 10px', borderRadius: '4px' });
        contactRow.appendChild(callLink);

        const waLink = document.createElement('a');
        waLink.href = `https://wa.me/${phoneDigits}`;
        waLink.target = '_blank';
        waLink.rel = 'noopener noreferrer';
        waLink.textContent = `💬 ${t('WhatsApp')}`;
        Object.assign(waLink.style, { color: '#fff', background: '#25D366', textDecoration: 'none', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold' });
        contactRow.appendChild(waLink);
    } else {
        const noPhone = document.createElement('span');
        noPhone.style.color = '#888';
        noPhone.style.fontStyle = 'italic';
        noPhone.textContent = t('No phone on file');
        contactRow.appendChild(noPhone);
    }
    card.appendChild(contactRow);

    // Message body (user-supplied → textContent)
    const body = document.createElement('div');
    Object.assign(body.style, { whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#222', borderRadius: '4px', padding: '10px', marginBottom: '10px' });
    body.textContent = msg.message || '';
    card.appendChild(body);

    // Reply area
    const replyLabel = document.createElement('label');
    replyLabel.textContent = t('Reply');
    replyLabel.style.display = 'block';
    replyLabel.style.fontSize = '0.85rem';
    replyLabel.style.color = '#ddd';
    replyLabel.style.marginBottom = '4px';
    card.appendChild(replyLabel);

    const replyArea = document.createElement('textarea');
    replyArea.rows = 2;
    replyArea.value = msg.adminReply || '';
    Object.assign(replyArea.style, { width: '100%', boxSizing: 'border-box', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px' });
    card.appendChild(replyArea);

    if (msg.repliedAt) {
        const repliedAt = document.createElement('div');
        repliedAt.style.fontSize = '0.75rem';
        repliedAt.style.color = '#888';
        repliedAt.style.margin = '4px 0';
        repliedAt.textContent = `${t('Last reply')}: ${new Date(msg.repliedAt).toLocaleString()}`;
        card.appendChild(repliedAt);
    }

    // Action buttons
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' });

    const saveReplyBtn = document.createElement('button');
    saveReplyBtn.textContent = t('Save reply');
    Object.assign(saveReplyBtn.style, { background: 'transparent', color: 'var(--primary-gold)', border: '1px solid var(--primary-gold)', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
    saveReplyBtn.onclick = () => saveSupportReply(msg._id, replyArea.value, saveReplyBtn);
    actions.appendChild(saveReplyBtn);

    if (!isResolved) {
        const resolveBtn = document.createElement('button');
        resolveBtn.textContent = t('Resolve');
        Object.assign(resolveBtn.style, { background: 'var(--primary-gold)', color: 'var(--dark-bg, #1a1a1a)', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
        resolveBtn.onclick = () => resolveSupportMessage(msg._id, resolveBtn);
        actions.appendChild(resolveBtn);
    }

    card.appendChild(actions);
    return card;
}

function updateSupportBadge(openCount) {
    const btn = document.getElementById('btnSupportMessages');
    if (!btn) return;
    const base = `📩 ${t('Support messages')}`;
    btn.textContent = openCount > 0 ? `${base} (${openCount})` : base;
}

export async function resolveSupportMessage(id, btn) {
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/admin/support/${id}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ status: 'resolved' })
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) {
            loadSupportMessages();
        } else {
            if (btn) btn.disabled = false;
            announceMessage(data.error || 'Failed to resolve support message');
        }
    } catch (err) {
        if (btn) btn.disabled = false;
        announceMessage(adminConnectionErrorMessage(err));
    }
}

export async function saveSupportReply(id, reply, btn) {
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/admin/support/${id}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ adminReply: reply })
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) {
            announceMessage('Reply saved');
            loadSupportMessages();
        } else {
            if (btn) btn.disabled = false;
            announceMessage(data.error || 'Failed to save reply');
        }
    } catch (err) {
        if (btn) btn.disabled = false;
        announceMessage(adminConnectionErrorMessage(err));
    }
}

// --- Admin View Pending Verifications Modal ---
export async function openPendingVerificationsModal() {
    let modal = document.getElementById('pendingModal');
    if (modal && !modal.querySelector('#pendingModalCloseBtn')) {
        modal.remove();
        modal = null;
    }
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pendingModal';
        modal.className = 'admin-overlay-modal admin-pending-modal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'none',
            alignItems: 'center', justifyContent: 'center',
            overflowY: 'auto', boxSizing: 'border-box'
        });

        const container = document.createElement('div');
        container.className = 'admin-pending-panel admin-modal-panel';
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white',
            border: '1px solid rgba(212, 175, 55, 0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 20px;">Pending Verifications</h2>
            <div class="admin-pending-table-wrap table-scroll-wrap">
                <table class="admin-pending-table">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--primary-gold);">
                            <th class="col-email">${t('Email')}</th>
                            <th class="col-alias">${t('Alias')}</th>
                            <th class="col-docs">${t('Documents')}</th>
                            <th class="col-submitted">${t('Submitted On')}</th>
                            <th class="col-actions">${t('Actions')}</th>
                        </tr>
                    </thead>
                    <tbody id="pendingTableBody">
                        <tr><td colspan="5" style="padding: 10px; text-align: center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(212, 175, 55, 0.25);">
                <button type="button" id="pendingModalCloseBtn" style="padding: 10px 24px; background: var(--primary-gold); color: var(--dark-bg); border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.9rem;">${t('Close')}</button>
            </div>
        `;

        modal.appendChild(container);
        document.body.appendChild(modal);

        document.getElementById('pendingModalCloseBtn').addEventListener('click', () => {
            closeAdminOverlay(modal);
        });

        applyStaticTranslations(modal);
    }

    openAdminOverlay(modal);
    loadPendingVerifications();
}

export async function loadPendingVerifications() {
    const tbody = document.getElementById('pendingTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="padding: 10px; text-align: center;">Loading...</td></tr>';
    
    try {
        const token = localStorage.getItem('token');
        // Added credentials: 'include' to ensure auth cookie is sent
        const res = await fetch(`${API_URL}/admin/verifications/pending`, { 
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);

        if (data.success) {
            tbody.innerHTML = '';
            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding: 10px; text-align: center;">No pending verifications.</td></tr>';
                return;
            }

            window._pendingVerificationRows = data.data;
            
            data.data.forEach(prof => {
                const alias = prof.professionalProfile?.alias || 'Unknown';
                const isExpress = Boolean(prof.professionalProfile?.expressRegistration);
                const docLabels = ['ID Front', 'ID Back', 'Selfie'];
                const docs = isExpress
                    ? `<span style="color:#25D366;font-size:0.85rem;">${t('Express registration — complete profile in Admin')}</span><br><span style="color:#888;font-size:0.8rem;">${t('No ID photos yet — request gallery photos on WhatsApp, then upload in Edit Professional.')}</span>`
                    : (prof.verificationDocuments && prof.verificationDocuments.length > 0
                    ? `<div style="display: flex; gap: 8px; flex-wrap: wrap;">` + prof.verificationDocuments.map((doc, idx) => {
                        const label = docLabels[idx] || `Doc ${idx + 1}`;
                        return `<button type="button" class="view-doc-btn" data-prof-id="${prof._id}" data-doc-index="${idx}" title="${t('View {label}').replace('{label}', t(label))}" aria-label="${t('View {label}').replace('{label}', t(label))}" style="padding: 0; background: #222; border: 1px solid var(--primary-gold); border-radius: 4px; cursor: pointer; overflow: hidden; width: 64px; text-align: center;">
                            <img src="${doc}" alt="${t(label)}" style="width: 64px; height: 64px; object-fit: cover; display: block;">
                            <span style="display: block; font-size: 0.65rem; color: var(--primary-gold); padding: 2px;">${t(label)}</span>
                        </button>`;
                    }).join('') + `</div>`
                    : '<span style="color: #888;">No documents on file (registered before document storage was enabled)</span>');
                const gesture = prof.verificationGesture || 'N/A';
                const gestureInfo = getVerificationGesture(gesture);
                const gestureDisplay = isExpress
                    ? `<span style="color:#888;font-size:0.8rem;">—</span>`
                    : (gestureInfo
                    ? `<span style="display: inline-flex; align-items: center; gap: 8px; margin-top: 6px;">
                            <span style="font-size: 2rem; line-height: 1;" title="${gestureInfo ? t(gestureInfo.labelKey) : t(gesture)}">${gestureInfo.emoji}</span>
                            <strong style="color: white;">${t(gestureInfo.labelKey)}</strong>
                       </span>`
                    : `<strong style="color: white;">${gesture}</strong>`);

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #333';
                tr.innerHTML = `
                    <td class="col-email" style="padding: 10px;">${prof.email}${isExpress ? `<br><span style="color:#25D366;font-size:0.75rem;">${t('Express registration — complete profile in Admin')}</span>` : ''}</td>
                    <td class="col-alias" style="padding: 10px;">${alias}</td>
                    <td class="col-docs" style="padding: 10px;">
                        ${docs}<br>
                        <span style="font-size: 0.8rem; color: #aaa; display: block; margin-top: 6px;">Gesture: ${gestureDisplay}</span>
                    </td>
                    <td class="col-submitted" style="padding: 10px;">${new Date(prof.createdAt).toLocaleString()}</td>
                    <td class="col-actions admin-pending-actions-cell" style="padding: 10px;">
                        <div class="admin-pending-actions">
                            <button type="button" class="approve-btn admin-verification-btn" data-id="${prof._id}" title="${t('Approve')}" aria-label="${t('Approve')}">✓</button>
                            <button type="button" class="reject-btn admin-verification-btn" data-id="${prof._id}" title="${t('Reject')}" aria-label="${t('Reject')}">✕</button>
                            <button type="button" class="set-password-btn admin-verification-btn" data-id="${prof._id}" data-email="${prof.email}" title="${t('Set temporary password')}" aria-label="${t('Set temporary password')}">🔑</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.approve-btn').forEach(btn => {
                btn.onclick = () => updateVerificationStatus(btn.getAttribute('data-id'), 'approved');
            });
            document.querySelectorAll('.reject-btn').forEach(btn => {
                btn.onclick = () => openRejectVerificationModal(btn.getAttribute('data-id'));
            });
            document.querySelectorAll('.set-password-btn').forEach(btn => {
                btn.onclick = () => openSetPasswordModal(btn.getAttribute('data-id'), btn.getAttribute('data-email'));
            });
            document.querySelectorAll('.view-doc-btn').forEach(btn => {
                btn.onclick = () => {
                    const profId = btn.getAttribute('data-prof-id');
                    const idx = parseInt(btn.getAttribute('data-doc-index'), 10);
                    const prof = (window._pendingVerificationRows || []).find(p => String(p._id) === String(profId));
                    if (prof && prof.verificationDocuments && prof.verificationDocuments[idx]) {
                        openImageModal(prof.verificationDocuments[idx]);
                    }
                };
            });
            applyStaticTranslations(tbody);

        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="padding: 10px; color: var(--accent-red);">Error: ${data.error}</td></tr>`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 10px; color: var(--accent-red);">${err.message || t('Network Error')}</td></tr>`;
    }
}

export function openRejectVerificationModal(professionalId) {
    let modal = document.getElementById('rejectVerificationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'rejectVerificationModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3500', display: 'none',
            alignItems: 'center', justifyContent: 'center', padding: '20px',
            overflowY: 'auto', boxSizing: 'border-box'
        });

        modal.innerHTML = `
            <div class="card admin-modal-panel" style="max-width: 520px; width: 100%; padding: 24px; color: white;">
                <h3 class="gold-text" style="margin-top: 0;">${t('Reject registration')}</h3>
                <p style="font-size: 0.9rem; color: #ccc; margin-bottom: 20px;">${t('Select a rejection reason and describe which photos or details need correction. An email will be sent to the professional.')}</p>
                <div style="margin-bottom: 16px;">
                    <label for="rejectReasonSelect" style="display: block; margin-bottom: 6px; color: var(--primary-gold);">${t('Rejection reason')}</label>
                    <select id="rejectReasonSelect" class="form-select" style="width: 100%; padding: 10px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                        <option value="">${t('Select a reason...')}</option>
                        <option value="photos_unclear">${t('Photos are not clear enough to validate information')}</option>
                        <option value="photo_info_mismatch">${t('Photo information doesnt match registration info.')}</option>
                        <option value="general_failure">${t('General failure')}</option>
                    </select>
                </div>
                <div style="margin-bottom: 20px;">
                    <label for="rejectDetailsInput" style="display: block; margin-bottom: 6px; color: var(--primary-gold);">${t('Rejection details')}</label>
                    <textarea id="rejectDetailsInput" rows="5" placeholder="${t('e.g. ID Front, ID Back, Selfie — specify which pictures need to be re-uploaded')}" style="width: 100%; box-sizing: border-box; padding: 10px; background: #111; color: white; border: 1px solid rgba(212,175,55,0.45); border-radius: 4px; resize: vertical;"></textarea>
                </div>
                <div id="rejectModalAlert" class="alert hidden" style="margin-bottom: 12px;"></div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                    <button type="button" id="rejectModalCancelBtn" style="padding: 10px 20px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">${t('Cancel')}</button>
                    <button type="button" id="rejectModalConfirmBtn" style="padding: 10px 20px; background: var(--accent-red); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">${t('Send rejection email')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('rejectModalCancelBtn').addEventListener('click', () => {
            closeAdminOverlay(modal);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAdminOverlay(modal);
        });
        applyStaticTranslations(modal);
    }

    modal.dataset.professionalId = professionalId;
    document.getElementById('rejectReasonSelect').value = '';
    document.getElementById('rejectDetailsInput').value = '';
    const alertEl = document.getElementById('rejectModalAlert');
    alertEl.classList.add('hidden');
    alertEl.textContent = '';

    const confirmBtn = document.getElementById('rejectModalConfirmBtn');
    confirmBtn.onclick = async () => {
        const rejectionReason = document.getElementById('rejectReasonSelect').value;
        const rejectionDetails = document.getElementById('rejectDetailsInput').value.trim();

        if (!rejectionReason) {
            showAlert(alertEl, t('Please select a rejection reason.'));
            return;
        }
        if (!rejectionDetails) {
            showAlert(alertEl, t('Please provide rejection details in the text field.'));
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = t('Sending...');

        try {
            await updateVerificationStatus(professionalId, 'rejected', { rejectionReason, rejectionDetails });
            closeAdminOverlay(modal);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('Send rejection email');
        }
    };

    openAdminOverlay(modal);
}

export function openSetPasswordModal(userId, userEmail) {
    let modal = document.getElementById('setPasswordModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'setPasswordModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3500', display: 'none',
            alignItems: 'center', justifyContent: 'center', padding: '20px',
            overflowY: 'auto', boxSizing: 'border-box'
        });

        modal.innerHTML = `
            <div class="card admin-modal-panel" style="max-width: 520px; width: 100%; padding: 24px; color: white;">
                <h3 class="gold-text" style="margin-top: 0;">${t('Set temporary password')}</h3>
                <p style="font-size: 0.9rem; color: #ccc; margin-bottom: 20px;">
                    ${t('This closes every open session for the account and forces the user to define their own password on next login. The temporary password is emailed to them.')}
                </p>
                <div style="margin-bottom: 16px;">
                    <label for="setPwdTargetEmail" style="display: block; margin-bottom: 6px; color: var(--primary-gold);">${t('Account')}</label>
                    <input id="setPwdTargetEmail" type="text" readonly style="width: 100%; box-sizing: border-box; padding: 10px; background: #111; color: #aaa; border: 1px solid #444; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label for="setPwdInput" style="display: block; margin-bottom: 6px; color: var(--primary-gold);">${t('Temporary password (min 6 chars)')}</label>
                    <input id="setPwdInput" type="text" placeholder="${t('Type a password to send')}" autocomplete="off" style="width: 100%; box-sizing: border-box; padding: 10px; background: #111; color: white; border: 1px solid rgba(212,175,55,0.45); border-radius: 4px;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label for="setPwdConfirmInput" style="display: block; margin-bottom: 6px; color: var(--primary-gold);">${t('Repeat password')}</label>
                    <input id="setPwdConfirmInput" type="text" placeholder="${t('Repeat the password')}" autocomplete="off" style="width: 100%; box-sizing: border-box; padding: 10px; background: #111; color: white; border: 1px solid rgba(212,175,55,0.45); border-radius: 4px;">
                </div>
                <div style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 14px;">
                    <button type="button" id="setPwdGenerateBtn" style="padding: 8px 14px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer;">${t('Generate random')}</button>
                </div>
                <div id="setPwdAlert" class="alert hidden" style="margin-bottom: 12px;"></div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                    <button type="button" id="setPwdCancelBtn" style="padding: 10px 20px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">${t('Cancel')}</button>
                    <button type="button" id="setPwdConfirmBtn" style="padding: 10px 20px; background: var(--primary-gold); color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">${t('Set password')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('setPwdCancelBtn').addEventListener('click', () => {
            closeAdminOverlay(modal);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAdminOverlay(modal);
        });
        document.getElementById('setPwdGenerateBtn').addEventListener('click', () => {
            const generated = generateTempPassword();
            document.getElementById('setPwdInput').value = generated;
            document.getElementById('setPwdConfirmInput').value = generated;
        });
        applyStaticTranslations(modal);
    }

    modal.dataset.userId = userId;
    document.getElementById('setPwdTargetEmail').value = userEmail || '';
    document.getElementById('setPwdInput').value = '';
    document.getElementById('setPwdConfirmInput').value = '';
    const alertEl = document.getElementById('setPwdAlert');
    alertEl.classList.add('hidden');
    alertEl.textContent = '';

    const confirmBtn = document.getElementById('setPwdConfirmBtn');
    confirmBtn.onclick = async () => {
        const password = document.getElementById('setPwdInput').value;
        const confirmPassword = document.getElementById('setPwdConfirmInput').value;

        if (!password || password.length < 6) {
            showAlert(alertEl, t('Password must be at least 6 characters.'), true, 'setPwdInput');
            return;
        }
        if (password !== confirmPassword) {
            showAlert(alertEl, t('Passwords do not match.'), true, 'setPwdConfirmInput');
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = t('Setting...');

        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ password, confirmPassword })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showAlert(alertEl, data.error || t('Network Error'), true, 'setPwdInput');
                return;
            }
            closeAdminOverlay(modal);
            alert(data.data?.emailDelivered
                ? t('Password set. The user was emailed the temporary password and must change it on next login.')
                : t('Password set, but the email could NOT be sent. Share the temporary password with the user manually.'));
            if (data.data?.self) {
                alert(t('That was your own account: log in again with the new password.'));
            }
        } catch (err) {
            showAlert(alertEl, err.message || t('Network Error'));
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('Set password');
        }
    };

    openAdminOverlay(modal);
}

function generateTempPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint32Array(12);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

export async function updateVerificationStatus(id, status, extra = {}) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/verifications/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                ...authHeaders()
            },
            credentials: 'include',
            body: JSON.stringify({ status, ...extra })
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) {
            announceMessage(status === 'rejected' ? t('Rejection email sent successfully.') : `Professional ${status} successfully.`, { isError: false });
            loadPendingVerifications(); 
            if (document.getElementById('adminFilterBtn')) {
                loadAdminGridData(); 
            }
        } else {
            announceMessage(data.error || 'Failed to update status');
        }
    } catch (err) {
        announceMessage(adminConnectionErrorMessage(err));
    }
}

// --- Image Viewer Modal ---
export function openImageModal(src) {
    let modal = document.getElementById('imageViewerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageViewerModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.95)', zIndex: '4000', display: 'none',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px', boxSizing: 'border-box'
        });

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', t('Close'));
        Object.assign(closeBtn.style, {
            position: 'absolute', top: '20px', right: '30px',
            background: 'transparent', color: 'var(--primary-gold)', border: 'none',
            fontSize: '50px', cursor: 'pointer', lineHeight: '1', zIndex: '1'
        });

        const img = document.createElement('img');
        img.id = 'imageViewerImg';
        Object.assign(img.style, {
            maxWidth: '95%', maxHeight: '92vh', objectFit: 'contain',
            border: '2px solid var(--primary-gold)', borderRadius: '8px', background: '#111'
        });

        const closeModal = () => {
            closeAdminOverlay(modal);
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        };

        closeBtn.onclick = closeModal;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
        });

        modal.appendChild(closeBtn);
        modal.appendChild(img);
        document.body.appendChild(modal);
    }

    document.getElementById('imageViewerImg').src = src;
    openAdminOverlay(modal);
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

// --- Admin Mail Broadcast Modal ---
export async function openMailBroadcastModal() {
    let modal = document.getElementById('mailBroadcastModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mailBroadcastModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '600px',
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '600px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 20px;">Send Broadcast Email</h2>
            <form id="mailBroadcastForm" style="display: flex; flex-direction: column; gap: 15px;">
                <div id="mailBroadcastAlert" class="alert hidden" style="padding: 10px; border-radius: 4px; border: 1px solid transparent;"></div>
                
                <label>Audience</label>
                <select id="broadcastAudience" style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                    <option value="all">All Professionals</option>
                    <option value="approved">Approved Professionals Only</option>
                </select>

                <label>Subject</label>
                <input type="text" id="broadcastSubject" required style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">

                <label>Message</label>
                <textarea id="broadcastMessage" required rows="6" style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px; font-family: sans-serif;"></textarea>

                <p style="font-size: 0.85rem; color: #aaa;">Note: The greeting "Hello [Alias]," will be automatically prepended to each email.</p>

                <button type="submit" style="padding: 10px 20px; background: var(--primary-gold); color: var(--dark-bg); border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Send Broadcast</button>
            </form>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);

        document.getElementById('mailBroadcastForm').onsubmit = async (e) => {
            e.preventDefault();
            const alertEl = document.getElementById('mailBroadcastAlert');
            const submitBtn = e.target.querySelector('button[type="submit"]');
            
            if (!(await confirmDialog('Are you sure you want to send this email to the selected audience? This action cannot be undone.'))) {
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            const payload = {
                audience: document.getElementById('broadcastAudience').value,
                subject: document.getElementById('broadcastSubject').value,
                message: document.getElementById('broadcastMessage').value
            };

            try {
                const token = localStorage.getItem('token');
                // Added credentials: 'include' to ensure auth cookie is sent
                const res = await fetch(`${API_URL}/admin/notifications/mail/broadcast`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        ...authHeaders()
                    },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
                const data = await parseAdminApiResponse(res);

                if (data.success) {
                    showAlert(alertEl, data.message || 'Emails successfully queued for sending.', false);
                    document.getElementById('mailBroadcastForm').reset();
                } else {
                    showAlert(alertEl, data.error || 'Failed to send broadcast');
                }
            } catch (err) {
                showAlert(alertEl, adminConnectionErrorMessage(err));
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Broadcast';
            }
        };
    }

    openAdminOverlay(modal);
}

async function fetchAdminProfessionalsForPicker() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/admin/professionals`, {
        headers: authHeaders(),
        credentials: 'include'
    });
    const data = await parseAdminApiResponse(res);
    return data.success ? data.data : [];
}

async function fetchAdminLeadsForPicker() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/admin/potential-professionals`, {
        headers: authHeaders(),
        credentials: 'include'
    });
    const data = await parseAdminApiResponse(res);
    return data.success ? data.data : [];
}

function renderRecipientChecklist(containerId, items, valueKey, labelFn, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<p style="color:#888;font-size:0.9rem;">${emptyMessage}</p>`;
        return;
    }
    container.innerHTML = items.map((item) => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #333;cursor:pointer;">
            <input type="checkbox" class="special-recipient-cb" value="${item[valueKey]}" style="width:auto;">
            <span>${labelFn(item)}</span>
        </label>
    `).join('');
}

export async function openMailSpecialModal() {
    let modal = document.getElementById('mailSpecialModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mailSpecialModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '700px',
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '700px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 10px;">${t('Mail: Special Messages')}</h2>
            <p style="color:#aaa;font-size:0.9rem;margin-bottom:16px;">${t('Send email only to the professionals you select below.')}</p>
            <form id="mailSpecialForm" style="display:flex;flex-direction:column;gap:15px;">
                <div id="mailSpecialAlert" class="alert hidden" style="padding:10px;border-radius:4px;border:1px solid transparent;"></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button type="button" id="mailSpecialSelectAll" style="padding:6px 12px;background:#333;color:white;border:1px solid #555;border-radius:4px;cursor:pointer;">${t('Select all')}</button>
                    <button type="button" id="mailSpecialClearAll" style="padding:6px 12px;background:#333;color:white;border:1px solid #555;border-radius:4px;cursor:pointer;">${t('Clear selection')}</button>
                </div>
                <div id="mailSpecialRecipients" style="max-height:220px;overflow-y:auto;border:1px solid #333;border-radius:4px;padding:10px;background:#111;">${t('Loading...')}</div>
                <label>${t('Subject')}</label>
                <input type="text" id="mailSpecialSubject" required style="padding:8px;background:#222;color:white;border:1px solid #444;border-radius:4px;">
                <label>${t('Message')}</label>
                <textarea id="mailSpecialMessage" required rows="6" style="padding:8px;background:#222;color:white;border:1px solid #444;border-radius:4px;font-family:sans-serif;"></textarea>
                <p style="font-size:0.85rem;color:#aaa;">${t('The greeting "Hello [Alias]," is added automatically for each recipient.')}</p>
                <button type="submit" style="padding:10px 20px;background:var(--primary-gold);color:var(--dark-bg);border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Send to selected')}</button>
            </form>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);

        document.getElementById('mailSpecialSelectAll').onclick = () => {
            modal.querySelectorAll('.special-recipient-cb').forEach((cb) => { cb.checked = true; });
        };
        document.getElementById('mailSpecialClearAll').onclick = () => {
            modal.querySelectorAll('.special-recipient-cb').forEach((cb) => { cb.checked = false; });
        };

        document.getElementById('mailSpecialForm').onsubmit = async (e) => {
            e.preventDefault();
            const alertEl = document.getElementById('mailSpecialAlert');
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const recipientIds = Array.from(modal.querySelectorAll('.special-recipient-cb:checked')).map((cb) => cb.value);

            if (!recipientIds.length) {
                showAlert(alertEl, t('Select at least one recipient'));
                return;
            }

            if (!(await confirmDialog(t('Send this email to {count} selected professional(s)?').replace('{count}', recipientIds.length)))) {
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = t('Sending...');

            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/admin/notifications/mail/targeted`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...authHeaders()
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        recipientIds,
                        subject: document.getElementById('mailSpecialSubject').value,
                        message: document.getElementById('mailSpecialMessage').value
                    })
                });
                const data = await parseAdminApiResponse(res);
                if (data.success) {
                    showAlert(alertEl, data.message || t('Emails successfully queued for sending.'), false);
                    document.getElementById('mailSpecialForm').reset();
                    modal.querySelectorAll('.special-recipient-cb').forEach((cb) => { cb.checked = false; });
                } else {
                    showAlert(alertEl, data.error || t('Failed to send messages'));
                }
            } catch (err) {
                showAlert(alertEl, adminConnectionErrorMessage(err));
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = t('Send to selected');
            }
        };
    }

    openAdminOverlay(modal);
    const professionals = await fetchAdminProfessionalsForPicker();
    renderRecipientChecklist(
        'mailSpecialRecipients',
        professionals,
        '_id',
        (p) => `${p.professionalProfile?.alias || '—'} <span style="color:#888;">(${p.email})</span>`,
        t('No professionals found.')
    );
}

export async function openWaSpecialModal() {
    let modal = document.getElementById('waSpecialModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'waSpecialModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '800px',
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '800px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 10px;">${t('WA: Special Messages')}</h2>
            <p style="color:#aaa;font-size:0.9rem;margin-bottom:16px;">${t('Send WhatsApp only to the leads or professionals you select. Leave the message blank to use the default invite template.')}</p>
            <div id="waSpecialAlert" class="alert hidden" style="padding:10px;border-radius:4px;border:1px solid transparent;margin-bottom:12px;"></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                <button type="button" id="waSpecialSelectAll" style="padding:6px 12px;background:#333;color:white;border:1px solid #555;border-radius:4px;cursor:pointer;">${t('Select all')}</button>
                <button type="button" id="waSpecialClearAll" style="padding:6px 12px;background:#333;color:white;border:1px solid #555;border-radius:4px;cursor:pointer;">${t('Clear selection')}</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div>
                    <h4 class="gold-text" style="margin:0 0 10px 0;">${t('Scraped leads')}</h4>
                    <div id="waSpecialLeads" style="max-height:180px;overflow-y:auto;border:1px solid #333;border-radius:4px;padding:10px;background:#111;">${t('Loading...')}</div>
                </div>
                <div>
                    <h4 class="gold-text" style="margin:0 0 10px 0;">${t('Registered professionals')}</h4>
                    <div id="waSpecialProfessionals" style="max-height:180px;overflow-y:auto;border:1px solid #333;border-radius:4px;padding:10px;background:#111;">${t('Loading...')}</div>
                </div>
            </div>
            <label>${t('Custom message (optional)')}</label>
            <textarea id="waSpecialMessage" rows="5" placeholder="${t('Use {alias} as a placeholder for the recipient name.')}" style="padding:8px;background:#222;color:white;border:1px solid #444;border-radius:4px;font-family:sans-serif;width:100%;box-sizing:border-box;margin-bottom:12px;"></textarea>
            <div id="bulkWhatsappPanelSpecial" class="hidden" style="margin-bottom:16px;padding:16px;border:1px solid rgba(37,211,102,0.4);border-radius:8px;background:rgba(37,211,102,0.08);">
                <h4 class="gold-text" style="margin:0 0 10px 0;">${t('Outreach progress')}</h4>
                <p id="waSpecialStatusText" style="color:#ccc;margin:0 0 12px 0;font-size:0.9rem;">—</p>
                <div id="waSpecialQrWrap" class="hidden" style="margin-bottom:12px;text-align:center;">
                    <p style="color:#aaa;font-size:0.85rem;margin-bottom:8px;">${t('Scan QR with WhatsApp on your phone')}</p>
                    <img id="waSpecialQrImg" alt="WhatsApp QR" style="max-width:220px;background:white;padding:8px;border-radius:8px;">
                </div>
                <div style="background:#222;border-radius:4px;height:10px;overflow:hidden;margin-bottom:8px;">
                    <div id="waSpecialBar" style="height:100%;width:0%;background:#25D366;transition:width 0.3s ease;"></div>
                </div>
                <p id="waSpecialCounts" style="color:#888;font-size:0.85rem;margin:0;">0 / 0</p>
            </div>
            <button type="button" id="waSpecialSendBtn" style="padding:10px 20px;background:#25D366;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Send WhatsApp to selected')}</button>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);

        document.getElementById('waSpecialSelectAll').onclick = () => {
            modal.querySelectorAll('.wa-lead-cb, .wa-prof-cb').forEach((cb) => { cb.checked = true; });
        };
        document.getElementById('waSpecialClearAll').onclick = () => {
            modal.querySelectorAll('.wa-lead-cb, .wa-prof-cb').forEach((cb) => { cb.checked = false; });
        };

        document.getElementById('waSpecialSendBtn').onclick = async () => {
            const alertEl = document.getElementById('waSpecialAlert');
            const btn = document.getElementById('waSpecialSendBtn');
            const leadIds = Array.from(modal.querySelectorAll('.wa-lead-cb:checked')).map((cb) => cb.value);
            const professionalIds = Array.from(modal.querySelectorAll('.wa-prof-cb:checked')).map((cb) => cb.value);

            if (!leadIds.length && !professionalIds.length) {
                showAlert(alertEl, t('Select at least one recipient'));
                return;
            }

            const total = leadIds.length + professionalIds.length;
            if (!(await confirmDialog(t('Send WhatsApp to {count} selected recipient(s)?').replace('{count}', total)))) {
                return;
            }

            btn.disabled = true;
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/admin/outreach/whatsapp/targeted`, {
                    method: 'POST',
                    headers: {
                        ...authHeaders(),
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        leadIds,
                        professionalIds,
                        message: document.getElementById('waSpecialMessage').value.trim()
                    })
                });
                const data = await parseAdminApiResponse(res);
                if (!data.success) {
                    showAlert(alertEl, data.error || t('Could not start WhatsApp outreach'));
                    btn.disabled = false;
                    return;
                }
                showAlert(alertEl, t('WhatsApp outreach started. Scan the QR if prompted.'), false);
                document.getElementById('bulkWhatsappPanelSpecial').classList.remove('hidden');
                if (waSpecialPollTimer) clearInterval(waSpecialPollTimer);
                waSpecialPollTimer = setInterval(pollWaSpecialStatus, 2500);
                pollWaSpecialStatus();
            } catch (err) {
                showAlert(alertEl, adminConnectionErrorMessage(err));
                btn.disabled = false;
            }
        };
    }

    openAdminOverlay(modal);
    const [leads, professionals] = await Promise.all([
        fetchAdminLeadsForPicker(),
        fetchAdminProfessionalsForPicker()
    ]);

    const leadsContainer = document.getElementById('waSpecialLeads');
    if (!leads.length) {
        leadsContainer.innerHTML = `<p style="color:#888;font-size:0.9rem;">${t('No leads found.')}</p>`;
    } else {
        leadsContainer.innerHTML = leads.map((lead) => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #333;cursor:pointer;">
                <input type="checkbox" class="wa-lead-cb" value="${lead._id}" style="width:auto;">
                <span>${lead.alias || '—'} <span style="color:#888;">(${lead.phone})</span></span>
            </label>
        `).join('');
    }

    const profsWithPhone = professionals.filter((p) => {
        const profile = p.professionalProfile || {};
        return (profile.whatsappNumber || profile.mobilePhone || '').trim();
    });
    const profContainer = document.getElementById('waSpecialProfessionals');
    if (!profsWithPhone.length) {
        profContainer.innerHTML = `<p style="color:#888;font-size:0.9rem;">${t('No professionals with WhatsApp numbers found.')}</p>`;
    } else {
        profContainer.innerHTML = profsWithPhone.map((p) => {
            const profile = p.professionalProfile || {};
            const phone = profile.whatsappNumber || profile.mobilePhone || '';
            return `
                <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #333;cursor:pointer;">
                    <input type="checkbox" class="wa-prof-cb" value="${p._id}" style="width:auto;">
                    <span>${profile.alias || '—'} <span style="color:#888;">(${phone})</span></span>
                </label>
            `;
        }).join('');
    }

    pollWaSpecialStatus();
}

let waSpecialPollTimer = null;

function renderWaSpecialStatus(status) {
    const panel = document.getElementById('bulkWhatsappPanelSpecial');
    const textEl = document.getElementById('waSpecialStatusText');
    const barEl = document.getElementById('waSpecialBar');
    const countsEl = document.getElementById('waSpecialCounts');
    const qrWrap = document.getElementById('waSpecialQrWrap');
    const qrImg = document.getElementById('waSpecialQrImg');
    const btn = document.getElementById('waSpecialSendBtn');
    if (!panel || !textEl) return;

    if (!status || status.phase === 'idle') {
        panel.classList.add('hidden');
        if (btn) btn.disabled = false;
        return;
    }

    panel.classList.remove('hidden');
    const labels = {
        initializing: t('Connecting to WhatsApp...'),
        qr: t('Scan QR with WhatsApp on your phone'),
        sending: t('Sending messages...'),
        complete: t('Outreach complete.'),
        error: status.lastError || t('Outreach failed.')
    };
    textEl.textContent = labels[status.phase] || status.phase;

    if (status.phase === 'qr' && status.qr && qrWrap && qrImg) {
        qrWrap.classList.remove('hidden');
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(status.qr)}`;
    } else if (qrWrap) {
        qrWrap.classList.add('hidden');
    }

    const done = (status.sent || 0) + (status.failed || 0) + (status.skipped || 0);
    const total = status.total || 0;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    if (barEl) barEl.style.width = `${pct}%`;
    if (countsEl) countsEl.textContent = `${done} / ${total} (${status.sent || 0} ${t('sent')}, ${status.failed || 0} ${t('failed')})`;

    if (status.phase === 'complete' || status.phase === 'error') {
        if (waSpecialPollTimer) {
            clearInterval(waSpecialPollTimer);
            waSpecialPollTimer = null;
        }
        if (btn) btn.disabled = false;
    } else if (btn) {
        btn.disabled = true;
    }
}

async function pollWaSpecialStatus() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/outreach/bulk-whatsapp/status`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) renderWaSpecialStatus(data.data);
    } catch (err) {
        console.error('WA special status poll failed', err);
    }
}

// --- Admin Edit Professional Profile Modal ---
let editModalReturnMode = 'list';

function closeAdminEditModalToDashboard() {
    closeAdminOverlay(document.getElementById('editProfModal'), () => {
        if (document.getElementById('adminGridContent')) loadAdminGridData();
    });
}

export async function openEditProfessionalModal(prof = null) {
    editModalReturnMode = prof ? 'dashboard' : 'list';
    let modal = document.getElementById('editProfModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editProfModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });
        const closeBar = createAdminModalCloseBar({
            maxWidth: '800px',
            label: '← ' + t('Back to Dashboard'),
            onClick: () => closeAdminEditModalToDashboard()
        });
        const container = document.createElement('div');
        container.id = 'editProfContainer';
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '800px', margin: '0 auto', width: '100%'
        });

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);
    }

    openAdminOverlay(modal);
    // Single always-visible back button (sticky close bar): same appearance
    // as the former in-form button, mode-aware (back to list or dashboard).
    const backBtn = modal.querySelector('.modal-close-bar button');
    if (backBtn) {
        const toList = editModalReturnMode !== 'dashboard';
        backBtn.innerHTML = `&larr; ${toList ? t('Back to List') : t('Back to Dashboard')}`;
        backBtn.style.cssText = 'padding: 6px 12px; background: transparent; border: 1px solid var(--primary-gold); color: var(--primary-gold); border-radius: 4px; cursor: pointer; transition: background 0.3s ease; min-height: 0; min-width: 0;';
        backBtn.onmouseover = () => { backBtn.style.background = 'rgba(212, 175, 55, 0.1)'; };
        backBtn.onmouseout = () => { backBtn.style.background = 'transparent'; };
        backBtn.onclick = () => {
            if (editModalReturnMode === 'dashboard') {
                closeAdminEditModalToDashboard();
            } else {
                renderProfessionalList();
            }
        };
    }
    const container = document.getElementById('editProfContainer');
    container.innerHTML = 'Loading...';

    if (prof) {
        renderEditForm(prof);
    } else {
        renderProfessionalList();
    }
}

export async function renderProfessionalList(aliasSearch = '') {
    const container = document.getElementById('editProfContainer');
    container.innerHTML = `
        <h2 class="gold-text" style="margin-bottom: 20px;">Select a Professional to Edit</h2>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <input type="text" id="profSearchInput" placeholder="Search by Alias..." value="${aliasSearch}" style="padding: 8px; border-radius: 4px; border: 1px solid #333; background: #222; color: white; flex: 1;">
            <button id="searchProfBtn">Search</button>
        </div>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--primary-gold);">
                        <th style="padding: 10px;">Email</th>
                        <th style="padding: 10px;">Alias</th>
                        <th style="padding: 10px;">Empresa</th>
                        <th style="padding: 10px;">CUIT</th>
                        <th style="padding: 10px;">Status</th>
                        <th style="padding: 10px;">Actions</th>
                    </tr>
                </thead>
                <tbody id="profTableBody">
                    <tr><td colspan="6" style="padding: 10px; text-align: center;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('searchProfBtn').onclick = () => {
        renderProfessionalList(document.getElementById('profSearchInput').value);
    };

    try {
        const token = localStorage.getItem('token');
        const url = new URL(`${API_URL}/admin/professionals`);
        if (aliasSearch) url.searchParams.append('alias', aliasSearch);

        // Added credentials: 'include' to ensure auth cookie is sent
        const res = await fetch(url, { 
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);

        const tbody = document.getElementById('profTableBody');
        tbody.innerHTML = '';

        if (data.success) {
            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="padding: 10px; text-align: center;">No professionals found.</td></tr>';
                return;
            }
            
            data.data.forEach(prof => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #333';
                const deletedBadge = prof.accountDeletedAt
                    ? ' <span style="color:#888;font-size:0.75rem;">(user-deleted · data kept)</span>'
                    : '';
                tr.innerHTML = `
                    <td style="padding: 10px;">${prof.email}</td>
                    <td style="padding: 10px;">${prof.professionalProfile?.alias || 'N/A'}${deletedBadge}</td>
                    <td style="padding: 10px;">${prof.hogarProfile?.companyName || '-'}</td>
                    <td style="padding: 10px;">${prof.hogarProfile?.taxId || '-'}</td>
                    <td style="padding: 10px;">${prof.verificationStatus}</td>
                    <td style="padding: 10px;">
                        <button class="edit-prof-btn" data-id="${prof._id}" style="padding: 5px 10px;">Edit</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.edit-prof-btn').forEach(btn => {
                btn.onclick = () => {
                    const profId = btn.getAttribute('data-id');
                    const selectedProf = data.data.find(p => p._id === profId);
                    renderEditForm(selectedProf);
                };
            });
            applyStaticTranslations(tbody);
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="padding: 10px; color: var(--accent-red);">Error: ${data.error}</td></tr>`;
        }
    } catch (err) {
        document.getElementById('profTableBody').innerHTML = `<tr><td colspan="4" style="padding: 10px; color: var(--accent-red);">${err.message || t('Network Error')}</td></tr>`;
    }
}

export async function renderEditForm(prof) {
    const container = document.getElementById('editProfContainer');
    // The list endpoint only returns the cover photo and may omit newer
    // profile fields, so load the complete record before rendering the
    // editor (which mirrors the professional profile form field-for-field).
    container.innerHTML = '<p>Loading...</p>';
    try {
        const res = await fetch(`${API_URL}/admin/professionals/${prof._id}`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (data.success && data.data) prof = { ...prof, ...data.data };
    } catch (err) { /* fall back to the list item */ }
    const profile = prof.professionalProfile || {};
    const servicesStr = (profile.services || []).join(', ');

    container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 20px;">Edit Professional: ${profile.alias || prof.email}</h2>
        <form id="adminEditProfForm" style="display: flex; flex-direction: column; gap: 15px;"> <div id="adminEditAlert" class="alert hidden" style="padding: 10px; border-radius: 4px; border: 1px solid transparent;"></div>
            <label>Email</label>
            <input type="email" id="adminEditEmail" value="${prof.email}" required style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
            
            <label>Verification Status</label>
            <select id="adminEditStatus" style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                <option value="pending" ${prof.verificationStatus === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="approved" ${prof.verificationStatus === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="rejected" ${prof.verificationStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>

            <h4 style="margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 5px; color: var(--primary-gold);">Identity & Contact</h4>
            <div style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 10px;">
                <div style="flex:1;"><label>First Name</label><input type="text" id="adminEditFirstName" value="${profile.firstName || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Last Name</label><input type="text" id="adminEditLastName" value="${profile.surname || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Middle Name</label><input type="text" id="adminEditMiddleName" value="${profile.middleName || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>DNI</label><input type="text" id="adminEditIdNumber" value="${profile.idNumber || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Birth Date</label><input type="date" id="adminEditBirthDate" value="${profile.birthDate ? profile.birthDate.substring(0,10) : ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Age</label><input type="text" id="adminEditAge" value="${profile.age || ''}" readonly style="width:100%; padding: 8px; background: #333; color: var(--primary-gold); border: 1px solid #444; border-radius: 4px; font-weight: bold; text-align: center;"></div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 15px;">
                <div style="flex:1; min-width:220px;"><label>${t('Mobile phone')}</label>${phonePickerHtml('adminEditMobile', profile.mobilePhone, 'adminEditMobilePhone')}</div>
                <div style="flex:1;"><label>Street</label><input type="text" id="adminEditStreet" value="${profile.location?.street || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Number</label><input type="text" id="adminEditStreetNumber" value="${profile.location?.number || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Floor</label><input type="text" id="adminEditFloor" value="${profile.location?.floor || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Apt</label><input type="text" id="adminEditApartment" value="${profile.location?.apartment || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Post Code</label><input type="text" id="adminEditPostCode" value="${profile.location?.postalCode || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 15px;">
                <div style="flex:1;"><label>Province</label><select id="adminEditProvince" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></select></div>
                <div style="flex:1;"><label>City</label><select id="adminEditCity" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></select></div>
                <div style="flex:1;"><label>Neighborhood</label><input type="text" id="adminEditNeigh" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;" placeholder="Neighborhood..." value="${profile.location?.neighborhood || ''}"></div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 15px;">
                <div style="flex:1;"><label>Instagram</label><input type="text" id="adminEditInstagram" value="${profile.instagram || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Facebook</label><input type="text" id="adminEditFacebook" value="${profile.facebook || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
            </div>

            <label>Alias</label>
            <input type="text" id="adminEditAlias" value="${profile.alias || ''}" style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
            <label>Quality</label>
            <select id="adminEditQuality" style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                <option value="Standard" ${profile.quality === 'Standard' ? 'selected' : ''}>${t(CATEGORY_META['Standard'].name)}</option>
                <option value="Silver" ${profile.quality === 'Silver' ? 'selected' : ''}>${t(CATEGORY_META['Silver'].name)}</option>
                <option value="Gold" ${profile.quality === 'Gold' ? 'selected' : ''}>${t(CATEGORY_META['Gold'].name)}</option>
                <option value="Premium" ${profile.quality === 'Premium' ? 'selected' : ''}>${t(CATEGORY_META['Premium'].name)}</option>
                <option value="verificados" ${profile.quality === 'verificados' ? 'selected' : ''}>${t(CATEGORY_META['verificados'].name)}</option>
            </select>

            <label>Bio</label>
            <textarea id="adminEditBio" rows="6" maxlength="500" style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px; resize: vertical; box-sizing: border-box; min-height: 120px;">${profile.bio || ''}</textarea>

            <h4 style="margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 5px; color: var(--primary-gold);">${t('Profesiones')}</h4>
            <p style="font-size: 0.85rem; color: #aaa; margin-bottom: 12px;">${t('The trades you practice (e.g. Plomero, Electricista, Cerrajero). They appear on your profile so clients can find you by profession.')}</p>
            <div id="adminEditProfessions" style="display: flex; flex-wrap: wrap; gap: 8px;">
                <span style="color:#888; font-size:0.85rem;">${t('Cargando profesiones...')}</span>
            </div>

            <div style="display:flex; gap:10px;">
                <div style="flex:1;"><label>Start Time (HH:mm)</label><input type="time" id="adminEditWStart" value="${profile.workingHours?.start || '00:00'}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>End Time (HH:mm)</label><input type="time" id="adminEditWEnd" value="${profile.workingHours?.end || '23:59'}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
            </div>
            
            <label>${t('Working Days')}</label>
            <div id="adminEditWDays" style="display: flex; gap: 15px; flex-wrap: wrap; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>

            <div style="display:flex; gap:10px; margin-top: 10px;">
                <div style="flex:1;"><label>${t('Vacaciones desde')}</label><input type="date" id="adminEditVacStart" value="${profile.vacation?.startDate ? String(profile.vacation.startDate).substring(0,10) : ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>${t('Vacaciones hasta')}</label><input type="date" id="adminEditVacEnd" value="${profile.vacation?.endDate ? String(profile.vacation.endDate).substring(0,10) : ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
            </div>

            <label>Visibility / Exposure</label>
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" id="adminEditIsExposed" ${profile.isExposed !== false ? 'checked' : ''} style="width: auto;">
                <span style="font-size: 0.9rem;">Show in public directory (active)</span>
            </div>

            <label>Billing</label>
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" id="adminEditPaysMonthly" ${profile.paysMonthlyCharges !== false ? 'checked' : ''} style="width: auto;">
                <span style="font-size: 0.9rem;">Subject to Monthly Charges (Disable for free accounts)</span>
            </div>

            <h4 style="margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 5px; color: var(--primary-gold);">Presupuesto y Tiempo de Respuesta</h4>
            <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 12px;">
                <div style="flex: 1; min-width: 180px;">
                    <label for="adminEditBudgetType">¿Cobrás presupuesto?</label>
                    <select id="adminEditBudgetType" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                        <option value="sin_cargo" ${profile.budgetType !== 'con_cargo' ? 'selected' : ''}>No — Presupuesto sin cargo</option>
                        <option value="con_cargo" ${profile.budgetType === 'con_cargo' ? 'selected' : ''}>Sí — Con cargo</option>
                    </select>
                </div>
                <div id="adminEditBudgetAmountWrap" style="flex: 1; min-width: 150px; display: ${profile.budgetType === 'con_cargo' ? 'block' : 'none'};">
                    <label for="adminEditBudgetAmount">Monto del presupuesto (ARS)</label>
                    <input type="number" id="adminEditBudgetAmount" min="0" step="100" placeholder="Ej: 5000" value="${profile.budgetAmount || ''}" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                </div>
                <div style="flex: 1; min-width: 180px;">
                    <label for="adminEditResponseSpeed">Velocidad de respuesta</label>
                    <select id="adminEditResponseSpeed" style="width: 100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                        <option value="inmediata" ${profile.responseSpeed === 'inmediata' ? 'selected' : ''}>Inmediata — urgencias</option>
                        <option value="24hs" ${!profile.responseSpeed || profile.responseSpeed === '24hs' ? 'selected' : ''}>24 hs — mantenimiento</option>
                        <option value="48hs" ${profile.responseSpeed === '48hs' ? 'selected' : ''}>48 hs — reparación programada</option>
                        <option value="72hs" ${profile.responseSpeed === '72hs' ? 'selected' : ''}>72 hs — programada</option>
                    </select>
                </div>
            </div>

            ${prof.hogarProfile ? `
            <h4 style="margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 5px; color: var(--primary-gold);">Hogar Business Data</h4>
            <div style="display:flex; gap:10px; margin-bottom: 10px;">
                <div style="flex:1;"><label>Company Name</label><input type="text" id="adminEditCompanyName" value="${prof.hogarProfile.companyName || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
                <div style="flex:1;"><label>Tax ID (CUIT/DNI)</label><input type="text" id="adminEditTaxId" value="${prof.hogarProfile.taxId || ''}" style="width:100%; padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;"></div>
            </div>
            ` : ''}
            <label>Services</label>
            <div id="adminEditServices"></div>

            <label>${t('WhatsApp Number')}</label>
            ${phonePickerHtml('adminEditWa', profile.whatsappNumber, 'adminEditWhatsapp')}
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid #444;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #ccc; font-size: 0.9rem;">
                    <input type="checkbox" id="adminEditUsesWhatsApp" ${profile.usesWhatsApp !== false ? 'checked' : ''}>
                    WhatsApp
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #ccc; font-size: 0.9rem;">
                    <input type="checkbox" id="adminEditUsesTelegram" ${profile.usesTelegram ? 'checked' : ''}>
                    Telegram
                </label>
            </div>

            <div class="card fileteado-section" style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 class="gold-text" style="margin: 0;">${t('Manage Photos')}</h3>
                    <button type="button" id="adminBtnUploadPhoto" style="padding: 8px 16px; background: var(--primary-gold); color: #111; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Upload</button>
                </div>
                <p style="font-size: 0.85rem; color: #ccc; margin-bottom: 15px;">${t('Admin upload, update, remove actions. Drag photos to reorder.')} ${t('Click a photo to enlarge and review its content.')}</p>
                <input type="file" id="newPhotoInput" accept="image/png, image/jpeg, image/jpg, image/webp" multiple style="display: none;">
                    <div id="photoGrid">
                        <label class="add-photo-frame"><span>+</span></label>
                    </div>
            </div>

            <button type="submit" style="margin-top: 10px;">Save Changes</button>
        </form>
    `;

    setupLocationDropdowns('adminEditProvince', 'adminEditCity', 'adminEditNeigh', false, profile.location || {});
    initCpaAutofill({ streetId: 'adminEditStreet', numberId: 'adminEditStreetNumber', provinceId: 'adminEditProvince', cityId: 'adminEditCity', postCodeId: 'adminEditPostCode' });
    renderSpecialtyDropdown('adminEditServices', (prof.hogarProfile && prof.hogarProfile.services) || profile.services || []);
    renderProfessionsPicker('adminEditProfessions', (prof.hogarProfile && prof.hogarProfile.professions) || profile.professions || []);

    // Age auto-compute from birth date (mirrors the professional dashboard).
    const adminBirthEl = document.getElementById('adminEditBirthDate');
    const adminAgeEl = document.getElementById('adminEditAge');
    if (adminBirthEl && adminAgeEl) {
        adminBirthEl.addEventListener('change', () => {
            if (adminBirthEl.value) {
                const dob = new Date(adminBirthEl.value);
                adminAgeEl.value = Math.abs(new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970);
            } else {
                adminAgeEl.value = '';
            }
        });
    }

    // Toggle budget amount visibility (mirrors the professional dashboard).
    const adminBudgetTypeEl = document.getElementById('adminEditBudgetType');
    const adminBudgetWrap = document.getElementById('adminEditBudgetAmountWrap');
    if (adminBudgetTypeEl && adminBudgetWrap) {
        adminBudgetTypeEl.addEventListener('change', () => {
            adminBudgetWrap.style.display = adminBudgetTypeEl.value === 'con_cargo' ? 'block' : 'none';
        });
    }

    // Vacation range guard: end date cannot be before start date.
    const adminVacStart = document.getElementById('adminEditVacStart');
    const adminVacEnd = document.getElementById('adminEditVacEnd');
    if (adminVacStart && adminVacEnd) {
        const clampVacation = () => {
            if (adminVacStart.value && adminVacEnd.value && adminVacEnd.value < adminVacStart.value) {
                adminVacEnd.value = adminVacStart.value;
            }
        };
        adminVacStart.addEventListener('change', clampVacation);
        adminVacEnd.addEventListener('change', clampVacation);
    }

    initPhonePicker('adminEditMobile');
    initPhonePicker('adminEditWa');

    // Photo carousel — reuse the professional dashboard helper (addPhotoToGrid)
    // so the admin gets the exact same add / view / reorder / set-first / delete
    // behaviour. The cover/thumbnail is always the photo in the first position
    // (refreshCoverHighlight inside addPhotoToGrid marks index 0).
    const adminNewPhotoInput = document.getElementById('newPhotoInput');
    const adminBtnUploadPhoto = document.getElementById('adminBtnUploadPhoto');
    const adminPhotoGrid = document.getElementById('photoGrid');
    const adminAddFrame = adminPhotoGrid ? adminPhotoGrid.querySelector('.add-photo-frame') : null;

    if (adminNewPhotoInput && adminAddFrame) {
        // Move the hidden file input inside the "+" frame so clicking the frame
        // (a <label>) opens the picker, mirroring the professional dashboard.
        adminAddFrame.appendChild(adminNewPhotoInput);
        if (adminBtnUploadPhoto) adminBtnUploadPhoto.onclick = () => adminNewPhotoInput.click();
        adminNewPhotoInput.addEventListener('change', (e) => {
            if (!e.target.files) return;
            for (const file of e.target.files) {
                if (!file.type.startsWith('image/')) continue;
                addPhotoToGrid(file);
            }
            // Allow re-selecting the same file again later.
            e.target.value = '';
        });
    }

    // Populate the grid with the professional's CURRENT full gallery. The list
    // endpoint only returns the cover photo, so fetch the complete record.
    const seedAdminPhotos = (photos) => {
        (photos || []).forEach((url) => addPhotoToGrid(url));
    };
    if (Array.isArray(profile.photos) && profile.photos.length > 1) {
        seedAdminPhotos(profile.photos);
    } else {
        (async () => {
            try {
                const res = await fetch(`${API_URL}/admin/professionals/${prof._id}`, {
                    headers: authHeaders(),
                    credentials: 'include'
                });
                const data = await parseAdminApiResponse(res);
                if (data.success && data.data?.professionalProfile?.photos) {
                    seedAdminPhotos(data.data.professionalProfile.photos);
                } else {
                    seedAdminPhotos(profile.photos);
                }
            } catch (err) {
                seedAdminPhotos(profile.photos);
            }
        })();
    }

    renderAvailabilityDayControls(document.getElementById('adminEditWDays'), profile.workingDays);

    // Associate bare labels with their fields (a11y audit compliance).
    fixUnassociatedLabels(container);

    applyStaticTranslations(container);

    document.getElementById('adminEditProfForm').onsubmit = async (e) => {
        e.preventDefault();
        const alertEl = document.getElementById('adminEditAlert');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        
        // Gather the gallery in DOM order. Existing photos keep their stored
        // value (data-original-url = base64 data URI / URL); freshly uploaded
        // photos are blob: object URLs that we read back into base64 data URIs
        // so they persist through the JSON save. Order is preserved so reorder
        // and set-first/cover work on the backend.
        const blobUrlToDataUri = (url) => fetch(url)
            .then((r) => r.blob())
            .then((blob) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }));

        const photoImgs = Array.from(document.querySelectorAll('#photoGrid .photo-item img'));
        const remainingPhotos = [];
        for (const img of photoImgs) {
            const original = img.getAttribute('data-original-url');
            if (original && !original.startsWith('blob:')) {
                remainingPhotos.push(original);
            } else if (img.src.startsWith('blob:')) {
                try {
                    remainingPhotos.push(await blobUrlToDataUri(img.src));
                } catch (err) {
                    /* skip an unreadable upload rather than abort the whole save */
                }
            } else if (img.src) {
                remainingPhotos.push(img.src);
            }
        }

        const adminMobPhone = buildFullPhoneNumber(
            document.getElementById('adminEditMobileDial')?.value || '+54',
            document.getElementById('adminEditMobilePhone')?.value || ''
        );
        const adminWaPhone = buildFullPhoneNumber(
            document.getElementById('adminEditWaDial')?.value || '+54',
            document.getElementById('adminEditWhatsapp')?.value || ''
        );

        // Profesiones con su estado de matriculacion. collectProfessions lee los
        // checkbox "Soy matriculado en X" del mismo picker que usa el panel del
        // profesional; antes el admin mandaba solo {slug,name} y el backend heredaba
        // el valor guardado, asi que la matriculacion no se podia editar aca.
        // Undefined = taxonomia inalcanzable, no tocar las profesiones guardadas.
        let adminProfessions;
        try {
            const picked = collectProfessions('adminEditProfessions');
            if (!document.getElementById('adminEditProfessions')) {
                adminProfessions = undefined;
            } else {
                const taxRes = await fetch(`${API_URL}/professions`, { headers: authHeaders(), credentials: 'include' });
                const taxData = await taxRes.json().catch(() => ({}));
                const nameBySlug = new Map();
                if (taxData && Array.isArray(taxData.data)) taxData.data.forEach(p => { if (p && p.slug) nameBySlug.set(String(p.slug).toLowerCase(), p.name || p.slug); });
                adminProfessions = picked.map(p => ({
                    slug: p.slug,
                    name: nameBySlug.get(String(p.slug).toLowerCase()) || p.slug,
                    matriculado: !!p.matriculado,
                    matriculaNumero: p.matriculaNumero || ''
                }));
            }
        } catch (err) { adminProfessions = undefined; }

        const payload = {
            email: document.getElementById('adminEditEmail').value,
            verificationStatus: document.getElementById('adminEditStatus').value,
            ...(prof.hogarProfile ? {
                hogarProfile: {
                    companyName: document.getElementById('adminEditCompanyName')?.value || '',
                    taxId: document.getElementById('adminEditTaxId')?.value || '',
                    services: collectTreeServices('adminEditServices'),
                    ...(adminProfessions !== undefined ? { professions: adminProfessions } : {})
                }
            } : {}),
            professionalProfile: {
                    firstName: document.getElementById('adminEditFirstName').value,
                    surname: document.getElementById('adminEditLastName').value,
                    middleName: document.getElementById('adminEditMiddleName')?.value || '',
                    idNumber: document.getElementById('adminEditIdNumber').value,
                    birthDate: document.getElementById('adminEditBirthDate').value ? new Date(document.getElementById('adminEditBirthDate').value).toISOString() : undefined,
                    age: document.getElementById('adminEditBirthDate').value ? Math.abs(new Date(Date.now() - new Date(document.getElementById('adminEditBirthDate').value).getTime()).getUTCFullYear() - 1970) : undefined,
                    mobilePhone: adminMobPhone,
                    instagram: document.getElementById('adminEditInstagram')?.value || '',
                    facebook: document.getElementById('adminEditFacebook')?.value || '',
                    usesWhatsApp: document.getElementById('adminEditUsesWhatsApp')?.checked || false,
                    usesTelegram: document.getElementById('adminEditUsesTelegram')?.checked || false,
                alias: document.getElementById('adminEditAlias').value,
                quality: document.getElementById('adminEditQuality').value,
                bio: document.getElementById('adminEditBio').value,
                services: (()=>{ const el=document.getElementById('adminEditServices'); if(el.tagName==='SELECT') return Array.from(el.selectedOptions).map(opt=>opt.value); const cbs=el.querySelectorAll('.dashboard-specialty-cb:checked'); if(cbs.length) return Array.from(cbs).filter(cb=>!cb.value.endsWith('.__todas__')).map(cb=>cb.value); return (el.value||'').split(',').map(s=>s.trim()).filter(Boolean); })(),
                whatsappNumber: adminWaPhone || adminMobPhone,
                workingHours: {
                    start: document.getElementById('adminEditWStart').value,
                    end: document.getElementById('adminEditWEnd').value
                },
                workingDays: Array.from(document.querySelectorAll('#adminEditWDays .avail-day-cb:checked')).map(cb => cb.value),
                isExposed: document.getElementById('adminEditIsExposed').checked,
                paysMonthlyCharges: document.getElementById('adminEditPaysMonthly').checked,
                budgetType: document.getElementById('adminEditBudgetType')?.value || 'sin_cargo',
                budgetAmount: (() => { const v = document.getElementById('adminEditBudgetAmount')?.value; return (v === '' || v == null) ? undefined : Number(v); })(),
                responseSpeed: document.getElementById('adminEditResponseSpeed')?.value || '24hs',
                vacation: (() => {
                    const s = document.getElementById('adminEditVacStart')?.value || '';
                    const e = document.getElementById('adminEditVacEnd')?.value || '';
                    const out = {};
                    if (s) out.startDate = new Date(s).toISOString();
                    if (e) out.endDate = new Date(e).toISOString();
                    return out;
                })(),
                ...(adminProfessions !== undefined ? { professions: adminProfessions } : {}),
                location: {
                    province: document.getElementById('adminEditProvince')?.value || '',
                    city: (document.getElementById('adminEditProvince')?.value || '').trim().toLowerCase() === 'caba' ? '' : (document.getElementById('adminEditCity')?.value || ''),
                    neighborhood: (document.getElementById('adminEditProvince')?.value || '').trim().toLowerCase() === 'caba' ? (document.getElementById('adminEditCity')?.value || '') : (document.getElementById('adminEditNeigh')?.value || ''),
                        street: document.getElementById('adminEditStreet')?.value || '',
                        number: document.getElementById('adminEditStreetNumber')?.value || '',
                        floor: document.getElementById('adminEditFloor')?.value || '',
                        apartment: document.getElementById('adminEditApartment')?.value || '',
                        postalCode: document.getElementById('adminEditPostCode')?.value || ''
                },
                photos: remainingPhotos
            }
        };

        try {
            const token = localStorage.getItem('token');
            // Added credentials: 'include' to ensure auth cookie is sent
            const res = await fetch(`${API_URL}/admin/professionals/${prof._id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    ...authHeaders()
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await parseAdminApiResponse(res);

            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';

            if (data.success) {
                showAlert(alertEl, 'Profile updated successfully!', false);
                setTimeout(() => {
                    closeAdminEditModalToDashboard();
                }, 1500);
            } else {
                showAlert(alertEl, data.error || 'Update failed');
            }
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
            showAlert(alertEl, adminConnectionErrorMessage(err));
        }
    };
}

// --- Admin Edit Pricing Modal ---
export async function openEditPricingModal(currentPricing) {
    let modal = document.getElementById('editPricingModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editPricingModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '600px',
            label: '← ' + t('Back to Dashboard'),
            onClick: () => closeAdminOverlay(modal)
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '600px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 20px;">${t('Change prices')}</h2>
            <p style="font-size: 0.9rem; margin-bottom: 20px; color: #aaa;">${t('Updating prices will email every professional in that category about the new monthly charge starting next month.')}</p>
            <form id="editPricingForm" style="display: flex; flex-direction: column; gap: 15px;">
                <div id="editPricingAlert" class="alert hidden" style="padding: 10px; border-radius: 4px; border: 1px solid transparent;"></div>
                
                <label>⭐ Experto (ARS)</label>
                <input type="number" id="priceverificados" required style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">

                <label>✨ Maestro (ARS)</label>
                <input type="number" id="pricePremium" required style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">

                <label>🟡 Profesional (ARS)</label>
                <input type="number" id="priceGold" required style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">

                <label>⚪ Técnico (ARS)</label>
                <input type="number" id="priceSilver" required style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">

                <label>🟤 Inicial (ARS)</label>
                <input type="number" id="priceStandard" required style="padding: 8px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">

                <button type="submit" style="margin-top: 10px; padding: 10px; background: var(--primary-gold); color: var(--dark-bg); font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Save Pricing</button>
            </form>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);
        fixUnassociatedLabels(modal);

        document.getElementById('editPricingForm').onsubmit = async (e) => {
            e.preventDefault();
            const alertEl = document.getElementById('editPricingAlert');
            const submitBtn = e.target.querySelector('button[type="submit"]');
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            const newPricing = {
                verificados: parseInt(document.getElementById('priceverificados').value, 10),
                Premium: parseInt(document.getElementById('pricePremium').value, 10),
                Gold: parseInt(document.getElementById('priceGold').value, 10),
                Silver: parseInt(document.getElementById('priceSilver').value, 10),
                Standard: parseInt(document.getElementById('priceStandard').value, 10)
            };

            const formData = new FormData();
            formData.append('adminPricing', JSON.stringify(newPricing));

            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/professionals/updateprofile`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    credentials: 'include',
                    body: formData
                });
                const data = await parseAdminApiResponse(res);

                if (data.success) {
                    showAlert(alertEl, t('Pricing updated successfully!'), false);
                    try {
                        await fetch(`${API_URL}/admin/notify-rate-change`, {
                            method: 'POST',
                            headers: authHeaders(),
                            credentials: 'include'
                        });
                    } catch (e) { console.warn('Rate change emails:', e); }
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showAlert(alertEl, data.error || 'Failed to update pricing');
                }
            } catch (err) {
                showAlert(alertEl, adminConnectionErrorMessage(err));
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Pricing';
            }
        };
    }

    document.getElementById('priceverificados').value = currentPricing.verificados || 50000;
    document.getElementById('pricePremium').value = currentPricing.Premium || 40000;
    document.getElementById('priceGold').value = currentPricing.Gold || 30000;
    document.getElementById('priceSilver').value = currentPricing.Silver || 20000;
    document.getElementById('priceStandard').value = currentPricing.Standard || 15000;

    openAdminOverlay(modal);
}

function formatLaunchCurtainStatusLine(status) {
    if (!status) return '';
    if (!status.enabled) {
        return t('Launch curtain is off — treasure grids are visible to visitors.');
    }
    if (status.hasOpened) {
        return t('Grand opening date has passed — grids stay visible even with the curtain enabled.');
    }
    const days = status.daysRemaining ?? 0;
    const hours = status.hoursRemaining ?? 0;
    const openingDate = formatOpeningDateTime(status.openingAtLocal || status.openingAt, { withTime: false });
    return t('Launch curtain is on — grids hidden until {date} ({days}d {hours}h remaining).')
        .replace('{date}', openingDate)
        .replace('{days}', String(days))
        .replace('{hours}', String(hours));
}

function syncLaunchCurtainToggles(enabled) {
    const quick = document.getElementById('adminLaunchCurtainQuickToggle');
    const config = document.getElementById('launchCurtainConfigToggle');
    if (quick) quick.checked = Boolean(enabled);
    if (config) config.checked = Boolean(enabled);
}

// The launch curtain is defined in Argentina time (America/Argentina/Buenos_Aires,
// fixed UTC-03:00 year round). The <input type="datetime-local"> has no timezone,
// so we explicitly map between the AR wall-clock value shown to the admin and the
// stored ISO string with the -03:00 offset.
const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC minus 3 hours

function pad2(n) {
    return String(n).padStart(2, '0');
}

// Stored ISO (any offset) -> "YYYY-MM-DDTHH:MM" expressing the AR wall-clock time.
function arIsoToLocalDatetimeValue(iso) {
    if (!iso) return '';
    const instant = new Date(iso);
    if (Number.isNaN(instant.getTime())) return '';
    const ar = new Date(instant.getTime() - AR_OFFSET_MS);
    return `${ar.getUTCFullYear()}-${pad2(ar.getUTCMonth() + 1)}-${pad2(ar.getUTCDate())}` +
        `T${pad2(ar.getUTCHours())}:${pad2(ar.getUTCMinutes())}`;
}

// datetime-local value ("YYYY-MM-DDTHH:MM"[:SS]) interpreted as AR wall-clock ->
// ISO string with the -03:00 offset.
function localDatetimeValueToArIso(value) {
    if (!value || typeof value !== 'string') return null;
    const [datePart, timePart] = value.split('T');
    if (!datePart || !timePart) return null;
    const [hh = '00', mm = '00', ss = '00'] = timePart.split(':');
    return `${datePart}T${pad2(parseInt(hh, 10))}:${pad2(parseInt(mm, 10))}:${pad2(parseInt(ss, 10))}-03:00`;
}

function syncLaunchCurtainOpeningInput(status) {
    const input = document.getElementById('launchCurtainOpeningAt');
    if (!input || !status) return;
    input.value = arIsoToLocalDatetimeValue(status.openingAtLocal || status.openingAt);
}

async function handleLaunchCurtainOpeningSave() {
    const input = document.getElementById('launchCurtainOpeningAt');
    const btn = document.getElementById('launchCurtainSaveOpeningBtn');
    const alertEl = document.getElementById('launchCurtainAlert');
    if (!input) return;

    const iso = localDatetimeValueToArIso(input.value);
    if (!iso) {
        if (alertEl) showAlert(alertEl, t('Enter an opening date and time'));
        else announceMessage(t('Enter an opening date and time'));
        return;
    }

    if (btn) btn.disabled = true;
    try {
        const status = await saveLaunchCurtainOpeningAt(iso);
        syncLaunchCurtainToggles(status.enabled);
        syncLaunchCurtainOpeningInput(status);
        const statusLine = document.getElementById('launchCurtainStatusLine');
        if (statusLine) statusLine.textContent = formatLaunchCurtainStatusLine(status);
        if (alertEl) showAlert(alertEl, t('Opening date & time updated.'), false);
        else announceMessage(t('Opening date & time updated.'));
    } catch (err) {
        if (alertEl) showAlert(alertEl, err.message || t('Could not update launch curtain'));
        else announceMessage(err.message || t('Could not update launch curtain'));
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function handleLaunchCurtainToggle(enabled, sourceEl) {
    const toggles = [
        document.getElementById('adminLaunchCurtainQuickToggle'),
        document.getElementById('launchCurtainConfigToggle')
    ].filter(Boolean);

    toggles.forEach((el) => { el.disabled = true; });

    try {
        const status = await saveLaunchCurtainEnabled(enabled);
        syncLaunchCurtainToggles(status.enabled);
        const statusLine = document.getElementById('launchCurtainStatusLine');
        if (statusLine) statusLine.textContent = formatLaunchCurtainStatusLine(status);
        announceMessage(status.enabled
            ? t('Launch curtain enabled — visitor grids are now hidden.')
            : t('Launch curtain disabled — visitor grids are visible.'));
    } catch (err) {
        if (sourceEl) sourceEl.checked = !enabled;
        const alertEl = document.getElementById('launchCurtainAlert') || document.getElementById('waConfigAlert');
        if (alertEl) showAlert(alertEl, err.message || t('Could not update launch curtain'));
        else announceMessage(err.message || t('Could not update launch curtain'));
    } finally {
        toggles.forEach((el) => { el.disabled = false; });
    }
}

function wireLaunchCurtainToggle(input) {
    if (!input || input.dataset.launchCurtainWired === '1') return;
    input.dataset.launchCurtainWired = '1';
    input.addEventListener('change', () => {
        handleLaunchCurtainToggle(input.checked, input);
    });
}

async function initLaunchCurtainQuickToggle() {
    const quick = document.getElementById('adminLaunchCurtainQuickToggle');
    if (!quick) return;

    wireLaunchCurtainToggle(quick);

    try {
        const status = await loadLaunchCurtainAdminState();
        syncLaunchCurtainToggles(status.enabled);
    } catch {
        // keep default unchecked
    }
}

async function loadLaunchCurtainConfigPanel() {
    const statusLine = document.getElementById('launchCurtainStatusLine');
    const configToggle = document.getElementById('launchCurtainConfigToggle');
    if (!statusLine && !configToggle) return;

    try {
        const status = await loadLaunchCurtainAdminState();
        syncLaunchCurtainToggles(status.enabled);
        syncLaunchCurtainOpeningInput(status);
        if (statusLine) statusLine.textContent = formatLaunchCurtainStatusLine(status);
    } catch {
        if (statusLine) statusLine.textContent = t('Could not load launch curtain settings');
    }
}

let waConfigPollTimer = null;
let waDripPollTimer = null;
let waInboundPollTimer = null;

function renderWhatsAppDripStatus(data) {
    if (!data) return;
    const textEl = document.getElementById('waDripStatusText');
    const startBtn = document.getElementById('waDripStartBtn');
    const stopBtn = document.getElementById('waDripStopBtn');
    if (!textEl) return;

    const connected = data.clientReady;
    const running = data.running;

    const lines = [];
    if (running) {
        lines.push(`<span style="color:#25D366;font-weight:bold;">${t('Running')}</span>`);
    } else if (!connected) {
        lines.push(`<span style="color:#cc6666;">${t('WhatsApp not connected — link it above first')}</span>`);
    } else {
        lines.push(`<span style="color:#888;">${t('Stopped')}</span>`);
    }

    const pending = data.pending != null ? data.pending : '—';
    lines.push(`${t('Pending leads')}: ${pending}`);
    lines.push(`${t('Sent')}: ${data.sent || 0} · ${t('Failed')}: ${data.failed || 0} · ${t('Rejected')}: ${data.rejected || 0}`);

    if (running && data.nextSendAt) {
        const nextLabel = data.phase === 'waiting_batch'
            ? t('Next batch')
            : t('Next send');
        lines.push(`${nextLabel}: ${new Date(data.nextSendAt).toLocaleTimeString()}`);
    }
    if (running && data.batchSentThisCycle != null && data.phase === 'running') {
        const batchSize = data.batchSize || 50;
        const batchNum = (data.batchesCompletedThisRun || 0) + 1;
        const batchesPerDay = data.batchesPerDay || 5;
        lines.push(`${t('Current batch')}: ${batchNum}/${batchesPerDay} (${data.batchSentThisCycle}/${batchSize})`);
    }
    if (!running && data.phase === 'daily_limit') {
        lines.push(`<span style="color:#f0ad4e;">${t('Daily cold cap reached')} (${data.dailyCap || 250}). ${t('Restart tomorrow.')}</span>`);
    }
    if (data.lastSendAt && data.lastResult) {
        lines.push(`${t('Last')}: ${new Date(data.lastSendAt).toLocaleTimeString()} — ${data.lastResult}`);
    }

    textEl.innerHTML = lines.join('<br>');

    if (startBtn) startBtn.disabled = !connected || running;
    if (stopBtn) stopBtn.disabled = !running;
}

async function pollWhatsAppDripStatus() {
    try {
        const res = await fetch(`${API_URL}/admin/whatsapp/drip/status`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) renderWhatsAppDripStatus(data.data);
    } catch (err) {
        console.error('WhatsApp drip poll failed', err);
    }
}

function ensureWhatsAppDripPolling() {
    if (waDripPollTimer) clearInterval(waDripPollTimer);
    waDripPollTimer = setInterval(pollWhatsAppDripStatus, 3000);
    pollWhatsAppDripStatus();
}

async function startWhatsAppDrip() {
    const alertEl = document.getElementById('waConfigAlert');
    const btn = document.getElementById('waDripStartBtn');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/admin/whatsapp/drip/start`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            showAlert(alertEl, data.error || t('Could not start automatic sending'));
        } else {
            showAlert(alertEl, t('Automatic sending started.'), false);
        }
        if (data.data) renderWhatsAppDripStatus(data.data);
    } catch (err) {
        showAlert(alertEl, adminConnectionErrorMessage(err));
    } finally {
        ensureWhatsAppDripPolling();
    }
}

async function stopWhatsAppDrip() {
    const alertEl = document.getElementById('waConfigAlert');
    const btn = document.getElementById('waDripStopBtn');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/admin/whatsapp/drip/stop`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            showAlert(alertEl, data.error || t('Could not stop automatic sending'));
        } else {
            showAlert(alertEl, t('Automatic sending stopped.'), false);
        }
        if (data.data) renderWhatsAppDripStatus(data.data);
    } catch (err) {
        showAlert(alertEl, adminConnectionErrorMessage(err));
    } finally {
        ensureWhatsAppDripPolling();
    }
}

function syncWhatsAppPhoneEditor(data) {
    const phoneInput = document.getElementById('waConfigPhoneInput');
    const saveBtn = document.getElementById('waConfigSavePhoneBtn');
    const twilioNote = document.getElementById('waConfigTwilioNote');
    const twilioEnvDefault = Boolean(data && data.twilioEnvDefault);

    if (twilioNote) {
        twilioNote.classList.toggle('hidden', !twilioEnvDefault || data.phoneSource === 'admin');
    }

    if (phoneInput) {
        phoneInput.disabled = false;
        if (data && data.phoneNumber) phoneInput.value = data.phoneNumber;
    }
    if (saveBtn) saveBtn.disabled = false;
}

function syncWhatsAppColdOutreachGate(data) {
    if (!data) data = {};
    const note = document.getElementById('waTemplatePendingNote');
    const startBtn = document.getElementById('waDripStartBtn');
    const blocked = Boolean(data.coldOutreachBlocked);

    if (note) {
        note.classList.toggle('hidden', !blocked);
        if (blocked && data.coldOutreachBlockReason) {
            note.textContent = data.coldOutreachBlockReason;
        }
    }
    if (startBtn) startBtn.disabled = blocked;
}

function renderWhatsAppConfigStatus(data) {
    if (!data) data = {};
    const statusEl = document.getElementById('waConfigStatusText');
    const qrWrap = document.getElementById('waConfigQrWrap');
    const qrImg = document.getElementById('waConfigQrImg');
    const phoneDisplay = document.getElementById('waConfigCurrentPhone');
    const sessionEl = document.getElementById('waConfigSessionState');
    const registerBtn = document.getElementById('waConfigRegisterBtn');
    const webJsSection = document.getElementById('waConfigWebJsSection');
    const twilioApi = Boolean(data.twilioApi);

    if (webJsSection) webJsSection.style.display = twilioApi ? 'none' : 'block';

    if (phoneDisplay) {
        phoneDisplay.textContent = data.displayPhone || data.phoneNumber || '+5491178280156';
        phoneDisplay.title = data.phoneSource === 'admin'
            ? t('Configured in admin panel')
            : (data.twilioEnvDefault ? t('Default from Twilio .env until you save a number here') : '');
    }

    syncWhatsAppPhoneEditor(data);

    if (sessionEl) {
        if (twilioApi && data.connected) {
            sessionEl.textContent = t('Connected via Twilio WhatsApp API');
            sessionEl.style.color = '#25D366';
        } else if (data.connected) {
            sessionEl.textContent = t('Connected');
            sessionEl.style.color = '#25D366';
        } else if (data.sessionSaved) {
            sessionEl.textContent = t('Session saved — reconnect if sending fails');
            sessionEl.style.color = '#f0ad4e';
        } else if (twilioApi && data.lastError) {
            sessionEl.textContent = data.lastError;
            sessionEl.style.color = '#cc6666';
        } else {
            sessionEl.textContent = t('Not registered');
            sessionEl.style.color = '#cc6666';
        }
    }

    const phaseLabels = {
        idle: twilioApi ? t('Twilio WhatsApp ready when sender is configured') : t('Ready to register'),
        initializing: t('Connecting to WhatsApp...'),
        qr: t('Scan QR with WhatsApp on your phone'),
        ready: twilioApi ? t('Twilio WhatsApp API active') : t('WhatsApp linked successfully'),
        error: data.lastError || t('Registration failed')
    };

    if (statusEl) {
        statusEl.textContent = phaseLabels[data.phase] || data.phase || '—';
    }

    if (!twilioApi && data.phase === 'qr' && data.qr && qrWrap && qrImg) {
        qrWrap.classList.remove('hidden');
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data.qr)}`;
    } else if (qrWrap) {
        qrWrap.classList.add('hidden');
    }

    if (registerBtn) {
        registerBtn.disabled = false;
        if (twilioApi) {
            registerBtn.textContent = data.connected
                ? t('Twilio WhatsApp active')
                : t('Verify Twilio WhatsApp');
        } else if (data.connected) {
            registerBtn.textContent = t('WhatsApp linked');
        } else {
            registerBtn.textContent = t('Register number on WhatsApp');
        }
    }

    const twilioApiNote = document.getElementById('waConfigTwilioApiNote');
    if (twilioApiNote) twilioApiNote.classList.toggle('hidden', !twilioApi);

    syncWhatsAppColdOutreachGate(data);

    if (!twilioApi && (data.phase === 'ready' || data.phase === 'error')) {
        if (waConfigPollTimer) {
            clearInterval(waConfigPollTimer);
            waConfigPollTimer = null;
        }
        if (registerBtn && data.phase === 'ready') {
            registerBtn.disabled = false;
            registerBtn.textContent = t('Re-link WhatsApp');
        } else if (registerBtn && data.phase === 'error') {
            registerBtn.disabled = false;
            registerBtn.textContent = t('Register number on WhatsApp');
        }
    }
}

async function pollWhatsAppConfigStatus() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/whatsapp/register/status`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (data.success) renderWhatsAppConfigStatus(data.data);
    } catch (err) {
        console.error('WhatsApp config poll failed', err);
    }
}

async function maybeWarnWhatsAppDisconnected() {
    try {
        if (sessionStorage.getItem('waDisconnectWarnShown')) return;
    } catch (_) {
        return;
    }

    let body;
    try {
        const res = await fetch(`${API_URL}/admin/whatsapp/register/status`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        if (!res.ok) return;
        body = await parseAdminApiResponse(res);
    } catch (_) {
        return;
    }

    if (!body || !body.success || !body.data || body.data.connected !== false) return;

    try {
        sessionStorage.setItem('waDisconnectWarnShown', '1');
    } catch (_) { /* ignore */ }

    showWhatsAppDisconnectedWarning();
}

function showWhatsAppDisconnectedWarning() {
    if (document.getElementById('waDisconnectWarnModal')) return;

    const modal = document.createElement('div');
    modal.id = 'waDisconnectWarnModal';
    modal.className = 'payment-modal-overlay';
    Object.assign(modal.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.85)', zIndex: '4000', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '20px'
    });

    const titleId = 'waDisconnectWarnTitle';
    const card = document.createElement('div');
    card.className = 'card';
    Object.assign(card.style, {
        maxWidth: '440px', width: '100%', border: '1px solid var(--primary-gold)',
        padding: '28px', textAlign: 'center'
    });
    card.innerHTML = `
        <h3 id="${titleId}" class="gold-text" style="margin-bottom: 16px; font-size: 1.4rem;">${t('WhatsApp disconnected')}</h3>
        <p style="color: #ddd; margin-bottom: 24px; line-height: 1.5;">${t('The platform WhatsApp (Tulio) is currently disconnected. Outreach and notifications will not be sent until you re-link it from Config → WhatsApp.')}</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
            <button id="waDisconnectWarnConfig" style="width: auto; padding: 10px 20px; background: var(--primary-gold); color: var(--dark-bg);">${t('Go to WhatsApp settings')}</button>
            <button id="waDisconnectWarnOk" style="width: auto; padding: 10px 20px; background: transparent; color: var(--primary-gold); border: 1px solid var(--primary-gold);">${t('Understood')}</button>
        </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    const close = () => {
        deactivateAccessibleModal(modal);
        modal.remove();
        document.body.style.overflow = '';
    };

    card.querySelector('#waDisconnectWarnOk').addEventListener('click', close);
    card.querySelector('#waDisconnectWarnConfig').addEventListener('click', () => {
        close();
        openDashboardConfigModal();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    document.body.style.overflow = 'hidden';
    activateAccessibleModal(modal, {
        labelId: titleId,
        onClose: close,
        initialFocusSelector: '#waDisconnectWarnOk'
    });
}

async function loadWhatsAppInboundReplies() {
    const listEl = document.getElementById('waInboundList');
    const metaEl = document.getElementById('waInboundMeta');
    const webhookEl = document.getElementById('waInboundWebhookUrl');
    if (!listEl) return;

    try {
        const res = await fetch(`${API_URL}/admin/whatsapp/inbound?limit=50`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            listEl.innerHTML = `<p style="color:#cc6666;">${data.error || t('Could not load replies')}</p>`;
            return;
        }

        if (webhookEl && data.data.webhookUrl) {
            webhookEl.textContent = data.data.webhookUrl;
        }

        const messages = data.data.messages || [];
        if (metaEl) {
            metaEl.textContent = messages.length
                ? `${messages.length} ${t('recent replies')}`
                : t('No replies yet — configure the Twilio webhook URL below.');
        }

        if (!messages.length) {
            listEl.innerHTML = `<p style="color:#888;font-size:0.9rem;">${t('When someone answers your WhatsApp invite, their message will appear here.')}</p>`;
            return;
        }

        listEl.innerHTML = messages.map((msg) => {
            const when = msg.at ? new Date(msg.at).toLocaleString() : '—';
            const isOutbound = msg.direction === 'outbound';

            if (isOutbound) {
                const body = escapeHtml(msg.body || '').replace(/\n/g, '<br>');
                return `<div style="padding:12px;margin-bottom:10px;background:#0a1a12;border:1px solid #1a4030;border-radius:6px;margin-left:24px;">
                    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
                        <strong style="color:#25D366;">${t('You')} → +${escapeHtml(msg.toPhone || msg.phone || '')}</strong>
                        <span style="color:#666;font-size:0.8rem;">${when}</span>
                    </div>
                    <div style="color:#ddd;font-size:0.95rem;line-height:1.5;">${body || '—'}</div>
                </div>`;
            }

            const who = msg.fromName
                ? `${escapeHtml(msg.fromName)} <span style="color:#888;">(+${escapeHtml(msg.fromPhone)})</span>`
                : `+${escapeHtml(msg.fromPhone)}`;
            const leadAlias = msg.lead && msg.lead.alias ? escapeHtml(msg.lead.alias) : '';
            const lead = msg.lead && msg.lead.alias
                ? `<div style="color:#888;font-size:0.8rem;margin-top:4px;">${t('Lead')}: ${leadAlias} (${escapeHtml(msg.lead.status || '')})</div>`
                : '';
            const body = escapeHtml(msg.body || '').replace(/\n/g, '<br>');
            const replyId = escapeHtml(msg.id);
            const replyPhone = escapeHtml(msg.fromPhone);
            return `<div class="wa-inbound-card" data-inbound-id="${replyId}" data-phone="${replyPhone}" data-alias="${leadAlias}" style="padding:12px;margin-bottom:10px;background:#111;border:1px solid #333;border-radius:6px;">
                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
                    <strong style="color:var(--primary-gold);">${who}</strong>
                    <span style="color:#666;font-size:0.8rem;">${when}</span>
                </div>
                <div style="color:#ddd;font-size:0.95rem;line-height:1.5;margin-bottom:10px;">${body || '—'}</div>
                ${lead}
                <textarea class="wa-reply-input" rows="3" placeholder="${t('Write your reply…')}" style="width:100%;margin-top:10px;padding:10px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;resize:vertical;"></textarea>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                    <button type="button" class="wa-reply-send-btn" style="padding:8px 14px;background:#25D366;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Send reply')}</button>
                    <button type="button" class="wa-reply-step2-btn" style="padding:8px 14px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;">${t('Send launch message')}</button>
                    <button type="button" class="wa-reply-step2link-btn" style="padding:8px 14px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;">${t('Send registration link')}</button>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        if (listEl) listEl.innerHTML = `<p style="color:#cc6666;">${escapeHtml(adminConnectionErrorMessage(err))}</p>`;
    }
}

function ensureWhatsAppInboundPolling() {
    if (waInboundPollTimer) clearInterval(waInboundPollTimer);
    waInboundPollTimer = setInterval(loadWhatsAppInboundReplies, 10000);
}

function stopWhatsAppInboundPolling() {
    if (waInboundPollTimer) {
        clearInterval(waInboundPollTimer);
        waInboundPollTimer = null;
    }
}

async function sendWhatsAppManualReply(cardEl, { template } = {}) {
    const alertEl = document.getElementById('waConfigAlert');
    if (!cardEl) return;

    const phone = cardEl.dataset.phone;
    const alias = cardEl.dataset.alias || '';
    const inboundId = cardEl.dataset.inboundId || '';
    const input = cardEl.querySelector('.wa-reply-input');
    const body = input ? input.value.trim() : '';

    if (template !== 'step2' && template !== 'step2link' && !body) {
        showAlert(alertEl, t('Write a reply first'));
        return;
    }

    const sendBtn = cardEl.querySelector('.wa-reply-send-btn');
    const step2Btn = cardEl.querySelector('.wa-reply-step2-btn');
    const step2LinkBtn = cardEl.querySelector('.wa-reply-step2link-btn');
    if (sendBtn) sendBtn.disabled = true;
    if (step2Btn) step2Btn.disabled = true;
    if (step2LinkBtn) step2LinkBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/admin/whatsapp/reply`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                toPhone: phone,
                body: (template === 'step2' || template === 'step2link') ? '' : body,
                template: template === 'step2' || template === 'step2link' ? template : undefined,
                alias,
                inboundId
            })
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            showAlert(alertEl, data.error || t('Could not send reply'));
            return;
        }
        if (input && template !== 'step2' && template !== 'step2link') input.value = '';
        showAlert(alertEl, t('WhatsApp reply sent.'), false);
        await loadWhatsAppInboundReplies();
    } catch (err) {
        showAlert(alertEl, adminConnectionErrorMessage(err));
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (step2Btn) step2Btn.disabled = false;
        if (step2LinkBtn) step2LinkBtn.disabled = false;
    }
}

function bindWhatsAppInboundReplyHandlers() {
    const listEl = document.getElementById('waInboundList');
    if (!listEl || listEl.dataset.replyBound === '1') return;
    listEl.dataset.replyBound = '1';
    listEl.addEventListener('click', (event) => {
        const sendBtn = event.target.closest('.wa-reply-send-btn');
        const step2Btn = event.target.closest('.wa-reply-step2-btn');
        const step2LinkBtn = event.target.closest('.wa-reply-step2link-btn');
        const card = event.target.closest('.wa-inbound-card');
        if (!card) return;
        if (sendBtn) sendWhatsAppManualReply(card);
        if (step2Btn) sendWhatsAppManualReply(card, { template: 'step2' });
        if (step2LinkBtn) sendWhatsAppManualReply(card, { template: 'step2link' });
    });
}

async function loadWhatsAppConfigPanel() {
    const alertEl = document.getElementById('waConfigAlert');
    const phoneInput = document.getElementById('waConfigPhoneInput');

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/whatsapp/config`, {
            headers: authHeaders(),
            credentials: 'include'
        });
        const data = await parseAdminApiResponse(res);
        if (!data.success) {
            showAlert(alertEl, data.error || t('Could not load WhatsApp configuration'));
            return;
        }

        if (phoneInput) phoneInput.value = data.data.phoneNumber || '';
        renderWhatsAppConfigStatus(data.data);

        // Keep the in-app drip status live while the panel is open.
        ensureWhatsAppDripPolling();
        await loadWhatsAppInboundReplies();
        ensureWhatsAppInboundPolling();
        bindWhatsAppInboundReplyHandlers();

        // Keep status/QR live while the panel is open and not yet linked, so a
        // background reconnect that is mid-flight (or a periodically-refreshing QR)
        // is reflected instead of a one-shot stale snapshot. renderWhatsAppConfigStatus
        // clears this timer once it reaches 'ready' or 'error'.
        if (!data.data.connected) {
            if (waConfigPollTimer) clearInterval(waConfigPollTimer);
            waConfigPollTimer = setInterval(pollWhatsAppConfigStatus, 2500);
        }
    } catch (err) {
        showAlert(alertEl, adminConnectionErrorMessage(err));
    }
}

function setSecDevicesAlert(message, isError) {
    const alertEl = document.getElementById('secDevicesAlert');
    if (!alertEl) return;
    alertEl.textContent = message || '';
    alertEl.style.display = message ? 'block' : 'none';
    alertEl.style.background = isError ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
    alertEl.style.borderColor = isError ? '#ef4444' : '#22c55e';
    alertEl.style.color = isError ? '#ffb3b3' : '#a5f3c8';
}

function renderAdminDevicesPanel(data) {
    const list = document.getElementById('secDevicesList');
    if (!list) return;
    const gate = data.enabled === true;
    const devices = Array.isArray(data.devices) ? data.devices : [];

    const gateToggle = document.getElementById('secDevicesGateToggle');
    if (gateToggle) gateToggle.checked = gate;
    const gateLabel = document.getElementById('secDevicesGateLabel');
    if (gateLabel) gateLabel.textContent = gate ? 'Requiere dispositivo autorizado (activo)' : 'Requiere dispositivo autorizado (inactivo)';
    const currentId = document.getElementById('secDevicesCurrentId');
    if (currentId) currentId.textContent = getDeviceId();

    if (devices.length === 0) {
        list.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Sin dispositivos registrados todavía.</p>';
        return;
    }

    list.innerHTML = devices.map((d, i) => `
        <div style="border:1px solid #333;border-radius:6px;padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,0.03);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
            <div style="flex:1;min-width:180px;">
                <div style="color:#eee;font-weight:600;font-size:0.92rem;">${d.label || 'Dispositivo sin nombre'}${String(getDeviceId()).toLowerCase() === String(d.deviceId).toLowerCase() ? ' <span style="color:var(--primary-gold);font-size:0.75rem;">(este dispositivo)</span>' : ''}</div>
                <div style="color:#777;font-size:0.75rem;word-break:break-all;margin-top:2px;">id: ${d.deviceId}</div>
                <div style="color:#666;font-size:0.75rem;margin-top:2px;">${d.lastSeenAt ? 'Último acceso: ' + new Date(d.lastSeenAt).toLocaleString() : 'Sin accesos registrados'}${d.ipAddress ? ' · IP: ' + d.ipAddress : ''}</div>
            </div>
            <button type="button" data-revoke-device="${d.deviceId}" style="padding:5px 10px;background:transparent;color:#cc6666;border:1px solid #cc6666;border-radius:4px;cursor:pointer;font-size:0.8rem;">Revocar</button>
        </div>
    `).join('');

    list.querySelectorAll('[data-revoke-device]').forEach((btn) => {
        btn.onclick = () => revokeAdminDevice(btn.getAttribute('data-revoke-device'), btn);
    });
}

async function loadAdminDevicesPanel() {
    const list = document.getElementById('secDevicesList');
    if (!list) return;
    list.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Cargando...</p>';
    try {
        const r = await fetch(`${API_URL}/admin/devices`, { headers: authHeaders() });
        const d = await r.json();
        if (!d.success) {
            setSecDevicesAlert(d.error || 'No se pudieron cargar los dispositivos.', true);
            list.innerHTML = '';
            return;
        }
        renderAdminDevicesPanel(d.data);
    } catch (err) {
        list.innerHTML = '';
        setSecDevicesAlert(adminConnectionErrorMessage(err), true);
    }
}

async function toggleAdminDeviceGate(checked) {
    const gateToggle = document.getElementById('secDevicesGateToggle');
    if (gateToggle) gateToggle.disabled = true;
    try {
        const r = await fetch(`${API_URL}/admin/devices/gate`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: checked })
        });
        const d = await r.json();
        if (!d.success) {
            setSecDevicesAlert(d.error || 'No se pudo actualizar la protección.', true);
            if (gateToggle) gateToggle.checked = !checked;
        } else {
            renderAdminDevicesPanel(d.data);
            setSecDevicesAlert('Protección por dispositivo actualizada.', false);
        }
    } catch (err) {
        setSecDevicesAlert(adminConnectionErrorMessage(err), true);
        if (gateToggle) gateToggle.checked = !checked;
    } finally {
        if (gateToggle) gateToggle.disabled = false;
    }
}

async function registerCurrentAdminDevice() {
    const label = (document.getElementById('secDevicesLabelInput')?.value || '').trim();
    const btn = document.getElementById('secDevicesRegisterBtn');
    if (btn) btn.disabled = true;
    try {
        const r = await fetch(`${API_URL}/admin/devices`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: getDeviceId(), label })
        });
        const d = await r.json();
        if (!d.success) {
            setSecDevicesAlert(d.error || 'No se pudo registrar el dispositivo.', true);
            return;
        }
        if (document.getElementById('secDevicesLabelInput')) document.getElementById('secDevicesLabelInput').value = '';
        renderAdminDevicesPanel(d.data);
        setSecDevicesAlert('Dispositivo registrado.', false);
    } catch (err) {
        setSecDevicesAlert(adminConnectionErrorMessage(err), true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function revokeAdminDevice(deviceId, btn) {
    if (btn) btn.disabled = true;
    try {
        const r = await fetch(`${API_URL}/admin/devices/${encodeURIComponent(deviceId)}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const d = await r.json();
        if (!d.success) {
            setSecDevicesAlert(d.error || 'No se pudo revocar el dispositivo.', true);
            return;
        }
        renderAdminDevicesPanel(d.data);
        setSecDevicesAlert('Dispositivo revocado.', false);
    } catch (err) {
        setSecDevicesAlert(adminConnectionErrorMessage(err), true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function wireAdminDevicesPanel() {
    const gateToggle = document.getElementById('secDevicesGateToggle');
    if (gateToggle) gateToggle.onchange = () => toggleAdminDeviceGate(gateToggle.checked);
    const registerBtn = document.getElementById('secDevicesRegisterBtn');
    if (registerBtn) registerBtn.onclick = registerCurrentAdminDevice;
    const refreshBtn = document.getElementById('secDevicesRefreshBtn');
    if (refreshBtn) refreshBtn.onclick = loadAdminDevicesPanel;
}

let serverLogsTimer = null;

async function fetchServerLogs(lines, level) {
    const res = await fetch(`${API_URL}/admin/logs/server?lines=${lines}${level ? `&level=${level}` : ''}`, {
        headers: authHeaders()
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d || d.success !== true) {
        throw new Error(d?.error || `HTTP ${res.status}`);
    }
    return d.data;
}

// --- Envio de mail a profesionales potenciales seleccionados ----------------
// A diferencia de WhatsApp, el mail lo manda el backend (nodemailer): el
// navegador no puede SMTP. El modal deja editar asunto y cuerpo antes de
// confirmar, y muestra el resultado lead por lead.

async function loadInviteEmailTemplate(alias, profession) {
    const q = new URLSearchParams({ alias: alias || '', profession: profession || '' });
    const res = await fetch(`${API_URL}/admin/potential-professionals/invite-email?${q}`, {
        headers: authHeaders(),
        credentials: 'include'
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d || d.success !== true) throw new Error(d?.error || `HTTP ${res.status}`);
    return d.data;
}

function selectedLeadIds() {
    return [...document.querySelectorAll('.lead-invite-cb:not(:disabled):checked')].map((cb) => cb.value);
}

function updateLeadSelectionCount() {
    const sel = document.getElementById('leadSelectionCount');
    if (sel) sel.textContent = `${selectedLeadIds().length} ${t('selected')}`;
}

// Elemento donde se avisa que no hay leads seleccionables en la vista actual.
// Sin esto los botones "Seleccionar pendiente" / "Limpiar seleccion"
// parecian rotos cuando todos los checkboxes estan deshabilitados.
function selectionFeedbackEl() {
    let el = document.getElementById('leadSelectionFeedback');
    if (!el) {
        el = document.createElement('div');
        el.id = 'leadSelectionFeedback';
        el.style.cssText = 'width:100%;margin:-8px 0 12px 0;';
        const count = document.getElementById('leadSelectionCount');
        const toolbar = count ? count.closest('.admin-leads-toolbar') : null;
        if (toolbar && toolbar.parentNode) toolbar.parentNode.insertBefore(el, toolbar.nextSibling);
    }
    return el;
}

function notifyNoSelectableLeads() {
    // Sin checkboxes habilitados no se puede seleccionar nada. Lo mas probable
    // es que todos los leads visibles esten bloqueados (padron importado sin
    // consentimiento), asi que lo decimos en vez de fallar en silencio.
    showAlert(selectionFeedbackEl(), t('No selectable leads on this page. Leads imported from the padron are blocked until you unblock them.'), true);
}

async function sendLeadInviteEmail(leadId) {
    // El modal se reutiliza entre aperturas (crearlo cada vez duplicaba nodos y
    // dejaba listeners viejos pegados). Si quedo a medio cerrar de un envio
    // anterior, se limpia antes de reabrirlo.
    let modal = document.getElementById('leadEmailModal');
    if (!modal) modal = createLeadEmailModal();
    if (!modal.isConnected) document.body.appendChild(modal);
    // Por si el envio anterior cerro sin deactivateAccessibleModal.
    deactivateAccessibleModal(modal);

    const alertEl = document.getElementById('leAlert');
    const subjEl = document.getElementById('leSubject');
    const bodyEl = document.getElementById('leBody');
    const sendBtn = document.getElementById('leSend');
    const counter = document.getElementById('leCounter');
    // Si quedo polling de un envio anterior (cerrado a mano a mitad de corrida),
    // cortarlo antes de reabrir el modal.
    stopEmailProgress();
    const single = !!leadId;
    const ids = single ? [leadId] : selectedLeadIds();

    if (!single && !ids.length) {
        showAlert(alertEl, t('Select at least one professional.'), true);
        return;
    }

    showAlert(alertEl, t('Loading template...'), false);
    try {
        // Para un lote se usa el oficio del primer lead: el cuerpo es comun a
        // todos y el admin lo edita antes de confirmar.
        const first = single ? leadsById.get(leadId) : (ids.length ? leadsById.get(ids[0]) : null);
        const tpl = await loadInviteEmailTemplate(
            single ? (first?.name || first?.alias || '') : '',
            first?.profession || ''
        );
        subjEl.value = tpl.subject || '';
        bodyEl.value = tpl.body || '';
    } catch (err) {
        showAlert(alertEl, adminConnectionErrorMessage(err), true);
        return;
    }

    counter.textContent = single
        ? t('1 recipient')
        : `${ids.length} ${t('recipients')} ${t('selected')}`;
    openAdminOverlay(modal);

    sendBtn.onclick = async () => {
        const subject = subjEl.value.trim();
        const message = bodyEl.value.trim();
        if (!subject || !message) {
            showAlert(alertEl, t('Subject and message are required.'), true);
            return;
        }
        const rateRaw = parseInt(document.getElementById('leRate')?.value, 10);
        const rate = Math.min(120, Math.max(1, rateRaw || 10));
        sendBtn.disabled = true;
        showAlert(alertEl, t('Sending...'), false);
        try {
            const res = await fetch(`${API_URL}/admin/potential-professionals/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                credentials: 'include',
                body: JSON.stringify({ ids, subject, message, rate })
            });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d || d.success !== true) {
                throw new Error(d?.error || `HTTP ${res.status}`);
            }
            // El envio arranca en segundo plano (respuesta 202) y la UI pollea
            // el status para mostrar el progreso y el resumen al terminar.
            startEmailProgress(alertEl, sendBtn);
        } catch (err) {
            showAlert(alertEl, adminConnectionErrorMessage(err), true);
            sendBtn.disabled = false;
        }
    };
}

let emailProgressTimer = null;

function stopEmailProgress() {
    if (emailProgressTimer) {
        clearInterval(emailProgressTimer);
        emailProgressTimer = null;
    }
}

// Pollea /bulk-email/status mientras corre el envio en segundo plano. Se reusa
// la misma caja de alerta del modal para el progreso y el resumen final.
function startEmailProgress(alertEl, sendBtn) {
    stopEmailProgress();
    const poll = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/outreach/bulk-email/status`, {
                headers: authHeaders(),
                credentials: 'include'
            });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d || d.success !== true) return;
            const s = d.data || {};

            if (s.phase === 'sending') {
                const sent = Number(s.sent) || 0;
                const failed = Number(s.failed) || 0;
                const skipped = Number(s.skipped) || 0;
                const total = Number(s.total) || 0;
                const processed = sent + failed + skipped;
                showAlert(alertEl, `${processed} / ${total} — ${t('Sent')}: ${sent}, ${t('Failed')}: ${failed}, ${t('Skipped')}: ${skipped}`, false);
                return;
            }

            stopEmailProgress();
            const sent = Number(s.sent) || 0;
            const failed = Number(s.failed) || 0;
            const skipped = Number(s.skipped) || 0;
            const notFound = Number(s.notFound) || 0;
            const total = Number(s.total) || 0;
            const processed = sent + failed + skipped;
            let msg = `${processed} / ${total} — ${t('Sent')}: ${sent}, ${t('Failed')}: ${failed}, ${t('Skipped')}: ${skipped}`;
            if (notFound) msg += ` · ${t('Not found')}: ${notFound}`;
            if (skipped && !sent) {
                msg += ` — ${t('Blocked leads are never emailed. Unblock them first in the Invitation column.')}`;
            }
            if (s.phase === 'error' && s.lastError) msg += ` (${s.lastError})`;
            showAlert(alertEl, msg, s.phase === 'error' || (!sent && (failed || notFound)));
            sendBtn.disabled = false;
            loadLeads(leadsCurrentPage);
        } catch (err) {
            showAlert(alertEl, adminConnectionErrorMessage(err), true);
            stopEmailProgress();
        }
    };
    emailProgressTimer = setInterval(poll, 2000);
    poll();
}

function createLeadEmailModal() {
    const modal = document.createElement('div');
    modal.id = 'leadEmailModal';
    modal.className = 'admin-modal-overlay';
    modal.style.display = 'none';
    // Estado inicial coherente con el de un modal cerrado: sin esto el primer
    // activateAccessibleModal encuentra un modal "vivo" sin estar abierto.
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="admin-modal" style="max-width: 680px;">
            <div class="admin-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid #333;">
                <h3 class="gold-text" style="margin:0;">${t('Send invitation email')}</h3>
                <button type="button" class="admin-modal-close" style="background:transparent;color:#aaa;border:1px solid #555;border-radius:4px;padding:6px 12px;cursor:pointer;">✕</button>
            </div>
            <div style="padding:16px;">
                <div id="leAlert" style="margin-bottom:12px;font-size:0.9rem;"></div>
                <p id="leCounter" style="color:#aaa;font-size:0.85rem;margin:0 0 12px;"></p>
                <label for="leSubject" style="display:block;color:var(--primary-gold);font-weight:bold;font-size:0.85rem;margin-bottom:4px;">${t('Subject')}</label>
                <input id="leSubject" type="text" style="width:100%;padding:9px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;margin-bottom:12px;">
                <label for="leBody" style="display:block;color:var(--primary-gold);font-weight:bold;font-size:0.85rem;margin-bottom:4px;">${t('Message')}</label>
                <textarea id="leBody" rows="14" style="width:100%;padding:9px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;font-family:inherit;font-size:0.9rem;"></textarea>
                <div style="display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap;">
                    <label for="leRate" style="display:block;color:var(--primary-gold);font-weight:bold;font-size:0.85rem;">${t('Emails per minute')}</label>
                    <input id="leRate" type="number" min="1" max="120" step="1" value="10" style="width:90px;padding:9px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;">
                    <span id="leRateHint" style="color:#888;font-size:0.82rem;"></span>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
                    <button type="button" class="admin-modal-close" style="background:#333;color:#fff;border:1px solid #555;padding:9px 18px;border-radius:4px;cursor:pointer;">${t('Cancel')}</button>
                    <button id="leSend" type="button" style="background:var(--primary-gold);color:#0f0f1a;border:none;padding:9px 18px;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Send')}</button>
                </div>
            </div>
        </div>
    `;
    modal.querySelectorAll('.admin-modal-close').forEach((b) => {
        // Mismo motivo que en el envio: cerrar a mano dejaba el modal "vivo".
        b.onclick = () => {
            stopEmailProgress();
            closeAdminOverlay(modal);
        };
    });

    const rateInput = modal.querySelector('#leRate');
    if (rateInput) {
        const updateHint = () => {
            const hint = modal.querySelector('#leRateHint');
            if (!hint) return;
            const rate = Math.min(120, Math.max(1, parseInt(rateInput.value, 10) || 10));
            const secs = Math.max(1, Math.round(60 / rate));
            hint.textContent = t('{count} emails per minute = one email every {secs} seconds.')
                .replace('{count}', String(rate))
                .replace('{secs}', String(secs));
            const alertBox = modal.querySelector('#leAlert');
            if (alertBox) alertBox.textContent = '';
        };
        rateInput.addEventListener('input', updateHint);
        updateHint();
    }
    return modal;
}

export async function openServerLogsModal() {
    if (serverLogsTimer) {
        clearInterval(serverLogsTimer);
        serverLogsTimer = null;
    }

    let lines = 300;
    let level = '';
    let auto = false;

    let modal = document.getElementById('serverLogsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'serverLogsModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const close = () => {
            if (serverLogsTimer) {
                clearInterval(serverLogsTimer);
                serverLogsTimer = null;
            }
            closeAdminOverlay(modal);
        };

        const closeBar = createAdminModalCloseBar({ maxWidth: '1100px', onClick: close });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '1100px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin:0 0 6px 0;">Logs del servidor</h2>
            <p style="color:#888;font-size:0.85rem;margin:0 0 16px 0;">
                Todo lo que la app escribe en consola, incluidos los stack traces. Se guardan en archivo, asi que sobreviven a un reinicio del contenedor.
            </p>
            <div id="slAlert" class="alert hidden" style="padding:10px;border-radius:4px;border:1px solid transparent;margin-bottom:12px;"></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
                <label style="color:#aaa;font-size:0.85rem;">Lineas:
                    <select id="slLines" style="margin-left:6px;padding:6px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;">
                        <option value="100">100</option>
                        <option value="300" selected>300</option>
                        <option value="1000">1000</option>
                        <option value="2000">2000</option>
                    </select>
                </label>
                <label style="color:#aaa;font-size:0.85rem;">Nivel:
                    <select id="slLevel" style="margin-left:6px;padding:6px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;">
                        <option value="">Todos</option>
                        <option value="ERROR">Solo errores</option>
                        <option value="WARN">Solo avisos</option>
                    </select>
                </label>
                <label style="display:flex;align-items:center;gap:6px;color:#aaa;font-size:0.85rem;cursor:pointer;">
                    <input type="checkbox" id="slAuto"> Auto (5s)
                </label>
                <button type="button" id="slRefresh" style="padding:7px 14px;background:var(--primary-gold);color:var(--dark-bg,#0f0f1a);border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Refrescar</button>
                <button type="button" id="slCopy" style="padding:7px 14px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;">Copiar</button>
            </div>
            <div id="slMeta" style="color:#777;font-size:0.8rem;margin-bottom:10px;">—</div>
            <pre id="slOut" style="margin:0;background:#0d0d12;border:1px solid #333;border-radius:6px;padding:14px;max-height:60vh;overflow:auto;font-size:0.8rem;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#c9d1d9;">Cargando…</pre>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);
    }

    const out = document.getElementById('slOut');
    const meta = document.getElementById('slMeta');
    const alertEl = document.getElementById('slAlert');

    const load = async () => {
        try {
            const data = await fetchServerLogs(lines, level);
            const s = data.stats || {};
            const c = s.counts || {};
            meta.textContent = `${data.total} linea(s) · ERROR ${c.ERROR || 0} · WARN ${c.WARN || 0} · buffer ${s.buffered}/${s.ringSize} · log ${Math.round((s.fileBytes || 0) / 1024)} KB · up ${data.uptimeSeconds}s · RAM ${data.memoryMb} MB`;
            out.textContent = (data.lines || []).join('\n') || '(sin lineas)';
            if (auto) out.scrollTop = out.scrollHeight;
            showAlert(alertEl, '');
        } catch (err) {
            showAlert(alertEl, adminConnectionErrorMessage(err), true);
        }
    };

    document.getElementById('slLines').onchange = (e) => { lines = parseInt(e.target.value, 10) || 300; load(); };
    document.getElementById('slLevel').onchange = (e) => { level = e.target.value; load(); };
    document.getElementById('slRefresh').onclick = load;
    document.getElementById('slAuto').onchange = (e) => {
        auto = e.target.checked;
        if (serverLogsTimer) { clearInterval(serverLogsTimer); serverLogsTimer = null; }
        if (auto) serverLogsTimer = setInterval(load, 5000);
    };
    document.getElementById('slCopy').onclick = async () => {
        try {
            await navigator.clipboard.writeText(out.textContent || '');
            showAlert(alertEl, 'Logs copiados al portapapeles.', false);
        } catch (e) {
            showAlert(alertEl, 'No se pudo copiar.', true);
        }
    };

    await load();
}

export async function openDashboardConfigModal() {
    let modal = document.getElementById('dashboardConfigModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dashboardConfigModal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '3000', display: 'flex',
            flexDirection: 'column', padding: '20px', overflowY: 'auto'
        });

        const closeBar = createAdminModalCloseBar({
            maxWidth: '720px',
            onClick: () => {
                if (waConfigPollTimer) {
                    clearInterval(waConfigPollTimer);
                    waConfigPollTimer = null;
                }
                if (waDripPollTimer) {
                    clearInterval(waDripPollTimer);
                    waDripPollTimer = null;
                }
                stopWhatsAppInboundPolling();
                closeAdminOverlay(modal);
            }
        });

        const container = document.createElement('div');
        Object.assign(container.style, {
            backgroundColor: 'var(--dark-bg, #1a1a1a)', padding: '20px',
            borderRadius: '8px', color: 'white', maxWidth: '720px', margin: '0 auto', width: '100%'
        });

        container.innerHTML = `
            <h2 class="gold-text" style="margin-bottom: 8px;">${t('Dashboard Config')}</h2>
            <p style="color:#aaa;font-size:0.9rem;margin-bottom:24px;">${t('Platform settings for admin tools and automated notifications.')}</p>
            <div id="waConfigAlert" class="alert hidden" style="padding:10px;border-radius:4px;border:1px solid transparent;margin-bottom:16px;"></div>

            <section style="border:1px solid rgba(212,175,55,0.25);border-radius:8px;padding:20px;margin-bottom:20px;">
                <h3 class="gold-text" style="margin:0 0 6px 0;">${t('Launch Curtain')}</h3>
                <p style="color:#888;font-size:0.85rem;margin:0 0 16px 0;">${t('Hide treasure grids on categories, discover, and home until the grand opening. Visitors see a theater curtain with a countdown to the configured opening date.')}</p>
                <div id="launchCurtainAlert" class="alert hidden" style="padding:10px;border-radius:4px;border:1px solid transparent;margin-bottom:12px;"></div>
                <div class="admin-launch-switch">
                    <span class="admin-launch-switch-label">${t('Hide treasure grids (launch curtain)')}</span>
                    <label class="admin-toggle-switch" title="${t('Launch curtain')}">
                        <input type="checkbox" id="launchCurtainConfigToggle" aria-label="${t('Hide treasure grids (launch curtain)')}">
                        <span class="admin-toggle-slider"></span>
                    </label>
                </div>
                <p id="launchCurtainStatusLine" style="color:#888;font-size:0.82rem;margin:12px 0 0;line-height:1.45;">—</p>
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid #333;">
                    <label for="launchCurtainOpeningAt" style="display:block;color:#ccc;font-size:0.9rem;margin:0 0 8px 0;">${t('Opening date & time')}</label>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        <input type="datetime-local" id="launchCurtainOpeningAt" style="flex:1;min-width:220px;padding:10px;background:#222;color:white;border:1px solid #444;border-radius:4px;">
                        <button type="button" id="launchCurtainSaveOpeningBtn" style="padding:10px 16px;background:var(--primary-gold);color:var(--dark-bg);border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Save date')}</button>
                    </div>
                    <p style="color:#888;font-size:0.8rem;margin:8px 0 0;">${t('Time is interpreted in Argentina time (UTC−03:00).')}</p>
                </div>
            </section>

            <section style="border:1px solid rgba(212,175,55,0.25);border-radius:8px;padding:20px;margin-bottom:20px;">
                <h3 class="gold-text" style="margin:0 0 6px 0;">${t('WhatsApp Configuration')}</h3>
                <p style="color:#888;font-size:0.85rem;margin:0 0 16px 0;">${t('All outbound WhatsApp messages from the platform are sent from this number.')}</p>

                <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
                    <div style="flex:1;min-width:200px;padding:12px;background:#111;border-radius:6px;border:1px solid #333;">
                        <div style="color:#888;font-size:0.8rem;margin-bottom:4px;">${t('Origin number')}</div>
                        <div id="waConfigCurrentPhone" style="font-size:1.2rem;color:var(--primary-gold);">+5491178280156</div>
                    </div>
                    <div style="flex:1;min-width:200px;padding:12px;background:#111;border-radius:6px;border:1px solid #333;">
                        <div style="color:#888;font-size:0.8rem;margin-bottom:4px;">${t('Session status')}</div>
                        <div id="waConfigSessionState" style="font-size:1rem;">—</div>
                    </div>
                </div>

                <div id="waConfigPhoneSection" style="margin-bottom:24px;padding-top:16px;border-top:1px solid #333;">
                    <h4 style="margin:0 0 10px 0;color:#ccc;">1) ${t('Platform WhatsApp number')}</h4>
                    <p id="waConfigTwilioNote" class="hidden" style="color:#888;font-size:0.85rem;margin:0 0 10px 0;">${t('No number saved here yet — using Twilio default from server .env. Save below to override.')}</p>
                    <div id="waConfigPhoneManualBlock">
                        <p style="color:#888;font-size:0.85rem;margin:0 0 10px 0;">${t('Set the platform WhatsApp number (E.164, with or without +). Example: +15559340276 or 5491178280156.')}</p>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                            <input type="text" id="waConfigPhoneInput" placeholder="+15559340276 or 5491178280156" style="flex:1;min-width:220px;padding:10px;background:#222;color:white;border:1px solid #444;border-radius:4px;">
                            <button type="button" id="waConfigSavePhoneBtn" style="padding:10px 16px;background:var(--primary-gold);color:var(--dark-bg);border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Save number')}</button>
                        </div>
                    </div>
                </div>

                <div id="waConfigWebJsSection" style="padding-top:16px;border-top:1px solid #333;">
                    <h4 style="margin:0 0 10px 0;color:#ccc;">2) ${t('Register number on WhatsApp')}</h4>
                    <p style="color:#888;font-size:0.85rem;margin:0 0 12px 0;">${t('Link the platform as a WhatsApp Web device. Open WhatsApp on the origin phone → Linked devices → Link a device, then scan the QR below.')}</p>
                    <p id="waConfigStatusText" style="color:#ccc;margin:0 0 12px 0;font-size:0.9rem;">—</p>
                    <div id="waConfigQrWrap" class="hidden" style="margin-bottom:16px;text-align:center;">
                        <img id="waConfigQrImg" alt="WhatsApp QR" style="max-width:240px;background:white;padding:10px;border-radius:8px;">
                    </div>
                    <button type="button" id="waConfigRegisterBtn" style="padding:10px 18px;background:#25D366;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Register number on WhatsApp')}</button>
                </div>

                <p id="waConfigTwilioApiNote" class="hidden" style="color:#25D366;font-size:0.85rem;margin:16px 0 0 0;padding:12px;background:#0a1a0f;border:1px solid #1a3a24;border-radius:6px;">${t('Twilio WhatsApp API: template watext is approved. On the server run bash scripts/set-twilio-whatsapp-template.sh then use Invitations below.')}</p>

                <div style="margin-top:24px;padding-top:16px;border-top:1px solid #333;">
                    <h4 style="margin:0 0 10px 0;color:#ccc;">3) ${t('Automatic sending (WhatsApp)')}</h4>
                    <p style="color:#888;font-size:0.85rem;margin:0 0 12px 0;">${t('Sends cold template invitations in 5 batches of 50, pausing 30 minutes between batches (250/day — Meta cold-outreach limit). Stops when the daily cap is reached or no pending leads remain. Restart the next day to continue.')}</p>
                    <p id="waTemplatePendingNote" class="hidden" style="color:#f0ad4e;font-size:0.85rem;margin:0 0 12px 0;padding:10px;background:#2a2210;border:1px solid #665520;border-radius:6px;">—</p>
                    <p id="waDripStatusText" style="color:#ccc;margin:0 0 12px 0;font-size:0.9rem;line-height:1.6;">—</p>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <button type="button" id="waDripStartBtn" style="padding:10px 18px;background:#25D366;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Start sending 5×50/day')}</button>
                        <button type="button" id="waDripStopBtn" style="padding:10px 18px;background:transparent;color:#cc6666;border:1px solid #cc6666;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Stop sending')}</button>
                    </div>
                </div>

                <div id="waInboundSection" style="margin-top:24px;padding-top:16px;border-top:1px solid #333;">
                    <h4 style="margin:0 0 10px 0;color:#ccc;">4) ${t('Incoming replies (WhatsApp)')}</h4>
                    <p style="color:#888;font-size:0.85rem;margin:0 0 8px 0;">${t('Replies appear here — no need to open Twilio Console. Respond from this panel with custom text or the preset buttons.')}</p>
                    <p style="margin:0 0 12px 0;"><a href="/whatsapp-inbox.html" target="_blank" rel="noopener" style="color:#25D366;font-size:0.9rem;font-weight:bold;">↗ ${t('Open full WhatsApp inbox')}</a></p>
                    <p style="color:#666;font-size:0.8rem;margin:0 0 12px 0;word-break:break-all;">${t('One-time setup — paste this webhook URL in Twilio → WhatsApp sender → Incoming message')}: <code id="waInboundWebhookUrl" style="color:#9cf;">—</code></p>
                    <p id="waInboundMeta" style="color:#aaa;font-size:0.85rem;margin:0 0 10px 0;">—</p>
                    <div id="waInboundList" style="max-height:320px;overflow-y:auto;padding-right:4px;">—</div>
                    <button type="button" id="waInboundRefreshBtn" style="margin-top:12px;padding:8px 14px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;">${t('Refresh replies')}</button>
                </div>
            </section>

            <section style="border:1px solid rgba(212,175,55,0.25);border-radius:8px;padding:20px;margin-bottom:20px;">
                <h3 class="gold-text" style="margin:0 0 6px 0;">${t('Security — Authorized devices')}</h3>
                <p style="color:#888;font-size:0.85rem;margin:0 0 16px 0;">${t('Lock the admin login to this device and any other devices you register here. Each device gets a private id (soft‑MAC) stored locally; from 4G the public IP changes but this id stays stable.')}</p>
                <div id="secDevicesAlert" class="alert hidden" style="padding:10px;border-radius:4px;border:1px solid transparent;margin-bottom:12px;"></div>
                <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
                    <label class="admin-toggle-switch" title="${t('Require an authorized device to sign in')}">
                        <input type="checkbox" id="secDevicesGateToggle" aria-label="${t('Require an authorized device to sign in')}">
                    </label>
                    <span id="secDevicesGateLabel" style="color:#ccc;font-size:0.92rem;">${t('Require authorized device to sign in')}</span>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
                    <input type="text" id="secDevicesLabelInput" placeholder="${t('Device name (e.g. My phone)')}" style="flex:1;min-width:200px;padding:9px 10px;background:#222;color:white;border:1px solid #444;border-radius:4px;">
                    <button type="button" id="secDevicesRegisterBtn" style="padding:9px 16px;background:var(--primary-gold);color:var(--dark-bg);border:none;border-radius:4px;cursor:pointer;font-weight:bold;">${t('Register this device')}</button>
                    <button type="button" id="secDevicesRefreshBtn" style="padding:9px 14px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;">🔄</button>
                </div>
                <p style="color:#888;font-size:0.85rem;margin:0 0 8px 0;">${t('This device id')}: <code id="secDevicesCurrentId" style="color:#9cf;word-break:break-all;">—</code></p>
                <div id="secDevicesList" style="max-height:280px;overflow-y:auto;padding-right:4px;">—</div>
            </section>
        `;

        modal.appendChild(closeBar);
        modal.appendChild(container);
        document.body.appendChild(modal);
        applyStaticTranslations(modal);

        document.getElementById('waConfigSavePhoneBtn').onclick = async () => {
            const alertEl = document.getElementById('waConfigAlert');
            const btn = document.getElementById('waConfigSavePhoneBtn');
            const phone = document.getElementById('waConfigPhoneInput').value.trim();
            if (!phone) {
                showAlert(alertEl, t('Enter a phone number'));
                return;
            }

            btn.disabled = true;
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/admin/whatsapp/config`, {
                    method: 'PUT',
                    headers: {
                        ...authHeaders(),
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({ phoneNumber: phone })
                });
                const data = await parseAdminApiResponse(res);
                if (!data.success) {
                    showAlert(alertEl, data.error || t('Could not save phone number'));
                    return;
                }
                showAlert(alertEl, t('WhatsApp phone number updated. Re-link WhatsApp if you changed the origin number.'), false);
                await loadWhatsAppConfigPanel();
            } catch (err) {
                showAlert(alertEl, adminConnectionErrorMessage(err));
            } finally {
                btn.disabled = false;
            }
        };

        document.getElementById('waConfigRegisterBtn').onclick = async () => {
            const alertEl = document.getElementById('waConfigAlert');
            const btn = document.getElementById('waConfigRegisterBtn');
            btn.disabled = true;

            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/admin/whatsapp/register`, {
                    method: 'POST',
                    headers: {
                        ...authHeaders(),
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
                const data = await parseAdminApiResponse(res);
                if (!data.success) {
                    showAlert(alertEl, data.error || t('Could not start WhatsApp registration'));
                    btn.disabled = false;
                    return;
                }

                showAlert(alertEl, t('Scan the QR with the origin phone within 3 minutes.'), false);
                renderWhatsAppConfigStatus(data.data);
                if (waConfigPollTimer) clearInterval(waConfigPollTimer);
                waConfigPollTimer = setInterval(pollWhatsAppConfigStatus, 2500);
                pollWhatsAppConfigStatus();
            } catch (err) {
                showAlert(alertEl, adminConnectionErrorMessage(err));
                btn.disabled = false;
            }
        };

        const waDripStartBtn = document.getElementById('waDripStartBtn');
        if (waDripStartBtn) waDripStartBtn.onclick = startWhatsAppDrip;
        const waDripStopBtn = document.getElementById('waDripStopBtn');
        if (waDripStopBtn) waDripStopBtn.onclick = stopWhatsAppDrip;
        const waInboundRefreshBtn = document.getElementById('waInboundRefreshBtn');
        if (waInboundRefreshBtn) waInboundRefreshBtn.onclick = loadWhatsAppInboundReplies;
        bindWhatsAppInboundReplyHandlers();

        wireLaunchCurtainToggle(document.getElementById('launchCurtainConfigToggle'));
        const launchCurtainSaveOpeningBtn = document.getElementById('launchCurtainSaveOpeningBtn');
        if (launchCurtainSaveOpeningBtn) launchCurtainSaveOpeningBtn.onclick = handleLaunchCurtainOpeningSave;
        wireAdminDevicesPanel();
    }

    openAdminOverlay(modal);
    await Promise.all([loadWhatsAppConfigPanel(), loadLaunchCurtainConfigPanel(), loadAdminDevicesPanel()]);
}

async function openAvisosModal() {
    let modal = document.getElementById('avisosModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'avisosModal';
        modal.className = 'admin-overlay-modal hidden';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
    }

    const closeBar = createAdminModalCloseBar({
        label: 'Avisos',
        onClick: () => closeAdminOverlay(modal)
    });

    modal.innerHTML = `
        ${closeBar}
        <div style="max-width: 1100px; margin: 60px auto; padding: 20px;">
            <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
                <select id="avisoFilterStatus" style="padding: 8px 12px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                    <option value="">Todos los estados</option>
                    <option value="pending_payment">⏳ Pendiente pago</option>
                    <option value="active">✅ Activo</option>
                    <option value="expiring">⚠️ Por expirar</option>
                    <option value="expired">❌ Expirado</option>
                    <option value="rejected">🚫 Rechazado</option>
                </select>
                <select id="avisoFilterEnv" style="padding: 8px 12px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                    <option value="">Todos los entornos</option>
                    <option value="hogar">🏠 Hogar</option>
                    <option value="oficina">🏢 Oficina</option>
                    <option value="pime">🏬 Pyme</option>
                    <option value="industria">🏭 Industria</option>
                </select>
                <button id="btnRefreshAvisos" style="padding: 8px 16px; background: var(--primary-gold); color: #0f0f1a; border: none; border-radius: 4px; font-weight: 600; cursor: pointer;">🔄 Actualizar</button>
            </div>
            <div id="avisosAdminList" style="color: #ccc;">Cargando...</div>
        </div>
    `;

    const ENV_LABELS = { hogar: '🏠 Hogar', oficina: '🏢 Oficina', pime: '🏬 Pyme', industria: '🏭 Industria' };
    const STATUS_LABELS = { pending_payment: '⏳ Pendiente', active: '✅ Activo', expiring: '⚠️ Expirando', expired: '❌ Expirado', rejected: '🚫 Rechazado', cancelled: '🚫 Cancelado' };
    const STATUS_COLORS = { pending_payment: '#a16207', active: '#15803d', expiring: '#c2410c', expired: '#dc2626', rejected: '#dc2626', cancelled: '#6b7280' };

    async function loadAvisos() {
        const status = document.getElementById('avisoFilterStatus')?.value || '';
        const env = document.getElementById('avisoFilterEnv')?.value || '';
        const list = document.getElementById('avisosAdminList');
        if (!list) return;

        let url = '/api/v1/admin/avisos?';
        if (status) url += `status=${status}&`;
        if (env) url += `environment=${env}&`;

        try {
            const r = await fetch(url, { headers: authHeaders() });
            const d = await r.json();
            const avisos = d.data || [];

            if (avisos.length === 0) {
                list.innerHTML = '<p style="color: #888; text-align: center; padding: 30px;">No se encontraron avisos.</p>';
                return;
            }

            list.innerHTML = avisos.map(a => {
                const color = STATUS_COLORS[a.status] || '#6b7280';
                const profName = a._professionalName || '';
                const profAlias = a._professionalAlias || '';
                const profEmail = a._professionalEmail || '';
                const hasReceipt = !!a.paymentReceiptUrl;

                let actions = '';
                if (a.status === 'pending_payment') {
                    actions = `
                        <button class="aviso-admin-approve" data-id="${a._id}" style="padding: 5px 10px; background: #15803d; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">✅ Aprobar</button>
                        <button class="aviso-admin-reject" data-id="${a._id}" style="padding: 5px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">🚫 Rechazar</button>`;
                } else if (a.status === 'expired' || a.status === 'expiring') {
                    actions = `
                        <button class="aviso-admin-renew" data-id="${a._id}" style="padding: 5px 10px; background: #15803d; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">🔄 Renovar</button>
                        <button class="aviso-admin-reject" data-id="${a._id}" style="padding: 5px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">🚫 Rechazar</button>`;
                }

                return `
                    <div style="border: 1px solid rgba(var(--gold-rgb), 0.2); border-radius: 8px; padding: 14px; margin-bottom: 10px; background: rgba(255,255,255,0.03);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                            <div style="flex: 1; min-width: 200px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <span style="font-weight: 700; color: white;">${ENV_LABELS[a.environment] || a.environment}</span>
                                    <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: ${color}22; color: ${color}; font-weight: 600;">${STATUS_LABELS[a.status] || a.status}</span>
                                    ${hasReceipt ? '<span style="font-size: 0.75rem; color: #22c55e;">📄 Pago subido</span>' : ''}
                                </div>
                                <div style="font-size: 0.85rem; color: #ccc; margin-bottom: 4px;">
                                    <strong>${profName}</strong> (${profAlias}) &mdash; ${profEmail}
                                </div>
                                <div style="font-size: 0.8rem; color: #888;">
                                    ${new Date(a.startDate).toLocaleDateString('es-AR')} — ${new Date(a.endDate).toLocaleDateString('es-AR')} | $${(a.price || 0).toLocaleString('es-AR')}
                                    ${a.text ? ` | ${a.text.substring(0, 80)}${a.text.length > 80 ? '...' : ''}` : ''}
                                </div>
                                ${a.rejectionReason ? `<div style="font-size: 0.8rem; color: #ef4444; margin-top: 4px;">Motivo: ${a.rejectionReason}</div>` : ''}
                                ${a.paymentReceiptUrl ? `<div style="font-size: 0.8rem; margin-top: 4px;"><a href="${a.paymentReceiptUrl}" target="_blank" style="color: var(--primary-gold);">📄 Ver comprobante</a>${a.paymentMethod ? ` <span style="color: #888;">(${a.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Transferencia'})</span>` : ''}</div>` : ''}
                            </div>
                            <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
                                ${actions}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            // Wire action buttons
            list.querySelectorAll('.aviso-admin-approve').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const notes = prompt('Notas (opcional):') || '';
                    await fetch(`/api/v1/admin/avisos/${btn.dataset.id}/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        body: JSON.stringify({ adminNotes: notes })
                    });
                    loadAvisos();
                });
            });

            list.querySelectorAll('.aviso-admin-reject').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const reason = prompt('Motivo de rechazo (obligatorio):');
                    if (!reason) return;
                    const notes = prompt('Notas (opcional):') || '';
                    await fetch(`/api/v1/admin/avisos/${btn.dataset.id}/reject`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        body: JSON.stringify({ rejectionReason: reason, adminNotes: notes })
                    });
                    loadAvisos();
                });
            });

            list.querySelectorAll('.aviso-admin-renew').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('¿Renovar este aviso por 30 días más?')) return;
                    const notes = prompt('Notas (opcional):') || '';
                    await fetch(`/api/v1/admin/avisos/${btn.dataset.id}/renew`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        body: JSON.stringify({ adminNotes: notes })
                    });
                    loadAvisos();
                });
            });

        } catch (err) {
            list.innerHTML = '<p style="color: #ef4444;">Error al cargar avisos.</p>';
        }
    }

    document.getElementById('btnRefreshAvisos').addEventListener('click', loadAvisos);
    document.getElementById('avisoFilterStatus').addEventListener('change', loadAvisos);
    document.getElementById('avisoFilterEnv').addEventListener('change', loadAvisos);

    openAdminOverlay(modal);
    await loadAvisos();
}

async function openStatsModal() {
    let modal = document.getElementById('statsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'statsModal';
        modal.className = 'admin-overlay-modal hidden';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
    }

    const closeBar = createAdminModalCloseBar({
        label: 'Estadísticas KPI',
        onClick: () => closeAdminOverlay(modal)
    });

    modal.innerHTML = `
        ${closeBar}
        <div style="max-width: 1100px; margin: 60px auto; padding: 20px;">
            <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
                <select id="statsPeriod" style="padding: 8px 12px; background: #222; color: white; border: 1px solid #444; border-radius: 4px;">
                    <option value="12">Últimos 12 meses</option>
                    <option value="6">Últimos 6 meses</option>
                    <option value="3">Últimos 3 meses</option>
                </select>
                <button id="btnRefreshStats" style="padding: 8px 16px; background: var(--primary-gold); color: #0f0f1a; border: none; border-radius: 4px; font-weight: 600; cursor: pointer;">🔄 Actualizar</button>
                <button id="btnExportStats" style="padding: 8px 16px; background: transparent; border: 1px solid var(--primary-gold); color: var(--primary-gold); border-radius: 4px; cursor: pointer;">📥 Exportar CSV</button>
            </div>
            <div id="statsSummary" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px;"></div>
            <div id="statsChart" style="margin-bottom: 24px;"></div>
            <div id="statsTopProfs"></div>
        </div>
    `;

    async function loadStats() {
        const months = document.getElementById('statsPeriod')?.value || '12';
        const summary = document.getElementById('statsSummary');
        const chart = document.getElementById('statsChart');
        const topProfs = document.getElementById('statsTopProfs');

        try {
            const r = await fetch(`/api/v1/admin/stats?months=${months}`, {
                headers: authHeaders()
            });
            const d = await r.json();
            const data = d.data;

            // Summary cards
            summary.innerHTML = `
                <div style="background: rgba(var(--gold-rgb), 0.1); border: 1px solid rgba(var(--gold-rgb), 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--primary-gold);">${data.totalClicks}</div>
                    <div style="font-size: 0.85rem; color: #aaa;">Total Clicks</div>
                </div>
                <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: #60a5fa;">${data.byType.profile_card}</div>
                    <div style="font-size: 0.85rem; color: #aaa;">👤 Perfil</div>
                </div>
                <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: #4ade80;">${data.byType.phone}</div>
                    <div style="font-size: 0.85rem; color: #aaa;">📞 Teléfono</div>
                </div>
                <div style="background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: #25d366;">${data.byType.whatsapp}</div>
                    <div style="font-size: 0.85rem; color: #aaa;">💬 WhatsApp</div>
                </div>
                <div style="background: rgba(0,136,204,0.1); border: 1px solid rgba(0,136,204,0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: #0088cc;">${data.byType.telegram}</div>
                    <div style="font-size: 0.85rem; color: #aaa;">✈️ Telegram</div>
                </div>
            `;

            // Bar chart (simple HTML/CSS)
            const maxTotal = Math.max(...Object.values(data.byMonth).map(m => m.total), 1);
            const monthLabels = data.months || [];
            chart.innerHTML = `
                <h4 style="color: var(--gold-light); margin-bottom: 12px;">Clicks por mes</h4>
                <div style="display: flex; align-items: flex-end; gap: 4px; height: 200px; padding: 10px 0; border-bottom: 1px solid #333;">
                    ${monthLabels.map(m => {
                        const monthData = data.byMonth[m] || { total: 0 };
                        const h = Math.max((monthData.total / maxTotal) * 160, 2);
                        const label = m.split('-')[1] + '/' + m.split('-')[0].slice(2);
                        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
                            <div style="font-size:0.65rem;color:#aaa;margin-bottom:2px;">${monthData.total}</div>
                            <div style="width:100%;max-width:40px;height:${h}px;background:var(--primary-gold);border-radius:3px 3px 0 0;transition:height 0.3s;"></div>
                            <div style="font-size:0.6rem;color:#666;margin-top:4px;transform:rotate(-45deg);white-space:nowrap;">${label}</div>
                        </div>`;
                    }).join('')}
                </div>
            `;

            // Top professionals
            const top = data.topProfessionals || [];
            topProfs.innerHTML = `
                <h4 style="color: var(--gold-light); margin-bottom: 12px;">Top Profesionales</h4>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead>
                            <tr style="border-bottom: 1px solid #333; color: var(--gold-light);">
                                <th style="padding: 8px; text-align: left;">#</th>
                                <th style="padding: 8px; text-align: left;">Alias</th>
                                <th style="padding: 8px; text-align: right;">Perfil</th>
                                <th style="padding: 8px; text-align: right;">Teléfono</th>
                                <th style="padding: 8px; text-align: right;">WhatsApp</th>
                                <th style="padding: 8px; text-align: right;">Telegram</th>
                                <th style="padding: 8px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${top.map((p, i) => `
                                <tr style="border-bottom: 1px solid #222;">
                                    <td style="padding: 8px; color: #888;">${i + 1}</td>
                                    <td style="padding: 8px; color: #fff; font-weight: 600;">${p.alias || p.email}</td>
                                    <td style="padding: 8px; text-align: right; color: #60a5fa;">${p.profile_card}</td>
                                    <td style="padding: 8px; text-align: right; color: #4ade80;">${p.phone}</td>
                                    <td style="padding: 8px; text-align: right; color: #25d366;">${p.whatsapp}</td>
                                    <td style="padding: 8px; text-align: right; color: #0088cc;">${p.telegram}</td>
                                    <td style="padding: 8px; text-align: right; color: var(--primary-gold); font-weight: 700;">${p.total}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

        } catch (err) {
            summary.innerHTML = '<p style="color: #ef4444;">Error al cargar estadísticas.</p>';
        }
    }

    document.getElementById('btnRefreshStats').addEventListener('click', loadStats);
    document.getElementById('btnExportStats').addEventListener('click', () => {
        // Simple CSV export
        const table = document.querySelector('#statsTopProfs table');
        if (!table) return;
        const rows = [...table.querySelectorAll('tr')];
        const csv = rows.map(r => {
            const cells = [...r.querySelectorAll('th, td')];
            return cells.map(c => c.textContent.trim()).join(',');
        }).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'kurate_stats.csv'; a.click();
        URL.revokeObjectURL(url);
    });
    document.getElementById('statsPeriod').addEventListener('change', loadStats);

    openAdminOverlay(modal);
    await loadStats();
}

window.openImageModal = openImageModal;
