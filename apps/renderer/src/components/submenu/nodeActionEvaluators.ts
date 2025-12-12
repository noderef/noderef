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
 * Node action evaluators
 * Determines which actions are available for a given node
 */
import { isTextLikeFile } from '@/features/text-editor/language';

export interface NodeActionContext {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  isFolder: boolean;
  isFile: boolean;
  path?: string;
  mimeType?: string;
}

export interface NodeAction {
  id: string;
  label: string;
  icon: string;
  evaluator: (context: NodeActionContext) => boolean;
}

/**
 * Protected node IDs that cannot be deleted
 */
const PROTECTED_NODE_IDS = [
  '-root-', // Company Home
];

/**
 * Protected node names (Alfresco system folders)
 */
const PROTECTED_NODE_NAMES = [
  'Data Dictionary',
  'Guest Home',
  'IMAP Home',
  'Imap Attachments',
  'User Homes',
];

/**
 * Protected paths that cannot be deleted
 */
const PROTECTED_PATHS = [
  '/{http://www.alfresco.org/model/application/1.0}company_home/{http://www.alfresco.org/model/application/1.0}dictionary',
];

/**
 * Node types that cannot be deleted
 */
const PROTECTED_NODE_TYPES = ['st:site', 'st:sites', 'rma:rmsite'];

/**
 * Evaluator: Can the node be renamed?
 */
export function canRename(context: NodeActionContext): boolean {
  // Cannot rename company home
  if (context.nodeId === '-root-') {
    return false;
  }

  // Cannot rename protected node IDs
  if (PROTECTED_NODE_IDS.includes(context.nodeId)) {
    return false;
  }

  // Cannot rename system folders by name
  if (PROTECTED_NODE_NAMES.includes(context.nodeName)) {
    return false;
  }

  // Cannot rename protected paths
  if (context.path && PROTECTED_PATHS.includes(context.path)) {
    return false;
  }

  // Cannot rename sites (same as delete protection)
  if (PROTECTED_NODE_TYPES.includes(context.nodeType)) {
    return false;
  }

  return true;
}

/**
 * Evaluator: Can the node be deleted?
 */
export function canDelete(context: NodeActionContext): boolean {
  // Cannot delete company home
  if (context.nodeId === '-root-') {
    return false;
  }

  // Cannot delete protected node IDs
  if (PROTECTED_NODE_IDS.includes(context.nodeId)) {
    return false;
  }

  // Cannot delete system folders by name
  if (PROTECTED_NODE_NAMES.includes(context.nodeName)) {
    return false;
  }

  // Cannot delete protected paths (Data Dictionary)
  if (context.path && PROTECTED_PATHS.includes(context.path)) {
    return false;
  }

  // Cannot delete sites
  if (PROTECTED_NODE_TYPES.includes(context.nodeType)) {
    return false;
  }

  return true;
}

/**
 * Allow opening in JS Console only for JavaScript files
 */
export function canOpenInJsConsole(context: NodeActionContext): boolean {
  // Only allow for files
  if (!context.isFile) {
    return false;
  }

  // Check mimeType for JavaScript files
  if (context.mimeType) {
    const jsMimeTypes = [
      'application/javascript',
      'text/javascript',
      'application/x-javascript',
      'text/x-javascript',
      'application/ecmascript',
      'text/ecmascript',
    ];

    if (jsMimeTypes.includes(context.mimeType.toLowerCase())) {
      return true;
    }
  }

  // Fallback: check file extension if mimeType is not available
  const jsExtensions = ['.js', '.jsx', '.mjs', '.cjs'];
  const fileName = context.nodeName.toLowerCase();
  return jsExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * Allow opening in Text Editor for supported text-based files
 */
export function canOpenInTextEditor(context: NodeActionContext): boolean {
  if (!context.isFile) {
    return false;
  }
  return isTextLikeFile(context.nodeName, context.mimeType);
}

/**
 * Get available actions for a node
 */
export function getAvailableActions(context: NodeActionContext): NodeAction[] {
  const allActions: NodeAction[] = [
    {
      id: 'rename',
      label: 'renameAction', // Translation key
      icon: 'edit',
      evaluator: canRename,
    },
    {
      id: 'delete',
      label: 'deleteAction', // Translation key
      icon: 'trash',
      evaluator: canDelete,
    },
    {
      id: 'openInJsConsole',
      label: 'openInJsConsole', // Translation key
      icon: 'code',
      evaluator: canOpenInJsConsole,
    },
    {
      id: 'openInTextEditor',
      label: 'openInTextEditor', // Translation key
      icon: 'edit',
      evaluator: canOpenInTextEditor,
    },
  ];

  return allActions.filter(action => action.evaluator(context));
}
