# ─────────────────────────────────────────────────────────────────────────────
# HydraGateway – API Gateway
# Base: node:20-alpine (small, production-safe)
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

# Good practice: run as non-root
RUN addgroup -S hydra && adduser -S hydra -G hydra

WORKDIR /app

# ── Copy shared utilities (required by all services) ─────────────────────────
COPY shared/ ./shared/
RUN cd shared && npm install --production

# ── Install dependencies ──────────────────────────────────────────────────────
COPY packages/gateway/package.json ./packages/gateway/package.json
RUN cd packages/gateway && npm install --production

# ── Copy application source ───────────────────────────────────────────────────
COPY packages/gateway/src/ ./packages/gateway/src/

# ── Create log directory with correct ownership ──────────────────────────────
RUN mkdir -p /app/logs && chown -R hydra:hydra /app/logs

# Switch to non-root user
USER hydra

EXPOSE 3000

WORKDIR /app/packages/gateway

CMD ["node", "src/server.js"]
