// Deterministic daily randomness for the Yass schedule: given today's date, both the
// check-in poll and the check-out poll independently compute the exact same target
// times without needing to share state between separate workflow runs. Same date in
// -> same targets out, every time.
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

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 5, 0, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-yass-checkin') % (15 * 60 + 1); // 0..900 -> 5:00:00-5:15:00
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 70 + (simpleHash(dateKey + '-yass-checkout-delay') % 21); // 70..90 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
