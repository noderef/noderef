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

import { NodesApi } from '@alfresco/js-api';
import {
  getAlfrescoNodeParentsPath,
  getAlfrescoNodeSecondaryChildrenPath,
  getAlfrescoNodeSourcesPath,
  getAlfrescoNodeTargetsPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { parseSkipMax } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const LIST_TYPES = ['parents', 'secondary_children', 'targets', 'sources'] as const;

function okAssociationList(
  listType: (typeof LIST_TYPES)[number],
  nodeId: string,
  path: string,
  query: Record<string, unknown>,
  payload: unknown
): ToolResult {
  return {
    ok: true,
    data: {
      apiTrace: { method: 'GET', path, request: { query }, responseBody: payload },
      listType,
      nodeId,
      list: (payload as { list?: unknown })?.list ?? payload,
    },
  };
}

export const associationListTool: ToolDefinition = {
  name: 'association_list',
  description:
    'List parent folders, secondary children, peer target associations, or source associations for a node.',
  skill: { kind: 'local_md', path: '../skills/association_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Source node UUID' },
      listType: {
        type: 'string',
        enum: [...LIST_TYPES],
        description: 'Which association list to return',
      },
      where: { type: 'string', description: 'Optional where predicate (API-dependent)' },
      maxItems: { type: 'number', description: 'Page size where supported (default 25, max 100)' },
      skipCount: { type: 'number', description: 'Paging offset where supported' },
    },
    required: ['nodeId', 'listType'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      const listType = (typeof args.listType === 'string' ? args.listType.trim() : '') as
        | (typeof LIST_TYPES)[number]
        | '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }
      if (!LIST_TYPES.includes(listType as (typeof LIST_TYPES)[number])) {
        return { ok: false, error: `listType must be one of: ${LIST_TYPES.join(', ')}` };
      }

      const listKind = listType as (typeof LIST_TYPES)[number];

      const { skipCount, maxItems } = parseSkipMax(args, { defaultMax: 25, maxCap: 100 });
      const where = typeof args.where === 'string' ? args.where.trim() : '';
      const baseOpts: Record<string, unknown> = {
        ...(where ? { where } : {}),
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const nodesApi = new NodesApi(ctx.api);

      if (listKind === 'parents') {
        const path = getAlfrescoNodeParentsPath(nodeId);
        const query = { ...baseOpts, skipCount, maxItems };
        const payload = await nodesApi.listParents(nodeId, query as any);
        return okAssociationList(listKind, nodeId, path, query, payload);
      }

      if (listKind === 'secondary_children') {
        const path = getAlfrescoNodeSecondaryChildrenPath(nodeId);
        const query = { ...baseOpts, skipCount, maxItems };
        const payload = await nodesApi.listSecondaryChildren(nodeId, query as any);
        return okAssociationList(listKind, nodeId, path, query, payload);
      }

      if (listKind === 'targets') {
        const path = getAlfrescoNodeTargetsPath(nodeId);
        const query = { ...baseOpts, skipCount, maxItems };
        const payload = await nodesApi.listTargetAssociations(nodeId, query as any);
        return okAssociationList(listKind, nodeId, path, query, payload);
      }

      const path = getAlfrescoNodeSourcesPath(nodeId);
      const payload = await nodesApi.listSourceAssociations(nodeId, baseOpts as any);
      return okAssociationList(listKind, nodeId, path, baseOpts, payload);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
