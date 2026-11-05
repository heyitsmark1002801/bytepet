# Bytepet 🥚

> **A 90s-style virtual pet that lives on your Mac desktop and only eats when you get real work done.**

<!-- DEMO GIF: drop a demo.gif here -->
<!-- ![Bytepet demo](demo.gif) -->

Built for the Kiro hackathon, **Resurrection** category: the 1990s LCD handheld pet, reborn as a desktop companion.

## What it does

- **Tasks = food.** Finish real work and your pet eats. Small task +1, medium +2, large +3; commits are snacks.
- **Distractions = sadness.** Linger on YouTube, Netflix or Discord and it sulks, cries and loses discipline.
- **Mac updates = medicine.** Pending system updates make it sick; installing them is the cure (+30 health).
- **A messy Downloads = poop with flies.** Cluttered Desktop, Downloads, Trash or too many tabs make it poop. Leave the mess and 🪰 flies move in, then it gets sick.
- **The ghost is revived by finishing work.** Neglect it and it dies into a ghost on your desktop. Finish tasks or a focus session within 3 days and your work brings it back to life.

## Try it

Grab the latest build from the [GitHub release](../../releases/latest):

1. **Download** the `Bytepet-mac.zip` from the release and unzip it.
2. **Drag** `Bytepet.app` into your **Applications** folder.
3. The first launch, **right-click the app → Open** (it's not notarized, so a plain double-click is blocked by Gatekeeper). Confirm **Open** in the dialog. After that it opens normally.

Your egg appears at the bottom-right of your screen and hatches a few seconds later. Prefer to run from source? See **Run it** below.

## Built with Kiro

Bytepet was designed and built with Kiro's spec-driven workflow:

- **[Specs](.kiro/specs)** — requirements → design → tasks for each feature (`demo-mode`, `retro-sounds`, `sleep-health-decay`, `kiro-feeds-pet`…).
- **[Hooks](.kiro/hooks)** — automation that runs the tests on every `src/` save, keeps the README in sync with settings, reviews new pet lines, and feeds the pet when the test suite passes.
- **[MCP server](mcp/server.js)** — Kiro can watch your pet and reward real work through an on-device Model Context Protocol server (see **Kiro can feed your pet** below).
- **[Steering](.kiro/steering)** — the product, tech and art guidance Kiro follows on every change.
- **[Property-based tests](test/pet-state.test.js)** — [fast-check](https://github.com/dubzzz/fast-check) properties prove the care rules hold across random inputs (meters stay in 0–100, a sleeping pet can't die, cures always heal, and more), alongside [`test/demo-script.test.js`](test/demo-script.test.js) and [`test/sounds.test.js`](test/sounds.test.js). Run them with `npm test`.
- **[KIRO_LOG.md](KIRO_LOG.md)** — the running log of how the project was built with Kiro.

### Kiro can feed your pet 🍙

Bytepet ships a small [MCP server](mcp/server.js) so Kiro (or any Model Context Protocol
client) can see how your pet is doing and reward real work. It's a thin, on-device client
over the same local feed server git commits use — no dependencies, nothing leaves your Mac,
and every tool fails with a clear message if the app isn't running.

Three tools:

| Tool | What it does |
|---|---|
| `get_pet_status` | Mood, stage, food, needs and open-task count (read-only) |
| `list_open_tasks` | Your open tasks, with ids, so Kiro can pick one |
| `complete_task` | Mark a task done by id — feeds the pet, just like finishing it in the app |

Register it once in `.kiro/settings/mcp.json` (the read-only tools are auto-approved;
`complete_task` changes state, so it stays a manual approval):

```json
{
  "mcpServers": {
    "bytepet": {
      "command": "node",
      "args": ["mcp/server.js"],
      "disabled": false,
      "autoApprove": ["get_pet_status", "list_open_tasks"]
    }
  }
}
```

A Kiro hook, [`feed-pet-on-green-tests`](.kiro/hooks/feed-pet-on-green-tests.json), also
runs `npm test` after each turn and feeds your pet a medium snack whenever the suite passes.

## Run it

You need **Node.js** (nodejs.org, the LTS version) and **Git**.

```bash
cd bytepet
npm install      # first time, and after each update
npm start
```

A small **setup window** opens first: name your egg, tick what distracts you and where you work, check
permissions and pick your bedtime. Your egg appears at the bottom-right of your screen only after that, and
hatches a few seconds later. (Run setup again any time: ⚙️ Settings → Help, or menu bar → Help.)
Its menu lives in your **menu bar** (the little pet icon). The first time, a **setup screen** opens:
name your pet, then press **Test** on each permission (✅ = working, ⚠️ = press **Fix** to open the right
page in System Settings). Run it again any time from Settings or menu bar → Help.

## Build the real app (Bytepet.app)

```bash
npm install
npm run build:mac
```

This makes `dist/Bytepet-darwin-arm64/Bytepet.app` (x64 on Intel Macs) with its own icon and name, so macOS asks
for permissions as **Bytepet** instead of Terminal. Drag it into **Applications** and open it from there
(first time: right-click → **Open**). Then Settings → App → **Open Bytepet when I log in**.
Your pet, tasks and badges carry over — `npm start` and the app share the same save files.
You'll need to allow the permissions once more for the app (setup screen → Test → Fix).

## Food & XP

Food is counted in units: **5 units = full**. Hunger drops about 1 unit every 80 minutes.

| You do | Food | XP |
|---|---|---|
| Small task | +1 | +10 |
| Medium task | +2 | +20 |
| Large task | +3 | +40 |
| Verified 25-min focus session | — | +10 (even if the task isn't finished) |
| Git commit | +½ | +5 |
| Working in a work app | keeps hunger steady | — |

**Verified focus:** during a focus session Bytepet checks what's on screen every 15 seconds.
If you were active and *not* on a distracting app or site at least **80%** of the time,
the session counts. Start one from a task's ▶ button or the menu.

## Care

| Need | Cause | Fix |
|---|---|---|
| 🍙 **Food** | Hunger below 1 unit | Finish tasks |
| 💡 **Lights** | 2h of screen time without a break, or bedtime (11pm–7am) | Lock your screen, sleep your Mac, or step away 5 min |
| ✚ **Medicine** | Your Mac has updates waiting | Install them, then *check again* from the menu |
| 😢 **Discipline** | 5 min in a row on distracting apps/sites, or over 45 min today | Go back to a work app |
| 🔔 **Attention** | A meeting soon, a task due within an hour, an overdue task, a PR waiting for your review, or uncommitted changes for 2h+ | Deal with it — it clears on its own |

Every need sends a Mac notification. **Care mistakes** happen when you ignore a need too long
(lights 15 min, distraction 10 min, food 30 min) or **miss a deadline**.
With **3 or fewer care mistakes and discipline 40+**, it grows into a **star** adult (crown).
Otherwise it grows up **grumpy** (horns).

## Distractions (the heart of Bytepet)

Every **15 seconds** Bytepet looks at what's in front of you. A minute counts as distracted when at least half
of its checks were — so a quick peek is fine, but a YouTube binge isn't.

**What counts** (by default, anything that's **open**, not just what's in front)
- **Background apps and tabs:** a distracting app that's running, or a distracting site in **any tab of any window**.
  Close them to cheer your pet up. (Apple's own apps like Messages only count if you add them to the list.)
- **Distracting apps:** Discord, Steam, TV, Netflix, Instagram, TikTok, YouTube (the app from Chrome).
- **Any game, entertainment or social app — automatically**, from its App Store category. No list needed.
- **Distracting websites** in the active tab of Safari, Chrome, Arc, Brave, Edge, Vivaldi or Opera:
  YouTube, Facebook, Instagram, Netflix, TikTok, Reddit, X/Twitter, Twitch, Prime Video, Disney+, 9GAG.
- **Window-title keywords** for Firefox and other browsers (needs Accessibility permission).
- **Hands-off watching or gaming counts for up to 2 hours** — videos don't move the mouse.

**What doesn't**
- **Learning:** a distracting site whose title says *tutorial, lecture, course, lesson, how to, explained…*
  ("PyTorch tutorial" on YouTube is fine).
- Your **never-distracting list** (e.g. Discord for your hackathon team). One click from the Focus tab adds the
  current app or site.
- **Guilt-free breaks** (15 / 30 / 60 min from the menu or Focus tab) — your pet watches with you 🍿.
- **Outside work hours**, if you choose *Only during work hours* in Settings (free time is free!).
- Only what's in front, if you turn off **"Also count distractions that are just open"** in Settings.

**How your pet reacts** — like a misbehaving handheld pet:
1. First minute: it notices and keeps **glancing at your screen** 👀 ("Ooh, YouTube?")
2. Halfway: gets **restless** ("3 minutes of YouTube… just one more?")
3. **5 minutes in a row**, or past your **45-minute daily allowance**: **cries**, discipline drops, notification.
4. Every **30 minutes** of bingeing: sulks harder and loses happiness.
5. Back to a work app: cheers up and discipline goes up. Ignore it for 10 minutes: a **care mistake**.

**Strict focus** (on by default): during a focus session, Bytepet **hides** distracting apps (like ⌘H) and
**closes** distracting tabs. Closed tabs are kept under **Focus → Saved for later** (and menu bar →
*Reopen saved tabs*), so nothing is lost. Learning videos (titles with "lecture", "tutorial"…) are left alone.

**The Focus tab** shows what Bytepet sees right now (and why it counts or not), how close you are to a sad pet,
today's time per distraction, a 7-day work-vs-distracted chart, and whether each browser is readable.
All the numbers and lists are in **Settings**.

## The Bytepet window

Menu bar → **Tasks** or **Achievements, pet & memories…** opens the Bytepet window with seven tabs:
**Tasks**, **Focus**, **Pet**, **Badges**, **Games**, **Memories** and **Settings**.

## Growing up & the Petdex

Your pet becomes a different adult depending on **how you work** while it's a child:

| Form | How |
|---|---|
| 🦉 Night Owl | lots of work after 10 PM |
| </> Coder | code editors, terminals and commits |
| ✍️ Writer | Docs, Word, Notion, Pages… |
| 🎨 Artist | Figma, Photoshop, Procreate, Blender… |
| ✨ Zen Master | regular breaks and high discipline |
| 🎓 Scholar | big tasks and focus sessions |
| 🎮 Gamer | more distraction than work |
| 😤 Grumpy | more than 5 care mistakes |

The Pet tab shows what it's growing into right now. Every form you raise is saved in the **Petdex**.

## Morning check-in ☀️

The first time you use your computer each day (after your wake-up hour), your pet asks for **3 tasks for today**.
Pick them from your list or type new ones at the top of the ✅ tab. Planning cheers it up; finishing **all three**
gives a bonus treat (+1 food, +joy, +XP). Turn it off in ⚙️ → Daily rhythm.

## Sleep 💡

- **Bedtime** (⚙️ → Daily rhythm, default 11 PM): your pet gets sleepy and asks for the lights off.
  **Click it** (or lock your screen) and it sleeps until your **wake-up hour** — even if you stay up working.
  When you're back in the morning it says good morning and asks for your 3 tasks.
- **Too much screen time** (2 hours by default): it gets sleepy. Step away for 5 minutes or lock your screen and it
  naps, then wakes up the moment you're back. Clicking it gives a 20-minute nap instead.
- Ignore a sleepy pet for 15 minutes and it counts as a care mistake.

## Focus, the basket, and ghosts

- **Focus session** (🎯 tab or menu bar): your pet stops walking, sits cross-legged and meditates until the timer ends.
- **Toss it:** drag your pet and throw it. About once every 10 pick-ups a basket pops up somewhere on screen.
  Land your pet in it for +1 joy.
- **Poop:** hover over it to see what it's for (Desktop, Downloads, tabs or Trash) — click to tidy up.

## How the care works (balanced like a classic handheld pet)

| Meter | Goes down | Goes up |
|---|---|---|
| 🍙 Food | over time (~1 unit an hour at the computer) | finishing tasks: S 1 · M 2 · L 3 |
| 💗 Joy | over time; faster when sleepy, worn out or sad | tasks, focus sessions, games, music, cleaning up, pats |
| ⚡ Energy | running on battery; faster when hungry or sleepy; playing | charging; sleeping |
| 🎖️ Discipline | time on distractions | working; going back to work |
| 💚 Health | starving, sick (updates waiting), poop (worse with 🪰 flies), no joy, no discipline, sulking, missed deadlines (−20) | only heals when nothing is wrong; medicine (installing updates) +30 |

Bytepet checks your Desktop, Downloads, Trash and tabs every 30 seconds (and right after you leave Finder).
Drag a poop to **throw it around** (try hitting your pet); click it to open the messy folder.
Poop left for an hour attracts **flies 🪰**; after two hours the pet gets sick. At 0 health it becomes a ghost.

3–4 medium tasks a day keeps it fed. Neglect (no food, no medicine, lots of distraction) can eventually kill it,
but it can't die while your Mac is closed or asleep.

A red **!** above your pet means it needs something — hover over it to see what.
Open Bytepet by right-clicking your pet or from the menu bar icon. The 🐣 tab shows what it needs right now, each with a one-click fix.
- **If it dies:** a gravestone appears where it fell and its ghost floats above, with a revive bar.
  Finish tasks (S +20%, M +35%, L +60%) or a focus session (+20%) within **3 days** to bring it back —
  the gravestone crumbles. Otherwise (or if you choose *Let them rest*), the gravestone stays on your desktop and a
  new egg hatches. Click the gravestone to **move it to the cemetery** (🪦 tab).

## Start over

⚙️ Settings → **Start over**: *Reset progress* (new egg; badges, streaks, Petdex, postcards and cemetery cleared;
tasks and settings stay) or *Erase everything* (like a fresh install).

## Notifications

Settings → Notifications: turn off Mac notifications, the little on-screen pop-up cards, or make the pet
quieter (speech bubbles only for important things). Also **quiet hours** (default 11 PM–8 AM) and a **daily limit** (default 8).
Your pet still talks on screen; it just won't send Mac notifications. Press **Send a test notification** —
if nothing shows up, System Settings → Notifications → Bytepet → Allow.
You get notified when your pet needs you, evolves, dies or is revived, when a badge unlocks, and a day before a ghost fades.

## Speed & battery

Bytepet checks what's open every 15 seconds. On battery, or if checks get slow, it checks every 30 seconds
and looks at browser tabs less often (except during focus sessions). Settings → App shows the speed and CPU.

## Age, streaks & items

One **good day** (2 tasks, or 1 task + 1 focus session, or 2 focus sessions) = **one year of age**.
Good days in a row build your **streak**. Missing a day never hurts your pet; it only resets the streak.
Streaks unlock items to wear (Pet tab): **Bow** (3 days), **Cap** (7), **Sunglasses** (14), **Wizard hat** (30).

## 50 achievements

Badges for tasks, focus, streaks ("Survived Finals Week": 7 days in a row with 3+ tasks), raising pets,
care, games and more. When you earn one, it pops up in the top-right corner, then disappears.
See them all in the **Badges** tab.

## Digital mess 💩

Your pet poops when your computer gets messy:

| Mess | Default limit |
|---|---|
| Items on the Desktop | 15 |
| Items in Downloads | 50 |
| Open browser tabs (Safari, Chrome, Arc, Brave, Edge…) | 40 |
| Items in the Trash (needs Full Disk Access for Terminal; skipped otherwise) | 100 |

Click a poop to see what's messy and open that folder. Clean up and it's **flushed** away.
Leave it for 2 hours and your pet gets **sick** until you clean. Change the limits in Settings.
The first time, macOS asks to let Terminal access your Desktop and Downloads folders.

## Battery & heat

- **Battery under 20%** (not plugged in) → sleepy and slow, with a low-battery icon.
- **Plugged in** → a lightning bolt ⚡.
- **Computer hot or CPU maxed out** → sweating and fanning itself.

## Vacation 🧳

Menu → **Go on vacation** (or the Pet tab). Your pet leaves: nothing decays, no notifications,
no care mistakes, and your streak is safe.

**Postcards from where you really went:** while you're on vacation, Bytepet checks where your laptop is
(when you open it, and every hour it's awake). Come back after **a day or more** and your pet brings a postcard
from each country you visited (up to 3) — with the flag, a scene (Eiffel Tower, pyramids, canals, temples, beaches…)
and a note. Never left home? You get a **staycation** postcard instead.

Location comes from your internet connection's approximate city and country (free lookup, no GPS, no account),
with your Mac's time zone as a backup. It's only checked while on vacation. A VPN can fool it.
Turn it off, or change how long a trip must be, in **Settings → Vacation postcards**.

## Graveyard 🪦

Adults can **retire** (Pet tab). They get a gravestone with their lifetime stats in the Memories tab,
and a new egg hatches (Byte II, Byte III…). A ghost that isn't revived within 3 days also moves on.
Achievements, streaks and postcards stay with you.

## Mini-games 🕹️

Played right on top of your desktop (Games tab or menu → Mini-games). Esc quits.

| Game | How to play |
|---|---|
| **Brick Breaker** | Your pet is the paddle. Mouse or ← → to move, click or Space to launch. |
| **Snack Catch** | Catch falling snacks (★ = 3 points), dodge the green bugs. 3 lives. |
| **Left or Right** | The classic: guess which way your pet will look. 5 rounds. |
| **Memory Beeps** | Repeat the growing pattern of lights and beeps (click or keys 1–4). |
| **Stretch Break** | A 2-minute guided stretch; follow your pet's moves. Restores energy. |

## Bring in tasks from your other apps

Open the Tasks window → **Connections**.

| App | How to connect | Finishing a task there… |
|---|---|---|
| **Apple Reminders** | *Connect Reminders…* → pick the lists with real to-dos → *Sync these lists*. No account needed; allow access when macOS asks. | feeds your pet (synced every 3 min) |
| **Todoist** | Todoist → Settings → Integrations → Developer → copy your **API token** → paste → *Connect Todoist* | feeds your pet (synced every 5 min) |
| **Calendar tasks** | Some calendar apps (Nextcloud, Fastmail, Thunderbird…) include tasks in their iCal link. Google Calendar and iCloud don't — use Reminders or Todoist for those. | feeds your pet |
| **GitHub issues** | see below | closing the issue feeds your pet |

**Two-way:** finishing an imported task in Bytepet also ticks it off in Reminders or Todoist
(turn this off with the checkbox in Connections). Deleting it in Bytepet only hides it here.

**Sizes:** add `[S]`, `[M]` or `[L]` (or `#small` / `#large`) to the title in any app.
Without a tag: high priority = **L**, low priority = **S**, everything else = **M**.
Todoist labels named `small` / `large` / `size: S` work too.

Overdue items that you import aren't counted as care mistakes — only deadlines missed after they're in Bytepet.

## Calendar, GitHub and git (optional) — in the Tasks window

- **Calendar:** paste your calendar's *secret iCal link* (Google: Settings → your calendar →
  *Secret address in iCal format*; Outlook: Settings → Shared calendars → Publish).
  The pet warns you 10 minutes before meetings. Daily/weekly repeating events are supported.
- **GitHub:** paste a fine-grained personal access token with **read-only** Issues and Pull requests.
  Import issues assigned to you as tasks (labels like `size: S` / `large` set the size),
  get alerts for PRs waiting on your review, and closing an issue on GitHub completes the task here.
  The token is encrypted with your macOS keychain. Bytepet never writes to GitHub.
- **Git repos:** menu → *Connect a Git repo…* — commits feed the pet, and you get a reminder
  if changes sit uncommitted for 2+ hours.

## Dancing

When Spotify or Apple Music is playing, it dances and gets happier (even when it's sick).
Allow the "control Spotify/Music" prompt the first time. When you start Bytepet from Terminal,
macOS lists these permissions under **Terminal** in Privacy & Security → Automation.

## Playing with it

Click to pat · double-click to play · drag to toss · hover for stats · right-click for the menu.

## Demo tools (for presenting)

Menu → **Demo tools**: finish a small/medium/large task, a 1-minute focus session, hunger,
too much screen time, a fake update, a cure, too much distraction, a meeting in 5 minutes,
a task due in 30 minutes, a missed deadline, dancing, growing up, ghost mode, and reset.

## Settings

Menu → **Open settings file**, edit, then **Reload settings**.

| Setting | Default |
|---|---|
| `name` | `Byte` |
| `screenLimitMinutes` | `120` |
| `bedtimeHour` / `wakeHour` | `23` / `7` |
| `distractionApps` / `distractionSites` | see above |
| `distractionAllowanceMinutes` (per day) | `45` |
| `workApps`, `meetingApps`, `musicApps` | see file |
| `meetingReminderMinutes` | `10` |
| `taskReminderMinutes` | `60` |
| `uncommittedAlertHours` | `2` |
| `checkUpdates` / `checkHomebrew` | `true` / `false` |
| `notifications` | `true` |

## For other tools

Bytepet listens on your Mac only (`127.0.0.1:47777`):

```bash
curl "http://127.0.0.1:47777/feed?type=task&size=L"   # reward a large task
curl "http://127.0.0.1:47777/feed?type=commit"
curl "http://127.0.0.1:47777/status"
curl "http://127.0.0.1:47777/tasks"                   # list open tasks (id, title, size, due)
curl "http://127.0.0.1:47777/task/done?id=<id>"       # finish a task by id (feeds the pet)
```

The same endpoints power the [Kiro MCP server](mcp/server.js) — see **Kiro can feed your pet** above.

## Privacy

Everything stays on your Mac. Bytepet reads the frontmost app's name, the current browser
site's domain, whether music is playing, and the list of pending updates. Network requests:
weather (Open-Meteo), your calendar link, and GitHub — only if you connect them.

## Troubleshooting

- **Reporting a bug** → Settings → **Copy debug info** (or menu bar → Help) and paste it in. Tokens and
  calendar links are hidden. The log file is at `~/Library/Application Support/Bytepet/logs/bytepet.log`.

- **No notifications** → System Settings → Notifications → *Electron* → allow.
- **Websites, Spotify or Reminders not detected** → System Settings → Privacy & Security → Automation →
  *Terminal* (or *Electron* / *Bytepet* for the packaged app) → turn the app on.
- **Can't click the pet** → in `main.js`, change `focusable: false` to `focusable: true`.
- **Calendar says it can't read the link** → use the *secret* iCal address, not the public web page.
- **Start over** → Demo tools → *Hatch a new pet*.

## Project structure

```
main.js              windows, menu bar, notifications, Mac checks, integrations
preload.js           bridge for the pet window
preload-tasks.js     bridge for the Tasks window
src/pet-state.js     all care rules (pure functions, tested)
src/tasks.js         task list rules (tested)
src/calendar.js      .ics calendar reader (tested)
src/github.js        read-only GitHub client
src/sync.js          keeps tasks in step with other apps (tested)
src/reminders.js     Apple Reminders connector
src/todoist.js       Todoist connector
src/progress.js      days, streaks and unlocks (tested)
src/achievements.js  the 50 achievements (tested)
src/postcards.js     vacation postcards for 50+ countries (tested)
src/location.js      where you are while on vacation (tested)
src/distraction.js   what counts as a distraction (tested)
src/system.js        mess, battery, heat, window titles; hide apps & close tabs (strict focus)
src/quiet.js         quiet hours and the daily notification limit (tested)
scripts/build-mac.sh builds Bytepet.app (npm run build:mac)
scripts/make-icon.py draws the app icon (npm run icon)
renderer/games.*     the 5 mini-games
renderer/hub.js      Pet, Badges, Games, Memories and Settings tabs
src/lines.js         everything the pet says
renderer/sprites.js  the pixel art, as editable string grids
renderer/            pet animation + Tasks window
test/                npm test
.kiro/steering/      project guidance for Kiro
```
