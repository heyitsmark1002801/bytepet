// Is what's on screen a distraction? Pure rules, so they can be tested.
//
// Checked in this order:
//   1. Never-distracting list (apps or sites you use for work, e.g. Discord for your team)
//   2. Learning: a distracting site whose title says "tutorial", "lecture"… doesn't count
//   3. Your distracting apps list
//   4. Your distracting websites list (the active tab of the browser in front)
//   5. Window-title keywords (Firefox & friends)
//   6. App categories: any game, entertainment or social app — no list needed

const lower = (s) => String(s || '').toLowerCase();
const inList = (name, list) => !!name && (list || []).some((x) => lower(x) === lower(name));
const siteIn = (host, list) => !!host && (list || []).some((d) => {
  const dd = lower(d).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return dd && (host === dd || host.endsWith(`.${dd}`));
});
const titleHas = (title, words) => !!title && (words || []).some((w) => w && lower(title).includes(lower(w)));

// Apple's app categories (LSApplicationCategoryType)
function categoryKind(category, bundlePath) {
  const c = lower(category);
  if (c.includes('games') || /\/steamapps\//i.test(bundlePath || '')) return 'game';
  if (c === 'public.app-category.entertainment') return 'entertainment';
  if (c === 'public.app-category.social-networking') return 'social';
  return null;
}

// s = { app, bundlePath, category, site, title }
// cfg = { distractionApps, distractionSites, distractionKeywords, neverDistracting, learningKeywords,
//         countCategories: { game, entertainment, social } }
function decide(s, cfg) {
  const app = s.app || null;
  const site = s.site || null;
  const label = site || app || 'Unknown';
  if (!app && !site) return { distracting: false, source: null, reason: 'nothing in front' };

  if (inList(app, cfg.neverDistracting) || siteIn(site, cfg.neverDistracting)) {
    return { distracting: false, source: label, reason: 'on your never-distracting list' };
  }
  const siteHit = siteIn(site, cfg.distractionSites);
  const titleHit = titleHas(s.title, cfg.distractionKeywords);
  if ((siteHit || titleHit) && titleHas(s.title, cfg.learningKeywords)) {
    return { distracting: false, source: label, reason: 'looks like learning', learning: true };
  }
  if (inList(app, cfg.distractionApps)) return { distracting: true, source: app, reason: 'distracting app' };
  if (siteHit) return { distracting: true, source: site, reason: 'distracting website' };
  if (titleHit) {
    const word = (cfg.distractionKeywords || []).find((w) => lower(s.title).includes(lower(w)));
    return { distracting: true, source: word || app, reason: 'window title' };
  }
  const kind = categoryKind(s.category, s.bundlePath);
  const on = cfg.countCategories || {};
  if (kind && on[kind] !== false) {
    return { distracting: true, source: app, reason: kind === 'game' ? 'a game' : `${kind} app`, kind };
  }
  return { distracting: false, source: label, reason: 'not distracting' };
}

// Distractions that are open but not in front: running apps and tabs in any browser window.
// apps = [{ name, bundlePath, category }], tabs = [{ browser, site, title }]
// Apple's own apps (/System/…, like Messages) are only checked against your list, never by category.
function decideBackground(apps, tabs, cfg, skip = {}) {
  const hits = [];
  const seen = new Set();
  const add = (source, reason, extra = {}) => { if (!seen.has(source)) { seen.add(source); hits.push({ source, reason, ...extra }); } };
  for (const a of apps || []) {
    if (!a.name || a.name === skip.app || (skip.selfPath && a.bundlePath === skip.selfPath)) continue;
    if (a.agent && !inList(a.name, cfg.distractionApps)) continue; // invisible helpers (no window, no Dock icon)
    if (inList(a.name, cfg.neverDistracting)) continue;
    if (inList(a.name, cfg.distractionApps)) { add(a.name, 'app open in the background', { bundlePath: a.bundlePath }); continue; }
    if (/^\/System\//.test(a.bundlePath || '')) continue;
    const kind = categoryKind(a.category, a.bundlePath);
    if (kind && (cfg.countCategories || {})[kind] !== false) add(a.name, `${kind === 'game' ? 'game' : `${kind} app`} open in the background`, { bundlePath: a.bundlePath });
  }
  for (const t of tabs || []) {
    if (!t.site || t.site === skip.site || siteIn(t.site, cfg.neverDistracting)) continue;
    if (!siteIn(t.site, cfg.distractionSites)) continue;
    if (titleHas(t.title, cfg.learningKeywords)) continue;
    add(t.site, `tab open in ${t.browser}`, { browser: t.browser });
  }
  return hits;
}

// Combine the last minute of 15-second samples: a distraction needs at least half of them
function combine(samples) {
  if (!samples.length) return { distracting: false, source: null, ratio: 0 };
  const hits = samples.filter((x) => x.distracting);
  const ratio = hits.length / samples.length;
  const counts = {};
  for (const h of hits) counts[h.source] = (counts[h.source] || 0) + 1;
  const source = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null;
  return { distracting: ratio >= 0.5, source, ratio };
}

// When do distractions count? { mode: 'always' | 'work', days: [1..5], start: 9, end: 18 }
function counts(schedule, date = new Date()) {
  if (!schedule || schedule.mode !== 'work') return true;
  const day = date.getDay();
  const h = date.getHours() + date.getMinutes() / 60;
  return (schedule.days || [1, 2, 3, 4, 5]).includes(day) && h >= (schedule.start ?? 9) && h < (schedule.end ?? 18);
}

module.exports = { decide, decideBackground, combine, counts, categoryKind, siteIn };
