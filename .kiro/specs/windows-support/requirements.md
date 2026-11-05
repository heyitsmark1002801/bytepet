# Requirements Document

## Introduction

Bytepet is a desktop virtual pet whose care is driven by the user's real work habits. Today it runs on macOS only. Every place the app turns the computer's state into pet behaviour — the frontmost app, what else is running, the active browser tab, every open tab, software updates, battery and digital mess — is implemented with Mac-only mechanisms (JXA, AppleScript, `defaults`, `pmset`, `softwareupdate`, and Mac filesystem paths), guarded today by a single `IS_MAC = process.platform === 'darwin'` check. On any non-Mac platform these functions already fall back to neutral values, so Bytepet technically launches on Windows but is inert: it can see nothing about your work, so nothing feeds, cheers, scolds or heals the pet.

This feature makes Bytepet a first-class Windows application alongside macOS, without changing a single behaviour on the Mac. It introduces a **platform layer** — `src/platform/index.js` picks `src/platform/mac.js` or `src/platform/win.js` based on `process.platform` — behind which all OS-specific system reads live, exposed through one stable set of functions (`frontApp`, `runningApps`, `browserTabs`, `closeTabs`, `hideApp`, `pendingUpdates`, `messCounts`, and the small helpers they need). The existing Mac implementation moves into `mac.js` unchanged in behaviour; a new `win.js` implements the same contract for Windows using what Windows can offer: active-window and process reporting (via an npm package that works on both platforms, or PowerShell), browser **window-title** matching instead of per-tab AppleScript, **minimising** a distracting window instead of closing tabs during strict focus, Windows Update via PowerShell, and Desktop/Downloads/Recycle Bin mess counts. Charging/battery state and screen lock come from Electron's `powerMonitor` on both platforms.

Every platform function must **fail safely**: on any error, timeout, or missing capability it returns a neutral value (empty list, `null`, `0`, or `false`) and never throws or crashes the app — so a pet on Windows is never wrongly starved, made sick, or scolded because a check could not run.

The feature also adds Windows **packaging** (an electron-builder NSIS `.exe` target and a `build:win` script, plus a GitHub Actions workflow that builds the `.exe` on a Windows runner and attaches it to releases), **tests** that run on the maintainer's Mac (the platform picker and the Windows parsing functions, fed sample command output), and **README** updates (Windows install steps and a short "differences on Windows" list). All project steering rules are preserved: the app code keeps **no build step** (the platform layer is plain `require()`-able JS, the only build step is packaging the installer), game logic in `src/` stays pure (the platform layer, like today's `src/system.js`, is the one sanctioned place that shells out and must never import Electron), and every logic change ships with a test that keeps `npm test` green.

## Glossary

- **System**: the Bytepet application, comprising the Electron main process (`main.js`) and the renderer (`renderer/`).
- **Platform_Layer**: the new module set `src/platform/index.js` + `src/platform/mac.js` + `src/platform/win.js` that encapsulates all OS-specific system reads behind one stable function contract.
- **Platform_Picker**: `src/platform/index.js`, which selects the Mac or Windows implementation based on the current `process.platform` and re-exports the Platform_Contract.
- **Platform_Contract**: the fixed set of functions and their argument and return shapes that both `mac.js` and `win.js` implement (defined in the requirements below): `frontApp`, `runningApps`, `browserTabs`, `closeTabs`, `hideApp`, `pendingUpdates`, `messCounts`, and the supporting helpers currently in `src/system.js`.
- **Mac_Impl**: `src/platform/mac.js`, the macOS implementation of the Platform_Contract, carrying today's `src/system.js` / `main.js` Mac behaviour unchanged.
- **Win_Impl**: `src/platform/win.js`, the Windows implementation of the Platform_Contract.
- **Mac_Behaviour**: the complete observable behaviour of Bytepet on macOS as it exists before this feature.
- **Front_App**: the application currently in the foreground, reported as `{ name, bundlePath, category, self }` (on Windows `bundlePath` is the executable path and `category` may be `null`).
- **Running_Apps**: the list of applications currently running, each `{ name, bundlePath, policy }` (on Windows `bundlePath` is the executable path; `policy` defaults to `0`).
- **Browser_Tabs**: the information Bytepet reads from browsers — on macOS the active tab's site and title plus every open tab's site and title; on Windows the browser **window titles** matched against the distracting-sites and keyword lists.
- **Strict_Focus**: the focus-session feature that, when a distraction is detected, hides distracting apps and (on macOS) closes and saves distracting browser tabs. On Windows it minimises the distracting window instead.
- **Pending_Updates**: the list (or count) of operating-system updates waiting to be installed, which make the pet sick ("medicine").
- **Mess_Counts**: the counts of items in watched locations (Desktop, Downloads, Trash/Recycle Bin) and open browser tabs, used to produce digital "mess" (poop).
- **Power_State**: battery/charging status and screen-lock/suspend events, sourced from Electron's `powerMonitor` on both platforms.
- **Neutral_Value**: the safe fallback a Platform_Contract function returns when it cannot produce real data — an empty array, `null`, `0`, or `false`, chosen per function so the pet is never wrongly harmed.
- **Distraction_Rules**: the pure matching logic in `src/distraction.js` (`decide`, `decideBackground`, `siteIn`, `categoryKind`, …) that both platforms feed.
- **Windows_Installer**: the packaged Windows artifact — an NSIS `.exe` produced by electron-builder.
- **Build_Win_Script**: the `build:win` npm script that produces the Windows_Installer.
- **Release_Workflow**: the GitHub Actions workflow that builds the Windows_Installer on a Windows runner and attaches it to a GitHub release.
- **Parsing_Function**: a pure function in Win_Impl that turns raw command output (e.g. PowerShell or an active-window package's result) into a Platform_Contract return shape, testable on any platform by feeding it sample output.
- **Floating_Pet_Window**: the transparent, always-on-top, non-focusable, click-through window (`renderer/renderer.js`) that displays the pet, configured with `setIgnoreMouseEvents(true, { forward: true })`.
- **Work_Area**: the usable screen rectangle excluding the OS taskbar/dock, obtained from Electron's `screen` API (`workArea` / `workAreaSize`), used to position the pet's floor above the taskbar on any edge and on multiple monitors.
- **Tray**: the menu-bar/system-tray icon and its right-click menu.
- **Hub_Window**: the Tasks/Hub window (`renderer/hub.js`, `renderer/tasks.js`).
- **Setup_Window**: the first-run setup window (`renderer/setup.js` / `setup.html`).
- **App_User_Model_Id**: the Windows Application User Model ID set via Electron so that Windows toast notifications are attributed to Bytepet.
- **Feed_Server**: the on-device local HTTP server (`127.0.0.1:47777`) that git commits and other tools use to reward the pet.
- **MCP_Server**: the Model Context Protocol server (`mcp/server.js`) that lets Kiro read pet status and complete tasks over the Feed_Server.
- **Demo_Mode**: the presentation mode (`src/demo-script.js`) that scripts the pet through states without reading the real system.
- **User_Data_Dir**: Electron's per-user data directory (`app.getPath('userData')`) where save files (pet, tasks, settings, profile, logs) live on both platforms.

## Requirements

### Requirement 1: Introduce a platform layer that picks the implementation at runtime

**User Story:** As a maintainer, I want all OS-specific system reads behind one platform layer that picks the right implementation automatically, so that Mac and Windows behaviour live in separate, testable modules without scattering `process.platform` checks through the codebase.

#### Acceptance Criteria

1. THE System SHALL provide a Platform_Layer consisting of `src/platform/index.js` (the Platform_Picker), `src/platform/mac.js` (Mac_Impl), and `src/platform/win.js` (Win_Impl).
2. WHEN the Platform_Picker is loaded on a platform whose `process.platform` is `'darwin'`, THE Platform_Picker SHALL expose the Mac_Impl's implementation of the Platform_Contract.
3. WHEN the Platform_Picker is loaded on a platform whose `process.platform` is `'win32'`, THE Platform_Picker SHALL expose the Win_Impl's implementation of the Platform_Contract.
4. WHEN the Platform_Picker is loaded on any other platform, THE Platform_Picker SHALL expose an implementation of the Platform_Contract whose every function returns its Neutral_Value, so the app runs inertly rather than crashing.
5. THE Platform_Picker SHALL allow the selecting platform to be supplied explicitly (e.g. as an argument or factory parameter) so that tests can exercise the Mac and Windows selection paths on any host operating system.
6. THE Platform_Picker and both implementations SHALL expose the same function names and the same argument and return shapes, so that `main.js` calls one stable contract regardless of platform.
7. NO file under `src/` (including the Platform_Layer) SHALL import Electron; the Platform_Layer MAY use Node built-ins and child-process calls and MAY receive Electron-provided values (such as `powerMonitor`) as function arguments, mirroring how `src/system.js` receives `powerMonitor` today.

### Requirement 2: Move all Mac-specific system reads into the Mac implementation without changing Mac behaviour

**User Story:** As a Mac user, I want nothing about my pet to change when the platform layer is introduced, so that the Windows work carries zero risk to the existing experience.

#### Acceptance Criteria

1. THE Mac_Impl SHALL implement every Platform_Contract function using the same mechanisms the app uses today (JXA/AppleScript via `osascript`, `pgrep`, `ps`, `pmset`, `softwareupdate`, `defaults`, and Mac filesystem paths such as `~/Desktop`, `~/Downloads`, `~/.Trash`).
2. THE Mac_Impl SHALL preserve the existing return shapes exactly: Front_App as `{ name, bundlePath, category, self }`; Running_Apps as `[{ name, bundlePath, policy }]`; the active tab as `{ site, title }`; every-tab reads as `[{ browser, site, title }]`; `frontWindowTitle` as a string or `null`; `hideApp` as a boolean; `closeTabs` as `[{ url, title }]`; `battery` as `{ percent, pluggedIn, charging, onBattery }` or `null`; Mess_Counts as `[{ kind, label, count, limit }]`; `appInfo` as `{ category, agent }`; Pending_Updates as a string array or `null`; and `musicPlaying` as a boolean.
3. WHEN Bytepet runs on macOS after this change, THE System SHALL produce the same Mac_Behaviour for frontmost-app detection, running-app scanning, active-tab and every-tab reading, strict-focus hiding and tab-closing, software-update ("medicine") detection, digital-mess detection, battery/charging reaction, music detection, and permission handling, as before this change.
4. THE Mac_Impl SHALL preserve the existing per-app and per-browser caching and back-off behaviour (e.g. the Accessibility-denied and browser-denied back-off windows, and the app-info cache) so that CPU and permission-prompt behaviour on the Mac is unchanged.
5. WHEN all Mac-specific reads have moved into the Mac_Impl, THE System SHALL route `main.js`'s system reads through the Platform_Layer rather than calling Mac mechanisms directly, and the existing Mac-shaped parser tests (`parseRunningApps`, `parseWorkspaceApps`) SHALL continue to pass unchanged.
6. THE maintainer SHALL verify that Mac_Behaviour is unchanged by running the full `npm test` suite immediately before and immediately after the move and confirming both runs pass with zero failures, and the design SHALL list every function that moved into the Mac_Impl.

### Requirement 3: Detect the foreground app and running apps on Windows

**User Story:** As a Windows user, I want Bytepet to know which app I am using and what else is running, so that working feeds my pet and distracting apps are noticed just like on a Mac.

#### Acceptance Criteria

1. THE Win_Impl SHALL implement `frontApp()` returning Front_App as `{ name, bundlePath, category, self }`, where `name` is the foreground application's name, `bundlePath` is its executable path, `category` is `null` when Windows exposes no equivalent, and `self` is `true` when the foreground window belongs to Bytepet itself.
2. THE Win_Impl SHALL implement `runningApps()` returning Running_Apps as `[{ name, bundlePath, policy }]`, where `bundlePath` is each process's executable path and `policy` is `0` unless a meaningful Windows equivalent is available.
3. THE Win_Impl SHALL obtain foreground-window and running-process information either from an npm package that reports the active window and process list and that supports both macOS and Windows, OR from PowerShell, choosing a mechanism that does not require administrator privileges.
4. WHERE the active-window/process mechanism is an npm package, THE System SHALL add it to `package.json` dependencies pinned to an exact version, and the package SHALL not change Mac_Behaviour (the Mac_Impl SHALL continue to use the existing Mac mechanisms unless deliberately switched).
5. THE Win_Impl SHALL produce `name`, `bundlePath`, and `self` values shaped so that the existing Distraction_Rules (`decide`, `decideBackground`, matching against work-app, distraction-app, and never-distracting lists) work without changes to `src/distraction.js`.
6. IF the foreground-app or running-app read fails, times out, or returns nothing, THEN THE Win_Impl SHALL return the Neutral_Value (`frontApp()` → an object whose `name` is `null`; `runningApps()` → an empty array) and SHALL NOT throw.

### Requirement 4: Read browser activity on Windows from window titles

**User Story:** As a Windows user, I want Bytepet to notice when I am on a distracting website, so that it reacts to distracting sites even though Windows has no AppleScript to read browser tabs.

#### Acceptance Criteria

1. THE Win_Impl SHALL determine browser distraction by reading browser **window titles** and matching them against the user's distracting-sites list and distraction keywords, since per-tab URL reading via AppleScript is not available on Windows.
2. THE Win_Impl SHALL expose the Platform_Contract's browser-reading functions such that, for a browser window whose title matches a distracting site or keyword, the data handed to the Distraction_Rules causes that browser to be treated as distracting.
3. WHEN a browser window title matches a learning keyword as well as a distracting site or keyword, THE System SHALL apply the same learning exemption on Windows that it applies on macOS (the match does not count as a distraction).
4. THE Win_Impl's title-matching SHALL reuse the pure matching logic in `src/distraction.js` (e.g. `siteIn`, keyword/title matching) rather than re-implementing site or keyword matching, so Mac and Windows share one definition of "distracting".
5. WHERE Windows cannot resolve a browser window's title to a specific tab URL, THE System SHALL rely on title matching only and SHALL NOT fabricate a `site` value that could cause a false distraction.
6. IF reading browser window titles fails, times out, or returns nothing, THEN THE Win_Impl SHALL return the Neutral_Value (no browser distraction detected) and SHALL NOT throw.

### Requirement 5: Strict focus minimises the distracting window on Windows

**User Story:** As a Windows user in a focus session, I want Bytepet to get the distraction out of my way, so that strict focus still helps me even though it cannot close individual browser tabs.

#### Acceptance Criteria

1. WHEN Strict_Focus is active AND a distracting app or browser window is detected on Windows, THE Win_Impl SHALL minimise the distracting window rather than closing browser tabs.
2. THE Win_Impl SHALL implement `hideApp()` so that, on Windows, it minimises (or hides) the target application's window and reports success as a boolean, matching the Platform_Contract shape.
3. THE Win_Impl SHALL implement `closeTabs()` as a no-op that returns an empty array on Windows, since there are no closed-and-saved tabs to reopen, so that `main.js`'s saved-tabs handling receives a valid empty result.
4. WHEN running on Windows, THE Hub's Settings SHALL explain that Strict_Focus minimises the distracting window instead of closing and saving tabs, so the user understands the platform difference.
5. THE System SHALL keep the macOS Strict_Focus behaviour (hiding apps, closing and saving distracting tabs, and the "Reopen saved tabs" flow) unchanged.
6. IF minimising a distracting window fails or times out, THEN THE Win_Impl SHALL return `false` (or an empty array for `closeTabs`) and SHALL NOT throw.

### Requirement 6: Detect pending OS updates on Windows safely

**User Story:** As a Windows user, I want my pet to get "sick" only when real system updates are actually waiting, so that it is never wrongly made sick by a check that failed.

#### Acceptance Criteria

1. THE Win_Impl SHALL implement `pendingUpdates()` by querying Windows Update via PowerShell and returning the list (or count) of waiting updates in the Platform_Contract's shape.
2. IF the Windows Update query fails, times out, is unavailable, or produces output that cannot be parsed, THEN THE Win_Impl SHALL return a result equivalent to **zero** pending updates, so that the pet is never wrongly made sick.
3. THE System SHALL treat the Windows "zero updates on failure" result as equivalent to the Mac behaviour where an unknown update state does not sicken the pet.
4. WHEN Pending_Updates on Windows transitions from some waiting updates to zero, THE System SHALL cure the pet's sickness using the same "medicine" logic it uses on macOS.
5. THE Win_Impl SHALL not require administrator privileges to perform the update check, and SHALL return the zero-updates result rather than failing if elevation would be required.

### Requirement 7: Count digital mess on Windows

**User Story:** As a Windows user, I want a cluttered Desktop, Downloads folder, or Recycle Bin to make my pet poop, so that the digital-mess feature works the same way it does on a Mac.

#### Acceptance Criteria

1. THE Win_Impl SHALL implement `messCounts()` returning Mess_Counts as `[{ kind, label, count, limit }]` for the piles that exceed their limits, matching the Platform_Contract shape consumed by the pet-state mess rules.
2. THE Win_Impl SHALL count Desktop and Downloads items using `os.homedir()`-based paths appropriate to Windows.
3. THE Win_Impl SHALL count Recycle Bin items via PowerShell.
4. THE Win_Impl SHALL include a browser-tabs mess count only to the extent Windows can provide one; WHERE per-tab counts are unavailable on Windows, THE System SHALL omit the tabs pile rather than reporting a wrong count.
5. IF counting any individual pile (Desktop, Downloads, Recycle Bin, or tabs) fails or times out, THEN THE Win_Impl SHALL skip only that pile, still return the piles it could count, and SHALL NOT throw.
6. WHEN the user clicks a Windows mess pile to clean it up, THE System SHALL open the corresponding Windows location (Desktop or Downloads folder, or the Recycle Bin) where such a location exists.

### Requirement 8: Source charging, battery, and screen-lock state from powerMonitor on both platforms

**User Story:** As a user on either platform, I want battery, charging, and away/asleep detection to work, so that my pet gets tired on battery, perks up when charging, and sleeps when I lock the screen.

#### Acceptance Criteria

1. THE System SHALL derive charging/battery Power_State from Electron's `powerMonitor` on both macOS and Windows for the purpose of the pet's charging and low-battery reactions.
2. THE System SHALL derive screen-lock, unlock, suspend, and resume events from Electron's `powerMonitor` on both macOS and Windows, as it already does for lock handling today.
3. WHERE a device has no battery (a desktop), THE System SHALL treat it as plugged in on both platforms, preserving the existing "desktops count as plugged in" behaviour.
4. WHEN this feature changes how charging/battery state is obtained, THE System SHALL keep the resulting Mac_Behaviour for the charging, low-battery, and sleep reactions observably the same as before.
5. IF `powerMonitor` cannot report battery state on a given platform, THEN THE System SHALL fall back to treating the device as plugged in (a Neutral_Value that does not wrongly tire the pet).

### Requirement 9: Every platform function fails safely

**User Story:** As a user on any platform, I want a failed system check to leave my pet unharmed, so that a missing permission, a slow command, or an unsupported capability never starves, sickens, scolds, or crashes my pet.

#### Acceptance Criteria

1. EACH Platform_Contract function SHALL, on any error, exception, timeout, missing capability, or unparseable output, return its defined Neutral_Value rather than throwing.
2. THE Neutral_Value for each function SHALL be the one that cannot harm the pet: `runningApps()` → `[]`; `frontApp()` → an object with `name: null`; `browserTabs`/every-tab reads → `[]` or `null`; `hideApp`/`closeTabs` success → `false`/`[]`; `pendingUpdates()` → zero updates; `messCounts()` → `[]` (and per-pile failures skipped); `battery` → `null` (treated as plugged in).
3. WHEN a Platform_Contract function returns its Neutral_Value due to failure, THE System SHALL continue running normally and SHALL NOT surface an unhandled exception or crash.
4. THE System SHALL bound each external command (PowerShell, `osascript`, process listing, etc.) with a timeout so that a hung command cannot stall the pet's periodic checks.
5. WHERE a capability is simply unavailable on a platform (for example, per-tab URLs on Windows), THE System SHALL treat its absence as a Neutral_Value and SHALL NOT log it as an error on every check.

### Requirement 10: Package a Windows installer and a build script

**User Story:** As a Windows user, I want a downloadable installer, so that I can install and run Bytepet without building it from source.

#### Acceptance Criteria

1. THE System SHALL add an electron-builder configuration that defines a Windows NSIS `.exe` target, alongside the existing macOS packaging.
2. THE System SHALL add a `build:win` npm script (the Build_Win_Script) that produces the Windows_Installer.
3. THE Windows_Installer SHALL carry the Bytepet product name and application icon.
4. THE addition of electron-builder and the Windows target SHALL NOT introduce a build step for the application's own code: `npm start` SHALL still run the plain source directly, and the only build step SHALL be producing the installer.
5. THE System SHALL keep the existing macOS build (`build:mac`) working as it does today.
6. WHERE electron-builder is added as a dev dependency, THE System SHALL pin it to an exact version.

### Requirement 11: Build and publish the Windows installer from CI

**User Story:** As a maintainer, I want CI to build the Windows installer on a Windows runner and attach it to releases, so that I can ship Windows builds without owning a Windows machine.

#### Acceptance Criteria

1. THE System SHALL add a GitHub Actions workflow (the Release_Workflow) that builds the Windows_Installer on a Windows runner.
2. WHEN a release is created (or the Release_Workflow is otherwise triggered for a release), THE Release_Workflow SHALL run the Build_Win_Script and attach the resulting Windows_Installer to that release.
3. THE Release_Workflow SHALL install dependencies and build on the Windows runner without requiring a Mac-only step.
4. IF the Windows build fails, THEN THE Release_Workflow SHALL fail visibly rather than publishing a missing or empty artifact.

### Requirement 12: Tests for the platform picker and Windows parsing, runnable on the maintainer's Mac

**User Story:** As a maintainer working on a Mac, I want tests that cover the platform picker and the Windows parsing functions without needing a Windows machine, so that I can keep `npm test` green while developing Windows support.

#### Acceptance Criteria

1. THE System SHALL add a test that verifies the Platform_Picker selects the Mac_Impl for `'darwin'`, the Win_Impl for `'win32'`, and a neutral implementation for any other platform, using the explicit-platform selection path so it runs on any host OS.
2. THE System SHALL add tests that feed each Windows Parsing_Function sample command output (for example, sample PowerShell output and sample active-window/process output) and assert it returns the correct Platform_Contract shape, including the Neutral_Value on empty or malformed input.
3. THE System SHALL structure the new tests in the project's existing style — plain Node `assert`, no test framework — and SHALL add any new test file to the `npm test` script so it runs in the suite.
4. WHEN `npm test` is run on macOS, THE whole suite SHALL pass with zero failures, including the existing Mac-shaped parser tests and all pet-state, distraction, and other existing tests.
5. THE Windows Parsing_Functions SHALL be pure (output string in, structured value out) so they are testable without invoking any OS command, and SHALL be exported for the tests to call directly.

### Requirement 13: Document Windows support and the differences

**User Story:** As a prospective Windows user reading the README, I want install steps and a clear list of what works differently on Windows, so that I know how to install it and what to expect.

#### Acceptance Criteria

1. THE README SHALL include Windows install steps covering downloading and running the Windows_Installer from the release, and a note on building or running from source on Windows.
2. THE README SHALL include a short "differences on Windows" list that states at least: browser distraction is detected from window titles rather than per-tab URLs; strict focus minimises the distracting window instead of closing and saving tabs; updates are checked via Windows Update; and mess counting covers Desktop, Downloads, and the Recycle Bin.
3. THE README SHALL preserve the existing macOS instructions.
4. THE updated README SHALL not contradict the steering rules it describes (no build step for the app code, pure logic in `src/`).

### Requirement 14: Preserve the project's steering rules

**User Story:** As the maintainer, I want the Windows work to obey the project's own rules, so that the codebase stays consistent and the existing automation keeps working.

#### Acceptance Criteria

1. THE application's own code SHALL keep running with no build step: the Platform_Layer and all of `src/` SHALL remain plain, directly `require()`-able JavaScript with no transpiler or bundler, the installer packaging being the only build step.
2. ALL game logic in `src/` SHALL remain pure, with the Platform_Layer being the one sanctioned place (as `src/system.js` is today) that performs OS reads, and NO file in `src/` SHALL import Electron.
3. EVERY change to logic in `src/` introduced by this feature SHALL be accompanied by a test, and `npm test` SHALL remain green.
4. THE pet's floating window behaviour SHALL remain unchanged on both platforms: it SHALL stay non-focusable and SHALL NOT block clicks outside its own body.
5. ALL activity tracking SHALL remain on-device on both platforms, with no new outbound network request introduced by the Windows reads (foreground app, running apps, window titles, updates, mess).

### Requirement 15: The floating pet window works on Windows

**User Story:** As a Windows user, I want my pet to float transparently on top of my desktop, stay click-through, and stand on top of the taskbar wherever it is, so that it looks and behaves like it does on a Mac.

#### Acceptance Criteria

1. WHEN Bytepet runs on Windows, THE Floating_Pet_Window SHALL be transparent, always-on-top, non-focusable, and click-through via `setIgnoreMouseEvents(true, { forward: true })`, just as on macOS.
2. THE System SHALL position the pet's floor using the display's Work_Area (from Electron's `screen` API) so that the pet rests on top of the taskbar rather than behind it or overlapping it.
3. WHERE the Windows taskbar is placed on the bottom, top, left, or right edge of a display, THE System SHALL keep the pet's floor aligned to the Work_Area for that edge so the pet is never hidden behind the taskbar.
4. WHERE more than one display is connected, THE System SHALL position the pet within a display's Work_Area and SHALL keep it correctly placed when it is on a non-primary display.
5. WHEN the Work_Area changes (the taskbar moves, auto-hides, or a display is added, removed, or rescaled), THE System SHALL re-derive the pet's floor from the updated Work_Area.
6. THE System SHALL keep the existing macOS floating-window behaviour (transparency, always-on-top, click-through, floor position, and `setVisibleOnAllWorkspaces`) unchanged.

### Requirement 16: Tray, menus, windows, notifications, and login work on Windows

**User Story:** As a Windows user, I want the tray icon, menus, windows, notifications, and open-at-login to work and look right, so that Bytepet is usable without the macOS-only chrome.

#### Acceptance Criteria

1. WHEN Bytepet runs on Windows, THE Tray SHALL use a Windows-appropriate icon (an `.ico`) and SHALL show its right-click menu, with the existing menu actions working.
2. THE System SHALL continue to pick the correct tray asset per platform (the macOS template image on macOS, the Windows icon on Windows) without regressing the Mac tray.
3. WHEN Bytepet runs on Windows, THE Hub_Window and the Setup_Window SHALL open, render correctly, and remain usable.
4. WHEN Bytepet shows a notification on Windows, THE System SHALL use Windows notifications and SHALL set an App_User_Model_Id so the notification is attributed to Bytepet rather than to Electron.
5. WHEN the user enables open-at-login on Windows, THE System SHALL register Bytepet to start at login using the cross-platform Electron login-item API, degrading gracefully where a Mac-only option (such as `openAsHidden`) does not apply.
6. THE System SHALL keep the existing macOS tray, menus, windows, notifications, and open-at-login behaviour unchanged.

### Requirement 17: No Mac-only shell calls or hardcoded paths outside the Mac implementation

**User Story:** As a maintainer, I want all Mac-only shell calls and hardcoded paths confined to the Mac implementation, so that nothing Mac-specific runs on Windows and paths are built portably.

#### Acceptance Criteria

1. THE System SHALL NOT invoke any Mac-only shell command (for example `say`, `open`, `pmset`, `defaults`, `softwareupdate`, `osascript`, `lsappinfo`, `pgrep`, `sips`, `iconutil`) anywhere outside the Mac_Impl (and the Mac-only build script).
2. THE System SHALL build every filesystem path with `path.join` and `os.homedir()` (or Electron path APIs) rather than hardcoded POSIX paths, in all code that runs on both platforms.
3. WHERE a module outside the Platform_Layer previously issued a Mac-only shell call (for example the music check or the `open`-folder behaviour in `main.js`), THE System SHALL route it through the Platform_Layer so the behaviour is platform-appropriate or safely absent on Windows.
4. WHEN Bytepet runs on Windows, THE System SHALL NOT execute any `osascript`, `pmset`, `defaults`, `softwareupdate`, or other Mac-only binary.
5. THE design SHALL identify any such remaining Mac-only calls or paths found in shared code and state how each is moved behind the Platform_Layer or made portable.

### Requirement 18: Shared subsystems keep working unchanged on both platforms

**User Story:** As a user on either platform, I want the feed server, MCP server, demo mode, sounds, and save files to work exactly as before, so that cross-platform support does not regress features that are already platform-neutral.

#### Acceptance Criteria

1. THE Feed_Server SHALL run and behave identically on both platforms, listening on `127.0.0.1:47777` with the same endpoints, the same Origin-header rejection, and the same `POST`-only `/task/done`.
2. THE MCP_Server SHALL work identically on both platforms over the Feed_Server.
3. THE Demo_Mode SHALL work identically on both platforms, scripting the pet without reading the real system, exactly as it does today.
4. THE retro sounds SHALL work identically on both platforms.
5. THE save files (pet, tasks, settings, profile, and logs) SHALL be stored in the User_Data_Dir on both platforms, with no change to their format or location logic beyond Electron's per-platform `userData` resolution.
6. WHEN the test suite runs, THE existing Feed_Server, demo-script, and sounds tests SHALL continue to pass unchanged.

### Requirement 19: Document the Windows SmartScreen step

**User Story:** As a Windows user running the installer for the first time, I want to know how to get past the SmartScreen warning, so that I can run the unsigned installer the same way the README explains Gatekeeper on macOS.

#### Acceptance Criteria

1. THE README SHALL include a first-run step for Windows SmartScreen describing the "More info → Run anyway" path, parallel to the existing macOS Gatekeeper instructions.
2. THE README SHALL place the SmartScreen step with the Windows install steps so a Windows user sees it at the point of first launch.
3. THE README SHALL keep the existing macOS Gatekeeper instructions unchanged.
