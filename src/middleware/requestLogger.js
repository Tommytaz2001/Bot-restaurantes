const { log } = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const url = req.originalUrl || req.url || '';
    const s = res.statusCode;

    // Ignorar endpoints de polling frecuente del visor de logs y health checks si fueron exitosos (<400)
    // para evitar inundar el archivo de logs con miles de eventos automáticos por hora
    if (
      s < 400 &&
      (url === '/health' ||
       url === '/favicon.ico' ||
       url.startsWith('/logs/data') ||
       url.startsWith('/logs/errors/data'))
    ) {
      return;
    }

    const ms = Date.now() - start;
    const lvl = s >= 500 ? 'ERROR' : s >= 400 ? 'WARN' : 'INFO';
    log(`[HTTP] [${lvl}] ${req.method} ${url} → ${s} (${ms}ms)`);
  });
  next();
}

module.exports = { requestLogger };
