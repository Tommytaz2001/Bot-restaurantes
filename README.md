# Bot Urbano — Agente IA de Pedidos por WhatsApp

Bot conversacional que toma pedidos por WhatsApp usando OpenAI GPT-4o-mini, los guarda en Firebase Firestore y notifica en tiempo real a una app de cocina (app-chef).

---

## Arquitectura

```
  Cliente WhatsApp
        |
        | (mensaje)
        v
  ┌──────────────┐     webhook HTTP      ┌──────────────────┐
  │ Evolution API │ ──────────────────>   │   Bot Backend    │
  │  (Baileys)   │ <──────────────────   │   (Node.js)      │
  │  Docker :8080 │    REST sendText     │   Docker :3001   │
  └──────────────┘                       └────────┬─────────┘
                                                  │
                                    ┌─────────────┼─────────────┐
                                    v             v             v
                              ┌──────────┐ ┌──────────┐ ┌───────────┐
                              │ OpenAI   │ │ Firebase │ │ Firebase  │
                              │ GPT-4o   │ │Firestore │ │ Storage   │
                              │ mini     │ │(pedidos) │ │(comprob.) │
                              └──────────┘ └──────────┘ └───────────┘
```

**Evolution API** envuelve Baileys (libreria no oficial de WhatsApp) y lo expone como REST API dentro de Docker. Ventajas:
- Sin tramites de Meta — funciona con cualquier numero de WhatsApp
- Webhook interno por red Docker — no necesita URL publica
- Gestion de sesion automatica (reconexiones, QR, persistencia)
- API REST limpia para enviar/recibir mensajes

> La imagen de Evolution API incluye un **patch custom** para soportar el formato LID de WhatsApp (ver `evolution-api/Dockerfile`).

---

## Requisitos

- Docker >= 24 y Docker Compose >= 2.20
- Cuenta Firebase con Firestore y Storage habilitados
- API Key de OpenAI
- Un numero de WhatsApp para vincular al bot

---

## Setup rapido

### 1. Clonar y configurar variables

```bash
git clone https://github.com/tu-usuario/bot-restaurantes.git
cd bot-restaurantes
cp .env.example .env
# Editar .env con tus valores reales (ver seccion "Variables de entorno")
```

### 2. Levantar servicios

```bash
docker compose up -d --build
```

Esto levanta:
- **backend** (`:3001`) — Bot + API REST
- **evolution-api** (`:8080`) — WhatsApp via Baileys

### 3. Crear instancia WhatsApp y vincular

```bash
bash scripts/setup-evolution.sh
```

Este script:
1. Crea la instancia en Evolution API
2. Configura el webhook (apunta al backend)
3. Genera el QR para vincular WhatsApp

### 4. Escanear QR

Abre en el navegador:

```
http://localhost:3001/whatsapp/qr
```

Escanea el QR desde WhatsApp > Dispositivos vinculados > Vincular dispositivo.

### 5. Verificar

```bash
# Salud del backend
curl http://localhost:3001/health

# Estado de WhatsApp
curl http://localhost:3001/whatsapp/status

# Estado de conexion en Evolution API
curl http://localhost:8080/instance/connectionState/bot-restaurantes \
  -H "apikey: TU_API_KEY"
```

Envia un mensaje al numero vinculado desde otro WhatsApp — el bot debe responder.

---

## Variables de entorno

Todas las variables estan documentadas en `.env.example`. Referencia rapida:

| Variable | Donde obtenerla | Ejemplo |
|---|---|---|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `sk-proj-...` |
| `FIREBASE_API_KEY` | Firebase Console > Config del proyecto | `AIzaSy...` |
| `FIREBASE_PROJECT_ID` | Firebase Console > Config del proyecto | `mi-proyecto-123` |
| `FIREBASE_STORAGE_BUCKET` | Firebase Console > Storage | `mi-proyecto.firebasestorage.app` |
| `EVOLUTION_API_KEY` | Tu la defines (cualquier string seguro) | `openssl rand -hex 32` |
| `EVOLUTION_INSTANCE` | Nombre que quieras para la instancia | `bot-restaurantes` |
| `EVOLUTION_API_URL` | Automatico en Docker | `http://evolution-api:8080` |
| `RESTAURANTE_ID` | ID del documento en Firestore `restaurantes/` | `urbano` |

---

## Comandos

| Comando | Descripcion |
|---|---|
| `docker compose up -d --build` | Levantar todos los servicios |
| `docker compose logs -f backend` | Ver logs del bot en tiempo real |
| `docker compose logs -f evolution-api` | Ver logs de Evolution API |
| `docker compose restart backend` | Reiniciar solo el bot |
| `docker compose down` | Detener todo (sesion WhatsApp persiste en volumen) |
| `npm run dev` | Servidor local sin Docker (nodemon, puerto 3001) |
| `npm test` | Correr tests Jest |

---

## Endpoints

### `GET /health`
Estado del servidor.

### `POST /chat`
Envia un mensaje al bot via REST (testing sin WhatsApp).

```json
{
  "message": "hola quiero pedir",
  "sessionId": "cliente-001",
  "restauranteId": "urbano"
}
```

### `GET /orders/:id`
Consulta un pedido por ID.

### `POST /orders/:id/status`
Cambia el estado de un pedido (usado por app-chef). Envia notificacion al cliente por WhatsApp.

### `POST /whatsapp/webhook`
Recibe eventos de Evolution API (mensajes entrantes). No llamar manualmente.

### `GET /whatsapp/qr`
Pagina HTML con el QR para vincular WhatsApp.

### `GET /whatsapp/status`
Estado del bot (activo/pausado).

### `POST /whatsapp/pause` / `POST /whatsapp/resume`
Pausa/reanuda el bot (deja de responder mensajes).

---

## Estructura del proyecto

```
├── index.js                        — Entry point Express
├── docker-compose.yml              — Backend + Evolution API
├── Dockerfile                      — Imagen del backend
├── evolution-api/
│   └── Dockerfile                  — Imagen custom de Evolution API (patch LID)
├── scripts/
│   ├── seedMenu.js                 — Carga menu inicial en Firestore
│   └── setup-evolution.sh          — Crea instancia + webhook en Evolution API
├── prompts/
│   └── agent.txt                   — System prompt del agente IA
├── src/
│   ├── whatsapp/
│   │   ├── metaWebhook.js          — Handler del webhook de Evolution API
│   │   ├── metaSender.js           — Envio de mensajes via Evolution API REST
│   │   └── messageHandler.js       — Logica de procesamiento de mensajes
│   ├── agent/
│   │   ├── agentService.js         — Agente IA (OpenAI + function calling)
│   │   └── sessionStore.js         — Historial de conversacion en memoria
│   ├── orders/
│   │   ├── orderService.js         — CRUD de pedidos en Firestore
│   │   └── orderValidator.js       — Validacion del schema de pedido
│   ├── routes/
│   │   ├── chatRoutes.js           — POST /chat
│   │   ├── orderRoutes.js          — GET/POST /orders
│   │   └── whatsappRoutes.js       — Webhook + QR + status
│   └── services/
│       ├── firebaseService.js      — Inicializacion Firebase
│       ├── menuService.js          — Menu desde Firestore (cache 5 min)
│       ├── openaiService.js        — Wrapper GPT-4o-mini
│       ├── notificacionService.js  — Listener Firestore para notificar clientes
│       └── notificacionQueue.js    — Cola de notificaciones pendientes
└── tests/                          — Tests unitarios e integracion
```

---

## Flujo de un pedido

1. Cliente escribe por WhatsApp
2. Evolution API recibe el mensaje y lo envia al backend via webhook
3. Backend lo pasa a OpenAI con historial de conversacion
4. IA responde en lenguaje natural (menu, precios, datos)
5. Al confirmar pedido → genera JSON → guarda en Firestore → responde confirmacion
6. App-chef ve el pedido en tiempo real y cambia estado
7. Cambio de estado → backend notifica al cliente por WhatsApp
8. Cliente envia comprobante (imagen) → se guarda en Firebase Storage

---

## Firestore — Colecciones

```
restaurantes/{restauranteId}          — Config del restaurante (nombre, moneda, pais)
restaurantes/{restauranteId}/menu/    — Categorias del menu con items y precios
pedidos/{pedidoId}                    — Pedidos confirmados
```

---

## Patch LID de WhatsApp

WhatsApp migro a un formato de identificacion interno llamado **LID** (Linked ID). En lugar de `593XXXXXXXXX@s.whatsapp.net`, ahora usa `188411776393263@lid`.

Evolution API v1.8.x valida si el numero existe en WhatsApp antes de enviar (`onWhatsApp()`), pero esta funcion solo funciona con numeros de telefono, no con LIDs. Esto causa `exists: false` y bloquea el envio.

El archivo `evolution-api/Dockerfile` aplica un patch que agrega `@lid` a la lista de excepciones del chequeo de existencia, permitiendo enviar mensajes a contactos identificados por LID.

---

## Solucion de problemas

| Problema | Causa | Solucion |
|---|---|---|
| QR no aparece | Instancia no creada | `bash scripts/setup-evolution.sh` |
| Bot no responde mensajes | Webhook no configurado | Re-ejecutar `setup-evolution.sh` |
| `exists: false` al enviar | Formato LID sin patch | Verificar que se usa la imagen custom (`build: ./evolution-api`) |
| `WHATSAPP_ENABLED` no activa | Variable no es `true` | Verificar `.env` |
| Error Firebase al iniciar | Credenciales incorrectas | Verificar `FIREBASE_PROJECT_ID` y `FIREBASE_API_KEY` |
| Puerto 3001 ocupado | Otro proceso usa el puerto | Cambiar `PORT` en `.env` |
| Sesion perdida tras reinicio | Volumen no persistido | Verificar `evolution_instances` volume en docker-compose |
