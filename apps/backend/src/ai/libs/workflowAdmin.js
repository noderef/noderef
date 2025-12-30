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
 * workflowAdmin root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - workflowAdmin -> ScriptWorkflowConsole
 *
 * API:
 *   - workflowAdmin.exec(command) -> String
 *
 * Notes:
 *   - Thin wrapper around org.alfresco.repo.workflow.WorkflowInterpreter
 *   - Command set depends on Alfresco version
 *   - Best practice: start with workflowAdmin.exec("help")
 */

/**
 * Helper: run a command and log the result.
 */
function wfExec(cmd) {
  var output = workflowAdmin.exec(cmd);
  logger.log("workflowAdmin.exec('" + cmd + "') ->\n" + output);
  return output;
}

/**
 * Discover supported commands.
 */
function example_workflowAdmin_help() {
  wfExec('help');
}

/**
 * Typical: show currently running workflows / instances.
 * (Command names vary between versions; check help output.)
 */
function example_workflowAdmin_listActive() {
  wfExec('show workflows'); // Example command (verify via help)
  wfExec('show active'); // Example command (verify via help)
  wfExec('show instances'); // Example command (verify via help)
}

/**
 * Typical: show workflow definitions / deployed workflow types.
 */
function example_workflowAdmin_showDefinitions() {
  wfExec('show definitions'); // Example command (verify via help)
  wfExec('show deployed'); // Example command (verify via help)
}

/**
 * Typical: inspect a workflow instance by ID.
 * Replace <id> with a real workflow instance ID.
 */
function example_workflowAdmin_showInstance() {
  var id = 'activiti$12345'; // placeholder
  wfExec('show workflow ' + id);
}

/**
 * Typical: cancel / delete a workflow instance by ID.
 * Replace <id> with a real ID.
 */
function example_workflowAdmin_cancelInstance() {
  var id = 'activiti$12345'; // placeholder
  wfExec('cancel workflow ' + id);
}

/**
 * Batch-style cancellation using a list of IDs (manual, but useful).
 */
function example_workflowAdmin_cancelMany() {
  var ids = ['activiti$10001', 'activiti$10002', 'activiti$10003'];

  for (var i = 0; i < ids.length; i++) {
    try {
      wfExec('cancel workflow ' + ids[i]);
    } catch (e) {
      logger.error('Failed to cancel workflow ' + ids[i] + ': ' + e);
    }
  }
}

/**
 * Safe pattern: validate command availability first.
 * This avoids failures when commands differ between versions.
 */
function example_workflowAdmin_safeExec() {
  var help = wfExec('help');

  function hasCmd(keyword) {
    return help && help.indexOf(keyword) !== -1;
  }

  if (hasCmd('show definitions')) {
    wfExec('show definitions');
  } else {
    logger.warn("Command 'show definitions' not supported in this version.");
  }
}
