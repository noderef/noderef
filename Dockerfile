# syntax=docker/dockerfile:1.7

# -------- Build stage --------
FROM node:22-alpine AS build

ARG TARGETPLATFORM

RUN corepack enable

WORKDIR /app

ENV DATABASE_URL="file:/tmp/dev.db" CI="true"

# Copy manifests for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/backend/package.json apps/backend/
COPY apps/renderer/package.json apps/renderer/
COPY scripts ./scripts

# Install dependencies and build
ENV PNPM_STORE_PATH=/root/.pnpm-store
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .

RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/root/.pnpm-store \
    pnpm --filter @app/backend prisma:generate && \
    pnpm --filter @app/contracts build && \
    pnpm --filter @app/renderer build && \
    pnpm --filter @app/backend build && \
    pnpm --filter @app/backend build:bundle

# Copy Prisma client to bundled server location
RUN rm -rf resources/node-src/node_modules && \
    mkdir -p resources/node-src/node_modules && \
    if [ -d apps/backend/node_modules/@prisma ]; then \
      cp -R apps/backend/node_modules/@prisma resources/node-src/node_modules/; \
    elif [ -d node_modules/@prisma ]; then \
      cp -R node_modules/@prisma resources/node-src/node_modules/; \
    fi && \
    if [ -d apps/backend/node_modules/.prisma ]; then \
      cp -R apps/backend/node_modules/.prisma resources/node-src/node_modules/; \
    elif [ -d node_modules/.prisma ]; then \
      cp -R node_modules/.prisma resources/node-src/node_modules/; \
    fi && \
    if [ -f resources/node-src/node_modules/@prisma/client/index.js ] && \
       grep -q "module.exports = {}" resources/node-src/node_modules/@prisma/client/index.js 2>/dev/null; then \
      echo "try { module.exports = require('.prisma/client'); } catch (e) { console.error('Failed to load Prisma client:', e.message); module.exports = {}; }" > \
        resources/node-src/node_modules/@prisma/client/index.js; \
    fi

# -------- Production dependencies stage --------
FROM node:22-alpine AS deps

ARG TARGETPLATFORM

RUN corepack enable

WORKDIR /build

ENV DATABASE_URL="file:/tmp/dev.db" CI="true"

# Copy workspace config and build contracts
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/src packages/contracts/src
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY apps/backend/package.json apps/backend/package.json
COPY scripts ./scripts

ENV PNPM_STORE_PATH=/root/.pnpm-store
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --filter @app/contracts && \
    pnpm --filter @app/contracts build || true

# Deploy production dependencies
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/root/.pnpm-store \
    pnpm --filter @app/backend --prod deploy --legacy /deploy && \
    rm -rf /build/node_modules

# Generate Prisma client
COPY apps/backend/prisma /deploy/prisma
RUN cd /deploy && ./node_modules/.bin/prisma generate

# Cleanup: Remove non-Linux Prisma engines (keep only linux-musl for Alpine)
# Also remove unused database WASM files (keep only SQLite since that's what we use)
RUN find /deploy/node_modules -type f \
      \( -name "*darwin*" -o -name "*windows*" -o -name "*debian*" -o -name "*linux-arm64-openssl-1.1*" -o -name "*linux-arm64-openssl-3.0.x*" -o -name "*.exe" -o -name "*.dylib*" -o -name "query_engine-windows.dll.node" -o -name "introspection-engine-*" -o -name "schema-engine-*" -o -name "prisma-fmt-*" -o -name "migration-engine-*" \) \
      ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /deploy/node_modules -type f -path "*/prisma/build/*.wasm" \
      ! -name "*sqlite*" ! -name "prisma_schema_build_bg.wasm" ! -name "schema_engine_bg.wasm" \
      -delete 2>/dev/null || true && \
    rm -rf /deploy/node_modules/.pnpm/typescript@* 2>/dev/null || true

# Fix Prisma client index.js if needed
RUN [ -f /deploy/node_modules/@prisma/client/index.js ] && \
    grep -q "module.exports = {}" /deploy/node_modules/@prisma/client/index.js 2>/dev/null && \
    echo "try { module.exports = require('.prisma/client'); } catch (e) { console.error('Failed to load Prisma client:', e.message); module.exports = {}; }" > \
      /deploy/node_modules/@prisma/client/index.js || true

# Cleanup: Remove frontend dependencies that shouldn't be in backend (saves ~25MB)
# These are pulled in via root package.json but not needed for backend runtime
RUN rm -rf /deploy/node_modules/.pnpm/@mantine* /deploy/node_modules/.pnpm/react-dom* \
      /deploy/node_modules/.pnpm/react@* /deploy/node_modules/.pnpm/@esbuild* \
      /deploy/node_modules/.pnpm/react-transition-group* /deploy/node_modules/.pnpm/react-number-format* \
      /deploy/node_modules/.pnpm/node_modules/@mantine* /deploy/node_modules/.pnpm/node_modules/react-dom* \
      /deploy/node_modules/.pnpm/node_modules/react@* /deploy/node_modules/.pnpm/node_modules/@esbuild* 2>/dev/null || true

# Cleanup: Remove unnecessary files (source maps, tests, docs, etc.)
# Preserve Prisma CLI and client files (WASM, runtime, etc.)
RUN find /deploy/node_modules -type f \
      \( -name "*.map" -o -name "*.ts" -o -name "*.tsbuildinfo" -o -name "*.d.ts" -o -name "*.node.map" -o -name "README*" -o -name "CHANGELOG*" -o -name "LICENSE*" -o -name "*.md" -o -name "NOTICE*" -o -name "yarn.lock" -o -name "pnpm-lock.yaml" -o -name "package-lock.json" -o -name ".npmignore" -o -name ".yarn-integrity" \) \
      ! -path "*/@prisma/client/runtime/*" ! -path "*/prisma/*" ! -path "*/.pnpm/prisma@*" -delete 2>/dev/null || true && \
    find /deploy/node_modules -type f -name "*.wasm" \
      ! -path "*/@prisma/client/*" ! -path "*/prisma/*" ! -path "*/.pnpm/prisma@*" -delete 2>/dev/null || true && \
    find /deploy/node_modules -type d \
      \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "doc" -o -name "example" -o -name "examples" -o -name ".github" -o -name ".git" -o -name ".vscode" -o -name ".idea" -o -name "coverage" \) \
      -exec rm -rf {} + 2>/dev/null || true && \
    rm -rf /deploy/node_modules/.pnpm/.tmp /deploy/node_modules/.pnpm/.store && \
    find /deploy/node_modules/.pnpm -name "*.tgz" -delete 2>/dev/null || true

# -------- Runtime image --------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production PORT=5111 HOST=0.0.0.0 FIXED_PORT=1 SERVE_STATIC=1 DATABASE_URL=file:/data/NodeRef.db

RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data

WORKDIR /app

# Copy production dependencies and built artifacts
COPY --from=deps --chown=app:app /deploy/node_modules ./apps/backend/node_modules
COPY --from=deps --chown=app:app /deploy/package.json ./apps/backend/package.json
COPY --from=deps --chown=app:app /deploy/prisma ./apps/backend/prisma
COPY --from=build --chown=app:app /app/resources ./resources
COPY --from=build --chown=app:app /app/package.json ./package.json

# Link Prisma client to bundled server and cleanup
RUN rm -rf /app/resources/node-src/node_modules/@prisma /app/resources/node-src/node_modules/.prisma && \
    ln -s /app/apps/backend/node_modules/.pnpm/@prisma+client@*/node_modules/@prisma /app/resources/node-src/node_modules/@prisma && \
    ln -s /app/apps/backend/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma /app/resources/node-src/node_modules/.prisma && \
    find /app/resources -type f \( -name "*.map" -o -name "*.d.ts" -o -name "*.ts" -o -name ".DS_Store" -o -name "*.log" \) \
      ! -path "*/node_modules/@prisma/client/runtime/*" -delete 2>/dev/null || true && \
    find /app -type d -empty -delete 2>/dev/null || true

VOLUME ["/data"]
EXPOSE 5111

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5111) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

USER app

CMD ["sh", "-c", "node -e \"require('child_process').execSync('./node_modules/.bin/prisma migrate deploy', { stdio: 'inherit', cwd: 'apps/backend' });\" && node resources/node-src/dist/server.js --port=${PORT}"]
