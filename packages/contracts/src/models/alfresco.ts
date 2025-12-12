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

import { z } from 'zod';

/**
 * Alfresco data models
 * These schemas represent the data structures returned from Alfresco API operations
 */

/**
 * Alfresco User model
 */
export const AlfUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().email().optional(),
});

export type AlfUser = z.infer<typeof AlfUserSchema>;

/**
 * Alfresco Site visibility enum
 */
export const AlfSiteVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE', 'MODERATED']);

export type AlfSiteVisibility = z.infer<typeof AlfSiteVisibilitySchema>;

/**
 * Alfresco Site model
 */
export const AlfSiteSchema = z.object({
  id: z.string(),
  title: z.string(),
  visibility: AlfSiteVisibilitySchema,
});

export type AlfSite = z.infer<typeof AlfSiteSchema>;

/**
 * Alfresco Group model
 */
export const AlfGroupSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  isRoot: z.boolean(),
  parentIds: z.array(z.string()),
});

export type AlfGroup = z.infer<typeof AlfGroupSchema>;

/**
 * Alfresco Group Member type enum
 */
export const AlfGroupMemberTypeSchema = z.enum(['PERSON', 'GROUP']);

export type AlfGroupMemberType = z.infer<typeof AlfGroupMemberTypeSchema>;

/**
 * Alfresco Group Member model
 */
export const AlfGroupMemberSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  memberType: AlfGroupMemberTypeSchema,
  email: z.string().email().optional(),
});

export type AlfGroupMember = z.infer<typeof AlfGroupMemberSchema>;
