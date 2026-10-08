// Checks out of Canberra-GPO (Rajat's account) at today's deterministic target: the
// same check-in moment computed by run-city-post-rajat-checkin.js, plus a 150-165 min
// delay (also derived from today's date hash) — see lib/city-post-rajat-schedule.js.
// One invocation per day.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');
const { sydneyNow, computeTargets } = require('./lib/city-post-rajat-schedule');

(async () => {
  const entry = sitesList.find((s) => s.id === 'city-post-rajat');
  if (!entry) throw new Error('No "city-post-rajat" entry in tests/data/checkin-sites.json');

  if (process.env.MANUAL_RUN !== 'true') {
    const now = sydneyNow();
    const targets = computeTargets(now);
    if (!targets) {
      console.log('Today has no Canberra-GPO (Rajat) window (Sunday) — proceeding immediately to confirm via the live portal.');
    } else {
      const waitMs = targets.checkoutTarget - now;
      if (waitMs > 0 && waitMs < 40 * 60_000) {
        console.log(`Waiting ${(waitMs / 60000).toFixed(1)} min to land check-out at ${targets.checkoutTarget.toTimeString().slice(0, 8)} Sydney time (+${targets.delayMin} min after today's check-in target, ${targets.dayType})...`);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        console.log(`Target (${targets.checkoutTarget.toTimeString().slice(0, 8)}) is not in the near future from now (${now.toTimeString().slice(0, 8)}) — proceeding immediately.`);
      }
    }
  } else {
    console.log('Manual run — skipping wait, checking out immediately.');
  }

  const group = { id: 'city-post-rajat-checkout', label: 'Canberra-GPO (Rajat) (check-out)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkout' });

  console.log('\n=== Canberra-GPO (Rajat) check-out result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Canberra-GPO (Rajat) Check-out', nowStr);

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Canberra-GPO (Rajat) Check-out', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
