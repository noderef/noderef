/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { PeopleApi } from '@alfresco/js-api';
import { getAlfrescoPeoplePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const peopleGetTool: ToolDefinition = {
  name: 'people_get',
  description: 'Fetch profile details for one repository user by person ID.',
  skill: { kind: 'local_md', path: '../skills/people_get.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      personId: {
        type: 'string',
        description: 'Person ID (username), e.g. admin',
      },
    },
    required: ['personId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const personId = typeof args.personId === 'string' ? args.personId.trim() : '';
      if (!personId) {
        return { ok: false, error: 'personId is required' };
      }

      const requestQuery = {
        fields: [
          'id',
          'firstName',
          'lastName',
          'displayName',
          'email',
          'emailNotificationsEnabled',
          'enabled',
          'company',
          'quota',
          'quotaUsed',
          'createdAt',
          'description',
          'capabilities',
        ],
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const peopleApi = new PeopleApi(ctx.api);
      const result = await peopleApi.getPerson(personId, requestQuery);
      const entry = (result as any)?.entry ?? result;
      const capabilities = isRecord(entry?.capabilities) ? entry.capabilities : {};

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: getAlfrescoPeoplePath(personId),
            request: { query: requestQuery },
            responseBody: result,
          },
          id: typeof entry?.id === 'string' ? entry.id : personId,
          firstName: typeof entry?.firstName === 'string' ? entry.firstName : null,
          lastName: typeof entry?.lastName === 'string' ? entry.lastName : null,
          displayName: typeof entry?.displayName === 'string' ? entry.displayName : null,
          email: typeof entry?.email === 'string' ? entry.email : null,
          emailNotificationsEnabled:
            typeof entry?.emailNotificationsEnabled === 'boolean'
              ? entry.emailNotificationsEnabled
              : null,
          enabled: typeof entry?.enabled === 'boolean' ? entry.enabled : null,
          company: isRecord(entry?.company) ? entry.company : null,
          quota: typeof entry?.quota === 'number' && Number.isFinite(entry.quota) ? entry.quota : null,
          quotaUsed:
            typeof entry?.quotaUsed === 'number' && Number.isFinite(entry.quotaUsed)
              ? entry.quotaUsed
              : null,
          createdAt: entry?.createdAt ?? null,
          description: typeof entry?.description === 'string' ? entry.description : null,
          capabilities: {
            isAdmin: typeof capabilities.isAdmin === 'boolean' ? capabilities.isAdmin : null,
            isMutable: typeof capabilities.isMutable === 'boolean' ? capabilities.isMutable : null,
            isGuest: typeof capabilities.isGuest === 'boolean' ? capabilities.isGuest : null,
          },
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
