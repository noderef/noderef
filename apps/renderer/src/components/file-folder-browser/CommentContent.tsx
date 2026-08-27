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

/**
 * Share and ADF store comments as HTML produced by a WYSIWYG editor, but the
 * REST API also returns plain text for comments created elsewhere.
 *
 * Repository content is untrusted, so the markup is never injected as raw HTML.
 * It is parsed into an inert document and rebuilt as React elements from a tag
 * allowlist, which drops scripts, event handlers and unsafe URLs by construction.
 */

import { Anchor, Text } from '@mantine/core';
import { createElement, Fragment, type CSSProperties, type ReactNode } from 'react';

/** Rendered as-is. Headings are downgraded so a comment cannot dominate the panel. */
const ALLOWED_TAGS: Record<string, string> = {
  P: 'p',
  BR: 'br',
  B: 'strong',
  STRONG: 'strong',
  I: 'em',
  EM: 'em',
  U: 'u',
  S: 's',
  STRIKE: 's',
  DEL: 's',
  UL: 'ul',
  OL: 'ol',
  LI: 'li',
  BLOCKQUOTE: 'blockquote',
  PRE: 'pre',
  CODE: 'code',
  SPAN: 'span',
  DIV: 'div',
  H1: 'h5',
  H2: 'h5',
  H3: 'h6',
  H4: 'h6',
  H5: 'h6',
  H6: 'h6',
};

/** Dropped along with their subtree; anything else unknown is unwrapped instead. */
const DROPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'FRAME',
  'FRAMESET',
  'OBJECT',
  'EMBED',
  'APPLET',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'SVG',
  'MATH',
  'TEMPLATE',
  'NOSCRIPT',
]);

const TAG_STYLES: Record<string, CSSProperties> = {
  p: { margin: '0 0 4px' },
  ul: { margin: '0 0 4px', paddingLeft: 18 },
  ol: { margin: '0 0 4px', paddingLeft: 18 },
  pre: { margin: '0 0 4px', whiteSpace: 'pre-wrap' },
  blockquote: {
    margin: '0 0 4px',
    paddingLeft: 8,
    borderLeft: '2px solid var(--mantine-color-default-border)',
  },
  h5: { margin: '0 0 4px' },
  h6: { margin: '0 0 4px' },
};

const isSafeHref = (href: string): boolean => /^(?:https?:|mailto:)/i.test(href.trim());

const toReactNode = (node: Node, key: number): ReactNode => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as Element;
  const tagName = element.tagName.toUpperCase();
  if (DROPPED_TAGS.has(tagName)) {
    return null;
  }

  const children = Array.from(element.childNodes).map((child, index) => toReactNode(child, index));

  if (tagName === 'A') {
    const href = element.getAttribute('href') ?? '';
    // An unsafe scheme keeps the link text but loses the link.
    if (!isSafeHref(href)) {
      return <Fragment key={key}>{children}</Fragment>;
    }
    return (
      <Anchor key={key} href={href} target="_blank" rel="noopener noreferrer" inherit>
        {children}
      </Anchor>
    );
  }

  const mapped = ALLOWED_TAGS[tagName];
  if (!mapped) {
    return <Fragment key={key}>{children}</Fragment>;
  }
  if (mapped === 'br') {
    return <br key={key} />;
  }

  return createElement(mapped, { key, style: TAG_STYLES[mapped] }, children);
};

export function CommentContent({ content }: { content: string }) {
  // DOMParser builds an inert document: no scripts run and no resources load.
  const body = new DOMParser().parseFromString(content, 'text/html').body;
  const hasMarkup = Array.from(body.childNodes).some(node => node.nodeType === Node.ELEMENT_NODE);

  if (!hasMarkup) {
    return (
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {body.textContent ?? ''}
      </Text>
    );
  }

  return (
    <Text size="sm" component="div" style={{ wordBreak: 'break-word' }}>
      {Array.from(body.childNodes).map((node, index) => toReactNode(node, index))}
    </Text>
  );
}
