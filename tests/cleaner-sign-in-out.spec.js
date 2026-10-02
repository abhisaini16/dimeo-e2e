const { test, expect } = require('@playwright/test');

const USERNAME = process.env.DIMEO_USER;
const PASSWORD = process.env.DIMEO_PASS;

test.skip(!USERNAME || !PASSWORD, 'Set DIMEO_USER and DIMEO_PASS (test account only)');

// Portal has no public geocoding/test site, and no lat/lng is exposed client-side —
// geofencing (300m) is enforced server-side against whatever address the shift shows.
// We geocode that address at runtime and mock the browser's geolocation to it.
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
  })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'dimeo-e2e-test-suite/1.0 (qa automation)' },
  });
  const [hit] = await res.json();
  if (!hit) throw new Error(`Could not geocode shift address: ${address}`);
  return { latitude: parseFloat(hit.lat), longitude: parseFloat(hit.lon) };
}

async function login(page) {
  await page.goto('/login/');
  await page.locator('#id_username').fill(USERNAME);
  // Portal login is two-step: username submits first, password field appears after.
  await page.getByRole('button', { name: /log in/i }).first().click();
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: /log in/i }).first().click(),
  ]);
  await expect(page).not.toHaveURL(/\/login\/?$/);
}

// The nav sidebar's hit-test area overlaps the Logout button in some viewport states,
// which makes a normal synthetic click land on the nav instead. Dispatching the
// button's click handler directly via the DOM sidesteps that (confirmed: lands on /login/).
async function logout(page) {
  const logoutBtn = page.getByRole('button', { name: /logout/i });
  await Promise.all([
    page.waitForURL(/\/login\/?/, { timeout: 10_000 }),
    logoutBtn.evaluate((el) => el.click()),
  ]);
}

test('cleaner logs in, checks into a shift, checks out, logs out', async ({ page, context }) => {
  await login(page);
  await expect(page).toHaveURL(/\/mobile\/?$/);

  // Dashboard ("My Cleans") lists every rostered shift as a card linking to /mobile/shifts/<id>/,
  // each tagged "Not checked in" or "Finished". Pick the first open one — IDs change week to week
  // as rosters refresh, so this can't be hardcoded.
  const openShift = page.locator('a[href*="/mobile/shifts/"]', { hasText: 'Not checked in' }).first();
  await expect(openShift).toBeVisible();
  const shiftHref = await openShift.getAttribute('href');
  await openShift.click();
  await expect(page).toHaveURL(/\/mobile\/shifts\/\d+\/?$/);

  const address = await page.locator('body').evaluate(() => {
    // "Address" label is immediately followed by the address line in the DOM.
    const label = Array.from(document.querySelectorAll('*'))
      .find((el) => el.textContent?.trim() === 'Address' && el.children.length === 0);
    return label?.nextElementSibling?.textContent?.trim() ?? '';
  });
  expect(address, 'expected an "Address" field on the shift page').not.toBe('');

  const coords = await geocode(address);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...coords, accuracy: 20 });
  // The page reads geolocation once on mount (not on click), so the Check In button
  // is already stuck "denied" from before we had coordinates — reload to re-run that check.
  await page.reload({ waitUntil: 'networkidle' });

  // --- Check In ---
  await page.getByRole('button', { name: /^check in$/i }).click();
  await expect(page.getByText(/^checked in$/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^check out$/i })).toBeVisible();

  // --- Check Out (triggers a hazard-confirmation modal) ---
  await page.getByRole('button', { name: /^check out$/i }).click();
  await expect(page.getByText(/confirm hazard notification/i)).toBeVisible();
  await page.getByRole('button', { name: /^skip$/i }).click();
  await expect(page.getByText(/^checked out$/i)).toBeVisible();

  // --- Confirm the shift now shows as Finished on the dashboard ---
  await page.goto('/mobile/');
  await expect(page.locator(`a[href="${shiftHref}"]`)).toContainText(/finished/i);

  // --- Log out of portal ---
  await logout(page);
  await expect(page).toHaveURL(/\/login\//);
});
