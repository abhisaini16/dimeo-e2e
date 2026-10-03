// Runs on every poll tick (every 5 min, broad window). Cheap: no npm install, no
// Playwright — just time math against today's deterministic targets. Writes outputs
// for the workflow to decide which (expensive) steps, if any, to run this tick.
const fs = require('fs');
const { sydneyNow, computeTargets } = require('./lib/yass-schedule');

const TOLERANCE_MS = 2.4 * 60 * 1000; // just under half the 5-min poll interval

const forceAction = process.env.FORCE_ACTION || 'auto';   // 'auto' | 'checkin' | 'checkout'
const forceWeekday = process.env.FORCE_WEEKDAY || 'real';  // 'real' | 'weekday' | 'weekend' (testing only)

const now = sydneyNow();
const { checkinTarget, checkoutTarget, delayMin, dateKey } = computeTargets(now);

let action = null;
if (forceAction === 'checkin' || forceAction === 'checkout') {
  action = forceAction;
} else {
  if (Math.abs(now - checkinTarget) <= TOLERANCE_MS) action = 'checkin';
  else if (Math.abs(now - checkoutTarget) <= TOLERANCE_MS) action = 'checkout';
}

const realIsWeekday = now.getDay() >= 1 && now.getDay() <= 5;
const isWeekday = forceWeekday === 'weekday' ? true : forceWeekday === 'weekend' ? false : realIsWeekday;

console.log(`Date: ${dateKey}`);
console.log(`Sydney now: ${now.toString()}`);
console.log(`Today's check-in target: ${checkinTarget.toString()}`);
console.log(`Today's check-out target: ${checkoutTarget.toString()} (+${delayMin} min after check-in)`);
console.log(`Action this tick: ${action || 'none'} | Weekday: ${isWeekday} (real: ${realIsWeekday})`);

const out = process.env.GITHUB_OUTPUT;
fs.appendFileSync(out, `action=${action || 'none'}\n`);
fs.appendFileSync(out, `should_act=${action ? 'true' : 'false'}\n`);
fs.appendFileSync(out, `is_weekday=${isWeekday}\n`);
