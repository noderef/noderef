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
 * Rules root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - rules -> ScriptRulesService (wraps Alfresco RuleService)
 *
 * API highlights:
 *   - rules.isEnabled()
 *   - rules.enableRules() / rules.disableRules()                 (current thread)
 *   - rules.enableRules(node) / rules.disableRules(node|nodeRef) (per-node scope)
 *   - rules.rulesEnabled(node|nodeRef|string)
 *   - rules.hasRules(node), rules.hasDirectRules(node)
 *   - rules.getRules(node) -> List<Rule>
 *   - rules.countRules(node|nodeRef|string)
 *   - rules.disableRule(rule) / rules.enableRule(rule)
 *   - rules.removeAllRules(node|nodeRef|string)
 *
 * Notes:
 *   - enableRules()/disableRules() affect the current thread only.
 *   - disableRules(node) / enableRules(node) affect rule evaluation on that node.
 *   - Passing string nodeRefs must be valid NodeRef strings.
 */

/**
 * Quick check: rule service and effective rule state for a node.
 */
function example_rulesStatusForNode() {
  var node = companyhome.childByNamePath('Shared'); // pick a node that exists
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  logger.log('RuleService enabled: ' + rules.isEnabled());
  logger.log('Rules enabled for node: ' + rules.rulesEnabled(node));
  logger.log('Has any rules (direct or inherited): ' + rules.hasRules(node));
  logger.log('Has direct rules only: ' + rules.hasDirectRules(node));
  logger.log('Total rule count (direct+inherited): ' + rules.countRules(node));
}

/**
 * List the rules attached (direct+inherited) and dump some details.
 * Rule is a Java object; what you can log depends on exposed getters / toString().
 */
function example_listRules(node) {
  if (!node) node = companyhome.childByNamePath('Shared');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var list = rules.getRules(node); // java.util.List<Rule>
  logger.log('rules.getRules() returned: ' + (list ? list.size() : 'null'));

  if (!list || list.size() === 0) return;

  for (var i = 0; i < list.size(); i++) {
    var rule = list.get(i);
    // Usually Rule has a decent toString(); if not, log what you can.
    logger.log(i + 1 + ') ' + rule);
  }
}

/**
 * Temporarily disable ALL rules in the current thread while doing changes.
 * This is a common admin pattern to prevent rule-triggered side effects.
 */
function example_disableRulesForCurrentThread_doWorkSafely() {
  logger.log('Disabling rules for current thread...');
  rules.disableRules();

  try {
    var node = companyhome.childByNamePath('Shared');
    if (!node) {
      logger.log('Node not found.');
      return;
    }

    // Do repo changes here that you do NOT want rules to react to
    // e.g. node.properties['cm:description'] = 'changed without rule side effects';
    // node.save();

    logger.log('Work done with rules disabled for this thread.');
  } finally {
    rules.enableRules();
    logger.log('Rules re-enabled for current thread.');
  }
}

/**
 * Disable rule evaluation for a specific node only (and re-enable it).
 * Useful when modifying a hot folder with expensive rules.
 */
function example_disableRulesForNodeTemporarily() {
  var node = companyhome.childByNamePath('Shared');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  logger.log('Before: rulesEnabled(node)=' + rules.rulesEnabled(node));
  rules.disableRules(node);
  logger.log('After disable: rulesEnabled(node)=' + rules.rulesEnabled(node));

  // do work against node here...

  rules.enableRules(node);
  logger.log('After enable: rulesEnabled(node)=' + rules.rulesEnabled(node));
}

/**
 * Disable / enable individual rules for a node.
 * This uses Rule objects returned from rules.getRules(node).
 */
function example_disableFirstRuleIfAny() {
  var node = companyhome.childByNamePath('Shared');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var list = rules.getRules(node);
  if (!list || list.size() === 0) {
    logger.log('No rules found.');
    return;
  }

  var rule = list.get(0);
  logger.log('Disabling rule: ' + rule);
  rules.disableRule(rule);

  // ...later...
  logger.log('Re-enabling rule: ' + rule);
  rules.enableRule(rule);
}

/**
 * Hard cleanup: remove all rules for a node.
 * This is destructive. Use carefully.
 */
function example_removeAllRules() {
  var node = companyhome.childByNamePath('Shared');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  logger.log('Removing all rules from node: ' + node.nodeRef);
  rules.removeAllRules(node);

  logger.log(
    'After removal: hasRules=' + rules.hasRules(node) + ', countRules=' + rules.countRules(node)
  );
}
