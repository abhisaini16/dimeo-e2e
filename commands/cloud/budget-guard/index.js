// Pub/Sub-triggered Cloud Function fed by a Cloud Billing budget. Google publishes the
// month-to-date cost several times a day. This function:
//   1. Sends a Telegram message the first time each month spend crosses A$5/10/15/20.
//   2. If CAP_ENABLED=true and spend reaches CAP_AUD (12), unlinks billing from the
//      project — GCP's only real "hard cap". Everything stops until billing is relinked.
// Billing data lags by hours, so the cap can overshoot slightly; it's a backstop, not exact.
// De-duplication state lives in a tiny GCS object per month.
const functions = require('@google-cloud/functions-framework');

const PROJECT = process.env.GCP_PROJECT;
const BUCKET = process.env.STATE_BUCKET;
const LEVELS = (process.env.ALERT_LEVELS || '5,10,15,20').split(',').map(Number);
const CAP_AUD = Number(process.env.CAP_AUD || 12);
const CAP_ENABLED = process.env.CAP_ENABLED === 'true';

async function token() {
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  return (await r.json()).access_token;
}

async function telegram(text) {
  const { TELEGRAM_BOT_TOKEN: t, TELEGRAM_CHAT_ID: c } = process.env;
  if (!t || !c) return console.error('Telegram not configured');
  const r = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: c, text }),
  });
  if (!r.ok) console.error('Telegram failed', r.status, await r.text());
}

async function loadState(tok, key) {
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(key)}?alt=media`, { headers: { Authorization: `Bearer ${tok}` } });
  return r.ok ? r.json() : { notified: [], capped: false };
}
async function saveState(tok, key, state) {
  await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(state),
  });
}

async function unlinkBilling(tok) {
  const r = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${PROJECT}/billingInfo`, {
    method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ billingAccountName: '' }),
  });
  if (!r.ok) throw new Error(`unlink failed ${r.status}: ${await r.text()}`);
}

functions.cloudEvent('budgetGuard', async (event) => {
  const msg = JSON.parse(Buffer.from(event.data.message.data, 'base64').toString());
  const cost = Number(msg.costAmount);
  if (!Number.isFinite(cost)) return;
  const cur = msg.currencyCode || 'AUD';
  const month = String(msg.costIntervalStart || new Date().toISOString()).slice(0, 7);
  const key = `budget-${month}.json`;
  const tok = await token();
  const state = await loadState(tok, key);
  console.log(`cost ${cost} ${cur} month ${month}`, JSON.stringify(state));

  const crossed = LEVELS.filter((l) => cost >= l && !state.notified.includes(l));
  if (crossed.length) {
    state.notified.push(...crossed);
    await saveState(tok, key, state);
    await telegram(`💸 Google Cloud spend this month: ${cur} ${cost.toFixed(2)} — crossed ${cur} ${Math.max(...crossed)} alert.\n(Hard cap: ${cur} ${CAP_AUD}${CAP_ENABLED ? '' : ' — currently OFF'})`);
  }

  if (CAP_ENABLED && cost >= CAP_AUD && !state.capped) {
    state.capped = true;
    await saveState(tok, key, state);
    await telegram(`🛑 Spend cap reached: ${cur} ${cost.toFixed(2)} ≥ ${cur} ${CAP_AUD}. Disabling billing on ${PROJECT} — ALL check-in automation is now STOPPED. Relink billing in the Cloud Console to resume.`);
    await unlinkBilling(tok);
  }
});
