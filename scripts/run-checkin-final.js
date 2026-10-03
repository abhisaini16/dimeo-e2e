// A fixed, curated set of sites, run in this exact sequence with a 5-minute gap
// before every single site (even ones sharing an account/login session) — not all
// signed in at once. Runs every day of the week; a site with no shift today just
// reports "no-active-shift"/"no-shift-today" via the live portal check in
// checkin-runner.js, which is a normal, expected outcome, not an error.
// Bega-Medical intentionally isn't here — it runs on its own separate 10pm
// trigger instead (see bega-medical-checkin.yml).
const fs = require('fs');
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { iconFor, postResultsToGitHubIssue } = require('./lib/notify');

const INTER_SITE_DELAY_MS = 5 * 60 * 1000;

// These sites only ever need a check-in (the portal finishes the shift itself).
const CHECKIN_ONLY = new Set(['kingston-gallagher', 'qbe', 'suncorp-phillip']);
// Which Sydney weekdays (0=Sun..6=Sat) each site is signed in on. PSD sites: Mon/Wed/Fri
// nights only; everything else Mon-Fri. Public holidays are NOT special-cased — the
// script still runs and the live portal reports no-active-shift. Set RUN_ALL_DAYS=true
// to bypass this (manual testing).
const PSD_DAYS = [1, 3, 5];
const WEEKDAYS = [1, 2, 3, 4, 5];
const daysFor = (id) => (id.startsWith('psd-') ? PSD_DAYS : WEEKDAYS);

const SELECTED_IDS = [
  'kingston-gallagher',
  'qbe',
  'psd-manuka',
  'psd-woden',
  'psd-tuggeranong',
  'psd-queenbeyan',
  'suncorp-phillip',
];

(async () => {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' })).getDay();
  const todaysIds = SELECTED_IDS.filter((id) => process.env.RUN_ALL_DAYS === 'true' || daysFor(id).includes(today));
  console.log(`Sydney weekday ${today}: running ${todaysIds.length}/${SELECTED_IDS.length} sites -> ${todaysIds.join(', ') || '(none)'}`);
  const entries = todaysIds.map((id) => {
    const e = sitesList.find((s) => s.id === id);
    if (!e) throw new Error(`Unknown site id "${id}" — check tests/data/checkin-sites.json`);
    return e;
  });

  // Group consecutive same-account sites so each login is reused within that run,
  // while still preserving the exact sequence order above.
  const groups = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    const checkinOnly = CHECKIN_ONLY.has(e.id);
    if (last && last.email === e.email && last.password === e.password && last.checkinOnly === checkinOnly) {
      last.sites.push(e.site);
      last.labels.push(e.label);
    } else {
      groups.push({ email: e.email, password: e.password, sites: [e.site], labels: [e.label], checkinOnly });
    }
  }

  const allResults = [];
  for (let g = 0; g < groups.length; g++) {
    if (g > 0) {
      console.log(`\n>>> Waiting 5 min before next site...`);
      await new Promise((r) => setTimeout(r, INTER_SITE_DELAY_MS));
    }
    const acct = groups[g];
    console.log(`\n>>> Logging in for: ${acct.labels.join(', ')}`);
    const group = {
      id: acct.labels.join('+').replace(/\s+/g, '-'),
      label: acct.labels.join(' & '),
      email: acct.email,
      password: acct.password,
      sites: acct.sites,
    };
    const results = await runGroup(group, { interSiteDelayMs: INTER_SITE_DELAY_MS, mode: acct.checkinOnly ? 'checkin' : 'both' });
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

  postResultsToGitHubIssue(allResults, 'Daily Check-in Batch', nowStr);

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today', 'checked-in-awaiting-checkout'];
  const failed = allResults.some((r) => !BENIGN.includes(r.status));
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Daily Check-in Batch', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
