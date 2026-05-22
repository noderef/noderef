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

import type { PersonBodyCreate } from '@alfresco/js-api';
import { PeopleApi } from '@alfresco/js-api';
import { getAlfrescoPeopleCollectionPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { parseCompanyFromArgs } from '../helpers/personCompany.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const peopleCreateTool: ToolDefinition = {
  name: 'people_create',
  description:
    'Create a new repository person (username, names, email, initial password). Optional profile fields.',
  skill: { kind: 'local_md', path: '../skills/people_create.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Username (person id)' },
      firstName: { type: 'string', description: 'Given name' },
      lastName: { type: 'string', description: 'Family name' },
      email: { type: 'string', description: 'Email address' },
      password: { type: 'string', description: 'Initial password' },
      enabled: { type: 'boolean', description: 'Account enabled (default true)' },
      emailNotificationsEnabled: { type: 'boolean', description: 'Email notifications' },
      description: { type: 'string', description: 'Optional description' },
      company: {
        type: 'object',
        description: 'Optional company object (organization, address1, telephone, email, ...)',
      },
    },
    required: ['id', 'firstName', 'email', 'password'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const id = typeof args.id === 'string' ? args.id.trim() : '';
      const firstName = typeof args.firstName === 'string' ? args.firstName.trim() : '';
      const lastName = typeof args.lastName === 'string' ? args.lastName.trim() : '';
      const email = typeof args.email === 'string' ? args.email.trim() : '';
      const password = typeof args.password === 'string' ? args.password : '';
      if (!id || !firstName || !email || !password) {
        return { ok: false, error: 'id, firstName, email, and password are required' };
      }

      const body: PersonBodyCreate = {
        id,
        firstName,
        email,
        password,
        ...(lastName ? { lastName } : {}),
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
        ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : { enabled: true }),
        ...(typeof args.emailNotificationsEnabled === 'boolean'
          ? { emailNotificationsEnabled: args.emailNotificationsEnabled }
          : {}),
      };

      const company = parseCompanyFromArgs(args.company);
      if (company) {
        body.company = company;
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const peopleApi = new PeopleApi(ctx.api);
      const path = getAlfrescoPeopleCollectionPath();
      const result = await peopleApi.createPerson(body);

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path,
            request: {
              body: {
                ...body,
                password: '[redacted]',
              },
            },
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
