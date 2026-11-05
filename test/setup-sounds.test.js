// Run with: npm test  (or: node test/setup-sounds.test.js)
//
// renderer/setup.html + setup.js depend on the DOM and window.tasksApi, which
// are not available in plain Node (jsdom is not a dependency). These tests
// assert the source-level contract that implements the sounds toggle:
//   - the HTML has an #t-sounds checkbox with a visible "Sound effects" label,
//   - setup.js reflects a stored value into the checkbox (false -> unchecked),
//   - the setupDone payload carries the checkbox state.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('Setup: sounds toggle');

const r = (p) => fs.readFileSync(path.join(__dirname, '..', 'renderer', p), 'utf8');
const html = r('setup.html');
const js = r('setup.js');

// R5.1: a checkbox control with a visible text label identifying it as sound effects.
test('setup.html has a #t-sounds checkbox (R5.1)', () => {
  const re = /<input[^>]*\btype="checkbox"[^>]*\bid="t-sounds"[^>]*>|<input[^>]*\bid="t-sounds"[^>]*\btype="checkbox"[^>]*>/;
  assert.ok(re.test(html), 'setup.html contains an input[type=checkbox]#t-sounds');
});

test('setup.html shows a visible "Sound effects" label (R5.1)', () => {
  assert.ok(/Sound effects/.test(html), 'setup.html has a visible "Sound effects" label');
  // The label is associated with the toggle (same <label> wraps the input).
  assert.ok(
    /<label>[^]*id="t-sounds"[^]*Sound effects[^]*<\/label>/.test(html.replace(/\n/g, ' ')),
    'the "Sound effects" text shares the label that wraps #t-sounds',
  );
});

// R5.2, R5.3: reflect stored value; true/undefined -> checked, false -> unchecked.
test('setup.js reflects s.sounds into the checkbox with !== false semantics (R5.2, R5.3)', () => {
  assert.ok(
    /\$\(\s*['"]t-sounds['"]\s*\)\.checked\s*=\s*s\.sounds\s*!==\s*false/.test(js),
    'setup.js sets $(t-sounds).checked = s.sounds !== false',
  );
  // Verify the semantics of that exact expression.
  const reflect = (sounds) => sounds !== false;
  assert.strictEqual(reflect(true), true, 'stored true -> checked');
  assert.strictEqual(reflect(undefined), true, 'missing -> checked');
  assert.strictEqual(reflect(false), false, 'stored false -> unchecked');
});

// R5.4: the setupDone payload carries the checkbox state.
test('setup.js submits sounds: $(t-sounds).checked in the setupDone payload (R5.4)', () => {
  assert.ok(
    /sounds:\s*\$\(\s*['"]t-sounds['"]\s*\)\.checked/.test(js),
    'setup.js includes sounds: $(t-sounds).checked in the submitted payload',
  );
  // The submission is part of the setupDone call.
  assert.ok(/setupDone\s*\(/.test(js), 'setup.js calls api.setupDone');
});

console.log(`\n${passed} tests passed`);
