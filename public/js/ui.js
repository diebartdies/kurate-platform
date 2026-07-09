import { BASE_ORIGIN, API_URL, appPath } from './globals.js';
import { t } from './i18n.js';
import { syncDocumentLang } from './a11y.js';
import {
    navigateBack as returnNavigateBack,
    clearReturnStack,
    logoutToEntrance
} from './navReturn.js';

export function navigateBack(fallback) {
    returnNavigateBack(fallback);
}

function ensureResponsiveCss() {
    if (document.getElementById('FullMinent-responsive-css')) return;
    if (document.querySelector('link[rel="stylesheet"][href*="responsive.css"]')) return;

    const link = document.createElement('link');
    link.id = 'FullMinent-responsive-css';
    link.rel = 'stylesheet';
    link.href = '/css/responsive.css?v=8.13';
    document.head.appendChild(link);

    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport && !viewport.content.includes('viewport-fit')) {
        viewport.content = `${viewport.content}, viewport-fit=cover`;
    }
}

// --- Inject Global Dynamic Styles ---
export function injectGlobalStyles() {
    ensureResponsiveCss();

    if (!document.getElementById('FullMinent-global-styles')) {
        const style = document.createElement('style');
        style.id = 'FullMinent-global-styles';
        style.textContent = `
            .fileteado-section {
                transition: box-shadow 0.4s ease;
            }
            .fileteado-section:hover {
                box-shadow: 0 0 25px rgba(184, 146, 46, 0.25), inset 0 0 15px rgba(184, 146, 46, 0.15);
            }
        `;
        document.head.appendChild(style);
        
        const adminStyles = document.createElement('style');
        adminStyles.textContent = `
            .admin-nav-btn {
                width: 100%; padding: 10px 15px; background: transparent; border: 1px solid transparent;
                color: #ccc; text-align: left; border-radius: 6px; cursor: pointer;
                transition: all 0.2s ease; font-size: 0.95rem;
            }
            .admin-nav-btn:hover {
                background: rgba(255, 255, 255, 0.05); color: white;
            }
            .admin-nav-btn.active-nav {
                background: rgba(212, 175, 55, 0.15); color: var(--primary-gold);
                border: 1px solid rgba(212, 175, 55, 0.3);
            }
        `;
        document.head.appendChild(adminStyles);
    }
}

// --- Plausible Analytics (Zero-Cookie, Privacy First) ---
export function injectPlausible() {
    /* Temporarily disabled until analytics.drsrv.net.ar DNS is configured
    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', 'FullMinent.drsrv.net.ar');
    script.src = 'https://analytics.drsrv.net.ar/js/script.tagged-events.js';
    document.head.appendChild(script);
    */

    // Initialize custom event tracker array
    window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) };
}

export function initGlobalTopBar() {
    if (document.getElementById('globalTopBar')) return;

    const topBar = document.createElement('div');
    topBar.id = 'globalTopBar';
    Object.assign(topBar.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '55px',

        backgroundColor: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none',
        borderBottom: '1px solid transparent',
        zIndex: '9999', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 20px', boxSizing: 'border-box', fontFamily: 'sans-serif',
        transition: 'background-color 0.3s ease, border-bottom-color 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease'
    });

    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            topBar.style.backgroundColor = 'rgba(10, 10, 10, 0.95)';
            topBar.style.backdropFilter = 'blur(15px)';
            topBar.style.WebkitBackdropFilter = 'blur(15px)';
            topBar.style.borderBottomColor = 'rgba(212, 175, 55, 0.8)';
        } else {
            topBar.style.backgroundColor = 'transparent';
            topBar.style.backdropFilter = 'none';
            topBar.style.WebkitBackdropFilter = 'none';
            topBar.style.borderBottomColor = 'transparent';
        }
    });

    if (!document.getElementById('topBarMobileStyles')) {
        const style = document.createElement('style');
        style.id = 'topBarMobileStyles';
        style.textContent = `
            @media (max-width: 600px) {
                #globalTopBar { padding: 0 5px !important; }
                .brand-text { display: none !important; }
                .brand-logo svg { margin-right: 5px !important; height: 22px !important; width: 22px !important; }
                #globalTopBar button, #globalTopBar a { padding: 4px 6px !important; font-size: 0.75rem !important; }
                .user-info-text { display: none !important; }
                .left-group-back { margin-right: 5px !important; }
            }
        `;
        document.head.appendChild(style);
    }

    const currentLang = localStorage.getItem('platform_lang') || 'es';

    const userInfo = document.createElement('div');
    userInfo.style.color = 'white';
    userInfo.style.fontSize = '0.9rem';
    userInfo.style.display = 'flex';
    userInfo.style.alignItems = 'center';

    let userDisplay = '';
    const userString = localStorage.getItem('user');
    let isLoggedIn = false;
    if (userString) {
        try {
            const user = JSON.parse(userString);
            let nameToShow = user.name || user.email || 'Guest';
            if (user.role === 'professional' && user.professionalProfile?.alias) {
                nameToShow = user.professionalProfile.alias;
            }
            userDisplay = `<span class="user-info-text">User: </span><strong style="color: var(--primary-gold);">${nameToShow}</strong>`;
            userInfo.innerHTML = userDisplay;

            if (user.role === 'professional') {
                const editLink = document.createElement('a');
                editLink.href = appPath('profDashboard.html');
                editLink.style.cssText = 'color: var(--dark-bg); background-color: var(--primary-gold); margin-left: 10px; text-decoration: none; font-size: 0.8rem; font-weight: bold; padding: 3px 8px; border-radius: 4px;';
                editLink.textContent = `✏️ ${t('Edit Profile')}`;
                userInfo.appendChild(editLink);
            } else if (user.role === 'admin') {
                // Give admins a clear top-menu link back to their home
                // dashboard. On pages that render this global top bar, the
                // universal floating button (adminHome.js) is suppressed, so
                // this inline link is the single admin return-home entry point.
                const segment = window.location.pathname.split('/').pop();
                const page = (segment === '' || segment === '/') ? 'index.html' : segment;
                if (page !== 'dashboard.html') {
                    const adminLink = document.createElement('a');
                    adminLink.id = 'topBarAdminHomeLink';
                    adminLink.href = appPath('dashboard.html');
                    adminLink.setAttribute('data-skip-nav-return', '');
                    adminLink.style.cssText = 'color: var(--dark-bg); background-color: var(--primary-gold); margin-left: 10px; text-decoration: none; font-size: 0.8rem; font-weight: bold; padding: 3px 8px; border-radius: 4px;';
                    adminLink.textContent = `🏠 ${t('Admin Menu')}`;
                    userInfo.appendChild(adminLink);
                }
            }
            isLoggedIn = true;
        } catch (e) { console.error('Failed to parse user', e); }
    }

    if (isLoggedIn) {
        const topLogoutBtn = document.createElement('a');
        topLogoutBtn.href = '#';
        topLogoutBtn.innerHTML = t('Logout');
        Object.assign(topLogoutBtn.style, {
            color: 'var(--accent-red)',
            marginLeft: '15px',
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontWeight: 'bold'
        });
        topLogoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    await fetch(`${API_URL}/auth/logout`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        credentials: 'include'
                    });
                }
            } catch (err) {
                console.error('Logout error:', err);
            } finally {
                document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('is18Plus');
                logoutToEntrance();
            }
        });
        userInfo.appendChild(topLogoutBtn);
    }

    const rightGroup = document.createElement('div');
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'center';
    rightGroup.style.gap = '15px';

    const langSwitcher = document.createElement('div');
    langSwitcher.className = 'lang-switcher';

    const makeLangBtn = (lang, flagUrl, label) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = label;
        btn.setAttribute('aria-label', lang === 'es' ? t('Switch to Spanish') : t('Switch to English'));
        btn.setAttribute('aria-pressed', currentLang === lang ? 'true' : 'false');
        btn.className = currentLang === lang ? 'lang-active' : 'lang-inactive';
        btn.innerHTML = `<img class="preserve-brand-colors" src="${flagUrl}" width="28" height="21" alt="">`;
        btn.addEventListener('click', () => {
            if (currentLang === lang) return;
            localStorage.setItem('platform_lang', lang);
            syncDocumentLang(lang);
            window.location.reload();
        });
        return btn;
    };

    langSwitcher.appendChild(makeLangBtn('es', 'https://flagcdn.com/w40/ar.png', 'Español'));
    langSwitcher.appendChild(makeLangBtn('en', 'https://flagcdn.com/w40/us.png', 'English'));

    if (!isLoggedIn) {
        const authLinks = document.createElement('div');
        authLinks.style.display = 'flex';
        authLinks.style.gap = '8px';
        authLinks.style.fontSize = '0.85rem';
        authLinks.style.fontWeight = 'bold';

        const loginLink = document.createElement('a');
        loginLink.href = appPath('login.html');
        loginLink.textContent = t('Login');
        loginLink.style.color = 'var(--primary-gold)';
        loginLink.style.textDecoration = 'none';

        const registerLink = document.createElement('a');
        registerLink.href = appPath('register.html?type=guest');
        registerLink.textContent = t('Register');
        registerLink.style.color = '#ccc';
        registerLink.style.textDecoration = 'none';

        authLinks.appendChild(loginLink);
        const sep = document.createElement('span');
        sep.textContent = '/';
        sep.style.color = '#666';
        authLinks.appendChild(sep);
        authLinks.appendChild(registerLink);

        rightGroup.appendChild(authLinks);
    }

    rightGroup.appendChild(langSwitcher);

    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';

    const pageSegment = window.location.pathname.split('/').pop();
    const currentPage = (pageSegment === '' || pageSegment === '/') ? 'index.html' : pageSegment;

    if (currentPage !== 'index.html') {
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'left-group-back';
        backBtn.setAttribute('aria-label', t('Back'));
        backBtn.innerHTML = '&#8592; ' + t('Back');
        Object.assign(backBtn.style, {
            background: 'transparent', border: '1px solid white', borderRadius: '4px',
            color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
            padding: '4px 8px', transition: 'all 0.3s ease', marginRight: '15px'
        });
        backBtn.addEventListener('mouseover', () => backBtn.style.background = 'rgba(255, 255, 255, 0.1)');
        backBtn.addEventListener('mouseout', () => backBtn.style.background = 'transparent');
        backBtn.onclick = () => navigateBack(() => { window.location.href = appPath('index.html'); });
        leftGroup.appendChild(backBtn);
    }

    const brandLink = document.createElement('a');
    brandLink.href = appPath('index.html');
    brandLink.className = 'brand-logo';
    brandLink.setAttribute('aria-label', 'FullMinent');
    brandLink.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="height: 28px; width: 28px; margin-right: 10px; border-radius: 4px; padding: 2px;" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span class="brand-text" style="font-family: 'Playfair Display', serif; font-weight: 900; letter-spacing: 1px; color: white;">FullMinent</span>
    `;
    brandLink.style.display = 'flex';
    brandLink.style.alignItems = 'center';
    brandLink.style.fontSize = '1.2rem';
    brandLink.style.marginRight = '15px';
    brandLink.style.textDecoration = 'none';

    leftGroup.appendChild(brandLink);
    leftGroup.appendChild(userInfo);

    topBar.appendChild(leftGroup);
    topBar.appendChild(rightGroup);

    document.body.prepend(topBar);
    document.body.classList.add('has-global-topbar');
}

export function initPrivacyShield() {
    if (document.getElementById('privacyShield')) return;

    const shield = document.createElement('div');
    shield.id = 'privacyShield';
    shield.className = 'privacy-shield';
    if (
        document.body.classList.contains('register-page')
        || (document.body.classList.contains('login-page') && !document.body.classList.contains('landing-page'))
        || document.body.classList.contains('password-recovery-page')
    ) {
        shield.classList.add('privacy-shield--form-page');
    }
    Object.assign(shield.style, {
        position: 'fixed', bottom: '20px', left: '20px',
        backgroundColor: 'rgba(10, 10, 10, 0.95)', border: '1px solid var(--primary-gold)',
        borderRadius: '8px', padding: '10px 15px', display: 'flex', alignItems: 'center',
        gap: '12px', zIndex: '9000', boxShadow: '0 4px 15px rgba(0,0,0,0.8)',
        cursor: 'pointer', transition: 'all 0.3s ease', maxWidth: '240px',
        backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)'
    });

    shield.innerHTML = `
        <div style="flex-shrink: 0;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
        </div>
        <div style="font-family: sans-serif; font-size: 0.8rem; color: #ccc; line-height: 1.3; overflow: hidden;">
            <strong style="color: var(--primary-gold); display: block; margin-bottom: 3px; font-size: 0.85rem;">${t('100% Privacy Guarantee')}</strong>
            <span class="shield-text" style="display: none;">${t("Zero cookies. Zero third-party trackers. We don't harvest your data. Check your own browser's tracker-blocker to verify and compare us with other apps.")}</span>
            <span class="shield-preview">${t('Zero Trackers. Cookieless.')}</span>
        </div>
    `;

    const expand = () => {
        shield.querySelector('.shield-text').style.display = 'inline';
        shield.querySelector('.shield-preview').style.display = 'none';
        shield.style.maxWidth = '350px';
        shield.classList.add('privacy-shield--expanded');
    };
    const collapse = () => {
        shield.querySelector('.shield-text').style.display = 'none';
        shield.querySelector('.shield-preview').style.display = 'inline';
        shield.style.maxWidth = '240px';
        shield.classList.remove('privacy-shield--expanded');
    };

    shield.addEventListener('mouseenter', expand);
    shield.addEventListener('mouseleave', collapse);
    shield.addEventListener('click', () => {
        if (shield.querySelector('.shield-text').style.display === 'none') expand();
        else collapse();
    });

    document.body.appendChild(shield);
}
