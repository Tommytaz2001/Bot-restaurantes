# Estado del Proyecto — Bot Restaurantes Urbano

**Última actualización:** 5 de Noviembre de 2026  
**Rama activa:** `feature/evolution-api`  
**Último commit:** `11328c4 fix(webhook): configure global webhook in compose, live code volumes, and robust v2 fallback` 

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
26. **Modo Dev Automático 24/7 al Desactivar Todos los Días del Horario (`src/whatsapp/messageHandler.js`, `app-chef/src/pages/HorariosPage.tsx`, `tests/verificarHorario.test.js`):**
    - Al desactivar todos los días de la semana en la app de cocina (`abre: false` para lunes a domingo), el verificador de horarios activa automáticamente el **Modo Dev**, haciendo que el bot atienda siempre (24/7 sin restricciones de horario) para pruebas continuas de desarrollo.
    - Al habilitar al menos un día (`abre: true`), el bot reactiva su control de horario habitual de forma instantánea.
    - Se incorporó en `HorariosPage.tsx` un banner visual con la etiqueta "BOT SIEMPRE ACTIVO" y botones de acceso rápido para conmutar entre Modo Dev y atención normal en un clic.
27. **Soporte Completo de LIDs WhatsApp (`@lid`) en Lista Negra y Aislamiento Estricto de Prefijos (`src/whatsapp/lidResolver.js`, `src/services/blacklistService.js`, `src/whatsapp/metaWebhook.js`, `src/whatsapp/messageHandler.js`, `tests/blacklistService.test.js`, `tests/lidResolver.test.js`):**
    - **Causa Raíz Resuelta:**
      1. Contactos con formato privado `@lid` (15 dígitos) no resolvían su número real porque no se leía `key.senderPn` del payload de Evolution API. Al leer `key.senderPn`, el número real de WhatsApp (`50558544518`) queda inmediatamente disponible.
      2. Se eliminó la asociación de LIDs a teléfonos de la tabla `pedidos`, ya que un cliente puede escribir un número de teléfono de otra persona para delivery en el chat, lo que provocaba falsos positivos bloqueando números no registrados (como `50577449468`).
      3. Se implementó la función estricta `phonesMatch` en `blacklistService.js`: aísla los códigos de país internacionales (+505 Nicaragua vs +593 Ecuador) evitando cruces indebidos, y permitiendo que solo el número exactamente bloqueado sea ignorado, mientras los demás números (legítimos o de otros países) son atendidos normalmente.
28. **Preservación Estricta de JID de Transporte (`@lid` vs `@s.whatsapp.net`) y Mitigación de Desincronización E2EE (`src/whatsapp/metaWebhook.js`, `src/whatsapp/metaSender.js`, `src/agent/agentService.js`, `src/agent/sessionStore.js`, `tests/metaSender.test.js`):**
    - **Causa Raíz Resuelta:** Al resolver el número de teléfono real tras los primeros mensajes de un contacto con `@lid`, el webhook y `metaSender` mutaban forzosamente `replyTo` y `destination` a `${cached}@s.whatsapp.net`. Como el cliente abrió la conversación bajo el contexto `@lid`, su dispositivo carecía de las claves de sesión activas para el JID de número telefónico en ese hilo, provocando que los mensajes salientes quedaran bloqueados con *"Esperando el mensaje. Esto puede tomar tiempo"*.
    - **Solución Aplicada:**
      1. Desacoplamiento total: el número resuelto (`telefono`) se emplea únicamente para persistencia en base de datos (`pedidos.telefono`), comandas del chef/repartidor (KDS) y Lista Negra.
      2. El destino de transporte (`replyTo` y `remoteJid`) es estrictamente inmutable y conserva el JID original entrante (`key.remoteJid`), enviando respuestas al mismo hilo y sesión criptográfica que abrió el cliente.
      3. Se eliminó la mutación en `src/whatsapp/metaSender.js` que convertía `@lid` a `@s.whatsapp.net`.
      4. Soporte de alias en `src/agent/sessionStore.js` (`getSession` y `getLastOrderId` con fallback a `remoteJid`) garantizando continuidad absoluta del historial conversacional.
      5. Validación con suite de pruebas unitarias en `tests/metaSender.test.js` (3/3 PASS).
29. **Respuesta Directa de Tiempo de Espera y Eliminación de Dirección Redundante en Retiro (`prompts/agent.txt`, `src/agent/agentService.js`, `tests/agentConfirmation.test.js`):**
    - **Consulta de tiempo de espera:** Cuando un cliente pregunta antes o durante la toma del pedido cuánto tardará ("¿en cuánto tiempo está?", "¿cuánto se tardan?"), el bot responde de forma concisa: *"Una vez terminemos de completar tus datos y el pedido se te dará el tiempo aproximado."* evitando respuestas largas improvisadas o promesas de tiempo no autorizadas por cocina.
    - **Corte de dirección en confirmación de retiro:** Se eliminó la repetición de la dirección física en el mensaje final de confirmación de retiro (`¡Pedido recibido! Tu orden fue enviada al chef. Te avisaremos por aquí cuando esté listo para que pases a retirarlo a nuestro local.`), dado que la dirección completa ya fue presentada en el resumen previo del pedido.
30. **Garantía de Notificación de Cocina (ETA) y Prevención de Pérdida de Datos del Cliente ("Cliente Urbano" y Direcciones por Referencia) (`src/whatsapp/metaSender.js`, `src/services/notificacionService.js`, `src/routes/orderRoutes.js`, `src/whatsapp/messageHandler.js`, `src/agent/agentService.js`, `prompts/agent.txt`, `tests/metaSender.test.js`, `tests/agentConfirmation.test.js`, `tests/notificacionService.test.js`):**
    - **Causa Raíz de Notificación de Cocina No Enviada:** Al confirmar el chef el pedido con tiempo de espera (ETA) desde la app KDS, si el pedido carecía de JID completo o recurría al teléfono local (8 dígitos de Nicaragua, ej: `86224206`), Evolution API rechazaba el envío por falta del código internacional `505`. Adicionalmente, el servicio de notificaciones actualizaba la base de datos marcando `confirmado: true` *antes* de despachar el mensaje por WhatsApp. Si el envío fallaba, el pedido quedaba permanentemente registrado como notificado impidiendo cualquier reintento.
    - **Solución de Despacho Invertido y Prefijo 505:** Se invirtió el orden de ejecución en `notificacionService.js` y `orderRoutes.js`: el mensaje a WhatsApp se despacha primero, y solo si la llamada a la API tiene éxito se persiste la bandera en PostgreSQL. En `metaSender.js` y `notificacionService.js`, se normalizan automáticamente los números locales de 8 dígitos al formato internacional `505xxxxxxxx`, preservando estrictamente los destinos `@lid` y `@s.whatsapp.net`.
    - **Distinción Crítica de Direcciones por Referencia:** En Nicaragua las direcciones a domicilio usan puntos de referencia históricos (*"donde fue el club social..."*, *"donde era..."*, *"del parque..."*). Se instruyó al prompt y al modelo que estas frases son exclusivamente direcciones de entrega de delivery y se prohibió terminantemente responder con la ubicación del local del restaurante (*"Estamos ubicados en Jinotega: De rest Mi Rancho..."*).
    - **Erradicación de "Cliente Urbano" y Propagación de Nombre de Contacto:** El bot olvidaba pedir el nombre del cliente en delivery y las plantillas de resumen omitían la línea de cliente, provocando que el LLM inventara el nombre genérico "Cliente Urbano". Se agregó `contactName` (pushName de WhatsApp) desde el webhook y debounce de `messageHandler.js` hacia `processMessage` y `buildSystemPrompt`, inyectándolo en el contexto conversacional. Se añadió la línea `👤 *Cliente:* [Nombre completo]` en ambas plantillas de resumen y se blindó `agentService.js` para reemplazar cualquier nombre genérico alucinado por el nombre real de WhatsApp antes de persistir en PostgreSQL.
31. **Eliminación Definitiva de Pedidos Duplicados por Mensajes Posteriores y Ventana de Idempotencia por Productos (`src/orders/orderService.js`, `src/agent/agentService.js`, `tests/orderDeduplication.test.js`, `tests/agentConfirmation.test.js`):**
    - **Causa Raíz de Duplicados (Caso Cristian, #AED1E6 y #539330):**
      1. El cliente confirmó su orden y recibió `"¡Pedido recibido!"`. Minutos después envió un mensaje de cortesía ("ok gracias", "dale", "¿cuánto tardan?"). La IA respondió con texto plano recordando que su orden ya había sido enviada.
      2. El interceptor de confirmaciones fallidas evaluaba la regex `/orden.*(enviada|registrada)/i` y forzaba indebidamente una segunda invocación a `guardar_pedido`.
      3. `findExistingOrder` contaba únicamente con una ventana de 60 segundos basada solo en `sessionId`. Al haber transcurrido más de 60 segundos (ej: 2 minutos), retornaba `null` y `saveOrder` creaba un segundo pedido idéntico en PostgreSQL despachando otra alerta a la app KDS.
    - **Solución Multi-Capa Implementada:**
      1. **Guardia en Interceptor:** Si ya existe un pedido activo en cocina (`activeOrder` o `lastOrderId`), o si el último mensaje del asistente ya es una confirmación (`¡Pedido recibido!`), el interceptor queda estrictamente desactivado.
      2. **Deduplicación Ampliada a 5 Minutos:** En `findExistingOrder`, cualquier intento de guardar pedido para el mismo cliente (`sessionId` o `telefono`) dentro de los últimos 5 minutos (300s) se detecta como duplicado.
32. **Estabilización de Despliegue Evolution API v2 en Docker (`docker-compose.yml`, `src/routes/whatsappRoutes.js`, `src/db/initDb.js`, `src/db/schema.sql`):**
    - **Causa Raíz de los Errores (`Error: P3005 The database schema is not empty` y `Database provider invalid`):**
      1. Evolution API v2 exige `DATABASE_PROVIDER=postgresql`.
      2. Al apuntar `DATABASE_CONNECTION_URI` hacia `?schema=public`, Prisma encontraba las tablas existentes del restaurante (`pedidos`, `productos`, `categorias`, etc.) sin tabla de control `_prisma_migrations`, arrojando `Error: P3005: The database schema is not empty` y abortando la migración.
    - **Solución Implementada:**
      1. Aislamiento de Evolution API v2 en su propio esquema de PostgreSQL: `?schema=evolution`.
      2. Creación del servicio inicializador `db-init-evolution` en `docker-compose.yml` (`postgres:16-alpine`) que asegura `CREATE SCHEMA IF NOT EXISTS evolution;` antes de que `evolution-api` ejecute sus migraciones.
      3. Adición de `CREATE SCHEMA IF NOT EXISTS evolution;` en `src/db/initDb.js` y `src/db/schema.sql`.
      4. Configuración de persistencia de instancias de WhatsApp en volumen de disco `/evolution/instances` (`./volumes/evolution`).
      5. Caché de alta velocidad habilitada mediante el servicio `redis` (`redis:alpine`).
      6. Telemetría enriquecida en `src/routes/whatsappRoutes.js` con captura de códigos de error de red (`UND_ERR_CONNECT_TIMEOUT`, `ENOTFOUND`, `ECONNREFUSED`).
33. **Normalización Universal de Webhook v1/v2, Global Webhook en Docker y Borrado Físico Definitivo de Logs (`docker-compose.yml`, `src/whatsapp/metaWebhook.js`, `src/services/evolutionSetup.js`, `src/routes/whatsappRoutes.js`, `src/routes/logRoutes.js`, `src/utils/logger.js`, `tests/metaWebhook.test.js`, `tests/loggerErrors.test.js`, `tests/whatsappRoutes.test.js`):**
    - **Global Webhook en Docker (`docker-compose.yml`):** Inyección de `WEBHOOK_GLOBAL_ENABLED=true`, `WEBHOOK_GLOBAL_URL=http://backend:3001/whatsapp/webhook`, `WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false` y `WEBHOOK_EVENTS_MESSAGES_UPSERT=true` en el contenedor de `evolution-api`. Evolution API v2 despacha los eventos automáticamente a nivel de contenedor sin depender exclusivamente de llamadas REST por instancia.
    - **Montaje en Vivo de Código (`docker-compose.yml`):** Montaje en volumen de `./src:/app/src:ro`, `./prompts:/app/prompts:ro` y `./index.js:/app/index.js:ro` para el servicio backend. Permite que cualquier `git pull` se refleje inmediatamente en el contenedor sin requerir reconstrucción completa de la imagen (`docker build`).
    - **Recepción Ininterrumpida en Evolution API v2:** Normalización de eventos con `.toLowerCase().replace(/_/g, '.')` para aceptar indistintamente `MESSAGES_UPSERT`, `messages_upsert`, `messages.upsert`, `CONNECTION_UPDATE` y `connection.update`. Saneamiento defensivo de arrays anidados (`body.data.messages`, `body.data`, `body.messages`) y lectura de texto en `data.body`.
    - **Registro Proactivo y Diagnóstico de Webhook:** Extensión de `waitForEvolution()` a 60s y registro bidireccional obligatorio con fallback v2 -> v1 en `setWebhook`. Endpoints dedicados `POST /whatsapp/setup-webhook` y `GET /whatsapp/check-webhook` para inspección en tiempo real del estado configurado en Evolution API.
    - **Borrado Permanente de Logs y Errores en Disco:** Función `clearAllLogs()` en `logger.js` y endpoint `POST /logs/clear`. Trunca a cero bytes `data/logs.ndjson` y `data/errors.ndjson`, eliminando de raíz logs y errores acumulados de sesiones previas en todos los clientes/dispositivos (móvil y escritorio) al presionar 'Limpiar'.
      3. **Comparación Profunda de Productos (30 Minutos):** En una ventana de 30 minutos, la función `sameOrderProducts` compara determinísticamente la lista de productos y totales; si son idénticos a una orden pendiente en cocina, se reutiliza el pedido existente evitando una nueva inserción.
      4. **Bandera `esDuplicado` y Mensaje de Tranquilidad:** `saveOrder` marca `esDuplicado: true` en el pedido retornado. `agentService.js` responde al cliente con un recordatorio amable (*"Tu orden ya fue enviada al chef y está en preparación..."*) y no emite ningún evento SSE ni notificación a cocina.
32. **Aislamiento Estricto del Teléfono del Dueño/Administrador y Validación Obligatoria de Nombre del Cliente (`src/utils/phoneUtils.js`, `src/whatsapp/metaWebhook.js`, `src/whatsapp/lidResolver.js`, `src/whatsapp/messageHandler.js`, `src/agent/agentService.js`, `src/orders/orderService.js`, `prompts/agent.txt`, `tests/phoneUtils.test.js`, `tests/lidResolver.test.js`, `tests/agentConfirmation.test.js`):**
    - **Causa Raíz Resuelta ("se inventó el número y puso el mío y no le pidió nombre"):**
      1. En Baileys para chats 1-a-1, `key.participantPn` y `data.participantPn` corresponden al usuario local de la instancia de WhatsApp (el número del dueño del restaurante). Al recibirse un contacto `@lid` sin `senderPn`, el webhook leía `participantPn` o llamaba al endpoint `/contact/profile/:lid` de Evolution API (que retorna el perfil del dueño), inyectando el número del dueño en la caché de LIDs y en el system prompt del agente (`El número de teléfono del cliente en este chat es: [TELÉFONO DEL DUEÑO]`).
      2. Al asumir que ya contaba con el teléfono, y al recibir la dirección y método de pago en un solo mensaje (*"Me los puede mandar del tip top... pago efectivo"*), Gemini omitía solicitar el nombre faltante y saltaba de inmediato al resumen del pedido omitiendo la línea de cliente. Al confirmar el cliente ("ok"), el bot inventaba `"Cliente Urbano"` y registraba el pedido con el teléfono del dueño.
    - **Solución Multi-Capa Implementada:**
      1. **Detector de Números de Administrador/Dueño (`isAdminOrOwnerPhone` en `src/utils/phoneUtils.js`):** Valida números contra `NOTIFICAR_DESPLIEGUE_TELEFONO` en formatos locales (+505, 8 dígitos, con guiones o espacios). Un número de administrador tiene terminantemente prohibido asignarse a un cliente.
      2. **Purga de Fallbacks Engañosos en Webhook y Resolver (`src/whatsapp/metaWebhook.js`, `src/whatsapp/lidResolver.js`):** Se eliminaron `participantPn`, `participantAlt` de los candidatos en webhook y se retiró el endpoint `/contact/profile` de `lidResolver.js`. Cualquier coincidencia con `isAdminOrOwnerPhone` es descartada de inmediato sin guardarse en caché.
      3. **Forzado de Teléfono Nulo en Handler y Agente (`src/whatsapp/messageHandler.js`, `src/agent/agentService.js`):** Si un contacto `@lid` no resuelve su número o arroja el número del administrador, `telefonoParaPedido` pasa estrictamente como `null`, obligando al LLM a solicitar un número de contacto para delivery.
      4. **Bloqueo Absoluto del Resumen sin Nombre o Teléfono (`prompts/agent.txt`):** Se estableció como regla inquebrantable que el bot NO puede generar ni mostrar el resumen (Paso 3) si falta el nombre completo o el teléfono de contacto para delivery, debiendo responder primero pidiendo los datos faltantes en una sola frase antes de mostrar cualquier resumen.
      5. **Saneamiento Defensivo de "Cliente Urbano" (`src/agent/agentService.js`, `src/orders/orderService.js`):** Detección y sustitución en backend de nombres genéricos por el pushName de WhatsApp, o eliminación limpia de la mención si no existe nombre registrado.
33. **Confirmación Inmediata Concisa en Efectivo ("¡Pedido recibido!") (`prompts/agent.txt`, `src/agent/agentService.js`, `tests/agentConfirmation.test.js`):**
    - **Optimización de Mensajes y Eliminación de Texto Redundante:** Tras enviar el resumen, cuando el cliente confirma con "ok" (para pedidos en efectivo, sea delivery o retiro), el bot responde únicamente con: `✅ *¡Pedido recibido!* 🍔`.
    - **Alineación con el Flujo de Cocina (KDS):** Se erradicaron las parrafadas intermedias que repetían la dirección del local o despedidas extensas, ya que inmediatamente después el chef acepta la comanda en la app de cocina y el sistema despacha el mensaje oficial con el tiempo estimado de preparación (ETA). Para pagos con transferencia, se solicita de forma concisa el comprobante junto a las cuentas bancarias autorizadas.
34. **Registro Persistente de Errores (`data/errors.ndjson`), Descarga/Copia en `/logs` y Reintentos Resilientes en Despacho WhatsApp (`src/utils/logger.js`, `src/routes/logRoutes.js`, `src/whatsapp/metaSender.js`, `src/whatsapp/metaWebhook.js`, `tests/metaSender.test.js`, `tests/loggerErrors.test.js`):**
    - **Causa Raíz Diagnosticada:**
      1. Caída o flapping transitorio de socket en Baileys / Evolution API (`connection.update` open/close/open). Al enviar durante esos milisegundos, Evolution retornaba `400: Connection Closed` o `500: Internal Server Error`. Al carecer `metaSender.js` de reintentos, las respuestas se perdían irrevocablemente.
      2. Errores `400: not-acceptable` al enviar a identificadores `@lid` cuyas sesiones Signal en Baileys carecían de claves o estaban desincronizadas, sin fallback al número de teléfono real.
      3. Pérdida de historial de errores en el monitor web (`/logs`): el visor sólo mantenía 500 líneas en memoria, y tormentas de eventos repetitivos (`connection.update`, `presence.update`, etc.) desplazaban y eliminaban los registros de error en segundos.
    - **Solución Implementada:**
      1. **Archivo Persistente Dedicado de Errores (`data/errors.ndjson`):** Intercepción de `console.error` y método `logError` para registrar de forma atómica cada error con timestamp ISO, mensaje y stack trace en un archivo independiente.
      2. **Rotación Inteligente sin Pérdida:** Función defensiva `trimFileIfNeeded` que, al alcanzar el límite de 5MB, conserva los últimos 2.5MB en lugar de truncar el archivo a cero bytes.
      3. **Endpoints de Errores y UI en `/logs`:**
         - `GET /logs/errors/data`: Retorna el historial estructurado de errores en JSON.
         - `GET /logs/errors/download`: Descarga directa como archivo adjunto `errores-bot-restaurantes.txt`.
         - Botones "📥 Descargar Errores" y "⚠️ Copiar Errores" en la barra de acciones del monitor web.
         - Pestaña "⚠️ Errores" vinculada a `errors.ndjson`, garantizando que nunca se pierdan los errores aunque pasen miles de eventos normales.
      4. **Reintentos Exponenciales y Fallback en `metaSender.js`:**
         - Reintentos automáticos (hasta 3 intentos con demoras de 1.5s y 2.5s) ante fallas de socket/conexión (`Connection Closed`, 500, `ECONNRESET`, `ETIMEDOUT`, `fetch failed`).
         - Fallback automático: Si el envío hacia un destino `@lid` es rechazado con `not-acceptable` o 400, consulta la caché / BD de resolución de LID y redirige el envío de inmediato a `${telefono}@s.whatsapp.net`.
      5. **Filtrado de Ruido en Webhook (`metaWebhook.js`):** Desactivado el spam de `[Webhook] Evento recibido: ...` para eventos secundarios repetitivos (`presence.update`, `chats.update`), registrando `connection.update` únicamente ante transiciones de estado reales.
35. **Resolución de Caída de Socket Baileys por `@lid` ('Connection Closed'), Flapping de Conexión y Mapeo Proactivo de Transporte (`src/whatsapp/lidResolver.js`, `src/whatsapp/metaSender.js`, `src/whatsapp/metaWebhook.js`, `tests/metaSender.test.js`):**
    - **Causa Raíz Diagnosticada ("el bot responde una vez y luego ya no responde"):**
      1. Con `WPP_LID_MODE=false` en Evolution API v1.8.7, despachar `POST /message/sendText` hacia identificadores raw `@lid` (ej: `267692510605433@lid` o `229712098817378@lid`) hace que Baileys aborte el WebSocket a los servidores de WhatsApp arrojando `400/500 Connection Closed`.
      2. Al cerrarse el socket, Evolution API entra en un bucle de reconexión intermitente ("flapping"): `close` -> `connecting` -> `open` (por 100ms) -> `close` -> `connecting`. Cualquier mensaje subsiguiente recibido o respuesta enviada durante ese estado falla con `Connection Closed` o `Fetch failed`.
      3. Además, el filtro estricto `isAdminOrOwnerPhone` en `metaWebhook.js` y `lidResolver.js` descartaba el teléfono del dueño (`593961699586`) al asociar su `@lid`. Por ende, cuando el administrador chateaba con el bot para probar, su LID nunca se mapeaba a un número de teléfono, forzando respuestas al `@lid` y disparando la caída del socket en cada mensaje.
    - **Solución Implementada:**
      1. **Mapeo Proactivo a `@s.whatsapp.net` en `metaSender.js`:** Antes del despacho, si el destino es `@lid` o tiene 14-16 dígitos, se consulta la caché de `lidResolver` o la API de Evolution (`resolveLid`) y se reorienta directamente a `${telefono}@s.whatsapp.net`. Si falla un envío a `@lid` no resuelto, se efectúa una resolución de emergencia antes de reintentar.
      2. **Normalización Temprana en `metaWebhook.js`:** Si el mensaje entrante proviene de un `@lid` y se conoce su teléfono (ej. vía `key.senderPn`), `replyTo` y `remoteJid` se establecen directamente como `${cleanPhone}@s.whatsapp.net`.
      3. **Opción `allowAdmin` en `lidResolver.js`:** Permite almacenar en caché el JID de transporte de administradores autenticados desde mensajes entrantes (`{ allowAdmin: true }`), manteniendo intacto el bloqueo de `isAdminOrOwnerPhone` en `orderService.js` y `messageHandler.js` para proteger la base de datos contra pedidos con el número del dueño.
      4. **Pruebas Unitarias Actualizadas (`tests/metaSender.test.js`):** Pruebas de despacho verifican que los destinos `@lid` conocidos se traduzcan limpiamente a `@s.whatsapp.net` evitando caídas de socket. Todas las pruebas pasan (PASS).
36. **Corrección de Referencia `getPhoneForLid`, Blindaje contra Unhandled Rejections en Webhook y Telemetría de Desconexión (`src/whatsapp/metaWebhook.js`, `tests/metaWebhook.test.js`):**
    - **Causa Raíz Diagnosticada (`ReferenceError: getPhoneForLid is not defined`):**
      1. En `src/whatsapp/metaWebhook.js`, se invocaba `getPhoneForLid(incomingJid)` para resolver el teléfono antes del despacho, pero no se había importado dicha función desde `./lidResolver`.
      2. Al ingresar cualquier mensaje entrante, Node.js arrojaba `ReferenceError: getPhoneForLid is not defined`, abortando `_processMessage` inmediatamente antes de invocar a Gemini, guardar pedidos o enviar respuestas.
      3. Adicionalmente, `handleWebhook` carecía de bloque `try...catch` en el bucle de mensajes tras el `res.sendStatus(200)`, lo que provocaba rechazos no controlados (unhandled promise rejections) hacia Express.
      4. Los eventos `connection.update` solo registraban la palabra `"close"` o `"connecting"` sin exponer la causa real de desconexión emitida por Baileys (`statusReason` o `lastDisconnect.error.output.statusCode`), impidiendo diagnosticar si la desconexión se debía a sesión cerrada en el teléfono (401), sesión reemplazada (440) o reinicio necesario (515).
    - **Solución Implementada:**
      1. **Importación de `getPhoneForLid`:** Añadida a los módulos importados de `./lidResolver` en `src/whatsapp/metaWebhook.js`.
      2. **Manejo Defensivo de Errores por Mensaje:** Cada comanda o mensaje procesado en el array `messages` se encapsula en un `try...catch` atómico, evitando que un error interno interrumpa el ciclo del webhook o Express.
      3. **Telemetría Completa de Desconexión:** En `connection.update`, se extraen y registran `statusReason` y códigos de estado de `lastDisconnect`, mostrando en logs el motivo exacto (ej: `[motivo: 401]`).
      4. **Suite de Pruebas Unitarias (`tests/metaWebhook.test.js`):** Valida mensajes estándar, resolución `@lid` con `senderPn`, manejo de `connection.update` y tolerancia a fallos en `_processMessage` (4/4 PASS).
37. **Actualización a Evolution API v2 (v2.3.7) con Baileys v7, Persistencia PostgreSQL y Pairing Code (`docker-compose.yml`, `evolution-api/Dockerfile`, `src/routes/whatsappRoutes.js`, `src/whatsapp/metaSender.js`, `tests/whatsappRoutes.test.js`):**
    - **Motivación y Beneficios de la Actualización:**
      1. **Motor Baileys v7 Nativo:** Evolution API v2 incluye Baileys v7 con soporte oficial para protocolos recientes de WhatsApp (2026), resolviendo definitivamente la inestabilidad con identificadores `@lid` sin necesidad de parches frágiles en el Dockerfile.
      2. **Persistencia Robusta en PostgreSQL:** Se activó `DATABASE_ENABLED=true` y `DATABASE_PROVIDER=postgresql` apuntando al servicio existente `postgres:5432/botrestaurantes` (`bot-network`). Las sesiones, credenciales criptográficas e instancias se gestionan vía Prisma ORM evitando la corrupción de sesiones en disco.
      3. **Soporte de Vinculación por "Pairing Code" (Código de 8 dígitos):** Se incorporó el endpoint `GET /whatsapp/pairing-code?number=...` y una pestaña interactiva en `/whatsapp/qr` para permitir emparejar el bot escribiendo el número de teléfono sin depender de la cámara ni de códigos QR que expiran rápidamente.
      4. **Payload Unificado en `metaSender.js`:** Despacho dual con `text` y `textMessage: { text }` para compatibilidad transparente entre Evolution API v1 y v2.
      5. **Suite de Pruebas Unitarias (`tests/whatsappRoutes.test.js`):** 3 pruebas unitarias añadidas y aprobadas validando solicitud de pairing code, manejo de errores de validación de número y consulta de estado de conexión (3/3 PASS).



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
| `tests/orderDeduplication.test.js` | Unitaria | **PASS** (5/5) | Valida comparación profunda de productos (sameOrderProducts), ventana de idempotencia de 5 minutos y deduplicación por coincidencia exacta hasta 30 minutos. |
| `tests/agentConfirmation.test.js` | Unitaria | **PASS** (14/14) | Valida invocación exitosa de guardar_pedido, interceptor de respuestas de texto en confirmación (missed tool call), bloqueo de confirmaciones falsas ante fallo en BD, desambiguación de combos/papas (Caso E), protocolo "¿Quizás quisiste decir...?", persistencia de cantidad entre turnos (2 hot dog -> 210 = x2), prioridad de precio/combo (combo burrito pollo 220), regla de tiempo aproximado antes de confirmar, corte de dirección en confirmación de retiro en local, inyección de contactName con reemplazo de nombres genéricos ("Cliente Urbano"), guardia anti-duplicados ante pedidos activos, respuesta con recordatorio amigable cuando guardar_pedido retorna un pedido ya existente, rechazo del teléfono del administrador/dueño y saneamiento defensivo de "Cliente Urbano". |
| `tests/notificacionService.test.js` | Unitaria | **PASS** (3/3) | Valida despacho prioritario de WhatsApp antes de actualizar BD, resolución de destino con prefijo 505 para números locales de 8 dígitos y reintento garantizado ante fallos. |
| `tests/pushNotification.test.js` | Unitaria | **PASS** (3/3) | Valida formateo de push, despacho a Expo API, saneamiento de tokens obsoletos (DeviceNotRegistered) y tolerancia a fallos. |
| `tests/changeOrderEta.test.js` | Unitaria | **PASS** (2/2) | Valida envío de nuevo tiempo estimado al aprobar cambio y formato de notificación sin ETA. |
| `tests/phoneUtils.test.js` | Unitaria | **PASS** (14/14) | Valida extracción de dígitos, desduplicación de mitades y asimétrica (58544518558544518), código 505, fallbacks y detector de números de administrador/dueño (isAdminOrOwnerPhone). |
| `tests/orderValidator.test.js` | Unitaria | **PASS** (16/16) | Valida esquemas, métodos de pago, totales, tipos de entrega y longitud estricta de teléfono para delivery. |
| `tests/sessionStore.test.js` | Unitaria | **PASS** (4/4) | Valida gestión de sesiones en memoria y TTL de mensajes. |
| `tests/blacklistService.test.js` | Unitaria | **PASS** (8/8) | Valida bloqueo internacional, formato local de 8 dígitos, eliminación inmediata, validación de longitud y detección de contactos bajo formato @lid asociados a números en lista negra. |
| `tests/lidResolver.test.js`  | Unitaria | **PASS** (7/7) | Valida resolución y caché bidireccional de @lid a número telefónico, extracción de senderPn en findMessages, consulta en findContacts y rechazo estricto de números del administrador/dueño. |
| `tests/metaSender.test.js`  | Unitaria | **PASS** (6/6) | Valida mapeo proactivo de @lid a @s.whatsapp.net para prevenir caídas de socket en Baileys, despacho a @lid no resuelto, resolución previa con API, anteposición de prefijo 505 para números locales de Nicaragua y reintentos automáticos ante errores transitorios. |
| `tests/metaWebhook.test.js` | Unitaria | **PASS** (6/6) | Valida recepción de mensajes normales, resolución @lid con senderPn sin ReferenceError de getPhoneForLid, telemetría de connection.update, captura de fallos internos, compatibilidad con MESSAGES_UPSERT v2 y payloads con data.messages anidado. |
| `tests/whatsappRoutes.test.js`| Unitaria| **PASS** (5/5) | Valida solicitud de pairing code numérico, validación de parámetro number, reporte de estado de conexión, registro manual de webhook (/whatsapp/setup-webhook) y consulta de estado (/whatsapp/check-webhook). |
| `tests/loggerErrors.test.js`| Unitaria | **PASS** (4/4) | Valida registro persistente atómico en data/errors.ndjson, captura de console.error, truncado defensivo de 5MB y vaciado físico permanente (POST /logs/clear). |
| `tests/deployNotification.test.js` | Unitaria | **PASS** (8/8) | Valida parseo de múltiples teléfonos, espera de estado WhatsApp open y envío de avisos de despliegue. |
| `Compilación Vite app-chef` | Build / Frontend | **PASS** (1949 módulos) | Construcción de producción de la app React/Vite completada con éxito (código de salida 0). |
| `Generación APK Android (npm run build:apk)` | Build / Mobile | **PASS** | Compilación Vite (1949 módulos), cap sync y gradle assembleDebug exitoso (9s). Generado UrbanoChef.apk (4.09 MB) sincronizado a uploads/ y raíz. |
| `Lifecycle Evolution API (Docker)` | Integración | **PASS** | Valida flujo completo: creación con token e integración (HTTP 201), fetchInstances, connect (QR base64), connectionState y webhook set. |
| `tests/agentService.test.js` | Integración | **FAIL** | Falla por falta de conexión activa a Postgres en entorno de test. |
| `tests/menuService.test.js` | Integración | **FAIL** | Falla por falta de conexión activa a Postgres en entorno de test. |
| `tests/chat.integration.test.js`| Integración | **FAIL** | Falla con código 503 por conexión rechazada a Postgres. |

---

## 7. Próximo Paso Recomendado

1. **Desplegar en Synology NAS:**
   - Ejecutar `git pull origin feature/evolution-api` en el servidor Synology.
   - Ejecutar `docker compose up -d --build` para aplicar la configuración global de webhooks en `evolution-api` y el montaje en vivo en `backend`.
   - Abrir `/whatsapp/check-webhook` en el navegador para confirmar que el webhook esté activo.
   - Presionar **Limpiar** en `/logs` para vaciar el historial y enviar un mensaje desde otro WhatsApp para verificar la respuesta de Urbi.

---

## 8. Archivos Relevantes para Continuar el Desarrollo

- `src/db/connection.js`: Pool de base de datos PostgreSQL.
- `src/agent/agentService.js`: Lógica conversacional principal y function calling con Gemini.
- `src/whatsapp/metaWebhook.js`: Procesamiento de eventos entrantes de WhatsApp y comprobantes.
- `src/services/sseService.js`: Distribución de eventos en tiempo real hacia el panel KDS.
- `app-chef/src/pages/Dashboard.tsx`: Tablero de comandas de cocina en React.
