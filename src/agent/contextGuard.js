// Lleva el conteo de preguntas fuera de contexto por sesión
// Se resetea cuando el usuario hace una pregunta dentro del dominio

const _offTopicCount = new Map(); // sessionId -> number

function incrementarOffTopic(sessionId) {
  const count = (_offTopicCount.get(sessionId) || 0) + 1;
  _offTopicCount.set(sessionId, count);
  return count;
}

function resetearOffTopic(sessionId) {
  _offTopicCount.delete(sessionId);
}

function getOffTopicCount(sessionId) {
  return _offTopicCount.get(sessionId) || 0;
}

module.exports = { incrementarOffTopic, resetearOffTopic, getOffTopicCount };
