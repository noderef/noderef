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
 * Central validation layer for all domain models
 * Enforces required fields, enums, defaults, and business rules
 */

import { ErrorCode, createRPCError } from '@app/contracts';
import { z } from 'zod';

/**
 * Validation error class with structured metadata
 */
export class ValidationError extends Error {
  constructor(
    public code: ErrorCode,
    public tableName: string,
    public recordId?: number | string,
    public field?: string,
    public details?: Record<string, unknown>
  ) {
    super(
      `Validation error in ${tableName}${recordId ? ` (id: ${recordId})` : ''}${field ? ` field: ${field}` : ''}`
    );
    this.name = 'ValidationError';
  }

  toRPCError() {
    return createRPCError(this.code, this.message, {
      tableName: this.tableName,
      recordId: this.recordId,
      field: this.field,
      ...this.details,
    });
  }
}

/**
 * Server type enum values
 */
export const SERVER_TYPES = ['alfresco', 'process_services', 'elastic'] as const;
export type ServerType = (typeof SERVER_TYPES)[number];

/**
 * Auth type enum values
 */
export const AUTH_TYPES = ['basic', 'oauth', 'openid_connect'] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

/**
 * Validate and normalize jsconsole_endpoint
 * - Removes leading slashes (service prefix is added automatically)
 * - Removes 's/' prefix if present (service path is added automatically)
 * - Returns null for empty/whitespace-only values
 */
function validateJsConsoleEndpoint(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(
      ErrorCode.VALIDATION_ERROR,
      'servers',
      undefined,
      'jsconsole_endpoint',
      { reason: 'jsconsole_endpoint must be a string or null' }
    );
  }

  // Trim whitespace
  let trimmed = value.trim();

  // Empty string is treated as null
  if (trimmed === '') {
    return null;
  }

  // Remove leading slashes if present (service prefix is added automatically)
  trimmed = trimmed.replace(/^\/+/, '');

  // Remove 's/' prefix if present (service path is added automatically)
  trimmed = trimmed.replace(/^s\//, '');

  // Return cleaned path or null if empty after cleaning
  return trimmed || null;
}

/**
 * Server validation schema (base schema without userId)
 */
const ServerBaseValidationSchema = z
  .object({
    name: z.string().min(1).max(200),
    baseUrl: z.string().url(),
    serverType: z.enum(SERVER_TYPES).default('alfresco'),
    authType: z.enum(AUTH_TYPES).nullable().optional(),
    isAdmin: z.boolean().default(true),
    username: z.string().nullable().optional(),
    token: z.string().nullable().optional(),
    jsconsoleEndpoint: z
      .string()
      .nullable()
      .optional()
      .transform(val => validateJsConsoleEndpoint(val)),
    thumbnail: z.string().nullable().optional(), // Base64 string
    color: z.string().max(50).nullable().optional(),
    label: z.string().max(4).nullable().optional(), // Environment label (e.g., PROD, TEST, ACC)
    displayOrder: z.number().int().min(0).optional(),
  })
  .strict();

/**
 * Server validation schema with userId (for create operations)
 */
export const ServerValidationSchema = ServerBaseValidationSchema.extend({
  userId: z.number().int().positive(),
});

/**
 * Create server input validation
 */
export function validateCreateServerInput(
  data: unknown,
  recordId?: number
): z.infer<typeof ServerValidationSchema> {
  try {
    return ServerValidationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        'servers',
        recordId,
        firstError.path.join('.'),
        { zodError: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Update server input validation (all fields optional, no userId)
 * Note: The transform on jsconsoleEndpoint in ServerBaseValidationSchema will be applied
 */
export const UpdateServerValidationSchema = ServerBaseValidationSchema.partial();

export function validateUpdateServerInput(
  data: unknown,
  recordId?: number
): z.infer<typeof UpdateServerValidationSchema> {
  try {
    return UpdateServerValidationSchema.parse(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      if (recordId && !error.recordId) {
        error.recordId = recordId;
      }
      throw error;
    }
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        'servers',
        recordId,
        firstError.path.join('.'),
        { zodError: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Standalone jsconsole_endpoint validator
 * Can be used independently for validation
 */
export function validateJsConsoleEndpointField(
  value: string | null | undefined,
  recordId?: number
): string | null {
  try {
    return validateJsConsoleEndpoint(value);
  } catch (error) {
    if (error instanceof ValidationError) {
      if (recordId) {
        error.recordId = recordId;
      }
      throw error;
    }
    throw error;
  }
}
