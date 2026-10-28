const https = require('https');
const OpenAI = require('openai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const FALLBACK_GEMINI_MODEL = process.env.GEMINI_FALLBACK_MODEL || (DEFAULT_GEMINI_MODEL === 'gemini-3.5-flash-lite' ? 'gemini-2.5-flash' : 'gemini-3.5-flash-lite');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const isGemini = !!GEMINI_API_KEY;

// HTTPS Agent con Keep-Alive para evitar socket hang up / ECONNRESET
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 30,
  maxFreeSockets: 10,
  timeout: 30000,
});

console.log(`[AI Engine] Motor activo: ${isGemini ? 'Google Gemini (' + DEFAULT_GEMINI_MODEL + ', fallback: ' + FALLBACK_GEMINI_MODEL + ')' : 'OpenAI'}`);

// ── Declaración de Herramientas para Gemini ───────────────────────────────────
const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'guardar_pedido',
        description: 'OBLIGATORIA al confirmar: Guarda el pedido confirmado por el cliente en el sistema. Debes invocar esta función INMEDIATAMENTE cuando el cliente confirme el resumen del pedido (ej: "ok", "sí", "dale", "confirmo"). ESTÁ PROHIBIDO responder con texto plano diciendo que el pedido fue recibido sin invocar esta función.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente: { type: 'STRING', description: 'Nombre completo del cliente' },
            telefono: { type: 'STRING', description: 'Número de teléfono del cliente (solo para delivery). Debe ser un único número limpio (8 dígitos para Nicaragua, ej: "58544518"). NUNCA dupliques ni concatenes números.' },
            tipo_entrega: { type: 'STRING', enum: ['delivery', 'retiro'], description: 'delivery o retiro' },
            direccion: { type: 'STRING', description: 'Dirección de entrega. Para retiro usa "Retiro en local"' },
            costo_envio: { type: 'NUMBER', description: '40 para delivery, 0 para retiro' },
            total: { type: 'NUMBER', description: 'Total del pedido incluyendo envío' },
            metodo_pago: { type: 'STRING', enum: ['efectivo', 'transferencia'] },
            productos: {
              type: 'ARRAY',
              description: 'Lista de platillos pedidos',
              items: {
                type: 'OBJECT',
                properties: {
                  nombre: { type: 'STRING' },
                  cantidad: { type: 'NUMBER', description: 'Cantidad pedida. Debe respetar estrictamente el número que el cliente indicó en el chat (ej: si dijo "2 hot dog" y luego eligió "210", la cantidad es 2). Solo usa 1 si el cliente no especificó ningún número ni cantidad.' },
                  precio_unitario: { type: 'NUMBER' },
                  opcion: { type: 'STRING', description: 'Variante o nota (ej: "sin cebolla", "BBQ")' },
                },
                required: ['nombre', 'cantidad', 'precio_unitario'],
              },
            },
          },
          required: ['cliente', 'tipo_entrega', 'direccion', 'productos', 'costo_envio', 'total', 'metodo_pago'],
        },
      },
      {
        name: 'solicitar_cambio_pedido',
        description: 'Registra una modificación o adición sobre un pedido ya confirmado del cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            tipo: {
              type: 'STRING',
              enum: ['modificacion', 'agregar_productos', 'cambiar_entrega'],
            },
            descripcion_cambio: { type: 'STRING', description: 'Descripción clara del cambio solicitado' },
            productos_nuevos: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  nombre: { type: 'STRING' },
                  cantidad: { type: 'NUMBER', description: 'Cantidad pedida (por defecto 1).' },
                  precio_unitario: { type: 'NUMBER' },
                  opcion: { type: 'STRING' },
                },
                required: ['nombre', 'cantidad', 'precio_unitario'],
              },
            },
            datos_entrega: {
              type: 'OBJECT',
              properties: {
                tipo_entrega: { type: 'STRING', enum: ['delivery', 'retiro'] },
                direccion: { type: 'STRING' },
                costo_envio: { type: 'NUMBER' },
                total_nuevo: { type: 'NUMBER' },
              },
              required: ['tipo_entrega', 'costo_envio', 'total_nuevo'],
            },
          },
          required: ['tipo', 'descripcion_cambio'],
        },
      },
      {
        name: 'cancelar_pedido',
        description: 'Cancela el pedido activo del cliente cuando lo solicite.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_estado_pedido',
        description: 'Consulta el estado actual del pedido del cliente.',
        parameters: { type: 'OBJECT', properties: {} },
      },
    ],
  },
];

function executeGeminiRequest(model, payload, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    let isSettled = false;

    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: timeoutMs,
        agent: httpsAgent,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (isSettled) return;
          isSettled = true;
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 400 || parsed.error) {
              const err = new Error(parsed.error?.message || `Gemini API error ${res.statusCode}: ${body}`);
              err.statusCode = res.statusCode;
              err.isOverloaded = (res.statusCode === 429 || res.statusCode === 503 || body.includes('high demand'));
              return reject(err);
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Error parseando respuesta de Gemini: ${body}`));
          }
        });
      }
    );

    req.on('error', (err) => {
      if (isSettled) return;
      isSettled = true;
      err.isSocketError = (err.code === 'ECONNRESET' || err.message?.includes('socket hang up') || err.message?.includes('ECONNRESET'));
      reject(err);
    });

    req.on('timeout', () => {
      if (isSettled) return;
      isSettled = true;
      req.destroy();
      const err = new Error(`Timeout de ${Math.round(timeoutMs / 1000)}s al conectar con Google Gemini`);
      err.isTimeout = true;
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function executeGeminiRequestWithRetry(model, payload, maxRetries = 2) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeGeminiRequest(model, payload, 25000);
    } catch (err) {
      lastErr = err;
      const isRetryable = err.isTimeout || err.isSocketError || err.isOverloaded || err.code === 'ECONNRESET' || (err.message && err.message.includes('socket hang up'));
      if (isRetryable && attempt < maxRetries) {
        console.warn(`[Gemini] Intento ${attempt}/${maxRetries} falló (${err.message}). Reintentando en 800ms...`);
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

// ── Invocación HTTPS con auto-fallback de modelo ────────────────────────────
async function callGeminiGenerateContent({ systemPrompt, contents, useTools = true }) {
  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 800,
    },
  };

  if (useTools) {
    payload.tools = GEMINI_TOOLS;
  }

  try {
    return await executeGeminiRequestWithRetry(DEFAULT_GEMINI_MODEL, payload, 2);
  } catch (err) {
    // Si el modelo principal está saturado o da timeout/socket error, reintentar con fallback
    if ((err.isOverloaded || err.isTimeout || err.isSocketError) && DEFAULT_GEMINI_MODEL !== FALLBACK_GEMINI_MODEL) {
      console.warn(`[Gemini] ${DEFAULT_GEMINI_MODEL} falló tras reintentos (${err.message}). Usando fallback ${FALLBACK_GEMINI_MODEL}...`);
      return await executeGeminiRequestWithRetry(FALLBACK_GEMINI_MODEL, payload, 2);
    }
    throw err;
  }
}

// ── Conversor de Mensajes de Historial ───────────────────────────────────────
function formatMessagesForGemini(messages) {
  const contents = [];
  const toolNameById = new Map();

  for (const msg of messages) {
    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content || '' }],
      });
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.rawParts) && msg.rawParts.length > 0) {
        // Preservar exactamente las partes originales de Gemini (incluye thoughtSignature)
        for (const p of msg.rawParts) {
          if (p.functionCall) {
            toolNameById.set(p.functionCall.id || p.functionCall.name, p.functionCall.name);
          }
        }
        contents.push({ role: 'model', parts: msg.rawParts });
      } else {
        const parts = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            toolNameById.set(tc.id, tc.function.name);
            const callPart = {
              functionCall: {
                name: tc.function.name,
                args: typeof tc.function.arguments === 'string'
                  ? JSON.parse(tc.function.arguments || '{}')
                  : tc.function.arguments,
              },
            };
            if (tc.thoughtSignature) {
              callPart.thoughtSignature = tc.thoughtSignature;
            }
            parts.push(callPart);
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      }
    } else if (msg.role === 'tool') {
      const toolName = toolNameById.get(msg.tool_call_id) || 'guardar_pedido';
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(msg.content);
      } catch {
        parsedResponse = { result: msg.content };
      }
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: parsedResponse,
            },
          },
        ],
      });
    }
  }

  return contents;
}

// ── Cliente Fallback OpenAI ──────────────────────────────────────────────────
let openaiClient = null;
function getOpenAIClient() {
  if (!openaiClient && OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openaiClient;
}

// ── Interfaz Principal chatCompletion ────────────────────────────────────────
async function chatCompletion({ systemPrompt, messages, tools = true }) {
  if (isGemini) {
    try {
      const contents = formatMessagesForGemini(messages);
      const geminiRes = await callGeminiGenerateContent({
        systemPrompt,
        contents,
        useTools: tools,
      });

      const candidate = geminiRes.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini no retornó candidatos de respuesta');
      }

      const parts = candidate.content?.parts || [];
      let textContent = null;
      let toolCalls = [];

      for (const part of parts) {
        if (part.text) {
          textContent = (textContent ? textContent + '\n' : '') + part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
            thoughtSignature: part.thoughtSignature || null,
          });
        }
      }

      console.log(`[AI Engine] Gemini finishReason="${candidate.finishReason || 'STOP'}", toolCalls=${toolCalls.length ? toolCalls.map(t => t.function.name).join(', ') : '0'}, textChars=${textContent?.length || 0}`);

      return {
        role: 'assistant',
        content: textContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : null,
        rawParts: parts,
      };
    } catch (err) {
      if (OPENAI_API_KEY) {
        console.warn(`[AI Engine] Gemini no respondió (${err.message}). Activando fallback a OpenAI...`);
      } else {
        throw err;
      }
    }
  }

  // Fallback a OpenAI si no hay Gemini API key o si Gemini falló y hay OPENAI_API_KEY
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('No hay API key configurada ni para Google Gemini ni para OpenAI');
  }

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    max_tokens: 600,
    temperature: 0.7,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  });

  return response.choices[0].message;
}

module.exports = {
  chatCompletion,
  isGemini,
  modelName: isGemini ? DEFAULT_GEMINI_MODEL : (process.env.OPENAI_MODEL || 'gpt-4o-mini'),
};
