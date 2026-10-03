// Deterministic daily randomness for the Cooma-PO schedule — same approach as
// lib/yass-schedule.js (hash of today's date, same target both independently
// re-derive), with Cooma's own window: check-in lands somewhere in 5:47-6:02,
// check-out 60-75 min after that.
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

  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 5, 47, 0);
  const checkinOffsetSec = simpleHash(dateKey + '-cooma-checkin') % (15 * 60 + 1); // 0..900 -> 5:47:00-6:02:00
  checkinTarget.setSeconds(checkinTarget.getSeconds() + checkinOffsetSec);

  const delayMin = 60 + (simpleHash(dateKey + '-cooma-checkout-delay') % 16); // 60..75 inclusive
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);

  return { checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
