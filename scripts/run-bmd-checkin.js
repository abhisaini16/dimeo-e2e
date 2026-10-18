// Check-in for BMD (Whitlam Site Shed), run on its own fixed daily trigger at 12:00pm
// Sydney time rather than through the planner (the real shift is only Tue/Wed/Fri
// 9am-2pm, but this fires every day on purpose — on a day with no shift, the live
// portal check in checkin-runner.js reports 'no-shift-today', a normal expected
// outcome, not an error).
const fs = require('fs');
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { iconFor, postResultsToGitHubIssue } = require('./lib/notify');

(async () => {
  const entry = sitesList.find((s) => s.id === 'bmd');
  if (!entry) throw new Error('No "bmd" entry in tests/data/checkin-sites.json');

  const group = { id: 'bmd-checkin', label: entry.label, email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode: 'checkin' });

  console.log('\n=== BMD check-in result ===');
  for (const r of results) console.log(`  ${iconFor(r.status)} ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      `# BMD Check-in — ${nowStr}`,
      '',
      '| Site | Result |',
      '|---|---|',
      ...results.map((r) => `| ${r.site} | ${iconFor(r.status)} ${r.status} |`),
    ].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }

  postResultsToGitHubIssue(results, 'BMD Check-in', nowStr);

  const BENIGN = ['checked-in', 'already-checked-in', 'already-done', 'no-shift-today', 'checked-in-awaiting-checkout'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'BMD Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
