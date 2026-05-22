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

/** Free dev backend port (default 5111) before nodemon starts. Set NODEREF_SKIP_PORT_FREE=1 to skip. */

import { execSync } from 'child_process';

if (process.env.NODEREF_SKIP_PORT_FREE === '1') process.exit(0);

const port = Number(process.env.PORT) || 5111;

let pids = [];
try {
  pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
} catch {
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(Number(pid), 'SIGTERM');
    console.log(`→ freed port ${port} (PID ${pid})`);
  } catch {
    /* already gone */
  }
}
