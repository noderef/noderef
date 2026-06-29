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
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const GITHUB_API_RELEASE = 'https://api.github.com/repos/noderef/noderef/releases/latest';
const GITHUB_RELEASE_DOWNLOAD_PREFIX = 'https://github.com/noderef/noderef/releases/download/';
const RESOURCES_ASSET_NAME = 'noderef-resources.neu';
const MANIFEST_ASSET_NAME = 'update_manifest.json';

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
