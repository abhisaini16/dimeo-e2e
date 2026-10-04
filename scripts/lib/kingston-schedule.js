// Deterministic daily randomness for the Kingston-PO schedule. Same day-type-aware
// approach as lib/fyshwick-schedule.js: an early-morning-ish window on weekdays, a
// different afternoon window on Saturdays, no shift on Sundays.
//
// Kingston's windows are deliberately placed to start 30 min after Fyshwick-PO's
// latest possible finish on each day-type (weekday: 6:45am start + 160 min max delay
// = 9:25am latest finish -> 9:55am; Saturday: 2:30pm start + 160 min max delay =
// 5:10pm latest finish -> 5:40pm). This is a static time offset only — there is no
// runtime dependency on the Fyshwick workflow actually finishing.
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
// Kingston-PO has no Sunday shift.
function getDayType(base) {
  const day = base.getDay();
  if (day >= 1 && day <= 5) return 'weekday';
  if (day === 6) return 'saturday';
  return null;
}

const WINDOWS = {
  weekday: { startHour: 17, startMinute: 40, windowMin: 15 }, // 5:40pm-5:55pm
  saturday: { startHour: 17, startMinute: 40, windowMin: 15 }, // 5:40pm-5:55pm
};

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()).
function computeTargets(base) {
  const dayType = getDayType(base);
  if (!dayType) return null; // Sunday: no window to compute

  const { startHour, startMinute, windowMin } = WINDOWS[dayType];
  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), startHour, startMinute, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-kingston-checkin') % (windowMin * 60 + 1);
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 145 + (simpleHash(dateKey + '-kingston-checkout-delay') % 16); // 145..160 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { dayType, checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, getDayType, simpleHash };
