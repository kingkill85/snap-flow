# Multi-stage build for SnapFlow
# Stage 1: Build frontend
FROM docker.io/library/node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Stage 2: Backend runtime
FROM docker.io/denoland/deno:alpine

WORKDIR /app

# Install required packages including Python and build tools for bcrypt
RUN apk add --no-cache openssl python3 make g++

# Create directories
RUN mkdir -p backend/data backend/uploads frontend/dist

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from builder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Accept JWT_SECRET as build argument
ARG JWT_SECRET

# Create production environment file
RUN printf 'NODE_ENV=production\nPORT=8000\nJWT_SECRET=%s\nDATABASE_URL=./data/database.sqlite\nUPLOAD_DIR=./uploads\nCORS_ORIGIN=*\n' "$JWT_SECRET" > ./backend/.env

# Set working directory to backend
WORKDIR /app/backend

# Install dependencies with scripts allowed for bcrypt
RUN deno install --allow-scripts=npm:bcrypt --entrypoint src/main.ts

# Cache dependencies
RUN deno cache src/main.ts

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD deno eval "const res = await fetch('http://localhost:8000/health'); if (!res.ok) throw new Error('Health check failed');"

# Start the application
CMD ["deno", "run", "--allow-all", "src/main.ts"]
