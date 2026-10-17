import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const Layout = new Function('module', fs.readFileSync(fileURLToPath(new URL('../src/layout.js', import.meta.url)), 'utf8') + ';return Layout')();
const H = 2.4;
const wall = (id, x1, z1, x2, z2, t = .15) => ({ id, x1, z1, x2, z2, t, faces: {} });

function room(x0, z0, x1, z1) {
  const L = Layout.empty();
  L.walls.push(wall('n', x0, z0, x1, z0), wall('s', x0, z1, x1, z1), wall('w', x0, z0, x0, z1), wall('e', x1, z0, x1, z1));
  L.floors.push({ id: 'f', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, f: 'x', name: '', zone: '' });
  return L;
}

test('the original house template is consistent', () => {
  const L = Layout.house({ win: { pos: 4.4, w: 1.2, h: 1.2, sill: .9 }, floor: { main: 'a', bano: 'b' } });
  for (const o of L.openings) {
    const w = Layout.wallById(L, o.wall);
    assert.ok(w, `wall of ${o.id}`);
    assert.ok(o.pos >= 0 && o.pos + o.w <= Layout.length(w), `${o.id} stays inside its wall`);
    assert.equal(Layout.overlaps(L, o), false);
  }
  assert.equal(L.walls.every(w => w.x1 <= w.x2 && w.z1 <= w.z2), true);
  assert.equal(L.floors.length, 3);
});

test('a closed room extends its walls at the corners', () => {
  const L = room(0, 0, 4, 3);
  const top = Layout.wallById(L, 'n');
  assert.equal(Layout.endInfo(L, top, 'a').ext, .075);
  assert.equal(Layout.endInfo(L, top, 'b').ext, .075);
});

test('a T junction does not extend the wall that ends against another', () => {
  const L = room(0, 0, 4, 3);
  L.walls.push(wall('mid', 2, 0, 2, 3, .1));
  const mid = Layout.wallById(L, 'mid');
  assert.equal(Layout.endInfo(L, mid, 'a').ext, 0);
  assert.equal(Layout.endInfo(L, mid, 'b').ext, 0);
});

test('openings are kept inside their wall and away from each other', () => {
  const L = room(0, 0, 4, 3);
  L.openings.push({ id: 'a', wall: 'n', pos: 1, w: .8, h: 2.1, sill: 0, kind: 'door' });
  const b = { id: 'b', wall: 'n', pos: 1.4, w: .8, h: 2.1, sill: 0, kind: 'door' };
  L.openings.push(b);
  assert.equal(Layout.overlaps(L, b), true);
  b.pos = 3.9; Layout.fitOpening(L, b, H);
  assert.ok(b.pos + b.w <= 4 - .05 + 1e-9);
  b.w = 99; Layout.fitOpening(L, b, H);
  assert.ok(b.w <= 4 - .1 + 1e-9);
  const tall = { id: 'c', wall: 'n', pos: 2, w: .5, h: 9, sill: 1, kind: 'window' };
  Layout.fitOpening(L, tall, H);
  assert.ok(tall.sill + tall.h <= H - .1 + 1e-9);
});

test('shrinking a wall drops the openings that no longer fit', () => {
  const L = room(0, 0, 4, 3);
  L.openings.push({ id: 'a', wall: 'n', pos: 3, w: .8, h: 2.1, sill: 0, kind: 'door' });
  const n = Layout.wallById(L, 'n'); n.x2 = 2.5;
  Layout.refitWallOpenings(L, n, H);
  assert.equal(L.openings.length, 1);
  assert.ok(L.openings[0].pos + L.openings[0].w <= 2.5);
  n.x2 = .3; Layout.refitWallOpenings(L, n, H);
  assert.equal(L.openings.length, 0);
});

test('resizing a room floor drags its four walls along', () => {
  const L = room(0, 0, 4, 3);
  Layout.resizeFloor(L, L.floors[0], { x0: 0, x1: 6, z0: 0, z1: 5 }, H);
  const get = id => Layout.wallById(L, id);
  assert.deepEqual([get('n').x1, get('n').x2, get('n').z1], [0, 6, 0]);
  assert.deepEqual([get('s').x1, get('s').x2, get('s').z1], [0, 6, 5]);
  assert.deepEqual([get('e').z1, get('e').z2, get('e').x1], [0, 5, 6]);
  assert.deepEqual([get('w').z1, get('w').z2, get('w').x1], [0, 5, 0]);
  assert.deepEqual([L.floors[0].x, L.floors[0].z, L.floors[0].w, L.floors[0].d], [3, 2.5, 6, 5]);
});

test('resizing leaves unrelated walls alone and keeps doors inside', () => {
  const L = room(0, 0, 4, 3);
  L.walls.push(wall('far', 10, 10, 14, 10));
  L.openings.push({ id: 'd', wall: 's', pos: 3, w: .8, h: 2.1, sill: 0, kind: 'door' });
  Layout.resizeFloor(L, L.floors[0], { x0: 0, x1: 2, z0: 0, z1: 3 }, H);
  assert.deepEqual([Layout.wallById(L, 'far').x1, Layout.wallById(L, 'far').x2], [10, 14]);
  assert.equal(L.openings.length, 1);
  assert.ok(L.openings[0].pos + L.openings[0].w <= 2, 'the door moves to stay inside the shorter wall');
});

test('the nearest wall is found with the position along it', () => {
  const L = room(0, 0, 4, 3);
  const hit = Layout.nearestWall(L, 1.5, .2, .7);
  assert.equal(hit.wall.id, 'n');
  assert.equal(hit.at, 1.5);
  assert.equal(Layout.nearestWall(L, 2, 1.5, .3), null);
});

test('splits list the interior walls used for dimension chains', () => {
  const L = room(0, 0, 4, 3);
  L.walls.push(wall('mid', 1.5, 0, 1.5, 3));
  assert.deepEqual(Layout.splits(L, 'x'), [0, 1.5, 4]);
});

test('resizing keeps coordinates tidy instead of leaving floating point noise', () => {
  const L = room(1, 1, 5, 4);
  const f = L.floors[0], x0 = f.x - f.w / 2 + 1e-13;
  Layout.resizeFloor(L, f, { x0, x1: x0 + 6.37, z0: 1, z1: 5.2 }, H);
  for (const w of L.walls) for (const v of [w.x1, w.z1, w.x2, w.z2]) assert.equal(v, +v.toFixed(3));
  assert.equal(Layout.wallById(L, 'n').x2 - Layout.wallById(L, 'n').x1, 6.37);
});
