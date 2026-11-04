// Days, streaks and unlocks (pure, testable). Lives in the player's profile,
// so streaks carry over when a pet retires and a new egg hatches.

const dayKey = (ms = Date.now()) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const prevKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
};

// A "good day": 2 tasks, or 1 task + 1 verified focus session, or 2 focus sessions
const isGood = (day) => day.tasks >= 2 || (day.tasks >= 1 && day.focus >= 1) || day.focus >= 2;

// Things you unlock with streaks (equip them in the Pet tab)
const UNLOCKS = [
  { id: 'bow', name: 'Bow', streak: 3 },
  { id: 'cap', name: 'Cap', streak: 7 },
  { id: 'shades', name: 'Sunglasses', streak: 14 },
  { id: 'wizard', name: 'Wizard hat', streak: 30 },
];

function emptyProfile() {
  return {
    achievements: {}, // id -> time unlocked
    graveyard: [],
    postcards: [],
    highScores: {},
    days: {}, // 'YYYY-MM-DD' -> { tasks, large, focus, vacation, good }
    streak: 0,
    bestStreak: 0,
    lastGoodDay: null,
    equipped: null,
    totals: {},
  };
}

function today(profile, now = Date.now()) {
  const key = dayKey(now);
  if (!profile.days[key]) profile.days[key] = { tasks: 0, large: 0, focus: 0, vacation: false, good: false };
  return profile.days[key];
}

// Was the streak still alive going into `key`? Vacation days are skipped over.
function continues(profile, key) {
  let k = prevKey(key);
  for (let i = 0; i < 60; i++) {
    const d = profile.days[k];
    if (d && d.good) return true;
    if (!(d && d.vacation)) return false;
    k = prevKey(k);
  }
  return false;
}

// Current streak, as of `now` (0 if yesterday was missed)
function currentStreak(profile, now = Date.now()) {
  const key = dayKey(now);
  const t = profile.days[key];
  if (t && t.good) return profile.streak;
  return continues(profile, key) ? profile.streak : 0;
}

// Record something done today. kind: 'task' | 'large' | 'focus' | 'vacation'
// Returns events: 'good-day' (once per day), 'streak' (with the new value), 'unlock:<id>'
function record(profile, kind, now = Date.now()) {
  const events = [];
  const d = today(profile, now);
  if (kind === 'task') d.tasks += 1;
  if (kind === 'large') { d.tasks += 1; d.large += 1; }
  if (kind === 'focus') d.focus += 1;
  if (kind === 'vacation') d.vacation = true;
  if (!d.good && isGood(d)) {
    d.good = true;
    const key = dayKey(now);
    profile.streak = continues(profile, key) ? profile.streak + 1 : 1;
    profile.lastGoodDay = key;
    const before = profile.bestStreak;
    profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
    events.push('good-day', 'streak');
    for (const u of UNLOCKS) if (before < u.streak && profile.bestStreak >= u.streak) events.push(`unlock:${u.id}`);
  }
  return events;
}

// Longest run of consecutive days with at least `n` tasks, ending today
function runOfDays(profile, n, now = Date.now()) {
  let k = dayKey(now);
  let run = 0;
  for (let i = 0; i < 400; i++) {
    const d = profile.days[k];
    if (d && d.tasks >= n) run += 1;
    else if (i > 0 || !d) break; // today may still be in progress
    else break;
    k = prevKey(k);
  }
  return run;
}

const unlocked = (profile) => UNLOCKS.filter((u) => profile.bestStreak >= u.streak).map((u) => u.id);

module.exports = { dayKey, prevKey, isGood, UNLOCKS, emptyProfile, today, record, currentStreak, runOfDays, unlocked };
