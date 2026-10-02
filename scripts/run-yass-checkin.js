// Checks in to Yass-PO at a random moment between 5:03 and 5:13 Sydney time.
// The GitHub Actions trigger fires a few minutes early (around 5:00); this script
// sleeps a random amount to land the actual check-in somewhere inside that window,
// rather than hitting the exact same second every day.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');

const WINDOW_START_MIN = 3;  // minutes past 5:00
const WINDOW_END_MIN = 13;

(async () => {
  const entry = sitesList.find((s) => s.id === 'yass');
  if (!entry) throw new Error('No "yass" entry in tests/data/checkin-sites.json');

  const sydneyNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const minutesPastHour = sydneyNow.getMinutes() + sydneyNow.getSeconds() / 60;

  // Manual (workflow_dispatch) runs skip the wait and act immediately, for testing.
  const isManual = process.env.MANUAL_RUN === 'true';
  if (!isManual) {
    const targetMinute = WINDOW_START_MIN + Math.random() * (WINDOW_END_MIN - WINDOW_START_MIN);
    const waitMinutes = targetMinute - minutesPastHour;
    if (waitMinutes > 0 && waitMinutes < 20) {
      console.log(`Waiting ${waitMinutes.toFixed(1)} min to land check-in at ~5:${targetMinute.toFixed(1)} Sydney time...`);
      await new Promise((r) => setTimeout(r, waitMinutes * 60_000));
    } else {
      console.log(`Current offset (${minutesPastHour.toFixed(1)} min past the hour) is outside the expected pre-window range — proceeding immediately.`);
    }
  } else {
    console.log('Manual run — skipping random wait, checking in immediately.');
  }

  const group = { id: 'yass-checkin', label: 'Yass PO (check-in)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkin' });

  console.log('\n=== Yass check-in result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Yass Check-in', nowStr);

  const BENIGN = ['checked-in', 'already-checked-in', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Yass Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
