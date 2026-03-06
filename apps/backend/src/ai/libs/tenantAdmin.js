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
 * Tenant Admin root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - tenantAdmin -> ScriptTenantAdminConsole (wraps TenantInterpreter)
 *
 * API:
 *   - tenantAdmin.exec(command) -> String
 *
 * Notes:
 *   - This is essentially a scripting gateway to the same commands used
 *     in the Tenant Admin Console (tenantinterpreter).
 *   - Exact command set depends on Alfresco version + what TenantInterpreter supports.
 *   - Treat this as admin-only functionality: it can create/delete tenants.
 */

/**
 * Print the help text for tenant admin console commands.
 */
function example_tenantAdmin_help() {
  var out = tenantAdmin.exec('help');
  logger.log(out);
}

/**
 * List tenants (common command).
 * Some versions use "show tenants" or just "show".
 * Run help first if you're unsure.
 */
function example_tenantAdmin_listTenants() {
  var out = tenantAdmin.exec('show tenants');
  logger.log(out);
}

/**
 * Show details about a specific tenant (command varies by version).
 * Often is something like: "show tenant <tenantDomain>"
 */
function example_tenantAdmin_showTenantDetails() {
  var tenantDomain = 'example.com'; // tenant identifier / domain depending on config
  var out = tenantAdmin.exec('show tenant ' + tenantDomain);
  logger.log(out);
}

/**
 * Create a tenant.
 * Command syntax depends on Alfresco. Some interpreters use:
 *   create <tenantDomain> <adminPassword>
 * or:
 *   createTenant <tenantDomain> <adminPassword>
 *
 * ALWAYS validate with help output in your environment.
 */
function example_tenantAdmin_createTenant() {
  var tenantDomain = 'tenant1.example.com';
  var adminPassword = 'ChangeThisPassword!';

  // Example command string - verify syntax via tenantAdmin.exec('help')
  var cmd = 'create ' + tenantDomain + ' ' + adminPassword;

  var out = tenantAdmin.exec(cmd);
  logger.log(out);
}

/**
 * Delete a tenant.
 * Command syntax depends on Alfresco. Often:
 *   delete <tenantDomain>
 * Possibly requires confirmation flags depending on interpreter implementation.
 */
function example_tenantAdmin_deleteTenant() {
  var tenantDomain = 'tenant1.example.com';

  // Example command string - verify syntax via tenantAdmin.exec('help')
  var cmd = 'delete ' + tenantDomain;

  var out = tenantAdmin.exec(cmd);
  logger.log(out);
}

/**
 * Safe wrapper: run a tenantAdmin command and print output,
 * but also log the command being executed.
 */
function example_tenantAdmin_execSafely() {
  var cmd = 'show tenants';
  logger.log('Executing tenantAdmin command: ' + cmd);

  try {
    var out = tenantAdmin.exec(cmd);
    logger.log(out);
  } catch (e) {
    logger.log('tenantAdmin.exec failed: ' + e);
  }
}
