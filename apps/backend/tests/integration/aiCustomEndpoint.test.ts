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

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAnthropic, listAnthropicModels } from '../../src/ai/anthropic.js';

interface SeenRequest {
  url?: string;
  authorization?: string;
  xApiKey?: string;
  closedEarly?: boolean;
}

describe('Anthropic-compatible custom endpoints', () => {
  const seen: SeenRequest[] = [];
  let server: http.Server;
  let baseURL: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const entry: SeenRequest = {
        url: req.url,
        authorization: req.headers.authorization,
        xApiKey: req.headers['x-api-key'] as string | undefined,
      };
      seen.push(entry);
      if (req.url?.startsWith('/hang/')) {
        // Simulates a busy local model: never answers until the client disconnects.
        res.on('close', () => {
          entry.closedEarly = !res.writableEnded;
        });
        return;
      }
      res.setHeader('content-type', 'application/json');
      if (req.url?.startsWith('/v1/models')) {
        // OpenAI-shaped listing, as returned by Ollama, LiteLLM and llama.cpp.
        res.end(
          JSON.stringify({
            object: 'list',
            data: [{ id: 'llama3.2:latest', object: 'model', created: 1, owned_by: 'library' }],
          })
        );
        return;
      }
      res.end(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'llama3.2',
          content: [{ type: 'text', text: 'hello from local' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      );
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  beforeEach(() => {
    seen.length = 0;
  });

  it('calls a keyless server without auth headers', async () => {
    const text = await callAnthropic({ apiKey: '', baseURL, model: 'llama3.2', prompt: 'hi' });

    expect(text).toBe('hello from local');
    expect(seen).toEqual([{ url: '/v1/messages', authorization: undefined, xApiKey: undefined }]);
  });

  it('sends the key as both x-api-key and bearer token when authToken is set', async () => {
    await callAnthropic({
      apiKey: 'sk-local',
      authToken: 'sk-local',
      baseURL,
      model: 'llama3.2',
      prompt: 'hi',
    });

    expect(seen[0]).toMatchObject({ authorization: 'Bearer sk-local', xApiKey: 'sk-local' });
  });

  it('parses OpenAI-shaped /v1/models listings', async () => {
    const models = await listAnthropicModels({ apiKey: '', baseURL });

    expect(models.map(model => model.id)).toEqual(['llama3.2:latest']);
    expect(seen[0]?.url).toMatch(/^\/v1\/models/);
  });

  it('closes the HTTP request when the call is aborted', async () => {
    const controller = new AbortController();
    const call = callAnthropic({
      apiKey: '',
      baseURL: `${baseURL}/hang`,
      model: 'llama3.2',
      prompt: 'hi',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    controller.abort();

    await expect(call).rejects.toThrow();
    await vi.waitFor(() => expect(seen[0]?.closedEarly).toBe(true));
  });
});
