// Checks out of Yass-PO at a random moment between 6:09 and 6:17 Sydney time.
// Mirrors run-yass-checkin.js's jitter approach, offset to the checkout window.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');

const WINDOW_START_MIN = 9;   // minutes past 6:00
const WINDOW_END_MIN = 17;

(async () => {
  const entry = sitesList.find((s) => s.id === 'yass');
  if (!entry) throw new Error('No "yass" entry in tests/data/checkin-sites.json');

  const sydneyNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const minutesPastHour = sydneyNow.getMinutes() + sydneyNow.getSeconds() / 60;

  const isManual = process.env.MANUAL_RUN === 'true';
  if (!isManual) {
    const targetMinute = WINDOW_START_MIN + Math.random() * (WINDOW_END_MIN - WINDOW_START_MIN);
    const waitMinutes = targetMinute - minutesPastHour;
    if (waitMinutes > 0 && waitMinutes < 20) {
      console.log(`Waiting ${waitMinutes.toFixed(1)} min to land check-out at ~6:${targetMinute.toFixed(1)} Sydney time...`);
      await new Promise((r) => setTimeout(r, waitMinutes * 60_000));
    } else {
      console.log(`Current offset (${minutesPastHour.toFixed(1)} min past the hour) is outside the expected pre-window range — proceeding immediately.`);
    }
  } else {
    console.log('Manual run — skipping random wait, checking out immediately.');
  }

  const group = { id: 'yass-checkout', label: 'Yass PO (check-out)', email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkout' });

  console.log('\n=== Yass check-out result ===');
  for (const r of results) console.log(`  ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, 'Yass Check-out', nowStr);

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Yass Check-out', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
