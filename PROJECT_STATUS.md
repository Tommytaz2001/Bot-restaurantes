# Estado del Proyecto — Bot Restaurantes Urbano

**Última actualización:** 23 de Octubre de 2026  
**Rama activa:** `feature/evolution-api`  
**Último commit:** `25560eb feat: add deploy notifications, resolve WhatsApp LID JIDs, and patch Baileys retry handshake` 

---

## 1. Objetivo y Funcionalidad Principal

El proyecto **Bot Restaurantes Urbano** es un sistema integral de pedidos para restaurantes de comida rápida en Nicaragua (restaurante piloto: *Urbano Fast Food*).
Permite a los clientes interactuar en lenguaje natural por WhatsApp con el bot conversacional "Urbi" impulsado por Google Gemini Flash, consultar platillos del menú, opciones e ingredientes, realizar pedidos en delivery o retiro, adjuntar fotos de comprobantes de transferencia bancaria, y despachar las comandas en tiempo real a una aplicación web/móvil para la cocina (KDS).

---

## 2. Estado Actual del Desarrollo

El sistema superó su fase de MVP inicial y ha incorporado:
1. **Notificación de Redespliegue y Reinicio de Servidor (`src/services/deployNotificationService.js`, `index.js`, `src/services/sseService.js`, `app-chef/src/services/sse.ts`, `app-chef/src/services/webNotificationService.ts`):** Envío automático de notificación por WhatsApp a uno o múltiples teléfonos de administradores/amigos (`NOTIFICAR_DESPLIEGUE_TELEFONO=...`) una vez que el backend y WhatsApp quedan en línea tras un deploy. Paralelamente, emite un evento SSE `server_restarted` que muestra una alerta visual y en el navegador en la app KDS.
2. **Resolución y Mitigación de Identificadores WhatsApp `@lid` y Handshake de Conexión (`src/whatsapp/lidResolver.js`, `src/whatsapp/metaWebhook.js`, `src/whatsapp/metaSender.js`, `evolution-api/Dockerfile`, `docker-compose.yml`):** Corrección de los errores `SessionError: No sessions` y `Error: not-acceptable` generados por Baileys al recibir e intentar responder a JIDs con formato `@lid` (identificadores de 15 dígitos de cuentas privadas). Se retiró la variable estática `CONFIG_SESSION_PHONE_VERSION` permitiendo a Baileys consultar dinámicamente la versión oficial de WhatsApp Web (`fetchLatestWaWebVersion`, v2.3000.1051562754), logrando que el código QR sea estable y enlace sin errores. Se agregaron parches directos a Baileys (`messages-send.js` y `messages-recv.js`) para evitar el TypeError al decodificar JIDs nulos durante el handshake de reintentos de sesión Signal con contactos `@lid`, y se aseguró la persistencia del webhook de eventos `MESSAGES_UPSERT`.
3. **Unificación de Cuentas Bancarias a BAC Córdobas (`src/db/initDb.js`, `scripts/seedCuentasBancarias.js`):** Cuenta única autorizada BAC Córdobas: `371618588`, eliminando bancos anteriores (Banpro, Láfise) y actualizando tanto el seeder como el prompt del agente.
4. **Ciclo de Vida de Pedido en Camino (`src/agent/agentService.js`, `prompts/agent.txt`, `src/orders/orderService.js`):** Cuando un pedido pasa a `en_camino`, las respuestas de cortesía del cliente son atendidas amablemente, pero cualquier modificación o adición posterior se bifurca automáticamente como un nuevo pedido (`guardar_pedido`), protegiendo el pedido despachado contra alteraciones indebidas.
5. **Silenciamiento de Notificación en Estado Entregado (`src/services/notificacionService.js`, `src/routes/orderRoutes.js`):** Al presionar "Marcar Entregado" en la app de cocina, la orden se mueve silenciosamente al historial/completados sin enviar mensaje de WhatsApp al cliente.
6. **Instrucción de Confirmación con "OK" (`prompts/agent.txt`):** Se sustituyó el genérico "¿Confirmamos?" por "¿Está todo correcto? Envía un "ok" para confirmar que todo esté bien. ✅", reduciendo ambigüedades en la respuesta del usuario.
7. **Botón "Copiar para delivery" en KDS (`app-chef/src/components/OrderCard.tsx`, `HistorialPage.tsx`):** Permite al cocinero/administrador copiar con un solo toque el formato completo con datos de cliente, teléfono, dirección, desglose de pedido y total al portapapeles para enviarlo directamente al repartidor.
8. **Pipeline Automatizado de Generación de APK Android:** Scripts `scripts/build-apk.ps1`, `scripts/build-apk.bat` y comando `npm run build:apk`. Binario `UrbanoChef.apk` compilado y actualizado exitosamente con la versión más reciente del KDS.
9. **Google Gemini Flash / Lite** para el procesamiento conversacional y function calling con fallback defensivo a OpenAI.
10. **App de Cocina KDS en React 18 + Vite + TailwindCSS + Capacitor** con SSE y alertas sonoras.

---

## 3. Funcionalidades Implementadas y Verificadas (Hechos Comprobados)

- [x] **Agente Conversacional con Gemini:**
  - Prompt dinámico inyectado con menú, horarios, cuentas bancarias, dirección anterior de clientes frecuentes y modo repartidor (`src/agent/agentService.js`, `src/services/aiService.js`).
  - Reconocimiento de confirmaciones coloquiales y tools: `guardar_pedido`, `solicitar_cambio_pedido`, `cancelar_pedido`, `consultar_estado_pedido`.
  - Fallback defensivo a OpenAI (`src/services/openaiService.js`).
- [x] **Persistencia y Modelado en PostgreSQL:**
  - Tablas relacionales con índices optimizados: `restaurantes`, `usuarios`, `categorias`, `productos`, `pedidos`, `pedido_items`, `notificaciones_queue` (`src/db/schema.sql`).
  - Seeding e inicialización automática al arrancar (`src/db/initDb.js`).
- [x] **Integración de WhatsApp (Evolution API):**
  - Webhook receptor en `POST /whatsapp/webhook` con deduplicación de IDs (`src/whatsapp/metaWebhook.js`).
  - Descarga y almacenamiento local de fotos de comprobante de pago (`/uploads/`) para pedidos en `pendiente_pago`.
  - Interfaz web interactiva para emparejamiento con código QR (`/whatsapp/qr`).
  - Dockerfile con imagen base `evoapicloud/evolution-api:v1.8.7` y parche para contactos con formato `@lid`.
  - Configuración unificada de persistencia por bind mounts mediante `volumen_ruta` y permisos `user: root` en `docker-compose.yml`.
  - Rutas `/whatsapp/qr`, `/whatsapp/get-qr` y `/whatsapp/connection-state` optimizadas con auto-creación de instancias, anti-caché HTTP (evita 304) y botón de reinicio de sesión.
  - Resolución del bug de Evolution API v1.8.7: auto-generación de `token` dedicado e `integration: 'WHATSAPP-BAILEYS'` en `createInstance` para evitar el falso positivo `Token already exists` (`undefined === undefined`). Mutex `setupPromise` para prevenir condiciones de carrera concurrentes desde el frontend.
- [x] **Gestión KDS en Tiempo Real:**
  - Canales SSE (`/pedidos-admin/activos/stream`, `/pedidos-admin/historial/stream`, `/pedidos-admin/:id/stream`).
  - Transiciones de estado de comanda (Confirmar con tiempo estimado ETA, En camino, Entregado, Rechazar comanda, Aprobar/Rechazar cambio).
  - Notificaciones salientes automatizadas hacia WhatsApp al avanzar los estados del pedido (`src/services/notificacionService.js`).
- [x] **Herramientas de Operación y Monitoreo:**
  - Panel web de monitoreo de logs con autenticación protegida en `/logs` (`src/routes/logRoutes.js`).
  - Endpoint de simulación de lote de pedidos para pruebas de carga (`POST /pedidos-admin/simular-pedidos`).
  - Kill-switch administrativo para pausar y reanudar el bot (`POST /whatsapp/pause`, `POST /whatsapp/resume`).

---

## 4. Funcionalidades Incompletas y Deuda Técnica

- [ ] **Persistencia de Sesiones Conversacionales:** El historial de chat reside en la memoria RAM del proceso (`src/agent/sessionStore.js`). Si el servidor se reinicia, el historial de conversación no finalizado se pierde (los pedidos guardados sí persisten en Postgres).
- [ ] **Configuración de Costo de Envío por Zonas:** El costo de delivery está fijado en C$40 en `src/orders/orderService.js`. Falta cálculo dinámico por barrio/zona geográfica.
- [ ] **Módulo de Comprobantes en Frontend KDS:** La vista de cocina tiene pendiente un visor modal dedicado para inspeccionar y validar la foto del comprobante de transferencia bancaria directamente sobre la tarjeta del pedido.
- [ ] **Actualización de `.env.test`:** Contiene referencias obsoletas a Firestore y carece de la cadena de conexión de prueba hacia PostgreSQL.

---

## 5. Errores Conocidos y Bloqueos

1. **Incompatibilidad de comando en Windows (CMD / PowerShell):**
   - El script `"test:unit"` en `package.json` falla en consolas Windows debido al carácter de tubería `|` dentro del argumento regex con comillas simples: `jest --testPathPattern='tests/(sessionStore|...)'`.
   - **Workaround verificado:** Invocar Jest directamente apuntando al archivo: `npx jest tests/<archivo>.test.js`.
2. **Dependencia de PostgreSQL en Suite de Pruebas:**
   - Pruebas como `agentService.test.js`, `menuService.test.js` y `chat.integration.test.js` intentan conectarse a la base de datos real en lugar de mockear el cliente `pg`. Si PostgreSQL no está corriendo o las credenciales no coinciden con `botuser:botpassword`, la prueba arroja `error: la autentificación password falló para el usuario "botuser"`.
3. **Estado del Árbol Git:**
   - Binario `UrbanoChef.apk` y script `scripts/build-apk.ps1` actualizados en el árbol de trabajo tras la última compilación.

---

## 6. Pruebas Ejecutadas y Resultados Reales

| Prueba / Archivo | Tipo | Resultado | Observaciones |
| :--- | :--- | :--- | :--- |
| `tests/orderValidator.test.js` | Unitaria | **PASS** (14/14) | Valida exhaustivamente esquemas, métodos de pago, totales y tipos de entrega. |
| `tests/sessionStore.test.js` | Unitaria | **PASS** (4/4) | Valida gestión de sesiones en memoria y TTL de mensajes. |
| `tests/lidResolver.test.js`  | Unitaria | **PASS** (5/5) | Valida resolución y caché bidireccional de @lid a número telefónico y fallbacks a Evolution API. |
| `tests/deployNotification.test.js` | Unitaria | **PASS** (8/8) | Valida parseo de múltiples teléfonos, espera de estado WhatsApp open y envío de avisos de despliegue. |
| `Compilación Vite app-chef` | Build / Frontend | **PASS** (1947 módulos) | Construcción de producción de la app React/Vite completada con éxito (código de salida 0). |
| `Generación APK Android (npm run build:apk)` | Build / Mobile | **PASS** | Compilación Vite, cap sync y gradle assembleDebug exitoso (14s). Generado UrbanoChef.apk (4.09 MB) sincronizado a uploads/. |
| `Lifecycle Evolution API (Docker)` | Integración | **PASS** | Valida flujo completo: creación con token e integración (HTTP 201), fetchInstances, connect (QR base64), connectionState y webhook set. |
| `tests/agentService.test.js` | Integración | **FAIL** | Falla por falta de conexión activa a Postgres en entorno de test. |
| `tests/menuService.test.js` | Integración | **FAIL** | Falla por falta de conexión activa a Postgres en entorno de test. |
| `tests/chat.integration.test.js`| Integración | **FAIL** | Falla con código 503 por conexión rechazada a Postgres. |

---

## 7. Próximo Paso Recomendado

1. **Ajustar la configuración de pruebas (`.env.test` y mocks en Jest):**
   - Incorporar configuración de PostgreSQL para tests o aislar las dependencias de base de datos en `menuService` y `agentService` mediante mocks en Jest para que las pruebas unitarias pasen sin depender de un contenedor Docker externo.
   - Corregir el script `"test:unit"` en `package.json` para que sea multiplataforma (evitando el uso de comillas simples y pipes no escapados para Windows).

---

## 8. Archivos Relevantes para Continuar el Desarrollo

- `src/db/connection.js`: Pool de base de datos PostgreSQL.
- `src/agent/agentService.js`: Lógica conversacional principal y function calling con Gemini.
- `src/whatsapp/metaWebhook.js`: Procesamiento de eventos entrantes de WhatsApp y comprobantes.
- `src/services/sseService.js`: Distribución de eventos en tiempo real hacia el panel KDS.
- `app-chef/src/pages/Dashboard.tsx`: Tablero de comandas de cocina en React.
