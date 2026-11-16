#!/usr/bin/env node

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
 * NodeRef CLI - drives the running NodeRef backend over its loopback RPC endpoint.
 *
 * Credentials never pass through this process: the backend looks up the saved
 * (encrypted) server credentials itself, so callers only name a server.
 */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_ID = 'nl.noderef.desktop';
const DEV_PORT = 5111;
const POLL_INTERVAL_MS = 1500;

const USAGE = `NodeRef CLI - run actions against Alfresco servers saved in NodeRef.

NodeRef must be running. Saved credentials stay inside NodeRef; you only name a server.

Usage:
  noderef servers [--json]
  noderef js <server> [file] [-e <code>] [--doc <nodeRef>] [--json]
  noderef rpc <method> [json-params]

Commands:
  servers   List saved servers (never includes credentials).
  js        Run JavaScript in the server's JavaScript Console.
            Script comes from -e, a file, or stdin.
  rpc       Call any backend RPC method and print the JSON result.

<server> is a server id, or a unique part of its name, label, or URL (e.g. "localhost").

Environment:
  NODEREF_URL   Backend URL (default: discovered from the running app, else http://127.0.0.1:${DEV_PORT})
  DATA_DIR      NodeRef data directory, if not the OS default

Examples:
  noderef servers
  noderef js localhost -e 'print(companyhome.children.length)'
  noderef js TEST ./cleanup.js
  noderef rpc backend.servers.list`;

class CliError extends Error {}

function fail(message) {
  throw new CliError(message);
}

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const home = os.homedir();
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', APP_ID);
  if (process.platform === 'win32') return path.join(home, 'AppData', 'Roaming', APP_ID);
  return path.join(home, '.local', 'share', APP_ID);
}

function readRuntimeFile(name) {
  const file = path.join(getDataDir(), '.runtime', name);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}

function getBackendUrl() {
  if (process.env.NODEREF_URL) return process.env.NODEREF_URL.replace(/\/+$/, '');
  return `http://127.0.0.1:${Number(readRuntimeFile('backend-port')) || DEV_PORT}`;
}

/** Per-launch token the desktop backend writes next to its port file; only ever sent to loopback. */
function launchTokenHeader(url) {
  const token = readRuntimeFile('backend-token');
  const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
  return token && isLoopback ? { 'X-NodeRef-Token': token } : {};
}

async function rpc(method, params = {}) {
  const url = getBackendUrl();
  let res;
  try {
    res = await fetch(`${url}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...launchTokenHeader(url) },
      body: JSON.stringify({ method, params }),
    });
  } catch {
    fail(`Cannot reach NodeRef at ${url}. Is NodeRef running? (override with NODEREF_URL)`);
  }
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message = body?.message || body?.error || text || res.statusText;
    fail(
      `${method} failed (HTTP ${res.status}): ${typeof message === 'string' ? message : JSON.stringify(message)}`
    );
  }
  return body;
}

async function resolveServer(ref) {
  const servers = await rpc('backend.servers.list');
  const byId = servers.find(s => String(s.id) === ref);
  if (byId) return byId;

  const needle = ref.toLowerCase();
  const matches = servers.filter(s =>
    [s.name, s.label, s.baseUrl].some(
      v => typeof v === 'string' && v.toLowerCase().includes(needle)
    )
  );
  if (matches.length === 1) return matches[0];
  const list = (matches.length ? matches : servers).map(s => `  ${s.id}  ${s.name}  ${s.baseUrl}`);
  fail(
    `${matches.length ? `"${ref}" matches several servers` : `No server matches "${ref}"`}. ` +
      `Use an id:\n${list.join('\n') || '  (no servers saved in NodeRef)'}`
  );
}

function readStdin() {
  if (process.stdin.isTTY)
    fail('No script given. Pass a file, -e <code>, or pipe a script on stdin.');
  return readFileSync(0, 'utf8');
}

/** Parse `js` arguments into { server, script, doc, json }. */
function parseJsArgs(args) {
  const opts = { positional: [], code: undefined, doc: undefined, json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '-e' || arg === '--eval')
      opts.code = args[++i] ?? fail(`${arg} needs a value`);
    else if (arg === '--doc') opts.doc = args[++i] ?? fail('--doc needs a nodeRef');
    else if (arg.startsWith('-') && arg !== '-') fail(`Unknown option: ${arg}`);
    else opts.positional.push(arg);
  }
  const [server, file, ...extra] = opts.positional;
  if (!server || extra.length) fail('Usage: noderef js <server> [file] [-e <code>]');
  if (opts.code !== undefined && file) fail('Pass either a file or -e, not both.');
  const script = opts.code ?? (file && file !== '-' ? readFileSync(file, 'utf8') : readStdin());
  return { server, script, doc: opts.doc, json: opts.json };
}

/** Alfresco reports script failures inside the result body rather than via the RPC status. */
function getScriptError(result) {
  if (!result || typeof result !== 'object') return 'No result returned by the JavaScript Console';
  if (result.error)
    return typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
  if (result.status?.code >= 400 || result.callstack) {
    const stack = Array.isArray(result.callstack) ? result.callstack.join('\n') : result.callstack;
    return [result.message, stack].filter(Boolean).join('\n') || `HTTP ${result.status?.code}`;
  }
  return null;
}

async function runScript(serverId, script, documentNodeRef) {
  const started = await rpc('backend.jsconsole.execute', {
    serverId,
    script,
    documentNodeRef,
    stream: true,
  });
  if (started.done || !started.resultChannel) return started.result;

  // Long-running script: wait via short polls so no single HTTP request has to outlive the script.
  const { resultChannel } = started;
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    const poll = await rpc('backend.jsconsole.pollExecutionResult', { serverId, resultChannel });
    if (poll.done) break;
  }
  const final = await rpc('backend.jsconsole.getExecuteCompletionResult', {
    serverId,
    resultChannel,
    script,
  });
  if (!final.success) fail(final.error || 'Script result is no longer available');
  return final.result;
}

async function cmdServers(args) {
  const servers = await rpc('backend.servers.list');
  if (args.includes('--json')) {
    // Drop thumbnails: large binary blobs that are useless on a terminal.
    console.log(
      JSON.stringify(
        servers.map(({ thumbnail: _thumbnail, ...s }) => s),
        null,
        2
      )
    );
    return;
  }
  if (!servers.length) {
    console.log('No servers saved in NodeRef.');
    return;
  }
  const rows = servers.map(s => [
    String(s.id),
    s.name,
    s.label || '-',
    s.authType || '-',
    s.baseUrl,
  ]);
  const header = ['ID', 'NAME', 'LABEL', 'AUTH', 'URL'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  for (const row of [header, ...rows]) {
    console.log(
      row
        .map((cell, i) => cell.padEnd(widths[i]))
        .join('  ')
        .trimEnd()
    );
  }
}

async function cmdJs(args) {
  const { server: ref, script, doc, json } = parseJsArgs(args);
  const server = await resolveServer(ref);
  const result = await runScript(server.id, script, doc);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (Array.isArray(result?.printOutput)) {
    for (const line of result.printOutput) console.log(line);
  }

  const error = getScriptError(result);
  if (error) fail(`Script failed on ${server.name}:\n${error}`);
}

async function cmdRpc(args) {
  const [method, rawParams, ...extra] = args;
  if (!method || extra.length) fail('Usage: noderef rpc <method> [json-params]');
  let params = {};
  if (rawParams) {
    try {
      params = JSON.parse(rawParams);
    } catch {
      fail('json-params must be valid JSON, e.g. \'{"serverId":1}\'');
    }
  }
  console.log(JSON.stringify(await rpc(method, params), null, 2));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }
  const commands = { servers: cmdServers, js: cmdJs, rpc: cmdRpc };
  if (!commands[command]) fail(`Unknown command: ${command}. Run "noderef help" for usage.`);
  await commands[command](args);
}

main().catch(err => {
  console.error(err instanceof CliError ? err.message : err);
  process.exitCode = 1;
});
