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

let VERBOSE = process.env.VERBOSE === '1' || process.argv.includes('--verbose');

export function setVerbose(v) {
  VERBOSE = !!v;
}

export const log = (...a) => console.log(...a);

export const warn = (...a) => console.warn('⚠', ...a);

export const error = (...a) => console.error('❌', ...a);

export const info = (...a) => console.log('→', ...a);

export const debug = (...a) => {
  if (VERBOSE) console.log('…', ...a);
};
