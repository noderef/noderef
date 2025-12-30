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

  attributes: {
    description:
      'Work with Alfresco repository attributes (AttributeService) via OOTBee Support Tools: check existence, get values, create new attributes, set/overwrite values, remove individual attributes, remove subtrees, remove wildcard patterns, and fetch attribute trees as JavaScript objects.',
    tags: [
      'alfresco',
      'attributes',
      'attributeService',
      'ootbee',
      'support-tools',
      'config',
      'settings',
      'metadata',
      'key-value',
      'repository',
      'admin',
      'automation',
      'remove',
      'exists',
      'getAttributes',
    ],
  },

  audit: {
    description:
      'Inspect and manage Alfresco audit logs via OOTBee Support Tools: check and toggle auditing globally, check auditing for a specific app+path, list registered audit applications, query audit entries by application/user/time range, and clear audit data for an application (optionally within a time range).',
    tags: [
      'alfresco',
      'audit',
      'auditService',
      'ootbee',
      'support-tools',
      'monitoring',
      'logging',
      'security',
      'compliance',
      'admin',
      'query',
      'clear',
      'applications',
      'events',
      'tracking',
    ],
  },

  auth: {
    description:
      'Authentication context utilities (OOTBee Support Tools): switch current execution user to system or another user (admin-only), inspect runAs vs fully authenticated user, and retrieve system/admin usernames. Useful for running repository operations under a different security context from scripts.',
    tags: [
      'alfresco',
      'auth',
      'authentication',
      'security',
      'runAs',
      'system',
      'admin',
      'authority',
      'permissions',
      'ootbee',
      'support-tools',
      'context',
      'impersonation',
      'identity',
    ],
  },

  batchExecuter: {
    description:
      'Execute high-volume operations in Alfresco using multi-threaded batching (OOTBee Support Tools): process arrays or browse folders recursively, apply per-node or per-batch functions, tune batch size and threads, optionally disable rules, monitor running jobs, and request cancellation.',
    tags: [
      'alfresco',
      'batchExecuter',
      'batch',
      'bulk',
      'automation',
      'threads',
      'transactions',
      'retryingTransactionHelper',
      'rules',
      'disableRules',
      'folder',
      'recursive',
      'nodes',
      'documents',
      'processing',
      'cancel',
      'monitoring',
      'ootbee',
      'support-tools',
    ],
  },

  contentUrls: {
    description:
      'Resolve the underlying Alfresco content URL for a document node using FileFolderService: provide a NodeRef string and get back the contentUrl from ContentData. Useful for diagnostics, storage troubleshooting, and content-store investigations.',
    tags: [
      'alfresco',
      'contentUrls',
      'content',
      'contentstore',
      'contentUrl',
      'filestatus',
      'filefolderservice',
      'diagnostics',
      'troubleshooting',
      'repository',
      'ootbee',
      'support-tools',
      'nodeRef',
    ],
  },

  database: {
    description:
      'Admin only SQL access for diagnostics and maintenance via Spring DataSource: run parameterized SELECT queries (database.query) and execute UPDATE/DELETE/DDL statements (database.update). Useful for reporting, troubleshooting contentstore mappings, auditing/property table cleanup, and advanced repository inspection.',
    tags: [
      'alfresco',
      'database',
      'sql',
      'jdbc',
      'datasource',
      'admin-only',
      'diagnostics',
      'maintenance',
      'reporting',
      'contentstore',
      'alf_node',
      'alf_content_url',
      'alf_content_data',
      'audit',
      'attributes',
      'ootbee',
      'support-tools',
    ],
  },

  dictionary: {
    description:
      'Inspect Alfresco content model definitions from scripts: list all types, fetch type/aspect/property definitions, resolve property names for a type including default aspects, check subtype relationships, detect multi-valued properties, and detect LIST constraints on properties.',
    tags: [
      'alfresco',
      'dictionary',
      'model',
      'types',
      'aspects',
      'properties',
      'qname',
      'namespace',
      'constraints',
      'list-constraint',
      'metadata',
      'schema',
      'ootbee',
      'support-tools',
    ],
  },

  downloads: {
    description:
      'Create and manage Alfresco bulk download (zip) requests from scripts via DownloadService: create downloads for one or many nodes (by ScriptNode or NodeRef string), optionally recursive for folders, poll download status, and cancel download requests.',
    tags: [
      'alfresco',
      'downloads',
      'downloadservice',
      'zip',
      'bulk-download',
      'archive',
      'folders',
      'recursive',
      'status',
      'cancel',
      'content',
      'repository',
      'ootbee',
      'support-tools',
      'nodeRef',
    ],
  },

  favorites: {
    description:
      'Manage Alfresco user favourites from scripts via FavouritesService: add/remove a node as a favourite, check whether a node is favourited by the current user, and page through favourites (returns PersonFavourite objects). Includes an overload to add favourites on behalf of another user (requires sufficient privileges).',
    tags: [
      'alfresco',
      'favorites',
      'favourites',
      'users',
      'profile',
      'personalization',
      'bookmark',
      'paging',
      'personfavourite',
      'security',
      'ootbee',
      'support-tools',
      'node',
    ],
  },

  hidden: {
    description:
      'Control Alfresco hidden nodes via HiddenAspect: explicitly hide/unhide nodes, test whether a node has the hidden aspect, remove the hidden aspect, and detect whether a node is located on a hidden path (returns HiddenFileInfo). Useful for CIFS/WebDAV/client visibility troubleshooting and cleanup.',
    tags: [
      'alfresco',
      'hidden',
      'hidden-aspect',
      'visibility',
      'cifs',
      'webdav',
      'clients',
      'folder',
      'document',
      'diagnostics',
      'cleanup',
      'ootbee',
      'support-tools',
    ],
  },

  jobs: {
    description:
      'Inspect and control Quartz-scheduled jobs via OOTBee Support Tools: list jobs, print details, get job by name, run immediately, check running state, pause/resume jobs, unschedule triggers, delete jobs, and schedule temporary inline-script jobs with cron expressions.',
    tags: [
      'alfresco',
      'jobs',
      'quartz',
      'scheduler',
      'ootbee',
      'support-tools',
      'cron',
      'triggers',
      'admin',
      'automation',
      'monitoring',
      'pause',
      'resume',
      'runNow',
      'cancel',
      'delete',
    ],
  },

  links: {
    description:
      'Work with Alfresco document links via DocumentLinkService: create a link to a document in another folder, resolve the original source document for a link node, and delete all links pointing to a document (returns DeleteLinksStatusReport for diagnostics).',
    tags: [
      'alfresco',
      'links',
      'documentlinkservice',
      'shortcuts',
      'references',
      'folders',
      'cleanup',
      'delete-links',
      'status-report',
      'node',
      'repository',
      'ootbee',
      'support-tools',
    ],
  },

  messages: {
    description:
      'Access Alfresco i18n messages from scripts via MessageService: resolve message keys, format parameterized messages using an array of parameters, and list all registered message bundles for troubleshooting missing translations.',
    tags: [
      'alfresco',
      'messages',
      'i18n',
      'messageService',
      'bundles',
      'translations',
      'localization',
      'keys',
      'message-format',
      'params',
      'ootbee',
      'support-tools',
    ],
  },

  customModel: {
    description:
      'Manage Alfresco Custom Models via CustomModelService: check whether the current user is a model admin, list custom models with paging (returns CustomModelDefinition objects), activate/deactivate models by name, delete models, and fetch the underlying model node as a ScriptNode for inspection or content access.',
    tags: [
      'alfresco',
      'customModel',
      'custom-models',
      'model-admin',
      'dictionary',
      'types',
      'aspects',
      'activate',
      'deactivate',
      'delete',
      'definition',
      'ootbee',
      'support-tools',
      'admin',
    ],
  },

  permissions: {
    description:
      'Inspect and manage Alfresco node permissions via PermissionService: check read/permission access for the current user or another authority (runAs), list effective and explicitly set AccessPermission entries, grant/deny permissions, delete individual permissions, clear all permissions for an authority, delete all permissions on a node, and toggle inheritance of parent permissions. Includes store-level permission cleanup helpers.',
    tags: [
      'alfresco',
      'permissions',
      'permissionService',
      'access',
      'acl',
      'security',
      'authorities',
      'groups',
      'users',
      'grant',
      'deny',
      'inheritance',
      'accesspermission',
      'cleanup',
      'store',
      'ootbee',
      'support-tools',
    ],
  },

  policies: {
    description:
      'Control Alfresco behaviours (policies/rules) during script execution via BehaviourFilter: enable/disable behaviours for a single node or for an entire type/aspect within the current transaction, and restore all behaviours afterwards. Useful for maintenance scripts that must update metadata without triggering rules, audits, or policy side effects.',
    tags: [
      'alfresco',
      'policies',
      'behaviourFilter',
      'behaviors',
      'rules',
      'disable',
      'enable',
      'transaction',
      'maintenance',
      'auditable',
      'aspects',
      'types',
      'ootbee',
      'support-tools',
    ],
  },

  quickshares: {
    description:
      'Manage Alfresco QuickShare links from scripts: share a document to generate an anonymous shareId, unshare to revoke access, and inspect QuickShare metadata by shareId or by node (returns the internal "item" map from QuickShareService). Useful for support diagnostics, token rotation, and bulk share/unshare automation.',
    tags: [
      'alfresco',
      'quickshare',
      'quickshares',
      'share',
      'anonymous',
      'public-link',
      'token',
      'metadata',
      'unshare',
      'revoke',
      'diagnostics',
      'ootbee',
      'support-tools',
    ],
  },

  repoAdmin: {
    description:
      'Execute commands through the Alfresco Repo Admin Console interpreter (RepoAdminInterpreter). This enables scripts to run admin-console-style commands such as help, status queries, and deployment-related operations (messages/models) depending on what the interpreter supports.',
    tags: [
      'alfresco',
      'repo-admin',
      'repoAdmin',
      'admin-console',
      'commands',
      'interpreter',
      'models',
      'messages',
      'deployment',
      'ootbee',
      'support-tools',
    ],
  },

  repository: {
    description:
      'Convenience wrapper around Alfresco Repository helper and core services for quickly retrieving important anchor nodes (Company Home, Root Home, Sites Root, People Container) and resolving related locations such as the document library for a given node. Useful for diagnostics, navigation, and scripts that need stable starting points.',
    tags: [
      'alfresco',
      'repository',
      'companyhome',
      'roothome',
      'sites',
      'people',
      'userhome',
      'doclib',
      'navigation',
      'helpers',
      'ootbee',
      'support-tools',
    ],
  },

  rules: {
    description:
      'Wrapper around Alfresco RuleService: check whether rules are enabled, enable/disable rules for the current thread or for a specific node, inspect attached rules (direct vs inherited), enable/disable individual rules, count rules, and remove all rules from a node. Useful for admin scripts, migrations, and bulk updates where rule side effects must be controlled.',
    tags: [
      'alfresco',
      'rules',
      'ruleService',
      'behaviour',
      'automation',
      'folders',
      'documents',
      'admin',
      'bulk-update',
      'disable-rules',
      'enable-rules',
      'cleanup',
      'ootbee',
      'support-tools',
    ],
  },

  tenantAdmin: {
    description:
      'Run tenant administration console commands from repository JavaScript via TenantInterpreter. Supports listing tenants, inspecting tenant details, creating tenants, and deleting tenants depending on Alfresco version. Intended for admin-only automation and diagnostics.',
    tags: [
      'alfresco',
      'tenant',
      'tenantAdmin',
      'multitenancy',
      'admin',
      'console',
      'interpreter',
      'ootbee',
      'support-tools',
      'diagnostics',
      'automation',
    ],
  },

  ticket: {
    description:
      'Expose the current user authentication ticket (alf_ticket) to repository JavaScript. Useful for diagnostics, legacy integrations, and building authenticated URLs. Tickets are sensitive and should be handled with care.',
    tags: [
      'alfresco',
      'authentication',
      'ticket',
      'alf_ticket',
      'security',
      'admin',
      'integration',
      'legacy',
      'ootbee',
      'support-tools',
      'diagnostics',
    ],
  },

  transactions: {
    description:
      'Access Alfresco TransactionService via scripting: create a UserTransaction wrapper to explicitly begin/commit/rollback and inspect status, and check whether the current execution context allows writes (read-only check). Use carefully since many scripts already run inside an existing transaction.',
    tags: [
      'alfresco',
      'transaction',
      'transactions',
      'tx',
      'rollback',
      'commit',
      'usertransaction',
      'consistency',
      'admin',
      'diagnostics',
      'support-tools',
      'ootbee',
    ],
  },

  globalProperties: {
    description:
      'Read Alfresco global properties from scripts (java.util.Properties). Provides simple key lookup with optional fallback. Useful for environment-specific configuration and feature flags, but avoid dumping all properties since sensitive values may be present.',
    tags: [
      'alfresco',
      'globalProperties',
      'properties',
      'configuration',
      'env',
      'feature-flags',
      'settings',
      'support-tools',
      'ootbee',
      'admin',
      'security',
    ],
  },

  workflowAdmin: {
    description:
      'Run Alfresco Workflow Admin Console commands from scripts via WorkflowInterpreter. Useful for listing workflow definitions and instances, inspecting workflows, and cancelling problematic workflow instances. Command set varies by Alfresco version; use workflowAdmin.exec("help") to discover supported commands.',
    tags: [
      'alfresco',
      'workflow',
      'workflowAdmin',
      'admin-console',
      'interpreter',
      'activiti',
      'jbpm',
      'definitions',
      'instances',
      'cancel',
      'support-tools',
      'ootbee',
      'diagnostics',
    ],
  },
};

export default manifest;
