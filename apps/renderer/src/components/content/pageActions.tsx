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

import type { PageKey } from '@/core/store/keys';
import { isTextLikeFile } from '@/features/text-editor/language';
import {
  IconCode,
  IconCopy,
  IconCut,
  IconDeviceFloppy,
  IconEdit,
  IconEraser,
  IconFileDownload,
  IconFilePlus,
  IconFileText,
  IconFolderPlus,
  IconHelp,
  IconTextWrap,
} from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { ReactNode } from 'react';

export interface PageActionIcon {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface PageMenuAction {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  divider?: boolean;
}

export interface PageActions {
  actionIcons?: PageActionIcon[];
  moreMenuActions?: PageMenuAction[];
}

export interface PageActionsContext {
  loadedScriptNodeId?: string | null;
  textEditorWrapEnabled?: boolean;
  textEditorHasRemoteSource?: boolean;
  nodeBrowserNodeName?: string | null;
  nodeBrowserMimeType?: string | null;
  nodeBrowserNodeType?: string | null;
  nodeBrowserNodeId?: string | null;
  nodeBrowserServerId?: number | null;
  hasSearchQuery?: boolean;
  activeSavedSearchId?: number | null;
  fileFolderCanCreate?: boolean;
  hasServerContext?: boolean;
}

/**
 * Get page-specific toolbar actions based on the active page
 * This allows each page to customize its toolbar while keeping the search bar global
 */
export function getPageActions(
  pageKey: PageKey,
  t: TFunction,
  handlers?: Partial<Record<string, () => void>>,
  context?: PageActionsContext
): PageActions {
  // Default handlers
  const defaultHandlers = {
    onNewFile: () => {
      /* New File */
    },
    onSave: () => {
      /* Save */
    },
    onCut: () => {
      /* Cut */
    },
    onCopy: () => {
      /* Copy */
    },
    onHelp: () => {
      /* Help */
    },
    onFormatCode: () => {
      /* Format Code */
    },
    onSaveScript: () => {
      /* Save Script */
    },
    onLoadScript: () => {
      /* Load Script */
    },
    onClearEditor: () => {
      /* Clear Editor */
    },
    onConsoleSettings: () => {
      /* Console Settings */
    },
    onTextEditorSave: () => {
      /* Text Editor Save */
    },
    onTextEditorToggleWrap: () => {
      /* Text Editor Wrap */
    },
    onOpenInTextEditor: () => {
      /* Open in Text Editor */
    },
    onOpenInJsConsole: () => {
      /* Open in JavaScript Console */
    },
    onCreateFolder: () => {
      /* Create folder */
    },
    onSaveSearch: () => {
      /* Save search */
    },
    onEditSavedSearch: () => {
      /* Edit saved search */
    },
    ...handlers,
  };

  // Default actions (used by most pages)
  const defaultActions: PageActions = {
    actionIcons: [],
    moreMenuActions: [
      {
        label: t('menu:help'),
        icon: <IconHelp size={14} />,
        onClick: defaultHandlers.onHelp,
      },
    ],
  };

  const hasServerContext = Boolean(context?.hasServerContext);

  // Page-specific actions
  const pageActionsMap: Partial<Record<PageKey, PageActions>> = {
    // JavaScript Console - Editor actions
    jsconsole: {
      actionIcons: [
        ...(hasServerContext
          ? [
              {
                icon: <IconFileDownload size={18} />,
                label: t('menu:loadScript'),
                onClick: defaultHandlers.onLoadScript,
              },
            ]
          : []),
        {
          icon: <IconCode size={18} />,
          label: t('menu:formatCode'),
          onClick: defaultHandlers.onFormatCode,
        },
        ...(hasServerContext
          ? [
              {
                icon: <IconDeviceFloppy size={18} />,
                label: t('menu:saveScript'),
                onClick: defaultHandlers.onSaveScript,
                disabled: !context?.loadedScriptNodeId,
              },
            ]
          : []),
        {
          icon: <IconEraser size={18} />,
          label: t('menu:clearEditor'),
          onClick: defaultHandlers.onClearEditor,
        },
      ],
      moreMenuActions: [],
    },

    // Dashboard - Default actions
    dashboard: defaultActions,

    // Files page - File operations
    files: {
      actionIcons: [
        {
          icon: <IconFilePlus size={18} />,
          label: t('menu:newFile'),
          onClick: defaultHandlers.onNewFile,
        },
      ],
      moreMenuActions: [
        {
          label: t('menu:cut'),
          icon: <IconCut size={14} />,
          onClick: defaultHandlers.onCut,
        },
        {
          label: t('menu:copy'),
          icon: <IconCopy size={14} />,
          onClick: defaultHandlers.onCopy,
        },
        {
          label: t('menu:help'),
          icon: <IconHelp size={14} />,
          onClick: defaultHandlers.onHelp,
          divider: true,
        },
      ],
    },
    'file-folder-browser': {
      actionIcons: [
        {
          icon: <IconFolderPlus size={18} />,
          label: t('fileFolderBrowser:createFolderAction'),
          onClick: defaultHandlers.onCreateFolder,
          disabled: context?.fileFolderCanCreate === false,
        },
      ],
      moreMenuActions: [],
    },

    // Node Browser - Browser specific actions
    'node-browser': {
      actionIcons: [
        {
          icon: <IconFileText size={18} />,
          label: t('submenu:textEditor'),
          onClick: defaultHandlers.onOpenInTextEditor,
          disabled: !(
            context?.nodeBrowserNodeType !== 'cm:folder' &&
            isTextLikeFile(
              context?.nodeBrowserNodeName || null,
              context?.nodeBrowserMimeType || null
            )
          ),
        },
        {
          icon: <IconCode size={18} />,
          label: t('submenu:jsConsole'),
          onClick: defaultHandlers.onOpenInJsConsole,
        },
      ],
      moreMenuActions: [],
    },
    search: {
      actionIcons: [
        {
          icon: <IconDeviceFloppy size={18} />,
          label: t('search:saveSearch'),
          onClick: defaultHandlers.onSaveSearch,
          disabled: context?.hasSearchQuery === false,
        },
      ],
      moreMenuActions: [],
    },
    'saved-search': {
      actionIcons: [
        {
          icon: <IconEdit size={18} />,
          label: t('search:editSavedSearch'),
          onClick: defaultHandlers.onEditSavedSearch,
          disabled: !context?.activeSavedSearchId,
        },
      ],
      moreMenuActions: [],
    },

    'text-editor': {
      actionIcons: [
        {
          icon: <IconDeviceFloppy size={18} />,
          label: t('menu:save'),
          onClick: defaultHandlers.onTextEditorSave,
          disabled: !context?.textEditorHasRemoteSource,
        },
        {
          icon: <IconTextWrap size={18} />,
          label: context?.textEditorWrapEnabled
            ? t('menu:disableWordWrap')
            : t('menu:enableWordWrap'),
          onClick: defaultHandlers.onTextEditorToggleWrap,
        },
      ],
      moreMenuActions: [],
    },
  };

  // Return page-specific actions or default actions
  return pageActionsMap[pageKey] || defaultActions;
}
