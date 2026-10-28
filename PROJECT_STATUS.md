# Estado del Proyecto — Bot Restaurantes Urbano

**Última actualización:** 27 de Octubre de 2026  
**Rama activa:** `feature/evolution-api`  
**Último commit:** `033ee06 fix: prioritize combo keyword and explicit price for burrito combo orders` 

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
11. **Saneamiento y Deduplicación Defensiva de Teléfono para Delivery (`src/utils/phoneUtils.js`, `tests/phoneUtils.test.js`, `src/agent/agentService.js`, `src/orders/orderService.js`, `src/orders/orderValidator.js`, `src/services/aiService.js`, `prompts/agent.txt`, `app-chef/src/utils/phoneUtils.ts`, `app-chef/src/components/OrderCard.tsx`, `HistorialPage.tsx`, `app/pedido/[id].tsx`):** Detección, saneamiento y deduplicación en múltiples capas para evitar números telefónicos duplicados o concatenados (ej: `58544518558544518` o `5854451858544518`). Incluye reglas en prompt e IA, normalización en backend y app KDS, y validación estricta de longitud en órdenes delivery.
12. **Configuración Oficial de Ubicación y Dirección en Jinotega (`prompts/agent.txt`, `src/agent/agentService.js`, `src/services/menuService.js`, `src/db/schema.sql`, `src/db/initDb.js`):** Corrección del problema donde el bot inventaba direcciones o respondía Managua. Se configuró la dirección oficial y exclusiva en Jinotega: `De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento`. Se prohibió expresamente mencionar Managua, inventar puntos de referencia y se eliminó la respuesta incorrecta 'no se requiere dirección de entrega' para retiros en local, asegurando que al preguntar por la ubicación o elegir retiro el cliente reciba la dirección exacta de la sucursal.
13. **Regla de Cantidad por Defecto (=1) y Retención de Selección (`prompts/agent.txt`, `src/services/aiService.js`):** Corrección del problema donde el bot asumía '2 hamburguesas' cuando el cliente pedía 'una hamburguesa sencilla' y luego elegía 'clásica'. Se estableció la regla estricta de que la cantidad por defecto es SIEMPRE 1 a menos que se indique explícitamente un número mayor, se retiene la cantidad 'una/un' del mensaje previo y se diversificaron los ejemplos del prompt para erradicar el sesgo hacia el número 2.
14. **Actualización de Tiempo Estimado (ETA) al Aprobar Cambios en Pedido (`src/services/pedidosAdminService.js`, `src/routes/pedidosAdminRoutes.js`, `src/services/notificacionService.js`, `src/orders/orderService.js`, `app-chef/src/components/ChangeApprovalModal.tsx`, `app-chef/src/pages/PedidosPage.tsx`, `app-chef/src/App.tsx`, `app-chef/src/services/api.ts`, `app-chef/src/services/pedidosService.ts`, `app-chef/app/pedido/[id].tsx`, `tests/changeOrderEta.test.js`):** Al solicitar el cliente una modificación o anexo de productos sobre un pedido ya confirmado con tiempo de espera, el chef/administrador puede elegir un nuevo tiempo de espera (ETA) en el modal de aprobación de cambios de la app web y app móvil. El backend actualiza `tiempo_estimado_min`, restablece las banderas de notificación para admitir múltiples cambios sucesivos y despacha automáticamente por WhatsApp el nuevo tiempo de entrega al cliente.
15. **Modo Test 24/7 / Ignorar Restricciones de Horario (`src/services/botStateService.js`, `src/whatsapp/messageHandler.js`, `src/routes/whatsappRoutes.js`, `src/routes/restauranteRoutes.js`):** Interruptor en backend para ignorar el horario comercial durante pruebas puntuales de desarrollo (`/whatsapp/ignorar-horario`). Se mantiene desactivado por defecto (`_ignorarHorario = false`) para garantizar cumplimiento estricto del horario de atención en producción.
16. **Notificaciones Push para Nuevos Pedidos y Sincronización Expo (`src/services/pushService.js`, `src/services/restauranteService.js`, `src/orders/orderService.js`, `src/db/schema.sql`, `src/db/initDb.js`, `app-chef/src/services/pushNotificationService.ts`, `app-chef/src/services/webNotificationService.ts`, `app-chef/src/services/sse.ts`, `tests/pushNotification.test.js`):** Implementación integral de notificaciones push en segundo plano para celulares y tablets (Expo Push API) y en navegador/PWA (Web Notifications API con `requireInteraction: true`). Registro persistente de tokens en PostgreSQL (`restaurantes.push_tokens`), purga automática de tokens obsoletos (`DeviceNotRegistered`), y disparo reactivo al crearse cada pedido en `orderService.js`.
17. **Alerta Sonora de Cocina de Alto Volumen (`app-chef/src/services/audio.ts`, `app-chef/src/App.tsx`):** Rediseño acústico de la campana de pedidos utilizando Web Audio API con volumen al 95% (master gain 0.95), osciladores combinados (onda senoidal + armónicos metálicos en onda triangular a doble frecuencia), ráfaga doble de timbres (`Sol5` -> `Do6` -> `Mi6` resonante repetido a los 0.7s) y vibración háptica reforzada (`navigator.vibrate([400, 150, 400, 150, 600])`). Se retiraron los botones de prueba de la barra de navegación y horarios para dejar la interfaz lista para producción.
18. **Resolución de Pérdida de Pedidos al Confirmar y Trazabilidad de Logs (`src/orders/orderService.js`, `src/agent/agentService.js`, `src/services/aiService.js`, `prompts/agent.txt`, `src/whatsapp/metaWebhook.js`, `tests/orderNormalization.test.js`, `tests/agentConfirmation.test.js`):**
    - **Ventana de Idempotencia de 60s en `findExistingOrder`:** Se restringió la deduplicación a `created_at >= NOW() - INTERVAL '60 seconds'`, resolviendo el bug crítico donde pedidos pendientes anteriores del cliente bloqueaban indefinidamente la inserción de nuevos pedidos en PostgreSQL.
    - **Interceptor Activo de Tool Calls Perdidos:** Si el cliente confirma con "ok", "sí", "dale", etc. tras ver el resumen pero el LLM responde solo con texto plano, el backend intercepta la respuesta, fuerza la invocación de `guardar_pedido` y registra la orden en cocina sin perderla.
    - **Normalización Defensiva en `saveOrder`:** Saneamiento de `tipo_entrega` (ej: "domicilio" → "delivery"), `metodo_pago` (ej: "contra entrega" → "efectivo"), dirección por defecto para retiro ("Retiro en local"), fallback de teléfono usando sesión/JID y cálculo de total previo a validación.
    - **Protección contra Confirmaciones Falsas:** Si `saveOrder` falla, se registra el error con stack trace en logs y se previene el despacho de mensajes engañosos de éxito ("¡Pedido recibido! Tu orden fue enviada al chef") al usuario.
    - **Confirmación con Comprobante de Pago:** Si el cliente envía la imagen del comprobante de transferencia al ver el resumen, el webhook procesa la confirmación, guarda la orden en `pendiente_pago` y asocia el comprobante de inmediato sin silenciar el mensaje.
    - **Trazabilidad Completa en Logs:** Emisión de logs detallados (`[PEDIDO]`, `[orderService]`, `[agentService]`, `[AI Engine]`) en cada etapa del ciclo de guardado, visibles en `/logs`.
19. **Comprensión Inteligente de Combos y Desambiguación "Con Papas" (`prompts/agent.txt`, `src/db/initDb.js`, `tests/agentConfirmation.test.js`):**
    - **Regla Caso E en System Prompt:** Cuando un cliente pide un platillo que tiene versión Combo o que no incluye papas por defecto (como los Burritos) diciendo "con papas" (ej: *"Un burrito mixto con papas"*), se prohíbe terminantemente ignorar las papas y tomar solo el producto base.
    - **Desambiguación Proactiva:** El bot pregunta de forma natural si desea el **Combo** (que incluye burrito + papas fritas y gaseosa 355ml) o el **Burrito individual + porción de Papas extras**, y si el cliente pide expresamente "combo" o "con papas y gaseosa", mapea directo al Combo.
    - **Sincronización de Catálogo Burritos:** Se incorporaron las variantes de Burrito Mixto, Burrito Mixto Combo, Burrito de Atún y Burrito de Birria al menú inicial de `src/db/initDb.js`.
20. **Protocolo Obligatorio "¿Quizás quisiste decir...?" y Mapeo Completo del Menú (`prompts/agent.txt`, `src/services/menuService.js`, `tests/agentConfirmation.test.js`):**
    - **Protocolo de Desambiguación Guiada:** Si el cliente utiliza términos inadecuados, apodos, modismos locales, pide por ingredientes sin nombrar el plato ('la de dos carnes', 'sin monte', 'con tocino'), menciona nombres de otras cadenas ('Big Mac', 'Whopper', 'salchipapas', 'wrap') o números de combos inexistentes, el bot tiene terminantemente prohibido adivinar en silencio o rechazar diciendo 'eso no existe'.
    - **Fórmula Obligatoria con Opciones:** El bot responde con *"¿Quizás quisiste decir alguna de estas opciones?"* o *"¿Quizás quisiste decir...?"* presentando las 2 o 3 opciones más probables con sus nombres oficiales, viñetas y precios en C$, desglosando la diferencia clave.
    - **Diccionario de Sinónimos y Apodos en Menú (`src/services/menuService.js`):** Inyección de metadatos `[Sinónimos/Apodos: ...]` directamente en el formateo del menú para el LLM (`formatMenuForPrompt`), cubriendo hamburguesas, tacos, burritos, nachos, quesadillas, papas fritas, bebidas y extras.
21. **Persistencia y Memoria de Cantidad a Través del Chat (`prompts/agent.txt`, `src/services/aiService.js`, `src/db/initDb.js`, `src/services/menuService.js`, `tests/agentConfirmation.test.js`):**
    - **Retención de Cantidad Inicial en Flujo por Categoría:** Corrección del error donde el bot rebajaba a 1 cuando el cliente pedía *"2 hot dog"* y luego seleccionaba el precio *"210"*. Se estableció la regla de retención estricta donde cualquier cantidad especificada al inicio del flujo queda fijada para el producto seleccionado (ej: 2x Hot Dog Combo = C$420), evitando pérdidas de venta.
    - **Categoría Hot Dogs Integrada:** Incorporación oficial de la categoría Hot Dogs (`Hot Dog Nivel 100` C$150, `Hot Dog Nivel 100 en Combo` C$210, `Hot Dog Birridog` C$190) y sus sinónimos en base de datos, servicio de menú y prompt del agente.
22. **Prioridad Absoluta de Precio y Sintaxis "Combo de [Platillo]" (`prompts/agent.txt`, `src/services/menuService.js`, `src/db/initDb.js`, `tests/agentConfirmation.test.js`):**
    - **Prioridad de la Palabra "Combo" y Precios Explícitos:** Corrección del error donde el cliente pedía *"un combo de burrito de pollo (del que vale 220)"* y el bot lo registraba erróneamente como Burrito Pollo sencillo de C$160. Se estableció la regla obligatoria donde la palabra "combo" (al inicio o al final) y el precio explícito dado por el cliente definen inequívocamente la variante en Combo (`Burrito Pollo en Combo` C$220), calculando subtotal y totales exactos.
    - **Normalización y Sinónimos Enriquecidos:** Se sincronizaron en `initDb.js` y `menuService.js` los nombres `Burrito Pollo en Combo`, `Burrito Pastor-cerdo en Combo`, `Burrito Cerdo en Combo`, `Burrito Mixto en Combo`, asociándolos a búsquedas como *"del que vale 220"*, *"el de 220"*, *"combo de burrito de pollo"*.
23. **Lista Negra (Blacklist / Repartidores) y Silenciamiento Automático (`src/services/blacklistService.js`, `src/routes/blacklistRoutes.js`, `src/db/schema.sql`, `src/db/initDb.js`, `src/whatsapp/metaWebhook.js`, `src/whatsapp/messageHandler.js`, `app-chef/src/pages/BlacklistPage.tsx`, `app-chef/src/components/Navbar.tsx`, `app-chef/src/App.tsx`, `app-chef/src/services/api.ts`, `tests/blacklistService.test.js`):**
    - **Pestaña Blacklist en KDS Web:** Nueva vista dedicada para registrar números telefónicos de repartidores o contactos bloqueados, con soporte de códigos internacionales (+505, +593, etc.) o números locales (8 dígitos), nombre identificador y etiquetas rápidas ('Repartidor', 'Mandados', 'Delivery', 'Personal', 'Bloqueado').
    - **Caché en Memoria y Normalización de Dígitos:** El servicio `blacklistService.js` mantiene una caché de números con normalización bidireccional de dígitos (`cleanDigits`), permitiendo emparejar números con o sin código de país en O(1)/O(N) sin degradar la latencia.
    - **Silenciamiento Total Inmediato:** Al recibir un mensaje o imagen en `metaWebhook.js` o `messageHandler.js`, si el remitente está en la lista negra, el bot ignora el mensaje al 100%: no genera sesión, no envía a IA/Gemini, no envía typing ni despacha ninguna respuesta por WhatsApp.
    - **Depuración de Heurística Antigua:** Se eliminaron las funciones anteriores de detección por palabras clave (`detectarRepartidor`, `REPARTIDOR_KEYWORDS`, `_forwardedHistory`, `contextoRepartidor` en prompt y código) reemplazándolas por este sistema definitivo.
24. **Eliminación Total de Paginación en la App KDS (`app-chef/src/pages/PedidosPage.tsx`, `app-chef/src/pages/HistorialPage.tsx`, `src/services/pedidosAdminService.js`):**
    - Se retiró la paginación (`currentPage`, `ITEMS_PER_PAGE`, botones anterior/siguiente) tanto en la vista de Pedidos Activos como en el Historial de Pedidos, renderizando todas las comandas en una sola página con desplazamiento natural y fluido.
    - Se incrementó el límite de consulta en backend (`getHistorialPedidos`) de `LIMIT 50` a `LIMIT 1000` para garantizar que el filtro por fecha (hoy, ayer, 7 días, todos) entregue el registro completo sin cortes.
25. **Silenciamiento Garantizado al Marcar Pedido "Entregado" (`src/services/notificacionService.js`, `src/routes/orderRoutes.js`, `app-chef/src/App.tsx`):**
    - Se aseguró y reforzó el guard en `notificacionService.js` para que al pasar un pedido al estado `entregado`, nunca se despache mensaje alguno por WhatsApp al cliente.
    - Se agregó una actualización optimista inmediata en `app-chef/src/App.tsx` para remover el pedido de la pantalla de activos instantáneamente al pulsar "Marcar Entregado", logrando una transición inmediata hacia el historial.


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
| `tests/orderNormalization.test.js` | Unitaria | **PASS** (4/4) | Valida normalización defensiva de tipo de entrega ("domicilio" -> "delivery"), método de pago, dirección por defecto y recálculo de totales. |
| `tests/agentConfirmation.test.js` | Unitaria | **PASS** (7/7) | Valida invocación exitosa de guardar_pedido, interceptor de respuestas de texto en confirmación (missed tool call), bloqueo de confirmaciones falsas ante fallo en BD, desambiguación de combos/papas (Caso E), protocolo "¿Quizás quisiste decir...?", persistencia de cantidad entre turnos (2 hot dog -> 210 = x2) y prioridad de precio/combo (combo burrito pollo 220). |
| `tests/pushNotification.test.js` | Unitaria | **PASS** (3/3) | Valida formateo de push, despacho a Expo API, saneamiento de tokens obsoletos (DeviceNotRegistered) y tolerancia a fallos. |
| `tests/changeOrderEta.test.js` | Unitaria | **PASS** (2/2) | Valida envío de nuevo tiempo estimado al aprobar cambio y formato de notificación sin ETA. |
| `tests/phoneUtils.test.js` | Unitaria | **PASS** (12/12) | Valida extracción de dígitos, desduplicación de mitades y asimétrica (58544518558544518), código 505 y fallbacks. |
| `tests/orderValidator.test.js` | Unitaria | **PASS** (16/16) | Valida esquemas, métodos de pago, totales, tipos de entrega y longitud estricta de teléfono para delivery. |
| `tests/sessionStore.test.js` | Unitaria | **PASS** (4/4) | Valida gestión de sesiones en memoria y TTL de mensajes. |
| `tests/lidResolver.test.js`  | Unitaria | **PASS** (5/5) | Valida resolución y caché bidireccional de @lid a número telefónico y fallbacks a Evolution API. |
| `tests/deployNotification.test.js` | Unitaria | **PASS** (8/8) | Valida parseo de múltiples teléfonos, espera de estado WhatsApp open y envío de avisos de despliegue. |
| `Compilación Vite app-chef` | Build / Frontend | **PASS** (1948 módulos) | Construcción de producción de la app React/Vite completada con éxito (código de salida 0). |
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
