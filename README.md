# Bot Urbano — Agente IA de Pedidos

Bot conversacional que toma pedidos por WhatsApp usando OpenAI GPT-4o-mini y guarda los pedidos en Firebase Firestore. Testeable vía REST.

---

## Requisitos

- Node.js 20+
- Cuenta Firebase con proyecto Firestore habilitado
- API Key de OpenAI

---

## Instalación

```bash
npm install
```

Crea el archivo `.env` en la raíz (ver `.env.example`):

```env
OPENAI_API_KEY=sk-proj-...
FIREBASE_API_KEY=AIzaSy...
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
PORT=3001
```

Carga el menú inicial en Firestore (solo la primera vez):

```bash
node scripts/seedMenu.js
```

---

## Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor local con hot-reload (nodemon) en puerto 3001 |
| `npm start` | Servidor en producción |
| `npm test` | Correr todos los tests (unit + integración) |
| `npm run test:unit` | Solo tests unitarios (sin Firebase ni OpenAI) |

---

## Endpoints

### `GET /health`
Verifica que el servidor esté corriendo.

```bash
curl http://localhost:3001/health
```

**Respuesta:**
```json
{ "status": "ok" }
```

---

### `POST /chat`
Envía un mensaje al bot y recibe su respuesta. Mantiene el historial de conversación por `sessionId`.

**Body:**
```json
{
  "message": "string",        // Mensaje del usuario (requerido)
  "sessionId": "string",      // ID único de la sesión/conversación (requerido)
  "restauranteId": "string",  // ID del restaurante en Firestore (requerido)
  "telefono": "string"        // Teléfono del cliente — opcional, el bot lo pide si no se envía
}
```

**Respuesta normal:**
```json
{
  "reply": "¡Hola! ¿Qué te gustaría ordenar hoy en Urbano?",
  "order": null
}
```

**Respuesta cuando se confirma un pedido:**
```json
{
  "reply": "¡Listo! Tu pedido ha sido registrado. Te llegará pronto.",
  "order": {
    "id": "uuid-generado",
    "restauranteId": "urbano",
    "cliente": "Juan Pérez",
    "telefono": "+50512345678",
    "direccion": "Barrio Linda Vista, casa 5",
    "productos": [
      { "nombre": "Clásica", "cantidad": 1, "precio_unitario": 160, "opcion": null }
    ],
    "total": 160,
    "moneda": "C$",
    "metodo_pago": "efectivo",
    "estado": "pendiente_pago",
    "comprobante_url": null,
    "createdAt": "..."
  }
}
```

**Errores:**
| Código | Causa |
|---|---|
| `400` | Falta `message`, `sessionId` o `restauranteId` |
| `404` | `restauranteId` no existe en Firestore |
| `503` | Error interno (OpenAI o Firebase no disponible) |

---

### `GET /orders/:id`
Consulta un pedido guardado por su ID.

**Respuesta:**
```json
{
  "id": "uuid",
  "restauranteId": "urbano",
  "cliente": "Juan Pérez",
  "telefono": "+50512345678",
  "direccion": "Barrio Linda Vista, casa 5",
  "productos": [...],
  "total": 160,
  "moneda": "C$",
  "metodo_pago": "efectivo",
  "estado": "pendiente_pago",
  "comprobante_url": null
}
```

**Errores:**
| Código | Causa |
|---|---|
| `404` | Pedido no encontrado |
| `503` | Error de Firebase |

---

## Ejemplos curl — Conversación completa

### 1. Saludo inicial
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "hola",
    "sessionId": "cliente-001",
    "restauranteId": "urbano"
  }'
```

### 2. Pedir el menú
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "¿qué hamburguesas tienen?",
    "sessionId": "cliente-001",
    "restauranteId": "urbano"
  }'
```

### 3. Hacer un pedido
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "quiero una Clásica y una Coca Cola",
    "sessionId": "cliente-001",
    "restauranteId": "urbano"
  }'
```

### 4. Dar datos de entrega
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Me llamo Juan Pérez, mi dirección es Barrio Linda Vista casa 5, teléfono +50512345678",
    "sessionId": "cliente-001",
    "restauranteId": "urbano"
  }'
```

### 5. Elegir método de pago
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "pago en efectivo",
    "sessionId": "cliente-001",
    "restauranteId": "urbano"
  }'
```

### 6. Confirmar pedido (guarda en Firestore)
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "sí, confirmo",
    "sessionId": "cliente-001",
    "restauranteId": "urbano"
  }'
```
> La respuesta incluirá `"order": { "id": "...", "estado": "pendiente_pago", ... }`

### 7. Consultar el pedido guardado
```bash
curl http://localhost:3001/orders/{id-del-pedido}
```

---

## Estados de un pedido

| Estado | Significado |
|---|---|
| `pendiente` | Pedido recibido, pago por transferencia — esperando comprobante |
| `pendiente_pago` | Pedido recibido, pago en efectivo al recibir |
| `pagado` | Pago confirmado |

---

## Estructura del proyecto

```
├── index.js                    — Entry point Express
├── prompts/
│   └── agent.txt               — System prompt del agente (editable sin reiniciar)
├── scripts/
│   └── seedMenu.js             — Carga menú inicial en Firestore
├── firebase/
│   └── firestore.rules         — Reglas de seguridad Firestore
├── src/
│   ├── agent/
│   │   ├── agentService.js     — Lógica principal del agente IA
│   │   └── sessionStore.js     — Historial de conversación en memoria
│   ├── orders/
│   │   ├── orderService.js     — Guardar/consultar pedidos en Firestore
│   │   └── orderValidator.js   — Validación del schema de pedido
│   ├── routes/
│   │   ├── chatRoutes.js       — POST /chat
│   │   └── orderRoutes.js      — GET /orders/:id
│   └── services/
│       ├── firebaseService.js  — Inicialización Firebase
│       ├── menuService.js      — Menú desde Firestore con caché 5 min
│       └── openaiService.js    — Wrapper GPT-4o-mini con function calling
└── tests/                      — 30 tests (unit + integración)
```

---

## Firestore — Colecciones

```
restaurantes/{restauranteId}          — Config del restaurante (nombre, moneda, país)
restaurantes/{restauranteId}/menu/    — Categorías del menú con items y precios
pedidos/{pedidoId}                    — Pedidos confirmados
```

Para agregar un nuevo restaurante, crea el documento en Firestore manualmente o crea un nuevo script de seed siguiendo la misma estructura que `scripts/seedMenu.js`.
