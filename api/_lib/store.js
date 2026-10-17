import { Redis } from '@upstash/redis';
import { createHash, randomBytes } from 'node:crypto';

export const ROLES = ['owner', 'editor', 'viewer'];
const PERMISSIONS = {
  owner: new Set(['read', 'write', 'manage', 'delete']),
  editor: new Set(['read', 'write']),
  viewer: new Set(['read'])
};
export const can = (role, action) => !!PERMISSIONS[role] && PERMISSIONS[role].has(action);

const MAX_LINKS_PER_PLAN = 50;

let redis;
const db = () => redis ??= new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
});

const randomToken = () => randomBytes(24).toString('base64url');
const randomId = bytes => randomBytes(bytes).toString('base64url');
// only the hash of a link token is stored, so a leaked database does not leak working links
const sha = token => createHash('sha256').update(token).digest('hex');

const planKey = id => `plan:${id}`;
const versionKey = id => `plan:${id}:v`;
const linksKey = id => `plan:${id}:links`;

export async function rateLimit(req, bucket, max, windowSec) {
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = `rl:${bucket}:${ip}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const count = await db().incr(key);
  if (count === 1) await db().expire(key, windowSec);
  return count <= max;
}

async function addLink(planId, role, label, token = randomToken()) {
  const lid = randomId(8), hash = sha(token);
  const record = { lid, plan: planId, role, label, created: Date.now(), hash };
  await Promise.all([
    db().set(`link:${lid}`, record),
    db().set(`token:${hash}`, lid),
    db().sadd(linksKey(planId), lid)
  ]);
  return { link: publicLink(record), token };
}
const publicLink = ({ lid, role, label, created }) => ({ lid, role, label, created });

export async function createPlan(name, state) {
  const id = randomId(12), now = Date.now();
  const plan = { id, name, state, version: 1, created: now, updated: now };
  await Promise.all([db().set(planKey(id), plan), db().set(versionKey(id), 1)]);
  const { token } = await addLink(id, 'owner', 'Propietario');
  return { plan, token };
}

export const getPlan = id => db().get(planKey(id));

// resolves the Bearer token to the link that grants access to this plan, or null
export async function authorize(req, planId) {
  const match = /^Bearer ([A-Za-z0-9_-]{20,64})$/.exec(req.headers.authorization || '');
  if (!match) return null;
  const lid = await db().get(`token:${sha(match[1])}`);
  if (!lid) return null;
  const link = await db().get(`link:${lid}`);
  return link && link.plan === planId ? link : null;
}

const CAS = `if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]) return 1 else return 0 end`;

// saves a new version when the caller started from the current one (or forces it)
export async function savePlan(plan, { state, name, baseVersion, force }) {
  const current = Number(await db().get(versionKey(plan.id)));
  if (!force && baseVersion !== current) return { conflict: true };
  const next = current + 1;
  const won = await db().eval(CAS, [versionKey(plan.id)], [String(current), String(next)]);
  if (!won) return { conflict: true };
  const saved = { ...plan, state, name: name ?? plan.name, version: next, updated: Date.now() };
  await db().set(planKey(plan.id), saved);
  return { plan: saved };
}

export async function listLinks(planId) {
  const lids = await db().smembers(linksKey(planId));
  const records = await Promise.all(lids.map(l => db().get(`link:${l}`)));
  return records.filter(Boolean).map(publicLink).sort((a, b) => a.created - b.created);
}

export async function createLink(planId, role, label) {
  if ((await db().scard(linksKey(planId))) >= MAX_LINKS_PER_PLAN) return { tooMany: true };
  return addLink(planId, role, label);
}

export async function revokeLink(planId, lid) {
  const record = await db().get(`link:${lid}`);
  if (!record || record.plan !== planId) return { missing: true };
  if (record.role === 'owner') {
    const all = await Promise.all((await db().smembers(linksKey(planId))).map(l => db().get(`link:${l}`)));
    if (all.filter(l => l && l.role === 'owner').length <= 1) return { lastOwner: true };
  }
  await Promise.all([db().del(`link:${lid}`), db().del(`token:${record.hash}`), db().srem(linksKey(planId), lid)]);
  return { ok: true };
}

export async function deletePlan(planId) {
  const lids = await db().smembers(linksKey(planId));
  const records = (await Promise.all(lids.map(l => db().get(`link:${l}`)))).filter(Boolean);
  await Promise.all([
    ...records.flatMap(r => [db().del(`link:${r.lid}`), db().del(`token:${r.hash}`)]),
    db().del(linksKey(planId)), db().del(planKey(planId)), db().del(versionKey(planId))
  ]);
}
