# Requirements Document

## Introduction

Bytepet already runs a tiny on-device HTTP server (`127.0.0.1:47777`, the Feed_Server) so other tools can feed the pet — git's `post-commit` hook curls it on every commit. This feature extends that idea to AI agents: a Model Context Protocol (MCP) server lets Kiro (or any MCP client) see how the pet is doing and reward real work by completing a task, and a Kiro agent hook feeds the pet whenever the test suite passes.

Everything stays on-device. The MCP_Server is a thin client over the existing Feed_Server; it opens no connections beyond localhost and bundles no new runtime dependencies. If the Bytepet app is not running, the tools fail with a clear message rather than crashing the agent.

## Glossary

- **Feed_Server**: The existing local HTTP server in `main.js`, listening on `127.0.0.1:47777`, that rewards the pet and reports its status.
- **MCP_Server**: The new Node stdio server in `mcp/server.js` that exposes Bytepet to MCP clients over JSON-RPC 2.0.
- **MCP_Client**: Any Model Context Protocol client that launches the MCP_Server, e.g. Kiro.
- **Pet_Status**: The pet's current snapshot — name, mood, stage, food units, XP, discipline, care mistakes, current needs, open-task count and alerts — as returned by the Feed_Server `/status` route.
- **Open_Task**: A task that is not done and not dismissed, as computed by `openTasks()` in `src/tasks.js`.
- **Green_Tests_Hook**: A Kiro agent hook that runs the project test suite and, on success, feeds the pet through the Feed_Server.

## Requirements

### Requirement 1: Expose a read-only pet-status tool over MCP

**User Story:** As a developer pairing with an AI agent, I want the agent to see how my pet is doing, so that it can factor my pet's needs into the conversation.

#### Acceptance Criteria

1. THE MCP_Server SHALL advertise a tool named `get_pet_status` with an input schema that requires no arguments.
2. WHEN the MCP_Client calls `get_pet_status` AND the Feed_Server is reachable, THE MCP_Server SHALL return the Pet_Status it received from the Feed_Server `/status` route as the tool result.
3. THE MCP_Server SHALL NOT change any pet state when `get_pet_status` is called.
4. IF the Feed_Server is not reachable when `get_pet_status` is called, THEN THE MCP_Server SHALL return a tool result marked as an error whose text states that the Bytepet app may not be running.

### Requirement 2: Let an agent list and complete tasks over MCP

**User Story:** As a developer pairing with an AI agent, I want the agent to mark a finished task done, so that completing real work feeds my pet.

#### Acceptance Criteria

1. THE MCP_Server SHALL advertise a tool named `list_open_tasks` that returns each Open_Task's id, title, size and due timestamp.
2. THE MCP_Server SHALL advertise a tool named `complete_task` whose input schema requires a string `id`.
3. WHEN the MCP_Client calls `complete_task` with the id of an Open_Task, THE MCP_Server SHALL cause that task to be completed through the Feed_Server exactly as if the owner finished it in the app, feeding the pet by the task's size.
4. WHEN a task is completed through `complete_task`, THE MCP_Server SHALL return a tool result naming the completed task and its size.
5. IF `complete_task` is called with an id that matches no Open_Task, THEN THE MCP_Server SHALL return a tool result marked as an error and SHALL NOT feed the pet.
6. IF `complete_task` is called with no `id`, THEN THE MCP_Server SHALL return a tool result marked as an error and SHALL NOT contact the Feed_Server.

### Requirement 3: Extend the Feed_Server with task routes

**User Story:** As the author of the MCP server, I want the Feed_Server to list and complete tasks, so that the MCP tools map onto real app actions.

#### Acceptance Criteria

1. THE Feed_Server SHALL answer a `GET /tasks` request with a JSON array of the current Open_Tasks, each carrying id, title, size, due and source.
2. WHEN the Feed_Server receives `GET /task/done?id=<id>` for an Open_Task, THE Feed_Server SHALL complete that task through the same path the app uses and SHALL respond with a JSON object reporting success and the task's title and size.
3. IF the Feed_Server receives `GET /task/done` with no `id`, THEN THE Feed_Server SHALL respond with HTTP 400.
4. IF the Feed_Server receives `GET /task/done?id=<id>` for an id that matches no Open_Task, THEN THE Feed_Server SHALL respond with HTTP 404 and a JSON object reporting failure.
5. THE Feed_Server SHALL continue to answer its existing `/feed` and `/status` routes unchanged.

### Requirement 4: Feed the pet when the test suite passes

**User Story:** As a developer, I want a green test run to feed my pet, so that healthy code is rewarded automatically.

#### Acceptance Criteria

1. THE Green_Tests_Hook SHALL run the project test command (`npm test`).
2. WHEN the test command exits successfully, THE Green_Tests_Hook SHALL feed the pet through the Feed_Server.
3. IF the test command fails, THEN THE Green_Tests_Hook SHALL NOT feed the pet.
4. IF the Feed_Server is not reachable when the hook tries to feed the pet, THEN THE hook SHALL complete without reporting an error that blocks the session.

### Requirement 5: Stay on-device and dependency-free

**User Story:** As a privacy-conscious user, I want the MCP integration to keep all activity on my Mac, so that nothing leaves my machine.

#### Acceptance Criteria

1. THE MCP_Server SHALL open network connections only to the Feed_Server on `127.0.0.1`.
2. THE MCP_Server SHALL run on Node with no runtime dependencies beyond the Node standard library.
3. THE MCP_Server SHALL allow the Feed_Server host and port to be overridden by the `BYTEPET_HOST` and `BYTEPET_PORT` environment variables, defaulting to `127.0.0.1` and `47777`.
