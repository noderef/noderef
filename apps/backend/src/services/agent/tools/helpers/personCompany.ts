/**
 * Copyright 2025-2026 NodeRef
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

import type { Company } from '@alfresco/js-api';
import { isRecord } from './nodeResultHelpers.js';

/** Parse optional `company` object from tool args into Alfresco Company shape. */
export function parseCompanyFromArgs(value: unknown): Company | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const organization = typeof value.organization === 'string' ? value.organization : undefined;
  const address1 = typeof value.address1 === 'string' ? value.address1 : undefined;
  const address2 = typeof value.address2 === 'string' ? value.address2 : undefined;
  const address3 = typeof value.address3 === 'string' ? value.address3 : undefined;
  const postcode = typeof value.postcode === 'string' ? value.postcode : undefined;
  const telephone = typeof value.telephone === 'string' ? value.telephone : undefined;
  const fax = typeof value.fax === 'string' ? value.fax : undefined;
  const email = typeof value.email === 'string' ? value.email : undefined;
  if (
    !organization &&
    !address1 &&
    !address2 &&
    !address3 &&
    !postcode &&
    !telephone &&
    !fax &&
    !email
  ) {
    return undefined;
  }
  return {
    organization,
    address1,
    address2,
    address3,
    postcode,
    telephone,
    fax,
    email,
  };
}
