'use strict';
// Night lighting: lamp pools on the road, lit windows, headlamps.
// ---------------------------------------------------------------- night lighting
// At night the scene is dim moonlight; light falls only where it really does: a warm pool under each
// street lamp and a beam ahead of each vehicle's headlights. Every material gets these added per pixel
// (up to 16 lamps and 16 headlights nearest your auto, fed in each frame).
const NL = 16, v4s = () => Array.from({ length: NL }, () => new T.Vector4());
const nightU = { uNight: { value: 0 }, uLamps: { value: v4s() }, uHeadP: { value: v4s() }, uHeadD: { value: v4s() } };
const NIGHT_GLSL = `
uniform float uNight; uniform vec4 uLamps[${NL}]; uniform vec4 uHeadP[${NL}]; uniform vec4 uHeadD[${NL}]; varying vec3 vNightPos;
vec3 nightLight(vec3 p) {
  vec3 L = vec3(0.0);
  for (int i = 0; i < ${NL}; i++) {
    vec4 l = uLamps[i]; if (l.w <= 0.0) continue;
    vec2 d = p.xz - l.xz;
    L += vec3(1.0, 0.72, 0.4) * l.w * exp(-dot(d, d) / 1.7e6) * step(p.y, l.y + 40.0);
  }
  for (int i = 0; i < ${NL}; i++) {
    vec4 h = uHeadP[i]; if (h.w <= 0.0) continue;
    vec3 v = p - h.xyz; float a = dot(v, uHeadD[i].xyz);
    if (a < -80.0) continue;
    float lat = length(v - uHeadD[i].xyz * a), wd = 120.0 + max(a, 0.0) * 0.42;
    L += vec3(1.0, 0.94, 0.78) * h.w * (1.0 - smoothstep(0.0, uHeadD[i].w, a)) * exp(-lat * lat / (wd * wd));
  }
  return L * uNight;
}
`;
// unlit (basic) materials are dimmed to moonlight by hand; lit ones are dimmed by the scene lights
function nightify(mat, unlit = false) {
  if (!mat || mat.userData.night) return mat;
  mat.userData.night = true;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, nightU);
    sh.vertexShader = 'varying vec3 vNightPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvNightPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = NIGHT_GLSL + sh.fragmentShader.replace('#include <output_fragment>',
      (unlit ? 'outgoingLight *= mix(1.0, 0.26, uNight);\n' : '') + 'outgoingLight += diffuseColor.rgb * nightLight(vNightPos);\n#include <output_fragment>');
  };
  mat.customProgramCacheKey = () => unlit ? 'night-unlit' : 'night';
  return mat;
}

const matCache = new Map();
const lambert = (color, extra = {}) => {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, nightify(new T.MeshLambertMaterial({ color, ...extra })));
  return matCache.get(key);
};
const texCache = new Map();
const tex = canvas => {
  if (!texCache.has(canvas)) { const t = new T.CanvasTexture(canvas); t.anisotropy = 4; texCache.set(canvas, t); }
  return texCache.get(canvas);
};
const spriteMat = canvas => {
  const key = canvas;
  if (!matCache.has(key)) matCache.set(key, nightify(new T.MeshLambertMaterial({ map: tex(canvas), transparent: false, alphaTest: 0.5, side: T.DoubleSide })));
  return matCache.get(key);
};
const lampGlow = new T.MeshLambertMaterial({ color: '#fff6c0', emissive: '#fff2a0', emissiveIntensity: 0.3 });
const headGlow = new T.MeshLambertMaterial({ color: '#fffbe6', emissive: '#fff4c8', emissiveIntensity: 0.25 });
const shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

const box = (w, h, l, color, x = 0, y = 0, z = 0, extra) => {
  const m = new T.Mesh(unitBox, typeof color === 'object' ? color : lambert(color, extra));
  m.scale.set(w, h, l); m.position.set(x, y, z); return m;
};
const cyl = (r, h, color, x = 0, y = 0, z = 0) => {
  const m = new T.Mesh(cyls[LO], typeof color === 'object' ? color : lambert(color)); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); return m;
};
const cylX = (r, h, color, x = 0, y = 0, z = 0) => { const m = cyl(r, h, color, x, y, z); m.rotation.z = Math.PI / 2; return m; };   // axis across (x)
const sph = (color, sx, sy, sz, x, y, z) => {
  const m = new T.Mesh(sphGeo(), typeof color === 'object' ? color : lambert(color)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m;
};
const torusGeos = new Map();
const torusX = (R, t, mat, x = 0) => {     // a ring around the x axis (rim lips)
  const key = [R, t, LO].join(',');
  if (!torusGeos.has(key)) torusGeos.set(key, new T.TorusGeometry(R, t, segs(8, 6, 4), segs(48, 20, 12)));
  const m = new T.Mesh(torusGeos.get(key), mat); m.rotation.y = Math.PI / 2; m.position.x = x; return m;
};
// tyre: a lathed section with rounded shoulders and tread grooves (axis along Y), open in the middle where
// the rim sits (ratio: rim size against the tyre)
const tyreGeos = new Map(), tyreMat = lambert('#1b1b1b', { side: T.DoubleSide });
function tyreGeo(r, w, ratio = 0.6) {
  const key = [r, w, ratio, LO].join(',');
  if (!tyreGeos.has(key)) {
    const ri = r * ratio, sh = Math.min(w * 0.3, r * 0.2), n = segs(6, 3, 2), pts = [new T.Vector2(ri, -w * 0.45)];
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI / 2; pts.push(new T.Vector2(r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh)); }
    if (LO === 0 && w > 60) for (const y of [-0.2, 0, 0.2]) {
      const gy = y * w, gw = w * 0.045, d = r * 0.025;
      pts.push(new T.Vector2(r, gy - gw), new T.Vector2(r - d, gy - gw * 0.5), new T.Vector2(r - d, gy + gw * 0.5), new T.Vector2(r, gy + gw));
    }
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; pts.push(new T.Vector2(r - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh)); }
    pts.push(new T.Vector2(ri, w * 0.45));
    tyreGeos.set(key, new T.LatheGeometry(pts, segs(56, 24, 12)));
  }
  return tyreGeos.get(key);
}
// Wheels, by style:
//   alloy  cars and scooters: five double spokes with a brake disc behind them, centre cap, lug nuts
//   steel  buses, trucks, autos: a deep dish with hand holes, a hub dome and a ring of nuts
//   dual   truck rear axles: twin tyres side by side, steel outside
//   spoke  motorcycles: thin rim, drum hub, wire spokes laced to both sides, a disc brake
// Only the side facing out gets a rim face (both for a centred wheel: bikes, the auto's front wheel). The
// turning part is one baked child marked spin (spinWheels turns it about the axle).
const UPV = new T.Vector3(0, 1, 0);
function spokeTo(s, a, b, r, mat) {
  const va = new T.Vector3(...a), d = new T.Vector3(...b).sub(va), len = d.length();
  const m = new T.Mesh(cyls[LO], mat); m.scale.set(r * 2, len, r * 2);
  m.position.copy(va).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UPV, d.normalize()); s.add(m);
}
const wheel = (r, w, x, y, z, rim = '#b9bec4', style = 'steel') => {
  const g = new T.Group(), out = Math.sign(x);
  const spin = baked('wheel' + [r, w, rim, style, out], () => {
    const s = new T.Group(), faces = out ? [out] : [-1, 1], rimM = style === 'alloy' ? paint(rim, 80) : lambert(rim);
    const tyres = style === 'dual' ? [[-w * 0.26, w * 0.48], [w * 0.26, w * 0.48]] : [[0, w]];
    for (const [tx, tw] of tyres) { const t = new T.Mesh(tyreGeo(r, tw, style === 'spoke' ? 0.8 : style === 'lug' ? 0.55 : 0.6), tyreMat); t.rotation.z = Math.PI / 2; t.position.x = tx; s.add(t); }
    if (style === 'lug') {                                                                     // tractor tyre: chevron lugs
      const lug = lambert('#1b1b1b'), n = q(26, 16, 10);
      for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
        const a = (i + (side > 0 ? 0.5 : 0)) / n * Math.PI * 2, m = box(w * 0.44, r * 0.08, r * 0.12, lug, side * w * 0.24, Math.cos(a) * r, Math.sin(a) * r);
        m.rotation.set(a, side * 0.5, 0); s.add(m);
      }
    }
    if (style === 'spoke') {
      const ri = r * 0.78;
      s.add(torusX(ri, r * 0.04, chrome3D));
      s.add(cylX(r * 0.15, w * 0.95, '#9a9da0'));
      const n = segs(28, 14, 8);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, side = i % 2 ? 1 : -1, b = a + side * 0.35;
        spokeTo(s, [side * w * 0.36, Math.cos(b) * r * 0.13, Math.sin(b) * r * 0.13], [side * w * 0.04, Math.cos(a) * ri, Math.sin(a) * ri], q(2.2, 3, 4), chrome3D);
      }
      s.add(cylX(r * 0.42, 5, '#a8abae', -w * 0.55));                                         // disc brake
      return s;
    }
    const ri = r * (style === 'lug' ? 0.55 : 0.6);
    // rim barrel: for alloys a shallow dark back wall (the tyre's inner lip is the barrel), so the brake
    // disc and caliper show between the spokes
    s.add(cylX(ri * 0.98, w * (style === 'alloy' ? 0.2 : 0.8), style === 'alloy' ? '#2a2c2f' : rim));
    for (const f of faces) {
      const fx = f * w * (style === 'alloy' ? 0.34 : 0.24), ox = style === 'dual' ? f * w * 0.26 : 0;
      s.add(torusX(ri, r * 0.035, rimM, ox + f * w * 0.42));                                   // rim lip
      if (style === 'alloy') {
        s.add(cylX(r * 0.44, w * 0.05, '#8d9093', fx - f * w * 0.22));                         // brake disc
        const rc = (ri + r * 0.15) / 2, len = ri - r * 0.15;
        for (let i = 0; i < 5; i++) for (const da of [-0.12, 0.12]) {
          const a = i * Math.PI * 2 / 5 + da, sp = box(w * 0.08, len, r * 0.075, rimM, fx, Math.cos(a) * rc, Math.sin(a) * rc);
          sp.rotation.x = a; s.add(sp);
        }
        s.add(cylX(r * 0.17, w * 0.12, rimM, fx + f * w * 0.02));
        s.add(cylX(r * 0.08, w * 0.14, chrome3D, fx + f * w * 0.05));
        for (let i = 0; i < 5; i++) { const a = (i + 0.5) * Math.PI * 2 / 5; s.add(cylX(r * 0.022, w * 0.06, chrome3D, fx + f * w * 0.08, Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12)); }
      } else {
        const dx = ox + fx;
        s.add(cylX(ri * 0.96, w * 0.05, rim, dx));                                              // dish
        for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; s.add(cylX(r * 0.055, w * 0.07, '#151515', dx + f * w * 0.01, Math.cos(a) * r * 0.41, Math.sin(a) * r * 0.41)); }
        s.add(sph(rim, w * 0.2, r * 0.46, r * 0.46, dx + f * w * 0.03, 0, 0));                 // hub dome
        const nuts = r < 150 ? 4 : 8;
        for (let i = 0; i < nuts; i++) { const a = i * Math.PI * 2 / nuts; s.add(cylX(r * 0.028, w * 0.12, chrome3D, dx + f * w * 0.07, Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18)); }
        if (r >= 150) s.add(cylX(r * 0.07, w * 0.2, chrome3D, dx + f * w * 0.1));                 // hub nut cap
      }
    }
    return s;
  });
  spin.userData.spin = true; g.add(spin);
  g.position.set(x, y, z); g.userData.wheel = true; return g;
};
// soft contact shadow the shape of the footprint (rounded rectangle, darkest in the middle), thrown a
// little away from the sun
let shadowTex = null;
function contactShadowMat() {
  if (shadowTex) return shadowMat;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  for (let i = 0; i < 18; i++) { const k = i * 3.2; x.fillStyle = 'rgba(0,0,0,0.075)'; x.beginPath(); x.roundRect(k, k, 128 - 2 * k, 256 - 2 * k, Math.max(4, 44 - k)); x.fill(); }
  shadowTex = new T.CanvasTexture(c);
  shadowMat.map = shadowTex; shadowMat.color.set(0xffffff); shadowMat.opacity = 0.62; shadowMat.needsUpdate = true;
  return shadowMat;
}
const shadow = (w, l) => {
  const m = new T.Mesh(unitPlane, contactShadowMat()); m.rotation.x = -Math.PI / 2;
  m.scale.set(w * 1.12, l * 1.06, 1); m.position.set(-w * 0.05, 4, -l * 0.02); m.renderOrder = 1; m.userData.isShadow = true; return m;
};
// box with rounded edges and corners (a subdivided cube whose corner zones are pushed onto spheres of radius r)
const rgeoCache = new Map();
function roundedGeo(w, h, l, r) {
  r = Math.max(1, Math.min(r, w / 2 - 0.5, h / 2 - 0.5, l / 2 - 0.5));
  const k = LO === 2 ? 1 : LO === 1 ? (r < 24 ? 1 : 2) : Math.min(TIER.maxK, Math.round((r < 10 ? 1 : r < 24 ? 2 : r < 60 ? 3 : 5) * TIER.det));
  const key = [w, h, l, r].map(Math.round).join(',') + ',' + k;
  if (rgeoCache.has(key)) return rgeoCache.get(key);
  const N = 2 * k + 1, geo = new T.BoxGeometry(1, 1, 1, N, N, N);
  const pos = geo.attributes.position, nor = geo.attributes.normal, half = [w / 2, h / 2, l / 2];
  const d = [0, 0, 0], c = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    for (let a = 0; a < 3; a++) {
      const idx = Math.round((pos.array[i * 3 + a] + 0.5) * N);
      if (idx <= k) { d[a] = -(1 - idx / k); c[a] = -(half[a] - r); } else { d[a] = (idx - k - 1) / k; c[a] = half[a] - r; }
    }
    const n = Math.hypot(d[0], d[1], d[2]) || 1;
    for (let a = 0; a < 3; a++) { pos.array[i * 3 + a] = c[a] + d[a] / n * r; nor.array[i * 3 + a] = d[a] / n; }
  }
  geo.computeBoundingSphere();
  rgeoCache.set(key, geo); return geo;
}
const rbox = (w, h, l, color, x = 0, y = 0, z = 0, r = 40) => {
  const m = new T.Mesh(roundedGeo(w, h, l, r), typeof color === 'object' ? color : lambert(color));
  m.position.set(x, y, z); return m;
};
const capCache = new Map();
const capsule = (r, len) => {
  const key = Math.round(r) + ',' + Math.round(len) + ',' + LO;
  if (!capCache.has(key)) capCache.set(key, new T.CapsuleGeometry(r, Math.max(1, len), segs(6, 3, 2), segs(18, 10, 6)));
  return capCache.get(key);
};
// the painted back of a vehicle (the old 2D sprite) as a panel on its rear face
const rearPanel = (canvas, w, z, lift = 0) => {
  const h = w * canvas.height / canvas.width;
  const m = new T.Mesh(unitPlane, spriteMat(canvas)); m.scale.set(w, h, 1); m.position.set(0, h / 2 + lift, z); return m;
};
