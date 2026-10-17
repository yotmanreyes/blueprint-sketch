import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeGlb } from './glb.mjs';

const Models = new Function('module', fs.readFileSync(fileURLToPath(new URL('../src/models.js', import.meta.url)), 'utf8') + ';return Models')();
const box = (w, h, d, at = [0, 0, 0]) => ({ min: { x: at[0], y: at[1], z: at[2] }, max: { x: at[0] + w, y: at[1] + h, z: at[2] + d } });
const fit = (...a) => { const b = box(...a); return Models.fit(b.min, b.max); };

test('a model in metres keeps its size', () => {
  const r = fit(1.5, .9, .8);
  assert.deepEqual([r.scale, r.w, r.h, r.d], [1, 1.5, .9, .8]);
});

test('models exported in centimetres or millimetres are brought to metres', () => {
  assert.equal(fit(150, 90, 80).scale, .01);
  assert.deepEqual([fit(150, 90, 80).w, fit(150, 90, 80).h], [1.5, .9]);
  assert.equal(fit(1500, 900, 800).scale, .001);
  assert.equal(fit(1500, 900, 800).w, 1.5);
});

test('a big piece in metres is not mistaken for centimetres', () => {
  assert.equal(fit(6, 2.4, 3).scale, 1);
  assert.equal(fit(7.9, 1, 1).scale, 1);
});

test('the model is centred on x and z and rests on y = 0, whatever its own origin', () => {
  const r = fit(2, 1, 1, [10, 3, -4]);
  assert.deepEqual([r.offset.x, r.offset.y, r.offset.z], [-11, -3, 3.5]);
  const s = fit(200, 100, 100, [1000, 300, -400]);
  assert.ok(Math.abs(s.offset.x + 11) < 1e-9 && Math.abs(s.offset.y + 3) < 1e-9);
});

test('empty, flat-nothing and absurdly large models are refused', () => {
  assert.equal(fit(0, 0, 0), null);
  assert.equal(Models.fit({ x: NaN, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }), null);
  assert.equal(fit(30000, 1000, 1000), null, 'a 30 m piece (in millimetres) is refused');
  assert.equal(fit(25, 25, 25).w, .25, 'and 25 units are read as centimetres, not refused');
});

test('very thin models keep a minimum size so they can still be selected', () => {
  assert.equal(fit(1, .001, 1).h, .02);
});

test('names are tidied and ids are recognised', () => {
  assert.equal(Models.cleanName('silla-oficina_v2.glb'), 'silla-oficina_v2');
  assert.equal(Models.cleanName('<img src=x onerror=1>.glb'), 'img src x onerror 1');
  assert.equal(Models.cleanName('x'.repeat(100) + '.glb').length, 40);
  assert.equal(Models.cleanName('.glb'), 'Modelo');
  assert.equal(Models.isValidId('m_a1b2c3d4e5f6'), true);
  for (const bad of ['', 'm_', 'x_a1b2c3d4', 'm_../../x', 'm_A1B2C3D4E5F6', 'm_' + 'a'.repeat(30)]) assert.equal(Models.isValidId(bad), false, bad);
});

test('the test glb generator makes a well formed file', () => {
  const glb = makeGlb({ w: 2, d: 1, h: 3 }), view = new DataView(glb.buffer);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(8, true), glb.length);
  const jsonLength = view.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + jsonLength)));
  assert.deepEqual(json.accessors[0].max, [1, 3, .5]);
  assert.equal(glb.length % 4, 0);
});
