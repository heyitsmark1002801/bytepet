// Run with: npm test
const assert = require('assert');
const fc = require('fast-check');
const P = require('../src/pet-state');
const T = require('../src/tasks');
const C = require('../src/calendar');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
const baby = () => { const p = P.createPet(); p.stage = 'baby'; p.xp = 5; return p; };
const work = { idleSeconds: 0, working: true };

console.log('Rewards');
test('small / medium / large tasks give 1 / 2 / 3 food units and 10 / 20 / 40 XP', () => {
  for (const [size, units, xp] of [['S', 1, 10], ['M', 2, 20], ['L', 3, 40]]) {
    const p = baby(); p.hunger = 0;
    P.feed(p, `task-${size}`);
    assert.equal(p.hunger, units * P.FOOD_UNIT, size);
    assert.equal(p.xp, 5 + xp, size);
  }
});

test('a verified focus session gives +10 XP and no food', () => {
  const p = baby(); p.hunger = 50;
  const ev = P.feed(p, 'focus-session');
  assert.equal(p.xp, 15);
  assert.equal(p.hunger, 50);
  assert.ok(ev.includes('focus-done'));
  assert.equal(p.stats.focusSessions, 1);
});

test('working in a work app slows hunger down, but you still need to finish tasks', () => {
  const p = baby(); p.hunger = 60;
  const q = baby(); q.hunger = 60;
  for (let i = 0; i < 120; i++) { P.tickMinute(p, work); P.feed(p, 'focus'); P.tickMinute(q, { ...work, working: false }); }
  assert.ok(p.hunger > q.hunger, 'working is slower');
  assert.ok(p.hunger < 60 - 20, `still about 1+ food unit used in 2 hours, got ${p.hunger}`);
  assert.equal(p.xp, 5);
});

test('food units: 5 units = full', () => {
  const p = baby(); p.hunger = 100;
  assert.equal(P.foodUnits(p), 5);
});

console.log('Lights');
test('too much screen time sends the pet to bed and it calls you', () => {
  const p = baby();
  let ev = [];
  for (let i = 0; i < 120; i++) ev = ev.concat(P.tickMinute(p, { ...work, screenLimit: 120 }));
  assert.ok(ev.includes('screen-too-long'));
  assert.ok(ev.includes('call-sleepy'));
  assert.equal(P.mood(p), 'sleepy');
});

test('locking the computer turns the lights off and resets screen time', () => {
  const p = baby(); p.activeStreak = 130; p.sleepy = true;
  assert.ok(P.tickMinute(p, { locked: true }).includes('lights-off'));
  assert.equal(p.activeStreak, 0);
  assert.equal(P.mood(p), 'sleeping');
});

test('ignoring bedtime for 15 minutes is a care mistake', () => {
  const p = baby();
  for (let i = 0; i < 20; i++) P.tickMinute(p, { ...work, night: true });
  assert.equal(p.careMistakes, 1);
});

console.log('Medicine');
test('pending updates make it sick; updating cures it', () => {
  const p = baby();
  assert.deepEqual(P.setUpdates(p, 3), ['got-sick']);
  assert.equal(P.mood(p), 'sick');
  assert.deepEqual(P.setUpdates(p, 0), ['cured']);
});

test('being sick from updates never kills the pet on its own', () => {
  const p = baby(); P.setUpdates(p, 1);
  for (let i = 0; i < 3000; i++) { P.tickMinute(p, work); P.feed(p, 'focus'); if (i % 240 === 0) P.feed(p, 'task-L'); }
  assert.equal(p.ghost, false);
});

console.log('Discipline');
test('5 minutes in a row on distractions makes it sad; back to work fixes it', () => {
  const p = baby();
  let ev = [];
  for (let i = 0; i < 5; i++) ev = ev.concat(P.tickMinute(p, { idleSeconds: 0, distracting: true }));
  assert.ok(ev.includes('distracted'));
  assert.equal(P.mood(p), 'crying');
  assert.ok(p.discipline < 50);
  assert.ok(P.tickMinute(p, work).includes('refocused'));
  assert.equal(p.distracted, false);
});

test('a short distraction is fine until the daily allowance is used up', () => {
  const p = baby();
  for (let i = 0; i < 3; i++) P.tickMinute(p, { idleSeconds: 0, distracting: true, distractionAllowance: 45 });
  assert.equal(p.distracted, false);
  p.distractionToday = 50;
  P.tickMinute(p, { idleSeconds: 0, distracting: true, distractionAllowance: 45 });
  assert.equal(p.distracted, true);
});

test('daily distraction time resets the next day', () => {
  const p = baby(); p.distractionToday = 80;
  P.tickMinute(p, { ...work, now: Date.now() + 26 * 3600 * 1000 });
  assert.equal(p.distractionToday, 0);
});

console.log('Attention');
test('alerts make it call for attention; they never count as care mistakes', () => {
  const p = baby();
  P.setAlerts(p, 2);
  assert.ok(P.tickMinute(p, work).includes('call-attention'));
  for (let i = 0; i < 100; i++) { P.tickMinute(p, work); P.feed(p, 'focus'); }
  assert.equal(p.careMistakes, 0);
  P.setAlerts(p, 0);
  P.tickMinute(p, work);
  assert.ok(!('attention' in p.calls));
});

test('a missed deadline is a care mistake and makes it sad', () => {
  const p = baby(); const before = p.happiness;
  const ev = P.missedDeadline(p);
  assert.deepEqual(ev, ['missed-deadline', 'care-mistake']);
  assert.ok(p.happiness < before);
  assert.equal(p.stats.missedDeadlines, 1);
});

test('adult form comes from how you worked while it grew up', () => {
  const grow = (style, extra = {}) => { const p = baby(); Object.assign(p, extra); p.style = { ...p.style, ...style }; P.addXp(p, 700); return p.form; };
  assert.equal(grow({ code: 300, commits: 20 }), 'coder');
  assert.equal(grow({ write: 400 }), 'writer');
  assert.equal(grow({ art: 300 }), 'artist');
  assert.equal(grow({ code: 100, night: 200 }), 'nightowl');
  assert.equal(grow({ code: 50, large: 10, focus: 8 }), 'scholar');
  assert.equal(grow({ breaks: 12 }, { discipline: 85 }), 'zen');
  assert.equal(grow({ code: 100, distract: 200 }), 'gamer');
  assert.equal(grow({ code: 500 }, { careMistakes: 6 }), 'grumpy');
  assert.equal(grow({}), 'zen', 'default');
});

test('work style is tracked while growing: app kind, late nights, commits, big tasks', () => {
  const p = baby();
  for (let i = 0; i < 10; i++) P.tickMinute(p, { idleSeconds: 0, working: true, workKind: 'write', late: true, screenLimit: 999 });
  P.feed(p, 'commit'); P.feed(p, 'task-L'); P.feed(p, 'focus-session');
  assert.equal(p.style.write, 10);
  assert.equal(p.style.night, 10);
  assert.equal(p.style.commits, 1);
  assert.equal(p.style.large, 1);
  assert.equal(p.style.focus, 1);
});

console.log('Ghost & misc');
test('starving pet becomes a ghost and a large task helps revive it', () => {
  const p = baby(); p.hunger = 0; p.health = 0.6;
  P.tickMinute(p, {});
  assert.ok(P.tickMinute(p, {}).includes('died'));
  P.feed(p, 'task-L');
  assert.ok(P.feed(p, 'task-L').includes('revived'));
});

test('meters always stay between 0 and 100', () => {
  const p = baby();
  for (let i = 0; i < 50; i++) { P.feed(p, 'task-L'); P.tickMinute(p, { distracting: true }); }
  for (const k of ['hunger', 'energy', 'happiness', 'health', 'discipline']) assert.ok(p[k] >= 0 && p[k] <= 100, k);
});

console.log('Tasks');
test('create, order by due date, and complete tasks', () => {
  const now = 1_000_000;
  const a = T.createTask({ title: 'Write report', size: 'L' }, now);
  const b = T.createTask({ title: 'Email prof', size: 'S', due: now + 3600e3 }, now);
  const list = [a, b];
  assert.deepEqual(T.openTasks(list).map((t) => t.title), ['Email prof', 'Write report']);
  assert.equal(T.complete(list, b.id, now + 10).done, true);
  assert.equal(T.complete(list, b.id, now + 20), null, 'cannot complete twice');
  assert.equal(T.openTasks(list).length, 1);
});

test('empty titles are rejected and unknown sizes become medium', () => {
  assert.throws(() => T.createTask({ title: '  ' }));
  assert.equal(T.createTask({ title: 'x', size: 'XXL' }).size, 'M');
});

test('deadline check finds tasks due soon and newly missed ones (once)', () => {
  const now = 5_000_000;
  const soon = T.createTask({ title: 'soon', due: now + 30 * 60000 }, now);
  const late = T.createTask({ title: 'late', due: now - 1000 }, now);
  const later = T.createTask({ title: 'later', due: now + 5 * 3600e3 }, now);
  const list = [soon, late, later];
  const r = T.checkDeadlines(list, now);
  assert.deepEqual(r.soon.map((t) => t.title), ['soon']);
  assert.deepEqual(r.newlyMissed.map((t) => t.title), ['late']);
  assert.equal(T.checkDeadlines(list, now).newlyMissed.length, 0);
});

test('task size is read from GitHub labels', () => {
  assert.equal(T.sizeFromLabels([{ name: 'size: S' }]), 'S');
  assert.equal(T.sizeFromLabels([{ name: 'bug' }, { name: 'large' }]), 'L');
  assert.equal(T.sizeFromLabels([{ name: 'bug' }, { name: 'docs' }]), 'M');
});

console.log('Calendar');
const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:one',
  'SUMMARY:Co-op interview\\, Apera',
  'DTSTART:20261102T170000Z',
  'DTEND:20261102T180000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:two',
  'SUMMARY:Standup',
  'DTSTART;TZID=America/Vancouver:20261026T093000',
  'DTEND;TZID=America/Vancouver:20261026T094500',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:three',
  'SUMMARY:Cancelled thing',
  'STATUS:CANCELLED',
  'DTSTART:20261102T200000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('parses UTC events, escapes, and skips cancelled ones', () => {
  const evs = C.parseIcs(ICS);
  assert.equal(evs.length, 2);
  assert.equal(evs[0].summary, 'Co-op interview, Apera');
  assert.equal(evs[0].start, Date.UTC(2026, 10, 2, 17, 0, 0));
});

test('TZID times convert correctly (Vancouver 9:30 = 16:30 UTC in PDT)', () => {
  const d = C.parseDate('20261026T093000', { TZID: 'America/Vancouver' });
  assert.equal(d.ms, Date.UTC(2026, 9, 26, 16, 30, 0));
});

test('weekly repeats on chosen weekdays show up in the window', () => {
  const evs = C.parseIcs(ICS);
  const from = Date.UTC(2026, 10, 2, 8, 0); // Mon Nov 2, 2026
  const to = from + 3 * 24 * 3600e3;
  const occ = C.occurrences(evs, from, to).filter((o) => o.summary === 'Standup');
  const days = occ.map((o) => new Date(o.start).getUTCDay());
  assert.ok(days.includes(1) && days.includes(3), `got days ${days}`);
  assert.ok(!days.includes(2), 'no standup on Tuesday');
});

console.log('Sync with other apps');
const S = require('../src/sync');

test('size tags in titles: [L], #small', () => {
  assert.deepEqual(S.parseSizeTag('[L] Write report'), { title: 'Write report', size: 'L' });
  assert.deepEqual(S.parseSizeTag('Email prof #small'), { title: 'Email prof', size: 'S' });
  assert.deepEqual(S.parseSizeTag('Buy #milk'), { title: 'Buy #milk', size: null });
});

test('size from priority: Reminders high = L, low = S; Todoist p1 = L', () => {
  assert.equal(S.pickSize({ title: 'x', priority: 1, source: 'reminders' }).size, 'L');
  assert.equal(S.pickSize({ title: 'x', priority: 9, source: 'reminders' }).size, 'S');
  assert.equal(S.pickSize({ title: 'x', priority: 0, source: 'reminders' }).size, 'M');
  assert.equal(S.pickSize({ title: 'x', priority: 4, source: 'todoist' }).size, 'L');
  assert.equal(S.pickSize({ title: 'x', priority: 1, source: 'todoist' }).size, 'M');
  assert.equal(S.pickSize({ title: '[S] x', priority: 4, source: 'todoist' }).size, 'S', 'tag wins');
  assert.equal(S.pickSize({ title: 'x', labels: ['large'], source: 'todoist' }).size, 'L');
});

test('reconcile adds new items, updates changed ones, and reports missing ones', () => {
  const now = 10_000_000;
  const list = [];
  let r = S.reconcile(list, 'reminders', [
    { externalId: 'a', title: 'Study', size: 'M' },
    { externalId: 'b', title: 'Laundry', size: 'S', due: now + 3600e3 },
  ], now);
  assert.equal(r.added.length, 2);
  list.push(...r.added);

  r = S.reconcile(list, 'reminders', [{ externalId: 'a', title: 'Study for exam', size: 'L' }], now);
  assert.equal(r.added.length, 0);
  assert.equal(r.updated.length, 1);
  assert.equal(list[0].title, 'Study for exam');
  assert.equal(list[0].size, 'L');
  assert.deepEqual(r.missing.map((t) => t.externalId), ['b']);
});

test('reconcile never re-imports tasks finished or removed here', () => {
  const now = 1;
  const list = [];
  list.push(...S.reconcile(list, 'todoist', [{ externalId: 'x', title: 'A' }, { externalId: 'y', title: 'B' }], now).added);
  list[0].done = true;
  list[1].dismissed = true;
  const r = S.reconcile(list, 'todoist', [{ externalId: 'x', title: 'A' }, { externalId: 'y', title: 'B' }], now);
  assert.equal(r.added.length, 0);
  assert.equal(r.missing.length, 0);
  assert.equal(T.openTasks(list).length, 0);
});

test('importing an already-overdue item shows it but is not a new care mistake', () => {
  const now = 5_000_000;
  const list = S.reconcile([], 'reminders', [{ externalId: 'old', title: 'Old', due: now - 1000 }], now).added;
  assert.equal(list[0].missed, true);
  assert.equal(T.checkDeadlines(list, now).newlyMissed.length, 0);
});

test('sources stay separate', () => {
  const list = S.reconcile([], 'reminders', [{ externalId: '1', title: 'A' }]).added;
  const r = S.reconcile(list, 'todoist', [{ externalId: '1', title: 'A' }]);
  assert.equal(r.added.length, 1);
  assert.equal(r.missing.length, 0);
});

test('calendar tasks (VTODO) are read, with done ones flagged', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO', 'UID:t1', 'SUMMARY:Finish lab report', 'DUE;VALUE=DATE:20261105', 'PRIORITY:1', 'END:VTODO',
    'BEGIN:VTODO', 'UID:t2', 'SUMMARY:Old thing', 'STATUS:COMPLETED', 'END:VTODO',
    'END:VCALENDAR',
  ].join('\r\n');
  const todos = C.parseTodos(ics);
  assert.equal(todos.length, 2);
  assert.equal(todos[0].summary, 'Finish lab report');
  assert.equal(todos[0].done, false);
  assert.equal(new Date(todos[0].due).getHours(), 23, 'all-day due = end of day');
  assert.equal(todos[1].done, true);
  assert.equal(C.parseIcs(ics).length, 0, 'tasks are not events');
});

console.log('Mess, vacation, age, graveyard');
test('digital mess makes poop; cleaning flushes it; leaving it makes the pet sick', () => {
  const p = baby();
  assert.ok(P.setMess(p, [{ kind: 'downloads', count: 80, limit: 50 }]).includes('pooped'));
  assert.ok(P.needs(p).includes('dirty'));
  let ev = [];
  for (let i = 0; i < 120; i++) { ev = ev.concat(P.tickMinute(p, { ...work, screenLimit: 999 })); P.feed(p, 'focus'); }
  assert.ok(ev.includes('mess-sick'));
  assert.equal(P.mood(p), 'sick');
  const done = P.setMess(p, []);
  assert.ok(done.includes('flushed') && done.includes('mess-cured'));
  assert.equal(p.messSick, false);
  assert.equal(p.stats.cleanups, 1);
});

test('vacation pauses everything, then the pet comes back refreshed', () => {
  const p = baby(); p.hunger = 50;
  P.startVacation(p, 0);
  for (let i = 0; i < 500; i++) P.tickMinute(p, { ...work, night: true });
  assert.equal(p.hunger, 50);
  assert.equal(p.careMistakes, 0);
  assert.equal(P.mood(p), 'away');
  assert.deepEqual(P.missedDeadline(p), [], 'no penalty while away');
  const r = P.endVacation(p, 30 * 3600e3);
  assert.ok(r.events.includes('vacation-end'));
  assert.equal(Math.round(r.hours), 30);
  assert.equal(p.vacation, null);
});

test('good days age the pet; gravestones keep lifetime stats; next generation is numbered', () => {
  const p = baby(); p.name = 'Byte';
  P.ageUp(p); P.ageUp(p);
  assert.equal(p.age, 2);
  p.stats.tasks = 12;
  const stone = P.gravestone(p, 'retired', 1000);
  assert.equal(stone.stats.tasks, 12);
  assert.equal(stone.age, 2);
  const kid = P.nextGeneration(p, 'Byte');
  assert.equal(kid.name, 'Byte II');
  assert.equal(kid.generation, 2);
  assert.equal(kid.stage, 'egg');
});

test('an unrevived ghost fades after 3 days', () => {
  const p = baby(); p.ghost = true; p.ghostSince = 0;
  assert.equal(P.ghostFaded(p, 2 * 24 * 3600e3), false);
  assert.equal(P.ghostFaded(p, 4 * 24 * 3600e3), true);
});

console.log('Streaks & achievements');
const G = require('../src/progress');
const ACH = require('../src/achievements');
const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('two tasks make a good day; consecutive good days build a streak', () => {
  const pr = G.emptyProfile();
  assert.deepEqual(G.record(pr, 'task', day(2026, 11, 1)), []);
  assert.ok(G.record(pr, 'task', day(2026, 11, 1)).includes('good-day'));
  assert.equal(pr.streak, 1);
  G.record(pr, 'focus', day(2026, 11, 2)); G.record(pr, 'focus', day(2026, 11, 2));
  G.record(pr, 'large', day(2026, 11, 3)); G.record(pr, 'focus', day(2026, 11, 3));
  assert.equal(pr.streak, 3);
  assert.ok(G.unlocked(pr).includes('bow'));
});

test('a missed day resets the streak, but vacation days do not', () => {
  const pr = G.emptyProfile();
  const good = (d) => { G.record(pr, 'task', d); G.record(pr, 'task', d); };
  good(day(2026, 11, 1));
  G.record(pr, 'vacation', day(2026, 11, 2));
  G.record(pr, 'vacation', day(2026, 11, 3));
  good(day(2026, 11, 4));
  assert.equal(pr.streak, 2, 'vacation kept it alive');
  good(day(2026, 11, 6)); // skipped the 5th
  assert.equal(pr.streak, 1);
  assert.equal(pr.bestStreak, 2);
  assert.equal(G.currentStreak(pr, day(2026, 11, 8)), 0, 'missed yesterday');
});

test('streak unlocks happen once, at 3 / 7 / 14 / 30 days', () => {
  const pr = G.emptyProfile();
  const unlocks = [];
  for (let i = 1; i <= 30; i++) {
    G.record(pr, 'task', day(2026, 10, i)); unlocks.push(...G.record(pr, 'task', day(2026, 10, i)).filter((e) => e.startsWith('unlock:')));
  }
  assert.deepEqual(unlocks, ['unlock:bow', 'unlock:cap', 'unlock:shades', 'unlock:wizard']);
});

test('there are exactly 50 achievements with unique ids', () => {
  assert.equal(ACH.ACHIEVEMENTS.length, 50);
  assert.equal(new Set(ACH.ACHIEVEMENTS.map((a) => a.id)).size, 50);
});

test('achievements unlock once, from lifetime totals and today', () => {
  const pr = G.emptyProfile();
  pr.totals = { tasks: 1, tasksL: 1 };
  const ctx = { pet: baby(), day: { tasks: 1, focus: 0 }, open: 3 };
  const first = ACH.evaluate(pr, ctx).map((a) => a.id);
  assert.deepEqual(first.sort(), ['first-large', 'first-task']);
  assert.equal(ACH.evaluate(pr, ctx).length, 0);
  assert.ok(ACH.evaluate(pr, { ...ctx, open: 0 }).some((a) => a.id === 'inbox-zero'));
});

test('finals week = 7 days in a row with 3+ tasks', () => {
  const pr = G.emptyProfile();
  for (let i = 1; i <= 7; i++) for (let j = 0; j < 3; j++) G.record(pr, 'task', day(2026, 11, i));
  assert.equal(G.runOfDays(pr, 3, day(2026, 11, 7)), 7);
  assert.equal(G.runOfDays(pr, 4, day(2026, 11, 7)), 0);
});

console.log('Travel postcards');
const LOC = require('../src/location');
const PCS = require('../src/postcards');

test('reads the three location services, whatever their field names', () => {
  assert.deepEqual(LOC.normalize({ success: true, country: 'Japan', country_code: 'JP', city: 'Tokyo', region: 'Tokyo', timezone: { id: 'Asia/Tokyo' } }),
    { city: 'Tokyo', region: 'Tokyo', country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo', source: 'internet' });
  assert.equal(LOC.normalize({ country_name: 'France', country_code: 'FR', city: 'Paris', timezone: 'Europe/Paris' }).countryCode, 'FR');
  assert.equal(LOC.normalize({ countryName: 'Italy', countryCode: 'IT', cityName: 'Venice' }).city, 'Venice');
  assert.equal(LOC.normalize({ success: false }), null);
  assert.equal(LOC.normalize({ error: true, reason: 'RateLimited' }), null);
});

test('time zone works as a backup', () => {
  const l = LOC.fromTimezone('Europe/Paris');
  assert.equal(l.countryCode, 'FR');
  assert.equal(l.city, 'Paris');
  assert.equal(LOC.fromTimezone('America/Argentina/Buenos_Aires').city, 'Buenos Aires');
});

test('knows when you are away from home', () => {
  const home = { countryCode: 'CA', city: 'Vancouver', region: 'British Columbia', timezone: 'America/Vancouver' };
  assert.equal(LOC.isAway(home, { countryCode: 'JP', city: 'Tokyo' }), true);
  assert.equal(LOC.isAway(home, { countryCode: 'CA', city: 'Burnaby', region: 'British Columbia' }), false, 'same province');
  assert.equal(LOC.isAway(home, { countryCode: 'CA', city: 'Toronto', region: 'Ontario' }), true);
  assert.equal(LOC.isAway({ timezone: 'America/Vancouver' }, { timezone: 'Europe/Rome' }), true);
  assert.equal(LOC.isAway(home, null), false);
});

test('postcards come from the country you visited, with its flag', () => {
  const c = PCS.makePostcard({ city: 'Kyoto', countryCode: 'JP' }, { hours: 72, rand: () => 0 });
  assert.equal(c.place, 'Kyoto, Japan');
  assert.equal(c.flag, '🇯🇵');
  assert.equal(c.scene, 'temple');
  assert.equal(c.days, 3);
  assert.ok(PCS.COUNTRIES.JP.notes.includes(c.note));
  const eg = PCS.makePostcard({ city: 'Cairo', countryCode: 'EG' });
  assert.equal(eg.scene, 'pyramids');
});

test('unknown countries still get a card; never leaving home = staycation', () => {
  const x = PCS.makePostcard({ city: 'Ulaanbaatar', country: 'Mongolia', countryCode: 'MN', timezone: 'Asia/Ulaanbaatar' });
  assert.equal(x.place, 'Ulaanbaatar, Mongolia');
  assert.equal(x.scene, 'temple');
  const home = PCS.makePostcard({ city: 'Vancouver', countryCode: 'CA' }, { staycation: true });
  assert.equal(home.staycation, true);
  assert.equal(home.scene, 'home');
  assert.equal(PCS.makePostcard(null, { staycation: true }).place, 'Home sweet home');
});

console.log('Distraction brain');
const D = require('../src/distraction');
const CFG = {
  distractionApps: ['Steam', 'Discord'],
  distractionSites: ['youtube.com', 'instagram.com', 'netflix.com'],
  distractionKeywords: ['YouTube', 'Netflix'],
  neverDistracting: ['Slack', 'docs.google.com'],
  learningKeywords: ['tutorial', 'lecture', 'course'],
  countCategories: { game: true, entertainment: true, social: true },
};

test('apps, sites (incl. subdomains) and title keywords are distracting', () => {
  assert.equal(D.decide({ app: 'Steam' }, CFG).distracting, true);
  assert.equal(D.decide({ app: 'Google Chrome', site: 'youtube.com' }, CFG).source, 'youtube.com');
  assert.equal(D.decide({ app: 'Google Chrome', site: 'm.youtube.com' }, CFG).distracting, true);
  assert.equal(D.decide({ app: 'Firefox', title: 'Cat video - YouTube — Mozilla Firefox' }, CFG).source, 'YouTube');
  assert.equal(D.decide({ app: 'Google Chrome', site: 'github.com' }, CFG).distracting, false);
});

test('any game is detected from its app category, no list needed', () => {
  const g = D.decide({ app: 'Hollow Knight', category: 'public.app-category.action-games' }, CFG);
  assert.equal(g.distracting, true);
  assert.equal(g.kind, 'game');
  assert.equal(D.decide({ app: 'Some Game', bundlePath: '/Users/m/Library/Application Support/Steam/steamapps/common/x.app' }, CFG).kind, 'game');
  assert.equal(D.decide({ app: 'Apple TV', category: 'public.app-category.entertainment' }, CFG).distracting, true);
  assert.equal(D.decide({ app: 'Xcode', category: 'public.app-category.developer-tools' }, CFG).distracting, false);
  const off = { ...CFG, countCategories: { game: false } };
  assert.equal(D.decide({ app: 'Hollow Knight', category: 'public.app-category.games' }, off).distracting, false);
});

test('learning videos and never-distracting apps do not count', () => {
  const l = D.decide({ app: 'Google Chrome', site: 'youtube.com', title: 'PyTorch Tutorial for Beginners - YouTube' }, CFG);
  assert.equal(l.distracting, false);
  assert.equal(l.learning, true);
  assert.equal(D.decide({ app: 'Slack' }, { ...CFG, distractionApps: ['Slack'] }).distracting, false);
  assert.equal(D.decide({ app: 'Safari', site: 'docs.google.com' }, CFG).distracting, false);
});

test('a minute counts as distracted only if at least half the 15-second samples were', () => {
  const yes = { distracting: true, source: 'youtube.com' };
  const no = { distracting: false, source: 'Code' };
  assert.equal(D.combine([yes, no, no, no]).distracting, false, 'a quick peek is fine');
  const r = D.combine([yes, yes, no, { distracting: true, source: 'Steam' }]);
  assert.equal(r.distracting, true);
  assert.equal(r.source, 'youtube.com');
  assert.equal(D.combine([]).distracting, false);
});

test('work-hours mode: only counts on work days during work hours', () => {
  const sched = { mode: 'work', days: [1, 2, 3, 4, 5], start: 9, end: 18 };
  assert.equal(D.counts(sched, new Date(2026, 10, 2, 10)), true, 'Monday 10am');
  assert.equal(D.counts(sched, new Date(2026, 10, 2, 20)), false, 'Monday 8pm');
  assert.equal(D.counts(sched, new Date(2026, 10, 1, 10)), false, 'Sunday');
  assert.equal(D.counts({ mode: 'always' }, new Date(2026, 10, 1, 23)), true);
});

test('escalation: notices → restless → sad → sulks every 30 minutes', () => {
  const p = baby();
  const all = [];
  for (let i = 0; i < 31; i++) all.push(...P.tickMinute(p, { idleSeconds: 0, distracting: true, distractionSource: 'youtube.com', distractedAfter: 5, distractionAllowance: 999, screenLimit: 999 }));
  assert.equal(all.indexOf('distraction-notice') < all.indexOf('distraction-warning'), true);
  assert.equal(all.indexOf('distraction-warning') < all.indexOf('distracted'), true);
  assert.equal(all.filter((e) => e === 'binge').length, 1);
  assert.equal(p.distractionSource, 'youtube.com');
});

test('a break forgives the pet and stops the distraction call', () => {
  const p = baby();
  for (let i = 0; i < 6; i++) P.tickMinute(p, { idleSeconds: 0, distracting: true, screenLimit: 999 });
  assert.equal(p.distracted, true);
  assert.deepEqual(P.startBreak(p), ['break-start']);
  assert.equal(p.distracted, false);
  assert.ok(!P.needs(p).includes('distracted'));
});

test('background: distracting apps and any tab with a distracting site count', () => {
  const S = require('../src/system');
  const apps = S.parseRunningApps([
    '/Applications/Steam.app/Contents/MacOS/steam_osx',
    '/Applications/Google Chrome.app/Contents/Frameworks/X.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/System/Applications/Messages.app/Contents/MacOS/Messages',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  ].join('\n'));
  assert.deepEqual(apps.map((a) => a.name), ['Steam', 'Google Chrome', 'Messages', 'Visual Studio Code'], 'helpers skipped');
  apps.find((a) => a.name === 'Messages').category = 'public.app-category.social-networking';
  const tabs = [
    { browser: 'Google Chrome', site: 'github.com', title: 'bytepet' },
    { browser: 'Google Chrome', site: 'youtube.com', title: 'Funny cats - YouTube' },
    { browser: 'Google Chrome', site: 'youtube.com', title: 'Linear algebra lecture 3 - YouTube' },
  ];
  const hits = D.decideBackground(apps, tabs, CFG, { app: 'Visual Studio Code' });
  assert.deepEqual(hits.map((x) => x.source), ['Steam', 'youtube.com'], 'Messages (Apple) and the lecture tab ignored');
  assert.equal(D.decideBackground(apps, tabs, { ...CFG, neverDistracting: ['Steam', 'youtube.com'] }).length, 0);
});

test('closing the distraction cheers the pet up after 2 clean minutes, even outside work apps', () => {
  const p = baby();
  for (let i = 0; i < 6; i++) P.tickMinute(p, { idleSeconds: 0, distracting: true, screenLimit: 999 });
  assert.equal(p.distracted, true);
  P.tickMinute(p, { idleSeconds: 0, screenLimit: 999 });
  assert.equal(p.distracted, true);
  assert.ok(P.tickMinute(p, { idleSeconds: 0, screenLimit: 999 }).includes('refocused'));
});

test('Steam is found even though its real program has no ".app" in its path', () => {
  const S = require('../src/system');
  const apps = S.parseRunningApps([
    '/Users/m/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steam_osx',
    '/Users/m/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/Steam Helper',
    '/System/Library/PrivateFrameworks/X.framework/XPCServices/y.xpc/Contents/MacOS/y',
  ].join('\n'));
  assert.deepEqual(apps.map((a) => a.name), ['Steam']);
  assert.equal(D.decideBackground(apps, [], CFG)[0].source, 'Steam');
});

test('invisible helper apps (no window, no Dock icon) are ignored unless you list them', () => {
  const apps = [{ name: 'PlayerLocationCheck', bundlePath: '/Applications/PlayerLocationCheck.app', category: 'public.app-category.entertainment', agent: true }];
  assert.equal(D.decideBackground(apps, [], CFG).length, 0);
  assert.equal(D.decideBackground(apps, [], { ...CFG, distractionApps: ['PlayerLocationCheck'] }).length, 1);
});

test('strict focus knows which app to hide and which browser to close tabs in', () => {
  const D = require('../src/distraction');
  const CFG = { distractionApps: ['Steam'], distractionSites: ['youtube.com'], distractionKeywords: [], learningKeywords: ['lecture'], neverDistracting: [], countCategories: {} };
  const apps = [{ name: 'Steam', bundlePath: '/Applications/Steam.app' }, { name: 'Google Chrome', bundlePath: '/Applications/Google Chrome.app' }];
  const hits = D.decideBackground(apps, [{ browser: 'Google Chrome', site: 'youtube.com', title: 'cats' }], CFG, {});
  assert.equal(hits.find((x) => x.source === 'Steam').bundlePath, '/Applications/Steam.app');
  assert.equal(hits.find((x) => x.source === 'youtube.com').browser, 'Google Chrome');
});

test('quiet hours wrap past midnight and the daily limit holds extra notifications', () => {
  const Q = require('../src/quiet');
  assert.equal(Q.inQuietHours(23, 23, 8), true);
  assert.equal(Q.inQuietHours(3, 23, 8), true);
  assert.equal(Q.inQuietHours(8, 23, 8), false);
  assert.equal(Q.inQuietHours(14, 13, 15), true);
  assert.equal(Q.inQuietHours(14, 0, 0), false, 'same start and end = no quiet hours');
  assert.equal(Q.allowNotification({ hour: 12, sentToday: 3, start: 23, end: 8, max: 8 }).ok, true);
  assert.equal(Q.allowNotification({ hour: 12, sentToday: 8, start: 23, end: 8, max: 8 }).reason, 'daily limit');
  assert.equal(Q.allowNotification({ hour: 2, sentToday: 0, start: 23, end: 8, max: 8 }).reason, 'quiet hours');
});

test('a basket shot gives a little joy, but not unlimited', () => {
  const p = baby();
  p.happiness = 50;
  assert.deepEqual(P.basket(p), ['basket']);
  assert.equal(p.happiness, 51, 'just 1 joy');
  for (let i = 0; i < 20; i++) P.basket(p);
  assert.ok(p.happiness <= 50 + P.BALANCE.patBudgetMax, 'capped by the pats budget');
  assert.deepEqual(P.basket(p), ['basket-tired']);
  p.ghost = true;
  assert.deepEqual(P.basket(p), []);
});

test('balance: a workday needs about 3–4 medium tasks to stay fed', () => {
  const p = baby();
  p.hunger = 100;
  let ate = 0;
  for (let m = 0; m < 8 * 60; m++) {
    P.tickMinute(p, { idleSeconds: 0, working: true, screenLimit: 999 });
    P.feed(p, 'focus');
    if (p.hunger < P.FOOD_UNIT * 1.5) { P.feed(p, 'task-M'); ate += 1; }
  }
  assert.ok(ate >= 2 && ate <= 5, `ate ${ate} medium tasks in 8 hours`);
});

test('balance: ignoring a hungry pet takes hours to kill it, and it never dies overnight', () => {
  const p = baby();
  p.hunger = 0;
  let minutes = 0;
  while (!p.ghost && minutes < 24 * 60) { P.tickMinute(p, { idleSeconds: 0, screenLimit: 9999 }); minutes += 1; }
  assert.ok(minutes > 3 * 60, `died after ${minutes} minutes of starving`);
  const q = baby();
  q.hunger = 30;
  q.lastTick = Date.now() - 14 * 3600e3;
  P.catchUp(q);
  assert.equal(q.ghost, false);
  assert.ok(q.health >= 20);
});

test('balance: pats help a little, but can\'t replace real care', () => {
  const p = baby();
  p.happiness = 40;
  for (let i = 0; i < 50; i++) P.petIt(p);
  assert.ok(p.happiness <= 40 + P.BALANCE.patBudgetMax, 'pats run out');
});

console.log('Sleep');
test('stepping away makes it nap, and it wakes up as soon as you are back', () => {
  const p = baby();
  P.tickMinute(p, { idleSeconds: 400, screenLimit: 999 });
  assert.equal(p.asleep, true);
  assert.equal(p.sleepKind, 'nap');
  const ev = P.tickMinute(p, { idleSeconds: 3, screenLimit: 999 });
  assert.ok(ev.includes('woke-up'));
  assert.equal(p.asleep, false);
});

test('lights off at night: sleeps until the wake-up hour even if you keep using the computer', () => {
  const p = baby();
  const t0 = Date.UTC(2026, 10, 2, 7); // "23:00"
  const wakeAt = t0 + 8 * 3600e3;
  P.tickMinute(p, { idleSeconds: 0, night: true, screenLimit: 999, now: t0 });
  assert.equal(p.sleepy, true, 'asks for the lights off at bedtime');
  assert.ok(P.lightsOff(p, { night: true, wakeAt, now: t0 }).includes('lights-off'));
  for (let m = 1; m <= 60; m++) P.tickMinute(p, { idleSeconds: 0, night: true, screenLimit: 999, now: t0 + m * 60000 });
  assert.equal(p.asleep, true, 'still asleep at midnight while you work');
  assert.equal(p.sleepy, false, 'no nagging while asleep');
  const ev = P.tickMinute(p, { idleSeconds: 0, night: false, screenLimit: 999, now: wakeAt + 60000 });
  assert.ok(ev.includes('good-morning'));
  assert.equal(p.asleep, false);
});

test('in the morning it keeps sleeping until you are actually back', () => {
  const p = baby();
  const now = Date.now();
  P.lightsOff(p, { night: true, wakeAt: now - 1000, now: now - 9 * 3600e3 });
  assert.deepEqual(P.tickMinute(p, { idleSeconds: 900, screenLimit: 999, now }).filter((e) => e === 'good-morning'), []);
  assert.ok(P.tickMinute(p, { idleSeconds: 2, screenLimit: 999, now }).includes('good-morning'));
});

test('a nap with the lights off by hand lasts 20 minutes', () => {
  const p = baby();
  const now = Date.now();
  p.sleepy = true;
  P.lightsOff(p, { napMinutes: 20, now });
  assert.equal(P.shouldWake(p, true, now + 10 * 60000), null);
  assert.equal(P.shouldWake(p, true, now + 21 * 60000), 'woke-up');
});

test('eggs and ghosts never fall asleep', () => {
  const e = P.createPet();
  assert.deepEqual(P.lightsOff(e), []);
  const g = baby(); g.ghost = true;
  assert.deepEqual(P.lightsOff(g), []);
});

console.log('Morning check-in');
test('planning the day cheers it up, and finishing all 3 gives a bonus meal', () => {
  const p = baby();
  p.happiness = 50; p.hunger = 40;
  assert.deepEqual(P.planDay(p), ['plan-set']);
  assert.equal(p.happiness, 55);
  const ev = P.planDone(p);
  assert.ok(ev.includes('plan-done'));
  assert.equal(p.hunger, 60);
});

console.log('Health');
test('a missed deadline costs a lot of health', () => {
  const p = baby(); p.health = 100;
  P.missedDeadline(p);
  assert.equal(p.health, 80);
});

test('untreated sickness and lots of distraction slowly hurt; it only heals when fed, medicated and clean', () => {
  const p = baby(); p.hunger = 100; p.health = 60;
  P.setUpdates(p, 1);
  for (let i = 0; i < 60; i++) P.tickMinute(p, { idleSeconds: 0, screenLimit: 9999 });
  assert.ok(p.health < 60, `sick: ${p.health}`);
  P.setUpdates(p, 0); // cured: +30
  const h = p.health;
  p.hunger = 100;
  P.tickMinute(p, { idleSeconds: 0, screenLimit: 9999 });
  assert.ok(p.health > h, 'heals once medicated');
  p.poop = [{ kind: 'downloads', count: 80, limit: 50 }];
  const h2 = p.health;
  P.tickMinute(p, { idleSeconds: 0, screenLimit: 9999 });
  assert.ok(p.health <= h2, 'no healing while there is poop');
});

test('untreated sickness can eventually be fatal', () => {
  const p = baby(); p.health = 5; p.hunger = 100;
  P.setUpdates(p, 1);
  let died = false;
  for (let i = 0; i < 24 * 60 && !died; i++) { p.hunger = 100; died = P.tickMinute(p, { idleSeconds: 0, screenLimit: 9999 }).includes('died'); }
  assert.ok(died);
});

test('a reminder every 10 minutes while sad from a distraction', () => {
  const p = baby();
  const all = [];
  for (let i = 0; i < 25; i++) all.push(...P.tickMinute(p, { idleSeconds: 0, distracting: true, distractionSource: 'youtube.com', screenLimit: 9999 }));
  assert.equal(all.filter((e) => e === 'distraction-reminder').length, 2);
});

console.log('How the meters work together');
const awake = { idleSeconds: 0, screenLimit: 9999 };
test('energy goes up while charging and down on battery, faster when hungry', () => {
  const a = baby(); a.energy = 50; a.hunger = 100;
  for (let i = 0; i < 20; i++) P.tickMinute(a, { ...awake, charging: true });
  assert.ok(a.energy > 50, `charging: ${a.energy}`);
  const b = baby(); b.energy = 50; b.hunger = 100;
  for (let i = 0; i < 20; i++) P.tickMinute(b, { ...awake, charging: false });
  const c = baby(); c.energy = 50; c.hunger = 5;
  for (let i = 0; i < 20; i++) P.tickMinute(c, { ...awake, charging: false });
  assert.ok(b.energy < 50, `battery: ${b.energy}`);
  assert.ok(c.energy < b.energy, 'hungry drains energy faster');
});

test('playing costs energy; a worn-out pet loses joy faster', () => {
  const p = baby(); p.energy = 50;
  P.play(p);
  assert.ok(p.energy < 50);
  const t = baby(); t.energy = 5; t.happiness = 60;
  const f = baby(); f.energy = 90; f.happiness = 60;
  for (let i = 0; i < 10; i++) { P.tickMinute(t, { ...awake, charging: false }); P.tickMinute(f, { ...awake, charging: true }); }
  assert.ok(t.happiness < f.happiness);
});

test('poop left alone attracts flies after an hour, then makes it sick; cleaning fixes it', () => {
  const p = baby(); p.hunger = 100;
  P.setMess(p, [{ kind: 'downloads', count: 80, limit: 50 }]);
  const ev = [];
  for (let i = 0; i < 125; i++) { p.hunger = 100; ev.push(...P.tickMinute(p, awake)); }
  assert.ok(ev.includes('flies'));
  assert.ok(ev.indexOf('flies') < ev.indexOf('mess-sick'));
  assert.equal(P.mood(p), 'sick');
  P.setMess(p, []);
  assert.equal(p.flies, false);
  assert.equal(p.messSick, false);
});

test('health drops with no joy or no discipline, and heals when everything is fine', () => {
  const sad = baby(); sad.hunger = 100; sad.happiness = 5; sad.health = 80;
  P.tickMinute(sad, awake);
  assert.ok(sad.health < 80, 'joyless');
  const wild = baby(); wild.hunger = 100; wild.happiness = 80; wild.discipline = 5; wild.health = 80;
  P.tickMinute(wild, awake);
  assert.ok(wild.health < 80, 'undisciplined');
  const ok = baby(); ok.hunger = 100; ok.happiness = 80; ok.discipline = 60; ok.health = 80;
  P.tickMinute(ok, awake);
  assert.ok(ok.health > 80, 'heals');
});

test('medicine (installing updates) heals', () => {
  const p = baby(); p.health = 40;
  P.setUpdates(p, 1);
  P.setUpdates(p, 0);
  assert.equal(p.health, 70);
});

test('closing the distraction cheers it up right away (refocus)', () => {
  const p = baby(); p.distracted = true; p.distractedMinutes = 8; p.discipline = 40;
  assert.deepEqual(P.refocus(p), ['refocused']);
  assert.equal(p.distracted, false);
  assert.equal(p.discipline, 45);
  assert.deepEqual(P.refocus(p), []);
});

console.log('Robustness');
test('open apps come from macOS: helpers inside apps are skipped, Steam\'s real app is found', () => {
  const S = require('../src/system');
  const apps = S.parseWorkspaceApps(JSON.stringify([
    ['Steam', '/Users/m/Library/Application Support/Steam/Steam.AppBundle/Steam', 0],
    ['Google Chrome', '/Applications/Google Chrome.app', 0],
    ['Google Chrome Helper', '/Applications/Google Chrome.app/Contents/Frameworks/x.framework/Helpers/Google Chrome Helper.app', 2],
    ['Dock', '/System/Library/CoreServices/Dock.app', 1],
    ['', '/Applications/Discord.app', 0],
    ['Steam', '/Users/m/Library/Application Support/Steam/Steam.AppBundle/Steam', 0],
  ]));
  assert.deepEqual(apps.map((a) => a.name), ['Steam', 'Google Chrome', 'Dock', 'Discord']);
  assert.equal(apps.find((a) => a.name === 'Dock').policy, 1);
  assert.equal(S.parseWorkspaceApps('not json'), null);
});

test('3 days of random life never breaks the pet (meters stay 0–100, no NaN)', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const p = baby();
  let now = Date.now();
  const KEYS = ['hunger', 'energy', 'happiness', 'health', 'discipline'];
  for (let m = 0; m < 3 * 24 * 60; m++) {
    now += 60000;
    const ctx = {
      now, idleSeconds: rnd() < 0.2 ? 600 : 5, locked: rnd() < 0.05, working: rnd() < 0.5,
      distracting: rnd() < 0.15, distractionSource: 'youtube.com', music: rnd() < 0.1,
      night: (m % 1440) > 1380 || (m % 1440) < 420, wakeAt: now + 3600e3, screenLimit: 120,
    };
    P.tickMinute(p, ctx);
    const r = rnd();
    if (r < 0.01) P.feed(p, 'task-M');
    else if (r < 0.015) P.missedDeadline(p);
    else if (r < 0.02) P.petIt(p);
    else if (r < 0.022) P.setUpdates(p, rnd() < 0.5 ? 1 : 0);
    else if (r < 0.024) P.setMess(p, rnd() < 0.5 ? [{ kind: 'downloads', count: 60, limit: 50 }] : []);
    else if (r < 0.025 && p.sleepy) P.lightsOff(p, { night: ctx.night, wakeAt: ctx.wakeAt, now });
    else if (r < 0.026) P.feed(p, 'focus-session');
    for (const k of KEYS) assert.ok(Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 100, `${k} = ${p[k]} at minute ${m}`);
    assert.ok(['egg', 'baby', 'child', 'adult'].includes(p.stage));
    P.mood(p);
    P.needs(p);
  }
});

console.log('Pet-state properties (fast-check)');

const METERS = ['hunger', 'energy', 'happiness', 'health', 'discipline'];
const inRange = (p, where) => {
  for (const k of METERS) assert.ok(Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 100, `${k} = ${p[k]} ${where}`);
};

// Property 1: after any random sequence of minutes and actions, all five meters
// stay between 0 and 100 (and never go NaN). This drives tickMinute plus the
// mutating care actions with generator-chosen inputs, and checks the invariant
// after every single step, not just at the end.
test('all five meters stay between 0 and 100 after any random sequence', () => {
  // One "move" is an arbitrary minute-tick context or a care action.
  const ctxArb = fc.record({
    kind: fc.constant('tick'),
    idleSeconds: fc.integer({ min: 0, max: 900 }),
    locked: fc.boolean(),
    working: fc.boolean(),
    distracting: fc.boolean(),
    music: fc.boolean(),
    night: fc.boolean(),
    charging: fc.boolean(),
    screenLimit: fc.integer({ min: 30, max: 300 }),
    distractionAllowance: fc.integer({ min: 0, max: 120 }),
  });
  const actionArb = fc.record({
    kind: fc.constantFrom('feed', 'pet', 'play', 'basket', 'updates', 'mess', 'deadline', 'plan'),
    food: fc.constantFrom('task-S', 'task-M', 'task-L', 'commit', 'focus-session', 'focus'),
    updates: fc.integer({ min: 0, max: 4 }),
    dirty: fc.boolean(),
  });
  fc.assert(
    fc.property(fc.array(fc.oneof(ctxArb, actionArb), { minLength: 1, maxLength: 300 }), (moves) => {
      const p = baby();
      let now = Date.now();
      inRange(p, 'at start');
      for (const m of moves) {
        if (m.kind === 'tick') {
          now += 60000;
          P.tickMinute(p, { ...m, distractionSource: 'youtube.com', now });
        } else if (m.kind === 'feed') P.feed(p, m.food);
        else if (m.kind === 'pet') P.petIt(p);
        else if (m.kind === 'play') P.play(p);
        else if (m.kind === 'basket') P.basket(p);
        else if (m.kind === 'updates') P.setUpdates(p, m.updates);
        else if (m.kind === 'mess') P.setMess(p, m.dirty ? [{ kind: 'downloads', count: 80, limit: 50 }] : []);
        else if (m.kind === 'deadline') P.missedDeadline(p);
        else if (m.kind === 'plan') { P.planDay(p); P.planDone(p); }
        inRange(p, `after ${m.kind}`);
      }
    }),
    { numRuns: 300 },
  );
});

// Property 2: a pet can't die while asleep with the computer away. Being away
// (locked, or idle >= 5 min) puts the pet to sleep; while asleep it only sips
// hunger (hungerAway, 0.08/min) and tops up energy, so sleep itself does no
// health damage. Over a long away stretch it must never become a ghost.
// The happiness and discipline generators now span the full 0..100 range: a
// sleeping pet that is neither starving nor sick nor dirty must survive the
// whole away stretch no matter how low its joy or discipline, because the
// joyless and undisciplined penalties are guarded by !pet.asleep (the hard
// problems — starving, sick, dirty/flies/mess — are excluded by the generators
// below). This is the restored, bug-catching form of the test.
test('a pet cannot die while asleep with the computer away', () => {
  fc.assert(
    fc.property(
      fc.record({
        // Hunger starts high enough that 0.08/min of sleep-drain can't reach 0
        // within the longest run (16h * 0.08 ~= 77 points), so we're testing
        // that sleep itself doesn't kill it, not re-testing starvation.
        hunger: fc.integer({ min: 80, max: 100 }),
        energy: fc.integer({ min: 0, max: 100 }),
        happiness: fc.integer({ min: 0, max: 100 }),
        health: fc.integer({ min: 1, max: 100 }),
        discipline: fc.integer({ min: 0, max: 100 }),
        minutes: fc.integer({ min: 1, max: 16 * 60 }),
        night: fc.boolean(),
      }),
      ({ hunger, energy, happiness, health, discipline, minutes, night }) => {
        const p = baby();
        Object.assign(p, { hunger, energy, happiness, health, discipline });
        let now = Date.now();
        // Wake hour kept far in the future so a night sleep doesn't end mid-run;
        // the point is that an away pet is asleep and can't die, not when it wakes.
        const wakeAt = now + 7 * 24 * 3600e3;
        P.tickMinute(p, { locked: true, night, wakeAt, now: (now += 60000) });
        assert.equal(p.asleep, true, 'away pet should be asleep');
        for (let i = 1; i < minutes; i += 1) {
          P.tickMinute(p, { locked: true, night, wakeAt, now: (now += 60000) });
          assert.equal(p.ghost, false, `died while asleep after ${i + 1} min`);
        }
        assert.equal(p.ghost, false);
        inRange(p, 'after sleeping away');
      },
    ),
    { numRuns: 200 },
  );
});

// Property 3: curing updates always raises health. For any pet that currently
// needs medicine, setUpdates(pet, 0) emits 'cured' and must leave health no
// lower than before — strictly higher unless it was already at the 100 ceiling.
test('curing updates always raises health', () => {
  fc.assert(
    fc.property(
      fc.record({
        health: fc.integer({ min: 0, max: 100 }),
        happiness: fc.integer({ min: 0, max: 100 }),
        pending: fc.integer({ min: 1, max: 5 }),
      }),
      ({ health, happiness, pending }) => {
        const p = baby();
        p.health = health;
        p.happiness = happiness;
        P.setUpdates(p, pending); // now sick
        assert.equal(p.needsMedicine, true);
        const before = p.health;
        const ev = P.setUpdates(p, 0); // cure
        assert.ok(ev.includes('cured'));
        assert.ok(p.health >= before, `health dropped: ${before} -> ${p.health}`);
        if (before < 100) assert.ok(p.health > before, `health did not rise: ${before} -> ${p.health}`);
        inRange(p, 'after cure');
      },
    ),
    { numRuns: 200 },
  );
});

// Property 4: cleaning up always removes flies. Whatever the mess/flies/sick
// state, calling setMess(pet, []) clears the piles and the flies, every time.
test('cleaning up always removes flies', () => {
  fc.assert(
    fc.property(
      fc.record({
        flies: fc.boolean(),
        messSick: fc.boolean(),
        messMinutes: fc.integer({ min: 0, max: 500 }),
        piles: fc.array(fc.constantFrom('downloads', 'desktop', 'tabs', 'trash'), { minLength: 0, maxLength: 4 }),
      }),
      ({ flies, messSick, messMinutes, piles }) => {
        const p = baby();
        p.poop = piles.map((kind) => ({ kind, count: 80, limit: 50 }));
        p.flies = flies;
        p.messSick = messSick;
        p.messMinutes = messMinutes;
        P.setMess(p, []);
        assert.ok(!p.flies, 'flies should be gone');
        assert.equal(p.poop.length, 0, 'mess should be empty');
        assert.equal(p.messMinutes, 0);
        assert.equal(p.messSick, false);
      },
    ),
    { numRuns: 200 },
  );
});

// Property 5: finishing all planned tasks gives the bonus exactly once. This
// mirrors main.js's checkPlanDone guard (a per-day `bonus` flag + every planned
// task done) around the pure P.planDone reward, and runs it repeatedly. The
// 'plan-done' bonus must fire exactly once no matter how many times completion
// is re-checked.
test('finishing all planned tasks gives the bonus exactly once', () => {
  fc.assert(
    fc.property(
      fc.record({
        count: fc.integer({ min: 1, max: 3 }),
        rechecks: fc.integer({ min: 1, max: 8 }),
        sizes: fc.array(fc.constantFrom('S', 'M', 'L'), { minLength: 3, maxLength: 3 }),
      }),
      ({ count, rechecks, sizes }) => {
        const p = baby();
        let now = 1_000_000;
        const tasks = [];
        const planned = [];
        for (let i = 0; i < count; i += 1) {
          const t = T.createTask({ title: `task ${i}`, size: sizes[i] }, now);
          tasks.push(t);
          planned.push(t.id);
          now += 1;
        }
        const checkin = { ids: planned, bonus: false };
        // Same guard as main.js checkPlanDone: fire the bonus once, only when
        // the plan exists, isn't already bonused, and every planned task is done.
        const checkPlanDone = () => {
          if (!checkin || checkin.bonus || !checkin.ids.length) return [];
          const open = checkin.ids.map((id) => tasks.find((x) => x.id === id)).filter((t) => t && !t.dismissed);
          if (!open.length || !open.every((t) => t.done)) return [];
          checkin.bonus = true;
          return P.planDone(p);
        };
        let bonuses = 0;
        // Complete the planned tasks one at a time, re-checking after each; a
        // partially-done plan must not pay out early.
        for (const id of planned) {
          T.complete(tasks, id, (now += 1));
          const done = planned.every((pid) => tasks.find((t) => t.id === pid).done);
          const ev = checkPlanDone();
          bonuses += ev.filter((e) => e === 'plan-done').length;
          if (!done) assert.equal(ev.length, 0, 'no bonus before the whole plan is done');
        }
        // Re-check many more times: still exactly one payout.
        for (let i = 0; i < rechecks; i += 1) bonuses += checkPlanDone().filter((e) => e === 'plan-done').length;
        assert.equal(bonuses, 1, `bonus paid ${bonuses} times`);
        inRange(p, 'after plan-done');
      },
    ),
    { numRuns: 200 },
  );
});

console.log(`\n${passed} tests passed`);
