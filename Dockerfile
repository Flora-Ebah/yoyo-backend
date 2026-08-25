# Build stage
FROM node:20.15.1-alpine AS builder
RUN apk add --no-cache make gcc g++ python3 linux-headers musl-dev
WORKDIR /usr/src/app
COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile --build-from-source --ignore-scripts

# Copy only necessary source files
COPY tsconfig*.json ./
COPY src/ ./src/
RUN yarn build

# Production stage
FROM node:20.15.1-alpine 
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

# [SÉCURITÉ B-05 / F-08] L'image copiait ici `.env.sample` comme configuration réelle. Elle
# embarquait donc les secrets d'exemple — clé de signature des jetons et compte administrateur par
# défaut — dans chaque conteneur. La configuration doit être injectée à l'exécution
# (variables d'environnement ou secrets de l'orchestrateur), jamais empaquetée dans l'image.
# Le processus refuse de démarrer en production si un secret publié est encore en place
# (`src/config/security-check.ts`).

# Switch to non-root user
USER appuser

EXPOSE 3000
CMD ["node", "build/main.js"]
