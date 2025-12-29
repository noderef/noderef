/**
 * Copyright 2025 NodeRef
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

/**
 * JavaScript Console RPC handlers
 * Handles all backend.jsconsole.* RPC methods
 */

import { NodesApi, SearchApi, WebscriptApi } from '@alfresco/js-api';
import { z } from 'zod';
import { AppErrors } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import { extractParentRefFromNodeEntry, normalizeNodeRef } from './helpers.js';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId, withAuth, withAuthAndCredentials } from './withAuth.js';

const log = createLogger('backend.rpc.jsconsole');

/**
 * Register all JavaScript Console related RPC handlers
 */
export function registerJsConsoleHandlers(routes: Routes, ctx: RpcContext): void {
  const { nodeHistoryService, jsConsoleHistoryService } = ctx;

  routes['backend.jsconsole.getHistory'] = {
    schema: z.object({
      serverId: z.number().optional(),
      limit: z.number().optional().default(25),
      cursor: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, limit, cursor } = params as {
        serverId?: number;
        limit?: number;
        cursor?: number;
      };

      return jsConsoleHistoryService.list(userId, { serverId, limit, cursor });
    },
  };

  routes['backend.jsconsole.execute'] = {
    schema: z.object({
      serverId: z.number(),
      script: z.string(),
      documentNodeRef: z.string().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, documentNodeRef } = params as {
        serverId: number;
        script: string;
        documentNodeRef?: string;
      };
      const script = (params as any).script as string;

      return withAuthAndCredentials(ctx, serverId, async ({ api, server, username }) => {
        const jsConsoleEndpoint = server.jsconsoleEndpoint;
        if (!jsConsoleEndpoint) {
          return AppErrors.invalidInput(
            'JavaScript Console endpoint not configured for this server. Please configure it in server settings.'
          );
        }

        const jsConsoleEndpointClean = jsConsoleEndpoint.replace(/^\/+/, '');

        log.debug({ serverId, endpoint: jsConsoleEndpointClean }, 'Executing JavaScript on server');

        try {
          const resultChannel = Date.now().toString();

          const webscriptApi = new WebscriptApi(api);

          const executePayload = {
            script,
            template: '',
            spaceNodeRef: '',
            transaction: 'readwrite',
            runas: username || '',
            urlargs: '',
            documentNodeRef: documentNodeRef || '',
            resultChannel,
          };

          // Step 1: POST to /execute
          try {
            const executeResult = await webscriptApi.executeWebScript(
              'POST',
              `${jsConsoleEndpointClean}/execute`,
              undefined,
              undefined,
              undefined,
              executePayload
            );

            if (
              executeResult &&
              (executeResult.scriptPerf !== undefined || executeResult.error !== undefined)
            ) {
              log.debug(
                { serverId, resultChannel, immediate: true },
                'Script completed immediately'
              );

              const output = executeResult?.printOutput
                ? Array.isArray(executeResult.printOutput)
                  ? executeResult.printOutput.join('\n')
                  : String(executeResult.printOutput)
                : null;

              const error = executeResult?.error
                ? typeof executeResult.error === 'string'
                  ? executeResult.error
                  : JSON.stringify(executeResult.error)
                : null;

              await jsConsoleHistoryService.create({ userId, serverId, script, output, error });

              return { success: true, result: executeResult };
            }
          } catch (executeError: any) {
            if (executeError.status !== 408) {
              log.error({ err: executeError, serverId }, 'Execute POST failed');
              throw executeError;
            }
            log.debug({ serverId, resultChannel }, 'Execute returned 408, will poll for results');
          }

          // Step 2: Poll for results
          const maxPolls = 60;
          let result: any = null;

          for (let poll = 1; poll <= maxPolls; poll++) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
              result = await webscriptApi.executeWebScript(
                'GET',
                `${jsConsoleEndpointClean}/${resultChannel}/executionResult`,
                undefined,
                undefined,
                undefined,
                undefined
              );

              const isComplete =
                result?.error !== undefined ||
                Array.isArray(result?.result) ||
                result?.scriptPerf !== undefined;

              if (isComplete) {
                log.debug(
                  { serverId, poll, printOutputLength: result.printOutput?.length || 0 },
                  'Script execution completed'
                );
                break;
              }

              if (poll % 5 === 0) {
                log.debug(
                  { serverId, poll, printOutputLength: result?.printOutput?.length || 0 },
                  'Polling...'
                );
              }
            } catch (pollError) {
              log.debug({ serverId, poll, error: pollError }, 'Poll attempt failed');
            }
          }

          const output = result?.printOutput
            ? Array.isArray(result.printOutput)
              ? result.printOutput.join('\n')
              : String(result.printOutput)
            : null;

          const error = result?.error
            ? typeof result.error === 'string'
              ? result.error
              : JSON.stringify(result.error)
            : null;

          await jsConsoleHistoryService.create({ userId, serverId, script, output, error });

          return { success: true, result };
        } catch (error) {
          log.error({ err: error, serverId }, 'JavaScript execution failed');

          await jsConsoleHistoryService.create({
            userId,
            serverId,
            script,
            output: null,
            error: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      });
    },
  };

  routes['backend.jsconsole.getScriptFiles'] = {
    schema: z.object({
      serverId: z.number(),
    }),
    handler: async params => {
      const { serverId } = params as { serverId: number };

      return withAuth(ctx, serverId, async api => {
        try {
          const searchApi = new SearchApi(api);

          const aftsQuery =
            'PATH:"/app:company_home/app:dictionary/app:scripts//*" AND TYPE:"cm:content"';

          const searchRequest = {
            query: { query: aftsQuery, language: 'afts' },
            include: ['properties'],
            fields: ['id', 'name', 'content', 'modifiedAt'],
          };

          const searchResult = await searchApi.search(searchRequest);

          log.debug(
            { serverId, searchResult: JSON.stringify(searchResult, null, 2) },
            'Search result from Alfresco'
          );

          const jsFiles = (searchResult.list?.entries || [])
            .map((entry: any) => entry.entry)
            .filter(
              (node: any) => node.content && node.name && node.name.toLowerCase().endsWith('.js')
            )
            .map((node: any) => ({
              id: node.id,
              name: node.name,
              nodeRef: `workspace://SpacesStore/${node.id}`,
              modifiedAt: node.modifiedAt,
              size: node.content?.sizeInBytes || 0,
            }));

          log.debug({ serverId, count: jsFiles.length, jsFiles }, 'JavaScript files found');
          return jsFiles;
        } catch (error) {
          log.error({ err: error, serverId }, 'Failed to search for script files');
          throw error;
        }
      });
    },
  };

  routes['backend.jsconsole.loadScriptFile'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId } = params as { serverId: number; nodeId: string };

      return withAuth(ctx, serverId, async api => {
        try {
          const nodesApi = new NodesApi(api);

          const [content, nodeDetails] = await Promise.all([
            nodesApi.getNodeContent(nodeId),
            nodesApi.getNode(nodeId, {
              include: ['path'],
              fields: ['id', 'name', 'nodeType', 'content', 'path'],
            }),
          ]);

          let scriptContent = '';
          if (content instanceof Blob) {
            scriptContent = await content.text();
          } else if (typeof content === 'string') {
            scriptContent = content;
          } else {
            scriptContent = String(content);
          }

          const nodeEntry: any = (nodeDetails as any)?.entry ?? nodeDetails;

          await nodeHistoryService.recordAccess({
            userId,
            serverId,
            nodeRef: normalizeNodeRef(nodeEntry?.id ?? nodeId),
            parentRef: extractParentRefFromNodeEntry(nodeEntry),
            name: nodeEntry?.name ?? null,
            path: nodeEntry?.path?.name ?? null,
            type: nodeEntry?.nodeType ?? null,
            mimetype: nodeEntry?.content?.mimeType ?? null,
          });

          return { content: scriptContent };
        } catch (error) {
          log.error({ err: error, serverId, nodeId }, 'Failed to load script file');
          throw error;
        }
      });
    },
  };

  routes['backend.jsconsole.resolveImportedScripts'] = {
    schema: z.object({
      serverId: z.number(),
      imports: z.array(
        z.object({
          resource: z.string(),
          type: z.enum(['path', 'noderef', 'classpath']),
        })
      ),
    }),
    handler: async params => {
      const { serverId, imports } = params as {
        serverId: number;
        imports: Array<{ resource: string; type: 'path' | 'noderef' | 'classpath' }>;
      };

      return withAuth(ctx, serverId, async api => {
        try {
          const nodesApi = new NodesApi(api);
          const searchApi = new SearchApi(api);

          const resolveImportItem = async (
            importItem: (typeof imports)[0]
          ): Promise<{ resource: string; content: string | null; error?: string }> => {
            try {
              if (importItem.type === 'classpath') {
                return {
                  resource: importItem.resource,
                  content: null,
                  error:
                    'Classpath resources cannot be loaded (they exist in server Java classpath)',
                };
              }

              let nodeId: string | null = null;

              if (importItem.type === 'noderef') {
                const match = importItem.resource.match(
                  /(?:workspace|spacesstore):\/\/(?:SpacesStore|spacesstore)\/([a-f0-9-]+)/i
                );
                if (match) {
                  nodeId = match[1];
                } else {
                  return {
                    resource: importItem.resource,
                    content: null,
                    error: 'Invalid NodeRef format',
                  };
                }
              } else if (importItem.type === 'path') {
                const pathParts = importItem.resource.split('/').filter(p => p);
                const fileName = pathParts[pathParts.length - 1];

                const pathQuery = `PATH:"/app:company_home/app:dictionary/app:scripts//${fileName}" AND TYPE:"cm:content"`;

                const searchResult = await searchApi.search({
                  query: { query: pathQuery, language: 'afts' },
                  fields: ['id'],
                });

                if (searchResult.list?.entries?.length) {
                  nodeId = (searchResult.list.entries[0] as any).entry.id;
                } else {
                  const nameQuery = `NAME:"${fileName}" AND PATH:"/app:company_home/app:dictionary/app:scripts//*"`;
                  const nameSearchResult = await searchApi.search({
                    query: { query: nameQuery, language: 'afts' },
                    fields: ['id'],
                  });

                  if (nameSearchResult.list?.entries?.length) {
                    nodeId = (nameSearchResult.list.entries[0] as any).entry.id;
                  } else {
                    return {
                      resource: importItem.resource,
                      content: null,
                      error: 'Script file not found in repository',
                    };
                  }
                }
              }

              if (!nodeId) {
                return {
                  resource: importItem.resource,
                  content: null,
                  error: 'Could not resolve resource to node ID',
                };
              }

              const content = await nodesApi.getNodeContent(nodeId);
              let scriptContent = '';

              if (content instanceof Blob) {
                scriptContent = await content.text();
              } else if (typeof content === 'string') {
                scriptContent = content;
              } else {
                scriptContent = String(content);
              }

              return { resource: importItem.resource, content: scriptContent };
            } catch (error) {
              log.error(
                { err: error, serverId, resource: importItem.resource },
                'Failed to resolve import'
              );
              return {
                resource: importItem.resource,
                content: null,
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          };

          const results = await Promise.all(imports.map(resolveImportItem));

          return { results };
        } catch (error) {
          log.error({ err: error, serverId }, 'Failed to resolve imported scripts');
          throw error;
        }
      });
    },
  };

  routes['backend.jsconsole.saveScriptFile'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      content: z.string(),
    }),
    handler: async params => {
      const { serverId, nodeId, content } = params as {
        serverId: number;
        nodeId: string;
        content: string;
      };

      return withAuth(ctx, serverId, async api => {
        try {
          const nodesApi = new NodesApi(api);

          await nodesApi.updateNodeContent(nodeId, content);

          log.debug({ serverId, nodeId, contentLength: content.length }, 'Script file saved');

          return {
            success: true,
            message: 'Script saved successfully',
          };
        } catch (error) {
          log.error({ err: error, serverId, nodeId }, 'Failed to save script file');
          throw error;
        }
      });
    },
  };
}
