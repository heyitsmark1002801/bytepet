// macOS implementation of the platform contract.
//
// This is the one sanctioned place (like the old src/system.js) that shells out
// to the OS. It must never import Electron; powerMonitor is passed in as an
// argument where needed. Every function fails safely to a neutral value.
//
// Mac mechanisms used: osascript (JXA/AppleScript), pgrep, ps, pmset,
// softwareupdate, defaults, brew, and Mac filesystem paths.

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
  try { if (powerMonitor && powerMonitor.getCurrentThermalState) thermal = powerMonitor.getCurrentThermalState(); } catch { /* not supported */ }
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

// ---------- frontmost app (moved from main.js) ----------

// App Store category + whether it's an invisible helper (read once per app, then cached).
const appInfoCache = new Map();
async function appInfo(bundlePath) {
  if (!bundlePath) return { category: null, agent: false };
  if (!appInfoCache.has(bundlePath)) {
    const plist = path.join(bundlePath, 'Contents', 'Info');
    const read = async (key) => {
      const r = await run('/usr/bin/defaults', ['read', plist, key], 3000);
      return r.err ? null : r.out.trim();
    };
    const category = await read('LSApplicationCategoryType');
    const ui = await read('LSUIElement');
    const bg = await read('LSBackgroundOnly');
    appInfoCache.set(bundlePath, { category: category || null, agent: ui === '1' || bg === '1' });
  }
  return appInfoCache.get(bundlePath);
}
async function appCategory(bundlePath) { return (await appInfo(bundlePath)).category; }

// Ask macOS (NSWorkspace) which app is in front. No permission needed.
const FRONT_SCRIPT = 'ObjC.import("AppKit"); const a = $.NSWorkspace.sharedWorkspace.frontmostApplication; '
  + 'JSON.stringify({ name: a.localizedName.js, path: a.bundleURL ? a.bundleURL.path.js : null })';
let frontDebug = null;
async function frontApp() {
  if (!IS_MAC) return { name: null, bundlePath: null, category: null, self: false };
  let name = null;
  let bundlePath = null;
  const r = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', FRONT_SCRIPT], 4000);
  if (!r.err) {
    try { const j = JSON.parse(r.out.trim().split('\n')[0]); name = j.name || null; bundlePath = j.path || null; } catch { /* fall back */ }
  }
  if (!name) {
    // fallback: lsappinfo
    const nameR = await run('/bin/sh', ['-c', 'lsappinfo info -only name "$(lsappinfo front)"']);
    name = nameR.err ? null : ((nameR.out.match(/=\s*"([^"]+)"/) || [])[1] || null);
    const pathR = await run('/bin/sh', ['-c', 'lsappinfo info -only bundlepath "$(lsappinfo front)"']);
    bundlePath = pathR.err ? null : ((pathR.out.match(/=\s*"([^"]+)"/) || [])[1] || null);
  }
  frontDebug = { name, bundlePath, via: r.err ? 'lsappinfo' : 'NSWorkspace', error: r.err ? String(r.out).trim().slice(0, 200) : null };
  const category = await appCategory(bundlePath);
  // Is it Bytepet's own window? Then the caller should look past it.
  const self = !!bundlePath && process.execPath.startsWith(bundlePath);
  return { name, bundlePath, category, self };
}
function frontAppDebug() { return frontDebug; }

// ---------- active browser tab (moved from main.js) ----------

const chromium = (n) => `tell application "${n}" to return (URL of active tab of front window) & linefeed & (title of active tab of front window)`;
const safari = (n) => `tell application "${n}" to return (URL of front document) & linefeed & (name of front document)`;
const BROWSERS = {
  Safari: safari('Safari'),
  'Safari Technology Preview': safari('Safari Technology Preview'),
  'Google Chrome': chromium('Google Chrome'),
  'Google Chrome Canary': chromium('Google Chrome Canary'),
  Arc: chromium('Arc'),
  'Brave Browser': chromium('Brave Browser'),
  'Microsoft Edge': chromium('Microsoft Edge'),
  Chromium: chromium('Chromium'),
  Vivaldi: chromium('Vivaldi'),
  Opera: chromium('Opera'),
};
const browserDenied = {};
const browserStatus = {}; // browser -> 'ok' | 'denied' | 'no window'

async function activeTab(appName) {
  const script = BROWSERS[appName];
  if (!script || (browserDenied[appName] || 0) > Date.now()) return null;
  const r = await run('/usr/bin/osascript', ['-e', script], 3000);
  if (r.err) {
    // not allowed (or no window): don't ask again for 10 minutes
    if (/-1743|not authori[sz]ed/i.test(r.out)) {
      browserDenied[appName] = Date.now() + 10 * 60000;
      browserStatus[appName] = 'denied';
    } else browserStatus[appName] = 'no window';
    return null;
  }
  browserStatus[appName] = 'ok';
  const [url, ...rest] = r.out.trim().split('\n');
  let site = null;
  try { site = new URL(url.trim()).hostname.replace(/^www\./, ''); } catch { /* not a web page */ }
  return { site, title: rest.join(' ').trim() || null };
}
// Let the caller clear/inspect the per-browser state (used by the setup "Test" button).
function browserState() { return { browsers: Object.keys(BROWSERS), status: browserStatus, denied: browserDenied }; }
function clearBrowserDenied(appName) { if (appName) browserDenied[appName] = 0; else for (const k of Object.keys(browserDenied)) browserDenied[k] = 0; }

// ---------- music (moved from main.js checkMusic) ----------
async function musicPlaying(apps) {
  if (!IS_MAC) return false;
  for (const name of apps || []) {
    const { err } = await run('/usr/bin/pgrep', ['-x', name]);
    if (err) continue;
    const r = await run('/usr/bin/osascript', ['-e', `tell application "${name}" to player state as string`], 3000);
    if (r.err || r.out.trim() === 'playing') return true;
  }
  return false;
}

// Is a process by exact name running? (used for the "tempted" focus check)
async function isRunning(name) {
  if (!IS_MAC || !name) return false;
  const r = await run('/usr/bin/pgrep', ['-x', name], 2000);
  return !r.err;
}

// ---------- software updates "medicine" (moved from main.js) ----------
async function countMacUpdates() {
  const { err, out } = await run('/usr/sbin/softwareupdate', ['-l'], 5 * 60000);
  if (/No new software available/i.test(out)) return [];
  const items = [...out.matchAll(/^\s*\*\s*(?:Label:\s*)?(.+)$/gm)].map((m) => m[1].trim());
  if (err && !items.length) return null;
  return items;
}
async function countBrewUpdates() {
  const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((p) => fs.existsSync(p));
  if (!brew) return [];
  const { err, out } = await run(brew, ['outdated', '--quiet'], 2 * 60000);
  if (err) return null;
  return out.split('\n').map((s) => s.trim()).filter(Boolean).map((n) => `Homebrew: ${n}`);
}
// Returns { mac, brew } so main.js can keep its exact "could not check" logic (both null).
async function pendingUpdates(settings = {}) {
  if (!IS_MAC) return { mac: [], brew: [] };
  const mac = await countMacUpdates();
  const brew = settings.checkHomebrew ? await countBrewUpdates() : [];
  return { mac, brew };
}
// Instant count macOS itself keeps; null if unreadable.
async function quickUpdateCount() {
  const r = await run('/usr/bin/defaults', ['read', '/Library/Preferences/com.apple.SoftwareUpdate', 'LastRecommendedUpdatesAvailable'], 5000);
  if (r.err) return null;
  const n = parseInt(String(r.out).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// ---------- openers / permission panes (moved from main.js) ----------
const UPDATE_URL = 'x-apple.systempreferences:com.apple.preferences.softwareupdate';
const permissionPanes = {
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  files: 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
  notifications: 'x-apple.systempreferences:com.apple.preference.notifications',
};
// The actual shell.open* side effects stay in main.js (Electron); mac.js just
// provides the URLs/paths so nothing Mac-specific is hardcoded there.
function updateUrl() { return UPDATE_URL; }
function messFolderPath(kind) {
  const home = os.homedir();
  const dirs = { desktop: 'Desktop', downloads: 'Downloads', trash: '.Trash' };
  return dirs[kind] ? path.join(home, dirs[kind]) : null;
}

module.exports = {
  // mess / battery / heat / titles
  checkMess,
  messCounts: checkMess, // contract alias
  battery,
  heat,
  frontWindowTitle,
  countItems,
  // open apps / tabs
  parseRunningApps,
  parseWorkspaceApps,
  runningApps,
  allTabs,
  browserTabs: allTabs, // contract alias
  // frontmost app + app info
  frontApp,
  frontAppDebug,
  appInfo,
  appCategory,
  // active tab + browser state
  activeTab,
  browserState,
  clearBrowserDenied,
  BROWSERS,
  // music + running check
  musicPlaying,
  isRunning,
  // updates
  pendingUpdates,
  quickUpdateCount,
  // strict focus
  hideApp,
  closeTabs,
  // openers / panes (URLs/paths only; Electron does the opening)
  permissionPanes,
  updateUrl,
  messFolderPath,
};
