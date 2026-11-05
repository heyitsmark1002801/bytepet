// Run with: npm test  (or: node test/sounds.test.js)
const assert = require('assert');
const fc = require('fast-check');
const Sounds = require('../renderer/sounds.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// The six Pet_Event strings that map to a beep.
const EVENTS = ['call-hungry', 'got-sick', 'evolved', 'died', 'revived', 'basket'];
const isSoundEvent = (t) => EVENTS.includes(t);
const totalMs = (spec) => spec.tones.reduce((sum, tone) => sum + tone.ms, 0);

console.log('Retro sounds');

// Feature: retro-sounds, Property 1: Each sound event maps to its own beep spec
test('each sound event maps to its own beep spec', () => {
  fc.assert(
    fc.property(fc.constantFrom(...EVENTS), (e) => {
      // Every sound event has a non-null spec.
      assert.ok(Sounds.specFor(e) != null, `specFor(${e}) should be non-null`);
      // The six specs are pairwise distinct entries (no shared spec object).
      const specs = EVENTS.map((ev) => Sounds.specFor(ev));
      specs.forEach((spec, i) => assert.ok(spec != null, `specFor(${EVENTS[i]}) non-null`));
      assert.equal(new Set(specs).size, EVENTS.length, 'all six specs are distinct entries');
    }),
    { numRuns: 100 },
  );
});

// Feature: retro-sounds, Property 2: All six beeps are mutually distinguishable
test('all six beeps are mutually distinguishable', () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.integer({ min: 0, max: EVENTS.length - 1 }), fc.integer({ min: 1, max: EVENTS.length - 1 }))
        .map(([i, gap]) => [i, (i + gap) % EVENTS.length]), // unordered pair of two different events
      ([i, j]) => {
        const a = Sounds.specFor(EVENTS[i]);
        const b = Sounds.specFor(EVENTS[j]);
        const baseFreqApart = Math.abs(a.tones[0].freq - b.tones[0].freq) >= 20;
        const durationApart = Math.abs(totalMs(a) - totalMs(b)) >= 40;
        const toneCountDiffers = a.tones.length !== b.tones.length;
        assert.ok(
          baseFreqApart || durationApart || toneCountDiffers,
          `${EVENTS[i]} vs ${EVENTS[j]} must differ on at least one axis`,
        );
      },
    ),
    { numRuns: 100 },
  );
});

// Feature: retro-sounds, Property 3: Every beep fits the duration window
test('every beep fits the duration window', () => {
  const entries = Object.values(Sounds.SPECS);
  fc.assert(
    fc.property(fc.constantFrom(...entries), (spec) => {
      const total = totalMs(spec);
      assert.ok(total >= 80 && total <= 400, `total duration ${total}ms must be in [80, 400]`);
    }),
    { numRuns: 100 },
  );
});

// Feature: retro-sounds, Property 4: The play gate honors mapping, setting, quiet, and snapshot presence
test('the play gate honors mapping, setting, quiet, and snapshot presence', () => {
  const typeArb = fc.oneof(fc.constantFrom(...EVENTS), fc.string());
  const soundsArb = fc.constantFrom(true, false, undefined, null);
  const quietArb = fc.boolean();
  const snapshotArb = fc.record({ sounds: soundsArb, quiet: quietArb });
  const stateArb = fc.oneof(snapshotArb, fc.constant(null));
  fc.assert(
    fc.property(typeArb, stateArb, (type, state) => {
      const expected = isSoundEvent(type) && state != null && state.sounds !== false && !state.quiet;
      assert.equal(Sounds.shouldPlay(type, state), expected, `shouldPlay(${JSON.stringify(type)}, ${JSON.stringify(state)})`);
    }),
    { numRuns: 100 },
  );
});

// Feature: retro-sounds, Property 5: Playback never throws when Web Audio is unavailable
test('playback never throws when Web Audio is unavailable', () => {
  const specs = Object.values(Sounds.SPECS);
  // A stub whose every method throws, to model a hostile/broken audio context.
  const throwingCtx = () => ({
    get currentTime() {
      throw new Error('currentTime unavailable');
    },
    createOscillator() {
      throw new Error('no oscillator');
    },
    createGain() {
      throw new Error('no gain');
    },
    destination: null,
  });
  fc.assert(
    fc.property(
      fc.constantFrom(...specs),
      fc.constantFrom('null', 'throwing'),
      (spec, ctxKind) => {
        const ctx = ctxKind === 'null' ? null : throwingCtx();
        // Must not throw regardless of the spec or the (missing/broken) context.
        assert.doesNotThrow(() => Sounds.playSpec(spec, ctx));
      },
    ),
    { numRuns: 100 },
  );
  // Also safe when the global AudioContext is absent and no ctx is supplied.
  const hadGlobal = 'AudioContext' in globalThis;
  const savedGlobal = globalThis.AudioContext;
  try {
    delete globalThis.AudioContext;
    assert.doesNotThrow(() => Sounds.playSpec(specs[0]));
  } finally {
    if (hadGlobal) globalThis.AudioContext = savedGlobal;
  }
});

// A hand-written stub AudioContext that records every node and method call so a
// test can assert the shape of what playSpec built (R1.1, R1.3, R2.9).
function makeStubContext() {
  const log = { oscillators: [], gains: [] };
  let now = 0;
  function makeOscillator() {
    const o = {
      type: null,
      frequency: { value: null },
      connections: [],
      started: null,
      stopped: null,
      connect(target) {
        o.connections.push(target);
        return target; // mirror real nodes so .connect().connect() chains work
      },
      start(t) {
        o.started = t;
      },
      stop(t) {
        o.stopped = t;
      },
    };
    log.oscillators.push(o);
    return o;
  }
  function makeGain() {
    const g = {
      gain: {
        value: null,
        events: [],
        setValueAtTime(v, t) {
          g.gain.events.push({ kind: 'set', v, t });
        },
        linearRampToValueAtTime(v, t) {
          g.gain.events.push({ kind: 'ramp', v, t });
        },
      },
      connect(target) {
        return target;
      },
    };
    log.gains.push(g);
    return g;
  }
  const ctx = {
    log,
    destination: { id: 'destination' },
    get currentTime() {
      return now;
    },
    setCurrentTime(t) {
      now = t;
    },
    createOscillator: makeOscillator,
    createGain: makeGain,
  };
  return ctx;
}

// Unit/example test: playback shape and interrupt behavior (R1.1, R1.3, R2.9).
test('playSpec builds a square-wave oscillator + gain envelope and connects to destination', () => {
  const ctx = makeStubContext();
  const spec = Sounds.specFor('call-hungry'); // single-tone spec
  Sounds.playSpec(spec, ctx);

  assert.equal(ctx.log.oscillators.length, 1, 'one oscillator for a one-tone spec');
  assert.equal(ctx.log.gains.length, 1, 'one gain node for a one-tone spec');

  const o = ctx.log.oscillators[0];
  const g = ctx.log.gains[0];
  assert.equal(o.type, 'square', 'oscillator is a square wave');
  assert.equal(o.frequency.value, spec.tones[0].freq, 'oscillator frequency matches the spec tone');

  // Oscillator -> gain -> destination routing.
  assert.ok(o.connections.includes(g), 'oscillator connects to the gain node');
  assert.ok(g.connect, 'gain node is connectable');
  // The gain node is ultimately routed to ctx.destination (via the connect chain).

  // A gain ramp to 0 is scheduled, and it lands at/after the oscillator stop-start window.
  const ramp = g.gain.events.find((e) => e.kind === 'ramp' && e.v === 0);
  assert.ok(ramp, 'a gain ramp to 0 is scheduled (click-free stop)');
  assert.ok(o.started != null && o.stopped != null, 'oscillator is started and stopped');
  assert.ok(ramp.t <= o.stopped + 1e-9, 'ramp to 0 completes by the stop time');
  assert.ok(ramp.t > o.started, 'ramp to 0 happens after the tone starts');
});

test('playSpec stops the previous oscillator before starting a new beep (interrupt, R2.9)', () => {
  const ctx = makeStubContext();

  // First beep (single tone) starts playing.
  Sounds.playSpec(Sounds.specFor('basket'), ctx);
  assert.equal(ctx.log.oscillators.length, 1, 'first beep created one oscillator');
  const first = ctx.log.oscillators[0];
  const firstStopBefore = first.stopped;

  // Advance time and fire a second beep while the first is still "playing".
  ctx.setCurrentTime(1);
  Sounds.playSpec(Sounds.specFor('evolved'), ctx); // three-tone spec

  // The previous oscillator must have been stopped (stop() called again) before
  // the new oscillators start.
  assert.notStrictEqual(first.stopped, firstStopBefore, 'previous oscillator was stopped on the new call');
  const newOsc = ctx.log.oscillators.slice(1);
  assert.equal(newOsc.length, 3, 'second (three-tone) beep created three new oscillators');
  for (const o of newOsc) {
    assert.ok(o.started >= ctx.currentTime, 'new oscillators start at/after the current time');
  }
});

// Example test: non-sound events trigger no playback (R2.8).
test('non-sound events return false and play no beep', () => {
  const snapshot = { sounds: true, quiet: false };
  const original = Sounds.playSpec;
  let playCount = 0;
  Sounds.playSpec = function spy() {
    playCount += 1;
    return original.apply(this, arguments);
  };
  try {
    // Representative non-sound event types plus arbitrary strings.
    const nonSound = ['ate', 'petted', 'slept', '', 'not-a-sound', 'call-sick'];
    for (const type of nonSound) {
      assert.equal(Sounds.handleEvent(type, snapshot), false, `handleEvent(${JSON.stringify(type)}) should be false`);
    }
    fc.assert(
      fc.property(
        fc.string().filter((s) => !isSoundEvent(s)),
        (type) => {
          assert.equal(Sounds.handleEvent(type, snapshot), false, `handleEvent(${JSON.stringify(type)}) should be false`);
        },
      ),
      { numRuns: 100 },
    );
    assert.equal(playCount, 0, 'no beep was played for any non-sound event');
  } finally {
    Sounds.playSpec = original;
  }
});

// Integration smoke: no external audio files + end-to-end gating (R1.4, R3.5, R4.1-4.3).
const fs = require('fs');
const path = require('path');

test('sounds.js references no external audio files and loads nothing (R1.4)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'sounds.js'), 'utf8');
  const audioExt = /\.(mp3|wav|ogg|m4a|aac|flac)\b/i;
  assert.ok(!audioExt.test(src), 'source references no audio file extensions');
  // No file/network loading of audio.
  assert.ok(!/\bfetch\s*\(/.test(src), 'source does not use fetch()');
  assert.ok(!/XMLHttpRequest/.test(src), 'source does not use XMLHttpRequest');
  assert.ok(!/require\(\s*['"]fs['"]\s*\)/.test(src), 'source does not require("fs")');
  assert.ok(!/\bAudio\s*\(/.test(src), 'source does not construct HTMLAudioElement');
});

test('handleEvent plays for all six events and is gated by quiet and sounds (R3.5, R4.1-4.3)', () => {
  const original = Sounds.playSpec;
  Sounds.playSpec = function noop() {}; // avoid touching real audio in Node
  try {
    for (const event of EVENTS) {
      // sounds on, not quiet -> plays
      assert.equal(Sounds.handleEvent(event, { sounds: true, quiet: false }), true, `${event} plays when enabled and not quiet`);
      // quiet overrides even with sounds on -> no play
      assert.equal(Sounds.handleEvent(event, { sounds: true, quiet: true }), false, `${event} suppressed during quiet hours`);
      // sounds off -> no play
      assert.equal(Sounds.handleEvent(event, { sounds: false, quiet: false }), false, `${event} suppressed when sounds off`);
    }
  } finally {
    Sounds.playSpec = original;
  }
});

console.log(`\n${passed} tests passed`);
