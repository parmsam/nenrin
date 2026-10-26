# Gamification ideas

Status: **draft for discussion** (2026-10-26). Nothing here is built except the tree on the home screen.

## Inspiration

[Anki Killstreaks](https://ankiweb.net/shared/info/1562475180) (a Halo / Call of Duty–style add-on) shows a medal with a sound when you answer several cards correctly in a row, with themed sets (Halo, Mario, a Minecraft spin-off). Reviewers love it ("Dopamine", "Peak"). They also ask for all-time medals and achievements, call some rewards distracting, and want to turn them off or customize them. Its leaderboards were dropped because they needed a server.

Nenrin's version should feel like the rest of the app: calm, wooden, a little Japanese, and built around 年輪 (tree rings) as a picture of steady growth.

## Ground rules

1. **Never reward a rating.** Killstreaks count _correct_ answers, which nudges you to press Good when you should press Again. That corrupts FSRS, so your cards come back at the wrong time. Nenrin rewards showing up and finishing, never which button you press.
2. **Opt-in and quiet.** One switch in Settings → Appearance, _Rewards_, off by default. Sounds are a separate switch, also off. Everything respects `prefers-reduced-motion`.
3. **No guilt.** Nothing is ever taken away. A break leaves a scar on the tree, not a lost streak or a sad face.
4. **Local only.** Everything is computed from the review log on the device. No leaderboards, accounts or servers (rule 2 in AGENTS.md).
5. **Derived, not stored.** Wherever possible, compute rewards from `reviewLogs` so they survive restores and future sync and need no migrations.

## Ideas

### In a session: 木 → 林 → 森 (tree, grove, forest)

Nenrin's answer to killstreaks. As you work through a session, a small kanji appears by the counts and grows: **木** (one tree) at 10 cards, **林** (a grove) at 25, **森** (a forest) at 50, then 100 and 200 with a ring around it. It counts cards answered, whatever the rating, so Again never breaks it. A short wood-block _clack_ (拍子木) plays if sounds are on. At the end, "Done for now" shows the session's highest mark.

### Each day: a stamp book (御朱印帳)

Japanese temples stamp a visitor's _goshuin-chō_ with a red seal. Finishing all of a day's due cards stamps that day in a stamp book: a month grid on the Stats screen, with a red 印 seal on each completed day and a lighter mark on days you studied but didn't finish. It's a gentler, prettier streak calendar that doesn't reset.

### Over time: milestones (節目)

Milestones from the tree itself, each with a small seal in the stamp book:

| Milestone       | When                                  |
| --------------- | ------------------------------------- |
| 芽 Sprout       | first review                          |
| 若木 Sapling    | 7 study days                          |
| First heartwood | the tree's first heartwood            |
| 一年 One year   | 365 study days, the tree at full size |
| 復活 Comeback   | the first study day after a scar      |
| 熟 Ripe         | 100 / 1,000 / 10,000 mature cards     |

They're computed from the logs and cards, so a restore brings them back. A new milestone appears once, as a quiet line on "Done for now", never as a pop-up mid-review.

### The forest (森)

A view where each deck is a tree, sized by its mature cards and leaning or bare when it has many overdue cards or leeches. It turns "which deck needs attention?" into something you can see at a glance. It could sit on the Stats screen, or under the tree on the home screen.

### Seasons (四季)

The home screen's tree takes on the season by date: blossom in spring (sakura palette), green in summer, red maple (紅葉) in autumn, snow in winter. Purely cosmetic and not earned. It keeps the app fresh without adding pressure.

### Woods to unlock

Milestones unlock new woods for the tree's grain and accent palette: cedar (杉), hinoki (檜), cherry (桜), keyaki (欅). This is the one place rewards change how the app looks, and it builds on the existing accent palettes.

### Year in rings (年輪 review)

On the anniversary of your first review, or any time from Stats: a shareable image of the year as a cross-section, with total reviews, study days, longest run and mature cards. It's made on the device and saved as a PNG; nothing is uploaded.

### Rest days (休み)

Up to two planned rest days a week that don't break your streak, chosen in Settings. (A gap only leaves a scar on the tree after more than a week, so rest days never do.) This is Duolingo's streak freeze without the currency, and it keeps rule 3.

## Suggested order

1. **Session marks (木 → 林 → 森)** and the **Rewards** switch: small, self-contained, the closest match to what people like about Killstreaks.
2. **Stamp book** on Stats, with **milestones** as seals in it.
3. **Seasons** for the tree (cosmetic and cheap).
4. **Forest** view, **woods**, **year in rings** and **rest days**, once the first three have had real use.

## Open questions

- Should the session count reset when you leave the review screen, or last for the whole study day?
- Rest days: do they belong in this feature, or in the streak and tree logic for everyone?
- Sound: one built-in clack, or a few to choose from? Any sound must be self-made or CC0 and bundled, never fetched.
