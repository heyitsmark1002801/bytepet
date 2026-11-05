# Implementation Plan: First-Run Tour

## Overview

The First-Run Tour is built in two layers, mirroring Demo Mode. First, a new pure
module `src/tour.js` holds the five-step sequence (feed → throw → hover → menu →
check-in) as plain data plus tiny pure state-machine helpers, with the on-screen copy
keyed into `src/lines.js`. This layer is fully unit- and property-testable with plain
Node and the existing fast-check dev dependency, exactly like `src/demo-script.js`.

Second, a thin layer of glue wires the sequence to the running app: a `tourActive`
flag and `tourIndex` in `main.js`, a `tourView()` payload builder, start/advance/end
functions, the first-hatch trigger gated on `!profile.tourSeen` and `!demoMode`, a
persisted `profile.tourSeen` flag, a `tour` IPC channel to the pet window with a
`tour-action` reply channel, a `hub:replay-tour` handler, and a `#tour` pointer-bubble
overlay in the floating pet window plus a Replay button in the Hub's Settings tab.

Tasks build bottom-up: the pure script, the copy, and their tests first (so order,
count, and copy bounds are proven before any wiring), then the profile flag, then the
main-process glue and IPC, then the renderer overlay and the Settings replay button,
and finally end-to-end wiring.

## Tasks

- [ ] 1. Create the pure tour module and its copy
  - [ ] 1.1 Implement `src/tour.js` with the five-step sequence and helpers
    - Create `src/tour.js` as a pure module with no Electron imports (same style as `src/demo-script.js`).
    - Define `TOUR_STEPS`: an ordered array of five steps with ids `feed`, `throw`, `hover`, `menu`, `checkin`; each step has `id`, `line` (a key into `src/lines.js`), and `icon` (a sprite icon name).
    - Export `TOTAL_STEPS` (= 5) and the pure helpers `startState()` → `{ index: 0 }`, `stepFor(state)` → current step or null, `isLast(state)` → boolean, and `advance(state)` → next state or null when finished.
    - Keep the module tiny and free of any copy strings (copy lives in `src/lines.js`).
    - _Requirements: 2.1, 4.1, 4.2_

  - [ ] 1.2 Add the five tour copy keys to `src/lines.js`
    - Add `tour-feed`, `tour-throw`, `tour-hover`, `tour-menu`, `tour-checkin` as array-of-candidate strings in `LINES`, each ≤ 80 characters.
    - Word each line to describe its topic and the user's interaction: feed = finish tasks/commits (no direct feed gesture), throw = drag and release, hover = reveals meters, menu = right-click opens the menu, check-in = morning 3-task plan.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9_

  - [ ] 1.3 Write property test: the tour is exactly five steps in the fixed order
    - Add tour tests to the existing test entry (e.g. `test/pet-state.test.js` or a new `test/tour.test.js` wired into `npm test`); use fast-check with `numRuns: 100`.
    - Assert `TOUR_STEPS.length === 5` and the ids equal `['feed','throw','hover','menu','checkin']` in order.
    - **Property 1: The tour presents exactly five steps covering the topics in the required order**
    - Tag: `// Feature: first-run-tour, Property 1: ...`
    - **Validates: Requirements 2.1, 2.8**

  - [ ] 1.4 Write property test: advancing walks every step once then finishes
    - From `startState()`, repeatedly call `advance`; assert the visited indices are `0,1,2,3,4`, that `isLast` is true only at index 4, and that `advance` of the last state returns null (the finish signal).
    - **Property 2: Advancing visits each step exactly once in order and then signals completion**
    - Tag: `// Feature: first-run-tour, Property 2: ...`
    - **Validates: Requirements 4.1, 4.2, 2.8**

  - [ ] 1.5 Write property test: copy is present and within the length bound
    - For every step, assert `TOUR_STEPS[i].line` exists as a key in `LINES` and that `say(key)` returns a non-empty string of at most 80 characters.
    - **Property 3: Every step's copy exists in lines.js and is non-empty and ≤ 80 characters**
    - Tag: `// Feature: first-run-tour, Property 3: ...`
    - **Validates: Requirements 2.9**

  - [ ] 1.6 Write property test: the auto-start predicate
    - Implement/exercise a pure predicate `shouldAutoStart({ tourSeen, demoMode, firstHatch })` returning true only when `!tourSeen && !demoMode && firstHatch`; property-test it across all boolean combinations.
    - **Property 4: The tour auto-starts only on a first hatch when unseen and no demo is playing**
    - Tag: `// Feature: first-run-tour, Property 4: ...`
    - **Validates: Requirements 1.1, 1.2, 1.3, 5.3, 7.4**

  - [ ] 1.7 Write unit tests for representative copy wording
    - Assert a couple of tour keys resolve to their expected exact strings (e.g. the feed and check-in lines).
    - _Requirements: 2.3, 2.7_

- [ ] 2. Checkpoint - tour module, copy, and their tests pass
  - Run `npm test`; ensure all tests pass with zero failures. Ask the user if questions arise.

- [ ] 3. Add the persisted seen-flag on the profile
  - [ ] 3.1 Add `tourSeen` to `emptyProfile()`
    - Add `tourSeen: false` to the object returned by `emptyProfile()` in `src/progress.js` so existing installs default to unseen via the `{ ...emptyProfile(), ...saved }` merge in `loadProfile()`; no `DATA_VERSION` bump.
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ] 3.2 Confirm the flag survives generations
    - Verify (test or documented reasoning) that `tourSeen` lives on the profile, which `buryPet`/revival/new-egg flows do not reset, so a set flag persists across death, revival, retirement, and new generations.
    - _Requirements: 5.2, 5.3_

- [ ] 4. Add the tour engine and IPC in main.js
  - [ ] 4.1 Add tour state and `tourView()`
    - Near the demo state in `main.js`, add `let tourActive = false; let tourIndex = 0;`.
    - Implement `tourView()` that builds the TourView payload `{ active, index, total, topic, icon, text }` for the current step, resolving `text` via `say(step.line)`; when no step is active return `{ active: false }`.
    - _Requirements: 2.2, 2.8, 2.9, 3.1_

  - [ ] 4.2 Implement `startTour()`, `advanceTour()`, and `endTour()`
    - `startTour()`: early-return while `demoMode` is true; set `tourActive = true; tourIndex = 0;` (if already active, just reset `tourIndex = 0` to restart rather than stacking); `send('tour', tourView())`.
    - `advanceTour()`: `tourIndex += 1`; if `tourIndex >= Tour.TOTAL_STEPS` call `endTour()`, else `send('tour', tourView())`.
    - `endTour()`: idempotent; set `tourActive = false; tourIndex = 0;`, set `profile.tourSeen = true; saveProfile();`, and `send('tour', { active: false })` to clear the overlay. None of these call `notify(...)`.
    - _Requirements: 1.4, 4.2, 4.3, 4.4, 5.1, 6.4, 7.3_

  - [ ] 4.3 Trigger the tour on the first hatch
    - In `handleEvents`, within the existing `e === 'evolved' && pet.stage === 'baby'` branch, after the hatch line/notification, add `if (!demoMode && !profile.tourSeen) setTimeout(startTour, 1200);` so the tour starts shortly after the hatch burst, only on a first hatch, only when unseen, and never during a demo.
    - _Requirements: 1.1, 1.2, 1.3, 5.3, 7.4_

  - [ ] 4.4 Add the tour IPC handlers
    - Add `ipcMain.on('tour-action', (_e, a) => { if (a === 'next') advanceTour(); else if (a === 'skip') endTour(); })` for the pet window.
    - Add `ipcMain.handle('hub:replay-tour', () => { startTour(); return tasksView(); })` for the Hub.
    - _Requirements: 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 6.4_

- [ ] 5. Add the IPC bridges
  - [ ] 5.1 Expose tour APIs in `preload.js` (pet window)
    - Add `onTour: (cb) => ipcRenderer.on('tour', (_e, v) => cb(v))` and `tourAction: (a) => ipcRenderer.send('tour-action', a)` to the `bytepet` bridge.
    - _Requirements: 1.4, 4.1, 4.3_

  - [ ] 5.2 Expose `replayTour` in `preload-tasks.js` (hub)
    - Add `replayTour: () => ipcRenderer.invoke('hub:replay-tour')` to the `tasksApi` bridge.
    - _Requirements: 6.1, 6.2_

- [ ] 6. Build the pointer-bubble overlay in the pet window
  - [ ] 6.1 Add the `#tour` overlay element and styling
    - Add `<div id="tour" hidden>…</div>` in `renderer/index.html` beside `#demo-caption`, with child nodes for a pointer, the text, a "Step n of 5" counter, and Next and Skip buttons. Use only `'self'`/`data:` resources and inline styling permitted by the existing CSP (no inline scripts).
    - Style `#tour` in `renderer/style.css` to match the pet's bubble/LCD look, with a visible pointer aimed at the pet and tappable Next/Skip buttons.
    - _Requirements: 2.8, 3.4, 4.1, 4.3, 4.5_

  - [ ] 6.2 Render and position the overlay in `renderer.js`
    - Register `api.onTour((v) => { tour = v.active ? v : null; renderTour(); })`; `renderTour()` fills the text, the step icon via `SP.icon(v.icon, …)`, the "Step {index+1} of {total}" counter, and the Next button label ("Next", or "Got it!" when `index === total - 1`); when `tour` is null it hides `#tour`.
    - In the per-frame `render(t)` loop, when `tour` is active, position `#tour` from `body.x/body.y` (anchored near the pet, pointer toward it) and clamp it on screen using the existing edge-shift approach (`shiftFor`).
    - _Requirements: 3.1, 3.2, 3.3, 4.5_

  - [ ] 6.3 Wire the overlay buttons and keep the window non-blocking
    - Next button calls `api.tourAction('next')`; Skip button calls `api.tourAction('skip')`.
    - Ensure the overlay's buttons are inside the window's interactive hit region (like the hovered pet) so clicks reach them, while everywhere else stays click-through via the existing `setIgnoreMouse(true, { forward })` behaviour, and the window stays non-focusable.
    - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.2_

- [ ] 7. Add the Replay control to the Hub Settings tab
  - [ ] 7.1 Add the Replay button to `renderer/tasks.html`
    - Add `<button type="button" id="s-replay-tour">Replay the intro tour</button>` in the Settings tab's Help row (alongside `#s-setup`, `#s-debug`, `#s-log`).
    - _Requirements: 6.1_

  - [ ] 7.2 Bind the Replay button in `renderer/hub.js`
    - Add `$('s-replay-tour').addEventListener('click', () => api.replayTour());` next to the other Help-row button bindings.
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 8. Final checkpoint - wire everything together and verify
  - [ ] 8.1 Confirm end-to-end wiring
    - Verify: first hatch of a brand-new profile starts the tour; a second hatch / revival / new egg with `tourSeen` set does not; Next walks all five steps and ends on "Got it!"; Skip ends immediately; the overlay tracks the pet and clamps on screen; replaying from Settings restarts the tour and does not clear `tourSeen`; and no Mac notification fires from the tour path.
    - Confirm no tour data is written anywhere except `profile.tourSeen` via `saveProfile()`.
    - _Requirements: 1.1, 1.2, 4.2, 4.3, 4.4, 5.1, 5.2, 6.2, 6.3, 7.3_

  - [ ] 8.2 Checkpoint - ensure all tests pass
    - Run `npm test`; ensure all tests pass with zero failures. Ask the user if questions arise.

## Notes

- The five-step sequence, step order, and copy keys live in `src/tour.js`; the copy
  strings and the ≤ 80-char bound live in `src/lines.js` — both pure and tested, per the
  project's tech rules.
- "Shown once across generations" is anchored to a single `profile.tourSeen` boolean,
  because the profile survives death, revival, retirement, and new eggs while the pet is
  reset each generation.
- Isolation from focus/clicks/notifications is preserved: the window stays
  `focusable: false` with click-through everywhere except the tour's own buttons, and the
  tour path never calls `notify(...)`.
- The overlay is drawn in the pet window near `body.x/body.y` and reuses the existing
  edge-clamping so it stays on screen as the pet moves.
- Each task references the specific requirement sub-clauses it satisfies for
  traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "1.6", "1.7", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1", "5.1", "5.2", "6.1", "7.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "6.2", "7.2"] },
    { "id": 4, "tasks": ["6.3"] },
    { "id": 5, "tasks": ["8.1", "8.2"] }
  ]
}
```
