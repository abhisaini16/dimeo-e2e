// Merimbula PO on Shashika's login (2026-11-18, Abhi): runs right after her Bega PO session.
// Check-in = Bega PO's check-out target (lib/bega-po-schedule.js) + a random 27-34 min
// (whole-session spacing rule for one cleaner); stay = random 90-105 min, same as Bega PO
// and the existing Merimbula entry. Mon-Fri only (planner MON_FRI_ONLY). The planner's
// sequenceAccountBlocks() also enforces Bega checkout + 27-34 min on the shared login, so
// whichever of the two gaps is larger wins (both are inside 27-34 min).
// NOTE: Shashika (DIMEO cleaner 4545) has no Merimbula card yet: her site registration
// RQ40820 is Pending Review and she isn't on Merimbula's cleaning schedule (2525), so runs
// return no-shift-found until DAS approves/allocates her. The Dhanesh `merimbula` entry
// keeps covering Merimbula meanwhile.
const bega = require('./bega-po-schedule');
const { simpleHash, sydneyNow } = bega;

function computeTargets(base) {
  const b = bega.computeTargets(base);
  const { dateKey } = b;
  const gapSec = 27 * 60 + (simpleHash(dateKey + '-merimbula-shashika-gap') % (7 * 60 + 1)); // 27:00..34:00
  const checkinTarget = new Date(b.checkoutTarget.getTime() + gapSec * 1000);
  const delayMin = 90 + (simpleHash(dateKey + '-merimbula-shashika-checkout-delay') % 16); // 90..105
  const checkoutTarget = new Date(checkinTarget.getTime() + delayMin * 60_000);
  return { checkinTarget, checkoutTarget, delayMin, dateKey };
}

module.exports = { sydneyNow, computeTargets, simpleHash };
