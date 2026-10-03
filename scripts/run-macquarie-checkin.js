// Checks in to Macquarie-PO at today's deterministic target (somewhere in 5:30-6:00pm
// Sydney time, derived from a hash of today's date — see lib/macquarie-schedule.js).
// Weekday-only; no Saturday/Sunday shift.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');
const { sydneyNow, computeTargets } = require('./lib/macquarie-schedule');

(async () => {
  const entry = sitesList.find((s) => s.id === 'macquarie');
  if (!entry) throw new Error('No "macquarie" entry in tests/data/checkin-sites.json');

  if (process.env.MANUAL_RUN !== 'true') {
    const now = sydneyNow();
    const targets = computeTargets(now);
    if (!targets) {
      console.log('Today has no Macquarie-PO window (weekend) — proceeding immediately to confirm via the live portal.');
    } else {
      const waitMs = targets.checkinTarget - now;
      if (waitMs > 0 && waitMs < 35 * 60_000) {
        console.log(`Waiting ${(waitMs / 60000).toFixed(1)} min to land check-in at ${targets.checkinTarget.toTimeString().slice(0, 8)} Sydney time...`);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        console.log(`Target (${targets.checkinTarget.toTimeString().slice(0, 8)}) is not in the near future from now (${now.toTimeString().slice(0, 8)}) — proceeding immediately.`);
      }
    }
  } else {
    console.log('Manual run — skipping wait, checking in immediately.');
  }

  const group = { id: 'macquarie-checkin', label: 'Macquarie PO (check-in)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkin' });

  console.log('\n=== Macquarie check-in result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Macquarie Check-in', nowStr);

  const BENIGN = ['checked-in', 'already-checked-in', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Macquarie Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
