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
  let renderer, scene, camera, hemi, sun, ready = false;
  let road, roadPos, roadCol;
  let segments = [], trackLength = 1, theme = null, SP = null, TS = null, cfg = {};
  const QUADS = 30; // per segment: verge and road (7), centre line (2), lane lines (4), or finish cells (12) / zebra + stop line
  const P = [], TH = [], Y = [];     // per-frame centreline points, headings, heights (camera space)
  let camAbs = 0, camFrac = 0, baseIdx = 0;

  // ---------------------------------------------------------------- shared resources
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const unitCyl = new T.CylinderGeometry(0.5, 0.5, 1, 14);
  const unitCone = new T.ConeGeometry(0.5, 1, 10);
  const unitSphere = new T.SphereGeometry(0.5, 14, 10);
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
  const cyl = (r, h, color, x = 0, y = 0, z = 0) => { const m = new T.Mesh(unitCyl, lambert(color)); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); return m; };
  // tyre: a lathed section with rounded shoulders (axis along Y), open in the middle where the rim sits
  const tyreGeos = new Map(), tyreMat = lambert('#1b1b1b', { side: T.DoubleSide });
  function tyreGeo(r, w) {
    const key = r + ',' + w;
    if (!tyreGeos.has(key)) {
      const ri = r * 0.6, sh = Math.min(w * 0.3, r * 0.2), pts = [new T.Vector2(ri, -w * 0.45)];
      for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI; pts.push(new T.Vector2(r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh)); }
      for (let i = 0; i <= 4; i++) { const a = i / 8 * Math.PI; pts.push(new T.Vector2(r - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh)); }
      pts.push(new T.Vector2(ri, w * 0.45));
      tyreGeos.set(key, new T.LatheGeometry(pts, 24));
    }
    return tyreGeos.get(key);
  }
  // wheel: tyre, a recessed rim with slots (so you can see it turn) and a hub on both faces. The rotating
  // part is one baked child (spinWheels turns the wheel group's children about the axle).
  const wheel = (r, w, x, y, z, rim = '#b9bec4') => {
    const g = new T.Group();
    g.add(baked('wheel' + [r, w, rim], () => {
      const s = new T.Group(), slot = lambert('#202224');
      const tyre = new T.Mesh(tyreGeo(r, w), tyreMat); tyre.rotation.z = Math.PI / 2; s.add(tyre);
      for (const sx of [-1, 1]) {
        const face = sx * w * 0.36;
        const disc = cyl(r * 0.61, w * 0.08, rim, face, 0, 0); disc.rotation.z = Math.PI / 2; s.add(disc);
        const hub = cyl(r * 0.17, w * 0.1, '#3a3a3a', face + sx * w * 0.05, 0, 0); hub.rotation.z = Math.PI / 2; s.add(hub);
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5, h = box(w * 0.03, r * 0.22, r * 0.13, slot, face + sx * w * 0.045, Math.cos(a) * r * 0.39, Math.sin(a) * r * 0.39);
          h.rotation.x = a; s.add(h);
        }
      }
      return s;
    }));
    g.position.set(x, y, z); g.userData.wheel = true; return g;
  };
  const shadow = (w, l) => { const m = new T.Mesh(blob, shadowMat); m.rotation.x = -Math.PI / 2; m.scale.set(w * 1.15, l * 1.1, 1); m.position.y = 4; m.renderOrder = 1; return m; };
  // box with rounded edges and corners (a subdivided cube whose corner zones are pushed onto spheres of radius r)
  const rgeoCache = new Map();
  function roundedGeo(w, h, l, r) {
    r = Math.max(1, Math.min(r, w / 2 - 0.5, h / 2 - 0.5, l / 2 - 0.5));
    const key = [w, h, l, r].map(Math.round).join(',');
    if (rgeoCache.has(key)) return rgeoCache.get(key);
    const k = 3, N = 2 * k + 1, geo = new T.BoxGeometry(1, 1, 1, N, N, N);
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
    const key = Math.round(r) + ',' + Math.round(len);
    if (!capCache.has(key)) capCache.set(key, new T.CapsuleGeometry(r, Math.max(1, len), 4, 10));
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
  function autoModel(pal, rearCanvas) {
    const g = new T.Group(), Wd = 560, L = 1060, R = L / 2;
    const body = pal.body, upper = pal.trim, hood = pal.canopy;
    g.add(shadow(Wd, L));
    // chassis and footboard
    g.add(box(Wd * 0.7, 40, L * 0.9, '#1c1c1c', 0, 120, 0));
    g.add(rbox(Wd * 0.92, 44, 420, body, 0, 150, -40, 18));
    // rounded rear tub over the back wheels, a thin trim line along its sides, bulged wheel arches
    g.add(rbox(Wd, 270, 480, body, 0, 265, R - 240, 40));
    for (const sx of [-1, 1]) {
      g.add(rbox(10, 22, 440, upper, sx * (Wd / 2 + 2), 330, R - 240, 5));
      g.add(rbox(56, 150, 310, body, sx * (Wd / 2 + 8), 205, R - 190, 28));
    }
    // rear bench seat and backrest
    g.add(rbox(Wd * 0.84, 90, 230, '#2d4f8a', 0, 440, R - 390, 25));
    g.add(rbox(Wd * 0.84, 230, 60, '#2d4f8a', 0, 560, R - 285, 22));
    // front: narrow rounded nose down to the front wheel, mudguard, dashboard panel in the upper colour
    g.add(rbox(260, 300, 200, body, 0, 300, -R + 110, 70));
    g.add(rbox(Wd * 0.86, 150, 170, upper, 0, 500, -R + 150, 55));
    const guard = new T.Mesh(halfTube, lambert(body, { side: T.DoubleSide })); guard.rotation.order = 'YXZ'; guard.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    guard.scale.set(290, 150, 290); guard.position.set(0, 118, -R + 70); g.add(guard);
    const lamp = cyl(46, 40, '#fff8d0', 0, 380, -R + 12); lamp.rotation.x = Math.PI / 2;
    lamp.material = headGlow; g.add(lamp); g.userData.headY = 380;
    for (const sx of [-1, 1]) { const ind = new T.Mesh(unitSphere, lambert('#ff9800')); ind.scale.setScalar(34); ind.position.set(sx * 90, 440, -R + 40); g.add(ind); }
    // windscreen (slightly raked) with a frame in the upper colour, and mirrors
    const ws = new T.Group(); ws.position.set(0, 575, -R + 205); ws.rotation.x = 0.16;
    ws.add(box(Wd * 0.82, 250, 12, lambert('#9fc3d6', { transparent: true, opacity: 0.45 }), 0, 125, 0));
    for (const sx of [-1, 1]) ws.add(rbox(26, 262, 30, upper, sx * Wd * 0.42, 125, 0, 12));
    ws.add(rbox(Wd * 0.86, 24, 30, upper, 0, 252, 0, 11));
    g.add(ws);
    for (const sx of [-1, 1]) {
      g.add(cyl(5, 90, '#333', sx * (Wd * 0.46), 640, -R + 190));
      const mir = new T.Mesh(unitSphere, lambert('#333')); mir.scale.set(60, 44, 18); mir.position.set(sx * (Wd * 0.5), 690, -R + 190); g.add(mir);
    }
    // canvas hood: a rounded roof that runs back and curves down into the back wall, which comes down onto the
    // tub (no deck showing behind it); closed sides around the back seat, a strip over the doorway, pillars
    g.add(rbox(Wd * 1.05, 80, L * 0.9, hood, 0, 850, R - L * 0.45, 40));
    g.add(rbox(Wd * 1.04, 520, 70, hood, 0, 640, R - 35, 40));                              // back wall
    for (const sx of [-1, 1]) {
      g.add(rbox(44, 520, 320, hood, sx * (Wd * 0.52 - 22), 640, R - 160, 22));            // sides behind the passengers
      g.add(rbox(30, 140, 480, hood, sx * (Wd * 0.52 - 15), 780, R - 520, 14));            // strip over the doorway
      g.add(cyl(14, 440, upper, sx * (Wd / 2 - 6), 610, -R + 240));                        // A-pillar
    }
    g.add(rbox(Wd * 1.05, 34, 100, hood, 0, 815, -R + 150, 16));                             // visor
    // driver and passengers
    const drv = new T.Mesh(capsule(62, 60), lambert('#3949ab')); drv.position.set(0, 470, -R + 400); g.add(drv);
    const head = new T.Mesh(unitSphere, lambert('#8d5524')); head.scale.set(100, 115, 100); head.position.set(0, 620, -R + 400); g.add(head);
    const bar = cyl(16, 220, '#222', 0, 560, -R + 300); bar.rotation.z = Math.PI / 2; g.add(bar);   // handlebar
    for (const px of [-120, 120]) { const h = new T.Mesh(unitSphere, lambert('#2b2b2b')); h.scale.set(90, 100, 90); h.position.set(px, 600, R - 380); g.add(h); }
    // wheels: two at the back under the tub, one in front under the mudguard
    g.add(wheel(125, 80, -Wd / 2 + 40, 125, R - 190));
    g.add(wheel(125, 80, Wd / 2 - 40, 125, R - 190));
    const pipe = cyl(16, 90, '#3a3a3a', 190, 95, R - 10); pipe.rotation.x = Math.PI / 2; g.add(pipe);   // tail pipe, under the right rear
    const fw = wheel(118, 70, 0, 118, -R + 70); g.add(fw); g.userData.frontWheel = fw;
    // painted rear of the tub (plate, HORN OK PLEASE, tail lights) and the rear window in the hood
    if (rearCanvas) g.add(facePanel(crop(rearCanvas, 10, 108, 230, 206), Wd - 40, 250, 0, 265, R + 1));
    g.add(facePanel(rearWindowCanvas(), 330, 165, 0, 700, R + 1));
    // lathi arm, shown while swinging
    const arm = new T.Group(); arm.position.set(0, 560, -R + 400);
    const armPivot = new T.Group(); armPivot.position.x = Wd * 0.3;
    armPivot.add(rbox(220, 44, 44, '#3949ab', 110, 0, 0, 18));
    const stick = cyl(15, 640, '#c8a165', 490, 0, 0); stick.rotation.z = Math.PI / 2; armPivot.add(stick);
    arm.add(armPivot); arm.visible = false;
    g.userData.arm = arm; g.userData.armPivot = armPivot; g.add(arm);
    g.userData.size = { w: Wd, h: 890, l: L };
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
  function baked(key, build) {
    let parts = bakeCache.get(key);
    if (!parts) {
      const src = build(), byMat = new Map(); src.updateMatrixWorld(true);
      src.traverse(o => {
        if (!o.isMesh) return;
        const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(geo);
      });
      parts = [...byMat].map(([mat, gs]) => { const geo = mergeGeos(gs); gs.forEach(g => g.dispose()); return [mat, geo]; });
      bakeCache.set(key, parts);
    }
    const g = new T.Group();
    for (const [mat, geo] of parts) g.add(new T.Mesh(geo, mat));
    return g;
  }
  // glossy paint and tinted glass (the flat lambert look is fine for canvas and rubber, not for car bodies)
  const paint = (color, shininess = 60) => {
    const key = 'paint' + color + shininess;
    if (!matCache.has(key)) matCache.set(key, nightify(new T.MeshPhongMaterial({ color, shininess, specular: '#4a4a4a' })));
    return matCache.get(key);
  };
  const glass = nightify(new T.MeshPhongMaterial({ color: '#1e2b36', shininess: 110, specular: '#9fb4c4', side: T.DoubleSide }));
  const chrome = nightify(new T.MeshPhongMaterial({ color: '#c9ced4', shininess: 120, specular: '#ffffff' }));
  const tailGlow = lambert('#ff4033', { emissive: '#b00000', emissiveIntensity: 0.6 });

  // a side outline, [u, v] points (u forward, v up; bottom from the back to the front, then over the top back):
  // [u, v] a corner, [cu, cv, u, v] a curve through control point (cu, cv), [cu, cv, r] a wheel arch over (cu, cv)
  function outline(pts) {
    const s = new T.Shape();
    pts.forEach((p, i) => {
      if (!i) s.moveTo(p[0], p[1]);
      else if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else if (p.length === 3) s.absarc(p[0], p[1], p[2], Math.PI, 0, true);
      else s.lineTo(p[0], p[1]);
    });
    return s;
  }
  // the outline extruded across the width with rounded edges (the bevel grows the outline by bev all round)
  function profile(pts, width, bev, mat) {
    const depth = Math.max(1, width - 2 * bev);
    const geo = new T.ExtrudeGeometry(outline(pts), { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 12 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(Math.PI / 2);
    return new T.Mesh(geo, mat);
  }
  // a flat outline on the side of a body at x (side windows)
  function sidePane(pts, mat, x) {
    const geo = new T.ShapeGeometry(outline(pts), 8); geo.rotateY(Math.PI / 2);
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
      // lower body (bevel 26 rounds every edge and makes it 26 bigger all round)
      s.add(profile([[-724, 140], [-700, 110], [-635, 110], [-635, 125], [-470, 125, 165], [-305, 110], [315, 110], [315, 125], [480, 125, 165],
        [645, 110], [705, 110], [730, 115, 730, 180], [728, 280], [720, 330, 640, 345], [330, 385], [-560, 400], [-700, 400, -715, 330]], Wd - 10, 26, body));
      // glasshouse, narrower than the body (tumblehome), with the roof in the body colour
      const gw = Wd * 0.82;
      s.add(profile([[330, 370], [90, 590], [60, 612, 10, 614], [-420, 606], [-470, 604, -500, 580], [-620, 370]], gw, 30, body));
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
        const hl = rbox(150, 52, 40, headGlow, sx * (Wd / 2 - 118), 306, -R + 12, 18); hl.rotation.y = -sx * 0.18; s.add(hl);
        s.add(rbox(48, 22, 20, chrome, sx * (Wd / 2 - 205), 252, -R - 8, 8));   // grille chrome ends
      }
      s.add(facePanel(plate('MH 12 CR', '#fff'), 150, 38, 0, 184, -R - 8, Math.PI));
      // back: tail lamps wrapping the corners, bumper, plate
      for (const sx of [-1, 1]) {
        s.add(rbox(136, 84, 40, dark, sx * (Wd / 2 - 80), 345, R - 18, 18));             // tail lamp: dark bezel, bright lens
        s.add(rbox(112, 60, 40, tailGlow, sx * (Wd / 2 - 80), 345, R - 10, 14));
        s.add(rbox(30, 60, 90, tailGlow, sx * (Wd / 2 - 12), 345, R - 40, 12));
      }
      s.add(rbox(Wd * 0.92, 44, 28, trim, 0, 160, R - 6, 14));
      s.add(facePanel(plate('MH 12 CR', '#fff'), 150, 38, 0, 250, R - 2));
      // sides: door shut lines, handles, mirrors, a rubbing strip
      for (const sx of [-1, 1]) {
        const x = sx * ((Wd - 10) / 2 + 1);
        s.add(box(3, 280, 5, dark, x, 270, -290));
        s.add(box(3, 280, 5, dark, x, 270, 110));
        s.add(box(3, 110, 5, dark, x, 355, 440));
        for (const z of [-40, 330]) s.add(rbox(8, 14, 60, trim, x, 365, z, 4));
        s.add(rbox(10, 22, 700, trim, x, 215, -80, 6));
        s.add(rbox(60, 20, 30, dark, sx * (Wd / 2 + 4), 415, -290, 6));                 // mirror arm
        s.add(rbox(28, 58, 86, body, sx * (Wd / 2 + 34), 432, -300, 14));               // mirror
      }
      return s;
    }));
    for (const z of [-480, 470]) for (const sx of [-1, 1]) g.add(wheel(122, 100, sx * (Wd / 2 - 64), 122, z));
    g.add(shadow(Wd, L));
    indicators(g, Wd, L, 300, 0.7); g.userData.headY = 306;
    g.userData.size = { w: Wd, h: 700, l: L };
    return g;
  }

  // State transport bus: red lower body with a cream belt, a band of sliding windows with frames, a cream
  // roof carrying a luggage rack, split windscreen with wipers, destination board, twin round headlamps and
  // a door on the kerb (left) side.
  function busModel(rearCanvas) {
    const Wd = 1120, L = 3200, R = L / 2, g = new T.Group(), zf = -R + 560, zr = R - 800;
    g.add(baked('bus', () => {
      const s = new T.Group(), red = paint('#c62828', 30), cream = paint('#f3e2b3', 30), dark = lambert('#141517');
      for (const z of [zf, zr]) well(s, 228, Wd + 4, 190, z);
      s.add(rbox(Wd - 40, 70, L - 40, dark, 0, 175, 0, 20));                              // skirt
      s.add(rbox(Wd, 560, L, red, 0, 450, 0, 60));                                        // lower body
      s.add(rbox(Wd + 8, 64, L + 8, cream, 0, 640, 0, 24));                               // cream belt
      s.add(rbox(Wd + 10, 16, L + 10, paint('#f9a825'), 0, 590, 0, 8));                  // yellow pinstripe
      s.add(rbox(Wd - 16, 330, L - 16, glass, 0, 890, 0, 40));                            // window band
      s.add(rbox(Wd, 150, L, cream, 0, 1110, 0, 70));                                     // roof
      // window frames and pillars on both sides, and the sliding-window rail
      for (const sx of [-1, 1]) {
        const x = sx * (Wd / 2 - 6), from = sx < 0 ? -R + 720 : -R + 400;
        for (let z = from; z < R - 100; z += 300) s.add(rbox(14, 330, 50, red, x, 890, z, 6));
        s.add(rbox(14, 14, L - 300, chrome, x + sx * 2, 960, 60, 5));
        s.add(facePanel(lettering('STATE TRANSPORT', '#c62828', '#f3e2b3', 512, 64, 'bold 40px Arial'), 1000, 125, sx * (Wd / 2 + 1), 440, 200, sx * Math.PI / 2));
      }
      // front door on the kerb side (-x): glass leaf with frame and a step
      s.add(rbox(10, 820, 380, glass, -(Wd / 2 + 2), 600, -R + 400, 6));
      for (const z of [-R + 205, -R + 595]) s.add(rbox(14, 830, 20, chrome, -(Wd / 2 + 4), 600, z, 5));
      s.add(rbox(16, 20, 380, chrome, -(Wd / 2 + 5), 640, -R + 400, 5));
      s.add(rbox(120, 40, 360, dark, -(Wd / 2 - 40), 190, -R + 400, 10));
      // front: windscreen divider, wipers, destination board, grille, headlamps, bumper, plate
      s.add(rbox(50, 330, 24, red, 0, 890, -R + 4, 10));
      for (const sx of [-1, 1]) { const w = box(10, 280, 8, dark, sx * 200, 820, -R - 2); w.rotation.z = sx * 0.5; s.add(w); }
      s.add(rbox(Wd * 0.74, 100, 24, dark, 0, 1110, -R - 2, 10));
      s.add(facePanel(lettering('MUMBAI CST', '#111', '#ffb300', 256, 40, 'bold 26px Arial'), Wd * 0.7, 84, 0, 1110, -R - 16, Math.PI));
      s.add(rbox(Wd * 0.46, 150, 24, dark, 0, 440, -R - 2, 12));
      for (let i = 0; i < 4; i++) s.add(rbox(Wd * 0.44, 10, 10, chrome, 0, 390 + i * 34, -R - 14, 4));
      for (const sx of [-1, 1]) for (const dx of [150, 285]) roundLamp(s, 52, sx * (Wd / 2 - dx), 420, -R - 6);
      s.add(rbox(Wd + 20, 90, 70, dark, 0, 245, -R - 10, 25));
      s.add(facePanel(plate('MH 01 BS', '#ffd21f'), 190, 48, 0, 330, -R - 8, Math.PI));
      s.add(rbox(Wd + 20, 90, 70, dark, 0, 245, R + 10, 25));
      // roof rack and luggage
      s.add(rbox(Wd * 0.9, 20, L * 0.8, '#555', 0, 1195, 0, 8));
      for (const sx of [-1, 1]) s.add(rbox(16, 50, L * 0.8, chrome, sx * Wd * 0.45, 1215, 0, 6));
      const bags = ['#8d6e63', '#1565c0', '#c62828', '#558b2f', '#f9a825'];
      for (let i = 0; i < 6; i++) s.add(rbox(300, 120, 360, bags[i % 5], (i % 2 ? 1 : -1) * 220, 1265, -R + 500 + i * 380, 45));
      // painted back (ladder, board, lamps, plate) from the 2D sprite
      if (rearCanvas) s.add(facePanel(crop(rearCanvas, 8, 30, 292, 302), Wd - 60, 1000, 0, 685, R + 2));
      return s;
    }));
    for (const z of [zf, zr]) for (const sx of [-1, 1]) g.add(wheel(190, 150, sx * (Wd / 2 - 54), 190, z, '#d5d8dc'));
    g.add(shadow(Wd, L));
    indicators(g, Wd, L, 330); g.userData.headY = 420;
    g.userData.size = { w: Wd, h: 1300, l: L };
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
      // tarpaulin bulging over the load, tied down with ropes
      s.add(rbox(Wd * 0.97, 420, bl - 60, paint('#1565c0', 15), 0, 1270, bz + 10, 190));
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
    for (const z of axles) for (const sx of [-1, 1]) g.add(wheel(195, 170, sx * (Wd / 2 - 56), 195, z, '#9e1b1b'));
    g.add(shadow(Wd, L));
    indicators(g, Wd, L, 450); g.userData.headY = 560;
    g.userData.size = { w: Wd, h: 1500, l: L };
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
  function cowModel() {
    const g = new T.Group(), hide = '#f3efe6';
    g.add(shadow(420, 820));
    g.add(blobAt(hide, 380, 360, 820, 0, 560, 0));                                            // barrel body
    g.add(blobAt(hide, 330, 300, 360, 0, 590, 250));                                          // haunches
    g.add(blobAt(hide, 240, 200, 260, 0, 730, -210));                                         // zebu hump
    const neck = new T.Mesh(capsule(95, 150), lambert(hide)); neck.position.set(0, 650, -410); neck.rotation.x = 0.9; g.add(neck);
    g.add(blobAt('#e6dfd0', 120, 180, 220, 0, 490, -330));                                    // dewlap
    const head = new T.Group(); head.position.set(0, 720, -560); head.rotation.x = 0.35; g.add(head);
    head.add(rbox(180, 190, 300, hide, 0, 0, 0, 80));
    head.add(blobAt('#f2a7a7', 150, 120, 110, 0, -40, -150));                                  // muzzle
    for (const sx of [-1, 1]) {
      head.add(blobAt('#111', 30, 30, 30, sx * 88, 30, -40));                                   // eyes
      head.add(blobAt('#e7dccb', 110, 40, 60, sx * 120, 50, 60));                               // ears
      const horn = new T.Mesh(unitCone, lambert('#c9b48a')); horn.scale.set(44, 170, 44); horn.position.set(sx * 70, 150, 50); horn.rotation.z = -sx * 0.45; head.add(horn);
    }
    // dark patches sitting on the barrel's surface
    for (const [side, y, z, s] of [[1, 600, 80, 200], [-1, 520, -120, 160], [1, 470, -220, 120], [-1, 630, 200, 180]]) {
      const ny = (y - 560) / 180, nz = z / 410, x = side * 190 * Math.sqrt(Math.max(0, 1 - ny * ny - nz * nz));
      g.add(blobAt('#2b2222', 30, s * 0.7, s, x, y, z));
    }
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + i * Math.PI / 6; g.add(blobAt(i % 2 ? '#ffb300' : '#ff6f00', 55, 55, 55, Math.cos(a) * 105, 600 + Math.sin(a) * 60 + 20, -440)); }
    const tail = new T.Mesh(capsule(14, 300), lambert(hide)); tail.position.set(0, 540, 430); tail.rotation.x = 0.3; g.add(tail);
    g.add(blobAt('#2b2222', 40, 80, 40, 0, 390, 470));                                        // tail tuft
    legs(g, '#e0dacb', [[-110, -240], [110, -240], [-110, 250], [110, 250]], 400, 40);
    g.userData.size = { w: 380, h: 900, l: 900 };
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
  function buildingModel(s) {
    const img = s.img, len = s.len || 1400, depth = 900;
    const bh = img.bh || img.height * 0.8;
    const height = len * bh / 300;
    const key = img;
    if (!buildingMats.has(key)) {
      const t = tex(img).clone(); t.needsUpdate = true;
      t.repeat.set(300 / img.width, bh / img.height); t.offset.set(10 / img.width, 0);
      const facade = nightify(new T.MeshLambertMaterial({ map: t }));
      const wall = lambert(img.wallColor || '#b9a88f'), roof = lambert('#4a4540');
      buildingMats.set(key, { left: [facade, wall, roof, wall, wall, wall], right: [wall, facade, roof, wall, wall, wall] });
    }
    const mats = buildingMats.get(key)[s.offset < 0 ? 'left' : 'right'];
    const g = new T.Group();
    const m = new T.Mesh(unitBox, mats); m.scale.set(depth, height, len); m.position.set(0, height / 2, 0); g.add(m);
    const tank = cyl(90, 180, '#1e1e1e', (s.offset < 0 ? -1 : 1) * 150, height + 90, -len / 4); g.add(tank);
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
    geo.setAttribute('position', new T.BufferAttribute(roadPos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('color', new T.BufferAttribute(roadCol, 3).setUsage(T.DynamicDrawUsage));
    road = new T.Mesh(geo, nightify(new T.MeshBasicMaterial({ vertexColors: true }), true));
    road.frustumCulled = false; scene.add(road);
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
    for (const m of sceneryMeshes.values()) scene.remove(m);
    for (const m of vehicles.values()) scene.remove(m);
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
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col) {
    // a-b at the near edge (left, right), c-d at the far edge (right, left)
    const p = roadPos, c = roadCol, pts = [ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz];
    for (let k = 0; k < 18; k++) p[vi * 3 + k] = pts[k];
    for (let k = 0; k < 6; k++) { c[(vi + k) * 3] = col.r; c[(vi + k) * 3 + 1] = col.g; c[(vi + k) * 3 + 2] = col.b; }
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
    quad(px1 + c1 * o1, y1, pz1 + s1 * o1, px1 + c1 * o2, y1, pz1 + s1 * o2,
         px2 + c2 * o4, y2, pz2 + s2 * o4, px2 + c2 * o3, y2, pz2 + s2 * o3, col);
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
        strip(n, -26000, 26000, 0, col.road);
        const j = seg.junction, k = (baseIdx + n) % L;
        if (k === j.s0 + (j.s1 - j.s0 + 1) / 2) { stripT(n, 0, 0.12, -26000, -h1 - 300, -26000, -h1 - 300, 3, colors.yellow); stripT(n, 0, 0.12, h1 + 300, 26000, h1 + 300, 26000, 3, colors.yellow); }
        if (k === j.s0 || k === j.s1) for (let x = -h1 + 60; x < h1 - 150; x += 300) stripT(n, 0.15, 0.85, x, x + 170, x, x + 170, 3, colors.white);
      } else {
        strip(n, -26000, -h1 - rw - sw, -6, col.grass); stripT(n, 0, 1, h1 + rw + sw, 26000, h2 + rw + sw, 26000, -6, col.grass);
        stripT(n, 0, 1, -h1 - rw - sw, -h1 - rw, -h2 - rw - sw, -h2 - rw, -3, col.shoulder); stripT(n, 0, 1, h1 + rw, h1 + rw + sw, h2 + rw, h2 + rw + sw, -3, col.shoulder);
        stripT(n, 0, 1, -h1 - rw, -h1, -h2 - rw, -h2, 0, col.rumble); stripT(n, 0, 1, h1, h1 + rw, h2, h2 + rw, 0, col.rumble);
        stripT(n, 0, 1, -h1, h1, -h2, h2, 0, col.road);
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
      for (let used = (vi - start) / 6; used < QUADS; used++) { for (let k = 0; k < 18; k++) roadPos[vi * 3 + k] = 0; vi += 6; }
    }
    road.geometry.attributes.position.needsUpdate = true;
    road.geometry.attributes.color.needsUpdate = true;
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
  function spinWheels(model, dist) { for (const c of model.children) if (c.userData.wheel) c.children.forEach(m => { m.rotation.x = -dist / 110; }); }
  function walk(model, t, speed) {
    const legs = model.userData.legs; if (!legs) return;
    const a = speed > 0 ? Math.sin(t) * 0.3 : 0;
    legs[0].rotation.x = a; legs[3].rotation.x = a; legs[1].rotation.x = -a; legs[2].rotation.x = -a;
  }
  function modelFor(obj) {
    let m = vehicles.get(obj);
    if (m) return m;
    if (obj.isRival || obj.type === 'auto') m = autoModel(obj.palette || { body: obj.color || '#ffcc00', trim: '#111', canopy: '#151515' }, obj.img);
    else if (obj.isPlayer) m = autoModel({ body: '#1e9e4a', trim: '#ffd21f', canopy: '#151515' }, SP.player);
    else if (obj.type === 'bus') m = busModel(SP.bus);
    else if (obj.type === 'truck') m = truckModel(SP.truck);
    else if (obj.type === 'car') { const i = Math.max(0, SP.cars.indexOf(obj.img)); m = carModel(obj.color || cfg.CAR_COLORS[i] || '#e9e9ea'); }
    else if (obj.type === 'cow') m = cowModel();
    else if (obj.type === 'dog') { const i = Math.max(0, SP.dogs.indexOf(obj.look)); m = dogModel(cfg.DOG_COATS[i]); }
    else return null;
    scene.add(m); vehicles.set(obj, m);
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
    const p = onGround(placeAt(d, x), d, x, m.userData.size.l), yaw = obj.crash > 0 || obj.ko > 0 ? 0 : steerYaw(obj, obj.dist || 0, x);
    m.position.set(p.x + (hurt > 0 ? Math.sin(hurt * 90) * 18 : 0), p.y + bounce, p.z);
    m.rotation.set(p.pitch, -p.th - yaw, -rot, 'YXZ');
    if (m.userData.frontWheel) m.userData.frontWheel.rotation.y = -yaw * 1.6;
    const arm = m.userData.arm;
    if (atk) {
      const k = Math.min(1, atk.t / atk.dur), a = -1.9 + 2.25 * (1 - (1 - k) * (1 - k));
      arm.visible = true; arm.rotation.y = atk.side < 0 ? Math.PI : 0; m.userData.armPivot.rotation.z = -a;
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

  // ---------------------------------------------------------------- frame
  let lastVisible = new Set();
  function frame(state) {
    if (!ready || !segments.length) return null;
    const { player, rivals, traffic, frameNo, shake, t, cross = [], lightOf = null } = state;
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
        if (!m) { m = sceneryModel(s); sceneryMeshes.set(s, m); scene.add(m); }
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
      if (d < -800 || d > OBJ_FAR) return null;
      const m = modelFor(obj); if (!m) return null;
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
      m.position.set(p.x, p.y, p.z); m.rotation.set(animal ? 0 : back ? -p.pitch : p.pitch, yaw, 0, 'YXZ');
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
    if (nightU.uNight.value) feedNightLights(pp, visible);

    renderer.render(scene, camera);
    const top = toScreen(pp.x, pp.y + 880, pp.z), bot = toScreen(pp.x, pp.y, pp.z);
    return { player: { x: bot.x, y: bot.y, top: top.y } };
  }

  // drop models for objects that no longer exist (new race)
  function forget(objs) { for (const o of objs) { const m = vehicles.get(o); if (m) { scene.remove(m); vehicles.delete(o); } } }

  // debug: render one model from four angles into a canvas (used to check models without driving)
  function turntable(kind, size = 360) {
    const cv = document.createElement('canvas'); cv.width = size * 2; cv.height = size * 2;
    const r = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); r.setClearColor('#8a8f99');
    const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x666666, 1)); const d = new T.DirectionalLight(0xffffff, 0.6); d.position.set(1, 2, 1); sc.add(d);
    const m = kind === 'player' ? autoModel({ body: '#1e9e4a', trim: '#ffd21f', canopy: '#151515' }, SP.player)
      : kind === 'rival' ? autoModel({ body: '#1a1a1a', trim: '#f5c400', canopy: '#f5c400' }, SP.rivals[0])
      : kind === 'bus' ? busModel(SP.bus) : kind === 'truck' ? truckModel(SP.truck) : kind === 'car' ? carModel('#c62828')
      : kind === 'cow' ? cowModel() : kind === 'dog' ? dogModel({ body: '#b07a45', belly: '#e8c9a0', dark: '#6d4a2a' }) : null;
    const k = Math.max(m.userData.size.l, m.userData.size.h) / 1000; m.scale.setScalar(1 / Math.max(1, k * 0.9));
    sc.add(m);
    const cam = new T.PerspectiveCamera(35, 1, 10, 20000); r.setScissorTest(true);
    [[-0.8, 0], [0.8, 0], [Math.PI, 0], [Math.PI / 2, 0]].forEach(([a], i) => {
      const x = (i % 2) * size, y = (1 - Math.floor(i / 2)) * size;
      cam.position.set(Math.sin(a) * 2600, 1100, -Math.cos(a) * 2600); cam.lookAt(0, 420, 0);
      r.setViewport(x, y, size, size); r.setScissor(x, y, size, size); r.render(sc, cam);
    });
    return cv;
  }

  return { init, setTrack, frame, forget, horizonY, setCamera, turntable, get smoke() { return smoke; }, get camera() { return camMode; }, get ready() { return ready; } };
})();
