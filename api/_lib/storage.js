import { BlobPreconditionFailedError, del, get, put } from '@vercel/blob';

// Thrown when a conditional write loses a race, or when creating something that already exists.
export class Conflict extends Error {}

const alreadyExists = e => /already exists/i.test(String(e && e.message));

// The production adapter: a private Vercel Blob store. Reads skip the cache so a read always
// sees the latest write, and writes can be made conditional on the etag that was read.
export const blobStorage = {
  async read(path) {
    const result = await get(path, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return { text: await new Response(result.stream).text(), etag: result.blob.etag };
  },
  async write(path, text, { ifMatch, create } = {}) {
    try {
      const result = await put(path, text, {
        access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: !create, ifMatch
      });
      return { etag: result.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError || alreadyExists(e)) throw new Conflict();
      throw e;
    }
  },
  async remove(path) {
    await del(path);
  }
};
