# Roadmap — Bot Restaurantes Urbano

Mejoras, features y nuevas implementaciones posibles ordenadas por impacto y esfuerzo.

---

## 1. Crítico / Alta prioridad

### 1.1 Verificación de comprobante de pago
El campo `comprobante_url` ya existe en el esquema del pedido pero no hay lógica.

**Lo que falta:**
- Cuando el cliente envía una imagen por WhatsApp → el bot la detecta y la sube a Firebase Storage
- El agente llama una nueva herramienta `registrar_comprobante(pedidoId, url)`
- El pedido pasa de `pendiente_pago` → `pendiente` automáticamente al recibir comprobante
- La app muestra un botón "Ver comprobante" que abre la imagen

**Archivos a tocar:** `baileys.js`, `agentService.js`, `openaiService.js`, `orderService.js`, `[id].tsx`

---

### 1.2 Persistencia de sesiones en Firestore
Actualmente el historial de conversación vive en memoria — si el servidor se reinicia, el cliente pierde el contexto.

**Lo que falta:**
- Guardar/restaurar `sessionStore` en Firestore por `sessionId`
- TTL automático (limpiar sesiones inactivas > 24 h)
- Al reconectar, el bot recuerda dónde quedó la conversación

**Archivos a tocar:** `sessionStore.js`, `agentService.js`

---

### 1.3 Horario de atención activado
El código existe pero está comentado. Necesita configurarse por restaurante, no hardcodeado.

**Lo que falta:**
- Mover horario al documento Firestore del restaurante (`horario: { apertura: "15:00", cierre: "21:30" }`)
- Mensaje de cierre diferenciado (fines de semana vs. días hábiles)
- Opción de pre-pedido: "Abrimos a las 3pm, ¿quieres que te recuerde?"

**Archivos a tocar:** `messageHandler.js`, `menuService.js`, Firestore schema

---

### 1.4 Panel de administración del menú
Actualmente el menú solo se puede editar directamente en Firestore. No hay UI.

**Lo que falta:**
- Nueva sección en app-chef: "Menú"
- Agregar / editar / desactivar productos con precio
- Marcar producto como agotado (el bot lo omite automáticamente)
- Reordenar categorías

**Archivos a tocar:** `app-chef/` (nueva pantalla), `menuService.js`

---

## 2. Mejoras operacionales

### 2.1 Notificaciones push al chef (FCM)
Hoy la app solo recibe pedidos si está abierta. Si está cerrada, no hay alerta.

**Lo que falta:**
- Integrar Firebase Cloud Messaging en app-chef
- Enviar push notification cuando llega un pedido nuevo (`estado: 'pendiente'`)
- Sonido/vibración en segundo plano

**Archivos a tocar:** `app-chef/app.json`, nuevo servicio en backend para FCM

---

### 2.2 Tiempo estimado de entrega
El cliente no sabe cuánto esperar.

**Lo que falta:**
- El chef configura tiempo estimado al confirmar (15, 30, 45, 60 min)
- El bot notifica automáticamente: "Tu pedido llegará en aprox. 30 min 🛵"
- Alerta automática al chef si el pedido lleva > X minutos en `confirmado`

**Archivos a tocar:** `orderRoutes.js`, `notificacionService.js`, `[id].tsx`, `agentService.js`

---

### 2.3 Costo de envío dinámico
El costo de envío está hardcodeado en C$40.

**Lo que falta:**
- Configurar costo por zona en Firestore
- El agente pregunta barrio/zona y calcula el costo
- Rango de zonas con precio diferente (zona 1: C$30, zona 2: C$50, etc.)

**Archivos a tocar:** `orderService.js`, `agentService.js`, sistema prompt

---

### 2.4 Manejo de pedidos fuera de horario
Si alguien escribe a las 2am el bot no responde nada útil.

**Lo que falta:**
- Respuesta automática fuera de horario con el horario de atención
- Opción de guardar el pedido como "programado" para cuando abra
- Contador de mensajes fuera de horario para estadísticas

---

### 2.5 Reintentos de notificación WhatsApp
Si WhatsApp no está conectado cuando cambia el estado, la notificación se pierde silenciosamente.

**Lo que falta:**
- Cola de notificaciones pendientes persistida en Firestore
- Reintento automático cada 30 seg hasta que WhatsApp se reconecte
- Log de notificaciones fallidas en Kibana

**Archivos a tocar:** `notificacionService.js`

---

## 3. Analytics y reportes

### 3.1 Dashboard de ventas en Kibana
La infraestructura de Elasticsearch ya está levantada pero sin datos de negocio.

**Lo que falta:**
- Indexar cada pedido en ES al guardarse: `{ restauranteId, total, productos, estado, createdAt, tipo_entrega }`
- Dashboards en Kibana: ventas por día, producto más pedido, ticket promedio, hora pico
- Alerta si no llegan pedidos en X horas (puede indicar bot caído)

**Archivos a tocar:** `orderService.js`, `logger.js`, Kibana config

---

### 3.2 Reporte diario automático al chef
**Lo que falta:**
- Cron que corre a las 10pm: genera resumen del día
- Envía mensaje WhatsApp al número del dueño: "Hoy: 12 pedidos · C$3,420 · Producto más vendido: Smash Doble"
- Histórico de reportes en Firestore

---

### 3.3 Exportar historial a CSV/PDF
**Lo que falta:**
- Botón en app-chef historial: "Exportar"
- Selección de rango de fechas
- Genera CSV con columnas: fecha, cliente, productos, total, método de pago, estado

---

## 4. Experiencia del cliente (WhatsApp)

### 4.1 Repetir último pedido
**Lo que falta:**
- El agente detecta frases como "lo mismo de siempre" o "el mismo pedido"
- Busca el último pedido entregado de ese número en Firestore
- Ofrece confirmación rápida: "¿Repetimos tu pedido anterior? [lista]"

**Archivos a tocar:** `agentService.js`, nueva herramienta `consultar_ultimo_pedido`

---

### 4.2 Seguimiento de pedido en tiempo real
**Lo que falta:**
- Cuando el cliente escribe "¿dónde está mi pedido?" → el bot responde con el estado actual
- Notificación proactiva: "Tu pedido lleva 20 min en camino 🛵"
- Nueva herramienta `consultar_estado_detallado` con timestamp de cada cambio

---

### 4.3 Personalización de opciones de producto
El sistema prompt menciona "opciones" pero no hay flujo guiado.

**Lo que falta:**
- Cuando el cliente pide una hamburguesa → el bot lista las opciones disponibles (sencilla, doble, con queso, sin queso)
- Validación de opciones contra Firestore antes de guardar
- Display en app-chef mostrando la opción elegida

---

### 4.4 Soporte para grupos de WhatsApp
Actualmente se ignoran los grupos (`@g.us`).

**Lo que falta:**
- Modo "grupo de oficina": acepta pedidos de múltiples personas en un mismo grupo
- Consolida en un solo pedido con múltiples clientes
- Divide la cuenta automáticamente

---

## 5. Seguridad y autenticación

### 5.1 Autenticación en endpoints del backend
`POST /chat` es público actualmente.

**Lo que falta:**
- API key o JWT en todos los endpoints que no sean `/whatsapp/qr`
- Middleware de autenticación reutilizable
- Rate limiting por IP (no solo por número de teléfono)

---

### 5.2 Roles en app-chef
Hoy cualquier usuario autenticado puede hacer todo.

**Lo que falta:**
- Roles: `admin`, `chef`, `repartidor`
- `repartidor` solo ve pedidos en `en_camino` y puede marcar `entregado`
- `admin` tiene acceso al panel de menú y reportes
- Claims personalizados en Firebase Auth

---

### 5.3 Encriptación de datos sensibles
Nombre, dirección y teléfono del cliente están en texto plano en Firestore.

**Lo que falta:**
- Encriptar campos sensibles antes de guardar
- Clave de encriptación manejada por KMS o Secret Manager
- Opción de anonimizar pedidos viejos (> 90 días)

---

## 6. Infraestructura y escalabilidad

### 6.1 Soporte multi-restaurante completo
La arquitectura lo soporta pero solo "urbano" está configurado.

**Lo que falta:**
- Panel de onboarding: crear restaurante, subir menú, configurar horario
- Instancia de bot por restaurante (o multiplexado en un solo proceso)
- Billing por restaurante si se monetiza

---

### 6.2 Migración a Meta WhatsApp Business API
Baileys es para prototipo — riesgo de ban en producción a escala.

**Lo que falta:**
- Reemplazar `baileys.js` por cliente oficial de Meta Cloud API
- Manejo de webhooks HTTPS firmados con HMAC
- Templates de mensajes aprobados por Meta para notificaciones
- Número de teléfono dedicado registrado en Meta Business

---

### 6.3 Sesiones distribuidas con Redis
Si el backend escala a múltiples instancias, las sesiones en memoria no funcionan.

**Lo que falta:**
- Reemplazar `sessionStore.js` con Redis
- TTL de sesiones configurable
- Pub/Sub para invalidar caches entre instancias

---

### 6.4 Fallback ante caída de OpenAI
Si OpenAI está caído, el bot no responde nada.

**Lo que falta:**
- Respuesta fallback: "Estamos teniendo problemas técnicos, escríbenos en 5 min 🙏"
- Circuit breaker con exponential backoff
- Métricas de latencia de OpenAI en Kibana

---

## 7. App-chef mejoras UX

### 7.1 Historial de conversación del pedido
El chef no puede ver qué dijo el cliente al hacer el pedido.

**Lo que falta:**
- Guardar en Firestore los últimos N mensajes del chat al confirmar el pedido
- Sección "Chat" en la pantalla de detalle del pedido

---

### 7.2 Filtros avanzados en historial
Actualmente solo filtra por fecha.

**Lo que falta:**
- Filtrar por método de pago (transferencia vs. efectivo)
- Filtrar por tipo de entrega (delivery vs. retiro)
- Buscar por nombre de cliente o producto
- Total del período filtrado visible en el header

---

### 7.3 Modo oscuro / claro
La app ya usa tema oscuro fijo.

**Lo que falta:**
- Toggle en configuración para cambiar entre oscuro y claro
- Respetar configuración del sistema operativo automáticamente

---

### 7.4 Widget en pantalla de inicio (Android)
**Lo que falta:**
- Widget que muestra número de pedidos activos
- Tap en widget abre directamente la app en el primer pedido pendiente

---

## 8. Integraciones externas

### 8.1 Pasarela de pago (transferencias automáticas)
**Lo que falta:**
- Integración con banco local o plataforma de pago (ej. Mercado Pago, Stripe)
- Verificación automática del comprobante via API del banco
- Confirmación instantánea sin intervención del chef

---

### 8.2 Google Maps para validar direcciones
**Lo que falta:**
- Cuando el cliente da su dirección → validar que existe en Maps
- Calcular distancia para costo de envío dinámico
- Enviar link de Google Maps al repartidor con la ruta

---

### 8.3 Integración con impresora térmica
**Lo que falta:**
- Al confirmar un pedido → imprimir ticket automáticamente
- Protocolo ESC/POS via servidor local en la cocina
- Formato: número de orden, productos, dirección, método de pago

---

## Resumen por esfuerzo

| Feature | Impacto | Esfuerzo |
|---|---|---|
| Verificación de comprobante | Alto | Medio |
| Persistencia de sesiones | Alto | Bajo |
| Notificaciones push FCM | Alto | Medio |
| Horario dinámico desde Firestore | Medio | Bajo |
| Dashboard Kibana con pedidos | Alto | Medio |
| Repetir último pedido | Alto | Bajo |
| Tiempo estimado de entrega | Medio | Bajo |
| Exportar historial CSV | Medio | Bajo |
| Autenticación endpoints | Alto | Bajo |
| Roles en app-chef | Medio | Medio |
| Panel de menú en app | Alto | Alto |
| Migración a Meta API | Alto | Alto |
| Multi-restaurante completo | Alto | Alto |
| Pasarela de pago | Alto | Alto |
| Google Maps integración | Medio | Medio |
