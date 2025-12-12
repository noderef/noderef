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
import type { ModalKey } from '@/core/store/keys';

/**
 * Hook for modal state and actions.
 * Returns modal-specific state for a given modal key.
 */
export function useModal(name: ModalKey) {
  const activeModal = useUIStore(state => state.activeModal);
  const modalPayload = useUIStore(state => state.modalPayload);
  const openModal = useUIStore(state => state.openModal);
  const closeModal = useUIStore(state => state.closeModal);

  return {
    isOpen: activeModal === name,
    payload: activeModal === name ? modalPayload : undefined,
    open: (payload?: unknown) => openModal(name, payload),
    close: closeModal,
  };
}

/**
 * Hook to get the currently active modal (if any)
 */
export function useActiveModal() {
  const activeModal = useUIStore(state => state.activeModal);
  const modalPayload = useUIStore(state => state.modalPayload);
  return {
    activeModal,
    payload: modalPayload,
  };
}
