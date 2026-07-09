import { t } from './i18n.js';

/** Dial codes for registration — Americas + Europe. Default: Argentina (+54). */
export const PHONE_COUNTRIES = [
    { iso: 'AR', name: 'Argentina', nameEs: 'Argentina', dial: '+54', default: true },
    { iso: 'US', name: 'United States', nameEs: 'Estados Unidos', dial: '+1' },
    { iso: 'CA', name: 'Canada', nameEs: 'Canadá', dial: '+1' },
    { iso: 'MX', name: 'Mexico', nameEs: 'México', dial: '+52' },
    { iso: 'GT', name: 'Guatemala', nameEs: 'Guatemala', dial: '+502' },
    { iso: 'BZ', name: 'Belize', nameEs: 'Belice', dial: '+501' },
    { iso: 'HN', name: 'Honduras', nameEs: 'Honduras', dial: '+504' },
    { iso: 'SV', name: 'El Salvador', nameEs: 'El Salvador', dial: '+503' },
    { iso: 'NI', name: 'Nicaragua', nameEs: 'Nicaragua', dial: '+505' },
    { iso: 'CR', name: 'Costa Rica', nameEs: 'Costa Rica', dial: '+506' },
    { iso: 'PA', name: 'Panama', nameEs: 'Panamá', dial: '+507' },
    { iso: 'BR', name: 'Brazil', nameEs: 'Brasil', dial: '+55' },
    { iso: 'CL', name: 'Chile', nameEs: 'Chile', dial: '+56' },
    { iso: 'CO', name: 'Colombia', nameEs: 'Colombia', dial: '+57' },
    { iso: 'PE', name: 'Peru', nameEs: 'Perú', dial: '+51' },
    { iso: 'UY', name: 'Uruguay', nameEs: 'Uruguay', dial: '+598' },
    { iso: 'PY', name: 'Paraguay', nameEs: 'Paraguay', dial: '+595' },
    { iso: 'BO', name: 'Bolivia', nameEs: 'Bolivia', dial: '+591' },
    { iso: 'EC', name: 'Ecuador', nameEs: 'Ecuador', dial: '+593' },
    { iso: 'VE', name: 'Venezuela', nameEs: 'Venezuela', dial: '+58' },
    { iso: 'ES', name: 'Spain', nameEs: 'España', dial: '+34' },
    { iso: 'PT', name: 'Portugal', nameEs: 'Portugal', dial: '+351' },
    { iso: 'FR', name: 'France', nameEs: 'Francia', dial: '+33' },
    { iso: 'DE', name: 'Germany', nameEs: 'Alemania', dial: '+49' },
    { iso: 'IT', name: 'Italy', nameEs: 'Italia', dial: '+39' },
    { iso: 'GB', name: 'United Kingdom', nameEs: 'Reino Unido', dial: '+44' },
    { iso: 'NL', name: 'Netherlands', nameEs: 'Países Bajos', dial: '+31' },
    { iso: 'BE', name: 'Belgium', nameEs: 'Bélgica', dial: '+32' },
    { iso: 'CH', name: 'Switzerland', nameEs: 'Suiza', dial: '+41' },
    { iso: 'AT', name: 'Austria', nameEs: 'Austria', dial: '+43' },
    { iso: 'IE', name: 'Ireland', nameEs: 'Irlanda', dial: '+353' },
    { iso: 'SE', name: 'Sweden', nameEs: 'Suecia', dial: '+46' },
    { iso: 'NO', name: 'Norway', nameEs: 'Noruega', dial: '+47' },
    { iso: 'PL', name: 'Poland', nameEs: 'Polonia', dial: '+48' },
    { iso: 'GR', name: 'Greece', nameEs: 'Grecia', dial: '+30' },
    { iso: 'RO', name: 'Romania', nameEs: 'Rumania', dial: '+40' },
    { iso: 'UA', name: 'Ukraine', nameEs: 'Ucrania', dial: '+380' }
];

export function defaultPhoneCountry() {
    return PHONE_COUNTRIES.find((c) => c.default) || PHONE_COUNTRIES[0];
}

export function getPhoneCountryFlagUrl(iso) {
    const code = String(iso || '').trim().toLowerCase();
    if (!code) return '';
    return `https://flagcdn.com/w40/${code}.png`;
}

export function getPhoneCountryName(country, lang) {
    if (!country) return '';
    const useEs = (lang || 'es') === 'es';
    return useEs ? (country.nameEs || country.name) : country.name;
}

/**
 * Build E.164 phone from dial code (+54) and local digits entered by user.
 * Argentina (+54): inserts mobile prefix 9 when missing (549 + area + number).
 */
export function buildFullPhoneNumber(dial, localRaw) {
    const dialDigits = String(dial || '').replace(/\D/g, '') || '54';
    let local = String(localRaw || '').trim().replace(/\D/g, '');
    if (local.startsWith('0')) local = local.replace(/^0+/, '');

    if (dialDigits === '54') {
        if (local.startsWith('549')) local = local.slice(3);
        else if (local.startsWith('54')) local = local.slice(2);
        if (local && local[0] !== '9') local = `9${local}`;
    }

    if (!local) return '';
    return `+${dialDigits}${local}`;
}

/**
 * Split a stored E.164 phone number into dial code and local part for display.
 * Argentina (+54): strips the mobile 9 prefix so the user edits area+number only.
 */
export function splitE164Phone(fullPhone) {
    if (!fullPhone) return { dial: '+54', local: '' };
    const s = String(fullPhone).trim();
    const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
        const dialDigits = c.dial.replace(/\D/g, '');
        if (s.startsWith(`+${dialDigits}`)) {
            let local = s.slice(dialDigits.length + 1);
            if (dialDigits === '54' && local.startsWith('9')) {
                local = local.slice(1);
            }
            return { dial: c.dial, local };
        }
    }
    return { dial: '+54', local: s.replace(/[^0-9]/g, '') };
}

/**
 * Generate HTML for a phone country-code picker.
 * @param {string} prefix - unique ID prefix (e.g. 'upMobile', 'adminEditMobile')
 * @param {string} currentPhone - stored E.164 phone value (or empty)
 * @param {string} [inputId] - custom ID for the tel input (defaults to `${prefix}Input`)
 * @param {string} [placeholder] - input placeholder text
 * @returns {string} HTML string
 */
export function phonePickerHtml(prefix, currentPhone, inputId, placeholder) {
    const { dial, local } = splitE164Phone(currentPhone);
    const country = PHONE_COUNTRIES.find((c) => c.dial === dial) || defaultPhoneCountry();
    const flagUrl = getPhoneCountryFlagUrl(country.iso);
    const inpId = inputId || `${prefix}Input`;
    const ph = placeholder || '11 2345 6789';
    return `
        <div class="phone-picker-row">
            <div class="phone-picker-select" id="${prefix}Select">
                <button type="button" class="phone-picker-btn" id="${prefix}Btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Country code" style="background-image: url('${flagUrl}');">
                    <span class="phone-picker-code" id="${prefix}Code">${dial}</span>
                </button>
                <ul class="phone-picker-menu hidden" id="${prefix}Menu" role="listbox" aria-label="Country code"></ul>
            </div>
            <input type="tel" id="${inpId}" class="phone-picker-input" autocomplete="tel-national" placeholder="${ph}" value="${local}">
        </div>
        <input type="hidden" id="${prefix}Dial" value="${dial}">
    `;
}

/**
 * Mount (bind event handlers for) a phone country-code picker rendered by phonePickerHtml.
 * Call this AFTER the HTML is in the DOM.
 * @param {string} prefix - same prefix used in phonePickerHtml
 */
export function initPhonePicker(prefix) {
    const menu = document.getElementById(`${prefix}Menu`);
    const btn = document.getElementById(`${prefix}Btn`);
    const hiddenDial = document.getElementById(`${prefix}Dial`);
    const codeEl = document.getElementById(`${prefix}Code`);
    const select = document.getElementById(`${prefix}Select`);
    if (!menu || !btn || !hiddenDial) return;

    let selected = PHONE_COUNTRIES.find((c) => c.dial === hiddenDial.value) || defaultPhoneCountry();
    const lang = () => (localStorage.getItem('platform_lang') || 'es');

    const renderMenu = () => {
        menu.innerHTML = PHONE_COUNTRIES.map((c) => `
            <li class="phone-picker-option" role="option" data-dial="${c.dial}" data-iso="${c.iso}" aria-selected="${c.iso === selected.iso ? 'true' : 'false'}">
                <span class="phone-picker-option-dial">${c.dial}</span>
                <span class="phone-picker-option-name">${getPhoneCountryName(c, lang())}</span>
            </li>`).join('');

        menu.querySelectorAll('.phone-picker-option').forEach((opt) => {
            opt.addEventListener('click', () => {
                const iso = opt.getAttribute('data-iso');
                selected = PHONE_COUNTRIES.find((c) => c.iso === iso) || selected;
                menu.querySelectorAll('.phone-picker-option').forEach((o) => {
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
        if (btn) {
            btn.style.backgroundImage = `url('${getPhoneCountryFlagUrl(selected.iso)}')`;
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
        if (!select?.contains(e.target)) closeMenu();
    });

    renderMenu();
    renderSelected();
}
