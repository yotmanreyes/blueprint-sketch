import { cleanName, cleanState } from '../../_lib/validate.js';
import { authorize, can, deletePlan, getPlan, savePlan } from '../../_lib/store.js';
import { route, send, tooLarge } from '../../_lib/http.js';

export default route(['GET', 'PUT', 'DELETE'], async (req, res) => {
  const { id } = req.query;
  const link = await authorize(req, id);
  const plan = link && await getPlan(id);
  if (!plan) return send(res, 404, { error: 'not_found' });

  if (req.method === 'GET') {
    if (Number(req.query.since) === plan.version) return send(res, 200, { unchanged: true, version: plan.version, role: link.role });
    return send(res, 200, { id, name: plan.name, state: plan.state, version: plan.version, updated: plan.updated, role: link.role });
  }

  if (req.method === 'PUT') {
    if (!can(link.role, 'write')) return send(res, 403, { error: 'forbidden' });
    const body = req.body || {};
    if (tooLarge(body.state)) return send(res, 413, { error: 'too_large' });
    const name = body.name !== undefined && can(link.role, 'manage') ? cleanName(body.name) : undefined;
    const result = await savePlan(plan, { state: cleanState(body.state), name, baseVersion: Number(body.baseVersion), force: body.force === true });
    if (result.conflict) {
      const latest = await getPlan(id);
      return send(res, 409, { error: 'conflict', version: latest.version });
    }
    return send(res, 200, { version: result.plan.version, updated: result.plan.updated });
  }

  if (!can(link.role, 'delete')) return send(res, 403, { error: 'forbidden' });
  await deletePlan(id);
  send(res, 200, { deleted: true });
});
