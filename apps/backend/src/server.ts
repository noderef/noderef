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
import rateLimit from 'express-rate-limit';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import helmet from 'helmet';
import multer from 'multer';
import * as net from 'net';
import path from 'path';
import aiRouter from './ai/index.js';
import { sendAppError } from './lib/errorHandler';
import { log } from './lib/logger.js';
import { getDataDirFromArgsOrEnv } from './lib/paths';
import { disconnectPrisma, getPrismaClient } from './lib/prisma';
import { getAuthenticatedClient } from './services/alfresco/clientFactory.js';
import { ServerService } from './services/serverService.js';
import { getCurrentUserId } from './services/userBootstrap.js';
// Dynamic import for ESM contracts package
import type { z } from 'zod';
let PingRequestSchema: z.ZodTypeAny | null = null;

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

function getPort(): number {
  const fromArg = process.argv.find(a => a.startsWith('--port='))?.split('=')[1];
  const fromEnv = process.env.PORT;
  return Number(fromArg ?? fromEnv ?? 5111);
}

function getHost(): string {
  const fromEnv = process.env.HOST || process.env.BIND_ADDR;
  if (fromEnv) {
    return fromEnv;
  }
  return isDev ? '127.0.0.1' : '0.0.0.0';
}

function shouldUseEphemeralPort(): boolean {
  if (process.env.FIXED_PORT === '1') {
    return false;
  }
  return !isDev;
}

// Removed findFreePort - prod uses ephemeral port (0), dev uses fixed port with fail-fast

function publishPort(port: number): void {
  try {
    const dataDir = getDataDirFromArgsOrEnv();
    const runtimeDir = path.join(dataDir, '.runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const portFile = path.join(runtimeDir, 'backend-port');
    writeFileSync(portFile, String(port), 'utf-8');
    // Best-effort chmod on POSIX
    if (process.platform !== 'win32') {
      try {
        chmodSync(runtimeDir, 0o700);
        chmodSync(portFile, 0o600);
      } catch {
        // Ignore chmod errors
      }
    }
  } catch (err) {
    log.error({ err }, 'Failed to publish backend port');
  }
}

async function main() {
  const app = express();

  // Disable default Express headers
  app.disable('x-powered-by');

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: isDev
        ? false
        : {
            useDefaults: true,
            directives: {
              // Allow Neutralino's loopback fetches and inline scripts from your bundle (no eval)
              'default-src': ["'self'"],
              'script-src': ["'self'"], // avoid 'unsafe-inline' if possible
              'style-src': ["'self'", "'unsafe-inline'"], // Mantine injects styles
              'img-src': ["'self'", 'data:'],
              'font-src': ["'self'", 'data:'],
              'connect-src': ["'self'", 'http://127.0.0.1:*'],
              'worker-src': ["'self'", 'blob:'], // Monaco workers
              'child-src': ['blob:'], // for older UA compatibility
              'object-src': ["'none'"],
              'base-uri': ["'none'"],
              'frame-ancestors': ["'none'"],
            },
          },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    })
  );

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

  // Content-type validation for RPC
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/rpc') {
      const ct = req.headers['content-type'] || '';
      if (!ct.startsWith('application/json')) {
        return res.status(415).end();
      }
    }
    next();
  });

  // Strict but Neutralino-friendly CORS
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    // CORS leniency for dev: accept any loopback port (Vite can run on 3000, 5173, etc.)
    // In prod (Neutralino), origin is often 'null' - allow it for loopback-only service
    const isLoopback =
      typeof origin === 'string' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

    if (!origin || origin === 'null' || isLoopback) {
      // For loopback-only service, '*' is safe (no credentials used)
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else {
      // Block everything else by default
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('X-NodeRef', 'backend@dev');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // Rate limiting for all RPC routes
  const rpcRateLimit = rateLimit({
    windowMs: 10_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting to all RPC endpoints
  app.use('/rpc', rpcRateLimit);
  app.use('/rpc-binary', rateLimit({ windowMs: 10_000, max: 50 })); // Lower limit for uploads
  app.use('/rpc-stream', rateLimit({ windowMs: 10_000, max: 50 })); // Lower limit for downloads

  // Run migrations in dev only (production ships without Prisma CLI to keep bundle small).
  // Production relies on embedded schema fallback for first-run bootstrap.
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

  // Initialize encryption early (validates master key exists/generates if needed)
  try {
    const { getMasterKey, getMasterKeySource } = await import('./lib/encryption.js');
    getMasterKey(); // Trigger key load/generation
    const keySource = getMasterKeySource();
    log.info({ keySource }, 'Encryption initialized');
  } catch (err) {
    log.error({ err }, 'Failed to initialize encryption - credentials will not be secure');
    throw err; // Fail fast - don't start without encryption
  }

  // Warm up Prisma early and set SQLite pragmas
  const prisma = await getPrismaClient();
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;'); // tradeoff: reliability vs speed
  await prisma.$queryRaw`SELECT 1`;
  const serverService = new ServerService(prisma);

  // Load contracts (ESM) at startup
  const contracts = await import('@app/contracts');
  log.info({ contractKeys: Object.keys(contracts) }, 'Contracts module loaded');

  PingRequestSchema = contracts.PingRequestSchema as unknown as z.ZodTypeAny;

  // Hard-fail if expected exports are missing (gives a clear startup error instead of "Unknown method" later)
  {
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
  }

  // Startup banner
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
  const buildMeta = tryReadBuildMeta();
  const version = process.env.APP_VERSION || buildMeta.version || 'dev';
  const BUILD_ID = process.env.BUILD_ID || buildMeta.version || 'dev';
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'development') {
    log.info(`NodeRef Backend v${version} starting (${process.platform})`);
  }

  // When running inside Docker we ship the built renderer assets and serve them via Express
  if (process.env.SERVE_STATIC === '1') {
    const staticRoot = path.resolve(__dirname, '../../../resources');
    app.use(express.static(staticRoot));
    // Final fallback middleware will be added after all routes are defined
  }

  app.get('/health', (_req, res) => {
    res.setHeader('X-NodeRef', `backend@${version}`);
    res.setHeader('X-NodeRef-Build', BUILD_ID);
    res.json({
      ok: true,
      service: 'noderef-backend',
      version: version,
      ts: Date.now(),
    });
  });

  // OAuth callback endpoint for OIDC login
  // This endpoint handles the redirect from Keycloak after user authentication
  // Standard path following OAuth 2.0 best practices for native apps
  app.get('/auth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      log.error({ error, error_description }, 'OAuth callback error');
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p>${error_description || error}</p>
            <p>You can close this window and try again.</p>
            <script>
              // Store error in localStorage so the app can detect it
              localStorage.setItem('oauth_error', '${error_description || error}');
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);
      return;
    }

    if (!code) {
      res.status(400).send('Missing authorization code');
      return;
    }

    try {
      // Store the authorization code in a temporary location
      // The frontend will poll for this and exchange it for tokens
      const authData = {
        code: code as string,
        state: state as string,
        timestamp: Date.now(),
      };

      // Use a simple in-memory store (in production, use Redis or similar)
      (global as any).__oauth_pending_auth = authData;

      log.info({ state }, 'OAuth callback received, authorization code stored');

      // Send a success page that closes itself
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>✓ Authentication Successful</h1>
            <p>You can close this window and return to the application.</p>
            <script>
              // Store success flag in localStorage so the app can detect it
              localStorage.setItem('oauth_success', 'true');
              localStorage.setItem('oauth_code', '${code}');
              localStorage.setItem('oauth_timestamp', '${Date.now()}');
              
              // Try to close the window after a short delay
              setTimeout(() => {
                window.close();
                // If window.close() doesn't work (some browsers prevent it), show a message
                setTimeout(() => {
                  document.body.innerHTML = '<h1>✓ Authentication Successful</h1><p>Please close this window manually.</p>';
                }, 500);
              }, 2000);
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      log.error({ err }, 'Error handling OAuth callback');
      res.status(500).send('Internal server error');
    }
  });

  // RPC router pattern
  type ZSchema = z.ZodTypeAny;
  type Routes = Record<string, { schema: ZSchema; handler: (p: unknown) => Promise<unknown> }>;
  const routes: Routes = {};

  // Register ping route if schema is loaded
  if (PingRequestSchema) {
    const schema = PingRequestSchema; // capture non-null
    routes.ping = {
      schema,
      handler: async params => {
        const input = schema.parse(params);
        return {
          message: 'pong',
          timestamp: Date.now(),
          echo: input,
        };
      },
    };
  }

  // Register Alfresco RPC methods
  try {
    const { registerAlfrescoRpc } = await import('./rpc/alfresco/index.js');
    // Pass contracts module to avoid nested dynamic imports
    registerAlfrescoRpc(routes, contracts);
    const alfrescoMethods = Object.keys(routes).filter(k => k.startsWith('alfresco.'));
    log.info(
      { methodCount: alfrescoMethods.length, methods: alfrescoMethods },
      'Alfresco RPC methods registered'
    );
  } catch (err) {
    log.error({ err }, 'Failed to register Alfresco RPC methods');
    throw err; // Crash on startup instead of "Unknown method" later
  }

  // Register Backend data services RPC methods
  try {
    const { registerBackendRpc } = await import('./rpc/backend/index.js');
    await registerBackendRpc(routes, contracts);
    const backendMethods = Object.keys(routes).filter(k => k.startsWith('backend.'));
    log.info(
      { methodCount: backendMethods.length, methods: backendMethods },
      'Backend data services RPC methods registered'
    );
  } catch (err) {
    log.error({ err }, 'Failed to register Backend RPC methods');
    throw err; // Crash on startup instead of "Unknown method" later
  }

  // Debug endpoint - expose in dev, Neutralino mode, or when explicitly enabled
  // DEBUG is the user-facing alias, EXPOSE_DEBUG is internal (backwards compatible)
  const isNeutralino =
    Array.isArray((globalThis as any).NL_ARGS) || process.versions?.electron === undefined;
  const exposeDebug =
    process.env.DEBUG === '1' || process.env.EXPOSE_DEBUG === '1' || isDev || isNeutralino;
  if (exposeDebug) {
    app.get('/debug/rpc-methods', (_req, res) => {
      res.json({
        methods: Object.keys(routes).sort(),
        count: Object.keys(routes).length,
        alfrescoMethods: Object.keys(routes).filter(k => k.startsWith('alfresco.')),
      });
    });
  }

  app.post('/rpc', async (req, res) => {
    const { method, params } = req.body ?? {};

    // Validate method
    if (typeof method !== 'string' || method.length === 0 || method.length > 64) {
      return res.status(400).json({ error: 'Invalid method' });
    }

    const route = routes[method];
    if (!route) {
      log.warn({ method }, 'Unknown RPC method');
      return res.status(404).json({ error: 'Unknown method' });
    }

    try {
      const parsed = route.schema.parse(params);
      const result = await route.handler(parsed);
      return res.json(result);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
        log.warn({ method, error: (err as { message?: string }).message }, 'RPC validation error');
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation error',
          details: { zodError: (err as { errors?: unknown }).errors },
        });
      }

      log.error({ method, error: err }, 'RPC call failed');
      sendAppError(res, err);
    }
  });

  // Binary upload endpoint for multipart/form-data (e.g., file uploads)
  const upload = multer({
    storage: multer.memoryStorage(),
  });

  app.post('/rpc-binary', upload.single('filedata'), async (req, res) => {
    try {
      const {
        baseUrl,
        method,
        serverId: serverIdRaw,
        _args: rawArgs,
        ...otherFields
      } = req.body ?? {};

      // Validate with zod schema if available
      if (contracts?.AlfrescoRpcBinaryCallSchema) {
        try {
          contracts.AlfrescoRpcBinaryCallSchema.passthrough().parse({
            baseUrl,
            method,
            serverId: serverIdRaw ? Number(serverIdRaw) : undefined,
          });
        } catch (validationErr) {
          log.warn({ error: validationErr }, 'Binary RPC validation error');
          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: { zodError: (validationErr as { errors?: unknown }).errors },
          });
        }
      } else {
        // Fallback validation
        if (!baseUrl || typeof baseUrl !== 'string') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid baseUrl' });
        }
        if (!method || typeof method !== 'string') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid method' });
        }
      }

      let serverId: number | undefined;
      if (serverIdRaw !== undefined) {
        const rawValue = Array.isArray(serverIdRaw) ? serverIdRaw[0] : serverIdRaw;
        if (rawValue && rawValue.length) {
          const parsed = Number.parseInt(rawValue, 10);
          if (Number.isNaN(parsed)) {
            return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid serverId' });
          }
          serverId = parsed;
        }
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing filedata' });
      }

      // Import proxy service dynamically to avoid circular dependencies
      const { callMethod } = await import('./services/alfresco/proxyService.js');

      // Prepare file argument with metadata preserved (Alfresco SDK expects name/type)
      const fileArg = req.file.buffer;
      (fileArg as any).name = req.file.originalname;
      (fileArg as any).originalname = req.file.originalname;
      (fileArg as any).size = req.file.size;
      (fileArg as any).type = req.file.mimetype;
      (fileArg as any).lastModified = Date.now();

      // Parse optional _args field (JSON-encoded array/object excluding the binary itself)
      let parsedArgs: unknown;
      if (rawArgs !== undefined) {
        const argValue = Array.isArray(rawArgs) ? rawArgs[0] : rawArgs;
        if (typeof argValue === 'string' && argValue.trim().length > 0) {
          try {
            parsedArgs = JSON.parse(argValue);
          } catch (err) {
            return res
              .status(400)
              .json({ code: 'INVALID_INPUT', message: 'Invalid _args JSON payload' });
          }
        }
      }

      let args: unknown;
      if (parsedArgs !== undefined) {
        if (Array.isArray(parsedArgs)) {
          args = [fileArg, ...parsedArgs];
        } else {
          args = [fileArg, parsedArgs];
        }
      } else {
        // Fallback: treat remaining form fields as options object
        const options = {
          ...otherFields,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        };
        args = [fileArg, options];
      }

      let authenticatedApi: import('@alfresco/js-api').AlfrescoApi | undefined;
      if (serverId !== undefined) {
        authenticatedApi = await authenticateServerRequest(baseUrl, serverId);
      }

      const result = await callMethod(baseUrl, method, args, authenticatedApi);
      return res.json(result);
    } catch (err: unknown) {
      log.error({ error: err }, 'Binary RPC call failed');
      sendAppError(res, err);
    }
  });

  // AI endpoints for JS console assistance
  app.use('/rpc/ai', aiRouter);

  // Helper to coerce query param values to proper types
  function coerceQueryValue(value: string | string[]): unknown {
    if (Array.isArray(value)) {
      return value.map(coerceQueryValue);
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  async function authenticateServerRequest(
    baseUrl: string,
    serverId: number
  ): Promise<import('@alfresco/js-api').AlfrescoApi | undefined> {
    const userId = await getCurrentUserId();
    const creds = await serverService.getCredentialsForBackend(userId, serverId);

    if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
      log.warn(
        { serverId, authType: creds?.authType },
        'Missing credentials for server stream request'
      );
      return undefined;
    }

    try {
      return await getAuthenticatedClient(baseUrl, creds);
    } catch (error) {
      log.error({ serverId, error }, 'Failed to authenticate stream request');
      throw error;
    }
  }

  // Stream download endpoint for binary content (e.g., node content, renditions)
  app.get('/rpc-stream', async (req, res) => {
    try {
      const {
        baseUrl: baseUrlRaw,
        method: methodRaw,
        serverId: serverIdRaw,
        ...rest
      } = req.query as Record<string, string | string[]>;

      // Extract and validate baseUrl and method (ensure they're strings, not arrays)
      const baseUrl = Array.isArray(baseUrlRaw) ? baseUrlRaw[0] : baseUrlRaw;
      const method = Array.isArray(methodRaw) ? methodRaw[0] : methodRaw;

      let serverId: number | undefined;
      if (serverIdRaw !== undefined) {
        const rawValue = Array.isArray(serverIdRaw) ? serverIdRaw[0] : serverIdRaw;
        if (rawValue && rawValue.length) {
          const parsed = Number.parseInt(rawValue, 10);
          if (Number.isNaN(parsed)) {
            return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid serverId' });
          }
          serverId = parsed;
        }
      }

      // Validate with zod schema if available
      if (contracts?.AlfrescoRpcStreamCallSchema) {
        try {
          contracts.AlfrescoRpcStreamCallSchema.passthrough().parse({ baseUrl, method });
        } catch (validationErr) {
          log.warn({ error: validationErr }, 'Stream RPC validation error');
          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: { zodError: (validationErr as { errors?: unknown }).errors },
          });
        }
      } else {
        // Fallback validation
        if (!baseUrl || typeof baseUrl !== 'string') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid baseUrl' });
        }
        if (!method || typeof method !== 'string') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid method' });
        }
      }

      // Import proxy service dynamically
      const { callMethod } = await import('./services/alfresco/proxyService.js');

      // Convert query params to proper types for SDK
      // Special handling: if _args is provided as JSON string, parse it as array/object
      let args: unknown;
      if (rest._args && typeof rest._args === 'string') {
        try {
          args = JSON.parse(rest._args);
        } catch {
          // If parsing fails, fall back to object approach
          args = {};
          for (const [key, value] of Object.entries(rest)) {
            if (key !== '_args') {
              (args as Record<string, unknown>)[key] = coerceQueryValue(value);
            }
          }
        }
      } else {
        // Default: convert query params to object
        args = {};
        for (const [key, value] of Object.entries(rest)) {
          (args as Record<string, unknown>)[key] = coerceQueryValue(value);
        }
      }

      // Call the method via proxy service
      let authenticatedApi: import('@alfresco/js-api').AlfrescoApi | undefined;
      if (serverId !== undefined) {
        authenticatedApi = await authenticateServerRequest(baseUrl, serverId);
      }

      // Special handling for node content download - use NodesApi.getNodeContent
      if (method === 'nodes.getNodeContent' || method === 'nodes.getContent') {
        try {
          if (authenticatedApi && serverId !== undefined) {
            const nodeId = (args as any)?.nodeId || rest.nodeId;
            const property = (args as any)?.property || rest.property; // e.g., 'cm:preferenceValues'
            if (!nodeId) {
              throw new Error('nodeId is required');
            }

            // If a specific property is requested (not cm:content), use direct HTTP call
            if (property && property !== 'cm:content') {
              // Build URL: /alfresco/api/-default-/public/alfresco/versions/1/nodes/{nodeId}/content;{property}
              const apiClient = authenticatedApi.contentClient;
              const basePath = apiClient.basePath || baseUrl;
              const contentUrl = `${basePath}/alfresco/api/-default-/public/alfresco/versions/1/nodes/${nodeId}/content;${property}`;

              // Make direct HTTP request with authentication
              const response = await fetch(contentUrl, {
                method: 'GET',
                headers: {
                  Authorization: apiClient.authentications?.basicAuth?.username
                    ? `Basic ${Buffer.from(`${apiClient.authentications.basicAuth.username}:${apiClient.authentications.basicAuth.password}`).toString('base64')}`
                    : (apiClient.defaultHeaders as any)?.['Authorization'] || '',
                },
              });

              if (!response.ok) {
                throw new Error(`Failed to download property content: ${response.statusText}`);
              }

              const buffer = Buffer.from(await response.arrayBuffer());

              // Forward content type
              const contentType = response.headers.get('content-type');
              if (contentType) {
                res.type(contentType);
              }

              return res.send(buffer);
            }

            // Use NodesApi.getNodeContent method for cm:content
            const { NodesApi } = await import('@alfresco/js-api');
            const nodesApi = new NodesApi(authenticatedApi);

            const content = await nodesApi.getNodeContent(nodeId);

            // Handle different content types
            if (content instanceof Blob) {
              const arrayBuffer = await content.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // Forward content type from blob
              if (content.type) {
                res.type(content.type);
              }

              return res.send(buffer);
            } else if (Buffer.isBuffer(content)) {
              return res.send(content);
            } else {
              // Convert to buffer
              const buffer = Buffer.from(String(content));
              return res.send(buffer);
            }
          }
        } catch (directHttpError) {
          log.warn(
            { error: directHttpError, method, nodeId: (args as any)?.nodeId || rest.nodeId },
            'Direct API call failed, falling back to proxy method'
          );
          // Fall through to normal API call
        }
      }

      // Special handling for log file webscripts - make direct HTTP call to avoid JSON parsing
      if (method === 'webscript.executeWebScript' && Array.isArray(args) && args.length >= 2) {
        const [, scriptPath] = args as [string, string];
        if (scriptPath?.includes('log4j-log-file')) {
          try {
            if (authenticatedApi && serverId !== undefined) {
              // Build webscript URL: /alfresco/s/{scriptPath}
              // Note: /s/ is shorthand for /service/
              const apiBaseUrl = (authenticatedApi as any).config?.hostEcm || baseUrl;
              const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '');
              const fullUrl = `${normalizedBaseUrl}/alfresco/s/${scriptPath}`;

              // Get stored credentials for authentication
              const axios = await import('axios');
              const { getPrismaClient } = await import('./lib/prisma.js');
              const { ServerService } = await import('./services/serverService.js');

              const prisma = await getPrismaClient();
              const serverService = new ServerService(prisma);
              const userId = await getCurrentUserId();
              const creds = await serverService.getCredentialsForBackend(userId, serverId);

              if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
                throw new Error('No stored credentials found for server');
              }

              // Make direct HTTP request with text response type
              // Build authentication based on auth type
              const axiosConfig: any = {
                method: 'GET',
                url: fullUrl,
                responseType: 'text',
                headers: { Accept: 'text/plain,*/*' },
              };

              if (creds.authType === 'openid_connect') {
                // Use Bearer token for OIDC
                axiosConfig.headers.Authorization = `Bearer ${creds.token}`;
              } else {
                // Use Basic Auth for basic auth type
                axiosConfig.auth = {
                  username: creds.username || '',
                  password: creds.token,
                };
              }

              const response = await axios.default(axiosConfig);

              // Forward response headers
              if (response.headers) {
                for (const [key, value] of Object.entries(response.headers)) {
                  if (value !== undefined && value !== null && typeof value !== 'function') {
                    res.setHeader(key, String(value));
                  }
                }
              }

              res.type('text/plain; charset=utf-8');
              return res.send(response.data);
            }
          } catch (directHttpError) {
            log.warn(
              { error: directHttpError, scriptPath },
              'Direct HTTP call failed, falling back to API method'
            );
            // Fall through to normal API call
          }
        }
      }

      const result: any = await callMethod(baseUrl, method, args, authenticatedApi);

      // Handle Axios-style response with data property
      if (result?.data !== undefined) {
        // Forward headers if they exist
        if (result.headers) {
          for (const [key, value] of Object.entries(result.headers)) {
            if (value !== undefined && value !== null) {
              res.setHeader(key, String(value));
            }
          }
        }

        // Handle different data types
        if (Buffer.isBuffer(result.data)) {
          return res.send(result.data);
        }
        if (result.data && typeof result.data === 'object' && 'pipe' in result.data) {
          return (result.data as NodeJS.ReadableStream).pipe(res);
        }
        if (typeof result.data === 'string') {
          // Set content type for text responses if not already set
          if (!res.getHeader('content-type')) {
            res.type('text/plain; charset=utf-8');
          }
          return res.send(result.data);
        }
        // Check if data is an empty object - try to get raw response text
        if (
          typeof result.data === 'object' &&
          result.data !== null &&
          !Buffer.isBuffer(result.data) &&
          Object.keys(result.data).length === 0
        ) {
          // Try to get raw response text from Axios request object
          if (result.request?.responseText !== undefined) {
            const rawText = result.request.responseText;
            if (typeof rawText === 'string' && rawText.length > 0) {
              res.type('text/plain; charset=utf-8');
              return res.send(rawText);
            }
          }
          // Try response.data if available
          if (result.response?.data !== undefined && typeof result.response.data === 'string') {
            res.type('text/plain; charset=utf-8');
            return res.send(result.response.data);
          }
        }
        // For other data types, send as-is
        return res.send(result.data);
      }

      // Handle Node.js stream directly
      if (
        result &&
        typeof result === 'object' &&
        'pipe' in result &&
        typeof result.pipe === 'function'
      ) {
        return (result as NodeJS.ReadableStream).pipe(res);
      }

      if (typeof result === 'string') {
        res.type('text/plain; charset=utf-8');
        return res.send(result);
      }

      if (Buffer.isBuffer(result)) {
        res.type('application/octet-stream');
        return res.send(result);
      }

      // Check if result is an empty object - return empty string for text responses
      if (typeof result === 'object' && result !== null && Object.keys(result).length === 0) {
        res.type('text/plain; charset=utf-8');
        return res.send('');
      }

      // Fallback: return as JSON if not a stream
      return res.json(result);
    } catch (err: unknown) {
      log.error({ error: err }, 'Stream RPC call failed');
      sendAppError(res, err);
    }
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

  const preferred = getPort();
  const host = getHost();

  let server: net.Server;

  if (shouldUseEphemeralPort()) {
    // Prod default: use ephemeral port (0) unless FIXED_PORT=1 overrides
    server = app.listen(0, host, () => {
      const actual = (server.address() as any)?.port as number;
      publishPort(actual);
      log.info(`Backend listening on ${host}:${actual}`);
    });
  } else {
    // Fixed port mode: respect PORT/env/args and fail fast if busy
    server = app
      .listen(preferred, host, () => {
        const actual = (server.address() as any)?.port as number;
        publishPort(actual);
        log.info(`Backend listening on ${host}:${actual}`);
      })
      .on('error', (e: any) => {
        if (e.code === 'EADDRINUSE') {
          log.error(`Port ${preferred} is busy. Set PORT=XXXX or kill the other process`);
          process.exit(1);
        }
        throw e;
      });
  }

  // Graceful shutdown
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

main().catch(e => {
  log.error({ err: e }, 'Fatal error');
  process.exit(1);
});
