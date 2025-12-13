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

// Frontend RPC client for local HTTP backend
import { events, os } from '@neutralinojs/lib';
import {
  ensureNeutralinoReady,
  getBundledNodePath,
  getDataDir,
  getNLPath,
  isNeutralinoMode,
} from './neutralino';

const DEFAULT_PORT = 5111;

// Detect if we're running in Docker/SERVE_STATIC mode (frontend served by backend)
// In this case, use the current window location port instead of DEFAULT_PORT
function getInitialBackendURL(): string {
  // If running in browser (not Neutralino) and the page is served from a port (not file://),
  // assume the backend is on the same host:port
  if (typeof window !== 'undefined' && !isNeutralinoMode()) {
    const { protocol, hostname, port } = window.location;
    // Check if we're in a browser with http/https (not file://)
    if (protocol.startsWith('http') && hostname && port) {
      console.log(`[RPC] Docker mode detected: using backend at ${protocol}//${hostname}:${port}`);
      return `${protocol}//${hostname}:${port}`;
    }
  }
  // Default: Neutralino mode or dev mode
  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

let baseURL = getInitialBackendURL();
let started = false;
let backendReady = false;

const WINDOWS_DRIVE_REGEX = /^[A-Za-z]:/;
const enableDebugLogging = import.meta.env.DEV && !(window as any).NL_ARGS?.includes('--release');
const NEUTRALINO_RESOURCE_ATTEMPTS = 2;
const NEUTRALINO_RESOURCE_TIMEOUT_MS = 2500;
const NEUTRALINO_RESOURCE_RETRY_DELAY_MS = 150;

// Helper to log to both console and Neutralino log file
function debugLog(...args: unknown[]): void {
  if (!enableDebugLogging) {
    return;
  }
  const message = args
    .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');

  console.debug('[RPC]', ...args);

  // Also write to Neutralino log file if available
  try {
    const NL = (window as any).Neutralino;
    if (NL?.debug?.log) {
      NL.debug.log(`[DEBUG] ${message}`).catch(() => {});
    }
  } catch {
    // Ignore errors - logging is best effort
  }
}

function debugWarn(...args: unknown[]): void {
  if (!enableDebugLogging) {
    return;
  }
  console.warn(...args);
  try {
    const NL = (window as any).Neutralino;
    if (NL?.debug?.log) {
      NL.debug.log(`WARN: ${args.join(' ')}`).catch(() => {});
    }
  } catch {
    // Ignore errors - logging is best effort
  }
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function trimTrailingSlash(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

function parentPath(p: string): string {
  const trimmed = trimTrailingSlash(p);
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, idx);
}

function windowsPathDetected(nlPath: string): boolean {
  return (
    WINDOWS_DRIVE_REGEX.test(nlPath) ||
    nlPath.includes('\\') ||
    nlPath.toLowerCase().endsWith('.exe')
  );
}

async function tryGetNeutralinoResourcesPath(): Promise<string | null> {
  const NL = (window as any).Neutralino;
  if (!NL?.os) {
    console.error('[RPC] Neutralino.os not available for resources path lookup');
    return null;
  }

  for (let i = 1; i <= NEUTRALINO_RESOURCE_ATTEMPTS; i++) {
    try {
      debugLog(
        `[RPC] Attempting to get resources path via Neutralino API (attempt ${i}/${NEUTRALINO_RESOURCE_ATTEMPTS})`
      );
      const resourcesTimeout = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('resources path timeout')),
          NEUTRALINO_RESOURCE_TIMEOUT_MS
        );
      });
      const resourcesPath = await Promise.race([NL.os.getPath('resources'), resourcesTimeout]);
      debugLog('[RPC] Neutralino API resources path resolved:', resourcesPath);
      return resourcesPath;
    } catch (err) {
      console.error(`[RPC] Neutralino API resources path attempt ${i} failed:`, err);
      if (i === NEUTRALINO_RESOURCE_ATTEMPTS) {
        return null;
      }
      await wait(NEUTRALINO_RESOURCE_RETRY_DELAY_MS * i);
    }
  }
  return null;
}

async function checkFileExistsNative(absPath: string, isWindows: boolean): Promise<boolean> {
  try {
    if (isWindows) {
      const escaped = absPath.replace(/"/g, '""');
      const cmd = `cmd /c if exist "${escaped}" (echo TRUE) else (echo FALSE)`;
      const result = await os.execCommand(cmd, { background: false });
      const out =
        typeof result === 'string'
          ? result
          : `${result?.stdOut ?? ''}${result?.stdErr ?? ''}`.trim();
      return out.toUpperCase().includes('TRUE');
    }
    const escaped = absPath.replace(/'/g, "'\\''");
    const cmd = `sh -c 'if [ -e "${escaped}" ]; then echo TRUE; else echo FALSE; fi'`;
    const result = await os.execCommand(cmd, { background: false });
    const out =
      typeof result === 'string' ? result : `${result?.stdOut ?? ''}${result?.stdErr ?? ''}`.trim();
    return out.toUpperCase().includes('TRUE');
  } catch (error) {
    console.error('[RPC] checkFileExistsNative error for path:', absPath, error);
    return false;
  }
}

type BackendResolution = {
  backendPath: string;
  resolvedVia: string;
};

async function resolveBackendEntrypoint(options: {
  initialResourcesPath: string | null;
  nlPath: string;
  dataDir: string;
  isWindows: boolean;
}): Promise<BackendResolution> {
  const normalizedNlPath = normalizeSlashes(trimTrailingSlash(options.nlPath));
  const normalizedDataDir = normalizeSlashes(trimTrailingSlash(options.dataDir));

  type DirCandidate = { dir: string; reason: string };
  const dirCandidates: DirCandidate[] = [];
  const dirSeen = new Set<string>();
  const addDirCandidate = (dir: string | null, reason: string) => {
    if (!dir) return;
    const trimmed = trimTrailingSlash(dir);
    if (!trimmed) return;
    const normalized = normalizeSlashes(trimmed);
    if (dirSeen.has(normalized)) return;
    dirSeen.add(normalized);
    dirCandidates.push({ dir: normalized, reason });
  };

  addDirCandidate(options.initialResourcesPath, 'neutralino-api');
  addDirCandidate(normalizedNlPath, 'nlPath');
  addDirCandidate(parentPath(normalizedNlPath), 'nlPath-parent');
  addDirCandidate(parentPath(parentPath(normalizedNlPath)), 'nlPath-grandparent');
  addDirCandidate(normalizedDataDir, 'dataDir');
  addDirCandidate(parentPath(normalizedDataDir), 'dataDir-parent');

  const pathCandidates: Array<{ path: string; reason: string }> = [];
  const pathSeen = new Set<string>();
  const addPathCandidate = (path: string, reason: string) => {
    const normalized = normalizeSlashes(trimTrailingSlash(path));
    if (!normalized || pathSeen.has(normalized)) return;
    pathSeen.add(normalized);
    pathCandidates.push({ path: normalized, reason });
  };

  for (const candidate of dirCandidates) {
    addPathCandidate(`${candidate.dir}/node-src/dist/server.js`, `${candidate.reason}::node-src`);
    if (!candidate.dir.toLowerCase().endsWith('/resources')) {
      addPathCandidate(
        `${candidate.dir}/resources/node-src/dist/server.js`,
        `${candidate.reason}::resources/node-src`
      );
    }
  }

  for (const candidate of pathCandidates) {
    const fsPath = options.isWindows ? candidate.path.replace(/\//g, '\\') : candidate.path;
    const exists = await checkFileExistsNative(fsPath, options.isWindows);
    debugLog(
      '[RPC] Checking backend candidate:',
      fsPath,
      'exists:',
      exists,
      'source:',
      candidate.reason
    );
    if (exists) {
      debugLog('[RPC] Backend path resolved via', candidate.reason, '->', fsPath);
      return { backendPath: candidate.path, resolvedVia: candidate.reason };
    }
  }

  const fallbackPath = pathCandidates[0]?.path || `${normalizedNlPath}/node-src/dist/server.js`;
  // Note: This is not an error - the fallback path is typically correct, but file verification
  // may fail in dev mode or due to timing issues. The backend will still start correctly.
  debugLog('[RPC] Could not verify backend path via file check, using fallback:', fallbackPath);
  return { backendPath: fallbackPath, resolvedVia: 'fallback-unverified' };
}

// Detect production mode: check for --release flag, production env, or if running from .app bundle
const isProd =
  (window as any).NL_ARGS?.includes('--release') ||
  import.meta.env.MODE === 'production' ||
  (typeof (window as any).NL_PATH !== 'undefined' &&
    ((window as any).NL_PATH.includes('.app/Contents') ||
      (window as any).NL_PATH.includes('/Contents/')));

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Request timeout')), ms)),
  ]);
}

export async function readPublishedPortFromFile(): Promise<number | null> {
  const NL = (window as any).Neutralino;
  if (!NL?.os) {
    debugLog('[RPC] readPublishedPortFromFile: Neutralino.os not available');
    return null;
  }

  try {
    const dataDirTimeout = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('getDataDir() timed out')), 3000);
    });
    let dataDir = await Promise.race([getDataDir(), dataDirTimeout]);
    debugLog('[RPC] readPublishedPortFromFile: dataDir:', dataDir);

    // Ensure we're using the app-specific directory on all platforms
    const APP_ID = 'nl.noderef.desktop';
    if (!dataDir.endsWith(APP_ID)) {
      if (dataDir.includes('Application Support')) {
        // macOS
        dataDir = `${dataDir}/${APP_ID}`;
        debugLog('[RPC] readPublishedPortFromFile: Adjusted dataDir (macOS):', dataDir);
      } else {
        // Windows/Linux: Append APP_ID
        const pathSep = dataDir.includes('\\') ? '\\' : '/';
        dataDir = `${dataDir}${pathSep}${APP_ID}`;
        debugLog('[RPC] readPublishedPortFromFile: Adjusted dataDir (Windows/Linux):', dataDir);
      }
    }

    const nlPath = (window as any).NL_PATH || '';
    const isWindowsPlatform = windowsPathDetected(nlPath);
    const rawPortfilePath = `${dataDir}/.runtime/backend-port`;
    const normalizedPortfilePath = isWindowsPlatform
      ? rawPortfilePath.replace(/\//g, '\\')
      : rawPortfilePath;
    debugLog('[RPC] readPublishedPortFromFile: portfilePath:', normalizedPortfilePath);

    // Try using os.execCommand with cat/type (more reliable in production)
    try {
      const platform = isWindowsPlatform
        ? 'win32'
        : nlPath.includes('.app/Contents') || nlPath.includes('/Contents/')
          ? 'darwin'
          : 'linux';

      const pathForExec = platform === 'win32' ? normalizedPortfilePath : rawPortfilePath;
      const readCmd =
        platform === 'win32' ? `cmd /c type "${pathForExec}"` : `cat "${pathForExec}"`;
      const readFileTimeout = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 2000);
      });
      const result = await Promise.race([
        os.execCommand(readCmd, { background: false }),
        readFileTimeout,
      ]);

      if (typeof result !== 'string') {
        const execResult = result as any;
        if (execResult.exitCode !== 0 || execResult.stdErr) {
          return null;
        }
      }

      const txt = typeof result === 'string' ? result : (result as any).stdOut || '';
      const trimmed = String(txt).trim();
      debugLog('[RPC] readPublishedPortFromFile: file content:', trimmed);
      if (!trimmed) {
        debugLog('[RPC] readPublishedPortFromFile: file is empty');
        return null;
      }

      const n = Number(trimmed);
      if (Number.isFinite(n) && n > 0) {
        debugLog('[RPC] readPublishedPortFromFile: found port:', n);
        return n;
      }
      debugLog('[RPC] readPublishedPortFromFile: invalid port number:', trimmed);
      return null;
    } catch (execError) {
      // Fallback to filesystem API
      if (NL?.filesystem) {
        try {
          const readFileTimeout = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 2000);
          });
          const fsPath = isWindowsPlatform ? normalizedPortfilePath : rawPortfilePath;
          const txt = await Promise.race([NL.filesystem.readFile(fsPath), readFileTimeout]);
          const n = Number(String(txt).trim());
          if (Number.isFinite(n) && n > 0) {
            return n;
          }
        } catch {
          // Ignore fallback errors
        }
      }
      return null;
    }
  } catch (err) {
    // Silently fail - portfile may not exist yet
    return null;
  }
}

async function discoverPort(): Promise<number> {
  const isProd =
    import.meta.env.MODE === 'production' || (window as any).NL_ARGS?.includes('--release');

  // Docker/SERVE_STATIC mode: if frontend is served from backend, use that port
  if (typeof window !== 'undefined' && !isNeutralinoMode()) {
    const { protocol, hostname, port } = window.location;
    if (protocol.startsWith('http') && hostname && port) {
      const detectedPort = parseInt(port, 10);
      if (!isNaN(detectedPort)) {
        debugLog(`[RPC] Docker mode: using port ${detectedPort} from window.location`);
        return detectedPort;
      }
    }
  }

  // Try published port from file first (best signal - only in Neutralino mode)
  if (isNeutralinoMode()) {
    // Only log once per discoverPort call, not on every attempt
    // console.error('[RPC] In Neutralino mode, reading portfile...');
    try {
      const published = await readPublishedPortFromFile();
      // Only log if we found a port (reduce spam)
      if (published) {
        debugLog('[RPC] Portfile found with port:', published);
        try {
          // Add timeout to health check
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          const r = await fetch(`http://127.0.0.1:${published}/health`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (r.ok) {
            const info = await r.json().catch(() => ({}));
            const xNodeRef = r.headers.get('x-noderef');

            // Validation: X-NodeRef header is the strongest signal
            // If present and starts with 'backend@', it's our backend
            if (xNodeRef?.startsWith('backend@')) {
              debugLog(`[RPC] Found valid backend on port ${published} (X-NodeRef: ${xNodeRef})`);
              return published;
            }

            // Fallback: strict JSON validation (for backwards compatibility)
            const looksRight =
              info?.ok === true &&
              info?.service === 'noderef-backend' &&
              typeof info?.version === 'string' &&
              typeof info?.ts === 'number';

            if (looksRight) {
              debugLog(`[RPC] Found valid backend on port ${published} (JSON validation)`);
              return published;
            } else {
              debugWarn('[RPC] Portfile port found but validation failed:', { info, xNodeRef });
            }
          } else {
            debugWarn('[RPC] Portfile port health check failed:', r.status);
          }
        } catch (fetchError) {
          // Don't log every health check error - reduce spam
          // console.error('[RPC] Portfile port health check error:', fetchError);
          // Ignore and continue
        }
      }
      // Don't log "No portfile found" - it's expected during startup
    } catch (readError) {
      console.error('[RPC] Error reading portfile:', readError);
    }
  }

  // In prod, don't scan - only use portfile
  if (isProd) {
    debugLog('[RPC] Production mode: returning DEFAULT_PORT (no portfile found)');
    return DEFAULT_PORT; // Will fail, but that's better than connecting to wrong backend
  }

  // Dev only: Scan ports and validate we found the right backend
  for (let p = DEFAULT_PORT; p < DEFAULT_PORT + 200; p++) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/health`, { cache: 'no-store' });
      if (!r.ok) continue;

      const info = await r.json().catch(() => ({}));
      const xNodeRef = r.headers.get('x-noderef');

      // Strict validation - require all fields
      const looksRight =
        info?.ok === true &&
        info?.service === 'noderef-backend' &&
        typeof info?.version === 'string' &&
        typeof info?.ts === 'number';

      // X-NodeRef header is a strong signal
      if (!xNodeRef?.startsWith('backend@') && !looksRight) {
        continue; // Hard reject if neither condition is met
      }

      if (looksRight || xNodeRef?.startsWith('backend@')) {
        return p;
      }
    } catch {
      // Ignore fetch errors - port not available, continue scanning
      continue;
    }
  }
  return DEFAULT_PORT;
}

async function isAlive(url = baseURL): Promise<boolean> {
  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const r = await fetch(`${url}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!r.ok) return false;

    // Validate it's actually our backend
    const info = await r.json().catch(() => ({}));
    const xNodeRef = r.headers.get('x-noderef');

    // Must be our backend
    const isOurBackend =
      info?.ok === true &&
      info?.service === 'noderef-backend' &&
      typeof info?.version === 'string' &&
      (xNodeRef?.startsWith('backend@') || true);

    return isOurBackend;
  } catch {
    return false;
  }
}

/**
 * Wait for backend to become available (for browser mode where backend is started externally)
 * Kept because the diagnostics page imports it; it doesn't wait for anything.
 */
export async function waitForBackend(maxAttempts = 50, intervalMs = 200): Promise<void> {
  // If already ready, return immediately
  if (backendReady && (await isAlive())) {
    return;
  }

  for (let i = 0; i < maxAttempts; i++) {
    const discoveredPort = await discoverPort();
    const candidate = `http://127.0.0.1:${discoveredPort}`;

    if (await isAlive(candidate)) {
      baseURL = candidate;
      backendReady = true;
      return;
    }

    await wait(intervalMs);
  }

  debugWarn('[RPC] Backend did not become available within timeout');
  backendReady = false;
}

export async function startBackend(): Promise<void> {
  debugLog('[RPC] startBackend() called');
  // If already healthy, don't spawn
  const alreadyAlive = await isAlive();
  debugLog('[RPC] Backend already alive:', alreadyAlive);

  if (alreadyAlive) {
    try {
      const discoverTimeout = new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error('Port discovery timed out')), 3000);
      });
      const discoveredPort = await Promise.race([discoverPort(), discoverTimeout]);
      baseURL = `http://127.0.0.1:${discoveredPort}`;
      started = true;
      backendReady = true;
      debugLog('[RPC] Using existing backend on port:', discoveredPort);
      return;
    } catch {
      // Continue to start the backend if port discovery fails
      debugLog('[RPC] Port discovery failed, will start new backend');
    }
  }

  if (started) {
    debugLog('[RPC] Backend already started, skipping');
    return;
  }

  try {
    debugLog('[RPC] Ensuring Neutralino is ready...');
    await ensureNeutralinoReady();
    debugLog('[RPC] Neutralino ready');

    // Get Neutralino data path to hand to the backend
    let dataDir: string;
    try {
      debugLog('[RPC] Getting data directory...');
      const dataDirTimeout = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('getDataDir() timed out')), 3000);
      });
      dataDir = await Promise.race([getDataDir(), dataDirTimeout]);
      debugLog('[RPC] Raw dataDir:', dataDir);
      const APP_ID = 'nl.noderef.desktop';
      // Ensure we're using the app-specific directory on all platforms
      if (!dataDir.endsWith(APP_ID)) {
        // macOS: AppData/Roaming doesn't exist, but Application Support does
        if (dataDir.includes('Application Support')) {
          dataDir = `${dataDir}/${APP_ID}`;
          debugLog('[RPC] Adjusted dataDir (macOS):', dataDir);
        } else {
          // Windows/Linux: Append APP_ID to the base data directory
          // Use forward slashes for consistency (Node.js handles both)
          const pathSep = dataDir.includes('\\') ? '\\' : '/';
          dataDir = `${dataDir}${pathSep}${APP_ID}`;
          debugLog('[RPC] Adjusted dataDir (Windows/Linux):', dataDir);
        }
      }
      debugLog('[RPC] Final dataDir:', dataDir);
    } catch (dataDirError) {
      const errorMsg = dataDirError instanceof Error ? dataDirError.message : String(dataDirError);
      console.error('[RPC] Failed to get data directory:', errorMsg);
      throw new Error(`Failed to get data directory: ${errorMsg}`);
    }

    // Get app path - NL_PATH is set by Neutralino to the app directory
    let nlPath: string;
    try {
      debugLog('[RPC] Getting NL path...');
      const nlPathTimeout = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('getNLPath() timed out')), 2000);
      });
      nlPath = await Promise.race([getNLPath(), nlPathTimeout]);
      debugLog('[RPC] NL_PATH:', nlPath);
      debugLog('[RPC] NL_PATH from window:', (window as any).NL_PATH);
    } catch (nlPathError) {
      const errorMsg = nlPathError instanceof Error ? nlPathError.message : String(nlPathError);
      console.error('[RPC] Failed to get NL path:', errorMsg);
      throw new Error(`Failed to get NL path: ${errorMsg}`);
    }

    // Get resources path - in production, resources are extracted from resources.neu
    let resourcesPath: string;
    // Better Windows detection: check for drive letters (C:, D:, etc.) or backslashes or .exe
    const isWindows = windowsPathDetected(nlPath);
    const pathSep = isWindows ? '\\' : '/';
    debugLog('[RPC] isProd:', isProd);
    debugLog('[RPC] NL_PATH for detection:', nlPath);
    debugLog('[RPC] Detected Windows:', isWindows);
    debugLog('[RPC] Using path separator:', pathSep);

    try {
      if (isProd) {
        const apiResourcesPath = await tryGetNeutralinoResourcesPath();
        if (apiResourcesPath) {
          resourcesPath = apiResourcesPath;
        } else {
          console.error('[RPC] Failed to get resources path from Neutralino API, using heuristics');
          debugLog('[RPC] ===== ENTERING FALLBACK PATH RESOLUTION =====');
          debugLog('[RPC] Using fallback path resolution based on NL_PATH:', nlPath);
          debugLog('[RPC] nlPath type:', typeof nlPath);
          debugLog('[RPC] nlPath value:', nlPath);
          debugLog('[RPC] isWindows:', isWindows);
          debugLog('[RPC] pathSep:', pathSep);

          try {
            if (nlPath.includes('.app/Contents') || nlPath.includes('/Contents/Resources')) {
              resourcesPath = nlPath;
              debugLog('[RPC] Case 1: Using nlPath directly (macOS app bundle)');
            } else if (nlPath.includes('.app')) {
              resourcesPath = `${nlPath}${pathSep}Contents${pathSep}Resources`;
              debugLog('[RPC] Case 2: Constructing macOS app bundle path');
            } else {
              resourcesPath = `${nlPath}${pathSep}resources`;
              debugLog('[RPC] Case 3: Using standard resources directory (Windows/Linux)');
            }
            debugLog('[RPC] Fallback resources path RESOLVED:', resourcesPath);
          } catch (fallbackError) {
            console.error('[RPC] ERROR in fallback path resolution:', fallbackError);
            console.error(
              '[RPC] Fallback error stack:',
              fallbackError instanceof Error ? fallbackError.stack : 'No stack'
            );
            // Last resort fallback
            resourcesPath = `${nlPath}${pathSep}resources`;
            console.error('[RPC] Using last resort fallback path:', resourcesPath);
          }
          debugLog('[RPC] ===== EXITING FALLBACK PATH RESOLUTION =====');
        }
      } else {
        resourcesPath = `${nlPath}${pathSep}resources`;
        debugLog('[RPC] Dev mode resources path:', resourcesPath);
      }
    } catch (resourcesPathError) {
      console.error('[RPC] CRITICAL ERROR in resources path resolution:', resourcesPathError);
      console.error(
        '[RPC] Error stack:',
        resourcesPathError instanceof Error ? resourcesPathError.stack : 'No stack'
      );
      const emergencyPathSep = windowsPathDetected(nlPath) ? '\\' : '/';
      resourcesPath = `${nlPath}${emergencyPathSep}resources`;
      console.error('[RPC] Using emergency fallback resources path:', resourcesPath);
    }

    const { backendPath: resolvedBackendPath, resolvedVia } = await resolveBackendEntrypoint({
      initialResourcesPath: resourcesPath,
      nlPath,
      dataDir,
      isWindows,
    });
    const backendPath = resolvedBackendPath.replace(/\\/g, '/');
    debugLog('[RPC] Backend path (normalized):', backendPath);
    debugLog('[RPC] Backend path resolved via:', resolvedVia);
    debugLog('[RPC] Backend path (Windows format):', backendPath.replace(/\//g, pathSep));

    // Only build in dev
    if (!isProd) {
      const backendWorkspacePath = `${nlPath}/apps/backend`;
      const buildCmd = `cd "${backendWorkspacePath}" && pnpm --silent build`;
      try {
        await os.execCommand(buildCmd, { background: false });
      } catch {
        // Ignore build errors in dev mode
      }
    }

    // Resolve Node executable path
    // Priority: 1) NODE_EXE env var, 2) Bundled Node binary (production), 3) 'node' from PATH
    let nodeExe = 'node';
    debugLog('[RPC] Resolving Node executable...');

    try {
      const nodeExeEnv = (await os.getEnv('NODE_EXE')) || (await os.getEnv('NODEREF_NODE_EXE'));
      debugLog('[RPC] NODE_EXE env var:', nodeExeEnv);
      if (nodeExeEnv) {
        nodeExe = nodeExeEnv;
        debugLog('[RPC] Using Node from NODE_EXE:', nodeExe);
      } else if (isProd) {
        debugLog('[RPC] Production mode, checking for bundled Node...');
        const bundledNode = await getBundledNodePath();
        debugLog('[RPC] Bundled Node path:', bundledNode);
        if (bundledNode) {
          nodeExe = bundledNode;
          debugLog('[RPC] Using bundled Node:', nodeExe);
        }
      }
    } catch (error) {
      console.error('[RPC] Error resolving Node path:', error);
      // NODE_EXE not set, use default 'node' from PATH
    }

    debugLog('[RPC] Final Node executable:', nodeExe);

    // Verify node is available
    try {
      debugLog('[RPC] Verifying Node executable...');
      debugLog('[RPC] Node executable path to verify:', nodeExe);
      // Add timeout to prevent hanging
      const nodeCheckTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Node version check timeout')), 5000);
      });
      const versionResult = await Promise.race([
        os.execCommand(`${nodeExe} --version`, { background: false }),
        nodeCheckTimeout,
      ]);
      debugLog('[RPC] Node version check result:', versionResult);
    } catch (nodeCheckError) {
      console.error('[RPC] Node verification failed:', nodeCheckError);
      console.error(
        '[RPC] Node check error details:',
        nodeCheckError instanceof Error ? nodeCheckError.message : String(nodeCheckError)
      );
      // Don't throw - continue anyway, the execCommand will fail if node doesn't work
      console.error(
        '[RPC] Continuing despite Node check failure - will attempt to execute backend anyway'
      );
    }

    // In prod, use ephemeral port (0); in dev, use fixed port (5111)
    const portArg = isProd ? '0' : String(DEFAULT_PORT);

    // Set NODE_ENV=production in prod mode so backend uses ephemeral port
    // Use shell to properly set environment variable
    let cmd: string;
    if (isProd) {
      // Use shell to set NODE_ENV, then run the backend
      if (isWindows) {
        // Windows: use cmd /c to set env var
        // Properly quote nodeExe and paths, and escape quotes in paths
        const escapeWindowsPath = (p: string) => p.replace(/"/g, '""');
        const quotedNodeExe = `"${escapeWindowsPath(nodeExe)}"`;
        const quotedBackendPath = `"${escapeWindowsPath(backendPath)}"`;
        const quotedDataDir = `"${escapeWindowsPath(dataDir)}"`;
        // Redirect stderr to a log file so we can see backend errors
        // Create .runtime directory first, then log file
        const runtimeDir = `${dataDir}\\.runtime`;
        const logFile = `${runtimeDir}\\backend.log`;
        const quotedLogFile = `"${escapeWindowsPath(logFile)}"`;
        const quotedRuntimeDir = `"${escapeWindowsPath(runtimeDir)}"`;
        // Create .runtime directory if it doesn't exist, then redirect stderr to log file
        cmd = `cmd /c if not exist ${quotedRuntimeDir} mkdir ${quotedRuntimeDir} && set NODE_ENV=production && set MIGRATE_ON_START=1 && ${quotedNodeExe} ${quotedBackendPath} --port=${portArg} --dataDir=${quotedDataDir} 2>${quotedLogFile}`;
        debugLog('[RPC] Backend stderr will be logged to:', logFile);
      } else {
        // macOS/Linux: use sh -c to set env var
        // Escape single quotes in paths if needed, and use proper quoting
        const escapedBackendPath = backendPath.replace(/'/g, "'\\''");
        const escapedDataDir = dataDir.replace(/'/g, "'\\''");
        cmd = `sh -c 'MIGRATE_ON_START=1 NODE_ENV=production ${nodeExe} "${escapedBackendPath}" --port=${portArg} --dataDir="${escapedDataDir}"'`;
      }
    } else {
      // In dev mode, quote paths properly for Windows
      if (isWindows) {
        const escapeWindowsPath = (p: string) => p.replace(/"/g, '""');
        cmd = `"${escapeWindowsPath(nodeExe)}" "${escapeWindowsPath(backendPath)}" --port=${portArg} --dataDir="${escapeWindowsPath(dataDir)}"`;
      } else {
        cmd = `${nodeExe} "${backendPath}" --port=${portArg} --dataDir="${dataDir}"`;
      }
    }

    debugLog('[RPC] Command to execute:', cmd);
    try {
      // Verify the Node binary exists and is executable
      try {
        debugLog('[RPC] Pre-flight Node check...');
        await os.execCommand(`"${nodeExe}" --version`, { background: false });
        debugLog('[RPC] Pre-flight Node check passed');
      } catch (versionError) {
        const versionErrorMsg =
          versionError instanceof Error ? versionError.message : String(versionError);
        console.error('[RPC] Pre-flight Node check failed:', versionErrorMsg);
        throw new Error(`Node binary not executable: ${nodeExe}. Error: ${versionErrorMsg}`);
      }

      debugLog('[RPC] Executing backend command in background...');
      await os.execCommand(cmd, { background: true });
      debugLog('[RPC] Backend command executed successfully');
    } catch (execError) {
      const errorMsg = execError instanceof Error ? execError.message : String(execError);
      console.error('[RPC] Failed to execute backend command:', errorMsg);
      console.error('[RPC] Command was:', cmd);
      throw new Error(`Failed to execute backend command: ${errorMsg}`);
    }

    // Wait for health; in production, give more time for the backend to start and write the port file
    const maxAttempts = isProd ? 50 : 25;
    const intervalMs = isProd ? 300 : 200;
    debugLog(
      '[RPC] Waiting for backend to become healthy (max attempts:',
      maxAttempts,
      ', interval:',
      intervalMs,
      'ms)'
    );

    for (let i = 0; i < maxAttempts; i++) {
      if (i % 10 === 0) {
        debugLog(`[RPC] Health check attempt ${i + 1}/${maxAttempts}`);
      }
      const p = await discoverPort();
      const candidate = `http://127.0.0.1:${p}`;
      if (i % 10 === 0) {
        debugLog(`[RPC] Checking health at: ${candidate}`);
      }

      if (await isAlive(candidate)) {
        debugLog('[RPC] Backend is alive at:', candidate);
        baseURL = candidate;
        started = true;
        backendReady = true;
        return;
      }

      // In prod, check portfile directly
      if (isProd) {
        try {
          const portFromFile = await readPublishedPortFromFile();
          if (portFromFile) {
            debugLog('[RPC] Port from file:', portFromFile);
            const portfileCandidate = `http://127.0.0.1:${portFromFile}`;
            if (await isAlive(portfileCandidate)) {
              debugLog('[RPC] Backend is alive at portfile port:', portfileCandidate);
              baseURL = portfileCandidate;
              started = true;
              backendReady = true;
              return;
            }
          }
        } catch (error) {
          // Ignore portfile read errors
          if (i % 10 === 0) {
            debugLog('[RPC] Portfile read error (attempt', i + 1, '):', error);
          }
        }
      }

      await wait(intervalMs);
    }

    backendReady = false;
    console.error('[RPC] Backend did not become healthy after', maxAttempts, 'attempts');
    throw new Error('Backend did not become healthy in time');
  } catch (error) {
    backendReady = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[RPC] Failed to start backend:', errorMsg);
    console.error('[RPC] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

export async function rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
  try {
    const res = await withTimeout(
      fetch(`${baseURL}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params }),
      }),
      7000
    );

    // Read response as text first, then parse as JSON
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (parseError) {
      throw new Error(`HTTP ${res.status}: ${text || 'Invalid JSON response'}`);
    }

    // Check for error response from backend (backend sends { code, message, details } with non-2xx status)
    if (!res.ok) {
      const errorMessage = json?.message || json?.error || `HTTP ${res.status}`;
      const errorCode = json?.code;
      const errorDetails = json?.details;

      const error = new Error(errorMessage);
      if (errorCode) {
        (error as any).code = errorCode;
      }
      if (errorDetails) {
        (error as any).details = errorDetails;
      }
      throw error;
    }

    return json as T;
  } catch (error) {
    // Improve error logging to show actual error message
    if (error instanceof Error) {
      const errorInfo = {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
      };
      console.error(`[RPC] ${method} failed:`, errorInfo);
    } else {
      console.error(`[RPC] ${method} failed:`, error);
    }
    throw error;
  }
}

export function onBackendExit(handler: () => void) {
  events.on('serverOffline', handler);
}

/**
 * Set the backend URL explicitly (useful when discovered via diagnostics)
 * @param url The backend URL to use for RPC calls
 */
export function setBackendUrl(url: string): void {
  baseURL = url;
  backendReady = true;
  debugLog('[RPC] Backend URL set to:', baseURL);
}

/**
 * Get the current backend URL
 */
export function getBackendUrl(): string {
  return baseURL;
}

export function isBackendReady(): boolean {
  return backendReady;
}
