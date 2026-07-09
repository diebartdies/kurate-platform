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

function formatCategoryPrice(amount) {
    return `$${Number(amount).toLocaleString('es-AR')}.-`;
}

export function renderCategoryPricingTable(tbody, pricing = {}) {
    if (!tbody) return;
    tbody.innerHTML = CATEGORY_ORDER.map((key) => {
        const meta = CATEGORY_META[key];
        const price = pricing[key] ?? meta.monthlyPrice;
        return `<tr>
            <td>${t(meta.name)}</td>
            <td>${meta.alias}</td>
            <td>${formatCategoryPrice(price)}</td>
            <td>${meta.priceUnit || 'ARS'}</td>
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
