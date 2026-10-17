import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Layout = new Function('module', src('layout.js') + ';return Layout')();
const Levels = new Function('Layout', 'module', src('levels.js') + ';return Levels')(Layout);

const counter = () => { let n = 0; return prefix => prefix + (++n); };

function plan() {
  const layout = Layout.empty();
  layout.walls.push({ id: 'w1', x1: 0, z1: 0, x2: 4, z2: 0, t: .15, faces: { hi: 'a' } });
  layout.floors.push({ id: 'f1', x: 2, z: 2, w: 4, d: 4, f: 'x', name: 'Sala', zone: '' });
  return Levels.ensure({ layout, items: [{ id: 'i1', t: 'silla', x: 1, z: 1, r: 0 }], walls: { a: { t: 'pintura', c: '#fff' } } });
}

test('a plan without levels gets a single ground level', () => {
  const s = plan();
  assert.equal(Levels.count(s), 1);
  assert.equal(s.level, 0);
  assert.equal(s.levels[0].layout, undefined);
  assert.equal(Levels.at(s, 0).layout, s.layout);
});

test('adding a level creates an empty one above, switching parks the open one', () => {
  const s = plan(), next = counter();
  const i = Levels.add(s, next);
  assert.equal(i, 1);
  assert.equal(s.levels[1].name, 'Nivel 1');
  assert.ok(Levels.switchTo(s, 1));
  assert.equal(s.level, 1);
  assert.equal(s.layout.walls.length, 0);
  assert.equal(s.items.length, 0);
  assert.equal(s.levels[0].layout.walls.length, 1);
  assert.equal(s.levels[0].items.length, 1);
  assert.equal(s.levels[1].layout, undefined);
  Levels.switchTo(s, 0);
  assert.equal(s.layout.walls[0].id, 'w1');
});

test('only the open level carries no layout, so the state serialises each level once', () => {
  const s = plan(), next = counter();
  Levels.add(s, next);
  Levels.switchTo(s, 1);
  s.items.push({ id: 'i2', t: 'silla', x: 0, z: 0, r: 0 });
  const copy = Levels.ensure(JSON.parse(JSON.stringify(s)));
  assert.equal(copy.level, 1);
  assert.equal(Levels.itemsOf(copy, 0).length, 1);
  assert.equal(Levels.itemsOf(copy, 1).length, 1);
  assert.equal(Levels.allItems(copy).length, 2);
});

test('there is a limit of levels', () => {
  const s = plan(), next = counter();
  while (Levels.add(s, next) >= 0);
  assert.equal(Levels.count(s), Levels.MAX_LEVELS);
});

test('removing a level drops the stairs that led up to it', () => {
  const s = plan(), next = counter();
  Levels.add(s, next);
  s.layout.stairs.push({ id: 's1', x: 1, z: 1, w: .9, d: 3.6, r: 0 });
  assert.equal(Levels.arriving(s, 1).length, 1);
  assert.ok(Levels.remove(s, 1));
  assert.equal(Levels.count(s), 1);
  assert.equal(s.layout.stairs.length, 0);
});

test('removing the open level opens its neighbour, and the last level cannot go', () => {
  const s = plan(), next = counter();
  Levels.add(s, next);
  Levels.switchTo(s, 1);
  assert.ok(Levels.remove(s, 1));
  assert.equal(s.level, 0);
  assert.equal(s.layout.walls.length, 1);
  assert.equal(Levels.remove(s, 0), false);

  Levels.add(s, next);
  assert.ok(Levels.remove(s, 0));
  assert.equal(s.level, 0);
  assert.equal(Levels.count(s), 1);
  assert.equal(s.layout.walls.length, 0);
});

test('removing a level below the open one keeps the same level open', () => {
  const s = plan(), next = counter();
  Levels.add(s, next);
  Levels.add(s, next);
  Levels.switchTo(s, 2);
  s.layout.walls.push({ id: 'top', x1: 0, z1: 0, x2: 1, z2: 0, t: .1, faces: {} });
  assert.ok(Levels.remove(s, 0));
  assert.equal(s.level, 1);
  assert.equal(s.layout.walls[0].id, 'top');
});

test('copying a level brings walls and floors with new ids and the same finishes', () => {
  const s = plan(), next = counter();
  Levels.add(s, next);
  Levels.switchTo(s, 1);
  assert.equal(Levels.copyStructure(s, 0, next), 2);
  assert.equal(s.layout.walls.length, 1);
  assert.notEqual(s.layout.walls[0].id, 'w1');
  const face = s.layout.walls[0].faces.hi;
  assert.notEqual(face, 'a');
  assert.deepEqual(s.walls[face], s.walls.a);
  assert.equal(s.levels[0].layout.walls[0].id, 'w1');
});

test('names are trimmed and bounded', () => {
  const s = plan();
  Levels.rename(s, 0, '  ' + 'x'.repeat(50) + ' ');
  assert.equal(s.levels[0].name.length, Levels.NAME_MAX);
  Levels.rename(s, 0, '   ');
  assert.equal(s.levels[0].name.length, Levels.NAME_MAX);
});

test('the frame spans every level, and levels sit one storey apart', () => {
  const s = plan(), next = counter();
  Levels.add(s, next);
  Levels.switchTo(s, 1);
  s.layout.floors.push({ id: 'f2', x: 7, z: 2, w: 2, d: 2, f: 'x', name: '', zone: '' });
  assert.deepEqual(Levels.frame(s), { x0: 0, x1: 8, z0: 0, z1: 4 });
  assert.equal(Levels.offset(0, 1), -Levels.PITCH);
  assert.equal(Levels.offset(2, 1), Levels.PITCH);
});

test('stairs: footprint turns with the quarter turns and steps follow the rise', () => {
  const s = { x: 2, z: 3, w: 1, d: 3.6, r: 0 };
  assert.deepEqual(Layout.stairRect(s), { x0: 1.5, x1: 2.5, z0: 1.2, z1: 4.8 });
  const turned = Layout.stairRect({ ...s, r: 1 });
  assert.equal(+(turned.x1 - turned.x0).toFixed(3), 3.6);
  assert.equal(+(turned.z1 - turned.z0).toFixed(3), 1);
  assert.equal(Layout.stairSteps(Levels.PITCH), 14);
});

test('a floor slab keeps its shape except where a stairwell cuts it', () => {
  const floor = { x0: 0, x1: 4, z0: 0, z1: 4 };
  assert.deepEqual(Layout.subtractRects(floor, []), [floor]);
  const area = rects => rects.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  const cut = { x0: 1, x1: 2, z0: 1, z1: 3 };
  const pieces = Layout.subtractRects(floor, [cut]);
  assert.equal(area(pieces), 16 - 2);
  const edge = Layout.subtractRects(floor, [{ x0: 3, x1: 6, z0: -1, z1: 5 }]);
  assert.equal(area(edge), 12);
  assert.deepEqual(Layout.subtractRects(floor, [{ x0: -1, x1: 5, z0: -1, z1: 5 }]), []);
  // two overlapping cuts remove 2 + 2.25 - 0.5 m²
  assert.equal(area(Layout.subtractRects(floor, [cut, { x0: 1.5, x1: 3, z0: 2, z1: 3.5 }])), 16 - 3.75);
});
