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
 * Examples for Alfresco ScriptActionTrackingService root object: actionTrackingService
 *
 * Environment is expected to provide:
 *   - actionTrackingService (ScriptActionTrackingService)
 *   - actions                (ActionService root object, for some examples)
 *   - logger                 (JavascriptConsoleScriptLogger)
 *
 * These mirror the style of search.js, groups.js, actions.js, etc.
 */

/**
 * Helper: log a single ScriptExecutionDetails object defensively.
 *
 * The exact properties exposed by ScriptExecutionDetails vary by version,
 * so we only read common / likely fields if they exist.
 */
function logExecutionDetails(detail, index) {
  var idx = typeof index === 'number' ? '#' + index + ' ' : '';

  try {
    var actionType =
      detail.actionType ||
      (detail.getActionType ? detail.getActionType() : null) ||
      detail.type ||
      '';

    var status = detail.status || (detail.getStatus ? detail.getStatus() : null) || '';

    var started =
      detail.startedAt ||
      detail.startDate ||
      (detail.getStartedAt ? detail.getStartedAt() : null) ||
      (detail.getExecutionStartDate ? detail.getExecutionStartDate() : null) ||
      '';

    var ended =
      detail.endedAt ||
      detail.endDate ||
      (detail.getEndedAt ? detail.getEndedAt() : null) ||
      (detail.getExecutionEndDate ? detail.getExecutionEndDate() : null) ||
      '';

    var id = detail.id || detail.executionId || (detail.getId ? detail.getId() : null) || '';

    logger.log(
      idx +
        'Action execution ' +
        (id || '(no-id)') +
        ' type=' +
        actionType +
        ' status=' +
        status +
        ' started=' +
        started +
        ' ended=' +
        ended
    );
  } catch (e) {
    logger.warn('Could not introspect ScriptExecutionDetails: ' + e);
    logger.log('Raw details object: ' + detail);
  }
}

/**
 * List ALL currently executing actions.
 *
 * Returns an array of ScriptExecutionDetails.
 */
function example_actionTracking_getAllExecutingActions() {
  var running = actionTrackingService.getAllExecutingActions();
  logger.log('Currently executing actions: ' + running.length);

  for (var i = 0; i < running.length; i++) {
    logExecutionDetails(running[i], i);
  }

  if (running.length === 0) {
    logger.log('No actions are currently executing.');
  }
}

/**
 * List executing actions filtered by action type.
 *
 * The type is the action name, e.g. "transform", "add-features", "my-custom-action".
 */
function example_actionTracking_getExecutingActions_byType() {
  var type = 'transform'; // adjust to a real action type in your system

  var running = actionTrackingService.getExecutingActions(type);
  logger.log('Executing actions of type "' + type + '": ' + running.length + ' instance(s)');

  for (var i = 0; i < running.length; i++) {
    logExecutionDetails(running[i], i);
  }
}

/**
 * List executions for a specific Action instance.
 *
 * This is useful if you have a ScriptAction to track (e.g. you just created it).
 */
function example_actionTracking_getExecutingActions_forActionInstance() {
  // Create or obtain a ScriptAction instance
  var action = actions.create('transform');
  if (!action) {
    logger.warn('Could not create transform action; check your configuration.');
    return;
  }

  // In a real script you would execute the action somewhere, e.g.:
  // someNode.executeAction(action);
  // For this example we just show how to query:
  var running = actionTrackingService.getExecutingActions(action);

  logger.log(
    'Executing instances for provided action definition: ' + running.length + ' execution(s)'
  );

  for (var i = 0; i < running.length; i++) {
    logExecutionDetails(running[i], i);
  }
}

/**
 * Request cancellation of ALL currently executing actions.
 *
 * Be careful: this is a blunt instrument, usually only for admins or diagnostics.
 */
function example_actionTracking_cancelAllExecutingActions() {
  var running = actionTrackingService.getAllExecutingActions();
  logger.log('Found ' + running.length + ' executing action(s) to cancel.');

  for (var i = 0; i < running.length; i++) {
    var detail = running[i];
    logExecutionDetails(detail, i);

    logger.log('Requesting cancellation for execution #' + i);
    actionTrackingService.requestActionCancellation(detail);
  }

  if (running.length === 0) {
    logger.log('No executing actions to cancel.');
  }
}

/**
 * Cancel all executing actions of a given type.
 *
 * Example types:
 *   - "transform"
 *   - "execute-script"
 *   - "in-place-transform"
 *   - "my-custom-action"
 */
function example_actionTracking_cancelByType() {
  var type = 'transform';

  var running = actionTrackingService.getExecutingActions(type);
  logger.log('Found ' + running.length + ' executing action(s) of type "' + type + '" to cancel.');

  for (var i = 0; i < running.length; i++) {
    var detail = running[i];
    logExecutionDetails(detail, i);

    logger.log('Requesting cancellation for ' + type + ' #' + i);
    actionTrackingService.requestActionCancellation(detail);
  }

  if (running.length === 0) {
    logger.log('No executing actions of type "' + type + '" to cancel.');
  }
}

/**
 * Example: monitor long-running actions and cancel those that look "stuck".
 *
 * Since ScriptExecutionDetails doesn’t expose a strict API in JS docs,
 * we only use timestamps if they’re present.
 */
function example_actionTracking_cancelLongRunning() {
  // Threshold in milliseconds (e.g. 5 minutes)
  var thresholdMillis = 5 * 60 * 1000;
  var now = new Date().getTime();

  var running = actionTrackingService.getAllExecutingActions();
  logger.log('Scanning ' + running.length + ' executing action(s) for long-running ones.');

  for (var i = 0; i < running.length; i++) {
    var detail = running[i];

    var started =
      detail.startedAt ||
      detail.startDate ||
      (detail.getStartedAt ? detail.getStartedAt() : null) ||
      (detail.getExecutionStartDate ? detail.getExecutionStartDate() : null) ||
      null;

    var startedMillis = null;
    if (started && started.getTime) {
      startedMillis = started.getTime();
    }

    logExecutionDetails(detail, i);

    if (startedMillis === null) {
      logger.log('  -> No start time available, skipping timeout check.');
      continue;
    }

    var age = now - startedMillis;
    if (age > thresholdMillis) {
      logger.warn(
        '  -> Action has been running for ' +
          age +
          ' ms (over threshold ' +
          thresholdMillis +
          '), requesting cancellation.'
      );
      actionTrackingService.requestActionCancellation(detail);
    } else {
      logger.log('  -> Age ' + age + ' ms, under threshold, leaving running.');
    }
  }

  if (running.length === 0) {
    logger.log('No executing actions found; nothing to scan.');
  }
}
