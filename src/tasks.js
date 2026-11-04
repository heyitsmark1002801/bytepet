// Task list logic (pure, testable). The app stores the list in tasks.json.

const SIZES = {
  S: { label: 'Small', units: 1, xp: 10 },
  M: { label: 'Medium', units: 2, xp: 20 },
  L: { label: 'Large', units: 3, xp: 40 },
};

let counter = 0;
function newId(now) {
  counter += 1;
  return `t${now.toString(36)}${counter.toString(36)}`;
}

function createTask({ title, size = 'M', due = null, source = 'manual', externalId = null, url = null }, now = Date.now()) {
  const clean = String(title || '').trim().slice(0, 140);
  if (!clean) throw new Error('A task needs a title');
  return {
    id: newId(now),
    title: clean,
    size: SIZES[size] ? size : 'M',
    due: due ? Number(due) : null, // ms timestamp
    created: now,
    done: false,
    doneAt: null,
    source, // 'manual' | 'github' | 'reminders' | 'todoist' | 'calendar'
    externalId,
    url,
    warned: false, // "due soon" alert already sent
    missed: false, // deadline passed while still open
    dismissed: false, // removed here but still exists in another app: don't re-import
  };
}

function openTasks(tasks) {
  const order = (t) => (t.due ? t.due : Number.MAX_SAFE_INTEGER);
  return tasks.filter((t) => !t.done && !t.dismissed).sort((a, b) => order(a) - order(b) || a.created - b.created);
}

function doneToday(tasks, now = Date.now()) {
  const day = new Date(now).toDateString();
  return tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === day);
}

function complete(tasks, id, now = Date.now()) {
  const t = tasks.find((x) => x.id === id);
  if (!t || t.done) return null;
  t.done = true;
  t.doneAt = now;
  return t;
}

// Deadline checks, run every minute.
// Returns { soon: open tasks due within `soonMs`, newlyMissed: tasks that just went overdue }
function checkDeadlines(tasks, now = Date.now(), soonMs = 60 * 60000) {
  const soon = [];
  const newlyMissed = [];
  for (const t of tasks) {
    if (t.done || t.dismissed || !t.due) continue;
    if (t.due <= now) {
      if (!t.missed) { t.missed = true; newlyMissed.push(t); }
    } else if (t.due - now <= soonMs) {
      soon.push(t);
    }
  }
  return { soon, newlyMissed };
}

// Guess a size from GitHub labels like "size:S", "small", "L", "effort: large"
function sizeFromLabels(labels = []) {
  const names = labels.map((l) => String(typeof l === 'string' ? l : l.name || '').toLowerCase());
  for (const n of names) {
    if (/\b(s|small|xs)\b/.test(n.replace(/^(size|effort)\s*[:/-]\s*/, ''))) return 'S';
    if (/\b(l|large|xl)\b/.test(n.replace(/^(size|effort)\s*[:/-]\s*/, ''))) return 'L';
    if (/\b(m|medium)\b/.test(n.replace(/^(size|effort)\s*[:/-]\s*/, ''))) return 'M';
  }
  return 'M';
}

module.exports = { SIZES, createTask, openTasks, doneToday, complete, checkDeadlines, sizeFromLabels };
