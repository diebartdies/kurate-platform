export const INITIAL_CATEGORY_BATCH = 2;
export const CATEGORY_SCROLL_BATCH = 1;

let categoryRenderQueue = [];
let categoryRenderIndex = 0;
let categoryScrollObserver = null;
let activeContainer = null;

export function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function buildCategoryQueue(categoriesMap, order) {
    return order
        .filter(cat => (categoriesMap[cat]?.length || 0) > 0)
        .map(cat => {
            const items = [...categoriesMap[cat]];
            shuffleArray(items);
            return { cat, items };
        });
}

export function resetLazyCategoryLoader() {
    categoryScrollObserver?.disconnect();
    categoryScrollObserver = null;
    document.getElementById('categoryScrollSentinel')?.remove();
    categoryRenderQueue = [];
    categoryRenderIndex = 0;
    activeContainer = null;
    hideCategoryRenderProgress();
}

function hideCategoryRenderProgress() {
    const progressWrapper = document.getElementById('floatingProgressWrapper');
    if (progressWrapper) progressWrapper.style.display = 'none';
}

export function updateCategoryRenderProgress() {
    const progressWrapper = document.getElementById('floatingProgressWrapper');
    const progressBar = document.getElementById('floatingProgressBar');
    const progressText = document.getElementById('floatingProgressText');
    if (!progressWrapper || !progressBar || !progressText) return;

    const total = categoryRenderQueue.length;
    if (total === 0 || categoryRenderIndex >= total) {
        progressWrapper.style.display = 'none';
        return;
    }

    const percentage = Math.min(100, Math.round((categoryRenderIndex / total) * 100));
    progressWrapper.style.display = 'flex';
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
}

function removeCategoryScrollSentinel() {
    document.getElementById('categoryScrollSentinel')?.remove();
}

function setupCategoryScrollSentinel(renderBatch) {
    categoryScrollObserver?.disconnect();
    removeCategoryScrollSentinel();

    if (!activeContainer || categoryRenderIndex >= categoryRenderQueue.length) return;

    const sentinel = document.createElement('div');
    sentinel.id = 'categoryScrollSentinel';
    sentinel.style.height = '1px';
    sentinel.setAttribute('aria-hidden', 'true');
    activeContainer.appendChild(sentinel);

    categoryScrollObserver = new IntersectionObserver((entries) => {
        if (!entries[0]?.isIntersecting) return;
        categoryScrollObserver?.disconnect();
        renderBatch(CATEGORY_SCROLL_BATCH);
    }, { rootMargin: '400px' });

    categoryScrollObserver.observe(sentinel);
}

/**
 * Renders categories in batches: first INITIAL_CATEGORY_BATCH, then one per scroll.
 * @param {HTMLElement} container - Element that receives category sections
 * @param {Array<{cat: string, items: Array}>} queue
 * @param {(entry: {cat: string, items: Array}, ctx: {eagerImages: boolean}) => void} renderOne
 * @param {{ onInitialBatchComplete?: () => void, onAllComplete?: () => void }} hooks
 */
export function startLazyCategoryLoader(container, queue, renderOne, hooks = {}) {
    resetLazyCategoryLoader();
    activeContainer = container;
    categoryRenderQueue = queue;
    categoryRenderIndex = 0;

    let firstCategoryEver = true;

    const renderBatch = (count) => {
        const end = Math.min(categoryRenderIndex + count, categoryRenderQueue.length);
        for (let i = categoryRenderIndex; i < end; i++) {
            renderOne(categoryRenderQueue[i], { eagerImages: firstCategoryEver });
            firstCategoryEver = false;
        }
        categoryRenderIndex = end;
        updateCategoryRenderProgress();
        removeCategoryScrollSentinel();

        if (categoryRenderIndex === Math.min(INITIAL_CATEGORY_BATCH, categoryRenderQueue.length) && hooks.onInitialBatchComplete) {
            hooks.onInitialBatchComplete();
        }

        if (categoryRenderIndex >= categoryRenderQueue.length) {
            categoryScrollObserver?.disconnect();
            hideCategoryRenderProgress();
            hooks.onAllComplete?.();
            return;
        }

        setupCategoryScrollSentinel(renderBatch);
    };

    renderBatch(INITIAL_CATEGORY_BATCH);
}
