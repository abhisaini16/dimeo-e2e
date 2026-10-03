// On-demand check-in (+ check-out right after) for one site, triggered from the Telegram
// bot menu. No waiting, no random delay. Usage: SITE_ID=<id> node scripts/run-manual.js
// Sites that only ever need a check-in (the portal finishes the shift itself) stop there.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { iconFor, postResultsToGitHubIssue } = require('./lib/notify');

const CHECKIN_ONLY = new Set(['kingston-gallagher', 'qbe', 'suncorp-phillip', 'bega-medical']);
const BENIGN = ['checked-in', 'already-checked-in', 'done', 'already-done', 'checked-in-awaiting-checkout', 'no-active-shift', 'no-shift-today'];

(async () => {
  const id = process.env.SITE_ID;
  const entry = sitesList.find((s) => s.id === id);
  if (!entry) throw new Error(`No "${id}" entry in checkin-sites.json`);
  const mode = CHECKIN_ONLY.has(id) ? 'checkin' : 'both';

  const group = { id: `manual-${id}`, label: entry.label, email: entry.email, password: entry.password, sites: [entry.site] };
  const results = await runGroup(group, { mode });

  for (const r of results) console.log(`  ${iconFor(r.status)} ${r.site}: ${r.status}`);
  const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  postResultsToGitHubIssue(results, `Manual ${mode === 'both' ? 'check-in + out' : 'check-in'}: ${entry.label}`, nowStr);
  process.exit(results.some((r) => !BENIGN.includes(r.status)) ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], `Manual run ${process.env.SITE_ID}`, new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
