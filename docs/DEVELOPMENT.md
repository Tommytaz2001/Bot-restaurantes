# Guía de Desarrollo Local y Operaciones

Guía para configurar el entorno de desarrollo, ejecutar los servicios, correr pruebas y solucionar problemas frecuentes en el repositorio de **Bot Restaurantes Urbano**.

---

## 1. Requisitos del Entorno

- **Node.js:** Versión 20.x o superior (`node -v`).
- **NPM:** Versión 10.x o superior (`npm -v`).
- **Docker & Docker Compose:** Docker Desktop en Windows con WSL2 o Linux/macOS equivalente.
- **Git:** Para control de versiones y flujo de trabajo colaborativo.

---

## 2. Instalación de Dependencias

El repositorio contiene dos proyectos principales: el backend en la raíz y la aplicación de cocina en `app-chef/`.

### 2.1. Backend (Raíz)
```bash
npm install
```

### 2.2. Frontend KDS (`app-chef`)
```bash
cd app-chef
npm install
cd ..
```

---

## 3. Configuración del Entorno (.env)

Copia el archivo de ejemplo para generar tu archivo `.env`:

```bash
cp .env.example .env
```

> [!CAUTION]
> **NUNCA subas ni compartas claves reales, tokens o credenciales en commits de Git.** Mantén `.env` siempre ignorado en `.gitignore`.

### Variables de Entorno del Backend (`.env`)

| Variable | Descripción | Ejemplo Ficticio |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clave API de Google AI Studio | `AIzaSyDummyKeyForDevelopment12345` |
| `GEMINI_MODEL` | Modelo de Gemini a utilizar | `gemini-2.5-flash` o `gemini-3.5-flash-lite` |
| `DB_USER` | Usuario de PostgreSQL | `botuser` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | `botpassword` |
| `DB_NAME` | Nombre de la base de datos | `botrestaurantes` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_HOST` | Host de PostgreSQL (en Docker: `postgres`, local: `localhost`) | `postgres` |
| `DATABASE_URL` | URI de conexión completa | `postgresql://botuser:botpassword@localhost:5432/botrestaurantes` |
| `JWT_SECRET` | Secreto para tokens de autenticación | `clave_secreta_jwt_desarrollo_insegura_2026` |
| `PORT` | Puerto de escucha del backend | `3001` |
| `BACKEND_URL` | URL pública del backend | `http://localhost:3001` |
| `TZ_OFFSET` | Offset horario en horas (Nicaragua: -6) | `-6` |
| `WHATSAPP_ENABLED` | Si `true`, inicia listeners y Evolution setup | `true` |
| `RESTAURANTE_ID` | Identificador del restaurante activo | `urbano` |
| `EVOLUTION_API_URL` | URL de la instancia de Evolution API | `http://evolution-api:8080` (en Docker) o `http://localhost:6543` |
| `EVOLUTION_API_KEY` | Clave de autenticación de Evolution API | `clave_secreta_evolution_123` |
| `EVOLUTION_INSTANCE` | Nombre de la sesión en Evolution API | `bot-restaurantes` |
| `LOGS_USER` | Usuario para el monitor web `/logs` | `admin` |
| `LOGS_PASSWORD` | Contraseña para `/logs` | `admin123` |
| `LOGS_SESSION_SECRET` | Secreto de cookie para sesión de logs | `secreto_cookie_logs_32_caracteres_min` |

---

## 4. Ejecución del Proyecto

### Opción A: Entorno Completo con Docker Compose (Recomendado)

Levanta la base de datos PostgreSQL, la instancia de Evolution API y el backend:

```bash
docker compose up -d --build
```

- **Backend API:** `http://localhost:3001`
- **Healthcheck:** `http://localhost:3001/health`
- **Monitor de Logs:** `http://localhost:3001/logs` (Credenciales: las de `LOGS_USER`/`LOGS_PASSWORD`)
- **Vincular WhatsApp:** `http://localhost:3001/whatsapp/qr`
- **Evolution API directo:** `http://localhost:6543`

Para ver los logs en tiempo real:
```bash
docker compose logs -f backend
```

Para detener los servicios:
```bash
docker compose down
```

---

### Opción B: Desarrollo Standalone (Backend Local + Base de Datos Docker)

Si prefieres editar el código del backend con hot-reload en tu máquina:

1. Levanta solo PostgreSQL y Evolution API:
   ```bash
   docker compose up -d postgres evolution-api
   ```

2. Ejecuta el backend localmente:
   ```bash
   npm run dev
   ```

---

### Iniciar la App de Cocina KDS (`app-chef`)

En una terminal separada:

```bash
cd app-chef
npm run dev
```

- **URL:** `http://localhost:5173`
- **Usuario inicial:** `chef@urbano.com`
- **Contraseña inicial:** `chef123`

---

## 5. Pruebas Automatizadas

La suite de pruebas utiliza **Jest**.

### 5.1. Pruebas Unitarias de Lógica Pura (Sin BD)
Estas pruebas no requieren que PostgreSQL esté corriendo:

```bash
# Validadores de pedidos
npx jest tests/orderValidator.test.js --runInBand

# Tienda de sesiones en memoria
npx jest tests/sessionStore.test.js --runInBand
```

### 5.2. Pruebas de Integración y Servicios con Base de Datos
Para ejecutar las pruebas que consultan `menuService`, `orderService` y `chatRoutes`, la base de datos PostgreSQL debe estar levantada y accesible con las credenciales configuradas en `.env.test`:

```bash
# Asegurarse de que Postgres esté activo
docker compose up -d postgres

# Ejecutar suite completa
npx jest --runInBand --forceExit
```

> [!WARNING]
> **Nota para usuarios de Windows (PowerShell / CMD):**
> El comando `npm run test:unit` definido en `package.json` incluye comillas simples y un operador pipe (`|`) dentro del patrón regex (`--testPathPattern='tests/(...)'`). En Windows, esto puede interpretarse erróneamente como un pipe de la shell intentando ejecutar el comando `orderValidator`.
> **Solución recomendada:** Ejecuta los tests invocando `npx jest tests/<nombre-test>.test.js --runInBand` directamente.

---

## 6. Problemas Frecuentes y Soluciones

### 1. `error: la autentificación password falló para el usuario "botuser"`
- **Causa:** El contenedor de PostgreSQL no ha sido inicializado con esas credenciales o `.env.test` apunta a una instancia diferente.
- **Solución:** Revisa que el servicio `postgres` esté corriendo con `docker compose ps`. Si modificaste la contraseña en `.env`, los volúmenes persistentes de Postgres conservan la contraseña antigua; para recrear desde cero usa `docker compose down -v` y vuelve a levantar.

### 2. WhatsApp no conecta o rechaza números `@lid`
- **Causa:** WhatsApp cambió a identificadores de dispositivo vinculados (LID) que fallan con Baileys estándar al verificar el contacto en WhatsApp.
- **Solución:** La imagen en `evolution-api/Dockerfile` contiene el parche necesario. Asegúrate de compilarla con `docker compose build evolution-api`.

### 3. El bot no responde a mensajes de WhatsApp
- **Causa 1:** El bot puede estar pausado administrativamente desde la app o `/whatsapp/pause`. Verifica `GET /whatsapp/status`.
- **Causa 2:** El restaurante está fuera de horario de atención según la configuración en la base de datos.
- **Causa 3:** `WHATSAPP_ENABLED` está en `false` en el `.env`.

### 4. La app KDS no actualiza pedidos en tiempo real
- **Causa:** La conexión Server-Sent Events (SSE) se interrumpió o el token JWT expiró.
- **Solución:** Recarga la página en `http://localhost:5173`. Verifica en la pestaña *Network* de las herramientas de desarrollador que la solicitud `/pedidos-admin/activos/stream` tenga estado `200` y tipo `text/event-stream`.
