const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');

const siteId = process.argv[2];
if (!siteId) {
  console.error('Usage: node scripts/run-checkin-site.js <site-id>');
  console.error('Available sites:', sitesList.map((s) => s.id).join(', '));
  process.exit(1);
}

const entry = sitesList.find((s) => s.id === siteId);
if (!entry) {
  console.error(`Unknown site "${siteId}". Available sites:`, sitesList.map((s) => s.id).join(', '));
  process.exit(1);
}

// Reuses the exact same engine as the group runner — a "group" of one site.
const group = { id: entry.id, label: entry.label, email: entry.email, password: entry.password, sites: [entry.site] };

runGroup(group).then((results) => {
  console.log(`\n=== ${group.label} — summary ===`);
  for (const r of results) {
    console.log(`  ${r.site}: ${r.status}`);
  }
  const BENIGN = ['done', 'already-done', 'no-active-shift', 'no-shift-today', 'checked-in-awaiting-checkout'];
  const failed = results.some((r) => !BENIGN.includes(r.status));
  process.exit(failed ? 1 : 0);
}).catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
