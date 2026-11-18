// Deterministic daily randomness for Rajat's Canberra-GPO schedule (owner's request,
// 2026-10-08): a second, independent account checking in/out at the same site as
// Kinley's (lib/city-post-schedule.js) — same window shape (6:15-6:30pm check-in,
// ~2.5-2.75h check-out, weekday and Saturday alike, no Sunday shift) but different hash
// salts, so the two accounts' random times land differently even on the same day. No
// shared-login gap logic applies here: these are two separate accounts, not one login
// covering multiple sites.
// 2026-11-17 (Abhi): Rajat now checks in at a random time between 6:04pm and 6:32pm
// (weekday and Saturday alike; GPO's DIMEO window is 4pm/12:30pm Sat -> 9am, so 6:04pm is
// inside both) and stays a random 287-301 min (whole minutes) before checking out.
// 2026-11-18 (Abhi): stay is now 140-162 min (latest possible check-out 9:14pm). The planner pins these times exactly
// (EXACT_SITES in commands/cloud/planner.js) so clash-spacing can't move them.
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function sydneyNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
}

// Which day-type window applies for a given Sydney-local date. null means Sunday —
// Canberra-GPO has no Sunday shift.
function getDayType(base) {
  const day = base.getDay();
  if (day >= 1 && day <= 5) return 'weekday';
  if (day === 6) return 'saturday';
  return null;
}

const WINDOWS = {
  // 2026-11-18 11:38am (Abhi): Mon-Fri 6:02-6:37pm, Saturday 2:48-3:48pm (GPO Sat window opens 12:30pm).
  weekday: { startHour: 18, startMinute: 2, windowMin: 35 }, // 6:02pm-6:37pm
  saturday: { startHour: 14, startMinute: 48, windowMin: 60 }, // 2:48pm-3:48pm
};

// 2026-11-18 (Abhi): stay a random 139-162 min (was 287-301). Mohammed's stay is drawn
// independently and re-drawn if equal (lib/city-post-mohammed-schedule.js).
const MIN_STAY = 139; // minutes on site, inclusive
const MAX_STAY = 162;

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()).
function computeTargets(base) {
  const dayType = getDayType(base);
  if (!dayType) return null; // Sunday: no window to compute

  const { startHour, startMinute, windowMin } = WINDOWS[dayType];
  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), startHour, startMinute, 0);
  // 30s margin at each end: the task fires 45s early and the click lands ~30-40s after
  // container start, so this keeps the real click inside the window.
  const checkinOffsetSec = 30 + (simpleHash(dateKey + '-city-post-rajat-checkin') % (windowMin * 60 - 60 + 1));
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = MIN_STAY + (simpleHash(dateKey + '-city-post-rajat-checkout-delay') % (MAX_STAY - MIN_STAY + 1)); // 139..162 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { dayType, checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, getDayType, simpleHash };
