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

import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { clipboard } from '@neutralinojs/lib';

export const readClipboardText = async (event?: ClipboardEvent): Promise<string | null> => {
  const clipboardData = event?.clipboardData || (window as any).clipboardData;
  const textFromEvent = clipboardData?.getData?.('text/plain');
  if (textFromEvent) return textFromEvent;

  if (isNeutralinoMode()) {
    try {
      await ensureNeutralinoReady();
      const neutralinoText = await clipboard.readText();
      if (neutralinoText) return neutralinoText;
    } catch (neutralinoError) {
      console.error('Neutralino clipboard read failed:', neutralinoError);
    }
  }

  if (navigator.clipboard?.readText) {
    try {
      const navigatorText = await navigator.clipboard.readText();
      if (navigatorText) return navigatorText;
    } catch {
      // Ignore and fall through
    }
  }

  return null;
};

export const writeClipboardText = async (
  text: string,
  event?: ClipboardEvent
): Promise<boolean> => {
  if (!text) return false;

  const stopEvent = () => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const clipboardData = event?.clipboardData;
  if (clipboardData) {
    clipboardData.setData('text/plain', text);
    stopEvent();
    return true;
  }

  if (isNeutralinoMode()) {
    try {
      await ensureNeutralinoReady();
      await clipboard.writeText(text);
      stopEvent();
      return true;
    } catch (neutralinoError) {
      console.error('Neutralino clipboard write failed:', neutralinoError);
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      stopEvent();
      return true;
    } catch {
      // Ignore and fall through
    }
  }

  return false;
};
