# ─────────────────────────────────────────────────────────────────────────────
# HydraGateway – Payment Service
# Base: node:20-alpine
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

RUN addgroup -S hydra && adduser -S hydra -G hydra

WORKDIR /app

# ── Copy shared utilities ─────────────────────────────────────────────────────
COPY shared/ ./shared/

# ── Install dependencies ──────────────────────────────────────────────────────
COPY packages/payment-service/package.json ./packages/payment-service/package.json
RUN cd packages/payment-service && npm install --production

# ── Copy application source ───────────────────────────────────────────────────
COPY packages/payment-service/src/ ./packages/payment-service/src/

USER hydra

EXPOSE 4003

WORKDIR /app/packages/payment-service

CMD ["node", "src/server.js"]
