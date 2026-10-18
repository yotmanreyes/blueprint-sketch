import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const AiClient = new Function('module', src('ai-client.js') + ';return AiClient')();

const tools = [{ name: 'add_room', description: 'Add a room', parameters: { type: 'object', properties: { x0: { type: 'number', description: 'west' }, name: { type: 'string' } }, required: ['x0'] } },
  { name: 'get_plan', description: 'Read the plan', parameters: { type: 'object', properties: {}, required: [] } }];

// a fetch that answers with the next canned response and remembers what it was asked
const scripted = answers => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = answers.shift();
    return { ok: next.status === undefined || next.status < 400, status: next.status || 200, json: async () => next.body };
  };
  return { fetchImpl, seen };
};
const execute = calls => async (name, args) => { calls.push([name, args]); return name === 'add_room' ? { ok: true, result: { floor: 'f1' } } : { ok: false, error: 'nothing here' }; };
const base = { system: 'be careful', tools, model: 'm', apiKey: 'KEY' };

test('OpenAI: sends the key and the tools, runs the calls and returns the final answer', async () => {
  const { fetchImpl, seen } = scripted([
    { body: { choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', function: { name: 'add_room', arguments: '{"x0":1,"name":"Sala"}' } }] } }] } },
    { body: { choices: [{ message: { content: 'Listo, dibujé la sala.' } }] } }
  ]);
  const transcript = [{ role: 'user', text: 'haz una sala' }], calls = [], events = [];
  const result = await AiClient.run({ ...base, provider: 'openai', transcript, execute: execute(calls), onEvent: e => events.push(e), fetchImpl });
  assert.equal(result.stopped, 'done');
  assert.equal(result.steps, 2);
  assert.deepEqual(calls, [['add_room', { x0: 1, name: 'Sala' }]]);
  assert.equal(seen[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(seen[0].headers.authorization, 'Bearer KEY');
  assert.equal(seen[0].body.messages[0].role, 'system');
  assert.equal(seen[0].body.tools[0].function.name, 'add_room');
  const second = seen[1].body.messages;
  assert.equal(second.at(-2).tool_calls[0].function.arguments, '{"x0":1,"name":"Sala"}');
  assert.deepEqual(second.at(-1), { role: 'tool', tool_call_id: 'call_1', content: '{"floor":"f1"}' });
  assert.deepEqual(events.map(e => e.type), ['call', 'result', 'text']);
  assert.equal(transcript.at(-1).text, 'Listo, dibujé la sala.');
});

test('Anthropic: uses the browser-access header, tool_use blocks and tool_result replies', async () => {
  const { fetchImpl, seen } = scripted([
    { body: { content: [{ type: 'text', text: 'Voy a dibujarla.' }, { type: 'tool_use', id: 'tu_1', name: 'get_plan', input: {} }] } },
    { body: { content: [{ type: 'text', text: 'Veo un plano vacío.' }] } }
  ]);
  const transcript = [{ role: 'user', text: 'qué hay?' }];
  await AiClient.run({ ...base, provider: 'anthropic', transcript, execute: execute([]), fetchImpl });
  assert.equal(seen[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen[0].headers['x-api-key'], 'KEY');
  assert.equal(seen[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(seen[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(seen[0].body.system, 'be careful');
  assert.equal(seen[0].body.tools[0].input_schema.type, 'object');
  const reply = seen[1].body.messages.at(-1);
  assert.equal(reply.role, 'user');
  assert.deepEqual(reply.content[0], { type: 'tool_result', tool_use_id: 'tu_1', content: '{"error":"nothing here"}', is_error: true });
  assert.equal(seen[1].body.messages.at(-2).content[1].type, 'tool_use');
});

test('Gemini: upper-case schema types, no empty parameters, and the model turn is replayed as it came', async () => {
  const modelTurn = { role: 'model', parts: [{ functionCall: { name: 'add_room', args: { x0: 2 } }, thoughtSignature: 'sig' }] };
  const { fetchImpl, seen } = scripted([
    { body: { candidates: [{ content: modelTurn }] } },
    { body: { candidates: [{ content: { role: 'model', parts: [{ text: 'Hecho.' }] } }] } }
  ]);
  const transcript = [{ role: 'user', text: 'dibuja' }];
  await AiClient.run({ ...base, provider: 'gemini', model: 'gemini-2.5-flash', transcript, execute: execute([]), fetchImpl });
  assert.equal(seen[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(seen[0].headers['x-goog-api-key'], 'KEY');
  const [room, plan] = seen[0].body.tools[0].functionDeclarations;
  assert.equal(room.parameters.type, 'OBJECT');
  assert.equal(room.parameters.properties.x0.type, 'NUMBER');
  assert.deepEqual(room.parameters.required, ['x0']);
  assert.equal(plan.parameters, undefined);
  assert.equal(seen[0].body.systemInstruction.parts[0].text, 'be careful');
  const second = seen[1].body.contents;
  assert.deepEqual(second.at(-2), modelTurn);
  assert.deepEqual(second.at(-1).parts[0].functionResponse, { name: 'add_room', response: { result: '{"floor":"f1"}' } });
});

test('compatible endpoints use the OpenAI format at the address the person gives', async () => {
  const { fetchImpl, seen } = scripted([{ body: { choices: [{ message: { content: 'hola' } }] } }]);
  await AiClient.run({ ...base, provider: 'compatible', apiKey: '', baseUrl: 'http://localhost:11434/v1/', model: 'llama3.1', transcript: [{ role: 'user', text: 'hi' }], execute: execute([]), fetchImpl });
  assert.equal(seen[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(seen[0].headers.authorization, undefined);
});

test('errors say what the provider said, and a missing key never reaches the network', async () => {
  const { fetchImpl } = scripted([{ status: 401, body: { error: { message: 'Incorrect API key provided' } } }]);
  await assert.rejects(AiClient.run({ ...base, provider: 'openai', transcript: [{ role: 'user', text: 'x' }], execute: execute([]), fetchImpl }), e => e.status === 401 && /Incorrect API key/.test(e.message));
  await assert.rejects(AiClient.run({ ...base, provider: 'openai', apiKey: '', transcript: [], execute: execute([]), fetchImpl: () => { throw new Error('should not be called'); } }), /API key/);
  await assert.rejects(AiClient.run({ ...base, provider: 'openai', model: '', transcript: [], execute: execute([]), fetchImpl }), /model/);
  await assert.rejects(AiClient.run({ ...base, provider: 'nope', transcript: [], execute: execute([]), fetchImpl }), /unknown provider/);
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(AiClient.run({ ...base, provider: 'anthropic', transcript: [{ role: 'user', text: 'x' }], execute: execute([]), fetchImpl: offline }), /could not reach api.anthropic.com/);
});

test('a model that never stops is cut off, and cancelling stops the loop', async () => {
  const forever = () => ({ body: { choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name: 'get_plan', arguments: '{}' } }] } }] } });
  const { fetchImpl, seen } = scripted(Array.from({ length: 5 }, forever));
  const result = await AiClient.run({ ...base, provider: 'openai', transcript: [{ role: 'user', text: 'x' }], execute: execute([]), fetchImpl, maxSteps: 3 });
  assert.equal(result.stopped, 'max-steps');
  assert.equal(seen.length, 3);
  const controller = new AbortController();
  const again = scripted(Array.from({ length: 5 }, forever));
  const out = await AiClient.run({ ...base, provider: 'openai', transcript: [{ role: 'user', text: 'x' }], execute: async (n, a) => { controller.abort(); return { ok: true, result: {} }; }, fetchImpl: again.fetchImpl, signal: controller.signal });
  assert.equal(out.stopped, 'aborted');
  assert.equal(again.seen.length, 1);
});

test('a huge tool result is cut before it goes back to the model', async () => {
  const { fetchImpl, seen } = scripted([
    { body: { choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name: 'get_plan', arguments: '{}' } }] } }] } },
    { body: { choices: [{ message: { content: 'ok' } }] } }
  ]);
  await AiClient.run({ ...base, provider: 'openai', transcript: [{ role: 'user', text: 'x' }], execute: async () => ({ ok: true, result: { big: 'x'.repeat(50000) } }), fetchImpl });
  assert.ok(seen[1].body.messages.at(-1).content.length < 21000);
});

// a fetch that answers with server-sent events, split in odd places to prove chunk boundaries do not matter
const streamed = turns => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    const payload = turns.shift().map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
    const bytes = new TextEncoder().encode(payload), cut = Math.floor(bytes.length / 3);
    const body = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut, cut * 2 + 1)); c.enqueue(bytes.slice(cut * 2 + 1)); c.close(); } });
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body };
  };
  return { fetchImpl, seen };
};

test('OpenAI stream: text arrives piece by piece and tool arguments are joined', async () => {
  const { fetchImpl, seen } = streamed([
    [{ choices: [{ delta: { content: 'Voy a ' } }] }, { choices: [{ delta: { content: 'dibujar.', tool_calls: [{ index: 0, id: 'c1', function: { name: 'add_room', arguments: '{"x0":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '2,"name":"Sala"}' } }] } }] }, '[DONE]'],
    [{ choices: [{ delta: { content: 'Listo' } }] }, '[DONE]']
  ]);
  const calls = [], pieces = [];
  const result = await AiClient.run({ ...base, provider: 'openai', transcript: [{ role: 'user', text: 'x' }], execute: execute(calls), onText: t => pieces.push(t), fetchImpl });
  assert.equal(seen[0].body.stream, true);
  assert.deepEqual(pieces, ['Voy a ', 'Voy a dibujar.', 'Listo']);
  assert.deepEqual(calls, [['add_room', { x0: 2, name: 'Sala' }]]);
  assert.equal(result.stopped, 'done');
});

test('Anthropic stream: text blocks and tool input are rebuilt', async () => {
  const { fetchImpl, seen } = streamed([
    [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'get_plan' } }, { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '' } }, { type: 'message_stop' }],
    [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Fin' } }, { type: 'message_stop' }]
  ]);
  const calls = [], pieces = [];
  await AiClient.run({ ...base, provider: 'anthropic', transcript: [{ role: 'user', text: 'x' }], execute: execute(calls), onText: t => pieces.push(t), fetchImpl });
  assert.equal(seen[0].body.stream, true);
  assert.deepEqual(pieces, ['Hola', 'Fin']);
  assert.deepEqual(calls, [['get_plan', {}]]);
});

test('Gemini stream: uses the streaming endpoint and keeps the raw parts', async () => {
  const { fetchImpl, seen } = streamed([
    [{ candidates: [{ content: { parts: [{ text: 'Dibujo ' }] } }] }, { candidates: [{ content: { parts: [{ text: 'ya.' }, { functionCall: { name: 'get_plan', args: {} } }] } }] }],
    [{ candidates: [{ content: { parts: [{ text: 'Hecho' }] } }] }]
  ]);
  const transcript = [{ role: 'user', text: 'x' }], pieces = [];
  await AiClient.run({ ...base, provider: 'gemini', transcript, execute: execute([]), onText: t => pieces.push(t), fetchImpl });
  assert.match(seen[0].url, /:streamGenerateContent\?alt=sse$/);
  assert.deepEqual(pieces, ['Dibujo ', 'Dibujo ya.', 'Hecho']);
  assert.equal(transcript[1].raw.parts.length, 3);
});

test('stream: a server that ignores streaming still works through the normal path', async () => {
  const { fetchImpl } = scripted([{ body: { choices: [{ message: { content: 'Hola' } }] } }]);
  const pieces = [];
  const result = await AiClient.run({ ...base, provider: 'openai', transcript: [{ role: 'user', text: 'x' }], execute: execute([]), onText: t => pieces.push(t), fetchImpl: async (u, i) => ({ ...(await fetchImpl(u, i)), headers: new Headers({ 'content-type': 'application/json' }) }) });
  assert.equal(result.stopped, 'done');
  assert.deepEqual(pieces, []);
});
