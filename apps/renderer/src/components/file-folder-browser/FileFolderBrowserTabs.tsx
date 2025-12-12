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

import { BrandLogo } from '@/components/BrandLogo';
import { Tabs, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { FileFolderBrowserView } from './FileFolderBrowserView';

export function FileFolderBrowserTabs() {
  const { t } = useTranslation('fileFolderBrowser');
  const tabs = useFileFolderBrowserTabsStore(state => state.tabs);
  const activeTabId = useFileFolderBrowserTabsStore(state => state.activeTabId);
  const setActiveTab = useFileFolderBrowserTabsStore(state => state.setActiveTab);
  const closeTab = useFileFolderBrowserTabsStore(state => state.closeTab);

  if (tabs.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          width: '100%',
          minHeight: 'calc(100vh - 160px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          paddingTop: '4rem',
        }}
      >
        <Text c="dimmed">{t('selectFolderPrompt')}</Text>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <div style={{ opacity: 0.08 }}>
            <BrandLogo size={220} color="var(--mantine-color-gray-6)" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Tabs
      value={activeTabId}
      onChange={value => value && setActiveTab(value)}
      style={{ height: '100%' }}
    >
      <Tabs.List>
        {tabs.map(tab => (
          <Tabs.Tab
            key={tab.id}
            value={tab.id}
            rightSection={
              <span
                onClick={e => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: 0.6,
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '0.6';
                }}
              >
                <IconX size={14} />
              </span>
            }
          >
            <Text
              size="sm"
              truncate
              style={{
                maxWidth: '200px',
              }}
            >
              {tab.nodeName}
            </Text>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {tabs.map(tab => (
        <Tabs.Panel
          key={tab.id}
          value={tab.id}
          style={{ height: 'calc(100% - 42px)', overflow: 'auto' }}
        >
          <FileFolderBrowserView
            serverId={tab.serverId}
            nodeId={tab.nodeId}
            nodeName={tab.nodeName}
            tabId={tab.id}
            isActive={tab.id === activeTabId}
          />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
