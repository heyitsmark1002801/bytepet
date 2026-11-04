// Mac checks that turn your computer's state into pet behaviour:
//   digital mess (Desktop, Downloads, Trash, browser tabs) → poop
//   battery → tired / charging
//   heat & CPU load → sweating
//   window titles in browsers we can't read directly → distraction keywords

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const IS_MAC = process.platform === 'darwin';

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => resolve({ err, out: `${stdout || ''}`, errText: `${stderr || ''}` }));
  });
}

// Count visible items in a folder; null if macOS doesn't let us look
function countItems(dir) {
  try {
    return fs.readdirSync(dir).filter((n) => !n.startsWith('.') && n !== 'Icon\r').length;
  } catch {
    return null;
  }
}

const TAB_BROWSERS = {
  Safari: 'Safari',
  'Google Chrome': 'Google Chrome',
  Arc: 'Arc',
  'Brave Browser': 'Brave Browser',
  'Microsoft Edge': 'Microsoft Edge',
  Vivaldi: 'Vivaldi',
  Opera: 'Opera',
};

// Total open tabs across running browsers (never launches a browser)
async function countTabs() {
  if (!IS_MAC) return null;
  let total = 0;
  let any = false;
  for (const [proc, app] of Object.entries(TAB_BROWSERS)) {
    const running = await run('/usr/bin/pgrep', ['-x', proc], 3000);
    if (running.err) continue;
    const r = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
      `Application(${JSON.stringify(app)}).windows().reduce((n, w) => n + w.tabs.length, 0)`], 8000);
    const n = parseInt(r.out, 10);
    if (!r.err && Number.isFinite(n)) { total += n; any = true; }
  }
  return any ? total : null;
}

// Returns the piles of mess over their limits: [{ kind, count, limit, label }]
async function checkMess(limits) {
  const home = os.homedir();
  const piles = [];
  const add = (kind, label, count, limit) => {
    if (count != null && limit > 0 && count > limit) piles.push({ kind, label, count, limit });
  };
  add('desktop', 'Desktop', countItems(path.join(home, 'Desktop')), limits.desktop);
  add('downloads', 'Downloads', countItems(path.join(home, 'Downloads')), limits.downloads);
  add('trash', 'Trash', countItems(path.join(home, '.Trash')), limits.trash); // needs Full Disk Access; skipped if not allowed
  add('tabs', 'browser tabs', await countTabs(), limits.tabs);
  return piles;
}

// Battery: { percent, charging, onBattery } or null on desktops
async function battery() {
  if (!IS_MAC) return null;
  const r = await run('/usr/bin/pmset', ['-g', 'batt'], 4000);
  if (r.err) return null;
  const m = r.out.match(/(\d+)%/);
  if (!m) return null;
  const pluggedIn = /AC Power/i.test(r.out);
  return { percent: Number(m[1]), pluggedIn, charging: /;\s*charging/i.test(r.out), onBattery: !pluggedIn };
}

// Heat: 'nominal' | 'fair' | 'serious' | 'critical' from macOS, plus CPU load
function heat(powerMonitor) {
  let thermal = 'unknown';
  try { if (powerMonitor.getCurrentThermalState) thermal = powerMonitor.getCurrentThermalState(); } catch { /* not supported */ }
  const load = os.loadavg()[0] / Math.max(1, os.cpus().length);
  return { thermal, load, hot: thermal === 'serious' || thermal === 'critical' || load > 0.9 };
}

// Window title of the frontmost app (for browsers we can't ask for a URL, like Firefox).
// Needs Accessibility permission; returns null if not allowed.
let titleDeniedUntil = 0;
async function frontWindowTitle() {
  if (!IS_MAC || Date.now() < titleDeniedUntil) return null;
  const r = await run('/usr/bin/osascript', ['-e',
    'tell application "System Events" to get name of front window of (first application process whose frontmost is true)'], 4000);
  if (r.err) {
    if (/-1719|-1743|-25211|not allowed|assistive/i.test(r.errText)) titleDeniedUntil = Date.now() + 15 * 60000;
    return null;
  }
  return r.out.trim() || null;
}

module.exports = { checkMess, battery, heat, frontWindowTitle, countItems };

// ---------- everything that's open (for "open in the background" distractions) ----------

// Running apps from the process list: no permissions needed.
// "/Applications/Steam.app/Contents/MacOS/steam_osx" → { name: 'Steam', bundlePath: '/Applications/Steam.app' }
function parseRunningApps(psOutput) {
  const seen = new Map();
  for (const line of String(psOutput).split('\n')) {
    // Anything shaped like an app: "…/Steam.app/Contents/MacOS/…", and also Steam's real client,
    // which lives in "…/Steam.AppBundle/Steam/Contents/MacOS/steam_osx" (no ".app")
    const m = line.trim().match(/^(\/.*?)\/Contents\/MacOS\//);
    if (!m) continue;
    const bundlePath = m[1];
    if (/\.(app|xpc|appex|framework|plugin|bundle)\//i.test(bundlePath)) continue; // helpers inside other apps
    if (/\.(xpc|appex|framework|plugin|bundle)$/i.test(bundlePath)) continue; // not apps
    const name = path.basename(bundlePath).replace(/\.app$/i, '');
    if (!name || seen.has(bundlePath)) continue;
    seen.set(bundlePath, { name, bundlePath });
  }
  return [...seen.values()];
}
// Apps that are actually open, the same list the Dock and ⌘-Tab use (asked from macOS).
// Leftover background helpers (like Steam's ipcserver after you quit Steam) don't count.
// policy: 0 = normal app with a Dock icon, 1 = menu-bar/accessory app, 2 = background only.
const WORKSPACE_SCRIPT = `ObjC.import("AppKit");
  const apps = $.NSWorkspace.sharedWorkspace.runningApplications; const out = [];
  for (let i = 0; i < apps.count; i++) {
    try {
      const a = apps.objectAtIndex(i);
      if (a.isTerminated) continue;
      const u = a.bundleURL; const p = u && u.path ? u.path.js : null;
      if (!p) continue;
      out.push([a.localizedName.js || '', p, Number(a.activationPolicy)]);
    } catch (e) {}
  }
  JSON.stringify(out)`;

function parseWorkspaceApps(json) {
  let rows;
  try { rows = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(rows)) return null;
  const seen = new Set();
  const apps = [];
  for (const [name, bundlePath, policy] of rows) {
    if (!bundlePath || seen.has(bundlePath)) continue;
    // helpers nested inside another app, and XPC services, aren't apps you opened
    if (/\.(app|AppBundle)\/.+\.(app|xpc)$/i.test(bundlePath) || /\.xpc$/i.test(bundlePath)) continue;
    seen.add(bundlePath);
    const base = bundlePath.split('/').pop().replace(/\.app$/i, '');
    apps.push({ name: name || base, bundlePath, policy: Number.isFinite(policy) ? policy : 0 });
  }
  return apps;
}

async function runningApps() {
  if (!IS_MAC) return [];
  const w = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', WORKSPACE_SCRIPT], 5000);
  const apps = w.err ? null : parseWorkspaceApps(w.out);
  if (apps) return apps;
  const r = await run('/bin/ps', ['-axo', 'args='], 5000); // fallback
  return r.err ? [] : parseRunningApps(r.out);
}

// Every tab in every window of a browser (same permission as reading the active tab)
const TAB_SCRIPTS = {
  safari: (app) => `const a = Application(${JSON.stringify(app)}); JSON.stringify({ u: a.windows.tabs.url(), t: a.windows.tabs.name() })`,
  chromium: (app) => `const a = Application(${JSON.stringify(app)}); JSON.stringify({ u: a.windows.tabs.url(), t: a.windows.tabs.title() })`,
};
async function allTabs(browser, kind) {
  const r = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', TAB_SCRIPTS[kind](browser)], 6000);
  if (r.err) return null;
  try {
    const { u, t } = JSON.parse(r.out);
    const tabs = [];
    (u || []).forEach((win, wi) => (win || []).forEach((url, ti) => {
      let site = null;
      try { site = new URL(url).hostname.replace(/^www\./, ''); } catch { /* not a web page */ }
      if (site) tabs.push({ browser, site, title: ((t || [])[wi] || [])[ti] || null });
    }));
    return tabs;
  } catch {
    return null;
  }
}

module.exports.parseRunningApps = parseRunningApps;
module.exports.runningApps = runningApps;
module.exports.allTabs = allTabs;

// ---------- strict focus ----------

// Hide every window of a running app (like pressing ⌘H). No permission needed.
async function hideApp(bundlePath) {
  if (!IS_MAC || !bundlePath) return false;
  const script = `ObjC.import("AppKit"); const apps = $.NSWorkspace.sharedWorkspace.runningApplications; let n = 0;
    for (let i = 0; i < apps.count; i++) { const a = apps.objectAtIndex(i); const u = a.bundleURL;
      if (u && u.path.js === ${JSON.stringify(bundlePath)}) { a.hide; n++; } } n`;
  const r = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], 5000);
  return !r.err && Number(r.out) > 0;
}

// Close tabs on distracting sites in one browser and return them, so they can be reopened later.
async function closeTabs(browser, kind, hosts, learning) {
  if (!IS_MAC || !hosts.length) return [];
  const titleOf = kind === 'safari' ? 't.name()' : 't.title()';
  const script = `const a = Application(${JSON.stringify(browser)});
    const hosts = ${JSON.stringify(hosts.map((h) => String(h).toLowerCase()))};
    const learning = ${JSON.stringify((learning || []).map((w) => String(w).toLowerCase()))};
    const hostOf = (u) => { const m = String(u).match(/^https?:\\/\\/([^\\/:?#]+)/i); return m ? m[1].toLowerCase().replace(/^www\\./, '') : ''; };
    const hit = (h) => hosts.some((d) => h === d || h.endsWith('.' + d));
    const out = [];
    a.windows().forEach((w) => {
      const tabs = w.tabs();
      for (let i = tabs.length - 1; i >= 0; i--) {
        const t = tabs[i]; const u = t.url(); const title = String(${titleOf} || '');
        if (hit(hostOf(u)) && !learning.some((k) => title.toLowerCase().includes(k))) { out.push({ url: u, title }); t.close(); }
      }
    });
    JSON.stringify(out)`;
  const r = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], 8000);
  if (r.err) return [];
  try { return JSON.parse(r.out); } catch { return []; }
}

module.exports.hideApp = hideApp;
module.exports.parseWorkspaceApps = parseWorkspaceApps;
module.exports.closeTabs = closeTabs;
