// Minimal iCalendar (.ics) reader for upcoming events.
// Works with the "secret address in iCal format" from Google Calendar,
// Outlook's published ICS link, or an iCloud public calendar link.
// Handles UTC, TZID and all-day times, plus simple daily/weekly repeats.

function unfold(text) {
  return String(text).replace(/\r?\n[ \t]/g, '');
}

// Offset (ms) of a time zone at a given instant, using the built-in Intl data
function tzOffset(timeZone, utcMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - utcMs;
  } catch {
    return null;
  }
}

function parseDate(value, params = {}) {
  const v = String(value).trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m || params.VALUE === 'DATE') {
    m = m || v.match(/^(\d{4})(\d{2})(\d{2})/);
    return { ms: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), allDay: true };
  }
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (m[7]) return { ms: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  if (params.TZID) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const off1 = tzOffset(params.TZID, guess);
    if (off1 !== null) {
      const off2 = tzOffset(params.TZID, guess - off1);
      return { ms: guess - (off2 ?? off1), allDay: false };
    }
  }
  return { ms: new Date(y, mo - 1, d, h, mi, s).getTime(), allDay: false }; // floating = local time
}

function parseLine(line) {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...rest] = head.split(';');
  const params = {};
  for (const p of rest) {
    const [k, v] = p.split('=');
    if (k) params[k.toUpperCase()] = (v || '').replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

const unescapeText = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const raw of unfold(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start && cur.status !== 'CANCELLED') events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'UID') cur.uid = p.value;
    else if (p.name === 'SUMMARY') cur.summary = unescapeText(p.value);
    else if (p.name === 'STATUS') cur.status = p.value.toUpperCase();
    else if (p.name === 'RRULE') cur.rrule = p.value;
    else if (p.name === 'DTSTART') {
      const d = parseDate(p.value, p.params);
      if (d) { cur.start = d.ms; cur.allDay = d.allDay; }
    } else if (p.name === 'DTEND') {
      const d = parseDate(p.value, p.params);
      if (d) cur.end = d.ms;
    } else if (p.name === 'EXDATE') {
      for (const v of p.value.split(',')) {
        const d = parseDate(v, p.params);
        if (d) cur.exdates.push(d.ms);
      }
    }
  }
  return events;
}

// Tasks (VTODO) that some calendar apps include in their iCal link
// (Nextcloud, Fastmail, Zoho, Thunderbird...). Google and iCloud don't.
function parseTodos(text) {
  const todos = [];
  let cur = null;
  for (const raw of unfold(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === 'BEGIN:VTODO') { cur = { done: false, priority: 0 }; continue; }
    if (line === 'END:VTODO') {
      if (cur && cur.uid && cur.summary && cur.status !== 'CANCELLED') todos.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'UID') cur.uid = p.value;
    else if (p.name === 'SUMMARY') cur.summary = unescapeText(p.value);
    else if (p.name === 'PRIORITY') cur.priority = Number(p.value) || 0;
    else if (p.name === 'STATUS') {
      cur.status = p.value.toUpperCase();
      if (cur.status === 'COMPLETED') cur.done = true;
    } else if (p.name === 'COMPLETED') cur.done = true;
    else if (p.name === 'DUE') {
      const d = parseDate(p.value, p.params);
      if (d) cur.due = d.allDay ? d.ms + (23 * 60 + 59) * 60000 : d.ms; // all-day: end of that day
    }
  }
  return todos;
}

function parseRule(rrule) {
  const r = {};
  for (const part of String(rrule).split(';')) {
    const [k, v] = part.split('=');
    if (k) r[k.toUpperCase()] = v;
  }
  return r;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// All event occurrences that start between `from` and `to`
function occurrences(events, from, to) {
  const out = [];
  for (const ev of events) {
    const dur = ev.end ? ev.end - ev.start : 0;
    const push = (start) => {
      if (start >= from && start <= to && !ev.exdates.includes(start)) {
        out.push({ uid: ev.uid, summary: ev.summary || '(no title)', start, end: start + dur, allDay: !!ev.allDay });
      }
    };
    if (!ev.rrule) { push(ev.start); continue; }
    const r = parseRule(ev.rrule);
    const freq = r.FREQ;
    if (freq !== 'DAILY' && freq !== 'WEEKLY') { push(ev.start); continue; } // other repeats: first one only
    const interval = Math.max(1, Number(r.INTERVAL || 1));
    const until = r.UNTIL ? (parseDate(r.UNTIL) || {}).ms : Infinity;
    const byDay = r.BYDAY ? r.BYDAY.split(',').map((d) => d.slice(-2)) : null;
    const startDate = new Date(ev.start);
    const firstDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    // walk day by day through the window
    const d0 = new Date(from - 24 * 3600 * 1000);
    for (let d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()); d.getTime() <= to; d.setDate(d.getDate() + 1)) {
      if (d < firstDay) continue;
      const occ = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startDate.getHours(), startDate.getMinutes(), startDate.getSeconds()).getTime();
      if (occ > until) break;
      const daysSince = Math.round((d - firstDay) / 86400000);
      if (freq === 'DAILY') {
        if (daysSince % interval === 0) push(occ);
      } else {
        const code = DAY_CODES[d.getDay()];
        const okDay = byDay ? byDay.includes(code) : d.getDay() === startDate.getDay();
        const weeks = Math.floor((daysSince + firstDay.getDay()) / 7);
        if (okDay && weeks % interval === 0) push(occ);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

module.exports = { parseIcs, parseTodos, occurrences, parseDate, tzOffset };
