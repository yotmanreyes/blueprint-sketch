import { checkGlb, isInvalid, MAX_GLB_BYTES, MODEL_ID_PATTERN } from '../../../_lib/validate.js';
import { can, open, rateLimit, readModel, saveModel } from '../../../_lib/store.js';
import { route, send, sendBytes } from '../../../_lib/http.js';

const UPLOAD_LIMIT = 60, UPLOAD_WINDOW_SEC = 3600;

export default route(['GET', 'PUT'], async (req, res) => {
  const { id, mid } = req.query;
  if (!MODEL_ID_PATTERN.test(String(mid))) return send(res, 404, { error: 'not_found' });
  const opened = await open(req, id);
  if (!opened) return send(res, 404, { error: 'not_found' });

  if (req.method === 'GET') {
    const bytes = await readModel(opened.plan, mid);
    return bytes ? sendBytes(res, bytes, 'model/gltf-binary') : send(res, 404, { error: 'not_found' });
  }

  if (!can(opened.link.role, 'write')) return send(res, 403, { error: 'forbidden' });
  if (!Buffer.isBuffer(req.body) || req.body.length > MAX_GLB_BYTES) return send(res, req.body && req.body.length > MAX_GLB_BYTES ? 413 : 415, { error: 'send_a_glb_file' });
  if (!(await rateLimit(req, 'model', UPLOAD_LIMIT, UPLOAD_WINDOW_SEC))) return send(res, 429, { error: 'rate_limited' });
  checkGlb(req.body);
  const result = await saveModel(opened, mid, req.body);
  if (result.missing) return send(res, 404, { error: 'not_found' });
  if (result.tooMany) return send(res, 409, { error: 'too_many_models' });
  if (result.tooBig) return send(res, 413, { error: 'plan_models_too_large' });
  send(res, 200, { stored: true });
});
