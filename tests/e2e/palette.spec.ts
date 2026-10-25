import { expect, test } from '@playwright/test';

test('command palette: jump, study, theme, and search notes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await expect(page.getByRole('link', { name: /Japanese: Nature/ })).toBeVisible();

  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const input = palette.getByRole('combobox');
  const open = async () => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(input).toBeFocused();
  };

  await open();
  await input.fill('stats');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
  await expect(palette).toBeHidden();

  // Fuzzy: "stdy jap" finds "Study Japanese: Nature".
  await open();
  await input.fill('stdy jap');
  await expect(palette.getByRole('option').first()).toContainText('Study Japanese: Nature');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Show answer/ })).toBeVisible();

  // Keywords match: "night" finds the dark theme. Arrow keys move the selection.
  await open();
  await input.fill('night');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Anything else becomes a note search.
  await open();
  await input.fill('forest');
  await palette.getByRole('option', { name: /Search notes for “forest”/ }).click();
  await expect(page).toHaveURL(/#\/browse\?q=forest/);
  await expect(page.locator('.results li')).toHaveCount(1);

  // Recently used commands come first.
  await open();
  await expect(palette.getByRole('option').first()).toContainText('Theme: Dark');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});
