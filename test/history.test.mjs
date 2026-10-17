import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const History = new Function('module', fs.readFileSync(fileURLToPath(new URL('../src/history.js', import.meta.url)), 'utf8') + ';return History')();

test('undo and redo walk back and forth through recorded states', () => {
  const h = History.create();
  h.reset({ n: 0 });
  h.record({ n: 1 }); h.record({ n: 2 });
  assert.equal(h.canUndo(), true); assert.equal(h.canRedo(), false);
  assert.deepEqual(h.undo(), { n: 1 });
  assert.deepEqual(h.undo(), { n: 0 });
  assert.equal(h.undo(), null);
  assert.equal(h.canUndo(), false);
  assert.deepEqual(h.redo(), { n: 1 });
  assert.deepEqual(h.redo(), { n: 2 });
  assert.equal(h.redo(), null);
});

test('recording an unchanged state adds nothing', () => {
  const h = History.create();
  h.reset({ a: 1 });
  assert.equal(h.record({ a: 1 }), false);
  assert.equal(h.canUndo(), false);
});

test('a new edit after undo discards the redo branch', () => {
  const h = History.create();
  h.reset({ n: 0 }); h.record({ n: 1 }); h.record({ n: 2 });
  h.undo(); h.undo();
  h.record({ n: 9 });
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.undo(), { n: 0 });
});

test('snapshots are copies, so later edits do not rewrite history', () => {
  const h = History.create();
  const state = { list: [1] };
  h.reset(state);
  state.list.push(2); h.record(state);
  state.list.push(3);
  assert.deepEqual(h.undo(), { list: [1] });
  assert.deepEqual(h.redo(), { list: [1, 2] });
});

test('history is capped', () => {
  const h = History.create();
  h.reset({ n: 0 });
  for (let i = 1; i <= History.LIMIT + 20; i++) h.record({ n: i });
  let steps = 0;
  while (h.undo()) steps++;
  assert.equal(steps, History.LIMIT - 1);
});
