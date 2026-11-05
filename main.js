// Bytepet — main process.
// Owns the pet's state, the floating window, the task window, the menu-bar icon,
// the local "feed" server for git commits, and all the Mac checks
// (frontmost app, browser site, screen lock, music, updates, calendar, GitHub).

const {
  app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage,
  powerMonitor, dialog, Notification, shell, safeStorage, clipboard, systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execFile } = require('child_process');

const P = require('./src/pet-state');
const T = require('./src/tasks');
const C = require('./src/calendar');
const GH = require('./src/github');
const Sync = require('./src/sync');
const Reminders = require('./src/reminders');
const Todoist = require('./src/todoist');
const System = require('./src/system');
const G = require('./src/progress');
const ACH = require('./src/achievements');
const Postcards = require('./src/postcards');
const Location = require('./src/location');
const Dist = require('./src/distraction');
const Quiet = require('./src/quiet');
const Demo = require('./src/demo-script');
const { say, sayForApp } = require('./src/lines');

// ---------- log file (for bug reports) ----------
const LOG_RING = [];
let logFile = null;
function logLine(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  LOG_RING.push(line);
  if (LOG_RING.length > 300) LOG_RING.shift();
  try {
    if (!logFile) {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      logFile = path.join(dir, 'bytepet.log');
      try { if (fs.statSync(logFile).size > 1024 * 1024) fs.renameSync(logFile, `${logFile}.old`); } catch { /* new log */ }
    }
    fs.appendFileSync(logFile, `${line}\n`);
  } catch { /* can't write logs: keep the ring buffer */ }
}
for (const level of ['error', 'warn']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    logLine(`[${level}] ${args.map((a) => (a && a.stack) || String(a)).join(' ')}`);
  };
}
process.on('uncaughtException', (e) => logLine(`[crash] ${e && e.stack ? e.stack : e}`));
process.on('unhandledRejection', (e) => logLine(`[rejection] ${e && e.stack ? e.stack : e}`));

const FEED_PORT = 47777;
const IS_MAC = process.platform === 'darwin';

// ---------- files ----------
const dataDir = () => app.getPath('userData');
const petFile = () => path.join(dataDir(), 'pet.json');
const tasksFile = () => path.join(dataDir(), 'tasks.json');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const profileFile = () => path.join(dataDir(), 'profile.json');

// Bump to give everyone a clean slate on the next launch (pet, tasks, badges and settings).
const DATA_VERSION = 2;

const DEFAULT_SETTINGS = {
  dataVersion: DATA_VERSION,
  name: 'Byte',
  workApps: [
    'Code', 'Visual Studio Code', 'Kiro', 'Cursor', 'Terminal', 'iTerm2', 'Warp',
    'Xcode', 'PyCharm', 'IntelliJ IDEA', 'Android Studio', 'Unity', 'Blender',
    'Fusion 360', 'Preview', 'Notes', 'Obsidian', 'Notion', 'Microsoft Word', 'Pages',
  ],
  // 'YouTube' also catches YouTube installed as an app from Chrome
  distractionApps: ['Discord', 'Steam', 'TV', 'Netflix', 'Instagram', 'TikTok', 'YouTube'],
  distractionSites: [
    'youtube.com', 'facebook.com', 'instagram.com', 'netflix.com', 'tiktok.com', 'reddit.com',
    'twitter.com', 'x.com', 'twitch.tv', 'primevideo.com', 'disneyplus.com', '9gag.com',
  ],
  distractionAllowanceMinutes: 45, // distraction time per day before it gets sad right away
  distractedAfterMinutes: 5, // minutes in a row on a distraction before it gets sad
  watchIdleMinutes: 120, // watching a video hands-off still counts, up to this long
  countBackground: true, // distracting apps and tabs count even when they're just open in the background
  strictFocus: true, // during focus sessions: hide distracting apps, close (and save) distracting tabs
  quietStart: 23, // no notifications from 11 PM...
  quietEnd: 8, // ...to 8 AM
  maxNotificationsPerDay: 8,
  onboarded: false, // first-run setup finished
  neverDistracting: [], // apps or sites that are never distractions for you (e.g. Discord for your team)
  learningKeywords: ['tutorial', 'lecture', 'course', 'lesson', 'how to', 'explained', 'walkthrough', 'documentation'],
  countCategories: { game: true, entertainment: true, social: true }, // detect apps by Apple's app category
  distractionSchedule: { mode: 'always', days: [1, 2, 3, 4, 5], start: 9, end: 18 }, // or mode 'work'
  // words in a window title that count as a distraction (for Firefox and other browsers
  // we can't read a URL from; needs Accessibility permission)
  distractionKeywords: ['YouTube', 'Instagram', 'Netflix', 'TikTok', 'Reddit', 'Facebook', 'Twitch', 'Disney+', 'Prime Video', 'X / ', '9GAG'],
  titleCheckApps: ['Firefox', 'Firefox Developer Edition', 'Zen', 'Zen Browser', 'Orion', 'LibreWolf', 'Floorp', 'Waterfox', 'DuckDuckGo', 'Tor Browser'],
  checkMess: true, // digital mess → poop
  messLimits: { desktop: 15, downloads: 50, tabs: 40, trash: 100 },
  postcardAfterHours: 24, // vacation length that earns a postcard
  locationLookup: true, // on vacation only: find your city/country from your internet connection
  meetingApps: ['zoom.us', 'Microsoft Teams', 'FaceTime', 'Webex'],
  musicApps: ['Spotify', 'Music'],
  screenLimitMinutes: 120,
  bedtimeHour: 23,
  wakeHour: 7,
  checkUpdates: true,
  checkHomebrew: false,
  notifications: true, // Mac notifications
  toasts: true, // little pop-up cards on screen (badges, streaks…)
  sounds: true, // little retro beeps when your pet needs you
  morningCheckin: true, // each morning, the pet asks for your 3 tasks for today
  calendarIcsUrls: [], // attention: secret iCal links from Google / Outlook / iCloud
  meetingReminderMinutes: 10,
  taskReminderMinutes: 60,
  uncommittedAlertHours: 2,
  githubTokenEnc: '', // encrypted with the macOS keychain
  remindersEnabled: false, // import from Apple Reminders
  remindersLists: [], // which lists (empty = all)
  todoistTokenEnc: '', // encrypted with the macOS keychain
  completeInSource: true, // finishing a task here also ticks it off in Reminders / Todoist
  weather: { enabled: true, latitude: 49.28, longitude: -123.12 },
  quiet: false,
  hidden: false,
  repos: [],
};

// One-time clean slate: data saved by an older version is cleared, so the first-time setup runs again.
function freshStartIfNeeded() {
  const raw = readJson(settingsFile(), null);
  if (!raw || raw.dataVersion === DATA_VERSION) return;
  for (const f of [petFile(), tasksFile(), profileFile(), settingsFile()]) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }
  logLine(`fresh start: cleared data from an older version (${raw.dataVersion || 1} → ${DATA_VERSION})`);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

let settings = { ...DEFAULT_SETTINGS };
function loadSettings() {
  const saved = readJson(settingsFile(), null);
  settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  if (saved && saved.postcardAfterHours === 2) settings.postcardAfterHours = 24; // v5 default was 2 hours
  writeJson(settingsFile(), settings);
}
function saveSettings() { writeJson(settingsFile(), settings); }

let pet;
function loadPet() {
  const saved = readJson(petFile(), null);
  if (saved && typeof saved.hunger === 'number') {
    const fresh = P.createPet(settings.name);
    pet = { ...fresh, ...saved, stats: { ...fresh.stats, ...(saved.stats || {}) }, calls: saved.calls || {} };
    delete pet.tantrum; // renamed in v3
    if (pet.form === 'star') pet.form = 'zen'; // forms renamed in v7
    P.catchUp(pet);
  } else {
    pet = P.createPet(settings.name);
  }
}
function savePet() { try { writeJson(petFile(), pet); } catch (e) { console.error('save failed', e); } }

let tasks = [];
function loadTasks() { tasks = readJson(tasksFile(), []); }
function saveTasks() { try { writeJson(tasksFile(), tasks); } catch (e) { console.error('task save failed', e); } }

// ---------- player profile: achievements, streaks, postcards, graveyard ----------
let profile = G.emptyProfile();
function loadProfile() {
  const saved = readJson(profileFile(), null);
  profile = { ...G.emptyProfile(), ...(saved || {}) };
  profile.totals = profile.totals || {};
  profile.highScores = profile.highScores || {};
}
function saveProfile() { try { writeJson(profileFile(), profile); } catch (e) { console.error('profile save failed', e); } }
function bump(key, n = 1) { profile.totals[key] = (profile.totals[key] || 0) + n; }

function toast(t) { if (settings.toasts !== false) send('toast', t); }

function checkAchievements() {
  const fresh = ACH.evaluate(profile, { pet, day: G.today(profile), open: T.openTasks(tasks).length });
  fresh.forEach((a, i) => setTimeout(() => toast({
    kind: 'achievement', emoji: a.emoji, title: 'Achievement unlocked!', text: a.name, sub: a.desc,
  }), i * 2200));
  if (fresh.length) {
    notify(fresh.length === 1 ? `${fresh[0].emoji} Badge unlocked: ${fresh[0].name}` : `🏆 ${fresh.length} badges unlocked!`,
      fresh.length === 1 ? fresh[0].desc : fresh.map((a) => a.name).join(', '), () => openTasksWindow('achievements'));
  }
  if (fresh.length) { saveProfile(); sendTasksWindow(); }
}

// Something counted toward today (good days → age + streak + unlocks)
function recordDay(kind) {
  for (const e of G.record(profile, kind)) {
    if (e === 'good-day') handleEvents(P.ageUp(pet));
    if (e === 'streak') {
      toast({ kind: 'streak', emoji: '🔥', title: `${profile.streak}-day streak!`, text: `Good day! ${pet.name} is now ${pet.age} year${pet.age === 1 ? '' : 's'} old.` });
    }
    if (e.startsWith('unlock:')) {
      const u = G.UNLOCKS.find((x) => x.id === e.slice(7));
      if (u) toast({ kind: 'unlock', emoji: '🎁', title: 'New item unlocked!', text: u.name, sub: 'Put it on in the Pet tab.' });
    }
  }
  profile.totals.bestRun3 = Math.max(profile.totals.bestRun3 || 0, G.runOfDays(profile, 3));
  saveProfile();
}

// Lifetime counters behind the achievements
function trackEvent(e) {
  if (e === 'evolved') {
    if (pet.stage === 'baby') bump('hatches');
    if (pet.stage === 'child') bump('childReached');
    if (pet.stage === 'adult') {
      bump('adultReached');
      if (pet.form === 'grumpy' || pet.form === 'gamer') bump('grumpyAdults');
      if (pet.careMistakes === 0) bump('perfectAdults');
      profile.petdex = profile.petdex || {};
      if (!profile.petdex[pet.form]) profile.petdex[pet.form] = Date.now();
    }
  } else if (e === 'revived') bump('revivals');
  else if (e === 'cured') bump('cures');
  else if (e === 'refocused') bump('refocused');
  else if (e === 'lights-off') bump('lightsOff');
  else if (e === 'petted') bump('pats');
}

function trackTask(size, due) {
  bump('tasks');
  bump(`tasks${size}`);
  const h = new Date().getHours();
  if (h < 4) bump('nightTasks');
  else if (h < 7) bump('earlyTasks');
  if (due && due > Date.now() && due - Date.now() <= 15 * 60000) bump('justInTime');
  recordDay(size === 'L' ? 'large' : 'task');
}

// ---------- tokens (stored encrypted with the macOS keychain) ----------
function getSecret(field) {
  if (!settings[field]) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(settings[field], 'base64'));
  } catch { /* fall through */ }
  return '';
}
function setSecret(field, value) {
  if (!value) { settings[field] = ''; saveSettings(); return true; }
  if (!safeStorage.isEncryptionAvailable()) return false;
  settings[field] = safeStorage.encryptString(value).toString('base64');
  saveSettings();
  return true;
}
const getGithubToken = () => getSecret('githubTokenEnc');
const setGithubToken = (t) => setSecret('githubTokenEnc', t);

// ---------- runtime state ----------
let win = null;
let tasksWin = null;
let tray = null;
let currentApp = null;
let currentSite = null;
let inMeeting = false;
let locked = false;
let music = false;
let weather = null;
let focus = null; // { endsAt, total, taskId, samples, onTask }
// ---------- demo mode (throwaway pet for presentations; never persisted) ----------
let demoMode = false;
let demoPet = null;
let demoTimer = null;
let demoStepIndex = 0;
let lastAppComment = null;
let lastNeedComment = 0;
const lastNotified = {};
const updates = { count: 0, items: [], checking: false, lastChecked: null, error: null };
let alerts = []; // attention: things that need action
const notifiedAlerts = new Set();
let calendarEvents = [];
let calendarStatus = '';
let githubStatus = '';
let githubUser = '';
let githubReviews = [];
const dirtySince = {}; // repo -> time we first saw uncommitted changes
const syncStatus = { reminders: '', todoist: '', calendar: '' };
const syncing = {};
const SOURCE_LABEL = { reminders: 'Reminders', todoist: 'Todoist', calendar: 'your calendar', github: 'GitHub' };

const isNight = () => {
  const h = new Date().getHours();
  const { bedtimeHour: bed, wakeHour: wake } = settings;
  return bed > wake ? h >= bed || h < wake : h >= bed && h < wake;
};
// The next time the clock reaches the wake-up hour
function nextWakeAt(now = new Date()) {
  const d = new Date(now);
  d.setHours(settings.wakeHour ?? 7, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function turnLightsOff() {
  if (!pet.sleepy || pet.asleep) return;
  const night = isNight();
  handleEvents(P.lightsOff(pet, night ? { night: true, wakeAt: nextWakeAt() } : { napMinutes: 20 }));
  savePet();
  pushState();
}

// ---------- pet window ----------
function createWindow() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    acceptFirstMouse: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (settings.hidden) win.hide();

  const fit = () => {
    if (!win || win.isDestroyed()) return;
    win.setBounds(screen.getPrimaryDisplay().workArea);
  };
  screen.on('display-metrics-changed', fit);
  screen.on('display-added', fit);
  screen.on('display-removed', fit);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function snapshot(p = pet) {
  return {
    pet: p,
    mood: P.mood(p),
    needs: P.needs(p),
    foodUnits: P.foodUnits(p),
    alerts: alerts.slice(0, 3).map((a) => ({ kind: a.kind, text: a.text })),
    weather,
    music,
    updates: { count: updates.count, checking: updates.checking },
    quiet: settings.quiet || inMeeting,
    sounds: settings.sounds !== false,
    focus: focus ? { remainingMs: Math.max(0, focus.endsAt - Date.now()), total: focus.total } : null,
    app: currentApp,
    system: systemView(),
    playing,
    equipped: profile.equipped,
    streak: G.currentStreak(profile),
    onBreak: onBreak(),
    noticing: !!(lastSample && lastSample.distracting) && !onBreak(),
    wakeHour: settings.wakeHour ?? 7,
    graves: (profile.desktopGraves || []).map((g) => ({ id: String(g.died), name: g.name })),
    ghostDaysLeft: p.ghost && p.ghostSince ? Math.max(0, Math.ceil((p.ghostSince + 3 * 24 * 3600e3 - Date.now()) / (24 * 3600e3))) : null,
  };
}

function pushState({ menu = true } = {}) {
  if (demoMode) return;
  send('state', snapshot());
  if (menu) updateTray();
  sendTasksWindow();
}

// Push the demo pet's state on the same 'state' channel, overriding the
// real-world-derived fields so the renderer draws a clean demo stage.
function pushDemoState() {
  const s = snapshot(demoPet);
  send('state', {
    ...s,
    alerts: [],
    weather: null,
    updates: { count: 0, checking: false },
    equipped: {},
    graves: [],
  });
}

// Start the scripted demo on a throwaway pet. No-op if a demo is already playing
// so we never stack two step loops on top of each other.
function startDemo() {
  if (demoMode) return;
  demoMode = true;
  demoPet = Demo.createDemoPet(P);
  demoStepIndex = 0;
  updateTray(); // flip the tray entry to the stop label
  runDemoStep();
}

// Advance the demo one step: apply the mutation, show its caption, redraw the
// demo pet, then re-arm a single timer for the next step. Ends naturally once
// the last step has played.
function runDemoStep() {
  if (demoStepIndex >= Demo.DEMO_STEPS.length) {
    stopDemo();
    return;
  }
  const step = Demo.DEMO_STEPS[demoStepIndex];
  Demo.applyStep(demoPet, step, P);
  send('demo-caption', step.caption);
  pushDemoState();
  // The die step drops the gravestone in the renderer the same way handleEvents
  // would, but without firing any notification.
  if (step.id === 'die') send('event', { type: 'died' });
  demoStepIndex += 1;
  demoTimer = setTimeout(runDemoStep, step.holdMs);
}

// End the demo and restore the real pet's display. Idempotent and also the
// natural-end path. demoMode is cleared before pushState()/updateTray() so the
// real pet redraws and the tray entry flips back to the play label.
function stopDemo() {
  if (demoTimer) {
    clearTimeout(demoTimer);
    demoTimer = null;
  }
  demoMode = false;
  demoPet = null;
  demoStepIndex = 0;
  send('demo-caption', ''); // hide the caption strip
  pushState(); // redraw the real pet unchanged
  updateTray();
}

// ---------- notifications ----------
const CALL_TEXT = {
  hungry: ['is hungry 🍙', 'Finish a task to feed it: small = 1 food, medium = 2, large = 3.'],
  sleepy: ['wants the lights off 💡', 'Too much screen time. Lock your screen or step away for 5 minutes.'],
  sick: ['caught a bug 🦠', 'Your Mac has updates waiting. Install them to give it medicine.'],
  distracted: ['is sad 😢', 'Too much time on distracting apps or sites. Get back to work to cheer it up.'],
  dirty: ['made a mess 💩', 'Your Desktop, Downloads, Trash or browser tabs are cluttered. Clean up to flush it away.'],
  flies: ['is attracting flies 🪰', 'The mess has been there a while. Clean up soon or your pet will get sick.'],
};

let notifyDay = '';
let notifyCount = 0;
const inQuietHours = (d = new Date()) => Quiet.inQuietHours(d.getHours(), settings.quietStart ?? 23, settings.quietEnd ?? 8);
function notify(title, body, onClick, { force = false } = {}) {
  if (demoMode) return;
  try {
    if (!settings.notifications || !Notification.isSupported()) return;
    const today = new Date().toDateString();
    if (today !== notifyDay) { notifyDay = today; notifyCount = 0; }
    if (!force) {
      const gate = Quiet.allowNotification({
        hour: new Date().getHours(), sentToday: notifyCount,
        start: settings.quietStart ?? 23, end: settings.quietEnd ?? 8, max: settings.maxNotificationsPerDay ?? 8,
      });
      if (!gate.ok) { logLine(`notification held (${gate.reason}): ${title}`); return; }
    }
    notifyCount += 1;
    const n = new Notification({ title, body, silent: false });
    if (onClick) n.on('click', onClick);
    n.show();
  } catch { /* notifications unavailable */ }
}

function callForAttention(need) {
  if (settings.quiet || inMeeting || !CALL_TEXT[need]) return;
  const now = Date.now();
  if (now - (lastNotified[need] || 0) < 30 * 60000) return;
  lastNotified[need] = now;
  let [what, how] = CALL_TEXT[need];
  if (need === 'distracted' && pet.distractionSource) {
    const bg = lastSample && !lastSample.frontDistracting && lastSample.distracting;
    how = bg
      ? `${friendly(pet.distractionSource)} has been open for ${pet.distractedMinutes} minutes. Close it to cheer your pet up, or take a proper break.`
      : `${pet.distractedMinutes} minutes of ${friendly(pet.distractionSource)}. Go back to work to cheer it up, or take a proper break.`;
  }
  notify(`${pet.name} ${what}`, how, need === 'sick' ? openSoftwareUpdate : need === 'hungry' ? openTasksWindow : undefined);
}

function handleEvents(events, source) {
  for (const e of events) {
    let line = null;
    trackEvent(e);
    if (['distraction-notice', 'distraction-warning', 'distracted', 'distraction-reminder', 'binge', 'refocused'].includes(e)) {
      line = say(e, { source: friendly(pet.distractionSource || (lastSample && lastSample.source)), minutes: pet.distractedMinutes });
      send('event', { type: e, line });
      continue;
    }
    if (e === 'pooped') {
      const p = pet.poop[pet.poop.length - 1];
      line = p ? `Eww! ${p.label}: ${p.count} (limit ${p.limit}). Clean up?` : say('pooped');
      send('event', { type: e, line });
      continue;
    }
    if (e.startsWith('call-')) {
      const need = e.slice(5);
      callForAttention(need);
      if (need === 'hungry') line = say('hungry');
      send('event', { type: e, line });
      continue;
    }
    if (e === 'evolved') {
      if (pet.stage === 'baby') line = say('hatched', { name: pet.name });
      else if (pet.stage === 'adult') line = say(`evolved-${pet.form}`) || say('evolved');
      else line = say('evolved');
      const formName = pet.stage === 'adult' && P.FORMS[pet.form] ? P.FORMS[pet.form].name : pet.stage;
      notify(`${pet.name} evolved!`, `${pet.name} grew into a ${formName}!`);
      if (pet.stage === 'adult') toast({ kind: 'achievement', emoji: '📖', title: 'New Petdex entry!', text: formName, sub: P.FORMS[pet.form] ? P.FORMS[pet.form].desc : '' });
    } else if ((e === 'ate' || e === 'ate-starving') && source && source.startsWith('task-')) {
      line = say(`task-done-${source.slice(5)}`);
    } else if (e === 'died') {
      line = say('died');
      notify(`${pet.name} became a ghost 👻`, 'Finish tasks or a focus session within 3 days to bring it back to life.', () => openTasksWindow('tasks'));
    } else if (e === 'flies') {
      line = say('flies');
      callForAttention('flies');
    } else if (e === 'good-morning') {
      line = say('good-morning');
      setTimeout(maybeAskCheckin, 5000);
    } else if (e === 'revived') {
      pet.fadeWarned = false;
      line = say('revived');
      notify(`${pet.name} is ALIVE again!`, 'Your work resurrected your pet.');
    } else {
      line = say(e, { name: pet.name });
    }
    send('event', { type: e, line, source });
  }
  if (events.length) checkAchievements();
}

// Small talk. A sleeping pet only mumbles "zzz" instead of chatting.
function speak(line) {
  if (!line) return;
  if (pet.asleep) return;
  send('event', { type: 'say', line });
}

// ---------- actions ----------
function doFeed(type) {
  if (type === 'commit') bump('commits');
  if (type === 'focus-session') { bump('focusSessions'); recordDay('focus'); }
  if (type.startsWith('task-')) trackTask(type.slice(5));
  const events = P.feed(pet, type);
  if (pet.ghost && events.length === 0 && type !== 'focus') speak(`Revive: ${Math.round(pet.revive)}%`);
  handleEvents(events, type);
  savePet();
  pushState();
  if (type === 'commit') setTimeout(checkRepos, 4000);
}

function resetPet() {
  pet = P.createPet(settings.name);
  savePet();
  speak('...');
  pushState();
}

// ---------- tasks ----------
function onTasksChanged() {
  saveTasks();
  refreshAlerts();
  pushState();
}

function addTask(fields) {
  const t = T.createTask(fields);
  if (fields.apiUrl) t.apiUrl = fields.apiUrl;
  tasks.push(t);
  onTasksChanged();
  return t;
}

function completeTask(id, via) {
  const t = T.complete(tasks, id);
  if (!t) return null;
  if (via && via === t.source) speak(`Done in ${SOURCE_LABEL[via] || via}: "${t.title.slice(0, 40)}"!`);
  // finished here → tick it off in the app it came from too
  if (!via && settings.completeInSource && (t.source === 'reminders' || t.source === 'todoist')) {
    const done = t.source === 'reminders'
      ? Reminders.complete(t.externalId)
      : Todoist.complete(getSecret('todoistTokenEnc'), t.externalId);
    done.catch(() => speak(`I couldn't tick that off in ${SOURCE_LABEL[t.source]}.`));
  }
  if (focus && focus.taskId === id) focus.taskTitle = `${t.title} ✓`;
  trackTask(t.size, t.due);
  const events = P.feed(pet, `task-${t.size}`);
  handleEvents(events, `task-${t.size}`);
  checkPlanDone();
  savePet();
  onTasksChanged();
  return t;
}

function deleteTask(id) {
  const plan = checkinToday();
  if (plan && plan.ids) plan.ids = plan.ids.filter((x) => x !== id); // deleted ≠ done
  const t = tasks.find((x) => x.id === id);
  if (t && t.externalId) t.dismissed = true; // still in the other app: just hide it here
  else tasks = tasks.filter((x) => x.id !== id);
  onTasksChanged();
}

// ---------- syncing with other to-do apps ----------
const SOURCES = {
  reminders: {
    enabled: () => IS_MAC && settings.remindersEnabled,
    open: () => Reminders.openItems(settings.remindersLists || []),
    statuses: (ids) => Reminders.statuses(ids),
  },
  todoist: {
    enabled: () => !!settings.todoistTokenEnc,
    open: () => Todoist.openItems(getSecret('todoistTokenEnc')),
    statuses: (ids) => Todoist.statuses(getSecret('todoistTokenEnc'), ids),
  },
};

// Apply one source's open items to our list. `statusFn(ids)` answers for items that vanished.
async function applyRemote(source, remote, statusFn) {
  const { added, updated, missing } = Sync.reconcile(tasks, source, remote);
  tasks.push(...added);
  let finished = 0;
  if (missing.length) {
    let st = {};
    try { st = await statusFn(missing.map((t) => t.externalId)); } catch { /* try again next time */ }
    for (const t of missing) {
      const s = st[t.externalId];
      if (s === 'done') { completeTask(t.id, source); finished += 1; } else if (s === 'gone') t.dismissed = true;
    }
  }
  if (added.length) speak(`${added.length} new task${added.length > 1 ? 's' : ''} from ${SOURCE_LABEL[source]}!`);
  if (added.length || updated.length || missing.length) onTasksChanged();
  return { added: added.length, finished, open: remote.length };
}

async function syncSource(source) {
  if (demoMode) return;
  const src = SOURCES[source];
  if (!src || !src.enabled() || syncing[source]) return null;
  syncing[source] = true;
  try {
    const remote = await src.open();
    const r = await applyRemote(source, remote, src.statuses);
    syncStatus[source] = `Synced ${r.open} open task${r.open === 1 ? '' : 's'} · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    return r;
  } catch (e) {
    syncStatus[source] = e.message;
    return null;
  } finally {
    syncing[source] = false;
    sendTasksWindow();
  }
}

function syncAll() {
  syncSource('reminders');
  syncSource('todoist');
  refreshCalendar();
}

function dropOpenTasksFrom(source) {
  tasks = tasks.filter((t) => t.source !== source || t.done);
  onTasksChanged();
}

// ---------- what's on screen right now (no permissions for apps; browsers ask once) ----------
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000, ...opts }, (err, stdout, stderr) => resolve({ err, out: `${stdout || ''}\n${stderr || ''}` }));
  });
}

async function getFrontApp() {
  return (await getFrontAppInfo()).name;
}

// Name, bundle path and Apple category of the app in front (no permissions needed).
// Uses the same simple lsappinfo calls that worked in earlier versions.
// App Store category + whether it's an invisible helper (read once per app, then cached)
const appInfoCache = new Map();
let frontDebug = null;
async function appInfo(bundlePath) {
  if (!bundlePath) return { category: null, agent: false };
  if (!appInfoCache.has(bundlePath)) {
    const plist = path.join(bundlePath, 'Contents', 'Info');
    const read = async (key) => {
      const r = await run('/usr/bin/defaults', ['read', plist, key], { timeout: 3000 });
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
async function getFrontAppInfo() {
  if (!IS_MAC) return { name: null };
  let name = null;
  let bundlePath = null;
  const r = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', FRONT_SCRIPT], { timeout: 4000 });
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
  // Is it Bytepet's own window (the Bytepet window, a game)? Then look past it.
  const self = !!bundlePath && process.execPath.startsWith(bundlePath);
  return { name, bundlePath, category, self };
}

const matches = (name, list) => !!name && (list || []).some((w) => name.toLowerCase() === String(w).toLowerCase());

// Active tab's address and title (the title lets tutorials count as learning)
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

async function getBrowserTab(appName) {
  const script = BROWSERS[appName];
  if (!script || (browserDenied[appName] || 0) > Date.now()) return null;
  const r = await run('/usr/bin/osascript', ['-e', script], { timeout: 3000 });
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
async function getBrowserSite(appName) {
  const t = await getBrowserTab(appName);
  return t && t.site;
}
const siteMatches = (host, list) => !!host && (list || []).some((d) => host === d || host.endsWith(`.${d}`));

let accessibilityOk = null;
async function classify() {
  const idle = powerMonitor.getSystemIdleTime();
  const front = await getFrontAppInfo();
  if (front.self) return { self: true, idle, at: Date.now() };
  const appName = front.name;
  const tab = BROWSERS[appName] ? await getBrowserTab(appName) : null;
  const site = tab && tab.site;
  let title = tab && tab.title;
  // Browsers we can't read a URL from (Firefox…), or ones that said no: look at the window title
  if (!title && (matches(appName, settings.titleCheckApps) || (BROWSERS[appName] && !site))) {
    title = await System.frontWindowTitle();
    accessibilityOk = title != null;
  }
  const cfg = distractionCfg();
  const verdict = Dist.decide({ app: appName, bundlePath: front.bundlePath, category: front.category, site, title }, cfg);
  const background = await scanBackground(cfg, { app: appName, site });
  const frontDistracting = verdict.distracting;
  const distracting = frontDistracting || background.length > 0;
  const working = (matches(appName, settings.workApps) || !!verdict.learning) && !distracting;
  return {
    idle, appName, site, title, at: Date.now(), working, bundlePath: front.bundlePath,
    distracting, frontDistracting, background,
    source: frontDistracting ? verdict.source : background.length ? background[0].source : verdict.source,
    reason: frontDistracting ? verdict.reason : background.length ? background[0].reason : verdict.reason,
    kind: verdict.kind, learning: !!verdict.learning,
    onTask: idle < 90 && !locked && !distracting,
  };
}
function distractionCfg() {
  return {
    distractionApps: settings.distractionApps,
    distractionSites: settings.distractionSites,
    distractionKeywords: settings.distractionKeywords,
    neverDistracting: settings.neverDistracting,
    learningKeywords: settings.learningKeywords,
    countCategories: { ...DEFAULT_SETTINGS.countCategories, ...(settings.countCategories || {}) },
  };
}

// Distractions open in the background: running apps and tabs in every browser window.
// Checked on every look (every 15 s, every 5 s while the Bytepet window is open), so closing
// Steam or a YouTube tab shows up right away. Tabs are checked less often on battery.
async function scanBackground(cfg, skip) {
  if (settings.countBackground === false) return [];
  const now = Date.now();
  bgCache.apps = await System.runningApps();
  bgCache.appsAt = now;
  const apps = bgCache.apps.map((a) => ({ ...a }));
  const selfPath = (apps.find((a) => process.execPath.startsWith(a.bundlePath)) || {}).bundlePath;
  for (const a of apps) {
    if (/^\/System\//.test(a.bundlePath)) continue;
    const info = await appInfo(a.bundlePath);
    a.category = info.category;
    a.agent = a.policy != null ? a.policy !== 0 || info.agent : info.agent;
  }
  const tabsTtl = focus ? 0 : onBatteryNow() ? 30000 : 4000;
  if (now - bgCache.tabsAt > tabsTtl || !bgCache.tabs) {
    const tabs = [];
    for (const a of apps) {
      const kind = BROWSER_KIND[a.name];
      if (!kind || (browserDenied[a.name] || 0) > Date.now()) continue;
      const list = await System.allTabs(a.name, kind);
      if (list) { tabs.push(...list); browserStatus[a.name] = 'ok'; }
    }
    bgCache.tabs = tabs;
    bgCache.tabsAt = now;
  }
  // a browser that was closed has no tabs any more
  const running = new Set(apps.map((a) => a.name));
  const tabs = bgCache.tabs.filter((t) => running.has(t.browser));
  return Dist.decideBackground(apps, tabs, cfg, { ...skip, selfPath });
}

const BROWSER_KIND = {
  Safari: 'safari', 'Safari Technology Preview': 'safari',
  'Google Chrome': 'chromium', 'Google Chrome Canary': 'chromium', Arc: 'chromium', 'Brave Browser': 'chromium',
  'Microsoft Edge': 'chromium', Chromium: 'chromium', Vivaldi: 'chromium', Opera: 'chromium',
};

// What kind of work is this app? (shapes which adult form your pet becomes)
const WORK_KINDS = {
  code: ['code', 'visual studio code', 'kiro', 'cursor', 'terminal', 'iterm', 'warp', 'xcode', 'pycharm', 'intellij', 'android studio', 'webstorm', 'sublime', 'nova', 'zed', 'github desktop', 'docker'],
  write: ['word', 'pages', 'notes', 'obsidian', 'notion', 'bear', 'ulysses', 'scrivener', 'craft', 'google docs', 'overleaf'],
  art: ['blender', 'figma', 'fusion 360', 'photoshop', 'illustrator', 'procreate', 'affinity', 'krita', 'aseprite', 'unity', 'final cut', 'logic pro', 'garageband', 'premiere', 'after effects', 'sketch', 'solidworks'],
};
function workKindOf(appName, site) {
  const n = String(appName || '').toLowerCase();
  if (site && /docs\.google\.com|overleaf\.com/.test(site)) return 'write';
  if (site && /figma\.com|canva\.com/.test(site)) return 'art';
  if (site && /github\.com|gitlab\.com|stackoverflow\.com/.test(site)) return 'code';
  for (const [kind, names] of Object.entries(WORK_KINDS)) if (names.some((x) => n === x || n.includes(x))) return kind;
  return 'other';
}

// ---------- the distraction sampler: every 15 seconds ----------
let samples = []; // this minute's samples
let lastSample = null;
let selfInFront = false;
let sampling15 = false;
let breakUntil = null;
let breakTimer = null;
let lastTemptCheck = 0;
const bgCache = { apps: null, appsAt: 0, tabs: null, tabsAt: 0 };
const onBatteryNow = () => !!(system.battery && system.battery.onBattery);
// speed check: how long each look around takes, and how much CPU Bytepet uses
const perf = { samples: 0, totalMs: 0, maxMs: 0, lastMs: 0, cpu: 0, skipped: 0 };
let sampleTurn = 0;
const onBreak = () => !!breakUntil && Date.now() < breakUntil;
const friendly = (src) => String(src || 'that').replace(/\.(com|tv|net|org)$/, '');

async function sample() {
  if (demoMode) return;
  if (sampling15 || !IS_MAC) return;
  sampleTurn += 1;
  // on battery (or if checks are slow), look every 10 s instead of every 5 s — except during focus
  const slow = onBatteryNow() || perf.lastMs > 3000 || perf.cpu > 15;
  if (!focus && slow && sampleTurn % 2 === 0) { perf.skipped += 1; return; }
  sampling15 = true;
  const t0 = Date.now();
  try {
    const c = await classify();
    // just left System Settings (where updates are installed)? check the medicine right away
    const inSettings = /^System (Settings|Preferences)$/.test(c.appName || '');
    if (lastFrontWasSettings && !inSettings && !c.self) updatesMaybeInstalled();
    if (!c.self) lastFrontWasSettings = inSettings;
    // just tidied up in Finder? flush the poop right away
    if (lastFrontWasFinder && c.appName !== 'Finder' && !c.self) setTimeout(checkMessNow, 1000);
    if (!c.self) lastFrontWasFinder = c.appName === 'Finder';
    if (c.self) {
      // looking at Bytepet itself: keep the last app in front, but refresh what's open in the background
      selfInFront = true;
      if (lastSample && !lastSample.self) {
        const background = await scanBackground(distractionCfg(), { app: lastSample.appName, site: lastSample.site });
        const distracting = !!lastSample.frontDistracting || background.length > 0;
        Object.assign(lastSample, {
          background, distracting,
          source: lastSample.frontDistracting ? lastSample.source : background.length ? background[0].source : lastSample.source,
          reason: lastSample.frontDistracting ? lastSample.reason : background.length ? background[0].reason : lastSample.reason,
          at: Date.now(),
          onTask: !distracting,
        });
        sendTasksWindow();
      }
      return;
    }
    selfInFront = false;
    const before = lastSample;
    lastSample = c;
    samples.push(c);
    if (samples.length > 12) samples.shift();
    reactToChange(before, c);
    if (focus && settings.strictFocus !== false && c.distracting) await enforceStrict(c);
    if (focus) {
      focus.samples += 1;
      if (c.onTask) focus.onTask += 1;
      if (c.distracting && Date.now() - lastFocusNag > 2 * 60000) {
        lastFocusNag = Date.now();
        speak(`Hey! ${friendly(c.source)} during a focus session?`);
      }
      // a distracting app sitting open in the background is a temptation
      if (settings.countBackground === false && Date.now() - lastTemptCheck > 3 * 60000) {
        lastTemptCheck = Date.now();
        for (const name of settings.distractionApps || []) {
          if (name === c.appName) continue;
          const r = await run('/usr/bin/pgrep', ['-x', name], { timeout: 2000 });
          if (!r.err) { speak(say('tempted', { source: name })); break; }
        }
      }
    }
  } catch (e) {
    logLine(`sample failed: ${e && e.stack ? e.stack : e}`);
  } finally {
    sampling15 = false;
    const ms = Date.now() - t0;
    perf.samples += 1;
    perf.totalMs += ms;
    perf.lastMs = ms;
    perf.maxMs = Math.max(perf.maxMs, ms);
  }
}

// React within seconds when you open or close a distraction (the minute tick does the scoring)
let lastReactKey = '';
let lastReactLine = 0;
let cleanSince = 0;
function reactToChange(before, c) {
  const names = (x) => (x ? [x.frontDistracting ? x.source : null, ...(x.background || []).map((b) => b.source)].filter(Boolean) : []);
  const key = `${c.distracting}|${names(c).sort().join(',')}`;
  const counting = Dist.counts(settings.distractionSchedule) && !onBreak() && !pet.vacation && !pet.asleep && !pet.ghost && pet.stage !== 'egg';
  if (!c.distracting) cleanSince = cleanSince || Date.now(); else cleanSince = 0;
  // sad from a distraction, and it's been gone for 30 s: cheer up now instead of waiting
  if (pet.distracted && cleanSince && Date.now() - cleanSince >= 30000) {
    handleEvents(P.refocus(pet));
    savePet();
  }
  if (key === lastReactKey) return;
  const wasNames = names(before);
  const nowNames = names(c);
  lastReactKey = key;
  pushState({ menu: false }); // the pet glances over (or relaxes) right away; the Focus tab updates too
  if (!counting || Date.now() - lastReactLine < 20000) return;
  const opened = nowNames.find((n) => !wasNames.includes(n));
  const closed = wasNames.find((n) => !nowNames.includes(n));
  if (opened && !pet.distracted) { lastReactLine = Date.now(); speak(say('distraction-notice', { source: friendly(opened) })); }
  else if (closed && !c.distracting && before && before.distracting) { lastReactLine = Date.now(); speak(say('closed-distraction', { source: friendly(closed) })); }
}

function measureCpu() {
  try {
    const total = app.getAppMetrics().reduce((s, m) => s + ((m.cpu && m.cpu.percentCPUUsage) || 0), 0);
    perf.cpu = Math.round(total * 10) / 10;
  } catch { /* metrics unavailable */ }
}

// ---------- bug reports ----------
function debugInfo() {
  const safe = { ...settings };
  for (const k of Object.keys(safe)) if (/token|Enc$|secret|password/i.test(k)) safe[k] = safe[k] ? '(set)' : '';
  safe.calendarIcsUrls = (settings.calendarIcsUrls || []).map(() => '(url hidden)');
  const info = {
    bytepet: app.getVersion(), electron: process.versions.electron, node: process.versions.node,
    os: `${process.platform} ${require('os').release()}`, arch: process.arch, packaged: app.isPackaged,
    time: new Date().toString(),
    pet: { name: pet.name, stage: pet.stage, form: pet.form, ghost: pet.ghost, sick: pet.sick, discipline: pet.discipline },
    lastSample: lastSample && { ...lastSample, title: lastSample.title ? '(hidden)' : '' },
    frontDebug, browserStatus, accessibilityOk,
    perf: { ...perf, avgMs: perf.samples ? Math.round(perf.totalMs / perf.samples) : 0, onBattery: onBatteryNow() },
    notifications: { today: notifyCount, quiet: inQuietHours() },
    settings: safe,
  };
  return `Bytepet debug info\n${JSON.stringify(info, null, 2)}\n\nRecent log:\n${LOG_RING.slice(-80).join('\n')}`;
}
function copyDebugInfo() {
  clipboard.writeText(debugInfo());
  speak('Copied debug info! Paste it in your bug report 🐞');
}
function openLogFile() {
  logLine('opened log file');
  if (logFile) shell.openPath(logFile);
}

// ---------- first-run setup: permission checks ----------
async function permissionChecks() {
  const out = [];
  const running = (bgCache.apps || await System.runningApps().catch(() => [])).map((a) => a.name);
  for (const b of Object.keys(BROWSER_KIND)) {
    if (!running.includes(b)) continue;
    const tab = await getBrowserTab(b).catch(() => null);
    const ok = browserStatus[b] === 'ok' || !!(tab && tab.url);
    out.push({ id: `browser:${b}`, label: `See tabs in ${b}`, ok, why: 'So distracting sites count, and strict focus can close them.', fix: 'automation' });
  }
  if (!out.length) out.push({ id: 'browser', label: 'See browser tabs', ok: null, why: 'Open Chrome, Safari, Arc or Brave and press Test — macOS will ask once.', fix: 'automation' });
  let ax = null;
  try { ax = IS_MAC ? systemPreferences.isTrustedAccessibilityClient(false) : null; } catch { ax = null; }
  out.push({ id: 'accessibility', label: 'Read window titles (optional)', ok: ax, why: 'Catches YouTube or Netflix inside apps that aren\'t browsers.', fix: 'accessibility' });
  for (const [id, dir] of [['desktop', 'Desktop'], ['downloads', 'Downloads']]) {
    let ok = true;
    try { fs.readdirSync(path.join(require('os').homedir(), dir)); } catch { ok = false; }
    out.push({ id, label: `Count files on your ${dir}`, ok, why: 'A messy folder makes your pet poop.', fix: 'files' });
  }
  out.push({ id: 'notifications', label: 'Notifications', ok: Notification.isSupported() ? null : false, why: 'Press Test — you should see a hello from your pet.', fix: 'notifications' });
  return out;
}
const PANES = {
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  files: 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
  notifications: 'x-apple.systempreferences:com.apple.preference.notifications',
};
async function testPermission(id) {
  if (id.startsWith('browser')) {
    const name = id.split(':')[1];
    const list = name ? [name] : Object.keys(BROWSER_KIND);
    for (const b of list) { browserDenied[b] = 0; await getBrowserTab(b).catch(() => null); }
    bgCache.tabsAt = 0;
  } else if (id === 'accessibility') {
    try { systemPreferences.isTrustedAccessibilityClient(true); } catch { /* not a Mac */ }
  } else if (id === 'notifications') {
    notify(`${pet.name} says hi! 👋`, 'Notifications work. You can set quiet hours in Settings.', null, { force: true });
  }
  return permissionChecks();
}

// ---------- strict focus: hide distracting apps, close (and save) distracting tabs ----------
let lastStrictLine = 0;
async function enforceStrict(c) {
  const hosts = (settings.distractionSites || []).filter((d) => !(settings.neverDistracting || []).includes(d));
  const acted = [];
  const browsers = new Set();
  if (c.frontDistracting) {
    if (BROWSER_KIND[c.appName]) browsers.add(c.appName);
    else if (await System.hideApp(c.bundlePath)) acted.push(c.appName);
  }
  for (const hit of c.background || []) {
    if (hit.browser) browsers.add(hit.browser);
    else if (hit.bundlePath && await System.hideApp(hit.bundlePath)) acted.push(hit.source);
  }
  for (const b of browsers) {
    const closed = await System.closeTabs(b, BROWSER_KIND[b], hosts, settings.learningKeywords);
    if (closed.length) {
      profile.savedTabs = profile.savedTabs || [];
      for (const t of closed) {
        if (!profile.savedTabs.some((x) => x.url === t.url)) profile.savedTabs.push({ ...t, at: Date.now() });
      }
      profile.savedTabs = profile.savedTabs.slice(-60);
      if (focus) focus.closedTabs = (focus.closedTabs || 0) + closed.length;
      acted.push(`${closed.length} tab${closed.length === 1 ? '' : 's'}`);
      saveProfile();
    }
  }
  if (acted.length) {
    bump('strictSaves');
    if (Date.now() - lastStrictLine > 20000) {
      lastStrictLine = Date.now();
      speak(say('strict', { what: acted.join(' + ') }));
    }
    logLine(`strict focus: ${acted.join(', ')}`);
    pushState();
  }
}

function reopenSavedTabs() {
  const tabs = profile.savedTabs || [];
  for (const t of tabs) if (/^https?:\/\//i.test(t.url)) shell.openExternal(t.url);
  profile.savedTabs = [];
  saveProfile();
  pushState();
  return tabs.length;
}

// Daily log of minutes per distraction source, and minutes of work
function logMinute(kind, source) {
  const key = G.dayKey();
  profile.focusLog = profile.focusLog || {};
  const day = profile.focusLog[key] || (profile.focusLog[key] = { work: 0, distracted: 0, sources: {} });
  if (kind === 'work') day.work += 1;
  if (kind === 'distracted') {
    day.distracted += 1;
    day.sources[source || 'Unknown'] = (day.sources[source || 'Unknown'] || 0) + 1;
  }
  // keep 60 days
  const keys = Object.keys(profile.focusLog).sort();
  while (keys.length > 60) delete profile.focusLog[keys.shift()];
}

function startBreak(minutes) {
  breakUntil = Date.now() + minutes * 60000;
  if (breakTimer) clearTimeout(breakTimer);
  breakTimer = setTimeout(endBreak, minutes * 60000);
  handleEvents(P.startBreak(pet));
  bump('breaksTaken');
  savePet();
  pushState();
}
function endBreak(early = false) {
  if (!breakUntil) return;
  breakUntil = null;
  if (breakTimer) clearTimeout(breakTimer);
  breakTimer = null;
  handleEvents([early ? 'break-early' : 'break-end']);
  if (!early) notify(`${pet.name}: break's over!`, 'Back to it? Distractions count again now.');
  pushState();
}

// ---------- music: dance when Spotify / Music is playing ----------
async function checkMusic() {
  if (demoMode) return;
  if (!IS_MAC) return;
  let playing = false;
  for (const name of settings.musicApps || []) {
    const { err } = await run('/usr/bin/pgrep', ['-x', name]);
    if (err) continue;
    const r = await run('/usr/bin/osascript', ['-e', `tell application "${name}" to player state as string`], { timeout: 3000 });
    if (r.err || r.out.trim() === 'playing') { playing = true; break; }
  }
  if (playing !== music) {
    music = playing;
    if (music && !pet.asleep && !pet.sleepy && !pet.ghost) speak(say('dance'));
    pushState({ menu: false });
  }
}

// ---------- medicine: software updates ----------
async function countMacUpdates() {
  const { err, out } = await run('/usr/sbin/softwareupdate', ['-l'], { timeout: 5 * 60000 });
  if (/No new software available/i.test(out)) return [];
  const items = [...out.matchAll(/^\s*\*\s*(?:Label:\s*)?(.+)$/gm)].map((m) => m[1].trim());
  if (err && !items.length) return null;
  return items;
}

async function countBrewUpdates() {
  const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((p) => fs.existsSync(p));
  if (!brew) return [];
  const { err, out } = await run(brew, ['outdated', '--quiet'], { timeout: 2 * 60000 });
  if (err) return null;
  return out.split('\n').map((s) => s.trim()).filter(Boolean).map((n) => `Homebrew: ${n}`);
}

async function checkUpdates(manual = false) {
  if (demoMode) return;
  if (!IS_MAC || updates.checking) return;
  if (!settings.checkUpdates && !manual) return;
  updates.checking = true;
  updateTray();
  if (manual) speak('Checking for updates...');
  const mac = await countMacUpdates();
  const brew = settings.checkHomebrew ? await countBrewUpdates() : [];
  updates.checking = false;
  if (mac === null && brew === null) {
    updates.error = 'Could not check for updates';
    if (manual) speak('I couldn\'t check updates. Are you online?');
    updateTray();
    return;
  }
  updates.items = [...(mac || []), ...(brew || [])];
  updates.count = updates.items.length;
  updates.lastChecked = Date.now();
  updates.error = null;
  const events = P.setUpdates(pet, updates.count);
  handleEvents(events);
  if (manual && !events.length) speak(updates.count ? `Still ${updates.count} update(s) waiting...` : 'All up to date!');
  savePet();
  pushState();
}

function openSoftwareUpdate() {
  shell.openExternal('x-apple.systempreferences:com.apple.preferences.softwareupdate');
  medicineWatchUntil = Date.now() + 45 * 60000; // look often while you're installing
}

// ---------- medicine: notice installed updates quickly ----------
// The full check (softwareupdate -l) is slow, so while the pet is sick we also peek at the
// number macOS itself keeps ("updates available") — instant — and run a full check as soon
// as it looks like you've installed them: when it drops to 0, when you leave Software Update,
// and after a restart or unlock.
let medicineWatchUntil = 0;
let lastFrontWasSettings = false;
let lastFrontWasFinder = false;
let lastQuickCheck = 0;
let lastFullSickCheck = 0;
async function quickUpdateCount() {
  const r = await run('/usr/bin/defaults', ['read', '/Library/Preferences/com.apple.SoftwareUpdate', 'LastRecommendedUpdatesAvailable'], { timeout: 5000 });
  if (r.err) return null;
  const n = parseInt(String(r.out).trim(), 10);
  return Number.isFinite(n) ? n : null;
}
async function medicineTick() {
  if (demoMode) return;
  if (!IS_MAC || !pet.needsMedicine || updates.checking) return;
  const now = Date.now();
  const watching = now < medicineWatchUntil;
  if (now - lastQuickCheck < (watching ? 20000 : 60000)) return;
  lastQuickCheck = now;
  const n = await quickUpdateCount();
  if (n === 0 || now - lastFullSickCheck > (watching ? 5 : 15) * 60000) {
    lastFullSickCheck = now;
    await checkUpdates();
  }
}
function updatesMaybeInstalled() {
  if (!pet.needsMedicine) return;
  lastQuickCheck = 0;
  lastFullSickCheck = 0;
  medicineWatchUntil = Date.now() + 10 * 60000;
  setTimeout(medicineTick, 3000);
}

// ---------- attention: calendar, deadlines, reviews, uncommitted work ----------
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.max(1, Math.ceil(m))} min`);

function refreshAlerts() {
  const now = Date.now();
  const list = [];

  for (const ev of calendarEvents) {
    if (ev.allDay) continue;
    const mins = (ev.start - now) / 60000;
    if (mins > 0 && mins <= settings.meetingReminderMinutes) {
      list.push({ id: `cal:${ev.uid}:${ev.start}`, kind: 'event', text: `${ev.summary} in ${fmtMins(mins)}` });
    }
  }

  const { soon, newlyMissed } = T.checkDeadlines(tasks, now, settings.taskReminderMinutes * 60000);
  for (const t of soon) list.push({ id: `due:${t.id}`, kind: 'due', text: `"${t.title}" due in ${fmtMins((t.due - now) / 60000)}` });
  for (const t of newlyMissed) {
    handleEvents(P.missedDeadline(pet));
    notify('Missed a deadline 😢', `"${t.title}" is overdue. ${pet.name} is sad.`, openTasksWindow);
  }
  if (newlyMissed.length) { saveTasks(); savePet(); }
  // overdue tasks: one line, not one per task
  const overdue = tasks.filter((t) => !t.done && !t.dismissed && t.missed);
  if (overdue.length === 1) list.push({ id: `late:${overdue[0].id}`, kind: 'overdue', text: `"${overdue[0].title}" is overdue` });
  else if (overdue.length > 1) list.push({ id: `late:${overdue.length}`, kind: 'overdue', text: `${overdue.length} tasks are overdue` });

  for (const r of githubReviews) list.push({ id: `gh:${r.id}`, kind: 'review', text: `Review requested: ${r.title}`, url: r.url });

  for (const [repo, since] of Object.entries(dirtySince)) {
    if (now - since >= settings.uncommittedAlertHours * 3600e3) {
      list.push({ id: `git:${repo}:${since}`, kind: 'commit', text: `Uncommitted changes in ${path.basename(repo)}` });
    }
  }

  alerts = list;
  P.setAlerts(pet, list.length);
  for (const a of list) {
    if (notifiedAlerts.has(a.id)) continue;
    notifiedAlerts.add(a.id);
    announceAlert(a);
  }
}

const ALERT_TITLES = {
  event: '📅 Coming up', due: '⏰ Deadline soon', overdue: '⚠️ Overdue', review: '👀 Needs your review', commit: '💾 Commit your work',
};

function announceAlert(a) {
  if (a.kind === 'overdue') return; // the missed-deadline notification already covered it
  if (!settings.quiet) speak(`${a.kind === 'event' ? '📅' : a.kind === 'due' ? '⏰' : '!'} ${a.text}`);
  if (settings.quiet || inMeeting) return;
  const onClick = a.url ? () => openSafeUrl(a.url) : (a.kind === 'due' ? openTasksWindow : undefined);
  notify(`${pet.name}: ${ALERT_TITLES[a.kind] || 'Heads up'}`, a.text, onClick);
}

function openSafeUrl(url) {
  if (/^https:\/\//i.test(url)) shell.openExternal(url);
}

async function refreshCalendar() {
  if (demoMode) return;
  const urls = (settings.calendarIcsUrls || []).map((u) => String(u).trim()).filter(Boolean);
  if (!urls.length) { calendarEvents = []; calendarStatus = ''; return; }
  const now = Date.now();
  const all = [];
  const todos = [];
  let ok = 0;
  for (const raw of urls) {
    const url = raw.replace(/^webcal:\/\//i, 'https://');
    if (!/^https:\/\//i.test(url)) continue;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      all.push(...C.occurrences(C.parseIcs(text), now - 3600e3, now + 36 * 3600e3));
      todos.push(...C.parseTodos(text));
      ok += 1;
    } catch { /* bad link or offline */ }
  }
  calendarEvents = all;
  const upcoming = all.filter((e) => e.start > now && !e.allDay);
  if (ok) {
    // tasks inside the calendar link (only some calendar apps include them)
    const open = todos.filter((t) => !t.done).map((t) => {
      const { title, size } = Sync.pickSize({ title: t.summary, priority: t.priority, source: 'calendar' });
      return { externalId: t.uid, title, size, due: t.due || null };
    });
    const doneIds = new Set(todos.filter((t) => t.done).map((t) => t.uid));
    await applyRemote('calendar', open, async (ids) => Object.fromEntries(ids.map((id) => [id, doneIds.has(id) ? 'done' : 'gone'])));
  }
  calendarStatus = ok
    ? `${ok} of ${urls.length} calendar(s) connected · ${upcoming.length} event(s) in the next 36h${todos.length ? ` · ${todos.filter((t) => !t.done).length} task(s)` : ''}`
    : 'Could not read the calendar link. Check that it is the secret iCal address.';
  refreshAlerts();
  pushState();
}

async function refreshGithub() {
  if (demoMode) return;
  const token = getGithubToken();
  if (!token) { githubReviews = []; githubStatus = ''; return; }
  try {
    githubReviews = await GH.reviewRequests(token);
    // finished on GitHub = finished here
    const open = tasks.filter((t) => !t.done && t.source === 'github' && t.apiUrl).slice(0, 20);
    for (const t of open) {
      const state = await GH.issueState(token, t.apiUrl);
      if (state === 'closed') completeTask(t.id, 'github');
    }
    githubStatus = `Connected${githubUser ? ` as ${githubUser}` : ''} · ${githubReviews.length} review request(s)`;
  } catch (e) {
    githubStatus = e.message;
  }
  refreshAlerts();
  pushState();
}

async function importGithubIssues() {
  const token = getGithubToken();
  if (!token) return { ok: false, error: 'Connect GitHub first' };
  try {
    const issues = await GH.assignedIssues(token);
    let added = 0;
    for (const i of issues) {
      if (tasks.some((t) => t.externalId === i.id)) continue;
      addTask({
        title: i.repo ? `${i.repo.split('/')[1]}: ${i.title}` : i.title,
        size: T.sizeFromLabels(i.labels),
        source: 'github',
        externalId: i.id,
        url: i.url,
        apiUrl: i.apiUrl,
      });
      added += 1;
    }
    return { ok: true, added, total: issues.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkRepos() {
  if (demoMode) return;
  for (const repo of settings.repos || []) {
    const { err, out } = await run('git', ['-C', repo, 'status', '--porcelain'], { timeout: 10000 });
    if (err) continue;
    if (out.trim()) dirtySince[repo] = dirtySince[repo] || Date.now();
    else delete dirtySince[repo];
  }
  refreshAlerts();
}

// ---------- the main clock: once a minute ----------
async function minuteTick() {
  if (demoMode) return;
  // The last minute of 15-second samples decides (a quick peek at YouTube is fine)
  if (!samples.length || !IS_MAC) await sample();
  const minute = samples.length ? samples.slice() : [lastSample].filter(Boolean);
  samples = [];
  const c = lastSample || { idle: powerMonitor.getSystemIdleTime() };
  const vote = Dist.combine(minute);
  const workVote = minute.filter((x) => x.working).length >= minute.length / 2;
  currentApp = c.appName;
  currentSite = c.site;
  // Watching a video or playing a game doesn't always move the mouse, so a distraction in
  // front counts as "using the computer" even when idle (up to 2 hours by default).
  const idle = powerMonitor.getSystemIdleTime();
  const frontVote = Dist.combine(minute.map((x) => ({ distracting: !!x.frontDistracting, source: x.source })));
  const watching = frontVote.distracting && !locked && idle < (settings.watchIdleMinutes || 120) * 60;
  const awake = (idle < 120 && !locked) || watching;
  const counting = Dist.counts(settings.distractionSchedule) && !onBreak() && !pet.vacation;
  if (awake && vote.distracting) logMinute('distracted', vote.source);
  else if (awake && workVote) logMinute('work');
  if (breakUntil && !onBreak()) endBreak();
  const wasMeeting = inMeeting;
  inMeeting = matches(currentApp, settings.meetingApps);

  refreshAlerts();
  const hourNow = new Date().getHours();
  const events = P.tickMinute(pet, {
    workKind: workKindOf(c.appName, c.site),
    late: hourNow >= 22 || hourNow < 4,
    idleSeconds: watching ? 0 : idle,
    locked,
    working: awake && workVote,
    distracting: awake && vote.distracting && counting,
    distractionSource: vote.source,
    music,
    night: isNight(),
    wakeAt: nextWakeAt(),
    charging: !demoSystem.low && (!system.battery || system.battery.percent == null || !!system.battery.pluggedIn), // desktops count as plugged in
    screenLimit: settings.screenLimitMinutes,
    distractionAllowance: settings.distractionAllowanceMinutes,
    distractedAfter: settings.distractedAfterMinutes,
  });
  if (awake && workVote && !pet.vacation) events.push(...P.feed(pet, 'focus'));
  pet.lastTick = Date.now();
  if (pet.vacation) recordDay('vacation');
  if (music && !pet.vacation && !pet.ghost && !pet.asleep && !pet.sleepy && pet.stage !== 'egg') bump('danceMinutes');
  handleEvents(events, 'focus');
  if (awake) maybeAskCheckin();
  if (P.ghostFaded(pet)) buryPet('faded');
  else if (pet.ghost && pet.ghostSince && !pet.fadeWarned && Date.now() - pet.ghostSince > 2 * 24 * 3600e3) {
    pet.fadeWarned = true;
    notify(`${pet.name} is fading 👻`, `One day left! Finish tasks or focus to revive ${pet.name} (${Math.round(pet.revive)}% so far).`, () => openTasksWindow('tasks'));
  }
  checkAchievements();

  if (inMeeting && !wasMeeting) speak(say('meeting'));
  if (awake && workVote && currentApp !== lastAppComment && Math.random() < 0.3) speak(sayForApp(currentApp));
  if (currentApp) lastAppComment = currentApp;

  const now = Date.now();
  const m = P.mood(pet);
  if (['hungry', 'sad', 'ghost'].includes(m) && now - lastNeedComment > 20 * 60000) {
    lastNeedComment = now;
    speak(say(m));
  }

  savePet();
  pushState();
}

function fastTick() {
  if (demoMode) return;
  wakeIfBack();
  if (pet.stage === 'egg' && !pet.ghost && Date.now() - pet.born > 20000) {
    pet.xp = Math.max(pet.xp, P.STAGES[1].minXp);
    handleEvents(P.addXp(pet, 0), 'hatch');
    savePet();
    pushState();
  }
}

// ---------- lights: lock screen / sleep ----------
function onAway() {
  if (demoMode) return;
  locked = true;
  handleEvents(P.lightsOff(pet, { night: isNight(), wakeAt: nextWakeAt() }));
  savePet();
  pushState();
}
function onBack() {
  if (demoMode) return;
  locked = false;
  wakeIfBack();
  pushState();
}
// Wake up right away when you come back (not at the next minute tick)
function wakeIfBack() {
  if (demoMode) return;
  if (!pet.asleep) return;
  const back = !locked && powerMonitor.getSystemIdleTime() < 10;
  const kind = P.shouldWake(pet, back);
  if (kind) {
    handleEvents(P.wakeUp(pet, kind));
    savePet();
    pushState();
  }
}

// ---------- digital mess → poop ----------
async function checkMessNow() {
  if (demoMode) return;
  if (!IS_MAC || !settings.checkMess) { if ((pet.poop || []).length) applyMess([]); return; }
  applyMess(await System.checkMess({ ...DEFAULT_SETTINGS.messLimits, ...(settings.messLimits || {}) }));
}
function applyMess(piles) {
  const before = (pet.poop || []).map((p) => p.kind);
  const events = P.setMess(pet, piles);
  const cleaned = before.filter((k) => !piles.some((p) => p.kind === k)).length;
  if (cleaned) bump('cleanups', cleaned);
  handleEvents(events);
  savePet();
  saveProfile();
  pushState();
}
function openMess(kind) {
  const home = require('os').homedir();
  const dirs = { desktop: 'Desktop', downloads: 'Downloads', trash: '.Trash' };
  if (dirs[kind]) shell.openPath(path.join(home, dirs[kind]));
  else if (kind === 'tabs') speak('Close some browser tabs to clean this one up!');
}

// ---------- battery & heat ----------
let system = { battery: null, heat: null };
const demoSystem = { low: false, hot: false };
let lastSystemKey = '';
function systemView() {
  const b = system.battery;
  const low = demoSystem.low || !!(b && b.onBattery && b.percent <= 20);
  return {
    percent: b ? b.percent : null,
    pluggedIn: !demoSystem.low && !!(b && b.pluggedIn),
    charging: !demoSystem.low && !!(b && b.charging),
    low,
    hot: demoSystem.hot || !!(system.heat && system.heat.hot),
  };
}
async function checkSystem() {
  if (demoMode) return;
  system = { battery: await System.battery(), heat: System.heat(powerMonitor) };
  const v = systemView();
  const key = `${v.low}|${v.pluggedIn}|${v.hot}`;
  if (lastSystemKey && key !== lastSystemKey && !pet.vacation && pet.stage !== 'egg' && !pet.ghost) {
    const [wasLow, wasPlugged, wasHot] = lastSystemKey.split('|').map((x) => x === 'true');
    if (v.low && !wasLow) speak(say('battery-low'));
    else if (v.pluggedIn && !wasPlugged) speak(say('plugged-in'));
    if (v.hot && !wasHot) speak(say('hot'));
  }
  lastSystemKey = key;
  pushState({ menu: false });
}

// ---------- vacation ----------
// Where you are, while on vacation (internet location, or the Mac's time zone)
async function locate() {
  return Location.whereAmI({ internet: settings.locationLookup !== false });
}

// Check where the laptop is and remember new places (hourly, and when you open the lid)
let sampling = false;
async function sampleTrip() {
  if (!pet.vacation || sampling) return;
  sampling = true;
  try {
    const loc = await locate();
    const v = pet.vacation;
    if (!v || !loc) return;
    if (!v.home) { v.home = loc; savePet(); return; }
    v.places = v.places || [];
    if (Location.isAway(v.home, loc) && !v.places.some((p) => Location.placeKey(p) === Location.placeKey(loc))) {
      v.places.push({ ...loc, at: Date.now() });
      savePet();
    }
  } finally {
    sampling = false;
  }
}

// One postcard per country you visited (up to 3); a staycation card if you never left
function postcardsFor(trip, hours) {
  const byCountry = new Map();
  for (const p of trip.places || []) {
    const key = p.countryCode || p.timezone || p.city;
    if (!byCountry.has(key)) byCountry.set(key, p);
  }
  const places = [...byCountry.values()].slice(0, 3);
  if (!places.length) return [Postcards.makePostcard(trip.home, { hours, staycation: true })];
  return places.map((p, i) => Postcards.makePostcard(p, { hours, now: Date.now() + i }));
}

async function setVacation(on, fakeHours = 0, fakePlaces = null) {
  if (on && !pet.vacation) {
    stopFocus(false);
    handleEvents(P.startVacation(pet, Date.now() - fakeHours * 3600e3));
    pet.vacation.home = profile.home || null;
    pet.vacation.places = [];
    bump('vacations');
    recordDay('vacation');
    toast({ kind: 'vacation', emoji: '🧳', title: `${pet.name} went on vacation!`, text: 'Everything is paused until you come back.' });
    savePet();
    pushState();
    if (!fakePlaces) {
      // remember home first, so we can tell when you've gone somewhere else
      const here = await locate();
      if (pet.vacation && here) { pet.vacation.home = here; profile.home = here; saveProfile(); savePet(); }
    }
  } else if (!on && pet.vacation) {
    if (fakePlaces) pet.vacation.places = fakePlaces;
    else await sampleTrip(); // still abroad when you turn it off? that counts too
    const trip = pet.vacation;
    const { events, hours } = P.endVacation(pet);
    handleEvents(events);
    if (hours >= (settings.postcardAfterHours ?? 24) && trip) {
      const cards = postcardsFor(trip, hours);
      profile.postcards.push(...cards);
      cards.forEach((card, i) => setTimeout(() => toast({
        kind: 'postcard', emoji: card.flag,
        title: card.staycation ? 'A staycation postcard!' : `Postcard from ${card.place}!`,
        text: card.note, sub: 'See it in the Memories tab.',
      }), 1500 + i * 2500));
    }
  }
  savePet();
  saveProfile();
  checkAchievements();
  pushState();
}

// ---------- graveyard ----------
function buryPet(cause) {
  const old = pet.name;
  const stone = P.gravestone(pet, cause);
  profile.graveyard.push(stone);
  // the gravestone stays on the desktop until you move it to the cemetery
  if (cause !== 'retired') {
    profile.desktopGraves = (profile.desktopGraves || []).concat(stone).slice(-3);
  }
  if (cause === 'retired') bump('retirements');
  pet = P.nextGeneration(pet, settings.name);
  toast({
    kind: 'memorial', emoji: '🪦',
    title: cause === 'retired' ? `${old} retired 🌅` : `Rest well, ${old}`,
    text: cause === 'retired' ? 'A new egg appeared! Their stone is in the cemetery.' : 'A new egg appeared! Click the gravestone to move it to the cemetery.',
  });
  notify(cause === 'retired' ? `${old} retired 🌅` : `Rest well, ${old} 🪦`, 'A new egg appeared on your desktop.');
  savePet();
  saveProfile();
  checkAchievements();
  pushState();
}

// ---------- morning check-in: pick 3 tasks for today ----------
const todayKey = () => G.dayKey();
function checkinToday() { return (profile.checkins || {})[todayKey()] || null; }
function checkinPending() {
  return settings.morningCheckin !== false && !checkinToday() && !isNight()
    && new Date().getHours() >= (settings.wakeHour ?? 7)
    && !pet.ghost && pet.stage !== 'egg' && !pet.vacation;
}
let checkinAsked = '';
let checkinOpened = '';
function maybeAskCheckin() {
  if (!checkinPending() || checkinAsked === todayKey() || pet.asleep) return;
  checkinAsked = todayKey();
  speak(say('plan-ask'));
  notify(`☀️ Good morning from ${pet.name}!`, 'What are your 3 tasks for today? Click to plan your day.', () => openTasksWindow('tasks'));
  sendTasksWindow();
}
function submitCheckin(items = []) {
  const ids = [];
  for (const it of items.slice(0, 3)) {
    if (it.id && tasks.some((t) => t.id === it.id && !t.done)) { ids.push(it.id); continue; }
    const title = String(it.title || '').trim();
    if (!title) continue;
    const t = addTask({ title: title.slice(0, 140), size: ['S', 'M', 'L'].includes(it.size) ? it.size : 'M' });
    ids.push(t.id);
  }
  if (!ids.length) return;
  profile.checkins = profile.checkins || {};
  profile.checkins[todayKey()] = { ids, at: Date.now(), bonus: false };
  const keys = Object.keys(profile.checkins).sort();
  while (keys.length > 60) delete profile.checkins[keys.shift()];
  bump('checkins');
  handleEvents(P.planDay(pet));
  saveProfile();
  savePet();
  pushState();
}
function skipCheckin() {
  profile.checkins = profile.checkins || {};
  profile.checkins[todayKey()] = { ids: [], skipped: true, at: Date.now() };
  saveProfile();
  pushState();
}
// after finishing a task: were those all of today's 3?
function checkPlanDone() {
  const c = checkinToday();
  if (!c || c.bonus || !c.ids.length) return;
  const planned = c.ids.map((id) => tasks.find((x) => x.id === id)).filter((t) => t && !t.dismissed);
  if (!planned.length || !planned.every((t) => t.done)) return;
  c.bonus = true;
  bump('plansDone');
  handleEvents(P.planDone(pet));
  toast({ kind: 'streak', emoji: '🍰', title: 'Day plan complete!', text: `All ${c.ids.length} of today's tasks done. Bonus treat for ${pet.name}!` });
  saveProfile();
  savePet();
}
function checkinView() {
  const c = checkinToday();
  return {
    pending: checkinPending(),
    enabled: settings.morningCheckin !== false,
    skipped: !!(c && c.skipped),
    bonus: !!(c && c.bonus),
    today: c && !c.skipped ? c.ids.map((id) => tasks.find((x) => x.id === id)).filter((t) => t && !t.dismissed)
      .map((t) => ({ id: t.id, title: t.title, size: t.size, done: !!t.done })) : [],
  };
}

// Click a gravestone on the desktop
function graveMenu(id) {
  const items = [];
  if (id === 'ghost') {
    if (!pet.ghost) return;
    items.push(
      { label: `👻 Here lies ${pet.name}… but not for long?`, enabled: false },
      { label: `Revive ${bar(pet.revive)} ${Math.round(pet.revive)}%`, enabled: false },
      { label: 'Finish tasks (S 20% · M 35% · L 60%) or a focus session (20%)', enabled: false },
      { type: 'separator' },
      { label: 'Open my tasks', click: () => openTasksWindow('tasks') },
      { label: 'Start a 25-min focus session', click: () => startFocus(25) },
      { type: 'separator' },
      { label: `Let ${pet.name} rest (new egg)…`, click: letGhostRest },
    );
  } else {
    const g = (profile.desktopGraves || []).find((x) => String(x.died) === id);
    if (!g) return;
    items.push(
      { label: `🪦 ${g.name} — ${g.age} yrs · ${g.stats.tasks} tasks · ${g.stats.focusSessions} focus sessions`, enabled: false },
      { type: 'separator' },
      { label: 'Move to the cemetery', click: () => moveGrave(id) },
      { label: 'Visit the cemetery', click: () => openTasksWindow('memories') },
    );
  }
  Menu.buildFromTemplate(items).popup({ window: win });
}

function moveGrave(id) {
  const g = (profile.desktopGraves || []).find((x) => String(x.died) === id);
  profile.desktopGraves = (profile.desktopGraves || []).filter((x) => String(x.died) !== id);
  saveProfile();
  if (g) toast({ kind: 'memorial', emoji: '🪦', title: `${g.name} moved to the cemetery`, text: 'Visit any time in the 🪦 tab.' });
  pushState();
}

async function letGhostRest() {
  if (!pet.ghost) return;
  const r = await dialog.showMessageBox({
    type: 'question', buttons: ['Let them rest', 'Keep trying'], defaultId: 1, cancelId: 1,
    message: `Let ${pet.name} rest?`,
    detail: 'Their gravestone stays on your desktop and a new egg hatches. Your badges and streak carry over.',
  });
  if (r.response === 0) buryPet('rested');
}

// Start over: 'progress' keeps tasks, settings and connections; 'everything' is a fresh install
async function resetAll(mode) {
  const all = mode === 'everything';
  const parent = tasksWin && !tasksWin.isDestroyed() ? tasksWin : undefined;
  const r = await dialog.showMessageBox(parent, {
    type: 'warning', buttons: [all ? 'Erase everything' : 'Reset progress', 'Cancel'], defaultId: 1, cancelId: 1,
    message: all ? 'Erase everything and start fresh?' : 'Reset your pet and progress?',
    detail: all
      ? 'Deletes your pet, badges, streaks, memories, tasks, settings and connections. This can\'t be undone.'
      : 'Deletes your pet, badges, streaks, Petdex, postcards and cemetery. Your tasks, settings and connections stay. This can\'t be undone.',
  });
  if (r.response !== 0) return false;
  stopFocus(false);
  if (onBreak()) endBreak(true);
  if (all) {
    settings = { ...DEFAULT_SETTINGS };
    tasks = [];
    saveSettings();
    saveTasks();
  }
  pet = P.createPet(settings.name || 'Byte');
  profile = G.emptyProfile();
  savePet();
  saveProfile();
  logLine(`reset: ${mode}`);
  send('reset', {});
  pushState();
  if (all) {
    if (win && !win.isDestroyed()) win.hide();
    openSetupWindow();
  }
  else toast({ kind: 'memorial', emoji: '🥚', title: 'Fresh start!', text: 'A brand-new egg appeared.' });
  return true;
}

// ---------- mini-games ----------
const GAMES = [
  { id: 'brick', name: 'Brick Breaker', emoji: '🧱', desc: 'Bounce the ball off your pet to smash the bricks across your desktop.' },
  { id: 'catch', name: 'Snack Catch', emoji: '🧺', desc: 'Catch falling snacks, dodge the bugs. 3 lives.' },
  { id: 'guess', name: 'Left or Right', emoji: '🔮', desc: 'The classic: guess which way your pet will look.' },
  { id: 'memory', name: 'Memory Beeps', emoji: '🔔', desc: 'Repeat the pattern of lights and beeps. How far can you go?' },
  { id: 'stretch', name: 'Stretch Break', emoji: '🤸', desc: 'A 2-minute guided stretch. Follow your pet\'s moves.' },
];
let gameWin = null;
let playing = null;

function openGame(id) {
  if (!GAMES.some((g) => g.id === id)) return;
  if (gameWin && !gameWin.isDestroyed()) gameWin.close();
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  gameWin = new BrowserWindow({
    x, y, width, height,
    transparent: true, frame: false, hasShadow: false, resizable: false, movable: false,
    skipTaskbar: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload-games.js'), contextIsolation: true, nodeIntegration: false },
  });
  gameWin.setAlwaysOnTop(true, 'pop-up-menu');
  gameWin.loadFile(path.join(__dirname, 'renderer', 'games.html'), { query: { game: id } });
  playing = id;
  if (IS_MAC) app.focus({ steal: true });
  gameWin.focus();
  gameWin.on('closed', () => { gameWin = null; playing = null; pushState(); });
  pushState();
}

function gameResult({ game, score = 0, won = false }) {
  if (!GAMES.some((g) => g.id === game)) return;
  bump('gamesPlayed');
  bump(`played_${game}`);
  const best = profile.highScores[game] || 0;
  const s = Math.max(0, Math.round(Number(score) || 0));
  if (s > best) profile.highScores[game] = s;
  if (game === 'brick' && won) bump('brickWins');
  if (game === 'stretch' && won) bump('stretches');
  if (!pet.ghost && pet.stage !== 'egg' && !pet.vacation) {
    pet.happiness = P.clamp(pet.happiness + (won ? 10 : 6));
    pet.energy = P.clamp(pet.energy + (game === 'stretch' ? 10 : -3));
  }
  speak(s > best && best > 0 ? `New high score: ${s}!` : won ? 'We won! That was fun!' : 'Fun! Again sometime?');
  savePet();
  saveProfile();
  checkAchievements();
  pushState();
}

// ---------- focus sessions: verified by sampling what's on screen ----------
let focusTimer = null;
let focusSampling = false;
let lastFocusNag = 0;

function startFocus(minutes = 25, taskId = null) {
  stopFocus(false);
  const task = taskId ? tasks.find((t) => t.id === taskId) : null;
  focus = {
    endsAt: Date.now() + minutes * 60000,
    total: minutes * 60000,
    taskId,
    taskTitle: task ? task.title : null,
    samples: 0,
    onTask: 0,
    tick: 0,
  };
  speak(task ? `Focus on "${task.title.slice(0, 40)}" for ${minutes} min! 🧘` : `Focus mode! ${minutes} minutes. Ommm… 🧘`);
  if (onBreak()) endBreak(true);
  focusTimer = setInterval(async () => {
    if (!focus) return;
    if (Date.now() >= focus.endsAt) {
      finishFocus();
      return;
    }
    send('state', snapshot());
    sendTasksWindow();
    updateTrayTitle();
  }, 1000);
  pushState();
}

function finishFocus() {
  const f = focus;
  stopFocus(false);
  if (f.closedTabs) {
    setTimeout(() => toast({ kind: 'saved', emoji: '🔖', title: `${f.closedTabs} tab${f.closedTabs === 1 ? '' : 's'} saved for later`, text: 'Reopen them from the Focus tab or the menu.' }), 2500);
  }
  const ratio = f.samples ? f.onTask / f.samples : 0;
  const verified = f.samples >= 3 && ratio >= 0.8;
  if (verified) {
    notify('Focus session verified ✅', `${Math.round(ratio * 100)}% on task. +10 XP for ${pet.name}. Take a 5-minute break!`);
    doFeed('focus-session');
  } else {
    notify('Focus session not verified', `Only ${Math.round(ratio * 100)}% on task (80% needed). No XP this time.`);
    handleEvents(['focus-failed']);
  }
}

function stopFocus(announce = true) {
  if (focusTimer) clearInterval(focusTimer);
  focusTimer = null;
  if (focus && announce) speak('Focus session cancelled.');
  focus = null;
  pushState();
}

// ---------- weather ----------
function weatherKind(code) {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 1 && code <= 48) return 'cloudy';
  return 'clear';
}
async function updateWeather() {
  if (demoMode) return;
  const w = settings.weather || {};
  if (!w.enabled) { weather = null; return; }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${w.latitude}&longitude=${w.longitude}&current=weather_code,temperature_2m,is_day`;
    const j = await (await fetch(url)).json();
    const kind = weatherKind(j.current.weather_code);
    const changed = !weather || weather.kind !== kind;
    weather = { kind, temp: Math.round(j.current.temperature_2m), isDay: !!j.current.is_day };
    if (changed && (kind === 'rain' || kind === 'storm')) speak(say('rain'));
    if (changed && kind === 'snow') speak(say('snow'));
    pushState({ menu: false });
  } catch { /* offline */ }
}

// ---------- git commits → food (and an endpoint for other tools) ----------
function startFeedServer() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/feed') {
      const type = u.searchParams.get('type') || 'commit';
      const size = (u.searchParams.get('size') || 'M').toUpperCase();
      if (type === 'commit') doFeed('commit');
      else if (type === 'task' && T.SIZES[size]) doFeed(`task-${size}`);
      else { res.statusCode = 400; return res.end('unknown food\n'); }
      return res.end(`${pet.name} ate!\n`);
    }
    if (u.pathname === '/status') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        name: pet.name, mood: P.mood(pet), stage: pet.stage, foodUnits: P.foodUnits(pet), xp: pet.xp,
        discipline: pet.discipline, careMistakes: pet.careMistakes, needs: P.needs(pet),
        openTasks: T.openTasks(tasks).length, alerts: alerts.map((a) => a.text),
      }));
    }
    res.statusCode = 404;
    res.end('not found\n');
  });
  server.on('error', (e) => console.error('feed server error:', e.message));
  server.listen(FEED_PORT, '127.0.0.1');
}

const HOOK_MARKER = '# bytepet: feed the pet on every commit';
const HOOK_LINE = `curl -s -m 2 "http://127.0.0.1:${FEED_PORT}/feed?type=commit" >/dev/null 2>&1 &`;

function installHook(hooksDir) {
  fs.mkdirSync(hooksDir, { recursive: true });
  const file = path.join(hooksDir, 'post-commit');
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '#!/bin/sh\n';
  if (content.includes(HOOK_MARKER)) return 'already';
  if (!content.endsWith('\n')) content += '\n';
  content += `\n${HOOK_MARKER}\n${HOOK_LINE}\n`;
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
  return 'installed';
}

async function connectRepo() {
  if (IS_MAC) app.focus({ steal: true });
  const r = await dialog.showOpenDialog({
    title: 'Connect a Git repo',
    message: 'Choose a project folder. Every commit there will feed your pet.',
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return;
  const dir = r.filePaths[0];
  execFile('git', ['-C', dir, 'rev-parse', '--git-path', 'hooks'], (err, out) => {
    if (err) {
      dialog.showMessageBox({ type: 'warning', message: 'That folder is not a Git repository.', detail: 'Run "git init" in it first, or pick another folder.' });
      return;
    }
    const hooksDir = path.resolve(dir, String(out).trim());
    try {
      const result = installHook(hooksDir);
      if (!settings.repos.includes(dir)) { settings.repos.push(dir); saveSettings(); }
      speak(result === 'already' ? 'I already eat from that repo!' : `Connected ${path.basename(dir)}! Commit to feed me.`);
      checkRepos();
      updateTray();
    } catch (e) {
      dialog.showMessageBox({ type: 'error', message: 'Could not install the git hook.', detail: e.message });
    }
  });
}

// ---------- task window ----------
function hubView() {
  const unlockedIds = G.unlocked(profile);
  return {
    name: pet.name,
    stage: pet.stage,
    form: pet.form,
    formName: pet.form && P.FORMS[pet.form] ? P.FORMS[pet.form].name : null,
    mood: P.mood(pet),
    needs: P.needs(pet),
    meters: { food: P.foodUnits(pet), joy: Math.round(pet.happiness), health: Math.round(pet.health), energy: Math.round(pet.energy), discipline: Math.round(pet.discipline) },
    updates: updates.count || 0,
    flies: !!pet.flies,
    alerts: alerts.slice(0, 3).map((a) => a.text),
    distractionSource: pet.distractionSource ? friendly(pet.distractionSource) : null,
    leaning: pet.stage !== 'adult' && pet.stage !== 'egg' ? P.adultForm(pet) : null,
    style: pet.style || {},
    petdex: Object.entries(P.FORMS).map(([id, f]) => ({ id, ...f, found: (profile.petdex || {})[id] || null })),
    ghost: pet.ghost,
    revive: pet.revive || 0,
    sleepy: !!pet.sleepy,
    asleep: !!pet.asleep,
    sleepKind: pet.sleepKind || null,
    wakeHour: settings.wakeHour ?? 7,
    ghostDaysLeft: pet.ghost && pet.ghostSince ? Math.max(0, Math.ceil((pet.ghostSince + 3 * 24 * 3600e3 - Date.now()) / (24 * 3600e3))) : null,
    generation: pet.generation || 1,
    age: pet.age || 0,
    born: pet.born,
    streak: G.currentStreak(profile),
    bestStreak: profile.bestStreak,
    vacation: pet.vacation,
    canRetire: pet.stage === 'adult' && !pet.ghost && !pet.vacation,
    unlocks: G.UNLOCKS.map((u) => ({ ...u, unlocked: unlockedIds.includes(u.id) })),
    equipped: profile.equipped,
    achievements: ACH.catalog().map((a) => ({ ...a, at: profile.achievements[a.id] || null })),
    postcards: profile.postcards.slice().reverse(),
    graveyard: profile.graveyard.slice().reverse(),
    highScores: profile.highScores,
    games: GAMES,
    poop: pet.poop || [],
    system: systemView(),
    stats: pet.stats,
    careMistakes: pet.careMistakes,
    settings: {
      name: settings.name,
      distractionApps: settings.distractionApps,
      distractionSites: settings.distractionSites,
      distractionKeywords: settings.distractionKeywords,
      distractedAfterMinutes: settings.distractedAfterMinutes,
      watchIdleMinutes: settings.watchIdleMinutes,
      countBackground: settings.countBackground !== false,
      neverDistracting: settings.neverDistracting || [],
      learningKeywords: settings.learningKeywords || [],
      countCategories: { ...DEFAULT_SETTINGS.countCategories, ...(settings.countCategories || {}) },
      distractionSchedule: { ...DEFAULT_SETTINGS.distractionSchedule, ...(settings.distractionSchedule || {}) },
      distractionAllowanceMinutes: settings.distractionAllowanceMinutes,
      workApps: settings.workApps,
      screenLimitMinutes: settings.screenLimitMinutes,
      checkMess: settings.checkMess,
      locationLookup: settings.locationLookup !== false,
      postcardAfterHours: settings.postcardAfterHours ?? 24,
      strictFocus: settings.strictFocus !== false,
      notifications: settings.notifications !== false,
      toasts: settings.toasts !== false,
      sounds: settings.sounds !== false,
      morningCheckin: settings.morningCheckin !== false,
      bedtimeHour: settings.bedtimeHour ?? 23,
      wakeHour: settings.wakeHour ?? 7,
      quietPet: !!settings.quiet,
      suggest: SETUP_SUGGESTIONS,
      quietStart: settings.quietStart ?? 23,
      quietEnd: settings.quietEnd ?? 8,
      maxNotificationsPerDay: settings.maxNotificationsPerDay ?? 8,
      openAtLogin: openAtLoginState(),
      packaged: app.isPackaged,
      perf: { avgMs: perf.samples ? Math.round(perf.totalMs / perf.samples) : 0, cpu: perf.cpu, onBattery: onBatteryNow(), slowed: onBatteryNow() || perf.lastMs > 3000 || perf.cpu > 15 },
      messLimits: { ...DEFAULT_SETTINGS.messLimits, ...(settings.messLimits || {}) },
    },
  };
}

// Common picks for the first-run setup
const SETUP_SUGGESTIONS = {
  apps: ['Steam', 'Discord', 'Netflix', 'YouTube', 'TV', 'Instagram', 'TikTok', 'Twitch', 'Roblox', 'Minecraft', 'Epic Games Launcher', 'Battle.net', 'League of Legends', 'WhatsApp', 'Messages', 'Telegram'],
  sites: ['youtube.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'netflix.com', 'twitch.tv', 'discord.com', 'primevideo.com', 'disneyplus.com', 'pinterest.com', '9gag.com', 'roblox.com', 'chess.com'],
  work: ['Visual Studio Code', 'Code', 'Kiro', 'Cursor', 'Xcode', 'Terminal', 'iTerm2', 'Warp', 'PyCharm', 'IntelliJ IDEA', 'Unity', 'Blender', 'Fusion 360', 'Figma', 'Notion', 'Obsidian', 'Notes', 'Pages', 'Microsoft Word', 'Microsoft Excel', 'Preview', 'MATLAB'],
};

// Open at login only works for the real Bytepet.app (not `npm start`)
function openAtLoginState() {
  try { return app.isPackaged ? app.getLoginItemSettings().openAtLogin : false; } catch { return false; }
}
function setOpenAtLogin(on) {
  if (!app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true }); } catch (e) { logLine(`login item failed: ${e}`); }
}

// Settings edited in the hub: validate everything
function saveHubSettings(input = {}) {
  const list = (v, max = 60) => (Array.isArray(v) ? v : String(v || '').split(/\n|,/))
    .map((x) => String(x).trim()).filter(Boolean).slice(0, max);
  const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  if (typeof input.name === 'string' && input.name.trim()) {
    settings.name = input.name.trim().slice(0, 20);
    if ((pet.generation || 1) === 1) pet.name = settings.name;
  }
  if ('distractionApps' in input) settings.distractionApps = list(input.distractionApps);
  if ('distractionSites' in input) settings.distractionSites = list(input.distractionSites).map((d) => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase());
  if ('distractionKeywords' in input) settings.distractionKeywords = list(input.distractionKeywords);
  if ('workApps' in input) settings.workApps = list(input.workApps, 100);
  if ('distractedAfterMinutes' in input) settings.distractedAfterMinutes = num(input.distractedAfterMinutes, 1, 120, 5);
  if ('watchIdleMinutes' in input) settings.watchIdleMinutes = num(input.watchIdleMinutes, 5, 480, 120);
  if ('neverDistracting' in input) settings.neverDistracting = list(input.neverDistracting);
  if ('learningKeywords' in input) settings.learningKeywords = list(input.learningKeywords);
  if (input.countCategories) {
    const c = input.countCategories;
    settings.countCategories = { game: !!c.game, entertainment: !!c.entertainment, social: !!c.social };
  }
  if (input.distractionSchedule) {
    const d = input.distractionSchedule;
    const days = (Array.isArray(d.days) ? d.days : []).map(Number).filter((x) => x >= 0 && x <= 6);
    settings.distractionSchedule = {
      mode: d.mode === 'work' ? 'work' : 'always',
      days: days.length ? days : [1, 2, 3, 4, 5],
      start: num(d.start, 0, 23, 9),
      end: num(d.end, 1, 24, 18),
    };
  }
  if ('distractionAllowanceMinutes' in input) settings.distractionAllowanceMinutes = num(input.distractionAllowanceMinutes, 0, 600, 45);
  if ('screenLimitMinutes' in input) settings.screenLimitMinutes = num(input.screenLimitMinutes, 15, 600, 120);
  if ('checkMess' in input) settings.checkMess = !!input.checkMess;
  if ('locationLookup' in input) settings.locationLookup = !!input.locationLookup;
  if ('postcardAfterHours' in input) settings.postcardAfterHours = num(input.postcardAfterHours, 1, 720, 24);
  if ('strictFocus' in input) settings.strictFocus = !!input.strictFocus;
  if ('notifications' in input) settings.notifications = !!input.notifications;
  if ('toasts' in input) settings.toasts = !!input.toasts;
  if ('sounds' in input) settings.sounds = !!input.sounds;
  if ('morningCheckin' in input) settings.morningCheckin = !!input.morningCheckin;
  if ('bedtimeHour' in input) settings.bedtimeHour = num(input.bedtimeHour, 0, 23, 23);
  if ('wakeHour' in input) settings.wakeHour = num(input.wakeHour, 0, 23, 7);
  if ('quietPet' in input) settings.quiet = !!input.quietPet;
  if ('countBackground' in input) settings.countBackground = !!input.countBackground;
  if ('quietStart' in input) settings.quietStart = num(input.quietStart, 0, 23, 23);
  if ('quietEnd' in input) settings.quietEnd = num(input.quietEnd, 0, 23, 8);
  if ('maxNotificationsPerDay' in input) settings.maxNotificationsPerDay = num(input.maxNotificationsPerDay, 0, 50, 8);
  if ('openAtLogin' in input) setOpenAtLogin(!!input.openAtLogin);
  if (input.messLimits) {
    const m = input.messLimits;
    settings.messLimits = {
      desktop: num(m.desktop, 0, 10000, 15), downloads: num(m.downloads, 0, 10000, 50),
      tabs: num(m.tabs, 0, 1000, 40), trash: num(m.trash, 0, 100000, 100),
    };
  }
  saveSettings();
  savePet();
  checkMessNow();
  pushState();
}

function focusView() {
  const key = G.dayKey();
  const log = profile.focusLog || {};
  const today = log[key] || { work: 0, distracted: 0, sources: {} };
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400e3);
    const k = G.dayKey(d.getTime());
    const e = log[k] || { work: 0, distracted: 0 };
    week.push({ key: k, label: d.toLocaleDateString([], { weekday: 'short' }), work: e.work, distracted: e.distracted });
  }
  const s = lastSample;
  const counting = Dist.counts(settings.distractionSchedule) && !onBreak() && !pet.vacation;
  return {
    now: s ? {
      app: s.appName, site: s.site, title: s.title ? s.title.slice(0, 90) : null,
      distracting: s.distracting, frontDistracting: s.frontDistracting, background: s.background || [],
      source: s.source, reason: s.reason, learning: s.learning, idle: s.idle,
      ago: Math.round((Date.now() - s.at) / 1000),
    } : null,
    selfInFront,
    frontDebug,
    counting,
    why: onBreak() ? 'on a break' : pet.vacation ? 'on vacation' : !Dist.counts(settings.distractionSchedule) ? 'outside work hours' : null,
    inRow: pet.distractedMinutes || 0,
    after: settings.distractedAfterMinutes,
    todayTotal: pet.distractionToday || 0,
    allowance: settings.distractionAllowanceMinutes,
    discipline: Math.round(pet.discipline),
    sad: !!pet.distracted,
    today: { work: today.work, distracted: today.distracted, sources: Object.entries(today.sources || {}).sort((a, b) => b[1] - a[1]).slice(0, 8) },
    week,
    breakLeft: onBreak() ? Math.ceil((breakUntil - Date.now()) / 60000) : 0,
    strict: settings.strictFocus !== false,
    inFocus: !!focus,
    focusLeft: focus ? `${Math.max(0, Math.ceil((focus.endsAt - Date.now()) / 60000))} min` : null,
    savedTabs: (profile.savedTabs || []).slice().reverse().map((t) => ({ url: t.url, title: t.title })),
    browsers: Object.entries(browserStatus).map(([name, status]) => ({ name, status })),
    accessibilityOk,
    isMac: IS_MAC || !!process.env.BYTEPET_FAKE_SAMPLE,
  };
}

function tasksView() {
  return {
    focusTab: focusView(),
    hub: hubView(),
    petName: pet.name,
    checkin: checkinView(),
    open: T.openTasks(tasks),
    doneToday: T.doneToday(tasks),
    sizes: T.SIZES,
    focus: focus ? { taskId: focus.taskId, taskTitle: focus.taskTitle, remainingMs: Math.max(0, focus.endsAt - Date.now()) } : null,
    alerts: alerts.map((a) => ({ kind: a.kind, text: a.text })),
    connections: {
      calendarUrls: settings.calendarIcsUrls || [],
      calendarStatus,
      githubConnected: !!settings.githubTokenEnc,
      githubStatus,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      isMac: IS_MAC,
      remindersEnabled: !!settings.remindersEnabled,
      remindersLists: settings.remindersLists || [],
      remindersStatus: syncStatus.reminders,
      todoistConnected: !!settings.todoistTokenEnc,
      todoistStatus: syncStatus.todoist,
      completeInSource: !!settings.completeInSource,
    },
  };
}

function sendTasksWindow() {
  if (tasksWin && !tasksWin.isDestroyed()) tasksWin.webContents.send('tasks:update', tasksView());
}

function openTasksWindow(tab) {
  if (tasksWin && !tasksWin.isDestroyed()) {
    tasksWin.show();
    tasksWin.focus();
    if (typeof tab === 'string') tasksWin.webContents.send('hub:tab', tab);
    return;
  }
  if (IS_MAC && app.dock) app.dock.show(); // gives the window a normal menu, so copy/paste works
  tasksWin = new BrowserWindow({
    width: 560,
    height: process.env.BYTEPET_TALL ? 1000 : 760,
    minWidth: 380,
    minHeight: 480,
    title: 'Bytepet',
    backgroundColor: '#e8eed2',
    webPreferences: {
      preload: path.join(__dirname, 'preload-tasks.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  tasksWin.loadFile(path.join(__dirname, 'renderer', 'tasks.html'), typeof tab === 'string' ? { hash: tab } : undefined);
  tasksWin.webContents.setWindowOpenHandler(({ url }) => { openSafeUrl(url); return { action: 'deny' }; });
  tasksWin.on('closed', () => {
    tasksWin = null;
    if (IS_MAC && app.dock) app.dock.hide();
  });
  if (IS_MAC) app.focus({ steal: true });
}

// ---------- setup: its own small window, step by step ----------
let setupWin = null;
function openSetupWindow() {
  if (setupWin && !setupWin.isDestroyed()) { setupWin.show(); setupWin.focus(); return; }
  if (IS_MAC && app.dock) app.dock.show();
  setupWin = new BrowserWindow({
    width: 620,
    height: 740,
    resizable: false,
    minimizable: false,
    fullscreenable: false,
    title: 'Welcome to Bytepet',
    backgroundColor: '#f6f3e8',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload-tasks.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWin.loadFile(path.join(__dirname, 'renderer', 'setup.html'), { query: { first: settings.onboarded ? '0' : '1', step: process.env.BYTEPET_SETUP_STEP || '0' } });
  setupWin.on('closed', () => {
    setupWin = null;
    if (IS_MAC && app.dock && !(tasksWin && !tasksWin.isDestroyed())) app.dock.hide();
    // closed the very first setup without finishing: still give them a pet
    if (!settings.onboarded) finishSetup({});
  });
  if (IS_MAC) app.focus({ steal: true });
}

function finishSetup(input) {
  const first = !settings.onboarded;
  saveHubSettings(input);
  settings.onboarded = true;
  saveSettings();
  if (first) {
    // the egg is only placed once it has a name
    pet = P.createPet(settings.name || 'Byte');
    savePet();
    if (win && !win.isDestroyed() && !settings.hidden) win.showInactive();
    send('reset', {});
    setTimeout(() => toast({ kind: 'unlock', emoji: '🥚', title: `Meet ${pet.name}!`, text: 'Your egg hatches in a few seconds. Click it to say hi.' }), 800);
  }
  logLine(first ? 'setup finished: egg placed' : 'setup updated');
  pushState();
}

// ---------- menu bar ----------
const bar = (v) => {
  const n = Math.round(v / 10);
  return '▓'.repeat(n) + '░'.repeat(10 - n);
};
const food = (units) => '●'.repeat(Math.round(units)) + '○'.repeat(5 - Math.round(units));
const STAGE_EMOJI = { egg: '🥚', baby: '🐣', child: '🐥', adult: '⭐', ghost: '👻' };

function updateTrayTitle() {
  if (!tray || !IS_MAC) return;
  const alert = P.needs(pet).length ? '❗' : '';
  if (focus) tray.setTitle(` 🍅 ${Math.ceil((focus.endsAt - Date.now()) / 60000)}m`);
  else if (pet.ghost) tray.setTitle(` 👻 ${Math.round(pet.revive)}%`);
  else tray.setTitle(` ${alert}${Math.round(P.foodUnits(pet))}/5`);
}

function updatesMenuItems() {
  if (!IS_MAC) return [];
  if (updates.checking) return [{ label: '💊 Checking for updates…', enabled: false }];
  if (updates.count > 0) {
    return [
      { label: `💊 ${updates.count} update(s) waiting — open Software Update…`, click: openSoftwareUpdate },
      { label: 'I installed them — check again', click: () => checkUpdates(true) },
    ];
  }
  return [{ label: updates.lastChecked ? '💊 Mac is up to date — check again' : '💊 Check for updates', click: () => checkUpdates(true) }];
}

function tasksSubmenu() {
  const open = T.openTasks(tasks).slice(0, 10);
  return [
    { label: 'Add or manage tasks…', click: openTasksWindow },
    { label: 'Sync with Reminders / Todoist / calendar now', click: syncAll },
    { type: 'separator' },
    ...(open.length
      ? open.map((t) => ({ label: `◻ [${t.size}] ${t.title.slice(0, 50)}`, click: () => completeTask(t.id) }))
      : [{ label: 'No open tasks', enabled: false }]),
    ...(open.length ? [{ type: 'separator' }, { label: 'Click a task to mark it done', enabled: false }] : []),
  ];
}

function buildMenuTemplate() {
  const stageName = pet.ghost ? 'ghost' : pet.stage === 'adult' ? `${pet.form} adult` : pet.stage;
  const needs = P.needs(pet).filter((n) => n !== 'attention');
  const NEED_LABEL = { hungry: 'hungry', sleepy: 'wants lights off', sick: 'needs medicine', distracted: 'sad from distractions' };
  const statItems = pet.ghost
    ? [{ label: `Revive  ${bar(pet.revive)}  ${Math.round(pet.revive)}%`, enabled: false }]
    : [
      { label: `Food         ${food(P.foodUnits(pet))}`, enabled: false },
      { label: `Energy      ${bar(pet.energy)}`, enabled: false },
      { label: `Joy           ${bar(pet.happiness)}`, enabled: false },
      { label: `Health       ${bar(pet.health)}`, enabled: false },
      { label: `Discipline  ${bar(pet.discipline)}`, enabled: false },
    ];
  const openCount = T.openTasks(tasks).length;
  return [
    { label: `${STAGE_EMOJI[pet.ghost ? 'ghost' : pet.stage]} ${pet.name} — ${stageName} · ${pet.xp} XP`, enabled: false },
    ...(needs.length ? [{ label: `❗ Needs you: ${needs.map((n) => NEED_LABEL[n]).join(', ')}`, enabled: false }] : []),
    ...alerts.slice(0, 4).map((a) => ({ label: `🔔 ${a.text.slice(0, 60)}`, click: a.url ? () => openSafeUrl(a.url) : openTasksWindow })),
    ...statItems,
    { label: `Screen time ${Math.floor(pet.activeStreak / 60)}h ${pet.activeStreak % 60}m · Distraction today ${pet.distractionToday}m · Care mistakes ${pet.careMistakes}`, enabled: false },
    { type: 'separator' },
    { label: `Tasks (${openCount} open)`, submenu: tasksSubmenu() },
    focus
      ? { label: `Cancel focus session (${Math.ceil((focus.endsAt - Date.now()) / 60000)}m left)`, click: () => stopFocus() }
      : { label: 'Start 25-min focus session 🍅', click: () => startFocus(25) },
    { label: 'Play', click: () => { handleEvents(P.play(pet)); savePet(); pushState(); } },
    onBreak()
      ? { label: `🍿 On a break (${Math.ceil((breakUntil - Date.now()) / 60000)}m left) — end it`, click: () => endBreak(true) }
      : { label: 'Take a guilt-free break 🍿', submenu: [15, 30, 60].map((m) => ({ label: `${m} minutes`, click: () => startBreak(m) })) },
    ...((profile.savedTabs || []).length ? [{ label: `🔖 Reopen ${profile.savedTabs.length} saved tab(s)`, click: reopenSavedTabs }] : []),
    { label: 'Help', submenu: [
      { label: 'Run setup again…', click: openSetupWindow },
      { label: 'Copy debug info', click: copyDebugInfo },
      { label: 'Open log file', click: openLogFile },
    ] },
    ...(pet.sleepy && !pet.asleep ? [{ label: '💡 Turn the lights off', click: turnLightsOff }] : []),
    ...(checkinPending() ? [{ label: '☀️ Plan my day (3 tasks)…', click: () => openTasksWindow('tasks') }] : []),
    ...(pet.ghost ? [{ label: `👻 Let ${pet.name} rest (new egg)…`, click: letGhostRest }] : []),
    ...((profile.desktopGraves || []).length ? [{ label: '🪦 Move gravestones to the cemetery', click: () => { for (const g of profile.desktopGraves.slice()) moveGrave(String(g.died)); } }] : []),
    { label: 'Mini-games', submenu: GAMES.map((g) => ({ label: `${g.emoji} ${g.name}`, click: () => openGame(g.id) })) },
    { label: 'Achievements, pet & memories…', click: () => openTasksWindow('achievements') },
    {
      label: pet.vacation ? '🧳 On vacation — come back home' : 'Go on vacation 🧳',
      click: () => setVacation(!pet.vacation),
    },
    ...updatesMenuItems(),
    { type: 'separator' },
    { label: `Connect a Git repo…${settings.repos.length ? ` (${settings.repos.length} connected)` : ''}`, click: connectRepo },
    { label: 'Connect calendar, Reminders, Todoist or GitHub…', click: openTasksWindow },
    {
      label: 'Notifications', type: 'checkbox', checked: !!settings.notifications,
      click: (i) => { settings.notifications = i.checked; saveSettings(); },
    },
    {
      label: 'Quiet mode', type: 'checkbox', checked: !!settings.quiet,
      click: (i) => { settings.quiet = i.checked; saveSettings(); pushState(); },
    },
    {
      label: 'Hide pet', type: 'checkbox', checked: !!settings.hidden,
      click: (i) => {
        settings.hidden = i.checked; saveSettings();
        if (i.checked) win.hide(); else win.showInactive();
      },
    },
    {
      label: app.isPackaged ? 'Open at login' : 'Open at login (packaged app only)',
      type: 'checkbox',
      enabled: app.isPackaged,
      checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    demoMode ? { label: '⏹ Stop demo (playing…)', click: stopDemo } : { label: '▶ Play demo', click: startDemo },
    {
      label: 'Demo tools',
      submenu: [
        { label: 'Make a digital mess (poop)', click: () => applyMess([{ kind: 'downloads', label: 'Downloads', count: 87, limit: 50 }, { kind: 'tabs', label: 'browser tabs', count: 52, limit: 40 }]) },
        { label: 'Clean the mess (flush)', click: () => applyMess([]) },
        { label: 'Toggle low battery', click: () => { demoSystem.low = !demoSystem.low; lastSystemKey = ''; checkSystem(); if (demoSystem.low) speak(say('battery-low')); } },
        { label: 'Toggle hot computer', click: () => { demoSystem.hot = !demoSystem.hot; lastSystemKey = ''; checkSystem(); if (demoSystem.hot) speak(say('hot')); } },
        { label: 'Come back from a 3-day trip abroad', click: () => {
          const trips = [['JP', 'Tokyo'], ['FR', 'Paris'], ['IT', 'Venice'], ['IS', 'Reykjavík'], ['EG', 'Cairo'], ['MX', 'Cancún'], ['GR', 'Santorini'], ['NL', 'Amsterdam']];
          const [code, city] = trips[Math.floor(Math.random() * trips.length)];
          const go = pet.vacation ? Promise.resolve() : setVacation(true, 72, true);
          go.then(() => setTimeout(() => setVacation(false, 0, [{ countryCode: code, city, timezone: null }]), 1200));
        } },
        { label: 'Come back from a 3-day staycation', click: () => {
          const go = pet.vacation ? Promise.resolve() : setVacation(true, 72, true);
          go.then(() => setTimeout(() => setVacation(false, 0, []), 1200));
        } },
        { label: 'Add a good day (+1 age, streak)', click: () => { profile.days[G.dayKey()] = { tasks: 0, large: 0, focus: 0, vacation: false, good: false }; recordDay('task'); recordDay('task'); } },
        { label: 'Retire pet (graveyard)', click: () => buryPet('retired') },
        { type: 'separator' },
        { label: 'Simulate a git commit', click: () => doFeed('commit') },
        { label: 'Finish a small task (+1 food, +10 XP)', click: () => doFeed('task-S') },
        { label: 'Finish a medium task (+2 food, +20 XP)', click: () => doFeed('task-M') },
        { label: 'Finish a large task (+3 food, +40 XP)', click: () => doFeed('task-L') },
        { label: 'Short focus session (1 min)', click: () => startFocus(1) },
        { type: 'separator' },
        { label: 'Make it hungry', click: () => { pet.hunger = 10; minuteTick(); } },
        { label: 'Too much screen time (lights)', click: () => { pet.activeStreak = settings.screenLimitMinutes; minuteTick(); } },
        { label: 'Fake an update (medicine)', click: () => { handleEvents(P.setUpdates(pet, 1)); minuteTick(); } },
        { label: 'Give medicine (cure)', click: () => { handleEvents(P.setUpdates(pet, 0)); savePet(); pushState(); } },
        { label: 'Too much distraction (discipline)', click: () => { pet.distracted = true; pet.distractedMinutes = 5; handleEvents(['distracted', 'call-distracted']); savePet(); pushState(); } },
        { label: 'Fake a meeting in 5 min (attention)', click: () => { calendarEvents.push({ uid: `demo${Date.now()}`, summary: 'Demo meeting', start: Date.now() + 5 * 60000, allDay: false }); refreshAlerts(); pushState(); } },
        { label: 'Fake a task due in 30 min (attention)', click: () => { addTask({ title: 'Demo: submit co-op application', size: 'M', due: Date.now() + 30 * 60000 }); } },
        { label: 'Fake a missed deadline', click: () => { addTask({ title: 'Demo: overdue task', size: 'S', due: Date.now() - 60000 }); } },
        { type: 'separator' },
        { label: 'Toggle dancing', click: () => { music = !music; if (music) speak(say('dance')); pushState(); } },
        { label: 'Grow up (+200 XP)', click: () => { handleEvents(P.addXp(pet, 200)); savePet(); pushState(); } },
        { label: 'Turn it into a ghost', click: () => { Object.assign(pet, { health: 0, ghost: true, ghostSince: Date.now(), revive: 0, sleepy: false, distracted: false, calls: {} }); handleEvents(['died']); savePet(); pushState(); } },
        { label: 'Make the ghost fade now', click: () => { if (pet.ghost) buryPet('faded'); } },
        { type: 'separator' },
        { label: 'Hatch a new pet (reset)', click: resetPet },
      ],
    },
    { type: 'separator' },
    { label: 'Open settings file', click: () => shell.openPath(settingsFile()) },
    { label: 'Reload settings', click: () => { loadSettings(); pet.name = settings.name; refreshCalendar(); pushState(); } },
    { label: 'Quit Bytepet', click: () => app.quit() },
  ];
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
  tray.setToolTip(`${pet.name} (${P.mood(pet)})`);
  updateTrayTitle();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', IS_MAC ? 'trayTemplate.png' : 'tray.png'));
  if (IS_MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  updateTray();
}

// ---------- IPC ----------
function setupIpc() {
  // pet window
  ipcMain.on('set-ignore-mouse', (_e, ignore) => {
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  ipcMain.on('action', (_e, name) => {
    if (name === 'tasks') { openTasksWindow(); return; }
    if (name === 'lights') { turnLightsOff(); return; }
    if (name === 'open') { openTasksWindow(checkinPending() ? 'tasks' : 'pet'); return; }
    let events = [];
    if (name === 'pet' && checkinPending() && checkinOpened !== todayKey()) { checkinOpened = todayKey(); openTasksWindow('tasks'); }
    if (name === 'pet') events = P.petIt(pet);
    else if (name === 'play') events = P.play(pet);
    else if (name === 'basket') { events = P.basket(pet); if (events[0] === 'basket') bump('baskets'); }
    handleEvents(events);
    savePet();
    pushState();
  });
  ipcMain.on('context-menu', () => Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: win }));
  ipcMain.on('mess-click', (_e, kind) => openMess(String(kind)));
  ipcMain.on('grave-click', (_e, id) => graveMenu(String(id)));

  // hub (tabs in the Bytepet window)
  ipcMain.handle('hub:equip', (_e, id) => {
    profile.equipped = id && G.unlocked(profile).includes(id) ? id : null;
    saveProfile();
    pushState();
    return tasksView();
  });
  ipcMain.handle('hub:vacation', (_e, on) => { setVacation(!!on); return tasksView(); });
  ipcMain.handle('hub:retire', () => { if (pet.stage === 'adult' && !pet.ghost) buryPet('retired'); return tasksView(); });
  ipcMain.handle('hub:play', (_e, id) => { openGame(String(id)); });
  ipcMain.handle('hub:save-settings', (_e, input) => { saveHubSettings(input); return tasksView(); });
  ipcMain.handle('hub:open-mess', (_e, kind) => { openMess(String(kind)); });
  ipcMain.handle('focus:break', (_e, minutes) => { startBreak(Math.min(120, Math.max(5, Number(minutes) || 15))); return tasksView(); });
  ipcMain.handle('focus:end-break', () => { endBreak(true); return tasksView(); });
  ipcMain.handle('focus:check', async () => { await sample(); return tasksView(); });
  ipcMain.handle('hub:reset', async (_e, mode) => { await resetAll(mode === 'everything' ? 'everything' : 'progress'); return tasksView(); });
  ipcMain.handle('hub:let-rest', async () => { await letGhostRest(); return tasksView(); });
  ipcMain.handle('notify:test', () => {
    notify(`${pet.name} says hi! 👋`, 'Notifications are working.', null, { force: true });
    return { quiet: inQuietHours(), supported: Notification.isSupported(), enabled: !!settings.notifications };
  });
  ipcMain.handle('debug:copy', () => { copyDebugInfo(); return true; });
  ipcMain.handle('debug:open-log', () => { openLogFile(); return true; });
  ipcMain.handle('setup:checks', () => permissionChecks());
  ipcMain.handle('setup:test', (_e, id) => testPermission(String(id)));
  ipcMain.handle('setup:fix', (_e, kind) => { if (PANES[kind]) shell.openExternal(PANES[kind]); return true; });
  ipcMain.handle('setup:done', (_e, input = {}) => {
    finishSetup(input);
    if (setupWin && !setupWin.isDestroyed()) setTimeout(() => setupWin && !setupWin.isDestroyed() && setupWin.close(), 300);
    return true;
  });
  ipcMain.handle('setup:again', () => { openSetupWindow(); return true; });
  ipcMain.handle('focus:strict', (_e, on) => { settings.strictFocus = !!on; saveSettings(); return tasksView(); });
  ipcMain.handle('focus:reopen-tabs', () => { reopenSavedTabs(); return tasksView(); });
  ipcMain.handle('focus:open-tab', (_e, url) => {
    if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
    profile.savedTabs = (profile.savedTabs || []).filter((t) => t.url !== url);
    saveProfile();
    pushState();
    return tasksView();
  });
  ipcMain.handle('focus:clear-tabs', () => { profile.savedTabs = []; saveProfile(); pushState(); return tasksView(); });
  ipcMain.handle('focus:start', (_e, minutes) => { startFocus(Math.min(90, Math.max(1, Number(minutes) || 25))); return tasksView(); });
  ipcMain.handle('focus:never', (_e, source) => {
    const src = String(source || '').trim();
    if (src && !(settings.neverDistracting || []).includes(src)) settings.neverDistracting = [...(settings.neverDistracting || []), src];
    saveSettings();
    if (pet.distracted) { pet.distracted = false; pet.distractedMinutes = 0; }
    sample().then(() => pushState());
    return tasksView();
  });

  // mini-games
  ipcMain.handle('game:info', () => ({
    stage: pet.stage === 'egg' || pet.ghost ? 'baby' : pet.stage,
    form: pet.stage === 'adult' ? pet.form : null,
    name: pet.name,
    equipped: profile.equipped,
    highScores: profile.highScores,
  }));
  ipcMain.handle('game:result', (_e, r) => gameResult(r || {}));
  ipcMain.handle('game:close', () => { if (gameWin && !gameWin.isDestroyed()) gameWin.close(); });
  ipcMain.on('ready', () => pushState());

  // task window
  ipcMain.handle('tasks:get', () => tasksView());
  ipcMain.handle('tasks:add', (_e, f) => {
    try {
      addTask({ title: f.title, size: f.size, due: f.due || null });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('checkin:submit', (_e, items) => { submitCheckin(Array.isArray(items) ? items : []); return tasksView(); });
  ipcMain.handle('pet:medicine', () => { openSoftwareUpdate(); return true; });
  ipcMain.handle('pet:lights', () => { turnLightsOff(); return tasksView(); });
  ipcMain.handle('checkin:skip', () => { skipCheckin(); return tasksView(); });
  ipcMain.handle('tasks:complete', (_e, id) => { completeTask(id); return tasksView(); });
  ipcMain.handle('tasks:delete', (_e, id) => { deleteTask(id); return tasksView(); });
  // hide every overdue task at once (tasks from other apps are only hidden here, never deleted there)
  ipcMain.handle('tasks:clear-overdue', () => {
    const late = tasks.filter((t) => !t.done && !t.dismissed && t.missed);
    for (const t of late) t.dismissed = true;
    tasks = tasks.filter((t) => !(t.dismissed && !t.externalId)); // manual ones can just go
    onTasksChanged();
    return { cleared: late.length, view: tasksView() };
  });
  ipcMain.handle('tasks:focus', (_e, id) => { startFocus(25, id); return tasksView(); });
  ipcMain.handle('tasks:stop-focus', () => { stopFocus(); return tasksView(); });
  ipcMain.handle('tasks:open-url', (_e, url) => { openSafeUrl(url); });

  ipcMain.handle('conn:set-calendar', async (_e, urls) => {
    const clean = (Array.isArray(urls) ? urls : [])
      .map((u) => String(u).trim())
      .filter((u) => /^(https|webcal):\/\//i.test(u))
      .slice(0, 5);
    settings.calendarIcsUrls = clean;
    saveSettings();
    await refreshCalendar();
    return tasksView();
  });
  ipcMain.handle('conn:set-github', async (_e, token) => {
    const t = String(token || '').trim();
    if (!t) return { ok: false, error: 'Paste a token first' };
    try {
      githubUser = await GH.whoAmI(t);
    } catch (e) {
      return { ok: false, error: e.message };
    }
    if (!setGithubToken(t)) return { ok: false, error: 'Secure storage is not available on this Mac' };
    await refreshGithub();
    return { ok: true, user: githubUser };
  });
  ipcMain.handle('conn:disconnect-github', () => {
    setGithubToken('');
    githubUser = '';
    githubReviews = [];
    githubStatus = '';
    refreshAlerts();
    pushState();
    return tasksView();
  });
  ipcMain.handle('conn:import-github', () => importGithubIssues());

  ipcMain.handle('conn:reminders-lists', async () => {
    try { return { ok: true, lists: await Reminders.listNames() }; } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('conn:reminders-save', async (_e, lists) => {
    settings.remindersEnabled = true;
    settings.remindersLists = (Array.isArray(lists) ? lists : []).map(String).slice(0, 50);
    saveSettings();
    const r = await syncSource('reminders');
    return r ? { ok: true, ...r } : { ok: false, error: syncStatus.reminders };
  });
  ipcMain.handle('conn:reminders-disconnect', () => {
    settings.remindersEnabled = false;
    saveSettings();
    syncStatus.reminders = '';
    dropOpenTasksFrom('reminders');
    return tasksView();
  });
  ipcMain.handle('conn:set-todoist', async (_e, token) => {
    const t = String(token || '').trim();
    if (!t) return { ok: false, error: 'Paste your API token first' };
    try { await Todoist.openItems(t); } catch (e) { return { ok: false, error: e.message }; }
    if (!setSecret('todoistTokenEnc', t)) return { ok: false, error: 'Secure storage is not available on this Mac' };
    const r = await syncSource('todoist');
    return r ? { ok: true, ...r } : { ok: false, error: syncStatus.todoist };
  });
  ipcMain.handle('conn:disconnect-todoist', () => {
    setSecret('todoistTokenEnc', '');
    syncStatus.todoist = '';
    dropOpenTasksFrom('todoist');
    return tasksView();
  });
  ipcMain.handle('conn:complete-in-source', (_e, on) => {
    settings.completeInSource = !!on;
    saveSettings();
    return tasksView();
  });
  ipcMain.handle('conn:sync-now', async () => { syncAll(); return tasksView(); });
}

// ---------- start ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openTasksWindow());
  app.whenReady().then(async () => {
    if (IS_MAC && app.dock) app.dock.hide();
    freshStartIfNeeded();
    loadSettings();
    loadPet();
    loadTasks();
    loadProfile();
    setupIpc();
    createWindow();
    createTray();
    startFeedServer();
    setInterval(minuteTick, 60 * 1000);
    setInterval(fastTick, 2000);
    setInterval(checkMusic, 8000);
    updateWeather();
    setInterval(updateWeather, 30 * 60 * 1000);
    setTimeout(() => checkUpdates(), 15 * 1000);
    setInterval(medicineTick, 10 * 1000);
    setInterval(() => checkUpdates(), 4 * 60 * 60 * 1000);
    refreshCalendar();
    setInterval(refreshCalendar, 15 * 60 * 1000);
    if (settings.githubTokenEnc) {
      try { githubUser = await GH.whoAmI(getGithubToken()); } catch { /* offline */ }
      refreshGithub();
    }
    setInterval(refreshGithub, 10 * 60 * 1000);
    checkRepos();
    setInterval(checkRepos, 10 * 60 * 1000);
    checkSystem();
    setInterval(checkSystem, 60 * 1000);
    // look around every 15 s — every 5 s while the Bytepet window is open, so closing an app shows up right away
    // look around every 5 s (every 10 s on battery), so opening or closing a distraction shows up right away
    setInterval(sample, 5 * 1000);
    setInterval(measureCpu, 60 * 1000);
    logLine(`Bytepet started (electron ${process.versions.electron}, packaged=${app.isPackaged})`);
    if (!settings.onboarded && !process.env.BYTEPET_OPEN_TASKS) {
      if (win && !win.isDestroyed()) win.hide(); // no egg until it has a name
      setTimeout(openSetupWindow, 600);
    }
    if (process.env.BYTEPET_SETUP) setTimeout(openSetupWindow, 600);
    setTimeout(sample, 3000);
    setTimeout(checkMessNow, 15 * 1000);
    // mess (Desktop, Downloads, tabs, Trash): every 30 s, every minute on battery
    let messTurn = 0;
    setInterval(() => { messTurn += 1; if (!onBatteryNow() || messTurn % 2 === 0) checkMessNow(); }, 30 * 1000);
    if (powerMonitor.on) powerMonitor.on('thermal-state-change', () => checkSystem());
    checkAchievements();
    setTimeout(() => { syncSource('reminders'); syncSource('todoist'); }, 5000);
    setInterval(() => syncSource('reminders'), 3 * 60 * 1000);
    setInterval(() => syncSource('todoist'), 5 * 60 * 1000);
    if (process.env.BYTEPET_FAKE_SAMPLE) { lastSample = { ...JSON.parse(process.env.BYTEPET_FAKE_SAMPLE), at: Date.now() }; browserStatus['Google Chrome'] = 'ok'; browserStatus.Safari = 'denied'; }
    if (process.env.BYTEPET_OPEN_TASKS) openTasksWindow(process.env.BYTEPET_OPEN_TASKS);
    if (process.env.BYTEPET_FOCUS) setTimeout(() => startFocus(Number(process.env.BYTEPET_FOCUS) || 25), 1500);
    if (process.env.BYTEPET_PET_JS) win.webContents.once('did-finish-load', () => setTimeout(() => win.webContents.executeJavaScript(process.env.BYTEPET_PET_JS).catch(() => {}), 2500));
    if (process.env.BYTEPET_SHOT_PET) setTimeout(async () => fs.writeFileSync(process.env.BYTEPET_SHOT_PET, (await win.webContents.capturePage()).toPNG()), Number(process.env.BYTEPET_SHOT_MS) || 7000);
    if (process.env.BYTEPET_GAME) setTimeout(() => openGame(process.env.BYTEPET_GAME), 1500);
    powerMonitor.on('lock-screen', onAway);
    powerMonitor.on('suspend', onAway);
    powerMonitor.on('unlock-screen', () => { updatesMaybeInstalled(); onBack(); setTimeout(sampleTrip, 20000); });
    powerMonitor.on('resume', () => { updatesMaybeInstalled(); P.catchUp(pet); onBack(); setTimeout(sampleTrip, 20000); });
    setInterval(sampleTrip, 60 * 60 * 1000);
    setTimeout(sampleTrip, 30000);
  });
  app.on('before-quit', () => { savePet(); saveTasks(); saveProfile(); });
  app.on('window-all-closed', () => { /* keep running in the menu bar */ });
}
