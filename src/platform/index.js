// Platform picker: choose the OS-specific implementation of the platform
// contract from process.platform, and expose it. All of main.js's system reads
// go through this one module, so Mac and Windows behaviour live in separate,
// testable files (mac.js / win.js) with no scattered platform checks.

function pick(platform = process.platform) {
  if (platform === 'darwin') return require('./mac');
  if (platform === 'win32') return require('./win');
  return require('./neutral');
}

// Default export: the implementation for the current platform.
module.exports = pick();

// Testable factory: forPlatform('win32') / forPlatform('darwin') / forPlatform('linux')
// lets tests exercise the selection paths on any host OS.
module.exports.forPlatform = pick;
