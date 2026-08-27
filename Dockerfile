# Multi-stage Dockerfile for Aether Messaging Platform

# Stage 1: Build Client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copy dependencies and pre-built artifacts
COPY backend/package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/data /app/uploads && chown -R node:node /app

COPY --from=backend-builder --chown=node:node /app/backend/dist ./dist
COPY --from=client-builder --chown=node:node /app/client/dist ./public

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
