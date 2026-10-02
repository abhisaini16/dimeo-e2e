// Maps our internal site keys (tests/data/sites.json) to how that site's name actually
// appears in a shift card on the dashboard. Confirmed against live dashboard dumps where
// noted; others are best-effort guesses that lean on the mandatory address cross-check
// in checkin-runner.js to catch a wrong match rather than relying on this alone.
//
// `all`: every substring must appear (case-insensitive) in the card's site-name line.
// `excludeAny`: if any of these appear, it's NOT a match (disambiguates lookalikes).
const MATCHERS = {
  'Mitchell-PO':        { all: ['MITCHELL'] },                         // confirmed: "MITCHELL-FLEMINGTON RD-PO"
  'Kingston-PO':         { all: ['KINGSTON', 'GILES'] },                // confirmed: "KINGSTON-GILES ST-PO"; excludes Kingston-Gallagher
  'Narooma-PO':          { all: ['NAROOMA'] },                          // confirmed: "NAROOMA-WAGONGA ST-PO"
  'Canberra-GPO':        { all: ['CANBERRA', 'GPO'], excludeAny: ['QBE'] }, // confirmed: "CANBERRA GPO"
  'QBE':                 { all: ['QBE'] },                              // confirmed: "Canberra - QBE"
  'Macquarie-PO':        { all: ['MACQUARIE'] },                        // confirmed: "MACQUARIE-JAMISON CTR-PO"
  'Belconnen-PO':        { all: ['BELCONNEN'], excludeAny: ['PSD'] },   // confirmed: "BELCONNEN-WESTFIELD SC-MX"; excludes a possible "PSD Belconnen" clinic shift
  'Jindabyne-PO':        { all: ['JINDABYNE'] },                        // confirmed: "JINDABYNE-6, 6 GIPPSLAND ST-PO"
  'Merimbula-PO':        { all: ['MERIMBULA'] },                        // confirmed: "MERIMBULA-MERIMBULA DR-PO"
  'Bega-PO':             { all: ['BEGA'], excludeAny: ['MEDIC'] },      // NOT confirmed verbatim on a card yet; address check is the real gate
  'Bega-Medical':        { all: ['BEGA', 'MEDIC'] },                    // confirmed: "Bega Medicare Urgent Care Clinic"
  'Greenway-PO':         { all: ['GREENWAY'], excludeAny: ['PSD'] },    // confirmed: "GREENWAY-TUG. HYPERDOME SC-PO"
  'Queenbeyan-PO':       { all: ['QUEANBEYAN'], excludeAny: ['PSD'] },  // confirmed: "QUEANBEYAN-CRAWFORD ST-PO"
  'Mawson-PO':           { all: ['MAWSON'] },                           // confirmed: "MAWSON-MAWSON DVE-PO"
  'Phillip-PO':          { all: ['PHILLIP'], excludeAny: ['PSD', 'SUNCORP'] }, // confirmed: "PHILLIP-BOWES PL-PO"
  'Fyshwick-PO':         { all: ['FYSHWICK'] },                         // confirmed: "FYSHWICK-TOWNSVILLE ST-PO"
  'Weston-PO':           { all: ['WESTON'] },                           // confirmed: "WESTON-5 SEC 63 TRENERRY ST-PO"
  'Dickson':             { all: ['DICKSON'] },                          // confirmed: "DICKSON-DICKSONPL-PO"
  'Kingston-Gallagher':  { all: ['GALLAGHER'] },                        // confirmed: "Kingston - Gallagher"
  'Suncorp-Phillip':     { all: ['SUNCORP', 'PHILLIP'] },               // confirmed: "Suncorp Phillip"
  'PSD-Manuka':          { all: ['PSD', 'MANUKA'] },                    // NOT confirmed verbatim; address check is the real gate
  'Griffith-PO':         { all: ['GRIFFITH'] },                         // confirmed: "GRIFFITH-FRANKLIN WAY-PO"
  'PSD-Queenbeyan':      { all: ['PSD', 'QUEANBEYAN'] },                // NOT confirmed verbatim
  'PSD-Tuggeranong':     { all: ['PSD', 'TUGG'] },                      // NOT confirmed verbatim; 'TUGG' covers Tuggeranong/Tuggernong spelling
  'PSD-Woden':           { all: ['PSD', 'WODEN'] },                     // NOT confirmed verbatim
  'Cooma-PO':            { all: ['COOMA'] },                            // confirmed shift exists as "COOMA-VALE ST-PO"; NOTE address mismatch, see sites.json
  'BMD':                 { all: ['WHITLAM'] },                          // confirmed: "Whitlam Site Shed"
  'Yass-PO':             { all: ['YASS'] },                             // confirmed: "YASS-COMUR ST-MX"
};

function cardMatchesSite(cardText, siteKey) {
  const matcher = MATCHERS[siteKey];
  if (!matcher) throw new Error(`No card matcher defined for site key "${siteKey}"`);
  const upper = cardText.toUpperCase();
  const allOk = matcher.all.every((s) => upper.includes(s.toUpperCase()));
  const excluded = (matcher.excludeAny || []).some((s) => upper.includes(s.toUpperCase()));
  return allOk && !excluded;
}

module.exports = { MATCHERS, cardMatchesSite };
