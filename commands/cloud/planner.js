// Runs each morning (see jobs.js): computes today's random check-in/out targets for every
// dedicated site, resolves clashes, and schedules one Cloud Task per action at the exact
// moment, which then starts a short-lived Cloud Run Job execution. No container sits
// sleeping. Safe to run repeatedly: task names are deterministic (site-action-date), so an
// existing task is left alone, and targets already in the past are skipped.
//
// Clash rules (a later event is pushed back; order is preserved):
//   * SAME login: two actions on different sites sharing one account stay >= SAME_ACCOUNT_GAP
//     apart, so they always happen strictly one after the other. The 6pm batch and the
//     10pm Bega-Medical job are treated as reserved slots for their accounts.
//   * ANY login: no two actions closer than GLOBAL_GAP, so logins don't bunch up.
const { SITES } = require('./jobs');
const { sendTelegramText } = require('../scripts/lib/notify');

const PROJECT = process.env.GCP_PROJECT || 'cbr-automation-510513';
const REGION = process.env.GCP_REGION || 'australia-southeast1';
const QUEUE = 'dimeo-actions';
const SA = `dimeo-scheduler@${PROJECT}.iam.gserviceaccount.com`;
// Container start + browser launch + login takes ~30-40s before the click happens.
const LEAD_MS = 45_000;
const MIN = 60_000;
const SAME_ACCOUNT_GAP = 10 * MIN;
const GLOBAL_GAP = 3 * MIN;
const DRY = process.argv.includes('--dry');
const dateArg = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7); // dry-run only
// These sites work Mon-Fri only (their schedule libs have no day-type of their own).
// Public holidays are NOT special-cased: the script still runs and the live portal
// reports no-active-shift when there's no shift.
const MON_FRI_ONLY = new Set(['yass', 'cooma', 'macquarie', 'bega-po', 'merimbula', 'griffith', 'narooma', 'mawson', 'phillip', 'mitchell']);

const runUrl = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/dimeo-checkin:run`;
// Normal 12-hour clock for Telegram (5:19 pm), and a sortable HHMM for task names.
const fmt = (ms) => new Date(ms).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true });
const hhmm = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '');
const NOTIFY_ONLY = process.env.PLAN_MODE === 'notify'; // the 7am run: send today's plan, queue nothing

function siteNames() {
  const list = require('../tests/data/checkin-sites.json');
  return Object.fromEntries(list.map((s) => [s.id, s.site]));
}

function accounts() {
  const list = require('../tests/data/checkin-sites.json');
  return Object.fromEntries(list.map((s) => [s.id, s.email.toLowerCase()]));
}

// Fixed-time jobs that also use logins: the 6pm batch (6-min slots, in order; PSD sites
// Mon/Wed/Fri only; PSD-Manuka never before 6:45pm) and Bega-Medical at 10pm Mon-Fri.
function reservedBlocks(base, acct) {
  const dow = base.getDay();
  if (dow < 1 || dow > 5) return [];
  const at = (h, m) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0).getTime();
  const order = ['kingston-gallagher', 'qbe', 'psd-woden', 'psd-tuggeranong', 'psd-queenbeyan', 'suncorp-phillip', 'psd-manuka']
    .filter((id) => !id.startsWith('psd-') || [1, 3, 5].includes(dow));
  const blocks = [];
  order.forEach((id, i) => {
    const start = id === 'psd-manuka' ? Math.max(at(18, 0) + i * 6 * MIN, at(18, 45)) : at(18, 0) + i * 6 * MIN;
    blocks.push({ label: `batch:${id}`, account: acct[id], lo: start - MIN, hi: start + 3 * MIN });
  });
  blocks.push({ label: 'bega-medical', account: acct['bega-medical'], lo: at(22, 0) - MIN, hi: at(22, 0) + 3 * MIN });
  return blocks;
}

// Pushes events (forward only) until every rule holds. Returns events with `time` final.
function resolve(events, blocks) {
  const placed = [];
  for (const e of events.sort((a, b) => a.orig - b.orig)) {
    let t = e.orig;
    for (let guard = 0; guard < 200; guard++) {
      let moved = false;
      for (const p of placed) {
        const gap = p.account === e.account && p.site !== e.site ? SAME_ACCOUNT_GAP : GLOBAL_GAP;
        if (Math.abs(t - p.time) < gap) { t = p.time + gap; moved = true; }
      }
      for (const b of blocks) {
        if (b.account === e.account && t > b.lo - SAME_ACCOUNT_GAP && t < b.hi + SAME_ACCOUNT_GAP) { t = b.hi + SAME_ACCOUNT_GAP; moved = true; }
      }
      if (!moved) break;
    }
    e.time = t;
    placed.push(e);
  }
  return placed;
}

async function accessToken() {
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error(`metadata token ${r.status}`);
  return (await r.json()).access_token;
}

async function enqueue(token, name, whenMs, jobName) {
  const parent = `projects/${PROJECT}/locations/${REGION}/queues/${QUEUE}`;
  const body = Buffer.from(JSON.stringify({ overrides: { containerOverrides: [{ args: [jobName] }] } })).toString('base64');
  const r = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: {
      name: `${parent}/tasks/${name}`,
      scheduleTime: new Date(whenMs).toISOString(),
      httpRequest: { httpMethod: 'POST', url: runUrl, headers: { 'Content-Type': 'application/json' }, body, oauthToken: { serviceAccountEmail: SA } },
    } }),
  });
  if (r.status === 409) return 'exists';
  if (!r.ok) throw new Error(`enqueue ${name}: ${r.status} ${await r.text()}`);
  return 'queued';
}

(async () => {
  const now = Date.now();
  const acct = accounts();
  const lines = [];
  let failed = 0;
  const token = DRY || NOTIFY_ONLY ? null : await accessToken();

  const first = require(`../scripts/lib/${SITES[0]}-schedule`);
  const base = DRY && dateArg ? new Date(`${dateArg}T09:00:00`) : first.sydneyNow();
  const weekend = base.getDay() === 0 || base.getDay() === 6;

  const events = [];
  for (const site of SITES) {
    const lib = require(`../scripts/lib/${site}-schedule`);
    const t = MON_FRI_ONLY.has(site) && weekend ? null : lib.computeTargets(base);
    if (!t) { lines.push(`➖ ${site}: no shift today`); continue; }
    if (!acct[site]) throw new Error(`no account for ${site} in checkin-sites.json`);
    for (const [action, target] of [['checkin', t.checkinTarget], ['checkout', t.checkoutTarget]]) {
      events.push({ site, action, account: acct[site], orig: target.getTime(), dateKey: t.dateKey });
    }
  }

  const blocks = reservedBlocks(base, acct);
  const final = resolve(events, blocks).sort((a, b) => a.time - b.time);
  const names = siteNames();
  const items = []; // 7am message rows: { t, text }
  for (const e of final) {
    const slip = Math.round((e.time - e.orig) / MIN);
    const label = `${fmt(e.time)} ${e.site} ${e.action}${slip >= 1 ? ` (+${slip}m clash-spacing)` : ''}`;
    const when = e.time - LEAD_MS;
    if (when <= now && !(DRY && dateArg)) { lines.push(`⏭ ${label} (already past, skipped)`); continue; }
    if (DRY) { lines.push(`(dry) ${label}`); continue; }
    if (NOTIFY_ONLY) { items.push({ t: e.time, text: `${fmt(e.time)}  ${names[e.site] || e.site} ${e.action === 'checkin' ? 'check-in' : 'check-out'}` }); continue; }
    try {
      const res = await enqueue(token, `${e.site}-${e.action}-${e.dateKey.replace(/\W/g, '-')}-${hhmm(e.time)}`, when, `now-${e.site}-${e.action}`);
      lines.push(`${res === 'exists' ? '☑️' : '🗓'} ${label}`);
    } catch (err) { failed++; lines.push(`❌ ${label}: ${err.message}`); }
  }

  let header = `Plan for ${base.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}`;
  if (NOTIFY_ONLY) {
    // the fixed-time jobs: 6pm batch (sites in order) and the 10pm Bega-Medical check-in
    const CHECKIN_ONLY = new Set(['kingston-gallagher', 'qbe', 'suncorp-phillip']);
    for (const b of blocks) {
      const id = b.label.replace('batch:', '');
      if (b.label === 'bega-medical') items.push({ t: b.lo + MIN, text: `${fmt(b.lo + MIN)}  ${names['bega-medical']} check-in` });
      else items.push({ t: b.lo + MIN, text: `about ${fmt(b.lo + MIN)}  ${names[id] || id} ${CHECKIN_ONLY.has(id) ? 'check-in' : 'check-in + check-out'} (daily batch)` });
    }
    items.sort((a, b) => a.t - b.t);
    lines.length = 0;
    if (items.length) {
      lines.push('Check-ins today (Sydney time):', ...items.map((i) => i.text), '', 'If a site has no shift today (for example a public holiday) its run will report "No active shift today".');
    } else {
      lines.push('No check-ins are scheduled today.');
    }
  }
  console.log([header, ...lines].join('\n'));
  if (!DRY && (failed || process.env.PLAN_NOTIFY !== 'off')) sendTelegramText([failed ? `⚠️ ${header} — ${failed} FAILED` : header, ...lines].join('\n'));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('planner crashed:', e);
  sendTelegramText(`⚠️ Planner crashed — today's check-ins are NOT scheduled!\n${e.message}`);
  process.exit(1);
});
