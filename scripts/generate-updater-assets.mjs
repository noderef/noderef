#!/usr/bin/env node

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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const APP_ID = 'nl.noderef.desktop';
const GITHUB_REPO = 'noderef/noderef';
const RESOURCES_ASSET_NAME = 'noderef-resources.neu';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeVersion(input) {
  return String(input ?? '')
    .trim()
    .replace(/^v/i, '');
}

function parseArgs(argv) {
  const options = {
    resourcesNeu: null,
    outDir: path.join(root, 'dist', 'updater'),
    tag: process.env.GITHUB_REF_NAME || null,
    version: null,
    requiresInstaller: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--resources-neu') {
      options.resourcesNeu = argv[++i];
    } else if (arg === '--out-dir') {
      options.outDir = path.resolve(argv[++i]);
    } else if (arg === '--tag') {
      options.tag = argv[++i];
    } else if (arg === '--version') {
      options.version = argv[++i];
    } else if (arg === '--requires-installer') {
      options.requiresInstaller = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/generate-updater-assets.mjs [options]

Options:
  --resources-neu <path>   Path to built resources.neu (auto-detected if omitted)
  --out-dir <path>         Output directory (default: dist/updater)
  --tag <tag>              Release tag, e.g. v0.9.0 (default: GITHUB_REF_NAME)
  --version <version>      App version override (default: package.json)
  --requires-installer     Mark manifest as requiring a full installer download
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function buildResourcesNeuCandidates(neuConfig) {
  const candidates = [];
  const binaryName = neuConfig.cli?.binaryName;
  if (binaryName) {
    candidates.push(path.join(root, 'dist', binaryName, 'resources.neu'));
  }
  candidates.push(
    path.join(root, 'resources.neu'),
    path.join(root, 'dist', 'resources.neu'),
    path.join(root, 'resources', 'resources.neu')
  );
  return candidates;
}

function findResourcesNeu(explicitPath, neuConfig) {
  const candidates = explicitPath ? [explicitPath] : buildResourcesNeuCandidates(neuConfig);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  throw new Error(
    `resources.neu not found. Tried:\n${candidates.map(p => `  - ${p}`).join('\n')}\nRun the Neutralino build first or pass --resources-neu.`
  );
}

function main() {
  const options = parseArgs(process.argv);
  const rootPkg = readJson(path.join(root, 'package.json'));
  const neuConfig = readJson(path.join(root, 'neutralino.config.json'));

  const version = normalizeVersion(options.version || rootPkg.version);
  const configVersion = normalizeVersion(neuConfig.version);
  if (version !== configVersion) {
    throw new Error(
      `Version mismatch: package.json (${version}) vs neutralino.config.json (${configVersion})`
    );
  }

  if (neuConfig.applicationId !== APP_ID) {
    throw new Error(`applicationId mismatch: expected ${APP_ID}, got ${neuConfig.applicationId}`);
  }

  const tag = options.tag ? String(options.tag).trim() : `v${version}`;
  const releaseTag = tag.startsWith('v') ? tag : `v${tag}`;
  const releaseVersion = normalizeVersion(releaseTag);

  if (releaseVersion !== version) {
    throw new Error(`Release tag ${releaseTag} does not match app version ${version}`);
  }

  const resourcesNeu = findResourcesNeu(options.resourcesNeu, neuConfig);
  fs.mkdirSync(options.outDir, { recursive: true });

  const resourcesDest = path.join(options.outDir, RESOURCES_ASSET_NAME);
  fs.copyFileSync(resourcesNeu, resourcesDest);

  const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/tag/${releaseTag}`;
  const resourcesURL = `https://github.com/${GITHUB_REPO}/releases/download/${releaseTag}/${RESOURCES_ASSET_NAME}`;

  const manifest = {
    applicationId: APP_ID,
    version,
    resourcesURL,
    data: {
      releaseUrl,
      requiresInstaller: options.requiresInstaller,
      minimumNeutralinoVersion: neuConfig.cli?.binaryVersion ?? null,
      neutralinoBinaryVersion: neuConfig.cli?.binaryVersion ?? null,
      neutralinoClientVersion: neuConfig.cli?.clientVersion ?? null,
    },
  };

  const manifestPath = path.join(options.outDir, 'update_manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`✓ wrote ${path.relative(root, resourcesDest)}`);
  console.log(`✓ wrote ${path.relative(root, manifestPath)}`);
  console.log(`  resourcesURL: ${resourcesURL}`);
}

main();
