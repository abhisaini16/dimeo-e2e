// Deterministic daily randomness for the Narooma schedule (Mon-Fri; the planner skips weekends).
// Hash of today's date -> the same targets are derived independently by every caller.
// Check-in lands somewhere in 5:15pm-5:30pm; check-out 135-150 min after that.
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

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 17, 15, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-narooma-checkin') % (15 * 60 + 1); // 0..900 -> 5:15pm-5:30pm
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 135 + (simpleHash(dateKey + '-narooma-checkout-delay') % 16); // 135..150 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
