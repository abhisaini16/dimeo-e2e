const groups = require('../tests/data/checkin-groups.json');
const { runGroup } = require('./lib/checkin-runner');

const groupId = process.argv[2];
if (!groupId) {
  console.error('Usage: node scripts/run-checkin-group.js <group-id>');
  console.error('Available groups:', groups.map((g) => g.id).join(', '));
  process.exit(1);
}

const group = groups.find((g) => g.id === groupId);
if (!group) {
  console.error(`Unknown group "${groupId}". Available groups:`, groups.map((g) => g.id).join(', '));
  process.exit(1);
}

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
