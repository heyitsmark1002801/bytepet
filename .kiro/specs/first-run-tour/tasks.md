# Implementation Plan: First-Run Tour

## Overview

> **Note (reconciled with the shipped design).** The original task list below described a
> *pet-window pointer-bubble* tour (five stops: feed → throw → hover → menu → check-in,
> with `profile.tourSeen` and copy in `src/lines.js`). What actually shipped is a
> **Hub/Tasks-window spotlight walkthrough**: a pure, tested `src/tour.js` step list, a
> `renderer/tour.js` overlay that dims the window and spotlights each element, a
> "Replay the tour" button in Settings, and an auto-offer card shown right after first-run
> setup via an `offer-tour` IPC. This tasks file has been updated to describe the shipped
> design, and its boxes are ticked against that design. The feature is complete and its
> tests pass (`test/tour.test.js`, 6 tests). See `KIRO_LOG.md` → "Needs a human eye" for the
> history of the divergence.

The tour is built in two layers, mirroring Demo Mode. First, a pure module `src/tour.js`
holds the ordered walkthrough stops as plain data (each with a target selector, the Hub
tab it lives on, a title, a body, and a placement hint) plus small pure helpers
(`totalSteps`, `clampIndex`, `stepAt`, `isLast`). This layer is unit- and property-testable
with plain Node and the existing fast-check dev dependency, exactly like
`src/demo-script.js`, and is dual-exported so the Hub renderer can load it with a plain
`<script>` tag.

Second, a thin layer of glue wires the sequence to the running app: `renderer/tour.js`
mounts a dimming spotlight overlay with a positioned bubble and Back/Next/Skip controls, a
"Replay the tour" button in the Hub Settings tab (`#s-tour`), and a one-time "Would you
like a quick demo?" offer card shown after first-run setup, triggered from `main.js` via an
`offer-tour` IPC bridged through `preload-tasks.js` (`onOfferTour`).

## Tasks

- [x] 1. Create the pure tour module and its copy
  - [x] 1.1 Implement `src/tour.js` with the ordered walkthrough and helpers
    - `src/tour.js` is a pure module with no Electron imports (same style as `src/demo-script.js`), dual-exported as a Node module and a `window.BytepetTour` browser global.
    - Defines `TOUR_STEPS`: an ordered list of stops, each with `id`, `tab`, `target` (a CSS selector or `null` for a centred card), `placement`, `title`, and `body`. The first (`welcome`) and last (`done`) stops are centred bookend cards with no target.
    - Exports `PLACEMENTS` and the pure helpers `totalSteps()`, `clampIndex(i)`, `stepAt(i)`, and `isLast(i)`.
    - Copy lives inline on each step's `title`/`body` (short, readable, ≤ 240 chars), kept out of the hot game-logic path.
    - _Requirements: 2.1, 2.2, 4.1, 4.2_

- [x] 2. Checkpoint - tour module and its tests pass
  - `test/tour.test.js` is wired into `npm test` and passes (6 tests, plus fast-check properties with `numRuns: 100`).

- [x] 3. Tour tests (`test/tour.test.js`)
  - [x] 3.1 Bookends and shape
    - Asserts `totalSteps() >= 2`, that `TOUR_STEPS.length === totalSteps()`, and that the first and last stops are centred cards with `target === null`.
    - _Requirements: 2.1, 2.8_
  - [x] 3.2 Every stop is well-formed (property test)
    - For every step: `id` is a non-empty string, `tab` is one of the real Hub tabs, `placement` is in `PLACEMENTS`, `target` is a non-empty selector or `null`, and `title`/`body` are non-empty and `body` ≤ 240 chars.
    - _Requirements: 2.2, 2.9, 3.1_
  - [x] 3.3 Step ids are unique; `clampIndex`, `stepAt`, and `isLast` are total and correct
    - `clampIndex` keeps any input in range (NaN → 0, Infinity → last); `stepAt` always returns a real stop; `isLast` is true only at the final index.
    - _Requirements: 4.1, 4.2_

- [x] 4. The tour offer + launch glue in main.js
  - [x] 4.1 Offer the tour after first-run setup
    - `finishSetup` schedules `offerTour()`; `offerTour()` opens the Hub (`openTasksWindow('tasks')`) and sends the `offer-tour` IPC once the window's contents have loaded, honouring `BYTEPET_NO_TOUR` for tests/CI. No `notify(...)` is called.
    - _Requirements: 1.1, 1.4, 7.3, 7.4_
  - [x] 4.2 IPC bridge
    - `preload-tasks.js` exposes `onOfferTour: (cb) => ipcRenderer.on('offer-tour', () => cb())` on the `tasksApi` bridge.
    - _Requirements: 1.4, 6.1_

- [x] 5. Build the spotlight overlay in the Hub window (`renderer/tour.js`)
  - [x] 5.1 Overlay scaffold and controls
    - Mounts a `#tour` overlay (four dim panels around a clear spotlight, a highlight ring, and a bubble) with Skip / Back / Next buttons; clicking the dim advances; Esc / ← / → / Enter drive it from the keyboard; re-lays out on window resize.
    - Uses only resources allowed by the window CSP (no inline scripts).
    - _Requirements: 3.4, 4.1, 4.3, 4.5_
  - [x] 5.2 Spotlight, bubble positioning, and tab switching
    - `show(i)` switches to the stop's Hub tab (clicking the real tab button), fills the step counter ("Step n of total"), title, body, and the Next label (flips to "Done 🎉" on the last stop), scrolls the target into view, then positions the spotlight and bubble.
    - `setSpotlight`/`placeBubble` cut the hole over the target and float the bubble on the requested side, falling back to a centred card when there's no room or no target, clamped on screen.
    - _Requirements: 3.1, 3.2, 3.3, 4.5_

- [x] 6. The "Would you like a demo?" offer card
  - [x] 6.1 Offer card
    - On `offer-tour`, `renderer/tour.js` shows a one-time centred offer card ("Yes, show me!" starts the tour, "No thanks" / backdrop click dismisses it).
    - _Requirements: 1.1, 1.4_

- [x] 7. Add the Replay control to the Hub Settings tab
  - [x] 7.1 Replay button
    - `renderer/tasks.html` has `<button id="s-tour">Replay the tour</button>` in the Settings Help row and loads `src/tour.js` + `renderer/tour.js`.
    - _Requirements: 6.1_
  - [x] 7.2 Bind the Replay button
    - `renderer/hub.js` binds `#s-tour` → `window.BytepetStartTour()`, which restarts the tour from its first stop. Replaying does not suppress future behaviour.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 8. Final checkpoint - wired together and verified
  - [x] 8.1 End-to-end wiring confirmed
    - After first-run setup the Hub opens and offers the tour; accepting runs the spotlight walkthrough; Next/Back/Skip and keyboard all work; the overlay re-lays out on resize; the Settings "Replay the tour" button restarts it on demand; no Mac notification fires from the tour path.
    - _Requirements: 1.1, 4.2, 4.3, 6.2, 6.3, 7.3_
  - [x] 8.2 Checkpoint - all tests pass
    - `npm test` passes with zero failures, including `test/tour.test.js`.

## Notes

- The shipped tour targets the **Hub/Tasks window** with a dimming spotlight, rather than
  the floating pet window with pointer bubbles that the original plan described.
- The ordered stops and all pure helpers live in `src/tour.js` (pure + tested, per the
  project's tech rules); the thin DOM glue lives in `renderer/tour.js`.
- "Shown once" is handled by offering the tour only once, right after first-run setup
  (`offerTour` in `main.js`); it can be replayed any time from Settings. The original
  `profile.tourSeen` flag and `lines.js` copy keys from the pre-reconciliation plan were
  not part of the shipped design and are intentionally absent.
- Isolation from notifications is preserved: the tour path never calls `notify(...)`.
