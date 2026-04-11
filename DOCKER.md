# Despliegue con Docker — Bot Restaurantes

## Requisitos

- Docker >= 24
- Docker Compose >= 2.20
- Acceso SSH al servidor (para despliegue remoto)

---

## 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales. Cada variable esta documentada en `.env.example` con instrucciones de donde obtenerla.

Las variables minimas para funcionar:

```env
OPENAI_API_KEY=sk-proj-...
FIREBASE_API_KEY=AIzaSy...
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
WHATSAPP_ENABLED=true
RESTAURANTE_ID=urbano
EVOLUTION_API_KEY=una-clave-segura
EVOLUTION_INSTANCE=bot-restaurantes
EVOLUTION_API_URL=http://evolution-api:8080
```

> **Nunca subas `.env` al repositorio.** Esta en `.gitignore` por defecto.

---

## 2. Construir y levantar

```bash
docker compose up -d --build
```

Esto levanta 2 contenedores:

| Servicio | Puerto | Descripcion |
|---|---|---|
| `backend` | 3001 | Bot + API REST (Node.js) |
| `evolution-api` | 8080 | WhatsApp via Baileys (REST API) |

Verificar que estan corriendo:

```bash
docker compose ps
```

---

## 3. Crear instancia WhatsApp

Ejecutar **una sola vez** despues de levantar los contenedores:

```bash
bash scripts/setup-evolution.sh
```

Este script:
1. Crea la instancia de WhatsApp en Evolution API
2. Configura el webhook (para que los mensajes lleguen al backend)
3. Muestra el QR para vincular

> Si recreas los contenedores con `docker compose down && docker compose up -d`, la sesion persiste en el volumen `evolution_instances`. Pero si eliminas el volumen, debes ejecutar el script de nuevo.

---

## 4. Escanear QR de WhatsApp

Abre en el navegador:

```
http://IP-DEL-SERVIDOR:3001/whatsapp/qr
```

- **QR visible** → WhatsApp > Dispositivos vinculados > Vincular dispositivo > escanea
- **"WhatsApp conectado"** → sesion establecida correctamente
- La pagina se recarga cada 30 segundos automaticamente

Verificar por API:

```bash
# Estado del bot
curl http://localhost:3001/whatsapp/status

# Estado de conexion de Evolution API
curl http://localhost:8080/instance/connectionState/bot-restaurantes \
  -H "apikey: TU_API_KEY"
```

---

## 5. Verificar que funciona

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

Envia un mensaje al numero vinculado desde otro WhatsApp. El bot debe responder.

---

## 6. Comandos utiles

```bash
# Ver logs del backend en tiempo real
docker compose logs -f backend

# Ver logs de Evolution API
docker compose logs -f evolution-api

# Reiniciar solo el bot (sin tocar WhatsApp)
docker compose restart backend

# Detener sin borrar volumenes (sesion persiste)
docker compose stop

# Detener y eliminar contenedores (sesion persiste en volumen)
docker compose down

# Detener y eliminar TODO incluyendo volumenes (requiere re-setup)
docker compose down -v

# Reconstruir imagen del backend tras cambios de codigo
docker compose up -d --build backend

# Acceder al contenedor para debugging
docker compose exec backend sh
```

---

## 7. Actualizar a nueva version

```bash
git pull
docker compose up -d --build
```

La sesion de WhatsApp persiste en el volumen — no necesitas re-escanear.

---

## 8. Despliegue en servidor remoto

### Opcion A — Clonar desde git

```bash
ssh usuario@IP-SERVIDOR
git clone https://github.com/tu-usuario/bot-restaurantes.git /opt/bot-restaurantes
cd /opt/bot-restaurantes
cp .env.example .env
nano .env                          # Completar con valores reales
docker compose up -d --build
bash scripts/setup-evolution.sh    # Crear instancia WhatsApp
# Abrir http://IP:3001/whatsapp/qr y escanear QR
```

### Opcion B — Copiar con scp

```bash
scp -r . usuario@IP-SERVIDOR:/opt/bot-restaurantes
ssh usuario@IP-SERVIDOR
cd /opt/bot-restaurantes
docker compose up -d --build
bash scripts/setup-evolution.sh
```

---

## 9. Proxy inverso con nginx (opcional)

Para usar dominio propio o HTTPS:

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
sudo ln -s /etc/nginx/sites-available/bot-restaurantes /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS con Let's Encrypt
sudo certbot --nginx -d tu-dominio.com
```

Actualiza `BACKEND_URL` en `.env` y reinicia:

```bash
docker compose restart backend
```

---

## 10. Auto-restart

`docker-compose.yml` incluye `restart: unless-stopped` en ambos servicios. Los contenedores se reinician automaticamente si el servidor se reinicia o si el proceso cae.

---

## Solucion de problemas

| Problema | Causa probable | Solucion |
|---|---|---|
| QR no aparece | Instancia no creada en Evolution API | `bash scripts/setup-evolution.sh` |
| Bot no responde | Webhook no configurado | Re-ejecutar `setup-evolution.sh` |
| `exists: false` al enviar | LID sin patch aplicado | Verificar `build: ./evolution-api` en docker-compose |
| Error Firebase | Credenciales incorrectas | Verificar variables `FIREBASE_*` en `.env` |
| Puerto ocupado | Otro proceso usa 3001 o 8080 | Cambiar `PORT` en `.env` |
| Sesion perdida | Volumen eliminado | `bash scripts/setup-evolution.sh` + escanear QR |
| `WHATSAPP_ENABLED` no activa | Variable no es `true` en `.env` | Corregir y `docker compose restart backend` |
