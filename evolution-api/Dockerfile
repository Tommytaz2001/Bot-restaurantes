FROM atendai/evolution-api:v1.8.7

# ── Patch: soporte para WhatsApp LID format ─────────────────────────────────
# WhatsApp ahora usa LID (Linked ID) en lugar de números de teléfono para
# identificar contactos. Evolution API v1.8.x llama onWhatsApp() antes de enviar,
# lo cual falla para JIDs con @lid porque onWhatsApp solo funciona con números.
#
# Este parche agrega @lid a la lista de excepciones del chequeo de existencia,
# igual que @g.us (grupos) y @broadcast ya están exentos.
RUN sed -i "s/!isWA.jid.includes('@broadcast')/!isWA.jid.includes('@broadcast') \&\& !isWA.jid.includes('@lid')/g" \
    /evolution/dist/src/api/services/channels/whatsapp.baileys.service.js
