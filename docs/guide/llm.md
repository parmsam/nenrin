# Make cards with an LLM

Any chat LLM (ChatGPT, Claude, Gemini, a local model) can write cards for you in a format Nenrin reads. There are two ways:

- **With your own API key**, Nenrin asks the model for you, right in **Add cards**.
- **With the prompt or the skill**, you copy instructions into your chat app and paste the reply back. Nenrin sends nothing anywhere.

## With your own API key

1. In **Settings → AI card generation**, choose a provider: **Anthropic (Claude)**, or **OpenAI or compatible** (OpenAI, OpenRouter, or a model on your own computer through Ollama or LM Studio). Enter your API key and, if you like, a model, then **Save**.
2. In **Add cards**, switch to **Paste** and open **Generate from text with AI**.
3. Paste your notes, a textbook section or an article. Choose question-and-answer or cloze cards (or let the model decide) and roughly how many, then press **Generate**.
4. The cards land in the Markdown box. Check them in the preview, fix or delete what's wrong, pick a deck, and press **Add**.

What gets sent: only the text you paste in, with the card-writing instructions, straight from your device to the provider you chose. Nenrin has no server. The provider bills your account. Your key is stored on this device only and is never included in backups; **Remove key** in Settings deletes it.

## With the prompt

1. Open **Settings → Make cards with an LLM** and choose **Copy prompt**. (Also in the command palette, and next to the Paste box in **Add cards**.)
2. Paste it into your LLM. Replace the last line with your notes, an article, or a topic, and say anything about your level or focus.
3. Copy the reply, the whole code block, including the ` ```` ` lines.
4. In **Add cards**, switch to **Paste** and paste it. Check the detected cards and the preview, pick a deck, and press **Add**.

The prompt asks for one card per idea, short answers and enough context, and it tells the LLM to leave out facts it isn't sure of. Still check the cards: LLMs make mistakes.

## With the skill (Claude)

**Download skill (.zip)** gives you `nenrin-cards`, an [Agent Skill](https://agentskills.io) with the same instructions. Once it's installed, just ask Claude for flashcards about something.

- **Claude apps:** upload the zip in Claude's settings, where skills are listed.
- **Claude Code:** unzip it into `~/.claude/skills/`.
