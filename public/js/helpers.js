import { API_URL } from './globals.js';
import { t, applyStaticTranslations } from './i18n.js';

export async function renderSpecialtyDropdown(containerId, preselectedServices = [], options = {}) {
    const { quality = '', context = 'form' } = options;
    let container = document.getElementById(containerId);
    
    // Aggressive fallback to find legacy checkbox groups if ID is missing or changed
    if (!container) {
        const labels = Array.from(document.querySelectorAll('label'));
        const specLabel = labels.find(l => 
            l.textContent.trim().toLowerCase().includes('specialt') || 
            l.textContent.trim().toLowerCase().includes('especialidad') ||
            l.textContent.trim().toLowerCase().includes('service') ||
            l.textContent.trim().toLowerCase().includes('servicio')
        );
        
        if (specLabel) {
            const sibling = specLabel.nextElementSibling;
            if (sibling && (sibling.tagName === 'DIV' || sibling.tagName === 'UL')) {
                container = sibling;
                container.id = containerId;
            } else {
                const parent = specLabel.closest('.filter-control') || specLabel.parentNode;
                if (parent) {
                    const wrapper = parent.querySelector('div.checkbox-group, div.custom-select-wrapper, ul, div');
                    if (wrapper && wrapper !== specLabel) {
                        container = wrapper;
                        container.id = containerId;
                    }
                }
            }
        }
    }

    if (!container) return;

    // Forcefully morph any DIV/UL (like checkbox containers) into a standard SELECT drop-down
    if (container.tagName !== 'SELECT') {
        const select = document.createElement('select');
        select.id = container.id;
        select.className = 'form-select';
        if (container.getAttribute('name')) select.name = container.getAttribute('name');
        else if (container.id === 'specialtySelect') select.name = 'specialty';
        else select.name = 'services';
        
        select.style.width = '100%';
        select.style.padding = context === 'form' ? '8px' : '12px';
        select.style.background = context === 'form' ? '#222' : 'transparent';
        select.style.border = context === 'form' ? '1px solid #444' : '1px solid var(--primary-gold)';
        select.style.color = 'white';
        if (context === 'form') select.style.borderRadius = '4px';
        
        // Ensure it is a strict drop-down menu (no multi-select box)
        select.multiple = false;
        
        container.parentNode.replaceChild(select, container);
        container = select;
        
        // Update the corresponding label's 'for' attribute
        const labels = Array.from(document.querySelectorAll('label'));
        const specLabel = labels.find(l => l.textContent.trim().toLowerCase().includes('specialt') || l.textContent.trim().toLowerCase().includes('especialidad'));
        if (specLabel) specLabel.setAttribute('for', container.id);
    } else if (container.tagName === 'SELECT') {
        container.multiple = false;
        container.removeAttribute('size');
        container.style.height = 'auto';
        container.style.width = '100%';
        container.style.padding = context === 'form' ? '8px' : '12px';
        container.style.background = context === 'form' ? '#222' : 'transparent';
        container.style.border = context === 'form' ? '1px solid #444' : '1px solid var(--primary-gold)';
        container.style.color = 'white';
        if (context === 'form') container.style.borderRadius = '4px';
    }

    try {
        let preselectedArr = [];
        if (preselectedServices) {
            if (Array.isArray(preselectedServices)) preselectedArr = preselectedServices;
            else if (typeof preselectedServices === 'string') preselectedArr = preselectedServices.split(',');
        }
        preselectedArr = preselectedArr.map(s => (s || '').trim().toLowerCase()).filter(Boolean);

        const specialties = ['Massage', 'Virtual Connection', 'Love Alchemy', 'Media Content', 'Streaming Kisses'];
        
        container.innerHTML = '';
        
        if (context === 'filter') {
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = t('All Specialties');
            defaultOpt.style.background = 'var(--dark-bg)';
            defaultOpt.style.color = 'var(--light-text)';
            container.appendChild(defaultOpt);
        }

        specialties.forEach(specialty => {
            const opt = document.createElement('option');
            opt.value = specialty;
            opt.textContent = t(specialty);
            opt.style.background = 'var(--dark-bg)';
            opt.style.color = 'var(--light-text)';
            if (preselectedArr.includes(specialty.toLowerCase().trim())) {
                opt.selected = true;
            }
            container.appendChild(opt);
        });
    } catch (err) { 
        console.error('Error loading specialties:', err);
        container.innerHTML = '<option value="">Error loading specialties.</option>'; 
    }
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
