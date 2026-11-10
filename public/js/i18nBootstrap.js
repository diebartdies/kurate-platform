// Aplica las traducciones en paginas que no cargan app.js/bootstrap.js
// (index, hogar, hogar-detail, captura-dni, precios, feedback, set-password).
// En modo EN tambien observa el DOM para traducir lo que se inserta despues.
import { applyStaticTranslations, startTranslationObserver, currentLang } from './i18n.js';

// El atributo lang del documento lo sincroniza bootstrap.js en las paginas con
// app.js; aca hay que hacerlo a mano para lectores de pantalla y correctores.
function syncLang() {
    document.documentElement.lang = currentLang === 'es' ? 'es' : 'en';
}

function run() {
    syncLang();
    startTranslationObserver();
    applyStaticTranslations();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
} else {
    run();
}

// Algunas paginas (por ejemplo hogar.html) traducen con su propio script en
// `load`; se re-aplica despues para que no queden textos en espanol sueltos.
window.addEventListener('load', function () {
    syncLang();
    applyStaticTranslations();
    startTranslationObserver();
});
