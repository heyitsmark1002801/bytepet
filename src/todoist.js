// Todoist, using your personal API token
// (Todoist → Settings → Integrations → Developer → API token).
// Uses Todoist's unified API v1, and falls back to the older REST v2 if needed.

const { pickSize } = require('./sync');

const V1 = 'https://api.todoist.com/api/v1';
const V2 = 'https://api.todoist.com/rest/v2';
let base = V1;

async function call(token, path, { method = 'GET', root = base } = {}) {
  const r = await fetch(`${root}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Bytepet' },
  });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Todoist rejected the token'), { status: r.status });
  if (!r.ok) throw Object.assign(new Error(`Todoist error ${r.status}`), { status: r.status });
  if (r.status === 204) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function parseDue(due) {
  if (!due) return null;
  if (due.datetime) return Date.parse(due.datetime);
  const d = String(due.date || '');
  if (d.includes('T')) return new Date(d).getTime(); // floating time = local
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59).getTime() : null; // date only: end of day
}

function mapTask(t) {
  const { title, size } = pickSize({ title: t.content, labels: t.labels || [], priority: t.priority, source: 'todoist' });
  return {
    externalId: String(t.id),
    title,
    size,
    due: parseDue(t.due),
    url: `https://app.todoist.com/app/task/${t.id}`,
  };
}

async function fetchAll(token, root) {
  const out = [];
  let cursor = null;
  do {
    const q = new URLSearchParams();
    if (root === V1) q.set('limit', '200');
    if (cursor) q.set('cursor', cursor);
    const res = await call(token, `/tasks${q.toString() ? `?${q}` : ''}`, { root });
    const items = Array.isArray(res) ? res : (res && res.results) || [];
    out.push(...items);
    cursor = Array.isArray(res) ? null : res && res.next_cursor;
  } while (cursor && out.length < 2000);
  return out;
}

async function openItems(token) {
  let items;
  try {
    items = await fetchAll(token, base);
  } catch (e) {
    if (base === V1 && (e.status === 404 || e.status === 410)) {
      base = V2;
      items = await fetchAll(token, base);
    } else throw e;
  }
  return items.filter((t) => !t.checked && !t.is_completed && !t.is_deleted).map(mapTask);
}

// For tasks that left the open list: 'done' | 'open' | 'gone'
async function statuses(token, ids) {
  const res = {};
  for (const id of ids.slice(0, 30)) {
    try {
      const t = await call(token, `/tasks/${encodeURIComponent(id)}`);
      if (t && t.is_deleted) res[id] = 'gone';
      else if (t && (t.checked || t.is_completed)) res[id] = 'done';
      else res[id] = 'open';
    } catch (e) {
      // Completed tasks aren't always returned; most of the time a missing task was ticked off
      res[id] = e.status === 404 ? 'done' : 'open';
    }
  }
  return res;
}

async function complete(token, id) {
  await call(token, `/tasks/${encodeURIComponent(id)}/close`, { method: 'POST' });
  return true;
}

module.exports = { openItems, statuses, complete };
