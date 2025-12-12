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
 * Proxy RPC schemas for Alfresco JS API pass-through
 * These schemas enable calling any Alfresco SDK method via a generic proxy interface.
 * The proxy layer provides 1-to-1 pass-through of SDK methods without transformation.
 */

/**
 * Proxy JSON RPC call schema
 * Used for all non-binary methods that accept/return JSON-able values
 */
export const AlfrescoRpcCallSchema = z.object({
  baseUrl: z.string().url(),
  method: z.string().min(1).max(200), // e.g., "nodes.getNode", "people.getPerson"
  args: z.unknown().optional(), // Can be object (options) or array (positional)
  serverId: z.number().optional(), // Optional server ID to retrieve and use stored credentials
});

export type AlfrescoRpcCall = z.infer<typeof AlfrescoRpcCallSchema>;

/**
 * Generic RPC response type
 * Returns the raw SDK response (no transformation)
 * Note: We use a type alias instead of a schema since responses are dynamic
 */
export type AlfrescoRpcResponse = unknown;

/**
 * Binary upload call schema (for multipart/form-data)
 * Used for upload methods that accept file data
 */
export const AlfrescoRpcBinaryCallSchema = z.object({
  baseUrl: z.string().url(),
  method: z.string().min(1).max(200), // e.g., "upload.uploadFile"
  serverId: z.number().optional(), // Optional server ID to authenticate uploads
  // Additional fields are extracted from multipart form data
  // File is passed as the first attached file
});

export type AlfrescoRpcBinaryCall = z.infer<typeof AlfrescoRpcBinaryCallSchema>;

/**
 * Stream call schema (for GET requests with query params)
 * Used for content/rendition/download methods that return binary data
 */
export const AlfrescoRpcStreamCallSchema = z.object({
  baseUrl: z.string().url(),
  method: z.string().min(1).max(200), // e.g., "nodes.getContent", "renditions.getRenditionContent"
  // Additional query params are forwarded to SDK
});

export type AlfrescoRpcStreamCall = z.infer<typeof AlfrescoRpcStreamCallSchema>;
