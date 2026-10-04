// Runs each morning (see jobs.js): computes today's random check-in/out targets for every
// dedicated site and schedules one Cloud Task per action at the exact moment, which then
// starts a short-lived Cloud Run Job execution. No container sits sleeping.
// Safe to run repeatedly: task names are deterministic (site-action-date), so an existing
// task is left alone, and targets already in the past are skipped.
const { SITES } = require('./jobs');
const { sendTelegramText } = require('../scripts/lib/notify');

const PROJECT = process.env.GCP_PROJECT || 'cbr-automation-510513';
const REGION = process.env.GCP_REGION || 'australia-southeast1';
const QUEUE = 'dimeo-actions';
const SA = `dimeo-scheduler@${PROJECT}.iam.gserviceaccount.com`;
// Container start + browser launch + login takes ~30-40s before the click happens.
const LEAD_MS = 45_000;
const DRY = process.argv.includes('--dry');
const dateArg = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7); // dry-run only
// These sites work Mon-Fri only (their schedule libs have no day-type of their own).
// Public holidays are NOT special-cased: the script still runs and the live portal
// reports no-active-shift when there's no shift.
const MON_FRI_ONLY = new Set(['yass', 'cooma', 'macquarie', 'bega-po', 'merimbula', 'griffith', 'narooma', 'mawson', 'phillip', 'mitchell']);

const runUrl = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/dimeo-checkin:run`;
const fmt = (d) => d.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: false });

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
  const lines = [];
  let failed = 0;
  const token = DRY ? null : await accessToken();

  for (const site of SITES) {
    const lib = require(`../scripts/lib/${site}-schedule`);
    const nowSyd = DRY && dateArg ? new Date(`${dateArg}T09:00:00`) : lib.sydneyNow();
    const weekend = nowSyd.getDay() === 0 || nowSyd.getDay() === 6;
    const t = MON_FRI_ONLY.has(site) && weekend ? null : lib.computeTargets(nowSyd);
    if (!t) { lines.push(`➖ ${site}: no shift today`); continue; }
    for (const [action, target] of [['checkin', t.checkinTarget], ['checkout', t.checkoutTarget]]) {
      const when = target.getTime() - LEAD_MS;
      const label = `${site} ${action} @ ${fmt(target)}`;
      if (when <= now && !(DRY && dateArg)) { lines.push(`⏭ ${label} (already past, skipped)`); continue; }
      if (DRY) { lines.push(`(dry) ${label}`); continue; }
      try {
        const res = await enqueue(token, `${site}-${action}-${t.dateKey.replace(/\W/g, '-')}`, when, `now-${site}-${action}`);
        lines.push(`${res === 'exists' ? '☑️' : '🗓'} ${label}`);
      } catch (e) { failed++; lines.push(`❌ ${label}: ${e.message}`); }
    }
  }

  const header = `Plan for ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', day: 'numeric', month: 'short' })}`;
  console.log([header, ...lines].join('\n'));
  if (!DRY && (failed || process.env.PLAN_NOTIFY !== 'off')) sendTelegramText([failed ? `⚠️ ${header} — ${failed} FAILED` : header, ...lines].join('\n'));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('planner crashed:', e);
  sendTelegramText(`⚠️ Planner crashed — today's check-ins are NOT scheduled!\n${e.message}`);
  process.exit(1);
});
