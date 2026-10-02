// A fixed, curated set of sites spanning multiple accounts, run in one go.
// Each distinct account logs in once and handles whichever of these sites belong to it.
const fs = require('fs');
const { execFileSync } = require('child_process');
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');

const STATUS_ICON = {
  'done': '✅',
  'already-done': '☑️',
  'checked-in-awaiting-checkout': '⏳',
  'no-shift-today': '➖',
  'no-active-shift': '➖',
};
const iconFor = (status) => STATUS_ICON[status] || '❌';

// Posts the run's results as a comment on a persistent "Daily Check-in Log" issue.
// Issue comments generate their own GitHub notification with the comment body visible
// as a preview — unlike the generic "workflow run completed" notification, which
// carries no per-site detail. No-ops outside GitHub Actions (e.g. local runs).
function postResultsToGitHubIssue(allResults, nowStr) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  try {
    const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

    const counts = { done: 0, pending: 0, failed: 0 };
    for (const r of allResults) {
      if (['done', 'already-done'].includes(r.status)) counts.done++;
      else if (['checked-in-awaiting-checkout', 'no-shift-today', 'no-active-shift'].includes(r.status)) counts.pending++;
      else counts.failed++;
    }

    const title = `Daily Check-in Log`;
    let issueNumber = gh('issue', 'list', '--search', `"${title}" in:title`, '--state', 'open', '--json', 'number', '--jq', '.[0].number').trim();
    if (!issueNumber) {
      const url = gh('issue', 'create', '--title', title, '--body', 'Automated daily check-in results post here as comments, one per run.');
      issueNumber = url.trim().split('/').pop();
    }

    const rows = allResults.map((r) => `| ${r.site} | ${iconFor(r.status)} ${r.status} |`).join('\n');
    const body = [
      `**${nowStr}** — ✅${counts.done} done  ⏳${counts.pending} pending  ❌${counts.failed} failed`,
      '',
      '| Site | Result |',
      '|---|---|',
      rows,
    ].join('\n');

    gh('issue', 'comment', issueNumber, '--body', body);
    console.log(`Posted results to issue #${issueNumber}`);
  } catch (err) {
    console.error('Could not post results to GitHub issue (non-fatal):', err.message);
  }
}

const SELECTED_IDS = [
  'psd-manuka',
  'psd-tuggeranong',
  'psd-woden',
  'psd-queenbeyan',
  'qbe',
  'suncorp-phillip',
  'bega-medical',
  'kingston-gallagher',
];

(async () => {
  const entries = SELECTED_IDS.map((id) => {
    const e = sitesList.find((s) => s.id === id);
    if (!e) throw new Error(`Unknown site id "${id}" — check tests/data/checkin-sites.json`);
    return e;
  });

  // Group by account so each login is used exactly once, even though these 8 sites
  // belong to 5 different accounts.
  const byAccount = new Map();
  for (const e of entries) {
    const key = `${e.email}:::${e.password}`;
    if (!byAccount.has(key)) {
      byAccount.set(key, { email: e.email, password: e.password, sites: [], labels: [] });
    }
    const acct = byAccount.get(key);
    acct.sites.push(e.site);
    acct.labels.push(e.label);
  }

  const allResults = [];
  for (const acct of byAccount.values()) {
    console.log(`\n>>> Logging in as ${acct.email} for: ${acct.labels.join(', ')}`);
    const group = {
      id: acct.email,
      label: acct.labels.join(' & '),
      email: acct.email,
      password: acct.password,
      sites: acct.sites,
    };
    const results = await runGroup(group);
    allResults.push(...results);
  }

  console.log('\n=== Final combined summary ===');
  for (const r of allResults) {
    console.log(`  ${iconFor(r.status)} ${r.site}: ${r.status}`);
  }

  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

  // GitHub Actions renders anything appended here as the run's Job Summary — visible
  // right from the notification email/app without opening the raw log.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = allResults
      .map((r) => `| ${r.site} | ${iconFor(r.status)} ${r.status} |`)
      .join('\n');
    const summary = [
      `# Daily Check-in Batch — ${nowStr}`,
      '',
      '| Site | Result |',
      '|---|---|',
      rows,
    ].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }

  postResultsToGitHubIssue(allResults, nowStr);

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today', 'checked-in-awaiting-checkout'];
  const failed = allResults.some((r) => !BENIGN.includes(r.status));
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
