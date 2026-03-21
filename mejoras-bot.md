# Mejoras del agente IA — Bot de pedidos WhatsApp

> Documento de requerimientos de optimización para el comportamiento conversacional del bot.
> Integrar estos cambios en el `system prompt` del agente y en la lógica del backend (`/src/agent/`).

---

## 1. Reducción de preguntas en el flujo de pedido

**Problema:** El bot realiza demasiadas preguntas para confirmar un pedido y repite validaciones innecesarias, haciendo el flujo más largo de lo necesario.

**Solución requerida:**

- Solicitar toda la información del pedido en un solo mensaje inicial, no en pasos separados
- Evitar múltiples confirmaciones del mismo pedido — confirmar **una sola vez** antes de guardar
- Asumir la intención del usuario cuando sea clara (ej. si dice "quiero 2 dobles", no preguntar si quiere hacer un pedido)
- Ser directo: recibir datos → confirmar una vez → guardar

**Ejemplo de flujo correcto:**

```
Usuario: quiero pedir
Bot: ¡Perfecto! Para tu pedido necesito:
     • Tu nombre
     • Dirección de entrega
     • Qué hamburguesas y en qué cantidad
     • Método de pago (transferencia o efectivo)
```

**Cambios en el prompt base (`/prompts/agent.txt`):**

```
- Solicita nombre, dirección, productos y método de pago en un solo mensaje
- No repitas preguntas que ya fueron respondidas
- Confirma el pedido UNA SOLA VEZ con el resumen completo
- Si el usuario ya dio un dato, no lo vuelvas a pedir
```

---

## 2. Flujo conversacional más eficiente

**Problema:** El bot confirma el pedido más de una vez y no asume intenciones claras del usuario.

**Reglas a implementar en el agente:**

- Una vez que el usuario confirme el resumen del pedido, proceder directamente a generar el JSON y guardar — sin preguntar nuevamente
- Si el usuario menciona un producto del menú, asumir intención de compra inmediatamente
- No pedir confirmación de datos que el usuario acaba de proporcionar en el mismo mensaje

**Lógica en `/src/agent/index.js`:**

```js
// Antes de enviar a OpenAI, verificar si ya tenemos todos los campos del pedido
// Si están completos, no preguntar más — generar el JSON y confirmar una sola vez
const camposCompletos = pedido.cliente && pedido.direccion &&
  pedido.productos.length > 0 && pedido.metodo_pago;

if (camposCompletos && !pedido.confirmado) {
  // Enviar resumen y pedir confirmación única
}
if (camposCompletos && pedido.confirmado) {
  // Guardar directamente en Firebase, no consultar al modelo de nuevo
}
```

---

## 3. Priorizar experiencia del usuario sobre ahorro de tokens

**Problema:** El bot economiza tokens a costa de respuestas cortadas o poco claras.

**Regla:** Las respuestas deben ser completas, claras y conversacionales. El costo de una llamada adicional a OpenAI es menor que una mala experiencia del cliente.

**Configuración recomendada en `/src/services/openai.js`:**

```js
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  max_tokens: 500,        // Suficiente para respuestas completas
  temperature: 0.7,
  messages: historial
});
```

No usar `max_tokens` bajo (menos de 200) para ahorrar costos — produce respuestas truncadas.

---

## 4. Manejo de preguntas fuera de contexto

**Problema:** El bot a veces responde preguntas que no tienen relación con el negocio.

**Comportamiento esperado:**

- En el primer intento fuera de contexto: redirigir amablemente al menú
- En el segundo intento: respuesta de límite y no continuar el tema

**Respuesta de límite (copiar exactamente):**

```
Solo puedo ayudarte con pedidos de hamburguesas 🍔
```

**Lógica en el prompt base:**

```
- Si el usuario pregunta algo fuera del menú o pedidos:
  - Primera vez: redirige amablemente ("Eso no lo manejo, pero puedo ayudarte con nuestro menú 😊")
  - Segunda vez consecutiva: responde ÚNICAMENTE "Solo puedo ayudarte con pedidos de hamburguesas 🍔"
  - No sigas el tema fuera de contexto bajo ninguna circunstancia
```

**Control en backend (`/src/agent/contextGuard.js`):**

```js
// Llevar contador de preguntas fuera de contexto por sesión
if (session.offTopicCount >= 2) {
  return 'Solo puedo ayudarte con pedidos de hamburguesas 🍔';
}
```

---

## 5. Filtrado de mensajes antes de llamar a la IA

**Problema:** Se envían mensajes innecesarios al modelo (vacíos, spam, repetidos), generando costo y latencia sin valor.

**Filtros a implementar en `/src/whatsapp/messageHandler.js` ANTES de llamar a OpenAI:**

```js
function debeIgnorar(mensaje) {
  if (!mensaje || mensaje.trim().length === 0) return true;      // Vacío
  if (mensaje.trim().length < 2) return true;                    // Muy corto (stickers, emojis solos)
  if (esSpam(mensaje, session)) return true;                     // Detectado como spam
  if (esMensajeDuplicado(mensaje, session)) return true;         // Repetición inmediata
  return false;
}
```

No llamar a OpenAI si `debeIgnorar()` retorna `true`.

---

## 6. Control de spam — bloqueo temporal

**Problema:** Usuarios que envían muchos mensajes en poco tiempo saturan el sistema y generan llamadas innecesarias a la IA.

**Regla de detección:**

- Más de **5 mensajes en 10 segundos** = spam → bloqueo temporal de 15 segundos

**Respuesta de spam (copiar exactamente):**

```
⚠️ Estás enviando muchos mensajes. Intenta nuevamente en unos segundos.
```

**Implementación en `/src/whatsapp/spamGuard.js`:**

```js
const VENTANA_MS = 10_000;   // 10 segundos
const LIMITE = 5;            // mensajes máximos
const BLOQUEO_MS = 15_000;   // 15 segundos de bloqueo

function verificarSpam(telefono, timestamps) {
  const ahora = Date.now();
  const recientes = timestamps.filter(t => ahora - t < VENTANA_MS);

  if (recientes.length >= LIMITE) {
    return {
      bloqueado: true,
      mensaje: '⚠️ Estás enviando muchos mensajes. Intenta nuevamente en unos segundos.'
    };
  }
  return { bloqueado: false };
}
```

Guardar el estado de bloqueo por número en memoria o en Firebase (`/sesiones/{telefono}/spam`).

---

## 7. Manejo de pausas del usuario — debounce de mensajes

**Problema:** El bot responde a cada mensaje individual, generando respuestas fragmentadas cuando el usuario escribe en varios mensajes seguidos.

**Comportamiento esperado:**

- Esperar entre **10 y 15 segundos** después del último mensaje recibido antes de responder
- Acumular todos los mensajes recibidos en ese intervalo y procesarlos juntos como uno solo
- Esto evita respuestas como "¿Algo más?" → usuario escribe → "¿Y la dirección?" antes de que termine

**Implementación con debounce en `/src/whatsapp/messageHandler.js`:**

```js
const DEBOUNCE_MS = 12_000; // 12 segundos — punto medio entre 10 y 15
const timers = new Map();
const buffers = new Map();

function recibirMensaje(telefono, texto) {
  // Acumular mensajes en buffer
  if (!buffers.has(telefono)) buffers.set(telefono, []);
  buffers.get(telefono).push(texto);

  // Reiniciar el timer con cada mensaje nuevo
  if (timers.has(telefono)) clearTimeout(timers.get(telefono));

  timers.set(telefono, setTimeout(async () => {
    const mensajesAcumulados = buffers.get(telefono).join(' ');
    buffers.delete(telefono);
    timers.delete(telefono);

    // Procesar el bloque completo de mensajes como uno solo
    await procesarConIA(telefono, mensajesAcumulados);
  }, DEBOUNCE_MS));
}
```

> **Nota:** En producción, si el backend corre en múltiples instancias (ej. Railway con escalado), el debounce debe manejarse con Redis en lugar de `Map` en memoria para no perder el estado entre instancias.

---

## Resumen de archivos a modificar

| Archivo | Cambio |
|---|---|
| `/prompts/agent.txt` | Actualizar reglas de flujo: solicitar datos en un mensaje, confirmar una vez, límite de off-topic |
| `/src/agent/index.js` | Lógica de pedido completo, no llamar a IA si ya está confirmado |
| `/src/agent/contextGuard.js` | Contador de preguntas fuera de contexto por sesión |
| `/src/whatsapp/messageHandler.js` | Debounce de 12s + filtro de mensajes vacíos/duplicados |
| `/src/whatsapp/spamGuard.js` | Detección y bloqueo temporal de spam |
| `/src/services/openai.js` | `max_tokens: 500`, no reducir para ahorrar costo |

---

## Prioridad de implementación

1. **Alta** — Debounce de mensajes (impacto directo en experiencia del usuario)
2. **Alta** — Filtro de spam (protege costos de OpenAI)
3. **Alta** — Reducir preguntas del flujo (core del problema)
4. **Media** — Control de off-topic (mejora conversacional)
5. **Baja** — Ajuste de `max_tokens` (optimización menor)
