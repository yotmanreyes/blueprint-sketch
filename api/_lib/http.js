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

export const tooLarge = state => (JSON.stringify(state) || '').length > MAX_STATE_BYTES;
