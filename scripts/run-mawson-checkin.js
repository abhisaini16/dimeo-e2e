// Checks in to Mawson-PO at today's deterministic target (somewhere in 5:30pm-5:45pm Sydney
// time, derived from a hash of today's date — see lib/mawson-schedule.js). The workflow
// fires this once, early; it sleeps the precise remaining amount itself, so there's
// exactly one invocation for check-in per day, not a series of polls.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');
const { sydneyNow, computeTargets } = require('./lib/mawson-schedule');

(async () => {
  const entry = sitesList.find((s) => s.id === 'mawson');
  if (!entry) throw new Error('No "mawson" entry in tests/data/checkin-sites.json');

  if (process.env.MANUAL_RUN !== 'true') {
    const now = sydneyNow();
    const { checkinTarget } = computeTargets(now);
    const waitMs = checkinTarget - now;
    if (waitMs > 0 && waitMs < 20 * 60_000) {
      console.log(`Waiting ${(waitMs / 60000).toFixed(1)} min to land check-in at ${checkinTarget.toTimeString().slice(0, 8)} Sydney time...`);
      await new Promise((r) => setTimeout(r, waitMs));
    } else {
      console.log(`Target (${checkinTarget.toTimeString().slice(0, 8)}) is not in the near future from now (${now.toTimeString().slice(0, 8)}) — proceeding immediately.`);
    }
  } else {
    console.log('Manual run — skipping wait, checking in immediately.');
  }

  const group = { id: 'mawson-checkin', label: 'Mawson PO (check-in)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkin' });

  console.log('\n=== Mawson check-in result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Mawson Check-in', nowStr);

  const BENIGN = ['checked-in', 'already-checked-in', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Mawson Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
