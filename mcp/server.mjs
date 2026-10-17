#!/usr/bin/env node
/* MCP server for Blueprint Sketch: lets an AI agent (Claude Desktop, Claude Code, Cursor, anything that speaks MCP over stdio)
   build a plan with the same tools and rules as the editor. The plan lives in a JSON file the editor can import,
   and can be shared to the cloud so it opens at a link.

     BLUEPRINT_PLAN   path of the plan file (default ./blueprint-plan.json)
     BLUEPRINT_URL    where shared plans live (default https://blueprint-sketch.vercel.app)
     BLUEPRINT_READONLY=1  look but do not touch */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Agent, Levels, Layout } from './modules.mjs';
import { cleanState, isInvalid } from '../api/_lib/validate.js';

const VERSION = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version;
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const HISTORY = 30;
const DEFAULT_URL = 'https://blueprint-sketch.vercel.app';

const textResult = (value, isError = false) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }], ...(isError ? { isError: true } : {}) });
const clone = value => JSON.parse(JSON.stringify(value));

export function createServer({ planFile, baseUrl = DEFAULT_URL, readOnly = false, fetchImpl = globalThis.fetch } = {}) {
  const shareFile = planFile.replace(/\.json$/, '') + '.share.json';
  let name = 'Plano del agente';
  let state = Agent.blank();
  const undo = [];

  const wrap = () => ({ app: 'blueprint-sketch', version: 2, name, state });
  function load() {
    if (!fs.existsSync(planFile)) return;
    const parsed = JSON.parse(fs.readFileSync(planFile, 'utf8')), saved = parsed.state || parsed;
    cleanState(clone(saved));
    state = Levels.ensure(saved);
    if (parsed.name) name = String(parsed.name).slice(0, 40);
  }
  function save() {
    fs.mkdirSync(path.dirname(path.resolve(planFile)), { recursive: true });
    const temp = planFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(wrap(), null, 1));
    fs.renameSync(temp, planFile);
  }
  const share = () => (fs.existsSync(shareFile) ? JSON.parse(fs.readFileSync(shareFile, 'utf8')) : null);

  /* ---- tools of this server, on top of the shared ones ---- */
  const extra = [];
  const own = (toolName, description, properties, required, mutates, run) => extra.push({ name: toolName, description, parameters: { type: 'object', properties, required }, mutates, run });

  own('new_plan', 'Start an empty plan, discarding the current one. Ask the person first and pass confirm.', { name: { type: 'string', description: 'plan name' }, confirm: { type: 'boolean', description: 'true to discard the current plan' } }, [], true, args => {
    const empty = Levels.list(state).every(l => Layout.isEmpty(l.layout) && !l.items.length);
    if (!empty && args.confirm !== true) throw new Error('the plan is not empty; ask the person and pass confirm: true');
    state = Agent.blank();
    if (args.name) name = String(args.name).slice(0, 40);
    return { name };
  });
  own('set_plan_name', 'Name the plan; the name is used when it is exported or shared.', { name: { type: 'string' } }, ['name'], true, args => {
    name = String(args.name || '').trim().slice(0, 40) || name;
    return { name };
  });
  own('plan_file', 'Where the plan is saved, and how to open it in the editor.', {}, [], false, () => ({
    file: path.resolve(planFile), howToOpen: `In the editor open the Planos tab, choose Importar, and pick this file. Or call share_plan to get a link.`
  }));
  own('undo_last_change', 'Undo the last change an agent made to the plan.', {}, [], true, () => {
    const before = undo.pop();
    if (!before) throw new Error('nothing to undo');
    state = Levels.ensure(before);
    return { undone: true, remaining: undo.length };
  });
  own('share_plan', 'Upload the plan to the cloud so it opens at a link in any browser. Returns an owner link (full control): treat it as a secret and give it to the person.', {}, [], false, async () => {
    if (share()) throw new Error('already shared; call push_plan to update it');
    const response = await fetchImpl(`${baseUrl}/api/plans`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, state }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`the server answered ${response.status}: ${body.error || 'could not share'}`);
    fs.writeFileSync(shareFile, JSON.stringify({ id: body.id, token: body.token, version: body.version || 1 }));
    return { ownerLink: `${baseUrl}/p/${body.id}#k=${body.token}`, note: 'Anyone with this link can edit and delete the plan.' };
  });
  own('push_plan', 'Send the current plan to its shared copy, so the link shows the latest changes.', {}, [], false, async () => {
    const info = share();
    if (!info) throw new Error('not shared yet; call share_plan first');
    const response = await fetchImpl(`${baseUrl}/api/plans/${info.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${info.token}` }, body: JSON.stringify({ state, baseVersion: info.version, name }) });
    const body = await response.json().catch(() => ({}));
    if (response.status === 409) throw new Error('someone changed the shared plan meanwhile; call pull_plan to get their changes first');
    if (!response.ok) throw new Error(`the server answered ${response.status}: ${body.error || 'could not push'}`);
    fs.writeFileSync(shareFile, JSON.stringify({ ...info, version: body.version }));
    return { pushed: true, version: body.version };
  });
  own('pull_plan', 'Replace the local plan with the latest shared version, including what other people changed.', {}, [], true, async () => {
    const info = share();
    if (!info) throw new Error('not shared yet; call share_plan first');
    const response = await fetchImpl(`${baseUrl}/api/plans/${info.id}`, { headers: { authorization: `Bearer ${info.token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`the server answered ${response.status}: ${body.error || 'could not pull'}`);
    state = Levels.ensure(body.state);
    if (body.name) name = String(body.name).slice(0, 40);
    fs.writeFileSync(shareFile, JSON.stringify({ ...info, version: body.version }));
    return { pulled: true, version: body.version };
  });

  const ownByName = new Map(extra.map(t => [t.name, t]));
  const listing = () => [...Agent.definitions().map(d => ({ ...d, mutates: Agent.mutates(d.name) })), ...extra.map(({ name: n, description, parameters, mutates }) => ({ name: n, description, parameters, mutates }))];

  async function callTool(toolName, args = {}) {
    const mutates = ownByName.has(toolName) ? ownByName.get(toolName).mutates : Agent.mutates(toolName);
    if (readOnly && mutates) return textResult('the server is read-only (BLUEPRINT_READONLY)', true);
    const before = mutates ? clone(state) : null;
    try {
      let result;
      if (ownByName.has(toolName)) result = await ownByName.get(toolName).run(args);
      else {
        const env = { state };
        const answer = Agent.call(env, toolName, args);
        state = env.state;
        if (!answer.ok) return textResult(answer.error, true);
        result = answer.result;
      }
      if (mutates) {
        try { cleanState(clone(state)); }
        catch (e) {
          state = Levels.ensure(before);
          return textResult(`that would leave the plan invalid (${isInvalid(e) ? e.message : 'unexpected'}); nothing changed`, true);
        }
        if (toolName !== 'undo_last_change') {
          undo.push(before);
          if (undo.length > HISTORY) undo.shift();
        }
        save();
      }
      return textResult(result);
    } catch (e) {
      if (before) state = Levels.ensure(before);
      return textResult(e.message || String(e), true);
    }
  }

  /* ---- JSON-RPC ---- */
  async function handle(message) {
    const { id, method, params = {} } = message;
    const reply = result => ({ jsonrpc: '2.0', id, result });
    const refuse = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } });
    if (id === undefined) return null;
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'blueprint-sketch', version: VERSION },
          instructions: Agent.GUIDE
        });
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: listing().map(({ name: n, description, parameters }) => ({ name: n, description, inputSchema: parameters })) });
      case 'tools/call': return reply(await callTool(params.name, params.arguments));
      case 'resources/list': return reply({ resources: [{ uri: 'blueprint://guide', name: 'How to build here', mimeType: 'text/plain' }, { uri: 'blueprint://plan', name: 'The current plan (JSON)', mimeType: 'application/json' }] });
      case 'resources/read':
        if (params.uri === 'blueprint://guide') return reply({ contents: [{ uri: params.uri, mimeType: 'text/plain', text: Agent.GUIDE }] });
        if (params.uri === 'blueprint://plan') return reply({ contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(wrap()) }] });
        return refuse(-32002, 'unknown resource');
      default: return refuse(-32601, `method not found: ${method}`);
    }
  }

  load();
  return { handle, callTool, get state() { return state; }, get name() { return name; } };
}

/* ---- stdio ---- */
function main() {
  const argIndex = process.argv.indexOf('--plan');
  const planFile = process.env.BLUEPRINT_PLAN || (argIndex > 0 ? process.argv[argIndex + 1] : './blueprint-plan.json');
  let server;
  try {
    server = createServer({ planFile, baseUrl: (process.env.BLUEPRINT_URL || DEFAULT_URL).replace(/\/$/, ''), readOnly: process.env.BLUEPRINT_READONLY === '1' });
  } catch (e) {
    process.stderr.write(`blueprint-sketch: cannot read ${planFile}: ${e.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`blueprint-sketch MCP ready · plan: ${path.resolve(planFile)}\n`);
  const lines = readline.createInterface({ input: process.stdin });
  let queue = Promise.resolve();
  lines.on('line', line => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let message;
      try { message = JSON.parse(line); }
      catch (e) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n'); return; }
      const out = await server.handle(message).catch(e => ({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: e.message } }));
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main();
