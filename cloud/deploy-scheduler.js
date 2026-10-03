// Creates/updates one Cloud Scheduler job per entry in cloud/jobs.js, each triggering the
// "dimeo-checkin" Cloud Run Job with that job's name as its argument.
// Usage: node cloud/deploy-scheduler.js [--dry]
const { spawnSync } = require('child_process');
const { jobs } = require('./jobs');

const PROJECT = process.env.GCP_PROJECT || 'cbr-automation-510513';
const REGION = process.env.GCP_REGION || 'australia-southeast1';
const SA = `dimeo-scheduler@${PROJECT}.iam.gserviceaccount.com`;
const uri = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/dimeo-checkin:run`;
const dry = process.argv.includes('--dry');

const gcloud = (args) => {
  if (dry) { console.log('gcloud', args.join(' ')); return 0; }
  return spawnSync('gcloud.cmd', args, { stdio: 'inherit', shell: true }).status;
};
const exists = (n) => !dry && spawnSync('gcloud.cmd', ['scheduler', 'jobs', 'describe', n, '--location', REGION, '--project', PROJECT], { stdio: 'ignore', shell: true }).status === 0;

for (const [name, job] of Object.entries(jobs)) {
  const sched = `dimeo-${name}`;
  const body = JSON.stringify({ overrides: { containerOverrides: [{ args: [name] }] } });
  const args = [
    'scheduler', 'jobs', exists(sched) ? 'update' : 'create', 'http', sched,
    '--location', REGION, '--project', PROJECT,
    '--schedule', `"${job.cron}"`, '--time-zone', 'Australia/Sydney',
    '--uri', uri, '--http-method', 'POST',
    '--message-body', `"${body.replace(/"/g, '\\"')}"`,
    '--headers', 'Content-Type=application/json',
    '--oauth-service-account-email', SA,
    '--max-retry-attempts', '0', '--attempt-deadline', '60s',
  ];
  if (gcloud(args) !== 0) { console.error(`FAILED: ${sched}`); process.exitCode = 1; }
}
