import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { memoryStorage } from './memory-storage.mjs';
const ROOT = fileURLToPath(new URL('../api/', import.meta.url));
const { useStorage } = await import(ROOT + '_lib/store.js');
const storage = memoryStorage();
useStorage(storage);
const create = (await import(ROOT + 'plans/index.js')).default;
const plan = (await import(ROOT + 'plans/[id]/index.js')).default;
const links = (await import(ROOT + 'plans/[id]/links/index.js')).default;
const link = (await import(ROOT + 'plans/[id]/links/[lid].js')).default;

const call = async (handler, { method = 'GET', query = {}, token, body, ip = '1.1.1.1' } = {}) => {
  const req = { method, query, body, headers: { authorization: token ? 'Bearer ' + token : undefined, 'x-forwarded-for': ip } };
  let status = 0, payload;
  const res = { status(s) { status = s; return res; }, setHeader() { return res; }, json(p) { payload = p; return res; } };
  await handler(req, res);
  return { status, body: payload };
};

// a realistic plan: the original house template with a few pieces, one of them freely rotated and scaled
const Layout = new Function(fs.readFileSync(fileURLToPath(new URL('../src/layout.js', import.meta.url)), 'utf8') + ';return Layout')();
const layout = Layout.house({ win: { pos: 4.4, w: 1.2, h: 1.2, sill: .9 }, floor: { main: 'marmol_blanco', bano: 'marmol_blanco' } });
const finishes = Object.fromEntries(Layout.faceIds(layout).map(f => [f, { t: 'micro', c: '#bdbab4' }]));
const state = {
  style: 'ind_concreto', metal: 'negro', wood: 'roble', walls: finishes, wallBase: { t: 'micro', c: '#bdbab4' },
  defaults: { floor: 'marmol_blanco' }, n: 20, layout, prices: { wall: 12.5, 'finish:pintura': 3, 'door:0.9x2.1': 150, contingency: 10 }, currency: '$',
  items: [
    { id: 'i1', t: 'ducha', x: .675, z: .525, r: 0 }, { id: 'i2', t: 'sanitario', x: .425, z: 1.75, r: 1 },
    { id: 'i4', t: 'cama140', x: 2.9, z: 5.65, r: 3 }, { id: 'i8', t: 'repisa', x: 1.3, z: 7.8, r: 2, y: 1.35 },
    { id: 'i9', t: 'cama140', x: 2, z: 2, r: 0, a: 30, sx: 1.2 }
  ]
};
let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok  ', name); };

// create
const made = await call(create, { method: 'POST', body: { name: 'Casa de prueba', state } });
check('create returns id and owner token', () => { assert.equal(made.status, 201); assert.equal(made.body.role, 'owner'); });
const { id, token: owner } = made.body;

// read
let r = await call(plan, { query: { id }, token: owner });
check('owner can read', () => { assert.equal(r.status, 200); assert.equal(r.body.role, 'owner'); assert.equal(r.body.state.items.length, state.items.length); });
r = await call(plan, { query: { id } });
check('no token is not found', () => assert.equal(r.status, 404));
r = await call(plan, { query: { id }, token: 'x'.repeat(30) });
check('wrong token is not found', () => assert.equal(r.status, 404));

// links and roles
r = await call(links, { method: 'POST', query: { id }, token: owner, body: { role: 'viewer', label: 'Para Ana' } });
check('owner creates viewer link', () => { assert.equal(r.status, 201); assert.ok(r.body.token); });
const viewer = r.body.token, viewerLid = r.body.lid;
r = await call(links, { method: 'POST', query: { id }, token: owner, body: { role: 'editor', label: 'Para Luis' } });
const editor = r.body.token;
r = await call(plan, { query: { id }, token: viewer });
check('viewer reads with role viewer', () => assert.equal(r.body.role, 'viewer'));
r = await call(plan, { method: 'PUT', query: { id }, token: viewer, body: { state, baseVersion: 1 } });
check('viewer cannot write', () => assert.equal(r.status, 403));
r = await call(links, { query: { id }, token: viewer });
check('viewer cannot list links', () => assert.equal(r.status, 403));
r = await call(links, { query: { id }, token: editor });
check('editor cannot list links', () => assert.equal(r.status, 403));
r = await call(plan, { method: 'DELETE', query: { id }, token: editor });
check('editor cannot delete', () => assert.equal(r.status, 403));

// writes and versions
const changed = { ...state, items: state.items.slice(1) };
r = await call(plan, { method: 'PUT', query: { id }, token: editor, body: { state: changed, baseVersion: 1 } });
check('editor writes and version goes to 2', () => { assert.equal(r.status, 200); assert.equal(r.body.version, 2); });
r = await call(plan, { method: 'PUT', query: { id }, token: owner, body: { state, baseVersion: 1 } });
check('stale write conflicts', () => assert.equal(r.status, 409));
r = await call(plan, { method: 'PUT', query: { id }, token: owner, body: { state, baseVersion: 1, force: true } });
check('forced write wins and version goes to 3', () => { assert.equal(r.status, 200); assert.equal(r.body.version, 3); });
r = await call(plan, { query: { id, since: '3' }, token: viewer });
check('since current version reports unchanged', () => assert.equal(r.body.unchanged, true));
r = await call(plan, { query: { id, since: '1' }, token: viewer });
check('since old version returns the plan', () => assert.equal(r.body.version, 3));
r = await call(plan, { method: 'PUT', query: { id }, token: editor, body: { state, baseVersion: 3, name: 'Hackeado' } });
r = await call(plan, { query: { id }, token: owner });
check('editor cannot rename', () => assert.equal(r.body.name, 'Casa de prueba'));
r = await call(plan, { method: 'PUT', query: { id }, token: owner, body: { state, baseVersion: 4, name: 'Nuevo nombre' } });
r = await call(plan, { query: { id }, token: owner });
check('owner renames', () => assert.equal(r.body.name, 'Nuevo nombre'));

// validation
const bad = (label, mutate) => async () => {
  const s = JSON.parse(JSON.stringify(state)); mutate(s);
  const x = await call(plan, { method: 'PUT', query: { id }, token: owner, body: { state: s, baseVersion: 5 } });
  check('rejects ' + label, () => assert.equal(x.status, 400));
};
await bad('script in an id', s => { s.items[0].id = '"><img src=x onerror=alert(1)>'; })();
await bad('script in a floor name type', s => { s.layout.floors[0].name = 'x'.repeat(500); })();
await bad('NaN coordinates', s => { s.items[0].x = 'abc'; })();
await bad('huge coordinates', s => { s.layout.walls[0].x1 = 1e9; })();
await bad('bad face color', s => { s.walls[Object.keys(s.walls)[0]].c = 'red;background:url(x)'; })();
await bad('unknown finish', s => { s.wallBase.t = '<script>'; })();
await bad('a negative price', s => { s.prices.wall = -1; })();
await bad('a price key with markup', s => { s.prices['<img>'] = 1; })();
await bad('a long currency', s => { s.currency = 'dollars!!'; })();
await bad('too many items', s => { s.items = Array.from({ length: 600 }, (_, i) => ({ ...state.items[0], id: 'i' + i })); })();
r = await call(plan, { method: 'PUT', query: { id }, token: owner, body: { baseVersion: 5 } });
check('missing state is a 400, not a crash', () => assert.equal(r.status, 400));
// extra keys are dropped
const extra = JSON.parse(JSON.stringify(state)); extra.evil = '<script>'; extra.items[0].evil = 1;
r = await call(plan, { method: 'PUT', query: { id }, token: owner, body: { state: extra, baseVersion: 5 } });
r = await call(plan, { query: { id }, token: owner });
check('unknown keys are stripped', () => { assert.equal(r.body.state.evil, undefined); assert.equal(r.body.state.items[0].evil, undefined); });
check('prices and currency survive a round trip', () => { assert.equal(r.body.state.prices['door:0.9x2.1'], 150); assert.equal(r.body.state.currency, '$'); });

// revocation
r = await call(links, { query: { id }, token: owner });
check('owner lists 3 links without tokens', () => { assert.equal(r.body.links.length, 3); assert.ok(r.body.links.every(l => !l.token && !l.hash)); });
r = await call(link, { method: 'DELETE', query: { id, lid: viewerLid }, token: owner });
check('owner revokes viewer link', () => assert.equal(r.status, 200));
r = await call(plan, { query: { id }, token: viewer });
check('revoked link stops working', () => assert.equal(r.status, 404));
const ownerLid = (await call(links, { query: { id }, token: owner })).body.links.find(l => l.role === 'owner').lid;
r = await call(link, { method: 'DELETE', query: { id, lid: ownerLid }, token: owner });
check('cannot revoke the last owner link', () => assert.equal(r.status, 409));

// cross-plan isolation
const other = await call(create, { method: 'POST', body: { name: 'Otro', state } });
r = await call(plan, { query: { id: other.body.id }, token: owner });
check('a token never opens another plan', () => assert.equal(r.status, 404));
r = await call(plan, { query: { id }, token: other.body.token });
check('and the reverse', () => assert.equal(r.status, 404));

// rate limit
let limited = 0;
for (let i = 0; i < 25; i++) { const x = await call(create, { method: 'POST', body: { name: 'spam', state }, ip: '9.9.9.9' }); if (x.status === 429) limited++; }
check('creation is rate limited per IP', () => assert.ok(limited >= 5));

// concurrency and storage details
{
  const fresh = await call(create, { method: 'POST', body: { name: 'Carrera', state }, ip: '5.5.5.5' });
  const fid = fresh.body.id, ftoken = fresh.body.token;
  const ed = (await call(links, { method: 'POST', query: { id: fid }, token: ftoken, body: { role: 'editor', label: 'E' } })).body.token;
  const [a, b] = await Promise.all([
    call(plan, { method: 'PUT', query: { id: fid }, token: ftoken, body: { state, baseVersion: 1 } }),
    call(plan, { method: 'PUT', query: { id: fid }, token: ed, body: { state, baseVersion: 1 } })
  ]);
  check('two saves from the same version: exactly one wins', () => assert.deepEqual([a.status, b.status].sort(), [200, 409]));
  const now = await call(plan, { query: { id: fid }, token: ftoken });
  check('and the plan moved one version, not two', () => assert.equal(now.body.version, 2));

  const [save, mint] = await Promise.all([
    call(plan, { method: 'PUT', query: { id: fid }, token: ftoken, body: { state, baseVersion: 2 } }),
    call(links, { method: 'POST', query: { id: fid }, token: ftoken, body: { role: 'viewer', label: 'V' } })
  ]);
  check('saving while a link is created loses neither', () => { assert.equal(save.status, 200); assert.equal(mint.status, 201); });
  const after = await call(links, { query: { id: fid }, token: ftoken });
  check('the new link is still there after the save', () => assert.equal(after.body.links.length, 3));
  const reads = storage.stats.reads;
  r = await call(plan, { query: { id: '../../etc/passwd' }, token: ftoken });
  const r2 = await call(plan, { query: { id: 'a/b' }, token: ftoken });
  check('ids that try to leave the plans folder are not found and never reach storage', () => { assert.equal(r.status, 404); assert.equal(r2.status, 404); assert.equal(storage.stats.reads, reads); });
  const doc = storage.files.get(`plans/${fid}.json`).text;
  check('a plan is a single document that never contains a plain token', () => { assert.ok(doc.includes('"links"')); assert.ok(![ftoken, ed].some(t => doc.includes(t))); });
  check('only hashes of the tokens are kept', () => assert.ok(JSON.parse(doc).links.every(l => /^[0-9a-f]{64}$/.test(l.hash))));
  const before = storage.stats.reads;
  await call(plan, { query: { id: fid }, token: ftoken });
  check('opening a plan costs one read', () => assert.equal(storage.stats.reads - before, 1));
}

// the real Blob store compresses large bodies and returns a weak etag
{
  const { strongEtag } = await import(ROOT + '_lib/storage.js');
  check('a weak etag is turned into the strong one that conditional writes need', () => {
    assert.equal(strongEtag('W/"abc123"'), '"abc123"');
    assert.equal(strongEtag('"abc123"'), '"abc123"');
  });
}

// method guard and delete
r = await call(create, { method: 'GET' });
check('wrong method is 405', () => assert.equal(r.status, 405));
r = await call(plan, { method: 'DELETE', query: { id }, token: owner });
check('owner deletes the plan', () => assert.equal(r.status, 200));
r = await call(plan, { query: { id }, token: owner });
check('deleted plan is gone for everyone', () => assert.equal(r.status, 404));
r = await call(plan, { query: { id }, token: editor });
check('and its links stop working', () => assert.equal(r.status, 404));

console.log(`\n${ok} checks passed`);
