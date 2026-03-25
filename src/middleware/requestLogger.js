/**
 * Middleware que registra cada request HTTP en stdout.
 * Formato: [HTTP] [LEVEL] METHOD /route → STATUS (Xms)
 * Buscar en Kibana con: message: "[HTTP]"
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl === '/health') return; // omitir health checks
    const ms = Date.now() - start;
    const s = res.statusCode;
    const lvl = s >= 500 ? 'ERROR' : s >= 400 ? 'WARN' : 'INFO';
    console.log(`[HTTP] [${lvl}] ${req.method} ${req.originalUrl} → ${s} (${ms}ms)`);
  });
  next();
}

module.exports = { requestLogger };
