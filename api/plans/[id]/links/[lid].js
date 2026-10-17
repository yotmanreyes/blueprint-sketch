import { authorize, can, revokeLink } from '../../../_lib/store.js';
import { route, send } from '../../../_lib/http.js';

export default route(['DELETE'], async (req, res) => {
  const { id, lid } = req.query;
  const link = await authorize(req, id);
  if (!link) return send(res, 404, { error: 'not_found' });
  if (!can(link.role, 'manage')) return send(res, 403, { error: 'forbidden' });
  const result = await revokeLink(id, lid);
  if (result.missing) return send(res, 404, { error: 'not_found' });
  if (result.lastOwner) return send(res, 409, { error: 'last_owner' });
  send(res, 200, { revoked: true });
});
