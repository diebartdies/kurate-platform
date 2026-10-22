// KuraTe Platform — Controlador del asesor IA (PROTOTIPO DEV)
//
// Dos endpoints:
//   GET  /api/v1/ai/status  -> si el asistente esta habilitado (publico, lo
//                              consulta el frontend para decidir si dibuja el
//                              campo o no)
//   POST /api/v1/ai/advice  -> la consulta del usuario
//
// Ambos responden 404 con "not available" cuando AI_ADVICE_ENABLED no esta, de
// modo que en produccion el prototipo no existe: ni endpoint, ni UI, ni se
// llega a tocar Ollama. El rate limit es extra porque el modelo corre en CPU.

const config = require('../config/appConfig');
const { askAdvice, cleanAnswer } = require('../utils/aiAdvice');

const NOT_AVAILABLE = { success: false, error: 'not available' };

// @desc    Si el asistente IA esta disponible en esta instancia.
// @route   GET /api/v1/ai/status
// @access  Public
exports.getStatus = async (req, res) => {
  if (!config.aiAdvice.enabled) return res.status(404).json(NOT_AVAILABLE);
  res.json({
    success: true,
    data: {
      enabled: true,
      model: config.aiAdvice.model,
      maxChars: config.aiAdvice.maxChars
    }
  });
};

// @desc    Le devuelve al usuario un consejo practico sobre su consulta.
// @route   POST /api/v1/ai/advice
// @access  Public (dev prototype, rate limited)
exports.ask = async (req, res) => {
  if (!config.aiAdvice.enabled) return res.status(404).json(NOT_AVAILABLE);

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) {
    return res.status(400).json({ success: false, error: 'question is required' });
  }
  if (question.length > config.aiAdvice.maxChars) {
    return res.status(400).json({
      success: false,
      error: `question too long (max ${config.aiAdvice.maxChars} chars)`
    });
  }

  const result = await askAdvice(question);
  if (!result) {
    // No le tiramos el error crudo al cliente: el prototipo no debe filtrar
    // detalles de la infraestructura. El log del server ya tiene la causa.
    return res.status(503).json({
      success: false,
      error: 'El asistente no está disponible en este momento.'
    });
  }

  res.json({
    success: true,
    data: {
      advice: cleanAnswer(result.advice),
      model: result.model,
      ms: result.ms
    }
  });
};
