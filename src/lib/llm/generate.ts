/**
 * Opt-in AI card generation with the user's own API key. The request goes straight from this
 * device to the provider the user chose; Nenrin has no server in between. The reply uses the
 * same format as "Make cards with an LLM", so it lands in Add cards → Paste for review.
 *
 * This is the one place Nenrin talks to a network service, and only when the user presses
 * Generate (see the decision log in PLAN.md).
 */
import type { NenrinDB } from '../db';
import { AI_CONFIG_KEY } from '../db/prefs';
import { CARD_RULES } from './prompt';

export type AiProvider = 'anthropic' | 'openai';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** OpenAI-compatible only: e.g. https://api.openai.com/v1, or a local Ollama server. */
  baseUrl?: string;
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5',
};

export const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1';

export async function getAiConfig(db: NenrinDB): Promise<AiConfig | null> {
  const row = await db.settings.get(AI_CONFIG_KEY);
  return (row?.value as AiConfig | undefined) ?? null;
}

export async function setAiConfig(db: NenrinDB, config: AiConfig | null): Promise<void> {
  if (config) await db.settings.put({ key: AI_CONFIG_KEY, value: { ...config } });
  else await db.settings.delete(AI_CONFIG_KEY);
}

export type CardStyle = 'auto' | 'qa' | 'cloze';

export interface GenerateOptions {
  style: CardStyle;
  /** Roughly how many cards; 0 lets the model decide. */
  count: number;
}

const STYLE: Record<CardStyle, string> = {
  auto: 'Choose question-and-answer or cloze cards, whichever suits the material.',
  qa: 'Write question-and-answer cards (Q: / A:).',
  cloze: 'Write cloze cards ({{c1::…}}).',
};

/** The system prompt and user message for a generation request. */
export function generationPrompt(
  source: string,
  options: GenerateOptions,
): { system: string; user: string } {
  const count =
    options.count > 0
      ? `Make about ${options.count} cards.`
      : 'Make as many cards as the material deserves, no more.';
  return {
    system: `You make flashcards for Nenrin, a spaced-repetition app (like Anki), from text the user provides. Cover what matters in the text; use only facts it states.

${CARD_RULES}`,
    user: `${STYLE[options.style]} ${count}

<source>
${source.trim()}
</source>`,
  };
}

export class GenerateError extends Error {}

/** Anthropic models that accept server-side refusal fallbacks. */
const FALLBACK_MODELS = /^claude-(?:opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/;

async function generateAnthropic(
  config: AiConfig,
  prompt: { system: string; user: string },
  onText: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The key is the user's own, typed into this device, and is only sent to Anthropic.
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });
  const fallback = FALLBACK_MODELS.test(config.model);
  try {
    const stream = client.beta.messages.stream(
      {
        model: config.model,
        max_tokens: 16000,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        // If a safety classifier declines, the API retries on a suitable model.
        ...(fallback && {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }),
      },
      { signal },
    );
    let text = '';
    stream.on('text', (delta) => onText((text += delta)));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new GenerateError('The model declined to make cards from this text.');
    }
    return message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
  } catch (err) {
    if (err instanceof GenerateError) throw err;
    if (err instanceof Anthropic.APIUserAbortError) throw new GenerateError('Stopped.');
    if (err instanceof Anthropic.AuthenticationError) {
      throw new GenerateError('Anthropic rejected the API key. Check it in Settings.');
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      throw new GenerateError('This API key can’t use that model.');
    }
    if (err instanceof Anthropic.NotFoundError) {
      throw new GenerateError(`Anthropic doesn’t know the model “${config.model}”.`);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new GenerateError('Rate limited by Anthropic. Wait a moment and try again.');
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new GenerateError('Couldn’t reach Anthropic. Are you online?');
    }
    if (err instanceof Anthropic.APIError) {
      throw new GenerateError(`Anthropic error ${err.status ?? ''}: ${err.message}`);
    }
    throw err;
  }
}

async function generateOpenAi(
  config: AiConfig,
  prompt: { system: string; user: string },
  signal: AbortSignal,
): Promise<string> {
  const base = (config.baseUrl || DEFAULT_OPENAI_URL).replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        // Local servers (Ollama, LM Studio) often need no key.
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    });
  } catch (err) {
    if (signal.aborted) throw new GenerateError('Stopped.');
    throw new GenerateError(
      `Couldn’t reach ${base}. Check the address, and that the server allows requests from this site (CORS).`,
      { cause: err },
    );
  }
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    throw new GenerateError(
      res.status === 401
        ? 'The server rejected the API key. Check it in Settings.'
        : `Error ${res.status}: ${body?.error?.message ?? res.statusText}`,
    );
  }
  return body?.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * Asks the configured model for cards about `source`. Returns the reply (Markdown in the paste
 * format); `onText` sees it grow while streaming, where the provider supports that.
 */
export async function generateCards(
  config: AiConfig,
  source: string,
  options: GenerateOptions,
  {
    onText = () => {},
    signal = new AbortController().signal,
  }: { onText?: (text: string) => void; signal?: AbortSignal } = {},
): Promise<string> {
  if (!source.trim()) throw new GenerateError('Add some text to make cards from.');
  const prompt = generationPrompt(source, options);
  const reply =
    config.provider === 'anthropic'
      ? await generateAnthropic(config, prompt, onText, signal)
      : await generateOpenAi(config, prompt, signal);
  if (!reply) throw new GenerateError('The model sent back an empty reply.');
  return reply;
}
