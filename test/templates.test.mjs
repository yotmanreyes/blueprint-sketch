import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Layout = new Function('module', src('layout.js') + ';return Layout')();
const Levels = new Function('Layout', 'module', src('levels.js') + ';return Levels')(Layout);
const Templates = new Function('Layout', 'Levels', 'module', src('templates.js') + ';return Templates')(Layout, Levels);
const { cleanState } = await import('../api/_lib/validate.js');

// the furniture catalogue lives in the editor page; read its sizes from there
const LIB = new Function(src('editor-3d.html').match(/const LIB=\{[\s\S]*?\n\};/)[0] + ';return LIB')();
const FLOOR_KEYS = [...src('editor-3d.html').matchAll(/^  ([a-z_]+):\{n:'[^']*'(?:,open:true)?,c:mkCanvas/gm)].map(m => m[1]);

const blank = () => Levels.ensure({ style: 'moderno', metal: 'cromo', wood: 'clara', walls: {}, wallBase: { t: 'pintura', c: '#f4f3ef' }, n: 0, defaults: { floor: 'marmol_blanco' }, layout: Layout.empty(), items: [] });
const example = () => Levels.ensure({ style: 'moderno', metal: 'cromo', wood: 'clara', walls: {}, wallBase: { t: 'pintura', c: '#f4f3ef' }, n: 20, defaults: { floor: 'marmol_blanco' }, layout: Layout.house({ win: { pos: 4.4, w: 1.2, h: 1.2, sill: .9 }, floor: { main: 'marmol_blanco', bano: 'marmol_blanco' } }), items: [] });
const build = key => Templates.create(key, { blank, example, lib: LIB });

const rectOf = f => ({ x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 });
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
function itemRect(it) {
  const d = LIB[it.t], t = (it.r * 90 + (it.a || 0)) * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  const hx = (c * d.w + s * d.d) / 2, hz = (s * d.w + c * d.d) / 2;
  return { x0: it.x - hx, x1: it.x + hx, z0: it.z - hz, z1: it.z + hz };
}
const inside = (a, b) => a.x0 >= b.x0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.z0 >= b.z0 - 1e-6 && a.z1 <= b.z1 + 1e-6;

for (const entry of Templates.CATALOG) {
  test(`template "${entry.key}" is a valid plan the server accepts`, () => {
    const s = build(entry.key);
    assert.doesNotThrow(() => cleanState(JSON.parse(JSON.stringify(s))));
    assert.equal(s.level, 0);
    if (entry.levels) assert.equal(Levels.count(s), entry.levels);
  });
}

// plans with grounds around them: trees and benches may straddle two pieces of ground
const OPEN_AIR = ['park', 'garden', 'parking', 'sports', 'playground', 'pool', 'school'];
for (const entry of Templates.CATALOG.filter(t => t.build)) {
  test(`template "${entry.key}": floors do not overlap and pieces sit where they should`, () => {
    const s = build(entry.key);
    for (const lv of Levels.list(s)) {
      const floors = lv.layout.floors, rects = floors.map(rectOf);
      assert.ok(floors.length > 0, `${lv.name} has floors`);
      for (const f of floors) assert.ok(FLOOR_KEYS.includes(f.f), `floor finish ${f.f} exists`);
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
        assert.ok(overlap(rects[i], rects[j]) < 1e-6, `${lv.name}: ${floors[i].name} overlaps ${floors[j].name}`);
      const placed = lv.items.map(it => ({ it, r: itemRect(it) }));
      for (const { it, r } of placed) {
        assert.ok(LIB[it.t], `known piece ${it.t}`);
        const home = rects.find(f => it.x > f.x0 && it.x < f.x1 && it.z > f.z0 && it.z < f.z1);
        assert.ok(home, `${lv.name}: ${it.t} at ${it.x},${it.z} is on a floor`);
        if (!OPEN_AIR.includes(entry.key)) assert.ok(inside(r, home), `${lv.name}: ${it.t} at ${it.x},${it.z} stays inside its room`);
      }
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        if (placed[i].it.t === 'tapete' || placed[j].it.t === 'tapete') continue;
        assert.ok(overlap(placed[i].r, placed[j].r) < 4e-4, `${lv.name}: ${placed[i].it.t} (${placed[i].it.x},${placed[i].it.z}) overlaps ${placed[j].it.t} (${placed[j].it.x},${placed[j].it.z})`);
      }
    }
  });
}

test('stairs have a level above, start on a floor and land on one', () => {
  for (const key of ['house2', 'building']) {
    const s = build(key), levels = Levels.list(s);
    levels.forEach((lv, i) => {
      for (const st of lv.layout.stairs) {
        assert.ok(i < levels.length - 1, `${key}: a stair on the top level`);
        const r = Layout.stairRect(st);
        assert.ok(lv.layout.floors.some(f => inside(r, rectOf(f))), `${key}: the stair starts on a floor`);
        assert.ok(levels[i + 1].layout.floors.some(f => inside(r, rectOf(f))), `${key}: the stair lands on a floor`);
      }
      if (i < levels.length - 1) assert.ok(lv.layout.stairs.length > 0, `${key}: level ${i} reaches the next`);
    });
  }
});

test('the preview of every template is a drawing', () => {
  for (const entry of Templates.CATALOG) {
    const svg = Templates.previewSvg(build(entry.key), LIB);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  }
});

test('an unknown template is refused', () => {
  assert.throws(() => build('nope'));
});
