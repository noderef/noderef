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
 * Repository root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - repository -> ScriptRepository (wraps Repository helper + some services)
 *
 * API:
 *   - repository.getCompanyHome(): ScriptNode
 *   - repository.getRootHome(): ScriptNode
 *   - repository.getUserHome(): ScriptNode (current user)
 *   - repository.getPerson(): ScriptNode (cm:person for current user)
 *   - repository.getPeopleContainer(): ScriptNode (system container for all people)
 *   - repository.getSitesRoot(): ScriptNode (root node for sites)
 *   - repository.getForDocLibForNode(node: ScriptNode): ScriptNode (doclib for given node)
 *
 * Notes:
 *   - getUserHome() / getPerson() are based on the current authentication context.
 *   - getForDocLibForNode() uses DocLibNodeLocator internally.
 */

/**
 * Print key "anchor" nodes for quick navigation and debugging.
 */
function example_printRootNodes() {
  var companyHome = repository.getCompanyHome();
  var rootHome = repository.getRootHome();
  var sitesRoot = repository.getSitesRoot();
  var peopleContainer = repository.getPeopleContainer();

  logger.log(
    'Company Home: ' +
      companyHome.nodeRef +
      '  path=' +
      companyHome.displayPath +
      '/' +
      companyHome.name
  );
  logger.log(
    'Root Home:    ' + rootHome.nodeRef + '  path=' + rootHome.displayPath + '/' + rootHome.name
  );
  logger.log(
    'Sites Root:   ' + sitesRoot.nodeRef + '  path=' + sitesRoot.displayPath + '/' + sitesRoot.name
  );
  logger.log(
    'People Container: ' +
      peopleContainer.nodeRef +
      '  path=' +
      peopleContainer.displayPath +
      '/' +
      peopleContainer.name
  );
}

/**
 * Get current user's person node and user home folder.
 */
function example_currentUserInfo() {
  var person = repository.getPerson();
  var userHome = repository.getUserHome();

  logger.log('Current person node: ' + person.nodeRef);
  logger.log('User name: ' + person.properties['cm:userName']);
  logger.log(
    'Full name: ' + person.properties['cm:firstName'] + ' ' + person.properties['cm:lastName']
  );
  logger.log('Email: ' + person.properties['cm:email']);

  if (userHome) {
    logger.log(
      'User home: ' + userHome.nodeRef + '  path=' + userHome.displayPath + '/' + userHome.name
    );
  } else {
    logger.log('User home folder not found.');
  }
}

/**
 * Find a node and resolve the document library for its site / context using DocLibNodeLocator.
 *
 * This is useful when you have some node and want to jump to the correct doclib container.
 */
function example_getDocLibForNode() {
  var node = companyhome.childByNamePath('Shared'); // pick any node you like
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var docLib = repository.getForDocLibForNode(node);
  if (docLib) {
    logger.log('DocLib for node ' + node.nodeRef + ' => ' + docLib.nodeRef);
    logger.log('DocLib name: ' + docLib.name);
  } else {
    logger.log('No DocLib could be resolved for node: ' + node.nodeRef);
  }
}

/**
 * Convenience: browse sites root and list the first N site containers.
 */
function example_listSitesRootChildren() {
  var sitesRoot = repository.getSitesRoot();
  if (!sitesRoot) {
    logger.log('Sites root not found.');
    return;
  }

  var children = sitesRoot.children;
  logger.log('Sites root contains ' + children.length + ' child nodes');

  var limit = Math.min(children.length, 25);
  for (var i = 0; i < limit; i++) {
    var child = children[i];
    logger.log(i + 1 + ') ' + child.name + ' -> ' + child.nodeRef);
  }
}
