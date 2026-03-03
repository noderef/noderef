import { backendRpc } from '@/core/ipc/backend';
import { useAgentStore } from '@/core/store/agent';
import { useNavigation } from '@/hooks/useNavigation';
import { Box, Group, Loader, ScrollArea, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconMessage, IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Infer the type from the RPC return type
type ChatSummary = Awaited<ReturnType<typeof backendRpc.agent.searchChats>>[number];

export function SearchChatsModal() {
  const { t } = useTranslation(['agent', 'common']);
  const { navigate, setActiveServer } = useNavigation();
  const setActiveChatId = useAgentStore(state => state.setActiveChatId);
  const activeServerId = useNavigation().activeServerId;

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ChatSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    const performSearch = async () => {
      try {
        setLoading(true);
        // If debouncedQuery is empty, listChats could be an alternative but searchChats with an empty query matches everything.
        const chats = debouncedQuery.trim()
          ? await backendRpc.agent.searchChats({
              query: debouncedQuery.trim(),
              serverId: activeServerId || undefined,
              maxItems: 50,
            })
          : await backendRpc.agent
              .listChats({
                serverId: activeServerId || undefined,
                maxItems: 50,
              })
              .then(res => res.items);

        if (!cancelled) {
          setResults(chats);
        }
      } catch (error) {
        console.error('Failed to load chats:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void performSearch();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, activeServerId]);

  const handleSelectChat = (chat: ChatSummary) => {
    setActiveChatId(chat.id);
    setActiveServer(chat.serverId);
    navigate('agentPage');
    modals.closeAll();
  };

  return (
    <Box>
      <TextInput
        placeholder={t('agent:searchChatsPlaceholder', 'Search all chats...')}
        value={query}
        onChange={e => setQuery(e.currentTarget.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        leftSection={<IconSearch size={16} />}
        mb="md"
        data-autofocus
      />

      <ScrollArea h={300} type="always" offsetScrollbars>
        {loading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : query.trim() && results.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center" py="xl">
            {t('common:noResults', 'No results found')}
          </Text>
        ) : (
          results.map(chat => (
            <UnstyledButton
              key={chat.id}
              onClick={() => handleSelectChat(chat)}
              w="100%"
              p="sm"
              style={_theme => ({
                borderRadius: 'var(--mantine-radius-sm)',
                '&:hover': {
                  backgroundColor: 'var(--mantine-color-default-hover)',
                },
              })}
            >
              <Group wrap="nowrap">
                <IconMessage size={16} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Box style={{ flex: 1, overflow: 'hidden' }}>
                  <Text size="sm" fw={500} truncate>
                    {chat.title || t('agent:untitledChat', 'Untitled Chat')}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {new Date(chat.lastMessageAt || chat.updatedAt).toLocaleString()}
                  </Text>
                </Box>
              </Group>
            </UnstyledButton>
          ))
        )}
      </ScrollArea>
    </Box>
  );
}
