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

import { Extension } from '@tiptap/core';
import { Node as ProsemirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface ConstraintHighlighterOptions {
  HTMLAttributes: Record<string, any>;
}

const CONSTRAINT_REGEX = /(?:^|\s)((?:type|aspect|prop|site|path):[^\s]*)/gi;

function findDecorations(doc: ProsemirrorNode, className: string): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    const text = node.text;
    let match;

    // Reset regex state
    CONSTRAINT_REGEX.lastIndex = 0;

    while ((match = CONSTRAINT_REGEX.exec(text)) !== null) {
      // match[1] is the actual token without the leading space (if any)
      const token = match[1];
      // The start index of the token inside the matched string
      const tokenStartInMatch = match[0].indexOf(token);

      const start = pos + match.index + tokenStartInMatch;
      const end = start + token.length;

      decorations.push(
        Decoration.inline(start, end, {
          class: className,
        })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const ConstraintHighlighter = Extension.create<ConstraintHighlighterOptions>({
  name: 'constraintHighlighter',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'agent-constraint-pill',
      },
    };
  },

  addProseMirrorPlugins() {
    const className = this.options.HTMLAttributes.class;

    return [
      new Plugin({
        key: new PluginKey('constraintHighlighter'),
        state: {
          init(_, { doc }) {
            return findDecorations(doc, className);
          },
          apply(tr, old) {
            if (!tr.docChanged) {
              return old.map(tr.mapping, tr.doc);
            }
            return findDecorations(tr.doc, className);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
