const { test, expect } = require('@playwright/test');
const accounts = require('./data/accounts.json');

// Login-only regression check: confirms each account can still authenticate and reach
// the dashboard after a portal change. Deliberately does NOT touch any shift/check-in
// state, so it's safe to run against every real account, any time, with no side effects.
for (const account of accounts) {
  test(`login works: ${account.email}`, async ({ page }) => {
    await page.goto('/login/');
    await page.locator('#id_username').fill(account.email);
    await page.getByRole('button', { name: /log in/i }).first().click();
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="password"]').first().fill(account.password);
    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.getByRole('button', { name: /log in/i }).first().click(),
    ]);

    await expect(page).toHaveURL(/\/mobile\/?$/);
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();

    const logoutBtn = page.getByRole('button', { name: /logout/i });
    await Promise.all([
      page.waitForURL(/\/login\/?/, { timeout: 10_000 }),
      logoutBtn.evaluate((el) => el.click()),
    ]);
    await expect(page).toHaveURL(/\/login\//);
  });
}
