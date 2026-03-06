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
 * BATCHEXECUTER ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - batchExecuter -> ScriptBatchExecuter
 *
 * Supports:
 *   - batchExecuter.processArray({ items: [...], onNode: fn, batchSize, threads, disableRules })
 *   - batchExecuter.processArray({ items: [...], onBatch: fn, batchSize, threads, disableRules })
 *   - batchExecuter.processFolderRecursively({ root: <ScriptNode>, onNode|onBatch, batchSize, threads, disableRules })
 *   - batchExecuter.getCurrentJobs()
 *   - batchExecuter.cancelJob(jobId)
 *
 * Key rules:
 *   - Exactly one of onNode or onBatch must be provided.
 *   - onNode is called for EACH item (or node) individually.
 *   - onBatch is called for EACH batch (as a JS array).
 *
 * Return values:
 *   - processArray(...) returns job NAME (not job ID)
 *   - processFolderRecursively(...) returns job NAME (not job ID)
 *   - job ID exists internally but is not returned from the public script API.
 *
 * Note on cancel:
 *   cancelJob(jobId) expects a job ID, but the public API returns job NAME.
 *   So cancellation only works if you can get the ID from getCurrentJobs().
 */

/**
 * Process an array of simple values (strings) with onNode().
 */
function example_processArray_simple_onNode() {
  var params = {
    items: ['a', 'b', 'c', 'd'],
    batchSize: 2,
    threads: 2,

    // optional: skip rules (only relevant for node operations, but harmless here)
    disableRules: false,

    onNode: function (item) {
      logger.log('Processing item: ' + item);
    },
  };

  var jobName = batchExecuter.processArray(params);
  logger.log('Started job: ' + jobName);
}

/**
 * Process an array of ScriptNodes with onNode().
 *
 * Example use case: apply some change to each node.
 */
function example_processArray_nodes_onNode() {
  var root = companyhome.childByNamePath('Shared');
  if (!root) {
    logger.log('No Shared folder found.');
    return;
  }

  // Build a small node list (documents only)
  var docs = [];
  var children = root.children;
  for (var i = 0; i < children.length; i++) {
    if (children[i].isDocument) {
      docs.push(children[i]);
    }
  }

  if (docs.length === 0) {
    logger.log('No documents found to process.');
    return;
  }

  var params = {
    items: docs,
    batchSize: 10,
    threads: 4,
    disableRules: true,

    onNode: function (node) {
      // node may be a NativeJavaObject wrapping ScriptNode
      // but in most script environments you can treat it like ScriptNode
      logger.log('Node: ' + node.name + ' -> ' + node.nodeRef);
      // Example: read a property
      var title = node.properties['cm:title'];
      if (title) {
        logger.log('  title: ' + title);
      }
    },
  };

  var jobName = batchExecuter.processArray(params);
  logger.log('Started job: ' + jobName + ' for ' + docs.length + ' nodes');
}

/**
 * Process an array using onBatch() instead of onNode().
 *
 * onBatch gets a JS array (NativeArray) of items for each batch.
 */
function example_processArray_simple_onBatch() {
  var params = {
    items: ['one', 'two', 'three', 'four', 'five'],
    batchSize: 2,
    threads: 2,
    disableRules: false,

    onBatch: function (items) {
      logger.log('Batch received of size: ' + items.length);
      for (var i = 0; i < items.length; i++) {
        logger.log('  item: ' + items[i]);
      }

      // Optional: return an array of "results"
      // (worker logs trace-level counts if return value is an array)
      return items;
    },
  };

  var jobName = batchExecuter.processArray(params);
  logger.log('Started batch job: ' + jobName);
}

/**
 * Process a folder recursively (all folders + docs) using onNode().
 *
 * root MUST be a ScriptNode.
 */
function example_processFolderRecursively_onNode() {
  var root = companyhome.childByNamePath('Shared');
  if (!root) {
    logger.log('No Shared folder found.');
    return;
  }

  var params = {
    root: root,
    batchSize: 100,
    threads: 4,
    disableRules: true,

    onNode: function (node) {
      // Includes both folders and docs
      logger.log('Visited: ' + node.name + ' (' + node.nodeRef + ')');
    },
  };

  var jobName = batchExecuter.processFolderRecursively(params);
  logger.log('Started recursive folder job: ' + jobName);
}

/**
 * Process a folder recursively using onBatch().
 *
 * onBatch receives a JS array of ScriptNodes.
 */
function example_processFolderRecursively_onBatch() {
  var root = companyhome.childByNamePath('Shared');
  if (!root) {
    logger.log('No Shared folder found.');
    return;
  }

  var params = {
    root: root,
    batchSize: 50,
    threads: 4,
    disableRules: true,

    onBatch: function (nodes) {
      logger.log('Processing batch of nodes: ' + nodes.length);

      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.isDocument) {
          logger.log('  doc: ' + node.name);
        } else {
          logger.log('  folder: ' + node.name);
        }
      }

      // return array to allow trace-level reporting
      return nodes;
    },
  };

  var jobName = batchExecuter.processFolderRecursively(params);
  logger.log('Started recursive folder batch job: ' + jobName);
}

/**
 * List currently running jobs.
 *
 * getCurrentJobs() returns a collection of BatchJobParameters objects.
 * These contain:
 *   - id
 *   - name
 *   - status (RUNNING / FINISHED / CANCELED)
 *   - threads, batchSize, disableRules
 *   - onNodeFunction or onBatchFunction (decompiled function source)
 */
function example_getCurrentJobs() {
  var jobs = batchExecuter.getCurrentJobs();

  logger.log('Currently running jobs: ' + jobs.length);

  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    logger.log(
      'Job: ' +
        job.name +
        ' | id=' +
        job.id +
        ' | status=' +
        job.status +
        ' | threads=' +
        job.threads +
        ' | batchSize=' +
        job.batchSize +
        ' | disableRules=' +
        job.disableRules
    );
  }
}

/**
 * Cancel a job by ID.
 *
 * IMPORTANT:
 *   processArray(...) returns the job NAME, but cancelJob() expects job ID.
 *   So you must call getCurrentJobs() first to find the ID.
 */
function example_cancelJobByName() {
  var targetJobName = 'BatchExecuter_someName_xxxx'; // example
  var jobs = batchExecuter.getCurrentJobs();

  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (job.name === targetJobName) {
      var cancelled = batchExecuter.cancelJob(job.id);
      logger.log('Cancel requested for job ' + job.name + ' (id=' + job.id + '): ' + cancelled);
      return;
    }
  }

  logger.log('No running job found with name: ' + targetJobName);
}

/**
 * A safer pattern: store the job list before starting, start a job,
 * then find the new job by diffing job IDs.
 *
 * This gives you the ID so you can cancel if needed.
 */
function example_startJob_and_captureId() {
  var before = toIdSet(batchExecuter.getCurrentJobs());

  var params = {
    items: ['x', 'y', 'z'],
    batchSize: 1,
    threads: 1,
    disableRules: false,
    onNode: function (item) {
      logger.log('Working on: ' + item);
    },
  };

  var jobName = batchExecuter.processArray(params);
  logger.log('Started job: ' + jobName);

  var afterJobs = batchExecuter.getCurrentJobs();

  var newJobId = null;
  for (var i = 0; i < afterJobs.length; i++) {
    var job = afterJobs[i];
    if (!before[job.id]) {
      newJobId = job.id;
      logger.log('Detected new job ID: ' + newJobId);
      break;
    }
  }

  if (!newJobId) {
    logger.log('Could not detect job ID (job may have finished quickly).');
  }
}

/**
 * Helper: convert jobs collection into a quick lookup map by job ID.
 */
function toIdSet(jobs) {
  var map = {};
  for (var i = 0; i < jobs.length; i++) {
    map[jobs[i].id] = true;
  }
  return map;
}
