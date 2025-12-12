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

import type { AlfrescoApi } from '@alfresco/js-api';
import { getClient } from './clientFactory.js';
import { mapError } from './errorMapper.js';
import { getApiClass, parseMethod } from './registry.js';

/**
 * Proxy service for calling Alfresco JS API methods generically
 * This service enables 1-to-1 pass-through of SDK methods without transformation
 */

/**
 * Normalize webscript path based on the original baseUrl
 * - If baseUrl ends with /alfresco, use scriptPath as-is (e.g., "api/admin/usage")
 * - If baseUrl doesn't end with /alfresco, prepend "alfresco/" (e.g., "alfresco/api/admin/usage")
 * @param baseUrl The original base URL of the Alfresco server
 * @param scriptPath The script path from the args
 * @returns The normalized script path
 */
function normalizeWebscriptPath(baseUrl: string, scriptPath: string): string {
  // Remove trailing slash from baseUrl
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  // If baseUrl already ends with /alfresco, use scriptPath as-is
  if (normalizedBaseUrl.endsWith('/alfresco')) {
    return scriptPath;
  }

  // If scriptPath already starts with "alfresco/", use it as-is
  if (scriptPath.startsWith('alfresco/')) {
    return scriptPath;
  }

  // Otherwise, prepend "alfresco/" to the scriptPath
  return `alfresco/${scriptPath}`;
}

/**
 * Call an Alfresco SDK method via the registry
 * @param baseUrl The base URL of the Alfresco server
 * @param dottedMethod The dotted method name (e.g., "nodes.getNode", "people.getPerson")
 * @param args The arguments to pass to the method (can be object or array)
 * @param authenticatedApi Optional pre-authenticated API client to use instead of creating/fetching one
 * @returns The raw SDK response (no transformation)
 */
export async function callMethod(
  baseUrl: string,
  dottedMethod: string,
  args?: unknown,
  authenticatedApi?: AlfrescoApi
): Promise<unknown> {
  try {
    // Parse the method name
    const parsed = parseMethod(dottedMethod);
    if (!parsed) {
      throw new Error(
        `Invalid method format: ${dottedMethod}. Expected format: "namespace.method"`
      );
    }

    const { namespace, method } = parsed;

    // Special handling for webscript calls - normalize scriptPath when contextRoot is not provided
    // The WebscriptApi signature: executeWebScript(httpMethod, scriptPath, scriptArgs?, contextRoot?, servicePath?, postBody?)
    if (namespace === 'webscript' && args) {
      if (Array.isArray(args) && args.length >= 2 && typeof args[1] === 'string') {
        // Only normalize if contextRoot (args[3]) is not provided - let the API use defaults
        if (!args[3]) {
          // Positional arguments: args[0]=httpMethod, args[1]=scriptPath
          args[1] = normalizeWebscriptPath(baseUrl, args[1]);
        }
      } else if (typeof args === 'object' && !Array.isArray(args)) {
        // Object arguments (legacy support for potential future use)
        const webscriptArgs = args as Record<string, unknown>;
        if (typeof webscriptArgs.scriptPath === 'string' && !webscriptArgs.contextRoot) {
          webscriptArgs.scriptPath = normalizeWebscriptPath(baseUrl, webscriptArgs.scriptPath);
        }
      }
    }

    // Get the API class from registry
    const ApiClass = getApiClass(namespace);
    if (!ApiClass) {
      // Import registry to get available namespaces
      const { API_REGISTRY } = await import('./registry.js');
      throw new Error(
        `Unknown namespace: ${namespace}. Available namespaces: ${Object.keys(API_REGISTRY).join(', ')}`
      );
    }

    // Use the provided authenticated API client, or get/create one
    const api: AlfrescoApi = authenticatedApi || getClient(baseUrl);

    // Instantiate the API class
    const apiInstance = new ApiClass(api);

    // Get the method from the API instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiMethod = (apiInstance as any)[method];
    if (typeof apiMethod !== 'function') {
      throw new Error(`Method "${method}" not found on ${namespace} API`);
    }

    // Call the method with the provided arguments
    // Handle both object (options) and array (positional) arguments
    let result: unknown;
    if (Array.isArray(args)) {
      // Positional arguments: spread the array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await apiMethod.apply(apiInstance, args as any[]);
    } else if (args !== undefined && args !== null) {
      // Object arguments: pass as single argument
      result = await apiMethod.call(apiInstance, args);
    } else {
      // No arguments: call without parameters
      result = await apiMethod.call(apiInstance);
    }

    // Return the raw SDK response (no transformation)
    return result;
  } catch (error) {
    // Map errors through the error mapper for consistent error codes
    const appError = mapError(error);
    const err = new Error(appError.message) as Error & {
      code: string;
      details?: unknown;
    };
    err.code = appError.code;
    err.details = appError.details;
    throw err;
  }
}
