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

export interface ParsedNodeRef {
  /** Normalized nodeRef, e.g. workspace://SpacesStore/<uuid> */
  nodeRef: string;
  /** Node id expected by backendRpc.repository.getNodeDetails */
  nodeId: string;
  /** Store protocol, default 'workspace' */
  protocol: string;
  /** Store identifier, default 'SpacesStore' */
  storeId: string;
}

const FULL_NODEREF_REGEX =
  /^(workspace|archive|versionStore|system|user):\/\/([A-Za-z0-9_-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]+)$/i;

const SLASH_NODEREF_REGEX =
  /^(workspace|archive|versionStore|system|user)\/([A-Za-z0-9_-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const UUID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function cleanNodeRefInput(rawInput: string): string {
  return rawInput
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .replace(/^noderef:\s*/i, '')
    .trim();
}

export function parseNodeRefInput(rawInput: string): ParsedNodeRef | null {
  const cleaned = cleanNodeRefInput(rawInput);
  if (!cleaned) {
    return null;
  }

  const fullMatch = cleaned.match(FULL_NODEREF_REGEX);
  if (fullMatch) {
    const [, protocol, storeId, nodeId] = fullMatch;
    return {
      protocol,
      storeId,
      nodeId,
      nodeRef: `${protocol}://${storeId}/${nodeId}`,
    };
  }

  const slashMatch = cleaned.match(SLASH_NODEREF_REGEX);
  if (slashMatch) {
    const [, protocol, storeId, nodeId] = slashMatch;
    return {
      protocol,
      storeId,
      nodeId,
      nodeRef: `${protocol}://${storeId}/${nodeId}`,
    };
  }

  const uuidMatch = cleaned.match(UUID_REGEX);
  if (uuidMatch) {
    const [, nodeId] = uuidMatch;
    return {
      protocol: 'workspace',
      storeId: 'SpacesStore',
      nodeId,
      nodeRef: `workspace://SpacesStore/${nodeId}`,
    };
  }

  return null;
}

/**
 * True while the user is typing a store protocol such as "workspace://" or "archive://",
 * so the search bar does not treat it as a property prefix.
 */
export function isNodeRefProtocolPrefix(rawInput: string): boolean {
  const cleaned = cleanNodeRefInput(rawInput);
  return /^(workspace|archive|versionstore|system|user):\//i.test(cleaned);
}

interface NodeNameSource {
  type?: { prefixedName?: string };
  name?: { name?: string; prefixedName?: string };
  properties?: Array<{
    name: { name?: string; prefixedName?: string };
    values?: Array<{ value?: unknown }>;
  }>;
}

function readNodeProperty(nodeData: NodeNameSource, keys: string[]): string | undefined {
  for (const property of nodeData.properties ?? []) {
    const candidates = [property.name?.prefixedName, property.name?.name];
    if (!candidates.some(candidate => candidate && keys.includes(candidate))) {
      continue;
    }
    const value = property.values?.[0]?.value;
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function localNameFromQName(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const clarkMatch = value.match(/^\{[^}]+\}(.+)$/);
  if (clarkMatch) {
    return clarkMatch[1];
  }
  const prefixMatch = value.match(/^[^:]+:(.+)$/);
  if (prefixMatch) {
    return prefixMatch[1];
  }
  return value;
}

/**
 * Display name for tabs and UI: prefer cm:name (or cm:userName for people),
 * never the Slingshot QName (`{http://www.alfresco.org/model/...}local`).
 */
export function getNodeDisplayName(nodeData: NodeNameSource | null | undefined): string | undefined {
  if (!nodeData) {
    return undefined;
  }

  const typeName = nodeData.type?.prefixedName;
  if (typeName === 'cm:person') {
    const username = readNodeProperty(nodeData, [
      'cm:userName',
      '{http://www.alfresco.org/model/person/1.0}userName',
    ]);
    if (username) {
      return username;
    }
  }

  const cmName = readNodeProperty(nodeData, [
    'cm:name',
    '{http://www.alfresco.org/model/content/1.0}name',
  ]);
  if (cmName) {
    return cmName;
  }

  return (
    localNameFromQName(nodeData.name?.prefixedName) ||
    localNameFromQName(nodeData.name?.name) ||
    undefined
  );
}
