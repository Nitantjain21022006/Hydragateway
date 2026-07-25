FROM node:20-alpine

WORKDIR /app

COPY packages/analytics-consumer/package.json ./packages/analytics-consumer/package.json
COPY shared/package.json ./shared/package.json

RUN cd packages/analytics-consumer && npm install --omit=dev
RUN cd shared && npm install --omit=dev

COPY shared/ ./shared/
COPY packages/analytics-consumer/ ./packages/analytics-consumer/

WORKDIR /app/packages/analytics-consumer

CMD ["node", "src/server.js"]
