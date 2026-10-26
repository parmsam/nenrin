# Make cards with an LLM

Any chat LLM (ChatGPT, Claude, Gemini, a local model) can write cards for you in a format Nenrin reads. Nenrin itself never sends anything to an AI: you copy a prompt out and paste the reply back in.

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
