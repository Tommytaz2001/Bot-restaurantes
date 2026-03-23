# Despliegue con Docker — Bot Restaurantes

## Requisitos

- Docker >= 24
- Docker Compose >= 2.20
- Acceso SSH al servidor (para despliegue remoto)

---

## 1. Configurar variables de entorno

Copia el archivo de ejemplo y completa los valores reales:

```bash
cp .env.example .env
```

Edita `.env`:

```env
OPENAI_API_KEY=sk-proj-...
FIREBASE_API_KEY=AIzaSy...
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
PORT=3001
BACKEND_URL=http://IP-DEL-SERVIDOR:3001
WHATSAPP_ENABLED=true
RESTAURANTE_ID=urbano
```

> ⚠️ **Nunca subas `.env` al repositorio.** Está en `.gitignore` por defecto.

---

## 2. Construir y levantar el contenedor

```bash
# Construir imagen y levantar en segundo plano
docker compose up -d --build

# Ver logs en tiempo real
docker compose logs -f
```

---

## 3. Escanear el QR de WhatsApp

Al iniciar por primera vez, Baileys genera un QR en los logs:

```bash
docker compose logs -f backend
```

Busca algo como esto en los logs:

```
[WhatsApp] Escanea el QR con tu WhatsApp:
█████████████████████
█ ▄▄▄▄▄ █▀▄▄ █ ▄▄▄▄▄ █
...
```

**Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo → escanea el QR.**

Una vez escaneado, la sesión se guarda en Firestore (`baileys_sessions`) y no necesitas escanear de nuevo aunque reinicies el contenedor.

---

## 4. Comandos útiles

```bash
# Ver estado del contenedor
docker compose ps

# Reiniciar el servicio
docker compose restart backend

# Detener sin borrar
docker compose stop

# Detener y eliminar contenedor (la sesión persiste en Firestore)
docker compose down

# Ver las últimas 100 líneas de logs
docker compose logs --tail=100 backend

# Acceder al contenedor para debugging
docker compose exec backend sh
```

---

## 5. Verificar que funciona

```bash
curl http://localhost:3001/health
# Respuesta esperada: {"status":"ok"}
```

---

## 6. Actualizar a nueva versión

```bash
# 1. Bajar los últimos cambios
git pull

# 2. Reconstruir imagen y reemplazar contenedor
docker compose up -d --build

# La sesión de WhatsApp persiste en Firestore — no necesitas re-escanear
```

---

## 7. Despliegue en servidor remoto (SSH)

### Opción A — Copiar archivos con scp

```bash
# Desde tu máquina local, copiar el proyecto al servidor
scp -r . usuario@IP-SERVIDOR:/opt/bot-restaurantes

# Conectarse al servidor
ssh usuario@IP-SERVIDOR

# Ir al directorio y levantar
cd /opt/bot-restaurantes
docker compose up -d --build
```

### Opción B — Clonar desde git en el servidor

```bash
# En el servidor
git clone https://github.com/tu-usuario/bot-restaurantes.git /opt/bot-restaurantes
cd /opt/bot-restaurantes

# Crear .env con los valores reales
cp .env.example .env
nano .env

# Levantar
docker compose up -d --build
```

---

## 8. Exponer al exterior (nginx como proxy inverso)

Si quieres usar un dominio propio o HTTPS, instala nginx en el servidor:

```nginx
# /etc/nginx/sites-available/bot-restaurantes
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Activar sitio y recargar nginx
sudo ln -s /etc/nginx/sites-available/bot-restaurantes /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS con Let's Encrypt (opcional)
sudo certbot --nginx -d tu-dominio.com
```

Actualiza `BACKEND_URL=https://tu-dominio.com` en `.env` y reinicia:

```bash
docker compose restart backend
```

---

## 9. Auto-restart al reiniciar el servidor

El `docker-compose.yml` ya incluye `restart: unless-stopped`, lo que significa que el contenedor se reinicia automáticamente si el servidor se reinicia o si el proceso cae.

Para verificarlo:

```bash
# Simular reinicio del servidor
sudo reboot

# Al volver, verificar que el contenedor ya está corriendo
docker compose ps
```

---

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| QR no aparece en logs | `WHATSAPP_ENABLED` no es `true` | Verificar `.env` |
| `Connection Closed` al notificar | WhatsApp desconectado | `docker compose restart backend` y re-escanear QR |
| `Error al iniciar Firebase` | Variables Firebase incorrectas | Verificar `FIREBASE_PROJECT_ID` y `FIREBASE_API_KEY` |
| Puerto 3001 ocupado | Otro proceso usa el puerto | Cambiar `PORT=3002` en `.env` y el mapeo en `docker-compose.yml` |
| Sesión perdida tras reinicio | `baileys_sessions` en Firestore vacío | Escanear QR nuevamente |
