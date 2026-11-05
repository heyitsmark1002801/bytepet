// Neutral platform implementation: every function returns a safe fallback that
// cannot harm the pet. Used on unsupported platforms, and as the base every
// real implementation (mac.js, win.js) can fall back to. No OS calls, no throws.

const os = require('os');

// Count visible items in a folder; null if we can't look. Shared by mac/win.
function countItems(dir) {
  try {
    const fs = require('fs');
    return fs.readdirSync(dir).filter((n) => !n.startsWith('.') && n !== 'Icon\r').length;
  } catch {
    return null;
  }
}

async function frontApp() { return { name: null, bundlePath: null, category: null, self: false }; }
async function runningApps() { return []; }
async function appInfo() { return { category: null, agent: false }; }
async function activeTab() { return null; }
async function allTabs() { return null; }
async function browserTabs() { return []; }
async function frontWindowTitle() { return null; }
async function hideApp() { return false; }
async function closeTabs() { return []; }
async function isRunning() { return false; }
async function battery() { return null; }
async function messCounts() { return []; }
async function pendingUpdates() { return []; } // zero updates: never wrongly sick
async function musicPlaying() { return false; }

// heat takes powerMonitor; load from os either way, never throw
function heat(powerMonitor) {
  let thermal = 'unknown';
  try { if (powerMonitor && powerMonitor.getCurrentThermalState) thermal = powerMonitor.getCurrentThermalState(); } catch { /* not supported */ }
  const load = os.loadavg()[0] / Math.max(1, os.cpus().length);
  return { thermal, load, hot: thermal === 'serious' || thermal === 'critical' || load > 0.9 };
}

// Openers: the platform layer provides the URLs/paths; main.js performs the
// actual shell.open* (Electron) side effect. Neutral returns nothing to open.
function messFolderPath() { return null; }
function updateUrl() { return null; }
const permissionPanes = {};

module.exports = {
  countItems,
  frontApp,
  runningApps,
  appInfo,
  activeTab,
  allTabs,
  browserTabs,
  frontWindowTitle,
  hideApp,
  closeTabs,
  isRunning,
  battery,
  heat,
  messCounts,
  pendingUpdates,
  musicPlaying,
  messFolderPath,
  updateUrl,
  permissionPanes,
};
