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
import { AxiosError } from 'axios';

/**
 * Error mapper for Alfresco API errors
 * Maps HTTP errors and network errors to application error codes
 */

export interface AppError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;
}

/**
 * Map an error from Alfresco API to an application error
 * @param error The error to map
 * @returns An AppError with the appropriate error code
 */
export function mapError(error: unknown): AppError {
  // Handle Axios errors (HTTP errors)
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;

    switch (status) {
      case 401:
        return {
          name: 'UnauthorizedError',
          message: 'Authentication failed',
          code: ErrorCode.UNAUTHORIZED,
          details: { status, originalError: axiosError.message },
        };

      case 404:
        return {
          name: 'NotFoundError',
          message: 'Resource not found',
          code: ErrorCode.NOT_FOUND,
          details: { status, originalError: axiosError.message },
        };

      case 429:
        return {
          name: 'RateLimitError',
          message: 'Rate limit exceeded',
          code: ErrorCode.SERVICE_UNAVAILABLE,
          details: { status, originalError: axiosError.message },
        };

      default:
        // Check for timeout
        if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
          return {
            name: 'TimeoutError',
            message: 'Request timeout',
            code: ErrorCode.TIMEOUT,
            details: { originalError: axiosError.message },
          };
        }

        // Check for network errors
        if (
          axiosError.code === 'ECONNREFUSED' ||
          axiosError.code === 'ENOTFOUND' ||
          axiosError.code === 'ETIMEDOUT'
        ) {
          return {
            name: 'ConnectionError',
            message: 'Connection error',
            code: ErrorCode.CONNECTION_ERROR,
            details: { code: axiosError.code, originalError: axiosError.message },
          };
        }

        // Unknown HTTP error
        return {
          name: 'HttpError',
          message: axiosError.message || 'HTTP error',
          code: ErrorCode.UNKNOWN,
          details: { status, originalError: axiosError.message },
        };
    }
  }

  // Handle superagent errors (HTTP errors with status property)
  if (error && typeof error === 'object' && 'status' in error) {
    const httpError = error as {
      status?: number;
      message?: string;
      response?: { status?: number };
    };
    const status = httpError.status || httpError.response?.status;

    if (status) {
      switch (status) {
        case 401:
          return {
            name: 'UnauthorizedError',
            message: 'Authentication failed',
            code: ErrorCode.UNAUTHORIZED,
            details: { status, originalError: httpError.message || 'Unauthorized' },
          };

        case 404:
          return {
            name: 'NotFoundError',
            message: 'Resource not found',
            code: ErrorCode.NOT_FOUND,
            details: { status, originalError: httpError.message || 'Not found' },
          };

        case 429:
          return {
            name: 'RateLimitError',
            message: 'Rate limit exceeded',
            code: ErrorCode.SERVICE_UNAVAILABLE,
            details: { status, originalError: httpError.message || 'Rate limited' },
          };

        default:
          return {
            name: 'HttpError',
            message: httpError.message || 'HTTP error',
            code: ErrorCode.UNKNOWN,
            details: { status, originalError: httpError.message },
          };
      }
    }
  }

  // Handle network timeouts (non-Axios)
  if (error instanceof Error) {
    if (error.message.includes('timeout') || error.name === 'TimeoutError') {
      return {
        name: 'TimeoutError',
        message: 'Request timeout',
        code: ErrorCode.TIMEOUT,
        details: { originalError: error.message },
      };
    }

    // Handle network errors
    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return {
        name: 'ConnectionError',
        message: 'Connection error',
        code: ErrorCode.CONNECTION_ERROR,
        details: { originalError: error.message },
      };
    }
  }

  // Fallback for unknown errors
  return {
    name: 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
    code: ErrorCode.UNKNOWN,
    details: { originalError: String(error) },
  };
}
