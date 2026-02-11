/**
 * Copyright 2025 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// apps/backend/src/server.ts
// Load env first
import 'dotenv/config';

import compression from 'compression';
import express from 'express';
import { existsSync, readFileSync } from 'fs';
import * as net from 'net';
import path from 'path';
import { log } from './lib/logger.js';
import {
  getHost,
  getPort,
  getPreferredPortRange,
  listenWithFallback,
  publishPort,
  shouldUseEphemeralPort,
  tryListen,
} from './lib/port.js';
import { disconnectPrisma, getPrismaClient } from './lib/prisma.js';
import { corsMiddleware } from './middleware/cors.js';
import { applySecurityMiddleware } from './middleware/security.js';
import { registerRoutes, type Routes } from './routes/index.js';
import { ServerService } from './services/serverService.js';

const isDev = process.env.NODE_ENV !== 'production';

// Safety net: catch uncaught exceptions
// In dev: log and continue
// In prod: log and exit to let supervisor/container restart
process.on('uncaughtException', err => {
  log.error({ err }, 'Uncaught exception - process will exit in production');
  if (!isDev) {
    process.exit(1);
  }
});

function isTransientNetworkFailure(reason: unknown): boolean {
  const code =
    (reason as any)?.code || (reason as any)?.error?.code || (reason as any)?.cause?.code;
  const message = typeof (reason as any)?.message === 'string' ? (reason as any).message : '';
  const status =
    (reason as any)?.status ??
    (reason as any)?.statusCode ??
    (reason as any)?.response?.status ??
    (reason as any)?.response?.statusCode;

  const transientCodes = [
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ETIMEDOUT',
  ];

  return (
    transientCodes.includes(code) ||
    transientCodes.some(c => message.includes(c)) ||
    message.includes('connect ECONNREFUSED') ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function isExpectedAuthFailure(reason: unknown): boolean {
  const status =
    (reason as any)?.status ??
    (reason as any)?.statusCode ??
    (reason as any)?.response?.status ??
    (reason as any)?.response?.statusCode;
  const message = typeof (reason as any)?.message === 'string' ? (reason as any).message : '';
  const errorKey =
    (reason as any)?.error?.errorKey ??
    (reason as any)?.response?.body?.error?.errorKey ??
    (reason as any)?.response?.error?.errorKey;

  return (
    status === 401 ||
    status === 403 ||
    /login failed/i.test(message) ||
    /authentication failed/i.test(message) ||
    errorKey === 'Login failed'
  );
}

process.on('unhandledRejection', (reason: unknown) => {
  // Connection refusals are expected when user adds an offline server; keep the process alive.
  if (isTransientNetworkFailure(reason)) {
    log.warn({ reason }, 'Non-fatal network error (unhandled rejection)');
    return;
  }

  if (isExpectedAuthFailure(reason)) {
    log.warn({ reason }, 'Non-fatal auth error (unhandled rejection)');
    return;
  }

  log.error({ reason }, 'Unhandled promise rejection - process will exit in production');
  if (!isDev) {
    process.exit(1);
  }
});

/**
 * Read build metadata from resources/build-meta.json
 */
function tryReadBuildMeta(): { version?: string } {
  try {
    // In dev, resources/ sits at projectRoot/resources; after build it's bundled next to neutralino resources.
    // Walk up to find the nearest resources/build-meta.json
    let cur = __dirname;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(cur, '../../resources/build-meta.json'); // relative to resources/node-src/dist
      if (existsSync(candidate)) {
        return JSON.parse(readFileSync(candidate, 'utf8'));
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  } catch {
    // Ignore errors when reading build-meta.json (file may not exist in all environments)
    void 0; // Intentional no-op to satisfy no-empty rule
  }
  return {};
}

/**
 * Run Prisma migrations in development mode
 */
async function runMigrations(): Promise<void> {
  if (isDev || process.env.PRISMA_RUN_MIGRATIONS === '1') {
    try {
      const { execSync } = await import('child_process');
      const backendRoot = path.resolve(process.cwd(), 'apps/backend');
      const prismaCmd = process.platform === 'win32' ? 'npx prisma.cmd' : 'npx prisma';
      execSync(`${prismaCmd} migrate deploy`, {
        stdio: 'inherit',
        cwd: backendRoot,
      });
      log.info('Prisma migrations deployed successfully');
    } catch (e) {
      log.error({ err: e }, 'Prisma migrate deploy failed');
      // Continue but log the error - app can run read-only if migrations fail
    }
  }
}

/**
 * Initialize encryption (validates master key exists/generates if needed)
 */
async function initializeEncryption(): Promise<void> {
  try {
    const { getMasterKey, getMasterKeySource } = await import('./lib/encryption.js');
    getMasterKey(); // Trigger key load/generation
    const keySource = getMasterKeySource();
    log.info({ keySource }, 'Encryption initialized');
  } catch (err) {
    log.error({ err }, 'Failed to initialize encryption - credentials will not be secure');
    throw err; // Fail fast - don't start without encryption
  }
}

/**
 * Initialize Prisma and set SQLite pragmas
 */
async function initializePrisma(): Promise<
  ReturnType<typeof getPrismaClient> extends Promise<infer T> ? T : never
> {
  const prisma = await getPrismaClient();
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;'); // tradeoff: reliability vs speed
  await prisma.$queryRaw`SELECT 1`;
  return prisma;
}

/**
 * Load and validate contracts module
 */
async function loadContracts(): Promise<any> {
  const contracts = await import('@app/contracts');
  log.info({ contractKeys: Object.keys(contracts) }, 'Contracts module loaded');

  // Hard-fail if expected exports are missing (gives a clear startup error instead of "Unknown method" later)
  const required = [
    'LoginReqSchema',
    'LogoutReqSchema',
    'AlfrescoRpcCallSchema',
    'ConfigureOAuth2ReqSchema',
    'ExchangeOAuth2TokenReqSchema',
  ] as const;

  const missing = required.filter(k => !(k in contracts));
  if (missing.length) {
    throw new Error(`Contracts missing exports: ${missing.join(', ')}`);
  }

  return contracts;
}

/**
 * Start the server and bind to port
 */
async function startServer(app: express.Express): Promise<net.Server> {
  const preferred = getPort();
  const host = getHost();
  const portRange = getPreferredPortRange();

  let server: net.Server;

  if (shouldUseEphemeralPort() && portRange && preferred === 0) {
    // Production with port range: try preferred range first, then fall back to OS-assigned
    const result = await listenWithFallback(app, host, portRange);
    server = result.server;
    publishPort(result.port);
    log.info(`Backend listening on ${host}:${result.port}`);
  } else if (shouldUseEphemeralPort()) {
    // Prod default without port range: use ephemeral port (0) unless FIXED_PORT=1 overrides
    server = app.listen(0, host, () => {
      const actual = (server.address() as any)?.port as number;
      publishPort(actual);
      log.info(`Backend listening on ${host}:${actual}`);
    });
  } else {
    // Fixed port mode: respect PORT/env/args and fail fast if busy
    const result = await tryListen(app, preferred, host);
    if (!result.success || !result.server) {
      log.error(`Port ${preferred} is busy. Set PORT=XXXX or kill the other process`);
      process.exit(1);
    }
    server = result.server;
    publishPort(result.actualPort!);
    log.info(`Backend listening on ${host}:${result.actualPort}`);
  }

  return server;
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(server: net.Server): void {
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Received shutdown signal');
    server.close(async () => {
      await disconnectPrisma();
      log.info('Backend shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Main server entry point
 */
async function main() {
  const app = express();

  // Apply security middleware (helmet, rate limiting, content-type validation)
  applySecurityMiddleware(app);

  // Compression
  app.use(compression());

  // Allow larger JSON payloads for local file uploads (front-end capped at 250MB)
  app.use(express.json({ limit: '260mb' }));

  // Request logging (dev only)
  if (isDev) {
    app.use((req, _res, next) => {
      log.info({ method: req.method, url: req.url }, 'http');
      next();
    });
  }

  // CORS middleware
  app.use(corsMiddleware());

  // Run migrations in dev only
  await runMigrations();

  // Initialize encryption
  await initializeEncryption();

  // Initialize Prisma
  const prisma = await initializePrisma();
  const serverService = new ServerService(prisma);

  // Bootstrap server from environment variables (Docker only)
  if (process.env.SERVE_STATIC === '1') {
    const { bootstrapServerFromEnv } = await import('./services/serverBootstrap.js');
    await bootstrapServerFromEnv(serverService);
  }

  // Load contracts
  const contracts = await loadContracts();

  // Build metadata
  const buildMeta = tryReadBuildMeta();
  const version = process.env.APP_VERSION || buildMeta.version || 'dev';
  const BUILD_ID = process.env.BUILD_ID || buildMeta.version || 'dev';
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'development') {
    log.info(`NodeRef Backend v${version} starting (${process.platform})`);
  }

  // Static file serving for Docker deployments
  if (process.env.SERVE_STATIC === '1') {
    const staticRoot = path.resolve(__dirname, '../../../resources');
    app.use(express.static(staticRoot));
  }

  // RPC routes
  const routes: Routes = {};
  const isNeutralino = Array.isArray((globalThis as any).NL_ARGS);
  const exposeDebug =
    process.env.DEBUG === '1' || process.env.EXPOSE_DEBUG === '1' || isDev || isNeutralino;

  await registerRoutes({
    app,
    routes,
    contracts,
    serverService,
    version,
    buildId: BUILD_ID,
    exposeDebug,
  });

  // Final fallback for SPA: serve index.html for everything except API routes
  if (process.env.SERVE_STATIC === '1') {
    const staticRoot = path.resolve(__dirname, '../../../resources');
    app.use((req, res, next) => {
      if (
        req.path.startsWith('/rpc') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/debug')
      ) {
        return next();
      }
      res.sendFile(path.join(staticRoot, 'index.html'));
    });
  }

  // Start server
  const server = await startServer(app);

  // Setup graceful shutdown
  setupShutdownHandlers(server);
}

main().catch(e => {
  log.error({ err: e }, 'Fatal error');
  process.exit(1);
});
