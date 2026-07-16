# ─────────────────────────────────────────────────────────────────────────────
# HydraGateway – Product Service
# Base: node:20-alpine
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

RUN addgroup -S hydra && adduser -S hydra -G hydra

WORKDIR /app

# ── Copy shared utilities ─────────────────────────────────────────────────────
COPY shared/ ./shared/

# ── Install dependencies ──────────────────────────────────────────────────────
COPY packages/product-service/package.json ./packages/product-service/package.json
RUN cd packages/product-service && npm install --production

# ── Copy application source ───────────────────────────────────────────────────
COPY packages/product-service/src/ ./packages/product-service/src/

USER hydra

EXPOSE 4002

WORKDIR /app/packages/product-service

CMD ["node", "src/server.js"]
