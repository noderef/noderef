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
 * CUSTOM MODEL ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - customModel -> ScriptModelService (wraps Alfresco CustomModelService)
 *
 * API:
 *   - customModel.isModelAdmin() : boolean
 *   - customModel.activateModel(modelName) : void
 *   - customModel.deactivateModel(modelName) : void
 *   - customModel.deleteModel(modelName) : void
 *   - customModel.getModelNode(modelName) : ScriptNode | null
 *   - customModel.getCustomModels(start, end) : JS Array<CustomModelDefinition>
 *
 * Notes:
 *   - Model names are usually the short internal names used by CustomModelService,
 *     e.g. "my:model" or "myModel" depending on how it was created.
 *   - getCustomModels() returns CustomModelDefinition objects, not nodes.
 *   - getModelNode() returns the underlying model node as ScriptNode (if available).
 */

/**
 * Check whether current user is a model admin (or super admin).
 */
function example_isModelAdmin() {
  var isAdmin = customModel.isModelAdmin();
  logger.log('Is model admin: ' + isAdmin);
}

/**
 * List custom models (paged).
 *
 * getCustomModels(start, end) uses PagingRequest(start, end).
 * Depending on Alfresco impl, end can behave like a max-items or a skip+max.
 * If your paging looks odd, try start=0,end=25 and then 25,25 etc.
 */
function example_listCustomModels() {
  var start = 0;
  var end = 25;

  var models = customModel.getCustomModels(start, end);
  logger.log('Returned models: ' + models.length);

  for (var i = 0; i < models.length; i++) {
    var m = models[i];

    // CustomModelDefinition is a Java object; method names depend on Alfresco version.
    // Common getters:
    //   getName(), getTitle(), getDescription(), isActive(), getNamespaceUri()
    // If you don't know your version, log it first:
    logger.log('Model #' + i + ': ' + m);

    // Safer probing:
    try {
      if (m.getName) logger.log('  name: ' + m.getName());
    } catch (e1) {}
    try {
      if (m.isActive) logger.log('  active: ' + m.isActive());
    } catch (e2) {}
    try {
      if (m.getNamespaceUri) logger.log('  ns: ' + m.getNamespaceUri());
    } catch (e3) {}
  }
}

/**
 * Activate a model by name.
 *
 * You should normally check permissions first (isModelAdmin).
 */
function example_activateModel() {
  var modelName = 'my:model'; // replace with a real model name

  if (!customModel.isModelAdmin()) {
    logger.log('Current user is not a model admin. Aborting.');
    return;
  }

  try {
    customModel.activateModel(modelName);
    logger.log('Activated model: ' + modelName);
  } catch (e) {
    logger.log('Failed to activate model ' + modelName + ': ' + e);
  }
}

/**
 * Deactivate a model by name.
 */
function example_deactivateModel() {
  var modelName = 'my:model'; // replace with a real model name

  if (!customModel.isModelAdmin()) {
    logger.log('Current user is not a model admin. Aborting.');
    return;
  }

  try {
    customModel.deactivateModel(modelName);
    logger.log('Deactivated model: ' + modelName);
  } catch (e) {
    logger.log('Failed to deactivate model ' + modelName + ': ' + e);
  }
}

/**
 * Delete a model by name.
 *
 * Careful: deleting can break existing content that relies on custom types/aspects.
 */
function example_deleteModel() {
  var modelName = 'my:model'; // replace with a real model name

  if (!customModel.isModelAdmin()) {
    logger.log('Current user is not a model admin. Aborting.');
    return;
  }

  try {
    customModel.deleteModel(modelName);
    logger.log('Deleted model: ' + modelName);
  } catch (e) {
    logger.log('Failed to delete model ' + modelName + ': ' + e);
  }
}

/**
 * Get the underlying model node (ScriptNode) for a custom model.
 *
 * Useful if you want to inspect node properties, content, or download the model XML.
 */
function example_getModelNode() {
  var modelName = 'my:model'; // replace with a real model name

  var modelNode = customModel.getModelNode(modelName);
  if (!modelNode) {
    logger.log('Model node not found for model: ' + modelName);
    return;
  }

  logger.log('Model nodeRef: ' + modelNode.nodeRef);
  logger.log('Model name: ' + modelNode.name);

  // Example: log some properties if present
  try {
    logger.log('cm:name: ' + modelNode.properties['cm:name']);
  } catch (e) {}

  // If you want the model content URL (if available) you can use your contentUrls root object:
  // var url = contentUrls.getContentUrl(String(modelNode.nodeRef));
  // logger.log('Content URL: ' + url);
}

/**
 * Helper: find a model by scanning getCustomModels() and matching by name.
 *
 * This is useful because people often don't remember exact model names.
 */
function example_findModelByNameFragment() {
  var fragment = 'my'; // search fragment
  var models = customModel.getCustomModels(0, 200);

  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var name = null;

    try {
      if (m.getName) name = String(m.getName());
    } catch (e) {}

    if (name && name.toLowerCase().indexOf(fragment.toLowerCase()) !== -1) {
      logger.log('Matched model: ' + name + ' -> ' + m);
    }
  }
}
