/**
 * Wrapper para enviar mensajes via Evolution API.
 * Evolution API envuelve Baileys y lo expone como REST API.
 */

/**
 * Envía un mensaje de texto a un número de WhatsApp.
 * IMPORTANTE: 'to' debe preservar el JID original (@lid o @s.whatsapp.net).
 * Nunca debe forzarse la conversión de un @lid a @s.whatsapp.net al enviar mensajes,
 * ya que WhatsApp desincroniza las claves de cifrado E2EE y muestra "Esperando el mensaje".
 *
 * @param {string} to   - Número de teléfono limpio o JID completo, ej: "50512345678" o "229712...@lid"
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

  // Preservar el destino original sin mutar identificadores de sesión (@lid o @s.whatsapp.net).
  // Si es un número sin JID de 8 dígitos (Nicaragua), asegurar prefijo internacional 505.
  let destination = to;
  if (typeof destination === 'string') {
    const trimmed = destination.trim();
    if (!trimmed.includes('@')) {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length === 8) {
        destination = `505${digits}`;
      } else if (digits.length > 8) {
        destination = digits;
      }
    }
  }

  const url = `${apiUrl}/message/sendText/${instance}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: destination,
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
