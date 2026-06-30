/**
 * Copyright 2025-2026 NodeRef
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

/**
 * Proxies GitHub release updater assets for the desktop app.
 * The Neutralino webview cannot follow GitHub release redirects due to CORS.
 */

import type { RequestHandler } from 'express';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REQUIRED_ARCHIVE_ENTRY = 'node-src/dist/server.bundle.js';

const GITHUB_API_RELEASE = 'https://api.github.com/repos/noderef/noderef/releases/latest';
const GITHUB_RELEASE_DOWNLOAD_PREFIX = 'https://github.com/noderef/noderef/releases/download/';
const RESOURCES_ASSET_NAME = 'noderef-resources.neu';
const BACKEND_ASSET_NAME = 'noderef-backend.tar.gz';
const MANIFEST_ASSET_NAME = 'update_manifest.json';
const RESOURCES_TARGET_FILENAME = 'resources.neu';

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubLatestRelease {
  assets?: GitHubReleaseAsset[];
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NodeRef-Updater',
  };
}

async function fetchLatestRelease(): Promise<GitHubLatestRelease> {
  const response = await fetch(GITHUB_API_RELEASE, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub API failed (${response.status})`);
  }
  return (await response.json()) as GitHubLatestRelease;
}

function findAssetUrl(release: GitHubLatestRelease, assetName: string): string {
  const asset = release.assets?.find(item => item.name === assetName);
  const url = asset?.browser_download_url;
  if (!url) {
    throw new Error(`Release asset not found: ${assetName}`);
  }
  return url;
}

export function isAllowedResourcesUrl(url: string): boolean {
  return url.startsWith(GITHUB_RELEASE_DOWNLOAD_PREFIX) && url.endsWith(`/${RESOURCES_ASSET_NAME}`);
}

export function isAllowedBackendUrl(url: string): boolean {
  return url.startsWith(GITHUB_RELEASE_DOWNLOAD_PREFIX) && url.endsWith(`/${BACKEND_ASSET_NAME}`);
}

export async function isValidBackendTargetDir(targetDir: string): Promise<boolean> {
  if (!targetDir || targetDir.includes('\0')) {
    return false;
  }
  try {
    const resourcesNeu = join(targetDir, RESOURCES_TARGET_FILENAME);
    const resourcesStat = await stat(resourcesNeu);
    return resourcesStat.isFile();
  } catch {
    return false;
  }
}

export function updatesManifestHandler(): RequestHandler {
  return async (_req, res) => {
    try {
      const release = await fetchLatestRelease();
      const manifestUrl = findAssetUrl(release, MANIFEST_ASSET_NAME);
      const response = await fetch(manifestUrl, { redirect: 'follow' });
      if (!response.ok) {
        res
          .status(502)
          .json({ code: 'MANIFEST_FETCH_FAILED', message: 'Manifest download failed' });
        return;
      }

      const body = await response.text();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Manifest fetch failed';
      res.status(502).json({ code: 'MANIFEST_FETCH_FAILED', message });
    }
  };
}

export function updatesResourcesHandler(): RequestHandler {
  return async (req, res) => {
    const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!isAllowedResourcesUrl(url)) {
      res.status(400).json({ code: 'INVALID_RESOURCES_URL', message: 'Invalid resources URL' });
      return;
    }

    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok || !response.body) {
        res
          .status(502)
          .json({ code: 'RESOURCES_FETCH_FAILED', message: 'Resources download failed' });
        return;
      }

      const contentLength = response.headers.get('Content-Length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');

      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
      await pipeline(nodeStream, res);
    } catch (error) {
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : 'Resources fetch failed';
        res.status(502).json({ code: 'RESOURCES_FETCH_FAILED', message });
      }
    }
  };
}

interface DownloadRequestBody {
  url?: unknown;
  targetPath?: unknown;
}

/**
 * Downloads the resources bundle and writes it straight to disk on the Node
 * side, streaming NDJSON progress back to the renderer. Writing the file here
 * avoids base64-encoding tens of megabytes through the Neutralino IPC bridge,
 * which froze the desktop UI during the update flow.
 */
export function updatesDownloadHandler(): RequestHandler {
  return async (req, res) => {
    const body = (req.body ?? {}) as DownloadRequestBody;
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const targetPath = typeof body.targetPath === 'string' ? body.targetPath.trim() : '';

    if (!isAllowedResourcesUrl(url)) {
      res.status(400).json({ code: 'INVALID_RESOURCES_URL', message: 'Invalid resources URL' });
      return;
    }
    if (!targetPath || basename(targetPath) !== RESOURCES_TARGET_FILENAME) {
      res.status(400).json({ code: 'INVALID_TARGET_PATH', message: 'Invalid target path' });
      return;
    }

    let response: Response;
    try {
      response = await fetch(url, { redirect: 'follow' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resources download failed';
      res.status(502).json({ code: 'RESOURCES_DOWNLOAD_FAILED', message });
      return;
    }

    if (!response.ok || !response.body) {
      res
        .status(502)
        .json({ code: 'RESOURCES_DOWNLOAD_FAILED', message: 'Resources download failed' });
      return;
    }

    const totalHeader = response.headers.get('Content-Length');
    const parsedTotal = totalHeader ? Number.parseInt(totalHeader, 10) : NaN;
    const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const writeEvent = (event: Record<string, unknown>): void => {
      res.write(`${JSON.stringify(event)}\n`);
    };

    const tempPath = `${targetPath}.download`;
    let loaded = 0;
    let lastEmit = 0;

    try {
      await mkdir(dirname(targetPath), { recursive: true });

      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
      nodeStream.on('data', (chunk: Buffer) => {
        loaded += chunk.length;
        const now = Date.now();
        if (now - lastEmit >= 100) {
          lastEmit = now;
          writeEvent({ type: 'progress', loaded, total });
        }
      });

      await pipeline(nodeStream, createWriteStream(tempPath));
      await rename(tempPath, targetPath);

      writeEvent({ type: 'progress', loaded, total: total ?? loaded });
      writeEvent({ type: 'done', loaded });
      res.end();
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      const message = error instanceof Error ? error.message : 'Resources download failed';
      if (!res.headersSent) {
        res.status(502).json({ code: 'RESOURCES_DOWNLOAD_FAILED', message });
      } else {
        writeEvent({ type: 'error', message });
        res.end();
      }
    }
  };
}

interface BackendDownloadRequestBody {
  url?: unknown;
  targetDir?: unknown;
}

/**
 * Downloads the backend tarball and overlays it into the app Resources directory.
 * Preserves the installed `node` binary and `node-src/node_modules` (Prisma engine).
 */
export function updatesDownloadBackendHandler(): RequestHandler {
  return async (req, res) => {
    const body = (req.body ?? {}) as BackendDownloadRequestBody;
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const targetDir = typeof body.targetDir === 'string' ? body.targetDir.trim() : '';

    if (!isAllowedBackendUrl(url)) {
      res.status(400).json({ code: 'INVALID_BACKEND_URL', message: 'Invalid backend URL' });
      return;
    }
    if (!targetDir || !(await isValidBackendTargetDir(targetDir))) {
      res.status(400).json({ code: 'INVALID_TARGET_DIR', message: 'Invalid target directory' });
      return;
    }

    let response: Response;
    try {
      response = await fetch(url, { redirect: 'follow' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend download failed';
      res.status(502).json({ code: 'BACKEND_DOWNLOAD_FAILED', message });
      return;
    }

    if (!response.ok || !response.body) {
      res.status(502).json({ code: 'BACKEND_DOWNLOAD_FAILED', message: 'Backend download failed' });
      return;
    }

    const totalHeader = response.headers.get('Content-Length');
    const parsedTotal = totalHeader ? Number.parseInt(totalHeader, 10) : NaN;
    const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const writeEvent = (event: Record<string, unknown>): void => {
      res.write(`${JSON.stringify(event)}\n`);
    };

    const stagingDir = join(targetDir, '.backend-update');
    const tarballPath = join(stagingDir, 'backend.tgz');
    let loaded = 0;
    let lastEmit = 0;

    try {
      await rm(stagingDir, { recursive: true, force: true });
      await mkdir(stagingDir, { recursive: true });

      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
      nodeStream.on('data', (chunk: Buffer) => {
        loaded += chunk.length;
        const now = Date.now();
        if (now - lastEmit >= 100) {
          lastEmit = now;
          writeEvent({ type: 'progress', loaded, total, phase: 'downloading' });
        }
      });

      await pipeline(nodeStream, createWriteStream(tarballPath));

      writeEvent({ type: 'progress', loaded, total: total ?? loaded, phase: 'writing' });

      // Verify the archive is the backend bundle before overwriting anything on disk.
      const { stdout: listing } = await execFileAsync('tar', ['-tzf', tarballPath]);
      const entries = listing.split('\n').map(entry => entry.replace(/^\.\//, '').trim());
      if (!entries.includes(REQUIRED_ARCHIVE_ENTRY)) {
        throw new Error('Invalid backend archive: missing server.bundle.js');
      }

      // Overlay the archive over the app Resources dir. tar only writes archived
      // paths (node-src/, resources/), so node_modules and the node binary survive.
      await execFileAsync('tar', ['-xzf', tarballPath, '-C', targetDir]);

      writeEvent({ type: 'progress', loaded, total: total ?? loaded, phase: 'writing' });
      writeEvent({ type: 'done', loaded });
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend update failed';
      if (!res.headersSent) {
        res.status(502).json({ code: 'BACKEND_UPDATE_FAILED', message });
      } else {
        writeEvent({ type: 'error', message });
        res.end();
      }
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}
