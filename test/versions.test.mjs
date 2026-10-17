import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Layout = new Function('module', src('layout.js') + ';return Layout')();
const Levels = new Function('Layout', 'module', src('levels.js') + ';return Levels')(Layout);
const Versions = new Function('Levels', 'module', src('versions.js') + ';return Versions')(Levels);

const memory = (limit = Infinity) => {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { if (v.length > limit) throw new Error('quota'); map.set(k, v); }
  };
};

function plan(extra = {}) {
  const layout = Layout.empty();
  layout.walls.push({ id: 'w1', x1: 0, z1: 0, x2: 4, z2: 0, t: .15, faces: {} });
  layout.floors.push({ id: 'f1', x: 2, z: 2, w: 4, d: 4, f: 'x', name: 'Sala', zone: '' });
  return Levels.ensure({ layout, items: [{ id: 'i1', t: 'silla', x: 1, z: 1, r: 0 }], walls: {}, style: 'a', ...extra });
}
const copy = s => JSON.parse(JSON.stringify(s));

test('a saved version keeps its own copy of the plan', () => {
  const store = Versions.create(memory()), s = plan();
  const v = store.add('p1', { state: s, label: '  Primera   idea ' });
  s.items.push({ id: 'i2', t: 'mesa', x: 0, z: 0, r: 0 });
  assert.equal(v.label, 'Primera idea');
  assert.equal(store.get('p1', v.id).state.items.length, 1);
});

test('an automatic checkpoint identical to the newest version is skipped', () => {
  const store = Versions.create(memory()), s = plan();
  assert.ok(store.add('p1', { state: s, kind: 'auto' }));
  assert.equal(store.add('p1', { state: copy(s), kind: 'auto' }), null);
  assert.ok(store.add('p1', { state: copy(s), kind: 'named', label: 'Igual pero con nombre' }).id);
});

test('versions survive a reload and are listed newest first', () => {
  const storage = memory();
  const a = Versions.create(storage);
  a.add('p1', { state: plan(), label: 'vieja', at: 1000 });
  a.add('p1', { state: plan({ style: 'b' }), label: 'nueva', at: 2000 });
  const b = Versions.create(storage);
  assert.deepEqual(b.list('p1').map(v => v.label), ['nueva', 'vieja']);
  assert.deepEqual(b.list('otro'), []);
});

test('only the latest automatic checkpoints are kept and named ones are never dropped for them', () => {
  const store = Versions.create(memory());
  store.add('p1', { state: plan(), label: 'hito', at: 1 });
  for (let i = 0; i < Versions.MAX_AUTO + 5; i++) store.add('p1', { state: plan({ style: 's' + i }), kind: 'auto', at: 100 + i });
  const list = store.list('p1');
  assert.equal(list.filter(v => v.kind === 'auto').length, Versions.MAX_AUTO);
  assert.ok(list.some(v => v.label === 'hito'));
  assert.equal(store.lastAutoAt('p1'), 100 + Versions.MAX_AUTO + 4);
});

test('named versions stop at the limit instead of deleting older ones', () => {
  const store = Versions.create(memory());
  for (let i = 0; i < Versions.MAX_NAMED; i++) store.add('p1', { state: plan({ style: 's' + i }), label: 'v' + i });
  assert.deepEqual(store.add('p1', { state: plan({ style: 'otro' }), label: 'una más' }), { error: 'full' });
  assert.equal(store.list('p1').length, Versions.MAX_NAMED);
});

test('a full storage drops old automatic checkpoints before refusing a version', () => {
  const s = plan(), size = JSON.stringify({ p1: [{ id: 'x', at: 1, kind: 'auto', label: 'a', thumb: null, state: s }] }).length;
  const store = Versions.create(memory(size * 2.5));
  store.add('p1', { state: plan({ style: '1' }), kind: 'auto', at: 1 });
  store.add('p1', { state: plan({ style: '2' }), kind: 'auto', at: 2 });
  const named = store.add('p1', { state: plan({ style: '3' }), label: 'importante', at: 3 });
  assert.ok(named.id);
  assert.ok(store.list('p1').some(v => v.label === 'importante'));
  const tooBig = Versions.create(memory(10)).add('p1', { state: s, label: 'no cabe' });
  assert.deepEqual(tooBig, { error: 'storage' });
});

test('rename, keep and remove', () => {
  const store = Versions.create(memory());
  const v = store.add('p1', { state: plan(), kind: 'auto' });
  assert.equal(store.rename('p1', v.id, '   '), false);
  assert.ok(store.rename('p1', v.id, 'Con la cocina nueva'));
  assert.ok(store.keep('p1', v.id));
  assert.equal(store.get('p1', v.id).kind, 'named');
  assert.ok(store.remove('p1', v.id));
  assert.equal(store.remove('p1', v.id), false);
  store.add('p1', { state: plan() });
  store.drop('p1');
  assert.deepEqual(store.list('p1'), []);
});

test('diff counts what was added, removed and changed, level by level', () => {
  const before = plan(), after = copy(before);
  after.layout.walls.push({ id: 'w2', x1: 0, z1: 4, x2: 4, z2: 4, t: .15, faces: {} });
  after.layout.floors[0].w = 5;
  after.items = [];
  const d = Versions.diff(before, after);
  assert.deepEqual([d.added.walls, d.changed.floors, d.removed.items], [1, 1, 1]);
  assert.equal(d.total, 3);
  assert.equal(d.same, false);
});

test('diff notices a new level and a change of finishes', () => {
  const before = plan(), after = copy(before);
  Levels.add(after, () => 'l2');
  after.style = 'b';
  const d = Versions.diff(before, after);
  assert.equal(d.levelsAdded, 1);
  assert.equal(d.settings, true);
  assert.equal(Versions.diff(before, copy(before)).same, true);
});

test('diff sees an edit on a level that is parked', () => {
  const s = plan();
  Levels.add(s, () => 'l2');
  Levels.switchTo(s, 1);
  s.items.push({ id: 'i9', t: 'cama100', x: 1, z: 1, r: 0 });
  Levels.switchTo(s, 0);
  const moved = copy(s);
  Levels.switchTo(moved, 1);
  moved.items[0].x = 2;
  Levels.switchTo(moved, 0);
  const d = Versions.diff(s, moved);
  assert.equal(d.changed.items, 1);
});

test('an exported plan carries its versions and an import rebuilds them from valid snapshots only', () => {
  const a = Versions.create(memory()), b = Versions.create(memory());
  a.add('p1', { state: plan(), label: 'uno', at: 5 });
  a.add('p1', { state: plan({ style: 'z' }), label: 'dos', at: 6 });
  const file = JSON.parse(JSON.stringify(a.exportFor('p1')));
  file.push({ label: 'roto', state: { nada: 1 } }, null, 'texto');
  const isValid = s => !!s && Array.isArray(s.items);
  assert.equal(b.importInto('q1', file, isValid), 2);
  assert.deepEqual(b.list('q1').map(v => v.label), ['dos', 'uno']);
  assert.equal(b.importInto('q1', 'no es una lista', isValid), 0);
});

test('sha256 matches the reference implementation', async () => {
  const { createHash } = await import('node:crypto');
  for (const text of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'plano ñ 🏠 ' + 'y'.repeat(1000)])
    assert.equal(Versions.sha256(text), createHash('sha256').update(text).digest('hex'));
});

test('every version carries the hash of its plan and the time it was captured', () => {
  const store = Versions.create(memory()), s = plan();
  const a = store.add('p1', { state: s, kind: 'auto', at: 1700000000000 });
  assert.equal(a.at, 1700000000000);
  assert.equal(a.hash, Versions.sha256(JSON.stringify(s)));
  const b = store.add('p1', { state: plan({ style: 'otro' }), kind: 'auto' });
  assert.notEqual(a.hash, b.hash);
  assert.ok(Math.abs(b.at - Date.now()) < 5000);
});

test('versions saved before hashes existed get theirs when listed', () => {
  const s = plan(), storage = memory();
  storage.setItem(Versions.KEY, JSON.stringify({ p1: [{ id: 'v1', at: 5, kind: 'auto', label: 'vieja', thumb: null, state: s }] }));
  const [v] = Versions.create(storage).list('p1');
  assert.equal(v.hash, Versions.sha256(JSON.stringify(s)));
});
