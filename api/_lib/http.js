import { isInvalid } from './validate.js';

export const MAX_STATE_BYTES = 600_000;

export function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

// wraps a handler: allowed methods, uniform errors, no internals leaked
export function route(methods, handler) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return send(res, 405, { error: 'method_not_allowed' });
    }
    try {
      await handler(req, res);
    } catch (e) {
      if (isInvalid(e)) return send(res, 400, { error: 'invalid_plan', detail: e.message });
      console.error(e);
      send(res, 500, { error: 'server_error' });
    }
  };
}

// immutable, private to the signed-in link, and never sniffed into anything else
export function sendBytes(res, bytes, type) {
  res.status(200);
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(bytes);
}

export const tooLarge = state => (JSON.stringify(state) || '').length > MAX_STATE_BYTES;
