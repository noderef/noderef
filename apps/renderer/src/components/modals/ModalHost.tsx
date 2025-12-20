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

import { useUIStore } from '@/core/store/ui';
import { useEffect } from 'react';
import { AddServerModal } from './AddServerModal';
import { ConfirmModal } from './ConfirmModal';
import { LogsModal } from './LogsModal';
import { ReauthModal } from './ReauthModal';
import { SaveSearchModal } from './SaveSearchModal';
import { ServerEditModal } from './ServerEditModal';
import { ServerInfoModal } from './ServerInfoModal';
import { SettingsModal } from './SettingsModal';

/**
 * ModalHost component that conditionally renders global modals
 * based on the activeModal state from the UI store.
 * Logs warnings in dev mode for unknown modal keys.
 *
 * To add a new modal:
 * 1. Add the modal key to ModalKey type in core/store/keys.ts
 * 2. Create the modal component in components/modals/
 * 3. Import and add it to the render list below
 * 4. Use useModal(MODAL_KEYS.YOUR_KEY) hook in components to control the modal
 */
export function ModalHost() {
  const activeModal = useUIStore(state => state.activeModal);

  // Warn in development mode if an unknown modal key is set (per PRD requirement)
  useEffect(() => {
    if (activeModal && import.meta.env.DEV) {
      const knownModals = [
        'settings',
        'server_info',
        'server_edit',
        'server_remove_confirm',
        'add_server',
        'confirm',
        'create_search_query',
        'save_search',
        'logs',
        'reauth',
      ];
      if (!knownModals.includes(activeModal)) {
        console.warn(`Unknown modal key detected: "${activeModal}". No modal will be rendered.`);
      }
    }
  }, [activeModal]);

  return (
    <>
      <SettingsModal />
      <ServerInfoModal />
      <ServerEditModal />
      <ConfirmModal />
      <AddServerModal />
      <ReauthModal />
      <SaveSearchModal />
      <LogsModal />
    </>
  );
}
