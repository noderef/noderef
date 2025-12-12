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

import { events } from '@neutralinojs/lib';
import { ensureNeutralinoReady, getDataDir } from './neutralino';

/**
 * NOTE: This file contains code for a Node extension approach (window.NODE/extNode),
 * but the app currently uses HTTP RPC (see rpc.ts) instead.
 * This code is kept for potential future use but is not actively used.
 * Set VITE_ENABLE_NODE_EXTENSION=true to enable this path (not recommended).
 */
const ENABLE_NODE_EXTENSION = import.meta.env.VITE_ENABLE_NODE_EXTENSION === 'true';

// Declare global NodeExtension type
declare global {
  interface Window {
    NODE?: {
      run: (functionName: string, parameter?: unknown) => Promise<void>;
      stop: () => Promise<void>;
    };
  }
}

/**
 * Send a ping to the Node backend via extension (legacy/unused path)
 * @deprecated Use rpc() from rpc.ts instead
 */
export async function pingNode(data?: unknown): Promise<void> {
  if (!ENABLE_NODE_EXTENSION) {
    console.warn(
      '[IPC] pingNode called but Node extension is disabled. Use rpc() from rpc.ts instead.'
    );
    throw new Error('Node extension path is disabled. Use HTTP RPC instead.');
  }
  console.log('[IPC] pingNode called with data:', data);
  await ensureNeutralinoReady();

  if (!window.NODE) {
    const error = 'NodeExtension not initialized. Make sure node-extension.js is loaded.';
    console.error('[IPC]', error);
    throw new Error(error);
  }

  if (!window.Neutralino || !window.Neutralino.extensions) {
    const error = 'Neutralino.extensions not available';
    console.error('[IPC]', error);
    throw new Error(error);
  }

  const testData = data || { message: 'ping', timestamp: Date.now() };
  console.log('[IPC] Calling NODE.run("ping", ...) with data:', testData);

  // Verify extension is connected before sending
  try {
    if (window.Neutralino?.extensions?.getStats) {
      const stats = await window.Neutralino.extensions.getStats();
      if (!stats.connected?.includes('extNode')) {
        throw new Error(
          `Extension 'extNode' is not connected. Connected: ${stats.connected?.join(', ') || 'none'}`
        );
      }
      console.log('[IPC] Verified extNode is connected before sending ping');
    }
  } catch (error) {
    console.error('[IPC] Failed to verify extension connection:', error);
    throw error;
  }

  try {
    console.log('[IPC] About to call window.NODE.run()...');
    console.log('[IPC] window.NODE:', window.NODE);
    console.log('[IPC] window.NODE type:', typeof window.NODE);
    console.log('[IPC] window.NODE.run type:', typeof window.NODE?.run);
    console.log('[IPC] window.NODE constructor:', window.NODE?.constructor?.name);
    console.log('[IPC] window.NodeExtension:', typeof window.NodeExtension);

    // Direct test - try calling the method directly
    if (!window.NODE) {
      throw new Error('window.NODE is not defined');
    }

    if (typeof window.NODE.run !== 'function') {
      console.error('[IPC] window.NODE methods:', Object.keys(window.NODE));
      throw new Error(`window.NODE.run is not a function. Type: ${typeof window.NODE.run}`);
    }

    console.log('[IPC] Calling window.NODE.run() directly...');
    const result = await window.NODE.run('ping', testData);
    console.log('[IPC] NODE.run completed successfully, result:', result);
  } catch (error) {
    console.error('[IPC] NODE.run failed:', error);
    console.error('[IPC] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Listen for pong responses from the backend
 */
export function onPong(
  callback: (data: { message: string; timestamp: number; echo?: unknown }) => void
): void {
  events.on('rpc.pong', event => {
    callback(event.detail as { message: string; timestamp: number; echo?: unknown });
  });
}

/**
 * Handle app data path request from Node extension
 */
async function handleAppDataPathRequest() {
  try {
    await ensureNeutralinoReady();
    const dataPath = await getDataDir();

    // Send the path back to the Node extension (not just to our own window)
    if (window.Neutralino?.extensions?.dispatch) {
      await window.Neutralino.extensions.dispatch('extNode', 'rpc.appDataPath', { path: dataPath });
      console.log('IPC Client: Sent app data path to extension via extensions.dispatch:', dataPath);
    } else {
      console.warn(
        'IPC Client: Neutralino.extensions not available; cannot send appDataPath to extension'
      );
    }
  } catch (error) {
    console.error('IPC Client: Failed to get app data path:', error);
    // Still try to notify the extension about the failure
    try {
      if (window.Neutralino?.extensions?.dispatch) {
        await window.Neutralino.extensions.dispatch('extNode', 'rpc.appDataPath', {
          path: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } catch (e) {
      console.warn('IPC Client: Also failed to dispatch error to extension:', e);
    }
  }
}

/**
 * Initialize the IPC client and Neutralino (legacy/unused path)
 * @deprecated This is for the Node extension approach. The app uses HTTP RPC instead.
 */
export async function initIPC(): Promise<void> {
  if (!ENABLE_NODE_EXTENSION) {
    console.warn('[IPC] initIPC called but Node extension is disabled. HTTP RPC is used instead.');
    return;
  }
  console.log('IPC Client: Initializing...');

  try {
    await ensureNeutralinoReady();

    // Debug: Check extension stats
    try {
      if (
        window.Neutralino &&
        window.Neutralino.extensions &&
        window.Neutralino.extensions.getStats
      ) {
        const stats = await window.Neutralino.extensions.getStats();
        console.log('[IPC] Extension stats:', stats);
      }
    } catch (error) {
      console.warn('[IPC] Could not get extension stats:', error);
    }

    // Set up event listeners
    onPong(data => {
      console.log('[IPC] Received pong from backend:', data);
    });

    // Listen for app data path requests from the extension
    events.on('rpc.requestAppDataPath', async () => {
      await handleAppDataPathRequest();
    });

    console.log('IPC Client: Ready');
  } catch (error) {
    console.error('[IPC] IPC initialization failed:', error);
    throw error;
  }
}
