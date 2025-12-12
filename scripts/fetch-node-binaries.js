#!/usr/bin/env node

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

/**
 * Fetches official Node.js binaries into ./bin with the names expected
 * by scripts/copy-node.js.
 *
 * Output files (in ./bin):
 *   node-mac_arm64
 *   node-mac_x64
 *   node-win_x64.exe
 *   node-linux_x64
 *   node-linux_arm64
 *
 * Optional:
 *   (mac "universal" is not provided by Node.org; skipped by default)
 *
 * Version selection:
 *   - Set NODEDIST_VERSION to a concrete tag (e.g. v22.11.0) to pin.
 *   - Or set NODEDIST_CHANNEL to lts or current to auto-pick.
 *   - Otherwise we try engines.node in package.json, then fall back to latest LTS.
 *
 * Notes:
 *   - Uses `tar` for .tar.xz extraction on macOS/Linux.
 *   - Uses PowerShell Expand-Archive for Windows .zip.
 *   - Verifies files against SHASUMS256.txt.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync, execSync } = require('child_process');
const crypto = require('crypto');

const BIN_DIR = path.resolve(__dirname, '../bin');
fs.mkdirSync(BIN_DIR, { recursive: true });

const NODE_BASE = 'https://nodejs.org/dist';

const targetMatrix = [
  { id: 'darwin-arm64', out: 'node-mac_arm64', archive: v => `node-${v}-darwin-arm64.tar.xz` },
  { id: 'darwin-x64', out: 'node-mac_x64', archive: v => `node-${v}-darwin-x64.tar.xz` },
  // universal is not published by nodejs.org
  { id: 'win-x64', out: 'node-win_x64.exe', archive: v => `node-${v}-win-x64.zip` },
  { id: 'linux-x64', out: 'node-linux_x64', archive: v => `node-${v}-linux-x64.tar.xz` },
  { id: 'linux-arm64', out: 'node-linux_arm64', archive: v => `node-${v}-linux-arm64.tar.xz` },
];

const pkgPath = path.resolve(__dirname, '../package.json');
const enginesVersion =
  fs.existsSync(pkgPath) && JSON.parse(fs.readFileSync(pkgPath, 'utf8')).engines?.node;

// Helpers
function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`${url} -> HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function chooseVersion() {
  // 1) explicit pin
  const pinned = process.env.NODEDIST_VERSION; // e.g. "v22.11.0"
  if (pinned) return pinned.startsWith('v') ? pinned : `v${pinned}`;

  // 2) channel
  const channel = (process.env.NODEDIST_CHANNEL || '').toLowerCase(); // "lts" | "current"
  // 3) engines.node (like ">=20 <23" or "^22.0.0") — we can't resolve ranges cleanly,
  //    so we'll still prefer latest LTS unless channel says current.
  const preferCurrent = channel === 'current';
  const preferLts = channel === 'lts' || !channel;

  // Read index.json and pick
  const index = JSON.parse(await fetch(`${NODE_BASE}/index.json`));
  if (preferCurrent) {
    // First entry is latest release
    const latest = index[0]?.version;
    if (!latest) throw new Error('Could not determine latest Node version');
    return latest;
  } else {
    // Default to Node 22 LTS for Prisma 6.19 compatibility
    // Prisma 6.19 supports Node 18/20/22, but not 24 yet
    // If latest LTS is v22.x, use it; otherwise find v22 LTS specifically
    const latestLts = index.find(r => !!r.lts);
    if (latestLts && latestLts.version.startsWith('v22.')) {
      return latestLts.version;
    }
    // Find v22 LTS specifically
    const v22Lts = index.find(r => !!r.lts && r.version.startsWith('v22.'));
    if (v22Lts) {
      return v22Lts.version;
    }
    // Fallback to latest LTS if no v22 found
    if (!latestLts) throw new Error('Could not determine latest LTS Node version');
    return latestLts.version;
  }
}

function sha256(buf) {
  const h = crypto.createHash('sha256');
  h.update(buf);
  return h.digest('hex');
}

function verifyChecksum(fileBuf, expectedHex, label) {
  const got = sha256(fileBuf);
  if (got !== expectedHex) {
    throw new Error(`SHA256 mismatch for ${label}\nExpected: ${expectedHex}\nGot:      ${got}`);
  }
}

function ensureTmp() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'nodebins-'));
  return p;
}

function writeTemp(tmpDir, name, buf) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, buf);
  return p;
}

function extractTarXz(archivePath, outDir) {
  // Requires system tar with xz support (macOS/Linux typically have it)
  execFileSync('tar', ['-xJf', archivePath, '-C', outDir]);
}

function extractZip(zipPath, outDir) {
  // Use unzip command (available on macOS/Linux) or PowerShell on Windows
  const platform = os.platform();
  if (platform === 'win32') {
    // Use PowerShell Expand-Archive on Windows
    execSync(
      `powershell -NoP -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    // Use unzip command on macOS/Linux
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', outDir], { stdio: 'inherit' });
  }
}

async function main() {
  console.log('→ Resolving Node version...');
  const version = await chooseVersion(); // e.g. "v22.11.0"
  console.log(`✓ Using Node ${version}`);

  const baseUrl = `${NODE_BASE}/${version}`;
  console.log('→ Downloading SHASUMS256.txt...');
  const shas = (await fetch(`${baseUrl}/SHASUMS256.txt`)).toString('utf8');

  const tmp = ensureTmp();
  try {
    for (const t of targetMatrix) {
      const archiveName = t.archive(version);
      const url = `${baseUrl}/${archiveName}`;
      console.log(`\n→ Fetching ${t.id} (${archiveName})...`);

      let buf;
      try {
        buf = await fetch(url);
      } catch (e) {
        // Retry with .tar.gz in case .tar.xz doesn't exist (older releases)
        if (archiveName.endsWith('.tar.xz')) {
          const alt = archiveName.replace('.tar.xz', '.tar.gz');
          const altUrl = `${baseUrl}/${alt}`;
          console.log(`  … .tar.xz not found, trying ${alt}…`);
          buf = await fetch(altUrl);
        } else {
          throw e;
        }
      }

      // Verify checksum
      const line = shas.split('\n').find(l => l.trim().endsWith(archiveName));
      const expected = line?.split(/\s+/)[0];
      if (expected) {
        verifyChecksum(buf, expected, archiveName);
        console.log('  ✓ checksum OK');
      } else {
        console.warn('  ⚠ checksum entry not found, skipping verification');
      }

      // Write archive to tmp and extract
      const archivePath = writeTemp(tmp, archiveName, buf);
      const extractDir = path.join(tmp, `${t.id}-extracted`);
      fs.mkdirSync(extractDir);

      if (archiveName.endsWith('.zip')) {
        extractZip(archivePath, extractDir);
      } else {
        extractTarXz(archivePath, extractDir);
      }

      // Find the node binary inside extracted folder
      // Structure: node-vX-<plat>/bin/node  OR  node.exe at root/bin for Windows zip
      const top = fs.readdirSync(extractDir).find(n => n.startsWith('node-'));
      const root = top ? path.join(extractDir, top) : extractDir;

      let src;
      if (t.id.startsWith('win-')) {
        // Windows zip: node.exe typically at root of extracted directory
        // Try root first, then bin/ subdirectory, then nested directories
        src = path.join(root, 'node.exe');
        if (!fs.existsSync(src)) {
          src = path.join(root, 'bin', 'node.exe');
        }
        if (!fs.existsSync(src)) {
          // Try nested subdirectories as fallback
          const subdirs = fs.readdirSync(root).filter(n => {
            try {
              return fs.statSync(path.join(root, n)).isDirectory();
            } catch {
              return false;
            }
          });
          for (const subdir of subdirs) {
            const candidate = path.join(root, subdir, 'node.exe');
            if (fs.existsSync(candidate)) {
              src = candidate;
              break;
            }
          }
        }
      } else {
        src = path.join(root, 'bin', 'node');
      }

      if (!fs.existsSync(src)) {
        throw new Error(`Could not locate node binary in archive for ${t.id}`);
      }

      const dest = path.join(BIN_DIR, t.out);
      fs.copyFileSync(src, dest);
      if (!t.id.startsWith('win-')) fs.chmodSync(dest, 0o755);

      console.log(`  ✓ wrote ${path.relative(process.cwd(), dest)}`);
    }

    console.log('\n✓ All requested Node binaries downloaded to ./bin');
    console.log('  (mac_universal not provided by nodejs.org; skipping)');
    console.log('  Set NODEDIST_VERSION=vXX.YY.ZZ to pin a specific version.');
    console.log('  Or set NODEDIST_CHANNEL=lts|current to choose a channel.');
  } finally {
    // leave tmp for debugging? Clean by default:
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
}

main().catch(err => {
  console.error('\n✗ fetch-node-binaries failed:', err.message);
  process.exit(1);
});
