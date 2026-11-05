# Implementation Plan: Kiro Feeds Pet

## Overview

The feature is built in three thin layers over logic that already exists. First, two
**Feed_Server routes** are added to `main.js` — `GET /tasks` and `GET /task/done` — each
delegating to the already-tested `T.openTasks()` and `completeTask()` so an agent
completion behaves exactly like finishing a task in the app. Second, a standalone
**MCP_Server** (`mcp/server.js`) speaks newline-delimited JSON-RPC 2.0 over stdio and
exposes three tools, each a single `http.get` to the Feed_Server, with friendly errors
when the app is down. Third, a **Kiro hook** runs `npm test` on the `Stop` trigger and
feeds the pet on success.

No new logic enters `src/`, so there are no new pure functions to property-test; the work
is server plumbing plus an MCP adapter, verified with a stdio smoke check against a
stubbed Feed_Server.

## Tasks

- [x] 1. Extend and harden the Feed_Server with task routes
  - [x] 1.1 Add `GET /tasks` and `POST /task/done` in `main.js`
    - In `startFeedServer()`, after the `/status` branch, add `/tasks` returning a JSON array of `T.openTasks(tasks)` mapped to `{ id, title, size, due, source }`.
    - Add `/task/done` (POST only) reading `id` from the query: no id → `400 missing id`; call `completeTask(id)`; null result → `404` `{ ok: false, error }`; success → `200` `{ ok: true, id, title, size }`.
    - Leave the existing `/feed` and `/status` branches untouched (both GET).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 2.3_

  - [x] 1.2 Guard the server with a pure `src/feed-guard.js`
    - Reject any request carrying an `Origin` header with HTTP 403, and reject non-POST requests to `/task/done` with HTTP 405, before any route runs.
    - Keep the listener bound to `127.0.0.1`.
    - Cover the guard and the wire behavior in `test/feed-server.test.js`.
    - _Requirements: 3.5, 6.1, 6.2, 6.3_

- [x] 2. Build the MCP server
  - [x] 2.1 Implement the Feed_Server client and the three tools in `mcp/server.js`
    - Add `request(pathname)` using `http.get` to `BYTEPET_HOST`/`BYTEPET_PORT` (default `127.0.0.1:47777`), JSON-parsing the reply and rejecting with a friendly message on `ECONNREFUSED`/timeout.
    - Define `TOOLS` with `get_pet_status` (no args), `list_open_tasks` (no args) and `complete_task` (required string `id`), each with a JSON input schema.
    - Implement `callTool`: status → `GET /status`; tasks → `GET /tasks`; complete → `POST /task/done?id=`, erroring when `id` is missing.
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.4, 2.6, 5.1, 5.2, 5.3_

  - [x] 2.2 Implement the JSON-RPC/stdio transport
    - Read newline-delimited JSON from stdin, handle `initialize`, `tools/list`, `tools/call` and the `notifications/initialized` notification.
    - For `tools/call`, return tool failures as a result with `isError: true` and readable text (app-not-running, unknown id) rather than a transport error.
    - _Requirements: 1.4, 2.5, 4.4_

- [x] 3. Register the MCP server and the hook
  - [x] 3.1 Add `.kiro/settings/mcp.json`
    - Register server `bytepet` with `command: node`, `args: ["mcp/server.js"]`, `disabled: false`, and `autoApprove` for the two read-only tools only.
    - _Requirements: 1.1, 2.1_
    - Note: `.kiro/settings/mcp.json` is write-protected in this environment; the config is documented in the design and README for the user to apply via the MCP UI.

  - [x] 3.2 Add the Green_Tests_Hook
    - Create `.kiro/hooks/feed-pet-on-green-tests.json`: a `Stop` trigger, `command` action running `npm test` and, on success, curling `/feed?type=task&size=M`, with `|| true` and a short curl timeout so a failed/absent app never blocks the session.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Verify end to end
  - [x] 4.1 Stdio smoke check against a stubbed Feed_Server
    - Stub the Feed_Server on a spare port; drive the MCP_Server through `initialize` → `tools/list` → each `tools/call`; assert the handshake, three advertised tools, and each tool's result text. Confirm `npm test` still passes.
    - _Requirements: 1.2, 2.1, 2.3, 2.4_

- [x] 5. Document it in the README
  - [x] 5.1 Describe the MCP server and hook under "Built with Kiro"
    - Add a short subsection covering the MCP tools, the `.kiro/settings/mcp.json` snippet, and the green-tests hook.
    - _Requirements: all_

## Notes

- All pet rules stay in `src/`; this feature adds none. The feed-server guard is a pure module (`src/feed-guard.js`) and is covered by `test/feed-server.test.js`, which is part of the committed `npm test` suite.
- `complete_task` mutates state and is therefore excluded from `autoApprove`, and the route is POST-only so a prefetch/GET can't trigger it.
