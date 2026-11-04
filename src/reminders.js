// Apple Reminders, read on this Mac with JavaScript for Automation (osascript).
// No account or token. The first time, macOS asks to allow control of Reminders
// (it shows "Terminal" when Bytepet is started from Terminal).

const { execFile } = require('child_process');
const { pickSize } = require('./sync');

function jxa(script, timeout = 60000) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, out: String(stdout || '').trim(), errText: String(stderr || '') });
    });
  });
}

function friendlyError(r) {
  if (/-1743|not authori[sz]ed|not allowed/i.test(r.errText)) {
    return 'Not allowed yet. System Settings → Privacy & Security → Automation → Terminal → turn on Reminders.';
  }
  if (r.err && r.err.killed) return 'Reminders took too long to answer.';
  return 'Could not read Reminders.';
}

async function listNames() {
  if (process.platform !== 'darwin') throw new Error('Apple Reminders only works on a Mac');
  const r = await jxa('JSON.stringify(Application("Reminders").lists.name())');
  if (r.err) throw new Error(friendlyError(r));
  return JSON.parse(r.out || '[]');
}

// Open reminders from the chosen lists (empty = all lists)
async function openItems(lists = []) {
  const script = `
    const app = Application("Reminders");
    const wanted = ${JSON.stringify(lists)};
    const out = [];
    app.lists().forEach((l) => {
      const name = l.name();
      if (wanted.length && !wanted.includes(name)) return;
      const rs = l.reminders.whose({ completed: false });
      const ids = rs.id(), names = rs.name(), dues = rs.dueDate(), prs = rs.priority();
      for (let i = 0; i < ids.length; i++) {
        out.push({ id: ids[i], title: names[i], due: dues[i] ? dues[i].getTime() : null, priority: prs[i], list: name });
      }
    });
    JSON.stringify(out);`;
  const r = await jxa(script);
  if (r.err) throw new Error(friendlyError(r));
  return JSON.parse(r.out || '[]').map((i) => {
    const { title, size } = pickSize({ title: i.title, priority: i.priority, source: 'reminders' });
    return { externalId: i.id, title, size, due: i.due, list: i.list };
  });
}

// For reminders that left the open list: 'done' | 'open' | 'gone'
async function statuses(ids) {
  if (!ids.length) return {};
  const script = `
    const app = Application("Reminders");
    const res = {};
    ${JSON.stringify(ids)}.forEach((id) => {
      try { res[id] = app.reminders.byId(id).completed() ? "done" : "open"; }
      catch (e) { res[id] = "gone"; }
    });
    JSON.stringify(res);`;
  const r = await jxa(script);
  if (r.err) throw new Error(friendlyError(r));
  return JSON.parse(r.out || '{}');
}

// Tick a reminder off (when you finish the task in Bytepet)
async function complete(id) {
  const r = await jxa(`Application("Reminders").reminders.byId(${JSON.stringify(id)}).completed = true; "ok"`, 20000);
  if (r.err) throw new Error(friendlyError(r));
  return true;
}

module.exports = { listNames, openItems, statuses, complete };
