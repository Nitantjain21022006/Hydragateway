# ─────────────────────────────────────────────────────────────────────────────
# HydraGateway – Auth Service
# Base: node:20-alpine
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

RUN addgroup -S hydra && adduser -S hydra -G hydra

WORKDIR /app

# ── Copy shared utilities ─────────────────────────────────────────────────────
COPY shared/ ./shared/

# ── Install dependencies ──────────────────────────────────────────────────────
COPY packages/auth-service/package.json ./packages/auth-service/package.json
RUN cd packages/auth-service && npm install --production

# ── Copy application source ───────────────────────────────────────────────────
COPY packages/auth-service/src/ ./packages/auth-service/src/

USER hydra

EXPOSE 4001

WORKDIR /app/packages/auth-service

CMD ["node", "src/server.js"]
