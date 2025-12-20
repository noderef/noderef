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
 * Shared constants for Alfresco OIDC authentication
 * These should match the frontend values in @/utils/oidcAuth
 */

/**
 * Default OIDC scope for authentication
 * - openid: Required for OIDC
 * - profile: Access to user profile information
 * - email: Access to user email
 * - offline_access: Get refresh token for long-term sessions
 */
export const DEFAULT_OIDC_SCOPE = 'openid profile email offline_access';

/**
 * Default redirect URI for local development
 */
export const DEFAULT_REDIRECT_URI = 'http://localhost:3000';
