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

import { Box } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from './agentMarkdownRenderer';

const MARKDOWN_THROTTLE_MS = 80;

interface StreamingAgentMessageProps {
  text: string;
  copyLabel: string;
  copiedLabel: string;
}

export function StreamingAgentMessage({
  text,
  copyLabel,
  copiedLabel,
}: StreamingAgentMessageProps) {
  const [renderedHtml, setRenderedHtml] = useState('');
  const pendingTextRef = useRef(text);
  const timeoutRef = useRef<number | null>(null);
  const copyLabelRef = useRef(copyLabel);
  const copiedLabelRef = useRef(copiedLabel);

  copyLabelRef.current = copyLabel;
  copiedLabelRef.current = copiedLabel;
  pendingTextRef.current = text;

  useEffect(() => {
    const flush = () => {
      timeoutRef.current = null;
      setRenderedHtml(
        renderMarkdown(pendingTextRef.current, {
          copyLabel: copyLabelRef.current,
          copiedLabel: copiedLabelRef.current,
        })
      );
    };

    if (timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(flush, MARKDOWN_THROTTLE_MS);
    }
  }, [text, copyLabel, copiedLabel]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    []
  );

  if (!text.trim()) {
    return null;
  }

  return (
    <Box
      className="agent-markdown agent-message-group"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
      style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.95 }}
    />
  );
}
