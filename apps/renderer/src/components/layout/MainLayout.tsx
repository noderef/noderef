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

import { AppLayout } from '@/components/layout/AppLayout';
import { ModalHost } from '@/components/modals/ModalHost';
import { NodeRefSpace } from '@/components/sidebar/NodeRefSpace';
import { ServerIconColumn } from '@/components/sidebar/ServerIconColumn';
import { SettingsButton } from '@/components/sidebar/SettingsButton';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { NodeRefSpotlight } from '@/components/spotlight/NodeRefSpotlight';
import { SimpleMenuNavigation } from '@/components/submenu/SimpleMenuNavigation';
import { SubmenuHeader } from '@/components/submenu/SubmenuHeader';
import { SubmenuPanel } from '@/components/submenu/SubmenuPanel';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useServersStore } from '@/core/store/servers';
import { useNavigation } from '@/hooks/useNavigation';
import { ReactNode, useEffect, useMemo } from 'react';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { activeServerId, setActiveServer, navigate } = useNavigation();
  const serversArray = useServersStore(state => state.servers);
  const pruneNodeBrowserTabs = useNodeBrowserTabsStore(state => state.pruneTabsForServers);

  // Memoize sorted servers to avoid creating new array on every render
  const servers = useMemo(() => {
    return [...serversArray].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [serversArray]);

  // Reset navigation if active server no longer exists
  useEffect(() => {
    if (activeServerId !== null) {
      const server = serversArray.find(s => s.id === activeServerId);
      if (!server) {
        // Server was deleted or doesn't exist, reset to NodeRef space
        setActiveServer(null);
        navigate('dashboard');
      }
    }
  }, [activeServerId, serversArray, setActiveServer, navigate]);

  useEffect(() => {
    pruneNodeBrowserTabs(serversArray.map(server => server.id));
  }, [serversArray, pruneNodeBrowserTabs]);

  const sidebar = (
    <Sidebar
      header={
        <NodeRefSpace
          active={!activeServerId}
          onSelect={() => {
            setActiveServer(null);
          }}
        />
      }
      list={
        <ServerIconColumn
          servers={servers}
          selectedServerId={activeServerId}
          onSelectServer={setActiveServer}
        />
      }
      footer={<SettingsButton />}
    />
  );

  const submenu = (
    <SubmenuPanel header={<SubmenuHeader />}>
      <SimpleMenuNavigation />
    </SubmenuPanel>
  );

  return (
    <>
      <AppLayout sidebar={sidebar} submenu={submenu} content={children} />
      <ModalHost />
      <NodeRefSpotlight />
    </>
  );
}
