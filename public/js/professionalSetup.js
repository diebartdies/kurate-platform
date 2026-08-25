import { API_URL, CATEGORY_META } from './globals.js';
import { t } from './i18n.js';

const CATEGORY_ORDER = ['verificados', 'Premium', 'Gold', 'Silver', 'Standard'];

export function needsProfessionalCategorySetup(user = {}) {
    if (user.role !== 'professional') return false;
    if (user.verificationStatus !== 'approved') return false;
    if (user.allowResubmission) return false;
    const prof = user.professionalProfile || {};
    const hasCategory = Boolean(prof.desiredQuality);
    const hasSpecialties = Array.isArray(prof.services) && prof.services.length > 0;
    return !hasCategory || !hasSpecialties;
}

export function getProfileCompletionChecklist(user = {}) {
    if (user.role !== 'professional') return { complete: true, missing: [] };
    const prof = user.professionalProfile || {};
    const missing = [];

    if (!prof.firstName) missing.push({ key: 'firstName', label: 'Nombre', section: 'personal' });
    if (!prof.surname) missing.push({ key: 'surname', label: 'Apellido', section: 'personal' });
    if (!prof.alias) missing.push({ key: 'alias', label: 'Alias', section: 'personal' });
    if (!prof.idNumber) missing.push({ key: 'idNumber', label: 'Documento (DNI)', section: 'personal' });
    if (!prof.birthDate) missing.push({ key: 'birthDate', label: 'Fecha de nacimiento', section: 'personal' });
    if (!prof.mobilePhone) missing.push({ key: 'mobilePhone', label: 'Teléfono móvil', section: 'contact' });
    if (!prof.desiredQuality) missing.push({ key: 'desiredQuality', label: 'Categoría', section: 'personal' });
    if (!prof.bio) missing.push({ key: 'bio', label: 'Descripción de servicios (bio)', section: 'bio' });
    if (!prof.location?.province) missing.push({ key: 'province', label: 'Provincia', section: 'address' });
    if (!prof.location?.city) missing.push({ key: 'city', label: 'Ciudad', section: 'address' });
    if (!prof.location?.street) missing.push({ key: 'street', label: 'Calle', section: 'address' });
    if (!prof.location?.number) missing.push({ key: 'number', label: 'Número', section: 'address' });
    if (!prof.photos || prof.photos.length === 0) missing.push({ key: 'photos', label: 'Al menos 1 foto', section: 'photos' });

    return { complete: missing.length === 0, missing };
}

export function renderCompletionChecklist(user = {}) {
    const { complete, missing } = getProfileCompletionChecklist(user);
    if (complete) return '';

    const sectionLabels = {
        personal: 'Información Personal',
        contact: 'Contacto',
        bio: 'Descripción',
        address: 'Dirección',
        photos: 'Fotos'
    };

    const grouped = {};
    missing.forEach(item => {
        if (!grouped[item.section]) grouped[item.section] = [];
        grouped[item.section].push(item);
    });

    const sectionsHtml = Object.entries(grouped).map(([section, items]) => {
        const itemsHtml = items.map(i => `<li>${t(i.label)}</li>`).join('');
        return `<div style="margin-bottom: 8px;"><strong style="color: var(--primary-gold); font-size: 0.85rem;">${t(sectionLabels[section] || section)}</strong><ul style="margin: 4px 0 0 18px; padding: 0; color: #ccc; font-size: 0.85rem; line-height: 1.6;">${itemsHtml}</ul></div>`;
    }).join('');

    return `
        <div class="card fileteado-section" style="margin-bottom: 20px; border: 2px solid var(--accent-red); background: rgba(220, 50, 50, 0.08);">
            <h3 style="color: var(--accent-red); margin-top: 0;">⚠ ${t('Complete your profile to be visible')}</h3>
            <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 12px;">${t('Your profile is not public yet. Fill in the missing fields below so clients can find you.')}</p>
            <div style="max-height: 260px; overflow-y: auto; padding-right: 8px;">
                ${sectionsHtml}
            </div>
            <p style="color: #aaa; font-size: 0.8rem; margin-top: 12px; margin-bottom: 0;">${missing.length} ${t('field(s) remaining')}</p>
        </div>
    `;
}

function formatCategoryPrice(amount) {
    return `$${Number(amount).toLocaleString('es-AR')}.-`;
}

export function renderCategoryPricingTable(tbody, pricing = {}) {
    if (!tbody) return;
    tbody.innerHTML = CATEGORY_ORDER.map((key) => {
        const meta = CATEGORY_META[key];
        const price = pricing[key] ?? meta.monthlyPrice;
        return `<tr>
            <td style="color: var(--primary-gold);">${t(meta.name)}</td>
            <td>${t(meta.alias)}</td>
            <td style="text-align: right;">${formatCategoryPrice(price)}</td>
            <td style="text-align: center; font-size: 0.8rem; color: #aaa;">/mes</td>
        </tr>`;
    }).join('');
}

export async function loadCategoryPricingTable(tbody) {
    renderCategoryPricingTable(tbody);
    try {
        const res = await fetch(`${API_URL}/public/category-pricing`);
        const data = await res.json();
        if (data.success && data.data) renderCategoryPricingTable(tbody, data.data);
    } catch {
        /* keep defaults from CATEGORY_META */
    }
}

export function buildQualitySelectOptions(prof = {}) {
    const selected = prof.desiredQuality || '';
    const placeholder = !prof.desiredQuality
        ? `<option value="">${t('Select a category...')}</option>`
        : '';
    const options = CATEGORY_ORDER.map((key) => {
        const meta = CATEGORY_META[key];
        const isSelected = selected === key ? ' selected' : '';
        return `<option value="${key}"${isSelected}>${t(meta.name)} (${meta.alias})</option>`;
    }).join('');
    return placeholder + options;
}
