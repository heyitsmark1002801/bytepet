// 50 achievements. Each `test` gets { pet, profile, t (lifetime totals), day (today), open (open tasks), streak }.
// Progress is kept in the player's profile, so badges survive when a pet retires.

const A = (id, emoji, name, desc, test) => ({ id, emoji, name, desc, test });
const n = (t, k) => t[k] || 0;

const ACHIEVEMENTS = [
  // Tasks
  A('first-task', '🍙', 'First Bite', 'Finish your first task.', ({ t }) => n(t, 'tasks') >= 1),
  A('first-large', '🍱', 'Big Appetite', 'Finish a large task.', ({ t }) => n(t, 'tasksL') >= 1),
  A('tasks-10', '🥡', 'Snack Pack', 'Finish 10 tasks.', ({ t }) => n(t, 'tasks') >= 10),
  A('tasks-50', '🐝', 'Busy Bee', 'Finish 50 tasks.', ({ t }) => n(t, 'tasks') >= 50),
  A('tasks-100', '💯', 'Centurion', 'Finish 100 tasks.', ({ t }) => n(t, 'tasks') >= 100),
  A('large-10', '🏋️', 'Heavy Lifter', 'Finish 10 large tasks.', ({ t }) => n(t, 'tasksL') >= 10),
  A('small-25', '⚡', 'Quick Wins', 'Finish 25 small tasks.', ({ t }) => n(t, 'tasksS') >= 25),
  A('day-5', '📅', 'Productive Day', 'Finish 5 tasks in one day.', ({ day }) => day.tasks >= 5),
  A('day-10', '🚀', 'Unstoppable', 'Finish 10 tasks in one day.', ({ day }) => day.tasks >= 10),
  A('inbox-zero', '📭', 'Inbox Zero', 'Clear your whole to-do list.', ({ open, day }) => open === 0 && day.tasks >= 1),
  A('early-bird', '🌅', 'Early Bird', 'Finish a task before 7 AM.', ({ t }) => n(t, 'earlyTasks') >= 1),
  A('night-owl', '🦉', 'Night Owl', 'Finish a task between midnight and 4 AM.', ({ t }) => n(t, 'nightTasks') >= 1),
  A('just-in-time', '⏱️', 'Just in Time', 'Finish a task in the last 15 minutes before its deadline.', ({ t }) => n(t, 'justInTime') >= 1),

  // Focus & code
  A('focus-1', '🎯', 'In the Zone', 'Complete a verified focus session.', ({ t }) => n(t, 'focusSessions') >= 1),
  A('focus-10', '🧠', 'Deep Worker', 'Complete 10 verified focus sessions.', ({ t }) => n(t, 'focusSessions') >= 10),
  A('focus-50', '🧘', 'Monk Mode', 'Complete 50 verified focus sessions.', ({ t }) => n(t, 'focusSessions') >= 50),
  A('focus-day-4', '🏃', 'Marathon', 'Complete 4 focus sessions in one day.', ({ day }) => day.focus >= 4),
  A('commit-1', '🌱', 'Hello, Git', 'Feed your pet with a commit.', ({ t }) => n(t, 'commits') >= 1),

  // Streaks & age
  A('streak-3', '🔥', 'On a Roll', 'Reach a 3-day streak.', ({ profile }) => profile.bestStreak >= 3),
  A('streak-7', '📆', 'Week Strong', 'Reach a 7-day streak.', ({ profile }) => profile.bestStreak >= 7),
  A('streak-14', '🌗', 'Fortnight', 'Reach a 14-day streak.', ({ profile }) => profile.bestStreak >= 14),
  A('streak-30', '🏆', 'Habit Formed', 'Reach a 30-day streak.', ({ profile }) => profile.bestStreak >= 30),
  A('finals', '🎓', 'Survived Finals Week', '7 days in a row with 3+ tasks each.', ({ t }) => n(t, 'bestRun3') >= 7),
  A('age-10', '🎂', 'Ten Years Old', 'Raise a pet to age 10 (10 good days).', ({ pet }) => (pet.age || 0) >= 10),

  // Raising your pet
  A('hatch', '🥚', "It's Alive!", 'Hatch an egg.', ({ t }) => n(t, 'hatches') >= 1),
  A('child', '🐣', 'Growing Up', 'Raise your pet to a child.', ({ t }) => n(t, 'childReached') >= 1),
  A('adult', '🐥', 'All Grown Up', 'Raise your pet to an adult.', ({ t }) => n(t, 'adultReached') >= 1),
  A('star', '📖', 'Collector', 'Discover 3 different adult forms in the Petdex.', ({ profile }) => Object.keys(profile.petdex || {}).length >= 3),
  A('grumpy', '😤', 'Tough Love', 'Raise a Grumpy or Gamer adult.', ({ t }) => n(t, 'grumpyAdults') >= 1),
  A('perfect', '👑', 'Perfect Parent', 'Raise an adult with zero care mistakes.', ({ t }) => n(t, 'perfectAdults') >= 1),
  A('revived', '👻', 'Resurrection', 'Bring a ghost back to life.', ({ t }) => n(t, 'revivals') >= 1),
  A('retired', '🌅', 'Happy Retirement', 'Retire a pet.', ({ t }) => n(t, 'retirements') >= 1),
  A('dynasty', '🌳', 'Dynasty', 'Hatch 3 generations of pets.', ({ t }) => n(t, 'hatches') >= 3),
  A('pats-100', '🤲', 'Head Pats', 'Pat your pet 100 times.', ({ t }) => n(t, 'pats') >= 100),

  // Care
  A('lights-1', '💡', 'Lights Out', 'Take a screen break when your pet is sleepy.', ({ t }) => n(t, 'lightsOff') >= 1),
  A('cured', '💊', 'Patched Up', 'Install updates to cure your pet.', ({ t }) => n(t, 'cures') >= 1),
  A('refocus-10', '🧭', 'Back on Track', 'Get back to work after a distraction 10 times.', ({ t }) => n(t, 'refocused') >= 10),
  A('discipline-90', '🎖️', 'Well Behaved', 'Reach 90 discipline.', ({ pet }) => pet.discipline >= 90),
  A('clean-1', '🧻', 'Squeaky Clean', 'Clean up a digital mess.', ({ t }) => n(t, 'cleanups') >= 1),
  A('clean-10', '🧹', 'Neat Freak', 'Clean up 10 messes.', ({ t }) => n(t, 'cleanups') >= 10),

  // Games
  A('game-1', '🕹️', 'Game On', 'Play a mini-game.', ({ t }) => n(t, 'gamesPlayed') >= 1),
  A('arcade', '👾', 'Arcade Regular', 'Play all 5 mini-games.', ({ t }) => ['brick', 'catch', 'guess', 'memory', 'stretch'].every((g) => n(t, `played_${g}`) >= 1)),
  A('brick-win', '🧱', 'Brick Buster', 'Clear every brick in Brick Breaker.', ({ t }) => n(t, 'brickWins') >= 1),
  A('memory-8', '🔔', 'Memory Master', 'Reach 8 in Memory Beeps.', ({ profile }) => (profile.highScores.memory || 0) >= 8),
  A('catch-30', '🧺', 'Snack Champ', 'Catch 30 snacks in one game.', ({ profile }) => (profile.highScores.catch || 0) >= 30),
  A('guess-5', '🔮', 'Mind Reader', 'Guess right 5 times in Left or Right.', ({ profile }) => (profile.highScores.guess || 0) >= 5),
  A('stretch-5', '🤸', 'Limber Up', 'Finish 5 stretch breaks.', ({ t }) => n(t, 'stretches') >= 5),

  // Fun
  A('dance-30', '💃', 'Dance Machine', 'Dance to music for 30 minutes.', ({ t }) => n(t, 'danceMinutes') >= 30),
  A('vacation', '🧳', 'Bon Voyage', 'Send your pet on vacation.', ({ t }) => n(t, 'vacations') >= 1),
  A('postcards-5', '🗺️', 'Globetrotter', 'Collect 5 postcards.', ({ profile }) => profile.postcards.length >= 5),
];

// Check everything; returns the newly unlocked achievements
function evaluate(profile, ctx, now = Date.now()) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.test({ ...ctx, profile, t: profile.totals || {} }); } catch { ok = false; }
    if (ok) {
      profile.achievements[a.id] = now;
      fresh.push({ id: a.id, emoji: a.emoji, name: a.name, desc: a.desc });
    }
  }
  return fresh;
}

const catalog = () => ACHIEVEMENTS.map(({ id, emoji, name, desc }) => ({ id, emoji, name, desc }));

module.exports = { ACHIEVEMENTS, evaluate, catalog };
