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
 * Step-summary builders — generate human-readable labels for run steps
 * based on tool operation, arguments, and optional LLM reasoning.
 */

const MAX_STEP_SUMMARY_CHARS = 180;

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeSummaryText = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .replace(/[`*_#]+/g, '')
    .trim();

const formatOperationLabel = (operation: string): string =>
  operation.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

const truncateText = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
};

const buildFallbackStepSummary = (
  operation: string,
  args: Record<string, unknown>
): string => {
  switch (operation) {
    case 'node_create': {
      const name = toNonEmptyString(args.name);
      const parentId = toNonEmptyString(args.parentId);
      if (name && parentId) return `Create "${name}" in folder ${parentId}`;
      if (name) return `Create "${name}"`;
      return 'Create a new node';
    }
    case 'node_update': {
      const nodeId = toNonEmptyString(args.nodeId);
      const name = toNonEmptyString(args.name);
      if (name && nodeId) return `Rename node ${nodeId} to "${name}"`;
      if (nodeId) return `Update node ${nodeId}`;
      return 'Update node metadata';
    }
    case 'node_update_content': {
      const nodeId = toNonEmptyString(args.nodeId);
      if (nodeId) return `Update content for node ${nodeId}`;
      return 'Update node content';
    }
    case 'node_move': {
      const sourceNodeId = toNonEmptyString(args.sourceNodeId);
      const targetParentId = toNonEmptyString(args.targetParentId);
      if (sourceNodeId && targetParentId) {
        return `Move node ${sourceNodeId} to folder ${targetParentId}`;
      }
      return 'Move a node to another folder';
    }
    case 'node_copy': {
      const sourceNodeId = toNonEmptyString(args.sourceNodeId);
      const targetParentId = toNonEmptyString(args.targetParentId);
      if (sourceNodeId && targetParentId) {
        return `Copy node ${sourceNodeId} to folder ${targetParentId}`;
      }
      return 'Copy a node to another folder';
    }
    case 'node_delete': {
      const nodeIds = Array.isArray(args.nodeIds)
        ? args.nodeIds.map(id => String(id).trim()).filter(Boolean)
        : [];
      if (nodeIds.length === 1) return `Delete node ${nodeIds[0]}`;
      if (nodeIds.length > 1) return `Delete ${nodeIds.length} nodes`;
      return 'Delete node(s)';
    }
    case 'script_execute': {
      const script = toNonEmptyString(args.script);
      if (script) {
        const preview = script.split(/\r?\n/).find(line => line.trim()) || script;
        return `Execute script: ${truncateText(preview.trim(), 90)}`;
      }
      return 'Execute a server script';
    }
    case 'script_create': {
      const request = toNonEmptyString(args.request);
      if (request) return `Generate script: ${truncateText(request, 90)}`;
      return 'Generate a JavaScript Console script';
    }
    case 'search': {
      const query = toNonEmptyString(args.query);
      if (query) return `Search for "${truncateText(query, 80)}"`;
      return 'Search the repository';
    }
    case 'search_export_text': {
      const query = toNonEmptyString(args.query);
      const fileName = toNonEmptyString(args.fileName);
      if (query && fileName)
        return `Export text file "${fileName}" from search "${truncateText(query, 60)}"`;
      if (query) return `Export text from search "${truncateText(query, 80)}"`;
      if (fileName) return `Export search results to text file "${fileName}"`;
      return 'Export search results to text file';
    }
    case 'text_write_begin': {
      const nodeId = toNonEmptyString(args.nodeId);
      const parentId = toNonEmptyString(args.parentId);
      const fileName = toNonEmptyString(args.fileName);
      if (nodeId) return `Begin large text write to node ${nodeId}`;
      if (parentId && fileName)
        return `Begin large text write for "${fileName}" in folder ${parentId}`;
      return 'Begin large text write session';
    }
    case 'text_write_append': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Append chunk to write session ${sessionId}`;
      return 'Append chunk to write session';
    }
    case 'text_write_status': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Check write session ${sessionId} status`;
      return 'Check write session status';
    }
    case 'text_write_abort': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Abort write session ${sessionId}`;
      return 'Abort write session';
    }
    case 'text_write_commit': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Commit write session ${sessionId} to Alfresco`;
      return 'Commit write session to Alfresco';
    }
    default:
      return `Run ${formatOperationLabel(operation)}`;
  }
};

export const buildStepSummary = ({
  operation,
  args,
  reasoning,
  callIndex,
  totalCalls,
}: {
  operation: string;
  args: Record<string, unknown>;
  reasoning: string | null;
  callIndex: number;
  totalCalls: number;
}): string => {
  const normalizedReasoning = reasoning ? normalizeSummaryText(reasoning) : '';
  if (normalizedReasoning && (totalCalls === 1 || callIndex === 0)) {
    return truncateText(normalizedReasoning, MAX_STEP_SUMMARY_CHARS);
  }

  const fallback = buildFallbackStepSummary(operation, args);
  return truncateText(normalizeSummaryText(fallback), MAX_STEP_SUMMARY_CHARS);
};
