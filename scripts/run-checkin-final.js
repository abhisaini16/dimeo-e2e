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
const { planBatch, gapMs, dateKeyOf } = require('./lib/batch-plan');
const { sydneyNow } = require('./lib/mawson-schedule');

const INTER_SITE_DELAY_MS = 5 * 60 * 1000;
// Gap before a new session on the same login as the previous session (planner rule).
const SAME_ACCOUNT_GAP_MS = 10 * 60 * 1000;
// Sites that always get their own login session (never merged with the previous site).
const SEPARATE_SESSION = new Set(['westfield-woden-hcf', 'ph-kingston']);

// These sites only ever need a check-in (the portal finishes the shift itself).
const CHECKIN_ONLY = new Set(['kingston-gallagher', 'qbe', 'suncorp-phillip', 'westfield-woden-hcf', 'ph-ainslie', 'ph-kingston', 'ph-jerrabomberra']);
// Which Sydney weekdays (0=Sun..6=Sat) each site is signed in on. PSD sites: Mon/Wed/Fri
// nights only; everything else Mon-Fri. Public holidays are NOT special-cased — the
// script still runs and the live portal reports no-active-shift. Set RUN_ALL_DAYS=true
// to bypass this (manual testing).
// Earliest Sydney time (minutes after midnight) a site may start. PSD-Manuka shares a login
// with Griffith-PO, whose checkout can land as late as ~6:37pm — hold Manuka until 6:45pm.
const NOT_BEFORE_MIN = { 'psd-manuka': 18 * 60 + 45 };
const PSD_DAYS = [1, 3, 5];
const WEEKDAYS = [1, 2, 3, 4, 5];
const daysFor = (id) => (id.startsWith('psd-') ? PSD_DAYS : WEEKDAYS);

const SELECTED_IDS = [
  'kingston-gallagher',
  'qbe',
  'psd-woden',
  'psd-tuggeranong',
  'psd-queenbeyan',
  'suncorp-phillip',
  // Last on purpose: Griffith-PO checks out ~6:15-6:35pm, so PSD-Manuka waits until the
  // end of the batch (~6:40pm).
  'psd-manuka',
  // Kinga Wangchuk's login (moved off yongzindorji@ 2026-10-30 — not a DIMEO cleaner).
  // Same login as PSD-Manuka, so it runs after it as its own separate session with a
  // >= 10 min gap (SAME_ACCOUNT_GAP_MS) — never two logins on her account at once.
  'westfield-woden-hcf',
  // Partnered Health (DAS live 2026-10-30), check-in only, both on Ugyen Zeppa's login.
  // Kingston is its own session >= 10 min after Ainslie (same-login rule).
  'ph-ainslie',
  'ph-kingston',
  // Partnered Health Jerrabomberra (12145), check-in only, Tshering Drukpa's login.
  'ph-jerrabomberra',
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

  // Every site is its own login session, run at the time planned by batch-plan.js, which
  // keeps the same login >= 27-34 min apart between different sites (Abhi, 2026-10-30).
  const acctMap = Object.fromEntries(sitesList.map((s) => [s.id, s.email.toLowerCase()]));
  const base = sydneyNow();
  const dk = dateKeyOf(base);
  const plan = planBatch(base, acctMap).filter((p) => todaysIds.includes(p.id));
  console.log('Batch plan: ' + plan.map((p) => `${new Date(p.time).toTimeString().slice(0, 5)} ${p.id}`).join(', '));
  const lastActual = {};
  const allResults = [];
  for (const p of plan) {
    const e = entries.find((x) => x.id === p.id);
    const acctKey = e.email.toLowerCase();
    let target = p.time;
    if (lastActual[acctKey] != null) target = Math.max(target, lastActual[acctKey] + gapMs(dk, acctKey, p.id));
    const wait = target - sydneyNow().getTime();
    if (wait > 0 && process.env.RUN_ALL_DAYS !== 'true') {
      console.log(`\n>>> Waiting ${Math.round(wait / 60000)} min until ${new Date(target).toTimeString().slice(0, 5)} for ${e.label}...`);
      await new Promise((r) => setTimeout(r, wait));
    }
    console.log(`\n>>> Logging in for: ${e.label}`);
    const checkinOnly = CHECKIN_ONLY.has(e.id);
    const group = { id: e.label.replace(/\s+/g, '-'), label: e.label, email: e.email, password: e.password, sites: [e.site] };
    const results = await runGroup(group, { interSiteDelayMs: INTER_SITE_DELAY_MS, mode: checkinOnly ? 'checkin' : 'both' });
    lastActual[acctKey] = sydneyNow().getTime();
    allResults.push(...results);
    // Abhi (2026-10-31): a Telegram notification for every site as it runs, not just the end summary.
    postResultsToGitHubIssue(results, `Daily batch: ${e.label}`, new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
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

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today', 'checked-in-awaiting-checkout', 'checked-in', 'already-checked-in'];
  const failed = allResults.some((r) => !BENIGN.includes(r.status));
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Daily Check-in Batch', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  process.exit(1);
});
