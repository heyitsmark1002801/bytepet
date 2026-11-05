#!/usr/bin/env node
// Bytepet MCP server.
//
// A tiny Model Context Protocol server (stdio, JSON-RPC 2.0) that lets an AI
// agent see how the pet is doing and reward real work. It is a thin client
// over Bytepet's local feed server (127.0.0.1:47777) — the same on-device
// endpoint git commits already use. No Electron, no dependencies, no network
// beyond localhost: if the app isn't running, every tool fails gracefully.
//
// Tools:
//   get_pet_status  — the pet's mood, stage, food, needs and open-task count
//   list_open_tasks — the open tasks (id, title, size, due) so the agent can pick one
//   complete_task   — mark a task done by id (feeds the pet, like finishing it in the app)

'use strict';

const http = require('http');

const HOST = process.env.BYTEPET_HOST || '127.0.0.1';
const PORT = Number(process.env.BYTEPET_PORT) || 47777;
const PROTOCOL_VERSION = '2024-11-05';

// ---------- feed-server client ----------

// GET a path on the local feed server and parse the JSON (or plain text) reply.
function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HOST, port: PORT, path: pathname, timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Bytepet replied ${res.statusCode}: ${body.trim() || 'error'}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { resolve(body.trim()); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Bytepet did not respond (is the app running?)')));
    req.on('error', (e) => reject(
      e.code === 'ECONNREFUSED'
        ? new Error('Could not reach Bytepet on 127.0.0.1:47777 — is the app running?')
        : e,
    ));
  });
}

// ---------- tools ----------

const TOOLS = [
  {
    name: 'get_pet_status',
    description: "Get Bytepet's current status: name, mood, life stage, food units, XP, "
      + 'discipline, care mistakes, what it needs right now, the number of open tasks, and any alerts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_open_tasks',
    description: 'List the pet owner\'s open tasks so you can pick one to complete. '
      + 'Returns each task\'s id, title, size (S/M/L), due timestamp and source.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'complete_task',
    description: 'Mark an open task done by its id, exactly as if the owner finished it in the app. '
      + 'This feeds the pet (S +1, M +2, L +3 food units) and grants XP. '
      + 'Use list_open_tasks first to get a valid id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task id from list_open_tasks.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args) {
  if (name === 'get_pet_status') {
    const s = await request('/status');
    return text(JSON.stringify(s, null, 2));
  }
  if (name === 'list_open_tasks') {
    const tasks = await request('/tasks');
    if (!Array.isArray(tasks) || tasks.length === 0) return text('No open tasks right now.');
    return text(JSON.stringify(tasks, null, 2));
  }
  if (name === 'complete_task') {
    const id = args && args.id;
    if (!id) throw new Error('complete_task needs an "id" (get one from list_open_tasks).');
    const r = await request(`/task/done?id=${encodeURIComponent(id)}`);
    if (r && r.ok) return text(`Done: "${r.title}" (size ${r.size}). Your pet ate!`);
    throw new Error((r && r.error) || 'Could not complete that task.');
  }
  throw new Error(`Unknown tool: ${name}`);
}

function text(s) {
  return { content: [{ type: 'text', text: s }] };
}

// ---------- JSON-RPC over stdio ----------

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  // Notifications (no id) need no response.
  if (method === 'notifications/initialized') return;

  if (method === 'initialize') {
    reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'bytepet', version: '1.0.0' },
    });
    return;
  }
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      reply(id, await callTool(name, args));
    } catch (e) {
      // Surface the failure to the model as tool content, not a transport error,
      // so it can tell the user "the app isn't running" rather than just breaking.
      reply(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
    }
    return;
  }
  if (id !== undefined && id !== null) replyError(id, -32601, `Method not found: ${method}`);
}

// Read newline-delimited JSON-RPC from stdin.
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).catch((e) => {
      if (msg && msg.id != null) replyError(msg.id, -32603, e.message);
    });
  }
});
process.stdin.on('end', () => process.exit(0));
