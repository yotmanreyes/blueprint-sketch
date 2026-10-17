import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Layout = new Function('module', src('layout.js') + ';return Layout')();
const Drawing = new Function('Layout', 'module', src('drawing.js') + ';return Drawing')(Layout);
const Export = new Function('Drawing', 'module', src('export.js') + ';return Export')(Drawing);

const LIB = { cama140: { n: 'Cama doble', w: 1.5, d: 2.05 }, mesanoche: { n: 'Mesa de noche', w: .45, d: .4 } };
const wall = (id, x1, z1, x2, z2, t = .15) => ({ id, x1, z1, x2, z2, t, faces: {} });

function plan() {
  const L = Layout.empty();
  L.walls.push(wall('n', 0, 0, 4, 0), wall('s', 0, 3, 4, 3), wall('w', 0, 0, 0, 3), wall('e', 4, 0, 4, 3));
  L.floors.push({ id: 'f', x: 2, z: 1.5, w: 4, d: 3, f: 'x', name: 'Sala ñandú', zone: '' });
  L.openings.push({ id: 'd', wall: 'n', pos: 1, w: .9, h: 2.1, sill: 0, kind: 'door' }, { id: 'v', wall: 'e', pos: 1, w: 1.2, h: 1.2, sill: .9, kind: 'window' });
  return { layout: L, items: [{ id: 'i1', t: 'cama140', x: 2.8, z: 1.5, r: 3 }, { id: 'i2', t: 'mesanoche', x: 1, z: 1, r: 0, a: 30 }, { id: 'zz', t: 'unknown', x: 1, z: 1, r: 0 }] };
}
const prims = () => Drawing.build(plan(), LIB);
const latin1 = bytes => Buffer.from(bytes).toString('latin1');

test('walls are drawn in pieces, leaving the doorway open', () => {
  const north = prims().filter(p => p.layer === 'WALLS' && p.pts.every(([, z]) => Math.abs(z) <= .075 + 1e-9));
  assert.equal(north.length, 2, 'the north wall is split by its door');
  const xs = north.map(p => [Math.min(...p.pts.map(q => q[0])), Math.max(...p.pts.map(q => q[0]))]).sort((a, b) => a[0] - b[0]);
  assert.ok(Math.abs(xs[0][1] - 1) < 1e-9 && Math.abs(xs[1][0] - 1.9) < 1e-9, 'the gap is exactly the door width');
});

test('doors get a leaf and a swing arc, windows get three glass lines', () => {
  const p = prims();
  assert.equal(p.filter(x => x.t === 'arc').length, 1);
  assert.equal(p.filter(x => x.layer === 'OPENINGS' && x.t === 'line').length, 2 + 1 + 2 + 3);
});

test('furniture keeps its rotation and unknown pieces are skipped', () => {
  const furniture = prims().filter(p => p.layer === 'FURNITURE' && p.t === 'poly');
  assert.equal(furniture.length, 2);
  const bed = furniture[0].pts, xs = bed.map(q => q[0]);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 2.05) < 1e-9, 'a bed turned 270 degrees is 2.05 m wide on x');
});

test('rooms are labelled with name and area, with decimal commas in the dimensions', () => {
  const texts = prims().filter(p => p.t === 'text').map(p => p.text);
  assert.ok(texts.includes('SALA ÑANDÚ'));
  assert.ok(texts.includes('12,00 m²'));
  assert.ok(texts.includes('4,00') && texts.includes('3,00'));
});

test('the sheet picks a standard scale that fits and prefers the better orientation', () => {
  const s = Export.sheet(prims(), { paper: 'A3' });
  assert.ok(Export.SCALES.includes(s.den));
  assert.equal(s.fits, true);
  const smaller = Export.sheet(prims(), { paper: 'A4' });
  assert.ok(smaller.den >= s.den, 'a smaller sheet never gets a bigger scale');
  assert.equal(Export.sheet(prims(), { paper: 'A3', scale: 100 }).den, 100);
  assert.equal(Export.sheet(prims(), { paper: 'A3', orientation: 'portrait' }).orientation, 'portrait');
});

test('the PDF is well formed: header, objects, a correct cross-reference table and the scale', () => {
  const { bytes, sheet } = Export.pdf(prims(), { name: 'Casa de prueba', date: '17 oct 2026' }, { paper: 'A3' });
  const text = latin1(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const entries = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map(m => Number(m[1]));
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} sits at its offset`));
  const length = Number(/\/Length (\d+)/.exec(text)[1]), from = text.indexOf('stream\n') + 7, stream = text.slice(from, text.indexOf('\nendstream'));
  assert.equal(stream.length, length, 'the declared content length matches');
  assert.ok(stream.includes(`Escala 1:${sheet.den}`));
  assert.ok(stream.includes('(Casa de prueba) Tj'));
  assert.ok(stream.includes('SALA \xd1AND\xda'), 'accents survive as Latin-1');
});

test('the PDF escapes characters that would break a text string', () => {
  const { bytes } = Export.pdf(prims(), { name: 'Plano (norte) \\ sur' }, {});
  assert.ok(latin1(bytes).includes('(Plano \\(norte\\) \\\\ sur) Tj'));
});

test('the DXF is a valid sequence of group code and value pairs with millimetre coordinates', () => {
  const { bytes } = Export.dxf(prims(), { name: 'x' }, { scale: 50 });
  const lines = latin1(bytes).split('\r\n').filter((_, i, a) => i < a.length - 1 || a[i] !== '');
  assert.equal(lines.length % 2, 0, 'group codes and values come in pairs');
  for (let i = 0; i < lines.length; i += 2) assert.match(lines[i], /^\s*\d+$/, `line ${i} is a group code`);
  assert.deepEqual(lines.slice(-2), ['0', 'EOF']);
  const text = lines.join('\n');
  for (const section of ['HEADER', 'TABLES', 'ENTITIES']) assert.ok(text.includes(`2\n${section}`));
  assert.ok(text.includes('10\n4000\n'), 'a wall corner at x = 4 m is written as 4000');
  assert.ok(text.includes('20\n-3000\n') || text.includes('20\n-3075\n'), 'z is mirrored into y');
  const count = name => lines.filter((l, i) => i % 2 === 0 ? false : l === name && lines[i - 1].trim() === '0').length;
  assert.ok(count('POLYLINE') >= 8 && count('LINE') >= 10 && count('ARC') === 1 && count('TEXT') >= 5);
  assert.equal(count('POLYLINE'), count('SEQEND'));
});

test('DXF text is sized for the plotting scale', () => {
  const height = den => {
    const t = latin1(Export.dxf(prims(), {}, { scale: den }).bytes).split('\r\n');
    const at = t.indexOf('SALA \xd1AND\xda');
    return Number(t[t.lastIndexOf('40', at) + 1]);
  };
  assert.equal(height(100), 2 * height(50));
  assert.equal(height(50), 2.8 * 50);
});
