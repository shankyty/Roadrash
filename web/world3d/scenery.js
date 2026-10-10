'use strict';
// Roadside scenery models.
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
// A hand cart parked on its pull handles: the plank bed slopes up the way the traffic goes (the ramp). The
// model's origin is the cart's near end, on the ground.
// A pothole: a dark patch with a broken rim (and muddy water in a wet one), a hair above the road so it never flickers into it. Origin: its near end.
function potholeModel(s) {
  const g = new T.Group(), Wd = s.nw * ROAD_W_3D, L = 260;
  const layers = [[1, '#5f5953', 2], [0.82, '#1e1a17', 4], ...(s.wet ? [[0.74, '#6b5233', 6]] : [])]; // (wet: muddy water)
  for (const [k, color, y] of layers) { const m = cyl(0.5, 1, color, 0, y, -L / 2); m.scale.set(Wd * k, 1, L * k); g.add(m); }
  g.userData.size = { w: Wd, h: 6, l: L }; return g;
}
function cartModel(s) {
  const g = new T.Group(), Wd = s.nw * ROAD_W_3D * 0.9, L = s.len || 800, rise = 260, tilt = Math.atan2(rise, L);
  const bed = new T.Group(); bed.position.set(0, rise / 2 + 26, -L / 2); bed.rotation.x = tilt; g.add(bed);
  bed.add(box(Wd, 26, L, '#a1764a', 0, 0, 0));                                                         // planks
  for (const x of [-1, 1]) bed.add(box(34, 70, L, '#6d4c2f', x * (Wd / 2 - 17), 22, 0));               // side rails
  bed.add(box(Wd, 90, 30, '#6d4c2f', 0, 32, -L / 2 + 15));                                             // the board across the far end
  for (const x of [-1, 1]) bed.add(box(44, 44, 420, '#7b3f1d', x * Wd * 0.3, -20, L / 2 + 190));       // the two shafts it rests on (their ends are under the footpath's surface)
  bed.add(cylX(22, Wd * 0.75, '#7b3f1d', 0, -20, L / 2 + 380));                                        // pull bar
  for (const x of [-1, 1]) g.add(wheel(150, 70, x * (Wd / 2 + 45), 150, -L * 0.55, '#6f6f6f'));        // two big tyres under the bed
  g.userData.size = { w: Wd + 160, h: rise + 110, l: L + 420 }; return g;
}
// A chai stall: a plank counter under a striped awning on two posts, with the kettle on its stove, a row of
// glasses, the CHAI board, and the chaiwala behind it. Its front (-z here) is turned to face the road.
function stallModel(s) {
  const g = new T.Group(), W = s.nw * ROAD_W_3D, D = W * 0.5, post = '#5d4037', plank = '#8d6e63';
  for (const x of [-1, 1]) g.add(box(36, 900, 36, post, x * (W / 2 - 40), 450, -D / 2 + 30));                 // the two front posts
  for (const x of [-1, 1]) g.add(box(30, 760, 30, post, x * (W / 2 - 40), 380, D / 2 - 30));                  // the two back posts
  const awning = new T.Group(); awning.position.set(0, 900, 0); awning.rotation.x = 0.18; g.add(awning);         // sloping down to the front
  const n = 11, sw = (W + 60) / n; for (let i = 0; i < n; i++) awning.add(box(sw + 2, 20, D + 140, i % 2 ? '#ffffff' : '#e53935', -(W + 60) / 2 + sw * (i + 0.5), 0, 0));
  g.add(box(W * 0.48, 150, 24, '#ffeb3b', 0, 1000, -D / 2 - 40));                                               // the board over the front
  const sign = document.createElement('canvas'); sign.width = 256; sign.height = 64; const sc = sign.getContext('2d');
  sc.fillStyle = '#ffeb3b'; sc.fillRect(0, 0, 256, 64); sc.fillStyle = '#b71c1c'; sc.font = 'bold 44px Impact, Arial Black'; sc.textAlign = 'center'; sc.textBaseline = 'middle'; sc.fillText('CHAI', 128, 34);
  const face = new T.Mesh(unitPlane, spriteMat(sign)); face.scale.set(W * 0.48, 150, 1); face.position.set(0, 1000, -D / 2 - 54); g.add(face);
  g.add(box(W * 0.78, 330, D * 0.7, plank, 0, 165, 0));                                                          // the counter
  for (let x = -W * 0.39 + 100; x < W * 0.39; x += 130) g.add(box(10, 330, D * 0.7 + 4, '#6d4c41', x, 165, 0));    // its plank lines
  g.add(box(W * 0.84, 40, D * 0.8, '#a1887f', 0, 350, 0));                                                       // the counter top
  g.add(cyl(70, 24, '#ff7043', -W * 0.2, 382, -40)); g.add(sph(lambert('#bdbdbd'), 70, 60, 70, -W * 0.2, 440, -40)); g.add(cylX(10, 90, '#bdbdbd', -W * 0.2 + 90, 455, -40)); // stove, kettle, spout
  for (let i = 0; i < 5; i++) { g.add(box(36, 56, 36, '#e0c080', 20 + i * 60, 398, -60)); g.add(box(38, 30, 38, '#8d5524', 20 + i * 60, 385, -60)); }   // glasses of tea
  g.add(box(170, 300, 110, '#3949ab', 0, 500, D * 0.38)); g.add(sph(lambert('#8d5524'), 48, 54, 48, 0, 700, D * 0.38));            // the chaiwala
  g.userData.size = { w: W, h: 1080, l: D + 140 }; return g;
}
function milestoneModel() {
  const g = new T.Group();
  g.add(box(140, 180, 60, '#f5f5f5', 0, 90, 0)); g.add(box(140, 90, 62, '#ffcc00', 0, 225, 0));
  g.userData.size = { w: 140, h: 270, l: 60 }; return g;
}
function archModel(canvas, s) {
  const g = new T.Group(), w = (s.nw || 2.6) * ROAD_W_3D, h = w * canvas.height / canvas.width;
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
  const g = new T.Group(), lamps = { R: [], A: [], G: [] }, arm = ((s.junction && s.junction.half) || 1.2) * ROAD_W_3D * 0.6;
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
    case 'palm': case 'tree': case 'temple': return crossedModel(s.img, s.nw * ROAD_W_3D);
    case 'billboard': return boardModel(s.img, s.nw * ROAD_W_3D, side);
    case 'chai': return stallModel(s);
    case 'lamp': return lampModel(side);
    case 'milestone': return milestoneModel();
    case 'cart': return cartModel(s);
    case 'pothole': return potholeModel(s);
    case 'arch': return archModel(s.img, s);
    case 'sign': return signModel(s);
    case 'signal': return signalModel(s);
    case 'cop': return copModel();
    default: return crossedModel(s.img, s.nw * ROAD_W_3D);
  }
}
