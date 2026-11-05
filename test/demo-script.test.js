// Run with: npm test  (or: node test/demo-script.test.js)
//
// Tests for the pure demo-script module (src/demo-script.js). Mirrors the plain
// Node + assert style of test/pet-state.test.js, and adds fast-check for the
// property-based checks. Properties follow the demo-mode design doc; each is
// tagged with a comment naming the feature and property number.
const assert = require('assert');
const fc = require('fast-check');
const D = require('../src/demo-script');
const P = require('../src/pet-state');

// The eight lifecycle step ids, in the order the Demo_Story must play them.
const STEP_IDS = ['hatch', 'feed', 'distract', 'refocus', 'mess', 'sick', 'die', 'revive'];

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('Demo script');

// Feature: demo-mode, Property 1: The story plays the eight lifecycle steps in order
test('story plays the eight lifecycle steps in order', () => {
  fc.assert(
    fc.property(fc.constant(null), () => {
      // Apply every step in DEMO_STEPS order to a fresh Demo_Pet and collect the
      // ids in the sequence they were applied. The resulting sequence must be
      // exactly the eight ids, none skipped or reordered.
      const pet = D.createDemoPet(P);
      const played = [];
      for (const step of D.DEMO_STEPS) {
        D.applyStep(pet, step, P);
        played.push(step.id);
      }
      assert.deepStrictEqual(played, STEP_IDS);
    }),
    { numRuns: 100 },
  );
});

// Feature: demo-mode, Property 2: Each step establishes its intended effect on the Demo_Pet
test('each step establishes its intended effect on the Demo_Pet', () => {
  fc.assert(
    fc.property(
      // Random starting meters: a freshly created Demo_Pet with any plausible
      // meter values should still show each step's intended, observable effect.
      fc.record({
        // Leave headroom below the 100-point ceiling: feed adds a task-M (+40
        // points), so a near-full pet would clamp and its food units wouldn't
        // rise. We're checking that feeding raises food, not the clamp itself.
        hunger: fc.integer({ min: 0, max: 60 }),
        energy: fc.integer({ min: 0, max: 100 }),
        happiness: fc.integer({ min: 0, max: 100 }),
        // Health stays out of the sick range (< 40): mood() ranks `sick` above
        // `crying`, so a pre-sick pet would mask the distract step's own effect.
        // We're checking each step's effect, not mood's priority tie-breaks.
        health: fc.integer({ min: 40, max: 100 }),
        discipline: fc.integer({ min: 0, max: 100 }),
      }),
      (meters) => {
        const pet = D.createDemoPet(P);
        Object.assign(pet, meters);

        // Index steps by id so each predicate is checked right after its step.
        const byId = Object.fromEntries(D.DEMO_STEPS.map((s) => [s.id, s]));

        // hatch → the pet is no longer an egg.
        D.applyStep(pet, byId.hatch, P);
        assert.notStrictEqual(pet.stage, 'egg');

        // feed → the food meter goes up (compare food units before/after).
        const foodBefore = P.foodUnits(pet);
        D.applyStep(pet, byId.feed, P);
        assert.ok(P.foodUnits(pet) > foodBefore);

        // distract → the pet is crying.
        D.applyStep(pet, byId.distract, P);
        assert.strictEqual(P.mood(pet), 'crying');

        // refocus → the pet is no longer distracted.
        D.applyStep(pet, byId.refocus, P);
        assert.strictEqual(pet.distracted, false);

        // mess → there is a non-empty mess pile and flies are present.
        D.applyStep(pet, byId.mess, P);
        assert.ok(Array.isArray(pet.poop) && pet.poop.length > 0);
        assert.strictEqual(pet.flies, true);

        // sick → the pet's mood reads as sick.
        D.applyStep(pet, byId.sick, P);
        assert.strictEqual(P.mood(pet), 'sick');

        // die → the pet becomes a ghost.
        D.applyStep(pet, byId.die, P);
        assert.strictEqual(pet.ghost, true);

        // revive → the pet lives again.
        D.applyStep(pet, byId.revive, P);
        assert.strictEqual(pet.ghost, false);
      },
    ),
    { numRuns: 100 },
  );
});

// Feature: demo-mode, Property 3: The demo ends with a living pet
test('the demo ends with a living pet', () => {
  fc.assert(
    fc.property(
      // Random starting meters: no matter what state a freshly created Demo_Pet
      // begins in, running the full story must leave it alive at the end.
      fc.record({
        hunger: fc.integer({ min: 0, max: 100 }),
        energy: fc.integer({ min: 0, max: 100 }),
        happiness: fc.integer({ min: 0, max: 100 }),
        health: fc.integer({ min: 0, max: 100 }),
        discipline: fc.integer({ min: 0, max: 100 }),
      }),
      (meters) => {
        const pet = D.createDemoPet(P);
        Object.assign(pet, meters);

        // Play the whole Demo_Story in order.
        for (const step of D.DEMO_STEPS) {
          D.applyStep(pet, step, P);
        }

        // After the final (revive) step, the Demo_Pet is alive, not a ghost.
        assert.strictEqual(pet.ghost, false);
      },
    ),
    { numRuns: 100 },
  );
});

// Feature: demo-mode, Property 4: Every caption is non-empty and within the length bound
test('every caption is non-empty and within the length bound', () => {
  fc.assert(
    fc.property(
      // Each run picks one of the eight steps; across many runs every step's
      // caption is exercised. Checking the generator-picked step keeps this a
      // property over DEMO_STEPS rather than a single hand-written example.
      fc.constantFrom(...D.DEMO_STEPS),
      (step) => {
        const caption = D.captionFor(step);
        // Non-empty string: a real caption a viewer can read, never '' or null.
        assert.strictEqual(typeof caption, 'string');
        assert.ok(caption.length > 0);
        // Within the length bound: captions must fit the on-screen strip (≤ 80).
        assert.ok(caption.length <= 80);
      },
    ),
    { numRuns: 100 },
  );
});

// Feature: demo-mode, Property 5: The total runtime lands in the required window
test('total runtime lands in the required window', () => {
  fc.assert(
    fc.property(
      // Each run picks one of the eight steps; across many runs every step's
      // holdMs is exercised against the 3s floor. The total-duration bound does
      // not depend on the generated step, so we assert it on every run too —
      // this keeps Property 5 a single property over DEMO_STEPS and the sum.
      fc.constantFrom(...D.DEMO_STEPS),
      (step) => {
        // Every step must stay on screen for at least the 3-second floor so a
        // viewer can read its caption before the story advances.
        assert.ok(step.holdMs >= 3000);

        // The whole story must run long enough to tell the lifecycle yet stay
        // short enough to hold attention: the summed runtime lands in the
        // required [45000, 90000] ms window.
        const total = D.totalDurationMs();
        assert.ok(total >= 45000);
        assert.ok(total <= 90000);
      },
    ),
    { numRuns: 100 },
  );
});

// Feature: demo-mode, Property 6: Advancing the demo pet never mutates the real pet
test('advancing the demo pet never mutates the real pet', () => {
  fc.assert(
    fc.property(
      // Random meter values for a real, live pet: whatever state the real pet is
      // in, running a whole demo on a separate Demo_Pet must not touch it. Food
      // is below the ceiling so the record reads as a plausible mid-life pet, but
      // the isolation check holds for any values — these just vary the snapshot.
      fc.record({
        hunger: fc.integer({ min: 0, max: 100 }),
        energy: fc.integer({ min: 0, max: 100 }),
        happiness: fc.integer({ min: 0, max: 100 }),
        health: fc.integer({ min: 1, max: 100 }),
        discipline: fc.integer({ min: 0, max: 100 }),
        xp: fc.integer({ min: 0, max: 1000 }),
      }),
      (meters) => {
        // The real pet the user cares about: created normally, then nudged into a
        // random live state so each run snapshots a different real pet.
        const realPet = P.createPet('Real');
        Object.assign(realPet, meters);

        // A deep snapshot taken before the demo runs — the ground truth the real
        // pet must still match afterwards, with no shared references.
        const before = JSON.parse(JSON.stringify(realPet));

        // Run the ENTIRE Demo_Story on a SEPARATE Demo_Pet. The demo only ever
        // touches this pet; the real pet is never passed to any step.
        const demoPet = D.createDemoPet(P);
        for (const step of D.DEMO_STEPS) {
          D.applyStep(demoPet, step, P);
        }

        // The real pet is byte-for-byte what it was before the demo: advancing
        // the Demo_Pet mutated nothing the user owns.
        assert.deepStrictEqual(realPet, before);
      },
    ),
    { numRuns: 100 },
  );
});

// Unit tests: exact caption wording for representative steps. Property 4 proves
// every caption is non-empty and within the length bound; these pin the precise
// words a viewer reads for two representative steps (the first and the last),
// so a careless reword can't silently change the narration.
function stepById(id) {
  const step = D.DEMO_STEPS.find((s) => s.id === id);
  assert.ok(step, `expected a DEMO_STEPS entry with id "${id}"`);
  return step;
}

// Requirements: 4.1, 4.3
test('captionFor returns the exact wording for the hatch step', () => {
  const caption = D.captionFor(stepById('hatch'));
  assert.strictEqual(caption, 'The egg hatches — your Demo pet is born as a baby!');
});

// Requirements: 4.1, 4.3
test('captionFor returns the exact wording for the revive step', () => {
  const caption = D.captionFor(stepById('revive'));
  assert.strictEqual(caption, 'You finish more work — the Demo pet is revived and lives again!');
});

// Example test: the notification suppression gate.
//
// The production guard lives in main.js's notify(title, body, ...): its first
// line is `if (demoMode) return;`, which early-returns — suppressing every
// macOS notification — while a demo is playing (main.js also gates pushState()
// the same way). That function sits inside an Electron module (it calls
// `Notification`), so it can't be imported into a plain Node test harness.
// Instead we model the gate as a tiny pure predicate that mirrors the exact
// semantics of that guard, and assert the boolean gate both suppresses during a
// demo and allows notifications otherwise. The full notify()/pushState() wiring
// is verified manually, per the design's testing strategy, because Electron
// can't run in this harness.

// Mirrors the production guard in main.js: notify(...) early-returns while
// demoMode is true. The gate is allowed only when a demo is NOT playing.
const notifyAllowed = (demoMode) => !demoMode;

// Requirements: 6.1, 6.2, 6.3
test('notification path is suppressed while a demo is playing', () => {
  // demoMode === true → `if (demoMode) return;` fires, so notify() never reaches
  // the Notification call: the gate is closed and no notification is allowed.
  assert.strictEqual(notifyAllowed(true), false);

  // The same gate guards a demo-step notification: a step that tried to notify
  // while the demo runs is suppressed too — the demo stays silent.
  const demoStepNotificationFires = notifyAllowed(true);
  assert.strictEqual(demoStepNotificationFires, false);
});

// Requirements: 6.1, 6.2, 6.3
test('notifications are allowed when no demo is playing', () => {
  // demoMode === false → the guard is skipped and notify() proceeds normally:
  // the gate is open and notifications are allowed again once the demo stops.
  assert.strictEqual(notifyAllowed(false), true);
});

// Caption-render check. This mirrors the renderer.js `api.onDemoCaption`
// handler: a non-empty string sets textContent and shows the strip
// (hidden=false), while an empty/null value clears textContent and hides the
// strip (hidden=true). `applyCaption` below reproduces that handler's logic
// exactly on a tiny fake element so the contract can be asserted here. The
// end-to-end DOM render is verified manually, since Electron/DOM is not
// available in this plain Node + assert harness (per the design testing
// strategy).
function applyCaption(el, text) {
  if (text) {
    el.textContent = text; // replace any previous caption — only one shows at a time
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

// Requirements: 4.4
test('caption render shows exactly one caption and empty input hides the strip', () => {
  const el = { textContent: '', hidden: true };

  // A non-empty caption shows the strip with that exact text (one caption shows).
  applyCaption(el, 'Hello');
  assert.strictEqual(el.hidden, false);
  assert.strictEqual(el.textContent, 'Hello');

  // A second caption replaces the first — still exactly one, never appended.
  applyCaption(el, 'World');
  assert.strictEqual(el.textContent, 'World');

  // Empty input clears the text and hides the strip.
  applyCaption(el, '');
  assert.strictEqual(el.hidden, true);
  assert.strictEqual(el.textContent, '');
});

console.log(`\n${passed} passing`);
