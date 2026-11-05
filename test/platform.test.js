// Tests for the platform layer: the picker (src/platform/index.js) and the
// neutral implementation. These run on any host OS (including the maintainer's
// Mac) because they use the explicit forPlatform() path and never touch the OS.
// Plain Node assert, no framework — same style as the rest of the suite.

const assert = require('assert');

const Platform = require('../src/platform');
const neutral = require('../src/platform/neutral');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  \u2713 ${name}`);
}

// The full contract every implementation must expose.
const CONTRACT = [
  'frontApp', 'runningApps', 'appInfo', 'activeTab', 'allTabs', 'browserTabs',
  'frontWindowTitle', 'hideApp', 'closeTabs', 'isRunning', 'battery', 'heat',
  'messCounts', 'pendingUpdates', 'musicPlaying', 'messFolderPath', 'updateUrl',
];

console.log('Platform picker');

test('exposes forPlatform and a default export for the current platform', () => {
  assert.strictEqual(typeof Platform.forPlatform, 'function');
  for (const fn of CONTRACT) assert.strictEqual(typeof Platform[fn], 'function', `default export missing ${fn}`);
});

test('forPlatform("darwin") returns an object exposing the whole contract', () => {
  const mac = Platform.forPlatform('darwin');
  for (const fn of CONTRACT) assert.strictEqual(typeof mac[fn], 'function', `mac missing ${fn}`);
});

test('forPlatform("win32") returns an object exposing the whole contract', () => {
  const win = Platform.forPlatform('win32');
  for (const fn of CONTRACT) assert.strictEqual(typeof win[fn], 'function', `win missing ${fn}`);
});

test('forPlatform(unknown) returns the neutral implementation', () => {
  assert.strictEqual(Platform.forPlatform('sunos'), neutral);
  assert.strictEqual(Platform.forPlatform('freebsd'), neutral);
});

console.log('Neutral implementation');

test('every contract function exists on the neutral impl', () => {
  for (const fn of CONTRACT) assert.strictEqual(typeof neutral[fn], 'function', `neutral missing ${fn}`);
});

test('neutral reads return harmless values that cannot hurt the pet', async () => {
  assert.deepStrictEqual(await neutral.frontApp(), { name: null, bundlePath: null, category: null, self: false });
  assert.deepStrictEqual(await neutral.runningApps(), []);
  assert.deepStrictEqual(await neutral.appInfo('whatever'), { category: null, agent: false });
  assert.strictEqual(await neutral.activeTab('Safari'), null);
  assert.strictEqual(await neutral.allTabs('Safari', 'safari'), null);
  assert.deepStrictEqual(await neutral.browserTabs(), []);
  assert.strictEqual(await neutral.frontWindowTitle(), null);
  assert.strictEqual(await neutral.hideApp('x'), false);
  assert.deepStrictEqual(await neutral.closeTabs(), []);
  assert.strictEqual(await neutral.isRunning('x'), false);
  assert.strictEqual(await neutral.battery(), null);
  assert.deepStrictEqual(await neutral.messCounts({}), []);
  assert.deepStrictEqual(await neutral.pendingUpdates({}), []); // zero, not null
  assert.strictEqual(await neutral.musicPlaying([]), false);
});

test('neutral heat never throws and reports not hot without a powerMonitor', () => {
  const h = neutral.heat(null);
  assert.strictEqual(h.thermal, 'unknown');
  assert.strictEqual(typeof h.load, 'number');
  assert.strictEqual(h.hot, false);
});

test('neutral openers return nothing to open', () => {
  assert.strictEqual(neutral.messFolderPath('desktop'), null);
  assert.strictEqual(neutral.updateUrl(), null);
  assert.deepStrictEqual(neutral.permissionPanes, {});
});

// ---------- Windows pure parsers (run on any OS; no PowerShell invoked) ----------
const win = require('../src/platform/win');

console.log('Windows: name normalisation');

test('known process names map to the friendly names the lists use', () => {
  assert.strictEqual(win.normalizeName('chrome.exe'), 'Google Chrome');
  assert.strictEqual(win.normalizeName('msedge'), 'Microsoft Edge');
  assert.strictEqual(win.normalizeName('Code.exe'), 'Visual Studio Code');
  assert.strictEqual(win.normalizeName('Spotify'), 'Spotify');
});

test('unknown names pass through without the .exe suffix', () => {
  assert.strictEqual(win.normalizeName('Blender.exe'), 'Blender');
  assert.strictEqual(win.normalizeName('MyApp'), 'MyApp');
  assert.strictEqual(win.normalizeName(null), null);
});

console.log('Windows: snapshot parsing');

const SNAP = JSON.stringify({
  front: { pid: 10, title: 'YouTube - Google Chrome', name: 'chrome', path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\chrome.exe' },
  apps: [
    { pid: 10, name: 'chrome', path: 'C:\\\\chrome.exe', title: 'YouTube - Google Chrome' },
    { pid: 11, name: 'Code', path: 'C:\\\\Code.exe', title: 'main.js' },
    { pid: 12, name: 'explorer', path: 'C:\\\\explorer.exe', title: '' },
    { pid: 10, name: 'chrome', path: 'C:\\\\chrome.exe', title: 'dup' }, // duplicate path
  ],
});

test('parseSnapshot returns { front, apps } with normalised names and de-duped apps', () => {
  const s = win.parseSnapshot(SNAP);
  assert.strictEqual(s.front.name, 'Google Chrome');
  assert.strictEqual(s.front.title, 'YouTube - Google Chrome');
  assert.deepStrictEqual(s.apps.map((a) => a.name), ['Google Chrome', 'Visual Studio Code', 'explorer']);
});

test('parseSnapshot returns the neutral snapshot on empty/garbage', () => {
  assert.deepStrictEqual(win.parseSnapshot(''), { front: null, apps: [] });
  assert.deepStrictEqual(win.parseSnapshot('not json'), { front: null, apps: [] });
  assert.deepStrictEqual(win.parseSnapshot(JSON.stringify({ front: null, apps: [] })), { front: null, apps: [] });
});

test('frontFromSnapshot shapes the contract result and sets self for Bytepet', () => {
  const s = win.parseSnapshot(SNAP);
  const f = win.frontFromSnapshot(s, 'C:\\\\other.exe');
  assert.deepStrictEqual(f, { name: 'Google Chrome', bundlePath: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\chrome.exe', category: null, self: false });
  // when the foreground exe is Bytepet's own path, self is true
  const own = win.frontFromSnapshot({ front: { name: 'Bytepet', path: 'C:\\\\app\\\\bytepet.exe', title: '' } }, 'C:\\\\app\\\\bytepet.exe');
  assert.strictEqual(own.self, true);
  assert.deepStrictEqual(win.frontFromSnapshot({ front: null }, 'x'), { name: null, bundlePath: null, category: null, self: false });
});

test('runningFromSnapshot shapes [{name,bundlePath,policy:0}]', () => {
  const s = win.parseSnapshot(SNAP);
  const r = win.runningFromSnapshot(s);
  assert.deepStrictEqual(r[0], { name: 'Google Chrome', bundlePath: 'C:\\\\chrome.exe', policy: 0 });
  assert.deepStrictEqual(win.runningFromSnapshot({ apps: [] }), []);
});

test('browserTitlesFromSnapshot returns browser windows only, with site: null', () => {
  const s = win.parseSnapshot(SNAP);
  const tabs = win.browserTitlesFromSnapshot(s);
  assert.deepStrictEqual(tabs, [{ browser: 'Google Chrome', site: null, title: 'YouTube - Google Chrome' }]);
});

console.log('Windows: updates / recycle / music parsers');

test('parseUpdates handles JSON arrays, lines, and empty/garbage (never null)', () => {
  assert.deepStrictEqual(win.parseUpdates('["2024-01 Cumulative Update","Defender"]'), ['2024-01 Cumulative Update', 'Defender']);
  assert.deepStrictEqual(win.parseUpdates('A\r\nB\r\n'), ['A', 'B']);
  assert.deepStrictEqual(win.parseUpdates('[]'), []);
  assert.deepStrictEqual(win.parseUpdates(''), []);
  assert.deepStrictEqual(win.parseUpdates(null), []);
});

test('parseRecycleCount returns a number or null', () => {
  assert.strictEqual(win.parseRecycleCount('42\r\n'), 42);
  assert.strictEqual(win.parseRecycleCount(''), null);
  assert.strictEqual(win.parseRecycleCount('nope'), null);
});

test('parseMusicPlaying is true only when something is Playing', () => {
  assert.strictEqual(win.parseMusicPlaying('Playing'), true);
  assert.strictEqual(win.parseMusicPlaying('Paused'), false);
  assert.strictEqual(win.parseMusicPlaying('none'), false);
  assert.strictEqual(win.parseMusicPlaying(''), false);
});

console.log('Windows: reply framing');

test('extractReply returns the JSON block once the sentinel + matching id arrives', () => {
  const sentinel = '<<<BYTEPET_END>>>#';
  const r = win.extractReply(`{"a":1}${sentinel}7\n`, 7);
  assert.strictEqual(r.done, true);
  assert.strictEqual(r.json, '{"a":1}');
});

test('extractReply waits (done:false) until the full reply has arrived', () => {
  const partial = win.extractReply('{"a":1}', 7);
  assert.strictEqual(partial.done, false);
  const noIdLine = win.extractReply('{"a":1}<<<BYTEPET_END>>>#', 7);
  assert.strictEqual(noIdLine.done, false);
});

test('extractReply drops a stale reply whose id does not match', () => {
  const sentinel = '<<<BYTEPET_END>>>#';
  // a reply for id 6 followed by the real reply for id 7 in the same buffer
  const buf = `{"old":1}${sentinel}6\n{"new":2}${sentinel}7\n`;
  const r = win.extractReply(buf, 7);
  assert.strictEqual(r.done, true);
  assert.strictEqual(r.json, '{"new":2}');
});

console.log(`${passed} tests passed`);
