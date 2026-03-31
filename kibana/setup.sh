#!/bin/sh

apk add --no-cache curl --quiet 2>/dev/null

KIBANA="http://kibana:5601"
AUTH="-u elastic:${ELASTIC_PASSWORD}"

# Valores configurables vía variables de entorno
INDEX_PATTERN="${KIBANA_INDEX_PATTERN:-bot-logs-*}"
DATA_VIEW_ID="${KIBANA_DATA_VIEW_ID:-bot-logs}"
DATA_VIEW_TITLE="${KIBANA_DATA_VIEW_TITLE:-Bot Logs}"

echo "[kibana-setup] Esperando que Kibana esté disponible..."
until curl -sf $AUTH "$KIBANA/api/status" 2>/dev/null | grep -q '"available"'; do
  echo "[kibana-setup] No disponible aún, reintentando en 10s..."
  sleep 10
done
echo "[kibana-setup] Kibana listo."

echo "[kibana-setup] Creando data view ${DATA_VIEW_TITLE} (${INDEX_PATTERN})..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" $AUTH \
  -X POST "$KIBANA/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d "{\"data_view\":{\"id\":\"${DATA_VIEW_ID}\",\"title\":\"${INDEX_PATTERN}\",\"name\":\"${DATA_VIEW_TITLE}\",\"timeFieldName\":\"@timestamp\"}}")

if [ "$HTTP" = "200" ]; then
  echo "[kibana-setup] Data view creado."
else
  echo "[kibana-setup] Data view ya existe o HTTP $HTTP — continuando."
fi

echo "[kibana-setup] Importando búsquedas guardadas..."
curl -sf $AUTH -X POST "$KIBANA/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F "file=@/setup/searches.ndjson" \
  && echo "[kibana-setup] Búsquedas importadas." \
  || echo "[kibana-setup] Error importando búsquedas (no crítico)."

echo "[kibana-setup] Importando dashboard..."
curl -sf $AUTH -X POST "$KIBANA/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F "file=@/setup/dashboard.ndjson" \
  && echo "[kibana-setup] Dashboard importado." \
  || echo "[kibana-setup] Error importando dashboard (no crítico)."

echo "[kibana-setup] Setup completado. Abre http://<host>:${KIBANA_PORT:-5601} → Dashboard → Bot Restaurantes."
