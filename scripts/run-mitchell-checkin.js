// Checks in to Mitchell-PO at today's deterministic target (somewhere in 5:20pm-5:30pm Sydney
// time, derived from a hash of today's date — see lib/mitchell-schedule.js). The workflow
// fires this once, early; it sleeps the precise remaining amount itself, so there's
// exactly one invocation for check-in per day, not a series of polls.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');
const { sydneyNow, computeTargets } = require('./lib/mitchell-schedule');

(async () => {
  const entry = sitesList.find((s) => s.id === 'mitchell');
  if (!entry) throw new Error('No "mitchell" entry in tests/data/checkin-sites.json');

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

  const group = { id: 'mitchell-checkin', label: 'Mitchell PO (check-in)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkin' });

  console.log('\n=== Mitchell check-in result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Mitchell Check-in', nowStr);

  const BENIGN = ['checked-in', 'already-checked-in', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Mitchell Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
