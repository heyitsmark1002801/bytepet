# Requirements Document

## Introduction

Bytepet is a desktop virtual pet whose care is driven by the user's real work habits. This feature adds a **Demo Mode**: a self-contained, ~60-second presentation that plays Bytepet's entire lifecycle on a throwaway pet, intended for judges and short videos. Starting from the menu bar ("▶ Play demo"), the demo walks through egg hatching, feeding from a finished task, distraction-induced sadness, refocus, digital mess with flies, sickness, death into a ghost beside a gravestone, and revival through work. Each step is narrated by a small on-screen caption.

Demo Mode operates on a separate **Demo_Pet** and is strictly isolated from the user's real data: it never persists the demo pet, never modifies the real pet, tasks, or badges, and restores the real pet's display when it ends.

## Glossary

- **System**: the Bytepet application, comprising the Electron main process and the renderer.
- **Real_Pet**: the user's actual pet, stored in `pet.json` and shown whenever Demo_Mode is not running.
- **Demo_Pet**: a pet object created solely for Demo_Mode, held in memory and never written to disk.
- **Demo_Mode**: a presentation mode that plays the full Bytepet lifecycle on a Demo_Pet.
- **Demo_Story**: the scripted, ordered sequence of lifecycle events Demo_Mode plays.
- **Caption**: a short on-screen text label describing the current Demo_Story step.
- **Menu_Bar**: the macOS tray context menu built by the main process.
- **Floating_Pet_Window**: the always-on-top window that displays the pet sprite, meters, and captions.
- **Snapshot**: the state object the main process sends to the renderer to draw the pet.
- **Background_Checks**: the periodic main-process timers (minute tick, distraction sampling, update checks, calendar/Reminders sync) that push Real_Pet state to the renderer.
- **pet-state functions**: the pure functions in `src/pet-state.js` (e.g. `feed`, `setMess`, `setUpdates`, `refocus`, `tickMinute`) that mutate a pet object passed to them.

## Requirements

### Requirement 1: Start Demo Mode from the menu bar

**User Story:** As a presenter, I want to start the demo from the menu bar, so that I can show Bytepet to judges and in videos without setup.

#### Acceptance Criteria

1. WHILE Demo_Mode is not playing, THE Menu_Bar SHALL include a "▶ Play demo" entry that starts Demo_Mode.
2. WHEN the "▶ Play demo" entry is clicked, THE System SHALL create a Demo_Pet and begin the Demo_Story in the Floating_Pet_Window.
3. WHILE Demo_Mode is playing, THE Menu_Bar SHALL change the "▶ Play demo" entry into a stop entry whose label indicates that Demo_Mode is in progress.
4. WHEN the stop entry is clicked, THE System SHALL end Demo_Mode.

### Requirement 2: Isolate the demo from real data

**User Story:** As a user, I want the demo to use a separate pet, so that my real pet, tasks, and badges are never changed by the demo.

#### Acceptance Criteria

1. WHEN Demo_Mode starts, THE System SHALL create a Demo_Pet initialized with default starting state values, without copying any state values from the Real_Pet.
2. WHILE Demo_Mode is playing, THE System SHALL hold the Demo_Pet in memory only, without writing the Demo_Pet to any persistent storage.
3. WHILE Demo_Mode is playing, THE System SHALL leave the Real_Pet, the user's tasks, and the user's profile and achievements unchanged.
4. WHEN Demo_Mode ends, THE System SHALL display the Real_Pet with the same state it had before Demo_Mode started.
5. IF the application exits unexpectedly while Demo_Mode is playing, THEN on the next launch THE System SHALL display the Real_Pet with its pre-demo state.

### Requirement 3: Play the full lifecycle story in order

**User Story:** As a judge, I want to see Bytepet's whole lifecycle in order, so that I understand how the pet is cared for through real work.

#### Acceptance Criteria

1. THE Demo_Story SHALL play the following steps in this order, each step shown in the Floating_Pet_Window:
   1. the egg hatches into a baby — the Demo_Pet is shown as a baby rather than an egg;
   2. finishing a task feeds the Demo_Pet — the Demo_Pet is shown as fed, with its food meter raised;
   3. a distraction makes the Demo_Pet sad — the Demo_Pet is shown as sad;
   4. closing the distraction cheers the Demo_Pet up — the Demo_Pet is shown as no longer sad;
   5. digital mess appears and attracts flies — digital mess and flies are shown around the Demo_Pet;
   6. the Demo_Pet becomes sick — the Demo_Pet is shown as sick;
   7. the Demo_Pet dies and becomes a ghost beside a gravestone — the Demo_Pet is shown as a ghost beside a gravestone;
   8. finishing work revives the Demo_Pet — the Demo_Pet is shown as alive rather than as a ghost.
2. THE System SHALL advance the Demo_Pet through each step by applying pet-state functions to the Demo_Pet.
3. THE Demo_Story SHALL play the eight steps in sequence, establishing each step's effect in the Floating_Pet_Window before advancing to the next step.
4. WHEN step 8 completes, THE Demo_Pet SHALL be alive rather than a ghost, shown in the Floating_Pet_Window as a living pet.

### Requirement 4: Show a caption for each step

**User Story:** As a viewer, I want a small caption for each step, so that I can follow what is happening even without audio.

#### Acceptance Criteria

1. THE System SHALL display a Caption of at most 80 characters for each of the eight Demo_Story steps.
2. WHEN a Demo_Story step begins, THE System SHALL show that step's Caption in the Floating_Pet_Window.
3. EACH Caption SHALL reference both the action of its Demo_Story step and the resulting effect on the Demo_Pet.
4. THE System SHALL display one Caption at a time.

### Requirement 5: Complete within about 60 seconds

**User Story:** As a presenter, I want the demo to last about a minute, so that it fits a quick pitch or video.

#### Acceptance Criteria

1. THE Demo_Story SHALL complete within 90 seconds, where the duration is measured from when the first step begins displaying to when the last step finishes displaying.
2. THE Demo_Story SHALL last at least 45 seconds, where the duration is measured from when the first step begins displaying to when the last step finishes displaying.
3. WHEN a Demo_Story step is displayed, THE Demo_Story SHALL keep that step visible on screen for at least 3 seconds.

### Requirement 6: Keep background checks from interrupting the demo

**User Story:** As a presenter, I want the demo to run without interruption, so that background activity never overwrites the demo or fires notifications.

#### Acceptance Criteria

1. WHILE Demo_Mode is playing, THE System SHALL pause Background_Checks so that no Real_Pet state is pushed to the renderer and no Mac notification is fired as a result of Background_Checks.
2. WHILE Demo_Mode is playing, THE System SHALL present each Demo_Story step through an on-screen Caption in the Floating_Pet_Window and SHALL NOT fire a Mac notification for any Demo_Story step.
3. WHEN Demo_Mode ends, THE System SHALL resume Background_Checks such that subsequent Real_Pet state updates are again pushed to the renderer and Mac notifications are again fired.
