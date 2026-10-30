// Shared plan for the 6pm daily batch, used by BOTH the batch runner (run-checkin-final.js)
// and the morning planner (so PO jobs are kept clear of the batch's logins).
//
// Rule (Abhi, 2026-10-30): a cleaner's login never acts at two different sites within
// 27-34 min of each other (random but deterministic per day), whether the site is
// check-in + check-out or check-in only. The batch therefore runs every site as its own
// login session and interleaves sites so same-login sites are spread >= that gap apart.
// Times are "Sydney wall-clock" Dates (same convention as scripts/lib/*-schedule.js).
const MIN = 60_000;
const SLOT = 6 * MIN; // spacing between any two batch actions
const GAP_MIN = 27, GAP_SPAN_SEC = 7 * 60; // 27..34 min

const ORDER = ['kingston-gallagher', 'psd-woden', 'psd-queenbeyan', 'suncorp-phillip', 'ph-ainslie', 'ph-jerrabomberra',
  'qbe', 'psd-tuggeranong', 'psd-manuka', 'ph-kingston', 'westfield-woden-hcf'];
const PSD_DAYS = [1, 3, 5];
const NOT_BEFORE_MIN = { 'psd-manuka': 18 * 60 + 45 };

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
const dateKeyOf = (base) => `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;
// Gap required before `site` may act on `account` after that login's previous different-site action.
function gapMs(dateKey, account, site, action = 'checkin') {
  return GAP_MIN * MIN + (simpleHash(`${dateKey}-gap-${account}-${site}-${action}`) % (GAP_SPAN_SEC + 1)) * 1000;
}
function sitesFor(dow) {
  if (dow < 1 || dow > 5) return [];
  return ORDER.filter((id) => !id.startsWith('psd-') || PSD_DAYS.includes(dow));
}
// Returns [{ id, account, time }] in run order.
function planBatch(base, acct) {
  const at = (mins) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(mins / 60), mins % 60, 0).getTime();
  const dk = dateKeyOf(base);
  const remaining = sitesFor(base.getDay()).filter((id) => acct[id]);
  const last = {};
  const out = [];
  let t = at(18 * 60);
  while (remaining.length) {
    let best = null, bestT = Infinity;
    for (const id of remaining) {
      const a = acct[id];
      let e = t;
      if (NOT_BEFORE_MIN[id]) e = Math.max(e, at(NOT_BEFORE_MIN[id]));
      if (last[a] != null) e = Math.max(e, last[a] + gapMs(dk, a, id));
      if (e < bestT) { bestT = e; best = id; }
      if (e === t) break;
    }
    out.push({ id: best, account: acct[best], time: bestT });
    last[acct[best]] = bestT;
    t = bestT + SLOT;
    remaining.splice(remaining.indexOf(best), 1);
  }
  return out;
}
module.exports = { planBatch, gapMs, dateKeyOf, sitesFor, MIN };
