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

import { useState, type ReactNode } from 'react';
import { Button, Checkbox, Group, Stack, Text } from '@mantine/core';

interface DeleteConfirmationFormProps {
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  skipLabel?: string;
  showSkipOption?: boolean;
  initialSkipValue?: boolean;
  onConfirm: (skipTrash: boolean) => void;
  onCancel: () => void;
}

export function DeleteConfirmationForm({
  message,
  confirmLabel,
  cancelLabel,
  skipLabel,
  showSkipOption = true,
  initialSkipValue = false,
  onConfirm,
  onCancel,
}: DeleteConfirmationFormProps) {
  const [skipTrash, setSkipTrash] = useState(initialSkipValue);
  const showSkip = showSkipOption && Boolean(skipLabel);

  return (
    <Stack gap="sm">
      {message}
      {showSkip && (
        <Group gap={8} align="center">
          <Checkbox
            size="xs"
            aria-label={skipLabel}
            checked={skipTrash}
            onChange={event => setSkipTrash(event.currentTarget.checked)}
          />
          <Text size="sm" c="dimmed">
            {skipLabel}
          </Text>
        </Group>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button color="red" onClick={() => onConfirm(skipTrash)}>
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}
