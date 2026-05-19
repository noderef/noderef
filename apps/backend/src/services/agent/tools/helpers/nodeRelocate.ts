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
  getAlfrescoNodeCopyPath,
  getAlfrescoNodeMovePath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { normalizeNodePath } from './nodeResultHelpers.js';
import type { ToolResult } from '../types.js';

export type NodeRelocateKind = 'copy' | 'move';

export async function executeNodeRelocate(
  ctx: AgentExecutionContext,
  sourceNodeId: string,
  targetParentId: string,
  kind: NodeRelocateKind
): Promise<ToolResult> {
  const nodesApi = new NodesApi(ctx.api);
  const requestBody = { targetParentId };
  const requestQuery = { fields: ['id', 'name', 'path'] };
  const result =
    kind === 'copy'
      ? await nodesApi.copyNode(sourceNodeId, requestBody, requestQuery)
      : await nodesApi.moveNode(sourceNodeId, requestBody, requestQuery);
  const e = (result as { entry?: unknown })?.entry ?? result;
  const entry = e as { id?: string; name?: string; path?: { name?: string } };
  const path =
    kind === 'copy' ? getAlfrescoNodeCopyPath(sourceNodeId) : getAlfrescoNodeMovePath(sourceNodeId);
  const nodeSummary = {
    id: entry?.id,
    name: entry?.name,
    path: normalizeNodePath(entry?.path?.name),
  };

  return {
    ok: true,
    data: {
      apiTrace: {
        method: 'POST',
        path,
        request: {
          body: requestBody,
          query: requestQuery,
        },
        responseBody: result,
      },
      ...(kind === 'copy' ? { copied: nodeSummary } : { moved: nodeSummary }),
      sourceNodeId,
      targetParentId,
    },
  };
}
