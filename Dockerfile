# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-slim

# Baileys necesita openssl para las operaciones criptográficas
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar dependencias del build stage
COPY --from=builder /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Usuario sin privilegios para mayor seguridad
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 3001

# Health check integrado
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "index.js"]
