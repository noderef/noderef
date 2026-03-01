/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type WriteSessionStatus = 'open' | 'committed' | 'aborted';

export interface WriteSessionState {
  sessionId: string;
  status: WriteSessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  target: {
    nodeId: string | null;
    parentId: string | null;
    fileName: string | null;
    autoRename: boolean;
    renameOnCommit: string | null;
  };
  options: {
    mimeType: string | null;
    encoding: string;
    maxChunkBytes: number;
    majorVersion: boolean | null;
    comment: string | null;
  };
  chunks: {
    received: number;
    nextSeq: number;
    totalBytes: number;
  };
  result: {
    committedAt: string | null;
    nodeId: string | null;
    fileName: string | null;
  };
}

export interface WriteSessionRecord {
  state: WriteSessionState;
  sessionDir: string;
  metadataPath: string;
  contentPath: string;
}

const SESSIONS_ROOT_DIR = join(tmpdir(), 'noderef-agent-text-sessions');
const METADATA_FILE = 'state.json';
const CONTENT_FILE = 'content.txt';
const ENCODING_DEFAULT = 'utf-8';
const SESSION_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const FINISHED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const nowIso = (): string => new Date().toISOString();

const getSessionDir = (sessionId: string): string => join(SESSIONS_ROOT_DIR, sessionId);
const getMetadataPath = (sessionId: string): string => join(getSessionDir(sessionId), METADATA_FILE);
const getContentPath = (sessionId: string): string => join(getSessionDir(sessionId), CONTENT_FILE);

const parseIsoMillis = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const parseState = (raw: string): WriteSessionState => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid session state format');
  }
  return parsed as WriteSessionState;
};

const ensureSessionId = (sessionId: string): string => {
  const normalized = normalizeText(sessionId);
  if (!normalized || !SESSION_ID_PATTERN.test(normalized)) {
    throw new Error('Invalid sessionId');
  }
  return normalized;
};

const ensureOpenAndNotExpired = (state: WriteSessionState): void => {
  if (state.status !== 'open') {
    throw new Error(`Session is ${state.status} and cannot be modified`);
  }
  const expiresAtMs = parseIsoMillis(state.expiresAt);
  if (!expiresAtMs) {
    throw new Error('Session has invalid expiration');
  }
  if (Date.now() > expiresAtMs) {
    throw new Error('Session has expired');
  }
};

export async function ensureSessionsRoot(): Promise<void> {
  await mkdir(SESSIONS_ROOT_DIR, { recursive: true });
}

export async function cleanupExpiredSessions(nowMs = Date.now()): Promise<number> {
  await ensureSessionsRoot();
  const entries = await readdir(SESSIONS_ROOT_DIR, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sessionId = entry.name;
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      continue;
    }
    const metadataPath = getMetadataPath(sessionId);
    try {
      const raw = await readFile(metadataPath, 'utf8');
      const state = parseState(raw);
      const expiresAtMs = parseIsoMillis(state.expiresAt);
      const updatedAtMs = parseIsoMillis(state.updatedAt) ?? nowMs;
      const expired = expiresAtMs !== null && nowMs > expiresAtMs;
      const finishedAndOld =
        state.status !== 'open' && nowMs - updatedAtMs > FINISHED_SESSION_RETENTION_MS;
      if (!expired && !finishedAndOld) {
        continue;
      }
      await rm(getSessionDir(sessionId), { recursive: true, force: true });
      removed += 1;
    } catch {
      // Corrupt or missing session state; remove directory to keep store healthy.
      await rm(getSessionDir(sessionId), { recursive: true, force: true });
      removed += 1;
    }
  }

  return removed;
}

export async function createWriteSession(input: {
  nodeId?: string | null;
  parentId?: string | null;
  fileName?: string | null;
  autoRename: boolean;
  renameOnCommit?: string | null;
  mimeType?: string | null;
  encoding?: string | null;
  maxChunkBytes: number;
  ttlMinutes: number;
  majorVersion?: boolean | null;
  comment?: string | null;
}): Promise<WriteSessionRecord> {
  await cleanupExpiredSessions();
  await ensureSessionsRoot();

  const nodeId = normalizeText(input.nodeId);
  const parentId = normalizeText(input.parentId);
  const fileName = normalizeText(input.fileName);
  if (!nodeId && !(parentId && fileName)) {
    throw new Error('Either nodeId or (parentId + fileName) is required');
  }

  const sessionId = randomUUID();
  const sessionDir = getSessionDir(sessionId);
  const metadataPath = getMetadataPath(sessionId);
  const contentPath = getContentPath(sessionId);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000).toISOString();

  const state: WriteSessionState = {
    sessionId,
    status: 'open',
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    target: {
      nodeId: nodeId ?? null,
      parentId: parentId ?? null,
      fileName: fileName ?? null,
      autoRename: input.autoRename,
      renameOnCommit: normalizeText(input.renameOnCommit) ?? null,
    },
    options: {
      mimeType: normalizeText(input.mimeType) ?? null,
      encoding: normalizeText(input.encoding) ?? ENCODING_DEFAULT,
      maxChunkBytes: input.maxChunkBytes,
      majorVersion: typeof input.majorVersion === 'boolean' ? input.majorVersion : null,
      comment: normalizeText(input.comment) ?? null,
    },
    chunks: {
      received: 0,
      nextSeq: 0,
      totalBytes: 0,
    },
    result: {
      committedAt: null,
      nodeId: null,
      fileName: null,
    },
  };

  await mkdir(sessionDir, { recursive: true });
  await writeFile(metadataPath, JSON.stringify(state, null, 2), 'utf8');
  await writeFile(contentPath, '', 'utf8');

  return { state, sessionDir, metadataPath, contentPath };
}

export async function loadWriteSession(sessionIdInput: string): Promise<WriteSessionRecord> {
  const sessionId = ensureSessionId(sessionIdInput);
  await ensureSessionsRoot();
  const sessionDir = getSessionDir(sessionId);
  const metadataPath = getMetadataPath(sessionId);
  const contentPath = getContentPath(sessionId);

  const [metadataRaw] = await Promise.all([readFile(metadataPath, 'utf8'), stat(sessionDir)]);
  const state = parseState(metadataRaw);
  return { state, sessionDir, metadataPath, contentPath };
}

export async function saveWriteSession(record: WriteSessionRecord): Promise<void> {
  record.state.updatedAt = nowIso();
  await writeFile(record.metadataPath, JSON.stringify(record.state, null, 2), 'utf8');
}

export async function appendWriteSessionChunk(input: {
  sessionId: string;
  chunk: string;
  seq?: number | null;
  chunkHash?: string | null;
}): Promise<WriteSessionRecord> {
  await cleanupExpiredSessions();
  const record = await loadWriteSession(input.sessionId);
  ensureOpenAndNotExpired(record.state);

  if (typeof input.chunk !== 'string') {
    throw new Error('chunk must be a string');
  }
  const chunkBytes = Buffer.byteLength(input.chunk, 'utf8');
  if (chunkBytes > record.state.options.maxChunkBytes) {
    throw new Error(
      `Chunk exceeds maxChunkBytes (${record.state.options.maxChunkBytes} bytes)`
    );
  }

  const requestedSeq =
    typeof input.seq === 'number' && Number.isFinite(input.seq)
      ? Math.max(0, Math.floor(input.seq))
      : record.state.chunks.nextSeq;
  if (requestedSeq !== record.state.chunks.nextSeq) {
    throw new Error(
      `Invalid chunk sequence. Expected ${record.state.chunks.nextSeq}, received ${requestedSeq}`
    );
  }

  const expectedHash = normalizeText(input.chunkHash);
  if (expectedHash) {
    const actualHash = createHash('sha256').update(input.chunk, 'utf8').digest('hex');
    if (actualHash !== expectedHash.toLowerCase()) {
      throw new Error('chunkHash mismatch');
    }
  }

  await appendFile(record.contentPath, input.chunk, 'utf8');
  record.state.chunks.received += 1;
  record.state.chunks.nextSeq += 1;
  record.state.chunks.totalBytes += chunkBytes;
  await saveWriteSession(record);
  return record;
}

export async function abortWriteSession(input: {
  sessionId: string;
  deleteBufferedContent?: boolean;
}): Promise<WriteSessionRecord> {
  await cleanupExpiredSessions();
  const record = await loadWriteSession(input.sessionId);
  if (record.state.status === 'committed') {
    throw new Error('Committed session cannot be aborted');
  }
  if (record.state.status === 'aborted') {
    return record;
  }
  record.state.status = 'aborted';
  await saveWriteSession(record);
  if (input.deleteBufferedContent !== false) {
    await unlink(record.contentPath).catch(() => {});
    await writeFile(record.contentPath, '', 'utf8');
  }
  return record;
}

export async function markWriteSessionCommitted(input: {
  sessionId: string;
  nodeId: string;
  fileName?: string | null;
}): Promise<WriteSessionRecord> {
  const record = await loadWriteSession(input.sessionId);
  ensureOpenAndNotExpired(record.state);
  record.state.status = 'committed';
  record.state.result = {
    committedAt: nowIso(),
    nodeId: input.nodeId,
    fileName: normalizeText(input.fileName),
  };
  await saveWriteSession(record);
  return record;
}

export async function readWriteSessionText(sessionId: string): Promise<string> {
  const record = await loadWriteSession(sessionId);
  return readFile(record.contentPath, 'utf8');
}

export async function hashWriteSessionContent(sessionId: string): Promise<string> {
  const record = await loadWriteSession(sessionId);
  await stat(record.contentPath);
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(record.contentPath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function removeWriteSessionContent(sessionId: string): Promise<void> {
  const record = await loadWriteSession(sessionId);
  await unlink(record.contentPath).catch(() => {});
}
