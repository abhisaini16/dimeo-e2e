const { execFileSync } = require('child_process');

const STATUS_ICON = {
  'done': '✅',
  'checked-in': '✅',
  'already-done': '☑️',
  'already-checked-in': '☑️',
  'checked-in-awaiting-checkout': '⏳',
  'no-shift-today': '➖',
  'no-active-shift': '➖',
};
function iconFor(status) {
  return STATUS_ICON[status] || '❌';
}

const PENDING_STATUSES = ['checked-in-awaiting-checkout', 'no-shift-today', 'no-active-shift', 'not-yet-checked-in'];
const DONE_STATUSES = ['done', 'already-done', 'checked-in', 'already-checked-in'];

// Posts a run's results as a comment on a persistent "Daily Check-in Log" issue.
// Issue comments generate their own GitHub notification with the comment body visible
// as a preview — unlike the generic "workflow run completed" notification, which
// carries no per-site detail. No-ops outside GitHub Actions (e.g. local runs).
function postResultsToGitHubIssue(allResults, label, nowStr) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  try {
    const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

    const counts = { done: 0, pending: 0, failed: 0 };
    for (const r of allResults) {
      if (DONE_STATUSES.includes(r.status)) counts.done++;
      else if (PENDING_STATUSES.includes(r.status)) counts.pending++;
      else counts.failed++;
    }

    const title = 'Daily Check-in Log';
    let issueNumber = gh('issue', 'list', '--search', `"${title}" in:title`, '--state', 'open', '--json', 'number', '--jq', '.[0].number').trim();
    if (!issueNumber) {
      const url = gh('issue', 'create', '--title', title, '--body', 'Automated check-in results post here as comments, one per run.');
      issueNumber = url.trim().split('/').pop();
    }

    const rows = allResults.map((r) => `| ${r.site} | ${iconFor(r.status)} ${r.status} |`).join('\n');
    const body = [
      `**${label} — ${nowStr}** — ✅${counts.done} done  ⏳${counts.pending} pending  ❌${counts.failed} failed`,
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

module.exports = { iconFor, postResultsToGitHubIssue };
