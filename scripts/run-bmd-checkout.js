// Check-out for BMD (Whitlam Site Shed), 15 minutes after run-bmd-checkin.js on its own
// fixed trigger at 12:15pm Sydney time. Fires every day on purpose; see run-bmd-checkin.js
// for why a day with no real shift ('no-shift-today') or no prior check-in
// ('not-yet-checked-in') is a normal expected outcome, not an error.
const fs = require('fs');
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { iconFor, postResultsToGitHubIssue } = require('./lib/notify');

(async () => {
  const entry = sitesList.find((s) => s.id === 'bmd');
  if (!entry) throw new Error('No "bmd" entry in tests/data/checkin-sites.json');

  const group = { id: 'bmd-checkout', label: entry.label, email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkout' });

  console.log('\n=== BMD check-out result ===');
  for (const r of results) console.log(`  ${iconFor(r.status)} ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      `# BMD Check-out — ${nowStr}`,
      '',
      '| Site | Result |',
      '|---|---|',
      ...results.map((r) => `| ${r.site} | ${iconFor(r.status)} ${r.status} |`),
    ].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }

  postResultsToGitHubIssue(results, 'BMD Check-out', nowStr);

  const BENIGN = ['done', 'already-done', 'no-shift-today', 'not-yet-checked-in'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'BMD Check-out', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
