// Pure guided-tour script: no Electron here, so it can be tested with plain Node,
// exactly like src/pet-state.js and src/demo-script.js. This module holds the
// scripted walkthrough of the Bytepet Hub/Tasks window as plain data plus small
// pure helpers. The renderer (renderer/tour.js) owns the thin glue — the spotlight
// overlay, the positioned text bubble, Next/Back/Skip buttons and tab switching.
// Here we only describe *what* each stop points at, *which tab* it lives on, and
// *what to say* about it.
//
// Each stop names a `target` CSS selector in the Tasks/Hub window, the `tab` that
// must be shown for that target to be visible, a short `title`, a plain-language
// `body` explaining how that part of the app works, and a `placement` hint for
// where to float the bubble relative to the highlighted element.

// Where the bubble floats relative to its target. The renderer falls back to a
// centred bubble when a target is missing or there isn't room on the chosen side.
const PLACEMENTS = ['top', 'bottom', 'left', 'right', 'center'];

// The guided walkthrough, in order. Each stop is one screenful of explanation.
// Bodies stay short (a sentence or two) so the bubble never covers the thing it
// points at. The first and last stops have no `target` so they read as a centred
// welcome/finish card.
const TOUR_STEPS = [
  {
    id: 'welcome',
    tab: 'tasks',
    target: null,
    placement: 'center',
    title: 'Welcome to Bytepet! 👋',
    body: 'This is your pet\'s home base. I\'ll show you around in a few quick steps — how to feed it, keep it focused and watch it grow. Click Next to start.',
  },
  {
    id: 'tabs',
    tab: 'tasks',
    target: '#tabs',
    placement: 'bottom',
    title: 'Everything lives up here',
    body: 'These tabs are your whole app: Tasks, Focus, Pet, Badges, Games, Memories and Settings. I\'ll walk through the important ones.',
  },
  {
    id: 'add-task',
    tab: 'tasks',
    target: '#add',
    placement: 'bottom',
    title: 'Feed it by finishing work 🍙',
    body: 'Add a task here and pick a size: small = 1 food, medium = 2, large = 3. Every task you finish feeds your pet.',
  },
  {
    id: 'task-list',
    tab: 'tasks',
    target: '#open-list',
    placement: 'top',
    title: 'Your to-do list',
    body: 'Tasks show up here. Hit ✓ to finish one and feed your pet, ▶ to start a focus session on it, or ✕ to drop it.',
  },
  {
    id: 'connections',
    tab: 'tasks',
    target: '#connections',
    placement: 'top',
    title: 'Bring in your real tasks',
    body: 'Connect Apple Reminders, Todoist, your calendar or GitHub, and those tasks feed your pet too. Everything stays on your Mac.',
  },
  {
    id: 'focus',
    tab: 'focus',
    target: '[data-panel="focus"]',
    placement: 'center',
    title: 'Focus keeps it happy 🎯',
    body: 'Start a focus session and stay on task. Verified focus earns XP and joy. Distracting apps and sites make your pet sad, so the chart shows how your day went.',
  },
  {
    id: 'pet',
    tab: 'pet',
    target: '.pet-top',
    placement: 'bottom',
    title: 'Meet your pet',
    body: 'Here are its meters, age and streak. Work well while it\'s a child and it grows into a Coder, Writer, Artist, Night Owl and more.',
  },
  {
    id: 'badges',
    tab: 'achievements',
    target: '[data-panel="achievements"]',
    placement: 'center',
    title: 'Earn badges 🏆',
    body: 'Fifty achievements to unlock as you care for your pet over its whole life — streaks, focus, clean habits and more.',
  },
  {
    id: 'games',
    tab: 'games',
    target: '#game-list',
    placement: 'top',
    title: 'Play together 🎮',
    body: 'Five little games that run right on your desktop. Playing cheers your pet up (but it costs a bit of energy).',
  },
  {
    id: 'settings',
    tab: 'settings',
    target: '[data-panel="settings"]',
    placement: 'center',
    title: 'Make it yours ⚙️',
    body: 'Rename your pet, set quiet hours, pick what counts as a distraction, and tune notifications. You can re-run this setup here any time.',
  },
  {
    id: 'done',
    tab: 'pet',
    target: null,
    placement: 'center',
    title: 'That\'s the tour! 🎉',
    body: 'Your egg is hatching at the bottom-right of your screen. Click it to say hi, finish a task to feed it, and check back whenever you like.',
  },
];

// Total number of stops — the renderer shows "Step n of total" from this.
function totalSteps() {
  return TOUR_STEPS.length;
}

// Clamp an index into the valid range so Next/Back can never run off either end.
function clampIndex(i) {
  const n = Number(i);
  if (Number.isNaN(n)) return 0; // junk / non-numeric input → start of the tour
  if (n === Infinity) return TOUR_STEPS.length - 1;
  if (n === -Infinity) return 0;
  return Math.max(0, Math.min(TOUR_STEPS.length - 1, Math.trunc(n)));
}

// The stop at a (clamped) index — the single source the renderer reads each step.
function stepAt(i) {
  return TOUR_STEPS[clampIndex(i)];
}

// True when the given index is the final stop (so the button reads "Done").
function isLast(i) {
  return clampIndex(i) === TOUR_STEPS.length - 1;
}

const TourAPI = {
  PLACEMENTS,
  TOUR_STEPS,
  totalSteps,
  clampIndex,
  stepAt,
  isLast,
};

// Dual export: a Node module for the tests, and a browser global for the Hub
// renderer (which loads src/ files with a plain <script> tag, no require()).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TourAPI;
}
if (typeof window !== 'undefined') {
  window.BytepetTour = TourAPI;
}
