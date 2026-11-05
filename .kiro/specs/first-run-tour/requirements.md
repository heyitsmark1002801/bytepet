# Requirements Document

## Introduction

Bytepet is a desktop virtual pet whose care is driven by the user's real work habits. New users meet the pet as an egg that hatches into a baby about 20 seconds after it is born, and from then on the pet lives as a floating, always-on-top window. But nothing on screen tells a first-time user how to interact with it: that you pat it with a click, throw it by dragging, see its meters by hovering, open everything from a right-click menu, and plan your day with the morning check-in.

This feature adds a **First-Run Tour**: a short, one-time sequence of five small pointer bubbles shown near the pet right after it hatches for the very first time. Each bubble explains one interaction — **feed**, **throw**, **hover**, **right-click menu**, and the **check-in** — and points at the pet. The tour is **skippable** at any time, is **shown only once** across the pet's whole lifetime (it survives death, revival, and new generations), and can be **replayed on demand** from the Settings tab in the Hub.

The tour must respect the project's hard rules: the floating pet window must never steal keyboard focus or block clicks outside the pet's own body, the tour must not fire any Mac notification, all tour copy lives in `src/lines.js`, and the sequencing logic lives as pure functions in `src/` with a test.

## Glossary

- **System**: the Bytepet application, comprising the Electron main process (`main.js`) and the renderer (`renderer/`).
- **Pet**: the user's pet, stored in `pet.json`, shown in the Floating_Pet_Window.
- **Profile**: the cross-generation user record stored in `profile.json` (achievements, streaks, postcards, totals, etc.) that persists across pet death, revival, and new eggs.
- **First_Hatch**: the first time, across the entire Profile's lifetime, that an egg hatches into a baby (the stage transition from `egg` to `baby`).
- **First_Run_Tour** (or **Tour**): the one-time sequence of five Tour_Steps shown near the pet to explain the core interactions.
- **Tour_Step**: a single pointer bubble in the Tour, consisting of short text and a visual pointer aimed at the pet.
- **Tour_Topics**: the five interactions the Tour explains, in order: **feed**, **throw**, **hover**, **right-click menu**, **check-in**.
- **Pointer_Bubble**: the on-screen element that renders one Tour_Step's text positioned near the pet, with a pointer indicating the pet.
- **Skip_Control**: an on-screen control the user activates to end the Tour before all steps have been shown.
- **Advance_Control**: an on-screen control (and/or click) the user activates to move from the current Tour_Step to the next.
- **Tour_Seen_Flag**: a persisted boolean on the Profile that records that the Tour has been shown to completion or skipped, used to guarantee the Tour is shown only once automatically.
- **Replay_Control**: a button in the Hub's Settings tab that starts the Tour again on demand, regardless of the Tour_Seen_Flag.
- **Floating_Pet_Window**: the always-on-top, non-focusable window (`renderer/renderer.js`) that displays the pet sprite, speech bubble, meters panel, and particles.
- **Hub**: the Tasks/Hub window (`renderer/hub.js`) containing the Pet, Achievements, Games, Memories, and Settings tabs.
- **Tour_Script**: the pure module in `src/` that defines the ordered Tour_Steps, their copy keys, and the pure state-machine helpers that advance, skip, and complete the Tour.
- **Lines**: the speech/copy strings in `src/lines.js`, selected with `say(key, vars)`.

## Requirements

### Requirement 1: Show the tour automatically on the first hatch

**User Story:** As a first-time user, I want a short guided tour right after my pet hatches, so that I immediately know how to interact with it.

#### Acceptance Criteria

1. WHEN First_Hatch occurs AND the Tour_Seen_Flag is not set, THE System SHALL start the First_Run_Tour in the Floating_Pet_Window.
2. WHEN an egg hatches into a baby AND the Tour_Seen_Flag is already set, THE System SHALL NOT start the First_Run_Tour.
3. WHILE the Pet is an egg, a ghost, or any stage other than the moment of First_Hatch, THE System SHALL NOT start the First_Run_Tour automatically.
4. WHEN the First_Run_Tour starts, THE System SHALL display the first Tour_Step near the Pet.

### Requirement 2: Explain the five core interactions in order

**User Story:** As a new user, I want each step to explain one thing about caring for the pet, so that I can follow the tour without being overwhelmed.

#### Acceptance Criteria

1. THE First_Run_Tour SHALL consist of exactly five Tour_Steps covering the Tour_Topics in this order: feed, throw, hover, right-click menu, check-in.
2. EACH Tour_Step SHALL present text that describes its Tour_Topic and the interaction the user performs for it.
3. THE feed Tour_Step SHALL explain that the Pet is fed by finishing real work (tasks and commits) rather than by a direct feeding gesture.
4. THE throw Tour_Step SHALL explain that dragging the Pet and releasing throws it.
5. THE hover Tour_Step SHALL explain that hovering over the Pet reveals its meters.
6. THE right-click menu Tour_Step SHALL explain that right-clicking the Pet opens its menu.
7. THE check-in Tour_Step SHALL explain the morning check-in where the user plans the day's tasks.
8. THE System SHALL display one Tour_Step at a time.
9. EACH Tour_Step's text SHALL be at most 80 characters and SHALL be sourced from Lines in `src/lines.js`.

### Requirement 3: Point the bubbles at the pet and keep them on screen

**User Story:** As a user, I want each bubble to point at my pet and stay readable on screen, so that I can tell what each step is talking about.

#### Acceptance Criteria

1. WHEN a Tour_Step is shown, THE System SHALL position its Pointer_Bubble near the Pet's current on-screen location with a pointer indicating the Pet.
2. WHILE a Tour_Step is shown AND the Pet moves, THE System SHALL keep the Pointer_Bubble positioned near the Pet.
3. IF positioning a Pointer_Bubble near the Pet would place it partly off screen, THEN THE System SHALL adjust its position so the Pointer_Bubble remains fully within the Floating_Pet_Window bounds.
4. THE System SHALL render the Pointer_Bubble using only local resources and inline-styling permitted by the window's existing Content-Security-Policy, introducing no inline scripts or remote resources.

### Requirement 4: Let the user advance and skip the tour

**User Story:** As a user, I want to move through the tour at my own pace and skip it whenever I like, so that it never gets in my way.

#### Acceptance Criteria

1. WHILE a Tour_Step other than the last is shown, THE System SHALL provide an Advance_Control that shows the next Tour_Step.
2. WHEN the user activates the Advance_Control on the last Tour_Step, THE System SHALL end the First_Run_Tour.
3. WHILE any Tour_Step is shown, THE System SHALL provide a Skip_Control that ends the First_Run_Tour immediately without showing the remaining Tour_Steps.
4. WHEN the First_Run_Tour ends by completion or by skipping, THE System SHALL remove all Pointer_Bubbles and Tour controls from the Floating_Pet_Window.
5. THE System SHALL indicate the user's position in the Tour (for example, "Step 2 of 5") on each Tour_Step.

### Requirement 5: Show the tour only once automatically, surviving generations

**User Story:** As a returning user, I want the tour to appear only the first time, so that I am not shown it again on every hatch, revival, or new pet.

#### Acceptance Criteria

1. WHEN the First_Run_Tour ends by completion OR by skipping, THE System SHALL set the Tour_Seen_Flag on the Profile and persist it.
2. WHERE the Tour_Seen_Flag is stored on the Profile, THE System SHALL keep it set across Pet death, revival, retirement, and the hatching of a new-generation egg.
3. WHEN a later egg hatches after the Tour_Seen_Flag is set, THE System SHALL NOT start the First_Run_Tour automatically.
4. WHEN the application restarts after the Tour_Seen_Flag has been set, THE System SHALL treat the Tour as already seen and SHALL NOT start it automatically.
5. IF the application exits while the First_Run_Tour is in progress AND the Tour_Seen_Flag has not yet been set, THEN on the next First_Hatch condition THE System MAY start the First_Run_Tour again, since it was never completed or skipped.

### Requirement 6: Replay the tour from Settings

**User Story:** As a user, I want to replay the tour whenever I want, so that I can refresh my memory of how the pet works.

#### Acceptance Criteria

1. THE Hub's Settings tab SHALL include a Replay_Control that starts the First_Run_Tour.
2. WHEN the user activates the Replay_Control, THE System SHALL start the First_Run_Tour in the Floating_Pet_Window regardless of whether the Tour_Seen_Flag is set.
3. WHEN a replayed First_Run_Tour ends by completion or by skipping, THE System SHALL keep the Tour_Seen_Flag set so that the Tour still does not appear automatically afterward.
4. IF a First_Run_Tour is already in progress WHEN the Replay_Control is activated, THEN THE System SHALL restart the Tour from its first Tour_Step rather than starting a second concurrent Tour.

### Requirement 7: Do not interfere with focus, clicks, or notifications

**User Story:** As a user, I want the tour to stay out of my way, so that it never grabs my keyboard, blocks my clicks, or spams notifications.

#### Acceptance Criteria

1. WHILE the First_Run_Tour is shown, THE Floating_Pet_Window SHALL remain non-focusable and SHALL NOT steal keyboard focus from the user's other applications.
2. WHILE the First_Run_Tour is shown, THE System SHALL NOT block mouse clicks outside the Pet's body and the Tour's own interactive controls.
3. WHEN the First_Run_Tour starts, advances, ends, or is skipped, THE System SHALL NOT fire any Mac notification.
4. WHILE a demo (Demo_Mode) is playing, THE System SHALL NOT start the First_Run_Tour.
