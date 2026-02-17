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

import { NodesApi, SearchApi } from '@alfresco/js-api';
import type { AlfrescoApi } from '@alfresco/js-api';
import axios from 'axios';
import { buildAlfrescoUrl } from '../lib/alfresco-url.js';
import { AppErrors } from '../lib/errors.js';
import type { AgentMention } from '@app/contracts';

export interface AgentPlannedStep {
  operation: 'search' | 'move' | 'copy' | 'delete' | 'executeScript';
  summary: string;
  input: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export interface AgentExecutionContext {
  api: AlfrescoApi;
  serverBaseUrl: string;
  jsconsoleEndpoint: string | null;
  authType: string | null;
  username: string | null;
  token: string | null;
  signal: AbortSignal;
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const tokenize = (value: string): string[] => value.toLowerCase().split(/\s+/g).filter(Boolean);

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const extractNodeIds = (content: string, mentions: AgentMention[]): string[] => {
  const idsFromMentions = mentions.filter(item => item.type === 'node').map(item => item.id.trim());
  const idsFromText = Array.from(content.matchAll(UUID_PATTERN)).map(match => (match[0] || '').trim());

  return unique([...idsFromMentions, ...idsFromText]).filter(Boolean);
};

const extractScriptFromPrompt = (content: string): string | null => {
  const fenced = content.match(/```(?:javascript|js)?\n([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const direct = content.match(/(?:run|execute)\s+script\s*:\s*([\s\S]+)/i);
  if (direct?.[1]) {
    return direct[1].trim();
  }

  return null;
};

const normalizeNodePath = (pathName: string | undefined): string | null => {
  if (!pathName) {
    return null;
  }

  const trimmed = pathName.trim();
  return trimmed.length ? trimmed : null;
};

const buildSearchStep = (content: string, mentions: AgentMention[]): AgentPlannedStep => {
  const normalized = content.trim();
  const folderMention = mentions.find(item => item.type === 'node');

  return {
    operation: 'search',
    summary: folderMention
      ? 'Collecting repository context for the mentioned node/folder'
      : 'Collecting repository context from the prompt',
    input: {
      query: normalized,
      nodeId: folderMention?.id ?? null,
      maxItems: 100,
    },
    requiresConfirmation: false,
  };
};

export function buildExecutionPlan(content: string, mentions: AgentMention[]): AgentPlannedStep[] {
  const plan: AgentPlannedStep[] = [buildSearchStep(content, mentions)];
  const lowered = content.toLowerCase();
  const nodeIds = extractNodeIds(content, mentions);

  if (lowered.includes('move')) {
    plan.push({
      operation: 'move',
      summary: 'Moving node to target folder',
      input: {
        sourceNodeId: nodeIds[0] ?? null,
        targetParentId: nodeIds[1] ?? null,
      },
      requiresConfirmation: false,
    });
    return plan;
  }

  if (lowered.includes('copy')) {
    plan.push({
      operation: 'copy',
      summary: 'Copying node to target folder',
      input: {
        sourceNodeId: nodeIds[0] ?? null,
        targetParentId: nodeIds[1] ?? null,
      },
      requiresConfirmation: false,
    });
    return plan;
  }

  if (lowered.includes('delete') || lowered.includes('remove')) {
    plan.push({
      operation: 'delete',
      summary: 'Deleting one or more nodes (confirmation required)',
      input: {
        nodeIds,
        permanent: false,
      },
      requiresConfirmation: true,
    });
    return plan;
  }

  if (lowered.includes('script') || lowered.includes('javascript') || lowered.includes('jsconsole')) {
    plan.push({
      operation: 'executeScript',
      summary: 'Executing JavaScript Console script',
      input: {
        script: extractScriptFromPrompt(content),
      },
      requiresConfirmation: false,
    });
  }

  return plan;
}

async function runSearch(
  ctx: AgentExecutionContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const searchApi = new SearchApi(ctx.api);
  const nodesApi = new NodesApi(ctx.api);
  const nodeId = typeof input.nodeId === 'string' && input.nodeId.trim() ? input.nodeId.trim() : null;
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const maxItems = Number.isInteger(input.maxItems) ? Number(input.maxItems) : 100;

  if (ctx.signal.aborted) {
    throw AppErrors.invalidInput('Run was cancelled');
  }

  if (nodeId) {
    const children = await nodesApi.listNodeChildren(nodeId, {
      maxItems: Math.max(1, Math.min(maxItems, 500)),
      skipCount: 0,
      fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'content', 'path'],
      include: ['path'],
    });

    const entries = (children.list?.entries || []).map((entry: any) => entry.entry);
    const fileCount = entries.filter(item => item?.isFile).length;
    const folderCount = entries.filter(item => item?.isFolder).length;

    const extensionTotals = new Map<string, number>();
    for (const item of entries) {
      if (!item?.name || !item?.isFile) {
        continue;
      }
      const ext = item.name.includes('.') ? item.name.split('.').pop()?.toLowerCase() : '';
      if (!ext) {
        continue;
      }
      extensionTotals.set(ext, (extensionTotals.get(ext) || 0) + 1);
    }

    return {
      mode: 'folder',
      nodeId,
      query,
      totals: {
        items: entries.length,
        files: fileCount,
        folders: folderCount,
      },
      extensions: Array.from(extensionTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([extension, count]) => ({ extension, count })),
      sample: entries.slice(0, 10).map(item => ({
        id: item.id,
        name: item.name,
        nodeType: item.nodeType,
        isFolder: item.isFolder,
        isFile: item.isFile,
        path: normalizeNodePath(item.path?.name),
      })),
    };
  }

  const terms = tokenize(query);
  const escapedTerms = terms
    .map(term => term.replace(/"/g, '\\"').replace(/\\/g, '\\\\'))
    .filter(Boolean);

  const aftsQuery = escapedTerms.length
    ? escapedTerms.map(term => `TEXT:"${term}*"`).join(' AND ')
    : 'TYPE:"cm:content" OR TYPE:"cm:folder"';

  const result = await searchApi.search({
    query: {
      query: aftsQuery,
      language: 'afts',
    },
    fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content'],
    include: ['path'],
    paging: {
      maxItems: Math.max(1, Math.min(maxItems, 200)),
      skipCount: 0,
    },
  } as any);

  const entries = (result.list?.entries || []).map((entry: any) => entry.entry);
  const fileCount = entries.filter(item => item?.isFile).length;
  const folderCount = entries.filter(item => item?.isFolder).length;

  return {
    mode: 'query',
    query,
    aftsQuery,
    totals: {
      items: result.list?.pagination?.totalItems ?? entries.length,
      files: fileCount,
      folders: folderCount,
    },
    sample: entries.slice(0, 10).map(item => ({
      id: item.id,
      name: item.name,
      nodeType: item.nodeType,
      isFolder: item.isFolder,
      isFile: item.isFile,
      path: normalizeNodePath(item.path?.name),
      mimeType: item.content?.mimeType ?? null,
    })),
  };
}

async function runMove(
  ctx: AgentExecutionContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sourceNodeId = typeof input.sourceNodeId === 'string' ? input.sourceNodeId.trim() : '';
  const targetParentId = typeof input.targetParentId === 'string' ? input.targetParentId.trim() : '';

  if (!sourceNodeId || !targetParentId) {
    throw AppErrors.invalidInput('Move requires sourceNodeId and targetParentId');
  }

  const nodesApi = new NodesApi(ctx.api);
  const moved = await nodesApi.moveNode(sourceNodeId, { targetParentId }, { fields: ['id', 'name', 'path'] });
  const entry = (moved as any)?.entry ?? moved;

  return {
    sourceNodeId,
    targetParentId,
    moved: {
      id: entry?.id,
      name: entry?.name,
      path: normalizeNodePath(entry?.path?.name),
    },
  };
}

async function runCopy(
  ctx: AgentExecutionContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sourceNodeId = typeof input.sourceNodeId === 'string' ? input.sourceNodeId.trim() : '';
  const targetParentId = typeof input.targetParentId === 'string' ? input.targetParentId.trim() : '';

  if (!sourceNodeId || !targetParentId) {
    throw AppErrors.invalidInput('Copy requires sourceNodeId and targetParentId');
  }

  const nodesApi = new NodesApi(ctx.api);
  const copied = await nodesApi.copyNode(sourceNodeId, { targetParentId }, { fields: ['id', 'name', 'path'] });
  const entry = (copied as any)?.entry ?? copied;

  return {
    sourceNodeId,
    targetParentId,
    copied: {
      id: entry?.id,
      name: entry?.name,
      path: normalizeNodePath(entry?.path?.name),
    },
  };
}

async function runDelete(
  ctx: AgentExecutionContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const nodeIds = Array.isArray(input.nodeIds)
    ? input.nodeIds.map(item => String(item).trim()).filter(Boolean)
    : [];
  const permanent = Boolean(input.permanent);

  if (!nodeIds.length) {
    throw AppErrors.invalidInput('Delete requires at least one nodeId');
  }

  const nodesApi = new NodesApi(ctx.api);
  const deleted: string[] = [];

  for (const nodeId of nodeIds) {
    if (ctx.signal.aborted) {
      throw AppErrors.invalidInput('Run was cancelled');
    }
    await nodesApi.deleteNode(nodeId, { permanent });
    deleted.push(nodeId);
  }

  return {
    deleted,
    permanent,
    totalDeleted: deleted.length,
  };
}

async function runExecuteScript(
  ctx: AgentExecutionContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!ctx.jsconsoleEndpoint) {
    throw AppErrors.invalidInput('JavaScript Console endpoint is not configured for this server');
  }

  const script = typeof input.script === 'string' ? input.script.trim() : '';
  if (!script) {
    throw AppErrors.invalidInput(
      'executeScript requires inline script content (use fenced ```js code``` or "execute script: ...")'
    );
  }

  const resultChannel = `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const jsConsoleEndpointClean = ctx.jsconsoleEndpoint.replace(/^\/+/, '');
  const executeUrl = buildAlfrescoUrl(ctx.serverBaseUrl, `/service/${jsConsoleEndpointClean}/execute`);

  const payload = {
    script,
    template: '',
    spaceNodeRef: '',
    transaction: 'readwrite',
    runas: ctx.username || '',
    urlargs: '',
    documentNodeRef: '',
    resultChannel,
  };

  let authHeader: Record<string, string>;
  if (ctx.authType === 'openid_connect') {
    if (!ctx.token) {
      throw AppErrors.unauthorized('No OAuth2 access token available');
    }
    authHeader = {
      Authorization: `Bearer ${ctx.token}`,
    };
  } else {
    if (!ctx.username || !ctx.token) {
      throw AppErrors.unauthorized('No username/password available for script execution');
    }
    authHeader = {
      Authorization: `Basic ${Buffer.from(`${ctx.username}:${ctx.token}`).toString('base64')}`,
    };
  }

  const response = await axios.post(executeUrl, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    validateStatus: status => status < 600,
  });

  const result = response.data;
  const printOutput = Array.isArray(result?.printOutput)
    ? result.printOutput.map((item: unknown) => (typeof item === 'string' ? item : JSON.stringify(item)))
    : [];

  return {
    status: response.status,
    resultChannel,
    scriptPreview: script.slice(0, 200),
    output: printOutput.slice(0, 200),
    error: result?.error ?? result?.message ?? null,
  };
}

export async function executeOperation(
  operation: AgentPlannedStep['operation'],
  ctx: AgentExecutionContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (operation === 'search') {
    return runSearch(ctx, input);
  }
  if (operation === 'move') {
    return runMove(ctx, input);
  }
  if (operation === 'copy') {
    return runCopy(ctx, input);
  }
  if (operation === 'delete') {
    return runDelete(ctx, input);
  }
  if (operation === 'executeScript') {
    return runExecuteScript(ctx, input);
  }

  throw AppErrors.invalidInput(`Unsupported operation: ${operation}`);
}
