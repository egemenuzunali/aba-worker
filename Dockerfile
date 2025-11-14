# Multi-stage build for production
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Create app directory with proper permissions
WORKDIR /home/node/app

# Copy package files first for better layer caching
COPY package*.json yarn.lock* ./

# Switch to root to fix permissions, then back to node
USER root
RUN chown -R node:node /home/node/app

# Install dependencies as node user
USER node
RUN yarn install --frozen-lockfile --production=false

# Copy source code and set ownership
COPY --chown=node:node . .

# Build the application
RUN yarn run build

# Production stage
FROM node:22-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aba-worker -u 1001

# Create app directory
WORKDIR /home/aba-worker/app

# Copy package files
COPY package*.json yarn.lock* ./

# Switch to root to fix permissions
USER root
RUN chown -R aba-worker:nodejs /home/aba-worker/app

# Install only production dependencies
USER aba-worker
RUN yarn install --frozen-lockfile --production=true && \
    yarn cache clean

# Copy built application from builder stage
COPY --from=builder --chown=aba-worker:nodejs /home/node/app/dist ./dist

# Add metadata labels
LABEL maintainer="Concept Team Gemeente Amsterdam <conceptteam@amsterdam.nl>" \
      version="1.0.4" \
      description="ABA Worker microservice for APK synchronization"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const port = process.env.PORT || 3000; require('http').get('http://localhost:' + port + '/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]