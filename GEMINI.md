# Instrucciones Permanentes del Proyecto (GEMINI.md)

Este documento define las reglas de trabajo, convenciones técnicas y el flujo de memoria persistente para cualquier agente de IA en este repositorio.

---

## 1. Stack Tecnológico y Arquitectura Resumida

- **Backend:** Node.js 20+ con Express 5 (`index.js`, puerto `3001`).
- **Motor de IA:** Google Gemini Flash (`gemini-2.5-flash` / `gemini-3.5-flash-lite`) vía REST en `src/services/aiService.js`, con tools de confirmación de pedido (`guardar_pedido`). Fallback a OpenAI.
- **Base de Datos:** PostgreSQL 16 relacional en Docker (`:5432`) administrado con `pg` Pool (`src/db/`).
- **WhatsApp Gateway:** Evolution API v1.8.7 (Baileys) en Docker (`:6543`), con parche para soporte de JIDs con formato `@lid`.
- **App Cocina (KDS):** React 18 + Vite + TailwindCSS + Capacitor en `app-chef/` (puerto `5173`), con Server-Sent Events (SSE) y alertas sonoras.

---

## 2. Flujo de Trabajo Obligatorio (Memoria Persistente)

### Al iniciar CUALQUIER tarea:
1. **Lee primero este archivo (`GEMINI.md`) y `PROJECT_STATUS.md`.**
2. **Revisa Git status y cambios recientes** (`git status`, `git log -n 3 --oneline`).
3. **Consulta `docs/ARCHITECTURE.md` y `docs/DEVELOPMENT.md` únicamente si la tarea involucra decisiones estructurales o de entorno.**
4. **Identifica e inspecciona solo los archivos estrictamente necesarios para la tarea.** No escanees el repositorio completo.

### Al finalizar CUALQUIER tarea:
1. **Actualiza `PROJECT_STATUS.md`** con:
   - Estado real verificado del hito o tarea.
   - Archivos modificados.
   - Pruebas ejecutadas con sus resultados reales (nunca marques una prueba como aprobada sin haberla ejecutado).
   - Errores conocidos o bloqueos descubiertos.
   - Próximo paso concreto recomendado.
2. **Actualiza `docs/ARCHITECTURE.md`** solo si hubo cambios en la arquitectura, esquema de BD o contratos de APIs.
3. **Mantén las descripciones concisas y elimina información obsoleta.**

---

## 3. Comandos de Referencia

| Acción | Comando | Notas |
| :--- | :--- | :--- |
| **Servicios Docker** | `docker compose up -d` | Levanta backend, postgres y evolution-api |
| **Backend Local** | `npm run dev` | Nodemon en puerto 3001 (requiere postgres activo) |
| **App Cocina Web** | `cd app-chef && npm run dev` | Servidor Vite en `http://localhost:5173` |
| **Pruebas Rápidas** | `npx jest tests/orderValidator.test.js --runInBand` | Pruebas unitarias de esquema sin BD |
| **Prueba de Sesiones**| `npx jest tests/sessionStore.test.js --runInBand` | Pruebas de almacenamiento en memoria |
| **Suite Completa** | `npx jest --runInBand --forceExit` | Requiere PostgreSQL levantado |

> [!WARNING]
> En Windows PowerShell / CMD, no ejecutes `npm run test:unit` debido a problemas de escape del carácter `|` en la CLI de Jest. Usa `npx jest tests/<nombre>.test.js`.

---

## 4. Convenciones y Restricciones Críticas

1. **Gestión de Secretos:** NUNCA escribas claves API, tokens, contraseñas o variables reales en archivos rastreados por Git. Usa siempre `.env.example` para documentar nombres y ejemplos ficticios.
2. **Integridad de Código:** No modifiques la lógica de negocio ni refactorices componentes existentes a menos que la instrucción del usuario lo solicite explícitamente.
3. **System Prompt de Urbi:** El archivo `prompts/agent.txt` es la pieza central del bot. Respeta las plantillas de inyección (`{{MENU}}`, `{{CUENTAS_BANCARIAS}}`, etc.) y las reglas de tono nicaragüense/coloquial.
4. **Formato WhatsApp:** Los envíos salientes se realizan a través de `src/whatsapp/metaSender.js` utilizando el JID completo (soporta números estándar `@s.whatsapp.net` y contactos `@lid`).
5. **Autenticación en Tiempo Real:** Las conexiones SSE nativas (`EventSource`) no admiten cabeceras `Authorization`. El middleware `src/middleware/authMiddleware.js` soporta autenticación mediante query parameter `?token=...` exclusivamente para rutas `/stream`.
6. **Mapeo de Rutas Clave:**
   - Base de datos y pool: `src/db/connection.js` y `src/db/schema.sql`
   - Agente conversacional: `src/agent/agentService.js` y `src/services/aiService.js`
   - Receptor Webhook WhatsApp: `src/whatsapp/metaWebhook.js`
   - Lógica de pedidos: `src/orders/orderService.js`
   - Control de cocina y SSE: `src/routes/pedidosAdminRoutes.js` y `src/services/sseService.js`
