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

import { describe, expect, it } from 'vitest';
import { getNodeDisplayName, isNodeRefProtocolPrefix, parseNodeRefInput } from './nodeRef';

const UUID = '6f73de1b-d3b4-11db-80cb-112e6c2ea048';
const FULL = `workspace://SpacesStore/${UUID}`;

describe('parseNodeRefInput', () => {
  it('parses a full nodeRef URI', () => {
    expect(parseNodeRefInput(FULL)).toEqual({
      protocol: 'workspace',
      storeId: 'SpacesStore',
      nodeId: UUID,
      nodeRef: FULL,
    });
  });

  it('strips surrounding quotes and whitespace', () => {
    expect(parseNodeRefInput(`  "${FULL}"  `)).toEqual({
      protocol: 'workspace',
      storeId: 'SpacesStore',
      nodeId: UUID,
      nodeRef: FULL,
    });
  });

  it('normalizes slash-form nodeRefs', () => {
    expect(parseNodeRefInput(`workspace/SpacesStore/${UUID}`)).toEqual({
      protocol: 'workspace',
      storeId: 'SpacesStore',
      nodeId: UUID,
      nodeRef: FULL,
    });
  });

  it('treats a bare UUID as workspace://SpacesStore/<uuid>', () => {
    expect(parseNodeRefInput(UUID)).toEqual({
      protocol: 'workspace',
      storeId: 'SpacesStore',
      nodeId: UUID,
      nodeRef: FULL,
    });
  });

  it('strips an optional noderef: prefix', () => {
    expect(parseNodeRefInput(`noderef:${UUID}`)?.nodeId).toBe(UUID);
    expect(parseNodeRefInput(`nodeRef: ${FULL}`)?.nodeRef).toBe(FULL);
  });

  it('returns null for regular search terms', () => {
    expect(parseNodeRefInput('cm:name:test')).toBeNull();
    expect(parseNodeRefInput('type:cm:content')).toBeNull();
    expect(parseNodeRefInput('rapport')).toBeNull();
  });
});

describe('isNodeRefProtocolPrefix', () => {
  it('detects store protocol prefixes', () => {
    expect(isNodeRefProtocolPrefix('workspace://')).toBe(true);
    expect(isNodeRefProtocolPrefix('workspace:/')).toBe(true);
    expect(isNodeRefProtocolPrefix('archive://SpacesStore/')).toBe(true);
  });

  it('does not treat property prefixes as nodeRefs', () => {
    expect(isNodeRefProtocolPrefix('cm:')).toBe(false);
    expect(isNodeRefProtocolPrefix('workspace:')).toBe(false);
  });
});

describe('getNodeDisplayName', () => {
  it('prefers cm:name over the Slingshot QName', () => {
    expect(
      getNodeDisplayName({
        name: {
          name: '{http://www.alfresco.org/model/content/1.0}report.csv',
          prefixedName: 'cm:report.csv',
        },
        properties: [
          {
            name: { prefixedName: 'cm:name' },
            values: [{ value: 'report_09af23ae.csv' }],
          },
        ],
      })
    ).toBe('report_09af23ae.csv');
  });

  it('uses cm:userName for people', () => {
    expect(
      getNodeDisplayName({
        type: { prefixedName: 'cm:person' },
        name: { prefixedName: 'cm:admin' },
        properties: [
          {
            name: { prefixedName: 'cm:userName' },
            values: [{ value: 'admin' }],
          },
        ],
      })
    ).toBe('admin');
  });

  it('strips Clark notation when cm:name is missing', () => {
    expect(
      getNodeDisplayName({
        name: {
          name: '{http://www.alfresco.org/model/content/1.0}company_home',
          prefixedName: 'app:company_home',
        },
      })
    ).toBe('company_home');
  });
});
