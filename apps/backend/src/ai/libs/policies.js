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
 * POLICIES ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - policies -> ScriptPolicies (wraps Alfresco BehaviourFilter)
 *
 * API:
 *   - policies.enableForNode(node: ScriptNode): void
 *   - policies.disableForNode(node: ScriptNode): void
 *   - policies.enableForTypeOrAspect(shortQName: String): void
 *   - policies.disableForTypeOrAspect(shortQName: String): void
 *   - policies.enableAll(): void
 *   - policies.isAltered(): void   (NOTE: implementation returns void but calls behaviourFilter.isActivated())
 *
 * Notes:
 *   - BehaviourFilter is per-transaction. Disabling behaviours is typically done for one transaction
 *     to bypass rules/behaviours while doing maintenance updates.
 *   - enableForTypeOrAspect / disableForTypeOrAspect affects all nodes of that type/aspect for the transaction.
 *   - shortQName must be a prefixed QName, e.g. "cm:auditable" or "cm:content".
 */

/**
 * Disable behaviours for a single node, do an update, then re-enable.
 *
 * This is the safest pattern: narrow scope, always re-enable in finally.
 */
function example_disable_behaviours_for_single_node() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  try {
    policies.disableForNode(node);
    logger.log('Behaviours disabled for node: ' + node.nodeRef);

    // Example maintenance update:
    node.properties['cm:description'] = 'Updated without triggering behaviours';
    node.save();

    logger.log('Node saved without behaviours.');
  } finally {
    policies.enableForNode(node);
    logger.log('Behaviours re-enabled for node.');
  }
}

/**
 * Disable behaviours globally for the current transaction.
 *
 * Useful when you do a lot of operations in one script and want to avoid
 * side effects (rules, behaviours, policies).
 *
 * Important: this affects *everything* in the current transaction.
 */
function example_disable_all_behaviours_transaction_scope() {
  try {
    // There is no explicit disableAll() wrapper in this class,
    // but BehaviourFilter supports disableBehaviour() with no args.
    // Your ScriptPolicies class only exposes enableAll(), not disableAll().
    //
    // So you must disable by type/aspect or by node,
    // OR you can call underlying Java object via Packages (if you allow that).
    //
    // Example alternative: disable for a common aspect like cm:auditable
    policies.disableForTypeOrAspect('cm:auditable');

    logger.log('Disabled behaviours for type/aspect: cm:auditable (transaction scope)');

    // Do work here...
    var folder = companyhome.childByNamePath('Shared');
    if (folder) {
      folder.properties['cm:description'] = 'Changed while behaviours suppressed';
      folder.save();
    }
  } finally {
    // restore
    policies.enableForTypeOrAspect('cm:auditable');
    logger.log('Re-enabled behaviours for cm:auditable.');
  }
}

/**
 * Disable behaviours for a specific type or aspect.
 *
 * Example: disable behaviour tied to cm:auditable for all nodes.
 */
function example_disable_for_aspect() {
  var aspect = 'cm:auditable';

  policies.disableForTypeOrAspect(aspect);
  logger.log('Disabled behaviours for: ' + aspect);

  // Do some operations here...
  // node.save() etc...

  policies.enableForTypeOrAspect(aspect);
  logger.log('Re-enabled behaviours for: ' + aspect);
}

/**
 * Disable behaviours for a custom type.
 */
function example_disable_for_custom_type() {
  var typeQName = 'my:myCustomType'; // must exist, must be valid prefixed QName

  policies.disableForTypeOrAspect(typeQName);
  logger.log('Disabled behaviours for type: ' + typeQName);

  // Do work...

  policies.enableForTypeOrAspect(typeQName);
  logger.log('Re-enabled behaviours for type: ' + typeQName);
}

/**
 * Enable all behaviours again for the current transaction.
 *
 * This resets any disable calls done at node/type/aspect/global level.
 */
function example_enable_all_behaviours() {
  policies.enableAll();
  logger.log('Enabled all behaviours for current transaction.');
}

/**
 * Check whether BehaviourFilter is activated / altered.
 *
 * WARNING: Your Java wrapper method returns void, but calls behaviourFilter.isActivated().
 * So from JS you can't actually read the boolean unless you fix the Java signature.
 *
 * This example just calls it (it will not return anything useful in JS).
 */
function example_isAltered_current_transaction() {
  var result = policies.isAltered(); // will be undefined because Java method is void
  logger.log(
    'policies.isAltered() returned: ' + result + ' (expected undefined due to Java signature)'
  );
}
