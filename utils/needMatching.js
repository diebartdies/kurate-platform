const taxonomy = require('./serviceTaxonomy');

const ACTION_KEYWORDS = {
  aprender: { action: 'aprender', synonyms: ['clase', 'curso', 'aprender', 'estudiar', 'formación', 'capacitación', 'enseñanza', 'profesor', 'tutor'] },
  reparar: { action: 'reparar', synonyms: ['reparar', 'arreglar', 'arreglo', 'reparación', 'descompuesto', 'roto', 'no funciona', 'averiado', 'falla', 'técnico'] },
  mantener: { action: 'mantener', synonyms: ['mantener', 'mantenimiento', 'service', 'puesta a punto', 'cuidado', 'preventivo'] },
  mejorar: { action: 'mejorar', synonyms: ['mejorar', 'mejora', 'renovar', 'actualizar', 'upgrade', 'remodelar', 'ampliar'] },
  disenar: { action: 'disenar', synonyms: ['diseñar', 'diseño', 'proyecto', 'planos', 'crear', 'desarrollar'] },
  descartar: { action: 'descartar', synonyms: ['descartar', 'tirar', 'desechar', 'reciclar', 'retirar', 'remover', 'sacar'] },
  busco: { action: 'busco', synonyms: ['busco', 'buscar', 'necesito', 'quiero', 'conseguir', 'contratar'] },
  vender: { action: 'vender', synonyms: ['vender', 'venta', 'vendo', 'publicar'] },
  comprar: { action: 'comprar', synonyms: ['comprar', 'compra', 'compro', 'adquirir'] },
  donar: { action: 'donar', synonyms: ['donar', 'donación', 'donacion'] },
  'recibir-donaciones': { action: 'recibir-donaciones', synonyms: ['recibir donaciones', 'donación', 'donaciones', 'colaborar'] }
};

function extractKeywords(text) {
  if (!text || !text.trim()) return [];
  const words = text.toLowerCase()
    .replace(/[^a-záéíóúüñ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  const stopWords = ['de', 'la', 'el', 'en', 'del', 'con', 'para', 'por', 'un', 'una', 'las', 'los', 'que', 'es', 'se', 'no', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'este', 'entre', 'todo', 'esta', 'otro', 'esa', 'ese', 'eso', 'sin', 'sobre', 'también', 'fue', 'era', 'muy', 'año', 'dos', 'tres', 'si', 'te', 'me', 'mi', 'tu'];
  return words.filter(w => !stopWords.includes(w));
}

function matchCategories(descripcion) {
  if (!descripcion || !descripcion.trim()) return [];
  const lower = descripcion.toLowerCase();
  const matched = new Set();
  const categories = [];

  for (const domain of taxonomy.domains) {
    for (const cat of domain.categories) {
      for (const sub of cat.subcategories) {
        for (const svc of sub.services) {
          const svcLower = svc.toLowerCase();
          if (lower.includes(svcLower) || svcLower.includes(lower)) {
            const key = `${domain.id}:${cat.id}:${sub.id}`;
            if (!matched.has(key)) {
              matched.add(key);
              categories.push({ domain: domain.name, category: cat.name, subcategory: sub.name, service: svc });
            }
          }
        }
      }
    }
  }

  return categories;
}

function matchAction(action) {
  return ACTION_KEYWORDS[action] || null;
}

const INAPPROPRIATE_WORDS = [
  'sex', 'sexy', 'sexual', 'sexo', 'fuck', 'fucking', 'follar', 'cojer', 'coger',
  'copular', 'copule', 'porno', 'porn', 'xxx', 'escort', 'escorts', 'prostituta',
  'prostituto', 'prostitucion', 'prostitución', 'puta', 'puto', 'putas', 'putos',
  'culo', 'culos', 'concha', 'pija', 'pito', 'verga', 'chota', 'chongo', 'chongos',
  'travesti', 'travestis', 'trans', 'trolo', 'trola', 'sado', 'bdsm', 'dominacion',
  'domina', 'sumisa', 'sumiso', 'petardo', 'petarda', 'cafisho', 'rufián', 'ruffian',
  'strip', 'stripper', 'striptease', 'webcam', 'camgirl', 'camboy', 'onlyfans',
  'contenido adulto', 'contenido explicito', 'contenido explícito', 'nude', 'nudes',
  'desnudo', 'desnuda', 'desnudos', 'desnudas', 'lenceria', 'lencería',
  'encuentro casual', 'encuentros casuales', 'cita casual', 'citas casuales',
  'masaje erotico', 'masaje erótico', 'masajes eroticos', 'masajes eróticos',
  'relax', 'final feliz', 'trabajo sexual', 'trabajador sexual', 'trabajadora sexual',
  'actividad sexual', 'servicio sexual', 'servicios sexuales', 'acompanante',
  'acompañante', 'acompanantes', 'acompañantes', 'masajes tantra', 'tantra',
  'swinger', 'swingers', 'intercambio parejas', 'orgia', 'orgías', 'orgias',
  'boludo', 'boluda', 'boludos', 'boludas',
  'pelotudo', 'pelotuda', 'pelotudos', 'pelotudas',
  'forro', 'forra', 'forros', 'forras',
  'pelado', 'pelada', 'pelados', 'peladas'
];

const RE_PREFIXED_WORDS = [
  'boludo', 'boluda', 'boludos', 'boludas',
  'pelotudo', 'pelotuda', 'pelotudos', 'pelotudas',
  'forro', 'forra', 'forros', 'forras',
  'pelado', 'pelada', 'pelados', 'peladas'
];

// Normalize: strip spaces and hyphens between letters to catch "p e l o t u d o" / "p-e-l-o-t-u-d-o"
function normalizeSpacedText(text) {
  return text.replace(/([a-záéíóúüñ])[\s\-]+(?=[a-záéíóúüñ])/gi, '$1');
}

function hasInappropriateWords(text) {
  if (!text || !text.trim()) return null;
  const lower = text.toLowerCase();

  // Check original text
  const direct = checkAgainstList(lower, INAPPROPRIATE_WORDS);
  if (direct) return direct;

  // Check with spaces/hyphens stripped between letters
  const normalized = normalizeSpacedText(lower);
  const normalizedCheck = checkAgainstList(normalized, INAPPROPRIATE_WORDS);
  if (normalizedCheck) return normalizedCheck;

  // Check "re" prefix variants (reboludo, re pelotudo, re-pelotudo, etc.)
  const rePattern = /\bre\-?[\s\-]?/i;
  for (const word of RE_PREFIXED_WORDS) {
    const variants = [`re${word}`, `re ${word}`, `re-${word}`];
    for (const v of variants) {
      if (lower.includes(v)) return word;
      const vNorm = normalizeSpacedText(v);
      if (lower.includes(vNorm)) return word;
      if (normalized.includes(v)) return word;
      if (normalized.includes(vNorm)) return word;
    }
  }

  return null;
}

function checkAgainstList(text, wordList) {
  for (const word of wordList) {
    const idx = text.indexOf(word);
    if (idx !== -1) {
      const before = idx === 0 ? ' ' : text[idx - 1];
      const afterChar = idx + word.length;
      const after = afterChar >= text.length ? ' ' : text[afterChar];
      if (!before.match(/[a-záéíóúüñ]/) && !after.match(/[a-záéíóúüñ]/)) {
        return word;
      }
    }
  }
  return null;
}

module.exports = { extractKeywords, matchCategories, matchAction, hasInappropriateWords, ACTION_KEYWORDS };
