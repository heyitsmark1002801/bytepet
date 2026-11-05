// Compatibility shim. The Mac system reads moved into the platform layer
// (src/platform/mac.js) when Windows support was added. This re-export keeps
// `require('./system')` and the existing parser tests working unchanged.
//
// New code should require('./platform') (the picker) instead.
module.exports = require('./platform/mac');
