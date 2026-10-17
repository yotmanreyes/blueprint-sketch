import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const Catalog = new Function('module', fs.readFileSync(fileURLToPath(new URL('../src/catalog.js', import.meta.url)), 'utf8') + ';return Catalog')();
const { LIB, STD, STD_OF, stdOf } = Catalog;
const resizable = Object.keys(LIB).filter(t => stdOf(t));

test('every standard size sits inside the range of its kind of piece', () => {
  for (const [kind, std] of Object.entries(STD)) {
    assert.ok(std.sizes.length >= 2, kind);
    for (const [name, w, d] of std.sizes) {
      assert.ok(w >= std.w[0] && w <= std.w[1], `${kind} ${name}: width ${w}`);
      assert.ok(d >= std.d[0] && d <= std.d[1], `${kind} ${name}: depth ${d}`);
      if (std.uniform) assert.equal(w, d, `${kind} ${name} is uniform`);
    }
  }
});

test('the size every piece is drawn at is one of its standard sizes', () => {
  for (const type of resizable) {
    const { w, d } = LIB[type];
    assert.ok(stdOf(type).sizes.some(([, sw, sd]) => Math.abs(sw - w) < .011 && Math.abs(sd - d) < .011), `${type} ${w}x${d}`);
  }
});

test('only pieces that exist in the library have sizes, and fixtures keep theirs', () => {
  for (const [type, kind] of Object.entries(STD_OF)) { assert.ok(LIB[type], type); assert.ok(STD[kind], kind); }
  for (const kind of Object.keys(STD)) assert.ok(Object.keys(LIB).some(t => (STD_OF[t] || t) === kind), kind);
  for (const type of ['sanitario', 'silla', 'auto', 'farola', 'caminadora']) assert.equal(stdOf(type), undefined, type);
});

test('the catalogue and the editor agree on floors and styles', () => {
  const page = fs.readFileSync(fileURLToPath(new URL('../src/editor-3d.html', import.meta.url)), 'utf8');
  const floors = [...page.matchAll(/^  ([a-z_]+):\{n:'[^']*'(,open:true)?,c:mkCanvas/gm)].map(m => [m[1], !!m[2]]);
  assert.deepEqual(floors.sort(), Catalog.FLOORS.map(f => [f[0], f[2]]).sort());
  const styles = [...page.matchAll(/^  ([a-z_]+):\{n:'[^']*',metal:/gm)].map(m => m[1]);
  assert.deepEqual(styles.sort(), Catalog.STYLES.map(s => s[0]).sort());
});
