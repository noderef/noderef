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
 * Utility functions for building Alfresco API URLs
 * Handles base URLs with or without /alfresco suffix
 */

/**
 * Normalize base URL by removing trailing /alfresco if present
 * This ensures consistent URL building across the app
 */
export function normalizeBaseUrl(baseUrl: string): string {
  // Remove trailing slashes
  let normalized = baseUrl.replace(/\/+$/, '');

  // Remove /alfresco suffix if present
  if (normalized.endsWith('/alfresco')) {
    normalized = normalized.slice(0, -9); // Remove '/alfresco'
  }

  return normalized;
}

/**
 * Build Alfresco API endpoint URL
 * Automatically handles base URLs with or without /alfresco
 */
export function buildAlfrescoUrl(baseUrl: string, path: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalized}/alfresco${cleanPath}`;
}

/**
 * Build slingshot API URL for node details
 */
export function buildSlingshotNodeUrl(baseUrl: string, nodeRef: string): string {
  // nodeRef format: workspace/SpacesStore/uuid or workspace://SpacesStore/uuid
  const cleanNodeRef = nodeRef.replace('://', '/');
  return buildAlfrescoUrl(baseUrl, `/s/slingshot/node/${cleanNodeRef}`);
}

/**
 * Build slingshot API URL for node content download
 * Supports downloading specific properties (e.g., cm:preferenceValues)
 */
export function buildSlingshotContentUrl(
  baseUrl: string,
  nodeRef: string,
  property: string = 'cm:content'
): string {
  // nodeRef format: workspace/SpacesStore/uuid or workspace://SpacesStore/uuid
  const cleanNodeRef = nodeRef.replace('://', '/');
  return buildAlfrescoUrl(baseUrl, `/service/api/node/${cleanNodeRef}/content;${property}`);
}
