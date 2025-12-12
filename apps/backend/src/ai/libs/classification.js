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
 * Examples for the Alfresco Classification root object: `classification`
 *
 * These examples assume the following root objects are available:
 *   - classification  (Classification)
 *   - logger          (ScriptLogger)
 *
 * The functions are usage examples, similar to search.js / groups.js.
 */

/**
 * List all aspects that define a classification.
 *
 * Each entry is a QName string, usually in prefix form, e.g. "cm:generalclassifiable".
 */
function example_classification_listAspects() {
  var aspects = classification.getAllClassificationAspects();

  logger.log('Classification aspects (' + aspects.length + '):');
  for (var i = 0; i < aspects.length; i++) {
    logger.log('  - ' + aspects[i]);
  }
}

/**
 * Get root categories for a specific classification aspect.
 *
 * aspect:
 *   - short: "cm:generalclassifiable"
 *   - long : "{http://www.alfresco.org/model/content/1.0}generalclassifiable"
 */
function example_classification_getRootCategories_basic() {
  var aspect = 'cm:generalclassifiable';

  var roots = classification.getRootCategories(aspect);
  logger.log('Root categories for ' + aspect + ': ' + roots.length);

  for (var i = 0; i < roots.length; i++) {
    var cat = roots[i];
    // CategoryNode normally exposes name + nodeRef like ScriptNode
    logger.log('  [' + i + '] ' + cat.name + ' (' + cat.nodeRef + ')');
  }
}

/**
 * Get filtered / paged root categories.
 *
 * filter:
 *   - null or "" -> no filtering
 *   - "a"        -> root categories whose names start with "a" (server-side)
 */
function example_classification_getRootCategories_filteredPaged() {
  var aspect = 'cm:generalclassifiable';
  var filter = 'A'; // e.g. categories starting with "A"
  var maxItems = 25;
  var skipCount = 0;

  var roots = classification.getRootCategories(aspect, filter, maxItems, skipCount);

  logger.log(
    'Paged root categories for ' +
      aspect +
      ' (filter="' +
      filter +
      '", maxItems=' +
      maxItems +
      ', skipCount=' +
      skipCount +
      '): ' +
      roots.length
  );

  for (var i = 0; i < roots.length; i++) {
    var cat = roots[i];
    logger.log('  [' + i + '] ' + cat.name + ' (' + cat.nodeRef + ')');
  }
}

/**
 * Create a new root category in a classification.
 *
 * aspect:
 *   - usually "cm:generalclassifiable" or a custom classification aspect.
 */
function example_classification_createRootCategory() {
  var aspect = 'cm:generalclassifiable';
  var name = 'Project_X';

  var category = classification.createRootCategory(aspect, name);
  if (!category) {
    logger.log('Could not create root category for ' + aspect + ' / ' + name);
    return;
  }

  logger.log(
    'Created root category: ' + category.name + ' (' + category.nodeRef + ') for aspect ' + aspect
  );
}

/**
 * Find all category nodes for a given classification aspect (any depth).
 */
function example_classification_getAllCategoryNodes_forAspect() {
  var aspect = 'cm:generalclassifiable';

  var categories = classification.getAllCategoryNodes(aspect);
  logger.log(
    'All category nodes for ' + aspect + ' (depth=ANY): ' + (categories ? categories.length : 0)
  );

  if (!categories || categories.length === 0) {
    return;
  }

  // Log the first few so the output stays readable
  var limit = Math.min(categories.length, 20);
  for (var i = 0; i < limit; i++) {
    var cat = categories[i];
    logger.log('  [' + i + '] ' + cat.name + ' (' + cat.nodeRef + ')');
  }

  if (categories.length > limit) {
    logger.log('  ... ' + (categories.length - limit) + ' more category node(s) not shown.');
  }
}

/**
 * Wrap an existing category node from a NodeRef string.
 *
 * This is useful when you have a stored category NodeRef
 * (e.g. from metadata) and want to inspect it via CategoryNode.
 */
function example_classification_getCategory_byNodeRef() {
  var categoryRef = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';

  var category = classification.getCategory(categoryRef);
  if (!category) {
    logger.log('No category found for NodeRef: ' + categoryRef);
    return;
  }

  logger.log('Category from NodeRef: ' + category.name + ' (' + category.nodeRef + ')');
}

/**
 * Get most-used categories for a classification aspect (tag-cloud style).
 *
 * The underlying API returns Tag objects:
 *   - tag.getCategory()  -> CategoryNode
 *   - tag.getFrequency() -> int
 */
function example_classification_getCategoryUsage_topN() {
  var aspect = 'cm:generalclassifiable';
  var maxCount = 10;

  var tags = classification.getCategoryUsage(aspect, maxCount);
  logger.log(
    'Top ' + maxCount + ' categories for ' + aspect + ' (by usage): ' + (tags ? tags.length : 0)
  );

  if (!tags || tags.length === 0) {
    return;
  }

  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    var category = tag.getCategory();
    var freq = tag.getFrequency();

    logger.log(
      '  ' +
        (category ? category.name : '(unknown)') +
        ' (' +
        (category ? category.nodeRef : 'no nodeRef') +
        '): ' +
        freq +
        ' assignments'
    );
  }
}

/**
 * Convenience: dump all root categories for every classification aspect.
 *
 * This can be handy to reverse-engineer what classifications are present in a repo.
 */
function example_classification_dumpAllRoots() {
  var aspects = classification.getAllClassificationAspects();
  logger.log('Dumping root categories for all aspects (' + aspects.length + ')');

  for (var i = 0; i < aspects.length; i++) {
    var aspect = aspects[i];
    var roots = classification.getRootCategories(aspect);

    logger.log('Aspect ' + aspect + ' -> ' + (roots ? roots.length : 0) + ' root(s)');
    if (!roots || roots.length === 0) {
      continue;
    }

    var limit = Math.min(roots.length, 10);
    for (var j = 0; j < limit; j++) {
      var cat = roots[j];
      logger.log('  [' + j + '] ' + cat.name + ' (' + cat.nodeRef + ')');
    }
    if (roots.length > limit) {
      logger.log('  ... ' + (roots.length - limit) + ' more root category(ies) not shown.');
    }
  }
}
