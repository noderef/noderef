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

import { GroupsApi } from '@alfresco/js-api';
import {
  getAlfrescoGroupMemberPath,
  getAlfrescoGroupMembersPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { normalizeGroupId } from '../helpers/groupHelpers.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

interface MemberAddRequest {
  id: string;
  memberType: 'GROUP' | 'PERSON';
}

function parseAddMembers(value: unknown): MemberAddRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const parsed: MemberAddRequest[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const idRaw = typeof item.id === 'string' ? item.id.trim() : '';
    if (!idRaw) {
      continue;
    }

    const memberTypeRaw =
      typeof item.memberType === 'string' ? item.memberType.trim().toUpperCase() : '';
    const memberType: 'GROUP' | 'PERSON' =
      memberTypeRaw === 'GROUP' || memberTypeRaw === 'PERSON'
        ? memberTypeRaw
        : idRaw.startsWith('GROUP_')
          ? 'GROUP'
          : 'PERSON';

    const normalizedId =
      memberType === 'GROUP' && !idRaw.startsWith('GROUP_') ? `GROUP_${idRaw}` : idRaw;
    const key = `${memberType}:${normalizedId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    parsed.push({ id: normalizedId, memberType });
  }

  return parsed;
}

function parseRemoveMembers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const parsed: string[] = [];

  for (const item of value) {
    const memberId = typeof item === 'string' ? item.trim() : '';
    if (!memberId || seen.has(memberId)) {
      continue;
    }
    seen.add(memberId);
    parsed.push(memberId);
  }

  return parsed;
}

export const groupMembersTool: ToolDefinition = {
  name: 'group_members',
  description: 'Add or remove members (users or sub-groups) for a target group.',
  skill: { kind: 'local_md', path: '../skills/group_members.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'Target group ID, e.g. GROUP_ALFRESCO_ADMINISTRATORS',
      },
      add: {
        type: 'array',
        description: 'Members to add as { id, memberType }',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            memberType: { type: 'string', enum: ['PERSON', 'GROUP'] },
          },
          required: ['id', 'memberType'],
        },
      },
      remove: {
        type: 'array',
        description: 'Member IDs to remove from the group',
        items: { type: 'string' },
      },
    },
    required: ['groupId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const rawGroupId = typeof args.groupId === 'string' ? args.groupId.trim() : '';
      const groupId = normalizeGroupId(rawGroupId);
      if (!groupId) {
        return { ok: false, error: 'groupId is required' };
      }

      const addMembers = parseAddMembers(args.add);
      const removeMembers = parseRemoveMembers(args.remove);

      if (!addMembers.length && !removeMembers.length) {
        return { ok: false, error: 'Provide at least one add or remove membership operation' };
      }

      const groupsApi = new GroupsApi(ctx.api);
      const stepTrace: Array<{
        method: 'POST' | 'DELETE' | 'GET';
        path: string;
        request: Record<string, unknown>;
        responseBody: unknown;
      }> = [];
      const added: MemberAddRequest[] = [];
      const removed: string[] = [];

      for (const member of addMembers) {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }

        const requestBody = { id: member.id, memberType: member.memberType };
        const addResult = await groupsApi.createGroupMembership(groupId, requestBody as any);
        added.push(member);
        stepTrace.push({
          method: 'POST',
          path: getAlfrescoGroupMembersPath(groupId),
          request: { body: requestBody },
          responseBody: addResult,
        });
      }

      for (const memberId of removeMembers) {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }

        await groupsApi.deleteGroupMembership(groupId, memberId);
        removed.push(memberId);
        stepTrace.push({
          method: 'DELETE',
          path: getAlfrescoGroupMemberPath(groupId, memberId),
          request: {},
          responseBody: null,
        });
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const countQuery = { skipCount: 0, maxItems: 1, fields: ['id'] };
      const countResult = await groupsApi.listGroupMemberships(groupId, countQuery);
      const memberList = isRecord((countResult as any)?.list) ? (countResult as any).list : {};
      const memberPagination = isRecord(memberList.pagination) ? memberList.pagination : {};
      const finalMemberCount =
        typeof memberPagination.totalItems === 'number' &&
        Number.isFinite(memberPagination.totalItems)
          ? memberPagination.totalItems
          : Array.isArray(memberList.entries)
            ? memberList.entries.length
            : 0;

      stepTrace.push({
        method: 'GET',
        path: getAlfrescoGroupMembersPath(groupId),
        request: { query: countQuery },
        responseBody: countResult,
      });
      const primaryMethod: 'POST' | 'DELETE' = addMembers.length > 0 ? 'POST' : 'DELETE';

      return {
        ok: true,
        data: {
          apiTrace: {
            method: primaryMethod,
            path: getAlfrescoGroupMembersPath(groupId),
            request: {
              groupId,
              add: addMembers,
              remove: removeMembers,
            },
            responseBody: {
              steps: stepTrace,
              finalMemberCount,
            },
          },
          groupId,
          added,
          removed,
          finalMemberCount,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
