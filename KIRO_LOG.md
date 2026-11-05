# Kiro Log

## Agent hooks

Created three Ask Kiro (agent-action) hooks that fire on file save:

- **lines-copy-review** (`src/lines.js`) — reviews new/changed copy for length (<80 chars), friendly tone, and no real brand mentions.
- **settings-readme-sync** (`main.js`) — updates the README Settings section when settings change.
- **tests-on-src-save** (`src/**`) — runs `npm test` and fixes code if any test fails.

Hooks activate on the next session start, so firing/results will be recorded after testing them in a fresh session.

## Pre-submission check (2026-11-04)

A full pre-submission pass with Kiro over the whole project. No gameplay balance, pixel
art or overall design was changed — only real bugs and documentation.

### Bugs fixed

- **Sleeping pet could die in its sleep (the `sleep-health-decay-fix` bugfix spec).**
  The joyless (`happiness < 20`) and undisciplined (`discipline < 20`) health penalties in
  `tickMinute` (`src/pet-state.js`) were still applied while asleep, so a sleeping pet with
  low joy or discipline could drain to 0 health and become a ghost. The fix the spec called
  for — guarding both with `&& !pet.asleep`, matching the already-guarded distraction and
  ignored-sleepy penalties — had not actually landed. Added the guard. Then tightened the
  property test **"a pet cannot die while asleep with the computer away"** so its happiness
  and discipline generators span the full 0–100 range (they were pinned at a minimum of 20
  to work around the bug) and rewrote its comment to describe the restored behavior. The
  stronger invariant now passes.

- **Feed server was reachable from web pages and completed tasks on GET.** The local feed
  server (`127.0.0.1:47777`) had no browser-origin guard and `/task/done` (which mutates
  state) answered any method. Added a pure `src/feed-guard.js` that rejects any request
  carrying an `Origin` header (403) — only a browser sends one; the git curl hook and the
  MCP server never do — and holds `/task/done` to POST only (405 otherwise). Wired it into
  `startFeedServer()` in `main.js` (still bound to `127.0.0.1` only), updated the MCP server
  (`mcp/server.js`) to complete tasks via POST, and updated the `kiro-feeds-pet`
  requirements/design/tasks to match (GET → POST, plus a new "unreachable from web pages"
  requirement). Added `test/feed-server.test.js`: pure guard tests plus an end-to-end server
  using the real guard (403 on Origin, 405 on wrong method, 127.0.0.1 bind). Smoke-tested the
  MCP server end-to-end against a stubbed feed server: all three tools respond and
  `complete_task` reaches the feed server via POST and feeds the pet.

- **`sounds` setting had no control in the Hub Settings tab.** It was collected during
  first-run setup and handled by `saveHubSettings`, but there was no way to change it later
  except by editing the JSON. Added a "Sound effects" toggle to the Hub Settings tab
  (`renderer/tasks.html`, `renderer/hub.js`); the save/load plumbing already existed.

### Checked and confirmed sound (no change needed)

- **Event wiring.** Every event emitted by `src/pet-state.js` is handled in `main.js`
  `handleEvents` and forwarded to the renderer with a speech line (from `src/lines.js`), a
  visual, and — for the six retro-sounds events (`call-hungry`, `got-sick`, `evolved`,
  `died`, `revived`, `basket`) — a beep via `Sound.handleEvent`. The only events without a
  direct `LINES` key are the `call-*` events, which is by design (they drive the attention
  icon; only `call-hungry` also speaks).
- **`sounds.js` ignores unknown/prototype event names.** `specFor`/`shouldPlay`/`handleEvent`
  gate on `Object.prototype.hasOwnProperty`, so `toString`, `constructor`, etc. never play.
  Added an explicit regression test for prototype keys.
- **Demo mode is isolated.** It drives a separate `demoPet`, never saves, gates ~19
  background timers and the `pushState`/`notify` paths on `demoMode`, and restores the real
  pet on stop.
- **Robust startup.** First run (no save) opens the setup window; an old save loads and
  catches up; corrupt/missing JSON falls back; AppleScript/JXA calls resolve with an error
  flag and callers skip gracefully.
- **Menus.** Every tray and right-click menu handler resolves to a defined function.
- **Docs & repo.** README has install (incl. the Gatekeeper "Open Anyway" step), how to
  play, features, the exact MCP `mcp.json` snippet, and a "How I used Kiro" section listing
  the steering files, feature specs, the bugfix spec, the hooks, the `pet-writer` agent and
  the MCP server. `.gitignore` covers `node_modules`, `dist`, `.DS_Store` and `*.log`.

### Needs a human eye

- **`first-run-tour` spec vs. what shipped.** The shipped tour is a Hub/Tasks-window
  spotlight walkthrough (`src/tour.js`, `renderer/tour.js`, "Replay the tour" button,
  `test/tour.test.js` passing, offered after setup via the `offer-tour` IPC). The
  `first-run-tour` spec's tasks describe a *different* design (a pet-window pointer-bubble
  overlay with `tourSeen` on the profile and tour copy in `lines.js`), so its `tasks.md`
  boxes are all still unchecked — and they genuinely don't match the shipped design. I left
  them unchecked rather than tick boxes for work that was never done as written. Decide
  whether to update that spec to describe the shipped Hub tour, or leave it as a record of
  the original plan.
