import { cleanName, cleanState } from '../_lib/validate.js';
import { createPlan, rateLimit } from '../_lib/store.js';
import { route, send, tooLarge } from '../_lib/http.js';

const CREATE_LIMIT = 20, CREATE_WINDOW_SEC = 3600;

export default route(['POST'], async (req, res) => {
  if (!(await rateLimit(req, 'create', CREATE_LIMIT, CREATE_WINDOW_SEC))) return send(res, 429, { error: 'rate_limited' });
  const body = req.body || {};
  if (tooLarge(body.state)) return send(res, 413, { error: 'too_large' });
  const { plan, token } = await createPlan(cleanName(body.name), cleanState(body.state));
  send(res, 201, { id: plan.id, token, role: 'owner', version: plan.version });
});
