// Telegram webhook for on-demand check-ins. Shows every site as a numbered list with tap
// buttons; picking one (tap, or type its number) starts a Cloud Run Job execution
// `manual-<site-id>` that checks in and out immediately and reports back via Telegram.
// Security: requests must carry Telegram's secret-token header AND come from the one
// allowed chat id; anything else is silently ignored.
const functions = require('@google-cloud/functions-framework');
const SITES = require('./sites.json');

const { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: ALLOWED_CHAT, WEBHOOK_SECRET } = process.env;
const PROJECT = process.env.GCP_PROJECT;
const REGION = process.env.GCP_REGION || 'australia-southeast1';
const CHECKIN_ONLY = new Set(['kingston-gallagher', 'qbe', 'suncorp-phillip', 'bega-medical']);

const tg = (method, body) => fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json()).catch((e) => console.error(method, e.message));

async function startJob(siteId) {
  const t = await (await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } })).json();
  const r = await fetch(`https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/dimeo-checkin:run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides: { containerOverrides: [{ args: [`manual-${siteId}`] }] } }),
  });
  if (!r.ok) throw new Error(`run API ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const modeText = (s) => (CHECKIN_ONLY.has(s.id) ? 'check-in only' : 'check-in + check-out');

function menu(chat) {
  const lines = SITES.map((s, i) => `${i + 1}. ${s.label}${CHECKIN_ONLY.has(s.id) ? ' (in only)' : ''}`);
  const keyboard = [];
  for (let i = 0; i < SITES.length; i += 2) {
    keyboard.push(SITES.slice(i, i + 2).map((s, j) => ({ text: `${i + j + 1}. ${s.label}`, callback_data: `s:${s.id}` })));
  }
  return tg('sendMessage', {
    chat_id: chat,
    text: `Tap a site (or reply with its number) to check in${'\u00A0'}+${'\u00A0'}out right now:\n\n${lines.join('\n')}`,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function run(chat, site) {
  try {
    await startJob(site.id);
    await tg('sendMessage', { chat_id: chat, text: `▶️ Started: ${site.label} — ${modeText(site)} now. Result will follow in about a minute.` });
  } catch (e) {
    console.error(e);
    await tg('sendMessage', { chat_id: chat, text: `❌ Could not start ${site.label}: ${e.message}` });
  }
}

functions.http('telegramBot', async (req, res) => {
  if (req.get('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) return res.status(403).send('no');
  const u = req.body || {};
  const cb = u.callback_query;
  const chat = String((cb ? cb.message?.chat?.id : u.message?.chat?.id) ?? '');
  if (chat !== String(ALLOWED_CHAT)) { console.log('ignored chat', chat); return res.send('ok'); }

  if (cb) {
    const site = SITES.find((s) => `s:${s.id}` === cb.data);
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: site ? `Starting ${site.label}…` : 'Unknown site' });
    if (site) await run(chat, site);
  } else {
    const text = (u.message?.text || '').trim();
    const n = /^\d+$/.test(text) ? Number(text) : 0;
    if (n >= 1 && n <= SITES.length) await run(chat, SITES[n - 1]);
    else if (/^\/(start|sites|menu|help)\b/i.test(text) || text) await menu(chat);
  }
  res.send('ok');
});
