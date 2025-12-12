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

import { useEffect } from 'react';
import { Group, Text } from '@mantine/core';
import { IconFile, IconFolder } from '@tabler/icons-react';
import { RenderTreeNodePayload, Tree, useTree } from '@mantine/core';
import { TreeNode } from '@/types/menu';

interface TreeViewProps {
  data: TreeNode[];
  onNodeSelect?: (node: TreeNode) => void;
}

function findNode(data: TreeNode[], value: string): TreeNode | null {
  for (const node of data) {
    if (node.value === value) return node;
    if (node.children) {
      const child = findNode(node.children as TreeNode[], value);
      if (child) return child;
    }
  }
  return null;
}

export function TreeView({ data, onNodeSelect }: TreeViewProps) {
  const tree = useTree({ multiple: false });
  const selectedValue = tree.selectedState[0];

  useEffect(() => {
    if (!selectedValue) return;
    const node = findNode(data, selectedValue);
    if (node) {
      onNodeSelect?.(node);
    }
  }, [selectedValue, data, onNodeSelect]);

  const renderNode = ({ node, hasChildren, elementProps }: RenderTreeNodePayload) => (
    <Group gap="xs" {...elementProps}>
      {hasChildren ? <IconFolder size={14} /> : <IconFile size={14} />}
      <Text size="sm">{node.label}</Text>
    </Group>
  );

  return <Tree data={data} tree={tree} selectOnClick renderNode={renderNode} levelOffset="md" />;
}
