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

import { rpc } from '@/core/ipc/rpc';

/**
 * Marks nodes as temporary by adding the sys:temporary aspect via the JS console endpoint.
 * Uses a single script execution for efficiency.
 */
export async function markNodesTemporary(serverId: number, nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) {
    return;
  }

  const nodeRefs = nodeIds.map(id => `workspace://SpacesStore/${id}`);
  const script = `
var nodeRefs = ${JSON.stringify(nodeRefs)};
for (var i = 0; i < nodeRefs.length; i++) {
  var ref = nodeRefs[i];
  var node = search.findNode(ref);
  if (!node) {
    continue;
  }
  if (!node.hasAspect('sys:temporary')) {
    node.addAspect('sys:temporary');
  }
}
({ processed: nodeRefs.length });
  `;

  await rpc('backend.jsconsole.execute', {
    serverId,
    script,
  });
}
