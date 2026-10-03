// Deterministic Saturday-only randomness for Queenbeyan-PO. Weekdays continue to be
// handled by the regular 6pm daily batch (run-checkin-final.js) — this dedicated
// schedule only applies on Saturdays, landing check-in somewhere in 2:00-3:00pm and
// check-out a fixed 105 min (1.75hr) later. Uses its own hash salt so its random
// landing time differs from Belconnen-PO's, even though they share the same window.
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

const WINDOW = { startHour: 14, startMinute: 0, windowMin: 60 }; // 2:00-3:00pm
const CHECKOUT_DELAY_MIN = 105; // fixed 1.75 hour, not randomized

// `base` is a "Sydney wall-clock" Date (e.g. from sydneyNow()). Returns null on any
// day other than Saturday.
function computeTargets(base) {
  if (base.getDay() !== 6) return null;

  const dateKey = `${base.getFullYear()}-${base.getMonth() + 1}-${base.getDate()}`;
  const checkinTarget = new Date(base.getFullYear(), base.getMonth(), base.getDate(), WINDOW.startHour, WINDOW.startMinute, 0);
  const offsetSec = simpleHash(dateKey + '-queenbeyan-checkin') % (WINDOW.windowMin * 60 + 1);
  checkinTarget.setSeconds(checkinTarget.getSeconds() + offsetSec);

  const checkoutTarget = new Date(checkinTarget.getTime() + CHECKOUT_DELAY_MIN * 60_000);

  return { checkinTarget, checkoutTarget, delayMin: CHECKOUT_DELAY_MIN, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
