'use strict';
// Loads the Blender-made models (web/models/).
// ---------------------------------------------------------------- Blender models
// tools/blender/*.py export window.RR_MODELS[name] = { hi | lo: { slot: { p, n, c } } }: positions (half
// units) and normals as base64 int16, per material slot. Decoded once, shared by every copy; each slot is
// painted with the material passed in (so one model serves every colour scheme).
const modelGeos = new Map();
function blenderModel(name, mats) {
  const src = window.RR_MODELS && window.RR_MODELS[name]; if (!src) return null;
  const lod = TIER === TIERS.smooth || LO === 2 ? 'lo' : 'hi', key = name + lod;
  if (!modelGeos.has(key)) {
    const dec = (b64, scale) => { const bin = atob(b64), i16 = new Int16Array(bin.length / 2); for (let i = 0; i < i16.length; i++) { const v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8); i16[i] = v > 32767 ? v - 65536 : v; } const f = new Float32Array(i16.length); for (let i = 0; i < f.length; i++) f[i] = i16[i] * scale; return f; };
    const geos = {};
    for (const [slotName, d] of Object.entries(src[lod])) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(dec(d.p, 0.5), 3));
      geo.setAttribute('normal', new T.BufferAttribute(dec(d.n, 1 / 32767), 3));
      geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(d.c * 2), 2));          // (untextured; lets it be baked)
      geo.computeBoundingSphere(); geos[slotName] = geo;
    }
    modelGeos.set(key, geos);
  }
  const g = new T.Group();
  for (const [slotName, geo] of Object.entries(modelGeos.get(key))) if (mats[slotName]) g.add(new T.Mesh(geo, mats[slotName]));
  return g;
}
