# Kiro Log

## Agent hooks

Created three Ask Kiro (agent-action) hooks that fire on file save:

- **lines-copy-review** (`src/lines.js`) — reviews new/changed copy for length (<80 chars), friendly tone, and no real brand mentions.
- **settings-readme-sync** (`main.js`) — updates the README Settings section when settings change.
- **tests-on-src-save** (`src/**`) — runs `npm test` and fixes code if any test fails.

Hooks activate on the next session start, so firing/results will be recorded after testing them in a fresh session.
