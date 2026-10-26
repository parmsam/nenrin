# Comparison: Nenrin vs. other flashcard apps

Last checked: 2026-10-25. The data comes from each vendor's site and the review articles listed under Sources. "?" means not publicly documented. Prices change often, so check the vendor site. Corrections are welcome via PR.

## At a glance

| App                          | Open source           | Price                                                        | Platforms                                        | Algorithm                                   | Anki `.apkg` import                    | Offline    | Sync                                   | AI card generation      |
| ---------------------------- | --------------------- | ------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------- | -------------------------------------- | ---------- | -------------------------------------- | ----------------------- |
| **Nenrin** (pre-alpha)       | ✅ MIT                | Free, no limits                                              | Web/PWA (iOS, Android, desktop); macOS app later | FSRS-6 + on-device optimizer                | ✅ `.apkg`, `.colpkg`, CrowdAnki, text | ✅ Full    | File backup in v1; optional sync later | ✅ Opt-in, your own key |
| **Anki** desktop / AnkiDroid | ✅ AGPL-3.0 / GPL-3.0 | Free                                                         | Win, Mac, Linux, Android, Web                    | FSRS (built-in, opt-in) or SM-2             | ✅ Native                              | ✅         | ✅ AnkiWeb (free)                      | ❌ (add-ons)            |
| **AnkiMobile**               | ❌                    | $24.99 one-time                                              | iPhone, iPad                                     | FSRS / SM-2                                 | ✅ Native                              | ✅         | ✅ AnkiWeb                             | ❌                      |
| **RemNote**                  | ❌                    | Free; Pro $8/mo; Pro + AI $18/mo                             | Desktop, Web, iOS, Android                       | FSRS or SM-2                                | ✅                                     | Partial    | ✅                                     | ✅ (paid)               |
| **Mochi**                    | ❌                    | Free; sync is paid                                           | Desktop, Web, mobile                             | ?                                           | ?                                      | ✅         | 💲 Paid                                | ✅                      |
| **Noji** (ex-AnkiPro)        | ❌                    | Free core; Premium (price not listed)                        | iOS, Android                                     | Built-in SR with presets (premium)          | ?                                      | ?          | ✅ (account)                           | ?                       |
| **AlgoApp**                  | ❌                    | Free (100 reviews/day, 1 device); $29.99/yr; $99.99 lifetime | iOS, Android, Mac, Windows, Web                  | FSRS per vendor ("proprietary" per RemNote) | CSV; Anki ?                            | ?          | ✅ (account)                           | ✅                      |
| **FlashRecall**              | ❌                    | Free; $9.99/wk, $14.99/mo, $79.99/yr                         | iOS                                              | Undisclosed                                 | ?                                      | 💲 Premium | 💲 Premium                             | ✅ Core feature         |
| **sumi**                     | ?                     | Free (1 deck, 100 cards); sumi pro                           | iPhone, iPad                                     | Built-in SR (unnamed)                       | ✅ (+ CSV/TSV/JSON)                    | ✅ Full    | ❌ On-device only                      | ❌                      |
| **Miji**                     | ?                     | Free (10 words); Pro                                         | iPhone (iOS 26+)                                 | Unnamed SR                                  | ?                                      | ✅         | iCloud backup only                     | ❌ (dictionary-based)   |
| **Quizlet**                  | ❌                    | Free with ads; Plus ~$3/mo                                   | Web, iOS, Android                                | Undisclosed (web only)                      | ❌                                     | 💲 Paid    | ✅                                     | ✅ (region-limited)     |
| **SuperMemo**                | ❌                    | ~36 PLN/mo or 359 PLN/yr                                     | Mainly Windows (+ web/mobile)                    | SuperMemo SM-18+                            | ?                                      | ✅         | ✅                                     | ?                       |

✅ yes · ❌ no · 💲 paid tier only · ? not documented

## What Nenrin is going for

| Pain point in other apps                                                                  | How Nenrin handles it                                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Anki's UI feels dated, and its iOS app costs $24.99                                       | Modern UI, free everywhere as a PWA                            |
| Subscriptions gate sync, card counts, or daily reviews (FlashRecall, AlgoApp, sumi, Miji) | No paywall or limits. MIT license                              |
| Hidden algorithms (Quizlet, FlashRecall)                                                  | Open FSRS-6 with visible parameters and on-device optimization |
| Account required, data held on vendor servers                                             | No account; data stays on your device; JSON backup anytime     |
| Leaving Anki means losing your decks and history                                          | Imports `.apkg` with media **and review history**              |
| Closed source or copyleft (AGPL) limits reuse                                             | MIT, so it can be forked, embedded, or reused                  |

## Where Nenrin will (honestly) be weaker at v1

- **No hosted sync.** Anki (AnkiWeb), RemNote, and AlgoApp sync seamlessly. Nenrin v1 relies on manual backups.
- **No shared-deck library** like AnkiWeb or Quizlet. You'll import decks from elsewhere.
- **No add-on ecosystem** like Anki's.
- **AI generation only with your own key** (Claude, OpenAI or a local model), where RemNote, AlgoApp, FlashRecall, and Mochi include it in a subscription.
- **PWA limits on iOS.** Storage eviction and notification support are weaker than in a native app.

## Sources

- awesome-fsrs: <https://open-spaced-repetition.github.io/awesome-fsrs/>
- Best Anki Alternatives for iPhone in 2026 (Miji): <https://getmiji.app/anki-alternatives-iphone.html>
- 9 Best Anki Alternatives (RemNote): <https://www.remnote.com/blog/best-anki-alternatives>
- sumi: <https://edenroye.github.io/sumi/>
- AlgoApp: <https://www.algoapp.ai/>
- Noji: <https://noji.io/>
- FlashRecall: <https://flashrecall.app/>

The comparison articles are written by competing vendors (RemNote, Miji), so expect some bias.
