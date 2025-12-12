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

import { BackendGate } from '@/components/boot/BackendGate';
import { I18nProvider } from '@/core/i18n';
import { ensureBackendStarted } from '@/core/ipc/neutralino';
import { startBackend } from '@/core/ipc/rpc';
import { ThemeProvider } from '@/core/theme';
import '@/styles/global.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import 'flag-icons/css/flag-icons.min.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Kick the backend on startup (as before)
startBackend().catch(err => {
  console.warn('[Main] startBackend failed, trying ensureBackendStarted:', err);
  ensureBackendStarted().catch(() => {});
});

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <BackendGate>
          <App />
        </BackendGate>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
