// Checks in to Fyshwick-PO at today's deterministic target. Unlike Yass/Cooma, the
// window itself depends on the day: weekdays land in 6:18-6:45am Sydney time,
// Saturdays in 2:14-2:30pm — see lib/fyshwick-schedule.js. No Sunday shift.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');
const { sydneyNow, computeTargets } = require('./lib/fyshwick-schedule');

(async () => {
  const entry = sitesList.find((s) => s.id === 'fyshwick');
  if (!entry) throw new Error('No "fyshwick" entry in tests/data/checkin-sites.json');

  if (process.env.MANUAL_RUN !== 'true') {
    const now = sydneyNow();
    const targets = computeTargets(now);
    if (!targets) {
      console.log('Today has no Fyshwick-PO window (Sunday) — proceeding immediately to confirm via the live portal.');
    } else {
      const waitMs = targets.checkinTarget - now;
      if (waitMs > 0 && waitMs < 35 * 60_000) {
        console.log(`Waiting ${(waitMs / 60000).toFixed(1)} min to land check-in at ${targets.checkinTarget.toTimeString().slice(0, 8)} Sydney time (${targets.dayType})...`);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        console.log(`Target (${targets.checkinTarget.toTimeString().slice(0, 8)}) is not in the near future from now (${now.toTimeString().slice(0, 8)}) — proceeding immediately.`);
      }
    }
  } else {
    console.log('Manual run — skipping wait, checking in immediately.');
  }

  const group = { id: 'fyshwick-checkin', label: 'Fyshwick PO (check-in)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkin' });

  console.log('\n=== Fyshwick check-in result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Fyshwick Check-in', nowStr);

  const BENIGN = ['checked-in', 'already-checked-in', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Fyshwick Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
