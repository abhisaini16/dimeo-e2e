// Single-site check-in/out for Bega-Medical (Bega Urgent Clinic), run on its own
// separate 10pm trigger rather than as part of the main 7-site daily batch.
const fs = require('fs');
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { iconFor, postResultsToGitHubIssue } = require('./lib/notify');

(async () => {
  const entry = sitesList.find((s) => s.id === 'bega-medical');
  if (!entry) throw new Error('No "bega-medical" entry in tests/data/checkin-sites.json');

  const group = { id: 'bega-medical', label: entry.label, email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group);

  console.log('\n=== Bega-Medical result ===');
  for (const r of results) console.log(`  ${iconFor(r.status)} ${r.site}: ${r.status}`);

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      `# Bega-Medical Check-in — ${nowStr}`,
      '',
      '| Site | Result |',
      '|---|---|',
      ...results.map((r) => `| ${r.site} | ${iconFor(r.status)} ${r.status} |`),
    ].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }

  postResultsToGitHubIssue(results, 'Bega-Medical Check-in', nowStr);

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today', 'checked-in-awaiting-checkout'];
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Bega-Medical Check-in', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
