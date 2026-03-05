/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { createReadStream } from 'node:fs';
import { NodesApi } from '@alfresco/js-api';
import {
  getAlfrescoNodeChildrenPath,
  getAlfrescoNodeContentPath,
  getAlfrescoNodePath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { buildNodeMetadataQuery } from '../helpers/nodeResultHelpers.js';
import {
  abortWriteSession,
  appendWriteSessionChunk,
  cleanupExpiredSessions,
  createWriteSession,
  hashWriteSessionContent,
  loadWriteSession,
  markWriteSessionCommitted,
  normalizeText,
  removeWriteSessionContent,
  type WriteSessionRecord,
} from './write_store.js';

const DEFAULT_TTL_MINUTES = 120;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 24 * 60;
const DEFAULT_MAX_CHUNK_BYTES = 32 * 1024;
const MIN_MAX_CHUNK_BYTES = 1024;
const MAX_MAX_CHUNK_BYTES = 256 * 1024;

const normalizeBool = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const normalizeInt = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.floor(value);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface WriteTextToNodeInput {
  ctx: AgentExecutionContext;
  nodeId?: string | null;
  parentId?: string | null;
  fileName?: string | null;
  content: string | NodeJS.ReadableStream;
  autoRename?: boolean;
  majorVersion?: boolean | null;
  comment?: string | null;
  renameOnCommit?: string | null;
}

export interface WriteTextToNodeResult {
  destinationNodeId: string;
  destinationParentId: string | null;
  createdNew: boolean;
  createResult: unknown | null;
  createBody: Record<string, unknown> | null;
  createQuery: Record<string, unknown> | null;
  updateResult: unknown;
  updateQuery: Record<string, unknown>;
  readBackResult: unknown;
  finalEntry: any;
}

export interface WriteApiTrace {
  method: 'PUT' | 'POST+PUT';
  path: string[];
  request: {
    create?: { body: Record<string, unknown>; query: Record<string, unknown> };
    updateContent: { query: Record<string, unknown> };
  };
  responseBody: {
    create?: unknown;
    updateContent: unknown;
    readBack: unknown;
  };
}

export async function writeTextToNode(input: WriteTextToNodeInput): Promise<WriteTextToNodeResult> {
  const nodesApi = new NodesApi(input.ctx.api);

  const nodeId = normalizeText(input.nodeId);
  const parentId = normalizeText(input.parentId);
  const fileName = normalizeText(input.fileName);
  if (!nodeId && !(parentId && fileName)) {
    throw new Error('Either nodeId or (parentId + fileName) is required');
  }

  const autoRename = input.autoRename ?? true;
  let destinationNodeId = nodeId;
  let destinationParentId: string | null = parentId ?? null;
  let createResult: unknown | null = null;
  let createBody: Record<string, unknown> | null = null;
  let createQuery: Record<string, unknown> | null = null;

  if (!destinationNodeId) {
    createBody = {
      name: fileName,
      nodeType: 'cm:content',
    };
    createQuery = {
      autoRename,
      ...buildNodeMetadataQuery(),
    };
    createResult = await (nodesApi as any).createNode(parentId, createBody, createQuery);
    const createdEntry = (createResult as any)?.entry ?? createResult;
    const createdId = normalizeText(createdEntry?.id);
    if (!createdId) {
      throw new Error('Target file node was created without an id');
    }
    destinationNodeId = createdId;
    destinationParentId = parentId;
  }

  const updateQuery: Record<string, unknown> = {};
  const majorVersion = normalizeBool(input.majorVersion);
  if (majorVersion !== null) {
    updateQuery.majorVersion = majorVersion;
  }
  const comment = normalizeText(input.comment);
  if (comment) {
    updateQuery.comment = comment;
  }
  const renameOnCommit = normalizeText(input.renameOnCommit);
  if (renameOnCommit) {
    updateQuery.name = renameOnCommit;
  }

  const updateResult =
    Object.keys(updateQuery).length > 0
      ? await (nodesApi as any).updateNodeContent(destinationNodeId, input.content, updateQuery)
      : await (nodesApi as any).updateNodeContent(destinationNodeId, input.content);

  const readBackQuery = buildNodeMetadataQuery();
  const readBackResult = await nodesApi.getNode(destinationNodeId, readBackQuery);
  const finalEntry = (readBackResult as any)?.entry ?? readBackResult;

  return {
    destinationNodeId,
    destinationParentId,
    createdNew: createResult !== null,
    createResult,
    createBody,
    createQuery,
    updateResult,
    updateQuery,
    readBackResult,
    finalEntry,
  };
}

export async function beginTextWriteSession(args: Record<string, unknown>): Promise<{
  record: WriteSessionRecord;
  cleanupRemoved: number;
}> {
  const ttlRaw = normalizeInt(args.ttlMinutes);
  const maxChunkRaw = normalizeInt(args.maxChunkBytes);
  const ttlMinutes = clamp(ttlRaw ?? DEFAULT_TTL_MINUTES, MIN_TTL_MINUTES, MAX_TTL_MINUTES);
  const maxChunkBytes = clamp(
    maxChunkRaw ?? DEFAULT_MAX_CHUNK_BYTES,
    MIN_MAX_CHUNK_BYTES,
    MAX_MAX_CHUNK_BYTES
  );
  const cleanupRemoved = await cleanupExpiredSessions();
  const record = await createWriteSession({
    nodeId: normalizeText(args.nodeId),
    parentId: normalizeText(args.parentId),
    fileName: normalizeText(args.fileName),
    autoRename: args.autoRename === false ? false : true,
    renameOnCommit: normalizeText(args.renameOnCommit),
    mimeType: normalizeText(args.mimeType),
    encoding: normalizeText(args.encoding),
    maxChunkBytes,
    ttlMinutes,
    majorVersion: normalizeBool(args.majorVersion),
    comment: normalizeText(args.comment),
  });
  return { record, cleanupRemoved };
}

export async function appendTextWriteSession(
  args: Record<string, unknown>
): Promise<WriteSessionRecord> {
  const sessionId = normalizeText(args.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  const chunk = typeof args.chunk === 'string' ? args.chunk : null;
  if (chunk === null) {
    throw new Error('chunk must be a string');
  }
  const seq = normalizeInt(args.seq);
  const chunkHash = normalizeText(args.chunkHash);
  return appendWriteSessionChunk({ sessionId, chunk, seq, chunkHash });
}

export async function commitTextWriteSession(
  ctx: AgentExecutionContext,
  args: Record<string, unknown>
): Promise<{
  record: WriteSessionRecord;
  writeResult: WriteTextToNodeResult;
  contentHash: string;
}> {
  const sessionId = normalizeText(args.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const record = await loadWriteSession(sessionId);
  if (record.state.status !== 'open') {
    throw new Error(`Session is ${record.state.status} and cannot be committed`);
  }
  const expiresAtMs = Date.parse(record.state.expiresAt);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    throw new Error('Session has expired');
  }

  const expectedChunks = normalizeInt(args.expectedChunks);
  const expectedBytes = normalizeInt(args.expectedBytes);
  if (expectedChunks !== null && expectedChunks !== record.state.chunks.received) {
    throw new Error(
      `Chunk count mismatch. Expected ${expectedChunks}, got ${record.state.chunks.received}`
    );
  }
  if (expectedBytes !== null && expectedBytes !== record.state.chunks.totalBytes) {
    throw new Error(
      `Byte count mismatch. Expected ${expectedBytes}, got ${record.state.chunks.totalBytes}`
    );
  }

  const finalHashExpected = normalizeText(args.finalHash)?.toLowerCase() ?? null;
  const contentHash = await hashWriteSessionContent(sessionId);
  if (finalHashExpected && contentHash !== finalHashExpected) {
    throw new Error('finalHash mismatch');
  }

  const majorVersionOverride = normalizeBool(args.majorVersion);
  const commentOverride = normalizeText(args.comment);
  const renameOverride = normalizeText(args.renameOnCommit);

  const writeResult = await writeTextToNode({
    ctx,
    nodeId: record.state.target.nodeId,
    parentId: record.state.target.parentId,
    fileName: record.state.target.fileName,
    content: createReadStream(record.contentPath),
    autoRename: record.state.target.autoRename,
    majorVersion:
      majorVersionOverride !== null ? majorVersionOverride : record.state.options.majorVersion,
    comment: commentOverride ?? record.state.options.comment,
    renameOnCommit: renameOverride ?? record.state.target.renameOnCommit,
  });

  const committed = await markWriteSessionCommitted({
    sessionId,
    nodeId: writeResult.destinationNodeId,
    fileName: normalizeText(writeResult.finalEntry?.name),
  });

  const keepSession = args.keepSession === true;
  if (!keepSession) {
    await removeWriteSessionContent(sessionId).catch(() => {});
  }

  return { record: committed, writeResult, contentHash };
}

export async function statusTextWriteSession(
  args: Record<string, unknown>
): Promise<WriteSessionRecord> {
  const sessionId = normalizeText(args.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  await cleanupExpiredSessions();
  return loadWriteSession(sessionId);
}

export async function abortTextWriteSession(
  args: Record<string, unknown>
): Promise<WriteSessionRecord> {
  const sessionId = normalizeText(args.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  const deleteBufferedContent = args.deleteBufferedContent !== false;
  return abortWriteSession({ sessionId, deleteBufferedContent });
}

export function buildWriteApiTrace(params: { writeResult: WriteTextToNodeResult }): WriteApiTrace {
  const { writeResult } = params;
  const path = writeResult.createdNew
    ? [
        getAlfrescoNodeChildrenPath(writeResult.destinationParentId || '{parentId}'),
        getAlfrescoNodeContentPath(writeResult.destinationNodeId),
        getAlfrescoNodePath(writeResult.destinationNodeId),
      ]
    : [
        getAlfrescoNodeContentPath(writeResult.destinationNodeId),
        getAlfrescoNodePath(writeResult.destinationNodeId),
      ];

  return {
    method: writeResult.createdNew ? 'POST+PUT' : 'PUT',
    path,
    request: {
      ...(writeResult.createBody && writeResult.createQuery
        ? { create: { body: writeResult.createBody, query: writeResult.createQuery } }
        : {}),
      updateContent: { query: writeResult.updateQuery },
    },
    responseBody: {
      ...(writeResult.createResult ? { create: writeResult.createResult } : {}),
      updateContent: writeResult.updateResult,
      readBack: writeResult.readBackResult,
    },
  };
}
