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

/** Shared backend URL / readiness state (avoids neutralino ↔ rpc import cycle). */

let baseURL = 'http://127.0.0.1:5111';
let backendReady = false;

export function getBackendUrl(): string {
  return baseURL;
}

export function isBackendReady(): boolean {
  return backendReady;
}

export function setBackendUrl(url: string): void {
  baseURL = url;
}

export function setBackendReady(ready: boolean): void {
  backendReady = ready;
}
