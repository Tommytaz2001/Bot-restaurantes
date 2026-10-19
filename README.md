# Urbano Bot & Chef — Sistema Integral de Pedidos WhatsApp

Sistema moderno para restaurantes con bot conversacional de WhatsApp impulsado por **Google Gemini**, base de datos relacional **PostgreSQL**, notificaciones en **tiempo real (SSE)** y panel de cocina en **React Web (Vite + Capacitor)**.

---

## 🏗️ Arquitectura del Sistema

```
  Cliente WhatsApp
        │
        │ (Mensaje de chat)
        ▼
  ┌──────────────┐     Webhook HTTP      ┌──────────────────┐
  │ Evolution API│ ────────────────────> │   Bot Backend    │
  │  (Baileys)   │ <──────────────────── │   (Node.js)      │ ── SSE Push ──►  📱 App Cocina
  │ Docker :6543 │    REST sendText      │   Docker :3001   │                  (React + Vite)
  └──────────────┘                       └────────┬─────────┘                  http://localhost:5173
                                                  │
                                    ┌─────────────┴─────────────┐
                                    ▼                           ▼
                              ┌──────────┐                ┌──────────┐
                              │  Google  │                │PostgreSQL│
                              │  Gemini  │                │(Docker)  │
                              │ 2.5 Flash│                │  :5432   │
                              └──────────┘                └──────────┘
```

### Componentes Principales:
1. **Bot Conversacional (Node.js + Gemini)**:
   - Inteligencia con **Google Gemini (`gemini-2.5-flash`)** con herramientas de confirmación (`guardar_pedido`), solicitud de modificaciones, cancelaciones y consultas.
   - Respuestas cálidas, empáticas y reconocimiento de confirmaciones naturales (*"dale"*, *"simón"*, *"sí porfa"*, etc.).
2. **Evolution API (WhatsApp Baileys)**:
   - Conexión vía código QR sin necesidad de cuenta empresarial ni verificación de Meta.
   - Soporte para mensajes de texto y recepción de fotos de comprobantes de pago.
3. **Base de Datos Relacional (PostgreSQL 16)**:
   - Almacenamiento estructurado de restaurantes, categorías, platillos del menú, pedidos y usuarios.
   - Cero costos por lecturas/escrituras en la nube.
4. **App de Cocina (React + Vite)**:
   - Tablero de cocina en tiempo real con alertas sonoras (chime).
   - Vistas adaptadas a móvil (tarjetas táctiles) y tablet/pantalla de cocina (columnas KDS).
   - Gestión de disponibilidad de platillos en 1 toque y horarios de atención.
   - Empaquetable como APK nativo mediante **Capacitor** o instalable como **PWA**.

---

## 🚀 Inicio Rápido

### 1. Variables de entorno

Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

Edita `.env` y configura al menos:
- `GEMINI_API_KEY`: Tu clave de [Google AI Studio](https://aistudio.google.com/)
- `JWT_SECRET`: Tu secreto de autenticación
- `EVOLUTION_API_KEY`: Clave para Evolution API

---

### 2. Levantar el Backend y PostgreSQL con Docker

```bash
docker compose up -d --build
```

Esto levantará los siguientes servicios:
- **postgres** (`:5432`) — Base de datos relacional con auto-inicialización y seeding del menú.
- **backend** (`:3001`) — API REST + Bot + Servidor de tiempo real SSE.
- **evolution-api** (`:6543`) — Conector de WhatsApp vía Baileys.

---

### 3. Vincular WhatsApp con QR

Abre en tu navegador:
```
http://localhost:3001/whatsapp/qr
```
Escanea el código QR desde tu WhatsApp (**Dispositivos vinculados > Vincular un dispositivo**).

---

### 4. Iniciar la App de Cocina (React Web)

En otra terminal:

```bash
cd app-chef
npm install
npm run dev
```

Abre en tu navegador:
```
http://localhost:5173
```

- **Usuario**: `chef@urbano.com`
- **Contraseña**: `chef123`

---

## 📱 Empaquetar APK Android (Capacitor)

Para compilar la app web en un APK instalable para celulares Android:

```bash
cd app-chef
npm run build
npx cap add android   # Solo la primera vez
npx cap copy
npx cap open android  # Abre en Android Studio para generar el APK
```

---

## 🗄️ Esquema Relacional de PostgreSQL

- `restaurantes`: Configuración de cada restaurante, moneda, horarios por día en JSONB y cuentas bancarias.
- `categorias`: Categorías ordenadas del menú (Hamburguesas, Tacos, Burritos, etc.).
- `productos`: Platillos, precios, descripción, opciones/variantes y disponibilidad (`disponible: true/false`).
- `pedidos`: Cabecera de comandas (cliente, teléfono, jid, tipo de entrega, total, estado, comprobante de pago).
- `pedido_items`: Detalle de productos pedidos con opciones y cantidades.
- `usuarios`: Cuentas de cocineros/administradores autenticadas con contraseñas encriptadas (`bcrypt`).

---

## 📚 Documentación Adicional

- [docs/reports/](docs/reports/): Historial de reportes y auditorías técnicas anteriores.
- [DOCKER.md](DOCKER.md): Guía de despliegue en servidores remotos (VPS Hetzner, DigitalOcean, Lightsail).
