/**
 * Wrapper para enviar mensajes via Evolution API.
 * Evolution API envuelve Baileys y lo expone como REST API.
 */

/**
 * Envía un mensaje de texto a un número de WhatsApp.
 * @param {string} to   - Número de teléfono limpio, ej: "50512345678"
 * @param {string} text - Texto del mensaje
 * @returns {Promise<object>} Respuesta de la API de Evolution
 */
async function sendWhatsAppMessage(to, text) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE son requeridos');
  }

  const url = `${apiUrl}/message/sendText/${instance}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: to,
      textMessage: { text },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Evolution API error ${response.status}: ${JSON.stringify(error)}`);
  }

  return response.json();
}

module.exports = { sendWhatsAppMessage };
