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
 * FAVORITES ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - favorites -> ScriptFavoritesService (wraps FavouritesService)
 *
 * API (from this class):
 *   - favorites.add(node) : ScriptNode | null
 *       Adds node as favourite for current run-as user.
 *       Returns a ScriptNode of the favourite nodeRef or null if it was already a favourite.
 *
 *   - favorites.add(node, username) : ScriptNode | null
 *       Adds node as favourite for the given user (runs as that user).
 *
 *   - favorites.remove(node) : void
 *       Removes favourite for current run-as user (no return).
 *
 *   - favorites.isFavorite(node) : boolean
 *
 *   - favorites.getFavorites(startCount, limit) : JS Array<PersonFavourite>
 *
 * Notes:
 *   - add() returns null if already favourited (by design in this wrapper).
 *   - getFavorites() returns PersonFavourite objects (not ScriptNodes).
 *     Those objects expose fields/methods depending on Alfresco version,
 *     so log/inspect first.
 */

/**
 * Add a document as favourite for the current user.
 */
function example_addFavorite_currentUser() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var fav = favorites.add(node);
  if (fav) {
    logger.log('Added favourite. Favourite nodeRef: ' + fav.nodeRef);
  } else {
    logger.log('Already a favourite: ' + node.name);
  }
}

/**
 * Check if a node is a favourite for the current user.
 */
function example_isFavorite_currentUser() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var isFav = favorites.isFavorite(node);
  logger.log(node.name + ' is favourite: ' + isFav);
}

/**
 * Remove a node from favourites for the current user (safe/no-op if not favourited).
 */
function example_removeFavorite_currentUser() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  favorites.remove(node);
  logger.log('Remove requested (if it was a favourite).');

  var isFav = favorites.isFavorite(node);
  logger.log('Now favourite? ' + isFav);
}

/**
 * Add a node as favourite for a specific user.
 *
 * This wrapper does AuthenticationUtil.runAs(username) internally.
 * That means you generally need permissions to do this (admin / elevated context).
 */
function example_addFavorite_forUser() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var username = 'jdoe';

  try {
    var fav = favorites.add(node, username);
    if (fav) {
      logger.log('Added favourite for ' + username + '. Favourite nodeRef: ' + fav.nodeRef);
    } else {
      logger.log(username + ' already had this as a favourite.');
    }
  } catch (e) {
    logger.log('Failed to add favourite for ' + username + ': ' + e);
  }
}

/**
 * Page through current user's favourites.
 *
 * getFavorites(startCount, limit) returns PersonFavourite[] (JS array).
 * PersonFavourite is not a ScriptNode; it usually includes:
 *   - getNodeRef()
 *   - getType()
 *   - getGuid() / getNodeRef().getId()
 * ...depending on version.
 *
 * In script console, safest: log the object and probe known methods.
 */
function example_listFavorites_paged() {
  var start = 0;
  var limit = 25;

  var favs = favorites.getFavorites(start, limit);
  logger.log('Returned favourites: ' + favs.length);

  for (var i = 0; i < favs.length; i++) {
    var f = favs[i];

    // We can’t rely on exact getters across Alfresco versions, so use defensive probing.
    // Common patterns:
    //   f.getNodeRef() -> NodeRef
    //   f.getType() -> String or enum-like
    var nodeRef = null;
    var type = null;

    try {
      if (f && f.getNodeRef) nodeRef = String(f.getNodeRef());
    } catch (e1) {}

    try {
      if (f && f.getType) type = String(f.getType());
    } catch (e2) {}

    logger.log('#' + (start + i) + ' type=' + type + ' nodeRef=' + nodeRef);
  }
}

/**
 * Convert favourites (PersonFavourite) into ScriptNodes (when possible).
 *
 * This is useful if you want name/path/etc, but requires that:
 *   - the favourite points to an existing node
 *   - you have permission to read it
 *
 * This uses the standard "search.findNode" helper which exists in many Alfresco script contexts.
 * If your environment doesn’t have search.findNode, replace it with an equivalent.
 */
function example_listFavorites_asScriptNodes() {
  var favs = favorites.getFavorites(0, 50);
  logger.log('Favourites: ' + favs.length);

  for (var i = 0; i < favs.length; i++) {
    var f = favs[i];

    var nodeRef = null;
    try {
      nodeRef = f.getNodeRef ? String(f.getNodeRef()) : null;
    } catch (e) {}

    if (!nodeRef) {
      logger.log('Favourite #' + i + ' has no nodeRef (or cannot be read).');
      continue;
    }

    var n = search.findNode(nodeRef); // typical Alfresco script helper
    if (!n) {
      logger.log('Favourite #' + i + ' points to missing/inaccessible node: ' + nodeRef);
      continue;
    }

    logger.log('Favourite #' + i + ': ' + n.name + ' (' + n.nodeRef + ')');
  }
}
