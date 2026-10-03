// Runs only on a weekend hit: reports "no shift" directly, without touching the
// portal at all, since Yass only runs Monday-Friday.
const { postResultsToGitHubIssue } = require('./lib/notify');

const action = process.env.YASS_ACTION; // 'checkin' or 'checkout'
const label = action === 'checkin' ? 'Yass Check-in' : 'Yass Check-out';
const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

console.log(`${label}: today is a weekend — Yass-PO doesn't run Sat/Sun. Reporting no shift.`);
postResultsToGitHubIssue([{ site: 'Yass-PO', status: 'no-shift-today' }], label, nowStr);
