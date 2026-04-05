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
 * Agent markdown rendering — code highlighting, language detection,
 * and markdown-to-HTML conversion used by the agent chat UI.
 *
 * Pure utility module with zero React dependencies.
 */

import { marked } from 'marked';

// ── HTML escaping ─────────────────────────────────────────────────────────────

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ── Language normalisation ────────────────────────────────────────────────────

const normalizeFenceLanguage = (langRaw: string | undefined): string => {
  const lang = (langRaw || '').trim().toLowerCase();
  if (!lang) return 'text';
  if (lang === 'js') return 'javascript';
  if (lang === 'ts') return 'typescript';
  if (lang === 'md') return 'markdown';
  if (lang === 'yml') return 'yaml';
  if (lang === 'sh' || lang === 'shell') return 'bash';
  if (lang === 'freemarker' || lang === 'freemarker2' || lang === 'ftl') return 'xml';
  if (lang === 'plaintext' || lang === 'plain' || lang === 'txt') return 'text';
  return lang;
};

const detectCodeLanguageFromContent = (code: string): string => {
  const sample = code.slice(0, 2000);

  if (/^\s*<!doctype html>/i.test(sample) || /<html[\s>]/i.test(sample)) {
    return 'html';
  }
  if (/^\s*<\?xml\b/i.test(sample) || /^\s*<\/?[a-zA-Z_][\w:.-]*[\s>]/m.test(sample)) {
    return 'xml';
  }

  if (/^\s*[{[]/.test(sample)) {
    try {
      JSON.parse(sample);
      return 'json';
    } catch {
      // ignore
    }
  }

  if (
    /\b(?:const|let|var|function|return|if|else|new|try|catch|throw|async|await)\b/.test(sample) ||
    /=>/.test(sample)
  ) {
    if (/\b(?:interface|type|implements|readonly|public|private|protected)\b/.test(sample)) {
      return 'typescript';
    }
    return 'javascript';
  }

  if (/\b(?:select|from|where|join|insert|update|delete|create\s+table)\b/i.test(sample)) {
    return 'sql';
  }

  if (/^\s*[-\w.]+\s*:\s*.+$/m.test(sample) && !/[;{}]/.test(sample)) {
    return 'yaml';
  }

  if (/^\s*#!\/bin\/(ba)?sh/m.test(sample) || /\b(?:echo|fi|done|esac)\b/.test(sample)) {
    return 'bash';
  }

  return 'text';
};

// ── Token-level syntax highlighting ───────────────────────────────────────────

const highlightWithPattern = (
  code: string,
  pattern: RegExp,
  classifier: (match: RegExpExecArray) => string | null
): string => {
  const tokenInlineStyles: Record<string, string> = {
    comment: 'color: var(--agent-code-comment, #6b7280);',
    keyword: 'color: var(--agent-code-keyword, #6d28d9); font-weight: 600;',
    string: 'color: var(--agent-code-string, #047857);',
    number: 'color: var(--agent-code-number, #1d4ed8);',
    property: 'color: var(--agent-code-property, #b45309);',
    tag: 'color: var(--agent-code-tag, #be123c);',
  };

  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(code)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      parts.push(escapeHtml(code.slice(lastIndex, start)));
    }

    const tokenClass = classifier(match);
    const escaped = escapeHtml(match[0]);
    if (tokenClass) {
      const inlineStyle = tokenInlineStyles[tokenClass] || '';
      parts.push(
        `<span class="agent-code-${tokenClass}"${inlineStyle ? ` style="${inlineStyle}"` : ''}>${escaped}</span>`
      );
    } else {
      parts.push(escaped);
    }
    lastIndex = end;
  }

  if (lastIndex < code.length) {
    parts.push(escapeHtml(code.slice(lastIndex)));
  }
  return parts.join('');
};

const highlightCode = (code: string, language: string): string => {
  const lang = normalizeFenceLanguage(language);

  if (lang === 'javascript' || lang === 'typescript') {
    const pattern =
      /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(?:const|let|var|if|else|return|function|for|while|switch|case|break|continue|new|try|catch|throw|class|extends|import|from|export|default|async|await|true|false|null|undefined|typeof|instanceof)\b|\b\d+(?:\.\d+)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'string';
      if (/^\d/.test(m[0])) return 'number';
      return 'keyword';
    });
  }

  if (lang === 'json') {
    const pattern =
      /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'property';
      if (m[2]) return 'string';
      if (/^(true|false|null)$/.test(m[0])) return 'keyword';
      return 'number';
    });
  }

  if (lang === 'xml' || lang === 'html') {
    const pattern = /(<\/?[a-zA-Z][^>]*>)|("(?:\\.|[^"\\])*")/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'tag';
      if (m[2]) return 'string';
      return null;
    });
  }

  if (lang === 'yaml' || lang === 'properties' || lang === 'ini') {
    const pattern =
      /(^\s*[#;][^\n]*$)|(^\s*[a-zA-Z0-9_.-]+\s*[:=])|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b\d+(?:\.\d+)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'property';
      if (m[3]) return 'string';
      return 'number';
    });
  }

  if (lang === 'css' || lang === 'scss' || lang === 'less') {
    const pattern =
      /(\/\*[\s\S]*?\*\/)|([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*\s*(?=\{))|([a-zA-Z-]+\s*:)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b\d+(?:\.\d+)?(?:px|em|rem|%)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'tag';
      if (m[3]) return 'property';
      if (m[4]) return 'string';
      return 'number';
    });
  }

  if (lang === 'sql') {
    const pattern =
      /(--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(?:select|from|where|group|by|order|limit|insert|into|values|update|set|delete|create|table|alter|join|left|right|inner|outer|on|and|or|not|null|as|distinct)\b|\b\d+(?:\.\d+)?\b/gim;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'string';
      if (/^\d/.test(m[0])) return 'number';
      return 'keyword';
    });
  }

  if (lang === 'bash') {
    const pattern =
      /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?|\b(?:if|then|else|fi|for|in|do|done|case|esac|while|function|export)\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'string';
      if (m[0].startsWith('$')) return 'property';
      return 'keyword';
    });
  }

  // markdown/text/csv/tsv fallback
  return escapeHtml(code);
};

// ── Markdown rendering ────────────────────────────────────────────────────────

export const renderMarkdown = (
  md: string,
  options?: { copyLabel?: string; copiedLabel?: string }
): string => {
  const copyLabelRaw = options?.copyLabel?.trim() || 'Copy';
  const copiedLabelRaw = options?.copiedLabel?.trim() || 'Copied';
  const copyLabel = escapeHtml(copyLabelRaw);
  const copiedLabel = escapeHtml(copiedLabelRaw);

  try {
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      const normalizedLang = normalizeFenceLanguage(lang);
      const effectiveLang =
        normalizedLang === 'text' ? detectCodeLanguageFromContent(text) : normalizedLang;
      const highlighted = highlightCode(text, effectiveLang);
      return [
        '<div class="agent-code-block">',
        `<button type="button" class="agent-code-copy-btn" data-agent-code-copy data-copy-label="${copyLabel}" data-copied-label="${copiedLabel}" aria-label="${copyLabel}" title="${copyLabel}">`,
        '<span class="agent-code-copy-icon" aria-hidden="true">',
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '<rect x="9" y="9" width="13" height="13" rx="3" ry="3"></rect>',
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
        '</svg>',
        '</span>',
        '<span class="agent-code-copy-icon-check" aria-hidden="true">',
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M20 6 9 17l-5-5"></path>',
        '</svg>',
        '</span>',
        '</button>',
        `<pre><code class="language-${effectiveLang}">${highlighted}</code></pre>`,
        '</div>',
      ].join('');
    };
    return marked.parse(md, { async: false, breaks: true, gfm: true, renderer }) as string;
  } catch {
    return md;
  }
};
