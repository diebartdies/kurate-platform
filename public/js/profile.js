(function () {
    'use strict';

    const API_URL = (window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin) + '/api/v1';
    const NO_PHOTO = '/images/no-photo.svg';
    const CATEGORY_META = {
        'verificados': { name: '⭐ Verificados', alias: 'Experto' },
        'Premium': { name: '✨ Premium', alias: 'Maestro' },
        'Gold': { name: '🟡 Gold', alias: 'Profesional' },
        'Silver': { name: '⚪ Silver', alias: 'Técnico' },
        'Standard': { name: '🟤 Standard', alias: 'Inicial' }
    };

    function esc(s) { return (s == null) ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function resolvePhoto(url) {
        if (!url || typeof url !== 'string') return NO_PHOTO;
        return url;
    }

    function authHeaders() {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token && token !== 'null' && token !== 'undefined') {
            headers['Authorization'] = 'Bearer ' + token;
        }
        return headers;
    }

    async function loadProfile() {
        const content = document.getElementById('profileContent');
        const loader = document.getElementById('loader');
        if (!content) return;

        try {
            const res = await fetch(API_URL + '/professionals/me?_=' + Date.now(), {
                headers: authHeaders(),
                credentials: 'include'
            });
            const data = await res.json();

            if (!data.success || !data.data) {
                window.location.href = '/login.html';
                return;
            }

            const user = data.data;
            localStorage.setItem('user', JSON.stringify(user));

            if (user.role === 'admin') {
                window.location.href = '/dashboard.html';
                return;
            }

            if (user.role !== 'professional') {
                window.location.href = '/hogar.html';
                return;
            }

            if (loader) loader.style.display = 'none';
            renderProfile(content, user, data.stats || {});
        } catch (err) {
            if (loader) loader.style.display = 'none';
            content.innerHTML = '<p style="color:#e08;text-align:center;padding:40px;">Error loading profile: ' + esc(err.message) + '</p>';
        }
    }

    function renderProfile(content, user, stats) {
        const prof = user.professionalProfile || {};
        const quality = prof.quality || 'Standard';
        const meta = CATEGORY_META[quality] || CATEGORY_META['Standard'];
        const photo = (prof.photos && prof.photos.length > 0) ? resolvePhoto(prof.photos[0]) : NO_PHOTO;
        const alias = prof.alias || 'Sin alias';
        const bio = prof.bio || '';
        const services = prof.services || [];
        const loc = prof.location || {};
        const location = loc.province
            ? [loc.neighborhood || loc.city, loc.province].filter(Boolean).join(', ')
            : '';
        const vStatus = user.verificationStatus || 'pending';
        const statusColor = vStatus === 'approved' ? '#22c55e' : (vStatus === 'rejected' ? '#e08' : '#f59e0b');
        const statusLabel = vStatus === 'approved' ? 'Aprobado' : (vStatus === 'rejected' ? 'Rechazado' : 'Pendiente');
        const isApproved = vStatus === 'approved';

        content.innerHTML = `
            <div style="max-width: 600px; margin: 0 auto;">
                <h2 class="gold-text" style="margin-bottom: 20px; text-align: center;">Mi Perfil</h2>

                <div class="card" style="border: 1px solid rgba(212, 175, 55, 0.3); padding: 0; overflow: hidden;">
                    <div style="position: relative;">
                        <img src="${esc(photo)}" alt="${esc(alias)}" style="width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block;" onerror="this.src='${NO_PHOTO}'">
                        <div style="position: absolute; top: 10px; right: 10px; padding: 4px 10px; border-radius: 12px; color: #fff; font-weight: bold; font-size: 0.75rem; background: ${statusColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.5);">
                            ${esc(statusLabel)}
                        </div>
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.85)); padding: 30px 16px 14px;">
                            <div style="font-size: 1.4rem; font-weight: 700; color: #fff;">${esc(alias)}</div>
                            <div style="font-size: 0.85rem; color: var(--primary-gold); margin-top: 4px;">${esc(meta.alias)} · ${esc(meta.name)}</div>
                        </div>
                    </div>

                    <div style="padding: 16px;">
                        ${bio ? `<div style="margin-bottom: 14px;"><div style="color: #999; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Bio</div><div style="color: #ddd; line-height: 1.5;">${esc(bio)}</div></div>` : ''}

                        ${location ? `<div style="margin-bottom: 14px;"><div style="color: #999; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Ubicación</div><div style="color: #ddd;">${esc(location)}</div></div>` : ''}

                        ${services.length > 0 ? `<div style="margin-bottom: 14px;"><div style="color: #999; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Servicios</div><div style="display: flex; flex-wrap: wrap; gap: 6px;">${services.map(s => '<span style="background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); border-radius: 6px; padding: 4px 10px; font-size: 0.85rem; color: var(--primary-gold);">' + esc(s) + '</span>').join('')}</div></div>` : ''}

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; text-align: center; padding: 14px 0; border-top: 1px solid rgba(212,175,55,0.15);">
                            <div><div style="font-size: 1.6rem; color: var(--primary-gold); font-weight: 700;">${stats.photoCount || 0}</div><div style="font-size: 0.75rem; color: #888;">Fotos vistas</div></div>
                            <div><div style="font-size: 1.6rem; color: #00ff50; font-weight: 700;">${stats.whatsappcCount || 0}</div><div style="font-size: 0.75rem; color: #888;">WhatsApp</div></div>
                            <div><div style="font-size: 1.6rem; color: #60a5fa; font-weight: 700;">${stats.callCount || 0}</div><div style="font-size: 0.75rem; color: #888;">Llamadas</div></div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">
                    <button id="findOnGridBtn" style="width: 100%; padding: 14px; background: var(--primary-gold); color: #0f0f1a; border: none; border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;">
                        Buscar mi anuncio en el grid
                    </button>
                </div>
            </div>
        `;

        document.getElementById('findOnGridBtn').addEventListener('click', function () {
            window.location.href = '/admin.html?findMe=' + encodeURIComponent(alias);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadProfile);
    } else {
        loadProfile();
    }
})();
