// Pure demo script: no Electron here, so it can be tested with plain Node,
// exactly like src/pet-state.js. This module holds the scripted eight-step
// Demo_Story (hatch → feed → distract → refocus → mess → sick → die → revive)
// as plain data plus small pure helpers. The main process owns the thin glue
// (timer, IPC, tray); here we only describe *what* each step does and *how long*
// it shows, driving a Demo_Pet with the same pet-state functions the real app uses.
//
// Each step mutates the pet it is given via the pet-state functions passed in as
// `P`, so this file never imports pet-state directly and stays trivially testable.

// How long each step stays on screen. Eight steps × 6s = 48s of visible content,
// comfortably inside the 45–90s window with every step held well past the 3s floor.
const HOLD_MS = 6000;

// The eight lifecycle steps, in order. Captions are ≤ 80 chars and each one names
// both the action and the effect it has on the Demo_Pet, so a viewer can follow
// along without audio.
const DEMO_STEPS = [
  {
    id: 'hatch',
    caption: 'The egg hatches — your Demo pet is born as a baby!',
    holdMs: HOLD_MS,
    apply: (pet, P) => P.addXp(pet, 5),
  },
  {
    id: 'feed',
    caption: 'You finish a task — the Demo pet eats and its food meter fills up.',
    holdMs: HOLD_MS,
    apply: (pet, P) => P.feed(pet, 'task-M'),
  },
  {
    id: 'distract',
    caption: 'Too much time off task — the Demo pet gets distracted and turns sad.',
    holdMs: HOLD_MS,
    apply: (pet) => {
      pet.distracted = true;
      pet.distractedMinutes = 5;
      return ['distracted'];
    },
  },
  {
    id: 'refocus',
    caption: 'You get back to work — the Demo pet refocuses and cheers back up.',
    holdMs: HOLD_MS,
    apply: (pet, P) => P.refocus(pet),
  },
  {
    id: 'mess',
    caption: 'Downloads pile up — digital mess appears and flies swarm the Demo pet.',
    holdMs: HOLD_MS,
    apply: (pet, P) => {
      const events = P.setMess(pet, [{ kind: 'downloads', label: 'Downloads', count: 87, limit: 50 }]);
      pet.flies = true;
      return events;
    },
  },
  {
    id: 'sick',
    caption: 'A pending update hits — the Demo pet catches a bug and falls sick.',
    holdMs: HOLD_MS,
    apply: (pet, P) => P.setUpdates(pet, 1),
  },
  {
    id: 'die',
    caption: 'Neglect takes its toll — the Demo pet fades into a ghost by its grave.',
    holdMs: HOLD_MS,
    apply: (pet) => {
      Object.assign(pet, {
        health: 0,
        ghost: true,
        ghostSince: Date.now(),
        revive: 0,
        sleepy: false,
        distracted: false,
        calls: {},
      });
      return ['died'];
    },
  },
  {
    id: 'revive',
    caption: 'You finish more work — the Demo pet is revived and lives again!',
    holdMs: HOLD_MS,
    apply: (pet, P) => {
      const events = [];
      // Each big task gives +60 revive; keep feeding until the pet is alive again.
      // Guard the loop so a misbehaving feed can never spin forever.
      for (let i = 0; i < 100 && pet.ghost; i += 1) {
        events.push(...P.feed(pet, 'task-L'));
      }
      return events;
    },
  },
];

// A fresh Demo_Pet: a standard pet from P.createPet('Demo'), held in memory only
// and never serialized. It starts as an egg; the first step (hatch) brings it to
// a baby that is ready to feed.
function createDemoPet(P, now = Date.now()) {
  return P.createPet('Demo', now);
}

// Run a single step's mutation against the pet and return its event list.
function applyStep(pet, step, P) {
  return step.apply(pet, P) || [];
}

// Total time the story stays on screen — summed from each step's holdMs.
// Asserted by tests to land in [45000, 90000] ms.
function totalDurationMs() {
  return DEMO_STEPS.reduce((sum, step) => sum + step.holdMs, 0);
}

// The single source for a step's caption (and thus the ≤ 80-char bound).
function captionFor(step) {
  return step.caption;
}

module.exports = {
  DEMO_STEPS,
  createDemoPet,
  applyStep,
  totalDurationMs,
  captionFor,
};
