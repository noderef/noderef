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

/**
 * Shared data models between renderer and backend
 * These TypeScript interfaces match your Prisma schema models
 */

// ============================================================================
// Core Data Models (match Prisma schema)
// ============================================================================

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Common Utility Types
// ============================================================================

/**
 * Pagination metadata (used with list endpoints)
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Sort configuration
 */
export interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Filter configuration (generic)
 */
export interface FilterConfig {
  [key: string]: unknown;
}

/**
 * API Response wrapper (common pattern)
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    timestamp: number;
    version?: string;
  };
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// File System Types (common in desktop apps)
// ============================================================================

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  createdAt: Date;
  modifiedAt: Date;
  extension?: string;
}

export interface DirectoryListing {
  path: string;
  files: FileInfo[];
  total: number;
}

// ============================================================================
// Settings/Configuration Types
// ============================================================================

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  editor: {
    fontSize: number;
    fontFamily: string;
    wordWrap: boolean;
    tabSize: number;
  };
  window: {
    width: number;
    height: number;
    maximized: boolean;
  };
  [key: string]: unknown; // Allow additional settings
}

// ============================================================================
// Server Models
// ============================================================================

export * from './server.js';

// ============================================================================
// Alfresco Models
// ============================================================================

export * from './alfresco.js';

// ============================================================================
// Node history activity models
// ============================================================================

export * from './nodeHistory.js';

// ============================================================================
// Local files
// ============================================================================

export * from './localFile.js';
