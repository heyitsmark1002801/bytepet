// Windows implementation of the platform contract.
//
// Like mac.js, this is the one sanctioned place that shells out to the OS, and
// it never imports Electron (powerMonitor is passed in). Every function fails
// safely to a neutral value and never throws.
//
// Mechanisms:
//   - One persistent hidden PowerShell host for the frequent reads (foreground
//     window, windowed process list, window titles) via a single "snapshot"
//     round trip per tick. Add-Type for the user32 P/Invoke runs once.
//   - Short-lived PowerShell calls for the rare/slow reads off the hot path:
//     Windows Update (startup + hourly), Recycle Bin count (mess cadence),
//     music (GSMTC).

const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const { countItems } = require('./neutral');

const IS_WIN = process.platform === 'win32';
const SENTINEL = '<<<BYTEPET_END>>>';

// ---------- pure parsing functions (exported, tested on any OS) ----------

// Normalise a Windows process name to the friendly names the default
// work/distraction lists use (which are Mac-flavoured). Unknown names pass
// through unchanged; matching in distraction.js is case-insensitive anyway.
const NAME_MAP = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Firefox',
  brave: 'Brave Browser',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
  arc: 'Arc',
  spotify: 'Spotify',
  discord: 'Discord',
  steam: 'Steam',
  code: 'Visual Studio Code',
};
function normalizeName(proc) {
  if (!proc) return null;
  const base = String(proc).replace(/\.exe$/i, '');
  return NAME_MAP[base.toLowerCase()] || base;
}

// Browsers we read window titles from on Windows (by friendly name).
const WIN_BROWSERS = new Set(['Google Chrome', 'Microsoft Edge', 'Firefox', 'Brave Browser', 'Opera', 'Vivaldi', 'Arc']);

// Parse the host's snapshot JSON into { front, apps }. Never throws.
// Raw shape: { front: {pid,title,name,path}|null, apps: [{pid,name,path,title}] }
function parseSnapshot(json) {
  let raw;
  try { raw = typeof json === 'string' ? JSON.parse(json) : json; } catch { return { front: null, apps: [] }; }
  if (!raw || typeof raw !== 'object') return { front: null, apps: [] };
  const front = raw.front && raw.front.name
    ? { name: normalizeName(raw.front.name), path: raw.front.path || null, title: raw.front.title || null }
    : null;
  const appsRaw = Array.isArray(raw.apps) ? raw.apps : [];
  const seen = new Set();
  const apps = [];
  for (const a of appsRaw) {
    if (!a || !a.name) continue;
    const key = a.path || a.name;
    if (seen.has(key)) continue;
    seen.add(key);
    apps.push({ name: normalizeName(a.name), path: a.path || null, title: a.title || null });
  }
  return { front, apps };
}

// Shape a snapshot's front into the contract's frontApp result.
function frontFromSnapshot(snap, execPath) {
  const f = snap && snap.front;
  if (!f) return { name: null, bundlePath: null, category: null, self: false };
  const self = !!f.path && !!execPath && String(execPath).toLowerCase().startsWith(String(f.path).toLowerCase());
  return { name: f.name, bundlePath: f.path, category: null, self };
}

// Shape a snapshot's apps into the contract's runningApps result.
function runningFromSnapshot(snap) {
  return (snap && snap.apps ? snap.apps : []).map((a) => ({ name: a.name, bundlePath: a.path, policy: 0 }));
}

// Windowed browsers' titles → [{ browser, site: null, title }]. site is never
// fabricated: a title that matches no keyword can't cause a false distraction.
function browserTitlesFromSnapshot(snap) {
  const out = [];
  for (const a of (snap && snap.apps ? snap.apps : [])) {
    if (!a.title || !WIN_BROWSERS.has(a.name)) continue;
    out.push({ browser: a.name, site: null, title: a.title });
  }
  return out;
}

// Windows Update titles (one per line, or JSON array) → string[]. Never null.
function parseUpdates(out) {
  if (out == null) return [];
  const s = String(out).trim();
  if (!s) return [];
  // Try JSON array first (we ask PowerShell for ConvertTo-Json).
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    if (typeof j === 'string' && j.trim()) return [j.trim()];
  } catch { /* fall through to line parsing */ }
  return s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

// Recycle Bin item count → number, or null if unreadable.
function parseRecycleCount(out) {
  if (out == null) return null;
  const n = parseInt(String(out).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// GSMTC "is anything playing" → boolean.
function parseMusicPlaying(out) {
  return /\bplaying\b/i.test(String(out || ''));
}

// Pure reply framing: accumulate stdout chunks for a request id; return the JSON
// block once the sentinel line appears, else null (need more). Ignores replies
// whose leading "#<id>" marker doesn't match the pending request id.
function extractReply(buffer, wantId) {
  const marker = `${SENTINEL}#`;
  const idx = buffer.indexOf(marker);
  if (idx === -1) return { done: false, rest: buffer };
  const after = buffer.slice(idx + marker.length);
  const nl = after.indexOf('\n');
  if (nl === -1) return { done: false, rest: buffer }; // id line not fully arrived
  const gotId = after.slice(0, nl).trim();
  const body = buffer.slice(0, idx);
  const rest = after.slice(nl + 1);
  if (String(gotId) !== String(wantId)) {
    // stale reply for an older request: drop it, keep scanning the remainder
    return extractReply(rest, wantId);
  }
  return { done: true, json: body.trim(), rest };
}

// ---------- short-lived PowerShell helper (off the hot path) ----------

function ps(script, timeout = 8000) {
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ err, out: `${stdout || ''}`, errText: `${stderr || ''}` }));
  });
}

// ---------- the persistent host ----------

// PowerShell program fed over stdin once at startup: defines the user32
// P/Invoke and a Snapshot function, then loops reading commands and writing
// "<json><SENTINEL>#<id>\n" replies.
const HOST_PROGRAM = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class BP {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n);
}
"@
function Get-Snapshot {
  $fg = [BP]::GetForegroundWindow(); $fgpid = 0; [void][BP]::GetWindowThreadProcessId($fg, [ref]$fgpid)
  $front = $null
  $fp = Get-Process -Id $fgpid -ErrorAction SilentlyContinue
  if ($fp) { $front = [pscustomobject]@{ pid=$fp.Id; title=$fp.MainWindowTitle; name=$fp.ProcessName; path=$fp.Path } }
  $apps = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
    [pscustomobject]@{ pid=$_.Id; name=$_.ProcessName; path=$_.Path; title=$_.MainWindowTitle }
  }
  [pscustomobject]@{ front=$front; apps=@($apps) } | ConvertTo-Json -Depth 4 -Compress
}
function Minimize-ByMatch($match) {
  $n = 0
  Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.Path -eq $match -or $_.ProcessName -eq $match) } | ForEach-Object {
    if ([BP]::ShowWindowAsync($_.MainWindowHandle, 6)) { $n++ }
  }
  $n
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Split(' ', 2)
  $id = $parts[0]; $cmd = $parts[1]
  $out = ''
  try {
    if ($cmd -like 'snapshot*') { $out = Get-Snapshot }
    elseif ($cmd -like 'min *') { $out = Minimize-ByMatch ($cmd.Substring(4)) }
  } catch { $out = '' }
  [Console]::Out.Write($out)
  [Console]::Out.Write("${SENTINEL}#$id\`n")
  [Console]::Out.Flush()
}
`;

let host = null;        // the spawned process
let hostBuf = '';       // stdout accumulator
let reqId = 0;          // monotonic request id
let pending = null;     // { id, resolve, timer }
let restartAt = 0;      // backoff: don't respawn before this time

function killHost() {
  if (host) { try { host.kill(); } catch { /* already gone */ } }
  host = null;
  hostBuf = '';
  if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(null); }
}

function startHost() {
  if (host || Date.now() < restartAt) return;
  try {
    host = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
      { windowsHide: true });
  } catch { host = null; restartAt = Date.now() + 30000; return; }
  host.stdin.write(`${HOST_PROGRAM}\n`);
  host.stdout.setEncoding('utf8');
  host.stdout.on('data', (chunk) => {
    hostBuf += chunk;
    if (!pending) { hostBuf = ''; return; }
    const r = extractReply(hostBuf, pending.id);
    hostBuf = r.rest != null ? r.rest : hostBuf;
    if (r.done) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(r.json); }
  });
  const down = () => { restartAt = Date.now() + 2000; killHost(); };
  host.on('error', down);
  host.on('exit', down);
  host.stdin.on('error', () => {});
}

// Send one command to the host and await its reply, or null on timeout/death.
function hostCommand(cmd, timeout = 3000) {
  if (!IS_WIN) return Promise.resolve(null);
  startHost();
  if (!host) return Promise.resolve(null);
  if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(null); } // only one in flight
  reqId += 1;
  const id = reqId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending && pending.id === id) { pending = null; restartAt = Date.now() + 2000; killHost(); resolve(null); }
    }, timeout);
    pending = { id, resolve, timer };
    try { host.stdin.write(`${id} ${cmd}\n`); } catch { clearTimeout(timer); pending = null; killHost(); resolve(null); }
  });
}

function stopHost() { restartAt = Infinity; killHost(); }

// ---------- per-tick snapshot cache ----------
// One round trip per tick: frontApp/runningApps/frontWindowTitle/browserTabs all
// read from the same cached snapshot so a check is a single pipe write + read.
let snapCache = { at: 0, data: { front: null, apps: [] } };
async function refreshSnapshot() {
  const json = await hostCommand('snapshot');
  snapCache = { at: Date.now(), data: parseSnapshot(json) };
  return snapCache.data;
}
async function currentSnapshot() {
  // The sampler calls frontApp first each tick; refresh then, reuse within 1s.
  if (Date.now() - snapCache.at < 1000) return snapCache.data;
  return refreshSnapshot();
}

// ---------- contract: frequent reads (over the snapshot) ----------
async function frontApp() {
  try { return frontFromSnapshot(await refreshSnapshot(), process.execPath); }
  catch { return { name: null, bundlePath: null, category: null, self: false }; }
}
async function runningApps() {
  try { return runningFromSnapshot(await currentSnapshot()); } catch { return []; }
}
async function frontWindowTitle() {
  try { const s = await currentSnapshot(); return s.front ? s.front.title : null; } catch { return null; }
}
async function allTabs() { return null; } // no per-tab URLs on Windows
async function browserTabs() {
  try { return browserTitlesFromSnapshot(await currentSnapshot()); } catch { return []; }
}
async function activeTab() { return null; } // window title is used instead
async function appInfo() { return { category: null, agent: false }; } // no LSApplicationCategoryType

// ---------- contract: strict focus ----------
async function hideApp(target) {
  if (!target) return false;
  try { const n = await hostCommand(`min ${target}`); return Number(n) > 0; } catch { return false; }
}
async function closeTabs() { return []; } // Windows: minimise instead (handled in main.js)

async function isRunning(name) {
  if (!name) return false;
  try { return runningFromSnapshot(await currentSnapshot()).some((a) => (a.name || '').toLowerCase() === String(name).toLowerCase()); }
  catch { return false; }
}

// ---------- contract: battery / heat (powerMonitor) ----------
async function battery(powerMonitor) {
  // Electron gives charging state, not a percentage, cross-platform. Treat
  // unavailable as plugged in (a desktop) so the pet is never wrongly tired.
  const onBat = powerMonitor && typeof powerMonitor.onBatteryPower === 'boolean' ? powerMonitor.onBatteryPower : false;
  const pluggedIn = !onBat;
  return { percent: null, pluggedIn, charging: pluggedIn, onBattery: onBat };
}
function heat(powerMonitor) {
  let thermal = 'unknown';
  try { if (powerMonitor && powerMonitor.getCurrentThermalState) thermal = powerMonitor.getCurrentThermalState(); } catch { /* unsupported */ }
  const load = os.loadavg()[0] / Math.max(1, os.cpus().length);
  return { thermal, load, hot: thermal === 'serious' || thermal === 'critical' || load > 0.9 };
}

// ---------- contract: digital mess ----------
async function recycleBinCount() {
  if (!IS_WIN) return null;
  const r = await ps('(New-Object -ComObject Shell.Application).NameSpace(0xA).Items().Count', 6000);
  return r.err ? null : parseRecycleCount(r.out);
}
async function checkMess(limits = {}) {
  const home = os.homedir();
  const piles = [];
  const add = (kind, label, count, limit) => {
    if (count != null && limit > 0 && count > limit) piles.push({ kind, label, count, limit });
  };
  try { add('desktop', 'Desktop', countItems(path.join(home, 'Desktop')), limits.desktop); } catch { /* skip */ }
  try { add('downloads', 'Downloads', countItems(path.join(home, 'Downloads')), limits.downloads); } catch { /* skip */ }
  try { add('trash', 'Recycle Bin', await recycleBinCount(), limits.trash); } catch { /* skip */ }
  // No per-tab count on Windows: omit the tabs pile rather than report a wrong one.
  return piles;
}

// ---------- contract: updates (rare, separate short-lived process) ----------
async function pendingUpdates() {
  // Never null on Windows: any failure means zero, so the pet is never wrongly sick.
  if (!IS_WIN) return { mac: [], brew: [] };
  const script = '$ErrorActionPreference="Stop"; try {'
    + ' $u=(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search("IsInstalled=0 AND IsHidden=0").Updates;'
    + ' @($u | ForEach-Object { $_.Title }) | ConvertTo-Json -Compress } catch { "[]" }';
  const r = await ps(script, 4 * 60000);
  if (r.err) return { mac: [], brew: [] };
  return { mac: parseUpdates(r.out), brew: [] };
}
async function quickUpdateCount() { return null; } // no instant count on Windows; the hourly full check covers it

// ---------- contract: music (GSMTC) ----------
async function musicPlaying() {
  if (!IS_WIN) return false;
  const script = 'try {'
    + ' $m=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime];'
    + ' $mgr=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult();'
    + ' $s=$mgr.GetCurrentSession(); if ($s) { $s.GetPlaybackInfo().PlaybackStatus.ToString() } else { "none" }'
    + ' } catch { "none" }';
  const r = await ps(script, 4000);
  return r.err ? false : parseMusicPlaying(r.out);
}

// ---------- contract: openers (paths/urls; main.js does the opening) ----------
function messFolderPath(kind) {
  const home = os.homedir();
  if (kind === 'desktop') return path.join(home, 'Desktop');
  if (kind === 'downloads') return path.join(home, 'Downloads');
  if (kind === 'trash') return 'shell:RecycleBinFolder';
  return null;
}
function updateUrl() { return 'ms-settings:windowsupdate'; }
const permissionPanes = {}; // Windows needs no permission deep links for these reads

module.exports = {
  // pure parsers (exported for tests)
  normalizeName,
  parseSnapshot,
  frontFromSnapshot,
  runningFromSnapshot,
  browserTitlesFromSnapshot,
  parseUpdates,
  parseRecycleCount,
  parseMusicPlaying,
  extractReply,
  // host lifecycle (for main.js teardown)
  stopHost,
  // contract
  frontApp,
  runningApps,
  frontWindowTitle,
  allTabs,
  browserTabs,
  activeTab,
  appInfo,
  hideApp,
  closeTabs,
  isRunning,
  battery,
  heat,
  checkMess,
  messCounts: checkMess,
  pendingUpdates,
  quickUpdateCount,
  musicPlaying,
  messFolderPath,
  updateUrl,
  permissionPanes,
};
