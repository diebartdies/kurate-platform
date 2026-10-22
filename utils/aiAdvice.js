// KuraTe Platform — Asesor IA (PROTOTIPO DEV)
// Proyecto: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)
//
// Responde consultas libres de un usuario ("se me corta la caldera", "como
// sé si mi instalación eléctrica es segura") con un modelo local de Ollama.
//
// A diferencia de utils/aiSearch.js —que extrae JSON estructurado en 2s para
// armar el plan de búsqueda— acá el modelo REDACTA texto, asi que:
//   - usa otro timeout (90s por defecto: en la dev box con CPU son 30-50s),
//   - devuelve null en cualquier fallo y nunca lanza: si Ollama no esta o se
//     cuelga, el frontend simplemente no muestra el asistente.
//
// Solo para development: si el VPS no tiene GPU esto satura la CPU, por eso
// vive detrás de AI_ADVICE_ENABLED (ver config/appConfig.js -> aiAdvice).

const config = require('../config/appConfig');

const SYSTEM_PROMPT = `Sos un asistente practico de una plataforma argentina de servicios (KuraTe) que conecta a personas con profesionales matriculados de hogar, oficina, campo e industria.

Reglas:
- Escribi en español rioplatense, directo y con sentido comun. Tratas de "vos".
- Respondé en texto plano. Sin markdown, sin titulos, sin listas con viñetas, sin emojis.
- Empezá por lo importante: qué hacer o qué revisar. Despues, el detalle.
- Entre 3 y 6 frases. Nada de párrafos interminables.
- Si el problema es urgente o riesgoso (fuga de gas, cortocircuito, incendio, inundacion), avisalo de entrada: "CORTÁ el general y llamá a un profesional matriculado ahora mismo".
- No inventes datos, precios ni plazos exactos. Si no alcanza la informacion, preguntá UNA sola cosa concreta.
- No sos médico ni abogado. Si la consulta es de salud o legal, orientá a consultar al profesional correspondiente.`;

/**
 * Consulta al modelo local.
 * @param {string} pregunta  Texto del usuario (ya recortado por el controller).
 * @returns {Promise<{advice:string, model:string, ms:number}|null>}
 */
async function askAdvice(pregunta) {
  const { ollamaUrl, model, timeoutMs, maxTokens } = config.aiAdvice;
  const inicio = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: pregunta }
        ],
        stream: false,
        options: { temperature: 0.5, num_predict: maxTokens }
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('[AI Advice] Ollama error:', response.status);
      return null;
    }

    const data = await response.json();
    const advice = (data.message?.content || '').trim();
    if (!advice) return null;

    return { advice, model: data.model || model, ms: Date.now() - inicio };
  } catch (error) {
    console.error('[AI Advice] Unavailable:', error.message);
    return null;
  }
}

// El modelo a veces mete "CORTÁ..." con caracteres raros si se lo pylame mucho;
// lo unico que limpiamos es el whitespace, nunca el contenido.
function cleanAnswer(texto) {
  return String(texto || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { askAdvice, cleanAnswer };
