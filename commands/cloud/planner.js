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
//   * RANDOM_GAP_ACCOUNTS logins additionally get whole-session non-overlap: see
//     sequenceAccountBlocks() below — one site's checkin->checkout session can't start
//     until the previous site's session (same login) has ended plus a 25-37 min gap,
//     not just a point-in-time gap between nearest events.
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
// Wider, randomised per-account gaps: owner asked (2026-10-08) for 25-37 min between
// different sites sharing one of these specific shared logins (not the default 10 min,
// and not one fixed number either — a different random-but-deterministic value per
// incoming event, same hash-of-the-date pattern as the per-site schedule libs use, so
// re-running the planner the same day always lands on the same gap). `resolve()` enforces
// this between EVERY pair of same-account actions (not just checkout->checkin), which is
// a superset guarantee and simpler to reason about.
const RANDOM_GAP_ACCOUNTS = new Set([
  'sainishikha005@gmail.com',
  'aashuahlawat2@gmail.com',
  'aus362@gmail.com',
  'abhiaus980@gmail.com',
  'tzangpo363@gmail.com',
]);
const RANDOM_GAP_MIN = 25 * MIN;
const RANDOM_GAP_SPAN = 12 * 60; // 0..12 min, in seconds
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function accountGap(e) {
  if (!RANDOM_GAP_ACCOUNTS.has(e.account)) return SAME_ACCOUNT_GAP;
  const offsetSec = simpleHash(`${e.dateKey}-gap-${e.account}-${e.site}-${e.action}`) % (RANDOM_GAP_SPAN + 1);
  return RANDOM_GAP_MIN + offsetSec * 1000;
}

// For a RANDOM_GAP_ACCOUNTS login, a plain pairwise gap between nearest events isn't
// enough: two sites' checkin->checkout sessions can still overlap in time even when
// their checkin times are individually spaced apart (e.g. Greenway open 7:48-8:51pm,
// Phillip checkin 8:20pm — 32 min after Greenway's checkin, which looks "spaced", but
// Phillip's session starts while Greenway's is still open). Owner flagged this
// 2026-10-08: the two sites' sessions must not overlap at all, with the gap measured
// from one checkout to the next checkin. Fix: sequence each account's sites as
// non-overlapping blocks (ordered by original checkin time) BEFORE the generic
// resolve() pass below runs — each site keeps its own checkin->checkout duration, only
// shifted forward as a whole when it would otherwise start before the previous site's
// checkout+gap.
function sequenceAccountBlocks(rawTargets, sites, acct) {
  const byAccount = new Map();
  for (const site of sites) {
    const t = rawTargets[site];
    if (!t) continue;
    const account = acct[site];
    if (!RANDOM_GAP_ACCOUNTS.has(account)) continue;
    if (!byAccount.has(account)) byAccount.set(account, []);
    byAccount.get(account).push(site);
  }
  for (const [account, group] of byAccount) {
    group.sort((a, b) => rawTargets[a].checkinTarget - rawTargets[b].checkinTarget);
    let prevCheckout = null;
    for (const site of group) {
      const t = rawTargets[site];
      const origCheckin = t.checkinTarget.getTime();
      let newCheckin = origCheckin;
      if (prevCheckout !== null) {
        const gap = accountGap({ account, site, action: 'checkin', dateKey: t.dateKey });
        newCheckin = Math.max(origCheckin, prevCheckout + gap);
      }
      const shift = newCheckin - origCheckin;
      if (shift > 0) {
        t.checkinTarget = new Date(origCheckin + shift);
        t.checkoutTarget = new Date(t.checkoutTarget.getTime() + shift);
      }
      prevCheckout = t.checkoutTarget.getTime();
    }
  }
}
const DRY = process.argv.includes('--dry');
const dateArg = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7); // dry-run only
// These sites work Mon-Fri only (their schedule libs have no day-type of their own).
// Public holidays are NOT special-cased: the script still runs and the live portal
// reports no-active-shift when there's no shift.
const MON_FRI_ONLY = new Set(['yass', 'cooma', 'macquarie', 'bega-po', 'merimbula', 'griffith', 'narooma', 'mawson', 'phillip', 'mitchell', 'dickson']);

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
        const gap = p.account === e.account && p.site !== e.site ? accountGap(e) : GLOBAL_GAP;
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

  const rawTargets = {};
  for (const site of SITES) {
    const lib = require(`../scripts/lib/${site}-schedule`);
    rawTargets[site] = MON_FRI_ONLY.has(site) && weekend ? null : lib.computeTargets(base);
  }
  sequenceAccountBlocks(rawTargets, SITES, acct);

  const events = [];
  for (const site of SITES) {
    const t = rawTargets[site];
    if (!t) { lines.push(`➖ ${site}: no shift today`); continue; }
    if (!acct[site]) throw new Error(`no account for ${site} in checkin-sites.json`);
    for (const [action, target] of [['checkin', t.checkinTarget], ['checkout', t.checkoutTarget]]) {
      events.push({ site, action, account: acct[site], orig: target.getTime(), dateKey: t.dateKey });
    }
  }

  const blocks = reservedBlocks(base, acct);
  const final = resolve(events, blocks).sort((a, b) => a.time - b.time);
  const names = siteNames();
  for (const e of final) {
    const slip = Math.round((e.time - e.orig) / MIN);
    const label = `${fmt(e.time)} ${e.site} ${e.action}${slip >= 1 ? ` (+${slip}m clash-spacing)` : ''}`;
    const when = e.time - LEAD_MS;
    if (when <= now && !(DRY && dateArg)) { lines.push(`⏭ ${label} (already past, skipped)`); continue; }
    if (DRY) { lines.push(`(dry) ${label}`); continue; }
    if (NOTIFY_ONLY) continue;
    try {
      const res = await enqueue(token, `${e.site}-${e.action}-${e.dateKey.replace(/\W/g, '-')}-${hhmm(e.time)}`, when, `now-${e.site}-${e.action}`);
      lines.push(`${res === 'exists' ? '☑️' : '🗓'} ${label}`);
    } catch (err) { failed++; lines.push(`❌ ${label}: ${err.message}`); }
  }

  let header = `Plan for ${base.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}`;
  if (NOTIFY_ONLY) {
    // the fixed-time jobs: 6pm batch (sites in order) and the 10pm Bega-Medical check-in
    const CHECKIN_ONLY = new Set(['kingston-gallagher', 'qbe', 'suncorp-phillip']);
    const batchLines = [];
    for (const b of blocks) {
      const id = b.label.replace('batch:', '');
      if (b.label === 'bega-medical') batchLines.push(`• ${fmt(b.lo + MIN)}  ${names['bega-medical']} check-in`);
      else batchLines.push(`• about ${fmt(b.lo + MIN)}  ${names[id] || id} ${CHECKIN_ONLY.has(id) ? 'check-in' : 'check-in + check-out'} (daily batch)`);
    }

    // Grouped-by-shared-login format (owner asked 2026-10-10): one "in -> out" line per
    // site, sites grouped under their shared-login nickname so it's obvious at a glance
    // which sites run strictly sequentially on the same account. Canberra-GPO's two
    // independent accounts get their own section. Everything else (solo accounts) is
    // listed under "Other sites".
    const GROUP_LABELS = {
      'sainishikha005@gmail.com': 'Shikha',
      'aashuahlawat2@gmail.com': 'Aashu',
      'aus362@gmail.com': 'Aus',
      'abhiaus980@gmail.com': 'Abhi',
      'tzangpo363@gmail.com': 'Tzangpo',
    };
    const GROUP_ORDER = ['Shikha', 'Aashu', 'Aus', 'Abhi', 'Tzangpo'];
    const CANBERRA_GPO = { 'city-post': 'Kinley', 'city-post-rajat': 'Rajat' };

    const bySite = {};
    for (const e of final) { (bySite[e.site] ||= {})[e.action] = e.time; }
    const siteLine = (site) => {
      const p = bySite[site];
      if (!p || !p.checkin || !p.checkout) return null;
      return `• ${names[site] || site}: ${fmt(p.checkin)} in → ${fmt(p.checkout)} out`;
    };

    const byGroup = new Map(GROUP_ORDER.map((g) => [g, []]));
    const soloSites = [];
    for (const site of SITES) {
      if (CANBERRA_GPO[site] || !bySite[site] || !bySite[site].checkin) continue;
      const groupLabel = GROUP_LABELS[acct[site]];
      if (groupLabel) byGroup.get(groupLabel).push(site);
      else soloSites.push(site);
    }

    const sections = [];
    for (const g of GROUP_ORDER) {
      const sites = byGroup.get(g);
      if (!sites.length) continue;
      sites.sort((a, b) => bySite[a].checkin - bySite[b].checkin);
      sections.push(`${g}${g === 'Tzangpo' ? ' (Belconnen, solo)' : ''}:`, ...sites.map(siteLine), '');
    }
    const gpoLines = Object.entries(CANBERRA_GPO)
      .filter(([site]) => bySite[site] && bySite[site].checkin)
      .sort(([a], [b]) => bySite[a].checkin - bySite[b].checkin)
      .map(([site, who]) => `• ${who}: ${fmt(bySite[site].checkin)} in → ${fmt(bySite[site].checkout)} out`);
    if (gpoLines.length) sections.push('Canberra GPO:', ...gpoLines, '');
    soloSites.sort((a, b) => bySite[a].checkin - bySite[b].checkin);
    if (soloSites.length) sections.push('Other sites:', ...soloSites.map(siteLine), '');
    if (batchLines.length) sections.push('Daily batch / fixed-time:', ...batchLines, '');

    const noShiftSites = lines.filter((l) => l.startsWith('➖')).map((l) => l.match(/➖ (\S+):/)[1]);
    lines.length = 0;
    if (sections.length) {
      while (sections[sections.length - 1] === '') sections.pop();
      lines.push(...sections);
      if (noShiftSites.length) lines.push('', `${noShiftSites.map((s) => names[s] || s).join(', ')}: no shift today.`);
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
