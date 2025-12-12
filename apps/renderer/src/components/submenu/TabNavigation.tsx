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

import { useEffect, useMemo } from 'react';
import { ScrollArea, Tabs, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '@/core/store/layout';
import { MenuItem, TreeNode, Tab } from '@/types/menu';
import { MenuView } from './MenuView';
import { TreeView } from './TreeView';
import { TabPanel } from './TabPanel';

export function TabNavigation() {
  const { t } = useTranslation();
  const selectedServerId = useLayoutStore(state => state.selectedServerId);
  const activeTab = useLayoutStore(state => state.activeTab);
  const selectedMenuItem = useLayoutStore(state => state.selectedMenuItem);
  const setActiveTab = useLayoutStore(state => state.setActiveTab);
  const setSelectedMenuItem = useLayoutStore(state => state.setSelectedMenuItem);
  const setContentViewMode = useLayoutStore(state => state.setContentViewMode);
  const setContentData = useLayoutStore(state => state.setContentData);

  // Empty tabs array - this component is deprecated and should be replaced
  const tabs: Tab[] = [];
  const isServerSelected = Boolean(selectedServerId);

  useEffect(() => {
    if (!tabs.length) return;
    if (!activeTab || !tabs.some(tab => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab, setActiveTab]);

  const currentTab = useMemo(
    () => tabs.find(tab => tab.id === activeTab) ?? tabs[0],
    [tabs, activeTab]
  );

  const handleMenuSelect = (item: MenuItem) => {
    setSelectedMenuItem(item.id);
    setContentViewMode(item.viewMode);
    if (item.viewMode === 'monaco' && item.content) {
      setContentData({ monaco: { content: item.content, language: 'javascript' } });
    }
    if (item.viewMode === 'webview' && item.url) {
      setContentData({ webview: { url: item.url } });
    }
  };

  const handleTreeSelect = (node: TreeNode) => {
    if (node.viewMode) {
      setContentViewMode(node.viewMode);
    }
    if (node.viewMode === 'monaco' && node.content) {
      setContentData({ monaco: { content: node.content, language: 'javascript' } });
    }
    if (node.viewMode === 'webview' && node.url) {
      setContentData({ webview: { url: node.url } });
    }
    setSelectedMenuItem(node.value);
  };

  if (!tabs.length || !currentTab) {
    return (
      <Text size="sm" c="dimmed">
        {t('submenu:noServerSelected')}
      </Text>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!isServerSelected && (
        <Text size="sm" c="dimmed" mb="xs">
          {t('submenu:noServerSelected')}
        </Text>
      )}
      <Tabs
        value={currentTab.id}
        onChange={value => value && setActiveTab(value)}
        orientation="vertical"
        keepMounted={false}
        id="submenu-tabs"
        defaultValue={currentTab.id}
        style={{ flex: 1, display: 'flex' }}
      >
        <Tabs.List aria-label={t('submenu:tabsLabel')} style={{ flexShrink: 0 }}>
          {tabs.map(tab => (
            <Tabs.Tab key={tab.id} value={tab.id}>
              {t(tab.label)}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <ScrollArea style={{ flex: 1 }}>
          {tabs.map(tab => (
            <TabPanel key={tab.id} value={tab.id} p="sm">
              {tab.displayMode === 'tree' && tab.treeData ? (
                <TreeView data={tab.treeData} onNodeSelect={handleTreeSelect} />
              ) : (
                <MenuView
                  sections={tab.sections || []}
                  activeItemId={selectedMenuItem}
                  onItemSelect={handleMenuSelect}
                />
              )}
            </TabPanel>
          ))}
        </ScrollArea>
      </Tabs>
    </div>
  );
}
