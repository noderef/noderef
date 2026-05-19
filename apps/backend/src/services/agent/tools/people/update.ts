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

import type { PersonBodyUpdate } from '@alfresco/js-api';
import { PeopleApi } from '@alfresco/js-api';
import { getAlfrescoPeoplePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { parseCompanyFromArgs } from '../helpers/personCompany.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const peopleUpdateTool: ToolDefinition = {
  name: 'people_update',
  description:
    'Update an existing person (names, email, enabled flags, optional password change with oldPassword when required).',
  skill: { kind: 'local_md', path: '../skills/people_update.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      personId: { type: 'string', description: 'Username to update' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string' },
      description: { type: 'string' },
      enabled: { type: 'boolean' },
      emailNotificationsEnabled: { type: 'boolean' },
      password: { type: 'string', description: 'New password when changing password' },
      oldPassword: { type: 'string', description: 'Current password when server requires it' },
      company: { type: 'object', description: 'Company fields (same shape as people_create)' },
    },
    required: ['personId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const personId = typeof args.personId === 'string' ? args.personId.trim() : '';
      if (!personId) {
        return { ok: false, error: 'personId is required' };
      }

      const body: PersonBodyUpdate = {};
      if (typeof args.firstName === 'string' && args.firstName.trim()) {
        body.firstName = args.firstName.trim();
      }
      if (typeof args.lastName === 'string' && args.lastName.trim()) {
        body.lastName = args.lastName.trim();
      }
      if (typeof args.email === 'string' && args.email.trim()) {
        body.email = args.email.trim();
      }
      if (typeof args.description === 'string') {
        body.description = args.description;
      }
      if (typeof args.enabled === 'boolean') {
        body.enabled = args.enabled;
      }
      if (typeof args.emailNotificationsEnabled === 'boolean') {
        body.emailNotificationsEnabled = args.emailNotificationsEnabled;
      }
      if (typeof args.password === 'string' && args.password.length) {
        body.password = args.password;
      }
      if (typeof args.oldPassword === 'string' && args.oldPassword.length) {
        body.oldPassword = args.oldPassword;
      }

      const company = parseCompanyFromArgs(args.company);
      if (company) {
        body.company = company;
      }

      if (!Object.keys(body).length) {
        return { ok: false, error: 'Provide at least one field to update' };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const peopleApi = new PeopleApi(ctx.api);
      const path = getAlfrescoPeoplePath(personId);
      const result = await peopleApi.updatePerson(personId, body);

      const traceBody = { ...body };
      if (traceBody.password) {
        traceBody.password = '[redacted]';
      }
      if (traceBody.oldPassword) {
        traceBody.oldPassword = '[redacted]';
      }

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path,
            request: { body: traceBody },
            responseBody: result,
          },
          person: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
