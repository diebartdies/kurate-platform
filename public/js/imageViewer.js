// Global image viewer + click delegation.
// Zoom applies to DETAIL / GALLERY photos only. Card thumbnails and links keep
// their normal navigation behaviour. Logos, icons and placeholders are ignored.
(function () {
    'use strict';

    // Images that must never open the viewer (brand marks, UI icons, placeholders).
    var EXCLUDE_SRC = /(?:KuraTe_logo|logo|no-photo\.svg|apks_android_IOS|awareness-ribbon|whatsapp\.png|Telegram\.png|phone\.svg|flagcdn|data:image\/svg)/i;

    // Containers whose photos are considered "detail / gallery" and are zoomable.
    var ZOOM_CONTAINER = [
        '.gallery-item',
        '.gallery',
        '.photo-item-public',
        '#treasurePhotoGrid',
        '.photo-carousel',
        'img[data-zoomable]',
        '[data-zoomable]'
    ].join(',');

    function ensureViewer() {
        if (typeof window.openImageModal === 'function') return;

        window.openImageModal = function (src) {
            if (!src) return;
            var modal = document.getElementById('imageViewerModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'imageViewerModal';
                modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:4000;display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';

                var closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.innerHTML = '&times;';
                closeBtn.setAttribute('aria-label', 'Close');
                closeBtn.style.cssText = 'position:absolute;top:20px;right:30px;background:transparent;color:var(--primary-gold);border:none;font-size:50px;cursor:pointer;line-height:1;z-index:1;';

                var imgEl = document.createElement('img');
                imgEl.style.cssText = 'max-width:95%;max-height:92vh;object-fit:contain;border:2px solid var(--primary-gold);border-radius:8px;background:#111;';

                var closeModal = function () {
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                    document.body.style.overflow = '';
                };

                closeBtn.onclick = closeModal;
                modal.addEventListener('click', function (e) {
                    if (e.target === modal) closeModal();
                });
                document.addEventListener('keydown', function (e) {
                    if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
                });

                modal.appendChild(closeBtn);
                modal.appendChild(imgEl);
                document.body.appendChild(modal);
            }

            var target = modal.querySelector('img');
            if (target) target.src = src;
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        };
    }

    ensureViewer();

    // Track pointer movement so drag-to-scroll galleries do not trigger zoom.
    var downX = null;
    var downY = null;
    function markDown(e) {
        var p = e.touches && e.touches[0] ? e.touches[0] : e;
        downX = p.clientX;
        downY = p.clientY;
    }
    document.addEventListener('pointerdown', markDown, true);
    document.addEventListener('touchstart', markDown, { capture: true, passive: true });

    function resolveImage(target) {
        if (!target || !target.closest) return null;
        var img = target.closest('img');
        if (img) return img;
        var container = target.closest(ZOOM_CONTAINER);
        if (container) return container.querySelector('img');
        return null;
    }

    document.addEventListener('click', function (e) {
        if (downX !== null && (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8)) {
            return; // was a drag, not a click
        }

        var img = resolveImage(e.target);
        if (!img) return;

        // Preserve navigation when the photo is itself a link.
        if (img.closest('a')) return;

        var src = img.getAttribute('src') || '';
        if (!src || EXCLUDE_SRC.test(src)) return;

        var inZoomContext = !!img.closest(ZOOM_CONTAINER)
            || img.classList.contains('detail-avatar')
            || (img.classList.contains('photo') && !!img.closest('.head'));
        if (!inZoomContext) return;

        e.preventDefault();
        e.stopPropagation();
        window.openImageModal(img.currentSrc || img.src);
    }, false);
})();
