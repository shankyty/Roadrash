'use strict';
// 3D world renderer (Three.js r149, WebGL). The game logic stays in game.js and keeps its track
// coordinates (distance along the track + lateral offset); every frame this file rebuilds the road
// around the camera by integrating the track's curves and hills from the camera's segment, then
// places 3D models for the player, rival autos, traffic, animals and roadside scenery.
// Exposes window.World3D, or null when WebGL / Three.js isn't available (game.js falls back to 2D).
window.World3D = (() => {
  const T = window.THREE;
  if (!T) return null;

  // ---------------------------------------------------------------- constants
  const DRAW = 300;             // road segments drawn ahead of the camera
  // cameras: a high helicopter view (default) and a low chase view (C switches)
  const CAMS = {
    heli: { back: 2800, height: 2400, pitch: -25, fov: 55 },
    chase: { back: 1500, height: 950, pitch: -10, fov: 60 },
  };
  let cam = CAMS.heli, camMode = 'heli';
  const PITCH_RAD = () => cam.pitch * Math.PI / 180;
  const OBJ_FAR = 46000;        // scenery / vehicles further than this are hidden
  const CURVE_TO_RAD = 1 / 200; // heading change per segment per unit of track curve (matches the 2D look)

  let W = 960, H = 540, ROAD_W = 2000, SEG_LEN = 200;
  let renderer, scene, camera, hemi, sun, ready = false, roadShade = null, post = null;
  let road, roadPos, roadCol, roadUV, roadDet, det = 1;
  let segments = [], trackLength = 1, theme = null, SP = null, TS = null, cfg = {};
  const QUADS = 30; // per segment: verge and road (7), centre line (2), lane lines (4), or finish cells (12) / zebra + stop line
  const P = [], TH = [], Y = [];     // per-frame centreline points, headings, heights (camera space)
  let camAbs = 0, camFrac = 0, baseIdx = 0;

  // ---------------------------------------------------------------- shared resources
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const unitCyl = new T.CylinderGeometry(0.5, 0.5, 1, 20);
  const unitCone = new T.ConeGeometry(0.5, 1, 12);
  const unitSphere = new T.SphereGeometry(0.5, 20, 14);
  // Levels of detail: every vehicle is built three times, detailed (0) for close up, medium (1) and low-poly
  // (2) for far down the road; the farther it is, the fewer polygons. LO is the level being built, and
  // every vehicle primitive below picks its geometry for it with q(detailed, medium, low).
  // How far detail goes depends on the device's quality tier (set in init): 'smooth' keeps phones, tablets
  // and weak laptops fluid; 'high' for desktop browsers; 'ultra' for the Mac app (finer curves, detail
  // kept much farther down the road).
  const TIERS = {
    // shadow: sun shadow map size and how far around you it reaches; post: filmic glow pass (else the
    // renderer's own tone mapping)
    smooth: { lod: [3500, 9000], det: 0.7, clearcoat: false, maxK: 3, shadow: null, post: false },
    high: { lod: [7000, 18000], det: 1, clearcoat: true, maxK: 5, shadow: { size: 2048, reach: 7000 }, post: false },
    ultra: { lod: [14000, 32000], det: 1.6, clearcoat: true, maxK: 7, shadow: { size: 4096, reach: 10000 }, post: true },
  };
  let TIER = TIERS.high, quality = 'high';
  let LO = 0;
  const q = (a, b, c) => LO === 0 ? a : LO === 1 ? b : c;
  const segs = (a, b, c) => Math.max(3, Math.round(q(a, b, c) * (LO === 2 ? 1 : TIER.det)));   // segment counts, scaled by tier
  let cyls, sphs;
  function buildPrims() {
    LO = 0; cyls = []; sphs = [];
    for (LO = 0; LO < 3; LO++) { cyls.push(new T.CylinderGeometry(0.5, 0.5, 1, segs(32, 14, 8))); sphs.push(new T.SphereGeometry(0.5, segs(32, 14, 8), segs(20, 10, 6))); }
    LO = 0;
  }
  buildPrims();
  const sphGeo = () => sphs[LO];
  const unitPlane = new T.PlaneGeometry(1, 1);
  const halfTube = new T.CylinderGeometry(0.5, 0.5, 1, 20, 1, true, Math.PI / 2, Math.PI); // top half of a tube (open ends)
  const blob = new T.CircleGeometry(0.5, 20);
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
        s.add(torusX(ri, r * 0.04, chrome));
        s.add(cylX(r * 0.15, w * 0.95, '#9a9da0'));
        const n = segs(28, 14, 8);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, side = i % 2 ? 1 : -1, b = a + side * 0.35;
          spokeTo(s, [side * w * 0.36, Math.cos(b) * r * 0.13, Math.sin(b) * r * 0.13], [side * w * 0.04, Math.cos(a) * ri, Math.sin(a) * ri], q(2.2, 3, 4), chrome);
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
          s.add(cylX(r * 0.08, w * 0.14, chrome, fx + f * w * 0.05));
          for (let i = 0; i < 5; i++) { const a = (i + 0.5) * Math.PI * 2 / 5; s.add(cylX(r * 0.022, w * 0.06, chrome, fx + f * w * 0.08, Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12)); }
        } else {
          const dx = ox + fx;
          s.add(cylX(ri * 0.96, w * 0.05, rim, dx));                                              // dish
          for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; s.add(cylX(r * 0.055, w * 0.07, '#151515', dx + f * w * 0.01, Math.cos(a) * r * 0.41, Math.sin(a) * r * 0.41)); }
          s.add(sph(rim, w * 0.2, r * 0.46, r * 0.46, dx + f * w * 0.03, 0, 0));                 // hub dome
          const nuts = r < 150 ? 4 : 8;
          for (let i = 0; i < nuts; i++) { const a = i * Math.PI * 2 / nuts; s.add(cylX(r * 0.028, w * 0.12, chrome, dx + f * w * 0.07, Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18)); }
          if (r >= 150) s.add(cylX(r * 0.07, w * 0.2, chrome, dx + f * w * 0.1));                 // hub nut cap
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

  // ---------------------------------------------------------------- vehicle models (forward is -Z, origin on the ground)
  // cut a region out of a painted sprite (used to put the old rear artwork on the 3D body's back faces)
  const crops = new Map();
  function crop(src, x0, y0, x1, y1) {
    const key = src; if (!crops.has(key)) crops.set(key, {});
    const k = [x0, y0, x1, y1].join(','), c = crops.get(key);
    if (!c[k]) { const cv = document.createElement('canvas'); cv.width = x1 - x0; cv.height = y1 - y0; cv.getContext('2d').drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0); c[k] = cv; }
    return c[k];
  }
  const facePanel = (canvas, w, h, x, y, z, ry = 0) => {
    const m = new T.Mesh(unitPlane, spriteMat(canvas)); m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry; return m;
  };
  // Auto-rickshaw modelled on real Bajaj/TVS autos: narrow nose over one front wheel with a mudguard and
  // round headlamp, big framed windscreen with mirrors, a canvas hood whose roof curves down over the back
  // (with a rear window) to a rounded rear tub over the back wheels, open sides with the driver and a bench seat.
  let rearWindow = null;
  function rearWindowCanvas() {
    if (rearWindow) return rearWindow;
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#6b5a44'; x.beginPath(); x.roundRect(8, 8, 240, 112, 26); x.fill();
    x.fillStyle = '#2d4f8a'; x.fillRect(8, 92, 240, 28);                                     // bench backrest
    x.fillStyle = '#161616';
    for (const hx of [88, 168]) { x.beginPath(); x.ellipse(hx, 62, 22, 26, 0, 0, Math.PI * 2); x.fill(); x.fillRect(hx - 34, 84, 68, 36); }
    x.strokeStyle = '#0a0a0a'; x.lineWidth = 8; x.beginPath(); x.roundRect(8, 8, 240, 112, 26); x.stroke();
    return (rearWindow = c);
  }
  // an auto's windscreen is clear (you see the driver through it), unlike a car's dark tinted glass
  const autoScreen = nightify(new T.MeshPhongMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.32, shininess: 120, specular: '#ffffff', side: T.DoubleSide, depthWrite: false }));
  // what a driver swings: built along +x from the hand (x = 230), in the weapon's own colour
  function weaponMesh(wp) {
    const s = new T.Group(), c = (wp && wp.color) || '#c8a165', shape = (wp && wp.shape) || 'lathi';
    if (shape === 'bat') { s.add(cylX(15, 210, '#6d4c41', 300)); s.add(rbox(440, 34, 112, c, 620, 0, 0, 14)); }
    else if (shape === 'hockey') { s.add(cylX(15, 640, c, 500)); s.add(rbox(44, 150, 40, c, 815, -58, 0, 16)); }
    else if (shape === 'umbrella') { s.add(cylX(8, 640, '#8d6e63', 480)); s.add(cylX(30, 430, c, 540)); s.add(rbox(26, 70, 26, '#8d6e63', 170, -30, 0, 10)); }
    else if (shape === 'cane') { s.add(cylX(11, 540, c, 450)); s.add(sph('#d4af37', 50, 50, 50, 185, 0, 0)); }
    else if (shape === 'cloth') { s.add(rbox(620, 14, 84, c, 520, 0, 0, 6)); s.add(rbox(40, 16, 88, '#f5f5f5', 800, 0, 0, 6)); }
    else if (shape === 'shoe') { s.add(rbox(220, 64, 96, c, 320, 0, 0, 28)); s.add(sph(c, 70, 70, 60, 430, 26, 0)); }
    else if (shape === 'bag') { s.add(cylX(6, 200, '#555555', 320)); s.add(rbox(250, 180, 74, c, 530, 0, 0, 18)); }
    else if (shape === 'dandiya') for (const k of [-1, 1]) { const d = cylX(12, 360, c, 400, k * 26, 0); d.rotation.z += k * 0.07; s.add(d); s.add(cylX(13, 40, '#ffd21f', 330, k * 21, 0)); }
    else if (shape === 'hand') s.add(sph('#8d5524', 76, 84, 40, 245, 0, 0));
    else s.add(cylX(15, 640, c, 490));
    return s;
  }
  // the pool of light a neon-lit auto throws on the road: a soft additive disc in the neon's colour
  let neonTex = null;
  function neonGlowMat(color) {
    if (!neonTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128); neonTex = new T.CanvasTexture(c);
    }
    return new T.MeshBasicMaterial({ map: neonTex, color, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
  }
  // driver (optional): one of the rival cast (web/drivers.js). Their shirt, headgear, weapon and neon go on the auto.
  function autoModel(pal, rearCanvas, driver) {
    const g = new T.Group(), Wd = 560, L = 1060, R = L / 2;
    const look = driver ? driver.look : null, shirt = (look && look.shirt) || '#3949ab';
    const body = pal.body, upper = pal.trim, hood = pal.canopy;
    g.add(shadow(Wd, L));
    // the shell (tub, footboard, nose cowl, mudguard, dashboard, windscreen, canvas hood) is the Blender model
    // when it's loaded (models/auto.js), painted in this auto's colours; else it's built here
    const M = blenderModel('auto', { body: paint(body), trim: paint(upper), canopy: lambert(hood), glass: autoScreen, dark: lambert('#1a1a1a') });
    if (M) g.add(M);
    // chassis and footboard
    g.add(M ? box(Wd * 0.7, 40, L * 0.55, '#1c1c1c', 0, 120, R * 0.35) : box(Wd * 0.7, 40, L * 0.9, '#1c1c1c', 0, 120, 0));
    if (!M) {
    g.add(rbox(Wd * 0.92, 44, 420, body, 0, 150, -40, 18));
    // rounded rear tub over the back wheels, a thin trim line along its sides, bulged wheel arches
    g.add(rbox(Wd, 270, 480, body, 0, 265, R - 240, 40));
    for (const sx of [-1, 1]) {
      g.add(rbox(10, 22, 440, upper, sx * (Wd / 2 + 2), 330, R - 240, 5));
      g.add(rbox(56, 150, 310, body, sx * (Wd / 2 + 8), 205, R - 190, 28));
    }
    }
    // rear bench seat and backrest
    const lowY = M ? 50 : 0;                                         // the Blender body sits lower, like a real one
    g.add(rbox(Wd * 0.84, 90, 230, '#2d4f8a', 0, 440 - lowY, R - 390, 25));
    g.add(rbox(Wd * 0.84, 230, 60, '#2d4f8a', 0, 560 - lowY, R - 285, 22));
    // front: narrow rounded nose down to the front wheel, mudguard, dashboard panel in the upper colour
    if (!M) {
    g.add(rbox(260, 300, 200, body, 0, 300, -R + 110, 70));
    g.add(rbox(Wd * 0.86, 150, 170, upper, 0, 500, -R + 150, 55));
    const guard = new T.Mesh(halfTube, lambert(body, { side: T.DoubleSide })); guard.rotation.order = 'YXZ'; guard.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    guard.scale.set(290, 150, 290); guard.position.set(0, 118, -R + 70); g.add(guard);
    }
    // headlamp (in the black face panel on the Blender body) and indicators at the top corners of the face
    const lampY = M ? 340 : 380, lampZ = M ? -R + 16 : -R + 12;
    const lamp = cyl(46, 40, '#fff8d0', 0, lampY, lampZ); lamp.rotation.x = Math.PI / 2;
    lamp.material = headGlow; g.add(lamp); g.userData.headY = lampY;
    for (const sx of [-1, 1]) { const ind = new T.Mesh(unitSphere, lambert('#ff9800')); ind.scale.setScalar(34); ind.position.set(sx * (M ? 215 : 90), M ? 425 : 440, M ? -R + 34 : -R + 40); g.add(ind); }
    // windscreen (slightly raked) with a frame in the upper colour, and mirrors
    if (!M) {
    const ws = new T.Group(); ws.position.set(0, 575, -R + 205); ws.rotation.x = 0.16;
    ws.add(box(Wd * 0.82, 250, 12, lambert('#9fc3d6', { transparent: true, opacity: 0.45 }), 0, 125, 0));
    for (const sx of [-1, 1]) ws.add(rbox(26, 262, 30, upper, sx * Wd * 0.42, 125, 0, 12));
    ws.add(rbox(Wd * 0.86, 24, 30, upper, 0, 252, 0, 11));
    g.add(ws);
    }
    for (const sx of [-1, 1]) {
      const my = M ? 640 : 690, mz = M ? -R + 60 : -R + 190;
      g.add(cyl(5, 90, '#333', sx * (Wd * 0.48), my - 50, mz));
      const mir = new T.Mesh(unitSphere, lambert('#333')); mir.scale.set(60, 44, 18); mir.position.set(sx * (Wd * 0.52), my, mz); g.add(mir);
    }
    // canvas hood: a rounded roof that runs back and curves down into the back wall, which comes down onto the
    // tub (no deck showing behind it); closed sides around the back seat, a strip over the doorway, pillars
    if (!M) {
    g.add(rbox(Wd * 1.05, 80, L * 0.9, hood, 0, 850, R - L * 0.45, 40));
    g.add(rbox(Wd * 1.04, 520, 70, hood, 0, 640, R - 35, 40));                              // back wall
    for (const sx of [-1, 1]) {
      g.add(rbox(44, 520, 320, hood, sx * (Wd * 0.52 - 22), 640, R - 160, 22));            // sides behind the passengers
      g.add(rbox(30, 140, 480, hood, sx * (Wd * 0.52 - 15), 780, R - 520, 14));            // strip over the doorway
      g.add(cyl(14, 440, upper, sx * (Wd / 2 - 6), 610, -R + 240));                        // A-pillar
    }
    g.add(rbox(Wd * 1.05, 34, 100, hood, 0, 815, -R + 150, 16));                             // visor
    }
    // driver and passengers
    const drvZ = M ? -R + 300 : -R + 400;
    const drv = new T.Mesh(capsule(62, 60), lambert(shirt)); drv.position.set(0, 470 - lowY, drvZ); g.add(drv);
    const head = new T.Mesh(unitSphere, lambert('#8d5524')); head.scale.set(100, 115, 100); head.position.set(0, 620 - lowY, drvZ); g.add(head);
    // what the driver wears on their head
    const hg = look && look.headgear, hc = look && look.headgearColor, hy = 620 - lowY;
    if (hg === 'turban' || hg === 'safa') {
      g.add(sph(hc, 128, 86, 128, 0, hy + 44, drvZ + 4));                            // the wrap
      g.add(sph(hc, 70, 50, 60, 0, hy + 78, drvZ - 22));                             // its peak at the front
      if (hg === 'safa') g.add(rbox(34, 170, 16, hc, 30, hy - 40, drvZ + 62, 7));    // the tail down the back
    } else if (hg === 'cap') g.add(rbox(96, 40, 122, hc, 0, hy + 56, drvZ, 14));
    else if (hg === 'pallu') {
      g.add(sph(hc, 124, 128, 124, 0, hy + 10, drvZ + 16));                          // over the head
      g.add(rbox(150, 60, 70, hc, -40, hy - 110, drvZ + 20, 24));                    // and across the shoulder
    }
    const bar = cyl(16, 220, '#222', 0, 560 - lowY * 1.6, drvZ - 110); bar.rotation.z = Math.PI / 2; g.add(bar);   // handlebar
    for (const px of [-120, 120]) { const h = new T.Mesh(unitSphere, lambert('#2b2b2b')); h.scale.set(90, 100, 90); h.position.set(px, 600 - lowY, R - 380); g.add(h); }
    // wheels: two at the back under the tub, one in front under the mudguard
    g.add(wheel(125, 80, -Wd / 2 + 40, 125, R - 190));
    g.add(wheel(125, 80, Wd / 2 - 40, 125, R - 190));
    const pipe = cyl(16, 90, '#3a3a3a', 190, 95, R - 10); pipe.rotation.x = Math.PI / 2; g.add(pipe);   // tail pipe, under the right rear
    const fw = wheel(118, 70, 0, 118, -R + 70); g.add(fw); g.userData.frontWheel = fw;
    // painted rear of the tub (plate, HORN OK PLEASE, tail lights) and the rear window in the hood
    if (rearCanvas) g.add(facePanel(crop(rearCanvas, 10, 108, 230, 206), Wd - 40, 250, 0, 265, R + 1));
    g.add(facePanel(rearWindowCanvas(), 330, 165, 0, M ? 590 : 700, R + (M ? 9 : 1)));
    // the attack, shown while it happens: an arm swinging the driver's weapon (a lathi if nothing else), or, for
    // a kicker, a leg out of the side of the auto
    const weapon = driver ? driver.weapon : null, kick = !!weapon && weapon.kind === 'kick';
    const arm = new T.Group(); arm.position.set(0, (kick ? 330 : 560) - lowY, drvZ);
    const armPivot = new T.Group(); armPivot.position.x = Wd * 0.3;
    if (kick) {
      armPivot.add(rbox(470, 84, 84, weapon.color, 235, 0, 0, 34));
      armPivot.add(rbox(84, 150, 96, '#1a1a1a', 488, 34, 0, 30));                    // the shoe, toes up
    } else {
      armPivot.add(rbox(220, 44, 44, shirt, 110, 0, 0, 18));
      armPivot.add(weaponMesh(weapon));
    }
    arm.add(armPivot); arm.visible = false;
    g.userData.arm = arm; g.userData.armPivot = armPivot; g.userData.kick = kick; g.add(arm);
    // neon strip lights (a decked-out auto, on a night track): along the foot of the tub, round the edge of the
    // hood, and their glow on the road
    if (look && look.neon && theme && theme.night) {
      const nm = new T.MeshBasicMaterial({ color: look.neon }), hoodY = 808 - lowY;
      for (const sx of [-1, 1]) {
        g.add(box(14, 14, L * 0.5, nm, sx * (Wd / 2 + 4), 150, R - L * 0.27));
        g.add(box(12, 12, L * 0.78, nm, sx * (Wd * 0.525 + 4), hoodY, R - L * 0.42));
      }
      g.add(box(Wd * 0.94, 14, 14, nm, 0, 150, R + 6));
      g.add(box(Wd * 1.04, 12, 12, nm, 0, hoodY, R + 6));
      const glow = new T.Mesh(unitPlane, neonGlowMat(look.neon)); glow.rotation.x = -Math.PI / 2;
      glow.scale.set(Wd * 2.7, L * 1.9, 1); glow.position.y = 7; glow.renderOrder = 2; g.add(glow);
    }
    g.userData.size = { w: Wd, h: 890, l: L };
    return g;
  }
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

  // ---------------------------------------------------------------- car, bus and truck
  // Static parts of a model are built once per variant and baked: merged into one mesh per material, so a
  // detailed vehicle costs a handful of draw calls. Every copy shares the baked geometry (traffic comes and
  // goes all race, so nothing is allocated per vehicle). Moving parts (wheels, indicators) stay separate.
  const bakeCache = new Map();
  function mergeGeos(gs) {
    const out = new T.BufferGeometry();
    for (const [n, k] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const arr = new Float32Array(gs.reduce((s, g) => s + g.attributes[n].count * k, 0));
      let o = 0; for (const g of gs) { arr.set(g.attributes[n].array, o); o += g.attributes[n].count * k; }
      out.setAttribute(n, new T.BufferAttribute(arr, k));
    }
    out.computeBoundingSphere(); return out;
  }
  function bakeOnce(build) {
    {
      const src = build(), byMat = new Map(); src.updateMatrixWorld(true);
      src.traverse(o => {
        if (!o.isMesh) return;
        const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(geo);
      });
      return [...byMat].map(([mat, gs]) => { const geo = mergeGeos(gs); gs.forEach(g => g.dispose()); return [mat, geo]; });
    }
  }
  const lodSink = [];   // baked groups made while the current model was built (their LODs switch together)
  function baked(key, build) {
    let parts = bakeCache.get(key);
    if (!parts) {
      parts = [0, 1, 2].map(lv => { LO = lv; return bakeOnce(build); });
      LO = 0; bakeCache.set(key, parts);
    }
    const g = new T.Group();
    g.userData.lod = parts.map((p, lv) => {
      const lg = new T.Group(); for (const [mat, geo] of p) lg.add(new T.Mesh(geo, mat));
      lg.visible = lv === 0; g.add(lg); return lg;
    });
    lodSink.push(g);
    return g;
  }
  // everything solid casts sun shadows and takes them (not the contact-shadow blobs, glows or smoke)
  function castShadows(m) {
    if (!TIER.shadow) return;
    m.traverse(o => { if (o.isMesh && !o.userData.isShadow && !(o.material && o.material.transparent)) { o.castShadow = true; o.receiveShadow = true; } });
  }
  function setLod(model, level) {
    const u = model.userData;
    if (!u.lods || u.level === level) return;
    u.level = level;
    for (const g of u.lods) g.userData.lod.forEach((lg, lv) => { lg.visible = lv === level; });
  }
  // Physically based paint, glass and chrome that reflect the track's sky (an environment map rebuilt per
  // track in setTrack): clear-coated paint with a sharp highlight, dark glass that mirrors the sky at
  // glancing angles, polished chrome. gloss 0..1 (matt canvas or tarpaulin .. showroom paint).
  const envMats = [];
  const envMat = m => { envMats.push(m); return nightify(m); };
  const paint = (color, gloss = 60) => {
    const key = 'paint' + color + gloss, k = Math.min(1, gloss / 60);
    if (!matCache.has(key)) matCache.set(key, envMat(new T.MeshPhysicalMaterial({ color, metalness: 0.15 * k, roughness: 0.62 - 0.32 * k, clearcoat: TIER.clearcoat ? k : 0, clearcoatRoughness: 0.06 })));
    return matCache.get(key);
  };
  const glass = envMat(new T.MeshPhysicalMaterial({ color: '#0f1820', metalness: 0.55, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, side: T.DoubleSide }));
  const chrome = envMat(new T.MeshStandardMaterial({ color: '#e6e9ec', metalness: 0.8, roughness: 0.26 }));   // (a touch of its own silver, so sunsets don't turn it pink)
  const satin = envMat(new T.MeshStandardMaterial({ color: '#16181b', metalness: 0.3, roughness: 0.35 }));   // black trim, window surrounds
  // sky dome for reflections: the theme's sky gradient, a bright sun patch and a road-grey ground
  let envTarget = null, pmrem = null;
  function buildEnv(night) {
    if (!pmrem) pmrem = new T.PMREMGenerator(renderer);
    const sc = new T.Scene(), sky = theme.sky, geo = new T.SphereGeometry(100, 32, 16), col = [];
    const top = new T.Color(sky[0]), mid = new T.Color(sky[1]), hor = new T.Color(sky[2]), gnd = new T.Color(night ? '#0b0d14' : '#55585c'), c = new T.Color();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 100;
      if (y < 0) c.copy(hor).lerp(gnd, Math.min(1, -y * 6)); else if (y < 0.35) c.copy(hor).lerp(mid, y / 0.35); else c.copy(mid).lerp(top, (y - 0.35) / 0.65);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    sc.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const sunM = new T.Mesh(new T.SphereGeometry(night ? 3 : 9, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(theme.sun || '#fff').multiplyScalar(night ? 1 : 3) }));
    sunM.position.set(55, 60, 40); sc.add(sunM);
    if (envTarget) envTarget.dispose();
    envTarget = pmrem.fromScene(sc, 0.02);
    geo.dispose();
    for (const m of envMats) { m.envMap = envTarget.texture; m.envMapIntensity = night ? 0.35 : 1; m.needsUpdate = true; }
  }
  const tailGlow = lambert('#ff4033', { emissive: '#b00000', emissiveIntensity: 0.6 });

  // a side outline, [u, v] points (u forward, v up; bottom from the back to the front, then over the top back):
  // [u, v] a corner, [cu, cv, u, v] a curve through control point (cu, cv), [cu, cv, r] a wheel arch over (cu, cv)
  function outline(pts) {
    const s = new T.Shape();
    let v = 0;
    pts.forEach((p, i) => {
      if (!i) s.moveTo(p[0], p[1]);
      else if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else if (p.length === 3) { const a = Math.asin(Math.max(-1, Math.min(1, (v - p[1]) / p[2]))); s.absarc(p[0], p[1], p[2], Math.PI - a, a, true); } // arch leaves and rejoins the line it's cut from
      else s.lineTo(p[0], p[1]);
      v = p.length === 3 ? v : p[p.length - 1];
    });
    return s;
  }
  // the outline extruded across the width with rounded edges (the bevel grows the outline by bev all round)
  function profile(pts, width, bev, mat, bevSegs = 3) {
    const depth = Math.max(1, width - 2 * bev);
    const geo = new T.ExtrudeGeometry(outline(pts), { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: segs(bevSegs * 2, bevSegs, 1), curveSegments: segs(24, 10, 5) });
    geo.translate(0, 0, -depth / 2); geo.rotateY(Math.PI / 2);
    return new T.Mesh(geo, mat);
  }
  // a flat outline on the side of a body at x (side windows)
  function sidePane(pts, mat, x) {
    const geo = new T.ShapeGeometry(outline(pts), segs(12, 6, 3)); geo.rotateY(Math.PI / 2);
    const m = new T.Mesh(geo, mat); m.position.x = x; return m;
  }
  // a pane across the width between two outline points (top/front first), pushed out along its normal by off
  function slopePane(u1, v1, u2, v2, w, off, mat) {
    const du = u2 - u1, dv = v2 - v1, len = Math.hypot(du, dv), th = Math.atan2(-du, dv);
    const m = new T.Mesh(unitPlane, mat); m.scale.set(w, len, 1); m.rotation.x = th;
    m.position.set(0, (v1 + v2) / 2 + du / len * off, -(u1 + u2) / 2 + dv / len * off);
    return m;
  }
  // painted canvases: number plates, bus boards, truck art
  const canvases = new Map();
  function painted(key, w, h, draw) {
    if (!canvases.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); canvases.set(key, c); }
    return canvases.get(key);
  }
  const plate = (text, bg) => painted('plate' + text + bg, 160, 40, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
    x.fillStyle = '#111'; x.font = 'bold 24px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 1);
  });
  const lettering = (text, bg, fg, w, h, font) => painted('text' + text + bg + fg + w, w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  });
  // yellow and black hazard stripes (truck bumper)
  const hazard = () => painted('hazard', 256, 32, (x, w, h) => {
    x.fillStyle = '#f9c80e'; x.fillRect(0, 0, w, h); x.fillStyle = '#111';
    for (let i = -h; i < w; i += 32) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 16, h); x.lineTo(i + 16 + h, 0); x.lineTo(i + h, 0); x.fill(); }
  });
  // the decorated "crown" over a truck's windscreen: scallops, mirror dots and a band of diamonds
  const truckCrown = () => painted('crown', 512, 96, (x, w, h) => {
    x.fillStyle = '#c62828'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffd54f'; for (let i = 0; i < w; i += 32) { x.beginPath(); x.arc(i + 16, 0, 16, 0, Math.PI); x.fill(); }
    x.fillStyle = '#1b5e20'; x.fillRect(0, 44, w, 22);
    x.fillStyle = '#ffd54f'; for (let i = 8; i < w; i += 28) { x.beginPath(); x.moveTo(i, 55); x.lineTo(i + 10, 46); x.lineTo(i + 20, 55); x.lineTo(i + 10, 64); x.fill(); }
    for (let i = 20; i < w; i += 40) { x.fillStyle = '#e0f7fa'; x.beginPath(); x.arc(i, 80, 6, 0, 7); x.fill(); x.fillStyle = '#ff9800'; x.beginPath(); x.arc(i + 20, 80, 4, 0, 7); x.fill(); }
  });
  // a truck body's painted side: bordered panels, flowers at the ends and PUBLIC CARRIER
  const truckSide = () => painted('truckside', 1024, 300, (x, w, h) => {
    x.fillStyle = '#ffca28'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d32f2f'; x.lineWidth = 14; x.strokeRect(7, 7, w - 14, h - 14);
    x.strokeStyle = '#2e7d32'; x.lineWidth = 6; x.strokeRect(26, 26, w - 52, h - 52);
    x.strokeStyle = '#8d6e63'; x.lineWidth = 3; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(26, 26 + i * 41); x.lineTo(w - 26, 26 + i * 41); x.stroke(); }
    for (const cx of [110, w - 110]) {
      x.fillStyle = '#e91e63'; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; x.beginPath(); x.ellipse(cx + Math.cos(a) * 34, 150 + Math.sin(a) * 34, 26, 14, a, 0, 7); x.fill(); }
      x.fillStyle = '#ffeb3b'; x.beginPath(); x.arc(cx, 150, 20, 0, 7); x.fill();
    }
    x.fillStyle = '#c62828'; x.font = 'bold 84px Impact, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('PUBLIC CARRIER', w / 2, 150);
  });

  // amber indicator lamps at the four corners (blinked from the frame loop while the vehicle signals)
  const indOff = lambert('#8a5a12'), indOn = lambert('#ffb020', { emissive: '#ff9800', emissiveIntensity: 1 });
  function indicators(g, w, l, y, s = 1) {
    g.userData.ind = { '-1': [], '1': [] };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const m = new T.Mesh(unitSphere, indOff); m.scale.set(60 * s, 50 * s, 40 * s); m.position.set(sx * (w / 2 - 20), y, sz * (l / 2 + 6));
      g.add(m); g.userData.ind[sx].push(m);
    }
  }
  // round headlamp in a dark bezel, facing forward (-z)
  function roundLamp(s, r, x, y, z) {
    const bez = cyl(r * 1.25, 24, '#1a1a1a', x, y, z + 6); bez.rotation.x = Math.PI / 2; s.add(bez);
    const l = cyl(r, 20, '#fff', x, y, z - 6); l.material = headGlow; l.rotation.x = Math.PI / 2; s.add(l);
  }
  // wheel wells: a dark disc through the body behind each wheel, which reads as the arch from the side
  // (the wheels sit a little proud of it, so their rims show)
  const well = (s, r, width, y, z) => { const m = cyl(r, width, '#0e0e0e', 0, y, z); m.rotation.z = Math.PI / 2; s.add(m); };

  // Hatchback / compact sedan (Swift, i20, Dzire): a side profile with wheel arches, short sloping bonnet,
  // raked windscreen, roof and hatch glass; framed windows, grille, swept headlamps, tail lamps, plates.
  function carModel(color) {
    const Wd = 760, L = 1500, R = L / 2, g = new T.Group();
    g.add(baked('car' + color, () => {
      const s = new T.Group(), body = paint(color), dark = lambert('#141517'), trim = lambert('#2a2c30');
      // lower body: a deep bevel (50) gives round shoulders, corners and bumpers, and makes it 50 bigger all
      // round (so the arches here are 50 wider than they end up)
      s.add(profile([[-700, 220], [-700, 165, -665, 150], [-470, 128, 192], [288, 150], [480, 128, 192],
        [700, 160, 702, 220], [700, 270], [690, 312, 610, 320], [320, 352], [-540, 372], [-682, 372, -697, 300]], Wd - 10, 50, body, 5));
      // glasshouse, narrower than the body (tumblehome): black pillars and window surrounds under a roof
      // panel in the body colour
      const gw = Wd * 0.82;
      s.add(profile([[330, 370], [90, 590], [60, 612, 10, 614], [-420, 606], [-470, 604, -500, 580], [-620, 370]], gw, 30, satin));
      s.add(profile([[100, 586], [62, 616, 10, 620], [-420, 612], [-472, 610, -496, 584], [-200, 600]], gw + 6, 30, body));
      for (const sx of [-1, 1]) s.add(rbox(6, 10, 860, chrome, sx * (gw / 2 + 3), 404, 140, 4));    // chrome strip under the windows
      for (const sx of [-1, 1]) {
        s.add(sidePane([[265, 410], [92, 570], [-100, 578], [-100, 410]], glass, sx * (gw / 2 + 1)));
        s.add(sidePane([[-130, 410], [-130, 578], [-400, 574], [-470, 560], [-560, 410]], glass, sx * (gw / 2 + 1)));
      }
      s.add(slopePane(114, 568, 311, 388, gw - 90, 31, glass));        // windscreen
      s.add(slopePane(-608, 391, -514, 555, gw - 110, 31, glass));     // hatch glass
      // arches: dark inside, so you don't see through the body
      for (const z of [-480, 470]) s.add(box(Wd - 250, 180, 330, dark, 0, 200, z));
      s.add(box(Wd - 200, 60, L - 260, dark, 0, 110, 0));
      // front: grille, air dam, swept headlamps, plate
      s.add(rbox(Wd * 0.44, 50, 24, dark, 0, 252, -R - 4, 10));
      s.add(rbox(Wd * 0.6, 32, 24, dark, 0, 124, -R - 2, 10));
      for (const sx of [-1, 1]) {
        const hh = rbox(168, 66, 40, satin, sx * (Wd / 2 - 118), 306, -R + 8, 22); hh.rotation.y = -sx * 0.18; s.add(hh);   // housing
        const hl = rbox(70, 40, 40, headGlow, sx * (Wd / 2 - 90), 308, -R + 2, 16); hl.rotation.y = -sx * 0.18; s.add(hl); // projector
        const re = rbox(60, 36, 40, chrome, sx * (Wd / 2 - 158), 306, -R + 8, 14); re.rotation.y = -sx * 0.18; s.add(re);  // reflector
        const drl = rbox(130, 8, 40, headGlow, sx * (Wd / 2 - 118), 280, -R + 6, 4); drl.rotation.y = -sx * 0.18; s.add(drl); // DRL strip
        s.add(rbox(48, 22, 20, chrome, sx * (Wd / 2 - 205), 252, -R - 8, 8));   // grille chrome ends
      }
      s.add(facePanel(plate('MH 12 CR', '#fff'), 150, 38, 0, 184, -R - 8, Math.PI));
      // grille slats and badge, fog lamps in the air dam, wipers parked at the foot of the windscreen
      for (const y of [240, 252, 264]) s.add(rbox(Wd * 0.4, 5, 8, chrome, 0, y, -R - 16, 2));
      s.add(sph(chrome, 52, 26, 12, 0, 252, -R - 20));
      for (const sx of [-1, 1]) {
        const fb = cyl(30, 16, satin, sx * (Wd / 2 - 130), 140, -R + 2); fb.rotation.x = Math.PI / 2; s.add(fb);
        const fog = cyl(20, 14, headGlow, sx * (Wd / 2 - 130), 140, -R - 4); fog.rotation.x = Math.PI / 2; s.add(fog);
        const wip = rbox(230, 8, 12, satin, sx * 120 - 20, 404, -296, 3); wip.rotation.z = sx * 0.08; wip.rotation.x = 0.85; s.add(wip);
        s.add(rbox(8, 14, 40, lambert('#ffb020'), sx * ((Wd - 10) / 2 + 2), 330, -300, 4));    // side indicator repeater
      }
      // back: tail lamps wrapping the corners, bumper, plate
      for (const sx of [-1, 1]) {
        s.add(rbox(136, 84, 40, satin, sx * (Wd / 2 - 80), 345, R - 18, 18));            // tail lamp: dark bezel, bright lens
        s.add(rbox(112, 60, 40, tailGlow, sx * (Wd / 2 - 80), 345, R - 10, 14));
        s.add(rbox(30, 60, 90, tailGlow, sx * (Wd / 2 - 12), 345, R - 40, 12));
      }
      s.add(rbox(Wd * 0.92, 44, 28, trim, 0, 160, R - 6, 14));
      // hatch spoiler with a high-mount brake light, rear wiper, shark-fin aerial, exhaust tip, fuel flap
      const sp = rbox(gw - 40, 20, 70, body, 0, 614, 482, 9); sp.rotation.x = -0.12; s.add(sp);
      s.add(rbox(140, 10, 10, tailGlow, 0, 602, 545, 4));
      const rw = rbox(200, 8, 10, satin, -30, 430, 640, 3); rw.rotation.set(0.5, 0, 0.35); s.add(rw);
      const fin = rbox(22, 30, 80, satin, 0, 660, 380, 10); fin.rotation.x = 0.25; s.add(fin);
      const ex = cyl(17, 70, chrome, Wd / 2 - 170, 112, R - 8); ex.rotation.x = Math.PI / 2; s.add(ex);
      s.add(cylX(38, 3, satin, -((Wd - 10) / 2 + 1), 330, 350));
      // brake calipers inside the front wheels (they don't turn)
      for (const sx of [-1, 1]) s.add(rbox(24, 44, 26, '#5c5f63', sx * (Wd / 2 - 52), 128 + 36, -480 + 34, 8));
      s.add(facePanel(plate('MH 12 CR', '#fff'), 150, 38, 0, 250, R - 2));
      // sides: door shut lines, handles, mirrors, a rubbing strip
      for (const sx of [-1, 1]) {
        const x = sx * ((Wd - 10) / 2 + 1);
        s.add(box(3, 200, 5, dark, x, 255, -290));
        s.add(box(3, 200, 5, dark, x, 255, 110));
        s.add(box(3, 90, 5, dark, x, 310, 440));
        for (const z of [-40, 330]) s.add(rbox(8, 14, 60, chrome, x, 330, z, 4));
        s.add(rbox(10, 20, 640, satin, x, 205, -80, 6));
        s.add(rbox(60, 20, 30, satin, sx * (Wd / 2 + 4), 415, -290, 6));                // mirror arm
        s.add(rbox(28, 58, 86, body, sx * (Wd / 2 + 34), 432, -300, 14));               // mirror
      }
      return s;
    }));
    for (const z of [-480, 470]) for (const sx of [-1, 1]) g.add(wheel(128, 104, sx * (Wd / 2 - 66), 128, z, '#c3c8cd', 'alloy'));
    g.add(shadow(Wd, L));
    indicators(g, Wd, L, 300, 0.7); g.userData.headY = 306;
    g.userData.size = { w: Wd, h: 700, l: L };
    return g;
  }

  // ---------------------------------------------------------------- classic Indian cars
  // Shared shell: an extruded lower body with wheel arches, a black glasshouse under a body-coloured roof,
  // side windows, windscreen and rear glass, dark arch liners and underbody. Outlines are in (u forward,
  // v up); each grows by its bevel, so arches here are a bevel wider than they end up.
  function carShell(s, body, sp) {
    s.add(profile(sp.lower, sp.Wd - 10, sp.bev, body, 5));
    s.add(profile(sp.glass, sp.gw, sp.gbev, satin));
    s.add(profile(sp.roof, sp.gw + 6, sp.gbev, body));
    for (const sx of [-1, 1]) for (const w of sp.windows) s.add(sidePane(w, glass, sx * (sp.gw / 2 + 1)));
    s.add(slopePane(...sp.screen, sp.gw - 80, sp.gbev + 1, glass));
    s.add(slopePane(...sp.back, sp.gw - 90, sp.gbev + 1, glass));
    const dark = lambert('#141517');
    for (const z of sp.axles) s.add(box(sp.Wd - 230, sp.r * 1.45, sp.r * 2.6, dark, 0, sp.r * 1.55, z));
    s.add(box(sp.Wd - 200, 50, sp.L - 320, dark, 0, 100, 0));
  }
  // door shut lines, chrome handles and black door mirrors on both sides
  function carSides(s, sp, doors, handles, mirrorZ, mirrorY, beltY) {
    const dark = lambert('#141517');
    for (const sx of [-1, 1]) {
      const x = sx * ((sp.Wd - 10) / 2 + 1);
      for (const [z, y0, y1] of doors) s.add(box(3, y1 - y0, 5, dark, x, (y0 + y1) / 2, z));
      for (const z of handles) s.add(rbox(8, 12, 54, chrome, x, beltY - 30, z, 4));
      s.add(rbox(50, 18, 26, satin, sx * (sp.Wd / 2 + 2), mirrorY - 14, mirrorZ, 6));
      s.add(rbox(26, 50, 74, satin, sx * (sp.Wd / 2 + 26), mirrorY, mirrorZ - 6, 12));
    }
  }
  const rectLamp = (s, w, h, x, y, z, mat, bezel = chrome) => { s.add(rbox(w + 16, h + 16, 30, bezel, x, y, z + 6, 8)); s.add(rbox(w, h, 30, mat, x, y, z, 8)); };
  // a chrome ring facing forward (round headlamp surrounds)
  const ringZ = (s, R, t, x, y, z) => { const m = torusX(R, t, chrome); m.rotation.set(0, 0, 0); m.position.set(x, y, z); s.add(m); };
  const carWheels = (g, sp, rim, style) => { for (const z of sp.axles) for (const sx of [-1, 1]) g.add(wheel(sp.r, sp.tw, sx * (sp.Wd / 2 - sp.tw * 0.62), sp.r, z, rim, style)); };
  function finishCar(g, sp, headY, ind = 0.6) {
    g.add(shadow(sp.Wd, sp.L));
    indicators(g, sp.Wd, sp.L, headY - 40, ind); g.userData.headY = headY;
    g.userData.size = { w: sp.Wd, h: sp.h, l: sp.L };
    return g;
  }

  // Maruti 800: the small, boxy, upright hatchback; square headlamps, black bumpers, 12-inch wheels
  function m800Model(color) {
    const sp = { Wd: 620, L: 1300, h: 620, r: 108, tw: 80, bev: 34, gw: 534, gbev: 24, axles: [-440, 515],
      lower: [[-616, 200], [-616, 130, -580, 114], [-515, 108, 159], [440, 108, 159], [600, 114, 616, 170], [616, 250], [612, 300, 560, 310], [300, 330], [-560, 340], [-610, 340, -614, 280]],
      glass: [[300, 320], [140, 560], [120, 578, 90, 580], [-500, 576], [-540, 574, -555, 550], [-585, 320]],
      roof: [[120, 572], [100, 584, 80, 586], [-500, 582], [-532, 580, -545, 560], [-200, 575]],
      windows: [[[275, 345], [146, 540], [-60, 548], [-60, 345]], [[-90, 345], [-90, 548], [-500, 548], [-528, 520], [-552, 345]]],
      screen: [156, 536, 284, 344], back: [-582, 343, -558, 527] };
    const R = sp.L / 2, g = new T.Group();
    g.add(baked('m800' + color, () => {
      const s = new T.Group(), body = paint(color), dark = lambert('#141517');
      carShell(s, body, sp);
      for (const sx of [-1, 1]) {
        rectLamp(s, 104, 64, sx * (sp.Wd / 2 - 92), 238, -R - 2, headGlow);
        s.add(rbox(44, 26, 24, lambert('#ffb020'), sx * (sp.Wd / 2 - 30), 238, -R - 2, 6));      // corner indicator
        rectLamp(s, 66, 108, sx * (sp.Wd / 2 - 58), 262, R - 2, tailGlow, satin);
      }
      s.add(rbox(200, 44, 20, dark, 0, 238, -R - 4, 8));
      for (const y of [228, 248]) s.add(rbox(190, 4, 8, chrome, 0, y, -R - 12, 2));
      for (const z of [-R - 10, R + 10]) s.add(rbox(sp.Wd + 8, 46, 50, satin, 0, 150, z, 14));
      s.add(facePanel(plate('DL 2C 800', '#fff'), 130, 34, 0, 150, -R - 36, Math.PI));
      s.add(facePanel(plate('DL 2C 800', '#fff'), 130, 34, 0, 250, R + 2));
      for (const sx of [-1, 1]) s.add(rbox(6, 8, 590, chrome, sx * (sp.gw / 2 + 4), 584, 205, 3)); // rain gutters
      const wip = rbox(200, 8, 10, satin, -40, 350, -300, 3); wip.rotation.x = 0.6; s.add(wip);
      carSides(s, sp, [[-300, 150, 360], [60, 150, 360]], [40], -270, 380, 360);
      return s;
    }));
    carWheels(g, sp, '#c9cdd2', 'steel');
    return finishCar(g, sp, 238);
  }

  // Maruti Esteem: a crisp 90s three-box sedan; wide wraparound lamps, slim grille, black rubbing strips
  function esteemModel(color) {
    const sp = { Wd: 680, L: 1600, h: 620, r: 115, tw: 92, bev: 40, gw: 571, gbev: 26, axles: [-500, 540],
      lower: [[-760, 220], [-760, 150, -720, 130], [-540, 120, 170], [500, 120, 170], [740, 130, 760, 200], [758, 270], [745, 310, 680, 316], [360, 352], [-560, 372], [-735, 372], [-758, 360, -760, 300]],
      glass: [[360, 340], [110, 548], [80, 566, 30, 568], [-320, 562], [-370, 558, -400, 538], [-560, 360]],
      roof: [[110, 540], [80, 572, 30, 574], [-320, 568], [-372, 564, -398, 538], [-100, 556]],
      windows: [[[320, 380], [124, 536], [-90, 548], [-90, 380]], [[-120, 380], [-120, 548], [-320, 546], [-380, 520], [-515, 380]]],
      screen: [135, 527, 335, 361], back: [-544, 378, -416, 520] };
    const R = sp.L / 2, g = new T.Group();
    g.add(baked('esteem' + color, () => {
      const s = new T.Group(), body = paint(color), dark = lambert('#141517');
      carShell(s, body, sp);
      for (const sx of [-1, 1]) {
        const hl = rbox(176, 56, 36, headGlow, sx * (sp.Wd / 2 - 112), 292, -R + 4, 12); hl.rotation.y = -sx * 0.12; s.add(hl);
        s.add(rbox(60, 56, 36, lambert('#ffb020'), sx * (sp.Wd / 2 - 18), 292, -R + 24, 10));
        s.add(rbox(196, 62, 30, tailGlow, sx * (sp.Wd / 2 - 112), 340, R - 4, 10));
        s.add(rbox(160, 8, 34, satin, sx * (sp.Wd / 2 - 112), 312, R - 4, 3));
        s.add(rbox(14, 22, 900, satin, sx * ((sp.Wd - 10) / 2 + 3), 250, 0, 6));                   // rubbing strips
      }
      s.add(rbox(sp.Wd * 0.3, 40, 30, lambert('#7a1010'), 0, 340, R - 6, 8));                       // reflector panel
      s.add(rbox(sp.Wd * 0.34, 30, 20, dark, 0, 292, -R - 4, 8)); s.add(rbox(sp.Wd * 0.36, 40, 12, chrome, 0, 292, -R - 1, 6));
      for (const z of [-R - 4, R + 4]) s.add(rbox(sp.Wd * 0.92, 22, 26, satin, 0, 200, z, 6));
      s.add(facePanel(plate('MH 14 ES', '#fff'), 140, 36, 0, 160, -R - 12, Math.PI));
      s.add(facePanel(plate('MH 14 ES', '#fff'), 140, 36, 0, 262, R + 4));
      s.add(box(sp.Wd - 120, 3, 3, dark, 0, 400, 560));                                                // boot shut line
      const wip = rbox(230, 8, 10, satin, -40, 372, -350, 3); wip.rotation.x = 0.7; s.add(wip);
      carSides(s, sp, [[-330, 150, 380], [100, 150, 380], [440, 260, 380]], [-60, 300], -330, 410, 380);
      return s;
    }));
    carWheels(g, sp, '#c9cdd2', 'steel');
    return finishCar(g, sp, 292);
  }

  // Hindustan Ambassador: the rounded 50s shape; humped bonnet and boot, big chrome grille, round
  // headlamps in chrome rings, chrome bumpers with overriders, chrome hubcaps. The yellow one is a taxi.
  function ambyModel(color) {
    const sp = { Wd: 720, L: 1680, h: 720, r: 122, tw: 96, bev: 60, gw: 576, gbev: 40, axles: [-560, 525],
      lower: [[-780, 230], [-780, 160, -730, 140], [-525, 128, 190], [560, 128, 190], [760, 140, 780, 220], [780, 270], [775, 335, 700, 345], [520, 362, 330, 372], [-470, 380], [-735, 384, -778, 300]],
      glass: [[330, 360], [150, 590], [100, 636, 0, 640], [-300, 636], [-400, 630, -440, 590], [-560, 370]],
      roof: [[150, 584], [100, 646, 0, 650], [-300, 646], [-404, 640, -440, 590], [-100, 620]],
      windows: [[[295, 400], [168, 568], [140, 600, 60, 604], [-110, 604], [-110, 400]], [[-140, 400], [-140, 604], [-300, 602], [-380, 598, -415, 570], [-515, 400]]],
      screen: [168, 567, 312, 383], back: [-548, 392, -452, 568] };
    const R = sp.L / 2, g = new T.Group(), taxi = color === '#f2c200';
    g.add(baked('amby' + color, () => {
      const s = new T.Group(), body = paint(color), dark = lambert('#141517');
      // the Blender model (models/amby.js) when loaded: body, wings, haunches, glasshouse, roof, pillars, grille,
      // bumpers; lamps, plates, wing mirrors and the taxi board go on it here
      const M = blenderModel('amby', { body, chrome, glass, dark });
      if (M) {
        s.add(M);
        for (const sx of [-1, 1]) {
          roundLamp(s, 44, sx * 272, 306, -R + 26); ringZ(s, 54, 9, sx * 272, 306, -R + 14);          // headlamps in the wings
          s.add(sph(lambert('#ffb020'), 36, 28, 20, sx * 200, 232, -R - 14));                            // parking lamps
          s.add(rbox(60, 96, 30, tailGlow, sx * 285, 310, R - 38, 16));                                   // tail lamps
          spokeTo(s, [sx * 262, 420, -600], [sx * 262, 500, -610], 6, chrome);                           // wing mirrors
          s.add(sph(chrome, 56, 40, 20, sx * 262, 515, -612));
          for (const z of [-180, 250]) s.add(rbox(8, 12, 54, chrome, sx * 343, 380, z, 4));            // door handles
        }
        s.add(facePanel(plate(taxi ? 'WB 04 T' : 'DL 3C AM', taxi ? '#ffd21f' : '#fff'), 150, 38, 0, 202, -R - 66, Math.PI));
        s.add(facePanel(plate(taxi ? 'WB 04 T' : 'DL 3C AM', taxi ? '#ffd21f' : '#fff'), 150, 38, 0, 290, R + 4));
        if (taxi) {
          s.add(rbox(260, 70, 60, dark, 0, 742, -60, 12));
          s.add(facePanel(lettering('TAXI', '#111', '#ffd21f', 128, 40, 'bold 30px Arial'), 240, 60, 0, 742, -92, Math.PI));
          s.add(facePanel(lettering('TAXI', '#111', '#ffd21f', 128, 40, 'bold 30px Arial'), 240, 60, 0, 742, -28));
        }
        return s;
      }
      carShell(s, body, sp);
      s.add(rbox(10, sp.gbev * 2 + 300, 14, chrome, 0, 470, -235, 4));                               // split windscreen bar
      // big chrome grille with dark slats
      s.add(rbox(sp.Wd * 0.5, 140, 24, chrome, 0, 285, -R - 6, 22));
      for (let i = 0; i < 11; i++) s.add(rbox(10, 112, 14, dark, -150 + i * 30, 285, -R - 14, 3));
      for (const sx of [-1, 1]) {
        roundLamp(s, 46, sx * (sp.Wd / 2 - 92), 310, -R + 18);
        ringZ(s, 56, 9, sx * (sp.Wd / 2 - 92), 310, -R + 6);
        s.add(sph(lambert('#ffb020'), 40, 30, 20, sx * (sp.Wd / 2 - 100), 228, -R - 2));              // parking lamps
        s.add(rbox(66, 104, 30, tailGlow, sx * (sp.Wd / 2 - 66), 300, R + 4, 18));
        for (const z of [-R - 30, R + 30]) s.add(rbox(36, 90, 40, chrome, sx * 200, 205, z, 12));    // overriders
        s.add(rbox(10, 14, sp.L * 0.84, chrome, sx * ((sp.Wd - 10) / 2 + 4), 300, 0, 5));               // side chrome strip
      }
      for (const z of [-R - 16, R + 16]) s.add(rbox(sp.Wd + 30, 50, 50, chrome, 0, 180, z, 20));
      s.add(rbox(16, 10, 360, chrome, 0, 412, -560, 5));                                                // bonnet strip
      s.add(facePanel(plate(taxi ? 'WB 04 T' : 'DL 3C AM', taxi ? '#ffd21f' : '#fff'), 150, 38, 0, 180, -R - 44, Math.PI));
      s.add(facePanel(plate(taxi ? 'WB 04 T' : 'DL 3C AM', taxi ? '#ffd21f' : '#fff'), 150, 38, 0, 270, R + 2));
      s.add(rbox(80, 14, 20, chrome, 0, 340, R + 2, 6));                                                // boot handle
      if (taxi) {
        s.add(rbox(260, 70, 60, dark, 0, 715, -60, 12));
        s.add(facePanel(lettering('TAXI', '#111', '#ffd21f', 128, 40, 'bold 30px Arial'), 240, 60, 0, 715, -92, Math.PI));
        s.add(facePanel(lettering('TAXI', '#111', '#ffd21f', 128, 40, 'bold 30px Arial'), 240, 60, 0, 715, -28));
      }
      carSides(s, sp, [[-300, 150, 400], [-50, 150, 400], [300, 200, 400]], [-90, 260], -320, 430, 400);
      return s;
    }));
    carWheels(g, sp, '#e0e3e6', 'steel');
    return finishCar(g, sp, 310, 0.7);
  }

  // Maruti Omni: the tall one-box van; stubby nose, upright windscreen, sliding door, small wheels
  function omniModel(color) {
    const sp = { Wd: 620, L: 1330, h: 720, r: 100, tw: 76, bev: 40, gw: 570, gbev: 30, axles: [-375, 435],
      lower: [[-625, 220], [-625, 140, -590, 120], [-435, 112, 158], [375, 112, 158], [610, 120, 625, 190], [625, 330], [620, 372, 580, 380], [-600, 384], [-625, 380, -625, 330]],
      glass: [[585, 370], [470, 620], [455, 650, 410, 652], [-560, 652], [-600, 650, -605, 620], [-612, 370]],
      roof: [[470, 614], [455, 660, 410, 662], [-560, 662], [-600, 660, -605, 620], [0, 640]],
      windows: [[[560, 410], [476, 606], [250, 614], [250, 410]], [[220, 410], [220, 614], [-180, 614], [-180, 410]], [[-210, 410], [-210, 614], [-580, 614], [-585, 410]]],
      screen: [481, 595, 573, 395], back: [-611, 395, -606, 595] };
    const R = sp.L / 2, g = new T.Group();
    g.add(baked('omni' + color, () => {
      const s = new T.Group(), body = paint(color), dark = lambert('#141517');
      carShell(s, body, sp);
      for (const sx of [-1, 1]) {
        rectLamp(s, 108, 58, sx * (sp.Wd / 2 - 92), 300, -R - 2, headGlow);
        s.add(rbox(36, 30, 24, lambert('#ffb020'), sx * (sp.Wd / 2 - 26), 300, -R - 2, 6));
        rectLamp(s, 64, 100, sx * (sp.Wd / 2 - 52), 270, R - 2, tailGlow, satin);
        s.add(rbox(8, 12, 420, satin, sx * ((sp.Wd - 10) / 2 + 3), 400, 30, 4));                      // sliding door rail
      }
      s.add(rbox(150, 30, 20, dark, 0, 300, -R - 4, 8));
      for (const z of [-R - 8, R + 8]) s.add(rbox(sp.Wd + 6, 46, 44, satin, 0, 150, z, 14));
      s.add(facePanel(plate('MH 02 OM', '#fff'), 130, 34, 0, 150, -R - 32, Math.PI));
      s.add(facePanel(plate('MH 02 OM', '#fff'), 130, 34, 0, 240, R + 2));
      s.add(rbox(70, 14, 16, chrome, 0, 340, R + 2, 6));
      for (const sx of [-1, 1]) { const w = rbox(180, 8, 10, satin, sx * 110, 420, -R + 30, 3); w.rotation.z = sx * 0.15; s.add(w); }
      carSides(s, sp, [[-250, 150, 410], [-220, 150, 410], [180, 150, 410]], [-210, 160], -470, 440, 410);
      return s;
    }));
    carWheels(g, sp, '#c9cdd2', 'steel');
    return finishCar(g, sp, 300);
  }

  // Mini pickup (Tata Ace style, the "chhota hathi"): a little cab-forward cab and a drop-side bed
  // overloaded with jute sacks roped down
  function aceModel(color, bedColor) {
    const Wd = 660, L = 1670, R = L / 2, r = 98, g = new T.Group(), axles = [-635, 285];
    g.add(baked('ace' + color + bedColor, () => {
      const s = new T.Group(), body = paint(color), bed = paint(bedColor, 30), dark = lambert('#141517');
      // cab: one extruded shape with the front wheel arch, glass on it
      s.add(profile([[400, 150], [635, 105, 140], [790, 150], [795, 330], [790, 420, 770, 450], [690, 760], [660, 790, 620, 792], [420, 792], [400, 780, 400, 740]], Wd - 10, 40, body, 5));
      s.add(slopePane(696, 735, 764, 475, Wd - 120, 41, glass));
      for (const sx of [-1, 1]) s.add(sidePane([[735, 480], [684, 738], [440, 742], [440, 480]], glass, sx * ((Wd - 10) / 2 + 1)));
      s.add(box(Wd - 230, 140, 260, dark, 0, 150, -635));
      for (const sx of [-1, 1]) {
        rectLamp(s, 110, 66, sx * (Wd / 2 - 92), 300, -R - 2, headGlow, satin);
        s.add(rbox(50, 18, 26, satin, sx * (Wd / 2 + 4), 640, -720, 6));
        s.add(rbox(26, 70, 60, satin, sx * (Wd / 2 + 30), 640, -726, 10));
        s.add(box(3, 420, 5, dark, sx * ((Wd - 10) / 2 + 1), 520, -430));
        s.add(rbox(8, 12, 50, chrome, sx * ((Wd - 10) / 2 + 1), 470, -470, 4));
      }
      s.add(rbox(240, 40, 20, dark, 0, 300, -R - 4, 8));
      s.add(rbox(Wd + 10, 60, 50, satin, 0, 165, -R - 10, 16));
      s.add(facePanel(plate('MH 12 GA', '#ffd21f'), 140, 36, 0, 165, -R - 38, Math.PI));
      const wip = rbox(220, 8, 10, satin, -30, 480, -R + 70, 3); wip.rotation.x = 1.2; s.add(wip);
      // chassis, drop-side bed, rear mudguards, tail lamps
      s.add(box(Wd * 0.6, 60, L - 300, '#1a1a1a', 0, 230, 80));
      const bz = (R - 360) / 2 + 180, bl = R + 360 - 20;
      s.add(rbox(Wd, 40, bl, bed, 0, 350, bz, 8));
      for (const sx of [-1, 1]) {
        s.add(rbox(24, 210, bl, bed, sx * (Wd / 2 - 12), 475, bz, 6));
        for (let i = 1; i < 4; i++) s.add(rbox(6, 210, 14, satin, sx * (Wd / 2 + 1), 475, bz - bl / 2 + i * bl / 4, 3));
        s.add(rbox(130, 20, 260, satin, sx * (Wd / 2 - 70), 215, axles[1], 8));
        s.add(rbox(70, 50, 24, tailGlow, sx * (Wd / 2 - 70), 290, R + 4, 8));
      }
      s.add(rbox(Wd, 380, 24, bed, 0, 560, -360, 6));                                                   // headboard
      for (const sx of [-1, 0, 1]) s.add(rbox(16, 260, 16, satin, sx * (Wd / 2 - 20), 880, -360, 4));  // ladder rack
      s.add(rbox(Wd, 16, 16, satin, 0, 1000, -360, 4));
      s.add(rbox(Wd, 210, 24, bed, 0, 475, R - 12, 6));                                                 // tailgate
      s.add(facePanel(lettering('HORN OK PLEASE', bedColor, '#fff', 256, 48, 'bold 30px Impact, Arial Black, sans-serif'), Wd - 80, 130, 0, 490, R + 2));
      s.add(facePanel(plate('MH 12 GA', '#ffd21f'), 140, 36, 0, 300, R + 4));
      // the load: jute sacks heaped well above the sides, roped over
      const jute = lambert('#c8a165'), jute2 = lambert('#b38b52'), rope = lambert('#e0c080');
      const rows = q(5, 4, 2), cols = 3;
      for (let layer = 0; layer < 3; layer++) for (let i = 0; i < rows - layer; i++) for (let j = 0; j < cols - (layer > 1 ? 1 : 0); j++) {
        const z = bz - bl / 2 + 140 + (i + layer * 0.5) * (bl - 280) / Math.max(1, rows - 1), x = (j - (cols - (layer > 1 ? 1 : 0) - 1) / 2) * 200;
        const sk = rbox(200, 120, 230, (i + j + layer) % 2 ? jute : jute2, x, 430 + layer * 115, z, 50);
        sk.rotation.y = ((i * 7 + j * 3 + layer) % 5 - 2) * 0.06; s.add(sk);
      }
      for (let i = 0; i < 3; i++) s.add(rbox(Wd + 20, 10, 12, rope, 0, 790, bz - 300 + i * 300, 4));
      return s;
    }));
    g.add(wheel(r, 78, -(Wd / 2 - 50), r, axles[0], '#c9cdd2'));
    g.add(wheel(r, 78, Wd / 2 - 50, r, axles[0], '#c9cdd2'));
    for (const sx of [-1, 1]) g.add(wheel(r, 78, sx * (Wd / 2 - 70), r, axles[1], '#c9cdd2'));
    g.add(shadow(Wd, L));
    indicators(g, Wd, L, 260, 0.6); g.userData.headY = 300;
    g.userData.size = { w: Wd, h: 1010, l: L };
    return g;
  }

  // ---------------------------------------------------------------- tractor and trolley
  // a half-ring mudguard over a big wheel (extruded across the width)
  function fender(R0, R1, width, mat) {
    const sh = new T.Shape(); sh.absarc(0, 0, R1, Math.PI, 0, true); sh.absarc(0, 0, R0, 0, Math.PI, false);
    const b = 10, depth = width - 2 * b;
    const geo = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: segs(3, 2, 1), curveSegments: segs(32, 14, 8) });
    geo.translate(0, 0, -depth / 2); geo.rotateY(Math.PI / 2);
    return new T.Mesh(geo, mat);
  }
  // Tractor (Mahindra / Swaraj style) towing a trolley overloaded with the local crop: sugarcane piled
  // high and hanging out the back, or a huge netted bale of wheat straw (bhusa) bulging over the sides.
  function tractorModel(look) {
    const L = 3800, R = L / 2, Wt = 880, Wb = look.crop === 'hay' ? 1300 : 1100, g = new T.Group();
    const zRear = -R + 1140, zFront = -R + 360, trolleyZ = [-160, 1500], tz = (trolleyZ[0] + trolleyZ[1]) / 2, tl = trolleyZ[1] - trolleyZ[0];
    g.add(baked('tractor' + look.color + look.crop, () => {
      const s = new T.Group(), body = paint(look.color, 40), dark = lambert('#141517'), engine = lambert('#3a3d40'), wood = lambert('#6d4c41');
      // tractor: engine block, bonnet, grille with headlamps, exhaust stack, fenders, seat, steering wheel
      s.add(rbox(300, 260, 760, engine, 0, 430, -R + 520, 30));
      s.add(rbox(380, 300, 780, body, 0, 690, -R + 470, 80));
      s.add(rbox(330, 300, 30, body, 0, 680, -R + 70, 14));                                                 // nose
      s.add(rbox(250, 250, 24, dark, 0, 670, -R + 58, 10));                                                 // grille
      for (let i = 0; i < 7; i++) s.add(rbox(10, 230, 10, chrome, -105 + i * 35, 670, -R + 46, 3));         // vertical chrome slats
      for (const sx of [-1, 1]) {
        const hl = cyl(44, 40, '#fff', sx * 200, 640, -R + 110); hl.material = headGlow; hl.rotation.x = Math.PI / 2; s.add(hl);   // headlamps on the sides
        ringZ(s, 52, 9, sx * 200, 640, -R + 92);
      }
      s.add(rbox(420, 110, 120, body, 0, 380, -R + 40, 14));                                                // front weight / bumper
      s.add(rbox(380, 40, 14, lambert('#ffd21f'), 0, 380, -R - 22, 6));
      s.add(rbox(240, 50, 300, dark, 0, 860, -R + 450, 20));                                                // bonnet top vent
      spokeTo(s, [140, 820, -R + 700], [140, 1180, -R + 700], 26, satin);                                   // exhaust stack
      s.add(cyl(32, 40, satin, 140, 1190, -R + 700));
      s.add(rbox(240, 200, 300, engine, 0, 620, zRear - 40, 30));                                            // gearbox under the seat
      for (const sx of [-1, 1]) {
        const f = fender(345, 380, 230, body); f.position.set(sx * (Wt / 2 - 95), 330, zRear); s.add(f);
        s.add(rbox(230, 14, 320, body, sx * (Wt / 2 - 95), 720, zRear + 80, 6));                             // fender flat top
        s.add(rbox(180, 30, 220, satin, sx * 260, 470, zRear - 380, 8));                                     // footboards
      }
      s.add(rbox(300, 60, 260, dark, 0, 870, zRear + 40, 24));                                               // seat
      s.add(rbox(300, 200, 50, dark, 0, 980, zRear + 170, 20));
      // fuel tank and dashboard between bonnet and seat, a short raked steering column, the wheel nearly flat
      // and tilted towards the driver, both hands on the rim
      s.add(rbox(320, 150, 230, body, 0, 790, -R + 950, 50));
      s.add(rbox(300, 120, 60, dark, 0, 820, -R + 1060, 16));
      const wy = 1010, wz = zRear - 250, tilt = 0.6;
      spokeTo(s, [0, 850, -R + 1060], [0, wy, wz], 16, satin);
      const sw = new T.Mesh(new T.TorusGeometry(115, 13, segs(8, 6, 4), segs(40, 18, 10)), satin); sw.rotation.x = -Math.PI / 2 + tilt; sw.position.set(0, wy, wz); s.add(sw);
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + Math.PI / 2; spokeTo(s, [0, wy, wz], [Math.cos(a) * 110, wy + Math.sin(a) * 110 * Math.sin(tilt), wz - Math.sin(a) * 110 * Math.cos(tilt)], 7, satin); }
      rider(s, { shirt: '#f5f5f5', helmet: look.pagri, bare: true }, 900, zRear + 40, [100, wy + 10, wz + 10], [250, 500, zRear - 380]);
      // a second man riding along on the left fender, hands on his knees
      const mate = new T.Group(); mate.position.x = -(Wt / 2 - 95);
      rider(mate, { shirt: '#795548', helmet: '#5d4037', bare: true }, 735, zRear + 70, [100, 900, zRear], [70, 430, zRear - 80], true);
      s.add(mate);
      // hitch and trolley: chassis, wooden floor, painted sides, tail reflectors
      s.add(box(80, 60, 520, satin, 0, 420, trolleyZ[0] - 140));
      s.add(rbox(900, 60, tl, satin, 0, 420, tz, 10));
      s.add(rbox(1060, 50, tl, wood, 0, 475, tz, 8));
      for (const sx of [-1, 1]) {
        s.add(rbox(30, 240, tl, paint('#1565c0', 20), sx * 515, 620, tz, 8));
        s.add(facePanel(painted('trolley', 512, 96, (x, w, h) => {
          x.fillStyle = '#1565c0'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
          x.fillStyle = '#ffd21f'; for (let i = 40; i < w; i += 80) { x.beginPath(); x.arc(i, h / 2, 14, 0, 7); x.fill(); }
        }), tl - 80, 200, sx * 532, 620, tz, sx * Math.PI / 2));
        s.add(rbox(90, 40, 20, tailGlow, sx * 440, 560, trolleyZ[1] + 14, 6));
      }
      s.add(rbox(1060, 240, 30, paint('#1565c0', 20), 0, 620, trolleyZ[0] + 15, 8));
      s.add(rbox(1060, 240, 30, paint('#1565c0', 20), 0, 620, trolleyZ[1] - 15, 8));
      for (let i = 0; i < 5; i++) s.add(rbox(80, 30, 8, i % 2 ? lambert('#f5f5f5') : tailGlow, -320 + i * 160, 700, trolleyZ[1] + 4, 4));
      // the load
      if (look.crop === 'hay') {
        // a giant sack of straw (bhusa) bulging in two lobes, wider than the trolley; bamboo poles lashed
        // along the top edges with a smaller sack heaped between them; rope straps down the sides
        const sack = lambert('#ddd2b0'), sack2 = lambert('#ece6d2'), rope = lambert('#3e2f22'), bamboo = lambert('#a0784a');
        const lz = tz - 60, ll = tl + 400, top = 1625, px = Wb * 0.3;     // poles sit on the shoulders of the lobes
        for (const sx of [-1, 1]) s.add(sph(sack, Wb * 0.56, 980, ll, sx * Wb * 0.23, 1150, lz));
        s.add(rbox(Wb * 0.7, 560, ll - 120, sack, 0, 1340, lz, 220));
        s.add(box(10, 860, 10, rope, 0, 1150, lz - ll / 2 + 30));                                           // seam
        for (let i = 0; i < q(4, 2, 1); i++) s.add(sph(sack2, Wb * 0.45, 220, ll / 4, (i % 2 ? 1 : -1) * 120, top + 20, lz - ll / 2 + ll / 8 + i * ll / 4));
        for (const sx of [-1, 1]) {
          const pole = cyl(22, ll + 120, bamboo, sx * px, top, lz); pole.rotation.x = Math.PI / 2; s.add(pole);
          for (let i = 0; i < q(8, 4, 2); i++) {                                                                // rope straps
            const z = lz - ll / 2 + 120 + i * (ll - 240) / Math.max(1, q(8, 4, 2) - 1);
            spokeTo(s, [sx * px, top, z], [sx * Wb * 0.47, 1440, z], 7, rope);                             // hugging the bulge
            spokeTo(s, [sx * Wb * 0.47, 1440, z], [sx * Wb * 0.52, 1150, z], 7, rope);
            spokeTo(s, [sx * Wb * 0.52, 1150, z], [sx * 525, 740, z], 7, rope);
          }
        }
        for (const z of [lz - ll / 2 + 40, lz + ll / 2 - 40]) { const c = cyl(18, px * 2 + 80, bamboo, 0, top, z); c.rotation.z = Math.PI / 2; s.add(c); }
      } else {
        const canes = [lambert('#9aa83c'), lambert('#7f8f2a'), lambert('#6b3f4f'), lambert('#8c9a34')], leaf = lambert('#4caf50'), leaf2 = lambert('#2e7d32');
        const len = 2000, z0 = trolleyZ[0] + 60 + len / 2;
        if (LO === 2) s.add(rbox(Wb, 640, len, canes[0], 0, 1020, z0, 160));
        else {
          const per = [18, 17, 16, 15, 13, 11, 9, 6].map(n => Math.round(n * (LO ? 0.5 : 1)));   // heaped well over the sides
          per.forEach((n, layer) => {
            const rr = Wb / per[0] / 2;
            for (let i = 0; i < n; i++) {
              const x = (i - (n - 1) / 2) * rr * 2, k = layer * 31 + i * 7;
              const c = cyl(rr * 0.95, len + (k % 5) * 60, canes[k % 4], x, 800 + layer * rr * 1.7, z0 + (k % 7 - 3) * 25);
              c.rotation.x = Math.PI / 2; s.add(c);
            }
          });
        }
        for (let i = 0; i < q(9, 5, 3); i++) s.add(sph(i % 2 ? leaf : leaf2, 300, 160, 420, -400 + i * 100, 950 + (i % 3) * 110, z0 + len / 2 - 60));    // leafy tops
        for (let i = 0; i < 3; i++) s.add(rbox(Wb * 0.6, 12, 14, lambert('#e0c080'), 0, 1200, z0 - 600 + i * 500, 4));
      }
      return s;
    }));
    for (const sx of [-1, 1]) {
      g.add(wheel(330, 210, sx * (Wt / 2 - 95), 330, zRear, look.rim, 'lug'));
      g.add(wheel(170, 120, sx * (Wt / 2 - 160), 170, zFront, look.rim, 'lug'));
      g.add(wheel(200, 140, sx * 470, 200, tz + 200, '#5a5d60'));
    }
    g.add(shadow(Math.max(Wt, Wb), L));
    g.userData.headY = 760;
    g.userData.size = { w: Wb, h: look.crop === 'hay' ? 1760 : 1400, l: L };
    return g;
  }
  // all the car looks traffic uses: the modern hatchback and the classics
  function carModelFor(look) {
    if (!look) return carModel('#e9e9ea');
    return look.model === 'm800' ? m800Model(look.color) : look.model === 'esteem' ? esteemModel(look.color) : look.model === 'amby' ? ambyModel(look.color)
      : look.model === 'omni' ? omniModel(look.color) : look.model === 'ace' ? aceModel(look.color, look.bed) : carModel(look.color);
  }

  // 1990s city bus in its city's transport undertaking livery (look: operator, colours, decks, route):
  // BEST red-and-cream single- and double-deckers in Mumbai, DTC and Blueline in Delhi, APSRTC in
  // Hyderabad, Pallavan (PTC) in Chennai. Flat front with a split windscreen and wipers, a painted
  // destination board, twin round headlamps, sliding windows with frames, a door on the kerb (left) side,
  // route number at the back. No roof luggage: that's for long-distance buses.
  const BUS_DEFAULT = { op: 'CITY BUS', body: '#c62828', band: '#f3e2b3', stripe: '#f9a825', roof: '#f3e2b3', deck: 1, dest: 'CITY', route: '1', plate: 'MH 01 BS' };
  // Packed like a 90s city bus at rush hour: a head at every window, elbows out of the open sliding
  // windows, and people hanging off the footboard at the open front door, one hand on the rail.
  const SKINS = ['#8d5524', '#a0673a', '#6f4320', '#c68642'], SHIRTS = ['#f5f5f5', '#3949ab', '#c62828', '#7cb342', '#ffb300', '#8e24aa', '#90a4ae', '#5d4037'];
  function busCrowd(s, Wd, R, bands) {
    const hair = lambert('#1a1a1a'), step = q(150, 300, 0);
    let k = 0;
    for (const sx of [-1, 1]) bands.forEach((y, deck) => {
      for (let z = -R + (deck === 0 && sx < 0 ? 760 : 440); z < R - 140; z += step) {
        k++; if (k % 7 === 3) continue;                                                     // the odd empty seat
        const x = sx * (Wd / 2 - 34), hy = y - 30 + (k % 3) * 18, skin = lambert(SKINS[k % 4]);
        s.add(sph(skin, 110, 130, 110, x, hy, z));
        s.add(sph(hair, 118, 70, 118, x, hy + 42, z + 6));
        if (k % 4 === 1) s.add(limb([sx * (Wd / 2 - 30), y - 120, z + 40], [sx * (Wd / 2 + 50), y - 150, z + 70], 24, skin));   // elbow out
      }
    });
    // footboard: people standing on the step, leaning out of the open door holding the rail
    const bx = -(Wd / 2 + 20), dz = [-R + 260, -R + 380, -R + 500, -R + 330];
    dz.slice(0, q(4, 3, 0)).forEach((z, i) => {
      const lean = 60 + i * 35, shirt = lambert(SHIRTS[(i * 3 + 1) % SHIRTS.length]), skin = lambert(SKINS[i % 4]), pants = lambert(i % 2 ? '#2f3542' : '#5d4037');
      const hip = [bx - 20, 640, z], neck = [bx - 20 - lean, 990, z + 10], top = i === 3 ? 60 : 0;
      for (const f of [-40, 40]) s.add(limb([bx + 10, 230 + top, z + f], hip, 40, pants));
      s.add(limb(hip, neck, 80, shirt));
      s.add(sph(skin, 115, 135, 115, neck[0] - 15, 1090, z + 10));
      s.add(sph(lambert('#1a1a1a'), 120, 70, 120, neck[0] - 15, 1135, z + 14));
      s.add(limb([neck[0], 950, z], [-(Wd / 2 - 20), 1080, z - 70], 26, shirt));                // hand on the door rail
      s.add(limb([neck[0], 940, z + 20], [neck[0] - 150, 860 + i * 30, z + 110], 26, shirt));   // the other one out
    });
    s.add(rbox(14, 14, 380, chrome, -(Wd / 2 - 12), 1080, -R + 400, 5));                     // door rail
  }
  function busModel(look = BUS_DEFAULT) {
    const Wd = 1120, L = 3200, R = L / 2, g = new T.Group(), zf = -R + 560, zr = R - 800, dd = look.deck === 2;
    const top = dd ? 1680 : 1185;                                            // roof height
    g.add(baked('bus' + JSON.stringify(look), () => {
      const s = new T.Group(), body = paint(look.body, 30), band = paint(look.band, 30), roof = paint(look.roof, 30), dark = lambert('#141517');
      for (const z of [zf, zr]) well(s, 228, Wd + 4, 190, z);
      s.add(rbox(Wd - 40, 70, L - 40, dark, 0, 175, 0, 20));                              // skirt
      s.add(rbox(Wd, 560, L, body, 0, 450, 0, 60));                                       // lower body
      s.add(rbox(Wd + 8, 64, L + 8, band, 0, 640, 0, 24));                                // belt band
      s.add(rbox(Wd + 10, 16, L + 10, paint(look.stripe), 0, 590, 0, 8));                // pinstripe
      // window bands (two on a double-decker, with a panel in the livery between the decks)
      const bands = dd ? [890, 1385] : [890];
      for (const y of bands) s.add(rbox(Wd - 16, 330, L - 16, glass, 0, y, 0, 40));
      if (dd) {
        s.add(rbox(Wd, 180, L, body, 0, 1140, 0, 40));
        s.add(rbox(Wd + 8, 40, L + 8, band, 0, 1110, 0, 16));
        s.add(rbox(Wd, 170, L, roof, 0, 1595, 0, 90));
      } else s.add(rbox(Wd, 150, L, roof, 0, 1110, 0, 70));
      // window frames and pillars on both sides, and the sliding-window rails
      for (const sx of [-1, 1]) {
        const x = sx * (Wd / 2 - 6);
        bands.forEach((y, deck) => {
          const from = deck === 0 && sx < 0 ? -R + 720 : -R + 400;
          for (let z = from; z < R - 100; z += 300) s.add(rbox(14, 330, 50, body, x, y, z, 6));
          s.add(rbox(14, 14, L - 300, chrome, x + sx * 2, y + 70, 60, 5));
        });
        s.add(facePanel(lettering(look.op, look.body, look.band, 512, 64, 'bold 40px Arial'), 1000, 125, sx * (Wd / 2 + 1), 440, 200, sx * Math.PI / 2));
      }
      // BEST double-deckers: the open rear platform on the kerb side, with the staircase up to the top deck and
      // a grab pole at the edge
      if (dd) {
        const pz = R - 360, px = -(Wd / 2 - 150);
        s.add(rbox(300, 860, 560, lambert('#1c1c1c'), px, 610, pz, 10));                          // the open platform
        for (let i = 0; i < 6; i++) s.add(rbox(250, 30, 90, lambert('#5d4037'), px + 10, 230 + i * 150, pz + 220 - i * 85, 6));   // stairs
        spokeTo(s, [-(Wd / 2 + 6), 190, pz - 270], [-(Wd / 2 + 6), 1040, pz - 270], 12, chrome);    // grab pole
        s.add(rbox(14, 14, 560, chrome, -(Wd / 2 + 4), 1040, pz, 5));
      }
      // front door on the kerb side (-x): glass leaf with frame and a step
      if (!look.crowd) s.add(rbox(10, 820, 380, glass, -(Wd / 2 + 2), 600, -R + 400, 6));     // (crowded: door open)
      for (const z of [-R + 205, -R + 595]) s.add(rbox(14, 830, 20, chrome, -(Wd / 2 + 4), 600, z, 5));
      s.add(rbox(16, 20, 380, chrome, -(Wd / 2 + 5), 640, -R + 400, 5));
      s.add(rbox(120, 40, 360, dark, -(Wd / 2 - 40), 190, -R + 400, 10));
      // front: windscreen divider(s), wipers, destination board, grille, headlamps, bumper, plate
      for (const y of bands) s.add(rbox(50, 330, 24, body, 0, y, -R + 4, 10));
      for (const sx of [-1, 1]) { const w = box(10, 280, 8, dark, sx * 200, 820, -R - 2); w.rotation.z = sx * 0.5; s.add(w); }
      const boardY = dd ? 1140 : 1110, board = lettering(`${look.route}  ${look.dest}`, '#111', '#fff3c4', 384, 48, 'bold 28px Arial');
      s.add(rbox(Wd * 0.8, 100, 24, dark, 0, boardY, -R - 2, 10));
      s.add(facePanel(board, Wd * 0.76, 84, 0, boardY, -R - 16, Math.PI));
      s.add(rbox(Wd * 0.46, 150, 24, dark, 0, 440, -R - 2, 12));
      for (let i = 0; i < 4; i++) s.add(rbox(Wd * 0.44, 10, 10, chrome, 0, 390 + i * 34, -R - 14, 4));
      for (const sx of [-1, 1]) for (const dx of [150, 285]) roundLamp(s, 52, sx * (Wd / 2 - dx), 420, -R - 6);
      s.add(rbox(Wd + 20, 90, 70, dark, 0, 245, -R - 10, 25));
      s.add(facePanel(plate(look.plate, '#ffd21f'), 190, 48, 0, 330, -R - 8, Math.PI));
      // back: route number board, tail lamps, plate, bumper
      s.add(rbox(Wd + 20, 90, 70, dark, 0, 245, R + 10, 25));
      s.add(rbox(260, 110, 24, dark, 0, boardY, R + 2, 10));
      s.add(facePanel(lettering(look.route, '#111', '#fff3c4', 128, 48, 'bold 36px Arial'), 230, 90, 0, boardY, R + 16));
      for (const sx of [-1, 1]) { s.add(rbox(70, 120, 24, tailGlow, sx * (Wd / 2 - 90), 400, R + 2, 10)); s.add(rbox(60, 34, 24, lambert('#ffa000'), sx * (Wd / 2 - 90), 310, R + 2, 8)); }
      s.add(facePanel(plate(look.plate, '#ffd21f'), 190, 48, 0, 340, R + 4));
      // big mirrors on arms out front, roof hatches, amber side markers
      for (const sx of [-1, 1]) {
        spokeTo(s, [sx * (Wd / 2 - 10), 1060, -R + 30], [sx * (Wd / 2 + 110), 1010, -R - 110], 9, satin);
        s.add(rbox(28, 230, 90, satin, sx * (Wd / 2 + 118), 900, -R - 118, 12));
        s.add(rbox(6, 210, 76, glass, sx * (Wd / 2 + 118) + sx * -16, 900, -R - 118, 3));
        for (let i = 0; i < 4; i++) s.add(rbox(10, 22, 44, lambert('#ffa000'), sx * (Wd / 2 + 2), 250, -R + 900 + i * 600, 5));
      }
      for (const z of [-R + 500, R - 700]) s.add(rbox(240, 30, 200, '#9e9e9e', 0, top + 10, z, 12));
      if (look.crowd && LO < 2) busCrowd(s, Wd, R, bands);
      return s;
    }));
    for (const z of [zf, zr]) for (const sx of [-1, 1]) g.add(wheel(190, 150, sx * (Wd / 2 - 54), 190, z, '#d5d8dc'));
    g.add(shadow(Wd, L));
    indicators(g, Wd, L, 330); g.userData.headY = 420;
    g.userData.size = { w: Wd, h: top + 20, l: L };
    return g;
  }

  // Indian goods truck (Tata / Leyland style): flat-fronted cab with a painted crown over the split
  // windscreen, chrome grille, round headlamps and a hazard-striped bumper; a high-sided painted body with
  // PUBLIC CARRIER on it and a roped tarpaulin over the load; HORN OK PLEASE on the tailgate, mud flaps.
  function truckModel(rearCanvas) {
    const Wd = 1120, L = 2800, R = L / 2, g = new T.Group(), axles = [-R + 400, R - 720, R - 330];
    g.add(baked('truck', () => {
      const s = new T.Group(), cab = paint('#f4a300', 40), dark = lambert('#141517'), bodyC = paint('#ffca28', 20);
      well(s, 232, Wd + 4, 195, axles[0]);
      s.add(box(Wd * 0.62, 90, L - 200, '#1a1a1a', 0, 250, 80));                           // chassis
      // cab
      s.add(rbox(Wd, 820, 760, cab, 0, 790, -R + 380, 110));
      s.add(rbox(Wd * 0.78, 290, 20, glass, 0, 990, -R + 4, 12));
      s.add(rbox(44, 300, 26, cab, 0, 990, -R + 2, 10));
      for (const sx of [-1, 1]) {
        s.add(rbox(12, 260, 360, glass, sx * (Wd / 2 + 1), 990, -R + 330, 8));             // door windows
        s.add(rbox(14, 12, 60, dark, sx * (Wd / 2 + 2), 800, -R + 250, 4));                 // handle
        s.add(rbox(90, 28, 260, '#333', sx * (Wd / 2 - 40), 340, -R + 380, 8));            // step
        s.add(rbox(120, 16, 16, '#333', sx * (Wd / 2 + 50), 1060, -R + 60, 6));             // mirror arm
        s.add(rbox(30, 230, 110, '#222', sx * (Wd / 2 + 110), 1010, -R + 60, 10));          // mirror
      }
      s.add(rbox(Wd * 1.02, 110, 240, '#c62828', 0, 1200, -R + 110, 40));
      s.add(facePanel(truckCrown(), Wd * 0.96, 100, 0, 1200, -R - 12, Math.PI));
      s.add(rbox(Wd * 0.56, 230, 20, dark, 0, 610, -R - 2, 12));
      for (let i = 0; i < 5; i++) s.add(rbox(Wd * 0.54, 14, 12, chrome, 0, 520 + i * 44, -R - 12, 5));
      for (const sx of [-1, 1]) roundLamp(s, 62, sx * (Wd / 2 - 130), 560, -R - 6);
      s.add(rbox(Wd + 30, 130, 90, dark, 0, 330, -R - 20, 25));
      s.add(facePanel(hazard(), Wd + 10, 100, 0, 330, -R - 66, Math.PI));
      s.add(facePanel(plate('MH 04 TK', '#ffd21f'), 190, 48, 0, 450, -R - 14, Math.PI));
      // air horns and amber marker lamps on the roof, wipers, grab handles by the doors
      for (const sx of [-1, 1]) {
        spokeTo(s, [sx * 160, 1290, -R + 260], [sx * 160, 1290, -R + 60], 20, chrome);
        s.add(sph(chrome, 70, 70, 30, sx * 160, 1290, -R + 50));
        const w = rbox(260, 10, 10, satin, sx * 210, 870, -R - 6, 3); w.rotation.z = sx * 0.35; s.add(w);
        spokeTo(s, [sx * (Wd / 2 + 8), 560, -R + 640], [sx * (Wd / 2 + 8), 900, -R + 640], 9, chrome);
      }
      for (let i = 0; i < 5; i++) s.add(sph(lambert('#ffa000', { emissive: '#7a4a00', emissiveIntensity: 0.4 }), 40, 30, 30, -360 + i * 180, 1268, -R - 6));
      // fuel tank and tool box between the axles
      const tank = cyl(110, 480, '#a7abb0', -(Wd / 2 - 150), 330, -R + 1050); tank.rotation.x = Math.PI / 2; s.add(tank);
      s.add(rbox(200, 200, 380, '#37474f', Wd / 2 - 130, 330, -R + 1050, 12));
      // cargo body: floor, headboard, sides, tailgate, top rail
      const bz = 400, bl = 2000;
      s.add(rbox(Wd, 80, bl, '#5d4037', 0, 460, bz, 15));
      s.add(rbox(Wd, 800, 50, bodyC, 0, 900, bz - bl / 2 + 25, 15));
      for (const sx of [-1, 1]) {
        s.add(rbox(40, 650, bl, bodyC, sx * (Wd / 2 - 20), 825, bz, 12));
        s.add(facePanel(truckSide(), bl - 100, 560, sx * (Wd / 2 + 1), 825, bz, sx * Math.PI / 2));
      }
      s.add(rbox(Wd, 650, 50, bodyC, 0, 825, R - 25, 12));
      s.add(rbox(Wd + 16, 40, bl, '#d32f2f', 0, 1155, bz, 12));
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 7; i++) s.add(rbox(14, 40, 24, chrome, sx * (Wd / 2 + 10), 1110, bz - bl / 2 + 150 + i * 285, 5));    // rope hooks
        for (const y of [300, 370]) s.add(rbox(16, 26, 360, satin, sx * (Wd / 2 - 10), y, 330, 8));                         // side guard
      }
      // tarpaulin bulging over the load, tied down with ropes
      s.add(rbox(Wd * 0.97, 420, bl - 60, lambert('#1565c0'), 0, 1270, bz + 10, 190));
      for (let i = 0; i < 5; i++) {
        const z = bz - bl / 2 + 250 + i * 375;
        s.add(rbox(Wd * 0.7, 12, 16, '#e0c080', 0, 1482, z, 5));
        for (const sx of [-1, 1]) s.add(rbox(12, 200, 16, '#e0c080', sx * (Wd * 0.485 + 4), 1250, z, 5));
      }
      // back: HORN OK PLEASE, under-run bar, tail lamps, mud flaps behind the rear wheels
      if (rearCanvas) s.add(facePanel(crop(rearCanvas, 8, 130, 292, 290), Wd - 60, 590, 0, 830, R + 2));
      s.add(rbox(Wd, 60, 40, dark, 0, 300, R - 20, 12));
      for (const sx of [-1, 1]) {
        s.add(rbox(110, 50, 24, tailGlow, sx * (Wd / 2 - 110), 380, R + 2, 10));
        s.add(box(240, 260, 12, dark, sx * (Wd / 2 - 90), 200, R - 140));
        s.add(rbox(220, 30, 520, '#222', sx * (Wd / 2 - 88), 410, (axles[1] + axles[2]) / 2, 10));  // rear mudguards
      }
      return s;
    }));
    for (const sx of [-1, 1]) {
      g.add(wheel(195, 170, sx * (Wd / 2 - 56), 195, axles[0], '#9e1b1b'));
      for (const z of axles.slice(1)) g.add(wheel(195, 240, sx * (Wd / 2 - 90), 195, z, '#9e1b1b', 'dual'));
    }
    g.add(shadow(Wd, L));
    indicators(g, Wd, L, 450); g.userData.headY = 560;
    g.userData.size = { w: Wd, h: 1500, l: L };
    return g;
  }
  // a capsule from point a to point b (arms, legs, forks, exhausts)
  const UP = new T.Vector3(0, 1, 0);
  function limb(a, b, r, mat) {
    const va = new T.Vector3(...a), d = new T.Vector3(...b).sub(va), len = d.length();
    const m = new T.Mesh(capsule(r, Math.max(1, len)), mat);
    m.position.copy(va).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
  }
  // a rider sitting at hip (y, z), hands on the grips, feet on the pegs or floorboard; a pillion keeps
  // their hands on their knees
  function rider(s, look, hipY, hipZ, grip, foot, pillion = false) {
    const shirt = lambert(pillion ? '#6d4c41' : look.shirt), pants = lambert('#2f3542'), skin = lambert('#8d5524'), shoe = lambert('#1a1a1a');
    const lean = pillion ? 10 : -40, neck = [0, hipY + 270, hipZ + lean];
    s.add(limb([0, hipY + 50, hipZ + 10], neck, 92, shirt));                                        // torso
    const helmet = pillion ? lambert('#2b2b2b') : paint(look.helmet, 90);
    if (look.bare) {                                                                               // bare head in a pagri
      s.add(sph(skin, 118, 140, 128, 0, hipY + 345, hipZ + lean - 10));
      s.add(sph(paint(look.helmet, 20), 150, 90, 150, 0, hipY + 405, hipZ + lean - 5));
    } else { const h = new T.Mesh(sphGeo(), helmet); h.scale.set(150, 160, 175); h.position.set(0, hipY + 360, hipZ + lean - 10); s.add(h); }
    if (!pillion && !look.bare) { const v = new T.Mesh(sphGeo(), glass); v.scale.set(120, 70, 60); v.position.set(0, hipY + 360, hipZ + lean - 80); s.add(v); }
    for (const sx of [-1, 1]) {
      const sh = [sx * 112, hipY + 235, hipZ + lean + 10];
      const hand = pillion ? [sx * 120, hipY + 60, hipZ - 150] : [sx * grip[0], grip[1], grip[2]];
      const elbow = [sx * 150, (sh[1] + hand[1]) / 2 - 20, (sh[2] + hand[2]) / 2 + 30];
      s.add(limb(sh, elbow, 34, shirt)); s.add(limb(elbow, hand, 28, skin));
      const hip = [sx * 72, hipY + 20, hipZ], knee = [sx * (pillion ? 120 : 110), hipY + 40, hipZ - (pillion ? 150 : 230)], ft = [sx * foot[0], foot[1], foot[2]];
      s.add(limb(hip, knee, 50, pants)); s.add(limb(knee, ft, 40, pants));
      const sho = new T.Mesh(sphGeo(), shoe); sho.scale.set(70, 50, 120); sho.position.set(ft[0], ft[1], ft[2] - 30); s.add(sho);
    }
  }
  // Two-wheelers: a commuter motorcycle (Splendor / Pulsar style: tank, engine, exhaust, telescopic forks,
  // round headlamp, spoked wheels) or a scooter (Activa style: front apron and leg shield, floorboard,
  // rounded rear body, small alloy wheels), with a helmeted rider and sometimes a pillion.
  function bikeModel(look) {
    const sc = look.scooter, r = sc ? 108 : 132, wb = sc ? 255 : 268, g = new T.Group();
    g.add(baked('bike' + JSON.stringify(look), () => {
      const s = new T.Group(), body = paint(look.color), dark = lambert('#1a1a1a'), engine = lambert('#4a4f55');
      let hipY, hipZ, grip, foot;
      if (sc) {
        const apron = rbox(240, 360, 80, body, 0, 400, -wb + 70, 38); apron.rotation.x = 0.28; s.add(apron);   // front apron
        s.add(rbox(210, 300, 40, satin, 0, 380, -wb + 140, 18));                                            // leg shield (inside)
        s.add(rbox(210, 40, 300, satin, 0, 200, -10, 14));                                                  // floorboard
        s.add(rbox(250, 240, 430, body, 0, 330, 150, 100));                                                 // rear body over the engine
        s.add(rbox(200, 60, 390, dark, 0, 478, 130, 28));                                                   // seat
        s.add(rbox(130, 40, 220, body, 0, r * 2 + 22, -wb, 18));                                            // front mudguard
        s.add(limb([0, r, -wb], [0, 620, -wb + 120], 20, satin));                                          // fork
        s.add(rbox(330, 80, 130, body, 0, 650, -wb + 130, 34));                                             // handlebar cowl
        const hl = rbox(110, 56, 30, headGlow, 0, 652, -wb + 62, 20); hl.rotation.x = 0.2; s.add(hl);
        s.add(rbox(150, 44, 30, tailGlow, 0, 420, 368, 14));
        s.add(facePanel(plate('DL 3S', '#fff'), 110, 30, 0, 340, 368));
        hipY = 520; hipZ = 140; grip = [165, 660, -wb + 150]; foot = [85, 228, -60];
      } else {
        s.add(rbox(160, 170, 250, engine, 0, 265, -20, 30));                                                // engine
        for (let i = 0; i < 4; i++) s.add(rbox(176, 10, 120, chrome, 0, 220 + i * 28, -90, 4));            // cylinder fins
        const tank = rbox(200, 130, 310, body, 0, 480, -95, 58); tank.rotation.x = -0.1; s.add(tank);      // fuel tank
        for (const sx of [-1, 1]) s.add(rbox(10, 60, 120, chrome, sx * 101, 480, -110, 8));                // tank badges
        s.add(rbox(150, 120, 180, body, 0, 395, 150, 30));                                                  // side panels
        s.add(rbox(170, 52, 360, dark, 0, 530, 170, 24));                                                   // seat
        const tail = rbox(140, 40, 280, body, 0, 470, 330, 18); tail.rotation.x = -0.18; s.add(tail);      // tail and rear mudguard
        s.add(rbox(120, 40, 26, tailGlow, 0, 500, 455, 12));
        s.add(facePanel(plate('DL 3S', '#fff'), 110, 30, 0, 410, 452));
        s.add(limb([92, 225, -60], [104, 300, 410], 24, chrome));                                         // exhaust
        s.add(rbox(20, 60, 300, dark, -76, 225, 130, 10));                                                  // chain guard
        for (const sx of [-1, 1]) {
          s.add(limb([sx * 58, r, -wb], [sx * 58, 610, -wb + 125], 16, chrome));                           // telescopic forks
          s.add(limb([sx * 82, r, wb], [sx * 82, 480, 190], 14, chrome));                                  // rear shocks
        }
        s.add(rbox(80, 26, 230, body, 0, r * 2 + 18, -wb, 12));                                             // front mudguard
        s.add(rbox(160, 140, 100, body, 0, 610, -wb + 95, 44));                                             // headlamp cowl
        const hl = cyl(56, 30, '#fff', 0, 610, -wb + 42); hl.material = headGlow; hl.rotation.x = Math.PI / 2; s.add(hl);
        hipY = 560; hipZ = 175; grip = [168, 665, -wb + 185]; foot = [112, 250, 55];
      }
      s.add(limb([-170, grip[1], grip[2]], [170, grip[1], grip[2]], 12, satin));                          // handlebar
      const dial = cyl(42, 26, satin, 0, grip[1] + 40, grip[2] + 10); dial.rotation.x = -0.9; s.add(dial);  // speedometer
      s.add(sph(glass, 70, 20, 70, 0, grip[1] + 52, grip[2] + 18));
      s.add(limb([-60, 230, 60], [-150, 22, 150], 9, satin));                                             // side stand
      if (!sc) {
        for (const y of [250, 175]) s.add(rbox(10, 10, 320, satin, -72, y, 120, 4));                     // chain
        for (const sx of [-1, 1]) s.add(limb([sx * 70, 250, 50], [sx * 150, 250, 50], 10, satin));     // footpegs
        for (const sx of [-1, 1]) s.add(limb([sx * 95, 545, 250], [sx * 95, 545, 390], 9, chrome));    // grab rail
        s.add(limb([-95, 545, 390], [95, 545, 390], 9, chrome));
      }
      for (const sx of [-1, 1]) {
        s.add(limb([sx * 120, grip[1], grip[2]], [sx * 175, grip[1] + 130, grip[2] - 10], 6, chrome));    // mirror stalks
        const mir = new T.Mesh(sphGeo(), satin); mir.scale.set(70, 50, 16); mir.position.set(sx * 180, grip[1] + 150, grip[2] - 12); s.add(mir);
      }
      rider(s, look, hipY, hipZ, grip, foot);
      const squeeze = look.triple ? 190 : 250;                                                          // three to a bike: packed tight
      if (look.pillion) rider(s, look, hipY + 30, hipZ + squeeze, grip, [118, foot[1] + 30, hipZ + squeeze - 50], true);
      if (look.triple) rider(s, look, hipY + 60, hipZ + 350, grip, [132, foot[1] + 70, hipZ + 300], true);
      return s;
    }));
    g.add(wheel(r, sc ? 62 : 52, 0, r, -wb, sc ? '#b9bec4' : '#cfd3d7', sc ? 'alloy' : 'spoke'));
    g.add(wheel(r, sc ? 62 : 56, 0, r, wb, sc ? '#b9bec4' : '#cfd3d7', sc ? 'alloy' : 'spoke'));
    g.add(shadow(260, 860));
    // indicators: front on stalks by the headlamp, rear by the tail lamp
    g.userData.ind = { '-1': [], '1': [] };
    for (const sx of [-1, 1]) for (const [y, z] of [[sc ? 640 : 600, -wb + (sc ? 80 : 70)], [sc ? 430 : 495, sc ? 360 : 440]]) {
      const m = new T.Mesh(unitSphere, indOff); m.scale.set(36, 28, 28); m.position.set(sx * 120, y, z); g.add(m); g.userData.ind[sx].push(m);
    }
    g.userData.headY = sc ? 652 : 610;
    g.userData.size = { w: 340, h: (sc ? 520 : 560) + 450, l: 860 };
    return g;
  }
  function legs(g, color, spots, h, r, dz) {
    const out = [];
    for (const [x, z] of spots) {
      const pivot = new T.Group(); pivot.position.set(x, h, z);
      const leg = new T.Mesh(capsule(r, h - r * 2), lambert(color)); leg.position.y = -h / 2; pivot.add(leg);
      const hoof = cyl(r * 1.05, h * 0.1, '#3a3030', 0, -h + h * 0.05, 0); pivot.add(hoof);
      g.add(pivot); out.push(pivot);
    }
    g.userData.legs = out; return out;
  }
  const blobAt = (color, sx, sy, sz, x, y, z) => { const m = new T.Mesh(unitSphere, lambert(color)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
  // Indian zebu cow: a long body with a hump over the shoulders and a hanging dewlap, a long face with a dark
  // muzzle, droopy ears, two curving horns with painted tips, a marigold garland, slim jointed legs and a
  // tail that hangs down to a tuft (and swishes). Coats: white, grey or Gir red-brown.
  const COW_COATS = [
    { hide: '#f3efe6', shade: '#e2dccf', horn: '#c9b48a', tip: '#ff6f00' },
    { hide: '#d9d6cf', shade: '#bdb8ae', horn: '#bfa77a', tip: '#1e88e5' },
    { hide: '#a0522d', shade: '#7a3e22', horn: '#d2bf95', tip: '#e53935' },
  ];
  function cowModel(coat = COW_COATS[0]) {
    const g = new T.Group();
    g.add(baked('cow' + coat.hide, () => {
      const s = new T.Group(), hide = lambert(coat.hide), shade = lambert(coat.shade), horn = lambert(coat.horn), tip = lambert(coat.tip), dark = lambert('#2b2222');
      s.add(sph(hide, 350, 320, 820, 0, 600, 10));                                              // barrel
      s.add(sph(hide, 320, 330, 380, 0, 600, -200));                                            // chest
      s.add(sph(hide, 330, 320, 400, 0, 615, 230));                                             // rump
      s.add(sph(shade, 200, 220, 240, 0, 770, -250));                                           // hump
      s.add(sph(shade, 46, 200, 300, 0, 520, -400));                                            // dewlap (a thin hanging fold)
      s.add(limb([0, 650, -330], [0, 730, -520], 100, hide));                                   // neck
      s.add(sph(hide, 175, 175, 180, 0, 780, -560));                                            // forehead
      s.add(limb([0, 760, -600], [0, 630, -760], 72, hide));                                    // long face
      s.add(sph(dark, 128, 100, 96, 0, 615, -790));                                             // muzzle
      for (const sx of [-1, 1]) {
        s.add(sph(dark, 30, 30, 26, sx * 78, 765, -630));                                       // eyes
        const ear = sph(hide, 150, 46, 74, sx * 135, 730, -560); ear.rotation.z = sx * 0.45; s.add(ear);   // droopy ears
        s.add(limb([sx * 50, 840, -555], [sx * 115, 930, -540], 19, horn));                    // horns curving up
        s.add(limb([sx * 115, 930, -540], [sx * 125, 1010, -500], 12, tip));                   // painted tips
      }
      for (let i = 0; i < 9; i++) {                                                               // marigold garland
        const a = -Math.PI * 0.95 + i * Math.PI * 0.95 / 4;
        s.add(sph(lambert(i % 2 ? '#ffb300' : '#ff6f00'), 50, 50, 50, Math.cos(a) * 100, 690 + Math.sin(a) * 90, -470));
      }
      return s;
    }));
    // tail: hangs from the top of the rump to a dark tuft; swishes as the cow walks (see walk)
    const tail = new T.Group(); tail.position.set(0, 700, 420);
    tail.add(limb([0, 0, 0], [0, -200, 50], 16, lambert(coat.hide)));
    tail.add(limb([0, -200, 50], [0, -390, 60], 13, lambert(coat.hide)));
    tail.add(sph(lambert('#2b2222'), 54, 110, 54, 0, -440, 60));
    g.add(tail); g.userData.tail = tail;
    // legs: thicker upper leg to the knee, slimmer shin, dark hoof (pivoting at the body)
    const out = [];
    for (const [x, z] of [[-105, -250], [105, -250], [-105, 270], [105, 270]]) {
      const pivot = new T.Group(); pivot.position.set(x, 470, z);
      pivot.add(limb([0, 0, 0], [0, -230, z < 0 ? -10 : 20], 44, lambert(coat.hide)));
      pivot.add(limb([0, -230, z < 0 ? -10 : 20], [0, -440, 0], 28, lambert(coat.shade)));
      pivot.add(cyl(32, 34, '#3a3030', 0, -455, 0));
      g.add(pivot); out.push(pivot);
    }
    g.userData.legs = out;
    g.add(shadow(380, 980));
    g.userData.size = { w: 380, h: 1020, l: 1000 };
    return g;
  }
  function dogModel(coat) {
    const g = new T.Group();
    g.add(shadow(180, 420));
    g.add(blobAt(coat.body, 170, 170, 420, 0, 255, 0));                                       // body
    g.add(blobAt(coat.belly, 150, 110, 300, 0, 215, -10));
    const head = new T.Group(); head.position.set(0, 350, -230);
    head.add(blobAt(coat.body, 150, 145, 160, 0, 0, 0));
    head.add(rbox(84, 70, 120, coat.belly, 0, -26, -110, 30));                                 // snout
    head.add(blobAt('#111', 38, 32, 30, 0, -12, -172));                                        // nose
    for (const sx of [-1, 1]) {
      head.add(blobAt('#111', 20, 20, 20, sx * 42, 22, -70));
      const ear = new T.Mesh(unitCone, lambert(coat.dark)); ear.scale.set(50, 90, 40); ear.position.set(sx * 45, 100, 0); head.add(ear);
    }
    g.add(head); g.userData.head = head;
    const tail = new T.Mesh(capsule(13, 150), lambert(coat.body)); tail.position.set(0, 360, 230); tail.rotation.x = -0.7; g.add(tail);
    if (coat.spots) g.add(blobAt(coat.spots, 176, 110, 150, 0, 285, -40));
    legs(g, coat.dark, [[-55, -150], [55, -150], [-55, 150], [55, 150]], 190, 22);
    g.userData.size = { w: 170, h: 420, l: 420 };
    return g;
  }

  // ---------------------------------------------------------------- scenery models
  const buildingMats = new Map();
  // Apartment block: the painted facade (windows, shop, sign) on a box, with real 3D detail lined up with the
  // painted windows: a concrete sunshade (chajja) over each window and a sill under it, a ledge between
  // floors, the odd AC unit, a parapet round the roof, a stair room, a water tank and TV aerials. At night
  // most windows and the shop are lit (an emissive mask built from the same layout).
  const litMasks = new Map();
  function litMask(img) {
    if (litMasks.has(img)) return litMasks.get(img);
    const W0 = img.width, H0 = img.height, bh = img.bh, top = H0 - bh, floors = Math.floor((bh - 90) / 66);
    const c = document.createElement('canvas'); c.width = W0; c.height = H0; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W0, H0);
    let h = bh * 31 + floors;
    for (let f = 0; f < floors; f++) for (let k = 0; k < 3; k++) {
      h = (h * 1103515245 + 12345) % 2147483648;
      if (h / 2147483648 < 0.6) { x.fillStyle = h % 3 ? '#ffd27a' : '#fff1c4'; x.fillRect(30 + k * 92 + 3, top + 20 + f * 66 + 3, 54, 36); }
    }
    x.fillStyle = '#ffe2a0'; x.fillRect(30, H0 - 70, 260, 70);                                        // the shop
    litMasks.set(img, c); return c;
  }
  function buildingModel(s) {
    const img = s.img, len = s.len || 1400, depth = 900;
    const bh = img.bh || img.height * 0.8;
    const height = len * bh / 300, k = len / 300, H0 = img.height, top = H0 - bh, floors = Math.floor((bh - 90) / 66);
    const night = !!nightU.uNight.value, key = img;
    if (!buildingMats.has(key)) {
      const t = tex(img).clone(); t.needsUpdate = true;
      t.repeat.set(300 / img.width, bh / img.height); t.offset.set(10 / img.width, 0);
      const e = new T.CanvasTexture(litMask(img)); e.repeat.copy(t.repeat); e.offset.copy(t.offset);
      const facade = nightify(new T.MeshLambertMaterial({ map: t, emissive: night ? '#ffcf7a' : '#000', emissiveMap: e, emissiveIntensity: night ? 0.9 : 0 }));
      const wall = lambert(img.wallColor || '#b9a88f'), roof = lambert('#4a4540');
      buildingMats.set(key, { left: [facade, wall, roof, wall, wall, wall], right: [wall, facade, roof, wall, wall, wall], wall });
    }
    const bm = buildingMats.get(key), mats = bm[s.offset < 0 ? 'left' : 'right'];
    const g = new T.Group();
    const m = new T.Mesh(unitBox, mats); m.scale.set(depth, height, len); m.position.set(0, height / 2, 0); g.add(m);
    // detail on the facade: sd = which side faces the road; facade x (canvas px) -> z, canvas y -> height
    const sd = s.offset < 0 ? 1 : -1, fx = sd * depth / 2, zOf = px => -sd * (px - 160) * k, yOf = py => (H0 - py) * k;
    const concrete = lambert('#cfc6b4'), dark = lambert('#3a3a3a'), wall = bm.wall;
    g.add(baked('bldg' + [Math.round(len), Math.round(bh), sd, img.wallColor], () => {
      const d = new T.Group();
      for (let f = 0; f < floors; f++) {
        const fy = top + 20 + f * 66;
        d.add(rbox(36, 10 * k, len * 0.96, wall, fx + sd * 18, yOf(fy + 54), 0, 4));                  // floor ledge
        for (let w = 0; w < 3; w++) {
          const z = zOf(30 + w * 92 + 30);
          const shade = rbox(130, 7 * k, 74 * k, concrete, fx + sd * 60, yOf(fy - 5), z, 3); shade.rotation.z = sd * 0.12; d.add(shade);   // chajja
          d.add(rbox(40, 5 * k, 66 * k, concrete, fx + sd * 18, yOf(fy + 45), z, 2));                // sill
          if ((f * 3 + w) % 5 === 2) {                                                                  // AC unit
            d.add(rbox(110, 15 * k, 32 * k, lambert('#e0e0e0'), fx + sd * 58, yOf(fy + 34), z + 18 * k, 4));
            d.add(rbox(4, 11 * k, 26 * k, dark, fx + sd * 114, yOf(fy + 34), z + 18 * k, 1));
          }
        }
      }
      // roof: parapet, stair room, water tanks, TV aerials
      const ry = height;
      for (const zz of [-len / 2 + 15, len / 2 - 15]) d.add(rbox(depth, 70, 30, wall, 0, ry + 35, zz, 6));
      for (const xx of [-depth / 2 + 15, depth / 2 - 15]) d.add(rbox(30, 70, len, wall, xx, ry + 35, 0, 6));
      d.add(rbox(260, 240, 300, wall, -sd * 200, ry + 120, len / 4, 10));
      d.add(rbox(280, 20, 320, dark, -sd * 200, ry + 250, len / 4, 6));
      for (let i = 0; i < 2; i++) { const t = cyl(80, 170, '#1e1e1e', -sd * (60 + i * 190), ry + 85, -len / 4); d.add(t); d.add(cyl(84, 14, '#2b2b2b', -sd * (60 + i * 190), ry + 175, -len / 4)); }
      for (let i = 0; i < 2; i++) {
        const ax = sd * (120 - i * 260), az = len * (0.1 + i * 0.12);
        spokeTo(d, [ax, ry, az], [ax, ry + 420, az], 5, dark);
        for (let j = 0; j < 4; j++) spokeTo(d, [ax - 90 + j * 10, ry + 300 + j * 30, az], [ax + 90 - j * 10, ry + 300 + j * 30, az], 3, dark);
      }
      return d;
    }));
    g.userData.size = { w: depth, h: height, l: len };
    g.userData.kind = 'building';
    return g;
  }
  function crossedModel(canvas, w) {
    const g = new T.Group(), h = w * canvas.height / canvas.width, mat = spriteMat(canvas);
    for (const r of [0, Math.PI / 2]) { const p = new T.Mesh(unitPlane, mat); p.scale.set(w, h, 1); p.position.y = h / 2; p.rotation.y = r; g.add(p); }
    g.userData.size = { w, h, l: w };
    return g;
  }
  function boardModel(canvas, w, side) {
    const g = new T.Group(), h = w * canvas.height / canvas.width;
    const face = new T.Mesh(unitPlane, spriteMat(canvas)); face.scale.set(w, h, 1); face.position.y = h / 2; g.add(face);
    g.rotation.y = -side * 0.45; // angled towards oncoming traffic
    g.userData.size = { w, h, l: 40 };
    return g;
  }
  function lampModel(side) {
    const g = new T.Group();
    g.add(cyl(28, 1700, '#6b6f73', 0, 850, 0));
    const armLen = 620; const arm = box(armLen, 26, 26, '#6b6f73', -side * armLen / 2, 1690, 0); g.add(arm);
    const head = box(180, 50, 110, '#444', -side * armLen, 1670, 0); g.add(head);
    const glow = box(150, 16, 80, lampGlow, -side * armLen, 1640, 0); g.add(glow);
    g.userData.glow = glow; g.userData.size = { w: 60, h: 1700, l: 60 };
    return g;
  }
  function milestoneModel() {
    const g = new T.Group();
    g.add(box(140, 180, 60, '#f5f5f5', 0, 90, 0)); g.add(box(140, 90, 62, '#ffcc00', 0, 225, 0));
    g.userData.size = { w: 140, h: 270, l: 60 }; return g;
  }
  function archModel(canvas, s) {
    const g = new T.Group(), w = (s.nw || 2.6) * ROAD_W, h = w * canvas.height / canvas.width;
    const face = new T.Mesh(unitPlane, spriteMat(canvas)); face.scale.set(w, h, 1); face.position.y = h / 2; g.add(face);
    for (const sx of [-1, 1]) g.add(box(260, h * 0.88, 260, '#b71c1c', sx * (w / 2 - 140), h * 0.44, 0));
    g.userData.size = { w, h, l: 260 }; return g;
  }
  // a road sign: the painted face on a real post, grey back
  function signModel(s) {
    const g = new T.Group();
    g.add(cyl(18, 1500, '#8a8f96', 0, 750, 0));
    const face = facePanel(crop(s.img, 0, 0, 120, 110), 460, 420, 0, 1500, 14); g.add(face);
    const back = new T.Mesh(unitPlane, lambert('#9aa0a6')); back.scale.set(440, 400, 1); back.position.set(0, 1500, 10); back.rotation.y = Math.PI; g.add(back);
    g.userData.size = { w: 460, h: 1720, l: 30 }; return g;
  }
  // traffic signal: a post at the kerb with a head, and a mast arm out over the lanes with a second head
  const sigMat = { R: [lambert('#3a1010'), lambert('#ff2d2d', { emissive: '#ff1a1a', emissiveIntensity: 1.2 })],
    A: [lambert('#3a2a08'), lambert('#ffb300', { emissive: '#ff9800', emissiveIntensity: 1.2 })],
    G: [lambert('#0c2a12'), lambert('#2ee86a', { emissive: '#18d050', emissiveIntensity: 1.2 })] };
  function signalHead(g, x, y, lamps) {
    g.add(rbox(230, 620, 180, '#15171a', x, y, 0, 50));
    [['R', 190], ['A', 0], ['G', -190]].forEach(([k, dy]) => { const m = new T.Mesh(unitSphere, sigMat[k][0]); m.scale.set(130, 130, 60); m.position.set(x, y + dy, 95); g.add(m); lamps[k].push(m); });
  }
  function signalModel(s) {
    const g = new T.Group(), lamps = { R: [], A: [], G: [] }, arm = ((s.junction && s.junction.half) || 1.2) * ROAD_W * 0.6;
    g.add(cyl(40, 2700, '#3b3f45', 0, 1350, 0));
    const mast = cyl(26, arm, '#3b3f45', arm / 2, 2600, 0); mast.rotation.z = Math.PI / 2; g.add(mast);
    signalHead(g, 0, 1500, lamps); signalHead(g, arm - 120, 2250, lamps);
    g.userData.lamps = lamps; g.userData.size = { w: 300, h: 2700, l: 300 }; return g;
  }
  // the traffic cop on his little platform under a striped umbrella, waving traffic on
  function copModel() {
    const g = new T.Group();
    g.add(cyl(260, 160, '#e0e0e0', 0, 80, 0)); g.add(cyl(265, 40, '#d32f2f', 0, 150, 0));
    g.add(cyl(14, 1500, '#555', 180, 900, 0));
    const umb = new T.Mesh(unitCone, lambert('#f5f5f5')); umb.scale.set(900, 260, 900); umb.position.set(180, 1700, 0); g.add(umb);
    const umb2 = new T.Mesh(unitCone, lambert('#d32f2f')); umb2.scale.set(600, 180, 600); umb2.position.set(180, 1760, 0); g.add(umb2);
    for (const sx of [-1, 1]) { const leg = new T.Mesh(capsule(34, 330), lambert('#6b5a34')); leg.position.set(sx * 50, 400, 0); g.add(leg); }
    g.add(rbox(190, 300, 120, '#f4f4f4', 0, 740, 0, 45));
    g.add(rbox(196, 30, 124, '#222', 0, 610, 0, 10));                                           // belt
    const head = new T.Mesh(unitSphere, lambert('#8d5524')); head.scale.set(110, 125, 110); head.position.set(0, 980, 0); g.add(head);
    g.add(cyl(70, 50, '#f4f4f4', 0, 1060, 0)); g.add(cyl(84, 12, '#f4f4f4', 0, 1036, -10));      // white cap
    const arm = new T.Group(); arm.position.set(110, 850, 0);
    const a = new T.Mesh(capsule(26, 240), lambert('#f4f4f4')); a.position.y = 140; arm.add(a); g.add(arm);
    const arm2 = new T.Mesh(capsule(26, 240), lambert('#f4f4f4')); arm2.position.set(-115, 720, 0); g.add(arm2);
    g.userData.wave = arm; g.userData.size = { w: 520, h: 1800, l: 520 }; return g;
  }
  function sceneryModel(s) {
    const side = s.offset < 0 ? -1 : 1;
    switch (s.kind) {
      case 'building': return buildingModel(s);
      case 'palm': case 'tree': case 'temple': return crossedModel(s.img, s.nw * ROAD_W);
      case 'billboard': case 'chai': return boardModel(s.img, s.nw * ROAD_W, side);
      case 'lamp': return lampModel(side);
      case 'milestone': return milestoneModel();
      case 'arch': return archModel(s.img, s);
      case 'sign': return signModel(s);
      case 'signal': return signalModel(s);
      case 'cop': return copModel();
      default: return crossedModel(s.img, s.nw * ROAD_W);
    }
  }

  // ---------------------------------------------------------------- setup
  function init(glCanvas, opts) {
    W = opts.W; H = opts.H; ROAD_W = opts.ROAD_W; SEG_LEN = opts.SEG_LEN;
    quality = TIERS[opts.quality] ? opts.quality : 'high'; TIER = TIERS[quality]; buildPrims();
    if (!TIER.clearcoat) glass.clearcoat = 0;
    try {
      renderer = new T.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    if (!renderer || !renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 1.75));
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(cam.fov, W / H, 30, 90000);
    camera.rotation.order = 'YXZ';
    hemi = new T.HemisphereLight(0xffffff, 0x555555, 0.95); scene.add(hemi);
    sun = new T.DirectionalLight(0xffffff, 0.55); sun.position.set(0.6, 1, 0.4); scene.add(sun);
    const geo = new T.BufferGeometry();
    roadPos = new Float32Array(DRAW * QUADS * 6 * 3);
    roadCol = new Float32Array(DRAW * QUADS * 6 * 3);
    roadUV = new Float32Array(DRAW * QUADS * 6 * 2); roadDet = new Float32Array(DRAW * QUADS * 6);
    geo.setAttribute('position', new T.BufferAttribute(roadPos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('color', new T.BufferAttribute(roadCol, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('uv', new T.BufferAttribute(roadUV, 2).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('detail', new T.BufferAttribute(roadDet, 1).setUsage(T.DynamicDrawUsage));
    road = new T.Mesh(geo, roadMaterial());
    road.frustumCulled = false; scene.add(road);
    // Sun shadows. The road stays unlit (its colours are painted), so shadows land on it through a second,
    // see-through copy of the road surface that only darkens where the sun is blocked.
    if (TIER.shadow) {
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      sun.castShadow = true; sun.shadow.mapSize.set(TIER.shadow.size, TIER.shadow.size);
      const sc = sun.shadow.camera, e = TIER.shadow.reach; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 100; sc.far = 30000; sc.updateProjectionMatrix();
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 6; scene.add(sun.target);
      roadShade = new T.Mesh(geo, new T.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
      roadShade.receiveShadow = true; roadShade.frustumCulled = false; roadShade.position.y = 3; roadShade.renderOrder = 1; scene.add(roadShade);
    }
    renderer.toneMapping = T.NoToneMapping;
    if (TIER.post) post = makePost();
    ready = true;
    return true;
  }

  // horizon height on screen (the 2D sky layer lines its skyline up with it)
  const horizonY = () => H / 2 + Math.tan(PITCH_RAD()) / Math.tan(cam.fov * Math.PI / 360) * H / 2;
  function setCamera(mode) {
    camMode = CAMS[mode] ? mode : 'heli'; cam = CAMS[camMode];
    if (camera) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    return camMode;
  }

  const vehicles = new Map(); // game object -> model
  const sceneryMeshes = new Map(); // sprite -> model
  let colors = null;
  function setTrack(opts) {
    segments = opts.segments; trackLength = opts.trackLength; theme = opts.theme; SP = opts.SP; TS = opts.themeSprites; cfg = opts;
    TILE = (opts.LANE_W || 0.6) * ROAD_W;
    for (const m of sceneryMeshes.values()) scene.remove(m);
    for (const m of vehicles.values()) scene.remove(m);
    for (const spare of pool.values()) for (const m of spare) scene.remove(m);
    pool.clear(); queueWarm();
    sceneryMeshes.clear(); vehicles.clear(); buildingMats.clear();
    const c = h => new T.Color(h);
    colors = {
      light: { road: c(theme.light.road), grass: c(theme.light.grass), rumble: c(theme.light.rumble), lane: c(theme.light.lane), shoulder: c(theme.light.shoulder) },
      dark: { road: c(theme.dark.road), grass: c(theme.dark.grass), rumble: c(theme.dark.rumble), shoulder: c(theme.dark.shoulder) },
      white: c('#f5f5f5'), yellow: c('#f2c200'),
    };
    scene.fog = new T.Fog(theme.fog, 20000, DRAW * SEG_LEN * 0.97);
    const night = !!theme.night;
    hemi.color.set(night ? '#5a6aa0' : theme.sky[2]); hemi.groundColor.set(night ? '#101020' : theme.light.grass);
    hemi.intensity = night ? 0.3 : 0.95; sun.intensity = night ? 0.05 : 0.55;
    nightU.uNight.value = night ? 1 : 0; headGlow.emissiveIntensity = night ? 1.6 : 0.25;
    lampGlow.emissiveIntensity = night ? 1.4 : 0.3;
    buildEnv(night);
  }

  // ---------------------------------------------------------------- per-frame track frame (camera space)
  function buildFrame(player) {
    const L = segments.length;
    camAbs = ((player.dist - cam.back) % trackLength + trackLength) % trackLength;
    baseIdx = Math.floor(camAbs / SEG_LEN) % L;
    camFrac = (camAbs % SEG_LEN) / SEG_LEN;
    const base = segments[baseIdx];
    // height is measured from the road under the player's auto (as the original game did), so your auto
    // stays in the same place on screen over crests and dips
    const pAbs = ((player.dist % trackLength) + trackLength) % trackLength, ps = segments[Math.floor(pAbs / SEG_LEN) % L], pf = (pAbs % SEG_LEN) / SEG_LEN;
    const camY = ps.p1.world.y + (ps.p2.world.y - ps.p1.world.y) * pf + cam.height;
    // road centre at the camera: the camera follows the player sideways (slightly lagging)
    const camX = player.x * ROAD_W * 0.8;
    let th = -base.curve * CURVE_TO_RAD * camFrac;
    let x = -camX - Math.sin(th) * camFrac * SEG_LEN, z = camFrac * SEG_LEN;
    for (let n = 0; n <= DRAW; n++) {
      const seg = segments[(baseIdx + n) % L];
      P[n] = P[n] || { x: 0, z: 0 }; P[n].x = x; P[n].z = z; TH[n] = th; Y[n] = seg.p1.world.y - camY;
      x += Math.sin(th) * SEG_LEN; z -= Math.cos(th) * SEG_LEN;
      th += seg.curve * CURVE_TO_RAD;
    }
  }
  // camera-space position for something `d` units ahead of the camera, `xn` road half-widths from the centre
  const tmp = { x: 0, y: 0, z: 0, th: 0 };
  function placeAt(d, xn, out = tmp) {
    let s = d / SEG_LEN + camFrac;
    if (s < 0) s = 0; if (s > DRAW - 1) s = DRAW - 1;
    const i = Math.floor(s), f = s - i;
    const th = TH[i] + (TH[i + 1] - TH[i]) * f;
    const cx = P[i].x + (P[i + 1].x - P[i].x) * f, cz = P[i].z + (P[i + 1].z - P[i].z) * f;
    out.th = th; out.x = cx + Math.cos(th) * xn * ROAD_W; out.z = cz + Math.sin(th) * xn * ROAD_W;
    out.y = Y[i] + (Y[i + 1] - Y[i]) * f;
    return out;
  }
  const wrapD = d => { d = ((d % trackLength) + trackLength) % trackLength; return d > trackLength / 2 ? d - trackLength : d; };

  // ---------------------------------------------------------------- road mesh
  let vi = 0;
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col, uv) {
    // a-b at the near edge (left, right), c-d at the far edge (right, left); uv: [ua, va, ub, vb, uc, vc, ud, vd]
    const p = roadPos, c = roadCol, pts = [ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz];
    for (let k = 0; k < 18; k++) p[vi * 3 + k] = pts[k];
    for (let k = 0; k < 6; k++) { c[(vi + k) * 3] = col.r; c[(vi + k) * 3 + 1] = col.g; c[(vi + k) * 3 + 2] = col.b; roadDet[vi + k] = det; }
    const u = [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]];
    for (let k = 0; k < 12; k++) roadUV[vi * 2 + k] = u[k];
    vi += 6;
  }
  // a quad across the road between fractions f1..f2 of segment n (0 = its near end), from lateral a..b at the
  // near end to c..d at the far end (so a strip can widen along a taper)
  function stripT(n, f1, f2, a1, b1, a2, b2, yOff, col) {
    const A = P[n], B = P[n + 1];
    const lerp = (u, v, f) => u + (v - u) * f;
    const px1 = lerp(A.x, B.x, f1), pz1 = lerp(A.z, B.z, f1), px2 = lerp(A.x, B.x, f2), pz2 = lerp(A.z, B.z, f2);
    const t1 = lerp(TH[n], TH[n + 1], f1), t2 = lerp(TH[n], TH[n + 1], f2), y1 = lerp(Y[n], Y[n + 1], f1) + yOff, y2 = lerp(Y[n], Y[n + 1], f2) + yOff;
    const c1 = Math.cos(t1), s1 = Math.sin(t1), c2 = Math.cos(t2), s2 = Math.sin(t2);
    const o1 = lerp(a1, a2, f1), o2 = lerp(b1, b2, f1), o3 = lerp(a1, a2, f2), o4 = lerp(b1, b2, f2);
    // texture coordinates: one asphalt tile per lane across and three lane-widths along (wrapped to keep floats exact)
    const L = segments.length, d1 = (((baseIdx + n + f1) % L) * SEG_LEN) / (TILE * 3), d2 = d1 + (f2 - f1) * SEG_LEN / (TILE * 3);   // tile is 3 lanes long
    quad(px1 + c1 * o1, y1, pz1 + s1 * o1, px1 + c1 * o2, y1, pz1 + s1 * o2,
         px2 + c2 * o4, y2, pz2 + s2 * o4, px2 + c2 * o3, y2, pz2 + s2 * o3, col,
         [o1 / TILE, d1, o2 / TILE, d1, o4 / TILE, d2, o3 / TILE, d2]);
  }
  const strip = (n, o1, o2, yOff, col) => stripT(n, 0, 1, o1, o2, o1, o2, yOff, col);
  function buildRoad() {
    vi = 0;
    const L = segments.length, U = ROAD_W, rw = U / 6, sw = U * 0.35, lw = U / 40, LW = (cfg.LANE_W || 0.6) * U;
    for (let n = 0; n < DRAW; n++) {
      const seg = segments[(baseIdx + n) % L], col = seg.dark ? colors.dark : colors.light, start = vi;
      const h1 = (seg.hw1 || 1) * U, h2 = (seg.hw2 || 1) * U;
      if (seg.junction) {
        // the cross road runs right through: road surface everywhere, its centre line, zebra crossings at the edges
        det = 1; strip(n, -26000, 26000, 0, col.road); det = 0.7;
        const j = seg.junction, k = (baseIdx + n) % L;
        if (k === j.s0 + (j.s1 - j.s0 + 1) / 2) { stripT(n, 0, 0.12, -26000, -h1 - 300, -26000, -h1 - 300, 3, colors.yellow); stripT(n, 0, 0.12, h1 + 300, 26000, h1 + 300, 26000, 3, colors.yellow); }
        if (k === j.s0 || k === j.s1) for (let x = -h1 + 60; x < h1 - 150; x += 300) stripT(n, 0.15, 0.85, x, x + 170, x, x + 170, 3, colors.white);
      } else {
        det = 0; strip(n, -26000, -h1 - rw - sw, -6, col.grass); stripT(n, 0, 1, h1 + rw + sw, 26000, h2 + rw + sw, 26000, -6, col.grass);
        det = 0.3; stripT(n, 0, 1, -h1 - rw - sw, -h1 - rw, -h2 - rw - sw, -h2 - rw, -3, col.shoulder); stripT(n, 0, 1, h1 + rw, h1 + rw + sw, h2 + rw, h2 + rw + sw, -3, col.shoulder);
        det = 0.45; stripT(n, 0, 1, -h1 - rw, -h1, -h2 - rw, -h2, 0, col.rumble); stripT(n, 0, 1, h1, h1 + rw, h2, h2 + rw, 0, col.rumble);
        det = 1; stripT(n, 0, 1, -h1, h1, -h2, h2, 0, col.road); det = 0.7;                       // (paint on top: worn)
        if (seg.finish) {
          const phase = seg.finish === 2 ? 1 : 0;
          for (let q = 0; q < 12; q++) { if ((q + phase) % 2) continue; strip(n, -h1 + 2 * h1 * q / 12, -h1 + 2 * h1 * (q + 1) / 12, 3, colors.white); }
        } else {
          for (const o of [-60, 60]) strip(n, o - lw / 2, o + lw / 2, 3, colors.yellow);          // double yellow centre line
          if (col.lane) for (const sd of [-1, 1]) for (let i = 1; i < (seg.lanes || 1); i++) strip(n, sd * i * LW - lw / 2, sd * i * LW + lw / 2, 3, col.lane);
          // stop lines just before a junction, on each side's own carriageway
          const next = segments[(baseIdx + n + 1) % L], prev = segments[(baseIdx + n - 1 + L) % L];
          if (next.junction && !seg.junction) stripT(n, 0.35, 0.6, -h1, -60, -h1, -60, 3, colors.white);
          if (prev.junction && !seg.junction) stripT(n, 0.4, 0.65, 60, h1, 60, h1, 3, colors.white);
        }
      }
      det = 1;
      for (let used = (vi - start) / 6; used < QUADS; used++) { for (let k = 0; k < 18; k++) roadPos[vi * 3 + k] = 0; vi += 6; }
    }
    road.geometry.attributes.position.needsUpdate = true;
    road.geometry.attributes.color.needsUpdate = true;
    road.geometry.attributes.uv.needsUpdate = true; road.geometry.attributes.detail.needsUpdate = true;
  }

  // Asphalt: a painted tile (one lane wide) that the road's own colours are multiplied by, so the palette
  // stays and the surface gets grain, darker wheel paths with tyre marks, an oily strip down the middle of
  // the lane, patched repairs and cracks. 'detail' fades it per surface (full on the road, worn paint,
  // a little on kerbs and pavement, none on the grass).
  let TILE = 1200;
  function asphaltTexture() {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    x.fillStyle = 'rgb(232,232,232)'; x.fillRect(0, 0, S, S);
    // repair patches (slightly different tone, darker seam)
    for (let i = 0; i < 4; i++) {
      const w = 60 + rnd() * 120, h = 50 + rnd() * 160, px = rnd() * (S - w), py = rnd() * (S - h), t = rnd() < 0.5 ? 224 : 240;
      x.fillStyle = `rgb(${t},${t},${t})`; x.fillRect(px, py, w, h); x.strokeStyle = 'rgba(80,80,80,.18)'; x.lineWidth = 2; x.strokeRect(px, py, w, h);
    }
    // wheel paths: darker, streaky; oil down the middle of the lane
    for (const cx of [0.28, 0.72]) for (let i = 0; i < 260; i++) {
      const px = (cx + (rnd() - 0.5) * 0.09) * S, py = rnd() * S;
      x.fillStyle = `rgba(60,60,60,${0.03 + rnd() * 0.05})`; x.fillRect(px, py, 2 + rnd() * 6, 20 + rnd() * 90);
    }
    for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(40,40,40,${0.05 + rnd() * 0.07})`; x.beginPath(); x.ellipse(S * (0.5 + (rnd() - 0.5) * 0.08), rnd() * S, 8 + rnd() * 18, 16 + rnd() * 40, 0, 0, 7); x.fill(); }
    // cracks
    x.strokeStyle = 'rgba(70,70,70,.55)'; x.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { let px = rnd() * S, py = rnd() * S; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 12; k++) { px += (rnd() - 0.5) * 22; py += (rnd() - 0.3) * 18; x.lineTo(px, py); } x.stroke(); }
    // grain
    const img = x.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 26; d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function roadMaterial() {
    const m = nightify(new T.MeshBasicMaterial({ vertexColors: true, map: asphaltTexture() }), true), night = m.onBeforeCompile;
    m.onBeforeCompile = sh => {
      night(sh);
      sh.vertexShader = 'attribute float detail; varying float vDetail;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvDetail = detail;');
      sh.fragmentShader = 'varying float vDetail;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'diffuseColor *= mix(vec4(1.0), texture2D(map, vUv), vDetail);');
    };
    m.customProgramCacheKey = () => 'road';
    return m;
  }

  // ---------------------------------------------------------------- placing things
  const v3 = new T.Vector3();
  function toScreen(x, y, z) { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H, z: v3.z }; }
  function screenOf(obj, pos, h, w, frameNo) {
    const top = toScreen(pos.x, pos.y + h, pos.z), a = toScreen(pos.x - Math.cos(pos.th) * w / 2, pos.y, pos.z - Math.sin(pos.th) * w / 2),
      b = toScreen(pos.x + Math.cos(pos.th) * w / 2, pos.y, pos.z + Math.sin(pos.th) * w / 2);
    const ok = top.z < 1 && top.x > -200 && top.x < W + 200;
    obj.scr = ok ? { x: top.x, y: top.y, w: Math.abs(b.x - a.x), frame: frameNo } : null;
  }
  function spinWheels(model, dist) { for (const c of model.children) if (c.userData.wheel) c.children.forEach(m => { if (m.userData.spin) m.rotation.x = -dist / 110; }); }
  function walk(model, t, speed) {
    const legs = model.userData.legs; if (!legs) return;
    const a = speed > 0 ? Math.sin(t) * 0.3 : 0;
    legs[0].rotation.x = a; legs[3].rotation.x = a; legs[1].rotation.x = -a; legs[2].rotation.x = -a;
    if (model.userData.tail) model.userData.tail.rotation.z = Math.sin(t * 0.6) * 0.25;   // tail swish
  }
  // Every traffic look is built ahead of time, a little each frame while the title screen and countdown are
  // up (detailed models with three levels of detail take a moment to build), so none is built mid-race.
  let warmQueue = [];
  function queueWarm() {
    warmQueue = [...(cfg.CAR_LOOKS || []).map(l => () => carModelFor(l)), ...(cfg.TRACTOR_LOOKS || []).map(l => () => tractorModel(l)), ...(cfg.BIKE_LOOKS || []).map(l => () => bikeModel(l)),
      ...((cfg.BUS_LOOKS || {})[theme.city] || [BUS_DEFAULT]).flatMap(l => [() => busModel(l), () => busModel({ ...l, crowd: true })]), () => truckModel(SP.truck)];
  }
  function warmStep(budget) {
    const t0 = performance.now();
    while (warmQueue.length && performance.now() - t0 < budget) { lodSink.length = 0; warmQueue.shift()(); }
    lodSink.length = 0;
    return warmQueue.length;
  }
  // Traffic off screen (behind the camera or past the draw distance) is just game data: position, lane,
  // speed, heading (kept on the object). Its model goes back to a pool by look, and the next vehicle that
  // looks the same reuses it, so models aren't built or kept per vehicle. Rivals, the player and animals
  // keep their own.
  const pool = new Map();   // look -> spare models
  function lookOf(obj) {
    if (obj.isRival || obj.isPlayer || obj.type === 'cow' || obj.type === 'dog') return null;
    if (obj.type === 'auto') return 'auto' + JSON.stringify(obj.palette) + SP.rivals.indexOf(obj.img);
    if (obj.look) return obj.type + JSON.stringify(obj.look);
    if (obj.type === 'car') return 'car' + (obj.color || cfg.CAR_COLORS[Math.max(0, SP.cars.indexOf(obj.img))]);
    if (obj.type === 'bike') return 'bike' + SP.bikes.indexOf(obj.img);
    return obj.type;
  }
  function release(obj) {
    const m = vehicles.get(obj); if (!m || !m.userData.look) return false;
    vehicles.delete(obj); m.visible = false;
    if (!pool.has(m.userData.look)) pool.set(m.userData.look, []);
    pool.get(m.userData.look).push(m);
    return true;
  }
  function modelFor(obj) {
    let m = vehicles.get(obj);
    if (m) return m;
    const look = lookOf(obj), spare = look && pool.get(look);
    if (spare && spare.length) {
      m = spare.pop(); m.scale.set(1, 1, 1);
      const ind = m.userData.ind; if (ind) for (const side of ['-1', '1']) for (const lamp of ind[side]) lamp.material = indOff;
      if (m.userData.arm) m.userData.arm.visible = false;
      vehicles.set(obj, m); return m;
    }
    lodSink.length = 0;
    if (obj.isRival || obj.type === 'auto') m = autoModel(obj.palette || { body: obj.color || '#ffcc00', trim: '#111', canopy: '#151515' }, obj.img, obj.driver);
    else if (obj.isPlayer) m = autoModel({ body: '#1e9e4a', trim: '#ffd21f', canopy: '#151515' }, SP.player);
    else if (obj.type === 'bus') m = busModel(obj.look);
    else if (obj.type === 'truck') m = truckModel(SP.truck);
    else if (obj.type === 'car') m = obj.look ? carModelFor(obj.look) : carModel(obj.color || cfg.CAR_COLORS[Math.max(0, SP.cars.indexOf(obj.img))] || '#e9e9ea');
    else if (obj.type === 'tractor') m = tractorModel(obj.look || cfg.TRACTOR_LOOKS[0]);
    else if (obj.type === 'bike') { const i = Math.max(0, SP.bikes.indexOf(obj.img)); m = bikeModel(cfg.BIKE_LOOKS[i]); }
    else if (obj.type === 'cow') m = cowModel(COW_COATS[(obj.coat ??= Math.floor(Math.random() * COW_COATS.length))]);
    else if (obj.type === 'dog') { const i = Math.max(0, SP.dogs.indexOf(obj.look)); m = dogModel(cfg.DOG_COATS[i]); }
    else return null;
    m.userData.lods = lodSink.splice(0); m.userData.look = look; castShadows(m);
    scene.add(m); vehicles.set(obj, m);
    return m;
  }
  // the model viewer's 'rival:<driver id>' (their auto) and 'rival:<driver id>/hit' (with the attack held out)
  function rivalPreview(arg) {
    const [id, hit] = (arg || '').split('/'), d = (cfg.DRIVERS || []).find(o => o.id === id);
    const m = d ? autoModel(d.look, SP.rivalOf[d.id], d) : autoModel({ body: '#1a1a1a', trim: '#f5c400', canopy: '#f5c400' }, SP.rivals[0]);
    if (hit) { m.userData.arm.visible = true; m.userData.armPivot.rotation.z = m.userData.kick ? 0.05 : -0.2; }
    return m;
  }
  // heading relative to the road from how the object actually moved since the last frame: sideways
  // movement against forward movement, so autos and lane-changing traffic point where they're going
  function steerYaw(obj, dist, x) {
    const dd = dist - (obj._pd ?? dist), dx = (x - (obj._px ?? x)) * ROAD_W;
    obj._pd = dist; obj._px = x;
    let yaw = obj._yaw || 0;
    if (Math.abs(dd) < 3000 && Math.abs(dx) < 600 && Math.abs(dd) + Math.abs(dx) > 0.5) { // (skip teleports: respawns, wraps)
      const target = Math.max(-0.55, Math.min(0.55, Math.atan2(dx, Math.max(Math.abs(dd), 30))));
      yaw += (target - yaw) * 0.25;
    } else yaw *= 0.9;
    return (obj._yaw = yaw);
  }
  // sit a body of length len on the road: pitch it to the slope between its ends and lift it where the road
  // sags under it (bottom of a dip), so no end sinks into the road on hills
  const endA = {}, endB = {};
  function onGround(p, d, x, len) {
    const h = len / 2, a = placeAt(d + h, x, endA).y, b = placeAt(d - h, x, endB).y;
    p.pitch = Math.atan2(a - b, len); p.y += Math.max(0, (a + b) / 2 - p.y) + 4;
    return p;
  }
  function placeAuto(obj, m, d, x, rot, atk, hurt, bounce) {
    const p = onGround(placeAt(d, x), d, x, m.userData.size.l);
    // your auto faces its real heading (sharp pivots); rivals point the way they're moving
    const yaw = obj.crash > 0 || obj.ko > 0 ? 0 : obj.isPlayer ? (obj.heading || 0) + (obj.slip || 0) : steerYaw(obj, obj.dist || 0, x);
    m.position.set(p.x + (hurt > 0 ? Math.sin(hurt * 90) * 18 : 0), p.y + bounce, p.z);
    m.rotation.set(p.pitch, -p.th - yaw, -rot, 'YXZ');
    // tipping over: roll about the wheel edge it falls onto (rolling about the middle sinks half the auto into
    // the road), and drop the contact shadow while it's up on its side
    const sh = m.userData.shadowMesh ??= m.children.find(ch => ch.userData.isShadow);
    if (sh) sh.visible = Math.abs(rot) < 0.25;
    if (rot) {
      const px = Math.sign(rot) * m.userData.size.w / 2, side = px * (1 - Math.cos(rot)), a = m.rotation.y;
      m.position.x += side * Math.cos(a); m.position.z -= side * Math.sin(a); m.position.y += Math.abs(px * Math.sin(rot));
    }
    if (m.userData.frontWheel) m.userData.frontWheel.rotation.y = obj.isPlayer ? -(obj.steer || 0) * 0.7 : -yaw * 1.6;
    const arm = m.userData.arm;
    if (atk) {
      const k = Math.min(1, atk.t / atk.dur), e = 1 - (1 - k) * (1 - k);
      arm.visible = true; arm.rotation.y = atk.side < 0 ? Math.PI : 0;
      // a swing comes down from overhead to level; a kick comes up from the footboard to level
      m.userData.armPivot.rotation.z = m.userData.kick ? -1.3 + 1.42 * e : 1.9 - 2.25 * e;
    } else arm.visible = false;
    spinWheels(m, obj.dist || 0);
    return p;
  }

  // ---------------------------------------------------------------- exhaust smoke
  // Two-stroke smoke puffs from the tail pipe, in the world (so the auto hides the ones behind it and they
  // stay where they were puffed out). Standing: faint, almost white, hanging by the pipe and spreading.
  // Steady speed: whitish grey, left behind on the road as a trail. Accelerating: thicker and a bit darker.
  const SMOKE_N = 90, smoke = [];
  let smokeTex = null, smokeT = null, smokeGap = 0, lastSpeed = 0, accel = 0;
  function smokeTexture() {
    if (smokeTex) return smokeTex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (smokeTex = new T.CanvasTexture(c));
  }
  function updateSmoke(player, t) {
    const dt = smokeT == null ? 0 : Math.min(0.1, Math.max(0, t - smokeT)); smokeT = t;
    if (!smoke.length) for (let i = 0; i < SMOKE_N; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false; sp.userData.p = { life: 0, age: 1 }; scene.add(sp); smoke.push(sp);
    }
    const sp = player.speed / cfg.MAX_SPEED;
    if (dt > 0) accel += (Math.max(0, (player.speed - lastSpeed) / dt / cfg.MAX_SPEED) - accel) * Math.min(1, dt * 6);
    lastSpeed = player.speed;
    const hard = Math.min(1, accel * 2.5);                     // 0 cruising / idling .. 1 flooring it
    // emit from the pipe under the right rear of the tub
    smokeGap -= dt;
    if (dt > 0 && player.crash <= 0 && smokeGap <= 0) {
      smokeGap = sp < 0.05 ? 0.16 : 0.035 + (1 - sp) * 0.04 - hard * 0.015;
      const puff = smoke.find(m => m.userData.p.age >= m.userData.p.life);
      if (puff) {
        const idle = sp < 0.05, q = puff.userData.p;
        // shade: white at idle, whitish grey cruising, darker grey accelerating
        const shade = idle ? 0.97 : 0.86 - hard * 0.3;
        Object.assign(q, {
          d: player.dist - 575, x: player.x + 190 / ROAD_W, h: 95, age: 0,
          life: idle ? 1.6 : 0.9 + hard * 0.4,
          s0: idle ? 50 : 70, s1: idle ? 260 : 300 + hard * 160,
          op: idle ? 0.3 : 0.3 + hard * 0.25, shade,
          rise: idle ? 35 : 20, drift: (Math.random() - 0.5) * (idle ? 70 : 90), back: idle ? 40 : 0,
        });
        puff.visible = true;
      }
    }
    // tyre smoke off the rear wheels while drifting
    if (dt > 0 && Math.abs(player.slip || 0) > 0.2 && player.speed > 2400 && Math.random() < 0.7) {
      const puff = smoke.find(m => m.userData.p.age >= m.userData.p.life);
      if (puff) {
        const ang = (player.heading || 0) + player.slip, k = Math.random() < 0.5 ? -1 : 1;
        Object.assign(puff.userData.p, { d: player.dist - 340 * Math.cos(ang) - k * 240 * Math.sin(ang), x: player.x + (-340 * Math.sin(ang) + k * 240 * Math.cos(ang)) / ROAD_W,
          h: 50, age: 0, life: 1.1, s0: 90, s1: 420, op: 0.32, shade: 0.94, rise: 30, drift: (Math.random() - 0.5) * 120, back: 0 });
        puff.visible = true;
      }
    }
    const lit = hemi.intensity / 0.95;
    for (const m of smoke) {
      const q = m.userData.p;
      if (q.age >= q.life) { m.visible = false; continue; }
      q.age += dt; const k = Math.min(1, q.age / q.life);
      q.h += q.rise * dt * (1 - k * 0.5); q.x += q.drift / ROAD_W * dt; q.d -= q.back * dt;
      const dd = wrapD(q.d - camAbs);
      if (dd < 50) { m.visible = false; q.age = q.life; continue; }
      const p = placeAt(dd, q.x);
      m.position.set(p.x, p.y + q.h, p.z);
      const size = q.s0 + (q.s1 - q.s0) * Math.sqrt(k); m.scale.set(size, size, 1);
      m.material.opacity = q.op * Math.min(1, q.age * 8) * (1 - k) * (1 - k * 0.3);
      const c = q.shade * lit; m.material.color.setRGB(c, c, c * 1.02);
      m.visible = true;
    }
  }

  // nearest street lamps and headlights to your auto -> the night shader's uniforms
  const lampCand = [], headCand = [];
  function feedNightLights(pp, visible) {
    lampCand.length = 0; headCand.length = 0;
    for (const m of visible) {
      const u = m.userData;
      if (u.glow) {                                                  // street lamp: its head, out on the arm
        const a = m.rotation.y, lx = u.glow.position.x;
        lampCand.push({ x: m.position.x + lx * Math.cos(a), y: m.position.y + u.glow.position.y, z: m.position.z - lx * Math.sin(a) });
      } else if (u.headY && u.size) {                                // vehicle: beam from the front, dipped a little
        const b = m.rotation.y, fx = -Math.sin(b), fz = -Math.cos(b), h = u.size.l / 2;
        headCand.push({ x: m.position.x + fx * h, y: m.position.y + u.headY, z: m.position.z + fz * h, fx, fz });
      }
    }
    const d2 = c => (c.x - pp.x) ** 2 + (c.z - pp.z) ** 2;
    lampCand.sort((a, b) => d2(a) - d2(b)); headCand.sort((a, b) => d2(a) - d2(b));
    const L = nightU.uLamps.value, HP = nightU.uHeadP.value, HD = nightU.uHeadD.value;
    for (let i = 0; i < NL; i++) {
      const l = lampCand[i]; L[i].set(l ? l.x : 0, l ? l.y : 0, l ? l.z : 0, l ? 1.35 : 0);
      const h = headCand[i];
      if (h) { const n = Math.hypot(h.fx, 0.1, h.fz); HP[i].set(h.x, h.y, h.z, 1.3); HD[i].set(h.fx / n, -0.1 / n, h.fz / n, 4200); } else HP[i].w = 0;
    }
  }

  // ---------------------------------------------------------------- tyre marks
  // dark streaks the rear wheels leave on the road while drifting; each fades out over MARK_LIFE seconds
  const MARK_N = 700, MARK_LIFE = 10, MARK_W = 55;
  let marksMesh = null;
  function updateMarks(marks, now) {
    if (!marksMesh) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(MARK_N * 18), 3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(MARK_N * 24), 4).setUsage(T.DynamicDrawUsage));
      marksMesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      marksMesh.frustumCulled = false; marksMesh.renderOrder = 2; scene.add(marksMesh);
    }
    const pos = marksMesh.geometry.attributes.position.array, col = marksMesh.geometry.attributes.color.array, a = {}, b = {};
    let n = 0;
    for (let i = Math.max(0, marks.length - MARK_N); i < marks.length; i++) {
      const m = marks[i], age = now - m.t; if (age > MARK_LIFE) continue;
      const d1 = wrapD(m.d1 - camAbs), d2 = wrapD(m.d2 - camAbs);
      if (d1 < -600 || d1 > 30000) continue;
      placeAt(d1, m.x1, a); placeAt(d2, m.x2, b);
      let px = -(b.z - a.z), pz = b.x - a.x; const l = Math.hypot(px, pz) || 1; px = px / l * MARK_W / 2; pz = pz / l * MARK_W / 2;
      const q = [a.x - px, a.y + 3, a.z - pz, a.x + px, a.y + 3, a.z + pz, b.x + px, b.y + 3, b.z + pz, a.x - px, a.y + 3, a.z - pz, b.x + px, b.y + 3, b.z + pz, b.x - px, b.y + 3, b.z - pz];
      for (let k = 0; k < 18; k++) pos[n * 18 + k] = q[k];
      const alpha = 0.55 * (1 - age / MARK_LIFE);
      for (let k = 0; k < 6; k++) { col[n * 24 + k * 4] = 0.06; col[n * 24 + k * 4 + 1] = 0.06; col[n * 24 + k * 4 + 2] = 0.07; col[n * 24 + k * 4 + 3] = alpha; }
      n++;
    }
    marksMesh.geometry.setDrawRange(0, n * 6);
    marksMesh.geometry.attributes.position.needsUpdate = true; marksMesh.geometry.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- frame
  let lastVisible = new Set();
  function frame(state) {
    if (!ready || !segments.length) return null;
    const { player, rivals, traffic, frameNo, shake, t, cross = [], lightOf = null, marks = [], now = 0 } = state;
    if (warmQueue.length) warmStep(6);
    buildFrame(player);
    buildRoad();

    // camera: slight shake when hit/crashed
    camera.position.set(shake ? (Math.random() - 0.5) * shake * 60 : 0, shake ? (Math.random() - 0.5) * shake * 40 : 0, 0);
    camera.rotation.set(PITCH_RAD(), 0, 0);
    camera.updateMatrixWorld();

    const visible = new Set();
    // scenery on the visible segments
    const L = segments.length, maxSeg = Math.min(DRAW - 1, Math.floor(OBJ_FAR / SEG_LEN));
    for (let n = 0; n < maxSeg; n++) {
      const seg = segments[(baseIdx + n) % L];
      for (const s of seg.sprites) {
        let m = sceneryMeshes.get(s);
        if (!m) { m = sceneryModel(s); castShadows(m); sceneryMeshes.set(s, m); scene.add(m); }
        const side = s.offset < 0 ? -1 : 1, d = (n - camFrac) * SEG_LEN;
        let p;
        if (s.kind === 'building') { const len = s.len || 1400; p = placeAt(d + len / 2, s.offset + side * 450 / ROAD_W); }
        else if (s.kind === 'arch') p = placeAt(d, 0);
        else if (s.kind === 'lamp') p = placeAt(d, s.offset + side * 0.1);
        else if (s.kind === 'sign' || s.kind === 'signal' || s.kind === 'cop') p = placeAt(d, s.offset);
        else p = placeAt(d, s.offset + side * s.nw / 2);
        m.position.set(p.x, p.y, p.z);
        m.rotation.y = -p.th + (s.kind === 'billboard' || s.kind === 'chai' ? -side * 0.45 : 0) + (s.facing === -1 ? Math.PI : 0);
        if (s.kind === 'signal' && lightOf) { const L = lightOf(s.junction); for (const k of ['R', 'A', 'G']) for (const lm of m.userData.lamps[k]) lm.material = sigMat[k][k === L ? 1 : 0]; }
        if (s.kind === 'cop') m.userData.wave.rotation.z = -1.2 - Math.sin(t * 5) * 0.5;
        m.visible = true; visible.add(m);
        if (s.kind === 'building' || s.kind === 'chai') {
          const sz = m.userData.size;
          const facade = placeAt(d + (s.kind === 'building' ? (s.len || 1400) / 2 : 0), s.offset);
          const q = { x: facade.x, y: facade.y, z: facade.z, th: facade.th };
          screenOf(s, q, s.kind === 'chai' ? sz.h * 0.7 : Math.min(sz.h, 900), s.kind === 'chai' ? sz.w : sz.l, frameNo);
        }
      }
    }
    // vehicles and animals
    const place = (obj, d, x) => {
      if (d < -800 || d > OBJ_FAR) { release(obj); return null; }
      const m = modelFor(obj); if (!m) return null;
      setLod(m, d > TIER.lod[1] ? 2 : d > TIER.lod[0] ? 1 : 0);
      m.visible = true; visible.add(m); return m;
    };
    for (const r of rivals) {
      const dd = wrapD(r.dist - (camAbs));
      const m = place(r, dd, r.x); if (!m) continue;
      const bounce = r.speed > 0 ? Math.sin(t * 22 + r.dist) * 6 : 0;
      const p = placeAuto(r, m, dd, r.x, r.rot || 0, r.atk, r.hurt, bounce);
      screenOf(r, p, 900, 560, frameNo);
    }
    for (const c of traffic) {
      const dd = wrapD(c.z - camAbs);
      const m = place(c, dd, c.x); if (!m) continue;
      const animal = c.type === 'cow' || c.type === 'dog';
      const p = onGround(placeAt(dd, c.x), dd, c.x, animal ? m.userData.size.w : m.userData.size.l);
      const back = c.dir === -1, sy = animal ? 0 : steerYaw(c, c.z, c.x);
      let yaw = back ? -p.th + Math.PI + sy : -p.th - sy; // oncoming vehicles face us
      if (c.type === 'cow') yaw += (c.vx || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (c.type === 'dog') {
        if (c.mode === 'cross') yaw += (c.vx || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;
        else if (c.mode === 'sit' || c.mode === 'sleep') yaw += c.x > 0 ? Math.PI / 2 : -Math.PI / 2;
        m.scale.y = c.mode === 'sleep' ? 0.45 : 1;
        for (const leg of m.userData.legs) leg.visible = c.mode !== 'sleep';
      }
      const lean = c.type === 'bike' ? (back ? 1 : -1) * sy * (c.rash ? 2.4 : 1.4) : 0;   // bikes lean into lane changes
      // rash bikers pop the odd wheelie (front up about the rear wheel)
      const wp = c.rash && c.speed > 0 ? (t * 0.22 + (c.z % 997) / 997) % 1 : 1, wh = wp < 0.14 ? Math.sin(wp / 0.14 * Math.PI) * 0.32 : 0;
      m.position.set(p.x, p.y + Math.sin(wh) * 268, p.z); m.rotation.set((animal ? 0 : back ? -p.pitch : p.pitch) + wh, yaw, lean, 'YXZ');
      if (c.type === 'cow' || c.type === 'dog') walk(m, t * (c.type === 'dog' ? 14 : 6), c.type === 'dog' ? (c.mode === 'chase' || c.mode === 'cross' ? 1 : 0) : (c.pause > 0 ? 0 : Math.abs(c.vx || 0)));
      else {
        spinWheels(m, c.z);
        const ind = m.userData.ind, sx = (c.signalX || 0) * (back ? -1 : 1), on = sx && (t * 2.6) % 1 < 0.55; // model's own left/right
        if (ind) for (const side of ['-1', '1']) for (const lamp of ind[side]) lamp.material = on && +side === sx ? indOn : indOff;
      }
      const sz = m.userData.size; screenOf(c, p, sz.h * 1.05, sz.w, frameNo);
    }
    // cross traffic at junctions: driving across the road (along x)
    for (const c of cross) {
      const dd = wrapD(c.z - camAbs);
      const m = place(c, dd, c.x); if (!m) continue;
      const p = placeAt(dd, c.x);
      m.position.set(p.x, p.y + 4, p.z); m.rotation.set(0, -p.th - c.dirX * Math.PI / 2, 0, 'YXZ');
      spinWheels(m, c.x * ROAD_W);
      if (m.userData.arm) m.userData.arm.visible = false;
    }
    // the player's auto
    const pm = modelFor(player);
    const bump = player.crash > 0 ? 0 : (Math.random() - 0.5) * (Math.abs(player.x) > 1 ? 18 : 5) * (player.speed / cfg.MAX_SPEED);
    const pp = placeAuto(player, pm, cam.back, player.x, player.rot || 0, player.atk, player.hurt, bump);
    pm.visible = !(player.inv > 0 && Math.floor(player.inv * 10) % 2); visible.add(pm);
    for (const m of lastVisible) if (!visible.has(m)) m.visible = false;
    lastVisible = visible;
    updateSmoke(player, t);
    updateMarks(marks, now);
    if (nightU.uNight.value) feedNightLights(pp, visible);
    if (TIER.shadow) {                                           // the shadow box follows you, reaching mostly ahead
      const day = !nightU.uNight.value, e = TIER.shadow.reach;
      sun.castShadow = day; if (roadShade) roadShade.visible = day;
      sun.target.position.set(pp.x * 0.5, pp.y, pp.z - e * 0.6);
      sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 12000);
    }

    if (post) post.render(); else renderer.render(scene, camera);
    const top = toScreen(pp.x, pp.y + 880, pp.z), bot = toScreen(pp.x, pp.y, pp.z);
    return { player: { x: bot.x, y: bot.y, top: top.y } };
  }

  // ---------------------------------------------------------------- glow pass (ultra)
  // The scene renders off screen in HDR; bright parts (headlights, street lamps, signals, sun glints) are
  // picked out, blurred at half and quarter size and added back as glow; then filmic (ACES) tone mapping
  // and a soft vignette. Keeps the canvas transparent where nothing is drawn (the 2D sky shows through).
  const SUN_DIR = new T.Vector3(0.6, 1, 0.4).normalize();
  function makePost() {
    const size = renderer.getDrawingBufferSize(new T.Vector2()), w = size.x, h = size.y, HF = T.HalfFloatType;
    const rt = (a, b, ms) => new T.WebGLRenderTarget(a, b, { type: HF, samples: ms || 0 });
    const scene0 = rt(w, h, 4), half = [rt(w >> 1, h >> 1), rt(w >> 1, h >> 1)], quart = [rt(w >> 2, h >> 2), rt(w >> 2, h >> 2)];
    const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new T.Scene(), quad = new T.Mesh(new T.PlaneGeometry(2, 2));
    quad.frustumCulled = false; quadScene.add(quad);
    const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mat = (frag, uniforms) => new T.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, transparent: false });
    const bright = mat(`uniform sampler2D t; varying vec2 vUv;
      void main(){ vec4 c = texture2D(t, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(c.rgb * smoothstep(0.85, 1.6, l), 1.0); }`, { t: { value: null } });
    const blur = mat(`uniform sampler2D t; uniform vec2 d; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227;
        c += (texture2D(t, vUv + d * 1.385).rgb + texture2D(t, vUv - d * 1.385).rgb) * 0.316;
        c += (texture2D(t, vUv + d * 3.231).rgb + texture2D(t, vUv - d * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0); }`, { t: { value: null }, d: { value: new T.Vector2() } });
    // tone: the painted colours pass through unchanged up to 0.8, brighter values (glows, glints) roll off
    // smoothly instead of clipping; then a touch of contrast and saturation
    const comp = mat(`uniform sampler2D s, b1, b2; uniform float glow; varying vec2 vUv;
      vec3 shoulder(vec3 c){ return mix(c, 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) / 0.2)), step(0.8, c)); }
      void main(){ vec4 sc = texture2D(s, vUv); vec3 g = (texture2D(b1, vUv).rgb + texture2D(b2, vUv).rgb) * glow;
        vec3 c = shoulder(sc.rgb + g);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.08); c = clamp((c - 0.5) * 1.05 + 0.5, 0.0, 1.0); float v = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.6); c *= mix(0.82, 1.0, v);
        float a = max(sc.a, clamp(dot(g, vec3(0.33)), 0.0, 1.0)); gl_FragColor = vec4(c * (sc.a > 0.0 ? 1.0 : a), a); }`,
      { s: { value: scene0.texture }, b1: { value: half[0].texture }, b2: { value: quart[0].texture }, glow: { value: 0.8 } });
    const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); };
    const blurInto = ([a, b2], src, pw, ph) => {
      bright.uniforms.t.value = src; pass(bright, a);
      blur.uniforms.t.value = a.texture; blur.uniforms.d.value.set(1 / pw, 0); pass(blur, b2);
      blur.uniforms.t.value = b2.texture; blur.uniforms.d.value.set(0, 1 / ph); pass(blur, a);
    };
    return {
      render() {
        renderer.setRenderTarget(scene0); renderer.clear(); renderer.render(scene, camera);
        blurInto(half, scene0.texture, w >> 1, h >> 1);
        blurInto(quart, half[0].texture, w >> 2, h >> 2);
        comp.uniforms.glow.value = nightU.uNight.value ? 1.1 : 0.6;
        pass(comp, null);
      },
    };
  }

  // drop models for objects that no longer exist (new race)
  function forget(objs) { for (const o of objs) { const m = vehicles.get(o); if (m && !release(o)) { scene.remove(m); vehicles.delete(o); } } }

  // debug: render one model from four angles into a canvas (used to check models without driving)
  function turntable(kind, size = 360) {
    // drawn by the game's own renderer (so materials share its sky reflections) into a render target, then
    // copied onto a 2D canvas: four views, front three-quarters both sides, the back and the side
    const cv = document.createElement('canvas'); cv.width = size * 2; cv.height = size * 2; const ctx = cv.getContext('2d');
    const sc = new T.Scene(); sc.background = new T.Color('#8a8f99');
    sc.add(new T.HemisphereLight(0xffffff, 0x666666, 1)); const d = new T.DirectionalLight(0xffffff, 0.6); d.position.set(1, 2, 1); sc.add(d);
    const [k0, arg] = kind.split(':');
    const m = k0 === 'player' ? autoModel({ body: '#1e9e4a', trim: '#ffd21f', canopy: '#151515' }, SP.player)
      : k0 === 'rival' ? rivalPreview(arg)
      : k0 === 'bus' ? busModel({ ...((cfg.BUS_LOOKS || {})[(arg || '').split('/')[0] || theme.city] || [BUS_DEFAULT])[+(arg || '').split('/')[1] || 0], ...((arg || '').split('/')[2] ? { crowd: true } : {}) }) : k0 === 'truck' ? truckModel(SP.truck) : k0 === 'car' ? carModel(arg || '#c62828')
      : k0 === 'bike' ? bikeModel(cfg.BIKE_LOOKS[+arg || 0])
      : k0 === 'building' ? buildingModel({ img: TS.buildings[+arg || 0], offset: -1, len: 1400 })
      : k0 === 'look' ? carModelFor(cfg.CAR_LOOKS[+arg || 0]) : k0 === 'tractor' ? tractorModel(cfg.TRACTOR_LOOKS[+arg || 0])
      : k0 === 'cow' ? cowModel(COW_COATS[+arg || 0]) : k0 === 'dog' ? dogModel({ body: '#b07a45', belly: '#e8c9a0', dark: '#6d4a2a' }) : null;
    const k = Math.max(m.userData.size.l, m.userData.size.h) / 1000; m.scale.setScalar(1 / Math.max(1, k * 0.9));
    sc.add(m);
    const cam = new T.PerspectiveCamera(35, 1, 10, 20000), rt = new T.WebGLRenderTarget(size, size), px = new Uint8Array(size * size * 4), img = ctx.createImageData(size, size);
    [[-0.8, 0], [0.8, 0], [Math.PI, 0], [Math.PI / 2, 0]].forEach(([a], i) => {
      cam.position.set(Math.sin(a) * 2600, 1100, -Math.cos(a) * 2600); cam.lookAt(0, 420, 0);
      renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, (i % 2) * size, Math.floor(i / 2) * size);
    });
    renderer.setRenderTarget(null); rt.dispose();
    return cv;
  }

  return { init, setTrack, frame, forget, horizonY, setCamera, turntable, warmStep, get debug() { return { renderer, scene, sun, camera, roadShade }; }, get quality() { return quality; }, get smoke() { return smoke; }, get camera() { return camMode; }, get ready() { return ready; } };
})();
