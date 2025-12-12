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

import path from 'path';
import { fileURLToPath } from 'url';
import { readJson } from './fsx.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export const root = () => ROOT;

export const resources = () => path.join(ROOT, 'resources');

export const binDir = () => path.join(ROOT, 'bin');

export const distDir = () => path.join(ROOT, 'dist');

export const backendDir = () => path.join(ROOT, 'apps', 'backend');

export const configPath = () => path.join(ROOT, 'neutralino.config.json');

export const readConfig = () => readJson(configPath());

export const appName = () => readConfig().buildScript?.mac?.appName || 'NodeRef';
