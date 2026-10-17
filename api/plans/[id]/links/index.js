import { authorize, can, createLink, listLinks, rateLimit, ROLES } from '../../../_lib/store.js';
import { route, send } from '../../../_lib/http.js';

const LINK_LIMIT = 60, LINK_WINDOW_SEC = 3600, MAX_LABEL = 40;

export default route(['GET', 'POST'], async (req, res) => {
  const { id } = req.query;
  const link = await authorize(req, id);
  if (!link) return send(res, 404, { error: 'not_found' });
  if (!can(link.role, 'manage')) return send(res, 403, { error: 'forbidden' });

  if (req.method === 'GET') return send(res, 200, { links: await listLinks(id) });

  if (!(await rateLimit(req, 'link', LINK_LIMIT, LINK_WINDOW_SEC))) return send(res, 429, { error: 'rate_limited' });
  const { role, label } = req.body || {};
  if (!ROLES.includes(role)) return send(res, 400, { error: 'invalid_role' });
  const clean = typeof label === 'string' ? label.trim().slice(0, MAX_LABEL) : '';
  const result = await createLink(id, role, clean);
  if (result.tooMany) return send(res, 409, { error: 'too_many_links' });
  send(res, 201, { ...result.link, token: result.token });
});
