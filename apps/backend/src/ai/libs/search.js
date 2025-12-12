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
 * Find a node by NodeRef string.
 *
 * Returns a ScriptNode or null.
 */
function example_findNodeByString() {
  // Any valid NodeRef
  var nodeRefString = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';

  var node = search.findNode(nodeRefString);
  if (node) {
    logger.log('Found node: ' + node.name + ' (' + node.nodeRef + ')');
  } else {
    logger.log('Node not found or not readable: ' + nodeRefString);
  }
}

/**
 * Find a node by “webscript-style” reference.
 *
 * referenceType: "node" or "path"
 * reference: array of segments.
 */
function example_findNodeByWebscriptReference() {
  var nodeRefSegments = ['workspace', 'SpacesStore', '01234567-89ab-cdef-0123-456789abcdef'];
  var node1 = search.findNode('node', nodeRefSegments);
  if (node1) {
    logger.log('Node reference resolved to: ' + node1.displayPath + '/' + node1.name);
  }

  var pathSegments = ['workspace', 'SpacesStore', 'Company Home', 'Data Dictionary'];
  var node2 = search.findNode('path', pathSegments);
  if (node2) {
    logger.log('Path resolved to: ' + node2.displayPath + '/' + node2.name);
  }
}

function example_xpathSearch_defaultStore() {
  var nodes = search.xpathSearch('/app:company_home//*');
  logger.log('Found ' + nodes.length + ' nodes');
  for (var i = 0; i < nodes.length; i++) {
    logger.log(nodes[i].displayPath + '/' + nodes[i].name);
  }
}

function example_xpathSearch_customStore() {
  var store = 'workspace://SpacesStore';
  var nodes = search.xpathSearch(store, '/app:company_home/app:dictionary//*');
  logger.log('Found ' + nodes.length + ' nodes in custom store');
}

function example_selectNodes() {
  var nodes = search.selectNodes('/app:company_home/cm:Sites//*');
  logger.log('Found ' + nodes.length + ' nodes using selectNodes()');
}

function example_isValidXpathQuery() {
  var valid = search.isValidXpathQuery('/app:company_home/cm:SomeFolder//*');
  var invalid = search.isValidXpathQuery('/app:company_home//[*');
  logger.log('Valid: ' + valid);
  logger.log('Invalid: ' + invalid);
}

/**
 * ------------------------------------------------------------------------
 *  LUCENE SEARCH (LEGACY) – SIMPLE
 * ------------------------------------------------------------------------
 */

function example_luceneSearch_basic() {
  var query = 'TEXT:"contract"';
  var nodes = search.luceneSearch(query);
  logger.log('Found ' + nodes.length + ' contract(s)');
  for (var i = 0; i < nodes.length; i++) {
    logger.log(nodes[i].nodeRef + ' -> ' + nodes[i].name);
  }
}

function example_luceneSearch_withSortAndStore() {
  var store = 'workspace://SpacesStore';
  var query = 'TYPE:"cm:content" AND TEXT:"invoice"';
  var sortBy = '@cm:created';
  var ascending = false;
  var maxResults = 50;

  var nodes = search.luceneSearch(store, query, sortBy, ascending, maxResults);
  logger.log('Found ' + nodes.length + ' invoices (maxResults=' + maxResults + ')');
  for (var i = 0; i < nodes.length; i++) {
    logger.log(nodes[i].properties['cm:created'] + ' -> ' + nodes[i].name);
  }
}

function example_savedSearch_byNode() {
  var savedSearchNodeRef = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var savedSearchNode = search.findNode(savedSearchNodeRef);
  if (!savedSearchNode) {
    logger.log('Saved search node not found');
    return;
  }

  var results = search.savedSearch(savedSearchNode);
  logger.log('Saved search returned ' + results.length + ' nodes');
}

function example_savedSearch_byString() {
  var savedSearchNodeRef = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var results = search.savedSearch(savedSearchNodeRef);
  logger.log('Saved search returned ' + results.length + ' nodes');
}

function example_tagSearch() {
  var store = 'workspace://SpacesStore';
  var tag = 'project-x';

  var nodes = search.tagSearch(store, tag);
  logger.log('Found ' + nodes.length + " nodes tagged with '" + tag + "'");
  for (var i = 0; i < nodes.length; i++) {
    logger.log(nodes[i].displayPath + '/' + nodes[i].name);
  }
}

function example_ISO9075() {
  var folderName = '2015 Reports & Plans';
  var encoded = search.ISO9075Encode(folderName);
  var decoded = search.ISO9075Decode(encoded);

  logger.log('Original: ' + folderName);
  logger.log('Encoded : ' + encoded);
  logger.log('Decoded : ' + decoded);
}

function example_query_basic_fts() {
  var def = {
    query: 'TYPE:"cm:content" AND TEXT:"policy"',
    language: 'fts-alfresco',
    store: 'workspace://SpacesStore',
    defaultOperator: 'AND',
    page: { maxItems: 25, skipCount: 0 },
  };

  var nodes = search.query(def);
  logger.log('Found ' + nodes.length + ' nodes (page 1)');

  var rs = search.queryResultSet(def);
  logger.log('numberFound: ' + rs.meta.numberFound);
  logger.log('hasMore    : ' + rs.meta.hasMore);
}

function example_query_with_sort_and_templates() {
  var def = {
    query: 'myfield:(contract)',
    language: 'fts-alfresco',
    templates: [{ field: 'myfield', template: 'TEXT:"{0}" OR @cm:title:"{0}"' }],
    sort: [{ column: 'cm:created', ascending: false }],
    page: { maxItems: 50, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  var nodes = rs.nodes;
  logger.log('Found ' + nodes.length + ' nodes using template + sort');
}

function example_query_with_facets() {
  var def = {
    query: 'TYPE:"cm:content" AND TEXT:"invoice"',
    language: 'fts-alfresco',
    fieldFacets: ['cm:creator', 'cm:modifier'],
    page: { maxItems: 10, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  var facets = rs.meta.facets;
  for (var field in facets) {
    var list = facets[field];
    logger.log('Facet field: ' + field);
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      logger.log('  ' + f.label + ' (' + f.value + '): ' + f.count);
    }
  }
}

function example_query_with_filterQueries() {
  var def = {
    query: 'TYPE:"cm:content" AND TEXT:"contract"',
    language: 'fts-alfresco',
    filterQueries: [
      '@cm:creator:"admin"',
      '@cm:created:["2020-01-01T00:00:00.000" TO "2025-12-31T23:59:59.999"]',
    ],
    page: { maxItems: 100, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  logger.log('Filtered contracts: ' + rs.nodes.length);
}

function example_query_with_highlighting() {
  var def = {
    query: 'TEXT:"confidential"',
    language: 'fts-alfresco',
    highlight: {
      snippetCount: 5,
      fragmentSize: 80,
      usePhraseHighlighter: true,
      mergeContiguous: true,
      prefix: '<mark>',
      postfix: '</mark>',
      fields: [{ field: 'cm:content' }, { field: 'cm:description' }],
    },
    page: { maxItems: 20, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  var nodes = rs.nodes;
  var highlighting = rs.meta.highlighting;

  logger.log('Found ' + nodes.length + ' nodes with highlighting');
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var nodeId = node.nodeRef.toString();
    logger.log('Node: ' + node.name);

    var propsHighlights = highlighting[nodeId];
    if (propsHighlights) {
      for (var prop in propsHighlights) {
        var snippets = propsHighlights[prop];
        logger.log('  Property: ' + prop);
        for (var j = 0; j < snippets.length; j++) {
          logger.log('    ' + snippets[j]);
        }
      }
    } else {
      logger.log('  No highlights available');
    }
  }
}

function example_query_with_spellcheck() {
  var def = {
    query: 'TEXT:"conract"',
    language: 'fts-alfresco',
    searchTerm: 'conract',
    spellCheck: true,
    page: { maxItems: 10, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  var sc = rs.meta.spellcheck;

  logger.log('Spellcheck searchTerm     : ' + sc.searchTerm);
  logger.log('Spellcheck resultName     : ' + sc.resultName);
  logger.log('Spellcheck isSearchedFor  : ' + sc.searchedFor);
  logger.log('Spellcheck exist          : ' + sc.spellCheckExist);
  logger.log('Spellcheck suggestions    : ' + sc.results);
}

function example_query_errorHandling() {
  var def = {
    query: 'TYPE:"cm:content" AND (',
    language: 'fts-alfresco',
    onerror: 'no-results',
    page: { maxItems: 10, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  logger.log('numberFound: ' + rs.meta.numberFound + ' (should be 0 on error)');
}

function example_getSearchSubsystem() {
  var subsystem = search.getSearchSubsystem();
  logger.log('Search subsystem: ' + subsystem);
}

function count_site_documents(siteName) {
  var path =
    '/app:company_home/st:sites/cm:' + search.ISO9075Encode(siteName) + '/cm:documentLibrary//*';

  var def = {
    query: '*',
    language: 'fts-alfresco',
    filterQueries: ['TYPE:"cm:content"', 'PATH:"' + path + '"', '-ASPECT:"rn:rendition"'],
    page: { maxItems: 1, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  logger.log('Docs in site ' + siteName + ': ' + rs.meta.numberFound);
}

function count_user_content_only() {
  var def = {
    query: '*',
    language: 'fts-alfresco',
    filterQueries: ['TYPE:"cm:content"', '-ASPECT:"rn:rendition"', '-ASPECT:"cm:thumbnail"'],
    page: { maxItems: 1, skipCount: 0 },
  };
  var rs = search.queryResultSet(def);
  logger.log('User-ish content items: ' + rs.meta.numberFound);
}

function list_newest_content(maxItems) {
  maxItems = Math.min(maxItems || 25, 100);

  var def = {
    query: 'TYPE:"cm:content"',
    language: 'fts-alfresco',
    sort: [{ column: 'cm:created', ascending: false }],
    page: { maxItems: maxItems, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  for (var i = 0; i < rs.nodes.length; i++) {
    var n = rs.nodes[i];
    logger.log(n.properties['cm:created'] + '  ' + n.nodeRef + '  ' + n.name);
  }
}

function describe_node(nodeRefString) {
  var n = search.findNode(nodeRefString);
  if (!n) {
    logger.log('Not found or not readable: ' + nodeRefString);
    return;
  }

  var c = n.properties['cm:content'];
  logger.log('Name    : ' + n.name);
  logger.log('NodeRef  : ' + n.nodeRef);
  logger.log('Type    : ' + n.typeShort);
  logger.log('Path    : ' + n.displayPath + '/' + n.name);
  logger.log('Created : ' + n.properties['cm:created']);
  logger.log('Creator : ' + n.properties['cm:creator']);

  if (c) {
    logger.log('Mimetype: ' + c.mimetype);
    logger.log('Size    : ' + c.size);
  }
}

function facet_count_by_creator() {
  var def = {
    query: '*',
    language: 'fts-alfresco',
    filterQueries: ['TYPE:"cm:content"', '-ASPECT:"rn:rendition"'],
    fieldFacets: ['cm:creator'],
    page: { maxItems: 1, skipCount: 0 },
  };

  var rs = search.queryResultSet(def);
  var facets = rs.meta.facets;
  var list = facets && facets['cm:creator'] ? facets['cm:creator'] : [];

  logger.log('Total: ' + rs.meta.numberFound);
  for (var i = 0; i < Math.min(list.length, 20); i++) {
    logger.log(list[i].label + ': ' + list[i].count);
  }
}

/**
 * Count all cm:content nodes in the repository.
 * Uses a filtered query to force an exact total.
 */
function countAllContentInRepo() {
  var def = {
    query: '*',
    language: 'fts-alfresco',
    filterQueries: ['TYPE:"cm:content"'],
    page: {
      maxItems: 1,
      skipCount: 0,
    },
  };

  var rs = search.queryResultSet(def);

  logger.log('Total cm:content nodes in repository: ' + rs.meta.numberFound);
  return rs.meta.numberFound;
}
