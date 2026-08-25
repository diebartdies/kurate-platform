import { t } from './i18n.js';

export const DEFAULT_PAYMENT_INSTRUCTIONS = {
    intro: 'Transfer your monthly payment via Mercado Pago or bank transfer to the following accounts:',
    billingNote: 'Monthly billing is calculated based on your selected category. If you change category mid-month, the amount is prorated by days in each rate (we record the change date on your profile).',
    mercadoPago: {
        alias: 'drcar.lo',
        cvu: '0000003100079017216982'
    },
    bankTransfer: {
        bankName: 'BBVA',
        alias: 'drcarlo',
        cbu: '0170316840000040617332'
    }
};

function escapePaymentHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
}

export function resolvePaymentInstructions(fromApi) {
    const source = fromApi || {};
    const mp = source.mercadoPago || {};
    const bank = source.bankTransfer || {};
    const hasApiData = Boolean(mp.alias && mp.cvu && bank.alias && bank.cbu);

    if (hasApiData) {
        return {
            intro: t(source.intro || DEFAULT_PAYMENT_INSTRUCTIONS.intro),
            billingNote: t(source.billingNote || DEFAULT_PAYMENT_INSTRUCTIONS.billingNote),
            currentQuality: source.currentQuality || 'Standard',
            currentCategoryPrice: source.currentCategoryPrice,
            mercadoPago: {
                alias: mp.alias,
                cvu: mp.cvu
            },
            bankTransfer: {
                bankName: bank.bankName || DEFAULT_PAYMENT_INSTRUCTIONS.bankTransfer.bankName,
                alias: bank.alias,
                cbu: bank.cbu
            }
        };
    }

    return {
        intro: t(DEFAULT_PAYMENT_INSTRUCTIONS.intro),
        billingNote: t(DEFAULT_PAYMENT_INSTRUCTIONS.billingNote),
        currentQuality: 'Standard',
        currentCategoryPrice: null,
        mercadoPago: { ...DEFAULT_PAYMENT_INSTRUCTIONS.mercadoPago },
        bankTransfer: { ...DEFAULT_PAYMENT_INSTRUCTIONS.bankTransfer }
    };
}

export function renderHowToPayHtml(paymentInstructions) {
    const info = resolvePaymentInstructions(paymentInstructions);
    const mp = info.mercadoPago;
    const bank = info.bankTransfer;
    const bankName = bank.bankName || 'BBVA';
    const categoryPrice = formatMoney(info.currentCategoryPrice);
    const categoryLine = categoryPrice
        ? `<p class="how-to-pay-category-line"><strong>${escapePaymentHtml(t('Current category:'))}</strong> ${escapePaymentHtml(info.currentQuality)} (${categoryPrice}/mes)</p>`
        : `<p class="how-to-pay-category-line"><strong>${escapePaymentHtml(t('Current category:'))}</strong> ${escapePaymentHtml(info.currentQuality)}</p>`;

    return `
        <p class="how-to-pay-intro">${escapePaymentHtml(info.intro)}</p>
        <p class="how-to-pay-billing-note">${escapePaymentHtml(info.billingNote)}</p>
        ${categoryLine}
        <div class="how-to-pay-grid">
            <section class="how-to-pay-card">
                <div class="how-to-pay-heading">
                    <img src="/images/mercadopago.svg" alt="Mercado Pago" class="how-to-pay-logo how-to-pay-logo-mp" width="140" height="32">
                    <strong>${escapePaymentHtml(t('Mercado Pago:'))}</strong>
                </div>
                <dl class="how-to-pay-details">
                    <div><dt>Alias</dt><dd>${escapePaymentHtml(mp.alias)}</dd></div>
                    <div><dt>CVU</dt><dd>${escapePaymentHtml(mp.cvu)}</dd></div>
                </dl>
            </section>
            <section class="how-to-pay-card">
                <div class="how-to-pay-heading">
                    <span class="how-to-pay-bank-label">${escapePaymentHtml(t('Bank:'))}</span>
                    <img src="/images/bbva.svg" alt="${escapePaymentHtml(bankName)}" class="how-to-pay-logo how-to-pay-logo-bbva" width="72" height="32">
                    <strong>${escapePaymentHtml(bankName)}</strong>
                </div>
                <dl class="how-to-pay-details">
                    <div><dt>Alias</dt><dd>${escapePaymentHtml(bank.alias)}</dd></div>
                    <div><dt>CBU</dt><dd>${escapePaymentHtml(bank.cbu)}</dd></div>
                </dl>
            </section>
        </div>
    `;
}
