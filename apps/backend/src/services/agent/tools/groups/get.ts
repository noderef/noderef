/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { GroupsApi } from '@alfresco/js-api';
import { getAlfrescoGroupMembersPath, getAlfrescoGroupPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { normalizeGroupId } from '../helpers/groupHelpers.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const groupGetTool: ToolDefinition = {
  name: 'group_get',
  description: 'Get group details and optionally list group members with pagination.',
  skill: { kind: 'local_md', path: '../skills/group_get.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'Group ID, e.g. GROUP_ALFRESCO_ADMINISTRATORS',
      },
      includeMembers: {
        type: 'boolean',
        description: 'If true, include group members (default true)',
      },
      maxMembers: {
        type: 'number',
        description: 'Maximum members to return (default 50, max 200)',
      },
    },
    required: ['groupId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const rawGroupId = typeof args.groupId === 'string' ? args.groupId.trim() : '';
      const groupId = normalizeGroupId(rawGroupId);
      if (!groupId) {
        return { ok: false, error: 'groupId is required' };
      }

      const includeMembers =
        typeof args.includeMembers === 'boolean' ? args.includeMembers : true;
      const maxMembersRaw =
        typeof args.maxMembers === 'number' && Number.isFinite(args.maxMembers)
          ? Math.max(0, Math.min(Math.floor(args.maxMembers), 200))
          : 50;
      const maxMembers = Math.max(1, maxMembersRaw);

      const groupQuery = {
        include: ['zones'],
        fields: ['id', 'displayName', 'isRoot', 'zones'],
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const groupsApi = new GroupsApi(ctx.api);
      const groupResult = await groupsApi.getGroup(groupId, groupQuery);
      const groupEntry = (groupResult as any)?.entry ?? groupResult;

      let membersResult: unknown = null;
      let members: Array<{ id: string | null; displayName: string | null; memberType: 'GROUP' | 'PERSON' }> =
        [];
      let pagination = {
        totalCount: 0,
        hasMoreItems: false,
        skipCount: 0,
        maxItems: includeMembers ? maxMembers : 0,
        nextSkipCount: null as number | null,
      };

      if (includeMembers) {
        const membersQuery = {
          skipCount: 0,
          maxItems: maxMembers,
          fields: ['id', 'displayName', 'memberType'],
        };

        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }

        membersResult = await groupsApi.listGroupMemberships(groupId, membersQuery);
        const memberList = isRecord((membersResult as any)?.list) ? (membersResult as any).list : {};
        const memberEntries = Array.isArray(memberList.entries) ? memberList.entries : [];
        const membersPagination = isRecord(memberList.pagination) ? memberList.pagination : {};

        members = memberEntries
          .map((item: unknown) => (isRecord((item as any)?.entry) ? (item as any).entry : null))
          .filter((entry: Record<string, unknown> | null): entry is Record<string, unknown> => Boolean(entry))
          .map((entry: Record<string, unknown>) => ({
            id: typeof entry.id === 'string' ? entry.id : null,
            displayName: typeof entry.displayName === 'string' ? entry.displayName : null,
            memberType: entry.memberType === 'GROUP' ? 'GROUP' : 'PERSON',
          }));

        const totalCount =
          typeof membersPagination.totalItems === 'number' && Number.isFinite(membersPagination.totalItems)
            ? membersPagination.totalItems
            : members.length;
        const hasMoreItems =
          typeof membersPagination.hasMoreItems === 'boolean'
            ? membersPagination.hasMoreItems
            : members.length < totalCount;
        const nextSkipCount = hasMoreItems ? members.length : null;

        pagination = {
          totalCount,
          hasMoreItems,
          skipCount: 0,
          maxItems: maxMembers,
          nextSkipCount,
        };
      }

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: getAlfrescoGroupPath(groupId),
            request: {
              query: {
                group: groupQuery,
                members: includeMembers
                  ? {
                      skipCount: 0,
                      maxItems: maxMembers,
                      fields: ['id', 'displayName', 'memberType'],
                    }
                  : null,
              },
            },
            responseBody: {
              group: groupResult,
              members: membersResult,
            },
            followUp: includeMembers
              ? {
                  method: 'GET',
                  path: getAlfrescoGroupMembersPath(groupId),
                }
              : null,
          },
          id: typeof groupEntry?.id === 'string' ? groupEntry.id : groupId,
          displayName: typeof groupEntry?.displayName === 'string' ? groupEntry.displayName : null,
          isRoot: typeof groupEntry?.isRoot === 'boolean' ? groupEntry.isRoot : null,
          zones: Array.isArray(groupEntry?.zones)
            ? groupEntry.zones
                .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
                .filter(Boolean)
            : [],
          members,
          pagination,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
