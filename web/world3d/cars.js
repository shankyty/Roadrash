'use strict';
// The modern car and shared vehicle parts.
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
const chrome3D = envMat(new T.MeshStandardMaterial({ color: '#e6e9ec', metalness: 0.8, roughness: 0.26 }));   // (a touch of its own silver, so sunsets don't turn it pink)
const satin = envMat(new T.MeshStandardMaterial({ color: '#16181b', metalness: 0.3, roughness: 0.35 }));   // black trim, window surrounds
// sky dome for reflections: the theme's sky gradient, a bright sun patch and a road-grey ground
let envTarget = null, pmrem = null;
function buildEnv(night) {
  if (!pmrem) pmrem = new T.PMREMGenerator(renderer);
  const sc = new T.Scene(), sky = theme3D.sky, geo = new T.SphereGeometry(100, 32, 16), col = [];
  const top = new T.Color(sky[0]), mid = new T.Color(sky[1]), hor = new T.Color(sky[2]), gnd = new T.Color(night ? '#0b0d14' : '#55585c'), c = new T.Color();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 100;
    if (y < 0) c.copy(hor).lerp(gnd, Math.min(1, -y * 6)); else if (y < 0.35) c.copy(hor).lerp(mid, y / 0.35); else c.copy(mid).lerp(top, (y - 0.35) / 0.65);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  sc.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
  const sunM = new T.Mesh(new T.SphereGeometry(night ? 3 : 9, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(theme3D.sun || '#fff').multiplyScalar(night ? 1 : 3) }));
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
    for (const sx of [-1, 1]) s.add(rbox(6, 10, 860, chrome3D, sx * (gw / 2 + 3), 404, 140, 4));    // chrome strip under the windows
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
      const re = rbox(60, 36, 40, chrome3D, sx * (Wd / 2 - 158), 306, -R + 8, 14); re.rotation.y = -sx * 0.18; s.add(re);  // reflector
      const drl = rbox(130, 8, 40, headGlow, sx * (Wd / 2 - 118), 280, -R + 6, 4); drl.rotation.y = -sx * 0.18; s.add(drl); // DRL strip
      s.add(rbox(48, 22, 20, chrome3D, sx * (Wd / 2 - 205), 252, -R - 8, 8));   // grille chrome ends
    }
    s.add(facePanel(plate('MH 12 CR', '#fff'), 150, 38, 0, 184, -R - 8, Math.PI));
    // grille slats and badge, fog lamps in the air dam, wipers parked at the foot of the windscreen
    for (const y of [240, 252, 264]) s.add(rbox(Wd * 0.4, 5, 8, chrome3D, 0, y, -R - 16, 2));
    s.add(sph(chrome3D, 52, 26, 12, 0, 252, -R - 20));
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
    const ex = cyl(17, 70, chrome3D, Wd / 2 - 170, 112, R - 8); ex.rotation.x = Math.PI / 2; s.add(ex);
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
      for (const z of [-40, 330]) s.add(rbox(8, 14, 60, chrome3D, x, 330, z, 4));
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
