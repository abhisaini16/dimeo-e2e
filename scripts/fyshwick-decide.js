// Runs once per cron trigger (8/day: weekday-checkin x2 DST, weekday-checkout x2 DST,
// saturday-checkin x2 DST, saturday-checkout x2 DST). Cheap: no npm install, no
// Playwright. Each cron pair targets one day-type (set via TARGET_DAY_TYPE by the
// workflow); this only proceeds when today's actual Sydney day-of-week matches that
// day-type AND we're near that day-type's early reference point. Sunday matches no
// pair — Fyshwick-PO has no Sunday shift.
const fs = require('fs');
const { sydneyNow, getDayType } = require('./lib/fyshwick-schedule');

const TOLERANCE_MS = 20 * 60 * 1000;
// Early fixed reference points the cron entries aim for (not the random target itself).
const REFERENCE_MINUTES = {
  weekday: { checkin: 6 * 60 + 18, checkout: 8 * 60 + 33 },
  saturday: { checkin: 14 * 60 + 14, checkout: 16 * 60 + 29 },
};

const forceAction = process.env.FORCE_ACTION || 'auto';         // 'auto' | 'checkin' | 'checkout'
const whichTrigger = process.env.WHICH_TRIGGER || 'checkin';     // which cron fired, set by the workflow
const targetDayType = process.env.TARGET_DAY_TYPE || 'weekday';  // which day-type this cron pair targets

const now = sydneyNow();
const action = (forceAction === 'checkin' || forceAction === 'checkout') ? forceAction : whichTrigger;
const todayDayType = getDayType(now); // 'weekday' | 'saturday' | null (Sunday)

const refMinutes = REFERENCE_MINUTES[targetDayType][action];
const nowMinutes = now.getHours() * 60 + now.getMinutes();
const minutesAway = Math.abs(nowMinutes - refMinutes);

const shouldAct = forceAction !== 'auto'
  || (todayDayType === targetDayType && minutesAway <= TOLERANCE_MS / 60000);

console.log(`Sydney now: ${now.toString()}`);
console.log(`Trigger: ${whichTrigger}, action: ${action}, target day-type: ${targetDayType}, today's day-type: ${todayDayType}`);
console.log(`Minutes from reference: ${minutesAway} | Should act: ${shouldAct}`);

const out = process.env.GITHUB_OUTPUT;
fs.appendFileSync(out, `action=${action}\n`);
fs.appendFileSync(out, `should_act=${shouldAct}\n`);
