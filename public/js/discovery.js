import { BASE_ORIGIN, API_URL, CATEGORY_META, resolvePhotoSrc, appPath, isReservedAppPage } from './globals.js';
import { t, applyStaticTranslations, formatWorkingDays } from './i18n.js';
import { activateAccessibleModal, deactivateAccessibleModal } from './a11y.js';
import { getPendingApprovalBannerHtml } from './uiHelpers.js';
import { navigateBack } from './ui.js';
import { navigateWithReturn } from './navReturn.js';
import { renderSpecialtyDropdown } from './helpers.js';
import { beginPageLoad, finishPageLoad, failPageLoad } from './dashboardShell.js';
import { resolveLaunchCurtain } from './launchCurtain.js';
import {
    buildCategoryQueue,
    resetLazyCategoryLoader,
    startLazyCategoryLoader
} from './lazyCategoryLoader.js';

const TREASURE_CATEGORY_ORDER = ['verificados', 'Premium', 'Gold', 'Silver', 'Standard'];

function profileOffersVirtualConnection(services) {
    return (services || []).some((s) => {
        const name = String(s || '').trim().toLowerCase();
        return name === 'virtual connection' || name === 'conexión virtual';
    });
}

// Detect the logged-in admin the same way the rest of the frontend does
// (adminHome.js / admin.js): read the cached `user` object from localStorage
// and check `role === 'admin'`. Any failure (missing/corrupt value, no role)
// resolves to NOT-admin so the launch curtain stays in place for everyone else.
function isAdminUser() {
    try {
        const raw = localStorage.getItem('user');
        if (!raw) return false;
        const user = JSON.parse(raw);
        return !!user && user.role === 'admin';
    } catch {
        return false;
    }
}

// Build the foot-of-photo location line from the professional's location,
// mirroring the detail page's CABA handling (neighborhood + "CABA" when the
// province is CABA, otherwise neighborhood + city). Returns '' when empty.
function buildCardLocation(loc) {
    if (!loc) return '';
    const province = (loc.province || '').trim();
    const city = (loc.city || '').trim();
    const neighborhood = (loc.neighborhood || '').trim();
    if (province.toLowerCase() === 'caba') {
        return [neighborhood, 'CABA'].filter(Boolean).join(', ');
    }
    return [neighborhood, city].filter(Boolean).join(', ');
}

function renderTreasureCategorySection(grid, cat, items, eagerImages = false) {
    let catSection = document.getElementById(`cat-section-${cat}`);
    let innerGrid;

    if (!catSection) {
        const meta = CATEGORY_META[cat];
        catSection = document.createElement('div');
        catSection.id = `cat-section-${cat}`;
        catSection.className = 'fileteado-section discovery-cat-section';
        catSection.innerHTML = `
            <div class="category-section-header">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="color: var(--primary-gold); width: 40px; text-align: center;">${meta.logo}</div>
                    <div>
                        <h3 class="gold-text" style="margin: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
                            ${t(meta.name)} <span style="font-size: 0.8rem; color: #aaa; font-weight: normal; font-family: sans-serif;">${t(meta.desc)}</span>
                        </h3>
                    </div>
                </div>
            </div>
        `;

        innerGrid = document.createElement('div');
        innerGrid.id = `cat-grid-${cat}`;
        innerGrid.className = 'grid';
        innerGrid.style.marginTop = '10px';

        catSection.appendChild(innerGrid);
        grid.appendChild(catSection);
    } else {
        innerGrid = document.getElementById(`cat-grid-${cat}`);
    }

    items.forEach(treasure => {
        const card = document.createElement('div');
        const prof = treasure.professionalProfile || {};
        const validPhotos = (prof.photos || []).filter(p => p && p.trim() !== '');
        const photoUrl = validPhotos.length > 0 ? resolvePhotoSrc(validPhotos[0]) : '/images/no-photo.svg';

        card.className = 'card treasure-card';
        card.style.position = 'relative';

        const imgContainer = document.createElement('div');
        imgContainer.className = 'treasure-img-container';
        imgContainer.style.cursor = 'pointer';
        const img = document.createElement('img');
        img.className = 'treasure-img';
        img.src = photoUrl;
        img.alt = prof.alias || 'Unknown';
        if (!eagerImages) img.loading = 'lazy';
        img.onerror = () => {
            img.onerror = null;
            img.src = '/images/no-photo.svg';
        };
        imgContainer.appendChild(img);

        if (profileOffersVirtualConnection(prof.services)) {
            const virtualBadge = document.createElement('span');
            virtualBadge.className = 'treasure-virtual-badge';
            virtualBadge.textContent = t('Virtual');
            virtualBadge.setAttribute('aria-hidden', 'true');
            imgContainer.appendChild(virtualBadge);
        }

        // Foot-of-photo caption: alias, barrio/ciudad and primary specialty.
        // White italic text, left-aligned with a small left padding, sitting on
        // a subtle dark gradient scrim so it stays legible over any photo.
        const locationLine = buildCardLocation(prof.location);
        const primarySpecialty = (prof.services || []).find(s => s && s.trim() !== '') || '';

        const caption = document.createElement('div');
        caption.className = 'treasure-caption';

        const aliasEl = document.createElement('span');
        aliasEl.className = 'treasure-caption-alias';
        aliasEl.textContent = prof.alias || 'Unknown';
        caption.appendChild(aliasEl);

        if (locationLine) {
            const locEl = document.createElement('span');
            locEl.className = 'treasure-caption-location';
            locEl.textContent = locationLine;
            caption.appendChild(locEl);
        }

        if (primarySpecialty) {
            const specEl = document.createElement('span');
            specEl.className = 'treasure-caption-specialty';
            specEl.textContent = primarySpecialty;
            caption.appendChild(specEl);
        }

        imgContainer.appendChild(caption);

        card.appendChild(imgContainer);
        imgContainer.addEventListener('click', () => trackDashboardPhotoClick(prof.alias));
        innerGrid.appendChild(card);
    });
}

// Load Treasures
let currentDiscoveryPage = 1;
let discoveryTotalLoaded = 0;

function updateFloatingProgress(data, append) {
    const progressWrapper = document.getElementById('floatingProgressWrapper');
    const progressBar = document.getElementById('floatingProgressBar');
    const progressText = document.getElementById('floatingProgressText');
    if (!progressWrapper || !progressBar || !progressText || !data.pagination) return;

    const total = data.pagination.total;
    if (total <= 0) {
        progressWrapper.style.display = 'none';
        return;
    }

    if (!append) discoveryTotalLoaded = 0;
    discoveryTotalLoaded += data.data?.length || 0;

    const loaded = Math.min(discoveryTotalLoaded, total);
    const percentage = Math.min(100, Math.round((loaded / total) * 100));
    const allLoaded = data.pagination.hasMore === false || loaded >= total;

    if (allLoaded) {
        progressWrapper.style.display = 'none';
        return;
    }

    progressWrapper.style.display = 'flex';
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
}

export async function loadTreasures(page = 1, append = false, options = {}) {
    const grid = document.getElementById('treasureGrid');
    if (!grid) return;

    // Admins bypass the launch curtain so they can preview the live grid before
    // the public opening. Everyone else (professionals, regular users, guests)
    // still gets the curtain. If the role can't be determined we fall through to
    // the normal curtain check, so the curtain is the safe default.
    if (!append && page === 1 && !options.skipCurtainCheck && !isAdminUser()) {
        const blocked = await resolveLaunchCurtain(() => {
            loadTreasures(1, false, { skipCurtainCheck: true });
        });
        if (blocked) return;
    }

    if (!append) {
        currentDiscoveryPage = 1;
        resetLazyCategoryLoader();
        beginPageLoad('treasureGrid', 'pageLoader', { clearContent: true });
    }
    
    // Treasure grid photo styles live in public/css/style.css (.treasure-img-container, etc.)

    const urlParams = new URLSearchParams(window.location.search);
    const specialty = urlParams.get('specialty');
    const quality = urlParams.get('quality'); // Formerly tier
    
    let province = urlParams.get('province');
    
    const city = urlParams.get('city');
    const neighborhood = urlParams.get('neighborhood');

    const limit = 0; // 0 = no cap — load all matching professionals

    let url = new URL(`${API_URL}/professionals`);
    if (specialty && specialty.trim()) url.searchParams.set('specialty', specialty);
    if (quality && quality.trim()) url.searchParams.set('quality', quality);
    if (province && province.trim()) url.searchParams.set('province', province);
    if (city && city.trim()) url.searchParams.set('city', city);
    if (neighborhood && neighborhood.trim()) url.searchParams.set('neighborhood', neighborhood);

    url.searchParams.set('page', page);
    url.searchParams.set('limit', String(limit));

    // Add a cache-busting parameter to ensure fresh data is always fetched
    url.searchParams.set('_', new Date().getTime());

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
        }
        
        let data = await res.json();
        let allTreasures = [...(data.data || [])];

        updateFloatingProgress(data, append);

        while (data.pagination?.hasMore) {
            currentDiscoveryPage++;
            url.searchParams.set('page', String(currentDiscoveryPage));
            url.searchParams.set('_', String(Date.now()));
            const nextRes = await fetch(url);
            if (!nextRes.ok) break;
            const nextData = await nextRes.json();
            updateFloatingProgress(nextData, true);
            if (!nextData.success) break;
            allTreasures.push(...(nextData.data || []));
            data = nextData;
        }

        if (data.success && allTreasures.length > 0) {
            if (!append) {
                grid.innerHTML = '';
            }

            grid.classList.remove('grid');

            const categories = { verificados: [], Premium: [], Gold: [], Silver: [], Standard: [] };
            allTreasures.forEach(treasure => {
                const q = treasure.professionalProfile?.quality || 'Standard';
                if (categories[q]) categories[q].push(treasure);
                else categories.Standard.push(treasure);
            });

            const queue = buildCategoryQueue(categories, TREASURE_CATEGORY_ORDER);
            let pageLoadFinished = append;

            startLazyCategoryLoader(
                grid,
                queue,
                (entry, ctx) => {
                    renderTreasureCategorySection(grid, entry.cat, entry.items, ctx.eagerImages);
                    applyStaticTranslations(grid);
                },
                {
                    onInitialBatchComplete: () => {
                        if (!pageLoadFinished) {
                            pageLoadFinished = true;
                            finishPageLoad('treasureGrid', 'pageLoader');
                        }
                    },
                    onAllComplete: () => applyStaticTranslations(grid)
                }
            );
            return;
        } else {
            if (!append) {
                // Ensure grid class is restored if no treasures are found so the fallback card centers correctly
                grid.classList.add('grid');
                const hasFilters = specialty || quality || province || city || neighborhood;
                
                grid.innerHTML = `
                    <div class="card" style="grid-column: 1/-1; text-align: center;">
                        <h3 class="gold-text">${t('No Treasures Found')}</h3>
                        <p style="margin-bottom: 20px;">${hasFilters ? t('No models match your current selection.') : t('No models have been revealed yet. Please check back later.')}</p>
                        ${hasFilters ? `<button onclick="window.location.href='${appPath('categories.html')}'">${t('Filter Again')}</button>` : ''}
                    </div>
                `;
            } else {
                const endMsg = document.createElement('div');
                endMsg.style.textAlign = 'center';
                endMsg.style.padding = '20px';
                endMsg.style.color = '#888';
                endMsg.style.width = '100%';
                endMsg.innerHTML = `<p>${t('No more treasures to show.')}</p>`;
                grid.appendChild(endMsg);
            }
        }
        applyStaticTranslations(grid);
        if (!append) finishPageLoad('treasureGrid', 'pageLoader');
    } catch (err) {
        resetLazyCategoryLoader();
        console.error('Vault connection error:', err);
        grid.classList.add('grid');
        failPageLoad(
            'treasureGrid',
            'pageLoader',
            `<div class="card alert" style="grid-column: 1/-1;">${t('Error connecting to the vault:')} ${err.message}. ${t('Please ensure the server is running.')}</div>`
        );
    }
}


// Load Single Treasure Details
export async function loadTreasureDetails() {
    const content = document.getElementById('treasureContent');
    const loader = document.getElementById('loader');
    if (!content) return;

    beginPageLoad('treasureContent', 'loader', { clearContent: true });

    const urlParams = new URLSearchParams(window.location.search);
    let alias = urlParams.get('alias');
    
    // Extract alias from SEO-friendly URL if present (e.g., /perfil/Maria)
    if (!alias && window.location.pathname.startsWith('/perfil/')) {
        const pathParts = window.location.pathname.split('/perfil/');
        if (pathParts.length > 1) alias = decodeURIComponent(pathParts[1].replace(/\/$/, ''));
    }

    if (alias && isReservedAppPage(alias)) {
        window.location.replace(appPath(alias));
        return;
    }

    if (!alias) {
        failPageLoad('treasureContent', 'loader', '<p class="alert">No treasure specified.</p>');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/professionals/${alias}`);
        if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
        }
        
        const data = await res.json();

        if (data.success) {
            const treasure = data.data;
            const prof = treasure.professionalProfile;
            const hasWhatsapp = prof.hasWhatsapp;

            // Check if viewing own profile
            let isOwner = false;
            let ownerPendingApproval = false;
            try {
                const uStr = localStorage.getItem('user');
                if (uStr) {
                    const u = JSON.parse(uStr);
                    if (u._id === treasure._id) {
                        isOwner = true;
                        ownerPendingApproval = u.verificationStatus === 'pending';
                    }
                }
            } catch(e) {}

            const pendingApprovalBannerHtml = ownerPendingApproval ? getPendingApprovalBannerHtml() : '';

            const editBtnHtml = isOwner ? `
                <button type="button" id="ownerEditProfileBtn" aria-label="${t('Edit Profile')}" title="${t('Edit Profile')}" style="position: absolute; top: 15px; right: 105px; font-size: 1.8rem; background: transparent; color: var(--primary-gold); border: none; cursor: pointer; transition: transform 0.3s ease; z-index: 10; text-shadow: 0 0 8px rgba(212, 175, 55, 0.6);" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                    ✏️
                </button>
            ` : '';

            const photoReminderHtml = (isOwner && (!prof.photos || prof.photos.length === 0)) ? `
                <div style="background: rgba(212, 175, 55, 0.1); border: 1px dashed var(--primary-gold); padding: 15px; margin-bottom: 20px; border-radius: 8px; text-align: center; color: var(--primary-gold);">
                    <strong>${t('Reminder:')}</strong> ${t('This is your first time accessing your profile. Please click the "Edit Profile" button to load your photos!')}
                </div>
            ` : '';

            // Store photos for gallery navigation
            const galleryPhotos = prof.photos || [];
            const safeBio = String(prof.bio || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            content.innerHTML = `
                <div class="card" style="position: relative;">
                    ${editBtnHtml}
                    <button type="button" id="treasureBackBtn" onmouseover="this.style.background='rgba(212, 175, 55, 0.1)'" onmouseout="this.style.background='transparent'" style="position: absolute; top: 20px; right: 20px; padding: 6px 12px; font-size: 0.85rem; background: transparent; color: var(--primary-gold); border: 1px solid var(--primary-gold); border-radius: 4px; cursor: pointer; transition: background 0.3s ease; z-index: 10;">&#8592; ${t('Back')}</button>
                    <h2 class="gold-text" style="text-align: center; margin-bottom: 20px; padding: 0 80px;">${prof.alias || 'Unknown'}</h2>
                    ${pendingApprovalBannerHtml}

                    <div style="text-align: center; margin-bottom: 15px;">
                        <span style="padding: 5px 10px; border-radius: 20px; font-size: 0.9rem; font-weight: bold; ${treasure.isActiveNow ? 'background: #008800; color: white;' : 'background: #880000; color: white;'}">
                            ${treasure.isActiveNow ? t('🟢 Available Right Now') : t('🔴 Currently Inactive')}
                        </span>
                    </div>

                    ${photoReminderHtml}

                    <div style="text-align: center; margin-bottom: 10px; font-size: 0.85rem; color: var(--primary-gold); opacity: 0.8;">
                        <em>${t('Desktop: Click & Drag to scroll | Mobile: Swipe left/right')}</em>
                    </div>

                    <!-- Photo Carousel/Grid for Guests -->
                    <div id="treasurePhotoGrid" class="photo-carousel">
                        <!-- Photos will be injected here -->
                    </div>

                    <div class="tag-list" style="justify-content: flex-start; margin-top: 10px; margin-bottom: 20px;">
                        <strong>Specialties:</strong> 
                        ${(prof.services || []).map(s => `<span class="tag">${s}</span>`).join('')}
                    </div>

                    <div id="treasureBioSection" style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <h3 class="gold-text" style="margin: 0 0 12px; font-size: 1.1rem;">${t('Service Description')}</h3>
                        <p style="white-space: pre-wrap; color: #ccc; line-height: 1.65; margin: 0;">${safeBio || t('No service description available.')}</p>
                    </div>

                    <div style="margin-top: 0;">
                        <p><strong>${t('Country')}:</strong> ${prof.location?.country || 'N/A'}</p>
                        <p><strong>${t('Location')}:</strong> ${(() => {
                            if (!prof.location) return 'N/A';
                            const p = prof.location.province || '';
                            const c = prof.location.city || '';
                            const n = prof.location.neighborhood || '';
                            if (p.toLowerCase() === 'caba') return [n, 'CABA'].filter(Boolean).join(', ');
                            return [n, c, p].filter(Boolean).join(', ') || 'N/A';
                        })()}</p>
                        <p><strong>Measurements:</strong> ${prof.measurements || 'N/A'}</p>
                        <p><strong>Height:</strong> ${prof.height || 'N/A'}</p>
                        <p><strong>${t('Days:')}</strong> ${formatWorkingDays(prof.workingDays)}</p>
                        <p><strong>Hours:</strong> ${(prof.workingHours && prof.workingHours.start) ? prof.workingHours.start + ' to ' + prof.workingHours.end : 'Anytime'}</p>
                    </div>

                    <div style="margin-top: 30px; text-align: center; display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
                        ${hasWhatsapp ? `<button onclick="contactOnWhatsApp('${prof.alias}')" style="background: #25D366; color: white; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; font-weight: bold;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.405-.881-.728-1.476-1.626-1.65-1.923-.173-.298-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>${t('Contact on WhatsApp')}</button>` : ''}
                        ${hasWhatsapp ? `<button onclick="contactOnPhone('${prof.alias}')" style="background: transparent; border: 1px solid var(--primary-gold); color: var(--primary-gold); display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>${t('Phone Call')}</button>` : ''}
                    </div>
                </div>
            `;

            const photoGrid = document.getElementById('treasurePhotoGrid');
            if (galleryPhotos.length > 0) {
                photoGrid.classList.remove('photo-carousel--solo', 'photo-carousel--expand', 'photo-carousel--scroll');
                if (galleryPhotos.length === 1) {
                    photoGrid.classList.add('photo-carousel--solo');
                } else if (galleryPhotos.length <= 3) {
                    photoGrid.classList.add('photo-carousel--expand', `photo-carousel--count-${galleryPhotos.length}`);
                } else {
                    photoGrid.classList.add('photo-carousel--scroll');
                }

                galleryPhotos.forEach((url) => {
                    const item = document.createElement('div');
                    item.className = 'photo-item-public';

                    const img = document.createElement('img');
                    img.src = resolvePhotoSrc(url);
                    img.alt = `${prof.alias}'s photo`;

                    item.appendChild(img);
                    photoGrid.appendChild(item);
                });

                // --- Desktop Drag-to-Scroll Functionality ---
                let isDown = false;
                let startX;
                let scrollLeft;

                photoGrid.style.cursor = 'grab';
                photoGrid.addEventListener('mousedown', (e) => {
                    isDown = true;
                    photoGrid.style.cursor = 'grabbing';
                    startX = e.pageX - photoGrid.offsetLeft;
                    scrollLeft = photoGrid.scrollLeft;
                });
                photoGrid.addEventListener('mouseleave', () => {
                    isDown = false;
                    photoGrid.style.cursor = 'grab';
                });
                photoGrid.addEventListener('mouseup', () => {
                    isDown = false;
                    photoGrid.style.cursor = 'grab';
                });
                photoGrid.addEventListener('mousemove', (e) => {
                    if (!isDown) return;
                    e.preventDefault();
                    const walk = (e.pageX - photoGrid.offsetLeft - startX) * 2; // Scroll fast
                    photoGrid.scrollLeft = scrollLeft - walk;
                });

                // --- Auto-Scroll Functionality ---
                let autoScrollTimer;
                const startAutoScroll = () => {
                    clearInterval(autoScrollTimer);
                    autoScrollTimer = setInterval(() => {
                        if (isDown) return;
                        const maxScroll = photoGrid.scrollWidth - photoGrid.clientWidth;
                        if (photoGrid.scrollLeft >= maxScroll - 10) {
                            photoGrid.scrollTo({ left: 0, behavior: 'smooth' }); // Rewind to start
                        } else {
                            const firstItem = photoGrid.querySelector('.photo-item-public');
                            const itemWidth = firstItem?.offsetWidth || 200;
                            const gap = parseFloat(getComputedStyle(photoGrid).gap) || 12;
                            photoGrid.scrollBy({ left: itemWidth + gap, behavior: 'smooth' });
                        }
                    }, 3000); // Scrolls every 3 seconds
                };
                const stopAutoScroll = () => clearInterval(autoScrollTimer);

                startAutoScroll();
                photoGrid.addEventListener('mouseenter', stopAutoScroll); // Pause on hover
                photoGrid.addEventListener('mouseleave', startAutoScroll); // Resume when mouse leaves
                photoGrid.addEventListener('touchstart', stopAutoScroll, { passive: true }); // Pause on touch
                photoGrid.addEventListener('touchend', startAutoScroll); // Resume after swipe
            } else {
                photoGrid.innerHTML = '<p>No photos available.</p>';
            }

            document.getElementById('treasureBackBtn')?.addEventListener('click', () => {
                navigateBack(() => { window.location.href = appPath('categories.html'); });
            });
            document.getElementById('ownerEditProfileBtn')?.addEventListener('click', () => {
                navigateWithReturn(appPath('profDashboard.html'));
            });

            finishPageLoad('treasureContent', 'loader');
            applyStaticTranslations(content);
        } else {
            failPageLoad('treasureContent', 'loader', `<p class="alert">${t('Could not find the specified treasure.')}</p>`);
        }
    } catch (err) {
        console.error('Error loading treasure details:', err);
        failPageLoad('treasureContent', 'loader', `<p class="alert">${t('Error connecting to the vault:')} ${err.message}</p>`);
    }
}

// Combined Filter Logic

/** Floating bar: grid density toggles (+ optional filter button). All treasure grid pages. */
export function initTreasureGridControls(onOpenFilters = null) {
    const grid = document.getElementById('treasureGrid');
    if (!grid || document.getElementById('floatingControlsBar')) return;

    const GOLD = 'var(--primary-gold)';

    const controlsBar = document.createElement('div');
    controlsBar.id = 'floatingControlsBar';
    controlsBar.className = 'floating-controls-bar';
    Object.assign(controlsBar.style, {
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: '9999',
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0',
        padding: '5px', backgroundColor: 'transparent',
        borderRadius: '30px', border: 'none', backdropFilter: 'none',
        WebkitBackdropFilter: 'none', boxShadow: 'none',
        width: 'fit-content', transition: 'top 0.15s ease-out'
    });

    const updateFloatingMenuPosition = () => {
        const bar = document.getElementById('floatingControlsBar');
        if (!bar) return;
        const barHeight = bar.offsetHeight || 44;

        // On pages with a dedicated central frame (categories.html), keep the
        // menu centered over that frame on BOTH axes. The viewport center is
        // off here because of the left/right side frames.
        const centerFrame = document.querySelector('.categories-frame-center');
        if (centerFrame) {
            const rect = centerFrame.getBoundingClientRect();
            const visibleTop = Math.max(rect.top, 0);
            const visibleBottom = Math.min(rect.bottom, window.innerHeight);
            const centerY = (visibleTop + visibleBottom) / 2 - barHeight / 2;
            bar.style.top = `${centerY}px`;
            bar.style.bottom = 'auto';
            bar.style.left = `${rect.left + rect.width / 2}px`;
            bar.style.transform = 'translateX(-50%)';
            return;
        }

        // Other pages: animate from bottom to vertical center on scroll.
        const scrollRange = Math.max(180, Math.min(window.innerHeight * 0.6, 520));
        const scrollProgress = Math.min(1, window.scrollY / scrollRange);
        const bottomOffset = 30;
        const bottomTop = window.innerHeight - bottomOffset - barHeight;
        const centerTop = (window.innerHeight - barHeight) / 2;
        const top = bottomTop - scrollProgress * (bottomTop - centerTop);
        bar.style.top = `${top}px`;
        bar.style.bottom = 'auto';
        bar.style.left = '50%';
        bar.style.transform = 'translateX(-50%)';
    };

    if (!window.__FullMinentFloatingMenuScrollBound) {
        window.__FullMinentFloatingMenuScrollBound = true;
        window.addEventListener('scroll', updateFloatingMenuPosition, { passive: true });
        window.addEventListener('resize', updateFloatingMenuPosition, { passive: true });
    }

    if (typeof onOpenFilters === 'function') {
        const openFilterBtn = document.createElement('button');
        openFilterBtn.className = 'floating-menu-btn';
        openFilterBtn.type = 'button';
        openFilterBtn.title = t('Filters');
        openFilterBtn.setAttribute('aria-label', t('Filters'));
        openFilterBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`;
        openFilterBtn.onclick = onOpenFilters;
        controlsBar.appendChild(openFilterBtn);
    }

    const gridToggles = document.createElement('div');
    gridToggles.style.display = 'flex';
    gridToggles.style.gap = '0';

    const btnGridLarge = document.createElement('button');
    btnGridLarge.type = 'button';
    btnGridLarge.className = 'floating-menu-btn';
    btnGridLarge.setAttribute('aria-label', t('4 columns'));
    btnGridLarge.title = t('4 columns');
    btnGridLarge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';

    const btnGridSmall = document.createElement('button');
    btnGridSmall.type = 'button';
    btnGridSmall.className = 'floating-menu-btn';
    btnGridSmall.setAttribute('aria-label', t('6 columns'));
    btnGridSmall.title = t('6 columns');
    btnGridSmall.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="4" height="4"></rect><rect x="10" y="3" width="4" height="4"></rect><rect x="17" y="3" width="4" height="4"></rect><rect x="3" y="10" width="4" height="4"></rect><rect x="10" y="10" width="4" height="4"></rect><rect x="17" y="10" width="4" height="4"></rect><rect x="3" y="17" width="4" height="4"></rect><rect x="10" y="17" width="4" height="4"></rect><rect x="17" y="17" width="4" height="4"></rect></svg>';

    const updateGridButtons = (isSmall) => {
        btnGridSmall.classList.toggle('is-active', isSmall);
        btnGridSmall.classList.toggle('is-dim', !isSmall);
        btnGridLarge.classList.toggle('is-active', !isSmall);
        btnGridLarge.classList.toggle('is-dim', isSmall);
    };

    const setSmallGridMode = (isSmall) => {
        document.body.classList.toggle('small-grid-mode', isSmall);
        localStorage.setItem('smallGridMode', isSmall ? 'true' : 'false');
        updateGridButtons(isSmall);
    };

    updateGridButtons(localStorage.getItem('smallGridMode') === 'true');
    if (localStorage.getItem('smallGridMode') === 'true') {
        document.body.classList.add('small-grid-mode');
    }

    btnGridLarge.onclick = () => setSmallGridMode(false);
    btnGridSmall.onclick = () => setSmallGridMode(true);

    gridToggles.appendChild(btnGridLarge);
    gridToggles.appendChild(btnGridSmall);
    controlsBar.appendChild(gridToggles);

    const progressWrapper = document.createElement('div');
    progressWrapper.id = 'floatingProgressWrapper';
    Object.assign(progressWrapper.style, {
        display: 'none', alignItems: 'center', gap: '5px', padding: '0 10px',
        borderLeft: onOpenFilters ? '1px solid rgba(212, 175, 55, 0.35)' : 'none'
    });

    const progressBg = document.createElement('div');
    Object.assign(progressBg.style, {
        width: '60px', height: '6px', background: 'rgba(212, 175, 55, 0.2)',
        borderRadius: '3px', overflow: 'hidden'
    });

    const progressBar = document.createElement('div');
    progressBar.id = 'floatingProgressBar';
    Object.assign(progressBar.style, {
        width: '0%', height: '100%', background: GOLD,
        transition: 'width 0.3s ease'
    });

    const progressText = document.createElement('span');
    progressText.id = 'floatingProgressText';
    Object.assign(progressText.style, {
        fontSize: '0.75rem', color: GOLD, fontWeight: 'bold'
    });

    progressBg.appendChild(progressBar);
    progressWrapper.appendChild(progressBg);
    progressWrapper.appendChild(progressText);
    controlsBar.appendChild(progressWrapper);

    grid.parentNode.insertBefore(controlsBar, grid);
    requestAnimationFrame(updateFloatingMenuPosition);
}

export async function initializeFilters() {
    const filterForm = document.getElementById('filterForm');
    const qualitySelect = document.getElementById('qualitySelect'); // Formerly tierSelect
    const specialtySelect = document.getElementById('specialtySelect');

    if (!filterForm) return;

    // Suggested fix from user analysis: Improve contrast for visibility.
    // The report indicated that the parent card's transparency made the form's
    // light-colored text difficult to read against the page background.
    const parentCard = filterForm.closest('.card');
    const grid = document.getElementById('treasureGrid');

    if (parentCard && grid) {
        // --- OFF-CANVAS SLIDE-IN FILTER & GRID CONTROLS ---
        const filterDrawer = document.createElement('div');
        filterDrawer.setAttribute('aria-hidden', 'true');
        filterDrawer.id = 'filterDrawer';
        Object.assign(filterDrawer.style, {
            position: 'fixed', top: '0', left: '-100%', width: '320px', maxWidth: '85vw',
            height: '100vh', backgroundColor: 'rgba(10, 10, 10, 0.98)',
            backdropFilter: 'blur(15px)', WebkitBackdropFilter: 'blur(15px)',
            borderRight: '1px solid var(--primary-gold)', zIndex: '10000',
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflowY: 'auto', padding: '20px', paddingTop: '70px', boxSizing: 'border-box'
        });
        if (document.body.classList.contains('blueprint-theme')) {
            filterDrawer.style.maxWidth = '92vw';
            filterDrawer.style.paddingTop = 'calc(var(--global-topbar-height, 55px) + var(--blueprint-notes-height, 40px) + env(safe-area-inset-top, 0px) + 12px)';
            filterDrawer.style.paddingLeft = 'max(12px, env(safe-area-inset-left))';
            filterDrawer.style.paddingRight = 'max(12px, env(safe-area-inset-right))';
            filterDrawer.style.paddingBottom = 'max(20px, env(safe-area-inset-bottom))';
        }

        const drawerHeader = document.createElement('div');
        drawerHeader.style.display = 'flex';
        drawerHeader.style.justifyContent = 'space-between';
        drawerHeader.style.alignItems = 'center';
        drawerHeader.style.marginBottom = '25px';
        drawerHeader.innerHTML = `<h3 id="filterDrawerTitle" class="gold-text" style="margin:0; font-size:1.2rem;">${t('Filters')}</h3>`;
        
        const closeDrawerBtn = document.createElement('button');
        closeDrawerBtn.type = 'button';
        closeDrawerBtn.setAttribute('aria-label', t('Close'));
        closeDrawerBtn.innerHTML = '&times;';
        Object.assign(closeDrawerBtn.style, {
            background: 'transparent', color: 'var(--primary-gold)', border: 'none',
            fontSize: '32px', cursor: 'pointer', padding: '0', lineHeight: '1'
        });
        drawerHeader.appendChild(closeDrawerBtn);
        filterDrawer.appendChild(drawerHeader);

        parentCard.style.backgroundColor = 'transparent';
        parentCard.style.border = 'none';
        parentCard.style.boxShadow = 'none';
        parentCard.style.padding = '0';
        parentCard.style.display = 'block';
        filterDrawer.appendChild(parentCard);
        document.body.appendChild(filterDrawer);

        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: '9999',
            display: 'none', opacity: '0', transition: 'opacity 0.3s ease'
        });
        document.body.appendChild(overlay);

        filterDrawer.setAttribute('role', 'dialog');
        filterDrawer.setAttribute('aria-modal', 'true');
        filterDrawer.setAttribute('aria-labelledby', 'filterDrawerTitle');

        const openDrawer = () => {
            filterDrawer.style.left = '0';
            overlay.style.display = 'block';
            setTimeout(() => overlay.style.opacity = '1', 10);
            document.body.style.overflow = 'hidden';
            activateAccessibleModal(filterDrawer, {
                labelId: 'filterDrawerTitle',
                onClose: closeDrawer,
                initialFocusSelector: 'button[aria-label]'
            });
        };
        const closeDrawer = () => {
            deactivateAccessibleModal(filterDrawer);
            filterDrawer.style.left = '-100%';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300);
            document.body.style.overflow = '';
        };
        closeDrawerBtn.onclick = closeDrawer;
        overlay.onclick = closeDrawer;

        // Touch swipe to close (mobile friendly)
        let touchStartX = 0;
        filterDrawer.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, { passive: true });
        filterDrawer.addEventListener('touchend', e => {
            if (touchStartX - e.changedTouches[0].screenX > 50) closeDrawer();
        }, { passive: true });

        initTreasureGridControls(openDrawer);

        // Form layout (Vertical)
        filterForm.style.display = 'flex';
        filterForm.style.flexDirection = 'column';
        filterForm.style.gap = '10px';
        
        const filterGroups = filterForm.querySelectorAll('.filter-group');
        filterGroups.forEach(fg => {
            fg.style.display = 'flex';
            fg.style.flexDirection = 'column';
            fg.style.gap = '0';
            fg.style.width = '100%';
        });
        
        
        const formElements = filterForm.querySelectorAll('select, input, button');
        formElements.forEach(el => {
            if (el.type === 'checkbox') return;
            el.style.width = '100%';
            el.style.boxSizing = 'border-box';
            if (el.tagName !== 'BUTTON') {
                el.style.marginBottom = '5px';
            }
        });
            
            const oldSubmit = filterForm.querySelector('button[type="submit"], input[type="submit"]');
            if (oldSubmit) oldSubmit.remove();
            
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '10px';
            btnContainer.style.marginTop = '15px';
            
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = document.body.classList.contains('blueprint-theme') ? 'sa-btn sa-btn--ghost' : '';
            clearBtn.textContent = t('Clear');
            if (!clearBtn.className) {
                clearBtn.style.flex = '1';
                clearBtn.style.background = 'transparent';
                clearBtn.style.color = '#ccc';
                clearBtn.style.border = '1px solid #444';
                clearBtn.style.padding = '10px';
                clearBtn.style.borderRadius = '4px';
                clearBtn.style.cursor = 'pointer';
            } else {
                clearBtn.style.flex = '1';
            }
            clearBtn.onclick = () => { window.location.href = appPath('categories.html'); };

            const applyBtn = document.createElement('button');
            applyBtn.type = 'submit';
            applyBtn.className = document.body.classList.contains('blueprint-theme') ? 'sa-btn sa-btn--active' : '';
            applyBtn.textContent = t('Apply Filters');
            if (!applyBtn.className) {
                applyBtn.style.flex = '2';
                applyBtn.style.background = 'var(--primary-gold)';
                applyBtn.style.color = '#111';
                applyBtn.style.border = 'none';
                applyBtn.style.fontWeight = 'bold';
                applyBtn.style.padding = '10px';
                applyBtn.style.borderRadius = '4px';
                applyBtn.style.cursor = 'pointer';
            } else {
                applyBtn.style.flex = '2';
            }
            
            btnContainer.appendChild(clearBtn);
            btnContainer.appendChild(applyBtn);
            filterForm.appendChild(btnContainer);
            
        applyStaticTranslations(filterDrawer);
    }

    // Function to populate the specialty dropdown
    const populateSpecialties = async (quality = '') => {
        let specialtyContainer = document.getElementById('specialtySelect');
        
        // Fallback to locate the legacy div-based dropdown wrapper
        if (!specialtyContainer) {
            const labels = Array.from(document.querySelectorAll('label'));
            const specLabel = labels.find(l => l.textContent.trim().toLowerCase().includes('specialty') || l.textContent.trim().toLowerCase().includes('especialidad'));
            if (specLabel) {
                const parent = specLabel.closest('.filter-control') || specLabel.parentNode;
                const wrapper = parent.querySelector('.custom-select-wrapper') || parent.querySelector('.checkbox-group') || parent.querySelector('div, ul');
                if (wrapper) {
                    wrapper.id = 'specialtySelect';
                    specialtyContainer = wrapper;
                }
            }
        }
        if (!specialtyContainer) return;

        const urlParams = new URLSearchParams(window.location.search);
        const preselected = (urlParams.get('specialty') || '').split(',').filter(Boolean);

        await renderSpecialtyDropdown('specialtySelect', preselected, { quality: quality, context: 'filter' });
    };

    const urlParams = new URLSearchParams(window.location.search);
    
    if (qualitySelect) {
        const firstOpt = qualitySelect.options[0];
        if (firstOpt && (!firstOpt.value || firstOpt.value === '')) {
            firstOpt.textContent = t('All Qualities');
            firstOpt.dataset.origText = t('All Qualities');
        }
        Array.from(qualitySelect.options).forEach(opt => {
            if (opt.value && CATEGORY_META[opt.value]) {
                const meta = CATEGORY_META[opt.value];
                opt.textContent = `${t(meta.name)}`;
            }
        });
        if (urlParams.get('quality')) {
            qualitySelect.value = urlParams.get('quality');
        }
    }
    
    // Populate specialties on initial page load
    await populateSpecialties(qualitySelect ? qualitySelect.value : '');

    const province = urlParams.get('province');
    const city = urlParams.get('city');
    const neighborhood = urlParams.get('neighborhood');

    // Repopulate specialties when quality changes
    if (qualitySelect) {
        qualitySelect.addEventListener('change', () => {
            populateSpecialties(qualitySelect.value);
        });
    }

    // Handle form submission
    filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const quality = qualitySelect ? qualitySelect.value : '';
        const specialtyContainer = document.getElementById('specialtySelect');
        let specialty = '';
        if (specialtyContainer) {
            specialty = specialtyContainer.value;
        }
        
        const provEl = document.getElementById('provinceSelect');
        const cityEl = document.getElementById('citySelect');
        const neighEl = document.getElementById('neighborhoodSelect');

        const url = new URL(`${BASE_ORIGIN}/categories.html`);
        if (quality && quality.trim()) url.searchParams.set('quality', quality);
        if (specialty && specialty.trim()) url.searchParams.set('specialty', specialty);
        if (provEl && provEl.value.trim()) {
            url.searchParams.set('province', provEl.value);
            if (provEl.value.trim().toLowerCase() === 'caba') {
                if (cityEl && cityEl.value.trim()) url.searchParams.set('neighborhood', cityEl.value);
            } else {
                if (cityEl && cityEl.value.trim()) url.searchParams.set('city', cityEl.value);
                if (neighEl && neighEl.value.trim()) url.searchParams.set('neighborhood', neighEl.value);
            }
        }
        
        window.location.href = url.toString();
    });

    // Add change listener to recalculate counts instantly when dropdowns change
    filterForm.addEventListener('change', () => {
        setTimeout(applyCountsToDropdowns, 300); // Small delay to let sub-dropdowns populate
    });
}

let allProfsCache = null;
let profsFetchPromise = null;

export async function applyCountsToDropdowns() {
    const filterForm = document.getElementById('filterForm');
    if (!filterForm) return;

    if (!allProfsCache) {
        if (!profsFetchPromise) {
            const url = new URL(`${API_URL}/professionals`);
            url.searchParams.set('limit', '0');
            url.searchParams.set('minimal', 'true'); // Prevent fetching photos for count sweeps
            url.searchParams.set('_', new Date().getTime()); // Prevent browser from caching old seed data
            profsFetchPromise = fetch(url).then(res => res.json()).catch(e => {
                console.error('Error fetching profs for counts', e);
                return { success: false };
            });
        }
        const data = await profsFetchPromise;
        if (data && data.success) {
            allProfsCache = data.data;
        } else {
            profsFetchPromise = null; // Reset to allow retry
                    allProfsCache = []; // Prevent indefinite locking, default to 0 counts
        }
    }
    
    const profs = allProfsCache;
    if (!profs || profs.length === 0) return;

    const ensureDefault = (el, textKey) => {
        if (el && el.options && el.options.length > 0 && (!el.options[0].value || el.options[0].value === '')) {
            el.options[0].textContent = t(textKey);
            el.options[0].dataset.origText = t(textKey);
        }
    };

    const qualitySelect = document.getElementById('qualitySelect');
    const specialtyContainer = document.getElementById('specialtySelect');
    const provEl = document.getElementById('provinceSelect');
    const cityEl = document.getElementById('citySelect');
    const neighEl = document.getElementById('neighborhoodSelect');

    ensureDefault(qualitySelect, 'All Qualities');
    if (specialtyContainer && specialtyContainer.tagName === 'SELECT') ensureDefault(specialtyContainer, 'All Specialties');
    ensureDefault(provEl, 'All Provinces');
    ensureDefault(cityEl, provEl && provEl.value.trim().toLowerCase() === 'caba' ? 'All Neighborhoods' : 'All Cities');
    ensureDefault(neighEl, 'All Neighborhoods');

    let specialtyFilterValue = '';
    if (specialtyContainer && specialtyContainer.tagName === 'SELECT') {
        specialtyFilterValue = specialtyContainer.value;
    }

    const currentFilters = {
        quality: qualitySelect ? qualitySelect.value : '',
        specialty: specialtyFilterValue,
        province: provEl && provEl.tagName === 'SELECT' ? provEl.value : '',
        city: cityEl && cityEl.tagName === 'SELECT' ? cityEl.value : '',
        neighborhood: neighEl && neighEl.tagName === 'SELECT' ? neighEl.value : ''
    };

    const countMatches = (filters) => {
        return profs.filter(p => {
            const prof = p.professionalProfile || {};
            const loc = prof.location || {};
            const q = prof.quality || 'Standard';
            
            if (filters.quality && q !== filters.quality) return false;
            if (filters.specialty) {
                const requiredSpecialties = filters.specialty.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                if (requiredSpecialties.length > 0) {
                    const userServices = (prof.services || []).map(s => s.trim().toLowerCase());
                    const hasAtLeastOne = requiredSpecialties.some(reqSpec => userServices.includes(reqSpec));
                    if (!hasAtLeastOne) return false;
                }
            }
            
            const fProv = (filters.province || '').trim().toLowerCase();
            const lProv = (loc.province || '').trim().toLowerCase();
            
            if (fProv && (!lProv || (!lProv.includes(fProv) && !fProv.includes(lProv)))) return false;
            
            // Unify location filtering to handle the CABA case gracefully.
            // When CABA is the province, the 'city' filter actually holds the neighborhood.
            let effectiveCityFilter = (filters.city || '').trim().toLowerCase();
            let effectiveNeighFilter = (filters.neighborhood || '').trim().toLowerCase();

            if (fProv === 'caba') {
                // If province is CABA, the city filter is the neighborhood filter. There is no city filter.
                effectiveNeighFilter = effectiveCityFilter;
                effectiveCityFilter = '';
            }

            const lCity = (loc.city || '').trim().toLowerCase();
            const lNeigh = (loc.neighborhood || '').trim().toLowerCase();

            if (effectiveCityFilter && (!lCity || !lCity.includes(effectiveCityFilter))) return false;
            if (effectiveNeighFilter && (!lNeigh || !lNeigh.includes(effectiveNeighFilter))) return false;
            
            return true;
        }).length;
    };

    const updateSelectCounts = (selectEl, filterKey, resetKeys = []) => {
        if (!selectEl || selectEl.tagName !== 'SELECT') return;
        Array.from(selectEl.options).forEach(opt => {
            if (opt.textContent.includes('Loading...')) return;
            
            // Save original text to avoid appending multiple times on changes
            if (typeof opt.dataset.origText === 'undefined') {
                opt.dataset.origText = opt.textContent;
            }
            
            const testFilters = { ...currentFilters, [filterKey]: opt.value };
            resetKeys.forEach(k => testFilters[k] = '');
            const count = countMatches(testFilters);
            
            // Always display the option from the database, even if count is 0
            opt.style.display = '';
            opt.disabled = false;
            opt.textContent = `${opt.dataset.origText} (${count})`;
        });
    };

    const updateCheckboxCounts = (containerEl, filterKey, resetKeys = []) => {
        if (!containerEl || containerEl.tagName !== 'DIV') return;
        Array.from(containerEl.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
            const label = containerEl.querySelector(`label[for="${cb.id}"]`);
            if (!label) return;

            if (typeof label.dataset.origText === 'undefined') {
                label.dataset.origText = label.textContent;
            }
            
            const testFilters = { ...currentFilters, [filterKey]: cb.value };
            resetKeys.forEach(k => testFilters[k] = '');
            const count = countMatches(testFilters);
            
            label.textContent = `${label.dataset.origText} (${count})`;
        });
    };

    updateSelectCounts(qualitySelect, 'quality', []);
    if (specialtyContainer && specialtyContainer.tagName === 'SELECT') {
        updateSelectCounts(specialtyContainer, 'specialty', []);
    }
    updateSelectCounts(provEl, 'province', ['city', 'neighborhood']);
    updateSelectCounts(cityEl, 'city', ['neighborhood']);
    updateSelectCounts(neighEl, 'neighborhood');
}


// Track dashboard grid photo click, then navigate to profile
export function trackDashboardPhotoClick(alias) {
    if (!alias) return;
    fetch(`${API_URL}/professionals/${encodeURIComponent(alias)}/track-photo-click`, {
        method: 'POST',
        keepalive: true
    }).catch(() => {});
    navigateWithReturn('/perfil/' + encodeURIComponent(alias));
}

// Contact on WhatsApp
export function contactOnWhatsApp(alias) {
    // Safely track the conversion in Plausible without personal data
    if (typeof plausible === 'function') {
        plausible('WhatsApp Click', { props: { professional: alias } });
    }

    const url = `${API_URL}/professionals/${encodeURIComponent(alias)}/whatsapp`;
    window.open(url, '_blank');
}

// Contact on Phone
export function contactOnPhone(alias) {
    if (typeof plausible === 'function') {
        plausible('Phone Click', { props: { professional: alias } });
    }
    const url = `${API_URL}/professionals/${encodeURIComponent(alias)}/phone`;
    window.open(url, '_self');
}

window.applyCountsToDropdowns = applyCountsToDropdowns;
window.contactOnWhatsApp = contactOnWhatsApp;
window.contactOnPhone = contactOnPhone;
