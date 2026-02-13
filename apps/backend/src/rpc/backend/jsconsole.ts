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

/**
 * JavaScript Console RPC handlers
 *
 * Architecture:
 * - backend.jsconsole.execute: Initiates script execution with async mode (resultChannel)
 *   - Quick scripts (< 2s): Returns immediate result
 *   - Long scripts: Returns resultChannel for polling, POST continues in background
 * - backend.jsconsole.pollExecutionResult: Polls for incremental progress updates
 * - backend.jsconsole.getExecuteCompletionResult: Retrieves final result from background POST
 *
 * The initial POST to /execute waits for the complete result (all printOutput lines).
 * Polling provides incremental progress, but the final complete result comes from the POST.
 */

import { NodesApi, SearchApi, WebscriptApi } from '@alfresco/js-api';
import axios from 'axios';
import { z } from 'zod';
import { buildAlfrescoUrl } from '../../lib/alfresco-url.js';
import { AppErrors } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import { extractParentRefFromNodeEntry, normalizeNodeRef } from './helpers.js';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId, withAuth, withAuthAndCredentials } from './withAuth.js';

const log = createLogger('backend.rpc.jsconsole');

// Store pending POST execute promises keyed by resultChannel
// The POST to /execute returns the complete result, polling just shows progress
const pendingExecuteResults = new Map<string, Promise<any>>();

// Cleanup timeout for completed executions (1 minute)
const EXECUTE_RESULT_CLEANUP_DELAY_MS = 60000;

// Quick script detection timeout (2 seconds)
const QUICK_SCRIPT_TIMEOUT_MS = 2000;

/**
 * Helper: Format printOutput to string for history storage
 */
const formatPrintOutputForHistory = (printOutput: unknown): string | null => {
  if (!printOutput) return null;
  return Array.isArray(printOutput) ? printOutput.join('\n') : String(printOutput);
};

/**
 * Helper: Format error to string for history storage
 * Handles Alfresco's error formats: error, callstack, or message fields
 */
const formatErrorForHistory = (result: any): string | null => {
  if (!result) return null;

  // Check for error field
  if (result.error) {
    return typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
  }

  // Check for callstack field (contains full stack trace)
  if (result.callstack) {
    return typeof result.callstack === 'string'
      ? result.callstack
      : JSON.stringify(result.callstack);
  }

  // Check for message field with error status
  if (result.message && result.status?.code >= 400) {
    return typeof result.message === 'string' ? result.message : JSON.stringify(result.message);
  }

  return null;
};

/**
 * Helper: Check if execution is complete based on result
 * Checks for scriptPerf (success), error/callstack/message (failure), or explicit result
 */
const isExecutionComplete = (result: any): boolean => {
  if (!result || typeof result !== 'object') {
    return false;
  }
  // Success indicators
  if (result.scriptPerf !== undefined) {
    return true;
  }
  // Error indicators - Alfresco JS Console uses different fields for errors
  if (result.error !== undefined) {
    return true;
  }
  if (result.callstack !== undefined) {
    return true; // Error with full stack trace
  }
  if (result.message !== undefined && result.status?.code >= 400) {
    return true; // Error message with error status
  }
  if ('result' in result) {
    return true;
  }
  return false;
};

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
      stream: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, documentNodeRef, stream } = params as {
        serverId: number;
        script: string;
        documentNodeRef?: string;
        stream?: boolean;
      };
      const script = (params as any).script as string;

      return withAuthAndCredentials(
        ctx,
        serverId,
        async ({ api, server, username, token, authType }) => {
          const jsConsoleEndpoint = server.jsconsoleEndpoint;
          if (!jsConsoleEndpoint) {
            return AppErrors.invalidInput(
              'JavaScript Console endpoint not configured for this server. Please configure it in server settings.'
            );
          }

          const jsConsoleEndpointClean = jsConsoleEndpoint.replace(/^\/+/, '');

          try {
            const resultChannel = `jsconsole-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

            // Build the webscript URL using utility function
            const executeUrl = buildAlfrescoUrl(
              server.baseUrl,
              `/service/${jsConsoleEndpointClean}/execute`
            );

            // Build auth header based on auth type
            let authHeader: Record<string, string>;

            if (authType === 'openid_connect') {
              // OAuth2/OIDC: use Bearer token
              if (!token) {
                throw new Error('No OAuth2 access token available for JS Console execution');
              }
              authHeader = {
                Authorization: `Bearer ${token}`,
              };
            } else {
              // Basic Auth
              if (!username || !token) {
                throw new Error('Missing username or password for Basic Auth');
              }
              authHeader = {
                Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`,
              };
            }

            // Start the POST call - it will wait until script completes and return complete result
            const executePromise = axios
              .post(executeUrl, executePayload, {
                headers: {
                  'Content-Type': 'application/json',
                  ...authHeader,
                },
                // Allow status codes that indicate script errors (500) to be handled
                validateStatus: status => status < 600,
              })
              .then(response => {
                // If the server returned an error status but with a valid JS Console response,
                // return it (it will have the error/callstack field with stack trace)
                return response.data;
              })
              .catch(error => {
                log.error({ err: error, serverId, resultChannel }, 'Execute POST failed');
                // Extract error details from response if available
                if (error.response?.data) {
                  return error.response.data;
                }
                throw error;
              })
              .finally(() => {
                setTimeout(() => {
                  pendingExecuteResults.delete(resultChannel);
                }, EXECUTE_RESULT_CLEANUP_DELAY_MS);
              });

            pendingExecuteResults.set(resultChannel, executePromise);

            if (stream) {
              // Check if script completes quickly (within 2 seconds)
              const quickResult = await Promise.race([
                executePromise,
                new Promise(resolve => setTimeout(() => resolve(null), QUICK_SCRIPT_TIMEOUT_MS)),
              ]);

              // If script completed quickly, return immediate result
              if (quickResult && isExecutionComplete(quickResult)) {
                const output = formatPrintOutputForHistory(quickResult.printOutput);
                const error = formatErrorForHistory(quickResult);
                await jsConsoleHistoryService.create({ userId, serverId, script, output, error });
                return { success: true, result: quickResult, done: true };
              }

              // Script still running - return channel for polling
              return { success: true, done: false, resultChannel };
            }

            // Fallback: Poll for results (non-stream mode)
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

                if (isExecutionComplete(result)) {
                  break;
                }
              } catch (pollError) {
                log.debug({ serverId, poll }, 'Poll attempt failed');
              }
            }

            const output = formatPrintOutputForHistory(result?.printOutput);
            const error = formatErrorForHistory(result);
            await jsConsoleHistoryService.create({ userId, serverId, script, output, error });

            return { success: true, result };
          } catch (error) {
            log.error({ err: error, serverId }, 'JavaScript execution failed');

            // Extract error details from axios response if available
            let errorMessage: string;
            let errorResult: any = null;

            if (error && typeof error === 'object' && 'response' in error) {
              const axiosError = error as any;
              if (axiosError.response?.data?.error) {
                // Server returned an error response with error details
                errorMessage =
                  typeof axiosError.response.data.error === 'string'
                    ? axiosError.response.data.error
                    : JSON.stringify(axiosError.response.data.error);
                errorResult = axiosError.response.data;
              } else {
                errorMessage = axiosError.message || String(error);
              }
            } else if (error instanceof Error) {
              errorMessage = error.message;
            } else {
              errorMessage = String(error);
            }

            await jsConsoleHistoryService.create({
              userId,
              serverId,
              script,
              output: null,
              error: errorMessage,
            });

            // If we have a structured error result, return it instead of throwing
            if (errorResult) {
              return { success: false, result: errorResult, error: errorMessage };
            }

            throw error;
          }
        }
      );
    },
  };

  routes['backend.jsconsole.pollExecutionResult'] = {
    schema: z.object({
      serverId: z.number(),
      resultChannel: z.string(),
      script: z.string().optional(),
      documentNodeRef: z.string().optional(),
    }),
    handler: async params => {
      const { serverId, resultChannel } = params as {
        serverId: number;
        resultChannel: string;
        script?: string;
        documentNodeRef?: string;
      };

      return withAuthAndCredentials(ctx, serverId, async ({ api, server }) => {
        const jsConsoleEndpoint = server.jsconsoleEndpoint;
        if (!jsConsoleEndpoint) {
          return AppErrors.invalidInput(
            'JavaScript Console endpoint not configured for this server. Please configure it in server settings.'
          );
        }

        const jsConsoleEndpointClean = jsConsoleEndpoint.replace(/^\/+/, '');
        const webscriptApi = new WebscriptApi(api);

        try {
          const result = await webscriptApi.executeWebScript(
            'GET',
            `${jsConsoleEndpointClean}/${resultChannel}/executionResult`,
            undefined,
            undefined,
            undefined,
            undefined
          );

          const done = isExecutionComplete(result);

          return { success: true, result, done };
        } catch (error) {
          log.error(
            { err: error, serverId, resultChannel },
            'Polling executionResult failed for JavaScript console'
          );
          throw error;
        }
      });
    },
  };

  // Get the complete result from the original POST /execute call
  // This should be called when polling shows done=true to get the full result
  routes['backend.jsconsole.getExecuteCompletionResult'] = {
    schema: z.object({
      serverId: z.number(),
      resultChannel: z.string(),
      script: z.string().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, resultChannel, script } = params as {
        serverId: number;
        resultChannel: string;
        script?: string;
      };

      const pendingPromise = pendingExecuteResults.get(resultChannel);

      if (!pendingPromise) {
        log.warn({ serverId, resultChannel }, 'No pending execute result found');
        return { success: false, error: 'No pending result found for this channel' };
      }

      try {
        const result = await pendingPromise;

        // Save to history
        if (script) {
          const output = formatPrintOutputForHistory(result.printOutput);
          const error = formatErrorForHistory(result);
          await jsConsoleHistoryService.create({ userId, serverId, script, output, error });
        }

        return { success: true, result, done: true };
      } catch (error) {
        log.error(
          { err: error, serverId, resultChannel },
          'Failed to get execute completion result'
        );
        throw error;
      }
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
