// Pure security guard for the local feed server (127.0.0.1:47777).
//
// The feed server is only ever meant to be called by local tools: git's
// post-commit hook (curl), the MCP server (mcp/server.js) and Bytepet itself.
// Those callers never send an Origin header. A web page, on the other hand,
// cannot reach a 127.0.0.1 server without the browser attaching an Origin
// header on the (pre-flighted or simple) cross-origin request. So we reject
// any request that carries an Origin header outright — that shuts the door on
// a malicious site trying to feed or drain the pet, or read task titles, via
// the loopback server.
//
// We also lock down state-mutating routes to a safe method:
//   • /task/done completes a task (mutates state) → POST only.
//     (GET is prefetchable and shows up in <img>/<link> style attacks, so a
//      mutating route must not answer GET.)
//   • /feed stays GET so the existing installed git post-commit hook (a plain
//     `curl .../feed`) keeps working; the Origin check already protects it
//     from the browser.
//
// This module is pure (no Electron, no http) so it can be unit-tested. It takes
// the few request fields it needs and returns a decision.

// Routes that only accept POST (state-mutating).
const POST_ONLY = new Set(['/task/done']);

// Decide whether a request may proceed.
//   req: { method, pathname, hasOrigin }  (hasOrigin = an Origin header is present)
// Returns { ok: true } to proceed, or
//          { ok: false, status, body } to reject with that HTTP status/body.
function guard(req) {
  const method = (req.method || 'GET').toUpperCase();
  const pathname = req.pathname || '/';

  // 1. Reject anything with an Origin header — only a browser sends one, and
  //    the feed server is for local tools, never web pages.
  if (req.hasOrigin) {
    return { ok: false, status: 403, body: 'forbidden\n' };
  }

  // 2. State-mutating routes accept POST only.
  if (POST_ONLY.has(pathname) && method !== 'POST') {
    return { ok: false, status: 405, body: 'method not allowed\n' };
  }

  return { ok: true };
}

module.exports = { guard, POST_ONLY };
