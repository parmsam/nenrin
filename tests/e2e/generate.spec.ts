import { expect, test } from '@playwright/test';

const REPLY =
  '````markdown\nQ: What are 年輪?\nA: Tree rings\n\nQ: How many form a year?\nA: One\n\nTags: trees\n````';

/** A Messages API streaming reply, as server-sent events. */
function sse(text: string): string {
  const events: [string, object][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    ],
    [
      'content_block_start',
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ],
    [
      'content_block_delta',
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 9 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
}

test('generate cards from text with Claude, then review and add them', async ({ page }) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  const requests: { auth: string | null; body: { messages: { content: string }[] } }[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    requests.push({ auth: await req.headerValue('authorization'), body: req.postDataJSON() });
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'text/event-stream' },
      body: sse(REPLY),
    });
  });

  await page.goto('./');
  await page.getByLabel('Deck name').fill('Trees');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByRole('radio', { name: 'Paste Markdown' }).click();

  // Not set up yet: the panel points to Settings.
  await page.getByText('Generate from text with AI').click();
  await page.getByRole('link', { name: 'Settings → AI card generation' }).click();
  await page.getByLabel('API key').fill('sk-ant-test');
  await expect(page.getByLabel('Model')).toHaveValue('claude-opus-5-5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. Generate cards')).toBeVisible();

  await page.goBack();
  await page.getByText('Generate from text with AI').click();
  await page
    .getByLabel('Text to make cards from')
    .fill('Trees add one growth ring, 年輪, each year.');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('Done. Check the cards below')).toBeVisible();

  expect(requests).toHaveLength(1);
  expect(requests[0].auth).toBe('Bearer sk-ant-test');
  expect(requests[0].body.messages[0].content).toContain('growth ring, 年輪');

  await expect(page.locator('.detected')).toContainText('Detected: 2 cards');
  await page.getByRole('button', { name: 'Add all 2' }).click();
  await expect(page.getByText('Added 2 cards from 2 notes.')).toBeVisible();
});
