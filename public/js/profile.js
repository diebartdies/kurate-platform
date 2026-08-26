(function () {
    'use strict';

    const API_URL = (window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin) + '/api/v1';
    const NO_PHOTO = '/images/no-photo.svg';
    const CATEGORY_META = {
        'verificados': { name: '⭐ Verificados', alias: 'Experto', order: 5 },
        'Premium': { name: '✨ Premium', alias: 'Maestro', order: 4 },
        'Gold': { name: '🟡 Gold', alias: 'Profesional', order: 3 },
        'Silver': { name: '⚪ Silver', alias: 'Técnico', order: 2 },
        'Standard': { name: '🟤 Standard', alias: 'Inicial', order: 1 }
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
        const desiredQuality = prof.desiredQuality || quality;
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
        const isEvaluation = prof.isEvaluationPeriod === true;
        const qualityIndex = CATEGORY_ORDER.indexOf(quality);
        const desiredIndex = CATEGORY_ORDER.indexOf(desiredQuality);

        // Build category ladder
        const ladderHtml = CATEGORY_ORDER.map((q, i) => {
            const m = CATEGORY_META[q];
            const isCurrent = q === quality;
            const isDesired = q === desiredQuality && isEvaluation;
            const isReached = i <= qualityIndex;
            let style = 'display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;font-size:0.85rem;';
            if (isCurrent) {
                style += 'background:rgba(212,175,55,0.2);border:2px solid var(--primary-gold);font-weight:700;';
            } else if (isDesired) {
                style += 'background:rgba(212,175,55,0.08);border:1px dashed rgba(212,175,55,0.5);';
            } else if (isReached) {
                style += 'background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);opacity:0.7;';
            } else {
                style += 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);opacity:0.4;';
            }
            const badge = isCurrent ? '<span style="color:var(--primary-gold);font-weight:700;">TU</span>' : (isDesired ? '<span style="color:var(--primary-gold);font-size:0.7rem;">elegida</span>' : '');
            return `<div style="${style}"><span style="flex:1;">${m.name}</span>${badge}</div>`;
        }).reverse().join('');

        // Build specialties
        const CATEGORY_ORDER = Object.keys(CATEGORY_META);
        const activeServices = services.map(s => s.toLowerCase());
        const specHtml = services.length > 0 ? services.map(s => {
            return `<div style="background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.4);border-radius:8px;padding:8px 12px;font-size:0.85rem;color:var(--primary-gold);display:flex;align-items:center;gap:6px;"><span style="font-weight:700;">✓</span><span>${esc(s)}</span></div>`;
        }).join('') : '<div style="color:#666;font-size:0.85rem;">Sin especialidades configuradas</div>';

        // Evaluation info
        let evalHtml = '';
        if (isEvaluation) {
            const desiredMeta = CATEGORY_META[desiredQuality] || CATEGORY_META['Standard'];
            evalHtml = `<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:12px;margin-bottom:16px;">
                <div style="color:#f59e0b;font-weight:600;font-size:0.9rem;margin-bottom:4px;">Período de evaluación activo</div>
                <div style="color:#ccc;font-size:0.85rem;">Aparecés como <strong style="color:var(--primary-gold);">${meta.name}</strong>. Tu categoría elegida es <strong>${desiredMeta.name}</strong> — se aplica tras tu primer pago validado.</div>
            </div>`;
        }

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

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; text-align: center; padding: 14px 0; border-top: 1px solid rgba(212,175,55,0.15);">
                            <div><div style="font-size: 1.6rem; color: var(--primary-gold); font-weight: 700;">${stats.photoCount || 0}</div><div style="font-size: 0.75rem; color: #888;">Fotos vistas</div></div>
                            <div><div style="font-size: 1.6rem; color: #00ff50; font-weight: 700;">${stats.whatsappcCount || 0}</div><div style="font-size: 0.75rem; color: #888;">WhatsApp</div></div>
                            <div><div style="font-size: 1.6rem; color: #60a5fa; font-weight: 700;">${stats.callCount || 0}</div><div style="font-size: 0.75rem; color: #888;">Llamadas</div></div>
                        </div>
                    </div>
                </div>

                ${evalHtml}

                <div class="card" style="border: 1px solid rgba(212, 175, 55, 0.3); margin-top: 16px; padding: 16px;">
                    <div style="color: #999; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Categoría</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${ladderHtml}
                    </div>
                </div>

                <div class="card" style="border: 1px solid rgba(212, 175, 55, 0.3); margin-top: 12px; padding: 16px;">
                    <div style="color: #999; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Especialidades (donde aparecés)</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        ${specHtml}
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
            window.location.href = '/perfil/' + encodeURIComponent(alias);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadProfile);
    } else {
        loadProfile();
    }
})();
