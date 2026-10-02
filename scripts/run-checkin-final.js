// A fixed, curated set of sites spanning multiple accounts, run in one go.
// Each distinct account logs in once and handles whichever of these sites belong to it.
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');

const SELECTED_IDS = [
  'psd-manuka',
  'psd-tuggeranong',
  'psd-woden',
  'psd-queenbeyan',
  'qbe',
  'suncorp-phillip',
  'bega-medical',
  'kingston-gallagher',
];

(async () => {
  const entries = SELECTED_IDS.map((id) => {
    const e = sitesList.find((s) => s.id === id);
    if (!e) throw new Error(`Unknown site id "${id}" — check tests/data/checkin-sites.json`);
    return e;
  });

  // Group by account so each login is used exactly once, even though these 8 sites
  // belong to 5 different accounts.
  const byAccount = new Map();
  for (const e of entries) {
    const key = `${e.email}:::${e.password}`;
    if (!byAccount.has(key)) {
      byAccount.set(key, { email: e.email, password: e.password, sites: [], labels: [] });
    }
    const acct = byAccount.get(key);
    acct.sites.push(e.site);
    acct.labels.push(e.label);
  }

  const allResults = [];
  for (const acct of byAccount.values()) {
    console.log(`\n>>> Logging in as ${acct.email} for: ${acct.labels.join(', ')}`);
    const group = {
      id: acct.email,
      label: acct.labels.join(' & '),
      email: acct.email,
      password: acct.password,
      sites: acct.sites,
    };
    const results = await runGroup(group);
    allResults.push(...results);
  }

  console.log('\n=== Final combined summary ===');
  for (const r of allResults) {
    console.log(`  ${r.site}: ${r.status}`);
  }

  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today', 'checked-in-awaiting-checkout'];
  const failed = allResults.some((r) => !BENIGN.includes(r.status));
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
