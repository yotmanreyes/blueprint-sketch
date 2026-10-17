import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { blobStorage, Conflict } from './storage.js';

export const ROLES = ['owner', 'editor', 'viewer'];
const PERMISSIONS = {
  owner: new Set(['read', 'write', 'manage', 'delete']),
  editor: new Set(['read', 'write']),
  viewer: new Set(['read'])
};
export const can = (role, action) => !!PERMISSIONS[role] && PERMISSIONS[role].has(action);

const MAX_LINKS_PER_PLAN = 50, WRITE_RETRIES = 3, PLAN_ID = /^[A-Za-z0-9_-]{1,40}$/;

let storage = blobStorage;
// the tests and the local server swap in an in-memory adapter
export const useStorage = adapter => { storage = adapter; };

const randomToken = () => randomBytes(24).toString('base64url');
const randomId = bytes => randomBytes(bytes).toString('base64url');
// only the hash of a link token is stored, so a leaked store does not leak working links
const sha = token => createHash('sha256').update(token).digest('hex');
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// A plan is one JSON document that also holds its links, so one conditional write keeps both consistent.
const planPath = id => `plans/${id}.json`;
async function load(id) {
  const read = await storage.read(planPath(id));
  return read && { plan: JSON.parse(read.text), etag: read.etag };
}
const save = (plan, etag) => storage.write(planPath(plan.id), JSON.stringify(plan), { ifMatch: etag });

const publicLink = ({ lid, role, label, created }) => ({ lid, role, label, created });

// Best-effort limit per client and window: a read and a conditional write, only when a plan or link is created.
export async function rateLimit(req, bucket, max, windowSec) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const path = `rl/${bucket}-${sha(ip).slice(0, 32)}.json`, window = Math.floor(Date.now() / (windowSec * 1000));
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    const read = await storage.read(path);
    let counter = read ? JSON.parse(read.text) : { w: window, c: 0 };
    if (counter.w !== window) counter = { w: window, c: 0 };
    counter.c++;
    try {
      await storage.write(path, JSON.stringify(counter), read ? { ifMatch: read.etag } : { create: true });
      return counter.c <= max;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  return true;
}

export async function createPlan(name, state) {
  const token = randomToken(), now = Date.now();
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    const id = randomId(12);
    const plan = { id, name, state, version: 1, created: now, updated: now,
      links: [{ lid: randomId(8), role: 'owner', label: 'Propietario', created: now, hash: sha(token) }] };
    try {
      await storage.write(planPath(id), JSON.stringify(plan), { create: true });
      return { plan, token };
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Error('could not allocate a plan id');
}

// resolves the Bearer token to the plan and the link that grants access, or null
export async function open(req, id) {
  if (!PLAN_ID.test(String(id))) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{20,64})$/.exec(req.headers.authorization || '');
  if (!match) return null;
  const loaded = await load(id);
  if (!loaded) return null;
  const hash = sha(match[1]);
  const link = loaded.plan.links.find(l => sameHash(l.hash, hash));
  return link ? { ...loaded, link } : null;
}

// saves a new version when the caller started from the current one (or forces it)
export async function savePlan(opened, { state, name, baseVersion, force }) {
  let { plan, etag } = opened;
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    if (!force && baseVersion !== plan.version) return { conflict: true };
    const next = { ...plan, state, name: name ?? plan.name, version: plan.version + 1, updated: Date.now() };
    try {
      await save(next, etag);
      return { plan: next };
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      // someone wrote in between: retry on top of their write unless they changed the plan itself
      const latest = await load(plan.id);
      if (!latest) return { conflict: true };
      ({ plan, etag } = latest);
    }
  }
  return { conflict: true };
}

// applies a change to the stored plan, retrying from a fresh read when someone else wrote first
async function update(id, mutate) {
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    const loaded = await load(id);
    if (!loaded) return { missing: true };
    const result = mutate(loaded.plan);
    if (result && result.abort) return result.abort;
    try {
      await save(loaded.plan, loaded.etag);
      return result || {};
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Conflict('too much contention');
}

export const listLinks = plan => plan.links.map(publicLink).sort((a, b) => a.created - b.created);

export function createLink(id, role, label) {
  const token = randomToken();
  return update(id, plan => {
    if (plan.links.length >= MAX_LINKS_PER_PLAN) return { abort: { tooMany: true } };
    const link = { lid: randomId(8), role, label, created: Date.now(), hash: sha(token) };
    plan.links.push(link);
    return { link: publicLink(link), token };
  });
}

export const revokeLink = (id, lid) => update(id, plan => {
  const link = plan.links.find(l => l.lid === lid);
  if (!link) return { abort: { missing: true } };
  if (link.role === 'owner' && plan.links.filter(l => l.role === 'owner').length <= 1) return { abort: { lastOwner: true } };
  plan.links = plan.links.filter(l => l !== link);
  return { ok: true };
});

export const deletePlan = id => storage.remove(planPath(id));
