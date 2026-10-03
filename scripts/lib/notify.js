const { execFileSync, spawnSync } = require('child_process');

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

// Sends the same summary to Telegram when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set
// (the Cloud Run Job mounts them from Secret Manager). Uses a synchronous curl call —
// callers process.exit() right after, which would drop an in-flight async fetch.
function postResultsToTelegram(allResults, label, nowStr) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const rows = allResults.map((r) => `${iconFor(r.status)} ${r.site}: ${r.status}`).join('\n');
    const text = `${label} — ${nowStr}\n${rows}`;
    const res = spawnSync('curl', ['-sS', '-m', '20', '-X', 'POST', `https://api.telegram.org/bot${token}/sendMessage`,
      '--data-urlencode', `chat_id=${chatId}`, '--data-urlencode', `text=${text}`], { encoding: 'utf8' });
    if (res.status !== 0 || !/"ok":true/.test(res.stdout)) console.error('Telegram send failed (non-fatal):', res.stderr || res.stdout);
    else console.log('Posted results to Telegram');
  } catch (err) {
    console.error('Could not post to Telegram (non-fatal):', err.message);
  }
}

// Posts a run's results as a comment on a persistent "Daily Check-in Log" issue.
// Issue comments generate their own GitHub notification with the comment body visible
// as a preview — unlike the generic "workflow run completed" notification, which
// carries no per-site detail. No-ops outside GitHub Actions (e.g. local runs).
function postResultsToGitHubIssue(allResults, label, nowStr) {
  postResultsToTelegram(allResults, label, nowStr);
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
