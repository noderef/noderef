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
import { mapNodeEntryToBrowserNode } from '../../src/rpc/backend/helpers.js';

function propertyValue(
  mapped: Record<string, unknown>,
  prefixedName: string
): unknown {
  const properties = mapped.properties as Array<{
    name: { prefixedName: string };
    values: Array<{ value: unknown }>;
  }>;
  return properties.find(property => property.name.prefixedName === prefixedName)?.values?.[0]
    ?.value;
}

describe('mapNodeEntryToBrowserNode', () => {
  it('maps a Nodes API entry onto the slingshot-shaped DTO', () => {
    const mapped = mapNodeEntryToBrowserNode(
      {
        id: 'abc-123',
        name: 'Report.pdf',
        nodeType: 'cm:content',
        parentId: 'parent-1',
        aspectNames: ['cm:titled'],
        path: { name: '/Company Home/Shared' },
        properties: { 'cm:title': 'Quarterly' },
        permissions: {
          isInheritanceEnabled: true,
          locallySet: [{ name: 'Consumer', authorityId: 'GROUP_EVERYONE', accessStatus: 'ALLOWED' }],
        },
      },
      [{ entry: { id: 'child-1', name: 'Child', nodeType: 'cm:folder' } }]
    );

    expect(mapped.nodeRef).toBe('workspace://SpacesStore/abc-123');
    expect((mapped.name as { name: string }).name).toBe('Report.pdf');
    expect((mapped.children as unknown[]).length).toBe(1);
    expect((mapped.aspects as unknown[]).length).toBe(1);
    expect((mapped.permissions as { inherit: boolean }).inherit).toBe(true);
  });

  it('fills standard metadata from REST top-level fields', () => {
    const mapped = mapNodeEntryToBrowserNode({
      id: 'abc-123',
      name: 'invite_user_email.ftl',
      nodeType: 'cm:content',
      createdAt: '2024-03-01T10:00:00.000Z',
      modifiedAt: '2025-04-02T11:30:00.000Z',
      createdByUser: { id: 'System', displayName: 'System' },
      modifiedByUser: { id: 'System', displayName: 'System' },
      content: {
        mimeType: 'text/plain',
        sizeInBytes: 2048,
        encoding: 'UTF-8',
      },
      properties: {
        'cm:title': 'invite_user_email.ftl',
        'cm:description': 'Email template for notifying users',
      },
    });

    expect(propertyValue(mapped, 'cm:name')).toBe('invite_user_email.ftl');
    expect(propertyValue(mapped, 'cm:title')).toBe('invite_user_email.ftl');
    expect(propertyValue(mapped, 'cm:created')).toBe('2024-03-01T10:00:00.000Z');
    expect(propertyValue(mapped, 'cm:modified')).toBe('2025-04-02T11:30:00.000Z');
    expect(propertyValue(mapped, 'cm:creator')).toBe('System');
    expect(propertyValue(mapped, 'cm:modifier')).toBe('System');
    expect(propertyValue(mapped, 'cm:content')).toBe(
      'mimetype=text/plain|size=2048|encoding=UTF-8'
    );
  });
});
