// Checks out of Dickson at today's deterministic target: the same check-in moment
// computed by run-dickson-checkin.js, plus a 60-70 min delay (also derived from today's
// date hash, so this script independently arrives at the identical target without
// needing to read any state back from the check-in run). One invocation per day.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');
const { sydneyNow, computeTargets } = require('./lib/dickson-schedule');

(async () => {
  const entry = sitesList.find((s) => s.id === 'dickson');
  if (!entry) throw new Error('No "dickson" entry in tests/data/checkin-sites.json');

  if (process.env.MANUAL_RUN !== 'true') {
    const now = sydneyNow();
    const { checkoutTarget, delayMin } = computeTargets(now);
    const waitMs = checkoutTarget - now;
    // Threshold covers the full possible range from this trigger's reference point
    // (earliest target is 5 min out, latest is 35 min out) so this always waits for
    // the precise target rather than ever firing early.
    if (waitMs > 0 && waitMs < 40 * 60_000) {
      console.log(`Waiting ${(waitMs / 60000).toFixed(1)} min to land check-out at ${checkoutTarget.toTimeString().slice(0, 8)} Sydney time (+${delayMin} min after today's check-in target)...`);
      await new Promise((r) => setTimeout(r, waitMs));
    } else {
      console.log(`Target (${checkoutTarget.toTimeString().slice(0, 8)}) is not in the near future from now (${now.toTimeString().slice(0, 8)}) — proceeding immediately.`);
    }
  } else {
    console.log('Manual run — skipping wait, checking out immediately.');
  }

  const group = { id: 'dickson-checkout', label: 'Dickson (check-out)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkout' });

  console.log('\n=== Dickson check-out result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Dickson Check-out', nowStr);

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Dickson Check-out', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
