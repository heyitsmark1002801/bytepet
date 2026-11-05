# Requirements Document

## Introduction

Bytepet is an Electron desktop pet. Pure pet logic in `src/pet-state.js` emits event strings that the main process forwards to the renderer, which already plays visual effects per event type in `renderer/renderer.js`. This feature adds optional retro-style sound effects: short synthesized beeps that accompany six pet events (hungry, sick, evolving, dying, reviving, and the basket catch). Sounds are generated entirely with the Web Audio API — oscillators and gain nodes — so no audio files are bundled or loaded.

A new boolean setting (`sounds`, default on) controls whether sounds play, following the same pattern as the existing `notifications` and `toasts` settings. The setting is exposed in the setup/settings window as a toggle. Sounds are suppressed during quiet hours, mirroring how the renderer already gates speech bubbles with the `S.quiet` flag.

## Glossary

- **Sound_Engine**: The renderer-side module that synthesizes and plays short beeps using the Web Audio API.
- **Renderer**: The Bytepet renderer process (`renderer/renderer.js`) that receives pet events and state snapshots from the main process and produces on-screen effects.
- **Main_Process**: The Electron main process (`main.js`) that owns settings, persists them to `settings.json`, and sends events and state snapshots to the Renderer.
- **Setup_Window**: The setup/settings UI (`renderer/setup.html`, `renderer/setup.js`) where the user configures toggles.
- **Pet_Event**: An event string emitted by pet logic and forwarded to the Renderer via `api.onEvent`. Relevant values: `call-hungry`, `got-sick`, `evolved`, `died`, `revived`, `basket`.
- **Sound_Event**: One of the six Pet_Events that this feature maps to a beep: hungry (`call-hungry`), sick (`got-sick`), evolving (`evolved`), dying (`died`), reviving (`revived`), basket (`basket`).
- **Sounds_Setting**: The boolean setting named `sounds` in the Main_Process settings, default `true`, persisted to `settings.json`.
- **Sounds_Toggle**: The on/off checkbox control in the Setup_Window bound to the Sounds_Setting.
- **Quiet_Flag**: The `S.quiet` boolean field in the state snapshot sent to the Renderer, computed in the Main_Process as `settings.quiet || inMeeting`.
- **State_Snapshot**: The state object the Main_Process sends to the Renderer via `api.onState`, which includes the Quiet_Flag.

## Requirements

### Requirement 1: Synthesize retro beeps with the Web Audio API

**User Story:** As a desktop pet owner, I want sound effects generated in software, so that no audio files are bundled with the app.

#### Acceptance Criteria

1. WHEN the Sound_Engine plays a beep, THE Sound_Engine SHALL generate the tone using one or more Web Audio API oscillator nodes routed through one or more gain nodes.
2. WHEN the Sound_Engine plays a beep, THE Sound_Engine SHALL play the beep for a duration between 80 and 400 milliseconds inclusive.
3. WHEN the Sound_Engine plays a beep, THE Sound_Engine SHALL apply a gain envelope that ramps the gain to 0 before the beep ends so that playback stops without an audible click.
4. THE Sound_Engine SHALL reference zero external audio files and load zero audio files at startup or during playback.
5. IF the Web Audio API is unavailable or the audio context cannot be created, THEN THE Sound_Engine SHALL skip playback and continue operating without producing an error that interrupts the application.

### Requirement 2: Play a distinct beep for each sound event

**User Story:** As a desktop pet owner, I want a recognizable beep for each important pet event, so that I can tell events apart by ear.

#### Acceptance Criteria

1. WHEN the Renderer receives the `call-hungry` Pet_Event, THE Sound_Engine SHALL begin playing the hungry beep within 100 ms of event receipt.
2. WHEN the Renderer receives the `got-sick` Pet_Event, THE Sound_Engine SHALL begin playing the sick beep within 100 ms of event receipt.
3. WHEN the Renderer receives the `evolved` Pet_Event, THE Sound_Engine SHALL begin playing the evolving beep within 100 ms of event receipt.
4. WHEN the Renderer receives the `died` Pet_Event, THE Sound_Engine SHALL begin playing the dying beep within 100 ms of event receipt.
5. WHEN the Renderer receives the `revived` Pet_Event, THE Sound_Engine SHALL begin playing the reviving beep within 100 ms of event receipt.
6. WHEN the Renderer receives the `basket` Pet_Event, THE Sound_Engine SHALL begin playing the basket beep within 100 ms of event receipt.
7. THE Sound_Engine SHALL assign each of the six Sound_Events a beep that differs from every other assigned beep by at least one of the following: a base frequency differing by at least 20 Hz, a total duration differing by at least 40 ms, or a different count of distinct tones.
8. IF the Renderer receives a Pet_Event that is not one of the six Sound_Events, THEN THE Sound_Engine SHALL play no beep.
9. IF the Renderer receives a Sound_Event while a beep is currently playing, THEN THE Sound_Engine SHALL stop the currently playing beep and begin playing the newly received event's beep within 100 ms of event receipt.

### Requirement 3: Respect the sounds on/off setting

**User Story:** As a desktop pet owner, I want to turn sounds off, so that my pet stays silent when I prefer no audio.

#### Acceptance Criteria

1. THE Main_Process SHALL define the Sounds_Setting as a boolean with a default value of `true`.
2. WHEN settings are loaded and no stored value for the Sounds_Setting exists, THE Main_Process SHALL use the value `true`.
3. IF settings are loaded and the stored Sounds_Setting value is missing a boolean type or is otherwise unreadable, THEN THE Main_Process SHALL use the value `true` and SHALL leave any other loaded settings unchanged.
4. WHEN the Main_Process builds the State_Snapshot sent to the Renderer, THE Main_Process SHALL include the current Sounds_Setting value in that State_Snapshot.
5. WHILE the Sounds_Setting value is `false`, THE Sound_Engine SHALL play no beep for any Sound_Event.
6. WHILE the Sounds_Setting value is `true`, THE Sound_Engine SHALL play the mapped beep for each Sound_Event, subject to the quiet-hours rule in Requirement 4.
7. WHEN the Sounds_Setting value changes at runtime, THE Sound_Engine SHALL apply the new value to every Sound_Event that occurs after the change completes.

### Requirement 4: Suppress sounds during quiet hours

**User Story:** As a desktop pet owner, I want sounds silenced during quiet hours, so that my pet does not make noise at night or during meetings.

#### Acceptance Criteria

1. WHILE the Quiet_Flag in the most recently received State_Snapshot is `true`, THE Sound_Engine SHALL play no beep for any Sound_Event, regardless of the Sounds_Setting value.
2. WHILE the Quiet_Flag in the most recently received State_Snapshot is `false` AND the Sounds_Setting value is `true`, WHEN the Renderer receives a Sound_Event, THE Sound_Engine SHALL begin playing the mapped beep within 100 ms of event receipt.
3. WHILE the Quiet_Flag in the most recently received State_Snapshot is `false` AND the Sounds_Setting value is `false`, THE Sound_Engine SHALL play no beep for any Sound_Event.
4. IF the Renderer has not yet received any State_Snapshot when a Sound_Event occurs, THEN THE Sound_Engine SHALL play no beep for that Sound_Event.

### Requirement 5: Configure sounds in the setup window

**User Story:** As a desktop pet owner, I want a sounds toggle in settings, so that I can turn sound effects on or off.

#### Acceptance Criteria

1. THE Setup_Window SHALL display the Sounds_Toggle as a checkbox control accompanied by a visible text label identifying it as the sound-effects setting.
2. WHEN the Setup_Window loads and a stored Sounds_Setting value exists, THE Setup_Window SHALL set the Sounds_Toggle to the checked state when the value is on and to the unchecked state when the value is off.
3. IF the Setup_Window loads and no stored Sounds_Setting value exists, THEN THE Setup_Window SHALL set the Sounds_Toggle to the on state.
4. WHEN the user confirms the final setup step, THE Setup_Window SHALL submit the Sounds_Setting value as on when the Sounds_Toggle is checked and as off when it is unchecked.
5. WHEN the Main_Process receives a submitted Sounds_Setting value, THE Main_Process SHALL persist the value to the `settings.json` file.
6. IF persisting the Sounds_Setting value to the `settings.json` file fails, THEN THE Main_Process SHALL leave the previously stored `settings.json` contents unchanged.
