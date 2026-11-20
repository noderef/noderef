/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from 'zod';

/**
 * Shared capability model for Alfresco servers.
 *
 * `isAdmin` on Server is a denormalized copy of `profile.isAdmin` and must be
 * written together with this profile. UI and new backend code use
 * {@link hasCapability} / {@link isFeatureAvailable} — not `server.isAdmin`.
 */
export const CapabilitySchema = z.enum(['admin', 'jsConsole', 'supportTools', 'nodeBrowser']);
export type Capability = z.infer<typeof CapabilitySchema>;

export const CapabilityProfileSchema = z.object({
  isAdmin: z.boolean(),
  jsConsole: z.boolean(),
  supportTools: z.boolean(),
  nodeBrowser: z.boolean(),
  status: z.enum(['ok', 'unknown']),
  checkedAt: z.string().nullable(),
});
export type CapabilityProfile = z.infer<typeof CapabilityProfileSchema>;

export const RESTRICTED_PROFILE: CapabilityProfile = {
  isAdmin: false,
  jsConsole: false,
  supportTools: false,
  nodeBrowser: false,
  status: 'unknown',
  checkedAt: null,
};

export const FULL_ADMIN_PROFILE: CapabilityProfile = {
  isAdmin: true,
  jsConsole: true,
  supportTools: true,
  nodeBrowser: true,
  status: 'ok',
  checkedAt: '1970-01-01T00:00:00.000Z',
};

export function createOkProfile(
  flags: Partial<Pick<CapabilityProfile, 'isAdmin' | 'jsConsole' | 'supportTools' | 'nodeBrowser'>>
): CapabilityProfile {
  const isAdmin = flags.isAdmin ?? false;
  return {
    isAdmin,
    jsConsole: flags.jsConsole ?? false,
    supportTools: flags.supportTools ?? false,
    nodeBrowser: flags.nodeBrowser ?? isAdmin,
    status: 'ok',
    checkedAt: new Date().toISOString(),
  };
}

export enum Feature {
  RepoBrowser = 'RepoBrowser',
  NodeBrowser = 'NodeBrowser',
  SystemTree = 'SystemTree',
  JsConsole = 'JsConsole',
  Logs = 'Logs',
  UsersGroups = 'UsersGroups',
  ModelExplorer = 'ModelExplorer',
  RepoAdmin = 'RepoAdmin',
  ServerUsage = 'ServerUsage',
  AgentScripts = 'AgentScripts',
  Search = 'Search',
  Agent = 'Agent',
  Insights = 'Insights',
}

export const featureRequirements: Record<Feature, Capability[]> = {
  [Feature.RepoBrowser]: [],
  [Feature.Search]: [],
  [Feature.Agent]: [],
  [Feature.Insights]: [],
  // Node Browser uses REST Nodes API when slingshot is unavailable.
  [Feature.NodeBrowser]: [],
  [Feature.SystemTree]: ['nodeBrowser'],
  [Feature.JsConsole]: ['jsConsole'],
  [Feature.AgentScripts]: ['jsConsole'],
  [Feature.Logs]: ['supportTools'],
  [Feature.UsersGroups]: ['admin'],
  [Feature.ModelExplorer]: ['admin'],
  [Feature.RepoAdmin]: ['admin'],
  [Feature.ServerUsage]: ['admin'],
};

function capabilityFlag(profile: CapabilityProfile, capability: Capability): boolean {
  switch (capability) {
    case 'admin':
      return profile.isAdmin;
    case 'jsConsole':
      return profile.jsConsole;
    case 'supportTools':
      return profile.supportTools;
    case 'nodeBrowser':
      return profile.nodeBrowser;
    default:
      return false;
  }
}

/**
 * Unknown / missing profiles are restrictive. Features with no requirements
 * stay available (Alfresco ACLs still apply per call).
 */
export function hasCapability(
  profile: CapabilityProfile | null | undefined,
  capability: Capability
): boolean {
  if (!profile || profile.status === 'unknown') {
    return false;
  }
  return capabilityFlag(profile, capability) === true;
}

export function isFeatureAvailable(
  profile: CapabilityProfile | null | undefined,
  feature: Feature
): boolean {
  const requirements = featureRequirements[feature] ?? [];
  if (requirements.length === 0) {
    return true;
  }
  return requirements.every(capability => hasCapability(profile, capability));
}

export function parseCapabilityProfile(value: unknown): CapabilityProfile | null {
  const parsed = CapabilityProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
