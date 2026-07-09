/*
 * Universal Admin Home button.
 *
 * Self-contained, dependency-free (no ES module imports) so it can be included
 * on EVERY page of the site, including pages that do not load the main app
 * bundle (`app.js`) or the global top bar (e.g. plataforma.html,
 * admin-potentials.html, the landing curtain).
 *
 * It injects a fixed-position link back to the admin home (dashboard.html)
 * that is rendered ONLY when the logged-in user's role is `admin`. For every
 * other visitor (professional, regular user, logged-out guest) it is a safe
 * no-op and renders nothing.
 *
 * On pages that load the main app bundle (app.js) the global top bar already
 * shows an inline admin return-home link, so this floating button is skipped
 * there to avoid duplicate links. It therefore only appears on standalone
 * pages without the top bar (e.g. plataforma.html, admin-potentials.html).
 */
(function () {
    'use strict';

    var ADMIN_HOME_PAGE = 'dashboard.html';
    var BUTTON_ID = 'adminHomeButton';

    // Mirror i18n.js wording for the existing 'Admin Menu' key so we stay
    // consistent without depending on the i18n module.
    var LABELS = {
        es: 'Menú de Admin',
        en: 'Admin Menu'
    };

    function isAdmin() {
        try {
            var raw = localStorage.getItem('user');
            if (!raw) return false;
            var user = JSON.parse(raw);
            return !!user && user.role === 'admin';
        } catch (e) {
            return false;
        }
    }

    function currentPage() {
        var segment = window.location.pathname.split('/').pop();
        if (segment === '' || segment === '/') return 'index.html';
        return segment;
    }

    function label() {
        var lang = 'es';
        try {
            lang = localStorage.getItem('platform_lang') || 'es';
        } catch (e) { /* localStorage may be unavailable */ }
        return LABELS[lang] || LABELS.es;
    }

    function appPath(page) {
        if (!page) return '/';
        if (/^https?:\/\//i.test(page)) return page;
        if (page.startsWith('/')) return page;
        return '/' + page.replace(/^\.\//, '');
    }

    function rendersGlobalTopBar() {
        // Pages that load the main app bundle build a global top bar (see
        // ui.js initGlobalTopBar) which carries its own inline admin
        // return-home link. On those pages we skip this floating button so the
        // admin only sees one link (in the top menu). Detection is done via the
        // static <script> tag so it is independent of script execution timing.
        return !!document.querySelector('script[src*="/js/app.js"]');
    }

    function injectStyles() {
        if (document.getElementById('adminHomeButtonStyles')) return;
        var style = document.createElement('style');
        style.id = 'adminHomeButtonStyles';
        style.textContent = [
            '#' + BUTTON_ID + ' {',
            '    position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;',
            '    display: inline-flex; align-items: center; gap: 8px;',
            '    padding: 8px 14px; border-radius: 999px;',
            '    background: rgba(10, 10, 10, 0.92); color: #D4AF37;',
            '    border: 1px solid #D4AF37; text-decoration: none;',
            '    font-family: sans-serif; font-size: 0.85rem; font-weight: bold;',
            '    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.6);',
            '    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);',
            '    transition: background 0.2s ease, transform 0.2s ease;',
            '}',
            '#' + BUTTON_ID + ':hover {',
            '    background: #D4AF37; color: #0a0a0a; transform: translateY(-1px);',
            '}',
            '#' + BUTTON_ID + ' svg { width: 18px; height: 18px; flex-shrink: 0; }',
            '@media (max-width: 600px) {',
            '    #' + BUTTON_ID + ' { right: 10px; bottom: 10px; padding: 8px; }',
            '    #' + BUTTON_ID + ' .admin-home-label { display: none; }',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function render() {
        if (!isAdmin()) return;
        // On pages with the global top bar, the admin link lives in the top
        // menu, so avoid showing a second (floating) link to the same place.
        if (rendersGlobalTopBar()) return;
        // Never link the admin home page to itself.
        if (currentPage() === ADMIN_HOME_PAGE) return;
        if (document.getElementById(BUTTON_ID)) return;
        if (!document.body) return;

        injectStyles();

        var link = document.createElement('a');
        link.id = BUTTON_ID;
        link.href = appPath(ADMIN_HOME_PAGE);
        link.setAttribute('aria-label', label());
        link.setAttribute('data-skip-nav-return', '');
        link.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M3 9.5L12 3l9 6.5"></path>' +
            '<path d="M5 10v10h14V10"></path>' +
            '<path d="M9 20v-6h6v6"></path>' +
            '</svg>' +
            '<span class="admin-home-label">' + label() + '</span>';

        document.body.appendChild(link);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
