# Multi-stage build for SnapFlow
# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

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
FROM denoland/deno:1.40-alpine

WORKDIR /app

# Install required packages
RUN apk add --no-cache openssl

# Create directories
RUN mkdir -p backend/data backend/uploads frontend/dist

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from builder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy production environment file
COPY .env.production ./backend/.env

# Set working directory to backend
WORKDIR /app/backend

# Cache dependencies
RUN deno cache src/main.ts

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD deno eval "const res = await fetch('http://localhost:8000/health'); if (!res.ok) throw new Error('Health check failed');"

# Start the application
CMD ["deno", "run", "--allow-all", "src/main.ts"]
