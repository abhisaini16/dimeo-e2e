// Runs once per cron trigger (4/day: checkin x2 DST states, checkout x2 DST states).
// Cheap: no npm install, no Playwright. Mirrors yass-decide.js — see that file for the
// full rationale. Cooma's early reference points differ: check-in ~5:47, check-out ~6:42
// (5 min before the earliest possible check-out target, same margin pattern as Yass).
const fs = require('fs');
const { sydneyNow } = require('./lib/cooma-schedule');

const TOLERANCE_MS = 20 * 60 * 1000;
// Early fixed reference points the cron entries aim for (not the random target itself).
const REFERENCE_MINUTES = { checkin: 5 * 60 + 47, checkout: 6 * 60 + 42 };

const forceAction = process.env.FORCE_ACTION || 'auto';     // 'auto' | 'checkin' | 'checkout'
const whichTrigger = process.env.WHICH_TRIGGER || 'checkin'; // which cron fired, set by the workflow
const forceWeekday = process.env.FORCE_WEEKDAY || 'real';    // 'real' | 'weekday' | 'weekend' (testing only)

const now = sydneyNow();
const action = (forceAction === 'checkin' || forceAction === 'checkout') ? forceAction : whichTrigger;

const nowMinutes = now.getHours() * 60 + now.getMinutes();
const minutesAway = Math.abs(nowMinutes - REFERENCE_MINUTES[action]);
const shouldAct = forceAction !== 'auto' || minutesAway <= TOLERANCE_MS / 60000;

const realIsWeekday = now.getDay() >= 1 && now.getDay() <= 5;
const isWeekday = forceWeekday === 'weekday' ? true : forceWeekday === 'weekend' ? false : realIsWeekday;

console.log(`Sydney now: ${now.toString()}`);
console.log(`Trigger: ${whichTrigger}, action: ${action}, minutes from reference: ${minutesAway}`);
console.log(`Should act: ${shouldAct} | Weekday: ${isWeekday} (real: ${realIsWeekday})`);

const out = process.env.GITHUB_OUTPUT;
fs.appendFileSync(out, `action=${action}\n`);
fs.appendFileSync(out, `should_act=${shouldAct}\n`);
fs.appendFileSync(out, `is_weekday=${isWeekday}\n`);
