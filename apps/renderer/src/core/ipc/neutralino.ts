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

// Shared Neutralino initialization and utilities
import {
  app,
  events,
  init as neutralinoInit,
  window as neutralinoWindow,
  os,
} from '@neutralinojs/lib';

let ready = false;
let initPromise: Promise<void> | null = null;
let minimizeOnCloseSetup = false;

/**
 * Ensure Neutralino is initialized and ready
 */
export async function ensureNeutralinoReady(): Promise<void> {
  if (ready) {
    // Already ready, ensure minimize on close is set up
    setupMinimizeOnClose();
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Neutralino ready timeout'));
    }, 5000);

    events.on('ready', () => {
      clearTimeout(timeout);
      ready = true;

      // Set up minimize on close behavior
      setupMinimizeOnClose();

      resolve();
    });

    try {
      neutralinoInit();
    } catch (error) {
      // Already initialized, check if ready
      if (ready) {
        clearTimeout(timeout);
        setupMinimizeOnClose();
        resolve();
      } else {
        // Wait a bit for ready event
        setTimeout(() => {
          if (ready) {
            clearTimeout(timeout);
            setupMinimizeOnClose();
            resolve();
          }
        }, 100);
      }
    }
  });

  return initPromise;
}

/**
 * Check if running in Neutralino mode
 */
export const isNeutralinoMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!((window as any).NL_VERSION || (window as any).NL_PORT || (window as any).NL_TOKEN);
};

/**
 * Set up window close behavior
 * On Windows: properly exit the app when close button is clicked
 * On macOS/Linux: minimize to keep app running in background
 */
function setupMinimizeOnClose(): void {
  if (minimizeOnCloseSetup || !isNeutralinoMode()) {
    return;
  }

  minimizeOnCloseSetup = true;

  // Detect platform from NL_PATH to determine close behavior
  const nlPath = (window as any).NL_PATH || '';
  const isWindows =
    /^[A-Za-z]:/.test(nlPath) || // Drive letter (C:, D:, etc.)
    nlPath.includes('\\') || // Backslashes
    nlPath.toLowerCase().endsWith('.exe'); // .exe extension

  events.on('windowClose', async () => {
    try {
      if (isWindows) {
        // On Windows, exit the app completely
        await app.exit();
      } else {
        // On macOS/Linux, minimize to keep app running in background
        await neutralinoWindow.minimize();
      }
    } catch (error) {
      console.error('[Neutralino] Failed to handle window close:', error);
    }
  });
}

/**
 * Get the Neutralino data directory
 */
export async function getDataDir(): Promise<string> {
  await ensureNeutralinoReady();
  return os.getPath('data');
}

/**
 * Get the Neutralino app path (NL_PATH)
 */
export async function getNLPath(): Promise<string> {
  await ensureNeutralinoReady();
  return (window as any).NL_PATH || '.';
}

/**
 * Get the path to the bundled Node.js binary in production mode
 * Returns null if not in production or binary not found
 */
// Helper to log to both console and Neutralino log file
function debugLog(...args: unknown[]): void {
  const message = args
    .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');

  console.log(...args);

  try {
    const NL = (window as any).Neutralino;
    if (NL?.debug?.log) {
      NL.debug.log(message).catch(() => {
        // Ignore errors - logging is best effort
      });
    }
  } catch {
    // Ignore errors - logging is best effort
  }
}

export async function getBundledNodePath(): Promise<string | null> {
  debugLog('[Neutralino] getBundledNodePath() called');
  if (!isNeutralinoMode()) {
    debugLog('[Neutralino] Not in Neutralino mode, returning null');
    return null;
  }

  // Detect production mode: check for --release flag, production env, or if running from .app bundle
  const isProd =
    (window as any).NL_ARGS?.includes('--release') ||
    import.meta.env.MODE === 'production' ||
    (typeof (window as any).NL_PATH !== 'undefined' &&
      ((window as any).NL_PATH.includes('.app/Contents') ||
        (window as any).NL_PATH.includes('/Contents/')));

  debugLog('[Neutralino] isProd:', isProd);
  debugLog('[Neutralino] NL_ARGS:', (window as any).NL_ARGS);
  debugLog('[Neutralino] import.meta.env.MODE:', import.meta.env.MODE);

  if (!isProd) {
    debugLog('[Neutralino] Not in production mode, returning null');
    return null;
  }

  await ensureNeutralinoReady();
  const nlPath = await getNLPath();
  debugLog('[Neutralino] nlPath:', nlPath);

  // Infer platform from NL_PATH structure (most reliable method)
  // macOS: NL_PATH points to .app bundle, contains "Contents"
  // Windows: NL_PATH contains drive letter (C:, D:, etc.) or backslashes or .exe
  // Linux: Everything else
  let platform: string;
  if (nlPath.includes('.app/Contents') || nlPath.includes('/Contents/')) {
    platform = 'darwin';
  } else if (
    /^[A-Za-z]:/.test(nlPath) || // Drive letter (C:, D:, etc.)
    nlPath.includes('\\') || // Backslashes
    nlPath.toLowerCase().endsWith('.exe') // .exe extension
  ) {
    platform = 'win32';
  } else {
    platform = 'linux';
  }
  debugLog('[Neutralino] Detected platform:', platform);

  // Construct platform-specific paths
  let nodePath: string | null = null;

  if (platform === 'darwin' || platform === 'macos') {
    // macOS: Node binary is in Contents/Resources/node
    // NL_PATH can point to either:
    // 1. The .app bundle root: /path/to/NodeRef.app
    // 2. The Contents/Resources directory: /path/to/NodeRef.app/Contents/Resources
    if (nlPath.endsWith('/Contents/Resources')) {
      // NL_PATH already points to Contents/Resources directory
      nodePath = `${nlPath}/node`;
    } else if (nlPath.endsWith('.app') || nlPath.match(/\.app\/?$/)) {
      // NL_PATH points to .app bundle root, need to add Contents/Resources
      nodePath = `${nlPath}/Contents/Resources/node`;
    } else if (nlPath.includes('/Contents/Resources/')) {
      // NL_PATH includes Contents/Resources somewhere in the path, just append /node
      // Extract the Resources directory path
      const resourcesMatch = nlPath.match(/^(.*\/Contents\/Resources)/);
      if (resourcesMatch) {
        nodePath = `${resourcesMatch[1]}/node`;
      } else {
        nodePath = `${nlPath}/node`;
      }
    } else {
      // Fallback: assume we're in Contents/Resources
      nodePath = `${nlPath}/node`;
    }
  } else if (platform === 'win32' || platform === 'windows') {
    // Windows: Node binary is node.exe in the same directory as the app
    // Handle both forward and backslash paths
    const normalizedNlPath = nlPath.replace(/\\/g, '/');
    nodePath = `${normalizedNlPath}/node.exe`;
    debugLog('[Neutralino] Windows Node path:', nodePath);
  } else if (platform === 'linux') {
    // Linux: Node binary is 'node' in the app directory
    // For Linux, NL_PATH might point to the app directory (e.g., /usr/share/noderef/NodeRef)
    nodePath = `${nlPath}/node`;
    debugLog('[Neutralino] Linux Node path:', nodePath);
  }

  if (!nodePath) {
    debugLog('[Neutralino] No nodePath constructed, returning null');
    return null;
  }

  debugLog('[Neutralino] Returning bundled Node path:', nodePath);
  // Try to verify the binary exists by attempting to read its directory
  // We can't easily check if a file exists, so we'll let execCommand handle it
  // and fall back if it fails
  return nodePath;
}

/**
 * Ensure backend is started using Neutralino's spawnProcess
 * This is the reliable way to start the backend in packaged apps
 *
 * Note: This is a fallback. The main backend startup is handled by startBackend() in rpc.ts
 * which has better error handling and bundled Node binary detection.
 */
export async function ensureBackendStarted(): Promise<void> {
  const NL = (window as any).Neutralino;
  if (!NL?.os) return; // browser dev

  try {
    const dataDir = await NL.os.getPath('data');
    let resourcesDir: string;
    try {
      resourcesDir = await NL.os.getPath('resources');
    } catch {
      // Fallback: construct from NL_PATH
      const nlPath = (window as any).NL_PATH || '.';
      if (nlPath.includes('.app/Contents')) {
        const appPath = nlPath.substring(0, nlPath.indexOf('.app') + 4);
        resourcesDir = `${appPath}/Contents/Resources`;
      } else {
        resourcesDir = `${nlPath}/resources`;
      }
    }

    const serverJs = `${resourcesDir}/node-src/dist/server.js`;

    // Detect production mode and use bundled Node binary if available
    const isProd =
      (window as any).NL_ARGS?.includes('--release') ||
      import.meta.env.MODE === 'production' ||
      (typeof (window as any).NL_PATH !== 'undefined' &&
        ((window as any).NL_PATH.includes('.app/Contents') ||
          (window as any).NL_PATH.includes('/Contents/')));

    let nodeExe = 'node';
    if (isProd) {
      const nlPath = (window as any).NL_PATH || '.';
      if (nlPath.includes('.app/Contents')) {
        // macOS: Node binary is in Contents/Resources/node
        // NL_PATH is usually .../NodeRef.app/Contents/MacOS
        const appPath = nlPath.substring(0, nlPath.indexOf('.app') + 4);
        nodeExe = `${appPath}/Contents/Resources/node`;
      } else if (nlPath.includes('\\')) {
        // Windows: Node binary is node.exe in the same directory
        nodeExe = `${nlPath}/node.exe`;
      } else {
        // Linux: Node binary is 'node' in the app directory
        nodeExe = `${nlPath}/node`;
      }
      console.log(`[Neutralino] Using bundled Node binary: ${nodeExe}`);
    }

    try {
      // Start Node in background with the Neutralino data dir and ephemeral port
      await NL.os.spawnProcess(nodeExe, [serverJs, `--dataDir=${dataDir}`, '--port=0'], {
        background: true,
      });
      console.log('[Neutralino] Backend spawn command executed');
    } catch (spawnError) {
      // If it's already running, spawnProcess can throw; ignore.
      console.warn('[Neutralino] spawnProcess error (may be already running):', spawnError);
    }
  } catch (error) {
    // Don't throw - let the app continue, but log the error
    console.error('[Neutralino] Failed to start backend:', error);
  }
}
