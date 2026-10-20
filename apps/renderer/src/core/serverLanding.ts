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

import type { PageKey } from '@/core/store/keys';
import type { CapabilityProfile } from '@app/contracts';
import { Feature, isFeatureAvailable } from '@app/contracts';

export type AlfrescoLandingPage = Extract<PageKey, 'jsconsole' | 'agentPage'>;

const PRESERVED_ALFRESCO_PAGES: ReadonlySet<PageKey> = new Set([
  'text-editor',
  'agentPage',
  'insights',
]);

/**
 * Default page when entering an Alfresco server.
 * JS Console is admin/module-gated; everyone else lands on a new Agent chat.
 */
export function getAlfrescoLandingPage(
  profile: CapabilityProfile | null | undefined
): AlfrescoLandingPage {
  return isFeatureAvailable(profile, Feature.JsConsole) ? 'jsconsole' : 'agentPage';
}

/**
 * Whether the current page can stay active after switching to an Alfresco server.
 * JS Console is only preserved when that server actually exposes it — NodeRef
 * space always has JS Console, so preserving blindly would strand non-admins
 * on the unavailable page.
 */
export function shouldPreservePageOnAlfrescoServer(
  page: PageKey,
  profile: CapabilityProfile | null | undefined
): boolean {
  if (page === 'jsconsole') {
    return isFeatureAvailable(profile, Feature.JsConsole);
  }
  return PRESERVED_ALFRESCO_PAGES.has(page);
}
