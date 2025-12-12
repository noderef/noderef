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
 * Basic: render a node using a saved rendition definition by QName.
 *
 * renditionDefQName:
 *   - short: "cm:doclib"
 *   - long: "{http://www.alfresco.org/model/content/1.0}doclib"
 *
 * Notes:
 *   - The rendition definition must already exist under Data Dictionary.
 *   - Returns the rendition ScriptNode (e.g. a thumbnail / preview).
 */
function example_rendition_render_byQName() {
  // Example: find a node by FTS or use some previous selection
  var query = 'TYPE:"cm:content" AND =cm:name:"some-file.pdf"';
  var results = search.query({
    query: query,
    language: 'fts-alfresco',
    page: { maxItems: 1 },
  });

  if (!results || results.length === 0) {
    logger.warn('No source node found for query: ' + query);
    return;
  }

  var source = results[0];
  var renditionDefQName = 'cm:doclib';

  var rendition = renditionService.render(source, renditionDefQName);
  logger.log(
    'Created rendition for ' +
      source.name +
      ' using ' +
      renditionDefQName +
      ': ' +
      rendition.nodeRef
  );
}

/**
 * Create a new rendition definition for a rendering engine.
 *
 * renditionName:
 *   - QName string, e.g. "cm:jsconsolePreview" or
 *     "{http://www.alfresco.org/model/content/1.0}jsconsolePreview"
 *
 * renderingEngineName:
 *   - engine id known to the RenditionService, e.g. "reformat", "imageMagick"
 *   - depends on your configuration / transformers.
 *
 * Note:
 *   - This only creates the definition object; you still need to set params
 *     on the script-side ScriptRenditionDefinition if needed.
 */
function example_rendition_createDefinition() {
  var renditionName = 'cm:jsconsolePreview';
  var renderingEngineName = 'reformat'; // example engine name

  var def = renditionService.createRenditionDefinition(renditionName, renderingEngineName);

  // You can now tweak parameters on def.renditionDefinition / def.engineDefinition
  logger.log(
    'Created rendition definition ' + renditionName + ' using engine ' + renderingEngineName
  );

  // Example: inspect some basic info
  logger.log('  Rendering engine: ' + def.engineDefinition.name);
  logger.log('  Rendition QName: ' + def.renditionDefinition.renditionName);
}

/**
 * Render using a ScriptRenditionDefinition instead of loading by QName.
 *
 * Useful when:
 *   - You want to build a temporary definition
 *   - Or you’ve just created one and want to use it immediately.
 */
function example_rendition_render_withDefinition() {
  // Find a content node to render
  var results = search.query({
    query: 'TYPE:"cm:content" AND =cm:name:"logo.png"',
    language: 'fts-alfresco',
    page: { maxItems: 1 },
  });

  if (!results || results.length === 0) {
    logger.warn('No logo.png found.');
    return;
  }

  var source = results[0];

  // Create a rendition definition (you’d typically do this once and save it)
  var renditionName = 'cm:jsconsoleLogoPreview';
  var engineName = 'imageMagick'; // example; depends on your setup
  var def = renditionService.createRenditionDefinition(renditionName, engineName);

  // At this point you *could* adjust engine parameters via def,
  // but that’s outside the ScriptRenditionDefinition snippet here.

  var rendition = renditionService.render(source, def);
  logger.log('Rendered ' + source.name + ' via ScriptRenditionDefinition -> ' + rendition.nodeRef);
}

/**
 * List all renditions of a given node.
 *
 * Returns:
 *   - All child renditions regardless of type/mimetype.
 */
function example_rendition_getAll() {
  var query = 'TYPE:"cm:content" AND =cm:name:"some-file.pdf"';
  var results = search.query({
    query: query,
    language: 'fts-alfresco',
    page: { maxItems: 1 },
  });

  if (!results || results.length === 0) {
    logger.warn('No source node found.');
    return;
  }

  var source = results[0];

  var renditions = renditionService.getRenditions(source);
  logger.log('Renditions for ' + source.name + ': ' + renditions.length + ' item(s).');

  for (var i = 0; i < renditions.length; i++) {
    var r = renditions[i];
    logger.log(
      '  [' +
        i +
        '] ' +
        r.name +
        ' (' +
        (r.properties['cm:content'] ? r.properties['cm:content'].mimetype : '?') +
        ') -> ' +
        r.nodeRef
    );
  }
}

/**
 * List renditions filtered by MIME-type prefix.
 *
 * mimeTypePrefix:
 *   - e.g. "image/", "application/pdf", "text/"
 *   - node’s rendition mimetype must start with this prefix.
 */
function example_rendition_getByMimePrefix() {
  var query = 'TYPE:"cm:content" AND =cm:name:"some-file.pdf"';
  var results = search.query({
    query: query,
    language: 'fts-alfresco',
    page: { maxItems: 1 },
  });

  if (!results || results.length === 0) {
    logger.warn('No source node found.');
    return;
  }

  var source = results[0];

  var mimeTypePrefix = 'image/';
  var renditions = renditionService.getRenditions(source, mimeTypePrefix);

  logger.log(
    'Image renditions for ' +
      source.name +
      ' (mimetype starts with ' +
      mimeTypePrefix +
      '): ' +
      renditions.length
  );

  for (var i = 0; i < renditions.length; i++) {
    var r = renditions[i];
    logger.log(
      '  ' +
        r.name +
        ' -> ' +
        (r.properties['cm:content'] ? r.properties['cm:content'].mimetype : 'no content') +
        ' (' +
        r.nodeRef +
        ')'
    );
  }
}

/**
 * Get a single rendition by rendition name (QName).
 *
 * renditionName:
 *   - short: "cm:doclib", "cm:imgpreview", etc.
 *   - long: "{http://www.alfresco.org/model/content/1.0}doclib"
 *
 * Returns:
 *   - ScriptNode for the rendition, or null if not present.
 */
function example_rendition_getByName() {
  var query = 'TYPE:"cm:content" AND =cm:name:"some-file.pdf"';
  var results = search.query({
    query: query,
    language: 'fts-alfresco',
    page: { maxItems: 1 },
  });

  if (!results || results.length === 0) {
    logger.warn('No source node found.');
    return;
  }

  var source = results[0];
  var renditionName = 'cm:doclib';

  var rendition = renditionService.getRenditionByName(source, renditionName);
  if (!rendition) {
    logger.log('No rendition ' + renditionName + ' found for ' + source.name + '.');
    return;
  }

  logger.log('Found rendition ' + renditionName + ' for ' + source.name + ': ' + rendition.nodeRef);
}

/**
 * Convenience: render and then immediately fetch that rendition by name.
 *
 * Useful pattern when:
 *   - You want to ensure the rendition exists now
 *   - You then need to work with the rendition node (copy, move, etc.)
 */
function example_rendition_renderAndFetch() {
  var query = 'TYPE:"cm:content" AND =cm:name:"some-file.pdf"';
  var results = search.query({
    query: query,
    language: 'fts-alfresco',
    page: { maxItems: 1 },
  });

  if (!results || results.length === 0) {
    logger.warn('No source node found.');
    return;
  }

  var source = results[0];
  var renditionQName = 'cm:doclib';

  // Render
  var rendition = renditionService.render(source, renditionQName);
  logger.log('Rendered ' + source.name + ' using ' + renditionQName + ' -> ' + rendition.nodeRef);

  // Fetch it again by name (just to show the other API)
  var fetched = renditionService.getRenditionByName(source, renditionQName);
  logger.log('Fetched rendition by name: ' + (fetched ? fetched.nodeRef : 'null (not found?)'));
}
