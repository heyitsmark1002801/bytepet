# Bytepet — tech

## Stack

Electron, plain JavaScript, HTML and CSS. No frameworks, no build step. No TypeScript, no bundler, no transpiler.

## Folder structure

```
main.js              main process: windows, menu bar, notifications, Mac checks, integrations
preload.js           IPC bridge for the floating pet window
preload-tasks.js     IPC bridge for the Tasks/Hub window
preload-games.js     IPC bridge for the mini-games overlay
src/                 all game logic — pure functions, no Electron imports
renderer/            the pet window (animation, input) and the Tasks/Hub window (UI)
test/                tests (npm test)
scripts/             build and icon scripts
.kiro/steering/      project guidance for Kiro
```

### src/ — pure game logic

Every file in `src/` is a plain Node module with no Electron imports. This keeps it testable with `node test/pet-state.test.js` and nothing else.

| File | Responsibility |
|---|---|
| `pet-state.js` | All care rules: meters, decay, rewards, stages, forms, death, revival, mess, vacation |
| `tasks.js` | Task creation, ordering, completion, deadline checks, size from labels |
| `calendar.js` | .ics reader: events, VTODO tasks, TZID, daily/weekly repeats |
| `github.js` | Read-only GitHub client (issues, PR reviews) |
| `sync.js` | Reconciles tasks with Reminders, Todoist, calendar, GitHub |
| `reminders.js` | Apple Reminders connector (JXA) |
| `todoist.js` | Todoist connector (API v1, fallback v2) |
| `progress.js` | Days, streaks, unlocks, good-day detection |
| `achievements.js` | The 50 achievements, evaluated against lifetime totals |
| `postcards.js` | Vacation postcards for 50+ countries |
| `location.js` | Where you are while on vacation (internet lookup, timezone fallback) |
| `distraction.js` | What counts as a distraction (apps, sites, categories, learning) |
| `system.js` | Digital mess, battery, heat, window titles, running apps, strict focus |
| `quiet.js` | Quiet hours and the daily notification limit |
| `lines.js` | Everything the pet says (speech lines) |

### main.js — the Electron main process

Owns the pet's state, the floating always-on-top window, the Tasks/Hub window, the menu-bar tray icon, Mac checks (frontmost app, browser site, screen lock, music, updates), the local feed server (`127.0.0.1:47777`), calendar/GitHub/Reminders/Todoist syncing, focus tracking, and all notifications. This is where Electron APIs live — it should never be imported from `src/`.

### renderer/ — the UI

| File | Responsibility |
|---|---|
| `renderer.js` | The floating pet: movement, physics, pixel animation, speech bubbles, icons, poop, basket, gravestones |
| `sprites.js` | All pixel art as editable string grids (see art.md) |
| `hub.js` | The Hub window: Pet, Achievements, Games, Memories, Settings tabs |
| `tasks.js` | The Tasks window: task list, focus tab, connections |
| `games.js` | The 5 mini-games (Brick Breaker, Snack Catch, Left or Right, Memory Beeps, Stretch Break) |
| `setup.js` / `setup.html` | First-run setup window |

### preload*.js — IPC bridges

Each window has a preload script that exposes a safe, minimal API to the renderer via `contextBridge`. The renderer never touches Node or Electron directly.

## Rules

- **Game logic stays pure in `src/` with no Electron.** Any new stat, food, care rule or game balance goes in `src/pet-state.js` (or the relevant `src/` module) first, as a pure function. `main.js` calls it and handles side effects (saving, notifications, UI). Never import Electron in `src/`.
- **Every change needs a test.** When you add or change logic in `src/`, add or update a test in `test/pet-state.test.js`. Run `npm test` before considering the work done. The test file covers pet-state, tasks, calendar, sync, distraction, system, quiet, progress, achievements, postcards and location.
- **Run `npm test`.** The test command is `node test/pet-state.test.js`. It uses plain `assert` — no test framework. Tests should pass with zero failures.
- **Keep CPU low.** The pet checks what's on screen every 15 seconds (30 on battery or when checks get slow). Browser tab reading is throttled outside focus sessions. App info is cached per bundle path. Avoid tight loops, polling or heavy computations in the renderer. The floating pet window uses `setIgnoreMouseEvents` with forwarding so it never blocks clicks outside its own body.
- **Keep code simple and readable.** Comment the "why", not the "what". Match the existing style (plain JS, `const`/`let`, `require()` for `src/`).
- **All tracking stays on-device.** Never send activity data anywhere. The only network requests are weather (Open-Meteo), calendar links, GitHub and location lookups — and only if the user connects them.
- **Speech lines live in `src/lines.js`.** Keep them short (under 60 characters). The pet only talks on screen; Mac notifications are gated by quiet hours and a daily limit (`src/quiet.js`).
- **The pet must never steal keyboard focus or block clicks outside its own body.** The floating window is `focusable: false` and `setIgnoreMouseEvents(true, { forward: true })`.
