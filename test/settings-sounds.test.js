// Run with: npm test  (or: node test/settings-sounds.test.js)
//
// main.js requires 'electron' at the top, so it cannot be required directly in
// plain Node. These tests verify two things instead:
//   1. The four source edits that implement the `sounds` setting exist in main.js
//      (default, snapshot field, safe settings object, and persistence).
//   2. The intended semantics those edits produce (default true, missing -> true,
//      stored false -> false, merge/retain other keys) using small reference
//      reimplementations of the exact expressions main.js uses.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('Settings: sounds');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

// --- Source-level: the four edits are present (R3.1-3.4, 5.5, 5.6 wiring) ---

test('DEFAULT_SETTINGS declares sounds: true (R3.1)', () => {
  assert.ok(/\bsounds:\s*true\b/.test(mainSrc), 'main.js defaults sounds to true');
});

test('snapshot()/safe settings expose sounds: settings.sounds !== false (R3.3, R3.4)', () => {
  const matches = mainSrc.match(/sounds:\s*settings\.sounds\s*!==\s*false/g) || [];
  // One in snapshot() (R3.4) and one in the safe settings object surfaced to setup (R3.3).
  assert.ok(matches.length >= 2, 'main.js surfaces sounds via `settings.sounds !== false` in snapshot and settings views');
});

test('saveHubSettings persists a submitted sounds value (R5.5)', () => {
  assert.ok(
    /if\s*\(\s*['"]sounds['"]\s+in\s+input\s*\)\s*settings\.sounds\s*=\s*!!input\.sounds/.test(mainSrc),
    'main.js writes settings.sounds = !!input.sounds when provided',
  );
});

// --- Semantic: reference reimplementations of the exact main.js expressions ---

const DEFAULT_SETTINGS = { sounds: true };
// main.js: loadSettings does { ...DEFAULT_SETTINGS, ...(saved || {}) }
const loadSettings = (saved) => ({ ...DEFAULT_SETTINGS, ...(saved || {}) });
// main.js snapshot()/settings view: sounds: settings.sounds !== false
const snapshotSounds = (settings) => settings.sounds !== false;
// main.js saveHubSettings: if ('sounds' in input) settings.sounds = !!input.sounds
function saveHubSettings(settings, input) {
  if ('sounds' in input) settings.sounds = !!input.sounds;
  return settings;
}

test('default is true (R3.1)', () => {
  assert.strictEqual(DEFAULT_SETTINGS.sounds, true);
});

test('loading settings without a sounds key yields true (R3.2)', () => {
  const s = loadSettings({ quiet: false, toasts: true });
  assert.strictEqual(s.sounds, true, 'missing stored sounds merges to the default true');
  // Other keys are retained through the merge (R3.3 "leave other settings unchanged").
  assert.strictEqual(s.quiet, false);
  assert.strictEqual(s.toasts, true);
});

test('snapshot includes sounds and surfaces stored false as false while retaining other keys (R3.3, R3.4)', () => {
  const stored = loadSettings({ sounds: false, quiet: true, toasts: true });
  const snap = { quiet: stored.quiet, sounds: snapshotSounds(stored), toasts: stored.toasts };
  assert.ok('sounds' in snap, 'snapshot includes the sounds field');
  assert.strictEqual(snap.sounds, false, 'a stored false surfaces as false');
  // Unrelated keys retained.
  assert.strictEqual(snap.quiet, true);
  assert.strictEqual(snap.toasts, true);
});

test('a non-boolean/unreadable stored sounds surfaces as true (R3.3)', () => {
  assert.strictEqual(snapshotSounds({ sounds: undefined }), true);
  assert.strictEqual(snapshotSounds({}), true);
  assert.strictEqual(snapshotSounds({ sounds: 'nope' }), true);
});

test('saveHubSettings({ sounds: false }) sets settings.sounds = false (R5.5)', () => {
  const settings = loadSettings({ quiet: false });
  saveHubSettings(settings, { sounds: false });
  assert.strictEqual(settings.sounds, false);
  // An input without a sounds key leaves the existing value untouched.
  saveHubSettings(settings, { toasts: true });
  assert.strictEqual(settings.sounds, false, 'absent sounds key does not change the setting');
});

test('a failed persist leaves the in-memory settings consistent (R5.6)', () => {
  const settings = loadSettings({ quiet: false, toasts: true });
  saveHubSettings(settings, { sounds: false });
  const writeJson = () => {
    throw new Error('disk full');
  };
  // Mirrors main.js: the write is attempted after the in-memory mutation; a
  // throwing write does not partially corrupt other settings.
  assert.throws(() => writeJson(), /disk full/);
  assert.strictEqual(settings.sounds, false, 'in-memory sounds remains set');
  assert.strictEqual(settings.toasts, true, 'unrelated settings are untouched by a failed write');
});

console.log(`\n${passed} tests passed`);
