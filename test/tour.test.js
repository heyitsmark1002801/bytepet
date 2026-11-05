// Run with: npm test  (or: node test/tour.test.js)
//
// Tests for the pure guided-tour module (src/tour.js). Plain Node + assert plus
// fast-check, matching the style of test/demo-script.test.js. The tour is the
// post-setup "would you like a demo?" walkthrough: a short, ordered set of stops
// that highlight parts of the Hub/Tasks window and explain how the app works.
const assert = require('assert');
const fc = require('fast-check');
const Tour = require('../src/tour');

// Tabs the renderer knows about (from renderer/tasks.html). Every stop must land
// on one of these so the tour can always switch to the right tab.
const TABS = ['tasks', 'focus', 'pet', 'achievements', 'games', 'memories', 'settings'];

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('Tour script');

// The tour has a sensible number of stops and a clear start/finish.
test('tour starts with a welcome stop and ends with a finish stop', () => {
  assert.ok(Tour.totalSteps() >= 2, 'a tour needs at least a welcome and a finish');
  assert.strictEqual(Tour.TOUR_STEPS.length, Tour.totalSteps());
  const first = Tour.stepAt(0);
  const last = Tour.stepAt(Tour.totalSteps() - 1);
  // The bookend stops are centred cards with no target (welcome / all-done).
  assert.strictEqual(first.target, null);
  assert.strictEqual(first.placement, 'center');
  assert.strictEqual(last.target, null);
  assert.strictEqual(last.placement, 'center');
});

// Every stop is well-formed: it names a real tab, a known placement, and has
// non-empty text a reader can follow.
test('every stop is well-formed', () => {
  fc.assert(
    fc.property(fc.constantFrom(...Tour.TOUR_STEPS), (step) => {
      assert.strictEqual(typeof step.id, 'string');
      assert.ok(step.id.length > 0);
      // Lands on a real Hub tab so the tour can always show the right panel.
      assert.ok(TABS.includes(step.tab), `unknown tab: ${step.tab}`);
      // Placement is one of the supported sides (or center).
      assert.ok(Tour.PLACEMENTS.includes(step.placement), `unknown placement: ${step.placement}`);
      // target is either a non-empty selector string or null (a centred card).
      assert.ok(step.target === null || (typeof step.target === 'string' && step.target.length > 0));
      // Title and body are real, readable text.
      assert.strictEqual(typeof step.title, 'string');
      assert.ok(step.title.length > 0);
      assert.strictEqual(typeof step.body, 'string');
      assert.ok(step.body.length > 0);
      // Keep bodies short enough that the bubble never swallows the screen.
      assert.ok(step.body.length <= 240, `body too long (${step.body.length}): ${step.id}`);
    }),
    { numRuns: 100 },
  );
});

// Step ids are unique, so the renderer can key on them without collisions.
test('step ids are unique', () => {
  const ids = Tour.TOUR_STEPS.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

// clampIndex keeps Next/Back from ever running off either end of the tour.
test('clampIndex keeps any index inside the valid range', () => {
  fc.assert(
    fc.property(fc.integer({ min: -1000, max: 1000 }), (i) => {
      const c = Tour.clampIndex(i);
      assert.ok(c >= 0 && c <= Tour.TOUR_STEPS.length - 1);
      assert.ok(Number.isInteger(c));
    }),
    { numRuns: 100 },
  );
  // Non-finite / junk input falls back to the first stop.
  assert.strictEqual(Tour.clampIndex(NaN), 0);
  assert.strictEqual(Tour.clampIndex(Infinity), Tour.TOUR_STEPS.length - 1);
});

// stepAt never returns undefined — even for out-of-range indices it clamps first.
test('stepAt always returns a real stop', () => {
  fc.assert(
    fc.property(fc.integer({ min: -50, max: 50 }), (i) => {
      const step = Tour.stepAt(i);
      assert.ok(step && typeof step.id === 'string');
    }),
    { numRuns: 100 },
  );
});

// isLast is true only at the final index, so the Next button can flip to "Done".
test('isLast is true only at the final stop', () => {
  const lastIndex = Tour.TOUR_STEPS.length - 1;
  for (let i = 0; i < Tour.TOUR_STEPS.length; i += 1) {
    assert.strictEqual(Tour.isLast(i), i === lastIndex);
  }
  // Out-of-range indices clamp, so an index past the end still reads as last.
  assert.strictEqual(Tour.isLast(lastIndex + 5), true);
  assert.strictEqual(Tour.isLast(-5), false);
});

console.log(`\n${passed} passing`);
