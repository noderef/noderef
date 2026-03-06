/**
 * Copyright 2025-2026 NodeRef
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
 * RepoAdmin root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - repoAdmin -> ScriptRepoAdminConsole (wraps RepoAdminInterpreter)
 *
 * API:
 *   - repoAdmin.exec(command: String): String
 *
 * Notes:
 *   - This runs the same command interpreter used by the Repo Admin Console.
 *   - Output is a String. Some commands may change repo state (deploy models/messages etc).
 *   - Access control depends on how the underlying console/interpreter is secured.
 */

/**
 * Run "help" to list available commands.
 */
function example_repoAdmin_help() {
  var out = repoAdmin.exec('help');
  logger.log('repoAdmin help:\n' + out);
}

/**
 * Run a command and print output with a header.
 */
function example_repoAdmin_exec_generic() {
  var cmd = 'help'; // replace with your command
  logger.log('Executing repoAdmin command: ' + cmd);

  var out = repoAdmin.exec(cmd);
  logger.log('Command output:\n' + out);
}

/**
 * Example: Show current status / environment-style info (depends on interpreter commands).
 *
 * These are common console-like patterns, but actual available commands depend on RepoAdminInterpreter.
 * If a command is not supported, output will typically include an error message.
 */
function example_repoAdmin_info_likeCommands() {
  var commands = ['help', 'version', 'status', 'modules'];

  for (var i = 0; i < commands.length; i++) {
    var cmd = commands[i];
    logger.log('\n=== repoAdmin.exec("' + cmd + '") ===');

    try {
      var out = repoAdmin.exec(cmd);
      logger.log(out);
    } catch (e) {
      logger.log('Error executing "' + cmd + '": ' + e);
    }
  }
}

/**
 * Example: Deploy messages / models (if supported by your RepoAdminInterpreter).
 *
 * Many people use Repo Admin Console to deploy:
 *   - message bundles
 *   - custom models
 *
 * The actual commands vary by Alfresco version + console implementation.
 * So this example keeps it safe: it shows how to run the command, not which command is guaranteed.
 */
function example_repoAdmin_deploy_likeCommand() {
  // Replace with the exact command syntax supported by your RepoAdminInterpreter.
  var cmd = 'deploy'; // e.g. "deploy messages", "deploy model", etc.

  logger.log('Attempting deploy command: ' + cmd);
  var out = repoAdmin.exec(cmd);
  logger.log('Deploy output:\n' + out);
}
