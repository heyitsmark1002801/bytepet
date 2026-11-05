# Implementation Plan: Retro Sounds

## Overview

Retro-sounds is built in two layers that both live in a new, self-contained renderer
module, `renderer/sounds.js`. First, a **pure decision layer** — the `SPECS`
event→beep table plus `shouldPlay`, `specFor`, and `handleEvent` — takes plain data
(event string, snapshot) and returns plain data (a boolean, a spec object). It touches
no `AudioContext`, so it is fully unit- and property-testable in plain Node with
fast-check, exactly like the existing `src/pet-state.js` suite. Second, a **thin
playback layer** — `playSpec` — drives a square-wave oscillator through a gain node,
mirroring the proven helper in `renderer/games.js`, with an end-of-tone ramp and a
`try/catch` guard so a missing or broken Web Audio API is a silent no-op.

Wiring is then added outward from the module: the renderer calls `Sound.handleEvent`
early in `api.onEvent`; the main process gains a `sounds` boolean that follows the
existing `notifications`/`toasts` pattern and rides along in the state snapshot; and the
setup window gets one more toggle next to `t-notify`.

Tasks build bottom-up: the `SPECS` table and pure gate come first (so the five
correctness properties are proven before any wiring), then the Web Audio playback layer,
then the renderer call, the main-process setting, the setup UI, and finally an
integration smoke that confirms the no-audio-files guarantee end to end.

## Tasks

- [x] 1. Create the sound module's pure decision layer
  - [x] 1.1 Implement `SPECS`, `shouldPlay`, `specFor`, and `handleEvent` in `renderer/sounds.js`
    - Create `renderer/sounds.js` with the `SPECS` object keyed by Pet_Event string, holding the six beep specs exactly as in the design Data Models table: `call-hungry` → `[{freq:440,ms:120}]`; `got-sick` → `[{freq:300,ms:90},{freq:230,ms:140}]`; `evolved` → `[{freq:523,ms:90},{freq:659,ms:90},{freq:784,ms:120}]`; `died` → `[{freq:200,ms:140},{freq:120,ms:220}]`; `revived` → `[{freq:392,ms:100},{freq:523,ms:100},{freq:659,ms:140}]`; `basket` → `[{freq:660,ms:80}]` (each spec a `{ tones: Tone[] }`).
    - Implement pure `specFor(type)` returning `SPECS[type] || null`.
    - Implement pure `shouldPlay(type, state)`: return `false` when the event is unmapped, when `state` is null, when `state.sounds === false`, or when `state.quiet` is truthy; return `true` otherwise.
    - Implement `handleEvent(type, state)` that returns `false` when `shouldPlay` is false, otherwise calls `playSpec(specFor(type))` and returns `true`.
    - Export the module for Node (`module.exports`) with a browser-global fallback (`window.Sounds`) so the decision functions can be required in tests without a DOM or `AudioContext`.
    - Reference zero external audio files and perform no file/network loading anywhere in the module.
    - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4_

  - [x] 1.2 Write property test: each sound event maps to its own beep spec
    - Add `test/sounds.test.js` using fast-check as a dev dependency; run with `numRuns` ≥ 100.
    - Generate from the set of six event strings; assert `specFor(e)` is non-null and the six returned specs are pairwise distinct.
    - **Property 1: Each sound event maps to its own beep spec**
    - Tag: `// Feature: retro-sounds, Property 1: Each sound event maps to its own beep spec`
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

  - [x] 1.3 Write property test: all six beeps are mutually distinguishable
    - Generate unordered pairs of the six events; assert the specs differ on at least one axis — base (first-tone) frequency ≥ 20 Hz apart, total duration ≥ 40 ms apart, or a different tone count.
    - **Property 2: All six beeps are mutually distinguishable**
    - Tag: `// Feature: retro-sounds, Property 2: All six beeps are mutually distinguishable`
    - **Validates: Requirements 2.7**

  - [x] 1.4 Write property test: every beep fits the duration window
    - Generate over the `SPECS` table entries; assert each spec's summed tone duration is in `[80, 400]` ms inclusive.
    - **Property 3: Every beep fits the duration window**
    - Tag: `// Feature: retro-sounds, Property 3: Every beep fits the duration window`
    - **Validates: Requirements 1.2**

  - [x] 1.5 Write property test: the play gate honors mapping, setting, quiet, and snapshot presence
    - Generate `type` from a mix of the six sound events and arbitrary non-sound strings; `sounds` ∈ {true, false, undefined, null}; `quiet` ∈ {true, false}; `state` ∈ {generated snapshot, null}. Assert `shouldPlay(type, state)` equals the reference predicate `isSoundEvent(type) && state != null && state.sounds !== false && !state.quiet`.
    - **Property 4: The play gate honors mapping, setting, quiet, and snapshot presence**
    - Tag: `// Feature: retro-sounds, Property 4: The play gate honors mapping, setting, quiet, and snapshot presence`
    - **Validates: Requirements 2.8, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4**

- [x] 2. Implement the Web Audio playback layer
  - [x] 2.1 Implement `playSpec` with the oscillator/gain envelope and interrupt-on-new-event
    - In `renderer/sounds.js`, implement `playSpec(spec, ctx)` mirroring the `renderer/games.js` helper: lazily create a shared `AudioContext`, build a square-wave `OscillatorNode` per tone routed through a `GainNode` (gain ≈ 0.05) connected to `ctx.destination`, scheduling tones in sequence by their per-tone `ms`.
    - Apply a gain envelope that ramps gain to 0 just before each tone's stop time so playback ends without an audible click, and call `o.stop(ctx.currentTime + offset + ms/1000)`.
    - Track the currently playing oscillator(s) so a new call stops the previous beep before starting the new one.
    - Wrap the entire synthesis body in `try/catch` so that if `AudioContext` is undefined or throws, the call is a silent no-op that does not interrupt the app.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.9_

  - [x] 2.2 Write property test: playback never throws when Web Audio is unavailable
    - Generate over the `SPECS` table; call `playSpec(spec, ctx)` where `ctx` is `null` or a stub whose methods throw; assert no exception propagates and no application side effects occur.
    - **Property 5: Playback never throws when Web Audio is unavailable**
    - Tag: `// Feature: retro-sounds, Property 5: Playback never throws when Web Audio is unavailable`
    - **Validates: Requirements 1.5**

  - [x] 2.3 Write unit test: playback shape and interrupt behavior
    - With a stubbed audio context, assert `playSpec` creates a square-wave oscillator and a gain node, connects to the destination, schedules a gain ramp to 0 before the stop time, and — on a second call while one is playing — stops the previous oscillator before starting the new one.
    - _Requirements: 1.1, 1.3, 2.9_

- [x] 3. Checkpoint - sound module and its tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Wire the sound engine into the renderer
  - [x] 4.1 Call `Sound.handleEvent` from `api.onEvent` in `renderer/renderer.js`
    - Load the sound module once (matching how the renderer loads its other modules, e.g. `const Sound = window.Sounds;`).
    - At the start of the existing `api.onEvent` handler, call `Sound.handleEvent(ev.type, S)` before the visual-effect branches and `sayLine`, so it fires for `call-hungry` and `got-sick` even though those types have no visual branch.
    - Pass the module-level snapshot `S` (already maintained by `api.onState`), which is `null` until the first snapshot arrives.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 4.4_

  - [x] 4.2 Write example test: non-sound events trigger no playback
    - Feed a non-sound event through the handler path with a snapshot where `sounds: true, quiet: false`; assert `handleEvent` returns `false` and no beep is played.
    - _Requirements: 2.8_

- [x] 5. Add the `sounds` setting in the main process
  - [x] 5.1 Add the default, snapshot field, and persistence in `main.js`
    - Add `sounds: true` to `DEFAULT_SETTINGS` next to `notifications`/`toasts`, so a missing stored value resolves to `true` through the existing `{ ...DEFAULT_SETTINGS, ...(saved || {}) }` merge.
    - Add `sounds: settings.sounds !== false` to the `snapshot()` object next to the existing `quiet:` line, so an unreadable/non-boolean stored value still surfaces as `true` to the renderer.
    - In `saveHubSettings(input)`, add `if ('sounds' in input) settings.sounds = !!input.sounds;` next to the `notifications`/`toasts` lines (persisted by the existing `finishSetup` → `saveHubSettings` → `saveSettings` path).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.5, 5.6_

  - [x] 5.2 Write unit tests: main settings default, load, snapshot, and persistence
    - Assert `DEFAULT_SETTINGS.sounds === true`; loading settings without a `sounds` key yields `true`; `snapshot()` output includes `sounds`; a stored `false` surfaces as `false` while unrelated keys are retained; `saveHubSettings({ sounds: false })` sets `settings.sounds = false` and writes; and with a throwing `writeJson` stub other settings are not partially corrupted.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.5, 5.6_

- [x] 6. Add the sounds toggle to the setup window
  - [x] 6.1 Add `#t-sounds` to the setup HTML and wire it in `setup.js`
    - In `renderer/setup.html`, add a checkbox to the rhythm step's `.toggles` section directly after the existing `t-notify` label, with a visible text label identifying it as the sound-effects setting (e.g. `<label><input type="checkbox" id="t-sounds" /> <span><b>Sound effects</b><small>Little retro beeps when your pet needs you (never during quiet hours)</small></span></label>`).
    - In `setup.js`, inside `api.get().then(...)`, set `$('t-sounds').checked = s.sounds !== false;` so a stored `false` is unchecked and true/undefined is checked.
    - In the `api.setupDone({...})` payload, add `sounds: $('t-sounds').checked,` next to `notifications:`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 6.2 Write example test: setup toggle presence, reflection, and submission
    - Assert `#t-sounds` exists with a visible label; the checkbox reflects `s.sounds` (true/undefined → checked, false → unchecked); and the `setupDone` payload carries `sounds` matching the checkbox state.
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. Integration smoke and final wiring
  - [x] 7.1 Add the no-audio-files check and end-to-end gating smoke
    - Add a static check (in `test/sounds.test.js` or a small integration test) asserting `renderer/sounds.js` references no external audio files and performs no file/network loading (Requirement 1.4).
    - Dispatch each of the six events through the renderer handler path with a snapshot where `sounds: true, quiet: false` and confirm `handleEvent` returns `true` for all six; then confirm it returns `false` when `quiet === true` and when `sounds === false`.
    - _Requirements: 1.4, 3.5, 4.1, 4.2, 4.3_

- [x] 8. Final checkpoint - ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All test tasks are required; there are no optional sub-tasks in this plan. Every sub-task is part of the core implementation.
- The pure decision layer (`SPECS`, `shouldPlay`, `specFor`) and the data table carry Properties 1–4; playback robustness is Property 5. Playback shape, interrupt behavior, main settings, and setup UI are covered by example/unit tests because they assert one-shot structure rather than input-varying logic.
- Property tests use fast-check with `numRuns` ≥ 100 and are tagged `// Feature: retro-sounds, Property {n}: ...` per the design Testing Strategy.
- Everything lives in `renderer/sounds.js` so the no-audio-files guarantee (R1.4) and the duration window (R1.2) are enforced and tested in one pure place.
- The `sounds` setting rides in the existing state snapshot, so a runtime change applies to the next event with no extra IPC (R3.7).
- Each task references the specific requirement sub-clauses (and, for the pure layer, the design properties) it satisfies for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.1", "5.1", "6.1"] },
    { "id": 3, "tasks": ["4.2", "5.2", "6.2", "7.1"] }
  ]
}
```
