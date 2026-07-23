// KuraTe Platform — AI Query Understanding via Ollama (local Qwen 3)
// Purpose: Optional AI layer that analyzes user descriptions for better matching.
// Falls back to taxonomy-based matching if Ollama is unavailable or slow.
// Project: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen3:1.7b';
const TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '2000', 10);

const SYSTEM_PROMPT = `Sos un asistente que analiza busquedas de servicios. Dada una descripcion de lo que necesita un usuario, extrae informacion estructurada en formato JSON.

Devolve SOLO el JSON (sin markdown, sin explicaciones) con esta estructura:
{
  "serviceCategory": "categoria principal del servicio",
  "keywords": ["palabra1", "palabra2", ...],
  "synonyms": ["sinonimo1", "sinonimo2", ...],
  "brand": "marca mencionada o null",
  "model": "modelo mencionado o null",
  "urgencyContext": "urgencia real inferida del texto",
  "searchTerms": ["termino1", "termino2", ...]
}

Reglas:
- serviceCategory debe ser generica (ej: "reparacion electrodomesticos", "pintura", "limpieza")
- keywords: 3-5 palabras clave relevantes del texto original
- synonyms: palabras equivalentes en español (ej: "heladera" -> "refrigerador", "frigider")
- brand: si menciona una marca especifica, sino null
- model: si menciona un modelo especifico (ej: "gf-123", "s24 ultra", "iphone 15"), sino null. Captura el modelo completo incluyendo numero/letra.
- urgencyContext: "urgente" si el texto implica urgencia, "normal" si no
- searchTerms: combinacion de keywords + synonyms para buscar en base de datos`;

async function analyzeQuery(descripcion) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analiza esta busqueda: "${descripcion}"` }
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 300 }
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('[AI Search] Ollama error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('[AI Search] Unavailable:', error.message);
    return null;
  }
}

function buildSearchPlan(aiResult, formFields) {
  const plan = {
    serviceCategory: aiResult?.serviceCategory || null,
    keywords: [...(aiResult?.keywords || []), ...(aiResult?.searchTerms || [])],
    brand: aiResult?.brand || null,
    model: aiResult?.model || null,
    province: formFields.provincia || null,
    city: formFields.ciudad || null,
    action: formFields.accion || null,
    urgency: formFields.urgencia || null,
    urgencyContext: aiResult?.urgencyContext || null
  };

  plan.keywords = [...new Set(plan.keywords.filter(k => k && k.length > 2))];
  return plan;
}

module.exports = { analyzeQuery, buildSearchPlan };
