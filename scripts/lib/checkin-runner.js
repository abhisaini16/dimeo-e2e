const { chromium } = require('playwright');
const sites = require('../../tests/data/sites.json');
const { cardMatchesSite } = require('./site-matchers');
const { describeCard } = require('./shift-window');

const sitesByKey = Object.fromEntries(sites.map((s) => [s.name, s]));

// Best-effort: does the shift's displayed address plausibly refer to the same place as
// our stored address for this site? Exact string equality is too strict (street-type
// abbreviations vary between sources, e.g. "Mawson Dve" vs "Mawson Pl"), so this checks
// for shared significant words (suburb names, numbers) rather than an exact match.
function addressPlausiblyMatches(shownAddress, knownAddress) {
  if (!knownAddress) return true; // no reference address to check against (e.g. BMD)
  const STOPWORDS = new Set(['st', 'street', 'rd', 'road', 'dr', 'dve', 'drive', 'pl', 'place',
    'shop', 'unit', 'level', 'ave', 'avenue', 'act', 'nsw', 'the', 'centre', 'center']);
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const shownWords = new Set(words(shownAddress));
  const knownWords = words(knownAddress);
  const hits = knownWords.filter((w) => shownWords.has(w));
  return hits.length >= 1; // at least one meaningful word in common (usually the suburb)
}

// Different clients show different hazard-confirmation modals: Australia Post sites show
// one after Check Out with "Add Hazard" / "Skip" buttons; ForHealth (e.g. Bega Medical)
// shows one right after Check In with a single "Continue" button that must be clicked
// before the check-in actually registers. Dismiss whichever one shows up, if any.
async function dismissHazardModalIfPresent(page) {
  const dismissBtn = page.getByRole('button', { name: /^(continue|skip)$/i });
  if (await dismissBtn.isVisible().catch(() => false)) {
    await dismissBtn.click();
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

async function runGroup(group, { headless = true, mode = 'both', interSiteDelayMs = 0 } = {}) {
  // mode: 'both' (default, check in then out), 'checkin' (stop after check-in),
  // or 'checkout' (skip straight to checkout, expects it's already checked in).
  // interSiteDelayMs: if set, waits this long before each site after the first one
  // in this group's list (the caller handles the gap before the group's own first
  // site, if any gap is needed there too).
  const results = [];
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ permissions: ['geolocation'] });
  const page = await context.newPage();
  const log = (...a) => console.log(`[${group.id}]`, ...a);

  try {
    await page.goto('https://portal.dimeo.com.au/login/', { waitUntil: 'networkidle' });
    await page.locator('#id_username').fill(group.email);
    await page.getByRole('button', { name: /log in/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="password"]').first().fill(group.password);
    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.getByRole('button', { name: /log in/i }).first().click(),
    ]);

    // Dimeo's post-login landing page changed from /mobile/ to /mobile/shifts/ at some
    // point - accept /mobile itself or any sub-path under it, not just the exact root.
    if (!/\/mobile(\/|$)/.test(page.url())) {
      log('LOGIN FAILED — aborting group. Current URL:', page.url());
      results.push({ site: '(login)', status: 'login-failed' });
      return results;
    }
    log(`Logged in as "${group.label}". Sites to handle: ${group.sites.join(', ')}`);

    const now = new Date();
    const shortDate = (d) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const announceNext = (i) => {
      if (i < group.sites.length - 1) log(`>>> Moving on to next site: ${group.sites[i + 1]}`);
    };

    for (let i = 0; i < group.sites.length; i++) {
      if (i > 0 && interSiteDelayMs > 0) {
        log(`Waiting ${(interSiteDelayMs / 60000).toFixed(0)} min before next site...`);
        await new Promise((r) => setTimeout(r, interSiteDelayMs));
      }
      const siteKey = group.sites[i];
      const known = sitesByKey[siteKey];
      if (!known) {
        log(`SKIP ${siteKey}: not found in tests/data/sites.json`);
        results.push({ site: siteKey, status: 'unknown-site' });
        announceNext(i);
        continue;
      }

      log(`Looking for ${siteKey} shift (checking ${shortDate(yesterday)} - ${shortDate(now)})...`);

      await page.goto('https://portal.dimeo.com.au/mobile/', { waitUntil: 'networkidle' });
      const cards = await page.$$eval('a[href*="/mobile/shifts/"]', (els) =>
        els.map((e) => ({ href: e.getAttribute('href'), text: e.innerText }))
      );
      const matching = cards
        .filter((c) => cardMatchesSite(c.text, siteKey))
        .map((c) => ({ ...c, info: describeCard(c.text, now) }))
        .filter((c) => c.info.window); // drop any card we couldn't parse a date/window from

      if (matching.length === 0) {
        log(`SKIP ${siteKey}: no shift found for this site at all (check the site matcher in site-matchers.js).`);
        results.push({ site: siteKey, status: 'no-shift-found' });
        announceNext(i);
        continue;
      }

      // Pick whichever shift is closest to now by date, regardless of its status —
      // that's "today's" (or "yesterday's still-active") shift. Deciding what to do
      // about its status (Finished / Checked in / Not checked in) happens after.
      matching.sort((a, b) => Math.abs(a.info.window.start - now) - Math.abs(b.info.window.start - now));
      const chosen = matching[0];
      const hoursAway = Math.abs(chosen.info.window.start - now) / 3_600_000;

      if (hoursAway > 36) {
        // Not every site runs every day (e.g. some skip weekends) — this is a normal,
        // expected outcome, not an error.
        log(`NO SHIFT TODAY for ${siteKey}: nearest shift is ${chosen.info.dateLine} (${hoursAway.toFixed(0)}h away). This site may not run every day (e.g. weekends off).`);
        results.push({ site: siteKey, status: 'no-shift-today' });
        announceNext(i);
        continue;
      }

      log(`Found ${siteKey}: ${chosen.info.dateLine} | ${chosen.info.windowLine} | status: ${chosen.info.status}`);

      if (chosen.info.status === 'Finished') {
        log(`NOTE: ${siteKey} shift for ${chosen.info.dateLine} was already Finished before I proceeded — no action taken.`);
        results.push({ site: siteKey, status: 'already-done' });
        announceNext(i);
        continue;
      }

      if (!chosen.info.active) {
        if (chosen.info.window && now < chosen.info.window.start) {
          // The nearest shift hasn't started yet (e.g. a public holiday today means the
          // only shift found is tomorrow's) — this is "no shift today", not a failure,
          // even though it's within the 36h window checked above. Don't attempt it.
          log(`NO SHIFT TODAY for ${siteKey}: nearest shift is ${chosen.info.dateLine} (${chosen.info.windowLine}), which hasn't started yet. No active shift found for today.`);
          results.push({ site: siteKey, status: 'no-shift-today' });
          announceNext(i);
          continue;
        }
        log(`NOTE: ${siteKey}'s cleaning window (${chosen.info.windowLine}) is outside the current time, but it's still listed as "${chosen.info.status}" — attempting anyway.`);
      }

      const shiftUrl = `https://portal.dimeo.com.au${chosen.href}`;
      await page.goto(shiftUrl, { waitUntil: 'networkidle' });

      const shownAddress = await page.locator('body').evaluate(() => {
        const label = Array.from(document.querySelectorAll('*'))
          .find((el) => el.textContent?.trim() === 'Address' && el.children.length === 0);
        return label?.nextElementSibling?.textContent?.trim() ?? '';
      });

      if (!addressPlausiblyMatches(shownAddress, known.address)) {
        log(`SKIP ${siteKey}: address mismatch — shift shows "${shownAddress}", expected something like "${known.address}". Not checking in.`);
        results.push({ site: siteKey, status: 'address-mismatch', shownAddress });
        announceNext(i);
        continue;
      }

      const bodyText = await page.locator('body').innerText();
      // A page already checked in (but not yet out) shows a "Check Out" control and
      // neither "Finished" nor "Check In" anywhere — that's a normal state, not a
      // broken one, and must be accepted here or checkout-mode runs can never proceed.
      if (/\bFinished\b/.test(bodyText) === false && /Check In/.test(bodyText) === false && /Check Out/.test(bodyText) === false) {
        log(`SKIP ${siteKey}: unexpected page state, no Check In control found.`);
        results.push({ site: siteKey, status: 'no-checkin-control' });
        announceNext(i);
        continue;
      }
      if (/Checked In/.test(bodyText) && /Checked Out/.test(bodyText)) {
        log(`NOTE: ${siteKey} shift for ${chosen.info.dateLine} was already Finished before I proceeded — no action taken.`);
        results.push({ site: siteKey, status: 'already-done' });
        announceNext(i);
        continue;
      }
      const alreadyCheckedIn = /Checked In/.test(bodyText);

      if (mode === 'checkout' && !alreadyCheckedIn) {
        log(`SKIP ${siteKey}: checkout-only run, but shift isn't checked in yet — nothing to check out.`);
        results.push({ site: siteKey, status: 'not-yet-checked-in' });
        announceNext(i);
        continue;
      }
      if (mode === 'checkin' && alreadyCheckedIn) {
        log(`SKIP ${siteKey}: checkin-only run, but shift is already checked in.`);
        results.push({ site: siteKey, status: 'already-checked-in' });
        announceNext(i);
        continue;
      }

      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: known.lat, longitude: known.lon, accuracy: 20 });
      await page.reload({ waitUntil: 'networkidle' }); // geolocation is read once on mount

      if (mode !== 'checkout' && !alreadyCheckedIn) {
        log(`Attempting Check In for ${siteKey}...`);
        const checkInBtn = page.getByRole('button', { name: /^check in$/i });
        if (!(await checkInBtn.isVisible().catch(() => false))) {
          log(`SKIP ${siteKey}: Check In button not available after setting location (shift may already be finished).`);
          results.push({ site: siteKey, status: 'no-checkin-button' });
          announceNext(i);
          continue;
        }
        await checkInBtn.click();
        await page.waitForTimeout(1000);
        if (await page.getByText('Not with in 300m of location').isVisible().catch(() => false)) {
          log(`FAIL ${siteKey}: outside 300m geofence with stored coordinates (${known.lat}, ${known.lon}). Check sites.json.`);
          results.push({ site: siteKey, status: 'geofence-failed' });
          announceNext(i);
          continue;
        }
        await dismissHazardModalIfPresent(page); // some clients confirm hazards right after Check In

        if (mode === 'checkin') {
          log(`DONE ${siteKey}: checked in successfully (checkout-only run will complete this later).`);
          results.push({ site: siteKey, status: 'checked-in' });
          announceNext(i);
          continue;
        }
        log(`${siteKey}: Checked In confirmed. Attempting Check Out...`);
      } else {
        log(`${siteKey} was already checked in from a prior run; looking for Check Out.`);
      }

      const checkOutBtn = page.getByRole('button', { name: /^check out$/i });
      if (!(await checkOutBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
        // Some clients (e.g. ForHealth/Bega Medical) don't show Check Out immediately
        // after Check In — possibly a minimum-duration or business-rule gate. Not a bug
        // in this script; the check-in itself is confirmed and recorded.
        log(`SKIP ${siteKey}: checked in, but no Check Out control available yet (may need more time, or this client checks out differently).`);
        results.push({ site: siteKey, status: 'checked-in-awaiting-checkout' });
        announceNext(i);
        continue;
      }
      await checkOutBtn.click();
      await page.waitForTimeout(800);
      await dismissHazardModalIfPresent(page); // ...others confirm hazards after Check Out instead

      const finalText = await page.locator('body').innerText();
      if (/Checked Out/.test(finalText)) {
        log(`DONE ${siteKey}: checked in and out successfully.`);
        results.push({ site: siteKey, status: 'done' });
      } else {
        log(`FAIL ${siteKey}: could not confirm checkout completed.`);
        results.push({ site: siteKey, status: 'checkout-unconfirmed' });
      }
      announceNext(i);
    }

    const logoutBtn = page.getByRole('button', { name: /logout/i });
    await Promise.all([
      page.waitForURL(/\/login\/?/, { timeout: 10_000 }).catch(() => {}),
      logoutBtn.evaluate((el) => el.click()),
    ]);
    log('Logged out.');
  } finally {
    await browser.close();
  }

  return results;
}

module.exports = { runGroup, addressPlausiblyMatches };
