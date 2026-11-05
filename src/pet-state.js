// Pure pet logic: no Electron here, so it can be tested with plain Node.
// Meters run 0..100. Food is counted in "food units": 1 unit = 20 points, so 5 units = full.
//
// Care system (inspired by 90s handheld pets):
//   Food        ← finished tasks (small 1 unit, medium 2, large 3) and commits
//   XP          ← tasks (10 / 20 / 40), verified 25-min focus sessions (+10), commits (+5)
//   Lights      ← too much screen time or bedtime: the pet goes to bed and needs
//                 the "lights off" — lock the screen or take a real break
//   Medicine    ← pending software updates make it sick; updating cures it
//   Discipline  ← too long on distracting apps/sites makes it sad; going back to work fixes it
//   Attention   ← meetings, deadlines and things that need action make it call you
//   Care        ← ignored calls and missed deadlines are care mistakes;
//                 how you work while it grows decides its adult form (see FORMS)

const clamp = (v) => Math.max(0, Math.min(100, v));
const FOOD_UNIT = 20;

const STAGES = [
  { name: 'egg', minXp: 0 },
  { name: 'baby', minXp: 5 },
  { name: 'child', minXp: 150 },
  { name: 'adult', minXp: 600 },
];

// What each kind of work is worth
const REWARDS = {
  'task-S': { units: 1, xp: 10, joy: 4, revive: 20 },
  'task-M': { units: 2, xp: 20, joy: 6, revive: 35 },
  'task-L': { units: 3, xp: 40, joy: 10, revive: 60 },
  commit: { units: 0.5, xp: 5, joy: 3, revive: 15 },
  'focus-session': { units: 0, xp: 10, joy: 8, revive: 20 },
  focus: { units: 0.005, xp: 0, joy: 0.05, revive: 1 }, // each minute in a work app: slows hunger a little
};

// Balance (per minute at the computer), tuned so a normal workday feels like a classic handheld pet:
//   • Food drops ~1 unit an hour (≈ 0.75/hour while working) → 3–4 medium tasks a day keep it fed.
//   • Joy drops ~12/hour → tasks, focus sessions, a game or some music keep it up; pats help a little.
//   • Starving drains health over ~4–5 hours, so neglect is serious but never instant.
//   • Overnight (computer asleep) it only gets a bit hungry and can't die.
// How the five meters work together (like a classic handheld pet):
//   🍙 Food       drops over time            ← tasks
//   💗 Joy        drops over time            ← tasks, focus, games, music, pats; drops faster when tired or sad
//   ⚡ Energy     up while charging, down on battery; drops faster when hungry or sleepy; sleep refills it
//   🎖️ Discipline drops on distractions      ← working, going back to work
//   💚 Health     drops when starving, sick, dirty (worse with flies), joyless, undisciplined or sulking;
//                 heals only when all is well; medicine (installing updates) gives +30. At 0 it dies.
const BALANCE = {
  hungerAwake: 0.33, hungerAway: 0.08,
  joyAwake: 0.2, joySleepy: 0.5, joyDistracted: 0.6, joyBinge: 5, joyTired: 0.3,
  energyCharging: 0.15, energyBattery: 0.25, energyHungry: 0.2, energySleepy: 0.2, energyAway: 1.5,
  healthStarving: 0.35, healthIgnoredSleepy: 0.2, healthRegen: 0.3,
  healthSick: 0.08, healthDirty: 0.02, healthFlies: 0.05, healthMessSick: 0.05,
  healthJoyless: 0.05, healthUndisciplined: 0.05, healthDistracted: 0.1, healthMissedDeadline: 20,
  disciplineDistracted: 1.5, disciplineWorking: 0.2, disciplineRefocus: 5,
  patJoy: 2, patBudgetMax: 8, patBudgetRegen: 0.1, basketJoy: 1,
};

// Minutes a call can go unanswered before it becomes a care mistake
const CALL_LIMITS = { hungry: 30, sleepy: 15, distracted: 10, sick: 24 * 60, dirty: 120, attention: Infinity };
const FLIES_AFTER = 60; // minutes of uncleaned mess before flies show up
const MESS_SICK_AFTER = 120; // ...and before it makes the pet sick

const DECAY = { hunger: BALANCE.hungerAwake, hungerAsleep: BALANCE.hungerAway }; // per minute

function createPet(name = 'Byte', now = Date.now()) {
  return {
    name,
    born: now,
    lastTick: now,
    xp: 0,
    stage: 'egg',
    form: null,
    hunger: 80,
    energy: 80,
    happiness: 80,
    health: 100,
    discipline: 50,
    careMistakes: 0,
    ghost: false,
    revive: 0,
    asleep: false,
    sleepy: false,
    activeStreak: 0,
    needsMedicine: false,
    sickMinutes: 0,
    distracted: false, // sad from too much distraction
    distractedMinutes: 0, // in a row
    distractionToday: 0,
    day: new Date(now).toDateString(),
    alertCount: 0, // attention: things that need action (set by the app)
    poop: [], // digital mess piles: [{ kind, count, limit }]
    messMinutes: 0,
    messSick: false,
    vacation: null, // { since } while away
    age: 0, // "years": one per good day
    generation: 1,
    ghostSince: null,
    calls: {},
    petBudget: BALANCE.patBudgetMax,
    style: emptyStyle(), // how you work while it grows up → its adult form
    stats: {
      commits: 0, focusMinutes: 0, focusSessions: 0, tasks: 0, revivals: 0,
      breaks: 0, cures: 0, missedDeadlines: 0, cleanups: 0,
    },
  };
}

function stageForXp(xp) {
  let s = STAGES[0].name;
  for (const st of STAGES) if (xp >= st.minXp) s = st.name;
  return s;
}

// The 8 adult forms. Your habits while it grows up decide which one you get.
const FORMS = {
  nightowl: { name: 'Night Owl', desc: 'Works mostly late at night.' },
  coder: { name: 'Coder', desc: 'Lots of code and commits.' },
  writer: { name: 'Writer', desc: 'Mostly in Word, Pages, Notes or Docs.' },
  artist: { name: 'Artist', desc: 'Uses Blender, Figma and other creative apps.' },
  zen: { name: 'Zen Master', desc: 'Takes all its breaks and stays disciplined.' },
  scholar: { name: 'Scholar', desc: 'Finishes big tasks and focus sessions.' },
  gamer: { name: 'Gamer', desc: 'Spent a lot of time distracted…' },
  grumpy: { name: 'Grumpy', desc: 'Too many care mistakes.' },
};

const emptyStyle = () => ({ night: 0, code: 0, write: 0, art: 0, other: 0, commits: 0, breaks: 0, focus: 0, large: 0, distract: 0 });

function adultForm(pet) {
  const st = { ...emptyStyle(), ...(pet.style || {}) };
  if (pet.careMistakes > 5) return 'grumpy';
  const work = st.code + st.write + st.art + st.other;
  if (st.distract > Math.max(60, work * 0.6)) return 'gamer';
  const scores = {
    nightowl: st.night * 1.5,
    coder: st.code + st.commits * 8,
    writer: st.write * 1.2,
    artist: st.art * 1.3,
    zen: st.breaks * 25 + (pet.discipline >= 80 ? 60 : 0),
    scholar: st.large * 20 + st.focus * 12,
  };
  let best = 'zen';
  let top = 0;
  for (const [form, score] of Object.entries(scores)) if (score > top) { top = score; best = form; }
  return best;
}

function addXp(pet, amount) {
  const events = [];
  pet.xp += amount;
  const next = stageForXp(pet.xp);
  if (next !== pet.stage && !pet.ghost) {
    pet.stage = next;
    if (next === 'adult') pet.form = adultForm(pet);
    events.push('evolved');
  }
  return events;
}

function careMistake(pet, events) {
  pet.careMistakes += 1;
  events.push('care-mistake');
}

const foodUnits = (pet) => Math.round((pet.hunger / FOOD_UNIT) * 10) / 10;

// What the pet needs right now (each one "calls" you)
function needs(pet) {
  if (pet.ghost || pet.stage === 'egg') return [];
  const n = [];
  if (pet.hunger < FOOD_UNIT) n.push('hungry');
  if (pet.sleepy && !pet.asleep) n.push('sleepy');
  if (pet.needsMedicine) n.push('sick');
  if (pet.distracted) n.push('distracted');
  if (pet.poop && pet.poop.length) n.push('dirty');
  if (pet.alertCount > 0) n.push('attention');
  return n;
}

// Sleep, like a classic handheld pet:
//   • Nap: you stepped away (screen locked or idle 5+ min). Wakes up as soon as you're back.
//     Turning the lights off by hand during the day gives a 20-minute nap.
//   • Night: lights off at bedtime (lock the screen or click the sleepy pet). It sleeps until
//     your wake-up hour, even if you keep using the computer, and says good morning when you're back.
// opts = { night, wakeAt, now, napMinutes }
function lightsOff(pet, opts = {}) {
  const events = [];
  if (pet.ghost || pet.asleep || pet.stage === 'egg' || pet.vacation) return events;
  const now = opts.now || Date.now();
  events.push(pet.sleepy ? 'lights-off' : 'fell-asleep');
  if (pet.sleepy && pet.stage !== 'adult') pet.style = { ...emptyStyle(), ...(pet.style || {}), breaks: ((pet.style || {}).breaks || 0) + 1 };
  if (pet.sleepy) pet.happiness = clamp(pet.happiness + 10);
  pet.asleep = true;
  pet.sleepKind = opts.night ? 'night' : 'nap';
  pet.asleepUntil = opts.night ? (opts.wakeAt || now + 8 * 3600e3) : opts.napMinutes ? now + opts.napMinutes * 60000 : null;
  pet.sleepy = false;
  pet.activeStreak = 0;
  pet.distracted = false;
  pet.distractedMinutes = 0;
  pet.stats.breaks += 1;
  return events;
}

// Back to work: no longer sad from a distraction
function refocus(pet) {
  if (!pet.distracted) return [];
  pet.distracted = false;
  pet.distractedMinutes = 0;
  pet.cleanMinutes = 0;
  pet.discipline = clamp(pet.discipline + BALANCE.disciplineRefocus);
  return ['refocused']; // distractionSource is kept so the pet can say "Bye YouTube!"; cleared next minute
}

function wakeUp(pet, kind = 'woke-up') {
  if (!pet.asleep) return [];
  pet.asleep = false;
  pet.sleepKind = null;
  pet.asleepUntil = null;
  pet.sleepy = false;
  pet.activeStreak = 0;
  return [kind];
}

// Should it wake up now? `back` = you're at the computer.
function shouldWake(pet, back, now = Date.now()) {
  if (!pet.asleep) return null;
  if (pet.sleepKind === 'night') return back && now >= (pet.asleepUntil || 0) ? 'good-morning' : null;
  if (pet.asleepUntil) return now >= pet.asleepUntil ? 'woke-up' : null; // a nap with the lights off by hand
  return back ? 'woke-up' : null; // napped while you were away
}

// One simulated minute.
// ctx = { idleSeconds, locked, working, distracting, music, night, screenLimit,
//         distractionAllowance, now }
function tickMinute(pet, ctx = {}) {
  const events = [];
  const now = ctx.now || Date.now();
  if (pet.vacation) { pet.calls = {}; return events; } // away on a trip: everything paused
  if (pet.ghost) { pet.calls = {}; return events; }

  const today = new Date(now).toDateString();
  if (pet.day !== today) { pet.day = today; pet.distractionToday = 0; }

  const idle = ctx.idleSeconds || 0;
  const away = ctx.locked || idle >= 300;
  const active = !away && idle < 120;

  const wake = shouldWake(pet, !away, now);
  if (wake) events.push(...wakeUp(pet, wake));
  if (!pet.asleep && away) events.push(...lightsOff(pet, { night: ctx.night, wakeAt: ctx.wakeAt, now }));

  if (pet.asleep) {
    // sleeping (napping while you're away, or a night's sleep): rests and gets a little hungry
    pet.energy = clamp(pet.energy + BALANCE.energyAway);
    pet.hunger = clamp(pet.hunger - DECAY.hungerAsleep);
    pet.activeStreak = 0;
    pet.sleepy = false;
  } else {
    if (active) pet.activeStreak += 1;

    // Lights: too long on screen, or bedtime
    const wantsBed = pet.stage !== 'egg' && (ctx.night || pet.activeStreak >= (ctx.screenLimit || 120));
    if (wantsBed && !pet.sleepy) {
      pet.sleepy = true;
      events.push(ctx.night ? 'bedtime' : 'screen-too-long');
    }
    if (!wantsBed) pet.sleepy = false;

    // ⚡ Energy: charging tops it up, running on battery drains it; hunger and sleepiness drain it faster
    const charging = ctx.charging !== false; // desktops (no battery) count as plugged in
    let energy = charging ? BALANCE.energyCharging : -BALANCE.energyBattery;
    if (pet.hunger < FOOD_UNIT) energy -= BALANCE.energyHungry;
    if (pet.sleepy) energy -= BALANCE.energySleepy;
    pet.energy = clamp(pet.energy + energy);

    // 💗 Joy drops over time, faster when sleepy or worn out
    pet.happiness = clamp(pet.happiness - (pet.sleepy ? BALANCE.joySleepy : BALANCE.joyAwake));
    if (pet.energy < 15) pet.happiness = clamp(pet.happiness - BALANCE.joyTired);

    // 🍙 Food drops over time
    pet.hunger = clamp(pet.hunger - DECAY.hunger);

    // Discipline: too much time on distracting apps or sites makes it sad
    if (ctx.distracting && active) {
      // Escalates like a misbehaving handheld pet: notices → restless → sad → sulking
      pet.distractedMinutes += 1;
      pet.distractionToday += 1;
      pet.cleanMinutes = 0;
      pet.distractionSource = ctx.distractionSource || null;
      pet.discipline = clamp(pet.discipline - BALANCE.disciplineDistracted);
      const after = ctx.distractedAfter || 5;
      const overBudget = pet.distractionToday > (ctx.distractionAllowance ?? 45);
      if (!pet.distracted && pet.distractedMinutes === 1 && !overBudget) events.push('distraction-notice');
      if (!pet.distracted && after >= 3 && pet.distractedMinutes === Math.ceil(after / 2)) events.push('distraction-warning');
      if (!pet.distracted && (pet.distractedMinutes >= after || overBudget)) {
        pet.distracted = true;
        events.push('distracted');
      }
      if (pet.distracted) pet.happiness = clamp(pet.happiness - BALANCE.joyDistracted);
      if (pet.distracted && pet.distractedMinutes > 0 && pet.distractedMinutes % 10 === 0 && pet.distractedMinutes % 30 !== 0) {
        events.push('distraction-reminder');
      }
      if (pet.distractedMinutes > 0 && pet.distractedMinutes % 30 === 0) {
        pet.happiness = clamp(pet.happiness - BALANCE.joyBinge);
        events.push('binge');
      }
    } else {
      // cheer up after going back to work, or after 2 clean minutes in a row
      pet.cleanMinutes = (pet.cleanMinutes || 0) + 1;
      if (pet.distracted && (ctx.working || pet.cleanMinutes >= 2)) {
        pet.distracted = false;
        pet.discipline = clamp(pet.discipline + BALANCE.disciplineRefocus);
        events.push('refocused');
      }
      if (!pet.distracted) { pet.distractedMinutes = 0; pet.distractionSource = null; }
    }
    if (ctx.working) pet.discipline = clamp(pet.discipline + BALANCE.disciplineWorking);
    if (pet.stage !== 'adult') {
      pet.style = { ...emptyStyle(), ...(pet.style || {}) };
      if (ctx.working) {
        pet.style[ctx.workKind && pet.style[ctx.workKind] != null ? ctx.workKind : 'other'] += 1;
        if (ctx.late) pet.style.night += 1;
      }
      if (ctx.distracting && active) pet.style.distract += 1;
    }
    if (ctx.music && !pet.sleepy) pet.happiness = clamp(pet.happiness + 0.4);
  }

  // 💩 Mess: poop left alone attracts flies, then makes the pet sick
  const dirty = !!(pet.poop && pet.poop.length);
  if (dirty) {
    pet.messMinutes += 1;
    if (pet.messMinutes >= FLIES_AFTER && !pet.flies) { pet.flies = true; events.push('flies'); }
    if (pet.messMinutes >= MESS_SICK_AFTER && !pet.messSick) { pet.messSick = true; events.push('mess-sick'); }
  }

  // 💊 Sick: Mac updates waiting
  if (pet.needsMedicine) {
    pet.sickMinutes += 1;
    pet.happiness = clamp(pet.happiness - 0.2);
  }

  // 💚 Health: everything that's wrong hurts a little; it only heals when all is well
  const hurts = [];
  if (pet.hunger <= 0) hurts.push(BALANCE.healthStarving);
  if (pet.needsMedicine) hurts.push(BALANCE.healthSick);
  if (dirty) hurts.push(BALANCE.healthDirty);
  if (pet.flies) hurts.push(BALANCE.healthFlies);
  if (pet.messSick) hurts.push(BALANCE.healthMessSick);
  if (pet.happiness < 20 && !pet.asleep) hurts.push(BALANCE.healthJoyless);
  if (pet.discipline < 20 && !pet.asleep) hurts.push(BALANCE.healthUndisciplined);
  if (pet.distracted && !pet.asleep) hurts.push(BALANCE.healthDistracted);
  if (pet.sleepy && !pet.asleep && (pet.calls.sleepy || 0) > CALL_LIMITS.sleepy) hurts.push(BALANCE.healthIgnoredSleepy);
  if (hurts.length) pet.health = clamp(pet.health - hurts.reduce((a, b) => a + b, 0));
  else if (pet.hunger > 40 && pet.happiness > 30) pet.health = clamp(pet.health + BALANCE.healthRegen);

  // Attention: calls and care mistakes
  const current = needs(pet);
  for (const need of current) {
    if (!(need in pet.calls)) {
      pet.calls[need] = 0;
      events.push(`call-${need}`);
    } else {
      pet.calls[need] += 1;
      if (pet.calls[need] === CALL_LIMITS[need]) careMistake(pet, events);
    }
  }
  for (const need of Object.keys(pet.calls)) if (!current.includes(need)) delete pet.calls[need];

  pet.petBudget = Math.min(BALANCE.patBudgetMax, (pet.petBudget ?? BALANCE.patBudgetMax) + BALANCE.patBudgetRegen);

  if (pet.health <= 0) {
    Object.assign(pet, { ghost: true, ghostSince: now, revive: 0, asleep: false, sleepy: false, distracted: false, calls: {} });
    events.push('died');
  }
  return events;
}

// Digital mess (Desktop, Downloads, browser tabs, Trash). `piles` = [{ kind, count, limit }]
function setMess(pet, piles) {
  const events = [];
  const before = (pet.poop || []).map((p) => p.kind);
  const after = piles.map((p) => p.kind);
  pet.poop = piles;
  if (after.some((k) => !before.includes(k)) && !pet.ghost && pet.stage !== 'egg' && !pet.vacation) events.push('pooped');
  const cleaned = before.filter((k) => !after.includes(k));
  if (cleaned.length) {
    pet.stats.cleanups += cleaned.length;
    pet.happiness = clamp(pet.happiness + 5 * cleaned.length);
    events.push('flushed');
  }
  if (!piles.length) {
    pet.messMinutes = 0;
    pet.flies = false;
    if (pet.messSick) { pet.messSick = false; events.push('mess-cured'); }
  }
  return events;
}

// Vacation: everything pauses while you're away
function startVacation(pet, now = Date.now()) {
  if (pet.vacation) return [];
  pet.vacation = { since: now };
  pet.calls = {};
  return ['vacation-start'];
}
function endVacation(pet, now = Date.now()) {
  if (!pet.vacation) return { events: [], hours: 0 };
  const hours = (now - pet.vacation.since) / 3600e3;
  pet.vacation = null;
  pet.lastTick = now;
  pet.activeStreak = 0;
  pet.energy = 100;
  pet.happiness = clamp(pet.happiness + 20);
  return { events: ['vacation-end'], hours };
}

// One good day = one year of age
function ageUp(pet) {
  if (pet.ghost || pet.stage === 'egg') return [];
  pet.age += 1;
  return ['birthday'];
}

// A gravestone for the graveyard
function gravestone(pet, cause, now = Date.now()) {
  return {
    name: pet.name,
    generation: pet.generation || 1,
    born: pet.born,
    died: now,
    cause, // 'retired' | 'faded'
    stage: pet.stage,
    form: pet.form,
    age: pet.age || 0,
    careMistakes: pet.careMistakes,
    stats: {
      tasks: pet.stats.tasks, focusSessions: pet.stats.focusSessions, focusMinutes: pet.stats.focusMinutes,
      breaks: pet.stats.breaks, commits: pet.stats.commits, cleanups: pet.stats.cleanups || 0,
    },
  };
}

const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
function nextGeneration(prev, baseName, now = Date.now()) {
  const generation = (prev.generation || 1) + 1;
  const pet = createPet(`${baseName}${ROMAN[generation] || ` ${generation}`}`, now);
  pet.generation = generation;
  return pet;
}

// Ghosts that aren't revived within 3 days move on to the graveyard
const ghostFaded = (pet, now = Date.now()) => !!pet.ghost && pet.ghostSince != null && now - pet.ghostSince > 3 * 24 * 3600e3;

// A guilt-free break: distractions don't count, and any sadness is forgiven
function startBreak(pet) {
  pet.distracted = false;
  pet.distractedMinutes = 0;
  pet.distractionSource = null;
  delete pet.calls.distracted;
  return ['break-start'];
}

// Things that need action (meetings soon, deadlines, reviews...) — counted by the app
function setAlerts(pet, count) {
  pet.alertCount = count;
}

function missedDeadline(pet) {
  const events = [];
  if (pet.ghost || pet.stage === 'egg' || pet.vacation) return events;
  pet.happiness = clamp(pet.happiness - 15);
  pet.health = clamp(pet.health - BALANCE.healthMissedDeadline);
  pet.stats.missedDeadlines += 1;
  careMistake(pet, events);
  events.unshift('missed-deadline');
  return events;
}

function setUpdates(pet, count) {
  const events = [];
  const sick = count > 0;
  if (sick && !pet.needsMedicine) {
    pet.needsMedicine = true;
    pet.sickMinutes = 0;
    events.push('got-sick');
  } else if (!sick && pet.needsMedicine) {
    pet.needsMedicine = false;
    pet.sickMinutes = 0;
    pet.health = clamp(pet.health + 30);
    pet.happiness = clamp(pet.happiness + 15);
    pet.stats.cures += 1;
    events.push('cured');
  }
  return events;
}

function catchUp(pet, now = Date.now()) {
  if (pet.vacation) { pet.lastTick = now; return 0; }
  const minutes = Math.min(12 * 60, Math.max(0, (now - pet.lastTick) / 60000));
  if (!pet.ghost && minutes > 1) {
    pet.hunger = clamp(pet.hunger - minutes * 0.08);
    pet.happiness = clamp(pet.happiness - minutes * 0.05);
    pet.energy = 100;
    pet.health = Math.max(20, pet.health - (pet.hunger <= 0 ? minutes * 0.05 : 0));
  }
  if (minutes >= 5) {
    pet.activeStreak = 0;
    if (!pet.asleep) pet.sleepy = false;
    pet.distracted = false;
    pet.distractedMinutes = 0;
    pet.calls = {};
  }
  pet.lastTick = now;
  if (pet.asleep && pet.sleepKind !== 'night') { pet.asleep = false; pet.sleepKind = null; pet.asleepUntil = null; }
  return minutes;
}

// type: 'task-S' | 'task-M' | 'task-L' | 'commit' | 'focus-session' | 'focus'
function feed(pet, type) {
  const r = REWARDS[type];
  if (!r) return [];
  const events = [];
  if (type === 'commit') pet.stats.commits += 1;
  if (type === 'focus') pet.stats.focusMinutes += 1;
  if (type === 'focus-session') pet.stats.focusSessions += 1;
  if (type.startsWith('task-')) pet.stats.tasks += 1;
  if (pet.stage !== 'adult') {
    pet.style = { ...emptyStyle(), ...(pet.style || {}) };
    if (type === 'commit') pet.style.commits += 1;
    if (type === 'focus-session') pet.style.focus += 1;
    if (type === 'task-L') pet.style.large += 1;
  }

  if (pet.ghost) {
    pet.revive = clamp(pet.revive + r.revive);
    if (pet.revive >= 100) {
      Object.assign(pet, { ghost: false, ghostSince: null, revive: 0, health: 60, hunger: 60, happiness: 70, energy: 70 });
      pet.stats.revivals += 1;
      events.push('revived');
    }
    return events;
  }

  const wasStarving = pet.hunger < FOOD_UNIT;
  pet.hunger = clamp(pet.hunger + r.units * FOOD_UNIT);
  pet.happiness = clamp(pet.happiness + r.joy);
  if (type === 'focus-session') events.push('focus-done');
  else if (r.units >= 0.5) events.push(wasStarving ? 'ate-starving' : 'ate');
  events.push(...addXp(pet, r.xp));
  return events;
}

function petIt(pet) {
  if (pet.ghost) return [];
  const gain = Math.min(BALANCE.patJoy, Math.max(0, pet.petBudget));
  pet.petBudget -= gain;
  pet.happiness = clamp(pet.happiness + gain);
  if (pet.asleep) return ['petted-sleeping'];
  return gain > 0 ? ['petted'] : ['petted-too-much'];
}

// Tossed into the basket: a small joy bonus, shared with the pats budget so it can't be farmed
function basket(pet) {
  if (pet.ghost || pet.stage === 'egg' || pet.vacation) return [];
  const gain = Math.min(BALANCE.basketJoy, Math.max(0, pet.petBudget));
  pet.petBudget -= gain;
  pet.happiness = clamp(pet.happiness + gain);
  return gain > 0 ? ['basket'] : ['basket-tired'];
}

// Morning check-in: picking 3 tasks for today, and finishing all of them
function planDay(pet) {
  if (pet.ghost || pet.stage === 'egg') return [];
  pet.happiness = clamp(pet.happiness + 5);
  return ['plan-set'];
}
function planDone(pet) {
  if (pet.ghost) return [];
  pet.hunger = clamp(pet.hunger + FOOD_UNIT);
  pet.happiness = clamp(pet.happiness + 10);
  return ['plan-done', ...addXp(pet, 15)];
}

function play(pet) {
  if (pet.ghost || pet.stage === 'egg') return [];
  if (pet.sleepy || pet.asleep) return ['too-sleepy'];
  if (pet.energy < 10) return ['too-tired'];
  pet.energy = clamp(pet.energy - 4);
  pet.hunger = clamp(pet.hunger - 2);
  pet.happiness = clamp(pet.happiness + 8);
  return ['played'];
}

function mood(pet) {
  if (pet.vacation) return 'away';
  if (pet.ghost) return 'ghost';
  if (pet.stage === 'egg') return 'egg';
  if (pet.asleep) return 'sleeping';
  if (pet.sleepy) return 'sleepy';
  if (pet.needsMedicine || pet.messSick || pet.health < 40) return 'sick';
  if (pet.distracted) return 'crying';
  if (pet.hunger < FOOD_UNIT) return 'hungry';
  if (pet.happiness < 30) return 'sad';
  if (pet.energy < 15) return 'tired';
  if (pet.happiness >= 70 && pet.hunger >= 50) return 'happy';
  return 'okay';
}

module.exports = {
  startBreak, setMess, startVacation, endVacation, ageUp, gravestone, nextGeneration, ghostFaded,
  createPet, tickMinute, lightsOff, setUpdates, setAlerts, missedDeadline, catchUp, feed, petIt,
  play, basket, mood, needs, wakeUp, refocus, shouldWake, planDay, planDone, addXp, adultForm, stageForXp, foodUnits, FORMS,
  STAGES, REWARDS, BALANCE, CALL_LIMITS, FOOD_UNIT, clamp,
};
