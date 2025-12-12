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

import { create } from 'zustand';

interface FileFolderBrowserActionsState {
  createFolderHandler: (() => void) | null;
  handlerOwnerId: string | null;
  setCreateFolderHandler: (handler: (() => void) | null, ownerId: string | null) => void;
  triggerCreateFolder: () => void;
}

export const useFileFolderBrowserActionsStore = create<FileFolderBrowserActionsState>(
  (set, get) => ({
    createFolderHandler: null,
    handlerOwnerId: null,
    setCreateFolderHandler: (handler, ownerId) => {
      set(state => {
        if (handler) {
          if (state.createFolderHandler === handler && state.handlerOwnerId === ownerId) {
            return state;
          }
          return { createFolderHandler: handler, handlerOwnerId: ownerId };
        }
        if (state.handlerOwnerId !== ownerId) {
          return state;
        }
        if (state.createFolderHandler === null && state.handlerOwnerId === null) {
          return state;
        }
        return { createFolderHandler: null, handlerOwnerId: null };
      });
    },
    triggerCreateFolder: () => {
      const handler = get().createFolderHandler;
      if (handler) {
        handler();
      }
    },
  })
);
