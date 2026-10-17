import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createServer } from '../mcp/server.mjs';
import { cleanState } from '../api/_lib/validate.js';

const temp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bs-mcp-')), 'plan.json');
let seq = 0;
const rpc = (server, method, params) => server.handle({ jsonrpc: '2.0', id: ++seq, method, params });
const call = async (server, name, args = {}) => {
  const response = await rpc(server, 'tools/call', { name, arguments: args });
  const { content, isError } = response.result;
  return { isError: !!isError, text: content[0].text, value: isError ? null : JSON.parse(content[0].text) };
};

test('the server introduces itself with the rules of the house and lists its tools', async () => {
  const server = createServer({ planFile: temp() });
  const init = await rpc(server, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test' } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'blueprint-sketch');
  assert.match(init.result.instructions, /axis-aligned/);
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = (await rpc(server, 'tools/list')).result.tools;
  assert.ok(list.length > 30);
  assert.ok(list.every(t => t.name && t.description && t.inputSchema.type === 'object'));
  for (const wanted of ['add_room', 'place_against_wall', 'check_plan', 'apply_template', 'share_plan', 'undo_last_change']) assert.ok(list.some(t => t.name === wanted), wanted);
  assert.equal((await rpc(server, 'nope')).error.code, -32601);
  assert.deepEqual((await rpc(server, 'ping')).result, {});
});

test('what an agent builds is saved to a file the editor can import and the server accepts', async () => {
  const file = temp(), server = createServer({ planFile: file });
  await call(server, 'set_plan_name', { name: 'Casa del agente' });
  await call(server, 'add_room', { x0: 0, z0: 0, x1: 5, z1: 4, name: 'Sala' });
  await call(server, 'add_door', { x: 2, z: 4 });
  await call(server, 'place_against_wall', { type: 'sofa', wall_side: 'north', wall_position: 0, along: 2.5 });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.app, 'blueprint-sketch');
  assert.equal(saved.name, 'Casa del agente');
  assert.equal(saved.state.items.length, 1);
  assert.doesNotThrow(() => cleanState(saved.state));
  const reopened = createServer({ planFile: file });
  assert.equal(reopened.state.items.length, 1);
  assert.equal(reopened.name, 'Casa del agente');
  const check = await call(reopened, 'check_plan');
  assert.equal(check.value.ok, true);
});

test('reading changes nothing, and a refused tool leaves the plan as it was', async () => {
  const file = temp(), server = createServer({ planFile: file });
  await call(server, 'get_plan');
  assert.equal(fs.existsSync(file), false);
  const refused = await call(server, 'add_item', { type: 'cama140', x: 1, z: 1 });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /not on any floor/);
  assert.equal(fs.existsSync(file), false);
});

test('undo takes back the last change', async () => {
  const server = createServer({ planFile: temp() });
  await call(server, 'add_room', { x0: 0, z0: 0, x1: 4, z1: 4 });
  await call(server, 'add_room', { x0: 4, z0: 0, x1: 8, z1: 4 });
  assert.equal(server.state.layout.floors.length, 2);
  await call(server, 'undo_last_change');
  assert.equal(server.state.layout.floors.length, 1);
  await call(server, 'undo_last_change');
  assert.equal(server.state.layout.floors.length, 0);
  assert.match((await call(server, 'undo_last_change')).text, /nothing to undo/);
});

test('a plan is not thrown away without being asked twice', async () => {
  const server = createServer({ planFile: temp() });
  await call(server, 'apply_template', { key: 'studio' });
  assert.match((await call(server, 'new_plan')).text, /confirm/);
  assert.equal((await call(server, 'new_plan', { confirm: true, name: 'Otro' })).isError, false);
  assert.equal(server.state.layout.floors.length, 0);
  assert.equal(server.name, 'Otro');
});

test('a read-only server looks but does not touch', async () => {
  const file = temp();
  await call(createServer({ planFile: file }), 'add_room', { x0: 0, z0: 0, x1: 4, z1: 4 });
  const server = createServer({ planFile: file, readOnly: true });
  assert.equal((await call(server, 'get_plan')).isError, false);
  const refused = await call(server, 'add_wall', { x1: 0, z1: 0, x2: 2, z2: 0 });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /read-only/);
});

test('sharing talks to the plans API with the right requests', async () => {
  const sent = [];
  const fetchImpl = async (url, init = {}) => {
    sent.push({ url, method: init.method || 'GET', auth: init.headers && init.headers.authorization, body: init.body && JSON.parse(init.body) });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (init.method === 'POST') return json(201, { id: 'abc123', token: 'secrettoken', version: 1 });
    if (init.method === 'PUT') return json(200, { version: 2 });
    return json(200, { state: { ...createServer({ planFile: temp() }).state, items: [] }, version: 3, name: 'Nube' });
  };
  const server = createServer({ planFile: temp(), baseUrl: 'https://example.test', fetchImpl });
  await call(server, 'add_room', { x0: 0, z0: 0, x1: 4, z1: 4 });
  assert.match((await call(server, 'push_plan')).text, /share_plan/);
  const shared = await call(server, 'share_plan');
  assert.equal(shared.value.ownerLink, 'https://example.test/p/abc123#k=secrettoken');
  assert.equal(sent[0].url, 'https://example.test/api/plans');
  assert.equal(sent[0].body.state.layout.floors.length, 1);
  assert.match((await call(server, 'share_plan')).text, /already shared/);
  assert.equal((await call(server, 'push_plan')).value.version, 2);
  assert.equal(sent[1].method, 'PUT');
  assert.equal(sent[1].auth, 'Bearer secrettoken');
  assert.equal(sent[1].body.baseVersion, 1);
  assert.equal((await call(server, 'pull_plan')).value.version, 3);
  assert.equal(server.name, 'Nube');
});

test('over stdio it speaks line-delimited JSON-RPC', async () => {
  const file = temp(), child = spawn(process.execPath, [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))], { env: { ...process.env, BLUEPRINT_PLAN: file }, stdio: ['pipe', 'pipe', 'pipe'] });
  const answers = [];
  let buffer = '';
  child.stdout.on('data', chunk => { buffer += chunk; let i; while ((i = buffer.indexOf('\n')) >= 0) { answers.push(JSON.parse(buffer.slice(0, i))); buffer = buffer.slice(i + 1); } });
  const send = message => child.stdin.write(JSON.stringify(message) + '\n');
  const waitFor = async count => { for (let t = 0; t < 100 && answers.length < count; t++) await new Promise(r => setTimeout(r, 50)); };
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_room', arguments: { x0: 0, z0: 0, x1: 3, z1: 3 } } });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  await waitFor(3);
  child.stdin.end();
  assert.equal(answers.length, 3);
  assert.equal(answers[0].result.protocolVersion, '2024-11-05');
  assert.equal(JSON.parse(answers[1].result.content[0].text).walls.length, 4);
  assert.ok(answers[2].result.tools.length > 30);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).state.layout.floors.length, 1);
});
