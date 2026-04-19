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

import { createLogger } from '../../lib/logger.js';

const log = createLogger('alfresco.rpc.fallbacks');

export const EMPTY_SEARCH_DICTIONARY = {
  types: [],
  aspects: [],
  sites: [],
  properties: [],
  propertyDataTypes: {},
};

export const EMPTY_CLASS_NAMES = {
  types: [],
  aspects: [],
  containers: [],
};

export const EMPTY_TERN_DEFINITIONS = {
  typeDefinitions: [],
};

export async function withOptionalAlfrescoResponse<T>(
  message: string,
  fallback: T,
  task: () => Promise<T>
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    log.warn({ error }, message);
    return fallback;
  }
}
