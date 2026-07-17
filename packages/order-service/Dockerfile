# ─────────────────────────────────────────────────────────────────────────────
# HydraGateway – Order Service
# Base: node:20-alpine
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

RUN addgroup -S hydra && adduser -S hydra -G hydra

WORKDIR /app

# ── Copy shared utilities ─────────────────────────────────────────────────────
COPY shared/ ./shared/
RUN cd shared && npm install --production

# ── Install dependencies ──────────────────────────────────────────────────────
COPY packages/order-service/package.json ./packages/order-service/package.json
RUN cd packages/order-service && npm install --production

# ── Copy application source ───────────────────────────────────────────────────
COPY packages/order-service/src/ ./packages/order-service/src/

# ── Create log directory with correct ownership ──────────────────────────────
RUN mkdir -p /app/logs && chown -R hydra:hydra /app/logs

USER hydra

EXPOSE 4004

WORKDIR /app/packages/order-service

CMD ["node", "src/server.js"]
