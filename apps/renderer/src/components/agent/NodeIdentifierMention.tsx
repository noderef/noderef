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

import { Badge } from '@mantine/core';
import { mergeAttributes } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

function NodeMentionView(props: any) {
  return (
    <NodeViewWrapper
      as="span"
      style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }}
    >
      <Badge
        component="span"
        size="md"
        variant="light"
        color="blue"
        style={{ display: 'inline-flex', verticalAlign: 'middle' }}
        {...props.node.attrs}
      >
        @{props.node.attrs.label}
      </Badge>
    </NodeViewWrapper>
  );
}

export const NodeIdentifierMention = Mention.extend({
  name: 'nodeMention',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {};
          }
          return {
            'data-id': attributes.id,
          };
        },
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
        renderHTML: attributes => {
          if (!attributes.label) {
            return {};
          }
          return {
            'data-label': attributes.label,
          };
        },
      },
      type: {
        default: null,
        parseHTML: element => element.getAttribute('data-type'),
        renderHTML: attributes => {
          if (!attributes.type) {
            return {};
          }
          return {
            'data-type': attributes.type,
          };
        },
      },
      path: {
        default: null,
        parseHTML: element => element.getAttribute('data-path'),
        renderHTML: attributes => {
          if (!attributes.path) {
            return {};
          }
          return {
            'data-path': attributes.path,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="nodeMention"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'nodeMention' }, this.options.HTMLAttributes, HTMLAttributes),
      `@${node.attrs.label}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NodeMentionView);
  },
});
