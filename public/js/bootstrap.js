import { appPath } from './globals.js';
import { t, applyStaticTranslations } from './i18n.js';
import { initA11y, syncDocumentLang } from './a11y.js';
import { injectGlobalStyles, injectPlausible, initGlobalTopBar, initPrivacyShield } from './ui.js';
import { initAwarenessCampaigns } from './awarenessCampaigns.js';
import { attachPasswordToggles } from './uiHelpers.js';
import { setupLocationDropdowns } from './helpers.js';
import { pushReturnPoint, applyPendingScrollRestore } from './navReturn.js';
import {
    loadTreasures,
    loadTreasureDetails,
    initializeFilters,
    initTreasureGridControls,
    applyCountsToDropdowns
} from './discovery.js';
import { loadDashboard } from './admin.js';
import { loadProfDashboard } from './professional.js';
import { initProfessionalRegistration } from './registerProfessional.js';
import { loadInterestNotesList, loadInterestNoteArticle } from './interestNotes.js';
import { initCategoriesNotesBanner } from './categoriesNotesBanner.js';

function initRelativeLinkFixer() {
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        if (link.closest('[data-skip-nav-return]')) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || /^(mailto:|javascript:)/i.test(href)) return;
        if (/^https?:\/\//i.test(href) && !href.includes(window.location.hostname)) return;

        const isAppHtml = /\.html(?:[?#]|$)/i.test(href);
        const isAppPath = href.startsWith('/') && !href.startsWith('//');
        if (!isAppHtml && !isAppPath) return;

        e.preventDefault();
        pushReturnPoint();

        if (isAppHtml && !href.startsWith('/')) {
            const hashIndex = href.indexOf('#');
            const queryIndex = href.indexOf('?');
            const pathEnd = Math.min(
                queryIndex >= 0 ? queryIndex : href.length,
                hashIndex >= 0 ? hashIndex : href.length
            );
            const path = href.slice(0, pathEnd);
            const suffix = href.slice(pathEnd);
            window.location.href = appPath(path) + suffix;
        } else {
            window.location.href = href;
        }
    }, true);
}

export function initBootstrap() {
    document.addEventListener('DOMContentLoaded', async () => {
        const pageSegment = window.location.pathname.split('/').pop();
        const currentPage = (pageSegment === '' || pageSegment === '/') ? 'index.html' : pageSegment;
        const isProfilePath = window.location.pathname.startsWith('/perfil/');
        const effectivePage = isProfilePath ? 'treasure.html' : currentPage;

        const publicPages = ['index.html', 'login.html', 'register.html', 'verify.html', 'recover.html', 'detalles.html', 'conciencia-vih.html', 'conciencia-cancer-mama.html'];
        const isPublicPage = publicPages.includes(effectivePage);
        const is18Plus = localStorage.getItem('is18Plus');
        const hasToken = localStorage.getItem('token');

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.title = "Book1 - Excel";
                document.body.innerHTML = `
                <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:#fff; z-index:9999999; font-family:Arial, sans-serif; cursor:default;">
                    <div style="background:#217346; color:white; padding:10px 15px; font-weight:bold; font-size:14px; display:flex; align-items:center;">
                        <div style="background:white; color:#217346; padding:2px 6px; margin-right:15px; font-weight:900; border-radius:2px;">X</div>
                        Book1 - Excel
                    </div>
                    <div style="background:#f3f2f1; padding:8px 15px; border-bottom:1px solid #ccc; display:flex; gap:20px; font-size:13px; color:#444;">
                        <span style="border-bottom:2px solid #217346; padding-bottom:4px; font-weight:bold; color:#217346;">Home</span>
                        <span>Insert</span><span>Page Layout</span><span>Formulas</span><span>Data</span><span>Review</span><span>View</span>
                    </div>
                    <div style="padding:0; background:#fff; overflow:hidden; height:calc(100vh - 80px);">
                        <table style="width:100%; border-collapse:collapse; font-size:12px; color:#333;">
                            <thead>
                                <tr>
                                    <th style="border:1px solid #ccc; background:#f3f2f1; width:40px; padding:5px;"></th>
                                    <th style="border:1px solid #ccc; background:#f3f2f1; padding:5px; width:150px;">A</th>
                                    <th style="border:1px solid #ccc; background:#f3f2f1; padding:5px; width:150px;">B</th>
                                    <th style="border:1px solid #ccc; background:#f3f2f1; padding:5px; width:150px;">C</th>
                                    <th style="border:1px solid #ccc; background:#f3f2f1; padding:5px;">D</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Array(40).fill('').map((_, i) => `
                                <tr>
                                    <td style="border:1px solid #ccc; background:#f3f2f1; text-align:center; padding:4px;">${i + 1}</td>
                                    <td style="border:1px solid #ccc; padding:4px;">${i === 0 ? 'Q1 Revenue' : (i === 1 ? '$45,000' : '')}</td>
                                    <td style="border:1px solid #ccc; padding:4px;">${i === 0 ? 'Q2 Revenue' : (i === 1 ? '$52,000' : '')}</td>
                                    <td style="border:1px solid #ccc; padding:4px;">${i === 0 ? 'Q3 Revenue' : (i === 1 ? '$48,000' : '')}</td>
                                    <td style="border:1px solid #ccc; padding:4px;">${i === 0 ? 'Q4 Revenue' : (i === 1 ? '$61,000' : '')}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
                const topBar = document.getElementById('globalTopBar');
                if (topBar) topBar.remove();
            }
        });

        attachPasswordToggles(document);

        if (!isPublicPage && is18Plus !== 'true' && !hasToken) {
            const ref = document.referrer;
            if (ref && (ref.endsWith('/') || ref.includes('index.html'))) {
                localStorage.setItem('is18Plus', 'true');
                sessionStorage.setItem('valid_entry', 'true');
                sessionStorage.setItem('ancestor_code', 'index.html');
            } else {
                window.location.replace('/index.html');
                return;
            }
        }

        const allowedAncestors = {
            'categories.html': ['index.html', 'categories.html', 'treasure.html', 'dashboard.html', 'login.html'],
            'treasure.html': ['categories.html', 'treasure.html'],
            'dashboard.html': ['index.html', 'login.html', 'verify.html', 'categories.html', 'treasure.html', 'dashboard.html', 'profDashboard.html', 'notas-interes.html', 'nota-interes.html'],
            'profDashboard.html': ['index.html', 'login.html', 'verify.html', 'dashboard.html', 'profDashboard.html', 'categories.html', 'treasure.html', 'notas-interes.html', 'nota-interes.html'],
            'notas-interes.html': ['dashboard.html', 'profDashboard.html', 'notas-interes.html', 'nota-interes.html'],
            'nota-interes.html': ['dashboard.html', 'profDashboard.html', 'notas-interes.html', 'nota-interes.html'],
            'verify.html': ['register.html', 'login.html', 'verify.html'],
            'register.html': ['index.html', 'login.html', 'register.html', 'dashboard.html', 'categories.html', 'treasure.html'],
            'login.html': ['index.html', 'register.html', 'recover.html', 'login.html', 'dashboard.html', 'categories.html', 'treasure.html'],
            'recover.html': ['login.html', 'recover.html'],
            'home.html': ['dashboard.html', 'home.html']
        };

        if (publicPages.includes(effectivePage) || hasToken) {
            sessionStorage.setItem('valid_entry', 'true');
        }

        if (effectivePage === 'index.html') {
            sessionStorage.setItem('ancestor_code', 'index.html');
        } else {
            const referrer = document.referrer;
            const isFromOurSite = referrer && referrer.includes(window.location.hostname);

            if (!isPublicPage) {
                const hasActiveSession = sessionStorage.getItem('valid_entry') === 'true';

                if (!hasActiveSession && !hasToken && !isFromOurSite) {
                    sessionStorage.setItem('intended_destination', window.location.href);
                    console.warn(`[Flow Guardian] Direct access blocked for guest. Redirecting to start.`);
                    window.location.replace('/index.html');
                    return;
                } else if (!hasActiveSession) {
                    sessionStorage.setItem('valid_entry', 'true');
                }

                if (sessionStorage.getItem('valid_entry') !== 'true') {
                    sessionStorage.setItem('intended_destination', window.location.href);
                    console.warn(`[Flow Guardian] Strict entry enforced. Redirecting to start.`);
                    window.location.replace('/index.html');
                    return;
                }
            }

            const currentAncestorCode = sessionStorage.getItem('ancestor_code');
            const allowed = allowedAncestors[effectivePage];

            if (!currentAncestorCode && (hasToken || isFromOurSite) && (effectivePage === 'categories.html' || effectivePage === 'treasure.html' || effectivePage === 'dashboard.html' || effectivePage === 'profDashboard.html')) {
                sessionStorage.setItem('ancestor_code', 'index.html');
            }

            const publicAuthPages = new Set(['login.html', 'register.html', 'verify.html', 'recover.html']);
            const skipAncestorCheck = isPublicPage && publicAuthPages.has(effectivePage);

            if (!skipAncestorCheck && allowed && (!currentAncestorCode || !allowed.includes(currentAncestorCode))) {
                console.warn(`[Flow Guardian] Access denied. Invalid ancestor code for ${effectivePage}. Redirecting to start.`);
                window.location.replace('/index.html');
                return;
            }
            sessionStorage.setItem('ancestor_code', effectivePage);
        }

        initGlobalTopBar();
        initRelativeLinkFixer();
        initPrivacyShield();
        injectGlobalStyles();
        injectPlausible();
        initAwarenessCampaigns();
        initA11y();
        applyStaticTranslations();
        applyPendingScrollRestore();
        syncDocumentLang();

        if (document.getElementById('registerForm')) {
            initProfessionalRegistration();
        }

        if (document.getElementById('landing') || document.getElementById('loginPage')) {
            const landingStyles = document.createElement('style');
            landingStyles.textContent = `
            .landing-page header { display: none !important; }
            hr, .divider { display: none !important; border: none !important; }
        `;
            document.head.appendChild(landingStyles);

            if (document.getElementById('landing') && hasToken) {
                const intended = sessionStorage.getItem('intended_destination');
                if (intended) {
                    sessionStorage.removeItem('intended_destination');
                    window.location.replace(intended);
                } else {
                    window.location.replace(appPath('categories.html'));
                }
                return;
            }
        }

        if (document.getElementById('filterForm')) {
            const p = new URLSearchParams(window.location.search);
            const prov = p.get('province');

            setupLocationDropdowns('provinceSelect', 'citySelect', 'neighborhoodSelect', true, { province: prov, city: p.get('city'), neighborhood: p.get('neighborhood') });
            initCategoriesNotesBanner();
            try {
                await initializeFilters();
            } catch (e) {
                console.error('Error initializing dynamic filters:', e);
            }

            setTimeout(applyCountsToDropdowns, 500);
        } else if (document.getElementById('treasureGrid')) {
            initTreasureGridControls();
        }
        if (document.getElementById('treasureGrid')) loadTreasures();
        if (document.getElementById('dashboardContent')) loadDashboard();
        if (document.getElementById('profDashboardContent')) loadProfDashboard();
        if (document.getElementById('interestNotesList')) loadInterestNotesList();
        if (document.getElementById('interestNoteArticle')) loadInterestNoteArticle();
        if (document.getElementById('treasureDetail')) loadTreasureDetails();
    });

    window.addEventListener('pageshow', (event) => {
        if (document.getElementById('landing')) return;
        if (!event.persisted) return;
        document.documentElement.classList.add('page-pending');
        if (document.getElementById('dashboardContent')) loadDashboard();
        if (document.getElementById('profDashboardContent')) loadProfDashboard();
        if (document.getElementById('interestNotesList')) loadInterestNotesList();
        if (document.getElementById('interestNoteArticle')) loadInterestNoteArticle();
        if (document.getElementById('treasureGrid')) loadTreasures();
        if (document.getElementById('treasureDetail')) loadTreasureDetails();
    });
}
