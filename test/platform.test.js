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

console.log(`${passed} tests passed`);
