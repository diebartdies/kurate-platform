/** Prevent ghost flash: hide dynamic shells until JS finishes loading. */
const PENDING_CLASS = 'page-pending';

export function beginPageLoad(contentId, loaderId, { clearContent = false } = {}) {
    document.documentElement.classList.add(PENDING_CLASS);

    const loader = loaderId ? document.getElementById(loaderId) : null;
    const content = contentId ? document.getElementById(contentId) : null;

    if (loader) {
        loader.classList.remove('hidden');
        loader.style.display = '';
    }
    if (content) {
        content.classList.add('hidden');
        content.setAttribute('aria-busy', 'true');
        if (clearContent) content.innerHTML = '';
    }
}

export function finishPageLoad(contentId, loaderId) {
    document.documentElement.classList.remove(PENDING_CLASS);

    const loader = loaderId ? document.getElementById(loaderId) : null;
    const content = contentId ? document.getElementById(contentId) : null;

    if (loader) {
        loader.classList.add('hidden');
        loader.style.display = 'none';
    }
    if (content) {
        content.classList.remove('hidden');
        content.removeAttribute('aria-busy');
    }
}

export function failPageLoad(contentId, loaderId, message) {
    document.documentElement.classList.remove(PENDING_CLASS);

    const loader = loaderId ? document.getElementById(loaderId) : null;
    const content = contentId ? document.getElementById(contentId) : null;

    if (loader) {
        loader.classList.add('hidden');
        loader.style.display = 'none';
    }
    if (content) {
        content.classList.remove('hidden');
        content.removeAttribute('aria-busy');
        if (message) content.innerHTML = message;
    }
}

export const beginDashboardLoad = beginPageLoad;
export const finishDashboardLoad = finishPageLoad;
export const failDashboardLoad = failPageLoad;
