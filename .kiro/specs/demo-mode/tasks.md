# Implementation Plan: Demo Mode

## Overview

Demo Mode is built in two layers. First, a new pure module `src/demo-script.js` holds
the scripted eight-step lifecycle (hatch → feed → distract → refocus → mess → sick →
die → revive) as plain data plus small pure helpers, driven by the existing
`src/pet-state.js` functions. This layer is fully unit- and property-testable with
plain Node and fast-check, exactly like the existing test suite.

Second, a thin layer of glue in `main.js` wires the script to the running app: a
`demoMode` flag and in-memory `demoPet`, a re-armed step timer, a refactored
`snapshot(p)`, demo-safe state pushes, isolation guards on the background timers and
notification path, a tray toggle entry, and a `demo-caption` IPC channel that the
renderer renders as a single on-screen caption.

Tasks build bottom-up: the pure script and its tests come first (so isolation and
ordering are proven before any wiring), then the main-process glue and isolation
guards, then the renderer caption plumbing, and finally end-to-end wiring.

## Tasks

- [ ] 1. Create the pure demo-script module
  - [ ] 1.1 Implement `src/demo-script.js` with the eight-step story and helpers
    - Create `src/demo-script.js` as a pure module with no Electron imports (same style as `src/pet-state.js`).
    - Define `DEMO_STEPS`: an ordered array of eight steps with ids `hatch`, `feed`, `distract`, `refocus`, `mess`, `sick`, `die`, `revive`; each step has `id`, `caption` (≤ 80 chars), `holdMs` (≥ 3000), and `apply(pet, P)`.
    - Step mutations per design Data Models table: `hatch` → `P.addXp(pet, 5)`; `feed` → `P.feed(pet, 'task-M')`; `distract` → set `pet.distracted = true; pet.distractedMinutes = 5`; `refocus` → `P.refocus(pet)`; `mess` → `P.setMess(pet, [{kind:'downloads',label:'Downloads',count:87,limit:50}])` then `pet.flies = true`; `sick` → `P.setUpdates(pet, 1)`; `die` → `Object.assign(pet, { health:0, ghost:true, ghostSince:now, revive:0, sleepy:false, distracted:false, calls:{} })`; `revive` → `P.feed(pet, 'task-L')` repeated until `pet.ghost === false`.
    - Write per-step captions that reference both the action and its effect on the Demo_Pet, each ≤ 80 characters.
    - Implement `createDemoPet(P, now)` returning a fresh hatched baby Demo_Pet ready to feed (via `P.createPet('Demo')`).
    - Implement `applyStep(pet, step, P)` that runs `step.apply` and returns its event list, `totalDurationMs()` that sums `holdMs`, and `captionFor(step)` that returns `step.caption` as the single source for the ≤80 bound.
    - Choose `holdMs` per step so the total lands in 45,000–90,000 ms with each step ≥ 3,000 ms (design suggests ~6,000 ms each).
    - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.3, 5.1, 5.2, 5.3_

  - [ ]* 1.2 Write property test: story plays eight steps in order
    - Add `test/demo-script.test.js` and use fast-check as a dev dependency; run with `numRuns: 100`.
    - **Property 1: The story plays the eight lifecycle steps in order**
    - Tag: `// Feature: demo-mode, Property 1: ...`
    - **Validates: Requirements 3.1, 3.3**

  - [ ]* 1.3 Write property test: each step establishes its intended effect
    - For a freshly created Demo_Pet with randomized starting meters, assert each step's observable predicate (stage not egg after hatch, food units up after feed, mood `crying` after distract, not distracted after refocus, non-empty poop and flies true after mess, mood `sick` after sick, ghost true after die, ghost false after revive).
    - **Property 2: Each step establishes its intended effect on the Demo_Pet**
    - Tag: `// Feature: demo-mode, Property 2: ...`
    - **Validates: Requirements 3.1, 3.2, 3.4**

  - [ ]* 1.4 Write property test: the demo ends with a living pet
    - After the full story runs from any freshly created Demo_Pet, assert `pet.ghost === false`.
    - **Property 3: The demo ends with a living pet**
    - Tag: `// Feature: demo-mode, Property 3: ...`
    - **Validates: Requirements 3.4**

  - [ ]* 1.5 Write property test: captions are non-empty and within the length bound
    - For every step in `DEMO_STEPS`, assert the caption is a non-empty string of at most 80 characters.
    - **Property 4: Every caption is non-empty and within the length bound**
    - Tag: `// Feature: demo-mode, Property 4: ...`
    - **Validates: Requirements 4.1, 4.3**

  - [ ]* 1.6 Write property test: total runtime lands in the required window
    - Assert `totalDurationMs()` is in `[45000, 90000]` and every step `holdMs >= 3000`.
    - **Property 5: The total runtime lands in the required window**
    - Tag: `// Feature: demo-mode, Property 5: ...`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 1.7 Write property test: advancing the demo pet never mutates the real pet
    - Create a randomly mutated real pet, deep-copy it, run all demo steps on a separate Demo_Pet, and assert the real pet is deep-equal to its pre-demo snapshot.
    - **Property 6: Advancing the demo pet never mutates the real pet**
    - Tag: `// Feature: demo-mode, Property 6: ...`
    - **Validates: Requirements 2.1, 2.3**

  - [ ]* 1.8 Write unit tests for caption wording
    - Assert `captionFor(step)` returns the expected exact wording for a couple of representative steps.
    - _Requirements: 4.1, 4.3_

- [ ] 2. Checkpoint - demo-script module and its tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Add demo state and snapshot refactor in main.js
  - [ ] 3.1 Add demo module-level state and refactor `snapshot()` to accept a pet
    - Near the existing `pet`/`focus`/`music` state in `main.js`, add `let demoMode = false; let demoPet = null; let demoTimer = null; let demoStepIndex = 0;`.
    - Refactor `snapshot()` to `snapshot(p = pet)` so it describes the passed pet, computing `mood`, `needs`, and `foodUnits` from `p`; keep `pushState()` calling `snapshot(pet)`.
    - _Requirements: 2.2, 3.2_

  - [ ] 3.2 Implement `pushDemoState()`
    - Add `pushDemoState()` that calls `send('state', snapshot(demoPet))` with demo-safe fields (empty alerts, no updates, no weather/graves/equipped leaking from real sources) so the renderer draws a clean stage.
    - _Requirements: 3.2, 6.1_

- [ ] 4. Isolate the demo from real data and background activity
  - [ ] 4.1 Gate `pushState()` and `notify()` while a demo is playing
    - Make `pushState()` early-return while `demoMode` is true (it only ever pushes the real pet).
    - Make `notify(...)` early-return while `demoMode` is true so no background check and no demo step fires a macOS notification.
    - _Requirements: 6.1, 6.2_

  - [ ] 4.2 Gate background timer callbacks and power-event handlers
    - Add `if (demoMode) return;` at the top of `minuteTick`, `fastTick`, `checkSystem`, `checkUpdates`, `medicineTick`, `refreshCalendar`, `sample`, `syncSource`, `checkMessNow`, `checkMusic`, `updateWeather`, `checkRepos`, `refreshGithub`, and the power handlers `onAway`, `onBack`, `wakeIfBack`.
    - This prevents the real `pet` from being mutated or saved mid-demo.
    - _Requirements: 2.3, 6.1_

  - [ ]* 4.3 Write example test asserting notification suppression gate
    - Assert that with `demoMode` true the notification path is suppressed and with it false notifications are allowed (boolean gate example).
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 5. Implement the demo step engine in main.js
  - [ ] 5.1 Implement `startDemo()`, `runDemoStep()`, and `stopDemo()`
    - `startDemo()`: early-return if `demoMode` already true; set `demoMode = true`; create `demoPet` via the script's `createDemoPet`; reset `demoStepIndex = 0`; rebuild the tray; start the step loop.
    - `runDemoStep()`: apply the current step to `demoPet` via the script's `applyStep`, `send('demo-caption', step.caption)`, call `pushDemoState()`, then arm the next step after `step.holdMs` using a single re-armed `setTimeout` stored in `demoTimer`; end naturally after the last step.
    - For the `die` step, send a `died` `'event'` to the renderer (as `handleEvents` would) so it drops the gravestone, without any notification.
    - `stopDemo()`: idempotent; clear `demoTimer` (guard against null), set `demoMode = false`, `demoPet = null`, `demoStepIndex = 0`, send an empty `'demo-caption'`, call `pushState()` to redraw the real pet unchanged, and rebuild the tray.
    - _Requirements: 1.2, 1.4, 2.4, 2.5, 3.2, 3.3, 3.4, 5.3, 6.2_

  - [ ] 5.2 Add the tray toggle entry in `buildMenuTemplate()`
    - Add an entry that reads `▶ Play demo` (click → `startDemo`) while not playing and `⏹ Stop demo (playing…)` (click → `stopDemo`) while playing, based on `demoMode`.
    - Rely on `updateTray()` rebuilding the menu so toggling `demoMode` flips the label.
    - _Requirements: 1.1, 1.3, 1.4_

- [ ] 6. Add the demo-caption IPC and renderer plumbing
  - [ ] 6.1 Expose `onDemoCaption` in preload.js
    - Add `onDemoCaption: (cb) => ipcRenderer.on('demo-caption', (_e, text) => cb(text))` to the preload API.
    - _Requirements: 4.2, 4.4_

  - [ ] 6.2 Add the `#demo-caption` element and its styling
    - Add `<div id="demo-caption" hidden></div>` to `renderer/index.html`.
    - Style `#demo-caption` in `renderer/style.css` as a centered, high-contrast strip near the bottom of the pet window; introduce no inline scripts or remote resources (keep the strict CSP intact).
    - _Requirements: 4.1, 4.2, 4.4_

  - [ ] 6.3 Handle demo captions in renderer.js
    - Register `api.onDemoCaption((text) => { ... })`: a non-empty string shows that one caption (replacing any previous text, guaranteeing one at a time); an empty string / null hides the element.
    - _Requirements: 4.2, 4.4_

  - [ ]* 6.4 Write/ document caption-render check
    - Add a DOM example test (or a documented manual check if no DOM harness exists) asserting exactly one caption shows and empty input hides the strip.
    - _Requirements: 4.4_

- [ ] 7. Final checkpoint - wire everything together and verify
  - [ ] 7.1 Confirm end-to-end wiring
    - Ensure `startDemo`/`stopDemo` are reachable from the tray entry, the demo drives `demoPet` through all eight steps with one caption each, the real pet reappears unchanged on stop, and no demo data is ever passed to `savePet`/`saveTasks`/`saveProfile`.
    - _Requirements: 1.2, 2.2, 2.4, 3.1, 3.3_

  - [ ] 7.2 Checkpoint - ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they are the property, unit, and example/DOM tests.
- The eight-step story, captions, and timing live in `src/demo-script.js` so the ≤80-char caption bound and the 45–90 s runtime are enforced and tested in one pure place.
- Isolation is enforced in depth: `pushState`/`notify` gates plus early-returns in every background timer and power handler keep the real pet, tasks, and achievements untouched and un-persisted during a demo.
- The renderer draws the demo pet through the existing `'state'` channel, so no pet-drawing code changes — only the new caption strip is added.
- Each task references the specific requirement sub-clauses (and, for the pure layer, the design properties) it satisfies for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8"] },
    { "id": 2, "tasks": ["3.1", "6.1", "6.2"] },
    { "id": 3, "tasks": ["3.2", "4.1", "4.2", "6.3"] },
    { "id": 4, "tasks": ["4.3", "5.1", "6.4"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["7.1"] }
  ]
}
```
