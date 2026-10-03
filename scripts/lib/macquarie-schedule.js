// Deterministic weekday-only randomness for Macquarie-PO (same approach as
// lib/yass-schedule.js/lib/cooma-schedule.js): check-in lands somewhere in
// 5:30-6:00pm Sydney time, check-out 75-90 min after that. No Saturday/Sunday shift.
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

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()). Returns null on any
// day other than a weekday.
function computeTargets(base) {
  const day = base.getDay();
  if (day < 1 || day > 5) return null;

  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 17, 30, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-macquarie-checkin') % (30 * 60 + 1); // 0..1800 -> 5:30:00-6:00:00pm
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 75 + (simpleHash(dateKey + '-macquarie-checkout-delay') % 16); // 75..90 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
