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
 * Agent message builders — construct markdown messages for confirmed operations,
 * operation failures, run failures, and post-confirmation continuations.
 */

import { cleanText, isRecord } from './agentUtils.js';
import {
  appendPropertiesSection,
  buildNodeBrowserMarkdownLink,
  formatValueForInline,
  humanizeOperation,
  inlineCode,
  truncateText,
} from './agentFormatting.js';
import { getNodeIdFromOutput, getNodeNameFromOutput, parseJsonRecord } from './agentParsing.js';
import { resolveToolName } from './tools/registry.js';

export function getConfirmationActionLabel(step: {
  summary: string | null;
  operation: string;
}): string {
  const summary = step.summary ? cleanText(step.summary) : '';
  if (summary) {
    return truncateText(summary, 180);
  }
  return `the ${humanizeOperation(resolveToolName(step.operation))} action`;
}

export function buildRemainingTasksHint(
  originalRequest: string,
  completedOutput?: Record<string, unknown>
): string[] {
  const normalized = originalRequest.toLowerCase();
  const nodeId = getNodeIdFromOutput(completedOutput);
  const wantsDelete = /\b(delete|remove|verwijder|verwijderen|supprimer|löschen)\b/.test(
    normalized
  );
  const wantsMetadata =
    /\b(metadata|properties|property|eigenschappen|propriét|eigenschaft)\b/.test(normalized);

  const tasks: string[] = [];
  if (wantsMetadata) {
    tasks.push(
      nodeId
        ? `Fetch full node metadata/properties for node ${nodeId} and include the full properties map in the response before any delete step.`
        : 'Fetch full node metadata/properties for the created/updated target node and include the full properties map in the response before any delete step.'
    );
  }
  if (wantsDelete) {
    tasks.push(
      nodeId
        ? `Delete node ${nodeId} (this should trigger confirmation again if required).`
        : 'Delete the created/updated target node (this should trigger confirmation again if required).'
    );
  }
  return tasks;
}

export function parseStructuredError(rawMessage: string): {
  statusCode?: number;
  errorKey?: string;
  briefSummary?: string;
  message?: string;
  descriptionURL?: string;
} | null {
  const parseObject = (value: unknown) => {
    if (!isRecord(value)) return null;
    const root = value as Record<string, unknown>;
    const source = isRecord(root.error) ? (root.error as Record<string, unknown>) : root;
    const statusCode = typeof source.statusCode === 'number' ? source.statusCode : undefined;
    const errorKey = typeof source.errorKey === 'string' ? source.errorKey : undefined;
    const briefSummary = typeof source.briefSummary === 'string' ? source.briefSummary : undefined;
    const message = typeof source.message === 'string' ? source.message : undefined;
    const descriptionURL =
      typeof source.descriptionURL === 'string' ? source.descriptionURL : undefined;
    if (!statusCode && !errorKey && !briefSummary && !message && !descriptionURL) {
      return null;
    }
    return { statusCode, errorKey, briefSummary, message, descriptionURL };
  };

  const trimmed = rawMessage.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const structured = parseObject(parsed);
    if (structured) return structured;
  } catch {
    // noop
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate);
      return parseObject(parsed);
    } catch {
      // noop
    }
  }

  return null;
}

export function extractPrimaryNodeIdFromOutput(
  operation: string,
  output: Record<string, unknown>
): string | null {
  if (operation === 'node_create') {
    const id = (output.created as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }
  if (operation === 'node_update') {
    const id = (output.updated as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }
  if (operation === 'node_update_content') {
    const id = (output.updated as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }
  if (operation === 'node_move') {
    const id = (output.moved as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }
  if (operation === 'node_copy') {
    const id = (output.copied as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }
  if (operation === 'search_export_text') {
    const id = (output.created as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }
  if (operation === 'text_write_commit') {
    const updatedId = (output.updated as { id?: unknown } | undefined)?.id;
    if (typeof updatedId === 'string' && updatedId.trim()) {
      return updatedId.trim();
    }
    const createdId = (output.created as { id?: unknown } | undefined)?.id;
    return typeof createdId === 'string' && createdId.trim() ? createdId.trim() : null;
  }
  return null;
}

const OPERATION_FAILURE_LABELS: Record<string, { title: string; action: string }> = {
  node_create: { title: 'Create node failed', action: 'create the node' },
  node_update: { title: 'Update node failed', action: 'update the node' },
  node_update_content: { title: 'Update node content failed', action: 'update node content' },
  node_move: { title: 'Move node failed', action: 'move the node' },
  node_copy: { title: 'Copy node failed', action: 'copy the node' },
  node_delete: { title: 'Delete node failed', action: 'delete the node' },
  node_get: { title: 'Read node failed', action: 'read the node' },
  node_list_children: { title: 'List children failed', action: 'list child nodes' },
  search: { title: 'Search failed', action: 'run the search' },
  search_export_text: { title: 'Text export failed', action: 'export the text report' },
  text_write_begin: {
    title: 'Text write begin failed',
    action: 'start the text write session',
  },
  text_write_append: {
    title: 'Text write append failed',
    action: 'append text to the session',
  },
  text_write_status: { title: 'Text write status failed', action: 'read write session status' },
  text_write_abort: {
    title: 'Text write abort failed',
    action: 'abort the text write session',
  },
  text_write_commit: { title: 'Text write commit failed', action: 'commit text to Alfresco' },
  script_create: { title: 'Script generation failed', action: 'generate the script' },
  script_execute: { title: 'Script execution failed', action: 'execute the script' },
};

const OPERATION_SUCCESS_LABELS: Record<string, string> = {
  node_create: 'Node created',
  node_update: 'Node updated',
  node_update_content: 'Node content updated',
  node_move: 'Node moved',
  node_copy: 'Node copied',
  node_delete: 'Node deleted',
  node_get: 'Node retrieved',
  node_list_children: 'Children listed',
  search: 'Search completed',
  search_export_text: 'Text export completed',
  text_write_begin: 'Text write session started',
  text_write_append: 'Text chunk appended',
  text_write_status: 'Text write status retrieved',
  text_write_abort: 'Text write session aborted',
  text_write_commit: 'Text write committed',
  script_create: 'Script generated',
  script_execute: 'Script executed',
};

export function buildOperationFailureMessage(operation: string, rawMessage: string): string {
  const operationLabel = OPERATION_FAILURE_LABELS[operation] ?? {
    title: 'Operation failed',
    action: 'complete the requested operation',
  };

  const parsed = parseStructuredError(rawMessage);
  const detailRaw =
    parsed?.briefSummary?.trim() ||
    parsed?.errorKey?.trim() ||
    parsed?.message?.trim() ||
    rawMessage.trim() ||
    'Unknown error';
  const detail = truncateText(detailRaw.replace(/^\d+\s+/, ''), 320);

  const duplicateMatch = detail.match(/duplicate child name not allowed:\s*["']?([^"']+)["']?/i);
  if (operation === 'node_create' && /duplicate child name not allowed/i.test(detail)) {
    const duplicateName = duplicateMatch?.[1]?.trim();
    return [
      '### Create node failed',
      '',
      duplicateName
        ? `A node named **${inlineCode(duplicateName)}** already exists in that target folder.`
        : 'A node with the same name already exists in that target folder.',
      '',
      'Try one of these:',
      '- Use a different node name',
      '- Ask me to update or reuse the existing node',
    ].join('\n');
  }

  const lines = [
    `### ${operationLabel.title}`,
    '',
    `I couldn't ${operationLabel.action}.`,
    '',
    `- **Reason:** ${detail}`,
  ];

  if (parsed?.statusCode) {
    lines.push(`- **HTTP status:** ${parsed.statusCode}`);
  }
  if (parsed?.descriptionURL) {
    lines.push(`- **Reference:** ${parsed.descriptionURL}`);
  }
  return lines.join('\n');
}

export function buildConfirmedOperationMessage(
  operation: string,
  output: Record<string, unknown>,
  stepInput: Record<string, unknown> = {}
): string {
  const verification = isRecord(output.postActionVerification)
    ? output.postActionVerification
    : null;
  const verifiedNode = isRecord(verification?.node)
    ? (verification.node as Record<string, unknown>)
    : null;
  const createdNode = isRecord(output.created) ? output.created : null;
  const updatedNode = isRecord(output.updated) ? output.updated : null;
  const movedNode = isRecord(output.moved) ? output.moved : null;
  const copiedNode = isRecord(output.copied) ? output.copied : null;
  const directNodeLike =
    typeof output.id === 'string' || typeof output.name === 'string' || isRecord(output.properties)
      ? output
      : null;

  if (operation === 'node_update') {
    const resultNode = verifiedNode || updatedNode;
    const updatedName =
      typeof resultNode?.name === 'string'
        ? resultNode.name
        : typeof stepInput.name === 'string'
          ? stepInput.name
          : 'unknown';
    const nodeId =
      typeof resultNode?.id === 'string'
        ? resultNode.id
        : typeof output.nodeId === 'string'
          ? output.nodeId
          : '';
    const nodePath = typeof resultNode?.path === 'string' ? resultNode.path.trim() : '';
    const nodeType = typeof resultNode?.nodeType === 'string' ? resultNode.nodeType : '';
    const isFolder = typeof resultNode?.isFolder === 'boolean' ? resultNode.isFolder : null;
    const isFile = typeof resultNode?.isFile === 'boolean' ? resultNode.isFile : null;
    const mimeType = typeof resultNode?.mimeType === 'string' ? resultNode.mimeType : '';
    const modifiedAt = typeof resultNode?.modifiedAt === 'string' ? resultNode.modifiedAt : '';
    const modifiedBy = typeof resultNode?.modifiedBy === 'string' ? resultNode.modifiedBy : '';

    const lines = [
      '### Node updated',
      '',
      'The node update completed successfully.',
      '',
      '- **Node:** ' + buildNodeBrowserMarkdownLink(nodeId, updatedName),
    ];

    if (nodePath) {
      lines.push('- **Location:** ' + inlineCode(nodePath));
    }
    if (nodeType) {
      lines.push('- **Type:** ' + inlineCode(nodeType));
    }
    if (isFolder !== null || isFile !== null) {
      lines.push('- **Kind:** ' + inlineCode(isFolder ? 'folder' : isFile ? 'file' : 'node'));
    }
    if (mimeType) {
      lines.push('- **MIME type:** ' + inlineCode(mimeType));
    }

    const requestedName = typeof stepInput.name === 'string' ? stepInput.name.trim() : '';
    if (requestedName) {
      lines.push('- **Requested name:** ' + inlineCode(requestedName));
    }

    const requestedProperties = isRecord(stepInput.properties) ? stepInput.properties : null;
    const returnedProperties = isRecord(resultNode?.properties)
      ? (resultNode.properties as Record<string, unknown>)
      : null;
    if (requestedProperties) {
      const propertyEntries = Object.keys(requestedProperties).slice(0, 8);
      if (propertyEntries.length > 0) {
        const propertyChanges = propertyEntries
          .map(key => {
            const finalValue = returnedProperties?.[key] ?? requestedProperties[key];
            return `${key}=${formatValueForInline(finalValue)}`;
          })
          .map(item => inlineCode(item));
        const suffix =
          Object.keys(requestedProperties).length > propertyEntries.length
            ? ` (+${Object.keys(requestedProperties).length - propertyEntries.length} more)`
            : '';
        lines.push(`- **Property changes:** ${propertyChanges.join(', ')}${suffix}`);
      }
    }
    if (modifiedAt || modifiedBy) {
      const modifiedDetails = [modifiedAt, modifiedBy ? `by ${modifiedBy}` : '']
        .filter(Boolean)
        .join(' ');
      lines.push('- **Last modified:** ' + inlineCode(modifiedDetails));
    }
    appendPropertiesSection(lines, returnedProperties);

    return lines.join('\n');
  }

  if (operation === 'node_delete') {
    const totalDeleted =
      typeof output.totalDeleted === 'number'
        ? output.totalDeleted
        : Array.isArray(output.deleted)
          ? output.deleted.length
          : null;
    if (totalDeleted !== null) {
      return [
        '### Node deleted',
        '',
        `Deleted **${totalDeleted}** node${totalDeleted === 1 ? '' : 's'} successfully.`,
      ].join('\n');
    }
    return ['### Node deleted', '', 'The delete operation completed successfully.'].join('\n');
  }

  if (operation === 'search_export_text') {
    const created = isRecord(output.created) ? output.created : null;
    const exportInfo = isRecord(output.export) ? output.export : null;
    const nodeId = typeof created?.id === 'string' ? created.id : '';
    const nodeName = typeof created?.name === 'string' ? created.name : 'report.txt';
    const nodePath = typeof created?.path === 'string' ? created.path.trim() : '';
    const format = typeof exportInfo?.format === 'string' ? exportInfo.format : null;
    const totalRows =
      typeof exportInfo?.totalRows === 'number' && Number.isFinite(exportInfo.totalRows)
        ? exportInfo.totalRows
        : null;
    const repositoryTotal =
      typeof exportInfo?.repositoryTotal === 'number' && Number.isFinite(exportInfo.repositoryTotal)
        ? exportInfo.repositoryTotal
        : null;
    const pagesFetched =
      typeof exportInfo?.pagesFetched === 'number' && Number.isFinite(exportInfo.pagesFetched)
        ? exportInfo.pagesFetched
        : null;
    const hitLimit = exportInfo?.hitLimit === true;

    const lines = [
      '### Text export completed',
      '',
      '- **File:** ' + buildNodeBrowserMarkdownLink(nodeId, nodeName),
    ];
    if (nodePath) {
      lines.push('- **Location:** ' + inlineCode(nodePath));
    }
    if (format) {
      lines.push(`- **Format:** ${inlineCode(format)}`);
    }
    if (totalRows !== null) {
      lines.push(`- **Rows exported:** **${totalRows}**`);
    }
    if (repositoryTotal !== null) {
      lines.push(`- **Repository matches:** **${repositoryTotal}**`);
    }
    if (pagesFetched !== null) {
      lines.push(`- **Pages fetched:** ${pagesFetched}`);
    }
    if (hitLimit) {
      lines.push('- **Note:** Export reached the configured maximum row limit.');
    }
    return lines.join('\n');
  }

  if (operation === 'text_write_commit') {
    const node = isRecord(output.updated)
      ? output.updated
      : isRecord(output.created)
        ? output.created
        : null;
    const write = isRecord(output.write) ? output.write : null;
    const nodeId = typeof node?.id === 'string' ? node.id : '';
    const nodeName = typeof node?.name === 'string' ? node.name : 'text-file';
    const nodePath = typeof node?.path === 'string' ? node.path.trim() : '';
    const totalBytes =
      typeof write?.totalBytes === 'number' && Number.isFinite(write.totalBytes)
        ? write.totalBytes
        : null;
    const chunksReceived =
      typeof write?.chunksReceived === 'number' && Number.isFinite(write.chunksReceived)
        ? write.chunksReceived
        : null;
    const sessionId = typeof write?.sessionId === 'string' ? write.sessionId : '';

    const lines = [
      '### Text write committed',
      '',
      '- **File:** ' + buildNodeBrowserMarkdownLink(nodeId, nodeName),
    ];
    if (nodePath) {
      lines.push('- **Location:** ' + inlineCode(nodePath));
    }
    if (chunksReceived !== null) {
      lines.push(`- **Chunks received:** ${chunksReceived}`);
    }
    if (totalBytes !== null) {
      lines.push(`- **Total bytes:** ${totalBytes}`);
    }
    if (sessionId) {
      lines.push(`- **Session ID:** ${inlineCode(sessionId)}`);
    }
    return lines.join('\n');
  }

  const resultNode =
    verifiedNode || createdNode || updatedNode || movedNode || copiedNode || directNodeLike;
  if (resultNode) {
    const name = typeof resultNode.name === 'string' ? resultNode.name : 'unknown';
    const id = typeof resultNode.id === 'string' ? resultNode.id : '';
    const path = typeof resultNode.path === 'string' ? resultNode.path.trim() : '';
    const nodeType = typeof resultNode.nodeType === 'string' ? resultNode.nodeType : '';
    const mimeType = typeof resultNode.mimeType === 'string' ? resultNode.mimeType : '';
    const createdAt = typeof resultNode.createdAt === 'string' ? resultNode.createdAt : '';
    const createdBy = typeof resultNode.createdBy === 'string' ? resultNode.createdBy : '';
    const modifiedAt = typeof resultNode.modifiedAt === 'string' ? resultNode.modifiedAt : '';
    const modifiedBy = typeof resultNode.modifiedBy === 'string' ? resultNode.modifiedBy : '';
    const isFolderVal = typeof resultNode.isFolder === 'boolean' ? resultNode.isFolder : null;
    const isFileVal = typeof resultNode.isFile === 'boolean' ? resultNode.isFile : null;
    const properties = isRecord(resultNode.properties)
      ? (resultNode.properties as Record<string, unknown>)
      : null;
    const lines = [
      `### ${OPERATION_SUCCESS_LABELS[operation] ?? 'Operation completed'}`,
      '',
      'The operation completed successfully.',
      '',
      '- **Node:** ' + buildNodeBrowserMarkdownLink(id, name),
    ];
    if (path) {
      lines.push('- **Location:** ' + inlineCode(path));
    }
    if (nodeType) {
      lines.push('- **Type:** ' + inlineCode(nodeType));
    }
    if (isFolderVal !== null || isFileVal !== null) {
      lines.push('- **Kind:** ' + inlineCode(isFolderVal ? 'folder' : isFileVal ? 'file' : 'node'));
    }
    if (mimeType) {
      lines.push('- **MIME type:** ' + inlineCode(mimeType));
    }
    if (createdAt || createdBy) {
      const createdDetails = [createdAt, createdBy ? `by ${createdBy}` : '']
        .filter(Boolean)
        .join(' ');
      lines.push('- **Created:** ' + inlineCode(createdDetails));
    }
    if (modifiedAt || modifiedBy) {
      const modifiedDetails = [modifiedAt, modifiedBy ? `by ${modifiedBy}` : '']
        .filter(Boolean)
        .join(' ');
      lines.push('- **Last modified:** ' + inlineCode(modifiedDetails));
    }
    appendPropertiesSection(lines, properties);
    return lines.join('\n');
  }

  return [
    `### ${OPERATION_SUCCESS_LABELS[operation] ?? 'Operation completed'}`,
    '',
    'The operation completed successfully.',
  ].join('\n');
}

export function buildContinuationContent(
  originalRequest: string,
  completedAction: string,
  completedOutput?: Record<string, unknown>
): string {
  const nodeId = getNodeIdFromOutput(completedOutput);
  const nodeName = getNodeNameFromOutput(completedOutput);
  const remainingTaskHints = buildRemainingTasksHint(originalRequest, completedOutput);
  const outputPreview = completedOutput
    ? truncateText(
        (() => {
          try {
            return JSON.stringify(completedOutput);
          } catch {
            return String(completedOutput);
          }
        })(),
        2000
      )
    : '';

  return [
    'Continue the same user request from where you paused.',
    '',
    `Original user request: ${originalRequest}`,
    `Already completed and confirmed: ${completedAction}.`,
    ...(nodeId ? [`Target node id (if applicable): ${nodeId}`] : []),
    ...(nodeName ? [`Target node name (if applicable): ${nodeName}`] : []),
    'You are not done by default after the confirmed step.',
    'Do not repeat completed actions.',
    'Execute remaining requested tasks in order. If more actions remain, call tools now.',
    'When referring to nodes in user-facing text, prefer node name links like [Name](nodebrowser://node/<nodeId>) instead of raw UUID-only references.',
    ...(remainingTaskHints.length
      ? ['', 'Remaining tasks to complete now:', ...remainingTaskHints.map(task => `- ${task}`)]
      : []),
    ...(outputPreview ? ['', `Result from completed action (JSON): ${outputPreview}`] : []),
  ].join('\n');
}

interface RunFailureStep {
  ordinal: number;
  operation: string;
  status: string;
  summary: string | null;
  outputJson: string | null;
}

type RunStepFinder = (args: {
  where: { runId: number };
  orderBy: { ordinal: 'asc' };
  select: {
    ordinal: true;
    operation: true;
    status: true;
    summary: true;
    outputJson: true;
  };
}) => Promise<RunFailureStep[]>;

export async function buildRunFailureMessage(
  prisma: { agentRunStep: { findMany: RunStepFinder } },
  runId: number,
  rawError: string
): Promise<string> {
  const steps = await prisma.agentRunStep.findMany({
    where: { runId },
    orderBy: { ordinal: 'asc' },
    select: {
      ordinal: true,
      operation: true,
      status: true,
      summary: true,
      outputJson: true,
    },
  });

  const normalizedError = rawError.trim();
  const isTimeout = /timed out/i.test(normalizedError);
  const completedSteps = steps.filter(step => step.status === 'completed');
  const failedSteps = steps.filter(step => step.status === 'failed');

  let lastKnownTotalCount: number | null = null;
  for (let index = completedSteps.length - 1; index >= 0; index -= 1) {
    const output = parseJsonRecord(completedSteps[index].outputJson);
    if (!output) {
      continue;
    }
    const pagination = isRecord(output.pagination)
      ? (output.pagination as Record<string, unknown>)
      : null;
    const totalCount = pagination?.totalCount;
    if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
      lastKnownTotalCount = totalCount;
      break;
    }
  }

  const lines: string[] = [];
  lines.push(
    isTimeout
      ? "I couldn't finish the final response because the model timed out."
      : "I couldn't finish the response because the run failed."
  );
  lines.push(`- **Reason:** ${inlineCode(truncateText(normalizedError || 'Unknown error', 300))}`);

  if (completedSteps.length > 0) {
    lines.push(`- **Completed steps before failure:** ${completedSteps.length}`);
  }
  if (failedSteps.length > 0) {
    lines.push(`- **Failed steps:** ${failedSteps.length}`);
  }
  if (lastKnownTotalCount !== null) {
    lines.push(`- **Last known total count:** **${lastKnownTotalCount}**`);
  }

  if (completedSteps.length > 0) {
    lines.push('');
    lines.push('Completed actions:');
    for (const step of completedSteps.slice(-6)) {
      const label =
        (step.summary && cleanText(step.summary)) ||
        humanizeOperation(resolveToolName(step.operation || 'operation'));
      lines.push(`- ${label}`);
    }
  }

  lines.push('');
  lines.push(
    'If you want, ask me to continue from these completed results with a smaller scope (for example a subfolder or max item limit).'
  );

  return lines.join('\n');
}
