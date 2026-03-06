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
 * JOBS ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root objects used here:
 *   - jobs             -> ScriptJobService (Quartz job access + scheduling)
 *   - cronExpressions  -> CronExpressions (helpful cron strings)
 *
 * Objects returned:
 *   - ScriptJob        -> job instance with runNow(), isRunning(), pauseJob(), resumeJob(), cancelRun(), deleteJob()
 */

/**
 * List all configured Quartz jobs.
 *
 * jobs.getAllJobs() returns a JavaScript array of ScriptJob objects.
 */
function example_getAllJobs() {
  var allJobs = jobs.getAllJobs();
  logger.log('Total jobs: ' + allJobs.length);

  for (var i = 0; i < allJobs.length; i++) {
    var job = allJobs[i];
    logger.log(
      'Job: ' +
        job.jobName +
        ' | Group: ' +
        job.groupName +
        ' | Trigger: ' +
        job.triggerName +
        ' | Next fire: ' +
        job.nextFireTime
    );
  }
}

/**
 * Print details for all jobs as a single formatted string.
 *
 * Equivalent to jobs.printJobDetails() which joins ScriptJob.toString() output.
 */
function example_printJobDetails() {
  var details = jobs.printJobDetails();
  logger.log('Job details:\n' + details);
}

/**
 * Get a single job by name.
 *
 * NOTE: jobName must match the Quartz job key name.
 */
function example_getJobByName() {
  var jobName = 'someJobName';
  var job = jobs.getJob(jobName);

  if (job) {
    logger.log('Found job: ' + job.jobName);
    logger.log('Group: ' + job.groupName);
    logger.log('Prev fire time: ' + job.previousFireTime);
    logger.log('Next fire time: ' + job.nextFireTime);
    logger.log('Cron: ' + job.cronExpression);
  } else {
    logger.log('No job found with name: ' + jobName);
  }
}

/**
 * Trigger a job run immediately.
 *
 * Calls ScriptJob.runNow()
 */
function example_runJobNow() {
  var jobName = 'someJobName';
  var job = jobs.getJob(jobName);

  if (!job) {
    logger.log('No job found: ' + jobName);
    return;
  }

  job.runNow();
  logger.log('Triggered job: ' + job.jobName);
}

/**
 * Check if a job is currently running.
 *
 * Calls ScriptJob.isRunning()
 */
function example_isJobRunning() {
  var jobName = 'someJobName';
  var job = jobs.getJob(jobName);

  if (!job) {
    logger.log('No job found: ' + jobName);
    return;
  }

  var running = job.isRunning();
  logger.log('Job ' + job.jobName + ' running: ' + running);
}

/**
 * Pause a specific job.
 */
function example_pauseJob() {
  var jobName = 'someJobName';
  var job = jobs.getJob(jobName);

  if (!job) {
    logger.log('No job found: ' + jobName);
    return;
  }

  job.pauseJob();
  logger.log('Paused job: ' + job.jobName);
}

/**
 * Resume a paused job.
 */
function example_resumeJob() {
  var jobName = 'someJobName';
  var job = jobs.getJob(jobName);

  if (!job) {
    logger.log('No job found: ' + jobName);
    return;
  }

  job.resumeJob();
  logger.log('Resumed job: ' + job.jobName);
}

/**
 * Cancel / unschedule a job trigger.
 *
 * This removes the trigger for that job by trigger key.
 * Calls ScriptJob.cancelRun()
 */
function example_cancelJobTrigger() {
  var jobName = 'someJobName';
  var job = jobs.getJob(jobName);

  if (!job) {
    logger.log('No job found: ' + jobName);
    return;
  }

  job.cancelRun();
  logger.log('Unscheduled trigger for job: ' + job.jobName);
}

/**
 * Delete a job from Quartz.
 *
 * Calls ScriptJob.deleteJob()
 * WARNING: This deletes the job definition.
 */
function example_deleteJob() {
  var jobName = 'someJobName';
  var job = jobs.getJob(jobName);

  if (!job) {
    logger.log('No job found: ' + jobName);
    return;
  }

  job.deleteJob();
  logger.log('Deleted job: ' + job.jobName);
}

/**
 * Pause ALL scheduled jobs.
 *
 * Calls jobs.pauseJobs()
 */
function example_pauseAllJobs() {
  jobs.pauseJobs();
  logger.log('Paused all Quartz jobs.');
}

/**
 * Resume ALL paused jobs.
 *
 * Calls jobs.resumeJobs()
 */
function example_resumeAllJobs() {
  jobs.resumeJobs();
  logger.log('Resumed all Quartz jobs.');
}

/**
 * Put scheduler into standby.
 *
 * Calls jobs.standbyScheduler()
 * Quartz will not execute triggers while in standby.
 */
function example_standbyScheduler() {
  jobs.standbyScheduler();
  logger.log('Scheduler is now in standby mode.');
}

/**
 * Start scheduler (if it was stopped).
 *
 * Calls jobs.startScheduler()
 */
function example_startScheduler() {
  jobs.startScheduler();
  logger.log('Scheduler started.');
}

/**
 * Schedule a temporary job using the "simple" API:
 *
 * jobs.scheduleTemporaryJob(jobName, scriptString, runAsUser, cronExpression)
 *
 * runAsUser:
 *   - null or "system" -> runs as system
 *   - any username     -> runs as that user
 */
function example_scheduleTemporaryJob_simple() {
  var jobName = 'My Temp Job';
  var runAsUser = 'system';

  // example cron: every minute
  var cron = cronExpressions.EVERY_MINUTE;

  // script will be executed in repo JS context
  var script =
    '' +
    "logger.log('Hello from scheduled inline script');\n" +
    "logger.log('Current user: ' + person.properties['cm:userName']);\n";

  jobs.scheduleTemporaryJob(jobName, script, runAsUser, cron);
  logger.log('Scheduled temporary job: ' + jobName + ' with cron: ' + cron);
}

/**
 * Schedule a temporary job using the "parameter object" API:
 *
 * jobs.scheduleTemporaryJob({
 *   jobName: "...",
 *   runAs: "...",
 *   cronExpression: "...",
 *   script: function() { ... }
 * })
 *
 * NOTE: In Java, the function body is decompiled and stored as script text.
 */
function example_scheduleTemporaryJob_parameterObject() {
  var params = {
    jobName: 'Inline Script Job Example',
    runAs: 'system',
    cronExpression: cronExpressions.EVERY_TWO_MINUTES,

    // IMPORTANT: this must be a function, not a string
    script: function () {
      logger.log('Running scheduled JS function...');
      logger.log('Now: ' + new Date());
    },
  };

  var createdJobName = jobs.scheduleTemporaryJob(params);
  logger.log('Scheduled job created: ' + createdJobName);
}

/**
 * Quick reference: available cron expressions.
 */
function example_showCronExpressions() {
  logger.log('EVERY_TEN_SECONDS: ' + cronExpressions.EVERY_TEN_SECONDS);
  logger.log('EVERY_TWENTY_SECONDS: ' + cronExpressions.EVERY_TWENTY_SECONDS);

  logger.log('EVERY_MINUTE: ' + cronExpressions.EVERY_MINUTE);
  logger.log('EVERY_TWO_MINUTES: ' + cronExpressions.EVERY_TWO_MINUTES);
  logger.log('EVERY_FIVE_MINUTES: ' + cronExpressions.EVERY_FIVE_MINUTES);

  logger.log('EVERY_HOUR: ' + cronExpressions.EVERY_HOUR);
  logger.log('EVERY_TWO_HOURS: ' + cronExpressions.EVERY_TWO_HOURS);
  logger.log('EVERY_THREE_HOURS: ' + cronExpressions.EVERY_THREE_HOURS);
}

/**
 * Example: schedule a job, then immediately lookup and check status.
 */
function example_scheduleThenVerify() {
  var params = {
    jobName: 'Temp Job Verify Example',
    runAs: 'system',
    cronExpression: cronExpressions.EVERY_MINUTE,
    script: function () {
      logger.log('Temp job running...');
    },
  };

  var createdJobName = jobs.scheduleTemporaryJob(params);
  logger.log('Created job: ' + createdJobName);

  // createdJobName is the FULL job name including "(run as ...)"
  var job = jobs.getJob(createdJobName);

  if (job) {
    logger.log('Verified job exists.');
    logger.log('Next fire time: ' + job.nextFireTime);
    logger.log('Running now? ' + job.isRunning());
  } else {
    logger.log(
      'Could not re-load job by name. Note: job name must match Quartz job key name exactly.'
    );
  }
}
