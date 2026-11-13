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

/**
 * Helpers for composing Alfresco Core REST node updates.
 * PUT /nodes/{id} replaces the full aspect list, so add/remove is merged client-side.
 */

export interface NodeUpdateInput {
  properties?: Record<string, unknown | null>;
  nodeType?: string;
  addAspects?: string[];
  removeAspects?: string[];
}

export interface NodeAspectReader {
  getNode: (
    nodeId: string,
    opts?: { include?: string[] }
  ) => Promise<{ entry?: { aspectNames?: string[] } }>;
}

export function mergeAspectNames(
  current: string[],
  add: string[] = [],
  remove: string[] = []
): string[] {
  const removeSet = new Set(remove.filter(Boolean));
  const result: string[] = [];
  const seen = new Set<string>();

  for (const name of current) {
    if (!name || removeSet.has(name) || seen.has(name)) {
      continue;
    }
    result.push(name);
    seen.add(name);
  }

  for (const name of add) {
    if (!name || removeSet.has(name) || seen.has(name)) {
      continue;
    }
    result.push(name);
    seen.add(name);
  }

  return result;
}

export function buildNodeUpdateBody(input: {
  properties?: Record<string, unknown | null>;
  nodeType?: string;
  aspectNames?: string[];
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (input.properties && Object.keys(input.properties).length > 0) {
    body.properties = input.properties;
  }

  const nodeType = input.nodeType?.trim();
  if (nodeType) {
    body.nodeType = nodeType;
  }

  if (input.aspectNames) {
    body.aspectNames = input.aspectNames;
  }

  return body;
}

export async function prepareNodeUpdateBody(
  nodesApi: NodeAspectReader,
  nodeId: string,
  input: NodeUpdateInput
): Promise<Record<string, unknown>> {
  const addAspects = input.addAspects ?? [];
  const removeAspects = input.removeAspects ?? [];
  let aspectNames: string[] | undefined;

  if (addAspects.length > 0 || removeAspects.length > 0) {
    const current = await nodesApi.getNode(nodeId, { include: ['aspectNames'] });
    const currentAspects = current.entry?.aspectNames;
    if (!Array.isArray(currentAspects)) {
      throw new Error('Could not read the current aspect list for this node');
    }
    aspectNames = mergeAspectNames(currentAspects, addAspects, removeAspects);
  }

  return buildNodeUpdateBody({
    properties: input.properties,
    nodeType: input.nodeType,
    aspectNames,
  });
}

export function extractAlfrescoErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : String(error);
  }

  const candidate = error as {
    message?: string;
    response?: {
      body?: {
        error?: {
          briefSummary?: string;
          errorKey?: string;
          descriptionURL?: string;
        };
        message?: string;
      };
      statusText?: string;
    };
  };

  const summary = candidate.response?.body?.error?.briefSummary;
  if (typeof summary === 'string' && summary.trim()) {
    return summary.trim();
  }

  const errorKey = candidate.response?.body?.error?.errorKey;
  if (typeof errorKey === 'string' && errorKey.trim()) {
    return errorKey.trim();
  }

  const bodyMessage = candidate.response?.body?.message;
  if (typeof bodyMessage === 'string' && bodyMessage.trim()) {
    return bodyMessage.trim();
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }

  return 'Failed to update node';
}
