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

import { AlfrescoApi, WebscriptApi } from '@alfresco/js-api';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('alfresco.tern');

/**
 * Fetch Tern definitions from the OOTBEE jsconsole endpoint
 * @param api Authenticated Alfresco API client
 * @returns Tern definitions JSON object
 */
export async function getTernDefinitions(api: AlfrescoApi): Promise<any> {
  try {
    const webscriptApi = new WebscriptApi(api);

    // Endpoint: /alfresco/ootbee/jsconsole/tern-definitions/alfresco-script-api
    // See OOTBEE Support Tools: https://github.com/OrderOfTheBee/ootbee-support-tools

    const scriptPath = 'ootbee/jsconsole/tern-definitions/alfresco-script-api';
    const response = await webscriptApi.executeWebScript(
      'GET',
      scriptPath,
      {},
      'alfresco',
      'service'
    );

    log.info('Successfully fetched Tern definitions from OOTBEE');
    return response;
  } catch (error: any) {
    // Fail silent as per requirements. If OOTBEE is not installed, we'll get a 404.
    log.warn(
      {
        message: error.message,
        status: error.status || error.response?.status,
      },
      'Failed to fetch Tern definitions from OOTBEE, failing silent'
    );

    // Return empty definitions structure compatible with what usually comes back
    return { typeDefinitions: [] };
  }
}
