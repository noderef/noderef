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

// Cross-platform script to run Prisma migrations with root dev.db
const { execSync } = require('child_process');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendDir, '../..');
const dbPath = path.join(projectRoot, 'dev.db');
process.env.DATABASE_URL = `file:${dbPath}`;

console.log(`Using database: ${dbPath}`);
execSync('prisma migrate dev', { stdio: 'inherit', cwd: backendDir });
// Fix @prisma/client/index.js after generation
require('./fix-prisma-client.js');
