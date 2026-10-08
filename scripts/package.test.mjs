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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generateWixXml } from './package.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Windows MSI defaults to per-user install without elevation', () => {
  const xml = generateWixXml('/tmp/noderef-win', 'x64', '0.13.1', '', '', true);

  assert.match(xml, /InstallPrivileges="limited"/);
  assert.match(xml, /<Property Id="ALLUSERS" Secure="yes" Value="2" \/>/);
  assert.match(xml, /<Property Id="MSIINSTALLPERUSER" Secure="yes" Value="1" \/>/);
  assert.match(xml, /<Property Id="WixAppFolder" Value="WixPerUserFolder" \/>/);
  assert.match(xml, /Property="MSIINSTALLPERUSER" Value="1".*WixAppFolder = "WixPerUserFolder"/);
  assert.match(
    xml,
    /Property="MSIINSTALLPERUSER" Value="\{\}".*WixAppFolder = "WixPerMachineFolder"/
  );
  assert.doesNotMatch(xml, /WixPerMachineFolder" \/>/);
  assert.doesNotMatch(xml, /InstallScope="perMachine"/);
});

test('Neutralino window and Windows exe use the NodeRef PNG icon', () => {
  const config = JSON.parse(readFileSync(join(rootDir, 'neutralino.config.json'), 'utf8'));

  assert.equal(config.modes.window.icon, '/resources/icons/appIcon.png');
  assert.equal(config.applicationIcon, 'resources/icons/appIcon.png');
});
