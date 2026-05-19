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

import { SitesApi } from '@alfresco/js-api';
import {
  getAlfrescoSiteMemberPath,
  getAlfrescoSiteMembersPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const SITE_ROLES = [
  'SiteConsumer',
  'SiteCollaborator',
  'SiteContributor',
  'SiteManager',
] as const;

function normalizeRole(role: string): string | null {
  const r = role.trim();
  return (SITE_ROLES as readonly string[]).includes(r) ? r : null;
}

export const siteMembersTool: ToolDefinition = {
  name: 'site_members',
  description:
    'Add, remove, or update a person site membership (SiteConsumer / SiteCollaborator / SiteContributor / SiteManager). For listing members use site_get with includeMembers.',
  skill: { kind: 'local_md', path: '../skills/site_members.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      siteId: { type: 'string', description: 'Site short name / id' },
      action: {
        type: 'string',
        enum: ['add', 'remove', 'update'],
        description: 'Membership mutation',
      },
      personId: { type: 'string', description: 'Username (person id)' },
      role: {
        type: 'string',
        enum: [...SITE_ROLES],
        description: 'Required for add and update',
      },
    },
    required: ['siteId', 'action', 'personId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const siteId = typeof args.siteId === 'string' ? args.siteId.trim() : '';
      const personId = typeof args.personId === 'string' ? args.personId.trim() : '';
      const action = typeof args.action === 'string' ? args.action.trim().toLowerCase() : '';

      if (!siteId) {
        return { ok: false, error: 'siteId is required' };
      }
      if (!personId) {
        return { ok: false, error: 'personId is required' };
      }
      if (!['add', 'remove', 'update'].includes(action)) {
        return { ok: false, error: 'action must be add, remove, or update' };
      }

      const sitesApi = new SitesApi(ctx.api);

      if (action === 'remove') {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoSiteMemberPath(siteId, personId);
        await sitesApi.deleteSiteMembership(siteId, personId);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'DELETE',
              path,
              request: { siteId, personId },
              responseBody: null,
            },
            siteId,
            personId,
            action: 'remove',
          },
        };
      }

      const roleRaw = typeof args.role === 'string' ? args.role.trim() : '';
      const role = normalizeRole(roleRaw);
      if (!role) {
        return {
          ok: false,
          error: `role is required for ${action} and must be one of: ${SITE_ROLES.join(', ')}`,
        };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      if (action === 'add') {
        const path = getAlfrescoSiteMembersPath(siteId);
        const body = { id: personId, role };
        const result = await sitesApi.createSiteMembership(siteId, body as any);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'POST',
              path,
              request: { body },
              responseBody: result,
            },
            siteId,
            personId,
            role,
            action: 'add',
            member: (result as any)?.entry ?? result,
          },
        };
      }

      const path = getAlfrescoSiteMemberPath(siteId, personId);
      const body = { role };
      const result = await sitesApi.updateSiteMembership(siteId, personId, body as any);
      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path,
            request: { body },
            responseBody: result,
          },
          siteId,
          personId,
          role,
          action: 'update',
          member: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
