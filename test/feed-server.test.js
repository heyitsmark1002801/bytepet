// Run with: npm test  (or: node test/feed-server.test.js)
//
// The local feed server (127.0.0.1:47777) is how git commits and the MCP server
// feed the pet. It must not be reachable from a web page and must not let a
// mutating route be triggered by a prefetchable GET. main.js requires 'electron'
// so it can't be loaded in plain Node; these tests cover:
//   1. The pure guard (src/feed-guard.js) directly — Origin rejection and the
//      POST-only rule for /task/done.
//   2. An end-to-end http server that applies the real guard, to prove the wire
//      behavior (403 on Origin, 405 on wrong method, 127.0.0.1-only bind).
//   3. Source checks that main.js actually wires the guard in and binds the
//      listener to 127.0.0.1.

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { guard, POST_ONLY } = require('../src/feed-guard');

let passed = 0;
const queue = [];
function test(name, fn) {
  queue.push({ name, fn });
}

console.log('Feed server');

// --- 1. Pure guard --------------------------------------------------------

test('a request with no Origin on a read route is allowed', () => {
  for (const pathname of ['/feed', '/status', '/tasks']) {
    const g = guard({ method: 'GET', pathname, hasOrigin: false });
    assert.equal(g.ok, true, `${pathname} should pass without an Origin header`);
  }
});

test('any request carrying an Origin header is rejected with 403', () => {
  for (const pathname of ['/feed', '/status', '/tasks', '/task/done']) {
    for (const method of ['GET', 'POST']) {
      const g = guard({ method, pathname, hasOrigin: true });
      assert.equal(g.ok, false, `${method} ${pathname} with Origin must be rejected`);
      assert.equal(g.status, 403, 'Origin rejection is a 403');
    }
  }
});

test('/task/done is POST-only: GET/PUT/DELETE are 405, POST passes', () => {
  assert.ok(POST_ONLY.has('/task/done'), '/task/done is a POST-only route');
  for (const method of ['GET', 'PUT', 'DELETE', 'HEAD', 'PATCH']) {
    const g = guard({ method, pathname: '/task/done', hasOrigin: false });
    assert.equal(g.ok, false, `${method} /task/done must be rejected`);
    assert.equal(g.status, 405, 'wrong method on /task/done is a 405');
  }
  const ok = guard({ method: 'POST', pathname: '/task/done', hasOrigin: false });
  assert.equal(ok.ok, true, 'POST /task/done passes the guard');
});

test('read routes still accept GET (the git hook and status calls)', () => {
  for (const pathname of ['/feed', '/status', '/tasks']) {
    const g = guard({ method: 'GET', pathname, hasOrigin: false });
    assert.equal(g.ok, true, `GET ${pathname} must be allowed`);
  }
});

test('method defaults to GET when missing', () => {
  // A GET on /task/done (the default) must be rejected as not-POST.
  const g = guard({ pathname: '/task/done', hasOrigin: false });
  assert.equal(g.ok, false);
  assert.equal(g.status, 405);
});

// --- 2. End-to-end server that applies the real guard ---------------------
// A minimal stand-in for startFeedServer() that uses the exact same guard, so
// we test the actual wire behavior (status codes, 127.0.0.1-only binding)
// without pulling in Electron.

function makeServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const g = guard({ method: req.method, pathname: u.pathname, hasOrigin: req.headers.origin != null });
    if (!g.ok) { res.statusCode = g.status; return res.end(g.body); }
    if (u.pathname === '/task/done') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, id: u.searchParams.get('id'), title: 'x', size: 'M' }));
    }
    if (u.pathname === '/status') { res.setHeader('Content-Type', 'application/json'); return res.end('{"name":"Byte"}'); }
    res.statusCode = 404; res.end('not found\n');
  });
}

function call(server, { method = 'GET', path: p = '/', origin } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const headers = origin ? { Origin: origin } : {};
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('end-to-end: server binds to 127.0.0.1 only and applies the guard', async () => {
  const server = makeServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    // Bound to loopback only.
    assert.equal(server.address().address, '127.0.0.1', 'listens on 127.0.0.1');

    // A browser-origin request is rejected with 403 on every route.
    const web = await call(server, { method: 'GET', path: '/status', origin: 'https://evil.example' });
    assert.equal(web.status, 403, 'a request with an Origin header is rejected');

    // A local status read (no Origin) works.
    const ok = await call(server, { method: 'GET', path: '/status' });
    assert.equal(ok.status, 200, 'local status read works');

    // GET on the mutating route is 405.
    const getDone = await call(server, { method: 'GET', path: '/task/done?id=1' });
    assert.equal(getDone.status, 405, 'GET /task/done is method-not-allowed');

    // POST on the mutating route (no Origin) succeeds.
    const postDone = await call(server, { method: 'POST', path: '/task/done?id=1' });
    assert.equal(postDone.status, 200, 'POST /task/done is accepted');
    assert.ok(/"ok":true/.test(postDone.body), 'completes the task');

    // POST with an Origin header is still rejected (403 beats the route).
    const postWeb = await call(server, { method: 'POST', path: '/task/done?id=1', origin: 'https://evil.example' });
    assert.equal(postWeb.status, 403, 'POST with Origin is rejected before reaching the route');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// --- 3. Source wiring in main.js and mcp/server.js ------------------------

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const mcpSrc = fs.readFileSync(path.join(__dirname, '..', 'mcp', 'server.js'), 'utf8');

test('main.js wires the feed guard into the server handler', () => {
  assert.ok(/feed-guard/.test(mainSrc), 'main.js imports src/feed-guard');
  assert.ok(/feedGuard\(\{[^}]*hasOrigin[^}]*\}\)/.test(mainSrc), 'main.js calls the guard with hasOrigin');
});

test('main.js binds the feed server to 127.0.0.1', () => {
  assert.ok(/server\.listen\(\s*FEED_PORT\s*,\s*'127\.0\.0\.1'\s*\)/.test(mainSrc), 'listens on 127.0.0.1 only');
});

test('the MCP server completes tasks with POST', () => {
  assert.ok(/\/task\/done[\s\S]*?,\s*'POST'\s*\)/.test(mcpSrc), 'complete_task uses POST');
});

(async () => {
  for (const { name, fn } of queue) {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\n${passed} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
