# ─────────────────────────────────────────────────────────────────────────────
# HydraGateway – Dashboard (React + Vite)
# Multi-stage build:
#   Stage 1 (builder) – install deps & build production bundle
#   Stage 2 (runner)  – serve static files via Nginx (no Node in final image)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDeps for vite build)
COPY packages/dashboard/package.json ./package.json
RUN npm install

# Copy the source code
COPY packages/dashboard/ ./

# Build the production bundle → output goes to /app/dist
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Remove default nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy built React app from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our custom Nginx config
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
