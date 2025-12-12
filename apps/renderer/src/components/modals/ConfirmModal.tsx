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

import { MODAL_KEYS } from '@/core/store/keys';
import { useModal } from '@/hooks/useModal';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface ConfirmPayload {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.CONFIRM);
  const { t } = useTranslation('common');

  const confirmPayload = payload as ConfirmPayload | undefined;

  const handleConfirm = async () => {
    if (confirmPayload?.onConfirm) {
      await confirmPayload.onConfirm();
    }
    close();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title={confirmPayload?.title || t('confirm')}
      size="sm"
      centered
      trapFocus
      returnFocus
      closeOnClickOutside
      closeOnEscape
      transitionProps={{ duration: 300, transition: 'fade' }}
    >
      <Stack gap="md">
        <Text size="sm">{confirmPayload?.message || 'Are you sure?'}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={close}>
            {confirmPayload?.cancelLabel || t('cancel')}
          </Button>
          <Button onClick={handleConfirm} color={confirmPayload?.confirmColor || 'red'}>
            {confirmPayload?.confirmLabel || t('confirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
