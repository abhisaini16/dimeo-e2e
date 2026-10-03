// Runs once per cron trigger (4/day: checkin x2 DST states, checkout x2 DST states).
// Belconnen only gets this dedicated randomized treatment on Saturdays - weekdays are
// handled by the regular 6pm daily batch, so any non-Saturday hit here just stays silent.
const fs = require('fs');
const { sydneyNow } = require('./lib/belconnen-schedule');

const TOLERANCE_MS = 20 * 60 * 1000;
// Early fixed reference points the cron entries aim for (not the random target itself).
const REFERENCE_MINUTES = { checkin: 14 * 60, checkout: 15 * 60 + 40 };

const forceAction = process.env.FORCE_ACTION || 'auto';     // 'auto' | 'checkin' | 'checkout'
const whichTrigger = process.env.WHICH_TRIGGER || 'checkin'; // which cron fired, set by the workflow

const now = sydneyNow();
const action = (forceAction === 'checkin' || forceAction === 'checkout') ? forceAction : whichTrigger;
const isSaturday = now.getDay() === 6;

const nowMinutes = now.getHours() * 60 + now.getMinutes();
const minutesAway = Math.abs(nowMinutes - REFERENCE_MINUTES[action]);

const shouldAct = forceAction !== 'auto' || (isSaturday && minutesAway <= TOLERANCE_MS / 60000);

console.log(`Sydney now: ${now.toString()}`);
console.log(`Trigger: ${whichTrigger}, action: ${action}, is Saturday: ${isSaturday}`);
console.log(`Minutes from reference: ${minutesAway} | Should act: ${shouldAct}`);

const out = process.env.GITHUB_OUTPUT;
fs.appendFileSync(out, `action=${action}\n`);
fs.appendFileSync(out, `should_act=${shouldAct}\n`);
