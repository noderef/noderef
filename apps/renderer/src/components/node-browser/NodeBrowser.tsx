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

import { backendRpc, type AlfrescoNodeDetails } from '@/core/ipc/backend';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useServersStore } from '@/core/store/servers';
import { Accordion, Loader, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowsLeftRight,
  IconArrowUp,
  IconInfoCircle,
  IconListDetails,
  IconLock,
  IconSitemap,
  IconTags,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NodeAspects } from './NodeAspects';
import { NodeAssociations } from './NodeAssociations';
import { NodeChildren } from './NodeChildren';
import { NodeInfo } from './NodeInfo';
import { NodeParents } from './NodeParents';
import { NodePermissions } from './NodePermissions';
import { NodeProperties } from './NodeProperties';

interface NodeBrowserProps {
  tabId: string;
  serverId: number;
  nodeId: string;
  nodeName: string;
}

export function NodeBrowser({ tabId, serverId, nodeId, nodeName: _nodeName }: NodeBrowserProps) {
  const { t } = useTranslation(['common', 'nodeBrowser']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeData, setNodeData] = useState<AlfrescoNodeDetails | null>(null);
  const updateTabMetadata = useNodeBrowserTabsStore(state => state.updateTabMetadata);
  const serverExists = useServersStore(state =>
    state.servers.some(server => server.id === serverId)
  );
  const fetchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!serverExists) {
      setNodeData(null);
      setLoading(false);
      setError(t('nodeBrowser:serverUnavailable'));
      updateTabMetadata(tabId, { mimeType: null, nodeType: null });
      return;
    }

    let cancelled = false;

    const fetchNodeDetails = async () => {
      setLoading(true);
      setError(null);
      updateTabMetadata(tabId, { mimeType: null, nodeType: null });

      try {
        const response = await backendRpc.repository.getNodeDetails(serverId, nodeId);
        if (cancelled) {
          return;
        }
        setNodeData(response.nodeData);

        const mimeType = extractMimeType(response.nodeData);
        const nodeType = response.nodeData.type?.prefixedName ?? null;
        updateTabMetadata(tabId, { mimeType, nodeType });
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load node details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load node details');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchTimeoutRef.current = window.setTimeout(() => {
      fetchNodeDetails();
      fetchTimeoutRef.current = null;
    }, 0);

    return () => {
      cancelled = true;
      if (fetchTimeoutRef.current !== null) {
        window.clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, [serverExists, serverId, nodeId, tabId, updateTabMetadata, t]);

  if (loading) {
    return (
      <Stack align="center" justify="center" style={{ height: '100%', padding: '2rem' }}>
        <Loader size="lg" />
        <Text c="dimmed">{t('common:loading')}</Text>
      </Stack>
    );
  }

  if (error || !nodeData) {
    return (
      <Stack align="center" justify="center" style={{ height: '100%', padding: '2rem' }}>
        <Text c="red">{error || t('common:error')}</Text>
      </Stack>
    );
  }

  return (
    <Stack style={{ height: '100%', overflow: 'hidden' }}>
      <Accordion
        multiple
        defaultValue={['info', 'properties']}
        style={{ overflow: 'auto' }}
        classNames={{ content: 'p-0' }}
      >
        {/* Info Section */}
        <Accordion.Item value="info">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="blue" size="sm">
                <IconInfoCircle size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:info')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodeInfo nodeData={nodeData} serverId={serverId} />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Properties Section */}
        <Accordion.Item value="properties">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="teal" size="sm">
                <IconListDetails size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:properties')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodeProperties
              properties={nodeData.properties}
              serverId={serverId}
              nodeId={nodeId}
              nodeName={(() => {
                // Extract cm:name from properties array
                const nameProperty = nodeData.properties.find(
                  prop => prop.name.prefixedName === 'cm:name'
                );
                return (nameProperty?.values?.[0]?.value as string) || nodeData.name.name;
              })()}
            />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Aspects Section */}
        <Accordion.Item value="aspects">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="violet" size="sm">
                <IconTags size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:aspects')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodeAspects aspects={nodeData.aspects} />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Children Section */}
        <Accordion.Item value="children">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="orange" size="sm">
                <IconSitemap size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:children')} ({nodeData.children.length})
          </Accordion.Control>
          <Accordion.Panel>
            <NodeChildren childNodes={nodeData.children} serverId={serverId} />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Parents Section */}
        <Accordion.Item value="parents">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="grape" size="sm">
                <IconArrowUp size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:parents')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodeParents parents={nodeData.parents} serverId={serverId} />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Associations Section */}
        <Accordion.Item value="assocs">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="cyan" size="sm">
                <IconArrowsLeftRight size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:associations')} ({nodeData.assocs?.length || 0})
          </Accordion.Control>
          <Accordion.Panel>
            <NodeAssociations associations={nodeData.assocs} serverId={serverId} type="target" />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Source Associations Section */}
        <Accordion.Item value="sourceAssocs">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="indigo" size="sm">
                <IconArrowLeft size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:sourceAssociations')} ({nodeData.sourceAssocs?.length || 0})
          </Accordion.Control>
          <Accordion.Panel>
            <NodeAssociations
              associations={nodeData.sourceAssocs}
              serverId={serverId}
              type="source"
            />
          </Accordion.Panel>
        </Accordion.Item>

        {/* Permissions Section */}
        <Accordion.Item value="permissions">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="red" size="sm">
                <IconLock size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:permissions')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodePermissions permissions={nodeData.permissions} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

function extractMimeType(nodeData: AlfrescoNodeDetails): string | null {
  const mimetypeProperty = nodeData.properties.find(
    prop => prop.name.prefixedName === 'cm:mimetype'
  );

  let mimeType =
    typeof mimetypeProperty?.values?.[0]?.value === 'string'
      ? (mimetypeProperty.values[0].value as string)
      : undefined;

  if (!mimeType) {
    const contentProperty = nodeData.properties.find(
      prop => prop.name.prefixedName === 'cm:content' || prop.name.prefixedName === 'd:content'
    );
    const contentValue = contentProperty?.values?.[0]?.value;
    if (typeof contentValue === 'string') {
      const match = contentValue.match(/mimetype=([^|]+)/);
      if (match) {
        mimeType = match[1]?.trim();
      }
    }
  }

  if (mimeType && mimeType.includes('=')) {
    const parts = mimeType.split('=');
    mimeType = parts[parts.length - 1]?.trim();
  }

  return mimeType ?? null;
}
