// Prints a pet sprite as JSON (used by make-icon.py). node scripts/sprite-dump.js
global.window = {};
require('../renderer/sprites.js');
const S = window.Sprites;
const map = S.build({ kind: 'creature', stage: 'child', eyes: 'happy', mouth: 'open' });
console.log(JSON.stringify({ grid: S.GRID, palette: S.PALETTES.lcd, px: [...map] }));
