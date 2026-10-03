// Runs once per cron trigger (8/day: weekday-checkin x2 DST, weekday-checkout x2 DST,
// saturday-checkin x2 DST, saturday-checkout x2 DST). Mirrors fyshwick-decide.js — see
// that file for the full rationale. Kingston's reference points differ (its windows
// are placed 30 min after Fyshwick's latest possible finish on each day-type).
const fs = require('fs');
const { sydneyNow, getDayType } = require('./lib/kingston-schedule');

const TOLERANCE_MS = 20 * 60 * 1000;
// Early fixed reference points the cron entries aim for (not the random target itself).
const REFERENCE_MINUTES = {
  weekday: { checkin: 9 * 60 + 55, checkout: 12 * 60 + 10 },
  saturday: { checkin: 17 * 60 + 40, checkout: 19 * 60 + 55 },
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
