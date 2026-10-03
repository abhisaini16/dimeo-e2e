// Entry point for the Cloud Run Job: `node cloud/run-job.js <job-name>`. Runs the site's
// decide script first (same gating the GitHub workflows used), then the real
// check-in/out script. Exit code 0 on success/no-op, non-zero on failure. Scripts'
// own stdout/stderr go straight to Cloud Logging.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { jobs } = require('./jobs');

const ROOT = path.join(__dirname, '..');
const SECRET_SRC = process.env.SITES_SECRET_PATH || '/secrets/checkin-sites.json';
const SECRET_DST = path.join(ROOT, 'tests/data/checkin-sites.json');
if (fs.existsSync(SECRET_SRC)) fs.copyFileSync(SECRET_SRC, SECRET_DST);

const name = process.argv[2];
const job = jobs[name];
if (!job) { console.error(`Unknown job "${name}". Known: ${Object.keys(jobs).join(', ')}`); process.exit(2); }

const run = (script, env) => spawnSync('node', [script], { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' }).status;

console.log(`[${new Date().toISOString()}] job ${name} start`);
if (job.decide) {
  const out = path.join(os.tmpdir(), `decide-${name}.out`);
  fs.writeFileSync(out, '');
  const code = run(job.decide, { ...job.env, GITHUB_OUTPUT: out });
  if (code !== 0) { console.error(`decide exited ${code}`); process.exit(1); }
  if (!/should_act=true/.test(fs.readFileSync(out, 'utf8'))) { console.log('decide: nothing to do this tick'); process.exit(0); }
}
const code = run(job.script, job.env);
console.log(`job ${name} done: ${job.script} exited ${code}`);
process.exit(code === 0 ? 0 : 1);
