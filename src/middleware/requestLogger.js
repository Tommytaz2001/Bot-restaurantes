const { log } = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl === '/health') return;
    const ms = Date.now() - start;
    const s = res.statusCode;
    const lvl = s >= 500 ? 'ERROR' : s >= 400 ? 'WARN' : 'INFO';
    log(`[HTTP] [${lvl}] ${req.method} ${req.originalUrl} → ${s} (${ms}ms)`);
  });
  next();
}

module.exports = { requestLogger };
