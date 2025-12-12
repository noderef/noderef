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

import { ErrorCode } from '@app/contracts';

/**
 * Application error class with ErrorCode
 * Use this to throw errors that will be properly handled by sendAppError
 */
export class AppError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Helper function to throw an error with ErrorCode
 * @param code Error code from ErrorCode enum
 * @param message Error message
 * @param details Optional error details
 */
export function throwAppError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): never {
  throw new AppError(code, message, details);
}

/**
 * Common error helpers for common scenarios
 */
export const AppErrors = {
  notFound: (resource: string, id?: string | number) =>
    throwAppError(ErrorCode.NOT_FOUND, `${resource}${id ? ` with ID ${id}` : ''} not found`, {
      resource,
      id,
    }),

  unauthorized: (message = 'Unauthorized') => throwAppError(ErrorCode.UNAUTHORIZED, message),

  forbidden: (message = 'Forbidden') => throwAppError(ErrorCode.FORBIDDEN, message),

  validationError: (message: string, details?: Record<string, unknown>) =>
    throwAppError(ErrorCode.VALIDATION_ERROR, message, details),

  invalidInput: (message: string, details?: Record<string, unknown>) =>
    throwAppError(ErrorCode.INVALID_INPUT, message, details),

  connectionError: (message: string, details?: Record<string, unknown>) =>
    throwAppError(ErrorCode.CONNECTION_ERROR, message, details),

  serviceUnavailable: (message: string, details?: Record<string, unknown>) =>
    throwAppError(ErrorCode.SERVICE_UNAVAILABLE, message, details),

  internalError: (message: string, details?: Record<string, unknown>) =>
    throwAppError(ErrorCode.INTERNAL_ERROR, message, details),
};
