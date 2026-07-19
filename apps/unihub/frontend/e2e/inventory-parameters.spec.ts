/**
 * E2E — Iteration 26 (FR-002b, FR-031): new dimension families, range values,
 * and key-value parameter pairs on item surfaces.
 *
 *   1. Catalog Parameters column renders localized `key: value` pairs.
 *   2. A dimension definition can be created with one of the new unit families
 *      (battery), its value accepts `5-10` ranges with inline validation, and
 *      the item card shows the pair `name: 5 - 10 mAh`.
 *
 * Prerequisites: backend + frontend running (see inventory-catalog.spec.ts),
 * legacy data imported (items with parameters exist).
 *
 * Run: pnpm test:e2e --grep "inventory-parameters"
 */
import { test, expect, type Page } from '@playwright/test';

const DEF_NAME = 'e2e-batt-26';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#username', 'root');
  await page.fill('#password', 'root');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

/** Delete any leftover e2e definition so reruns never hit a duplicate name. */
async function cleanupDefinition(page: Page) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'csrftoken')?.value ?? '';
  const list = await page.request.get(
    '/api/v1/core/attribute-definitions/?content_type=inventory.item',
  );
  const defs = (await list.json()) as { id: string; name: string }[];
  for (const d of defs.filter((entry) => entry.name === DEF_NAME)) {
    await page.request.delete(`/api/v1/core/attribute-definitions/${d.id}/?confirm=true`, {
      headers: { 'X-CSRFToken': csrf },
    });
  }
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await cleanupDefinition(page);
});

test('catalog Parameters column renders localized key-value pairs', async ({ page }) => {
  await page.goto('/inventory/catalog');
  await page.waitForSelector('.ant-table-thead', { timeout: 10_000 });
  // Raise the page size so parameterised items are on screen.
  await page.locator('.ant-table-footer .ant-select').first().click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText(/100/)
    .first()
    .click();
  await page.waitForTimeout(800);
  const tags = await page.locator('tr.ant-table-row-level-1 .ant-tag').allInnerTexts();
  expect(tags.length).toBeGreaterThan(0);
  // Every parameter tag is a `key: value` pair; system keys are localized.
  const paired = tags.filter((t) => /: /.test(t));
  expect(paired.length).toBeGreaterThan(0);
  // System keys carry their seeded emoji prefix (FR-032, iteration 27).
  expect(
    // The emoji-key gap is a CSS margin (iteration 41), not a text space.
    paired.some((t) => /^(🎨|👕|⚖|📏|🧴) ?(Length|Width|Height|Weight|Color|Size|Volume): /.test(t)),
  ).toBe(true);
});

test('a battery-family definition accepts range values with validation (FR-002b)', async ({
  page,
}) => {
  await page.goto('/inventory/acquisitions/new');
  await page.waitForSelector('.ant-card', { timeout: 10_000 });
  // Open the default empty item card's edit modal.
  await page.locator('.ant-card-small .anticon-edit').first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal input[id$="name"]').first().fill('Range item');

  // Create a new dimension definition with the battery family.
  await page.locator('.ant-modal').getByRole('button', { name: /Add parameter/ }).click();
  await page.locator('.ant-modal .ant-select-selector').last().click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText('+ New parameter…')
    .click();
  const draftCard = page.locator('.ant-modal .ant-card').last();
  await draftCard.locator('input[placeholder="Parameter name"]').fill(DEF_NAME);
  await draftCard.locator('.ant-select').first().click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText('Dimension', { exact: true })
    .click();
  // The family select offers the three new families (temperature/time/battery).
  await draftCard.locator('.ant-select').nth(1).click();
  const familyDropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await expect(familyDropdown.getByText('Temperature', { exact: true })).toBeVisible();
  await expect(familyDropdown.getByText('Time', { exact: true })).toBeVisible();
  await familyDropdown.getByText('Battery capacity', { exact: true }).click();
  await draftCard.locator('button', { hasText: 'Create' }).click();

  // The new row appears with the family's default unit (mAh).
  const paramRow = page.locator('.ant-modal .ant-row', { hasText: DEF_NAME }).last();
  await expect(paramRow.getByText('mAh')).toBeVisible({ timeout: 5_000 });

  // Switch the value input to RANGE mode (iteration 30 explicit toggle).
  await paramRow.locator('.ant-select', { hasText: 'Exact' }).first().click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText('Range', { exact: true })
    .click();
  const bounds = paramRow.locator('.ant-input-number input');
  // Invalid range (min > max) flags inline; fixing it clears the flag.
  await bounds.nth(0).fill('10');
  await bounds.nth(1).fill('5');
  await expect(
    page.locator('.ant-modal').getByText('Enter a number or a min-max range (e.g. 5-10)'),
  ).toBeVisible();
  await bounds.nth(1).fill('10');
  await bounds.nth(0).fill('5');
  await expect(
    page.locator('.ant-modal').getByText('Enter a number or a min-max range (e.g. 5-10)'),
  ).toBeHidden();
  await page.locator('.ant-modal button', { hasText: /Save/i }).click();
  await page.waitForTimeout(400);

  // The card shows the key-value pair with both bounds and the unit (FR-031).
  const card = page.locator('.ant-card-small', { hasText: 'Range item' }).first();
  await expect(
    card.locator('.ant-tag', { hasText: `${DEF_NAME}: 5 ~ 10 mAh` }),
  ).toBeVisible();

  // Cleanup: delete the e2e definition (no stored values — deletes directly).
  await page.locator('.ant-card-small .anticon-edit').first().click();
  await page.waitForSelector('.ant-modal', { timeout: 5_000 });
  await page.locator('.ant-modal .ant-row', { hasText: DEF_NAME }).last()
    .locator('.ant-select-selector').first().click();
  const option = page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item', {
      hasText: DEF_NAME,
    })
    .first();
  await option.locator('[aria-label="delete-definition"]').click();
  await page.waitForTimeout(500);
  // The definition is gone from the dropdown.
  await expect(
    page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item', {
      hasText: DEF_NAME,
    }),
  ).toHaveCount(0);
});
