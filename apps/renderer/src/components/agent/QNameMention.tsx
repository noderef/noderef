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
import { mergeAttributes, type Range } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { SuggestionMatch } from '@tiptap/suggestion';

function QNameMentionView(props: any) {
  return (
    <NodeViewWrapper
      as="span"
      style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }}
    >
      <Badge
        component="span"
        size="md"
        variant="light"
        color="teal"
        style={{ display: 'inline-flex', verticalAlign: 'middle' }}
        {...props.node.attrs}
      >
        {props.node.attrs.label}
      </Badge>
    </NodeViewWrapper>
  );
}

/**
 * Custom suggestion match finder for namespace-colon patterns.
 * Detects tokens like "cm:", "cm:content", "sys:lo" near the caret.
 */
export function findQNameSuggestionMatch(config: {
  char: string;
  allowSpaces: boolean;
  allowedPrefixes: string[] | null;
  startOfLine: boolean;
  $position: any;
}): SuggestionMatch {
  const { $position } = config;

  // Get text from start of current text block up to the cursor.
  // Use textBetween instead of textContent.slice so that inline nodes (badges)
  // are represented as single characters, keeping length aligned with ProseMirror offsets.
  const textBefore = $position.parent.textBetween(0, $position.parentOffset, undefined, '\ufffc');

  // Match a namespace:localname pattern at end of text
  // The namespace must start with a letter and contain only word chars + hyphens
  // After the colon, there can be optional local name chars
  const match = textBefore.match(/(?:^|[\s(,;])([a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_-]*)$/);

  if (!match) {
    return null;
  }

  const fullMatch = match[1]; // e.g. "cm:content" or "cm:"
  const matchStart = textBefore.length - fullMatch.length;

  // Return the query as the full match (e.g. "cm:content")
  // The range covers the entire matched text so it gets replaced on selection
  const from = $position.start() + matchStart;
  const to = $position.start() + textBefore.length;

  return {
    range: { from, to } as Range,
    query: fullMatch,
    text: fullMatch,
  };
}

export const QNameMention = Mention.extend({
  name: 'qnameMention',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {};
          }
          return { 'data-id': attributes.id };
        },
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
        renderHTML: attributes => {
          if (!attributes.label) {
            return {};
          }
          return { 'data-label': attributes.label };
        },
      },
      type: {
        default: null,
        parseHTML: element => element.getAttribute('data-qname-type'),
        renderHTML: attributes => {
          if (!attributes.type) {
            return {};
          }
          return { 'data-qname-type': attributes.type };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="qnameMention"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'qnameMention' }, this.options.HTMLAttributes, HTMLAttributes),
      node.attrs.label,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QNameMentionView);
  },
});
