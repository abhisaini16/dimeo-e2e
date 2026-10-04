// Deterministic daily randomness for the Cooma schedule (Mon-Fri; the planner skips weekends).
// Hash of today's date -> the same targets are derived independently by every caller.
// Check-in lands somewhere in 5:45am-6:00am; check-out 60-75 min after that.
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

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()) — its getFullYear/
// getMonth/getDate/getDay are read as Sydney-local throughout this codebase.
function computeTargets(base) {
  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 5, 45, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-cooma-checkin') % (15 * 60 + 1); // 0..900 -> 5:45am-6:00am
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 60 + (simpleHash(dateKey + '-cooma-checkout-delay') % 16); // 60..75 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
