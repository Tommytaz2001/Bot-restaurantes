const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../services/authService');

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado - Falta token' });
  }

  const token = header.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.uid = decoded.uid;
  req.restauranteId = decoded.restauranteId || 'urbano';
  req.user = decoded;
  next();
}

async function requireAuthQuery(req, res, next) {
  const token = req.query.token || req.headers.authorization?.slice(7);
  if (!token) {
    return res.status(401).json({ error: 'No autorizado - Falta token' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.uid = decoded.uid;
  req.restauranteId = decoded.restauranteId || 'urbano';
  req.user = decoded;
  next();
}

module.exports = { requireAuth, requireAuthQuery };
