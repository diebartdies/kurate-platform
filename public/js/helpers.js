import { API_URL } from './globals.js';
import { t, applyStaticTranslations } from './i18n.js';

// Marca/marca-modelo escrita a mano por el profesional ("otra"). Se guarda en
// el mismo array `brands` que las marcas del árbol, con este prefijo para poder
// distinguirla al editar y para no romper los filtros que comparan contra el
// serviceTree. El nombre visible es el que va después del prefijo.
export const OTRA_PREFIX = '__otra__:';

// Siglas técnicas que van en mayúsculas enteras aunque sean "palabras". Solo
// abreviaturas reales: sin esto, "smart tv" se formatearía "Smart Tv".
// Debe coincidir con utils/otraBrand.js (misma regla, versión ESM).
const OTRA_ACRONIMOS = new Set([
    'tv', 'led', 'lcd', 'oled', 'dvd', 'cd', 'usb', 'ac', 'dc', 'ups',
    'pvc', 'wifi', 'app', 'gps', 'dvr', 'dsl', 'hd', 'sd', 'amp', 'plc',
    'dab', 'ev', 'rlv', 'xl', 'xs', 'xxl'
]);

/**
 * Formatea un nombre de marca escrito a mano.
 * Reglas: trim + colapsar espacios; la inicial de cada palabra en mayúscula y
 * el resto en minúscula; palabras de un solo caracter en mayúscula; siglas
 * conocidas enteras en mayúsculas; se respetan guiones y barras ("Aire-Split",
 * "In-Out") tratando cada parte como una palabra.
 * "LAVAVAJILLAS"      -> "Lavavajillas"
 * "estufa de patio"   -> "Estufa De Patio"
 * "smart-tv"          -> "Smart-TV"
 * "aire  acondicionado"-> "Aire Acondicionado" (el doble espacio se colapsa)
 */
export function formatBrandName(raw) {
    if (raw === null || raw === undefined) return '';
    const cleaned = String(raw).replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned
        .split(' ')
        .map(word => {
            // El espacio siempre separa palabras; otra puntuación pegada dentro
            // de una palabra pasa a guion. "aire-split" -> "Aire-Split".
            const parts = word
                .replace(/[^A-Za-z0-9À-ÿ]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .split('-')
                .filter(Boolean);
            return parts.map(part => {
                if (OTRA_ACRONIMOS.has(part.toLowerCase())) return part.toUpperCase();
                if (part.length === 1) return part.toUpperCase();
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            }).join('-');
        })
        .filter(Boolean)
        .join(' ');
}

/** Nombre visible de una marca: si tiene el prefijo "otra", lo saca. */
export function brandDisplayName(brand) {
    if (typeof brand !== 'string') return '';
    return brand.startsWith(OTRA_PREFIX) ? brand.slice(OTRA_PREFIX.length) : brand;
}

/** true si la marca es una entrada "otra" escrita a mano. */
export function isOtherBrand(brand) {
    return typeof brand === 'string' && brand.startsWith(OTRA_PREFIX);
}

/** Devuelve el nombre limpio de la entrada "otra" guardada en un array, o ''. */
export function extractOtherBrand(brands) {
    if (!Array.isArray(brands)) return '';
    const found = brands.find(isOtherBrand);
    if (!found) return '';
    return found.slice(OTRA_PREFIX.length).trim();
}

export async function renderSpecialtyDropdown(containerId, preselectedServices = [], options = {}) {
    const { quality = '', context = 'form' } = options;
    let container = document.getElementById(containerId);
    if (!container) return;

    if (container.tagName !== 'DIV') {
        const div = document.createElement('div');
        div.id = container.id;
        div.className = container.className;
        container.parentNode.replaceChild(div, container);
        container = div;
    }

    let preselectedArr = [];
    if (preselectedServices) {
        if (Array.isArray(preselectedServices)) preselectedArr = preselectedServices;
        else if (typeof preselectedServices === 'string') preselectedArr = preselectedServices.split(',');
    }
    preselectedArr = preselectedArr.map(s => {
        if (typeof s === 'string') return s.trim();
        if (s && s.path) return s;
        return '';
    }).filter(Boolean);

    let tree = [];
    let defaultActions = [];
    try {
        const res = await fetch(`${API_URL}/service-tree`);
        const data = await res.json();
        if (data.success && data.data) tree = data.data;
        if (data.actions) defaultActions = data.actions;
        window._serviceTree = tree;
        window._defaultActions = defaultActions;
    } catch (e) {
        container.innerHTML = '<p style="color:var(--accent-red);">Error loading services.</p>';
        return;
    }

    // Build pathSet for brand pre-checking
    const pathSet = new Set(preselectedArr.map(s => {
        if (typeof s === 'string') return s.toLowerCase();
        if (s && s.path && s.brands) {
            return s.brands.map(b => {
                const bName = typeof b === 'string' ? b : b.name;
                return `${s.path}.${bName}`.toLowerCase();
            });
        }
        return '';
    }).flat().filter(Boolean));

    // Build actionsMap: { "hogar.linea-blanca.heladera": ["instalar","reparar"] }
    const actionsMap = {};
    preselectedArr.forEach(s => {
        if (s && s.path && Array.isArray(s.actions) && s.actions.length > 0) {
            actionsMap[s.path.toLowerCase()] = s.actions;
        }
    });

    if (!document.getElementById('serviceTreeStyles')) {
        const style = document.createElement('style');
        style.id = 'serviceTreeStyles';
        style.textContent = `
            .svc-tree { font-family: sans-serif; }
            .svc-area { margin-bottom: 8px; border: 1px solid rgba(212,175,55,0.2); border-radius: 8px; overflow: hidden; transition: border-color 0.3s; }
            .svc-area:hover { border-color: rgba(212,175,55,0.5); }
            .svc-area-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; background: rgba(212,175,55,0.06); user-select: none; transition: background 0.2s; }
            .svc-area-header:hover { background: rgba(212,175,55,0.12); }
            .svc-area-header .svc-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
            .svc-area-header .svc-name { flex: 1; font-weight: 700; color: var(--primary-gold); font-size: 0.95rem; }
            .svc-area-header .svc-count { font-size: 0.75rem; color: #888; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 10px; }
            .svc-area-header .svc-chevron { color: #666; transition: transform 0.3s; font-size: 0.8rem; }
            .svc-area.open .svc-chevron { transform: rotate(90deg); }
            .svc-children { display: none; padding: 6px 0; }
            .svc-area.open > .svc-children { display: block; }
            .svc-sub { margin: 0 8px 4px 8px; border-left: 2px solid rgba(212,175,55,0.15); padding-left: 10px; }
            .svc-sub-header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s; user-select: none; }
            .svc-sub-header:hover { background: rgba(255,255,255,0.04); }
            .svc-sub-header .svc-name { font-size: 0.85rem; color: #ccc; font-weight: 500; }
            .svc-sub-header .svc-chevron { color: #555; transition: transform 0.3s; font-size: 0.7rem; }
            .svc-sub.open > .svc-sub-header .svc-chevron { transform: rotate(90deg); }
            .svc-leaf { display: none; padding: 2px 0 2px 24px; }
            .svc-sub.open > .svc-leaf { display: block; }
            .svc-leaf-item { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid rgba(212,175,55,0.2); border-radius: 8px; cursor: pointer; transition: all 0.2s; background: rgba(255,255,255,0.03); margin: 3px 4px; }
            .svc-leaf-item:hover { background: rgba(212,175,55,0.08); border-color: rgba(212,175,55,0.4); }
            .svc-leaf-item input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
            .svc-leaf-item input[type="checkbox"] + .svc-cb-box { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; min-width: 18px; border: 2px solid #555; border-radius: 4px; background: transparent; transition: all 0.2s; flex-shrink: 0; }
            .svc-leaf-item input[type="checkbox"]:checked + .svc-cb-box { background: #2563eb; border-color: #2563eb; }
            .svc-leaf-item input[type="checkbox"]:checked + .svc-cb-box::after { content: '✓'; color: #fff; font-size: 12px; font-weight: 700; line-height: 1; }
            .svc-leaf-item input[type="checkbox"]:focus-visible + .svc-cb-box { outline: 2px solid #2563eb; outline-offset: 2px; }
            .svc-leaf-item .svc-cb-label { font-size: 0.83rem; color: #aaa; line-height: 18px; }
            .svc-leaf-item:has(input:checked) { border-color: #2563eb; background: rgba(37,99,235,0.08); }
            .svc-leaf-item input:checked ~ .svc-cb-label { color: #fff; }
            .svc-empty { color: #555; font-size: 0.8rem; font-style: italic; padding: 8px 12px; }
            .svc-toggle-all { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; font-size: 0.75rem; color: var(--primary-gold); background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.2); border-radius: 4px; cursor: pointer; transition: background 0.2s; margin-bottom: 6px; }
            .svc-toggle-all:hover { background: rgba(212,175,55,0.15); }
            .svc-brands { border-left: 1px dashed rgba(212,175,55,0.15); margin-left: 8px; padding-top: 2px; }
            .svc-brand-item { padding: 6px 12px !important; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
            .svc-brand-item:not(:last-child)::after { content: none; }
            .svc-brand-item:hover { background: rgba(212,175,55,0.05); }
            .svc-device { margin: 0 8px 4px 8px; border-left: 2px solid rgba(212,175,55,0.1); padding-left: 10px; }
            .svc-device.open > .svc-leaf { display: block; }
            .svc-brands-leaf { display:none; flex-wrap:wrap; gap:2px 0; align-items:center; padding: 2px 0 2px 24px; }
            .svc-device.open > .svc-brands-leaf { display:flex; }
            .svc-brand-wrapper { display: contents; }
            /* "Otra" + su input: ambos con la MISMA caja (24px) para que el texto
               y el campo queden alineados al centro. El label no puede heredar
               el line-height del body y el input no puede traer su padding por
               default: por eso los dos llevan height y line-height fijos. */
            .svc-brand-other { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; margin: 2px 0; border: 1px dashed rgba(212,175,55,0.35); border-radius: 12px; box-sizing: border-box; }
            .svc-brand-other.filled { border-style: solid; border-color: var(--primary-gold); background: rgba(212,175,55,0.1); }
            .svc-brand-other .svc-cb-label { display: flex; align-items: center; height: 24px; line-height: 24px; font-size: 0.78rem; color: var(--primary-gold); font-weight: 600; white-space: nowrap; }
            .svc-otra-input { box-sizing: border-box; height: 24px; line-height: 22px; background: rgba(0,0,0,0.3); border: 1px solid rgba(212,175,55,0.25); color: #fff; border-radius: 10px; padding: 0 10px; font-size: 0.78rem; font-family: inherit; min-width: 150px; }
            .svc-otra-input:focus { outline: none; border-color: var(--primary-gold); }
            .svc-otra-input::placeholder { color: #666; }
            .svc-actions { display: none; flex-wrap: wrap; gap: 4px; padding: 2px 0 6px 24px; align-items: center; }
            .svc-device.open > .svc-actions { display: flex; }
            .svc-actions-info { width: 100%; font-size: 0.7rem; color: #888; font-style: italic; margin-bottom: 2px; }
            .svc-action-chip { display: inline-flex; align-items: center; gap: 3px; padding: 3px 10px; border: 1px solid rgba(212,175,55,0.25); border-radius: 12px; cursor: pointer; font-size: 0.72rem; color: #999; background: rgba(255,255,255,0.03); transition: all 0.2s; user-select: none; }
            .svc-action-chip:hover { background: rgba(212,175,55,0.1); border-color: rgba(212,175,55,0.5); }
            .svc-action-chip.active { background: rgba(212,175,55,0.18); border-color: var(--primary-gold); color: var(--primary-gold); font-weight: 600; }
        `;
        document.head.appendChild(style);
    }

    const AREA_ICONS = {
        hogar: '🏠', oficina: '🏢', 'casa-campo': '🏡', industria: '⚙️'
    };

    container.innerHTML = '';
    const treeEl = document.createElement('div');
    treeEl.className = 'svc-tree';
    container.appendChild(treeEl);

    function matchesPreselected(path) {
        return pathSet.has(path.toLowerCase()) ||
            preselectedArr.some(ps => ps.toLowerCase().startsWith(path.toLowerCase() + '.') || path.toLowerCase().startsWith(ps.toLowerCase() + '.'));
    }

    function countDevices(cat) {
        if (!cat.devices) return 0;
        return cat.devices.length;
    }

    function renderBrand(brand, path) {
        const item = document.createElement('label');
        item.className = 'svc-leaf-item svc-brand-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = `${path}.${brand}`;
        cb.checked = pathSet.has(`${path}.${brand}`.toLowerCase());
        cb.className = 'dashboard-specialty-cb';

        const box = document.createElement('span');
        box.className = 'svc-cb-box';

        const sp = document.createElement('span');
        sp.className = 'svc-cb-label';
        sp.textContent = brand;

        item.appendChild(cb);
        item.appendChild(box);
        item.appendChild(sp);
        return item;
    }

    function renderDevice(device, parentPath) {
        const path = `${parentPath}.${device.id}`;
        const isOpen = false;

        const wrap = document.createElement('div');
        wrap.className = 'svc-device' + (isOpen ? ' open' : '');

        const header = document.createElement('div');
        header.className = 'svc-sub-header';

        const chevron = document.createElement('span');
        chevron.className = 'svc-chevron';
        chevron.textContent = '▶';

        const name = document.createElement('span');
        name.className = 'svc-name';
        name.textContent = t(device.name);

        const hasBrandList = !!(device.brands && device.brands.length > 0);
        const brandCount = document.createElement('span');
        brandCount.className = 'svc-count';
        // Para educación no hay marcas, mostrar nivel en vez de "sin marcas"
        const isEducacion = device.area === 'educacion' || (device.path && device.path.startsWith('educacion/'));
        brandCount.textContent = hasBrandList ? `${device.brands.length} marcas` : (isEducacion ? '' : 'sin marcas');

        header.appendChild(chevron);
        header.appendChild(name);
        header.appendChild(brandCount);

        header.addEventListener('click', (e) => {
            e.stopPropagation();
            wrap.classList.toggle('open');
        });

        wrap.appendChild(header);

        {
            const brandContainer = document.createElement('div');
            brandContainer.className = 'svc-brands-leaf';
            if (hasBrandList) {
            // Opción "Todas" — selecciona todas las marcas de este dispositivo
            const allItem = document.createElement('label');
            allItem.className = 'svc-leaf-item svc-brand-item';
            allItem.style.fontWeight = '700';
            allItem.style.borderStyle = 'dashed';
            const allCb = document.createElement('input');
            allCb.type = 'checkbox';
            allCb.value = path + '.__todas__';
            allCb.className = 'dashboard-specialty-cb';
            const allChecked = device.brands.every(b => pathSet.has(`${path}.${b}`.toLowerCase()));
            allCb.checked = allChecked;
            const allBox = document.createElement('span'); allBox.className = 'svc-cb-box';
            const allSp = document.createElement('span'); allSp.className = 'svc-cb-label'; allSp.textContent = 'Todas';
            allItem.appendChild(allCb); allItem.appendChild(allBox); allItem.appendChild(allSp);
            allCb.addEventListener('change', () => {
                if (allCb.checked && !hasActiveAction()) {
                    allCb.checked = false;
                    noActionWarning.style.display = 'block';
                    return;
                }
                const target = allCb.checked;
                const cbs = brandContainer.querySelectorAll('input.dashboard-specialty-cb:not([value$=".__todas__"])');
                cbs.forEach(cb => { cb.checked = target; cb.dispatchEvent(new Event('change', { bubbles: true })); });
                updateDeviceActionsVisibility();
                brandContainer.dispatchEvent(new Event('change', { bubbles: true }));
            });
            brandContainer.appendChild(allItem);
            device.brands.forEach(brand => {
                const el = renderBrand(brand, path);
                const cb = el.querySelector('input');
                if (cb) cb.addEventListener('change', () => {
                    if (cb.checked && !hasActiveAction()) {
                        cb.checked = false;
                        noActionWarning.style.display = 'block';
                        return;
                    }
                    const all = brandContainer.querySelectorAll('input.dashboard-specialty-cb:not([value$=".__todas__"])');
                    const checked = brandContainer.querySelectorAll('input.dashboard-specialty-cb:not([value$=".__todas__"]):checked');
                    allCb.checked = all.length > 0 && checked.length === all.length;
                    updateDeviceActionsVisibility();
                    brandContainer.dispatchEvent(new Event('change', { bubbles: true }));
                });
                brandContainer.appendChild(el);
            });
            } // fin if (hasBrandList)

            // Entrada "Otra": campo de texto libre para una marca que no está en
            // la lista. No es un checkbox para no romper la lógica de "Todas" ni
            // los :not([value$=".__todas__"]) que recorren el árbol.
            const savedOther = extractOtherBrand(
                (preselectedArr.find(s => s && s.path && s.path.toLowerCase() === path.toLowerCase()) || {}).brands
            );
            const otherWrap = document.createElement('div');
            otherWrap.className = 'svc-brand-other';
            const otherLabel = document.createElement('span');
            otherLabel.className = 'svc-cb-label';
            otherLabel.textContent = 'Otra';
            const otherInput = document.createElement('input');
            otherInput.type = 'text';
            otherInput.className = 'svc-otra-input';
            otherInput.dataset.otraFor = path;
            otherInput.placeholder = 'Escribí la marca';
            otherInput.maxLength = 60;
            otherInput.value = savedOther;
            otherInput.addEventListener('input', () => {
                const caret = otherInput.selectionStart;
                const formatted = formatBrandName(otherInput.value);
                if (formatted !== otherInput.value) otherInput.value = formatted;
                if (caret !== null) otherInput.setSelectionRange(caret, caret);
                // Misma regla que los checkboxes de marca: sin acción no se
                // guarda la marca. Se avisa y se limpia el texto.
                if (formatted && !hasActiveAction()) {
                    noActionWarning.textContent = '⚠ Elegí al menos una acción antes de escribir una marca.';
                    noActionWarning.style.display = 'block';
                    otherInput.value = '';
                    otherWrap.classList.remove('filled');
                    return;
                }
                noActionWarning.style.display = 'none';
                otherWrap.classList.toggle('filled', !!formatted);
                updateDeviceActionsVisibility();
                brandContainer.dispatchEvent(new Event('change', { bubbles: true }));
            });
            otherWrap.classList.toggle('filled', !!savedOther);
            otherWrap.appendChild(otherLabel);
            otherWrap.appendChild(otherInput);
            brandContainer.appendChild(otherWrap);

            wrap.appendChild(brandContainer);

            // Action chips at device level (shared across all brands)
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'svc-actions';
            const infoText = document.createElement('div');
            infoText.className = 'svc-actions-info';
            infoText.textContent = 'Seleccioná solo las acciones que sepas realizar en este dispositivo.';
            actionsContainer.appendChild(infoText);

            const preselectedActions = actionsMap[path.toLowerCase()] || [];

            // Warning element for no-action-selected
            const noActionWarning = document.createElement('div');
            noActionWarning.className = 'svc-no-action-warning';
            noActionWarning.style.cssText = 'color:#f59e0b;font-size:0.8rem;margin-top:4px;display:none';
            noActionWarning.textContent = '⚠ Elegí al menos una acción antes de seleccionar marcas.';
            actionsContainer.appendChild(noActionWarning);

            function hasActiveAction() {
                return actionsContainer.querySelectorAll('.svc-action-chip.active').length > 0;
            }

            defaultActions.forEach(action => {
                const chip = document.createElement('span');
                chip.className = 'svc-action-chip';
                chip.dataset.action = action.id;
                chip.dataset.devicePath = path;
                chip.textContent = action.name;
                if (preselectedActions.includes(action.id)) {
                    chip.classList.add('active');
                }
                chip.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const willDeactivate = chip.classList.contains('active');
                    const anyBrandChecked = brandContainer.querySelectorAll('input.dashboard-specialty-cb:not([value$=".__todas__"]):checked').length > 0;
                    const hasOtherBrand = !!(otherInput && formatBrandName(otherInput.value));
                    if (willDeactivate && (anyBrandChecked || hasOtherBrand) && hasActiveAction() && actionsContainer.querySelectorAll('.svc-action-chip.active').length <= 1) {
                        noActionWarning.textContent = '⚠ No podés quitar la última acción si hay marcas seleccionadas.';
                        noActionWarning.style.display = 'block';
                        return;
                    }
                    chip.classList.toggle('active');
                    noActionWarning.style.display = 'none';
                    treeEl.dispatchEvent(new Event('change', { bubbles: true }));
                });
                actionsContainer.appendChild(chip);
            });
            wrap.appendChild(actionsContainer);

            // Show/hide actions based on whether any brand is checked
            const updateDeviceActionsVisibility = () => {
                const anyChecked = brandContainer.querySelectorAll('input.dashboard-specialty-cb:not([value$=".__todas__"]):checked').length > 0;
                // "Otra" no es checkbox: cuenta como marca elegida si tiene texto.
                const hasOther = !!(otherInput && formatBrandName(otherInput.value));
                if (anyChecked || hasOther) {
                    wrap.classList.add('device-checked');
                } else {
                    wrap.classList.remove('device-checked');
                }
            };
            // Store on wrap so brand change handlers can call it
            wrap._updateActions = updateDeviceActionsVisibility;
            // Initial state
            updateDeviceActionsVisibility();
        }

        return wrap;
    }

    function renderCategory(cat, parentPath) {
        const path = `${parentPath}.${cat.id}`;
        const isOpen = false;

        const wrap = document.createElement('div');
        wrap.className = 'svc-sub' + (isOpen ? ' open' : '');

        const header = document.createElement('div');
        header.className = 'svc-sub-header';

        const chevron = document.createElement('span');
        chevron.className = 'svc-chevron';
        chevron.textContent = '▶';

        const name = document.createElement('span');
        name.className = 'svc-name';
        name.textContent = t(cat.name);

        const devCount = document.createElement('span');
        devCount.className = 'svc-count';
        devCount.textContent = `${countDevices(cat)} dispositivos`;

        header.appendChild(chevron);
        header.appendChild(name);
        header.appendChild(devCount);

        if (cat.devices && cat.devices.length > 0) {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                wrap.classList.toggle('open');
            });
        }

        wrap.appendChild(header);

        if (cat.devices && cat.devices.length > 0) {
            const deviceContainer = document.createElement('div');
            deviceContainer.className = 'svc-leaf';
            cat.devices.forEach(device => {
                deviceContainer.appendChild(renderDevice(device, path));
            });
            wrap.appendChild(deviceContainer);
        }

        return wrap;
    }

    tree.forEach(area => {
        const isOpen = false;
        const areaEl = document.createElement('div');
        areaEl.className = 'svc-area' + (isOpen ? ' open' : '');

        const header = document.createElement('div');
        header.className = 'svc-area-header';

        const icon = document.createElement('div');
        icon.className = 'svc-icon';
        icon.textContent = AREA_ICONS[area.id] || '📦';

        const name = document.createElement('div');
        name.className = 'svc-name';
        name.textContent = t(area.name);

        const catCount = document.createElement('div');
        catCount.className = 'svc-count';
        catCount.textContent = `${area.categories.length} categorías`;

        const chevron = document.createElement('div');
        chevron.className = 'svc-chevron';
        chevron.textContent = '▶';

        header.appendChild(icon);
        header.appendChild(name);
        header.appendChild(catCount);
        header.appendChild(chevron);

        header.addEventListener('click', () => areaEl.classList.toggle('open'));

        areaEl.appendChild(header);

        if (area.categories && area.categories.length > 0) {
            const catContainer = document.createElement('div');
            catContainer.className = 'svc-children';
            area.categories.forEach(cat => {
                catContainer.appendChild(renderCategory(cat, area.id));
            });
            areaEl.appendChild(catContainer);
        }

        treeEl.appendChild(areaEl);
    });

    function recalcAllCounts() {
        treeEl.querySelectorAll('.svc-area').forEach(areaEl => {
            const catCountEl = areaEl.querySelector(':scope > .svc-area-header .svc-count');
            if (!catCountEl) return;
            const catContainer = areaEl.querySelector(':scope > .svc-children');
            if (!catContainer) return;
            const brandCbs = catContainer.querySelectorAll('.dashboard-specialty-cb:not([value$=".__todas__"]):checked');
            const selectedBrands = brandCbs.length;
            let totalActions = 0;
            catContainer.querySelectorAll('.svc-action-chip.active').forEach(() => totalActions++);
            if (selectedBrands > 0) {
                catCountEl.textContent = `${selectedBrands} marcas`;
                if (totalActions > 0) catCountEl.textContent += ` · ${totalActions} acciones`;
                catCountEl.style.color = 'var(--primary-gold)';
                catCountEl.style.fontWeight = '700';
            } else {
                catCountEl.textContent = `${catContainer.querySelectorAll('.svc-sub').length} categorías`;
                catCountEl.style.color = '';
                catCountEl.style.fontWeight = '';
            }
        });
        treeEl.querySelectorAll('.svc-sub').forEach(catEl => {
            const devCountEl = catEl.querySelector(':scope > .svc-sub-header .svc-count');
            if (!devCountEl) return;
            const deviceContainer = catEl.querySelector(':scope > .svc-leaf');
            if (!deviceContainer) return;
            const brandCbs = deviceContainer.querySelectorAll('.dashboard-specialty-cb:not([value$=".__todas__"]):checked');
            const selectedBrands = brandCbs.length;
            let totalActions = 0;
            deviceContainer.querySelectorAll('.svc-action-chip.active').forEach(() => totalActions++);
            if (selectedBrands > 0) {
                devCountEl.textContent = `${selectedBrands} marcas`;
                if (totalActions > 0) devCountEl.textContent += ` · ${totalActions} acciones`;
                devCountEl.style.color = 'var(--primary-gold)';
                devCountEl.style.fontWeight = '700';
            } else {
                devCountEl.textContent = `${deviceContainer.querySelectorAll('.svc-device').length} dispositivos`;
                devCountEl.style.color = '';
                devCountEl.style.fontWeight = '';
            }
        });
    }

    treeEl.addEventListener('change', recalcAllCounts);
    recalcAllCounts();
}

// Populates location dropdowns dynamically based on current API relationships
export async function setupLocationDropdowns(provinceId, cityId, neighborhoodId, isFilter = false, prefillData = {}) {
    const provinceEl = document.getElementById(provinceId);
    let cityEl = document.getElementById(cityId);
    let neighborhoodEl = neighborhoodId ? document.getElementById(neighborhoodId) : null;

    if (!provinceEl || provinceEl.tagName !== 'SELECT') return;

    const cabaNeighborhoods = [
        "Agronomía", "Almagro", "Balvanera", "Barracas", "Belgrano", "Boedo", 
        "Caballito", "Chacarita", "Coghlan", "Colegiales", "Constitución", 
        "Flores", "Floresta", "La Boca", "La Paternal", "Liniers", "Mataderos", 
        "Monte Castro", "Montserrat", "Nueva Pompeya", "Núñez", "Palermo", 
        "Parque Avellaneda", "Parque Chacabuco", "Parque Chas", "Parque Patricios", 
        "Puerto Madero", "Recoleta", "Retiro", "Saavedra", "San Cristóbal", 
        "San Nicolás", "San Telmo", "Vélez Sársfield", "Versalles", "Villa Crespo", 
        "Villa del Parque", "Villa Devoto", "Villa General Mitre", "Villa Lugano", 
        "Villa Luro", "Villa Ortúzar", "Villa Pueyrredón", "Villa Real", 
        "Villa Riachuelo", "Villa Santa Rita", "Villa Soldati", "Villa Urquiza"
    ];

    const argProvinces = [
        "CABA", "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", 
        "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", 
        "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", 
        "Santiago del Estero", "Tierra del Fuego", "Tucumán"
    ];

    // Helper to dynamically switch a dropdown to a text input
    const morphToInput = (el, placeholderText, prefillValue) => {
        if (!el) return null;
        if (el.tagName === 'INPUT') {
            el.placeholder = placeholderText;
            if (prefillValue) el.value = prefillValue;
            return el;
        }
        const input = document.createElement('input');
        input.type = 'text';
        input.id = el.id;
        input.className = el.className || 'form-select'; // Keep existing styling
        if (el.name) input.name = el.name;
        input.placeholder = placeholderText;
        input.value = prefillValue || '';
        el.parentNode.replaceChild(input, el);
        return input;
    };

    // Helper to dynamically switch a text input back to a dropdown
    const morphToSelect = (el) => {
        if (!el || el.tagName === 'SELECT') return el;
        const select = document.createElement('select');
        select.id = el.id;
        select.className = el.className || 'form-select';
        if (el.name) select.name = el.name;
        el.parentNode.replaceChild(select, el);
        return select;
    };

    const defaultText = isFilter ? t('All Provinces') : t('Select Province');
    provinceEl.innerHTML = `<option value="">${defaultText}</option>`;
    
    let fetchedProvinces = false;
    try {
        const res = await fetch(`${API_URL}/locations/provinces?limit=100`);
        const data = await res.json();
        if (data.success && data.data) {
            let pList = Array.isArray(data.data) ? data.data : (data.data.provinces || []);
            if (pList.length > 0) {
                fetchedProvinces = true;
                pList.forEach(p => {
                    const val = typeof p === 'string' ? p : (p.name || '');
                    if (!val) return;
                    const id = typeof p === 'string' ? '' : (p._id || '');
                    const opt = document.createElement('option');
                    opt.value = val;
                    if (id) opt.dataset.id = id;
                    opt.textContent = val;
                    if (prefillData.province === val) opt.selected = true;
                    provinceEl.appendChild(opt);
                });
            }
        }
    } catch (e) {
        console.error('Failed to load provinces from API', e);
    }
    
    if (!fetchedProvinces) {
        argProvinces.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            if (prefillData.province === val) opt.selected = true;
            provinceEl.appendChild(opt);
        });
    }

    const loadSublocations = async () => {
        // Re-fetch elements in case they were morphed by previous selections
        cityEl = document.getElementById(cityId);
        neighborhoodEl = neighborhoodId ? document.getElementById(neighborhoodId) : null;

        const provinceName = (provinceEl.value || '').trim();
        const isCaba = provinceName.toLowerCase() === 'caba';
        const selectedOption = provinceEl.options[provinceEl.selectedIndex];
        const provId = selectedOption ? selectedOption.dataset.id : null;
        
        if (neighborhoodEl && isFilter) {
            neighborhoodEl.style.display = isCaba ? 'none' : 'block';
        }

        if (!provinceName) {
            cityEl = morphToSelect(cityEl);
            neighborhoodEl = morphToSelect(neighborhoodEl);
            if (cityEl) { cityEl.innerHTML = `<option value="">${isFilter ? t('All Cities') : t('Select City')}</option>`; cityEl.disabled = true; }
            if (neighborhoodEl) { neighborhoodEl.innerHTML = `<option value="">${isFilter ? t('All Neighborhoods') : t('Select Neighborhood')}</option>`; neighborhoodEl.disabled = true; }
            return;
        }

        let loadedFromApi = false;
        if (provId) {
            try {
                const res = await fetch(`${API_URL}/locations/provinces/${provId}/sublocations?limit=500&_=${new Date().getTime()}`);
                const data = await res.json();
                if (data.success && data.data) {
                    loadedFromApi = true;
                    if (isCaba) {
                        cityEl = morphToSelect(cityEl);
                        cityEl.innerHTML = `<option value="">${isFilter ? t('All Neighborhoods') : t('Select Neighborhood')}</option>`;
                        
                        let nList = Array.isArray(data.data) ? data.data : (data.data.neighborhoods || []);
                        if (nList.length === 0) nList = cabaNeighborhoods.map(name => ({ name }));
                        
                        nList.forEach(n => {
                            const val = typeof n === 'string' ? n : (n.name || '');
                            if (!val) return;
                            const opt = document.createElement('option');
                            opt.value = val;
                            opt.textContent = val;
                            if (prefillData.neighborhood === val || prefillData.city === val) opt.selected = true;
                            cityEl.appendChild(opt);
                        });
                        cityEl.disabled = false;
                        if (neighborhoodEl) neighborhoodEl.style.display = 'none';
                    } else {
                        cityEl = morphToSelect(cityEl);
                        cityEl.innerHTML = `<option value="">${isFilter ? t('All Cities') : t('Select City')}</option>`;
                        
                        let cList = Array.isArray(data.data) ? data.data : (data.data.cities || []);
                        cList.forEach(c => {
                            const val = typeof c === 'string' ? c : (c.name || '');
                            if (!val) return;
                            const opt = document.createElement('option');
                            opt.value = val;
                            opt.textContent = val;
                            if (prefillData.city === val) opt.selected = true;
                            cityEl.appendChild(opt);
                        });
                        cityEl.disabled = false;
                        if (neighborhoodEl) {
                            neighborhoodEl.style.display = 'block';
                            neighborhoodEl = morphToInput(neighborhoodEl, isFilter ? t('Neighborhood...') : t('Enter Neighborhood'), prefillData.neighborhood);
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to load sublocations', e);
            }
        }

        if (!loadedFromApi) {
            if (isCaba) {
                cityEl = morphToSelect(cityEl);
                cityEl.innerHTML = `<option value="">${isFilter ? t('All Neighborhoods') : t('Select Neighborhood')}</option>`;
                cabaNeighborhoods.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    if (prefillData.neighborhood === val || prefillData.city === val) opt.selected = true;
                    cityEl.appendChild(opt);
                });
                cityEl.disabled = false;
                if (neighborhoodEl) neighborhoodEl.style.display = 'none';
            } else {
                cityEl = morphToInput(cityEl, isFilter ? t('City...') : t('Enter City'), prefillData.city);
                cityEl.disabled = false;
                if (neighborhoodEl) {
                    neighborhoodEl.style.display = 'block';
                    neighborhoodEl = morphToInput(neighborhoodEl, isFilter ? t('Neighborhood...') : t('Enter Neighborhood'), prefillData.neighborhood);
                }
            }
        }

        // Clear prefill after first load
        if (prefillData.city) prefillData.city = '';
        if (prefillData.neighborhood) prefillData.neighborhood = '';
        
        if (cityEl) applyStaticTranslations(cityEl);
        if (neighborhoodEl) applyStaticTranslations(neighborhoodEl);
        
        // Guarantee facet counts are recalculated immediately after dynamic options are loaded
        if (typeof window.applyCountsToDropdowns === 'function') {
            setTimeout(applyCountsToDropdowns, 100);
        }
    };

    provinceEl.addEventListener('change', loadSublocations);
    
    // Always execute once on setup to clear any default "Loading..." text from sub-dropdowns
    await loadSublocations();
}

// Auto-fill "Código Postal" (CPA) from the entered address using the Correo
// Argentino web service (proxied by the backend). The field is only filled when
// it is empty or still holds a previous auto-filled value, so manually typed
// codes are never overwritten. Re-triggers as the address changes.
export function initCpaAutofill({ streetId, numberId, provinceId, cityId, postCodeId }, delay = 700) {
    const streetEl = document.getElementById(streetId);
    const numberEl = document.getElementById(numberId);
    const provinceEl = document.getElementById(provinceId);
    const cityEl = document.getElementById(cityId);
    const postEl = document.getElementById(postCodeId);
    if (!streetEl || !numberEl || !provinceEl || !postEl) return;
    if (postEl.dataset.cpaBound === '1') return;
    postEl.dataset.cpaBound = '1';

    let timer = null;
    let lastAuto = '';

    const trigger = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const street = (streetEl.value || '').trim();
            const number = (numberEl.value || '').trim();
            const province = (provinceEl.value || '').trim();
            const city = (cityEl && cityEl.value || '').trim();
            if (!street || !number || !province) return;
            const current = postEl.value || '';
            if (current && current !== lastAuto) return; // respect manual entry
            try {
                const res = await fetch(`${API_URL}/cpa/lookup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ province, city, street, number })
                });
                const data = await res.json();
                if (data.success && data.cpa) {
                    lastAuto = data.cpa;
                    postEl.value = data.cpa;
                }
            } catch (e) {
                /* lookup unavailable -> leave the field editable */
            }
        }, delay);
    };

    [streetEl, numberEl, provinceEl, cityEl].forEach(el => el && el.addEventListener('change', trigger));
    [streetEl, numberEl].forEach(el => el && el.addEventListener('input', trigger));
    postEl.addEventListener('input', () => { if (postEl.value !== lastAuto) lastAuto = ''; });
}

// Reads the rendered service tree and returns structured services
// [{ path, name, actions, brands }] for checked device/brand leaves, mirroring
// the shape stored in professionalProfile.hogarProfile.services.
export function collectTreeServices(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const devices = container.querySelectorAll('.svc-device');
    const result = [];
    devices.forEach(deviceEl => {
        const brandCbs = deviceEl.querySelectorAll('.svc-brands-leaf input.dashboard-specialty-cb:not([value$=".__todas__"]):checked');
        const otherInput = deviceEl.querySelector('.svc-otra-input');
        const otherName = otherInput ? formatBrandName(otherInput.value) : '';
        if (!brandCbs.length && !otherName) return;
        const brands = [];
        brandCbs.forEach(cb => {
            const parts = cb.value.split('.');
            brands.push(parts[parts.length - 1]);
        });
        // La marca escrita en "Otra" viaja en brands con el prefijo para que el
        // servidor y los filtros puedan distinguirla de una marca del árbol.
        if (otherName) brands.push(OTRA_PREFIX + otherName);
        const pathSource = otherName
            ? (otherInput.dataset.otraFor || '')
            : (brandCbs[0] ? brandCbs[0].value : '');
        if (!pathSource) return;
        const devicePath = otherName
            ? pathSource
            : pathSource.substring(0, pathSource.lastIndexOf('.'));
        const tree = window._serviceTree || [];
        let deviceName = devicePath.split('.').pop();
        for (const area of tree) {
            for (const cat of (area.categories || [])) {
                for (const dev of (cat.devices || [])) {
                    if (`${area.id}.${cat.id}.${dev.id}` === devicePath) {
                        deviceName = dev.name;
                        break;
                    }
                }
            }
        }
        const actions = [];
        deviceEl.querySelectorAll('.svc-actions .svc-action-chip.active').forEach(chip => {
            actions.push(chip.dataset.action);
        });
        result.push({ path: devicePath, name: deviceName, actions, brands });
    });
    return result;
}

export async function renderProfessionsPicker(containerId, preselected = []) {
    let container = document.getElementById(containerId);
    if (!container) return;

    // Estado por profesion: slug -> { name, matriculado, matriculaNumero, matriculaVerificada }
    const state = new Map();
    (preselected || []).forEach(p => {
        if (!p) return;
        const slug = typeof p === 'string' ? p : (p && p.slug);
        if (!slug) return;
        state.set(slug.toLowerCase(), {
            name: (typeof p === 'string' ? p : p.name) || slug,
            matriculado: typeof p === 'string' ? false : !!p.matriculado,
            matriculaNumero: (typeof p === 'string' ? '' : p.matriculaNumero) || '',
            matriculaVerificada: typeof p === 'string' ? false : !!p.matriculaVerificada,
            matriculaRechazada: typeof p === 'string' ? false : !!p.matriculaRechazada,
            matriculaFoto: typeof p === 'string' ? '' : (p.matriculaFoto || '')
        });
    });

    let professions = [];
    try {
        const res = await fetch(`${API_URL}/professions`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) professions = data.data;
    } catch (e) {
        container.innerHTML = '<p style="color:var(--accent-red);">Error cargando profesiones.</p>';
        return;
    }

    if (professions.length === 0) {
        container.innerHTML = '<span style="color:#888; font-size:0.85rem;">Sin profesiones disponibles.</span>';
        return;
    }

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function render() {
        container.innerHTML = professions.map(p => {
            const key = p.slug.toLowerCase();
            const st = state.get(key);
            const checked = !!st;
            const regulated = !!p.regulated;
            return `
                <div class="prof-pick" data-prof-wrap="${p.slug}" style="margin-bottom:${regulated ? '2px' : '0'};">
                    <label class="svc-leaf-item" style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid rgba(212,175,55,0.2); border-radius:8px; cursor:pointer; background:rgba(255,255,255,0.03);">
                        <input type="checkbox" data-profession-slug="${p.slug}" ${checked ? 'checked' : ''} style="position:absolute; opacity:0; width:0; height:0; pointer-events:none;">
                        <span class="svc-cb-box" style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; min-width:18px; border:2px solid #555; border-radius:4px; background:transparent; flex-shrink:0;"></span>
                        <span class="svc-cb-label" style="font-size:0.83rem; color:#aaa;">${esc(p.name)}</span>
                    </label>
                    ${regulated ? `
                    <div class="prof-matricula" data-prof-matricula="${p.slug}" ${checked ? '' : 'hidden'} style="margin:6px 0 10px 6px; padding:10px 12px; border-left:2px solid rgba(184,146,46,0.4); background:rgba(184,146,46,0.05); border-radius:0 8px 8px 0;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.83rem;">
                            <input type="checkbox" data-prof-matriculado="${p.slug}" ${st && st.matriculado ? 'checked' : ''}>
                            <span>Soy matriculado en ${esc(p.name)}</span>
                        </label>
                        <div class="prof-mat-fields" data-prof-mat-fields="${p.slug}" ${st && st.matriculado ? '' : 'hidden'} style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                            <input type="text" data-prof-matricula-numero="${p.slug}" value="${st ? esc(st.matriculaNumero) : ''}" placeholder="N° de matrícula" maxlength="40" style="flex:1; min-width:150px; padding:7px 10px; background:#1a1a2e; border:1px solid #333; border-radius:6px; color:#eee; font-size:0.82rem;">
                            <label style="font-size:0.78rem; color:#999; cursor:pointer; display:flex; align-items:center; gap:6px;">
                                <span>Foto/PDF del título</span>
                                <input type="file" data-prof-matricula-file="${p.slug}" accept="image/jpeg,image/png,image/webp,application/pdf" style="font-size:0.75rem;">
                            </label>
                        </div>
                        <p style="font-size:0.72rem; color:#888; margin:6px 0 0;">Cargá el número o el título. Un administrador verifica la matriculación${st && st.matriculaVerificada ? ' — <span style="color:#5cb85c;">ya verificada</span>' : ''}${st && st.matriculaRechazada ? ' — <span style="color:#d9534f;">rechazada, actualizala</span>' : ''}.</p>
                    </div>` : ''}
                </div>`;
        }).join('');
    }

    function syncMatriculaVisibility(slug) {
        const box = container.querySelector(`[data-prof-matricula="${slug}"]`);
        if (!box) return;
        const check = container.querySelector(`[data-profession-slug="${slug}"]`);
        box.hidden = !check || !check.checked;
    }

function syncFieldsVisibility(slug) {
        // Scoped por slug: con dos oficios regulados (gasista/electricista) un
        // selector global movia los campos del oficio equivocado.
        const fields = container.querySelector(`[data-prof-mat-fields="${slug}"]`);
        if (!fields) return;
        const chk = container.querySelector(`input[data-prof-matriculado="${slug}"]`);
        fields.hidden = !chk || !chk.checked;
    }

    render();

    container.querySelectorAll('input[data-profession-slug]').forEach(input => {
        input.addEventListener('change', () => {
            const slug = input.dataset.professionSlug;
            const p = professions.find(x => x.slug === slug);
            if (input.checked) {
                const prev = state.get(slug.toLowerCase());
                state.set(slug.toLowerCase(), prev || { name: (p && p.name) || slug, matriculado: false, matriculaNumero: '', matriculaVerificada: false, matriculaRechazada: false, matriculaFoto: '' });
            } else {
                state.delete(slug.toLowerCase());
            }
            syncMatriculaVisibility(slug);
        });
    });

    container.querySelectorAll('input[data-prof-matriculado]').forEach(input => {
        input.addEventListener('change', () => {
            const slug = input.dataset.profMatriculado;
            const st = state.get(slug.toLowerCase());
            if (st) st.matriculado = input.checked;
            syncFieldsVisibility(slug);
        });
    });

    container.querySelectorAll('input[data-prof-matricula-numero]').forEach(input => {
        input.addEventListener('input', () => {
            const slug = input.dataset.profMatriculaNumero;
            const st = state.get(slug.toLowerCase());
            if (st) st.matriculaNumero = input.value;
        });
    });
}

// Devuelve [{slug, matriculado, matriculaNumero}] para el PUT de profesiones.
// Los archivos adjuntos se suben aparte: este endpoint es JSON.
// containerId permite reutilizarla en el editor del admin (#adminEditProfessions),
// que usa el mismo picker pero otro contenedor.
export function collectProfessions(containerId = 'upProfessions') {
    const root = document.getElementById(containerId);
    if (!root) return [];
    const out = [];
    root.querySelectorAll('input[data-profession-slug]:checked').forEach(input => {
        const slug = input.dataset.professionSlug;
        const matInput = root.querySelector(`input[data-prof-matriculado="${slug}"]`);
        const numInput = root.querySelector(`input[data-prof-matricula-numero="${slug}"]`);
        out.push({
            slug,
            matriculado: !!(matInput && matInput.checked),
            matriculaNumero: numInput ? numInput.value.trim() : ''
        });
    });
    return out;
}

// Archivos de matricula pendientes de subir: [{slug, file}]. Se sube DESPUES
// del PUT de profesiones, porque el endpoint exige matriculado=true.
export function collectMatriculaFiles(containerId = 'upProfessions') {
    const root = document.getElementById(containerId);
    if (!root) return [];
    const out = [];
    root.querySelectorAll('input[data-prof-matricula-file]').forEach(input => {
        if (input.files && input.files[0]) {
            out.push({ slug: input.dataset.profMatriculaFile, file: input.files[0] });
        }
    });
    return out;
}
