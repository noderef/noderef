/**
 * List all registered action names on the repository.
 *
 * Useful for discovering what you can call with actions.create().
 */
function example_listRegisteredActions() {
  var registered = actions.getRegistered();

  logger.log('Registered actions: ' + registered.length);
  for (var i = 0; i < registered.length; i++) {
    logger.log('  - ' + registered[i]);
  }
}

/**
 * actions.create("actionName") returns a ScriptAction object.
 *
 * A ScriptAction let you:
 *   - set parameter values (action.parameters["paramName"] = value)
 *   - execute it against a ScriptNode (node.executeAction(action))
 *
 * To find which parameters a particular action supports, check Alfresco docs
 * or log the ActionDefinition on the server. Unfortunately the JS API
 * doesn't expose parameter metadata directly.
 */

/**
 * Add an aspect to a node using the "add-aspect" action.
 */
function example_addAspect() {
  var node = companyhome.childByNamePath('Shared/test.txt');
  if (!node) {
    logger.log('File not found');
    return;
  }

  var action = actions.create('add-aspect');
  if (!action) {
    logger.log('Action not available: add-aspect');
    return;
  }

  action.parameters['aspect-name'] = 'cm:versionable';

  node.executeAction(action);

  logger.log('Aspect cm:versionable added to: ' + node.nodeRef);
}

/**
 * Copy a node to another folder using "copy".
 *
 * Parameters:
 *   - destination-folder (nodeRef, required)
 *   - deep-copy (boolean, optional)
 *   - overwrite-copy (boolean, optional)
 */
function example_copyNode() {
  var source = companyhome.childByNamePath('Shared/test.txt');
  var targetFolder = companyhome.childByNamePath('Shared/Archive');

  if (!source || !targetFolder) {
    logger.log('Missing source or target');
    return;
  }

  var action = actions.create('copy');
  if (!action) {
    logger.log('Action not available: copy');
    return;
  }

  action.parameters['destination-folder'] = targetFolder.nodeRef.toString();
  action.parameters['deep-copy'] = true;
  action.parameters['overwrite-copy'] = true;

  source.executeAction(action);

  logger.log(
    'Copied ' + source.name + ' into ' + targetFolder.displayPath + '/' + targetFolder.name
  );
}

/**
 * Move a node using the "move" action.
 */
function example_moveNode() {
  var source = companyhome.childByNamePath('Shared/test.txt');
  var dest = companyhome.childByNamePath('Shared/Archive');

  var action = actions.create('move');
  action.parameters['destination-folder'] = dest.nodeRef.toString();

  source.executeAction(action);

  logger.log('Moved ' + source.name + ' to Archive folder');
}

/**
 * Apply a client-side transformation (e.g. transform to PDF).
 *
 * Common action: "transform"
 * Parameters usually include:
 *   - destination-folder
 *   - association-name
 *   - mime-type
 */
function example_transformToPdf() {
  var node = companyhome.childByNamePath('Shared/test.docx');
  var outFolder = companyhome.childByNamePath('Shared/Converted');

  if (!node || !outFolder) {
    logger.log('Unable to locate node or output folder');
    return;
  }

  var action = actions.create('transform');
  action.parameters['destination-folder'] = outFolder.nodeRef.toString();
  action.parameters['mime-type'] = 'application/pdf';

  node.executeAction(action);

  logger.log('Converted ' + node.name + ' to PDF');
}

/**
 * Extract metadata using the "extract-metadata" action.
 */
function example_extractMetadata() {
  var node = companyhome.childByNamePath('Shared/photo.jpg');

  var action = actions.create('extract-metadata');
  if (!action) {
    logger.log('Metadata extract action not available');
    return;
  }

  node.executeAction(action);

  logger.log('Extracted metadata from: ' + node.nodeRef);
}

/**
 * Count the direct children of a folder using "count-children".
 *
 * The result is written back to the action as the "result" parameter.
 */
function example_countChildren() {
  var folder = companyhome.childByNamePath('Shared');
  if (!folder) {
    logger.log('Folder not found');
    return;
  }

  var action = actions.create('count-children');
  if (!action) {
    logger.log('Action not available: count-children');
    return;
  }

  folder.executeAction(action);

  var count = action.parameters['result'];
  logger.log('Child count for ' + folder.name + ': ' + count);
}

/**
 * Increment the cm:counter property on a node using "counter".
 *
 * Adds cm:countable on first run, then increments on each execution.
 */
function example_counter() {
  var node = companyhome.childByNamePath('Shared/test.txt');
  if (!node) {
    logger.log('File not found');
    return;
  }

  var action = actions.create('counter');
  if (!action) {
    logger.log('Action not available: counter');
    return;
  }

  node.executeAction(action);

  var value = node.properties['cm:counter'];
  logger.log('Counter on ' + node.name + ': ' + value);
}

/**
 * Create a new version of a versionable node using "create-version".
 *
 * Parameters:
 *   - description (text, optional)
 *   - minor-change (boolean, optional) — false creates a major version
 *
 * The node must already have the cm:versionable aspect.
 */
function example_createVersion() {
  var node = companyhome.childByNamePath('Shared/test.txt');
  if (!node) {
    logger.log('File not found');
    return;
  }

  if (!node.hasAspect('cm:versionable')) {
    logger.log('Node is not versionable — add cm:versionable first');
    return;
  }

  var action = actions.create('create-version');
  if (!action) {
    logger.log('Action not available: create-version');
    return;
  }

  action.parameters['description'] = 'Updated via script';
  action.parameters['minor-change'] = false;

  node.executeAction(action);

  logger.log('Created version for: ' + node.nodeRef);
}

/**
 * Specialise a node to a more specific subtype using "specialise-type".
 *
 * Parameters:
 *   - type-name (QName, required) — must be a subtype of the node's current type
 */
function example_specialiseType() {
  var node = companyhome.childByNamePath('Shared/test.txt');
  if (!node) {
    logger.log('File not found');
    return;
  }

  var action = actions.create('specialise-type');
  if (!action) {
    logger.log('Action not available: specialise-type');
    return;
  }

  // Replace with a QName that is a strict subtype of the node's current type
  action.parameters['type-name'] = 'my:invoice';

  var before = node.typeShort;
  node.executeAction(action);

  logger.log('Type before: ' + before + ', after: ' + node.typeShort);
}

/**
 * Run all enabled folder rules on child nodes using "execute-all-rules".
 *
 * Parameters:
 *   - execute-inherited-rules (boolean, optional)
 *   - run-all-rules-on-children (boolean, optional)
 *
 * WARNING: triggers every enabled rule on the folder's children.
 */
function example_executeAllRules() {
  var folder = companyhome.childByNamePath('Shared');
  if (!folder) {
    logger.log('Folder not found');
    return;
  }

  var action = actions.create('execute-all-rules');
  if (!action) {
    logger.log('Action not available: execute-all-rules');
    return;
  }

  action.parameters['execute-inherited-rules'] = true;
  action.parameters['run-all-rules-on-children'] = true;

  folder.executeAction(action);

  logger.log('Executed all rules for folder: ' + folder.name);
}

/**
 * Send a plain-text email using "mail".
 *
 * Parameters:
 *   - to (text) / to_many (array) — recipient(s)
 *   - subject (text, required)
 *   - text (text) / html (text) — message body
 *   - from, fromPersonalName, cc, bcc, template, template_model,
 *     locale, subjectParams, ignore_send_failure, send_after_commit
 *
 * WARNING: sends real email when SMTP is configured.
 */
function example_mail_simpleText() {
  var action = actions.create('mail');
  if (!action) {
    logger.log('Action not available: mail');
    return;
  }

  action.parameters['to'] = 'recipient@example.com';
  action.parameters['subject'] = 'NodeRef mail action test';
  action.parameters['text'] = 'Hello from an Alfresco script.';

  action.execute(companyhome);

  logger.log('Mail action executed.');
}

/**
 * Send email about a document node using "mail".
 *
 * When executed against a content node, template models include
 * document, space, person, to, date, and url.
 */
function example_mail_aboutDocument() {
  var doc = companyhome.childByNamePath('Shared/test.txt');
  if (!doc) {
    logger.log('Document not found');
    return;
  }

  var action = actions.create('mail');
  if (!action) {
    logger.log('Action not available: mail');
    return;
  }

  action.parameters['to'] = 'recipient@example.com';
  action.parameters['subject'] = 'Document update';
  action.parameters['text'] =
    'The document "' + doc.name + '" was processed.\n\nNodeRef: ' + doc.nodeRef;

  doc.executeAction(action);

  logger.log('Mail action executed for document: ' + doc.name);
}

/**
 * Send email using a FreeMarker template and custom model values.
 *
 * template can be a repository template node or a classpath location
 * such as "alfresco/templates/notify_user_email.ftl".
 */
function example_mail_withTemplate() {
  var action = actions.create('mail');
  if (!action) {
    logger.log('Action not available: mail');
    return;
  }

  action.parameters['to'] = 'recipient@example.com';
  action.parameters['subject'] = 'workflow.task.email.subject';
  action.parameters['template'] = 'alfresco/templates/notify_user_email.ftl';
  action.parameters['template_model'] = {
    customMessage: 'Extra context from the script',
  };

  action.execute(companyhome);

  logger.log('Mail action executed with template.');
}

/**
 * Alfresco supports composite actions and condition-based actions, but the
 * Script API exposes only create/execute primitives. If your repository is
 * configured with custom action definitions, you can call them the same way:
 *
 *   var action = actions.create("my-custom-action");
 *   action.parameters["foo"] = "bar";
 *   node.executeAction(action);
 *
 * These execute on the *repo tier*, not Share-tier client actions.
 */

/**
 * Run a custom action (example name).
 */
function example_runCustomAction() {
  var node = companyhome.childByNamePath('Shared/test.txt');

  var action = actions.create('my-custom-action');
  if (!action) {
    logger.log('Custom action not registered');
    return;
  }

  action.parameters['message'] = 'Hello from script';
  action.parameters['flag'] = true;

  node.executeAction(action);

  logger.log('Custom action executed.');
}

/**
 * Export a node structure to an ACP file using "export".
 *
 * Parameters:
 *   - store (text, required)
 *   - package-name (text, required)
 *   - destination (nodeRef, required)
 *   - encoding (text, required)
 *   - include-children (boolean, optional)
 *   - include-self (boolean, optional)
 */
function example_exportACP() {
  // Example path - adjust as needed
  var nodeToExport = companyhome.childByNamePath('Sites/swsdp/documentLibrary');
  if (!nodeToExport) {
    logger.log('Node to export not found');
    return;
  }

  var exportAction = actions.create('export');
  if (!exportAction) {
    logger.log('Action not available: export');
    return;
  }

  exportAction.parameters['store'] = 'workspace://SpacesStore';
  exportAction.parameters['package-name'] = 'ACPexport';
  exportAction.parameters['destination'] = companyhome;
  exportAction.parameters['include-children'] = true;
  exportAction.parameters['include-self'] = false;
  exportAction.parameters['encoding'] = 'UTF-8';

  // execute() can be called on the action object passing the node
  exportAction.execute(nodeToExport);

  logger.log('Export action executed for: ' + nodeToExport.name);
}

/**
 * Import an ACP or ZIP package using "import".
 *
 * Parameters:
 *   - destination (nodeRef, required)
 *   - encoding (text, optional)
 *
 * Execute on the ACP/ZIP content node. WARNING: creates nodes in the destination folder.
 */
function example_importACP() {
  // Example paths - adjust as needed
  var targetNodeForImport = companyhome.childByNamePath('Sites/swsdp/documentLibrary');
  var ACPFile = companyhome.childByNamePath('ACPexport.acp');

  if (!targetNodeForImport || !ACPFile) {
    logger.log('Target node (Sites/swsdp/documentLibrary) or ACP file (ACPexport.acp) not found');
    return;
  }

  var importAction = actions.create('import');
  if (!importAction) {
    logger.log('Action not available: import');
    return;
  }

  importAction.parameters['encoding'] = 'UTF-8';
  importAction.parameters['destination'] = targetNodeForImport;

  // Execute the import action on the ACP file node
  importAction.execute(ACPFile);

  logger.log('Import action executed for: ' + ACPFile.name);
}
