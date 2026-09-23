(() => {
  const API = '/api/v1/avisos';
  const ENV_LABELS = { hogar: '🏠 Hogar', oficina: '🏢 Oficina', pime: '🏬 Pyme', industria: '🏭 Industria' };
  const STATUS_LABELS = { pending_payment: '⏳ Pendiente pago', active: '✅ Activo', expiring: '⚠️ Por expirar', expired: '❌ Expirado', rejected: '🚫 Rechazado', cancelled: '🚫 Cancelado' };
  const STATUS_COLORS = { pending_payment: '#eab308', active: '#22c55e', expiring: '#f97316', expired: '#ef4444', rejected: '#ef4444', cancelled: '#888' };

  const $ = (s, p) => (p || document).querySelector(s);

  function getToken() {
    const c = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
    return c ? c[1] : null;
  }

  function authHeaders() {
    const t = getToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function daysUntil(d) {
    const diff = new Date(d) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Load my avisos
  async function loadMyAvisos() {
    const list = $('#misAvisosList');
    const empty = $('#misAvisosEmpty');
    if (!list) return;

    try {
      const r = await fetch(`${API}/mis-avisos`, { headers: authHeaders() });
      const d = await r.json();
      const avisos = d.data || [];

      if (avisos.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      list.innerHTML = avisos.map(a => {
        const statusColor = STATUS_COLORS[a.status] || '#888';
        const days = daysUntil(a.endDate);
        const daysText = days > 0 ? `${days} días restantes` : 'Expirado';
        const showPayBtn = a.status === 'pending_payment' && !a.paymentReceiptUrl;
        const showPayAgainBtn = a.status === 'expired' && !a.paymentReceiptUrl;
        const lineLabel = a.serviceLineName || a.serviceLine || '';

        return `
          <div class="aviso-list-item" data-id="${a._id}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid rgba(var(--gold-rgb), 0.2); border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: background 0.2s; flex-wrap: wrap; gap: 8px;">
            <div style="flex: 1; min-width: 200px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-weight: 700; color: #fff;">${ENV_LABELS[a.environment] || a.environment}</span>
                ${lineLabel ? `<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: rgba(var(--gold-rgb), 0.12); color: var(--primary-gold); font-weight: 600;">${lineLabel}</span>` : ''}
                <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: ${statusColor}22; color: ${statusColor}; font-weight: 600;">${STATUS_LABELS[a.status] || a.status}</span>
              </div>
              <div style="font-size: 0.8rem; color: #aaa;">
                ${formatDate(a.startDate)} — ${formatDate(a.endDate)} &nbsp;|&nbsp; ${daysText}
                ${a.price ? ` &nbsp;|&nbsp; $${a.price.toLocaleString('es-AR')}` : ''}
              </div>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
              ${showPayBtn || showPayAgainBtn ? `<button class="aviso-pay-btn" data-id="${a._id}" data-price="${a.price || 0}" data-label="${ENV_LABELS[a.environment] || a.environment}${lineLabel ? ` — ${lineLabel}` : ''}" style="padding: 6px 12px; background: var(--primary-gold); color: #0f0f1a; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 0.8rem;">Subir pago</button>` : ''}
              ${a.paymentReceiptUrl && a.status === 'pending_payment' ? `<span style="font-size: 0.8rem; color: #22c55e;">✓ Pago subido</span>` : ''}
              ${a.status !== 'expired' && a.status !== 'cancelled' ? `<button class="aviso-cancel-btn" data-id="${a._id}" style="padding: 6px 12px; background: transparent; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">Cancelar</button>` : ''}
            </div>
          </div>`;
      }).join('');

      // Click to view detail
      list.querySelectorAll('.aviso-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.aviso-pay-btn') || e.target.closest('.aviso-cancel-btn')) return;
          showAvisoDetail(item.dataset.id, avisos);
        });
      });

      // Pay buttons
      list.querySelectorAll('.aviso-pay-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openPagoModal(btn.dataset.id, { price: Number(btn.dataset.price || 0), label: btn.dataset.label || '' });
        });
      });

      // Cancel buttons
      list.querySelectorAll('.aviso-cancel-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('¿Cancelar este aviso?')) return;
          try {
            await fetch(`${API}/${btn.dataset.id}`, { method: 'DELETE', headers: authHeaders() });
            loadMyAvisos();
          } catch (err) { console.error(err); }
        });
      });

    } catch (err) {
      console.error('loadMyAvisos error:', err);
      list.innerHTML = '<p style="color: #ef4444; font-size: 0.9rem;">Error al cargar avisos.</p>';
    }
  }

  function showAvisoDetail(id, avisos) {
    const a = avisos.find(x => x._id === id);
    if (!a) return;

    const prof = a._professionalData || {};
    const detail = $('#avisoDetailContent');
    if (!detail) return;

    detail.innerHTML = `
      <h3 style="color: var(--primary-gold); margin-bottom: 12px;">${ENV_LABELS[a.environment] || a.environment} — Detalle del Aviso</h3>
      ${a.serviceLineName ? `<p><strong>Línea de servicio:</strong> ${a.serviceLineName}</p>` : ''}
      <p><strong>Estado:</strong> <span style="color: ${STATUS_COLORS[a.status]}">${STATUS_LABELS[a.status]}</span></p>
      <p><strong>Vigencia:</strong> ${formatDate(a.startDate)} — ${formatDate(a.endDate)}</p>
      <p><strong>Monto:</strong> $${(a.price || 0).toLocaleString('es-AR')}</p>
      ${a.text ? `<p><strong>Descripción:</strong> ${a.text}</p>` : ''}
      ${a.paymentReceiptUrl ? `<p><strong>Comprobante:</strong> <a href="${a.paymentReceiptUrl}" target="_blank" style="color: var(--primary-gold);">Ver comprobante</a></p>` : ''}
      ${a.rejectionReason ? `<p style="color: #ef4444;"><strong>Motivo rechazo:</strong> ${a.rejectionReason}</p>` : ''}
    `;
    const overlay = $('#avisoDetailOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
  }

  // Crear aviso
  async function setupCrearAviso() {
    const btnCrear = $('#btnCrearAviso');
    const overlay = $('#crearAvisoOverlay');
    const form = $('#crearAvisoForm');
    const textArea = $('#avisoText');
    const textCount = $('#avisoTextCount');
    const alert = $('#crearAvisoAlert');
    const envSelect = $('#avisoEnvironment');
    const lineSelect = $('#avisoServiceLine');

    if (!btnCrear || !overlay) return;

    // Dynamically populate environments from the professional's hogarProfile services
    if (envSelect) {
      try {
        const r = await fetch('/api/v1/professionals/me', { headers: authHeaders() });
        const d = await r.json();
        const prof = d.data || {};
        const hp = prof.hogarProfile || {};
        const svcPaths = (hp.services || []).map(s => s.path || '');
        const envSet = new Set();
        svcPaths.forEach(p => {
          const env = p.split('/')[0];
          if (env) envSet.add(env);
        });
        if (envSet.size > 0) {
          const envLabels = { hogar: '🏠 Hogar', oficina: '🏢 Oficina', pime: '🏬 Pyme', industria: '🏭 Industria' };
          const envPrices = { hogar: 5000, oficina: 10000, pime: 10000, industria: 20000 };
          envSelect.innerHTML = '<option value="">Seleccionar entorno...</option>' +
            [...envSet].map(e => `<option value="${e}">${envLabels[e] || e} — $${(envPrices[e] || 0).toLocaleString('es-AR')}/mes</option>`).join('');
        }
      } catch (err) {
        // Keep the hardcoded options as fallback
      }
    }

    btnCrear.addEventListener('click', () => overlay.classList.remove('hidden'));
    $('#closeCrearAvisoModal').addEventListener('click', () => overlay.classList.add('hidden'));
    $('#btnCancelAviso').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });

    if (textArea && textCount) {
      textArea.addEventListener('input', () => { textCount.textContent = textArea.value.length; });
    }

    // Load available service lines when environment changes
    if (envSelect && lineSelect) {
      envSelect.addEventListener('change', async () => {
        const env = envSelect.value;
        lineSelect.innerHTML = '<option value="">Cargando líneas de servicio...</option>';
        lineSelect.disabled = true;

        if (!env) {
          lineSelect.innerHTML = '<option value="">Primero seleccioná un entorno...</option>';
          return;
        }

        try {
          const r = await fetch(`${API}/available-service-lines?environment=${env}`, { headers: authHeaders() });
          const d = await r.json();
          const lines = d.data || [];

          if (lines.length === 0) {
            lineSelect.innerHTML = '<option value="">No hay líneas disponibles</option>';
            return;
          }

          lineSelect.innerHTML = '<option value="">Seleccionar línea de servicio...</option>' +
            lines.map(l => `<option value="${l.id}">${l.name}${l.examples ? ' — ' + l.examples : ''}</option>`).join('');
          lineSelect.disabled = false;
        } catch (err) {
          lineSelect.innerHTML = '<option value="">Error al cargar líneas</option>';
        }
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const env = $('#avisoEnvironment').value;
      const serviceLine = $('#avisoServiceLine').value;
      const text = $('#avisoText').value.trim();

      if (!env) {
        alert.textContent = 'Seleccioná un entorno.';
        alert.className = 'alert';
        alert.style.background = 'rgba(239,68,68,0.15)';
        alert.style.color = '#ef4444';
        alert.style.borderColor = '#ef4444';
        return;
      }

      if (!serviceLine) {
        alert.textContent = 'Seleccioná una línea de servicio.';
        alert.className = 'alert';
        alert.style.background = 'rgba(239,68,68,0.15)';
        alert.style.color = '#ef4444';
        alert.style.borderColor = '#ef4444';
        return;
      }

      try {
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ environment: env, serviceLine, text })
        });
        const d = await r.json();

        if (d.success) {
          overlay.classList.add('hidden');
          form.reset();
          if (textCount) textCount.textContent = '0';
          if (lineSelect) {
            lineSelect.innerHTML = '<option value="">Primero seleccioná un entorno...</option>';
            lineSelect.disabled = true;
          }
          loadMyAvisos();
        } else {
          alert.textContent = d.error || 'Error al crear aviso.';
          alert.className = 'alert';
          alert.style.background = 'rgba(239,68,68,0.15)';
          alert.style.color = '#ef4444';
          alert.style.borderColor = '#ef4444';
        }
      } catch (err) {
        alert.textContent = 'Error de conexión.';
        alert.className = 'alert';
        alert.style.background = 'rgba(239,68,68,0.15)';
        alert.style.color = '#ef4444';
        alert.style.borderColor = '#ef4444';
      }
    });
  }

  // Pago modal
  let pagoCoordsCache = null;

  async function loadPagoCoords() {
    if (pagoCoordsCache) return pagoCoordsCache;
    try {
      const r = await fetch('/api/v1/professionals/me', { headers: authHeaders() });
      const d = await r.json();
      pagoCoordsCache = d.data?.paymentInstructions || null;
    } catch (err) { pagoCoordsCache = null; }
    return pagoCoordsCache;
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function selectedPayMethod() {
    const checked = document.querySelector('input[name="payMethod"]:checked');
    return checked ? checked.value : 'mercadopago';
  }

  function renderPagoCoords(method) {
    const box = $('#pagoAvisoCoords');
    if (!box) return;
    const info = pagoCoordsCache;
    if (!info) {
      box.textContent = 'No se pudieron cargar los datos de pago. Probá de nuevo.';
      return;
    }
    if (method === 'transferencia') {
      const bt = info.bankTransfer || {};
      box.innerHTML = `<strong style="color: var(--primary-gold);">Transferencia bancaria (pago externo)</strong><br>Banco: <strong>${escHtml(bt.bankName || '—')}</strong><br>CBU: <strong>${escHtml(bt.cbu || '—')}</strong><br>Alias: <strong>${escHtml(bt.alias || '—')}</strong>`;
    } else {
      const mp = info.mercadoPago || {};
      box.innerHTML = `<strong style="color: var(--primary-gold);">Mercado Pago (por la app)</strong><br>Alias: <strong>${escHtml(mp.alias || '—')}</strong><br>CVU: <strong>${escHtml(mp.cvu || '—')}</strong>`;
    }
  }

  function openPagoModal(avisoId, meta) {
    const overlay = $('#pagoAvisoOverlay');
    const idField = $('#pagoAvisoId');
    if (!overlay || !idField) return;
    idField.value = avisoId;
    const amountEl = $('#pagoAvisoAmountValue');
    if (amountEl) {
      amountEl.textContent = (meta && meta.price != null)
        ? `$${Number(meta.price).toLocaleString('es-AR')}${meta.label ? ` (${meta.label})` : ''}`
        : '—';
    }
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    loadPagoCoords().then(() => renderPagoCoords(selectedPayMethod()));
  }

  function setupPagoAviso() {
    const overlay = $('#pagoAvisoOverlay');
    const form = $('#pagoAvisoForm');
    if (!overlay || !form) return;

    $('#closePagoAvisoModal').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.querySelectorAll('input[name="payMethod"]').forEach(radio => {
      radio.addEventListener('change', () => renderPagoCoords(selectedPayMethod()));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('#pagoAvisoId').value;
      const file = $('#pagoAvisoFile').files[0];
      const alert = $('#pagoAvisoAlert');

      if (!file) {
        alert.textContent = 'Seleccioná un archivo.';
        alert.className = 'alert';
        alert.style.background = 'rgba(239,68,68,0.15)';
        alert.style.color = '#ef4444';
        alert.style.borderColor = '#ef4444';
        return;
      }

      const fd = new FormData();
      fd.append('receipt', file);
      fd.append('paymentMethod', selectedPayMethod());

      try {
        const r = await fetch(`${API}/${id}/payment`, {
          method: 'POST',
          headers: authHeaders(),
          body: fd
        });
        const d = await r.json();

        if (d.success) {
          overlay.classList.add('hidden');
          form.reset();
          loadMyAvisos();
        } else {
          alert.textContent = d.error || 'Error al subir comprobante.';
          alert.className = 'alert';
          alert.style.background = 'rgba(239,68,68,0.15)';
          alert.style.color = '#ef4444';
          alert.style.borderColor = '#ef4444';
        }
      } catch (err) {
        alert.textContent = 'Error de conexión.';
        alert.className = 'alert';
        alert.style.background = 'rgba(239,68,68,0.15)';
        alert.style.color = '#ef4444';
        alert.style.borderColor = '#ef4444';
      }
    });
  }

  // Expiry warning popup
  async function checkExpiringAvisos() {
    try {
      const r = await fetch(`${API}/expiring`, { headers: authHeaders() });
      const d = await r.json();
      const avisos = d.data || [];

      if (avisos.length > 0) {
        const msg = avisos.map(a => {
          const days = daysUntil(a.endDate);
          return `• ${ENV_LABELS[a.environment] || a.environment}: expira en ${days} día(s)`;
        }).join('\n');

        setTimeout(() => {
          alert(`⚠️ Tus avisos están por expirar:\n\n${msg}\n\nPor favor, renová tu pago para mantener el aviso activo.`);
        }, 2000);
      }
    } catch (err) { /* silent */ }
  }

  // Load KPI stats for professional
  async function loadMyStats() {
    const container = $('#myStatsContainer');
    if (!container) return;

    try {
      const r = await fetch('/api/v1/stats/professional?months=12', { headers: authHeaders() });
      const d = await r.json();
      const data = d.data;

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px;">
          <div style="background: rgba(var(--gold-rgb), 0.1); border: 1px solid rgba(var(--gold-rgb), 0.2); border-radius: 8px; padding: 12px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary-gold);">${data.totalClicks}</div>
            <div style="font-size: 0.75rem; color: #aaa;">Total</div>
          </div>
          <div style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 8px; padding: 12px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: #60a5fa;">${data.byType.profile_card}</div>
            <div style="font-size: 0.75rem; color: #aaa;">Perfil</div>
          </div>
          <div style="background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 8px; padding: 12px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: #4ade80;">${data.byType.phone}</div>
            <div style="font-size: 0.75rem; color: #aaa;">Teléfono</div>
          </div>
          <div style="background: rgba(37,211,102,0.08); border: 1px solid rgba(37,211,102,0.2); border-radius: 8px; padding: 12px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: #25d366;">${data.byType.whatsapp}</div>
            <div style="font-size: 0.75rem; color: #aaa;">WhatsApp</div>
          </div>
          <div style="background: rgba(0,136,204,0.08); border: 1px solid rgba(0,136,204,0.2); border-radius: 8px; padding: 12px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: #0088cc;">${data.byType.telegram}</div>
            <div style="font-size: 0.75rem; color: #aaa;">Telegram</div>
          </div>
        </div>
        <div style="display: flex; align-items: flex-end; gap: 3px; height: 100px; padding: 8px 0; border-bottom: 1px solid #333;">
          ${(data.months || []).map(m => {
            const monthData = data.byMonth[m] || { total: 0 };
            const maxT = Math.max(...Object.values(data.byMonth).map(x => x.total), 1);
            const h = Math.max((monthData.total / maxT) * 80, 2);
            const label = m.split('-')[1];
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
              <div style="font-size:0.55rem;color:#aaa;">${monthData.total}</div>
              <div style="width:100%;max-width:24px;height:${h}px;background:var(--primary-gold);border-radius:2px 2px 0 0;"></div>
              <div style="font-size:0.5rem;color:#666;margin-top:2px;">${label}</div>
            </div>`;
          }).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = '<p style="color: #888; font-size: 0.85rem;">Estadísticas no disponibles.</p>';
    }
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    setupCrearAviso();
    setupPagoAviso();
    loadMyAvisos();
    loadMyStats();
    checkExpiringAvisos();
  });
})();
