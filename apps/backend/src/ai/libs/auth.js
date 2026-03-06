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
 * AUTH ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - auth -> ScriptAuthentication (wraps AuthenticationUtil context switching)
 *
 * WARNING:
 *   - All runAs methods require admin authority (checked via AuthorityService).
 *   - Switching the authentication context affects all subsequent repository operations
 *     within the same script execution.
 *   - Always restore the previous context when you’re done (use try/finally).
 *
 * Available methods:
 *   - auth.runAsSystem()
 *   - auth.runAs(userName)
 *   - auth.runAsFullyAuthenticatedUser(userName)
 *   - auth.getRunAsUser()
 *   - auth.getFullyAuthenticatedUser()
 *   - auth.getSystemUserName()
 *   - auth.getAdminUserName()
 */

/**
 * Print out the current authentication context.
 */
function example_printAuthContext() {
  logger.log('RunAs user: ' + auth.getRunAsUser());
  logger.log('Fully authenticated user: ' + auth.getFullyAuthenticatedUser());
  logger.log('System user name: ' + auth.getSystemUserName());
  logger.log('Admin user name: ' + auth.getAdminUserName());
}

/**
 * Switch to system user.
 *
 * Requires admin authority.
 */
function example_runAsSystem() {
  logger.log('Before runAsSystem: runAs=' + auth.getRunAsUser());
  auth.runAsSystem();
  logger.log('After runAsSystem: runAs=' + auth.getRunAsUser());
}

/**
 * Switch runAs context to another user.
 *
 * Requires admin authority.
 *
 * NOTE:
 *   This does NOT change fully authenticated user.
 */
function example_runAsUser() {
  var targetUser = 'jdoe';

  logger.log(
    'Before: runAs=' + auth.getRunAsUser() + ', fullyAuth=' + auth.getFullyAuthenticatedUser()
  );
  auth.runAs(targetUser);
  logger.log(
    'After: runAs=' + auth.getRunAsUser() + ', fullyAuth=' + auth.getFullyAuthenticatedUser()
  );
}

/**
 * Switch fully authenticated user (hard switch).
 *
 * Requires admin authority.
 *
 * This changes the "base identity" and will typically impact permission checks
 * and auditing differently than runAs() overlays.
 */
function example_runAsFullyAuthenticatedUser() {
  var targetUser = 'jdoe';

  logger.log(
    'Before: runAs=' + auth.getRunAsUser() + ', fullyAuth=' + auth.getFullyAuthenticatedUser()
  );
  auth.runAsFullyAuthenticatedUser(targetUser);
  logger.log(
    'After: runAs=' + auth.getRunAsUser() + ', fullyAuth=' + auth.getFullyAuthenticatedUser()
  );
}

/**
 * Safe pattern: temporarily run as another user, then restore the original context.
 *
 * This is the pattern you want in real scripts.
 */
function example_runAsUser_withRestore() {
  var originalRunAs = auth.getRunAsUser();
  var originalFullyAuth = auth.getFullyAuthenticatedUser();

  var targetUser = 'jdoe';

  logger.log('Original runAs: ' + originalRunAs);
  logger.log('Original fullyAuth: ' + originalFullyAuth);

  try {
    auth.runAs(targetUser);
    logger.log('Now running as: ' + auth.getRunAsUser());

    // Do work as target user...
    // e.g. read something, create content, run searches, etc.
    logger.log('Doing some work as ' + targetUser);
  } finally {
    // Restore original context
    // IMPORTANT: your ScriptAuthentication wrapper does not provide a direct "clear" method,
    // so we restore explicitly using runAsFullyAuthenticatedUser + runAs.
    //
    // This is the closest equivalent to AuthenticationUtil.clearCurrentSecurityContext()
    // in pure script context.
    auth.runAsFullyAuthenticatedUser(originalFullyAuth);
    auth.runAs(originalRunAs);

    logger.log('Restored runAs: ' + auth.getRunAsUser());
    logger.log('Restored fullyAuth: ' + auth.getFullyAuthenticatedUser());
  }
}

/**
 * Safe pattern: temporarily run as system, then restore.
 */
function example_runAsSystem_withRestore() {
  var originalRunAs = auth.getRunAsUser();
  var originalFullyAuth = auth.getFullyAuthenticatedUser();

  logger.log('Original runAs: ' + originalRunAs);
  logger.log('Original fullyAuth: ' + originalFullyAuth);

  try {
    auth.runAsSystem();
    logger.log('Now running as system: ' + auth.getRunAsUser());

    // Do privileged work...
    logger.log('Doing privileged work as system.');
  } finally {
    auth.runAsFullyAuthenticatedUser(originalFullyAuth);
    auth.runAs(originalRunAs);

    logger.log('Restored runAs: ' + auth.getRunAsUser());
    logger.log('Restored fullyAuth: ' + auth.getFullyAuthenticatedUser());
  }
}

/**
 * Example: check whether you are allowed to switch auth context.
 *
 * If you are not admin, runAs(...) will throw:
 *   "Only admin users are allowed to use the runAs methods"
 */
function example_tryRunAs_catchError() {
  try {
    auth.runAsSystem();
    logger.log('Switched to system user successfully.');
  } catch (e) {
    logger.log('Could not runAsSystem(). Are you admin? Error: ' + e);
  }
}
