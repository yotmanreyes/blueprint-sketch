import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Layout = new Function('module', src('layout.js') + ';return Layout')();
const Quantities = new Function('Layout', 'module', src('quantities.js') + ';return Quantities')(Layout);

const wall = (id, x1, z1, x2, z2, faces) => ({ id, x1, z1, x2, z2, t: .15, faces });
const LIB = { cama140: { n: 'Cama doble' }, silla: { n: 'Silla' } };

// a 4 x 3 m room: interior faces only, a door on the north wall and a window on the east wall
function state(prices = {}) {
  const L = Layout.empty();
  L.walls.push(wall('n', 0, 0, 4, 0, { hi: 'a' }), wall('s', 0, 3, 4, 3, { lo: 'b' }), wall('w', 0, 0, 0, 3, { hi: 'c' }), wall('e', 4, 0, 4, 3, { lo: 'd' }));
  L.floors.push({ id: 'f', x: 2, z: 1.5, w: 4, d: 3, f: 'x', name: 'Sala', zone: '' });
  L.openings.push({ id: 'o1', wall: 'n', pos: 1, w: .9, h: 2.1, sill: 0, kind: 'door' }, { id: 'o2', wall: 'e', pos: 1, w: 1.2, h: 1.2, sill: .9, kind: 'window' });
  return {
    layout: L, prices,
    walls: { a: { t: 'pintura', c: '#fff' }, b: { t: 'pintura', c: '#fff' }, c: { t: 'micro', c: '#fff' }, d: { t: 'pintura', c: '#eee' } },
    wallBase: { t: 'pintura', c: '#fff' },
    items: [{ id: 'i1', t: 'cama140', x: 1, z: 1, r: 0 }, { id: 'i2', t: 'silla', x: 2, z: 1, r: 0 }, { id: 'i3', t: 'silla', x: 3, z: 1, r: 0 }, { id: 'i4', t: 'ghost', x: 3, z: 1, r: 0 }]
  };
}
const line = (q, key) => q.lines.find(l => l.key === key);
const compute = (s = state()) => Quantities.compute(s, { lib: LIB, floorNames: { x: 'Porcelanato' } });

test('rooms report their area and perimeter', () => {
  const q = compute();
  assert.deepEqual(q.rooms, [{ id: 'f', name: 'Sala', area: 12, perimeter: 14 }]);
  assert.equal(q.summary.floorArea, 12);
});

test('finishes are measured on the faces, net of the openings that cut them', () => {
  const q = compute();
  // north face 3.85 m x 2.4 m minus a 0.9 x 2.1 door; south 3.85 x 2.4; east 2.85 x 2.4 minus a 1.2 x 1.2 window
  assert.equal(line(q, 'finish:pintura').qty, +(7.35 + 9.24 + 5.4).toFixed(2));
  assert.equal(line(q, 'finish:micro').qty, 6.84);
});

test('built wall surface counts one face over the full wall length, without the openings', () => {
  const q = compute();
  assert.equal(line(q, 'wall').qty, 30.27);
  assert.equal(q.summary.wallLength, 14);
});

test('floors, openings and furniture are counted; unknown pieces are ignored', () => {
  const q = compute();
  assert.equal(line(q, 'floor:x').qty, 12);
  assert.equal(line(q, 'floor:x').label, 'Porcelanato');
  assert.equal(line(q, 'door:0.9x2.1').qty, 1);
  assert.equal(line(q, 'window:1.2x1.2').qty, 1);
  assert.equal(line(q, 'item:silla').qty, 2);
  assert.equal(line(q, 'item:cama140').qty, 1);
  assert.equal(q.lines.some(l => l.key === 'item:ghost'), false);
});

test('a face without a finish is not counted, and a missing one falls back to the base finish', () => {
  const s = state();
  delete s.walls.a;
  const q = compute(s);
  assert.equal(line(q, 'finish:pintura').qty, +(7.35 + 9.24 + 5.4).toFixed(2), 'the north face falls back to wallBase, which is paint too');
  s.layout.walls[0].faces = {};
  assert.equal(line(compute(s), 'finish:pintura').qty, +(9.24 + 5.4).toFixed(2));
});

test('the budget multiplies quantities by unit prices and adds the contingency', () => {
  const q = compute(state({ wall: 10, 'finish:pintura': 2, 'floor:x': 3, 'door:0.9x2.1': 100, contingency: 10 }));
  assert.equal(line(q, 'wall').total, 302.7);
  assert.equal(line(q, 'finish:pintura').total, 43.98);
  assert.equal(q.budget.subtotal, 482.68);
  assert.equal(q.budget.contingency, 48.27);
  assert.equal(q.budget.total, 530.95);
});

test('with no prices the budget is zero but the quantities are still there', () => {
  const q = compute();
  assert.equal(q.budget.total, 0);
  assert.ok(q.lines.length >= 7);
});

test('the CSV opens in Spanish spreadsheets: BOM, semicolons and decimal commas', () => {
  const csv = Quantities.csv(compute(state({ wall: 10 })), { name: 'Casa; "prueba"', currency: '€' });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('"Cantidades y presupuesto · Casa; ""prueba"""'));
  assert.ok(csv.includes('Muros construidos (una cara, descontando vanos);30,27;m²;10;302,7'));
  assert.ok(csv.includes('Total;;;;302,7'));
  assert.ok(csv.includes('Precio unitario (€)'));
});
