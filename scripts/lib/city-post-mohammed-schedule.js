// Mohammed Ibrahim's Canberra-GPO schedule (2026-11-18, Abhi): a third independent account
// at Canberra GPO, checking in at roughly the same time as Rajat. Check-in = Rajat's
// check-in target (lib/city-post-rajat-schedule.js: Mon-Fri 6:02-6:37pm, Sat 2:48-3:48pm) + a
// random 4-9 min offset, so Rajat is always first; stay = random 139-162 whole minutes, never
// equal to Rajat's that day. Mon-Sat (GPO's DIMEO windows: Mon-Fri 4pm->9am, Sat 12:30pm->9am),
// no Sunday shift. Latest check-in ~6:46pm weekday / ~3:57pm Sat.
// NOTE: only works once Mohammed (DIMEO cleaner 4610) is on the Canberra GPO cleaning
// schedule's timeslots; until then his My Cleans has no GPO card and runs return
// no-shift-found (the runner never touches "Available to Cover").
const rajat = require('./city-post-rajat-schedule');
const { simpleHash, sydneyNow, getDayType } = rajat;

const MIN_OFFSET_SEC = 4 * 60;
const MAX_OFFSET_SEC = 9 * 60;
const MIN_STAY = 139;
const MAX_STAY = 162;

function computeTargets(base) {
  const r = rajat.computeTargets(base);
  if (!r) return null;
  const { dayType, dateKey } = r;
  const offsetSec = MIN_OFFSET_SEC + (simpleHash(dateKey + '-city-post-mohammed-checkin') % (MAX_OFFSET_SEC - MIN_OFFSET_SEC + 1));
  const checkinTarget = new Date(r.checkinTarget.getTime() + offsetSec * 1000);
  // Independent draw; if it equals Rajat's stay, re-draw with a new salt (always differs).
  let delayMin = r.delayMin;
  for (let i = 0; delayMin === r.delayMin; i++) {
    delayMin = MIN_STAY + (simpleHash(dateKey + '-city-post-mohammed-checkout-delay' + (i ? `-${i}` : '')) % (MAX_STAY - MIN_STAY + 1));
  }
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);
  return { dayType, checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, getDayType, simpleHash };
