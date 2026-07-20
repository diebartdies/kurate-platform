const API_URL = (window.API_URL || '').replace(/\/$/, '') || '';

function apiBase() {
  if (API_URL) return API_URL;
  return window.location.origin + '/api/v1';
}

function resolvePhotoSrc(url) {
  if (!url || typeof url !== 'string') return '/images/no-photo.svg';
  return url;
}

const NO_PHOTO = '/images/no-photo.svg';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Render a single technician card — identical markup to the SexAppeal treasure card.
function renderHogarCard(grid, tech) {
  const variant = window.HOGAR_CARD_VARIANT || 'violet';
  const card = el('div', `card treasure-card hogar-card hogar-card--${variant}`);
  card.style.position = 'relative';

  const imgContainer = el('div', 'treasure-img-container');
  imgContainer.style.cursor = 'pointer';

  const img = el('img', 'treasure-img');
  img.src = tech.photoUrl ? resolvePhotoSrc(tech.photoUrl) : NO_PHOTO;
  img.alt = tech.name || 'Técnico';
  img.loading = 'lazy';
  img.onerror = () => { img.onerror = null; img.src = NO_PHOTO; };
  imgContainer.appendChild(img);

  const btnRow = el('div');
  Object.assign(btnRow.style, {
    position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '6px', zIndex: '2'
  });
  function contactIcon(src, title) {
    const img = el('img');
    img.src = src;
    img.alt = title;
    img.title = title;
    Object.assign(img.style, {
      width: '26px', height: '26px', borderRadius: '50%',
      background: 'rgba(15,15,26,0.85)', padding: '3px', boxSizing: 'border-box',
      boxShadow: '0 1px 4px rgba(0,0,0,0.5)', objectFit: 'contain'
    });
    img.onerror = () => { img.style.display = 'none'; };
    return img;
  }
  if (tech.whatsapp) btnRow.appendChild(contactIcon('/images/whatsapp.png', 'WhatsApp'));
  if (tech.telegram) btnRow.appendChild(contactIcon('/images/Telegram.png', 'Telegram'));
  if (btnRow.childElementCount) imgContainer.appendChild(btnRow);

  const caption = el('div', 'treasure-caption');
  const aliasEl = el('span', 'treasure-caption-alias', tech.name || 'Técnico');
  caption.appendChild(aliasEl);
  const sub = [tech.action, tech.serviceName].filter(Boolean).join(' · ');
  if (tech.location) {
    const locEl = el('span', 'treasure-caption-location', tech.location);
    caption.appendChild(locEl);
  }
  if (sub) {
    const specEl = el('span', 'treasure-caption-specialty', sub);
    caption.appendChild(specEl);
  }
  imgContainer.appendChild(caption);

  card.appendChild(imgContainer);
  grid.appendChild(card);
}

let currentPage = 1;
let currentParams = {};
let hasMoreResults = false;
const PAGE_LIMIT = 12;

async function loadHogar(params = {}, append = false) {
  const grid = document.getElementById('hogarGrid');
  const loader = document.getElementById('hogarLoader');
  if (!grid) return;

  if (!append) {
    currentPage = 1;
    currentParams = params;
    grid.classList.add('hidden');
    if (loader) { loader.style.display = 'block'; loader.textContent = 'Preparando el directorio...'; }
  } else {
    const moreBtn = document.getElementById('loadMoreBtn');
    if (moreBtn) moreBtn.disabled = true;
  }

  const url = new URL(`${apiBase()}/hogar/professionals`);
  Object.entries({ ...currentParams, ...params }).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  url.searchParams.set('page', String(currentPage));
  url.searchParams.set('limit', String(PAGE_LIMIT));
  url.searchParams.set('_', String(Date.now()));

  try {
    const res = await fetch(url);
    const data = await res.json();
    const techs = (data.success && data.data) ? data.data : [];
    hasMoreResults = !!(data.pagination && data.pagination.hasMore);

    if (loader) loader.style.display = 'none';
    grid.classList.remove('hidden');
    grid.classList.add('grid');

    if (!append) grid.innerHTML = '';

    if (techs.length === 0 && !append) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;">
        <h3 style="color:#D9BC6A;font-weight:600;">Sin resultados</h3>
        <p style="color:#aaa;">Probá ampliar los filtros.</p>
      </div>`;
    } else {
      techs.forEach(t => renderHogarCard(grid, t));
    }

    renderLoadMore(grid);
  } catch (err) {
    if (loader) loader.style.display = 'none';
    grid.classList.remove('hidden');
    grid.classList.add('grid');
    if (!append) {
      grid.innerHTML = `<div class="card alert" style="grid-column:1/-1;">Error al conectar: ${err.message}</div>`;
    }
  }
}

function renderLoadMore(grid) {
  let moreBtn = document.getElementById('loadMoreBtn');
  if (moreBtn) moreBtn.remove();
  if (!hasMoreResults) return;
  moreBtn = el('button', 'sa-btn sa-btn--ghost', 'Cargar más');
  moreBtn.id = 'loadMoreBtn';
  moreBtn.type = 'button';
  Object.assign(moreBtn.style, { display: 'block', margin: '20px auto', gridColumn: '1/-1' });
  moreBtn.addEventListener('click', () => {
    currentPage += 1;
    loadHogar({}, true);
  });
  grid.appendChild(moreBtn);
}

function readFilters() {
  return {
    area: document.getElementById('fArea').value,
    action: document.getElementById('fAction').value,
    category: document.getElementById('fCategory').value,
    availability: document.getElementById('fAvailability').value,
    province: document.getElementById('fProvince').value,
    city: document.getElementById('fCity').value.trim(),
    service: document.getElementById('fService').value.trim(),
    brand: document.getElementById('fBrand').value.trim()
  };
}

// Slide-in left filter drawer (mirrors landing-page filter behavior)
function initFilterDrawer() {
  const filterCard = document.getElementById('hogarFilters');
  if (!filterCard || document.getElementById('hogarFilterDrawer')) return;

  const drawer = document.createElement('div');
  drawer.id = 'hogarFilterDrawer';
  drawer.setAttribute('aria-hidden', 'true');
  Object.assign(drawer.style, {
    position: 'fixed', top: '0', left: '-100%', width: '320px', maxWidth: '88vw',
    height: '100vh', backgroundColor: 'rgba(15,15,26,0.98)', backdropFilter: 'blur(15px)',
    borderRight: '1px solid var(--primary-gold)', zIndex: '10000',
    transition: 'left 0.3s cubic-bezier(0.4,0,0.2,1)', overflowY: 'auto',
    padding: '20px', paddingTop: '70px', boxSizing: 'border-box'
  });
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '20px';
  header.innerHTML = '<h3 style="margin:0;font-size:1.2rem;color:#D9BC6A;font-weight:600;">Filtros</h3>';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Cerrar');
  Object.assign(closeBtn.style, {
    background: 'transparent', color: 'var(--primary-gold)', border: 'none',
    fontSize: '32px', cursor: 'pointer', padding: '0', lineHeight: '1'
  });
  header.appendChild(closeBtn);
  drawer.appendChild(header);
  drawer.appendChild(filterCard);
  document.body.appendChild(drawer);

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.7)', zIndex: '9999', display: 'none', opacity: '0',
    transition: 'opacity 0.3s ease'
  });
  document.body.appendChild(overlay);

  const open = () => {
    drawer.style.left = '0';
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    drawer.style.left = '-100%';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
    document.body.style.overflow = '';
  };
  closeBtn.onclick = close;
  overlay.onclick = close;

  // Hamburger button in the center frame header
  const title = document.querySelector('.categories-frame-center h2');
  if (title) {
    const burger = document.createElement('button');
    burger.type = 'button';
    burger.textContent = '☰';
    burger.setAttribute('aria-label', 'Filtros');
    Object.assign(burger.style, {
      background: 'transparent', border: '1px solid var(--primary-gold)', color: 'var(--primary-gold)',
      borderRadius: '6px', fontSize: '1.1rem', cursor: 'pointer', marginRight: '12px', padding: '4px 10px'
    });
    burger.onclick = open;
    title.parentNode.insertBefore(burger, title);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // On narrow screens the left frame is hidden; the drawer gives access to all filters.
  initFilterDrawer();

  document.getElementById('btnApply').addEventListener('click', () => loadHogar(readFilters()));
  document.getElementById('btnClear').addEventListener('click', () => {
    ['fArea','fAction','fCategory','fAvailability','fProvince','fCity','fService','fBrand']
      .forEach(id => { document.getElementById(id).value = ''; });
    loadHogar({});
  });

  const AREAS = [
    { value: '', label: 'Todas' },
    { value: 'hogar', label: 'Hogar' },
    { value: 'oficina', label: 'Oficina' },
    { value: 'pime', label: 'PIME' },
    { value: 'industria', label: 'Industria' }
  ];
  const chipWrap = document.getElementById('areaChips');
  const fArea = document.getElementById('fArea');
  AREAS.forEach(a => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'area-chip' + (a.value === '' ? ' is-active' : '');
    chip.textContent = a.label;
    chip.addEventListener('click', () => {
      fArea.value = a.value;
      [...chipWrap.children].forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      loadHogar(readFilters());
    });
    chipWrap.appendChild(chip);
  });

  loadHogar({});
});
