// Keeps Bytepet's task list in step with other to-do apps (pure, testable).
//
// Each source (Reminders, Todoist, calendar tasks) gives us its OPEN items as
// { externalId, title, due, size, url }. We add new ones, update changed ones,
// and report local tasks that disappeared from the open list so the app can
// ask the source whether they were completed (reward) or deleted (no reward).

const T = require('./tasks');

const BRACKET_TAG = /\s*\[(S|M|L)\]\s*/i;
const HASH_TAG = /\s*#(small|medium|large|s|m|l)\b\s*/i;

// "[L] Write report" or "Write report #large" → size L, clean title
function parseSizeTag(title) {
  const text = String(title || '');
  const m = text.match(BRACKET_TAG) || text.match(HASH_TAG);
  if (!m) return { title: text.trim(), size: null };
  const v = m[1].toLowerCase()[0];
  const size = v === 's' ? 'S' : v === 'l' ? 'L' : 'M';
  return { title: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim(), size };
}

// Priority → size. Apple Reminders & iCal: 1–4 high, 5 medium, 6–9 low, 0 none.
// Todoist: 4 = p1 (urgent) … 1 = p4 (normal).
function sizeFromPriority(source, priority) {
  const p = Number(priority) || 0;
  if (source === 'todoist') return p === 4 ? 'L' : null;
  if (p >= 1 && p <= 4) return 'L';
  if (p === 5) return 'M';
  if (p >= 6 && p <= 9) return 'S';
  return null;
}

// Decide a size: title tag > labels > priority > medium
function pickSize({ title, labels, priority, source }) {
  const tag = parseSizeTag(title);
  if (tag.size) return { title: tag.title, size: tag.size };
  if (labels && labels.length) {
    const fromLabels = T.sizeFromLabels(labels);
    const named = labels.some((l) => /\b(s|m|l|small|medium|large|xs|xl)\b/i.test(String(l.name || l).replace(/^(size|effort)\s*[:/-]\s*/i, '')));
    if (named) return { title: tag.title, size: fromLabels };
  }
  return { title: tag.title, size: sizeFromPriority(source, priority) || 'M' };
}

function reconcile(tasks, source, remote, now = Date.now()) {
  const mine = tasks.filter((t) => t.source === source);
  const byExt = new Map(mine.map((t) => [t.externalId, t]));
  const added = [];
  const updated = [];
  const seen = new Set();

  for (const r of remote) {
    if (!r || !r.externalId || !r.title) continue;
    seen.add(r.externalId);
    const local = byExt.get(r.externalId);
    if (!local) {
      const t = T.createTask({
        title: r.title, size: r.size || 'M', due: r.due || null, source, externalId: r.externalId, url: r.url || null,
      }, now);
      // already overdue when we first see it: show it, but it's not a fresh care mistake
      if (t.due && t.due <= now) t.missed = true;
      added.push(t);
      byExt.set(r.externalId, t);
      continue;
    }
    if (local.done || local.dismissed) continue;
    let changed = false;
    if (r.title !== local.title) { local.title = r.title; changed = true; }
    const due = r.due || null;
    if (due !== local.due) {
      local.due = due;
      local.missed = !!due && local.missed && due <= now;
      local.warned = false;
      changed = true;
    }
    if (r.size && r.size !== local.size) { local.size = r.size; changed = true; }
    if (changed) updated.push(local);
  }

  const missing = mine.filter((t) => !t.done && !t.dismissed && !seen.has(t.externalId));
  return { added, updated, missing };
}

module.exports = { parseSizeTag, sizeFromPriority, pickSize, reconcile };
