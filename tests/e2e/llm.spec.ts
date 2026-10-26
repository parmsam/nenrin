import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';

test('copy the LLM prompt, download the skill, and paste a reply as cards', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Copy prompt' }).click();
  await expect(page.getByText('Prompt copied.')).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('Q: What does FSRS stand for?');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download skill (.zip)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('nenrin-cards.zip');
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(Object.keys(files).filter((f) => !f.endsWith('/'))).toEqual(['nenrin-cards/SKILL.md']);
  expect(strFromU8(files['nenrin-cards/SKILL.md'])).toMatch(/^---\nname: nenrin-cards\n/);

  // A reply in the promised format becomes cards.
  await page.goto('./');
  await page.getByLabel('Deck name').fill('LLM');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByRole('radio', { name: /Paste/ }).click();
  await expect(page.getByRole('button', { name: 'Copy a prompt' })).toBeVisible();
  const reply = /````markdown\n[\s\S]*?\n````/.exec(prompt)![0];
  await page.getByRole('textbox').first().fill(reply);
  await expect(page.locator('.detected')).toContainText('2 cards');
});
