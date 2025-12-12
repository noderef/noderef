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

import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { cp, ensureDir, exists, rm } from './fsx.mjs';
import { backendDir, root } from './paths.mjs';

const require = createRequire(import.meta.url);

const QUERY_ENGINE_PATTERNS = {
  darwin: [/libquery_engine-darwin\.dylib\.node$/, /query_engine-darwin\.dylib\.node$/],
  'darwin-arm64': [
    /libquery_engine-darwin-arm64\.dylib\.node$/,
    /query_engine-darwin-arm64\.dylib\.node$/,
  ],
  windows: [/query_engine-windows\.dll\.node$/],
  'debian-openssl-3.0.x': [/libquery_engine-debian-openssl-3\.0\.x\.so\.node$/],
  'linux-arm64-openssl-3.0.x': [/libquery_engine-linux-arm64-openssl-3\.0\.x\.so\.node$/],
};

const SCHEMA_ENGINE_PATTERNS = {
  darwin: [/schema-engine-darwin$/],
  'darwin-arm64': [/schema-engine-darwin-arm64$/],
  windows: [/schema-engine-windows\.exe$/],
  'debian-openssl-3.0.x': [/schema-engine-debian-openssl-3\.0\.x$/],
  'linux-arm64-openssl-3.0.x': [/schema-engine-linux-arm64-openssl-3\.0\.x$/],
};

const EXTRA_PACKAGES = ['effect', 'fast-check', 'pure-rand', 'empathic', 'c12'];

const packageSegments = pkgName => (pkgName.startsWith('@') ? pkgName.split('/') : [pkgName]);

const normalizeTargets = keepEngine => {
  if (!keepEngine) return [];
  const list = Array.isArray(keepEngine) ? keepEngine : [keepEngine];
  return [...new Set(list.filter(Boolean))];
};

function resolvePackage(pkgName) {
  const bases = [backendDir(), root()];
  for (const base of bases) {
    try {
      const pkgJson = require.resolve(`${pkgName}/package.json`, { paths: [base] });
      return path.dirname(pkgJson);
    } catch {
      // keep looking
    }
  }
  return null;
}

function pnpmStoreCandidates(pkgName) {
  const entries = [];
  const prefixes = [
    { base: root(), store: path.join(root(), 'node_modules', '.pnpm') },
    { base: backendDir(), store: path.join(backendDir(), 'node_modules', '.pnpm') },
  ];
  const normalized = pkgName.startsWith('@') ? pkgName.replace('/', '+') : pkgName;

  for (const { store } of prefixes) {
    try {
      const items = fs.readdirSync(store).filter(n => n.startsWith(`${normalized}@`));
      for (const item of items) {
        entries.push(path.join(store, item, 'node_modules', ...packageSegments(pkgName)));
      }
    } catch {
      // ignore
    }
  }

  return entries;
}

function copyWorkspacePackage(pkgName, destNodeModules) {
  const src = resolvePackage(pkgName);
  if (!src) return false;
  const dest = path.join(destNodeModules, ...packageSegments(pkgName));
  if (exists(dest)) rm(dest);
  cp(src, dest, { dereference: true });
  return true;
}

function enginePatterns(target, type) {
  return type === 'schema' ? SCHEMA_ENGINE_PATTERNS[target] : QUERY_ENGINE_PATTERNS[target];
}

function findEngineInDir(dir, target, type) {
  const patterns = enginePatterns(target, type);
  if (!patterns || !exists(dir)) return null;

  const dirs = [dir];
  const runtimeDir = path.join(dir, 'runtime');
  if (exists(runtimeDir)) dirs.push(runtimeDir);

  for (const base of dirs) {
    try {
      const files = fs.readdirSync(base);
      const match = files.find(file => patterns.some(rx => rx.test(file)));
      if (match) return path.join(base, match);
    } catch {
      // ignore read errors
    }
  }
  return null;
}

function getEngineSearchPaths() {
  const paths = [];
  const clientPkg = resolvePackage('@prisma/client');
  if (clientPkg) {
    paths.push(path.join(clientPkg, '.prisma', 'client'));
    paths.push(clientPkg);
  }
  paths.push(path.join(backendDir(), 'node_modules', '.prisma', 'client'));
  paths.push(path.join(root(), 'node_modules', '.prisma', 'client'));

  const prismaPkg = resolvePackage('prisma');
  if (prismaPkg) {
    paths.push(prismaPkg);
    paths.push(path.join(prismaPkg, 'node_modules', '@prisma', 'engines'));
  }

  return [...new Set(paths.filter(Boolean))];
}

function pruneEngines(dir, targets, type) {
  if (!exists(dir)) return;
  const allowList = targets.flatMap(t => enginePatterns(t, type) || []);
  const patterns = type === 'schema' ? SCHEMA_ENGINE_PATTERNS : QUERY_ENGINE_PATTERNS;

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (type === 'query' && file.endsWith('.map')) {
        rm(path.join(dir, file));
        continue;
      }

      const isEngine = Object.values(patterns).some(arr => arr?.some(rx => rx.test(file)));
      if (!isEngine) continue;

      const keep = allowList.some(rx => rx.test(file));
      if (!keep) rm(path.join(dir, file));
    }
  } catch {
    // ignore pruning errors
  }
}

function ensureEngines(destDir, targets, type, searchPaths = getEngineSearchPaths()) {
  const normalized = normalizeTargets(targets);
  if (!normalized.length) return true;

  ensureDir(destDir);
  let ok = true;

  for (const target of normalized) {
    if (findEngineInDir(destDir, target, type)) continue;

    const source = searchPaths.map(dir => findEngineInDir(dir, target, type)).find(Boolean);

    if (!source) {
      console.error(
        `[prisma:${type}] Missing engine for target "${target}" (searched ${searchPaths.join(', ')})`
      );
      ok = false;
      continue;
    }

    cp(source, path.join(destDir, path.basename(source)));
  }

  pruneEngines(destDir, normalized, type);
  return ok;
}

function findGeneratedClient() {
  const clientPkg = resolvePackage('@prisma/client');
  const candidates = [
    path.join(backendDir(), 'node_modules', '.prisma', 'client'),
    path.join(root(), 'node_modules', '.prisma', 'client'),
    clientPkg && path.join(clientPkg, '.prisma', 'client'),
    clientPkg && path.join(path.dirname(clientPkg), '.prisma', 'client'),
  ]
    .filter(Boolean)
    .filter(p => exists(p));

  // Check pnpm store locations
  const pnpmStore = path.join(root(), 'node_modules', '.pnpm');
  if (exists(pnpmStore)) {
    try {
      const items = fs.readdirSync(pnpmStore).filter(n => n.startsWith('@prisma+client@'));
      for (const item of items) {
        const candidate = path.join(pnpmStore, item, 'node_modules', '.prisma', 'client');
        if (exists(candidate)) {
          candidates.push(candidate);
        }
      }
    } catch {
      // ignore read errors
    }
  }

  // Find the first candidate that has actual generated content (not "dummy content")
  for (const candidate of candidates) {
    const indexJs = path.join(candidate, 'index.js');
    if (exists(indexJs)) {
      try {
        const content = fs.readFileSync(indexJs, 'utf8');
        // Check if it's actual generated code, not dummy content
        if (content && !content.includes('dummy content') && content.length > 100) {
          return candidate;
        }
      } catch {
        // continue to next candidate
      }
    }
  }

  // Fallback to first candidate if all have dummy content (shouldn't happen)
  return candidates.find(Boolean) || null;
}

function copyGeneratedClient(destNodeModules, destPkg, targets) {
  const gen = findGeneratedClient();
  if (!gen) {
    console.error(
      '[copyPrismaTo] Could not locate generated Prisma client (.prisma/client). Run prisma generate first.'
    );
    return false;
  }

  const standardDest = path.join(destNodeModules, '.prisma', 'client');
  const pkgDest = path.join(destPkg, '.prisma', 'client');

  if (exists(standardDest)) rm(standardDest);
  if (exists(pkgDest)) rm(pkgDest);

  cp(gen, standardDest, { dereference: true });
  cp(gen, pkgDest, { dereference: true });

  const okStandard = ensureQueryEngines(standardDest, targets);
  const okPkg = ensureQueryEngines(pkgDest, targets);
  return okStandard && okPkg;
}

function ensureQueryEngines(destDir, targets, searchPaths) {
  return ensureEngines(destDir, targets, 'query', searchPaths);
}

function ensureSchemaEngines(destDir, targets, searchPaths) {
  return ensureEngines(destDir, targets, 'schema', searchPaths);
}

export function copyPrismaTo(destNodeModules, keepEngine) {
  const targets = normalizeTargets(keepEngine);
  const clientPkg = resolvePackage('@prisma/client');
  if (!clientPkg) {
    console.error('[copyPrismaTo] Could not locate @prisma/client package');
    return false;
  }

  const destPkg = path.join(destNodeModules, '@prisma', 'client');
  if (exists(destPkg)) rm(destPkg);
  cp(clientPkg, destPkg, { dereference: true });

  const genOk = copyGeneratedClient(destNodeModules, destPkg, targets);
  const enginesOk = ensureQueryEngines(path.join(destNodeModules, '.prisma', 'client'), targets);

  // Fix @prisma/client/index.js to properly re-export from .prisma/client
  // The package's index.js might be empty, so we need to ensure it re-exports the generated client
  const clientIndexJs = path.join(destPkg, 'index.js');
  if (exists(clientIndexJs)) {
    const currentContent = fs.readFileSync(clientIndexJs, 'utf8');
    // If index.js is empty or just exports empty object, replace it with proper re-export
    // Try both .prisma/client (relative to @prisma/client) and the standard location
    if (currentContent.trim() === 'module.exports = {}' || currentContent.trim() === '') {
      const standardPrismaClient = path.join(destNodeModules, '.prisma', 'client');
      const pkgPrismaClient = path.join(destPkg, '.prisma', 'client');

      // Determine which location exists and use the appropriate require path
      let requirePath = '.prisma/client'; // default to relative path
      if (exists(pkgPrismaClient)) {
        requirePath = '.prisma/client';
      } else if (exists(standardPrismaClient)) {
        // Use absolute path or relative path from @prisma/client to node_modules/.prisma/client
        requirePath = '../../.prisma/client';
      }

      const reExportContent = `try {
  module.exports = require('${requirePath}');
} catch (e) {
  // Fallback if .prisma/client is not found
  console.error('Failed to load Prisma client:', e.message);
  module.exports = {};
}
`;
      fs.writeFileSync(clientIndexJs, reExportContent, 'utf8');
    }
  }

  return (!targets.length || enginesOk) && genOk;
}

export function copyPrismaCliTo(destNodeModules, keepEngine) {
  const targets = normalizeTargets(keepEngine);
  const prismaPkg = resolvePackage('prisma');
  if (!prismaPkg) {
    console.error('[copyPrismaCliTo] Could not locate prisma CLI package');
    return false;
  }

  const destPkg = path.join(destNodeModules, 'prisma');
  if (exists(destPkg)) rm(destPkg);
  cp(prismaPkg, destPkg, { dereference: true });

  const enginesPkg = resolvePackage('@prisma/engines');
  const enginesCandidates = [
    enginesPkg,
    ...pnpmStoreCandidates('@prisma/engines'),
    path.join(prismaPkg, 'node_modules', '@prisma', 'engines'),
  ].filter(Boolean);

  const destEngines = path.join(destNodeModules, '@prisma', 'engines');
  const destCliEngines = path.join(destPkg, 'node_modules', '@prisma', 'engines');

  for (const candidate of enginesCandidates) {
    if (!exists(candidate)) continue;
    if (exists(destEngines)) rm(destEngines);
    cp(candidate, destEngines, { dereference: true });
    ensureDir(path.dirname(destCliEngines));
    cp(candidate, destCliEngines, { dereference: true });
    break;
  }

  // Copy the rest of the @prisma scope (debug, get-platform, etc.)
  const prismaScopeDirs = [
    path.join(backendDir(), 'node_modules', '@prisma'),
    path.join(root(), 'node_modules', '@prisma'),
    ...pnpmStoreCandidates('@prisma/engines').map(p => path.join(path.dirname(p), '..')),
  ];

  const pnpmStores = [
    path.join(root(), 'node_modules', '.pnpm'),
    path.join(backendDir(), 'node_modules', '.pnpm'),
  ];

  for (const store of pnpmStores) {
    try {
      const items = fs.readdirSync(store).filter(n => n.startsWith('@prisma+'));
      for (const item of items) {
        prismaScopeDirs.push(path.join(store, item, 'node_modules', '@prisma'));
      }
    } catch {
      // ignore
    }
  }

  const destPrismaScope = path.join(destNodeModules, '@prisma');
  const destCliPrismaScope = path.join(destPkg, 'node_modules', '@prisma');
  const copiedScope = new Set();

  function copyScope(srcScope, destScope) {
    if (!exists(srcScope)) return;
    ensureDir(destScope);
    try {
      for (const name of fs.readdirSync(srcScope)) {
        const srcPkg = path.join(srcScope, name);
        if (!exists(path.join(srcPkg, 'package.json'))) continue;
        const key = `${destScope}:${name}`;
        if (copiedScope.has(key)) continue;
        const dst = path.join(destScope, name);
        if (exists(dst)) rm(dst);
        cp(srcPkg, dst, { dereference: true });
        copiedScope.add(key);
      }
    } catch {
      // ignore errors while copying scope packages
    }
  }

  for (const scopeDir of prismaScopeDirs) {
    copyScope(scopeDir, destPrismaScope);
    copyScope(scopeDir, destCliPrismaScope);
  }

  const extraCandidates = pkgName => [
    resolvePackage(pkgName),
    ...pnpmStoreCandidates(pkgName),
    path.join(prismaPkg, 'node_modules', ...packageSegments(pkgName)),
    path.join(destPkg, 'node_modules', ...packageSegments(pkgName)),
  ];

  for (const extra of EXTRA_PACKAGES) {
    const src =
      extraCandidates(extra).find(p => p && exists(p)) ||
      extraCandidates(`@prisma/${extra}`).find(p => p && exists(p));
    if (src) {
      const dest = path.join(destNodeModules, ...packageSegments(extra));
      if (exists(dest)) rm(dest);
      cp(src, dest, { dereference: true });
    } else if (!copyWorkspacePackage(extra, destNodeModules)) {
      console.warn(`[copyPrismaCliTo] Optional dependency "${extra}" missing`);
    }
  }

  const searchPaths = [
    destPkg,
    destEngines,
    destCliEngines,
    ...enginesCandidates,
    ...getEngineSearchPaths(),
  ].filter(Boolean);
  const schemaOk = ensureSchemaEngines(destPkg, targets, searchPaths);
  const queryOk = ensureQueryEngines(destPkg, targets, searchPaths);

  return !targets.length || (schemaOk && queryOk);
}

export function ensurePrismaEngine(destNodeModules, keepEngine) {
  const targets = normalizeTargets(keepEngine);
  const dest = path.join(destNodeModules, '.prisma', 'client');
  return ensureQueryEngines(dest, targets);
}
