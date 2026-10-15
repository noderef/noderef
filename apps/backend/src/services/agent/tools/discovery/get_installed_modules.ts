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

import { DiscoveryApi } from '@alfresco/js-api';
import { getAlfrescoDiscoveryPath } from '../../../../lib/alfresco-endpoints.js';
import { mapError } from '../../../alfresco/errorMapper.js';
import type { AgentExecutionContext } from '../../types.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const NO_MODULE_INFORMATION = 'no module information available';
export const DISCOVERY_UNAVAILABLE =
  'Repository discovery is not available on this server. The Discovery API may be disabled or this ACS version is too old.';

const optionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const toIsoDate = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const raw = value.trim();
    const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return raw;
  }
  return undefined;
};

const unwrapModule = (raw: unknown): Record<string, unknown> | null => {
  if (!isRecord(raw)) {
    return null;
  }
  return isRecord(raw.entry) ? raw.entry : raw;
};

export const mapInstalledModule = (raw: unknown): Record<string, string> | null => {
  const source = unwrapModule(raw);
  const id = optionalString(source?.id);
  if (!id) {
    return null;
  }

  const module: Record<string, string> = { id };
  const title = optionalString(source?.title);
  const description = optionalString(source?.description);
  const version = optionalString(source?.version);
  const installState = optionalString(source?.installState);
  const installDate = toIsoDate(source?.installDate);
  if (title) module.title = title;
  if (description) module.description = description;
  if (version) module.version = version;
  if (installState) module.installState = installState;
  if (installDate) module.installDate = installDate;
  return module;
};

const getRepository = (payload: unknown): Record<string, unknown> => {
  const root = isRecord(payload) ? payload : {};
  const entry = isRecord(root.entry) ? root.entry : root;
  return isRecord(entry.repository) ? entry.repository : entry;
};

export const mapDiscoveryPayload = (payload: unknown): Record<string, unknown> => {
  const repository = getRepository(payload);
  const edition = optionalString(repository.edition);
  const version = isRecord(repository.version)
    ? optionalString(repository.version.display)
    : undefined;
  const rawModules = Array.isArray(repository.modules) ? repository.modules : null;
  const modules = (rawModules ?? [])
    .map(mapInstalledModule)
    .filter((module): module is Record<string, string> => module !== null);

  const data: Record<string, unknown> = {};
  if (edition) data.edition = edition;
  if (version) data.version = version;

  if (modules.length === 0) {
    data.message = NO_MODULE_INFORMATION;
    return data;
  }

  data.modules = modules;
  return data;
};

const getHttpStatus = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  const candidate = err as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown; statusCode?: unknown };
  };
  const status =
    candidate.status ??
    candidate.statusCode ??
    candidate.response?.status ??
    candidate.response?.statusCode;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
};

const toErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }
  if (isRecord(err) && typeof err.message === 'string' && err.message.trim()) {
    return err.message;
  }
  return String(err);
};

const isDiscoveryUnavailableError = (err: unknown, status: number | undefined): boolean => {
  if (status === 403 || status === 404 || status === 501) {
    return true;
  }
  const message = toErrorMessage(err);
  return (
    /discovery.{0,40}(disabled|unavailable|not available)/i.test(message) ||
    /not implemented/i.test(message)
  );
};

export const mapDiscoveryError = (err: unknown): ToolResult => {
  const status = getHttpStatus(err);
  if (status === 401) {
    return { ok: false, error: mapError(err).message };
  }
  if (isDiscoveryUnavailableError(err, status)) {
    return { ok: true, data: { message: DISCOVERY_UNAVAILABLE } };
  }
  return { ok: false, error: toErrorMessage(err) };
};

export const getInstalledModulesTool: ToolDefinition = {
  name: 'get_installed_modules',
  description:
    'Read the complete list of Alfresco modules and repository edition/version from GET /alfresco/api/discovery, regardless of installState (including UNKNOWN or missing states). For module listings, show every returned module in one list or table without filtering or grouping by installState. Use when the user asks which modules are installed, which version of a module is present (e.g. "which version of module X"), or what ACS edition/version the connected repository is running.',
  skill: { kind: 'local_md', path: '../skills/get_installed_modules.md', version: 2 },
  inputSchema: {
    type: 'object',
    properties: {},
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, _args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const discoveryApi = new DiscoveryApi(ctx.api);
      const path = getAlfrescoDiscoveryPath();
      const payload = await discoveryApi.getRepositoryInformation();

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path,
            request: {},
            responseBody: payload,
          },
          ...mapDiscoveryPayload(payload),
        },
      };
    } catch (err) {
      return mapDiscoveryError(err);
    }
  },
};
