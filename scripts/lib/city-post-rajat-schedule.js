// Deterministic daily randomness for Rajat's Canberra-GPO schedule (owner's request,
// 2026-10-08): a second, independent account checking in/out at the same site as
// Kinley's (lib/city-post-schedule.js) — same window shape (6:15-6:30pm check-in,
// ~2.5-2.75h check-out, weekday and Saturday alike, no Sunday shift) but different hash
// salts, so the two accounts' random times land differently even on the same day. No
// shared-login gap logic applies here: these are two separate accounts, not one login
// covering multiple sites.
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
  weekday: { startHour: 18, startMinute: 15, windowMin: 15 }, // 6:15pm-6:30pm
  saturday: { startHour: 18, startMinute: 15, windowMin: 15 }, // 6:15pm-6:30pm
};

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()).
function computeTargets(base) {
  const dayType = getDayType(base);
  if (!dayType) return null; // Sunday: no window to compute

  const { startHour, startMinute, windowMin } = WINDOWS[dayType];
  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), startHour, startMinute, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-city-post-rajat-checkin') % (windowMin * 60 + 1);
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 150 + (simpleHash(dateKey + '-city-post-rajat-checkout-delay') % 16); // 150..165 inclusive (2.5-2.75h)
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { dayType, checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, getDayType, simpleHash };
