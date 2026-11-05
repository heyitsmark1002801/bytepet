# Implementation Plan

Each task is a small, test-backed step. Logic in `src/` ships with a test and `npm test` must stay green. The Mac move is gated by a before/after full-suite run. Tasks marked "no src logic change" don't need a new test but must not break the suite.

- [ ] 1. Record the baseline and add the platform-picker skeleton
  - Run `npm test` and record the passing count as the Mac baseline (Req 2.6).
  - Create `src/platform/index.js` exporting `pick(platform = process.platform)` and `module.exports.forPlatform = pick`; `pick` returns `require('./mac')` for `'darwin'`, `require('./win')` for `'win32'`, else `require('./neutral')`.
  - Create `src/platform/neutral.js` exporting every Platform_Contract function returning its Neutral_Value (`frontApp`→`{name:null,...}`, `runningApps`→`[]`, `battery`→`null`, `pendingUpdates`→`[]`, `messCounts`→`[]`, `hideApp`→`false`, `closeTabs`→`[]`, `musicPlaying`→`false`, `activeTab`/`allTabs`/`browserTabs`→`null`/`[]`, `frontWindowTitle`→`null`, `appInfo`→`{category:null,agent:false}`, `heat`→neutral, and no-op `openMessFolder`/`openUpdates`/`openPane`/`isRunning`→`false`).
  - Create empty `src/platform/mac.js` and `src/platform/win.js` that re-export neutral for now, so the picker loads on any OS.
  - Add `test/platform.test.js` to the `npm test` chain in `package.json`; assert `forPlatform('darwin')`/`'win32'`/`'linux'` return objects exposing the full contract and that the neutral impl returns the documented neutral values.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.2, 12.1, 12.3_

- [ ] 2. Move the macOS system reads into `src/platform/mac.js`
- [ ] 2.1 Move the `src/system.js` functions into `mac.js` and make `src/system.js` a shim
  - Move `run`, `countItems`, `countTabs`, `checkMess`(→`messCounts`), `battery`, `heat`, `frontWindowTitle`, `parseRunningApps`, `parseWorkspaceApps`, `runningApps`, `allTabs`, `hideApp`, `closeTabs`, and their helpers/state (`TAB_BROWSERS`, `TAB_SCRIPTS`, `WORKSPACE_SCRIPT`, `titleDeniedUntil`) into `mac.js` unchanged.
  - Replace `src/system.js` with a thin `module.exports = require('./platform/mac')` style shim (plus the named parser re-exports the tests use) so existing `require('./src/system')` and the `parseRunningApps`/`parseWorkspaceApps` tests keep working unchanged.
  - Run `npm test`; the existing Mac-shaped parser tests must pass unchanged (Req 2.5, 12.4).
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 14.1, 14.2, 17.1_
- [ ] 2.2 Move the Mac reads currently in `main.js` into `mac.js`
  - Move behind the contract: `getFrontAppInfo`(→`frontApp`, with `FRONT_SCRIPT` + lsappinfo fallback + `self`), `appInfo`/`appCategory`(+`appInfoCache`), `getBrowserTab`(→`activeTab`, with `BROWSERS`/`browserDenied`/`browserStatus`), `checkMusic` core (→`musicPlaying(apps)`), `countMacUpdates`+`countBrewUpdates`+`quickUpdateCount`(→`pendingUpdates(settings)` + a `quickUpdateCount` helper), `openSoftwareUpdate`(→`openUpdates`), `openMess` folder paths (→`openMessFolder`), `PANES`+accessibility check (→`permissionPanes`/`openPane`), and the `pgrep` running check (→`isRunning(name)`).
  - Preserve the exact caching/back-off windows (`appInfoCache`, 10-min `browserDenied`, 15-min `titleDeniedUntil`) so Mac CPU and permission prompts are unchanged.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 17.1, 17.3, 17.4_
- [ ] 2.3 Rewire `main.js` to call the contract and verify Mac is unchanged
  - Replace direct Mac calls in `main.js` with `const Platform = require('./src/platform')` calls (`Platform.frontApp()`, `Platform.activeTab()`, `Platform.runningApps()`, `Platform.allTabs()`, `Platform.frontWindowTitle()`, `Platform.hideApp()`, `Platform.closeTabs()`, `Platform.messCounts()`, `Platform.musicPlaying()`, `Platform.pendingUpdates()`, `Platform.openUpdates()`, `Platform.openMessFolder()`, `Platform.openPane()`, `Platform.isRunning()`, `Platform.appInfo()`); keep all orchestration (sampling cadence, focus, medicine watch, mess application) in `main.js`.
  - Confirm no `osascript`/`pmset`/`defaults`/`softwareupdate`/`pgrep`/`lsappinfo`/`x-apple…`/`brew` remains in `main.js`.
  - Run `npm test` and compare to the baseline from task 1: both green, same pass count (Req 2.6). Manually sanity-check the app on macOS (front app, distraction, mess, battery, updates, music) is behaviourally unchanged.
  - _Requirements: 2.3, 2.6, 17.1, 17.4_

- [ ] 3. Battery/charging via powerMonitor on both platforms
  - Change the contract `battery(powerMonitor)` so charging/plugged/onBattery come from `powerMonitor.onBatteryPower` on both platforms; keep Mac's `percent` (and the under-20% low reaction) by reading `pmset` in `mac.js`; Windows `percent` stays `null`.
  - Fall back to "plugged in" when battery state is unavailable (desktops / unsupported), preserving "desktops count as plugged in".
  - Update `main.js` `checkSystem`/`systemView` to the new source; confirm the Mac charging/low/sleep reactions are observably unchanged. Run `npm test`.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 4. Windows pure parsers and name normalisation (test-first, runs on Mac)
  - In `src/platform/win.js` add and export the pure Parsing_Functions: `parseSnapshot(json)`→`{front,apps}`, `frontApp`/`parseFrontApp` selector, `parseRunningApps(json)` (Windows shape `[{name,bundlePath,policy:0}]`), `parseBrowserTitles(...)`→`[{browser,site:null,title}]`, `parseUpdates(out)`→`string[]`, `parseRecycleCount(out)`→number|`null`, and `normalizeName(proc)` (e.g. `chrome`→`Google Chrome`, `msedge`→`Microsoft Edge`).
  - Add the pure reply-framing extractor (accumulate chunks, return JSON block at the sentinel, ignore mismatched request ids).
  - Add tests in `test/platform.test.js` feeding each parser sample output and asserting shapes + neutral fallback on empty/garbage, plus framing with chunked input and stale-id rejection. Run `npm test` (passes on Mac, no PowerShell invoked).
  - _Requirements: 3.1, 3.2, 3.5, 4.1, 4.2, 4.5, 6.1, 7.3, 9.1, 9.2, 12.2, 12.4, 12.5_

- [ ] 5. The persistent PowerShell host in `win.js`
  - Implement the host: lazily spawn `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -` with `{ windowsHide: true }`; on first use send the `Add-Type` user32 P/Invoke and the `Snapshot`/`Minimize` function definitions once.
  - Implement `snapshot()`: write the snapshot command + sentinel, read until the sentinel via the pure framing extractor, `JSON.parse`, return parsed `{front,apps}`; on reply > ~3s, host exit, or parse error, kill+restart the host (with backoff) and return the neutral snapshot.
  - Tear the host down on process exit; never create it on macOS.
  - _Requirements: 3.3, 3.6, 4.6, 9.1, 9.3, 9.4_

- [ ] 6. Wire the Windows contract functions over the host and short-lived calls
  - Frequent (over the cached snapshot): `frontApp()`, `runningApps()`, `frontWindowTitle()`, `browserTabs()`, `activeTab()`→always `null`. Apply `normalizeName` and the `self` check.
  - Strict focus: `hideApp(target)` sends `Minimize` to the host → `ShowWindowAsync(SW_MINIMIZE)`, returns boolean; `closeTabs()`→`[]`.
  - Short-lived `ps(script,timeout)` helper with `{windowsHide:true}`: `pendingUpdates(settings)` (Windows Update COM, returns `[]` on any failure), Recycle-Bin count inside `messCounts(limits)` (Desktop/Downloads via `os.homedir()`, Recycle Bin via COM, tabs pile omitted, per-pile failures skipped), `musicPlaying(apps)` (GSMTC, `false` on failure), `openMessFolder`/`openUpdates`/`openPane` via `shell`/`ms-settings:`.
  - Each wrapper returns its Neutral_Value on any failure. (These run on Windows; verified by the Mac-side parser tests plus manual Windows testing.)
  - _Requirements: 3.1, 3.2, 3.6, 4.1, 4.2, 4.3, 4.6, 5.1, 5.2, 5.3, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 7. Cadence and strict-focus wiring in `main.js`
  - Ensure `pendingUpdates` runs only at startup + hourly (reuse the existing periodic update cadence), never on the 5-second sampler; Recycle Bin count on the existing mess cadence; music on the existing 8s cadence.
  - Tweak `enforceStrict` so on Windows a distracting browser window is minimised via `hideApp` (the `closeTabs` branch returns `[]`); leave the macOS hide+close+save+reopen flow unchanged.
  - Run `npm test`.
  - _Requirements: 5.1, 5.4, 5.5, 6.1, 2.3_

- [ ] 8. Floating pet window on Windows (multi-monitor + taskbar)
  - Keep the transparent/frameless/non-focusable/click-through options and `setIgnoreMouseEvents(true,{forward:true})`; add an explicit window `icon` (`.ico`) on Windows.
  - Generalise `createWindow`/`fit` to size the overlay to the `workArea` of the display the pet is on (not hardcoded primary) and re-fit on `display-metrics-changed`/`display-added`/`display-removed`; keep Mac on the primary display's `workArea`.
  - Verify on Windows: floor sits above the taskbar on bottom/top/left/right, and on a secondary monitor; renderer `floorY()` already follows `innerHeight`.
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [ ] 9. Tray, notifications, and open-at-login on Windows
  - Add `app.setAppUserModelId('com.bytepet.desktop')` early in `whenReady` (before any notification) so Windows toasts are attributed to Bytepet.
  - Ensure the tray uses a Windows `.ico` (keep the Mac `trayTemplate` + `setTemplateImage` branch); verify the right-click menu and the hub/setup windows render on Windows.
  - Branch `setOpenAtLogin`: `openAsHidden:true` on Mac, `args:['--hidden']` on Windows, and read `--hidden` at startup to start hidden; keep `app.getLoginItemSettings`/`setLoginItemSettings` cross-platform.
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

- [ ] 10. Portability cleanup and Settings copy
  - Audit shared code for any remaining Mac-only shell call or hardcoded POSIX path; confirm all paths use `path.join`/`os.homedir()`.
  - Add a Windows-compatible git post-commit hook variant in `connectRepo` (replace the `#!/bin/sh`+`curl` POSIX hook with a Windows-friendly one when on Windows).
  - Add Settings copy (shown on Windows) explaining strict focus minimises the distracting window instead of closing/saving tabs.
  - Run `npm test`.
  - _Requirements: 5.4, 17.1, 17.2, 17.3, 17.5_

- [ ] 11. Verify shared subsystems still pass on both platforms
  - Confirm the feed server, MCP server, demo mode, sounds, and save-file location are untouched and their existing tests (`feed-server`, `demo-script`, `sounds`, settings/setup sound tests) still pass.
  - Run the full `npm test` and confirm zero failures.
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 14.3_

- [ ] 12. Windows packaging
  - Add `electron-builder` as an exact-pinned devDependency and a `build` config with an NSIS `win` target, product name "Bytepet", and a `.ico` icon (generated from `assets/icon.png` or checked in).
  - Add `build:win` → `electron-builder --win --x64`; leave `build:mac` (`@electron/packager`) working; confirm `npm start` still runs source with no app build step.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 14.1_

- [ ] 13. CI release workflow
  - Add `.github/workflows/release-win.yml`: trigger on release published + `workflow_dispatch`, `runs-on: windows-latest`, `actions/setup-node`, `npm ci`, `npm run build:win`, upload the `.exe` to the release; fail the job on build failure so no empty artifact is published.
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 14. README: Windows install, SmartScreen, and differences
  - Add Windows install steps (download/run the installer from the release; running/building from source on Windows) and a SmartScreen "More info → Run anyway" first-run step beside them; keep the macOS Gatekeeper steps unchanged.
  - Add a short "differences on Windows" list: browser distraction from window titles (not per-tab URLs), strict focus minimises instead of closing/saving tabs, updates via Windows Update, mess covers Desktop/Downloads/Recycle Bin.
  - Ensure the README doesn't contradict the no-build-step / pure-`src/` steering rules.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 19.1, 19.2, 19.3_

- [ ] 15. Final full-suite verification
  - Run `npm test` once more; confirm zero failures and that the Mac baseline pass count from task 1 is preserved or exceeded.
  - _Requirements: 2.6, 12.4, 14.3_
