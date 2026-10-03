// Runs only on a weekend hit: reports "no shift" directly, without touching the
// portal at all, since Cooma-PO only runs Monday-Friday.
const { postResultsToGitHubIssue } = require('./lib/notify');

const action = process.env.COOMA_ACTION; // 'checkin' or 'checkout'
const label = action === 'checkin' ? 'Cooma Check-in' : 'Cooma Check-out';
const nowStr = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

console.log(`${label}: today is a weekend — Cooma-PO doesn't run Sat/Sun. Reporting no shift.`);
postResultsToGitHubIssue([{ site: 'Cooma-PO', status: 'no-shift-today' }], label, nowStr);
