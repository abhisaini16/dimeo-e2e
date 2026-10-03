// Checks in to Queenbeyan-PO at today's deterministic target. Day-type-aware window,
// same approach as run-fyshwick-checkin.js: weekdays land in 6:00-6:34pm Sydney time,
// Saturdays in 2:00-3:00pm — see lib/queenbeyan-schedule.js. No Sunday shift.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');
const { sydneyNow, computeTargets } = require('./lib/queenbeyan-schedule');

(async () => {
  const entry = sitesList.find((s) => s.id === 'queenbeyan');
  if (!entry) throw new Error('No "queenbeyan" entry in tests/data/checkin-sites.json');

  if (process.env.MANUAL_RUN !== 'true') {
    const now = sydneyNow();
    const targets = computeTargets(now);
    if (!targets) {
      console.log('Today has no Queenbeyan-PO window (Sunday) — proceeding immediately to confirm via the live portal.');
    } else {
      const waitMs = targets.checkinTarget - now;
      if (waitMs > 0 && waitMs < 40 * 60_000) {
        console.log(`Waiting ${(waitMs / 60000).toFixed(1)} min to land check-in at ${targets.checkinTarget.toTimeString().slice(0, 8)} Sydney time (${targets.dayType})...`);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        console.log(`Target (${targets.checkinTarget.toTimeString().slice(0, 8)}) is not in the near future from now (${now.toTimeString().slice(0, 8)}) — proceeding immediately.`);
      }
    }
  } else {
    console.log('Manual run — skipping wait, checking in immediately.');
  }

  const group = { id: 'queenbeyan-checkin', label: 'Queenbeyan PO (check-in)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkin' });

  console.log('\n=== Queenbeyan check-in result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Queenbeyan Check-in', nowStr);

  const BENIGN = ['checked-in', 'already-checked-in', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Queenbeyan Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
