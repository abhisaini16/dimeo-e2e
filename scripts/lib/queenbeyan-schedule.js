// Deterministic daily randomness for the Queenbeyan-PO schedule. Day-type-aware, same
// approach as lib/fyshwick-schedule.js/lib/kingston-schedule.js: an evening window on
// weekdays, a different afternoon window on Saturdays, no shift on Sundays.
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
// Queenbeyan-PO has no Sunday shift.
function getDayType(base) {
  const day = base.getDay();
  if (day >= 1 && day <= 5) return 'weekday';
  if (day === 6) return 'saturday';
  return null;
}

const WINDOWS = {
  weekday: { startHour: 18, startMinute: 0, windowMin: 34 }, // 6:00-6:34pm
  saturday: { startHour: 14, startMinute: 0, windowMin: 60 }, // 2:00-3:00pm (shared
  // with Belconnen-PO, but uses its own hash salt below so the actual randomized
  // landing time differs from Belconnen's)
};

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()).
function computeTargets(base) {
  const dayType = getDayType(base);
  if (!dayType) return null; // Sunday: no window to compute

  const { startHour, startMinute, windowMin } = WINDOWS[dayType];
  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), startHour, startMinute, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-queenbeyan-checkin') % (windowMin * 60 + 1);
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 105 + (simpleHash(dateKey + '-queenbeyan-checkout-delay') % 16); // 105..120 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { dayType, checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, getDayType, simpleHash };
