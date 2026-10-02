// Entry point for the GitHub Actions cron. The workflow fires twice a day (covering
// both AEST and AEDT, since GitHub Actions cron is fixed UTC and doesn't know about
// Australian daylight saving) — this exits immediately as a no-op unless the current
// Sydney/Canberra local time is actually close to 6:00 PM, so only one of the two
// triggers ever does real work, with no manual seasonal adjustment needed.
const sydneyNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
const minutesFromTarget = Math.abs((sydneyNow.getHours() * 60 + sydneyNow.getMinutes()) - (18 * 60));

if (minutesFromTarget > 20) {
  console.log(
    `Skipping this trigger: Australia/Sydney local time is ${sydneyNow.toTimeString().slice(0, 5)}, ` +
    `not close to 6:00 PM. This is expected for one of the two daily cron triggers (AEST vs AEDT).`
  );
  process.exit(0);
}

require('./run-checkin-final.js');
