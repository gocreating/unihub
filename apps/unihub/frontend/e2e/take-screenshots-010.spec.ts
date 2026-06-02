/**
 * Screenshot capture spec for branch 010-pipeline-release-management.
 * Uses route mocks so the backend does not need to be running.
 */

import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const BRANCH = '010-pipeline-release-management';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, `../../docs/screenshots/${BRANCH}`);

function ss(name: string) {
  return path.join(OUT_DIR, name);
}

async function mockAuth(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/auth/me/', (r) =>
    r.fulfill({ json: { id: 1, username: 'root', is_staff: true } }),
  );
}

test.describe('Screenshots — 010-pipeline-release-management', () => {
  test('01-system-profile-page', async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/v1/system/version/', (r) =>
      r.fulfill({ json: { version: 'v2026.06.03.1' } }),
    );
    await page.goto('/system/profile');
    await expect(page.getByText('v2026.06.03.1')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: ss('01-system-profile-page.png'), fullPage: false });
  });

  test('02-system-profile-nav', async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/v1/system/version/', (r) =>
      r.fulfill({ json: { version: 'v2026.06.03.1' } }),
    );
    await page.goto('/system/profile');
    await expect(page.getByText('v2026.06.03.1')).toBeVisible({ timeout: 15_000 });
    // Expand the System menu section to show the Profile nav item
    const systemMenu = page.locator('.ant-menu-submenu', { hasText: 'System' }).first();
    if (await systemMenu.isVisible()) {
      await systemMenu.click();
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: ss('02-system-profile-nav.png'), fullPage: false });
  });
});
