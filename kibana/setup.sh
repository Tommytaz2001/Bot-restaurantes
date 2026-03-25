#!/bin/sh

apk add --no-cache curl --quiet 2>/dev/null

KIBANA="http://kibana:5601"

echo "[kibana-setup] Esperando que Kibana esté disponible..."
until curl -sf "$KIBANA/api/status" 2>/dev/null | grep -q '"available"'; do
  echo "[kibana-setup] No disponible aún, reintentando en 10s..."
  sleep 10
done
echo "[kibana-setup] Kibana listo."

echo "[kibana-setup] Creando data view bot-logs-*..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$KIBANA/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{"data_view":{"id":"bot-logs","title":"bot-logs-*","name":"Bot Logs","timeFieldName":"@timestamp"}}')

if [ "$HTTP" = "200" ]; then
  echo "[kibana-setup] Data view creado."
else
  echo "[kibana-setup] Data view ya existe o HTTP $HTTP — continuando."
fi

echo "[kibana-setup] Importando búsquedas guardadas..."
curl -sf -X POST "$KIBANA/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F "file=@/setup/searches.ndjson" \
  && echo "[kibana-setup] Búsquedas importadas." \
  || echo "[kibana-setup] Error importando búsquedas (no crítico)."

echo "[kibana-setup] Setup completado. Abre http://<host>:5601 → Discover."
