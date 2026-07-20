const https = require('https');

const SUPPORTED = new Set(['es', 'en']);
const CHUNK_SIZE = 450;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectLocale(text) {
  const sample = String(text || '').slice(0, 1200).toLowerCase();
  if (!sample.trim()) return 'es';

  const spanishScore = (sample.match(/\b(hola|bienvenid|de|la|el|los|las|para|con|tu|vos|podés|usá|escribinos|mes|gratis|vacaciones|pago|privacidad|modelo|plataforma)\b/g) || []).length;
  const englishScore = (sample.match(/\b(hello|welcome|your|the|and|for|with|free|month|payment|privacy|model|platform|vacation|use|tap|write)\b/g) || []).length;

  if (/[ñáéíóúü¿¡]/.test(sample)) return 'es';
  if (englishScore > spanishScore) return 'en';
  if (spanishScore > englishScore) return 'es';
  return 'es';
}

function splitTextChunks(text, maxLen = CHUNK_SIZE) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  if (normalized.length <= maxLen) return [normalized];

  const chunks = [];
  const paragraphs = normalized.split('\n');
  let current = '';

  for (const paragraph of paragraphs) {
    const piece = current ? `${current}\n${paragraph}` : paragraph;
    if (piece.length <= maxLen) {
      current = piece;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxLen) {
      current = paragraph;
      continue;
    }
    for (let i = 0; i < paragraph.length; i += maxLen) {
      chunks.push(paragraph.slice(i, i + maxLen));
    }
    current = '';
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function translateChunk(text, from, to) {
  const q = encodeURIComponent(text);
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${from}|${to}`;
  const data = await fetchJson(url);
  if (!data || data.responseStatus !== 200 || !data.responseData?.translatedText) {
    throw new Error(data?.responseDetails || 'Translation API error');
  }
  return String(data.responseData.translatedText).trim();
}

async function translateText(text, from, to) {
  const source = String(from || 'es').toLowerCase();
  const target = String(to || 'en').toLowerCase();
  if (!SUPPORTED.has(source) || !SUPPORTED.has(target) || source === target) {
    return String(text || '');
  }

  const chunks = splitTextChunks(text);
  const translated = [];
  for (let i = 0; i < chunks.length; i += 1) {
    if (i > 0) await sleep(250);
    translated.push(await translateChunk(chunks[i], source, target));
  }
  return translated.join('\n');
}

async function buildBilingualArticle({ title, body, sourceLocale }) {
  const source = SUPPORTED.has(sourceLocale) ? sourceLocale : detectLocale(`${title}\n${body}`);
  const target = source === 'es' ? 'en' : 'es';

  const titleSource = String(title || '').trim();
  const bodySource = String(body || '').trim();
  if (!titleSource || !bodySource) {
    throw new Error('Title and body are required');
  }

  const [titleTarget, bodyTarget] = await Promise.all([
    translateText(titleSource, source, target),
    translateText(bodySource, source, target)
  ]);

  return {
    sourceLocale: source,
    titleEs: source === 'es' ? titleSource : titleTarget,
    titleEn: source === 'en' ? titleSource : titleTarget,
    bodyEs: source === 'es' ? bodySource : bodyTarget,
    bodyEn: source === 'en' ? bodySource : bodyTarget,
    title: titleSource,
    body: bodySource
  };
}

module.exports = {
  detectLocale,
  translateText,
  buildBilingualArticle
};
