// Single source of truth for every Cloud Scheduler job: server.js uses it to know what to
// run, deploy-scheduler.js uses it to create the matching Scheduler jobs. Times are
// Australia/Sydney wall-clock (Cloud Scheduler handles DST itself, so there's no
// AEDT/AEST cron pair like the GitHub workflows needed). Reference times mirror each
// scripts/<site>-decide.js REFERENCE_MINUTES.
const hm = (h, m) => ({ h, m });

// Sites with one shift pattern every day (decide script gates by trigger, not day-type).
const SIMPLE = {
  yass: { checkin: hm(5, 0), checkout: hm(6, 5) },
  cooma: { checkin: hm(5, 47), checkout: hm(6, 42) },
  macquarie: { checkin: hm(17, 30), checkout: hm(18, 40) },
};
// Sites with weekday + Saturday patterns (decide script gated by TARGET_DAY_TYPE).
const DAYTYPED = {
  queenbeyan: { weekday: { checkin: hm(18, 0), checkout: hm(19, 40) }, saturday: { checkin: hm(14, 0), checkout: hm(15, 40) } },
  kingston: { weekday: { checkin: hm(9, 55), checkout: hm(12, 10) }, saturday: { checkin: hm(17, 40), checkout: hm(19, 55) } },
  fyshwick: { weekday: { checkin: hm(21, 20), checkout: hm(23, 35) }, saturday: { checkin: hm(14, 14), checkout: hm(16, 29) } },
  belconnen: { weekday: { checkin: hm(22, 0), checkout: hm(23, 40) }, saturday: { checkin: hm(14, 0), checkout: hm(15, 40) } },
};

const jobs = {};
for (const [site, acts] of Object.entries(SIMPLE)) {
  for (const [action, t] of Object.entries(acts)) {
    jobs[`${site}-${action}`] = {
      decide: `scripts/${site}-decide.js`, script: `scripts/run-${site}-${action}.js`,
      env: { WHICH_TRIGGER: action }, cron: `${t.m} ${t.h} * * *`,
    };
  }
}
for (const [site, types] of Object.entries(DAYTYPED)) {
  for (const [dayType, acts] of Object.entries(types)) {
    for (const [action, t] of Object.entries(acts)) {
      jobs[`${site}-${dayType}-${action}`] = {
        decide: `scripts/${site}-decide.js`, script: `scripts/run-${site}-${action}.js`,
        env: { WHICH_TRIGGER: action, TARGET_DAY_TYPE: dayType },
        // decide script verifies day-type itself; cron just narrows to sensible days.
        cron: `${t.m} ${t.h} * * ${dayType === 'saturday' ? '6' : '1-5'}`,
      };
    }
  }
}
jobs['daily-batch'] = { script: 'scripts/run-checkin-final.js', env: {}, cron: '0 18 * * *' };
jobs['bega-medical'] = { script: 'scripts/run-bega-medical.js', env: {}, cron: '0 22 * * *' };

module.exports = { jobs };
