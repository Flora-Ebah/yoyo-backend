# Build stage
ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS builder
RUN apk add --no-cache make gcc g++ python3 linux-headers musl-dev
WORKDIR /usr/src/app
COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile --build-from-source --ignore-scripts

# Copy only necessary source files
COPY tsconfig*.json ./
COPY src/ ./src/
RUN yarn build

# Production stage
FROM ${NODE_IMAGE}
WORKDIR /usr/src/app

# Create non-root user and set up directories
RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /usr/src/app/src/public && \
    chown -R appuser:appgroup /usr/src/app

# Copy static assets
COPY --from=builder /usr/src/app/src/public ./src/public

# Install prod deps
COPY package*.json yarn.lock ./
RUN apk add --no-cache make gcc g++ python3 linux-headers musl-dev && \
    yarn install --frozen-lockfile --build-from-source --ignore-scripts --production && \
    apk del make gcc g++ python3 && \
    chown -R appuser:appgroup /usr/src/app

# Copy built assets
COPY --from=builder /usr/src/app/build ./build

# Copy seeder scripts (plain JS, no build step needed)
COPY seed.js load-env.js ./
COPY seeders/ ./seeders/

# Fichiers de données requis par les seeders (référentiel de catégories, etc.)
COPY src/config/category-taxonomy.json ./src/config/category-taxonomy.json

# Switch to non-root user
USER appuser

EXPOSE 3000
CMD ["node", "build/main.js"]
