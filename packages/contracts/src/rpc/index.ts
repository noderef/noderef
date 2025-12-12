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
 * RPC method schemas using Zod for runtime validation
 *
 * Common patterns used in contracts:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Pagination for list endpoints
 * - Filtering and search
 * - File operations
 * - Settings/configuration
 * - Batch operations
 */

// ============================================================================
// Health Check / Ping
// ============================================================================

export const PingRequestSchema = z.object({
  message: z.string().optional(),
  timestamp: z.number().optional(),
});

export const PongResponseSchema = z.object({
  message: z.string(),
  timestamp: z.number(),
  echo: z.unknown().optional(),
});

export type PingRequest = z.infer<typeof PingRequestSchema>;
export type PongResponse = z.infer<typeof PongResponseSchema>;

// ============================================================================
// CRUD Operations (Common Pattern)
// ============================================================================

// Create
export const CreateNoteRequestSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
});

export const CreateNoteResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;
export type CreateNoteResponse = z.infer<typeof CreateNoteResponseSchema>;

// Read (single)
export const GetNoteRequestSchema = z.object({
  id: z.string().uuid(),
});

export const GetNoteResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type GetNoteRequest = z.infer<typeof GetNoteRequestSchema>;
export type GetNoteResponse = z.infer<typeof GetNoteResponseSchema>;

// Update
export const UpdateNoteRequestSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
});

export const UpdateNoteResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;
export type UpdateNoteResponse = z.infer<typeof UpdateNoteResponseSchema>;

// Delete
export const DeleteNoteRequestSchema = z.object({
  id: z.string().uuid(),
});

export const DeleteNoteResponseSchema = z.object({
  success: z.boolean(),
  deletedId: z.string().uuid(),
});

export type DeleteNoteRequest = z.infer<typeof DeleteNoteRequestSchema>;
export type DeleteNoteResponse = z.infer<typeof DeleteNoteResponseSchema>;

// ============================================================================
// List with Pagination (Common Pattern)
// ============================================================================

export const ListNotesRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(), // Search in title/content
  filter: z
    .object({
      createdAfter: z.string().datetime().optional(),
      createdBefore: z.string().datetime().optional(),
    })
    .optional(),
});

export const ListNotesResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      content: z.string(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
  ),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type ListNotesRequest = z.infer<typeof ListNotesRequestSchema>;
export type ListNotesResponse = z.infer<typeof ListNotesResponseSchema>;

// ============================================================================
// Batch Operations (Common Pattern)
// ============================================================================

export const BatchDeleteNotesRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const BatchDeleteNotesResponseSchema = z.object({
  deleted: z.array(z.string().uuid()),
  failed: z.array(
    z.object({
      id: z.string().uuid(),
      error: z.string(),
    })
  ),
});

export type BatchDeleteNotesRequest = z.infer<typeof BatchDeleteNotesRequestSchema>;
export type BatchDeleteNotesResponse = z.infer<typeof BatchDeleteNotesResponseSchema>;

// ============================================================================
// File Operations (Common in Desktop Apps)
// ============================================================================

export const ReadFileRequestSchema = z.object({
  path: z.string(),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
});

export const ReadFileResponseSchema = z.object({
  content: z.string(),
  size: z.number().int(),
  encoding: z.enum(['utf8', 'base64']),
});

export type ReadFileRequest = z.infer<typeof ReadFileRequestSchema>;
export type ReadFileResponse = z.infer<typeof ReadFileResponseSchema>;

export const WriteFileRequestSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
  createIfNotExists: z.boolean().default(true),
});

export const WriteFileResponseSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  bytesWritten: z.number().int(),
});

export type WriteFileRequest = z.infer<typeof WriteFileRequestSchema>;
export type WriteFileResponse = z.infer<typeof WriteFileResponseSchema>;

// ============================================================================
// Settings/Configuration (Common Pattern)
// ============================================================================

export const GetSettingsRequestSchema = z.object({
  keys: z.array(z.string()).optional(), // If empty, return all
});

export const GetSettingsResponseSchema = z.record(z.unknown());

export type GetSettingsRequest = z.infer<typeof GetSettingsRequestSchema>;
export type GetSettingsResponse = z.infer<typeof GetSettingsResponseSchema>;

export const UpdateSettingsRequestSchema = z.record(z.unknown());

export const UpdateSettingsResponseSchema = z.object({
  success: z.boolean(),
  updated: z.array(z.string()),
});

export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
export type UpdateSettingsResponse = z.infer<typeof UpdateSettingsResponseSchema>;

// ============================================================================
// Export/Import (Common in Desktop Apps)
// ============================================================================

export const ExportDataRequestSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  includeMetadata: z.boolean().default(true),
});

export const ExportDataResponseSchema = z.object({
  data: z.string(), // Base64 encoded or JSON string
  format: z.enum(['json', 'csv']),
  size: z.number().int(),
});

export type ExportDataRequest = z.infer<typeof ExportDataRequestSchema>;
export type ExportDataResponse = z.infer<typeof ExportDataResponseSchema>;

export const ImportDataRequestSchema = z.object({
  data: z.string(), // Base64 encoded or JSON string
  format: z.enum(['json', 'csv']),
  overwrite: z.boolean().default(false),
});

export const ImportDataResponseSchema = z.object({
  success: z.boolean(),
  imported: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.string()).optional(),
});

export type ImportDataRequest = z.infer<typeof ImportDataRequestSchema>;
export type ImportDataResponse = z.infer<typeof ImportDataResponseSchema>;

// ============================================================================
// Alfresco RPC Schemas
// ============================================================================

export * from './alfresco-proxy.js';
export * from './alfresco.js';
