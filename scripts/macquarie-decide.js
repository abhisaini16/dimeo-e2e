// Runs once per cron trigger (4/day: checkin x2 DST states, checkout x2 DST states).
// Macquarie-PO is weekday-only (no Saturday/Sunday shift), so this gates on weekday
// directly to avoid a pointless Playwright run on the weekend.
const fs = require('fs');
const { sydneyNow } = require('./lib/macquarie-schedule');

const TOLERANCE_MS = 20 * 60 * 1000;
// Early fixed reference points the cron entries aim for (not the random target itself).
const REFERENCE_MINUTES = { checkin: 17 * 60 + 30, checkout: 18 * 60 + 40 };

const forceAction = process.env.FORCE_ACTION || 'auto';     // 'auto' | 'checkin' | 'checkout'
const whichTrigger = process.env.WHICH_TRIGGER || 'checkin'; // which cron fired, set by the workflow

const now = sydneyNow();
const action = (forceAction === 'checkin' || forceAction === 'checkout') ? forceAction : whichTrigger;
const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;

const nowMinutes = now.getHours() * 60 + now.getMinutes();
const minutesAway = Math.abs(nowMinutes - REFERENCE_MINUTES[action]);

const shouldAct = forceAction !== 'auto' || (isWeekday && minutesAway <= TOLERANCE_MS / 60000);

console.log(`Sydney now: ${now.toString()}`);
console.log(`Trigger: ${whichTrigger}, action: ${action}, is weekday: ${isWeekday}`);
console.log(`Minutes from reference: ${minutesAway} | Should act: ${shouldAct}`);

const out = process.env.GITHUB_OUTPUT;
fs.appendFileSync(out, `action=${action}\n`);
fs.appendFileSync(out, `should_act=${shouldAct}\n`);
