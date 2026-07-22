// KuraTe Platform — Smart form auto-fill from "qué" field
// Purpose: Parses user's free-text description, matches words against dropdown
// options, auto-fills matching fields, validates consistency, and prompts for
// missing info (model). Powers the intelligent search on the landing page.
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
    'pronto': 'rapido', 'pronto': 'rapido', 'estos dias': 'rapido', 'enseguida': 'rapido',
    'sin apuro': 'sin-apuro', 'tranquilo': 'sin-apuro', 'puedo esperar': 'sin-apuro'
  };

  // Common Argentine neighborhoods that belong to CABA
  const CABA_NEIGHBORHOODS = new Set([
    'villa urquiza', 'villa crespo', 'palermo', 'belgrano', 'nunez', 'san isidro',
    'retiro', 'san telmo', 'la boca', 'barracas', 'parque patricios', 'boedo',
    'almagro', 'balvanera', 'san cristobal', 'congreso', 'monserrat', 'puerto madero',
    'san nicolas', 'constitucion', 'flores', 'floresta', 'villa crespo', 'chacarita',
    'paternal', 'villa crespo', 'agronomia', 'liniers', 'mataderos', 'parque avellaneda',
    'liniers', 'versalles', 'villa luro', 'caballito', 'vezo soldado', 'monte chingolo',
    'lugano', 'savoia', 'bajo flores', 'villa soldati', 'villa riachuelo',
    'ciudadela', 'flores', 'terrazas', 'castelar', 'moron', 'haedo', 'ramos mejia',
    'liniers', 'peti', 'san justo', 'la matanza', 'gregorio de laferrere',
    'lisandro olmos', 'ezeiza', 'canning', 'rafael calzada', 'glew',
    'jose marmol', 'longchamps', 'adrogue', 'burzaco', 'claypole',
    'don bosco', 'temperley', 'lomas zamora', 'quilmes', 'bernal',
    'avellaneda', 'sarandí', 'dock sud', 'sarandí', 'lanus',
    'valsusana', 'banfield', 'lomas de zamora', 'estanislao sosa',
    'remedios de escalada', 'tapiales', 'vilela', 'veinte de junio'
  ]);

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
      // City without province → ask for province
      if (CABA_NEIGHBORHOODS.has(cityLower)) {
        errors.push({ field: 'provincia', message: 'Este barrio pertenece a CABA. Completá la provincia: Ciudad Autónoma de Buenos Aires.' });
      } else {
        errors.push({ field: 'provincia', message: 'Ingresaste una ciudad pero no la provincia. ¿En qué provincia se encuentra? Puede haber varias ciudades con el mismo nombre.' });
      }
    }

    if (provinceLower && cityLower) {
      // CABA validation: neighborhoods must be in CABA
      const isCaba = provinceLower.includes('caba') || provinceLower.includes('ciudad autonoma') || provinceLower.includes('buenos aires');
      const isNeighborhood = CABA_NEIGHBORHOODS.has(cityLower);

      if (isNeighborhood && !isCaba) {
        errors.push({ field: 'provincia', message: `"${cityVal}" es un barrio de CABA. La provincia debe ser "Ciudad Autónoma de Buenos Aires".` });
      }
    }

    return errors;
  }

  function extractObjectAndBrand(words) {
    // The "object" is the main noun — words that aren't action/urgency/location
    const actionWords = Object.keys(ACTION_SYNONYMS);
    const urgencyWords = Object.keys(URGENCY_SYNONYMS);
    const locationWords = ['zona', 'barrio', 'cerca', 'lado', 'al lado', 'abajo', 'arriba'];

    const objects = words.filter(w =>
      !actionWords.includes(w) &&
      !urgencyWords.includes(w) &&
      !locationWords.includes(w) &&
      w.length >= 4
    );

    return objects;
  }

  function checkModelMentioned(words) {
    // Heuristic: if user mentions a brand but no specific model pattern (e.g., "Gafa gf-123")
    const hasModel = words.some(w => /\d/.test(w) || /[a-z]-\d/.test(w));
    return hasModel;
  }

  // Main auto-fill function
  window.kurateAutoFill = function (formState) {
    const { descripcion, accionSel, provinciaSel, ciudadSel, urgenciaSel } = formState;
    const words = parseWords(descripcion);
    const filled = {};

    // 1. Auto-fill action
    const actionMatch = matchAction(words);
    if (actionMatch && accionSel) {
      accionSel.value = actionMatch;
      filled.accion = actionMatch;
    }

    // 2. Auto-fill urgency
    const urgencyMatch = matchUrgency(words);
    if (urgencyMatch && urgenciaSel) {
      urgenciaSel.value = urgencyMatch;
      filled.urgencia = urgencyMatch;
    }

    // 3. Auto-fill province/city (match against dropdown options)
    const provMatch = matchDropdown(words, provinciaSel);
    if (provMatch && provinciaSel) {
      provinciaSel.value = provMatch;
      filled.provincia = provMatch;
      // Trigger change to enable city dropdown
      provinciaSel.dispatchEvent(new Event('change'));
    }

    // Delay city match to let dropdown populate
    setTimeout(() => {
      const cityMatch = matchDropdown(words, ciudadSel);
      if (cityMatch && ciudadSel && !ciudadSel.disabled) {
        ciudadSel.value = cityMatch;
        filled.ciudad = cityMatch;
      }
    }, 500);

    // 4. Validate consistency
    const provinceVal = provinciaSel?.value || '';
    const cityVal = ciudadSel?.value || '';
    const errors = validateConsistency(provinceVal, cityVal);

    // 5. Extract objects for model check
    const objects = extractObjectAndBrand(words);
    const hasModel = checkModelMentioned(words);

    return { filled, errors, objects, hasModel, words };
  };

  // Show province prompt if needed
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

  // Show model prompt popup
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
