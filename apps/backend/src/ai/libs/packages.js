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
 * Helper to get Spring beans (works in JS Console and other Rhino contexts
 * where the WebApplicationContext is available).
 *
 * Usage:
 *   var sr = bean('ServiceRegistry', Packages.org.alfresco.service.ServiceRegistry);
 *   var nodeService = bean('NodeService');
 */
function bean(name, type) {
  var ContextLoader = Packages.org.springframework.web.context.ContextLoader;
  var ctx = ContextLoader.getCurrentWebApplicationContext();
  if (!ctx) {
    throw 'No WebApplicationContext available – are you in repo JS Console?';
  }
  return type ? ctx.getBean(name, type) : ctx.getBean(name);
}

/**
 * Optionally initialise a global serviceRegistry via Spring.
 * This makes examples that expect `serviceRegistry` work.
 */
var serviceRegistry = (function () {
  try {
    var ServiceRegistry = Packages.org.alfresco.service.ServiceRegistry;
    return bean('ServiceRegistry', ServiceRegistry);
  } catch (e) {
    logger.warn('serviceRegistry not available via bean("ServiceRegistry"): ' + e);
    return null;
  }
})();

/**
 * Show some standard root objects available in repo scripts.
 */
function example_env_rootObjects_basic() {
  logger.log('companyhome: ' + companyhome.nodeRef);
  logger.log('userhome   : ' + userhome.nodeRef);
  logger.log('person     : ' + person.properties['cm:userName']);
  logger.log('roothome   : ' + roothome.nodeRef);

  // Only for classpath scripts:
  if (typeof script != 'undefined') {
    logger.log('script nodeRef: ' + script.nodeRef);
  } else {
    logger.log('script root object is not available in this context.');
  }
}

/**
 * Access Java services via serviceRegistry.
 *
 * In your environment serviceRegistry is NOT injected as a root object,
 * so we bootstrap it via Spring (see top of file).
 */
function example_env_serviceRegistry() {
  if (!serviceRegistry) {
    logger.warn('serviceRegistry is not available – check bean() initialisation.');
    return;
  }

  var nodeService = serviceRegistry.getNodeService();
  var namespaceService = serviceRegistry.getNamespaceService();

  logger.log('NodeService class     : ' + nodeService.getClass().getName());
  logger.log('NamespaceService class: ' + namespaceService.getClass().getName());
}

/**
 * Use Java classes via Packages in a secure (classpath) script.
 *
 * This only works if the script is executed with secure=true
 * (typically classpath-based scripts).
 */
function example_secure_Packages_basic() {
  var System = Packages.java.lang.System;
  var Date = Packages.java.util.Date;

  var now = new Date();
  logger.log('System.currentTimeMillis(): ' + System.currentTimeMillis());
  logger.log('Java Date now: ' + now.toString());
}

/**
 * Use ContentService and NodeRef in a secure script via Packages.
 */
function example_secure_Packages_contentService() {
  var ContextLoader = Packages.org.springframework.web.context.ContextLoader;
  var ctx = ContextLoader.getCurrentWebApplicationContext();
  if (!ctx) {
    logger.warn('No WebApplicationContext available – cannot fetch beans.');
    return;
  }

  var ContentService = Packages.org.alfresco.service.cmr.repository.ContentService;
  var NodeRef = Packages.org.alfresco.service.cmr.repository.NodeRef;

  var contentService = ctx.getBean('ContentService', ContentService);

  var nodeRefStr = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var nodeRef = new NodeRef(nodeRefStr);

  // FIXED: plain QName string, no markdown artefacts
  var reader = contentService.getReader(
    nodeRef,
    '{http://www.alfresco.org/model/content/1.0}content'
  );
  if (reader == null || !reader.exists()) {
    logger.warn('No content for node ' + nodeRefStr);
    return;
  }

  var text = reader.getContentString();
  logger.log('Read content via Java ContentService, length=' + (text ? text.length : 0));
}

/**
 * Show how repo scripts see NodeRef values as ScriptNode instances.
 *
 * RhinoScriptProcessor.convertToRhinoModel() wraps NodeRef into ScriptNode
 * before inserting into the scripting model.
 */
function example_ScriptNode_vs_NodeRef() {
  // 'document' is a ScriptNode when running as rule/web script
  var scriptNode = document;
  logger.log('ScriptNode: ' + scriptNode.nodeRef + ' name=' + scriptNode.name);

  // Access underlying NodeRef via Java class
  var NodeRef = Packages.org.alfresco.service.cmr.repository.NodeRef;
  var nodeRefFromString = new NodeRef(scriptNode.nodeRef.toString());

  logger.log('Java NodeRef equals underlying: ' + nodeRefFromString.equals(scriptNode.nodeRef));
}

/**
 * Receive a NodeRef in the model (from Java) and show that Rhino wraps it to ScriptNode.
 *
 * For example, if Java calls:
 *   Map<String, Object> model = new HashMap<>();
 *   model.put("target", someNodeRef);
 *   scriptService.executeScript(..., model);
 *
 * Then here, 'target' will be a ScriptNode.
 */
function example_model_wrapped_NodeRef() {
  if (typeof target == 'undefined') {
    logger.log('No "target" in model – this example assumes Java passed one.');
    return;
  }

  logger.log('target is ScriptNode: ' + (target.nodeRef ? 'yes' : 'no'));
  logger.log('target.nodeRef: ' + target.nodeRef);
}

/**
 * Get ServiceRegistry and NamespaceService in JS Console
 * using the bean() helper.
 */
function example_console_ServiceRegistry_and_NamespaceService() {
  var ServiceRegistry = Packages.org.alfresco.service.ServiceRegistry;
  var sr = bean('ServiceRegistry', ServiceRegistry);

  var nodeService = sr.getNodeService();
  var namespaceService = sr.getNamespaceService();

  logger.log('NodeService: ' + nodeService.getClass().getName());
  logger.log('NamespaceService: ' + namespaceService.getClass().getName());
}

/**
 * Recreate the QName example in JS Console (no injected serviceRegistry).
 */
function example_console_QName_with_ServiceRegistry() {
  var ServiceRegistry = Packages.org.alfresco.service.ServiceRegistry;
  var QName = Packages.org.alfresco.service.namespace.QName;

  var sr = bean('ServiceRegistry', ServiceRegistry);
  var ns = sr.getNamespaceService();

  var qTitle = QName.createQName('cm', 'title', ns);
  logger.log('QName for cm:title -> ' + qTitle.toString());
}

/**
 * JS Console: list children of Company Home using Java services only.
 */
function example_console_list_companyhome_children() {
  var ServiceRegistry = Packages.org.alfresco.service.ServiceRegistry;
  var StoreRef = Packages.org.alfresco.service.cmr.repository.StoreRef;

  var sr = bean('ServiceRegistry', ServiceRegistry);
  var nodeService = sr.getNodeService();
  var ns = sr.getNamespaceService();

  // Root node of workspace://SpacesStore
  var store = new StoreRef(StoreRef.STORE_REF_WORKSPACE_SPACESSTORE);
  var root = nodeService.getRootNode(store);

  // Usually /app:company_home – using XPath query
  var companyHomeNodes = sr
    .getSearchService()
    .selectNodes(root, '/app:company_home', null, ns, false);

  if (companyHomeNodes.isEmpty()) {
    logger.log('Could not find company home.');
    return;
  }

  var companyHome = companyHomeNodes.get(0);
  logger.log('Company Home: ' + companyHome);

  var children = sr.getFileFolderService().listFiles(companyHome);
  for (var i = 0; i < children.size(); i++) {
    var fi = children.get(i);
    logger.log('Child: ' + fi.getName() + ' (' + fi.getNodeRef() + ')');
  }
}

/**
 * JS Console: load a script resource the same way <import> does (classloader).
 *
 * This mimics RhinoScriptProcessor.loadScriptResource("classpath:...") for classpath resources.
 */
function example_console_load_classpath_script_resource() {
  var scriptClasspath = 'alfresco/extension/examples/example-lib.js';

  var loader = Packages.org.alfresco.repo.jscript.RhinoScriptProcessor.class.getClassLoader();

  var url = loader.getResource(scriptClasspath);
  if (url == null) {
    logger.log('Classpath resource not found: ' + scriptClasspath);
    return;
  }

  var stream = url.openStream();
  var ByteArrayOutputStream = Packages.java.io.ByteArrayOutputStream;
  var IOUtils = Packages.org.apache.commons.io.IOUtils;

  var baos = new ByteArrayOutputStream();
  IOUtils.copy(stream, baos);
  stream.close();

  var content = new java.lang.String(baos.toByteArray(), 'UTF-8');
  logger.log('Loaded classpath script, length=' + content.length());
}
