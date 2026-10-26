# Getting started

## Open or install Nenrin

Nenrin is a web app at [parmsam.github.io/nenrin](https://parmsam.github.io/nenrin/). After the first visit it works offline.

Installing it puts an icon on your home screen or dock, opens it in its own window, and protects your cards from the browser's storage clean-ups:

- **iPhone and iPad (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the menu, then **Install app** (or **Add to Home screen**).
- **Mac (Safari):** **File → Add to Dock**. **Chrome or Edge on any computer:** the install icon at the right of the address bar.

## Your first deck

On the first visit you have three ways to start:

- **Coming from Anki?** Choose **Import from Anki** and pick an `.apkg` or `.colpkg` file. See [Moving from Anki](from-anki.md).
- **Just looking?** Add the **Nenrin tour** sample deck. Its cards show you around the app as you study them.
- **Starting fresh?** Name a deck, then **Add cards**. Or let an LLM write them for you: see [Make cards with an LLM](llm.md).

## Your first study session

Open a deck and choose **Study now** (or press <kbd>S</kbd>).

1. Read the question and try to recall the answer.
2. Press **Show answer** (<kbd>Space</kbd>).
3. Rate how it went: **Again**, **Hard**, **Good** or **Easy** (<kbd>1</kbd>–<kbd>4</kbd>). Each button shows when you'll see the card next.

Be honest: if you didn't remember, press **Again**. The scheduler learns from your answers, and wrong guesses about yourself only cost you time later. See [Studying](studying.md) for what each button means.

## Come back tomorrow

A few minutes a day is the whole trick. The home screen shows how many cards are waiting and your streak, next to your tree: a cross-section where each ring is a day you studied, wider on days with more reviews. Today's ring closes around the outside as you finish today's cards. New days start at 4 AM by default; you can change that in **Settings → Studying**.

## Get a daily reminder

In **Settings → Study reminder**, pick a time, then:

- **Add to calendar** downloads a daily event with an alert for your calendar app. It's the most reliable reminder, and the one to use on iPhone.
- **Also notify me** shows a notification at that time if cards are due and you haven't studied yet. It works while Nenrin is open, for example in a background tab. As an installed app in Chrome or Edge, the browser may also check now and then while it's closed. Nenrin has no server, so it can't wake your device on its own.
