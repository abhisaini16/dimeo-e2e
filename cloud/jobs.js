// Single source of truth for every Cloud Run Job invocation. run-job.js uses it to know
// what to run; deploy-scheduler.js creates a Cloud Scheduler job for each entry with a
// `cron`; planner.js enqueues a Cloud Task at the exact random target time for each
// `now-*` entry. Times are Australia/Sydney (Scheduler handles DST itself).
//
// Design: instead of starting each job early and sleeping inside the container (billed
// the whole time), a planner runs once each morning, computes today's deterministic
// targets from scripts/lib/<site>-schedule.js, and schedules one short job per action.
// Those jobs set MANUAL_RUN=true so the script acts immediately rather than sleeping.
const SITES = ['yass', 'cooma', 'macquarie', 'queenbeyan', 'kingston', 'fyshwick', 'belconnen', 'weston', 'greenway',
  'bega-po', 'merimbula', 'griffith', 'narooma', 'mawson', 'phillip', 'mitchell', 'city-post'];

const jobs = {};
for (const site of SITES) {
  for (const action of ['checkin', 'checkout']) {
    jobs[`now-${site}-${action}`] = { script: `scripts/run-${site}-${action}.js`, env: { MANUAL_RUN: 'true' } };
  }
}

// Fixed-time jobs that still run straight from Cloud Scheduler.
jobs['daily-batch'] = { script: 'scripts/run-checkin-final.js', env: {}, cron: '0 18 * * 1-5' };
jobs['bega-medical'] = { script: 'scripts/run-bega-medical.js', env: {}, cron: '0 22 * * 1-5' };

// Morning planner (second run is a safety net — task names are deterministic so re-runs
// never duplicate anything, and targets already in the past are skipped).
jobs['planner'] = { script: 'cloud/planner.js', env: {}, cron: '5 0 * * *' };
jobs['planner-retry'] = { script: 'cloud/planner.js', env: {}, cron: '0 3 * * *' };

// Manual-only test jobs (no schedule).
jobs['cloud-test'] = { script: 'scripts/run-cloud-test.js', env: {} };
jobs['cloud-test-bega'] = { script: 'scripts/run-cloud-test.js', env: { TEST_SITE: 'Bega-Medical' } };

module.exports = { jobs, SITES };
