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

import { AuditApi } from '@alfresco/js-api';
import {
  getAlfrescoAuditAppEntriesPath,
  getAlfrescoNodeAuditEntriesPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { sliceAlfrescoPagedList } from '../helpers/alfrescoListResponse.js';
import { parseSkipMax } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const auditListTool: ToolDefinition = {
  name: 'audit_list',
  description:
    'List audit entries for an audit application id, or for a repository node (GET audit-entries).',
  skill: { kind: 'local_md', path: '../skills/audit_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      applicationId: {
        type: 'string',
        description: 'Audit application id (e.g. from audit_apps) — lists entries for this app',
      },
      nodeId: { type: 'string', description: 'If set, list audit trail entries for this node' },
      where: { type: 'string', description: 'Optional Alfresco where predicate' },
      orderBy: {
        type: 'string',
        description: 'Optional orderBy (comma-separated field directions per API)',
      },
      maxItems: { type: 'number', description: 'Page size (default 25, max 100)' },
      skipCount: { type: 'number', description: 'Paging offset' },
    },
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const applicationId = typeof args.applicationId === 'string' ? args.applicationId.trim() : '';
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!applicationId && !nodeId) {
        return { ok: false, error: 'Provide applicationId or nodeId' };
      }
      if (applicationId && nodeId) {
        return { ok: false, error: 'Provide only one of applicationId or nodeId' };
      }

      const { skipCount, maxItems } = parseSkipMax(args, { defaultMax: 25, maxCap: 100 });
      const where = typeof args.where === 'string' ? args.where.trim() : '';
      const orderBy = typeof args.orderBy === 'string' ? args.orderBy.trim() : '';
      const listOpts: Record<string, unknown> = {
        skipCount,
        maxItems,
        ...(where ? { where } : {}),
        ...(orderBy ? { orderBy } : {}),
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const auditApi = new AuditApi(ctx.api);

      if (nodeId) {
        const path = getAlfrescoNodeAuditEntriesPath(nodeId);
        const payload = await auditApi.listAuditEntriesForNode(nodeId, listOpts as any);
        const { entries, pagination } = sliceAlfrescoPagedList(payload, skipCount, maxItems);
        return {
          ok: true,
          data: {
            apiTrace: { method: 'GET', path, request: { query: listOpts }, responseBody: payload },
            scope: 'node',
            nodeId,
            pagination,
            entries,
          },
        };
      }

      const path = getAlfrescoAuditAppEntriesPath(applicationId);
      const payload = await auditApi.listAuditEntriesForAuditApp(applicationId, listOpts as any);
      const { entries, pagination } = sliceAlfrescoPagedList(payload, skipCount, maxItems);
      return {
        ok: true,
        data: {
          apiTrace: { method: 'GET', path, request: { query: listOpts }, responseBody: payload },
          scope: 'application',
          applicationId,
          pagination,
          entries,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
