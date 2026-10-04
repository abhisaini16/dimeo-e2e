// Deterministic daily randomness for the Griffith schedule (Mon-Fri; the planner skips weekends).
// Hash of today's date -> the same targets are derived independently by every caller.
// Check-in lands somewhere in 5:15pm-5:25pm; check-out 60-70 min after that.
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
  const checkinOffsetSec = simpleHash(dateKey + '-griffith-checkin') % (10 * 60 + 1); // 0..600 -> 5:15pm-5:25pm
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 60 + (simpleHash(dateKey + '-griffith-checkout-delay') % 11); // 60..70 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
