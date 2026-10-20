# Estado del Proyecto — Bot Restaurantes Urbano

**Última actualización:** 20 de Octubre de 2026  
**Rama activa:** `feature/evolution-api`  
**Último commit:** `92e67bc feat: configure Docker bind mount volumes for all services`

---

## 1. Objetivo y Funcionalidad Principal

El proyecto **Bot Restaurantes Urbano** es un sistema integral de pedidos para restaurantes de comida rápida en Nicaragua (restaurante piloto: *Urbano Fast Food*).
Permite a los clientes interactuar en lenguaje natural por WhatsApp con el bot conversacional "Urbi" impulsado por Google Gemini Flash, consultar platillos del menú, opciones e ingredientes, realizar pedidos en delivery o retiro, adjuntar fotos de comprobantes de transferencia bancaria, y despachar las comandas en tiempo real a una aplicación web/móvil para la cocina (KDS).

---

## 2. Estado Actual del Desarrollo

El sistema superó su fase de MVP inicial (que utilizaba Firestore y OpenAI) y completó la migración mayor a:
1. **Google Gemini (`gemini-2.5-flash`)** para el procesamiento conversacional y function calling.
2. **PostgreSQL 16** como base de datos relacional transaccional (reemplazando Firestore para menú, pedidos, configuración y usuarios).
3. **Evolution API v1.8.7 en Docker** como gateway desacoplado para WhatsApp con soporte para identificadores `@lid`.
4. **App de Cocina KDS en React 18 + Vite + TailwindCSS + Capacitor** con Server-Sent Events (SSE) y alertas sonoras de pedidos en tiempo real.
5. Se generó el ejecutable APK nativo de Android en la raíz (`UrbanoChef.apk`).

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
3. **Estado del Árbol Git (Cambios de compilación no commiteados):**
   - Hay cambios sin commitear en `app-chef/package.json`, `app-chef/package-lock.json` y `app-chef/capacitor.config.json`, además del binario untracked `UrbanoChef.apk`.

---

## 6. Pruebas Ejecutadas y Resultados Reales

| Prueba / Archivo | Tipo | Resultado | Observaciones |
| :--- | :--- | :--- | :--- |
| `tests/orderValidator.test.js` | Unitaria | **PASS** (14/14) | Valida exhaustivamente esquemas, métodos de pago, totales y tipos de entrega. |
| `tests/sessionStore.test.js` | Unitaria | **PASS** | Valida gestión de sesiones en memoria y TTL de mensajes. |
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
