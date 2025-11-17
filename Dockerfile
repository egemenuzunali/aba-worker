# ============================================
# Stage 1: Build Stage
# ============================================
FROM node:22-alpine AS builder

# Set the working directory for the build
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install ALL dependencies (including devDependencies needed for build)
RUN yarn install --frozen-lockfile --production=false && yarn cache clean

# Copy source code
COPY . .

# Build the application (compiles TypeScript to JavaScript)
RUN yarn run build

# ============================================
# Stage 2: Production Runtime Stage
# ============================================
FROM node:22-alpine AS production

# Set the PATH for npm global packages
ENV PATH="/home/node/.npm-global/bin:${PATH}"
# Set the npm global install directory
ENV NPM_CONFIG_PREFIX="/home/node/.npm-global"
# Set NODE_ENV to production
ENV NODE_ENV=production

# Set the working directory for the app
WORKDIR /home/node/app

# Create the app directory and set ownership to the `node` user
RUN mkdir -p /home/node/app && chown -R node:node /home/node

# Switch to node user
USER node

# Copy package files
COPY --chown=node:node package.json yarn.lock ./

# Install ONLY production dependencies
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

# Copy built application from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist

# Expose the application port
EXPOSE 3000

# Start the app
CMD ["node", "/home/node/app/dist/index.js"]
