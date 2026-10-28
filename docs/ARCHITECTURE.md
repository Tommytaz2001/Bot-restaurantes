# Arquitectura del Sistema — Bot Restaurantes Urbano

Documento de referencia técnica sobre la estructura, módulos, flujo de ejecución y decisiones de diseño del sistema.

---

## 1. Visión General del Sistema

El sistema es una solución integral de pedidos para restaurantes de comida rápida (**Urbano Fast Food**, Nicaragua). Automatiza la toma de comandas mediante un agente conversacional de WhatsApp, centraliza la persistencia en una base de datos relacional y despacha las órdenes en tiempo real a una aplicación de cocina (Kitchen Display System - KDS).

### Diagrama de Flujo y Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente (WhatsApp)                       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Mensaje / Foto comprobante
                               ▼
┌─────────────────────────────────────────────────────────────┐
│       Evolution API v1.8.7 (Docker :6543 / Baileys)         │
│   * Parche custom para soporte de JIDs con formato @lid     │
└──────────────┬──────────────────────────────▲───────────────┘
               │ Webhook HTTP                 │ REST sendText /
               │ POST /whatsapp/webhook       │ getBase64Media
               ▼                              │
┌─────────────────────────────────────────────┴───────────────┐
│               Backend Node.js 20 + Express 5                │
│                                                             │
│  ┌────────────────────────┐    ┌─────────────────────────┐  │
│  │   Agente Conversacional│    │   Motor de Notificaciones│ │
│  │  (Google Gemini Flash) │    │   y Eventos (EventEmitter)││
│  └───────────┬────────────┘    └────────────┬────────────┘  │
│              │ Function Calling             │ SSE Push      │
│              ▼                              ▼               │
│  ┌────────────────────────┐    ┌─────────────────────────┐  │
│  │   Servicio de Pedidos  │    │   Stream SSE en vivo    │  │
│  │   (Validación y CRUD)  │    │   /pedidos-admin/activos│  │
│  └───────────┬────────────┘    └────────────┬────────────┘  │
└──────────────┼──────────────────────────────┼───────────────┘
               │ Pool pg                      │ Server-Sent Events
               ▼                              ▼
┌───────────────────────────┐    ┌────────────────────────────┐
│   PostgreSQL 16 (Alpine)  │    │   App Cocina KDS (React)   │
│   Puerto :5432            │    │   Vite + Tailwind + Cap    │
│   Menu, Pedidos, Usuarios │    │   Puerto :5173 (o APK)     │
└───────────────────────────┘    └────────────────────────────┘
```

---

## 2. Estructura del Repositorio

```
d:\Bot-restaurantes\
├── index.js                     # Punto de entrada Express, montaje de rutas y listeners
├── package.json                 # Dependencias backend (Express 5, @google/genai, pg, etc.)
├── docker-compose.yml           # Orquestación: backend, postgres, evolution-api
├── Dockerfile                   # Imagen Docker para el backend
├── .env.example                 # Plantilla de variables de entorno (sin credenciales)
├── prompts/
│   └── agent.txt                # System prompt maestro de "Urbi" (con plantillas de contexto)
├── evolution-api/
│   └── Dockerfile               # Parche para exentar @lid del check de existencia
├── src/
│   ├── agent/                   # Inteligencia y contexto conversacional
│   │   ├── agentService.js      # Orquestación del ciclo del agente y llamadas a tools
│   │   ├── contextGuard.js      # Verificación de completitud y límites
│   │   └── sessionStore.js      # Historial en memoria por sessionId (TTL 24h)
│   ├── db/                      # Capa de datos relacional
│   │   ├── connection.js        # Pool de conexiones pg con logging de slow queries
│   │   ├── schema.sql           # Definición DDL de tablas e índices
│   │   └── initDb.js            # Inicialización automática y seed de menú/restaurante
│   ├── middleware/              # Seguridad e instrumentación
│   │   ├── authMiddleware.js    # Verificación JWT en header (Bearer) y query param
│   │   └── requestLogger.js     # Logger de peticiones HTTP en formato ndjson
│   ├── orders/                  # Lógica de dominio de pedidos
│   │   ├── orderService.js      # Transacciones SQL, creación, actualización y consultas
│   │   └── orderValidator.js    # Validación síncrona de esquema de pedido
│   ├── routes/                  # Endpoints REST y vistas públicas
│   │   ├── authRoutes.js        # POST /auth/login
│   │   ├── blacklistRoutes.js   # CRUD /blacklist (números bloqueados y repartidores)
│   │   ├── chatRoutes.js        # POST /chat (interfaz directa de chat)
│   │   ├── logRoutes.js         # /logs (monitor web de logs en tiempo real)
│   │   ├── menuAdminRoutes.js   # CRUD de categorías y platillos para la app
│   │   ├── orderRoutes.js       # GET /orders/:id y POST /orders/:id/notificar
│   │   ├── pedidosAdminRoutes.js# Acciones KDS y SSE (/activos/stream, /historial)
│   │   ├── restauranteRoutes.js # Horarios, proteínas agotadas y push tokens
│   │   └── whatsappRoutes.js    # Webhook Evolution, QR interactivo, control de bot
│   ├── services/                # Servicios de negocio auxiliares
│   │   ├── aiService.js         # Cliente Google Gemini API con fallback a OpenAI
│   │   ├── authService.js       # Autenticación de usuarios con bcrypt y JWT
│   │   ├── blacklistService.js  # Servicio con caché en memoria y normalización de números
│   │   ├── botStateService.js   # Pausa/reanudación global del bot (kill switch)

│   │   ├── evolutionSetup.js    # Inicialización de instancia y webhook en Evolution
│   │   ├── menuAdminService.js  # Modificaciones administrativas del menú en Postgres
│   │   ├── menuService.js       # Lectura de configuración, menú y formateo para prompt
│   │   ├── notificacionQueue.js # Cola de reintentos de mensajes WhatsApp
│   │   ├── notificacionService.js # Listener de eventos que dispara WhatsApp al cliente
│   │   ├── openaiService.js     # Adaptador de compatibilidad hacia aiService
│   │   ├── orderEvents.js       # EventEmitter central de eventos de pedidos
│   │   ├── pedidosAdminService.js# Lógica de cambio de estados (confirmar, en camino, etc.)
│   │   ├── pushService.js       # Registro de tokens de notificación móvil
│   │   ├── restauranteService.js# Gestión de horarios y bloqueos de proteína
│   │   ├── simulacionService.js # Generador de pedidos sintéticos para pruebas de carga
│   │   └── sseService.js        # Manejador de conexiones Server-Sent Events
│   └── whatsapp/                # Integración con el canal de mensajería
│       ├── messageHandler.js    # Enrutamiento de mensajes de texto y verificación horaria
│       ├── metaSender.js        # Envío de texto saliente vía Evolution API
│       ├── metaWebhook.js       # Receptor de webhooks, deduplicación y manejo de imágenes
│       └── spamGuard.js         # Limitador de tasa y protección contra abusos
├── app-chef/                    # Frontend KDS (React 18 + Vite + TailwindCSS + Capacitor)
│   ├── src/
│   │   ├── App.tsx              # Componente principal, enrutamiento y autenticación
│   │   ├── pages/               # Pantallas (Dashboard KDS, Historial, Menú, Ajustes)
│   │   ├── hooks/               # Custom hooks (SSE de pedidos, reproducción de alertas sonoras)
│   │   └── services/            # Clientes HTTP hacia la API del backend
│   └── android/                 # Proyecto Android para generación de APK nativo
└── tests/                       # Suite de pruebas unitarias y de integración Jest
```

---

## 3. Módulos y Responsabilidades

### 3.1. Agente Conversacional (`src/agent` y `src/services/aiService.js`)
- **Motor principal:** Google Gemini (`gemini-2.5-flash` o `gemini-3.5-flash-lite`) vía REST directo sobre `generativelanguage.googleapis.com`.
- **System Prompt dinámico:** Inyecta en caliente el menú estructurado, horarios, cuentas bancarias, si el interlocutor es un repartidor o cliente recurrente (recordando su última dirección de entrega), y datos de cualquier pedido activo.
- **Herramientas declaradas (Function Calling):**
  - `guardar_pedido`: Registra un pedido tras confirmación explícita del cliente.
  - `solicitar_cambio_pedido`: Registra modificaciones o adiciones sobre pedidos en curso.
  - `cancelar_pedido`: Cancela el pedido activo a petición del cliente.
  - `consultar_estado_pedido`: Informa el estado actual de la comanda en preparación/camino.

### 3.2. Integración WhatsApp (`src/whatsapp` y `evolution-api`)
- **Evolution API (v1.8.7):** Conector Baileys desacoplado en contenedor Docker independiente.
- **Manejo de LIDs:** Dockerfile personalizado que parchea el chequeo `onWhatsApp()` para evitar que WhatsApp rechace números en formato Linked ID (`@lid`).
- **Manejo de Comprobantes:** Si un cliente en estado `pendiente_pago` envía una imagen, `metaWebhook.js` la descarga vía base64 desde Evolution API, la guarda localmente en `uploads/` y actualiza el pedido a `pendiente` (comprobante adjunto).

### 3.3. Persistencia Relacional (`src/db`)
PostgreSQL 16 sustituye la persistencia previa en Firestore, eliminando costos por volumen de lectura/escritura y garantizando integridad transaccional:
- `restaurantes`: Configuración multitenant, moneda (`C$`), horarios por día en JSONB y cuentas bancarias.
- `categorias` y `productos`: Catálogo jerárquico con variantes y flags de disponibilidad (`disponible: boolean`).
- `pedidos` y `pedido_items`: Registro de comandas con cálculo de subtotales y detalle de producto.
- `usuarios`: Administradores y chefs con credenciales encriptadas vía `bcrypt`.
- `notificaciones_queue`: Cola con reintentos para mensajes de WhatsApp en caso de indisponibilidad de la API.
- `lista_negra`: Números telefónicos de repartidores o contactos bloqueados para silenciar automáticamente las respuestas del bot.


### 3.4. Tiempo Real y KDS (`src/services/sseService.js` y `app-chef/`)
- **Arquitectura SSE (Server-Sent Events):** Los clientes KDS se conectan a `/pedidos-admin/activos/stream`. El backend utiliza un `EventEmitter` interno (`orderEvents`) para emitir snapshots inmediatos ante cualquier mutación de pedidos (`order:created`, `order:updated`, `order:cancelled`).
- **Resiliencia:** Incluye un heartbeat cada 25 segundos (`: keepalive\n\n`) y cabeceras `X-Accel-Buffering: no` para compatibilidad con proxies inversos (Nginx).
- **App Cocina:** Panel táctil responsivo que notifica sonoramente (chime de audio) la llegada de nuevos pedidos y permite a los cocineros avanzar los estados de comanda en un toque.

---

## 4. Flujos Clave de Ejecución

### 4.1. Flujo de un Pedido Completo
1. El cliente envía un mensaje por WhatsApp.
2. Evolution API lo recibe vía Baileys y dispara un webhook a `POST /whatsapp/webhook`.
3. `metaWebhook.js` deduplica el mensaje por ID, verifica que el bot esté activo y que el restaurante esté en horario hábil.
4. `agentService.js` ensambla el prompt con el menú actualizado y el historial de la sesión (`sessionStore.js`).
5. Google Gemini procesa la intención. Si el cliente confirma la orden, Gemini emite un function call `guardar_pedido`.
6. `orderService.js` ejecuta una transacción SQL: inserta en `pedidos` y `pedido_items`, calcula el costo de envío (C$40 delivery, C$0 retiro) y dispara `orderEvents.emit('order:created')`.
7. `sseService.js` detecta el evento y empuja el nuevo snapshot a todos los navegadores KDS conectados.
8. La app de cocina suena la campana y muestra la nueva tarjeta en la columna de pedidos pendientes.

### 4.2. Flujo de Notificaciones al Cliente
1. El chef presiona "Confirmar (+30 min)" en la app KDS.
2. La app envía `PATCH /pedidos-admin/:id/confirmar` con `{ tiempoEstimadoMin: 30 }`.
3. `pedidosAdminService.js` actualiza el estado en PostgreSQL y dispara `orderEvents.emit('order:updated')`.
4. `notificacionService.js` captura el evento y envía automáticamente un mensaje de WhatsApp al cliente con el tiempo de espera estimado.
5. Si el cliente solicita un cambio o anexo en un pedido ya confirmado, el chef puede aprobar la modificación en la app KDS o móvil asignando un nuevo tiempo estimado (`tiempoEstimadoMin`). El backend actualiza `tiempo_estimado_min` y notifica inmediatamente al cliente por WhatsApp con el nuevo tiempo de espera y el desglose de productos actualizado.
6. Al pasar a "En camino / Listo para retiro", se despacha la notificación final de envío. Al marcar "Entregado", la orden se archiva silenciosamente sin spam al cliente.

---

## 5. Decisiones Arquitectónicas y Restricciones Técnicas

1. **Migración de Firestore a PostgreSQL:** Realizada para reducir costos de nube, simplificar consultas complejas (historial, reportes) y permitir despliegues autocontenidos en servidores privados o VPS mediante Docker Compose.
2. **Motor de IA Gemini con Fallback:** Se utiliza Google Gemini por su velocidad, soporte nativo de function calling y costo eficiente. Se mantiene el adaptador `src/services/openaiService.js` para evitar romper llamadas históricas y permitir conmutación a OpenAI si fuera necesario.
3. **Sesiones en Memoria vs. Base de Datos:** Las sesiones de conversación conversacional actualmente residen en la memoria RAM del proceso Node.js (`src/agent/sessionStore.js`). Un reinicio del contenedor reinicia las conversaciones en curso; los pedidos confirmados, no obstante, quedan inmediatamente persistidos en PostgreSQL.
4. **Almacenamiento Local de Archivos:** Las imágenes de comprobantes se guardan en el volumen de disco `uploads/` servido estáticamente en `/uploads`. No requiere dependencias externas de buckets S3 o Google Cloud Storage.
5. **Autenticación en SSE:** Los navegadores no permiten cabeceras `Authorization` en conexiones `EventSource` nativas. Por tanto, `authMiddleware.js` soporta autenticación mediante query parameter (`?token=...`) exclusivamente para los endpoints `/stream`.
