#!/usr/bin/env bash
# setup-evolution.sh — Crea la instancia de Evolution API y configura el webhook.
# Ejecutar UNA sola vez después de que los contenedores estén corriendo:
#   docker compose up -d
#   bash scripts/setup-evolution.sh
#
# Requisitos:
#   - curl instalado
#   - Variables EVOLUTION_API_KEY definida en .env (o exportada)

set -euo pipefail

# Cargar .env si existe
if [ -f .env ]; then
  set -a; source .env; set +a
fi

API_URL="${EVOLUTION_API_URL:-http://localhost:8080}"
API_KEY="${EVOLUTION_API_KEY:?Variable EVOLUTION_API_KEY requerida}"
INSTANCE="${EVOLUTION_INSTANCE:-bot-restaurantes}"
BOT_URL="${EVOLUTION_WEBHOOK_URL:-http://bot-restaurantes:3001/whatsapp/webhook}"

echo "=== Evolution API Setup ==="
echo "API URL:   $API_URL"
echo "Instance:  $INSTANCE"
echo "Webhook:   $BOT_URL"
echo ""

# 1. Crear instancia
echo "[1/3] Creando instancia '$INSTANCE'..."
curl -s -X POST "$API_URL/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{\"instanceName\": \"$INSTANCE\", \"qrcode\": true}" | head -c 500
echo ""
echo ""

# 2. Configurar webhook
echo "[2/3] Configurando webhook..."
curl -s -X POST "$API_URL/webhook/set/$INSTANCE" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{
    \"url\": \"$BOT_URL\",
    \"webhook_by_events\": false,
    \"events\": [\"MESSAGES_UPSERT\"]
  }" | head -c 500
echo ""
echo ""

# 3. Obtener QR para conectar WhatsApp
echo "[3/3] Obteniendo QR de conexion..."
echo "Escanea el QR desde WhatsApp > Dispositivos vinculados > Vincular dispositivo"
echo ""
curl -s "$API_URL/instance/connect/$INSTANCE" \
  -H "apikey: $API_KEY" | head -c 2000
echo ""
echo ""
echo "=== Setup completado ==="
echo "Verifica el estado con:"
echo "  curl -s $API_URL/instance/connectionState/$INSTANCE -H 'apikey: $API_KEY'"
