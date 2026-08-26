import { API_URL } from './globals.js';
import { t, applyStaticTranslations } from './i18n.js';

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
    preselectedArr = preselectedArr.map(s => (s || '').trim()).filter(Boolean);

    let tree = [];
    try {
        const res = await fetch(`${API_URL}/service-tree`);
        const data = await res.json();
        if (data.success && data.data) tree = data.data;
    } catch (e) {
        container.innerHTML = '<p style="color:var(--accent-red);">Error loading services.</p>';
        return;
    }

    const pathSet = new Set(preselectedArr.map(s => s.toLowerCase()));

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
            .svc-leaf-item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: background 0.15s; }
            .svc-leaf-item:hover { background: rgba(212,175,55,0.08); }
            .svc-leaf-item input[type="checkbox"] { accent-color: var(--primary-gold); cursor: pointer; }
            .svc-leaf-item span { font-size: 0.83rem; color: #aaa; }
            .svc-leaf-item input:checked + span { color: var(--primary-gold); }
            .svc-empty { color: #555; font-size: 0.8rem; font-style: italic; padding: 8px 12px; }
            .svc-toggle-all { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; font-size: 0.75rem; color: var(--primary-gold); background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.2); border-radius: 4px; cursor: pointer; transition: background 0.2s; margin-bottom: 6px; }
            .svc-toggle-all:hover { background: rgba(212,175,55,0.15); }
            .svc-brands { border-left: 1px dashed rgba(212,175,55,0.15); margin-left: 8px; padding-top: 2px; }
            .svc-brand-item { padding: 2px 6px !important; }
            .svc-brand-item:hover { background: rgba(212,175,55,0.05); }
            .svc-device { margin: 0 8px 4px 8px; border-left: 2px solid rgba(212,175,55,0.1); padding-left: 10px; }
            .svc-device.open > .svc-leaf { display: block; }
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

        const sp = document.createElement('span');
        sp.textContent = brand;

        item.appendChild(cb);
        item.appendChild(sp);
        return item;
    }

    function renderDevice(device, parentPath) {
        const path = `${parentPath}.${device.id}`;
        const isOpen = matchesPreselected(path);

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

        const brandCount = document.createElement('span');
        brandCount.className = 'svc-count';
        brandCount.textContent = `${device.brands.length} marcas`;

        header.appendChild(chevron);
        header.appendChild(name);
        header.appendChild(brandCount);

        if (device.brands && device.brands.length > 0) {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                wrap.classList.toggle('open');
            });
        }

        wrap.appendChild(header);

        if (device.brands && device.brands.length > 0) {
            const brandContainer = document.createElement('div');
            brandContainer.className = 'svc-leaf';
            device.brands.forEach(brand => {
                brandContainer.appendChild(renderBrand(brand, path));
            });
            wrap.appendChild(brandContainer);
        }

        return wrap;
    }

    function renderCategory(cat, parentPath) {
        const path = `${parentPath}.${cat.id}`;
        const isOpen = matchesPreselected(path);

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
        const isOpen = matchesPreselected(area.id);
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
