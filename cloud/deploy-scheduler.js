// Creates/updates one Cloud Scheduler job per entry in cloud/jobs.js that has a `cron`,
// each triggering the "dimeo-checkin" Cloud Run Job with that job's name as its argument.
// Removes Scheduler jobs for entries that no longer have a cron (e.g. moved to the planner).
// Usage: node cloud/deploy-scheduler.js [--dry]
const { spawnSync } = require('child_process');
const { jobs } = require('./jobs');

const PROJECT = process.env.GCP_PROJECT || 'cbr-automation-510513';
const REGION = process.env.GCP_REGION || 'australia-southeast1';
const SA = `dimeo-scheduler@${PROJECT}.iam.gserviceaccount.com`;
const uri = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/dimeo-checkin:run`;
const dry = process.argv.includes('--dry');

// gcloud.cmd under cmd.exe mangles args containing spaces, so run it through PowerShell
// (single-quoted args) on Windows, directly elsewhere.
const q = (a) => `'${String(a).replace(/'/g, "''")}'`;
function gcloud(args, { quiet = false } = {}) {
  if (dry) { console.log('gcloud', args.join(' ')); return { status: 0, stdout: '' }; }
  const r = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-Command', `gcloud.cmd ${args.map(q).join(' ')}`], { encoding: 'utf8' })
    : spawnSync('gcloud', args, { encoding: 'utf8' });
  if (!quiet) process.stdout.write(r.stdout || '');
  if (r.status !== 0 && !quiet) process.stderr.write(r.stderr || '');
  return r;
}

const wanted = new Set();
for (const [name, job] of Object.entries(jobs)) {
  if (!job.cron) continue;
  const sched = `dimeo-${name}`;
  wanted.add(sched);
  const exists = !dry && gcloud(['scheduler', 'jobs', 'describe', sched, '--location', REGION, '--project', PROJECT], { quiet: true }).status === 0;
  const body = JSON.stringify({ overrides: { containerOverrides: [{ args: [name] }] } });
  const args = [
    'scheduler', 'jobs', exists ? 'update' : 'create', 'http', sched,
    '--location', REGION, '--project', PROJECT,
    '--schedule', job.cron, '--time-zone', 'Australia/Sydney',
    '--uri', uri, '--http-method', 'POST', '--message-body', body,
    exists ? '--update-headers' : '--headers', 'Content-Type=application/json',
    '--oauth-service-account-email', SA,
    '--max-retry-attempts', '0', '--attempt-deadline', '60s',
  ];
  if (gcloud(args).status !== 0) { console.error(`FAILED: ${sched}`); process.exitCode = 1; }
}

// Prune stale dimeo-* Scheduler jobs that are no longer defined with a cron.
const list = gcloud(['scheduler', 'jobs', 'list', '--location', REGION, '--project', PROJECT, '--format=value(name.basename())'], { quiet: true });
for (const n of (list.stdout || '').split(/\s+/).filter((x) => x.startsWith('dimeo-') && !wanted.has(x))) {
  console.log(`Deleting stale scheduler job ${n}`);
  gcloud(['scheduler', 'jobs', 'delete', n, '--location', REGION, '--project', PROJECT, '--quiet']);
}
