import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Layout = new Function('module', src('layout.js') + ';return Layout')();
const Catalog = new Function('module', src('catalog.js') + ';return Catalog')();
const Levels = new Function('Layout', 'module', src('levels.js') + ';return Levels')(Layout);
const Templates = new Function('Layout', 'Levels', 'module', src('templates.js') + ';return Templates')(Layout, Levels);
const Quantities = new Function('Layout', 'Levels', 'module', src('quantities.js') + ';return Quantities')(Layout, Levels);
const Agent = new Function('Layout', 'Levels', 'Catalog', 'Templates', 'Quantities', 'module', src('agent-tools.js') + ';return Agent')(Layout, Levels, Catalog, Templates, Quantities);
const { cleanState } = await import('../api/_lib/validate.js');

const fresh = () => ({ state: Agent.blank() });
const run = (env, name, args) => { const r = Agent.call(env, name, args); assert.ok(r.ok, `${name}: ${r.error}`); return r.result; };
const refuse = (env, name, args) => { const r = Agent.call(env, name, args); assert.equal(r.ok, false, `${name} should refuse`); return r.error; };

test('an agent builds a room with a door, a window and furniture, and the plan stays valid', () => {
  const env = fresh();
  const room = run(env, 'add_room', { x0: 0, z0: 0, x1: 4, z1: 4, name: 'Dormitorio', floor: 'madera' });
  assert.equal(room.walls.length, 4);
  run(env, 'add_door', { x: 3, z: 4 });
  run(env, 'add_window', { x: 0, z: 2, width: 1.4 });
  const bed = run(env, 'place_against_wall', { type: 'cama140', wall_side: 'north', wall_position: 0, along: 2 });
  assert.equal(bed.turns, 0);
  assert.ok(bed.fits);
  assert.equal(bed.z, 1.1);
  run(env, 'place_against_wall', { type: 'closet180', wall_side: 'east', wall_position: 4, along: 2.5 });
  assert.deepEqual(run(env, 'check_plan', {}), { ok: true, problems: [] });
  assert.doesNotThrow(() => cleanState(JSON.parse(JSON.stringify(env.state))));
  const plan = run(env, 'get_plan', {});
  assert.equal(plan.rooms[0].name, 'Dormitorio');
  assert.equal(run(env, 'list_elements', { kind: 'items' }).total, 2);
  assert.equal(run(env, 'list_elements', { kind: 'openings' }).elements.length, 2);
});

test('rooms that share a side reuse its wall, and overlapping rooms are refused', () => {
  const env = fresh();
  run(env, 'add_room', { x0: 0, z0: 0, x1: 4, z1: 4 });
  run(env, 'add_room', { x0: 4, z0: 0, x1: 8, z1: 4 });
  assert.equal(env.state.layout.walls.length, 7);
  assert.match(refuse(env, 'add_room', { x0: 2, z0: 1, x1: 6, z1: 3 }), /overlaps/);
});

test('the tools say what is wrong in words an agent can act on', () => {
  const env = fresh();
  assert.match(refuse(env, 'add_wall', { x1: 0, z1: 0, x2: 3, z2: 2 }), /horizontal or vertical/);
  assert.match(refuse(env, 'add_door', { x: 3, z: 3 }), /no wall/);
  assert.match(refuse(env, 'add_item', { type: 'cama140', x: 1, z: 1 }), /not on any floor/);
  assert.match(refuse(env, 'add_item', { type: 'nope', x: 1, z: 1 }), /unknown piece/);
  assert.match(refuse(env, 'add_stair', { x: 1, z: 1 }), /no level above/);
  assert.match(refuse(env, 'nothing_like_this', {}), /unknown tool/);
  assert.match(refuse(env, 'move_item', { id: 'i1', x: 1, z: 1 }), /no item/);
  assert.match(refuse(env, 'add_wall', { x1: 'abc', z1: 0, x2: 3, z2: 0 }), /number/);
  assert.match(refuse(env, 'add_wall', { x1: 0, z1: 0, x2: 900, z2: 0 }), /between/);
});

test('sizes stay standard: a king bed is fine, an absurd width is not', () => {
  const env = fresh();
  run(env, 'add_room', { x0: 0, z0: 0, x1: 5, z1: 5 });
  const bed = run(env, 'add_item', { type: 'cama140', x: 2.5, z: 2.5, size: 'King' });
  assert.equal(bed.width, 2);
  assert.match(refuse(env, 'add_item', { type: 'cama140', x: 2.5, z: 2.5, width: 9 }), /between/);
  assert.match(refuse(env, 'add_item', { type: 'sanitario', x: 2.5, z: 2.5, width: 1 }), /fixed size/);
  const tree = run(env, 'add_item', { type: 'arbol', x: 1, z: 1, size: 'Grande' });
  assert.equal(env.state.items.find(i => i.id === tree.id).sy, env.state.items.find(i => i.id === tree.id).sx);
  const resized = run(env, 'resize_item', { id: bed.id, size: 'Sencilla' });
  assert.equal(resized.width, 1.1);
});

test('levels and stairs: a stair needs a level above and lands on its floor', () => {
  const env = fresh();
  run(env, 'add_room', { x0: 0, z0: 0, x1: 6, z1: 6, name: 'Planta baja' });
  run(env, 'add_level', { name: 'Piso 1' });
  run(env, 'add_room', { x0: 0, z0: 0, x1: 6, z1: 6, name: 'Arriba' });
  run(env, 'switch_level', { index: 0 });
  const stair = run(env, 'add_stair', { x: 3, z: 3, turns: 1 });
  assert.equal(stair.climbs, 'east');
  assert.deepEqual(run(env, 'check_plan', {}), { ok: true, problems: [] });
  assert.match(refuse(env, 'remove_level', { index: 1 }), /confirm/);
  run(env, 'remove_level', { index: 1, confirm: true });
  assert.equal(env.state.layout.stairs.length, 0);
});

test('check_plan finds floors that overlap and pieces on top of each other', () => {
  const env = fresh();
  run(env, 'add_room', { x0: 0, z0: 0, x1: 6, z1: 6 });
  run(env, 'add_item', { type: 'mesa', x: 3, z: 3 });
  run(env, 'add_item', { type: 'sofa', x: 3.2, z: 3.1 });
  const report = run(env, 'check_plan', {});
  assert.equal(report.ok, false);
  assert.ok(report.problems.some(p => /overlaps/.test(p)));
  env.state.layout.floors.push({ id: 'fx', x: 3, z: 3, w: 2, d: 2, f: 'madera', name: 'Encima', zone: '' });
  assert.ok(run(env, 'check_plan', {}).problems.some(p => /floors .* overlap/.test(p)));
});

test('templates replace the plan only when it is empty or the person agreed', () => {
  const env = fresh();
  assert.equal(run(env, 'apply_template', { key: 'house' }).applied, 'Casa de un nivel');
  assert.match(refuse(env, 'apply_template', { key: 'park' }), /confirm_replace/);
  assert.equal(run(env, 'apply_template', { key: 'house2', confirm_replace: true }).levels, 2);
  assert.match(refuse(env, 'apply_template', { key: 'nope', confirm_replace: true }), /unknown template/);
  assert.deepEqual(run(env, 'check_plan', {}), { ok: true, problems: [] });
});

test('layers, finishes and quantities work through the tools', () => {
  const env = fresh();
  run(env, 'add_room', { x0: 0, z0: 0, x1: 4, z1: 3, floor: 'cemento' });
  const wall = run(env, 'list_elements', { kind: 'walls' }).elements[0];
  const layer = run(env, 'add_layer', { name: 'Eléctrico', color: '#ff0000' });
  run(env, 'assign_layer', { kind: 'wall', id: wall.id, layer: layer.id });
  assert.equal(env.state.layout.walls[0].layer, layer.id);
  run(env, 'set_layer', { id: layer.id, visible: false, locked: true });
  assert.equal(env.state.layout.layers.find(l => l.id === layer.id).visible, false);
  run(env, 'set_wall_finish', { wall_id: wall.id, side: 'both', finish: 'enchape-metro', color: '#ffffff' });
  assert.deepEqual(env.state.walls[env.state.layout.walls[0].faces.lo], { t: 'enchape', p: 'metro', c: '#ffffff' });
  run(env, 'set_floor_finish', { floor_id: env.state.layout.floors[0].id, finish: 'terrazo', name: 'Sala' });
  assert.equal(run(env, 'get_quantities', {}).summary.floorArea, 12);
  assert.match(refuse(env, 'clear_level', {}), /confirm/);
  run(env, 'clear_level', { confirm: true });
  assert.equal(env.state.layout.walls.length, 0);
  assert.ok(env.state.layout.layers.some(l => l.id === layer.id));
  assert.doesNotThrow(() => cleanState(JSON.parse(JSON.stringify(env.state))));
});

test('every tool has a name, a description and a schema, and the catalogue is complete', () => {
  const names = new Set();
  for (const t of Agent.definitions()) {
    assert.ok(/^[a-z_]+$/.test(t.name) && !names.has(t.name), t.name);
    names.add(t.name);
    assert.ok(t.description.length > 20, t.name);
    assert.equal(t.parameters.type, 'object');
    for (const key of t.parameters.required) assert.ok(key in t.parameters.properties, `${t.name}.${key}`);
  }
  const catalog = run(fresh(), 'list_catalog', {});
  assert.ok(catalog.pieces.some(p => p.id === 'cama140' && p.standardSizes.length === 5));
  assert.ok(catalog.templates.length >= 30);
  assert.ok(Agent.mutates('add_room') && !Agent.mutates('get_plan'));
});
