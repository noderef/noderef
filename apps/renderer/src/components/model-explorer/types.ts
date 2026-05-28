/**
 * Copyright 2025-2026 NodeRef
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

export interface ModelProperty {
  name: string;
  dataType?: string;
  mandatory?: boolean;
  multiValued?: boolean;
  defaultValue?: string;
  constraints?: string[];
  indexed?: boolean;
  tokenised?: boolean;
  facetable?: boolean;
}

export interface ModelAssociation {
  name: string;
  targetClass?: string;
  sourceClass?: string;
  isChild?: boolean;
  isPeer?: boolean;
}

export interface SchemaRecord {
  id: string;
  label: string;
  kind: 'type' | 'aspect';
  namespace: string;
  isSystem: boolean;
  parent?: string;
  properties: ModelProperty[];
  associations: ModelAssociation[];
  mandatoryAspects: string[];
  description?: string;
}

export type SchemaNodeData = {
  record: SchemaRecord;
};

export type EdgeKind = 'inheritance' | 'association' | 'mandatoryAspect';

export type SchemaEdgeData = {
  kind: EdgeKind;
  label?: string;
};

/** Alfresco built-in / platform namespaces (hidden unless “Show system models” is on). */
const SYSTEM_NAMESPACES = [
  'abs',
  'acm',
  'act',
  'aos',
  'app',
  'audio',
  'blg',
  'bpm',
  'cg',
  'clf',
  'cm',
  'cmis',
  'cmiscustom',
  'cmisext',
  'cmm',
  'cmp',
  'cs',
  'd',
  'dl',
  'dod',
  'download',
  'dp',
  'dynsc',
  'emailserver',
  'exif',
  'facebook',
  'fm',
  'flickr',
  'forum',
  'hwf',
  'ia',
  'imap',
  'imwf',
  'inwf',
  'iptcxmp',
  'jsc',
  'lnk',
  'linkedin',
  'pub',
  'qshare',
  'rc',
  'rma',
  'rme',
  'rmc',
  'rmr',
  'rmv',
  'rmwf',
  'resetpasswordwf',
  'rn',
  'rule',
  'sc',
  'sec',
  'slideshare',
  'smf',
  'srft',
  'st',
  'surf',
  'sync',
  'sys',
  'trx',
  'twitter',
  'usr',
  'ver',
  'ver2',
  'view',
  'wca',
  'webdav',
  'wf',
  'wpsmail-v2',
  'youtube',
] as const;

export function isSystemNamespace(namespace: string): boolean {
  const normalized = namespace.toLowerCase().replace(/:$/, '');
  return (SYSTEM_NAMESPACES as readonly string[]).includes(normalized);
}
