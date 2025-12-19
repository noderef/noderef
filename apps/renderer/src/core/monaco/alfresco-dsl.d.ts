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

// Alfresco repository-side JavaScript globals (comprehensive definitions based on library examples).
// These declarations help Monaco understand the DSL used in the JS console.
// Note: DOM lib is excluded in Monaco setup to prevent conflict with our custom 'document' declaration.

interface ScriptLogger {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  isLoggingEnabled(): boolean;
  isDebugLoggingEnabled(): boolean;
  isInfoLoggingEnabled(): boolean;
  isWarnLoggingEnabled(): boolean;
  isErrorLoggingEnabled(): boolean;
  getSystem(): {
    out(...args: unknown[]): void;
  };
  // Used in logger examples for dynamic log-level changes
  getLevel(loggerName: string): string | null;
  setLevel(loggerName: string, level: string): void;
}

declare const logger: ScriptLogger;

interface ScriptNode {
  nodeRef: string | { toString(): string };
  id: string;
  name: string;
  displayPath: string;
  type?: string;
  properties: Record<string, any>;
  aspects?: string[];
  parent?: ScriptNode | null;
  children?: ScriptNode[];

  // Basic info
  getName(): string;
  setName(name: string): void;
  getType(): string;
  getTypeShort?(): string;
  getStoreType?(): string;
  getStoreId?(): string;
  getDisplayPath(): string;
  getQnamePath?(): string;
  exists(): boolean;

  // Aspects
  hasAspect(aspect: string): boolean;
  addAspect(aspect: string, properties?: Record<string, any> | null): void;
  removeAspect(aspect: string): void;
  getAspectsShort(): string[];

  // Properties
  save(): void;

  // Children / Navigation
  getChildren(): ScriptNode[];
  childByNamePath(path: string): ScriptNode | null;
  childrenByXPath?(xpath: string): ScriptNode[];
  childFileFolders(): ScriptNode[];
  createFolderPath?(path: string): ScriptNode;
  getParents?(): ScriptNode[];

  // Create
  createFolder(name: string): ScriptNode;
  createFolder(name: string, type: string): ScriptNode;
  createFile(name: string): ScriptNode;
  createFile(name: string, type: string): ScriptNode;
  createNode(name: string, type: string, properties?: Record<string, any> | null): ScriptNode;
  createNode(
    name: string,
    type: string,
    properties: Record<string, any> | null,
    assocType: string
  ): ScriptNode;

  // Delete / Move / Copy
  remove(): void;
  move(destination: ScriptNode): void;
  copy(destination: ScriptNode, deep?: boolean): ScriptNode;

  // Associations
  getAssocs(): ScriptNode[];
  getSourceAssocs(): ScriptNode[];
  getChildAssocs(): ScriptNode[];
  createAssociation(target: ScriptNode, type: string): boolean;
  removeAssociation(target: ScriptNode, type: string): boolean;

  // Content
  getContent(): string;
  setContent(content: string): void;
  getMimetype(): string;
  getSize(): number;
  getUrl?(): string;
  getDownloadUrl?(): string;
  getWebdavUrl?(): string;
  processTemplate(template: ScriptNode): string;
  processTemplate(template: ScriptNode, args: Record<string, any>): string;
  processTemplate(template: string): string;
  processTemplate(template: string, args: Record<string, any>): string;

  // Tags
  getTags(): string[];
  setTags(tags: string[]): void;
  addTags?(tags: string[]): void;
  removeTag(tag: string): void;
  removeTags?(tags: string[]): void;
  addTag(tag: string): void;
  clearTags(): void;

  // Permissions
  hasPermission(permission: string): boolean;
  setPermission(permission: string, authority?: string): void;
  removePermission(permission: string, authority?: string): void;
  setInheritsPermissions(inherit: boolean): void;
  getFullPermissions(): any[];

  // Versioning
  getIsVersioned(): boolean;
  createVersion(comment?: string, major?: boolean): ScriptNode;
  checkout(): ScriptNode;
  checkin(comment?: string, major?: boolean): ScriptNode;
  getVersionHistory(): any[];
  revert(comment: string, major: boolean, versionLabel: string, deep: boolean): ScriptNode;
  getVersion(versionLabel: string): any;

  // Actions
  executeAction(action: ScriptAction): void;

  // Ownership
  setOwner?(userId: string): void;
  takeOwnership?(): void;
  getOwner?(): string;

  // Locking / flags
  getIsLocked?(): boolean;
  getIsContainer?(): boolean;
  getIsDocument?(): boolean;
  getIsLinkToDocument?(): boolean;
  getIsLinkToContainer?(): boolean;
  getIsCategory?(): boolean;

  // Permissions helpers
  getSettablePermissions?(): string[];
  inheritsPermissions?(): boolean;

  // Icons / site
  getIcon16?(): string;
  getIcon32?(): string;
  getSiteShortName?(): string | null;
}

interface ScriptAction {
  parameters: Record<string, any>;
  condition?: Record<string, any>;
}

declare const actions: {
  getRegistered(): string[];
  create(name: string): ScriptAction | null;
};

//
// ACTION TRACKING (ScriptActionTrackingService)
//

interface ScriptExecutionDetails {
  actionType?: string;
  type?: string;
  status?: string;
  id?: string;
  executionId?: string;
  startedAt?: Date;
  startDate?: Date;
  endedAt?: Date;
  endDate?: Date;
  getActionType?(): string;
  getStatus?(): string;
  getStartedAt?(): Date;
  getExecutionStartDate?(): Date;
  getEndedAt?(): Date;
  getExecutionEndDate?(): Date;
}

interface ScriptActionTrackingService {
  getAllExecutingActions(): ScriptExecutionDetails[];
  getExecutingActions(actionType: string): ScriptExecutionDetails[];
  getExecutingActions(action: ScriptAction): ScriptExecutionDetails[];
  requestActionCancellation(execution: ScriptExecutionDetails): void;
}

declare const actionTrackingService: ScriptActionTrackingService;

interface ScriptSearchResultSet {
  nodes: ScriptNode[];
  meta: Record<string, any>;
}

// Now a constructible class – matches usage: new ScriptPagingDetails(20, 0)
declare class ScriptPagingDetails {
  maxItems: number;
  skipCount: number;
  queryExecutionId?: string;
  constructor(maxItems: number, skipCount: number);
}

declare const search: {
  findNode(reference: string): ScriptNode | null;
  findNode(referenceType: 'node' | 'path', segments: string[]): ScriptNode | null;
  xpathSearch(store: string, query: string): ScriptNode[];
  xpathSearch(query: string): ScriptNode[];
  selectNodes(query: string): ScriptNode[];
  luceneSearch(
    store: string,
    query: string,
    sortBy?: string,
    ascending?: boolean,
    maxResults?: number
  ): ScriptNode[];
  luceneSearch(query: string): ScriptNode[];
  savedSearch(node: ScriptNode | string): ScriptNode[];
  tagSearch(store: string, tag: string): ScriptNode[];
  isValidXpathQuery(query: string): boolean;
  ISO9075Encode(value: string): string;
  ISO9075Decode(value: string): string;
  query(definition: {
    query: string;
    language?: string;
    store?: string;
    defaultOperator?: string;
    page?: { maxItems?: number; skipCount?: number };
  }): ScriptNode[];
  queryResultSet(definition: Record<string, any>): ScriptSearchResultSet;
  getSearchSubsystem(): string;
};

//
// PEOPLE (PersonService wrapper)
//

declare const people: {
  // Person management
  getPerson(username: string): ScriptNode | null;

  getPersonFullName(username: string): string | null;
  createPerson(username: string): ScriptNode | null;

  createPerson(
    username: string | null,
    firstName: string,
    lastName: string,
    emailAddress: string
  ): ScriptNode | null;

  createPerson(
    username: string | null,
    firstName: string,
    lastName: string,
    emailAddress: string,
    password: string,
    setAccountEnabled: boolean
  ): ScriptNode | null;

  createPerson(
    username: string | null,
    firstName: string,
    lastName: string,
    emailAddress: string,
    password: string,
    setAccountEnabled: boolean,
    notifyByEmail: boolean
  ): ScriptNode | null;

  deletePerson(username: string): void;

  // Account management
  disableAccount(username: string): void;
  enableAccount(username: string): void;
  isAccountEnabled(username: string): boolean;

  // Password management
  changePassword(oldPassword: string, newPassword: string): void;
  setPassword(username: string, newPassword: string): void;

  // Quota
  setQuota(person: ScriptNode, quotaBytes: string): void;

  // Search people
  getPeople(
    filter: string | null,
    maxResults?: number,
    sortBy?: string,
    sortAsc?: boolean
  ): ScriptNode[];

  getPeoplePaging(
    filter: string | null,
    pagingDetails: ScriptPagingDetails,
    sortBy?: string,
    sortAsc?: boolean
  ): ScriptNode[];

  // Groups (cm:authority nodes as ScriptNode)
  getGroup(groupName: string): ScriptNode | null;
  createGroup(shortName: string): ScriptNode | null;
  createGroup(parentGroup: ScriptNode, shortName: string): ScriptNode | null;
  deleteGroup(group: ScriptNode): void;

  // Group membership
  addAuthority(group: ScriptNode, authority: ScriptNode): void;
  removeAuthority(group: ScriptNode, authority: ScriptNode): void;
  getMembers(group: ScriptNode, recurse?: boolean): ScriptNode[];
  getContainerGroups(person: ScriptNode): ScriptNode[];

  // Capabilities
  isAdmin(person: ScriptNode): boolean;
  isGuest(person: ScriptNode): boolean;
  getCapabilities(person: ScriptNode): Record<string, boolean>;
  getImmutableProperties(username: string): Record<string, boolean>;
};

//
// GROUPS (ScriptAuthorityService)
// Matches methods used in groups.js examples
//

interface ScriptGroup {
  shortName: string;
  fullName: string;
  displayName: string;
}

interface ScriptUser {
  // Java fields
  userName: string;
  shortName: string;
  fullName: string;
  displayName: string; // same as fullName in constructor
  personNodeRef: string | { toString(): string }; // private in Java but exposed via getter logic if needed, keeping simple for DSL

  // Methods
  getAuthorityType(): string; // ScriptAuthorityType.USER
  getShortName(): string;
  getFullName(): string;
  getUserName(): string;
  getDisplayName(): string;
  getPersonNodeRef(): string | { toString(): string }; // Returns NodeRef
  getPerson(): ScriptNode; // Returns ScriptNode
  getZones(): string[]; // from Authority interface
}

interface ScriptAuthorityService {
  // Root groups (no parent)
  searchRootGroupsInZone(
    displayNamePattern: string,
    zone: string,
    maxItems?: number,
    skipCount?: number
  ): ScriptGroup[];
  searchRootGroups(displayNamePattern: string): ScriptGroup[];
  getAllRootGroups(): ScriptGroup[];
  getAllRootGroups(maxItems: number, skipCount: number): ScriptGroup[];
  getAllRootGroups(paging: ScriptPagingDetails): ScriptGroup[];
  getAllRootGroupsInZone(zone: string): ScriptGroup[];
  getAllRootGroupsInZone(zone: string, maxItems: number, skipCount: number): ScriptGroup[];
  getAllRootGroupsInZone(zone: string, paging: ScriptPagingDetails, sortBy?: string): ScriptGroup[];

  // General group list/search
  getGroups(filter: string | null, paging: ScriptPagingDetails): ScriptGroup[];
  getGroups(filter: string | null, paging: ScriptPagingDetails, sortBy: string): ScriptGroup[];
  getGroupsInZone(
    filter: string | null,
    zone: string | null,
    paging: ScriptPagingDetails,
    sortBy?: string,
    sortAsc?: boolean
  ): ScriptGroup[];

  // Lookup + create
  getGroup(shortName: string): ScriptGroup | null;
  getGroupForFullAuthorityName(fullAuthorityName: string): ScriptGroup | null;
  createRootGroup(shortName: string, displayName: string): ScriptGroup;

  // Legacy-style search by shortName pattern
  searchGroups(shortNameFilter: string): ScriptGroup[];
  searchGroups(
    shortNameFilter: string,
    zone: string | null,
    maxItems: number,
    skipCount: number
  ): ScriptGroup[];
  searchGroupsInZone(
    shortNameFilter: string,
    zone: string,
    maxItems: number,
    skipCount: number
  ): ScriptGroup[];

  // Users via AuthorityService / PersonService
  getUser(username: string): ScriptUser | null;
  searchUsers(
    nameFilter: string,
    paging: ScriptPagingDetails,
    sortBy: 'firstName' | 'lastName' | 'userName' | string
  ): ScriptUser[];
}

declare const groups: ScriptAuthorityService;

//
// SITES (SiteService)
//

interface ScriptSite {
  shortName: string;
  title: string;
  description: string;
  visibility: string;
  sitePreset?: string;
  save(): void;
  getContainer(componentId: string): ScriptNode | null;
}

declare const siteService: {
  // Create sites
  createSite(
    sitePreset: string,
    shortName: string,
    title: string,
    description?: string,
    visibility?: string
  ): ScriptSite;
  createSite(
    sitePreset: string,
    shortName: string,
    title: string,
    description: string,
    visibility: string,
    siteType: string
  ): ScriptSite;
  createSite(
    sitePreset: string,
    shortName: string,
    title: string,
    description: string,
    isPublic: boolean
  ): ScriptSite;

  // Check existence / perms
  hasSite(shortName: string): boolean;
  hasCreateSitePermissions(): boolean;
  isSiteManager(shortName: string): boolean;

  // Get sites
  getSite(shortName: string): ScriptSite | null;
  getSiteInfo(shortName: string): ScriptSite | null;
  getSites(
    filter: string | null,
    sitePresetFilter: string | null,
    maxResults: number
  ): ScriptSite[];
  listSites(
    filter?: string | null,
    sitePresetFilter?: string | null,
    maxResults?: number
  ): ScriptSite[];
  findSites(filter: string, maxResults: number): ScriptSite[];
  findSites(filter: string, sitePresetFilter: string | null, maxResults: number): ScriptSite[];

  // User sites
  listUserSites(username: string, maxResults?: number): ScriptSite[];

  // Roles
  listSiteRoles(shortName?: string): string[];

  // Permissions cleanup
  cleanSitePermissions(nodeRef: any): void;
  cleanSitePermissions(node: ScriptNode): void;
};

//
// RENDITIONS (RenditionService)
//

interface ScriptRenditionDefinition {
  renditionDefinition: {
    renditionName: string;
  };
  engineDefinition: {
    name: string;
  };
}

declare const renditionService: {
  render(source: ScriptNode, renditionDefQName: string): ScriptNode;
  render(source: ScriptNode, definition: ScriptRenditionDefinition): ScriptNode;
  createRenditionDefinition(
    renditionName: string,
    renderingEngineName: string
  ): ScriptRenditionDefinition;
  getRenditions(source: ScriptNode, mimeTypePrefix?: string): ScriptNode[];
  getRenditionByName(source: ScriptNode, renditionName: string): ScriptNode | null;
};

//
// CLASSIFICATION (Classification root object)
//

interface CategoryNode {
  name: string;
  nodeRef: string | { toString(): string };
}

interface ScriptCategoryTag {
  getCategory(): CategoryNode | null;
  getFrequency(): number;
}

interface ScriptClassification {
  getAllClassificationAspects(): string[];
  getRootCategories(
    aspect: string,
    filter?: string | null,
    maxItems?: number,
    skipCount?: number
  ): CategoryNode[];
  createRootCategory(aspect: string, name: string): CategoryNode;
  getAllCategoryNodes(aspect: string): CategoryNode[];
  getCategory(categoryNodeRef: string | ScriptNode): CategoryNode | null;
  getCategoryUsage(aspect: string, count: number): ScriptCategoryTag[];
}

declare const classification: ScriptClassification;

//
// appUtils (ApplicationScriptUtils)
//

interface ApplicationScriptUtils {
  toJSON(node: ScriptNode, useShortQNames?: boolean): string;
  getDownloadAPIUrl(node: ScriptNode): string;
}

declare const appUtils: ApplicationScriptUtils;

//
// UTILS (various helpers from ApplicationScriptUtils / NodeLocator / etc.)
//

declare const utils: {
  // Display and formatting
  displayPath(node: ScriptNode): string;
  pad(str: string, length: number): string;

  // Node resolution
  getNodeFromString(nodeRefString: string): ScriptNode;
  resolveNodeReference(reference: string): ScriptNode | null;

  // Type conversion
  toBoolean(str: string): boolean;

  // Module checks
  moduleInstalled(moduleName: string): boolean;

  // Date/time
  toISO8601(millisOrDate: number | Date): string;
  fromISO8601(isoString: string): Date;

  // QName conversion
  shortQName(longQName: string): string;
  longQName(shortQName: string): string;

  // Paging
  createPaging(maxItems: number, skipCount: number, queryExecutionId?: string): ScriptPagingDetails;
  createPaging(argsMap: Record<string, string>): ScriptPagingDetails;

  // Rules
  disableRules(): void;
  enableRules(): void;

  // Locale
  setLocale(localeString: string): void;
  getLocale(): string;
};

//
// Misc repo globals
//

declare const companyhome: ScriptNode;
declare const userhome: ScriptNode;
declare const roothome: ScriptNode;
// declare const person: ScriptUser; // Removed to avoid global conflict

declare const document: ScriptNode;
declare const script: ScriptNode | undefined;
declare const config: Record<string, any>;
declare const session: Record<string, any>;

// Minimal NodeRef type for examples that use "new NodeRef(...)"
declare const NodeRef: {
  new (nodeRef: string): any;
};

// Rhino / console helpers
declare function print(...args: unknown[]): void;

// Java "Packages" is available in secure scripts; keep it loose.
declare const Packages: any;

// Java package roots
declare const java: any;
declare const javax: any;
declare const org: any;
declare const com: any;
