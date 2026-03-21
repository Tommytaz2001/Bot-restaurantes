const TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_MESSAGES = 50;

const _sessions = new Map(); // Map<sessionId, { messages: [], lastActivity: timestamp, lastOrderId?: string }>

function getSession(sessionId) {
  const entry = _sessions.get(sessionId);
  if (!entry) return [];
  entry.lastActivity = Date.now();
  return entry.messages;
}

function addMessage(sessionId, message) {
  if (!_sessions.has(sessionId)) {
    _sessions.set(sessionId, { messages: [], lastActivity: Date.now() });
  }
  const entry = _sessions.get(sessionId);
  entry.messages.push(message);
  entry.lastActivity = Date.now();

  // Truncate in atomic pairs to never split tool_call from tool_result
  // Remove oldest 2 messages (one pair) until within limit
  while (entry.messages.length > MAX_MESSAGES) {
    entry.messages.splice(0, 2);
  }
}

function clearExpiredSessions(forceAll = false) {
  const now = Date.now();
  for (const [id, entry] of _sessions.entries()) {
    if (forceAll || now - entry.lastActivity > TTL_MS) {
      _sessions.delete(id);
    }
  }
}

function setLastOrderId(sessionId, orderId) {
  if (!_sessions.has(sessionId)) {
    _sessions.set(sessionId, { messages: [], lastActivity: Date.now() });
  }
  _sessions.get(sessionId).lastOrderId = orderId;
}

function getLastOrderId(sessionId) {
  return _sessions.get(sessionId)?.lastOrderId ?? null;
}

// Limpiar sesiones expiradas cada 5 minutos
setInterval(clearExpiredSessions, 5 * 60 * 1000).unref();

module.exports = { getSession, addMessage, clearExpiredSessions, setLastOrderId, getLastOrderId, _sessions };
