import { Conflict } from '../api/_lib/storage.js';

// An in-memory stand-in for the Blob adapter with the same contract: etags on every write,
// conditional writes (ifMatch) and create-only writes, so concurrency is tested for real.
export function memoryStorage() {
  const files = new Map();
  let counter = 0;
  const stats = { reads: 0, writes: 0 };
  return {
    stats,
    files,
    async read(path) {
      stats.reads++;
      const f = files.get(path);
      return f ? { text: f.text, etag: f.etag } : null;
    },
    async write(path, text, { ifMatch, create } = {}) {
      stats.writes++;
      const current = files.get(path);
      if (create && current) throw new Conflict();
      if (ifMatch !== undefined && (!current || current.etag !== ifMatch)) throw new Conflict();
      const etag = `"${++counter}"`;
      files.set(path, { text, etag });
      return { etag };
    },
    async remove(path) {
      files.delete(path);
    }
  };
}
