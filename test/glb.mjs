// Builds a minimal valid .glb (a coloured box) for tests, with the box size given in file units.
export function makeGlb({ w = 1, d = 1, h = 1, color = [.8, .3, .2, 1], extraUri = null } = {}) {
  const x = w / 2, z = d / 2;
  const positions = new Float32Array([-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z, -x, h, -z, x, h, -z, x, h, z, -x, h, z]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = {
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 1 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-x, 0, -z], max: [x, h, z] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 }],
    buffers: [{ byteLength: bin.byteLength }]
  };
  if (extraUri) json.images = [{ uri: extraUri }];
  const pad = (bytes, filler) => { const n = (4 - (bytes.length % 4)) % 4; const out = new Uint8Array(bytes.length + n).fill(filler); out.set(bytes); return out; };
  const jsonBytes = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20), binBytes = pad(bin, 0);
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  const out = new Uint8Array(total), view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true); view.setUint32(16, 0x4e4f534a, true); out.set(jsonBytes, 20);
  const at = 20 + jsonBytes.length;
  view.setUint32(at, binBytes.length, true); view.setUint32(at + 4, 0x004e4942, true); out.set(binBytes, at + 8);
  return out;
}
