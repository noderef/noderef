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

import type { Manifest } from './loadLibs.js';

export const manifest: Manifest = {
  node: {
    description:
      'Work directly with Alfresco ScriptNode: properties, aspects, associations, children, content, tags, permissions, versioning, create/move/copy/delete.',
    tags: [
      'alfresco',
      'node',
      'content',
      'aspects',
      'properties',
      'permissions',
      'tags',
      'associations',
      'versioning',
    ],
  },

  search: {
    description:
      'Examples and helpers for Alfresco repository search: XPath, Lucene, FTS, saved searches, faceting, highlighting, spellcheck, and tag queries.',
    tags: [
      'alfresco',
      'query',
      'search',
      'xpath',
      'lucene',
      'fts',
      'facets',
      'highlight',
      'spellcheck',
      'tags',
    ],
  },

  people: {
    description:
      'Create, delete and look up people; manage accounts, passwords, quotas, capabilities, and group memberships from Alfresco scripts.',
    tags: [
      'users',
      'people',
      'profile',
      'accounts',
      'auth',
      'groups',
      'membership',
      'quota',
      'admin',
      'ldap',
    ],
  },

  sites: {
    description:
      'Work with Alfresco sites: create sites, inspect visibility, roles and membership, list and search sites, and clean site permissions.',
    tags: [
      'sites',
      'alfresco',
      'content',
      'membership',
      'roles',
      'permissions',
      'visibility',
      'site-admin',
      'search',
    ],
  },

  actions: {
    description:
      'Create and execute Alfresco repository actions: add aspects, move/copy nodes, transform content, extract metadata, and invoke custom actions.',
    tags: [
      'actions',
      'alfresco',
      'content',
      'automation',
      'aspects',
      'transform',
      'metadata',
      'copy',
      'move',
      'repo',
    ],
  },
  logger: {
    description:
      'Examples for JavascriptConsoleScriptLogger: debug/info/warn/error logging, systemOut, timing blocks, structured JSON logging, banners, and dynamic log level changes.',
    tags: [
      'logger',
      'alfresco',
      'debug',
      'logging',
      'support-tools',
      'console',
      'diagnostics',
      'timing',
      'log-level',
    ],
  },
  utils: {
    description:
      'General Alfresco script utilities: node resolution, QName helpers, ISO-8601 parsing/formatting, paging builders, module checks, locale helpers, rule disabling, and display paths.',
    tags: [
      'alfresco',
      'utils',
      'qname',
      'paging',
      'locale',
      'rules',
      'dates',
      'iso8601',
      'nodelocator',
      'company-home',
      'user-home',
      'shared',
      'xpath',
    ],
  },
  renditionService: {
    description:
      'Render and inspect Alfresco renditions: create rendition definitions, run saved definitions, build temporary ScriptRenditionDefinition objects, list renditions, filter by MIME type, and fetch renditions by QName.',
    tags: [
      'rendition',
      'preview',
      'thumbnail',
      'transform',
      'content',
      'alfresco',
      'doclib',
      'viewer',
      'images',
      'processing',
    ],
  },

  groups: {
    description:
      'Work with Alfresco ScriptAuthorityService groups: search and page root groups, list groups in zones, filter and sort by name, create root groups, and look up users via authority service.',
    tags: [
      'alfresco',
      'groups',
      'authorities',
      'roles',
      'zones',
      'membership',
      'auth',
      'admin',
      'users',
      'security',
    ],
  },

  appUtils: {
    description:
      'Utility helpers for external applications: convert a ScriptNode to JSON with long or short QNames, and build content download API URLs for document nodes.',
    tags: [
      'alfresco',
      'json',
      'download',
      'content',
      'api',
      'utils',
      'external',
      'node',
      'qnames',
      'serialization',
    ],
  },

  classification: {
    description:
      'Work with Alfresco classifications and categories: list classification aspects, browse root categories, create new root categories, inspect all category nodes for an aspect, and report category usage counts.',
    tags: [
      'alfresco',
      'classification',
      'categories',
      'taxonomy',
      'metadata',
      'tags',
      'search',
      'facets',
    ],
  },

  actionTrackingService: {
    description:
      'Inspect and control executing Alfresco actions: list currently running actions, filter by action type, inspect execution details, and request cancellation from scripts.',
    tags: ['alfresco', 'actions', 'tracking', 'jobs', 'async', 'cancel', 'monitoring', 'execution'],
  },

  packages: {
    description:
      'Use Java classes inside Alfresco scripts through the Rhino Packages bridge: access Spring beans via ContextLoader, call Java services directly, work with NodeRef, QName, StoreRef, ContentService, FileFolderService, Java collections, Java dates, and system utilities.',
    tags: [
      'alfresco',
      'packages',
      'java',
      'spring',
      'beans',
      'serviceregistry',
      'rhino',
      'services',
    ],
  },
};

export default manifest;
