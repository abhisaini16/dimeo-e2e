// Mohammed Ibrahim's Canberra-GPO schedule (2026-11-18, Abhi): a third independent account
// at Canberra GPO, checking in at roughly the same time as Rajat. Check-in = Rajat's
// check-in target (lib/city-post-rajat-schedule.js, 6:04:30-6:31:30pm) + a random 4-9 min
// offset, so the two never land on the same minute; stay = random 140-162 whole minutes.
// Weekday and Saturday alike (GPO's DIMEO windows: Mon-Fri 4pm->9am, Sat 12:30pm->9am), no
// Sunday shift. Latest possible check-in ~6:41pm, latest check-out ~9:23pm.
// NOTE: only works once Mohammed (DIMEO cleaner 4610) is on the Canberra GPO cleaning
// schedule's timeslots; until then his My Cleans has no GPO card and runs return
// no-shift-found (the runner never touches "Available to Cover").
const rajat = require('./city-post-rajat-schedule');
const { simpleHash, sydneyNow, getDayType } = rajat;

const MIN_OFFSET_SEC = 4 * 60;
const MAX_OFFSET_SEC = 9 * 60;
const MIN_STAY = 140;
const MAX_STAY = 162;

function computeTargets(base) {
  const r = rajat.computeTargets(base);
  if (!r) return null;
  const { dayType, dateKey } = r;
  const offsetSec = MIN_OFFSET_SEC + (simpleHash(dateKey + '-city-post-mohammed-checkin') % (MAX_OFFSET_SEC - MIN_OFFSET_SEC + 1));
  const checkinTarget = new Date(r.checkinTarget.getTime() + offsetSec * 1000);
  const delayMin = MIN_STAY + (simpleHash(dateKey + '-city-post-mohammed-checkout-delay') % (MAX_STAY - MIN_STAY + 1));
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);
  return { dayType, checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, getDayType, simpleHash };
