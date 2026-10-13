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

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { z } from 'zod';

export interface CapturedGatewayRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  jsonRpcMethod?: string;
  protocolVersion?: string;
}

export interface FakeMcpGatewayOptions {
  apiKey?: string;
  stateful?: boolean;
  statusOverride?: number;
  redirectTo?: string;
  paginatedToolCount?: number;
  pageSize?: number;
  capabilities?: { tools?: boolean; prompts?: boolean; resources?: boolean };
  repositoryId?: string;
  delayMs?: number;
}

export interface FakeMcpGateway {
  url: string;
  port: number;
  requests: CapturedGatewayRequest[];
  toolCalls: Array<{ name: string; arguments: unknown }>;
  cancelled: number;
  expireNextSession: () => void;
  sendToolListChanged: () => void;
  close: () => Promise<void>;
}

const REPO_INFO_URI = 'alfresco://repository/info';

function headerMap(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key.toLowerCase()] = value;
    } else if (Array.isArray(value) && value[0]) {
      headers[key.toLowerCase()] = value[0];
    }
  }
  return headers;
}

function jsonRpcMeta(body: unknown): { jsonRpcMethod?: string; protocolVersion?: string } {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const record = body as { method?: unknown; params?: { protocolVersion?: unknown } };
  const jsonRpcMethod = typeof record.method === 'string' ? record.method : undefined;
  const protocolVersion =
    typeof record.params?.protocolVersion === 'string' ? record.params.protocolVersion : undefined;
  return { jsonRpcMethod, protocolVersion };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function startFakeMcpGateway(
  options: FakeMcpGatewayOptions = {}
): Promise<FakeMcpGateway> {
  const [{ McpServer, ResourceTemplate }, { StreamableHTTPServerTransport }, { Server }, types] =
    await Promise.all([
      import('@modelcontextprotocol/sdk/server/mcp.js'),
      import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
      import('@modelcontextprotocol/sdk/server/index.js'),
      import('@modelcontextprotocol/sdk/types.js'),
    ]);

  const apiKey = options.apiKey ?? 'gw-secret';
  const stateful = options.stateful ?? true;
  const pageSize = options.pageSize ?? 20;
  const capabilities = {
    tools: options.capabilities?.tools ?? true,
    prompts: options.capabilities?.prompts ?? true,
    resources: options.capabilities?.resources ?? true,
  };
  const repositoryId = options.repositoryId ?? 'repo-test-1';
  const delayMs = options.delayMs ?? 0;

  const requests: CapturedGatewayRequest[] = [];
  const toolCalls: Array<{ name: string; arguments: unknown }> = [];
  let cancelled = 0;
  let expireNext = false;
  let liveMcp: InstanceType<typeof McpServer> | null = null;

  const transports = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();

  function registerStandardTools(mcp: InstanceType<typeof McpServer>): void {
    if (capabilities.tools) {
      mcp.registerTool(
        'echo_read',
        {
          description: 'Read-only echo',
          inputSchema: { message: z.string() },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async ({ message }) => {
          toolCalls.push({ name: 'echo_read', arguments: { message } });
          return {
            content: [{ type: 'text', text: JSON.stringify({ echo: message }) }],
          };
        }
      );
      mcp.registerTool(
        'echo_write',
        {
          description: 'Write echo',
          inputSchema: { message: z.string() },
          annotations: { readOnlyHint: false, destructiveHint: false },
        },
        async ({ message }) => {
          toolCalls.push({ name: 'echo_write', arguments: { message } });
          return {
            content: [{ type: 'text', text: JSON.stringify({ echo: message }) }],
          };
        }
      );
      mcp.registerTool(
        'echo_destroy',
        {
          description: 'Destructive echo',
          inputSchema: { message: z.string() },
          annotations: { readOnlyHint: false, destructiveHint: true },
        },
        async ({ message }) => {
          toolCalls.push({ name: 'echo_destroy', arguments: { message } });
          return {
            content: [{ type: 'text', text: JSON.stringify({ echo: message }) }],
          };
        }
      );
      mcp.registerTool(
        'echo_unknown',
        {
          description: 'No annotations',
          inputSchema: { message: z.string() },
        },
        async ({ message }) => {
          toolCalls.push({ name: 'echo_unknown', arguments: { message } });
          return {
            content: [{ type: 'text', text: JSON.stringify({ echo: message }) }],
          };
        }
      );
      mcp.registerTool(
        'fail_tool',
        {
          description: 'Always errors',
          inputSchema: { message: z.string().optional() },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async () => {
          toolCalls.push({ name: 'fail_tool', arguments: {} });
          return {
            isError: true,
            content: [{ type: 'text', text: 'gateway boom' }],
          };
        }
      );
      mcp.registerTool(
        'structured_tool',
        {
          description: 'Structured content',
          inputSchema: { message: z.string().optional() },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async () => {
          toolCalls.push({ name: 'structured_tool', arguments: {} });
          return {
            content: [{ type: 'text', text: 'ignored' }],
            structuredContent: { hello: 'world' },
          };
        }
      );
      mcp.registerTool(
        'image_tool',
        {
          description: 'Returns an image',
          inputSchema: { message: z.string().optional() },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async () => {
          toolCalls.push({ name: 'image_tool', arguments: {} });
          return {
            content: [
              {
                type: 'image',
                data: Buffer.from('png').toString('base64'),
                mimeType: 'image/png',
              },
            ],
          };
        }
      );
      mcp.registerTool(
        'slow_tool',
        {
          description: 'Delayed tool',
          inputSchema: { message: z.string().optional() },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        async (_args, extra) => {
          toolCalls.push({ name: 'slow_tool', arguments: {} });
          const wait = delayMs || 250;
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, wait);
            extra.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              cancelled += 1;
              reject(new Error('cancelled'));
            });
          });
          return { content: [{ type: 'text', text: JSON.stringify({ slow: true }) }] };
        }
      );
    }

    if (capabilities.prompts) {
      mcp.registerPrompt(
        'summarize',
        {
          description: 'Summarize a topic',
          argsSchema: { topic: z.string() },
        },
        async ({ topic }) => ({
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: `Summarize: ${topic}` },
            },
          ],
        })
      );
    }

    if (capabilities.resources) {
      mcp.registerResource(
        'repo-info',
        REPO_INFO_URI,
        { mimeType: 'application/json', description: 'Repository discovery' },
        async uri => ({
          contents: [
            {
              uri: typeof uri === 'string' ? uri : uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ entry: { repository: { id: repositoryId } } }),
            },
          ],
        })
      );
      mcp.registerResource(
        'node',
        new ResourceTemplate('alfresco://node/{id}', { list: undefined }),
        { mimeType: 'text/plain' },
        async (uri, vars) => ({
          contents: [
            {
              uri: typeof uri === 'string' ? uri : uri.href,
              mimeType: 'text/plain',
              text: `node ${String((vars as { id?: string }).id ?? '')}`,
            },
          ],
        })
      );
    }
  }

  function isInitializeRequest(body: unknown): boolean {
    return jsonRpcMeta(body).jsonRpcMethod === 'initialize';
  }

  async function createTransport(): Promise<
    InstanceType<typeof StreamableHTTPServerTransport>
  > {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: stateful ? () => randomUUID() : undefined,
      enableJsonResponse: true,
      onsessioninitialized: (id: string) => {
        transports.set(id, transport);
      },
    });

    if (options.paginatedToolCount) {
      const total = options.paginatedToolCount;
      const server = new Server(
        { name: 'fake-agent-gateway', version: '1.6.0' },
        { capabilities: { tools: {} } }
      );
      server.setRequestHandler(types.ListToolsRequestSchema, async request => {
        const cursor = Number.parseInt(String(request.params?.cursor || '0'), 10) || 0;
        const start = cursor;
        const end = Math.min(start + pageSize, total);
        const tools = Array.from({ length: Math.max(0, end - start) }, (_, index) => {
          const n = start + index;
          return {
            name: `paged_tool_${n}`,
            description: `Paged tool ${n}`,
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, destructiveHint: false },
          };
        });
        return {
          tools,
          nextCursor: end < total ? String(end) : undefined,
        };
      });
      await server.connect(transport);
      return transport;
    }

    if (!capabilities.tools && !capabilities.prompts && !capabilities.resources) {
      const server = new Server(
        { name: 'fake-agent-gateway', version: '1.6.0' },
        { capabilities: {} }
      );
      await server.connect(transport);
      return transport;
    }

    const mcp = new McpServer(
      { name: 'fake-agent-gateway', version: '1.6.0' },
      {
        capabilities: {
          tools: capabilities.tools ? { listChanged: true } : undefined,
          prompts: capabilities.prompts ? { listChanged: true } : undefined,
          resources: capabilities.resources ? { listChanged: true } : undefined,
        },
      }
    );
    registerStandardTools(mcp);
    liveMcp = mcp;
    await mcp.connect(transport);
    return transport;
  }

  const httpServer: HttpServer = createServer(async (req, res) => {
    const headers = headerMap(req);
    let body: unknown;
    try {
      if (req.method === 'POST') {
        body = await readJsonBody(req);
      }
    } catch {
      res.statusCode = 400;
      res.end('invalid json');
      return;
    }

    const meta = jsonRpcMeta(body);
    requests.push({
      method: req.method || 'GET',
      url: req.url || '/',
      headers,
      ...meta,
    });
    if (meta.jsonRpcMethod === 'notifications/cancelled') {
      cancelled += 1;
    }

    if (options.statusOverride) {
      res.statusCode = options.statusOverride;
      res.end();
      return;
    }
    if (options.redirectTo) {
      res.statusCode = 302;
      res.setHeader('Location', options.redirectTo);
      res.end();
      return;
    }

    if (headers.authorization !== `Bearer ${apiKey}`) {
      res.statusCode = 401;
      res.end();
      return;
    }

    try {
      const sessionId = headers['mcp-session-id'];
      if (expireNext && sessionId) {
        expireNext = false;
        const expired = transports.get(sessionId);
        transports.delete(sessionId);
        await expired?.close().catch(() => undefined);
        res.statusCode = 404;
        res.end();
        return;
      }

      let transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        if (sessionId && stateful) {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (req.method === 'POST' && !isInitializeRequest(body) && stateful) {
          res.statusCode = 400;
          res.end();
          return;
        }
        transport = await createTransport();
      }

      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    }
  });

  await new Promise<void>(resolve => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind fake MCP gateway');
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    port: address.port,
    requests,
    toolCalls,
    get cancelled() {
      return cancelled;
    },
    expireNextSession() {
      expireNext = true;
    },
    sendToolListChanged() {
      liveMcp?.sendToolListChanged();
    },
    async close() {
      await Promise.all([...transports.values()].map(item => item.close().catch(() => undefined)));
      await new Promise<void>((resolve, reject) => {
        httpServer.close(error => (error ? reject(error) : resolve()));
      });
    },
  };
}
