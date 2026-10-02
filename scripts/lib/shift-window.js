// Parses a shift card's text into its actual start/end Date, so we can tell whether a
// shift is *currently active* right now — not just whether its listed (start) date is
// today. Overnight shifts (e.g. "Fri 2nd Oct 2026 | 4:00 PM -> Sat 3rd Oct 9:00 AM") are
// still active after midnight even though the card's own date line says "Fri 2nd Oct".
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const DATE_RE = /([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3})\s+(\d{4})/;
// Window: "4:00 PM -> Fri 2nd Oct 9:00 AM" (overnight) or "9:00 AM -> 2:00 PM" (same day).
// Accepts the real arrow (→) as well as a plain "-" fallback.
const WINDOW_RE = /(\d{1,2}:\d{2})\s*([AP]M)\s*(?:→|->|-)\s*(?:([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3})\s+)?(\d{1,2}:\d{2})\s*([AP]M)/i;

function to24Hour(hm, meridiem) {
  let [h, m] = hm.split(':').map(Number);
  const isPM = /pm/i.test(meridiem);
  if (h === 12) h = isPM ? 12 : 0;
  else if (isPM) h += 12;
  return { h, m };
}

function parseShiftWindow(cardText) {
  const dateMatch = cardText.match(DATE_RE);
  const windowMatch = cardText.match(WINDOW_RE);
  if (!dateMatch || !windowMatch) return null;

  const [, , startDay, startMonthStr, startYear] = dateMatch;
  const startMonth = MONTHS[startMonthStr.toLowerCase()];
  if (startMonth === undefined) return null;

  const [, startTime, startMeridiem, endWeekday, endDay, endMonthStr, endTime, endMeridiem] = windowMatch;
  const { h: startH, m: startM } = to24Hour(startTime, startMeridiem);
  const start = new Date(Number(startYear), startMonth, Number(startDay), startH, startM);

  let end;
  if (endDay && endMonthStr) {
    const endMonth = MONTHS[endMonthStr.toLowerCase()];
    if (endMonth === undefined) return null;
    const { h: endH, m: endM } = to24Hour(endTime, endMeridiem);
    // Shift doesn't span a year boundary in practice here; reuse the start year.
    end = new Date(Number(startYear), endMonth, Number(endDay), endH, endM);
  } else {
    const { h: endH, m: endM } = to24Hour(endTime, endMeridiem);
    end = new Date(Number(startYear), startMonth, Number(startDay), endH, endM);
  }

  return { start, end };
}

function isActiveNow(cardText, now = new Date()) {
  const window = parseShiftWindow(cardText);
  if (!window) return false;
  return now >= window.start && now <= window.end;
}

// Human-readable summary of a card for status messages: its date, its window as shown
// on the dashboard (not reformatted), its current status label, and the parsed window.
function describeCard(cardText, now = new Date()) {
  const dateMatch = cardText.match(DATE_RE);
  const windowMatch = cardText.match(WINDOW_RE);
  const status = /Finished/i.test(cardText)
    ? 'Finished'
    : /Checked in/i.test(cardText)
      ? 'Checked in'
      : 'Not checked in';
  const window = parseShiftWindow(cardText);
  return {
    dateLine: dateMatch ? dateMatch[0] : null,
    windowLine: windowMatch ? windowMatch[0] : null,
    status,
    window,
    active: window ? (now >= window.start && now <= window.end) : false,
  };
}

module.exports = { parseShiftWindow, isActiveNow, describeCard };
