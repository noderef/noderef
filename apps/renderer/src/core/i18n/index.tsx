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

import addServerDe from '@/locales/de/addServer.json';
import commonDe from '@/locales/de/common.json';
import dashboardDe from '@/locales/de/dashboard.json';
import fileFolderBrowserDe from '@/locales/de/fileFolderBrowser.json';
import jsConsoleDe from '@/locales/de/jsConsole.json';
import localFilesDe from '@/locales/de/localFiles.json';
import logsDe from '@/locales/de/logs.json';
import menuDe from '@/locales/de/menu.json';
import nodeBrowserDe from '@/locales/de/nodeBrowser.json';
import notFoundDe from '@/locales/de/notFound.json';
import searchDe from '@/locales/de/search.json';
import serverDe from '@/locales/de/server.json';
import settingsDe from '@/locales/de/settings.json';
import spotlightDe from '@/locales/de/spotlight.json';
import submenuDe from '@/locales/de/submenu.json';
import addServerEn from '@/locales/en/addServer.json';
import commonEn from '@/locales/en/common.json';
import dashboardEn from '@/locales/en/dashboard.json';
import fileFolderBrowserEn from '@/locales/en/fileFolderBrowser.json';
import jsConsoleEn from '@/locales/en/jsConsole.json';
import localFilesEn from '@/locales/en/localFiles.json';
import logsEn from '@/locales/en/logs.json';
import menuEn from '@/locales/en/menu.json';
import nodeBrowserEn from '@/locales/en/nodeBrowser.json';
import notFoundEn from '@/locales/en/notFound.json';
import searchEn from '@/locales/en/search.json';
import serverEn from '@/locales/en/server.json';
import settingsEn from '@/locales/en/settings.json';
import spotlightEn from '@/locales/en/spotlight.json';
import submenuEn from '@/locales/en/submenu.json';
import addServerFr from '@/locales/fr/addServer.json';
import commonFr from '@/locales/fr/common.json';
import dashboardFr from '@/locales/fr/dashboard.json';
import fileFolderBrowserFr from '@/locales/fr/fileFolderBrowser.json';
import jsConsoleFr from '@/locales/fr/jsConsole.json';
import localFilesFr from '@/locales/fr/localFiles.json';
import logsFr from '@/locales/fr/logs.json';
import menuFr from '@/locales/fr/menu.json';
import nodeBrowserFr from '@/locales/fr/nodeBrowser.json';
import notFoundFr from '@/locales/fr/notFound.json';
import searchFr from '@/locales/fr/search.json';
import serverFr from '@/locales/fr/server.json';
import settingsFr from '@/locales/fr/settings.json';
import spotlightFr from '@/locales/fr/spotlight.json';
import submenuFr from '@/locales/fr/submenu.json';
import addServerNl from '@/locales/nl/addServer.json';
import commonNl from '@/locales/nl/common.json';
import dashboardNl from '@/locales/nl/dashboard.json';
import fileFolderBrowserNl from '@/locales/nl/fileFolderBrowser.json';
import jsConsoleNl from '@/locales/nl/jsConsole.json';
import localFilesNl from '@/locales/nl/localFiles.json';
import logsNl from '@/locales/nl/logs.json';
import menuNl from '@/locales/nl/menu.json';
import nodeBrowserNl from '@/locales/nl/nodeBrowser.json';
import notFoundNl from '@/locales/nl/notFound.json';
import searchNl from '@/locales/nl/search.json';
import serverNl from '@/locales/nl/server.json';
import settingsNl from '@/locales/nl/settings.json';
import spotlightNl from '@/locales/nl/spotlight.json';
import submenuNl from '@/locales/nl/submenu.json';
import i18n, { Resource } from 'i18next';
import { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

const DEFAULT_LANGUAGE = 'en';
const UI_STORE_KEY = 'ui-store';
const SUPPORTED_LANGUAGES = ['en', 'nl', 'de', 'fr'];

const resources: Resource = {
  en: {
    common: commonEn,
    dashboard: dashboardEn,
    addServer: addServerEn,
    submenu: submenuEn,
    menu: menuEn,
    server: serverEn,
    settings: settingsEn,
    nodeBrowser: nodeBrowserEn,
    fileFolderBrowser: fileFolderBrowserEn,
    localFiles: localFilesEn,
    logs: logsEn,
    search: searchEn,
    spotlight: spotlightEn,
    notFound: notFoundEn,
    jsConsole: jsConsoleEn,
  },
  nl: {
    common: commonNl,
    dashboard: dashboardNl,
    addServer: addServerNl,
    submenu: submenuNl,
    menu: menuNl,
    server: serverNl,
    settings: settingsNl,
    nodeBrowser: nodeBrowserNl,
    fileFolderBrowser: fileFolderBrowserNl,
    localFiles: localFilesNl,
    logs: logsNl,
    search: searchNl,
    spotlight: spotlightNl,
    notFound: notFoundNl,
    jsConsole: jsConsoleNl,
  },
  de: {
    common: commonDe,
    dashboard: dashboardDe,
    addServer: addServerDe,
    submenu: submenuDe,
    menu: menuDe,
    server: serverDe,
    settings: settingsDe,
    nodeBrowser: nodeBrowserDe,
    fileFolderBrowser: fileFolderBrowserDe,
    localFiles: localFilesDe,
    logs: logsDe,
    search: searchDe,
    spotlight: spotlightDe,
    notFound: notFoundDe,
    jsConsole: jsConsoleDe,
  },
  fr: {
    common: commonFr,
    dashboard: dashboardFr,
    addServer: addServerFr,
    submenu: submenuFr,
    menu: menuFr,
    server: serverFr,
    settings: settingsFr,
    nodeBrowser: nodeBrowserFr,
    fileFolderBrowser: fileFolderBrowserFr,
    localFiles: localFilesFr,
    logs: logsFr,
    search: searchFr,
    spotlight: spotlightFr,
    notFound: notFoundFr,
    jsConsole: jsConsoleFr,
  },
};

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  // First, check if user has manually set a language in the UI store
  try {
    const uiStore = window.localStorage.getItem(UI_STORE_KEY);
    if (uiStore) {
      const parsed = JSON.parse(uiStore);
      if (parsed.state?.language) {
        return parsed.state.language;
      }
    }
  } catch (e) {
    console.warn('Failed to read language from UI store:', e);
  }

  // If no manual selection, detect browser/OS language
  try {
    // Try to get the browser/OS language
    const browserLang = navigator.language || (navigator as any).userLanguage;
    if (browserLang) {
      // Extract language code (e.g., 'en' from 'en-US', 'nl' from 'nl-NL')
      const langCode = browserLang.split('-')[0].toLowerCase();

      // Check if the detected language is supported
      if (SUPPORTED_LANGUAGES.includes(langCode)) {
        console.warn(`Detected ${browserLang}, using ${langCode} as default language`);
        return langCode;
      }
    }
  } catch (e) {
    console.warn('Failed to detect browser language:', e);
  }

  // Fall back to default language
  console.warn(`Using default language: ${DEFAULT_LANGUAGE}`);
  return DEFAULT_LANGUAGE;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false,
    },
    defaultNS: 'common',
    ns: [
      'common',
      'addServer',
      'submenu',
      'menu',
      'server',
      'settings',
      'nodeBrowser',
      'fileFolderBrowser',
      'localFiles',
      'logs',
      'search',
      'spotlight',
      'dashboard',
      'notFound',
      'jsConsole',
    ],
    returnNull: false,
  });
}

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export { DEFAULT_LANGUAGE, getInitialLanguage, i18n };
