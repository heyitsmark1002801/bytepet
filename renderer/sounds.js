// Bytepet retro sound effects: short square-wave beeps synthesized with the
// Web Audio API — no audio files are bundled or loaded (Requirement 1.4).
//
// This module is split into a PURE decision layer (SPECS, specFor, shouldPlay,
// handleEvent) that takes plain data and returns plain data, and a thin playback
// layer (playSpec). The decision layer never touches AudioContext, so it can be
// required and tested in plain Node without a DOM. See .kiro/specs/retro-sounds.

(function () {
  // Event -> beep spec table. Each spec is a sequence of square-wave tones.
  // Values mirror the design Data Models table exactly; totals stay within the
  // 80-400 ms window and every pair is mutually distinguishable (R2.1-2.7, R1.2).
  // type Tone = { freq: number; ms: number }
  // type BeepSpec = { tones: Tone[] }
  const SPECS = {
    'call-hungry': { tones: [{ freq: 440, ms: 120 }] },
    'got-sick': { tones: [{ freq: 300, ms: 90 }, { freq: 230, ms: 140 }] },
    evolved: { tones: [{ freq: 523, ms: 90 }, { freq: 659, ms: 90 }, { freq: 784, ms: 120 }] },
    died: { tones: [{ freq: 200, ms: 140 }, { freq: 120, ms: 220 }] },
    revived: { tones: [{ freq: 392, ms: 100 }, { freq: 523, ms: 100 }, { freq: 659, ms: 140 }] },
    basket: { tones: [{ freq: 660, ms: 80 }] },
  };

  // Pure: the beep spec for an event, or null if the event has none (R2.1-2.6, 2.8).
  // Own-property check so inherited keys (toString, constructor, …) are not
  // mistaken for real specs.
  function hasSpec(type) {
    return Object.prototype.hasOwnProperty.call(SPECS, type);
  }

  function specFor(type) {
    return hasSpec(type) ? SPECS[type] : null;
  }

  // Pure: is this event one we sound, and are we allowed to play right now?
  // `state` is the latest snapshot S (may be null before the first snapshot).
  function shouldPlay(type, state) {
    if (!hasSpec(type)) return false; // R2.8: unmapped event -> no beep
    if (!state) return false; // R4.4: no snapshot yet -> no beep
    if (state.sounds === false) return false; // R3.5: sounds off -> no beep
    if (state.quiet) return false; // R4.1: quiet -> no beep, overrides sounds
    return true; // R3.6 / R4.2
  }

  // Lazily created, shared AudioContext (mirrors the `let audio = null` pattern
  // in renderer/games.js). Reused across calls so we don't leak contexts.
  let audio = null;
  // The oscillators started by the most recent playSpec call, so a new event
  // can stop the previous beep before starting its own (R2.9).
  let playing = [];

  // Playback: synthesize `spec` with the Web Audio API. Mirrors the square-wave
  // beep helper in renderer/games.js — a lazily created AudioContext, a square
  // OscillatorNode per tone routed through a low GainNode to ctx.destination,
  // with tones scheduled in sequence by their per-tone ms. Each tone ramps its
  // gain to 0 just before its stop time so playback ends without a click (R1.3),
  // and the whole body is wrapped in try/catch so a missing or throwing
  // AudioContext is a silent no-op that never interrupts the app (R1.5).
  function playSpec(spec, ctx) {
    if (!spec || !spec.tones || !spec.tones.length) return;
    try {
      // Use the caller-provided context (tests) or lazily create a shared one.
      const ac = ctx || (audio = audio || new AudioContext());
      if (!ac) return;

      // Stop any beep still in flight so the new event's beep takes over (R2.9).
      for (const prev of playing) {
        try { prev.stop(); } catch { /* already stopped */ }
      }
      playing = [];

      const g = 0.05; // low gain, matching the games.js beep level
      let offset = 0; // seconds into the sequence for the current tone
      const base = ac.currentTime;

      for (const tone of spec.tones) {
        const dur = tone.ms / 1000; // tone length in seconds
        const start = base + offset;
        const stop = start + dur;

        const o = ac.createOscillator();
        const gain = ac.createGain();
        o.type = 'square';
        o.frequency.value = tone.freq;
        gain.gain.value = g;
        o.connect(gain).connect(ac.destination);

        // Ramp the gain to 0 just before the stop so the tone fades out instead
        // of cutting off with an audible click (R1.3).
        try {
          gain.gain.setValueAtTime(g, Math.max(start, stop - 0.01));
          gain.gain.linearRampToValueAtTime(0, stop);
        } catch { /* ramp unsupported on this context; plain stop still applies */ }

        o.start(start);
        o.stop(stop);
        playing.push(o);
        offset += dur;
      }
    } catch { /* no sound */ }
  }

  // Convenience used by the renderer: decide, then play.
  function handleEvent(type, state) {
    if (!shouldPlay(type, state)) return false;
    playSpec(specFor(type));
    return true;
  }

  const Sounds = { SPECS, specFor, shouldPlay, playSpec, handleEvent };

  // Node export (for tests) with a browser-global fallback (for the renderer).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Sounds;
  }
  if (typeof window !== 'undefined') {
    window.Sounds = Sounds;
  }
})();
