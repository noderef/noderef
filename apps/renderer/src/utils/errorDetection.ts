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
 * Detects if an error is an authentication/authorization error that requires re-login
 *
 * Common patterns:
 * - 401 Unauthorized
 * - "Authorization 'Bearer' not supported" (expired OIDC tokens)
 * - "Authentication failed"
 * - "Invalid access token"
 * - Refresh token expired
 */
export function isAuthenticationError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Check for common authentication error patterns
  const authPatterns = [
    'authorization',
    'authentication failed',
    'login failed',
    'bearer',
    'not supported',
    'unauthorized',
    'invalid access token',
    'invalid token',
    'token expired',
    'refresh token',
    'session expired',
    '401',
    '403',
    'statuscode":401',
    'statuscode": 401',
    '"statuscode":401',
    'statuscode":403',
    'statuscode": 403',
    '"statuscode":403',
  ];

  // Check if message contains any auth patterns
  if (authPatterns.some(pattern => lowerMessage.includes(pattern))) {
    return true;
  }

  // Check for 401 status code in error object
  const status = (error as any)?.status || (error as any)?.statusCode;
  if (status === 401 || status === 403) {
    return true;
  }

  // Check for 401 in nested error details
  try {
    const errorStr = JSON.stringify(error);
    if (
      errorStr.includes('"statusCode":401') ||
      errorStr.includes('"status":401') ||
      errorStr.includes('"statusCode":403') ||
      errorStr.includes('"status":403')
    ) {
      return true;
    }
  } catch {
    // Ignore JSON stringify errors
  }

  return false;
}

/**
 * Extracts a user-friendly error message from an error object
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return 'An unknown error occurred';

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  // Try to extract message from error object
  if (typeof error === 'object') {
    const errorObj = error as any;
    if (errorObj.message) return errorObj.message;
    if (errorObj.error) {
      if (typeof errorObj.error === 'string') return errorObj.error;
      if (errorObj.error.message) return errorObj.error.message;
    }
  }

  return 'An unknown error occurred';
}
