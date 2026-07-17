# ─────────────────────────────────────────────────────────────────────────────
# HydraGateway – Load Balancer
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
# Copy package files first so Docker caches the npm install layer
COPY packages/load-balancer/package.json ./packages/load-balancer/package.json
RUN cd packages/load-balancer && npm install --production

# ── Copy application source ───────────────────────────────────────────────────
COPY packages/load-balancer/src/ ./packages/load-balancer/src/

# ── Create log directory with correct ownership ──────────────────────────────
RUN mkdir -p /app/logs && chown -R hydra:hydra /app/logs

# Switch to non-root user
USER hydra

ENV LOG_DIR=/app/logs

EXPOSE 8080

WORKDIR /app/packages/load-balancer

CMD ["node", "src/server.js"]
