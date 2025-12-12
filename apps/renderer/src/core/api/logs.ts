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
 * API client for Alfresco log files
 * Uses the backend RPC proxy to avoid CORS issues
 */

import { call, buildStreamUrl } from '@/core/ipc/alfresco';
import type { LogFile } from '@/components/logs/LogFilesList';

interface LogFilesResponse {
  logFiles: LogFile[];
}

/**
 * Fetch log files from Alfresco server via webscript API
 * Uses the backend RPC proxy to handle authentication and path normalization
 */
export async function fetchLogFiles(baseUrl: string, serverId?: number): Promise<LogFile[]> {
  try {
    // Call the webscript through the backend proxy
    // The /s/ path in Alfresco is shorthand for /service/
    // WebscriptApi signature: executeWebScript(httpMethod, scriptPath, scriptArgs?, contextRoot?, servicePath?, postBody?)
    const response = await call(
      'webscript.executeWebScript',
      [
        'GET', // httpMethod
        'ootbee/admin/log4j-log-files', // scriptPath (without /s/ or /service/ prefix)
        { format: 'json' }, // scriptArgs
        'alfresco', // contextRoot
        'service', // servicePath
      ],
      baseUrl,
      serverId
    );

    // Webscript responses come back directly, not wrapped in .data
    const data = response as unknown as LogFilesResponse;
    return data.logFiles || [];
  } catch (error) {
    console.error('Failed to fetch log files:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch log files');
  }
}

/**
 * Download a log file from Alfresco server
 * Returns the raw text content of the log file
 * Uses the stream endpoint to handle plain text responses
 * @param baseUrl The base URL of the Alfresco server
 * @param serverId The server ID for authentication
 * @param logFilePath The full path to the log file on the server (e.g., /usr/local/tomcat/logs/alfresco.log)
 */
export async function downloadLogFile(
  baseUrl: string,
  serverId: number,
  logFilePath: string
): Promise<string> {
  try {
    // The path is part of the URL: /s/ootbee/admin/log4j-log-file/{path}
    // For example: /s/ootbee/admin/log4j-log-file//usr/local/tomcat/logs/alfresco.log
    // Note the double slash - the endpoint path + the absolute file path
    const scriptPath = `ootbee/admin/log4j-log-file/${logFilePath}`;

    // Build a stream URL so we can download the plain text response
    const streamUrl = await buildStreamUrl('webscript.executeWebScript', {
      baseUrl,
      serverId,
      _args: JSON.stringify(['GET', scriptPath, {}, 'alfresco', 'service']),
    });

    // Fetch the text content directly
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/plain,*/*',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download log file: ${response.statusText} - ${errorText}`);
    }

    // Get the text content
    const text = await response.text();
    return text;
  } catch (error) {
    console.error('Failed to download log file:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to download log file');
  }
}
