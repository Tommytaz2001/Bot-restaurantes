const https = require('https');
const OpenAI = require('openai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const isGemini = !!GEMINI_API_KEY;

console.log(`[AI Engine] Motor activo: ${isGemini ? 'Google Gemini (' + DEFAULT_GEMINI_MODEL + ')' : 'OpenAI'}`);

// ── Declaración de Herramientas para Gemini ───────────────────────────────────
const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'guardar_pedido',
        description: 'Guarda el pedido confirmado por el cliente en el sistema. Invoca esta función ÚNICAMENTE cuando el cliente haya visto el resumen del pedido Y haya respondido confirmándolo explícitamente (ej: "sí", "confirmo", "dale"). NUNCA la invoques en el primer mensaje ni antes de mostrar el resumen.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente: { type: 'STRING', description: 'Nombre completo del cliente' },
            telefono: { type: 'STRING', description: 'Número de teléfono del cliente (solo para delivery)' },
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
                  cantidad: { type: 'NUMBER' },
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
                  cantidad: { type: 'NUMBER' },
                  precio_unitario: { type: 'NUMBER' },
                  opcion: { type: 'STRING' },
                },
                required: ['nombre', 'cantidad', 'precio_unitario'],
              },
            },
            datos_entrega: {
              type: 'OBJECT',
              properties: {
                tipo_entrega: { type: 'STRING', enum: ['domicilio', 'retiro'] },
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

function executeGeminiRequest(model, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 12000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
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

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      const err = new Error('Timeout de 12s al conectar con Google Gemini');
      err.isTimeout = true;
      reject(err);
    });
    req.write(data);
    req.end();
  });
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
    return await executeGeminiRequest(DEFAULT_GEMINI_MODEL, payload);
  } catch (err) {
    // Si el modelo principal está saturado o da timeout, reintentar con flash-lite
    if ((err.isOverloaded || err.isTimeout) && DEFAULT_GEMINI_MODEL !== FALLBACK_GEMINI_MODEL) {
      console.warn(`[Gemini] ${DEFAULT_GEMINI_MODEL} sobrecargado/timeout. Usando fallback ${FALLBACK_GEMINI_MODEL}...`);
      return await executeGeminiRequest(FALLBACK_GEMINI_MODEL, payload);
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

    return {
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
      rawParts: parts,
    };
  }

  // Fallback a OpenAI si no hay Gemini API key
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
