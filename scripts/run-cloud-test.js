// One-off end-to-end test of the Cloud Run setup using the abhiaus980 account against
// Greenway-PO: wait 2 min, check in, wait 5 min, check out, report to Telegram.
// Run manually: gcloud run jobs execute dimeo-checkin --args=cloud-test
const sitesList = require('../tests/data/checkin-sites.json');
const { runGroup } = require('./lib/checkin-runner');
const { postResultsToGitHubIssue } = require('./lib/notify');

const sleep = (min) => new Promise((r) => setTimeout(r, min * 60_000));
const stamp = () => new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

(async () => {
  const entry = sitesList.find((s) => s.id === 'mitchell'); // abhiaus980@gmail.com account
  if (!entry) throw new Error('No "mitchell" entry in checkin-sites.json');
  const site = process.env.TEST_SITE || 'Greenway-PO';
  const mk = (id, label) => ({ id, label, email: entry.email, password: entry.password, sites: [site] });

  console.log(`[${stamp()}] Waiting 2 min before check-in...`);
  await sleep(2);
  const inRes = await runGroup(mk('cloud-test-in', 'Cloud test (check-in)'), { mode: 'checkin' });
  console.log(`[${stamp()}] check-in:`, inRes.map((r) => `${r.site}=${r.status}`).join(', '));
  postResultsToGitHubIssue(inRes, 'Cloud test: check-in', stamp());

  console.log(`[${stamp()}] Waiting 5 min before check-out...`);
  await sleep(5);
  const outRes = await runGroup(mk('cloud-test-out', 'Cloud test (check-out)'), { mode: 'checkout' });
  console.log(`[${stamp()}] check-out:`, outRes.map((r) => `${r.site}=${r.status}`).join(', '));
  postResultsToGitHubIssue(outRes, 'Cloud test: check-out', stamp());

  const ok = ['checked-in', 'already-checked-in'].includes(inRes[0]?.status) && ['done', 'already-done'].includes(outRes[0]?.status);
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('ERROR:', err.message);
  postResultsToGitHubIssue([{ site: '(crash)', status: `error: ${err.message}` }], 'Cloud test', stamp());
  process.exit(1);
});
