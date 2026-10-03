// Deterministic daily randomness for the Fyshwick-PO schedule. Unlike Yass/Cooma, the
// check-in window itself depends on the day: an early-morning window on weekdays, a
// very different afternoon window on Saturdays, and no shift at all on Sundays.
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
// Fyshwick-PO has no Sunday shift.
function getDayType(base) {
  const day = base.getDay();
  if (day >= 1 && day <= 5) return 'weekday';
  if (day === 6) return 'saturday';
  return null;
}

const WINDOWS = {
  weekday: { startHour: 6, startMinute: 18, windowMin: 27 },  // 6:18-6:45am
  saturday: { startHour: 14, startMinute: 14, windowMin: 16 }, // 2:14-2:30pm
};

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()).
function computeTargets(base) {
  const dayType = getDayType(base);
  if (!dayType) return null; // Sunday: no window to compute

  const { startHour, startMinute, windowMin } = WINDOWS[dayType];
  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), startHour, startMinute, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-fyshwick-checkin') % (windowMin * 60 + 1);
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 140 + (simpleHash(dateKey + '-fyshwick-checkout-delay') % 21); // 140..160 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { dayType, checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, getDayType, simpleHash };
