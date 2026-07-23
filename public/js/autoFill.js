// KuraTe Platform — Smart form auto-fill from "qué" field
// Purpose: Parses user's free-text description, matches words against dropdown
// options (exact + fuzzy), auto-fills matching fields, validates consistency,
// and prompts for missing info (model). Powers intelligent search on landing page.
// Project: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)

(function () {
  'use strict';

  // Articles, prepositions, connectors — skip these (all < 4 chars or common)
  const STOP_WORDS = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre',
    'que', 'se', 'no', 'es', 'un', 'una', 'lo', 'le', 'ya', 'o', 'y', 'e',
    'mi', 'tu', 'su', 'nos', 'me', 'te', 'le', 'les',
    'este', 'esta', 'esto', 'ese', 'esa', 'eso',
    'hay', 'tiene', 'hace', 'como', 'pero', 'mas', 'muy', 'poco', 'mucho',
    'donde', 'cuando', 'quien', 'cual', 'que', 'quien'
  ]);

  // Action synonyms → map to dropdown values
  const ACTION_SYNONYMS = {
    'arreglar': 'reparar', 'componer': 'reparar', 'fix': 'reparar', 'reparo': 'reparar',
    'arreglo': 'reparar', 'reparacion': 'reparar', 'reparar': 'reparar',
    'limpiar': 'mantener', 'limpieza': 'mantener', 'mantenimiento': 'mantener',
    'limpio': 'mantener', 'asear': 'mantener',
    'aprender': 'aprender', 'clase': 'aprender', 'clases': 'aprender', 'curso': 'aprender',
    'mejorar': 'mejorar', 'upgrade': 'mejorar', 'actualizar': 'mejorar',
    'disenar': 'disenar', 'diseno': 'disenar', 'diseñar': 'disenar',
    'comprar': 'comprar', 'busco': 'busco', 'necesito': 'busco', 'preciso': 'busco',
    'vender': 'vender', 'vendo': 'vender',
    'donar': 'donar', 'dono': 'donar',
    'descartar': 'descartar', 'tiro': 'descartar', 'botar': 'descartar'
  };

  // Urgency synonyms → map to dropdown values
  const URGENCY_SYNONYMS = {
    'urgente': 'urgente', 'ya': 'urgente', 'ahora': 'urgente', 'rapido': 'rapido',
    'pronto': 'rapido', 'estos dias': 'rapido', 'enseguida': 'rapido',
    'sin apuro': 'sin-apuro', 'tranquilo': 'sin-apuro', 'puedo esperar': 'sin-apuro'
  };

  // Common Argentine neighborhoods that belong to CABA
  const CABA_NEIGHBORHOODS = new Set([
    'villa urquiza', 'villa crespo', 'palermo', 'belgrano', 'nunez', 'san isidro',
    'retiro', 'san telmo', 'la boca', 'barracas', 'parque patricios', 'boedo',
    'almagro', 'balvanera', 'san cristobal', 'congreso', 'monserrat', 'puerto madero',
    'san nicolas', 'constitucion', 'flores', 'floresta', 'chacarita',
    'paternal', 'agronomia', 'liniers', 'mataderos', 'parque avellaneda',
    'versalles', 'villa luro', 'caballito', 'monte chingolo',
    'lugano', 'savoia', 'bajo flores', 'villa soldati', 'villa riachuelo'
  ]);

  // ─── Levenshtein distance (for fuzzy matching) ───────────────────────
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  // ─── Fuzzy match: find best candidates within maxDist ────────────────
  function fuzzyFind(word, candidates, maxDist) {
    maxDist = maxDist || 2;
    const results = [];
    for (const c of candidates) {
      const dist = levenshtein(word, c);
      if (dist > 0 && dist <= maxDist) {
        results.push({ value: c, dist: dist });
      }
    }
    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  // ─── Check if a word fuzzy-matches any key in a synonym map ──────────
  function fuzzyMatchSynonym(word, synonymMap, maxDist) {
    maxDist = maxDist || 2;
    let best = null;
    let bestDist = Infinity;
    for (const key of Object.keys(synonymMap)) {
      const dist = levenshtein(word, key);
      if (dist > 0 && dist <= maxDist && dist < bestDist) {
        best = { key: key, value: synonymMap[key], dist: dist };
        bestDist = dist;
      }
    }
    return best;
  }

  // ─── Fuzzy match against select dropdown options ─────────────────────
  function fuzzyMatchDropdown(word, selectEl, maxDist) {
    maxDist = maxDist || 2;
    if (!selectEl || selectEl.disabled) return null;
    const options = Array.from(selectEl.options).slice(1);
    let best = null;
    let bestDist = Infinity;
    for (const opt of options) {
      const val = opt.value.toLowerCase();
      const txt = opt.textContent.toLowerCase();
      const distV = levenshtein(word, val);
      const distT = levenshtein(word, txt);
      const dist = Math.min(distV, distT);
      if (dist > 0 && dist <= maxDist && dist < bestDist) {
        best = { value: opt.value, label: opt.textContent.trim(), dist: dist };
        bestDist = dist;
      }
    }
    return best;
  }

  // Returns ALL fuzzy matches within maxDist, sorted by distance
  function fuzzyMatchDropdownAll(word, selectEl, maxDist) {
    maxDist = maxDist || 2;
    if (!selectEl || selectEl.disabled) return [];
    const options = Array.from(selectEl.options).slice(1);
    const results = [];
    for (const opt of options) {
      const val = opt.value.toLowerCase();
      const txt = opt.textContent.toLowerCase();
      const distV = levenshtein(word, val);
      const distT = levenshtein(word, txt);
      const dist = Math.min(distV, distT);
      if (dist > 0 && dist <= maxDist) {
        results.push({ value: opt.value, label: opt.textContent.trim(), dist: dist });
      }
    }
    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  function parseWords(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-záéíóúñü\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
  }

  function matchAction(words) {
    for (const w of words) {
      if (ACTION_SYNONYMS[w]) return ACTION_SYNONYMS[w];
    }
    return null;
  }

  // Returns { value, word, dist } or null
  function fuzzyMatchAction(words) {
    let best = null;
    let bestDist = Infinity;
    for (const w of words) {
      const fm = fuzzyMatchSynonym(w, ACTION_SYNONYMS, 2);
      if (fm && fm.dist < bestDist) {
        best = { value: fm.value, word: w, dist: fm.dist };
        bestDist = fm.dist;
      }
    }
    return best;
  }

  function matchUrgency(words) {
    const full = words.join(' ');
    for (const [synonym, value] of Object.entries(URGENCY_SYNONYMS)) {
      if (full.includes(synonym)) return value;
    }
    for (const w of words) {
      if (URGENCY_SYNONYMS[w]) return URGENCY_SYNONYMS[w];
    }
    return null;
  }

  // Returns { value, word, dist } or null
  function fuzzyMatchUrgency(words) {
    let best = null;
    let bestDist = Infinity;
    for (const w of words) {
      const fm = fuzzyMatchSynonym(w, URGENCY_SYNONYMS, 2);
      if (fm && fm.dist < bestDist) {
        best = { value: fm.value, word: w, dist: fm.dist };
        bestDist = fm.dist;
      }
    }
    return best;
  }

  function matchDropdown(words, selectEl) {
    if (!selectEl || selectEl.disabled) return null;
    const options = Array.from(selectEl.options).slice(1); // skip placeholder
    for (const w of words) {
      for (const opt of options) {
        const val = opt.value.toLowerCase();
        const txt = opt.textContent.toLowerCase();
        if (val.includes(w) || txt.includes(w) || w.includes(val) || w.includes(txt)) {
          return opt.value;
        }
      }
    }
    return null;
  }


  function validateConsistency(provinceVal, cityVal) {
    const errors = [];
    const cityLower = (cityVal || '').toLowerCase().trim();
    const provinceLower = (provinceVal || '').toLowerCase().trim();

    if (cityLower && !provinceLower) {
      if (CABA_NEIGHBORHOODS.has(cityLower)) {
        errors.push({ field: 'provincia', message: 'Este barrio pertenece a CABA. Completá la provincia: Ciudad Autónoma de Buenos Aires.' });
      } else {
        errors.push({ field: 'provincia', message: 'Ingresaste una ciudad pero no la provincia. ¿En qué provincia se encuentra? Puede haber varias ciudades con el mismo nombre.' });
      }
    }

    if (provinceLower && cityLower) {
      const isCaba = provinceLower.includes('caba') || provinceLower.includes('ciudad autonoma') || provinceLower.includes('buenos aires');
      const isNeighborhood = CABA_NEIGHBORHOODS.has(cityLower);
      if (isNeighborhood && !isCaba) {
        errors.push({ field: 'provincia', message: `"${cityVal}" es un barrio de CABA. La provincia debe ser "Ciudad Autónoma de Buenos Aires".` });
      }
    }

    return errors;
  }

  function extractObjectAndBrand(words) {
    const actionWords = Object.keys(ACTION_SYNONYMS);
    const urgencyWords = Object.keys(URGENCY_SYNONYMS);
    const locationWords = ['zona', 'barrio', 'cerca', 'lado', 'al lado', 'abajo', 'arriba'];

    return words.filter(w =>
      !actionWords.includes(w) &&
      !urgencyWords.includes(w) &&
      !locationWords.includes(w) &&
      w.length >= 4
    );
  }

  function checkModelMentioned(words) {
    return words.some(w => /\d/.test(w) || /[a-z]-\d/.test(w));
  }

  // ─── Show fuzzy-match confirmation popup ─────────────────────────────
  // options: [{ label, value }] — candidates to suggest
  // onSelect: function(selectedValue) — called when user confirms
  // onReject: function() — called when user declines
  window.kurateShowFuzzyConfirm = function (word, fieldName, options, onSelect, onReject) {
    const existing = document.getElementById('kurate-fuzzy-confirm');
    if (existing) existing.remove();

    const optHtml = options.map((o, i) => {
      const distLabel = o.dist === 1 ? '1 letra' : o.dist + ' letras';
      return `<button data-val="${o.value}" data-idx="${i}" style="display:block;width:100%;text-align:left;background:#0f0f1a;color:#e0e0e0;border:1px solid #333;padding:0.6rem 1rem;border-radius:6px;cursor:pointer;font-size:0.85rem;margin-bottom:0.4rem;transition:border 0.2s;" onmouseover="this.style.borderColor='#B8922E'" onmouseout="this.style.borderColor='#333'">\u00BFQuer\u00EDas decir <strong style="color:#B8922E;">${o.label}</strong> <span style="color:#666;font-size:0.75rem;">(difiere por ${distLabel})</span>?</button>`;
    }).join('');

    const div = document.createElement('div');
    div.id = 'kurate-fuzzy-confirm';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1001;display:flex;align-items:center;justify-content:center;padding:1rem;';
    div.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid #B8922E;border-radius:12px;padding:1.5rem;max-width:440px;width:100%;text-align:center;">
        <h3 style="color:#B8922E;margin:0 0 0.5rem;">¿Quisiste decir "${fieldName}"?</h3>
        <p style="color:#888;font-size:0.85rem;margin:0 0 1rem;">
          No encontramos "<strong style="color:#e0e0e0;">${word}</strong>" exacto, pero tal vez quiso decir:
        </p>
        <div style="margin-bottom:0.75rem;">${optHtml}</div>
        <button id="kurate-fuzzy-skip" style="background:transparent;color:#666;border:1px solid #333;padding:0.5rem 1.2rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">No, seguir como está</button>
      </div>
    `;
    document.body.appendChild(div);

    // Bind option buttons
    div.querySelectorAll('[data-val]').forEach(btn => {
      btn.addEventListener('click', function () {
        div.remove();
        onSelect(this.getAttribute('data-val'));
      });
    });
    // Bind skip button
    document.getElementById('kurate-fuzzy-skip').addEventListener('click', function () {
      div.remove();
      if (onReject) onReject();
    });
  };

  // ─── Main auto-fill function ─────────────────────────────────────────
  // Returns: { filled, errors, objects, hasModel, words, fuzzyQueue }
  // fuzzyQueue: array of { type, word, candidates, fieldLabel } — things that need user confirmation
  window.kurateAutoFill = function (formState) {
    const { descripcion, accionSel, provinciaSel, ciudadSel, urgenciaSel } = formState;
    const words = parseWords(descripcion);
    const filled = {};
    const fuzzyQueue = [];

    // 1. Auto-fill action (exact first, then fuzzy)
    let actionMatch = matchAction(words);
    if (actionMatch && accionSel) {
      accionSel.value = actionMatch;
      filled.accion = actionMatch;
    } else {
      const fAction = fuzzyMatchAction(words);
      if (fAction && accionSel) {
        const label = accionSel.options[accionSel.selectedIndex]?.textContent?.trim() || fAction.value;
        fuzzyQueue.push({
          type: 'accion',
          word: fAction.word,
          candidates: [{ label: fAction.value, value: fAction.value }],
          fieldLabel: 'acción'
        });
      }
    }

    // 2. Auto-fill urgency (exact first, then fuzzy)
    let urgencyMatch = matchUrgency(words);
    if (urgencyMatch && urgenciaSel) {
      urgenciaSel.value = urgencyMatch;
      filled.urgencia = urgencyMatch;
    } else {
      const fUrgency = fuzzyMatchUrgency(words);
      if (fUrgency && urgenciaSel) {
        fuzzyQueue.push({
          type: 'urgencia',
          word: fUrgency.word,
          candidates: [{ label: fUrgency.value.replace('-', ' '), value: fUrgency.value }],
          fieldLabel: 'urgencia'
        });
      }
    }

    // 3. Auto-fill province (exact first, then fuzzy)
    let provMatch = matchDropdown(words, provinciaSel);
    if (provMatch && provinciaSel) {
      provinciaSel.value = provMatch;
      filled.provincia = provMatch;
      provinciaSel.dispatchEvent(new Event('change'));
    } else {
      // Collect all fuzzy matches across all words
      const allProvMatches = [];
      for (const w of words) {
        const matches = fuzzyMatchDropdownAll(w, provinciaSel, 2);
        matches.forEach(m => {
          if (!allProvMatches.find(e => e.value === m.value)) allProvMatches.push(m);
        });
      }
      if (allProvMatches.length > 0 && provinciaSel) {
        fuzzyQueue.push({
          type: 'provincia',
          word: allProvMatches[0].label,
          candidates: allProvMatches.slice(0, 3),
          fieldLabel: 'provincia'
        });
      }
    }

    // Delay city match to let dropdown populate
    setTimeout(() => {
      let cityMatch = matchDropdown(words, ciudadSel);
      if (cityMatch && ciudadSel && !ciudadSel.disabled) {
        ciudadSel.value = cityMatch;
        filled.ciudad = cityMatch;
      } else if (!ciudadSel.disabled) {
        const allCityMatches = [];
        for (const w of words) {
          const matches = fuzzyMatchDropdownAll(w, ciudadSel, 2);
          matches.forEach(m => {
            if (!allCityMatches.find(e => e.value === m.value)) allCityMatches.push(m);
          });
        }
        if (allCityMatches.length > 0) {
          fuzzyQueue.push({
            type: 'ciudad',
            word: allCityMatches[0].label,
            candidates: allCityMatches.slice(0, 3),
            fieldLabel: 'ciudad'
          });
        }
      }
    }, 500);

    // 4. Validate consistency
    const provinceVal = provinciaSel?.value || '';
    const cityVal = ciudadSel?.value || '';
    const errors = validateConsistency(provinceVal, cityVal);

    // 5. Extract objects for model check
    const objects = extractObjectAndBrand(words);
    const hasModel = checkModelMentioned(words);

    return { filled, errors, objects, hasModel, words, fuzzyQueue };
  };

  // ─── Show province prompt if needed ──────────────────────────────────
  window.kurateShowProvincePrompt = function (errorMsg) {
    const existing = document.getElementById('kurate-province-prompt');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'kurate-province-prompt';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1001;display:flex;align-items:center;justify-content:center;padding:1rem;';
    div.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid #B8922E;border-radius:12px;padding:1.5rem;max-width:400px;width:100%;text-align:center;">
        <p style="color:#e0e0e0;font-size:0.95rem;margin:0 0 1rem;">${errorMsg}</p>
        <button onclick="this.closest('#kurate-province-prompt').remove()" style="background:#B8922E;color:#0f0f1a;border:none;padding:0.6rem 1.5rem;border-radius:6px;font-weight:700;cursor:pointer;">Entendido</button>
      </div>
    `;
    document.body.appendChild(div);
  };

  // ─── Show model prompt popup ─────────────────────────────────────────
  window.kurateShowModelPrompt = function (objectName) {
    const existing = document.getElementById('kurate-model-prompt');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'kurate-model-prompt';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1001;display:flex;align-items:center;justify-content:center;padding:1rem;';
    div.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid #B8922E;border-radius:12px;padding:1.5rem;max-width:460px;width:100%;text-align:center;">
        <h3 style="color:#B8922E;margin:0 0 0.5rem;">¿Cuál es el modelo?</h3>
        <p style="color:#888;font-size:0.85rem;margin:0 0 0.75rem;">
          Para encontrar al profesional indicado, necesitamos saber el modelo de <strong style="color:#e0e0e0;">${objectName}</strong>.
        </p>
        <p style="color:#666;font-size:0.8rem;margin:0 0 1rem;">
          ¿Dónde lo encontrás? Mirá la etiqueta trasera, el manual, o buscá en Google "modelo ${objectName} [marca]".
        </p>
        <div style="display:flex;gap:0.5rem;justify-content:center;">
          <button onclick="document.getElementById('kurate-model-prompt').remove();document.getElementById('descripcion').focus();" style="background:#B8922E;color:#0f0f1a;border:none;padding:0.6rem 1.2rem;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.85rem;">Agregar modelo</button>
          <button onclick="document.getElementById('kurate-model-prompt').remove();document.getElementById('needForm').setAttribute('data-skip-model','1');document.getElementById('needForm').dispatchEvent(new Event('submit'));" style="background:transparent;color:#888;border:1px solid #333;padding:0.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:0.85rem;">Buscar sin modelo</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
  };
})();
