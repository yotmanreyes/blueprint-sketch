import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Agent } from '../mcp/modules.mjs';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Markdown = new Function('module', src('markdown.js') + ';return Markdown')();
const AssistantUi = new Function('Markdown', 'module', src('assistant-ui.js') + ';return AssistantUi')(Markdown);

test('consecutive tool steps are grouped into one block', () => {
  const log = [{ kind: 'user', text: 'a' }, { kind: 'step', name: 'add_wall' }, { kind: 'step', name: 'add_room' }, { kind: 'assistant', text: 'b' }, { kind: 'step', name: 'get_plan' }];
  assert.deepEqual(AssistantUi.blocks(log).map(b => b.type + (b.steps ? b.steps.length : '')), ['user', 'steps2', 'assistant', 'steps1']);
});

test('steps read in plain Spanish, running or done, with a fallback for unknown tools', () => {
  assert.equal(AssistantUi.stepLabel('add_room', false), 'Dibujando una habitación');
  assert.equal(AssistantUi.stepLabel('add_room', true), 'Dibujó una habitación');
  assert.equal(AssistantUi.stepLabel('some_new_tool', true), 'some new tool');
});

test('every tool of the agent has a label', () => {
  for (const t of Agent.definitions()) assert.notEqual(AssistantUi.stepLabel(t.name, true), t.name.replace(/_/g, ' '), t.name);
});

test('elapsed time reads in seconds, then minutes', () => {
  assert.equal(AssistantUi.fmtElapsed(4200), '4 s');
  assert.equal(AssistantUi.fmtElapsed(75000), '1 min 15 s');
});

test('the details of a step stay short and skip nested values', () => {
  assert.equal(AssistantUi.stepDetail({ name: 'Sala', x0: 0, deep: { a: 1 } }), 'name: Sala · x0: 0');
  assert.ok(AssistantUi.stepDetail({ text: 'x'.repeat(200) }).length <= 81);
});

test('replies are formatted and user text is never treated as markup', () => {
  const html = AssistantUi.html({ log: [{ kind: 'user', text: '<img src=x onerror=alert(1)>' }, { kind: 'assistant', text: 'Hecho: **listo**' }], busy: false });
  assert.ok(!html.includes('<img'));
  assert.match(html, /<strong>listo<\/strong>/);
});

test('while the model works the progress block shows the step and a time', () => {
  const html = AssistantUi.html({ log: [{ kind: 'user', text: 'hola' }], busy: true, status: { startedAt: Date.now() - 3000, phase: 'request', step: 2, maxSteps: 16 } });
  assert.match(html, /Esperando al modelo/);
  assert.match(html, /Paso 2 de hasta 16/);
  assert.match(html, /data-elapsed/);
});

test('undo is offered only on the last finished turn that changed the plan', () => {
  const log = [{ kind: 'user', text: 'a' }, { kind: 'done', steps: 2, changed: true }, { kind: 'user', text: 'b' }, { kind: 'done', steps: 1, changed: true }];
  const html = AssistantUi.html({ log, busy: false });
  assert.equal((html.match(/data-act="undo"/g) || []).length, 1);
  assert.equal((AssistantUi.html({ log, busy: true }).match(/data-act="undo"/g) || []).length, 0);
});

test('a failed turn can be retried and an undone one says so', () => {
  assert.match(AssistantUi.html({ log: [{ kind: 'user', text: 'a' }, { kind: 'error', text: 'falló' }], busy: false }), /data-act="retry"/);
  assert.match(AssistantUi.html({ log: [{ kind: 'user', text: 'a' }, { kind: 'done', changed: true, undone: true }], busy: false }), /Deshecho/);
});
