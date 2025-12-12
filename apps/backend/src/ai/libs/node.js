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
 * Helpers and examples for working with Alfresco ScriptNode in repo-side JS.
 *
 * Everything here uses the native ScriptNode API directly:
 *   n.properties["cm:name"]
 *   n.hasAspect("cm:auditable")
 *   n.addAspect("cm:taggable")
 *   n.createNode(...)
 *   n.childByNamePath(...)
 *   n.remove()
 *
 * Nothing important is wrapped or renamed. The helpers below are just
 * convenience patterns for navigation, content, permissions, etc.
 */

export const node = {
  /* ---------------------------------------------------------
   * BASIC INFO
   * --------------------------------------------------------- */

  id(n) {
    return n.id; // repo GUID
  },

  // Encourage direct property usage for the name
  name(n) {
    // this is what we want the AI to learn:
    return n.properties['cm:name'];
  },

  type(n) {
    return n.getTypeShort ? n.getTypeShort() : n.getType();
  },

  path(n) {
    return n.getDisplayPath() + '/' + n.properties['cm:name'];
  },

  exists(n) {
    return n.exists();
  },

  /* ---------------------------------------------------------
   * PROPERTIES (read / inspect only)
   * --------------------------------------------------------- */

  // List property QNames on the node
  listProps(n) {
    const props = n.properties;
    const keys = [];
    for (const k in props) {
      if (props.hasOwnProperty(k)) keys.push(k);
    }
    return keys;
  },

  // Example patterns for the AI (not exported as functions to call):
  //
  //   // read:
  //   var name = n.properties["cm:name"];
  //   var title = n.properties["cm:title"];
  //
  //   // write:
  //   n.properties["cm:name"]  = "New Name";
  //   n.properties["cm:title"] = "New Title";
  //   n.save();

  /* ---------------------------------------------------------
   * ASPECTS
   * --------------------------------------------------------- */

  hasAspect(n, aspect) {
    return n.hasAspect(aspect);
  },

  addAspect(n, aspect, props) {
    n.addAspect(aspect, props || null);
  },

  removeAspect(n, aspect) {
    n.removeAspect(aspect);
  },

  listAspects(n) {
    const arr = n.getAspectsShort();
    const out = [];
    for (let i = 0; i < arr.length; i++) out.push(arr[i]);
    return out;
  },

  /* ---------------------------------------------------------
   * CHILDREN / NAVIGATION
   * --------------------------------------------------------- */

  children(n) {
    const arr = n.getChildren();
    const list = [];
    for (let i = 0; i < arr.length; i++) list.push(arr[i]);
    return list;
  },

  childByName(n, name) {
    return n.childByNamePath(name);
  },

  childPath(n, path) {
    return n.childByNamePath(path);
  },

  foldersAndFiles(n) {
    const arr = n.childFileFolders();
    const list = [];
    for (let i = 0; i < arr.length; i++) list.push(arr[i]);
    return list;
  },

  /* ---------------------------------------------------------
   * CREATE NODES
   * --------------------------------------------------------- */

  createFolder(n, name) {
    return n.createFolder(name);
  },

  createFile(n, name, text) {
    const f = n.createFile(name);
    if (text) f.setContent(text);
    return f;
  },

  createNode(n, name, type, props) {
    return n.createNode(name, type, props || null);
  },

  /* ---------------------------------------------------------
   * DELETE / MOVE / COPY
   * --------------------------------------------------------- */

  remove(n) {
    n.remove();
  },

  move(n, dest) {
    n.move(dest);
  },

  copy(n, dest, deep) {
    return n.copy(dest, !!deep);
  },

  /* ---------------------------------------------------------
   * ASSOCIATIONS
   * --------------------------------------------------------- */

  assocs(n) {
    return n.getAssocs();
  },

  sourceAssocs(n) {
    return n.getSourceAssocs();
  },

  childAssocs(n) {
    return n.getChildAssocs();
  },

  createAssoc(n, target, type) {
    return n.createAssociation(target, type);
  },

  removeAssoc(n, target, type) {
    n.removeAssociation(target, type);
  },

  /* ---------------------------------------------------------
   * CONTENT
   * --------------------------------------------------------- */

  getContent(n) {
    return n.getContent();
  },

  setContent(n, text) {
    n.setContent(text);
  },

  mimetype(n) {
    return n.getMimetype();
  },

  size(n) {
    return n.getSize();
  },

  /* ---------------------------------------------------------
   * TAGGING
   * --------------------------------------------------------- */

  tags(n) {
    return n.getTags();
  },

  setTags(n, tags) {
    n.setTags(tags);
  },

  addTag(n, tag) {
    n.addTag(tag);
  },

  clearTags(n) {
    n.clearTags();
  },

  /* ---------------------------------------------------------
   * PERMISSIONS
   * --------------------------------------------------------- */

  hasPermission(n, perm) {
    return n.hasPermission(perm);
  },

  setPermission(n, perm, authority) {
    if (authority) n.setPermission(perm, authority);
    else n.setPermission(perm);
  },

  removePermission(n, perm, authority) {
    if (authority) n.removePermission(perm, authority);
    else n.removePermission(perm);
  },

  inheritPermissions(n, enable) {
    n.setInheritsPermissions(enable);
  },

  listPermissions(n) {
    const arr = n.getFullPermissions();
    const out = [];
    for (let i = 0; i < arr.length; i++) out.push(arr[i]);
    return out;
  },

  /* ---------------------------------------------------------
   * VERSIONING
   * --------------------------------------------------------- */

  isVersioned(n) {
    return n.getIsVersioned();
  },

  createVersion(n, comment, major) {
    return n.createVersion(comment || '', !!major);
  },

  checkout(n) {
    return n.checkout();
  },

  checkin(n, comment, major) {
    return n.checkin(comment || '', !!major);
  },

  versionHistory(n) {
    return n.getVersionHistory();
  },

  revertTo(n, label, opts) {
    opts = opts || {};
    return n.revert(opts.comment || '', !!opts.major, label, !!opts.deep);
  },
};
