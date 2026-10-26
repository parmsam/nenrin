import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePastedCards } from '../notes/paste';
import { generateCards, generationPrompt, GenerateError } from './generate';

const REPLY = 'Q: What is 年輪?\nA: Tree rings\n\nQ: How many rings a year?\nA: One';

/** A Messages API streaming response, as server-sent events. */
function sse(text: string, stopReason = 'end_turn'): Response {
  const events = [
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
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      },
    ],
    [
      'content_block_start',
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ],
    ...[text.slice(0, 10), text.slice(10)].map((t) => [
      'content_block_delta',
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
    ]),
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 20 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ];
  const body = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI card generation', () => {
  it('asks for cards in the paste format, about the given text only', () => {
    const p = generationPrompt('  Trees grow one ring a year. ', { style: 'cloze', count: 5 });
    expect(p.system).toContain('Q: What does FSRS stand for?');
    expect(p.user).toContain('Write cloze cards');
    expect(p.user).toContain('Make about 5 cards.');
    expect(p.user).toContain('<source>\nTrees grow one ring a year.\n</source>');
  });

  it('streams cards from Claude with the user’s key, straight from the browser', async () => {
    const fetchMock = vi.fn(async () => sse(REPLY));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const reply = await generateCards(
      { provider: 'anthropic', apiKey: 'sk-test', model: 'claude-opus-5-5' },
      'Tree rings',
      { style: 'qa', count: 0 },
      { onText: (t) => seen.push(t) },
    );
    expect(reply).toBe(REPLY);
    expect(seen.at(-1)).toBe(REPLY);
    expect(parsePastedCards(reply)).toHaveLength(2);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-test');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: 'claude-opus-5-5', stream: true, fallbacks: 'default' });
    expect(body.messages[0].content).toContain('Tree rings');
  });

  it('skips fallbacks for models that don’t take them, and reports a refusal', async () => {
    const fetchMock = vi.fn(async () => sse('', 'refusal'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      generateCards({ provider: 'anthropic', apiKey: 'k', model: 'claude-haiku-5-5' }, 'x', {
        style: 'auto',
        count: 0,
      }),
    ).rejects.toThrow(/declined/);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.fallbacks).toBeUndefined();
  });

  it('explains a rejected Anthropic key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: 'authentication_error', message: 'invalid x-api-key' },
            }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const run = generateCards(
      { provider: 'anthropic', apiKey: 'bad', model: 'claude-opus-5-5' },
      'x',
      { style: 'auto', count: 0 },
    );
    await expect(run).rejects.toThrow(GenerateError);
    await expect(run).rejects.toThrow(/rejected the API key/);
  });

  it('works with OpenAI-compatible servers, with or without a key', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: REPLY } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const reply = await generateCards(
      { provider: 'openai', apiKey: '', model: 'llama3', baseUrl: 'http://localhost:11434/v1/' },
      'Tree rings',
      { style: 'auto', count: 3 },
    );
    expect(reply).toBe(REPLY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(JSON.parse(String(init.body)).messages[0].role).toBe('system');
  });

  it('needs some text first', async () => {
    await expect(
      generateCards({ provider: 'openai', apiKey: '', model: 'm' }, '  ', {
        style: 'auto',
        count: 0,
      }),
    ).rejects.toThrow(/Add some text/);
  });
});
