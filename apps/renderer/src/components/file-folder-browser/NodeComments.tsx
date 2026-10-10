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

import { alfrescoRpc } from '@/core/ipc/alfresco';
import { useServersStore } from '@/core/store/servers';
import { formatRelativeTime } from '@/utils/formatTime';
import { Avatar, Button, Group, Loader, Stack, Text, Textarea } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommentContent } from './CommentContent';

interface NodeCommentsProps {
  serverId: number;
  nodeId: string;
}

interface CommentPerson {
  id?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

interface CommentEntry {
  id: string;
  content: string;
  createdAt?: string;
  createdBy?: CommentPerson;
}

interface CommentPagingResponse {
  list?: {
    entries?: Array<{ entry?: CommentEntry }>;
  };
}

const PAGE_SIZE = 100;

const personName = (person: CommentPerson | undefined): string => {
  if (!person) {
    return '';
  }
  if (person.displayName) {
    return person.displayName;
  }
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.id || '';
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');

export function NodeComments({ serverId, nodeId }: NodeCommentsProps) {
  const { t, i18n } = useTranslation(['common', 'fileFolderBrowser']);
  const server = useServersStore(state => state.servers.find(s => s.id === serverId) || null);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    if (!server) {
      setLoading(false);
      setError(t('fileFolderBrowser:uploadServerMissing'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = (await alfrescoRpc.call(
        'comments.listComments',
        [nodeId, { maxItems: PAGE_SIZE, skipCount: 0 }],
        server.baseUrl,
        serverId
      )) as CommentPagingResponse;

      const entries = (response?.list?.entries ?? [])
        .map(item => item.entry)
        .filter((entry): entry is CommentEntry => Boolean(entry));
      setComments(entries);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setError(t('fileFolderBrowser:commentsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [server, serverId, nodeId, t]);

  useEffect(() => {
    setDraft('');
    loadComments();
  }, [loadComments]);

  const handleSubmit = async () => {
    const content = draft.trim();
    if (!content || !server) {
      return;
    }

    setSubmitting(true);
    try {
      await alfrescoRpc.call(
        'comments.createComment',
        [nodeId, { content }],
        server.baseUrl,
        serverId
      );
      setDraft('');
      await loadComments();
    } catch (err) {
      console.error('Failed to add comment:', err);
      setError(t('fileFolderBrowser:commentsAddError'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderList = () => {
    if (loading) {
      return (
        <Group justify="center" p="md">
          <Loader size="sm" />
        </Group>
      );
    }

    if (comments.length === 0) {
      return (
        <Text size="sm" c="dimmed">
          {t('fileFolderBrowser:commentsEmpty')}
        </Text>
      );
    }

    return comments.map(comment => {
      const author = personName(comment.createdBy);
      return (
        <Group key={comment.id} align="flex-start" wrap="nowrap" gap="xs">
          <Avatar size="sm" radius="xl" color="blue">
            {initials(author)}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Group gap="xs" wrap="nowrap" justify="space-between">
              <Text size="sm" fw={600} truncate>
                {author}
              </Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {formatRelativeTime(comment.createdAt, i18n.language)}
              </Text>
            </Group>
            <CommentContent content={comment.content} />
          </div>
        </Group>
      );
    });
  };

  return (
    <Stack gap="sm" p="xs">
      <Textarea
        size="xs"
        autosize
        minRows={2}
        maxRows={6}
        placeholder={t('fileFolderBrowser:commentsPlaceholder')}
        value={draft}
        onChange={event => setDraft(event.currentTarget.value)}
        disabled={submitting || !server}
      />
      <Group justify="flex-end">
        <Button
          size="xs"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!draft.trim() || !server}
        >
          {t('fileFolderBrowser:commentsAddAction')}
        </Button>
      </Group>
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      {renderList()}
    </Stack>
  );
}
