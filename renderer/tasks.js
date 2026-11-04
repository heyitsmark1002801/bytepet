// Tasks window: add, complete, focus on and delete tasks; connect calendar & GitHub.
const api = window.tasksApi;
const $ = (id) => document.getElementById(id);
let view = null;
let icsDirty = false;

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function dueText(due) {
  if (!due) return null;
  const mins = (due - Date.now()) / 60000;
  const when = new Date(due).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
  if (mins < 0) return { text: `Overdue · was due ${when}`, soon: true };
  if (mins < 60) return { text: `Due in ${Math.ceil(mins)} min`, soon: true };
  if (mins < 24 * 60) return { text: `Due in ${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m · ${when}`, soon: mins < 120 };
  return { text: `Due ${when}`, soon: false };
}

function taskItem(t, focusing) {
  const meta = [];
  const d = dueText(t.due);
  const reward = view.sizes[t.size];
  meta.push(`+${reward.units} food · +${reward.xp} XP`);
  if (d) meta.push(d.text);
  const metaEl = el('div', { class: `task-meta${d && d.soon ? ' soon' : ''}` }, meta.join(' · '));
  const SOURCE = { github: 'GitHub', todoist: 'Todoist', reminders: 'Reminders', calendar: 'Calendar' };
  if (SOURCE[t.source]) {
    metaEl.append(' · ');
    if (t.url) metaEl.append(el('a', { class: 'source', href: '#', onclick: (e) => { e.preventDefault(); api.openUrl(t.url); } }, `${SOURCE[t.source]} ↗`));
    else metaEl.append(el('span', { class: 'source' }, `from ${SOURCE[t.source]}`));
  }
  return el('li', { class: `${t.missed ? 'overdue' : ''} ${focusing ? 'focusing' : ''}` },
    el('div', { class: 'badge', title: reward.label }, t.size),
    el('div', { class: 'task-main' }, el('div', { class: 'task-title' }, t.title), metaEl),
    el('div', { class: 'actions' },
      el('button', { class: 'done-btn', title: 'Mark done and feed your pet', 'aria-label': `Mark "${t.title}" done`, onclick: () => api.complete(t.id).then(render) }, '✓'),
      el('button', { title: 'Focus on this for 25 minutes', 'aria-label': `Focus on "${t.title}"`, onclick: () => api.focus(t.id).then(render) }, '▶'),
      el('button', { title: 'Delete (no reward)', 'aria-label': `Delete "${t.title}"`, onclick: () => api.remove(t.id).then(render) }, '✕')));
}

// ---------- morning check-in ----------
let checkinKey = '';
function renderCheckin() {
  const c = view.checkin;
  const box = $('checkin');
  const key = JSON.stringify(c);
  if (key === checkinKey) return; // keep whatever you're typing
  checkinKey = key;
  if (!c || (!c.pending && !c.today.length)) { box.hidden = true; return; }
  box.hidden = false;
  $('open-titles').replaceChildren(...view.open.map((t) => el('option', { value: t.title })));
  if (c.pending) {
    const rows = [0, 1, 2].map((i) => {
      const input = el('input', { type: 'text', maxlength: '140', list: 'open-titles', placeholder: ['Most important thing today…', 'Second task…', 'Third task…'][i] });
      const size = el('select', { 'aria-label': 'Size' }, ...['S', 'M', 'L'].map((s) => el('option', { value: s }, `${s} · ${view.sizes[s].units} 🍙`)));
      size.value = i === 0 ? 'L' : 'M';
      return { input, size, row: el('div', { class: 'checkin-row' }, el('span', { class: 'num' }, String(i + 1)), input, size) };
    });
    const go = el('button', { class: 'primary', type: 'button' }, "Let's go! ☀️");
    go.addEventListener('click', async () => {
      const items = rows.map(({ input, size }) => {
        const title = input.value.trim();
        const existing = view.open.find((t) => t.title === title);
        return existing ? { id: existing.id } : { title, size: size.value };
      }).filter((x) => x.id || x.title);
      if (!items.length) { rows[0].input.focus(); return; }
      checkinKey = '';
      render(await api.checkinSubmit(items));
    });
    box.replaceChildren(
      el('div', { class: 'checkin-head' }, `☀️ Good morning! What are your 3 tasks for today?`),
      el('p', { class: 'help' }, `Pick from your list or type new ones. Finish all three for a bonus treat for ${view.petName} 🍰`),
      ...rows.map((r) => r.row),
      el('div', { class: 'row-left' }, go, el('button', { type: 'button', class: 'ghost-btn', onclick: async () => { checkinKey = ''; render(await api.checkinSkip()); } }, 'Skip today')));
    return;
  }
  const done = c.today.filter((t) => t.done).length;
  box.replaceChildren(
    el('div', { class: 'checkin-head' }, c.bonus ? '🍰 Today\'s plan: done!' : `☀️ Today's plan · ${done} of ${c.today.length}`),
    ...c.today.map((t) => el('div', { class: `plan-row ${t.done ? 'done' : ''}` },
      el('span', {}, t.done ? '✅' : '⬜'),
      el('span', { class: 'plan-title' }, t.title),
      t.done ? null : el('button', { class: 'small-btn', title: 'Mark done', onclick: () => api.complete(t.id).then(render) }, '✓'))),
    c.bonus ? null : el('p', { class: 'help' }, `Finish all ${c.today.length} for a bonus treat 🍰`));
}

let lastKey = '';
function render(v) {
  if (v) view = v;
  if (!view) return;
  // During a focus session updates arrive every second: only redraw the timer
  // unless something else changed, so buttons don't lose keyboard focus.
  const key = JSON.stringify({ ...view, focus: view.focus && view.focus.taskId, t: Math.floor(Date.now() / 30000) });
  if (key === lastKey && view.focus) {
    const s = Math.ceil(view.focus.remainingMs / 1000);
    $('focus-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return;
  }
  lastKey = key;
  $('pet-name').textContent = view.petName;
  document.title = `${view.petName} — Tasks`;

  // alerts
  const alertsEl = $('alerts');
  alertsEl.replaceChildren(...view.alerts.map((a) => el('div', {}, `! ${a.text}`)));
  alertsEl.hidden = view.alerts.length === 0;

  renderCheckin();

  // focus
  const f = view.focus;
  $('focus-bar').hidden = !f;
  if (f) {
    const s = Math.ceil(f.remainingMs / 1000);
    $('focus-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('focus-task').textContent = f.taskTitle || '(no task)';
  }

  // lists
  $('open-list').replaceChildren(...view.open.map((t) => taskItem(t, f && f.taskId === t.id)));
  $('open-count').textContent = view.open.length ? `(${view.open.length})` : '';
  const lateCount = view.open.filter((t) => t.missed).length;
  $('clear-overdue').hidden = lateCount === 0;
  $('clear-overdue').textContent = `Hide ${lateCount} overdue`;
  $('empty').hidden = view.open.length > 0;
  const xp = view.doneToday.reduce((n, t) => n + view.sizes[t.size].xp, 0);
  const food = view.doneToday.reduce((n, t) => n + view.sizes[t.size].units, 0);
  $('done-summary').textContent = view.doneToday.length ? `(${view.doneToday.length} · +${food} food · +${xp} XP)` : '';
  $('done-list').replaceChildren(...view.doneToday.slice().reverse().map((t) => el('li', {},
    el('div', { class: 'badge' }, t.size),
    el('div', { class: 'task-main' }, el('div', { class: 'task-title' }, t.title)))));

  // connections
  const c = view.connections;
  if (!icsDirty) $('ics').value = c.calendarUrls.join('\n');
  $('cal-status').textContent = c.calendarStatus || (c.calendarUrls.length ? 'Loading…' : 'Not connected');
  $('gh-disconnected').hidden = c.githubConnected;
  $('gh-connected').hidden = !c.githubConnected;
  if (!$('gh-status').dataset.sticky) $('gh-status').textContent = c.githubConnected ? c.githubStatus : '';

  $('rem-disconnect').hidden = !c.remindersEnabled;
  $('rem-load').textContent = c.remindersEnabled ? 'Change lists…' : 'Connect Reminders…';
  if (!$('rem-status').dataset.sticky) {
    $('rem-status').textContent = c.remindersEnabled
      ? `${c.remindersLists.length ? c.remindersLists.join(', ') : 'All lists'} · ${c.remindersStatus || 'syncing…'}`
      : (c.isMac ? '' : 'Only available on a Mac.');
  }
  $('td-disconnected').hidden = c.todoistConnected;
  $('td-connected').hidden = !c.todoistConnected;
  if (!$('td-status').dataset.sticky) $('td-status').textContent = c.todoistConnected ? c.todoistStatus || 'Syncing…' : '';
  $('complete-in-source').checked = c.completeInSource;
}

// add a task
$('add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('title').value.trim();
  const size = document.querySelector('input[name="size"]:checked').value;
  const dueVal = $('due').value;
  const due = dueVal ? new Date(dueVal).getTime() : null;
  const r = await api.add({ title, size, due });
  $('add-error').hidden = r.ok;
  if (!r.ok) { $('add-error').textContent = r.error; return; }
  $('title').value = '';
  $('due').value = '';
  $('title').focus();
  render(await api.get());
});

$('focus-stop').addEventListener('click', () => api.stopFocus().then(render));

$('clear-overdue').addEventListener('click', async () => {
  const n = view.open.filter((t) => t.missed).length;
  if (!window.confirm(`Hide ${n} overdue task${n === 1 ? '' : 's'}?\n\nTasks from Reminders or Todoist are only hidden here. They stay in those apps.`)) return;
  const r = await api.clearOverdue();
  render(r.view);
});

// calendar
$('ics').addEventListener('input', () => { icsDirty = true; });
$('save-ics').addEventListener('click', async () => {
  $('cal-status').textContent = 'Checking…';
  const urls = $('ics').value.split(/\s+/).filter(Boolean);
  icsDirty = false;
  render(await api.setCalendar(urls));
});

// github
function sticky(id, text) {
  const s = $(id);
  s.textContent = text;
  s.dataset.sticky = '1';
  clearTimeout(s._t);
  s._t = setTimeout(() => { delete s.dataset.sticky; render(); }, 6000);
}
const ghStatus = (text) => sticky('gh-status', text);
$('gh-connect').addEventListener('click', async () => {
  ghStatus('Connecting…');
  const r = await api.setGithub($('gh-token').value);
  $('gh-token').value = '';
  ghStatus(r.ok ? `Connected as ${r.user}.` : r.error);
  render(await api.get());
});
$('gh-import').addEventListener('click', async () => {
  ghStatus('Importing…');
  const r = await api.importGithub();
  ghStatus(r.ok ? `Imported ${r.added} new task(s) (${r.total} assigned to you).` : r.error);
  render(await api.get());
});
$('gh-disconnect').addEventListener('click', async () => {
  render(await api.disconnectGithub());
  ghStatus('Disconnected. Token removed.');
});

// Apple Reminders
$('rem-load').addEventListener('click', async () => {
  sticky('rem-status', 'Asking Reminders for your lists… (allow access if macOS asks)');
  const r = await api.remindersLists();
  if (!r.ok) { sticky('rem-status', r.error); return; }
  const chosen = new Set(view.connections.remindersLists);
  const all = chosen.size === 0;
  $('rem-lists').replaceChildren(...r.lists.map((name) => {
    const box = el('input', { type: 'checkbox', value: name });
    box.checked = all || chosen.has(name);
    return el('label', {}, box, name);
  }));
  $('rem-picker').hidden = false;
  sticky('rem-status', r.lists.length ? 'Pick the lists that hold real to-dos (skip groceries!).' : 'No lists found.');
});
$('rem-save').addEventListener('click', async () => {
  const boxes = [...document.querySelectorAll('#rem-lists input')];
  const picked = boxes.filter((b) => b.checked).map((b) => b.value);
  if (!picked.length) { sticky('rem-status', 'Pick at least one list.'); return; }
  sticky('rem-status', 'Syncing…');
  const r = await api.remindersSave(picked.length === boxes.length ? [] : picked);
  $('rem-picker').hidden = true;
  sticky('rem-status', r.ok ? `Connected! ${r.open} open reminder(s), ${r.added} new task(s).` : r.error);
  render(await api.get());
});
$('rem-disconnect').addEventListener('click', async () => {
  render(await api.remindersDisconnect());
  sticky('rem-status', 'Disconnected. Reminders are untouched.');
});

// Todoist
$('td-connect').addEventListener('click', async () => {
  sticky('td-status', 'Connecting…');
  const r = await api.setTodoist($('td-token').value);
  $('td-token').value = '';
  sticky('td-status', r.ok ? `Connected! ${r.open} open task(s), ${r.added} new.` : r.error);
  render(await api.get());
});
$('td-disconnect').addEventListener('click', async () => {
  render(await api.disconnectTodoist());
  sticky('td-status', 'Disconnected. Token removed.');
});

$('complete-in-source').addEventListener('change', (e) => api.setCompleteInSource(e.target.checked).then(render));
$('sync-now').addEventListener('click', () => api.syncNow().then(render));

api.onUpdate(render);
api.get().then(render);
setInterval(() => render(), 30000); // keep "due in" times fresh
