# Guía de Implementación: Venom Bot + OpenAI + MongoDB

## 📋 Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Instalación de Dependencias](#instalación-de-dependencias)
3. [Configuración del Entorno](#configuración-del-entorno)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Código Completo](#código-completo)
6. [Inicio del Servidor](#inicio-del-servidor)
7. [Monitoreo y Troubleshooting](#monitoreo-y-troubleshooting)
8. [Migración desde Baileys](#migración-desde-baileys)

---

## Requisitos Previos

Antes de comenzar, asegúrate de tener:

- **Node.js**: v14 o superior (verifica con `node -v`)
- **npm**: v6 o superior (verifica con `npm -v`)
- **MongoDB**: Local o Atlas (MongoDB Cloud)
- **OpenAI API Key**: Obtén tu key en https://platform.openai.com/api-keys
- **WhatsApp Web**: Versión actualizada

### Instalar Node.js (si no lo tienes)

**Linux/Mac:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
Descarga desde https://nodejs.org/ (LTS recomendado)

---

## Instalación de Dependencias

### 1. Crear proyecto nuevo

```bash
mkdir mi-bot-whatsapp
cd mi-bot-whatsapp
npm init -y
```

### 2. Instalar paquetes necesarios

```bash
# Venom Bot (reemplazo de Baileys)
npm install venom-bot

# OpenAI API
npm install openai

# MongoDB
npm install mongoose

# Variables de entorno
npm install dotenv

# Express (opcional, para API)
npm install express

# Nodemon (desarrollo - opcional)
npm install --save-dev nodemon
```

### 3. Verificar instalación

```bash
npm list
```

Deberías ver algo como:
```
mi-bot-whatsapp@1.0.0
├── venom-bot@2.x.x
├── openai@3.x.x
├── mongoose@7.x.x
├── dotenv@16.x.x
├── express@4.x.x
└── nodemon@2.x.x
```

---

## Configuración del Entorno

### 1. Crear archivo `.env`

En la raíz de tu proyecto, crea un archivo llamado `.env`:

```bash
touch .env
```

### 2. Agregar variables de entorno

Edita `.env` y añade:

```env
# OpenAI
OPENAI_API_KEY=sk-tu-clave-api-aqui

# MongoDB (usa la que prefieras)
# OPCIÓN A: Local
MONGODB_URI=mongodb://localhost:27017/whatsapp-bot

# OPCIÓN B: Atlas (MongoDB Cloud)
# MONGODB_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/whatsapp-bot

# Configuración del Bot
NODE_ENV=development
BOT_SESSION_NAME=whatsapp-bot
BOT_HEADLESS=true
BOT_LOG_QR=true
PORT=3000
```

### 3. Obtener OpenAI API Key

1. Ve a https://platform.openai.com/api-keys
2. Haz clic en "Create new secret key"
3. Copia la clave (solo se muestra una vez)
4. Pega en tu `.env`

### 4. Configurar MongoDB

**OPCIÓN A: Local (más fácil para desarrollo)**

```bash
# En Linux/Mac (si usas Homebrew)
brew tap mongodb/brew
brew install mongodb-community

# Inicia el servicio
brew services start mongodb-community

# Verifica que está corriendo
mongo --version
```

**OPCIÓN B: MongoDB Atlas (Cloud - recomendado)**

1. Ve a https://www.mongodb.com/cloud/atlas
2. Crea una cuenta gratuita
3. Crea un cluster (selecciona la región más cercana)
4. Obtén la cadena de conexión
5. Reemplaza en `.env`: `MONGODB_URI=mongodb+srv://...`

---

## Estructura del Proyecto

Tu proyecto debe verse así:

```
mi-bot-whatsapp/
├── node_modules/
├── sessions/              # Sesiones WhatsApp (se crea automático)
├── logs/                  # Logs del bot (opcional)
├── .env                   # Variables de entorno
├── .gitignore             # Archivos a ignorar en git
├── package.json
├── package-lock.json
├── bot.js                 # Archivo principal del bot
├── models/
│   └── Orden.js          # Schema de MongoDB
├── controllers/
│   ├── messageController.js  # Lógica de mensajes
│   └── openaiController.js   # Lógica de OpenAI
└── api/
    └── routes.js         # Rutas Express (opcional)
```

### Crear estructura de carpetas

```bash
mkdir -p sessions logs models controllers api
touch .gitignore bot.js models/Orden.js controllers/messageController.js controllers/openaiController.js api/routes.js
```

### Contenido de `.gitignore`

```
node_modules/
.env
.DS_Store
sessions/
logs/
*.log
npm-debug.log*
```

---

## Código Completo

### 1. `models/Orden.js` - Schema MongoDB

```javascript
const mongoose = require('mongoose');

const ordenSchema = new mongoose.Schema(
  {
    numeroCliente: {
      type: String,
      required: true,
      index: true,
    },
    mensaje: {
      type: String,
      required: true,
    },
    respuestaIA: {
      type: String,
      default: null,
    },
    estado: {
      type: String,
      enum: ['pendiente', 'procesado', 'error'],
      default: 'pendiente',
    },
    modelo: {
      type: String,
      default: 'gpt-3.5-turbo',
    },
    tokensUsados: {
      type: Number,
      default: 0,
    },
    tiempo: {
      type: Number,
      default: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automático
  }
);

// Índices para búsquedas rápidas
ordenSchema.index({ numeroCliente: 1, timestamp: -1 });
ordenSchema.index({ estado: 1 });

module.exports = mongoose.model('Orden', ordenSchema);
```

### 2. `controllers/openaiController.js` - Lógica OpenAI

```javascript
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

/**
 * Llamar a OpenAI GPT
 * @param {string} texto - Mensaje del usuario
 * @param {string} contexto - Contexto opcional del sistema
 * @returns {Promise<{respuesta: string, tokens: number}>}
 */
async function llamarGPT(texto, contexto = null) {
  try {
    const messages = [
      {
        role: 'system',
        content: contexto || 
          'Eres un asistente de servicio al cliente amable y profesional. ' +
          'Responde de forma clara, concisa y útil. ' +
          'Si la pregunta es sobre pedidos, horarios o ubicación, proporciona esa información. ' +
          'Si no puedes ayudar, sugiere que se comuniquen con un agente humano.',
      },
      {
        role: 'user',
        content: texto,
      },
    ];

    const inicio = Date.now();

    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
      top_p: 0.9,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    });

    const tiempo = Date.now() - inicio;

    const respuesta = response.data.choices[0].message.content;
    const tokens = response.data.usage.total_tokens;

    return {
      respuesta,
      tokens,
      tiempo,
      exitoso: true,
    };
  } catch (error) {
    console.error('❌ Error OpenAI:', error.message);

    // Manejar errores específicos
    if (error.response?.status === 429) {
      return {
        respuesta: 'El servidor está ocupado. Por favor intenta en un momento.',
        tokens: 0,
        tiempo: 0,
        exitoso: false,
        error: 'Rate limit',
      };
    }

    if (error.response?.status === 401) {
      return {
        respuesta: 'Error de autenticación. Verifica tu API key.',
        tokens: 0,
        tiempo: 0,
        exitoso: false,
        error: 'Invalid API key',
      };
    }

    return {
      respuesta: 'Disculpa, tuve un problema procesando tu mensaje. Intenta de nuevo.',
      tokens: 0,
      tiempo: 0,
      exitoso: false,
      error: error.message,
    };
  }
}

/**
 * Validar si el texto es válido para procesar
 * @param {string} texto - Texto a validar
 * @returns {boolean}
 */
function esTextoValido(texto) {
  if (!texto || typeof texto !== 'string') return false;
  if (texto.trim().length === 0) return false;
  if (texto.trim().length > 2000) return false; // Límite OpenAI
  return true;
}

module.exports = {
  llamarGPT,
  esTextoValido,
};
```

### 3. `controllers/messageController.js` - Lógica de Mensajes

```javascript
const Orden = require('../models/Orden');
const { llamarGPT, esTextoValido } = require('./openaiController');

/**
 * Procesar mensaje entrante
 * @param {object} client - Cliente Venom
 * @param {object} message - Mensaje del usuario
 */
async function procesarMensaje(client, message) {
  try {
    // Validaciones
    if (message.isGroupMsg || message.from.includes('@g.us')) {
      console.log('⏭️  Ignorando mensaje de grupo');
      return;
    }

    if (!esTextoValido(message.body)) {
      console.log('⏭️  Mensaje vacío o inválido');
      return;
    }

    const numeroCliente = message.from;
    const textoMensaje = message.body.trim();

    console.log(`📩 [${new Date().toLocaleTimeString()}] Mensaje de ${numeroCliente}: ${textoMensaje}`);

    // Mostrar "escribiendo..."
    try {
      await client.sendStateTyping(numeroCliente, true);
    } catch (err) {
      console.warn('⚠️  No se pudo mostrar estado "escribiendo"');
    }

    // Guardar en BD (antes de procesar)
    const orden = await Orden.create({
      numeroCliente,
      mensaje: textoMensaje,
      estado: 'pendiente',
    });

    // Procesar con OpenAI
    const resultado = await llamarGPT(textoMensaje);

    if (!resultado.exitoso) {
      throw new Error(resultado.error);
    }

    // Actualizar orden en BD
    orden.respuestaIA = resultado.respuesta;
    orden.estado = 'procesado';
    orden.tokensUsados = resultado.tokens;
    orden.tiempo = resultado.tiempo;
    await orden.save();

    // Enviar respuesta por WhatsApp
    await client.sendText(numeroCliente, resultado.respuesta);

    console.log(
      `✅ Respuesta enviada en ${resultado.tiempo}ms ` +
      `(${resultado.tokens} tokens, ID: ${orden._id})`
    );

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error.message);

    try {
      // Intentar guardar el error en BD
      await Orden.create({
        numeroCliente: message.from,
        mensaje: message.body,
        estado: 'error',
        respuestaIA: error.message,
      });

      // Notificar al usuario
      await client.sendText(
        message.from,
        '⚠️ Lo siento, tuve un error procesando tu mensaje. Por favor intenta de nuevo.'
      );
    } catch (dbError) {
      console.error('❌ Error guardando error en BD:', dbError.message);
    }
  }
}

module.exports = {
  procesarMensaje,
};
```

### 4. `bot.js` - Archivo Principal

```javascript
require('dotenv').config();
const venom = require('venom-bot');
const mongoose = require('mongoose');
const { procesarMensaje } = require('./controllers/messageController');

// ==================== CONFIGURACIÓN ====================

const CONFIG = {
  SESSION_NAME: process.env.BOT_SESSION_NAME || 'whatsapp-bot',
  HEADLESS: process.env.BOT_HEADLESS === 'true',
  LOG_QR: process.env.BOT_LOG_QR === 'true',
  AUTO_CLOSE: 120000, // Cerrar después de 2 minutos inactivo
  MONGODB_URI: process.env.MONGODB_URI,
};

let clienteWhatsApp = null;
let estadoBot = 'desconectado';

// ==================== CONEXIÓN MONGODB ====================

async function conectarMongoDB() {
  try {
    await mongoose.connect(CONFIG.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB conectado');
    return true;
  } catch (error) {
    console.error('❌ Error MongoDB:', error.message);
    console.log('⏳ Reintentando en 5 segundos...');
    setTimeout(conectarMongoDB, 5000);
    return false;
  }
}

// ==================== CONEXIÓN WHATSAPP ====================

async function conectarWhatsApp() {
  try {
    console.log('🔄 Conectando a WhatsApp...');

    clienteWhatsApp = await venom.create({
      session: CONFIG.SESSION_NAME,
      multiDevice: true,
      headless: CONFIG.HEADLESS ? 'shell' : true,
      logQR: CONFIG.LOG_QR,
      disableWelcome: true,
      autoClose: CONFIG.AUTO_CLOSE,
      puppeteerArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Útil en servidores
      ],
    });

    estadoBot = 'conectado';
    console.log('✅ WhatsApp conectado exitosamente');

    // Configurar event listeners
    configurarEventos();

  } catch (error) {
    console.error('❌ Error conectando WhatsApp:', error.message);
    estadoBot = 'error';
    console.log('⏳ Reintentando en 10 segundos...');
    setTimeout(conectarWhatsApp, 10000);
  }
}

// ==================== CONFIGURAR EVENTOS ====================

function configurarEventos() {
  // Evento: Mensaje recibido
  clienteWhatsApp.onMessage(async (message) => {
    await procesarMensaje(clienteWhatsApp, message);
  });

  // Evento: Mensaje eliminado
  clienteWhatsApp.onMessageDelete(async (message) => {
    console.log('🗑️  Mensaje eliminado:', message.id);
  });

  // Evento: Llamada recibida
  clienteWhatsApp.onIncomingCall(async (call) => {
    console.log('📞 Llamada recibida de:', call.peerJid);
    // Opcionalmente rechazar llamadas
    try {
      await clienteWhatsApp.rejectCall(call.id);
      console.log('❌ Llamada rechazada');
    } catch (err) {
      console.warn('⚠️  No se pudo rechazar llamada');
    }
  });

  // Evento: Bot desconectado
  clienteWhatsApp.onStatusChange(async (statusChange) => {
    console.log(`📡 Cambio de estado: ${statusChange}`);
    if (statusChange === 'UNPAIRED' || statusChange === 'DISCONNECTED') {
      estadoBot = 'desconectado';
      console.log('⚠️  Desconectado. Reconectando...');
      setTimeout(conectarWhatsApp, 5000);
    }
  });

  // Evento: Contacto offline/online
  clienteWhatsApp.onPresenceChanged(async (presenceChanged) => {
    // console.log('👥 Cambio de presencia:', presenceChanged);
  });
}

// ==================== SERVIDOR EXPRESS (OPCIONAL) ====================

function iniciarServidor() {
  const express = require('express');
  const app = express();

  app.use(express.json());

  // Ruta: Health check
  app.get('/health', (req, res) => {
    res.json({
      estado: estadoBot,
      timestamp: new Date(),
      mongodb: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado',
    });
  });

  // Ruta: Obtener órdenes recientes
  app.get('/ordenes', async (req, res) => {
    try {
      const Orden = require('./models/Orden');
      const limite = req.query.limit || 50;
      const ordenes = await Orden.find()
        .sort({ timestamp: -1 })
        .limit(parseInt(limite));
      res.json(ordenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Ruta: Obtener órdenes de un cliente
  app.get('/ordenes/:numero', async (req, res) => {
    try {
      const Orden = require('./models/Orden');
      const ordenes = await Orden.find({
        numeroCliente: req.params.numero,
      }).sort({ timestamp: -1 });
      res.json(ordenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Ruta: Enviar mensaje manual (debug)
  app.post('/enviar', async (req, res) => {
    try {
      const { numero, mensaje } = req.body;
      if (!numero || !mensaje) {
        return res.status(400).json({ error: 'Faltan número o mensaje' });
      }

      if (estadoBot !== 'conectado') {
        return res.status(503).json({ error: 'Bot no está conectado' });
      }

      await clienteWhatsApp.sendText(numero, mensaje);
      res.json({ exito: true, mensaje: 'Mensaje enviado' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌐 API escuchando en http://localhost:${PORT}`);
    console.log(`📊 GET  /health - Estado del bot`);
    console.log(`📊 GET  /ordenes - Últimas 50 órdenes`);
    console.log(`📊 GET  /ordenes/:numero - Órdenes de un cliente`);
    console.log(`📊 POST /enviar - Enviar mensaje manual`);
  });
}

// ==================== INICIAR TODO ====================

async function inicio() {
  console.log('🚀 Iniciando bot WhatsApp + OpenAI + MongoDB...\n');

  // Conectar MongoDB
  const mongoConectado = await conectarMongoDB();
  if (!mongoConectado) {
    console.error('❌ No se pudo conectar a MongoDB. Abortando.');
    process.exit(1);
  }

  // Conectar WhatsApp
  await conectarWhatsApp();

  // Iniciar servidor API (opcional)
  if (process.env.NODE_ENV !== 'production' || true) {
    iniciarServidor();
  }

  // Manejo de errores global
  process.on('unhandledRejection', (error) => {
    console.error('❌ Error no manejado:', error);
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no capturada:', error);
    process.exit(1);
  });

  console.log('\n✨ Bot iniciado correctamente. Escaneando QR...\n');
}

// Ejecutar
inicio();

// Exportar para pruebas
module.exports = { clienteWhatsApp, estadoBot };
```

### 5. `package.json` - Actualizar scripts

```json
{
  "name": "whatsapp-bot-venom",
  "version": "1.0.0",
  "description": "Bot de WhatsApp con Venom, OpenAI y MongoDB",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "dev": "nodemon bot.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "whatsapp",
    "venom",
    "openai",
    "gpt",
    "mongodb",
    "bot"
  ],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "venom-bot": "^2.0.0",
    "openai": "^3.3.0",
    "mongoose": "^7.5.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## Inicio del Servidor

### Opción 1: Desarrollo (con Nodemon)

```bash
npm run dev
```

Esto reiniciará automáticamente el servidor cuando hagas cambios.

### Opción 2: Producción

```bash
npm start
```

### Proceso esperado:

```
🚀 Iniciando bot WhatsApp + OpenAI + MongoDB...

✅ MongoDB conectado
🔄 Conectando a WhatsApp...
✅ WhatsApp conectado exitosamente
🌐 API escuchando en http://localhost:3000
📊 GET  /health - Estado del bot
📊 GET  /ordenes - Últimas 50 órdenes
📊 GET  /ordenes/:numero - Órdenes de un cliente
📊 POST /enviar - Enviar mensaje manual

✨ Bot iniciado correctamente. Escaneando QR...
```

Una vez veas **"Escaneando QR..."**:
1. Abre WhatsApp en tu teléfono
2. Ve a Ajustes → Dispositivos vinculados → Vincular un dispositivo
3. Escanea el código QR que aparece en la terminal

---

## Monitoreo y Troubleshooting

### Verificar estado del bot

```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{
  "estado": "conectado",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "mongodb": "conectado"
}
```

### Ver últimas órdenes

```bash
curl http://localhost:3000/ordenes?limit=10
```

### Problemas comunes

#### ❌ Error: "OPENAI_API_KEY is not set"

**Solución:**
```bash
# Verifica que .env existe
ls -la .env

# Verifica que la variable está allí
cat .env | grep OPENAI_API_KEY

# Asegúrate de que no hay espacios
# ❌ Malo: OPENAI_API_KEY = sk-xxx
# ✅ Bien: OPENAI_API_KEY=sk-xxx
```

#### ❌ Error: "Cannot connect to MongoDB"

**Soluciones:**

```bash
# Si usas MongoDB local, verifica que está corriendo
# Mac:
brew services list | grep mongodb

# Linux:
sudo systemctl status mongod

# Si está apagado, inicia:
brew services start mongodb-community
sudo systemctl start mongod
```

Para MongoDB Atlas:
```
MONGODB_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/whatsapp-bot?retryWrites=true&w=majority
```

#### ❌ Error: "EADDRINUSE: address already in use :::3000"

**Solución:**
```bash
# Buscar y matar el proceso en puerto 3000
# Mac/Linux:
lsof -i :3000
kill -9 <PID>

# O cambiar puerto en .env
PORT=3001
```

#### ❌ El bot no recibe mensajes

**Checklist:**
1. ¿QR escaneado correctamente? (debe salir "✅ WhatsApp conectado")
2. ¿Mensajes privados? (no grupo)
3. ¿Número tiene formato correcto? (debe tener @c.us o @s.whatsapp.net)
4. ¿MongoDB conectado? (revisa logs)
5. ¿OpenAI API key válida? (intenta manualmente)

**Debug:**
```bash
# Agregá esto en bot.js después de "client.onMessage":
client.onMessage(async (message) => {
  console.log('DEBUG MSG:', JSON.stringify(message, null, 2));
  // ... resto del código
});
```

---

## Migración desde Baileys

### Paso 1: Desinstalar Baileys

```bash
npm uninstall @adiwajshing/baileys
```

### Paso 2: Instalar Venom

```bash
npm install venom-bot
```

### Paso 3: Actualizar imports

**Antes (Baileys):**
```javascript
const { default: makeWASocket, useMultiFileAuthState } = require('@adiwajshing/baileys');
```

**Después (Venom):**
```javascript
const venom = require('venom-bot');
```

### Paso 4: Actualizar lógica de conexión

**Antes (Baileys):**
```javascript
const sock = makeWASocket({ auth: state });
sock.ev.on('messages.upsert', async (m) => {
  const msg = m.messages[0];
  console.log(msg.message.conversation);
});
```

**Después (Venom):**
```javascript
venom.create({ session: 'name' }).then((client) => {
  client.onMessage(async (message) => {
    console.log(message.body);
  });
});
```

### Paso 5: Ajustar forma de enviar mensajes

**Antes (Baileys):**
```javascript
await sock.sendMessage(jid, { text: 'Hola' });
```

**Después (Venom):**
```javascript
await client.sendText(jid, 'Hola');
```

---

## Recursos Adicionales

- **Documentación Venom Bot**: https://github.com/orkestral/venom
- **OpenAI API Docs**: https://platform.openai.com/docs
- **Mongoose Docs**: https://mongoosejs.com/
- **Express Docs**: https://expressjs.com/

---

## Checklist Final

Antes de pasar a producción, verifica:

- ✅ `.env` configurado con API keys
- ✅ MongoDB conectado (local o Atlas)
- ✅ `npm install` ejecutado
- ✅ QR escaneado en WhatsApp
- ✅ Primer mensaje recibido y respondido
- ✅ Órdenes guardadas en BD
- ✅ API `/health` respondiendo
- ✅ Logs limpios sin errores

---

## Soporte

Si tienes problemas:

1. Revisa los logs en consola
2. Verifica variables en `.env`
3. Prueba manualmente: `curl http://localhost:3000/health`
4. Reinicia el bot: `Ctrl+C` y `npm start`

¡Listo para implementar! 🚀
