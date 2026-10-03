// Runs once per cron trigger (4/day: checkin x2 DST states, checkout x2 DST states).
// Cheap: no npm install, no Playwright. Which action this trigger is for comes from
// WHICH_TRIGGER (set by the workflow based on github.event.schedule); this script just
// does a coarse sanity check (are we plausibly near the right early reference point?).
// Runs every day of the week — a day with no actual shift is handled by the live
// portal check in checkin-runner.js reporting "no-active-shift", not by a weekday
// guess here. The precise random landing happens via a short sleep inside the real
// check-in/check-out script itself — this step never needs fine-grained timing.
const fs = require('fs');
const { sydneyNow } = require('./lib/yass-schedule');

const TOLERANCE_MS = 20 * 60 * 1000;
// Early fixed reference points the cron entries aim for (not the random target itself).
const REFERENCE_MINUTES = { checkin: 5 * 60, checkout: 6 * 60 + 5 };

const forceAction = process.env.FORCE_ACTION || 'auto';     // 'auto' | 'checkin' | 'checkout'
const whichTrigger = process.env.WHICH_TRIGGER || 'checkin'; // which cron fired, set by the workflow

const now = sydneyNow();
const action = (forceAction === 'checkin' || forceAction === 'checkout') ? forceAction : whichTrigger;

const nowMinutes = now.getHours() * 60 + now.getMinutes();
const minutesAway = Math.abs(nowMinutes - REFERENCE_MINUTES[action]);
const shouldAct = forceAction !== 'auto' || minutesAway <= TOLERANCE_MS / 60000;

console.log(`Sydney now: ${now.toString()}`);
console.log(`Trigger: ${whichTrigger}, action: ${action}, minutes from reference: ${minutesAway}`);
console.log(`Should act: ${shouldAct}`);

const out = process.env.GITHUB_OUTPUT;
fs.appendFileSync(out, `action=${action}\n`);
fs.appendFileSync(out, `should_act=${shouldAct}\n`);
