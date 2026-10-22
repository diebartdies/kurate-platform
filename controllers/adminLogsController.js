const appLogger = require('../utils/appLogger');

// Tope de lineas por request. El ring es de 20000, asi que este limite solo
// evita mandar MBs de golpe al navegador.
const MAX_LINES = 2000;

/**
 * @desc    Recent application log lines
 * @desc    Merges the in-memory ring with the persistent file, so logs survive
 *          a container restart (the ring alone is lost on restart).
 * @route   GET /api/v1/admin/logs?lines=300&level=ERROR
 * @access  Private/Admin
 */
async function getLogs(req, res) {
  try {
    const lines = Math.min(
      Math.max(parseInt(req.query.lines, 10) || 300, 1),
      MAX_LINES
    );

    const level = String(req.query.level || '').toUpperCase();
    const all = appLogger.getRecentLines(lines);
    const filtered = appLogger.LEVELS.includes(level)
      ? all.filter((l) => l.includes(`[${level}]`))
      : all;

    res.status(200).json({
      success: true,
      data: {
        lines: filtered,
        total: filtered.length,
        stats: appLogger.getStats(),
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1048576)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'No se pudieron leer los logs'
    });
  }
}

module.exports = { getLogs };
