// Checks the real Blob store the way the API uses it. Needs a store linked to the project:
//   vercel env pull .env.local   then   npm run check:blob
// It writes, reads and deletes one temporary file and touches nothing else.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env.local', import.meta.url));
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line);
    if (m) process.env[m[1]] ??= m[2];
  }
}
// use the read-write token alone; the SDK refuses a half-set OIDC configuration
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;

const { blobStorage, Conflict } = await import('../api/_lib/storage.js');
const path = `smoke/${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
const conflicts = async fn => { try { await fn(); return false; } catch (e) { return e instanceof Conflict; } };
let failed = false;
const step = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) failed = true; };

try {
  // small and large bodies behave differently: large ones come back with weak etags
  for (const [label, size] of [['small', 20], ['large', 200_000]]) {
    const body = JSON.stringify({ filler: 'x'.repeat(size) });
    const file = `${path}.${label}`;
    assert.equal(await blobStorage.read(file), null);
    const created = await blobStorage.write(file, body, { create: true });
    step(`${label}: create-only write returns an etag`, !!created.etag);
    step(`${label}: creating twice is a conflict`, await conflicts(() => blobStorage.write(file, body, { create: true })));
    const read = await blobStorage.read(file);
    step(`${label}: the etag read equals the etag written`, read.etag === created.etag && read.text === body);
    const next = await blobStorage.write(file, body + ' ', { ifMatch: read.etag });
    step(`${label}: a conditional write with that etag succeeds`, !!next.etag && next.etag !== read.etag);
    step(`${label}: a stale etag is a conflict`, await conflicts(() => blobStorage.write(file, body, { ifMatch: read.etag })));
    step(`${label}: reads see the latest write at once`, (await blobStorage.read(file)).text === body + ' ');
    await blobStorage.remove(file);
    step(`${label}: removed files read as null`, (await blobStorage.read(file)) === null);
  }

  // model files are binary: they must come back byte for byte and be written only once
  const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) % 256));
  const file = `${path}.glb`;
  await blobStorage.writeBytes(file, bytes, { contentType: 'model/gltf-binary' });
  const back = await blobStorage.readBytes(file);
  step('binary: bytes come back identical', back && Buffer.compare(back, bytes) === 0);
  step('binary: writing the same path again is a conflict', await conflicts(() => blobStorage.writeBytes(file, bytes)));
  await blobStorage.remove(file);
  step('binary: removed files read as null', (await blobStorage.readBytes(file)) === null);
} catch (e) {
  console.log('ERROR', e.constructor.name, String(e.message).slice(0, 200));
  failed = true;
}
process.exitCode = failed ? 1 : 0;
