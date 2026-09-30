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
  const QUADS = 21; // per segment: grass x2, shoulder x2, rumble x2, road, lanes x2, finish cells x12
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
  const matCache = new Map();
  const lambert = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    if (!matCache.has(key)) matCache.set(key, new T.MeshLambertMaterial({ color, ...extra }));
    return matCache.get(key);
  };
  const texCache = new Map();
  const tex = canvas => {
    if (!texCache.has(canvas)) { const t = new T.CanvasTexture(canvas); t.anisotropy = 4; texCache.set(canvas, t); }
    return texCache.get(canvas);
  };
  const spriteMat = canvas => {
    const key = canvas;
    if (!matCache.has(key)) matCache.set(key, new T.MeshLambertMaterial({ map: tex(canvas), transparent: false, alphaTest: 0.5, side: T.DoubleSide }));
    return matCache.get(key);
  };
  const lampGlow = new T.MeshLambertMaterial({ color: '#fff6c0', emissive: '#fff2a0', emissiveIntensity: 0.3 });
  const shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

  const box = (w, h, l, color, x = 0, y = 0, z = 0, extra) => {
    const m = new T.Mesh(unitBox, typeof color === 'object' ? color : lambert(color, extra));
    m.scale.set(w, h, l); m.position.set(x, y, z); return m;
  };
  const cyl = (r, h, color, x = 0, y = 0, z = 0) => { const m = new T.Mesh(unitCyl, lambert(color)); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); return m; };
  const wheel = (r, w, x, y, z) => {
    const g = new T.Group();
    const tyre = cyl(r, w, '#161616'); tyre.rotation.z = Math.PI / 2; g.add(tyre);
    const hub = cyl(r * 0.45, w * 1.05, '#9e9e9e'); hub.rotation.z = Math.PI / 2; g.add(hub);
    g.position.set(x, y, z); g.userData.wheel = true; return g;
  };
  const shadow = (w, l) => { const m = new T.Mesh(blob, shadowMat); m.rotation.x = -Math.PI / 2; m.scale.set(w * 1.15, l * 1.1, 1); m.position.y = 4; m.renderOrder = 1; return m; };
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
  // round headlamp, big framed windscreen with mirrors, boxy canvas canopy with a visor, open sides with the
  // driver and a rear bench seat, a wider rear tub over the back wheels, and two-tone paint.
  function autoModel(pal, rearCanvas) {
    const g = new T.Group(), Wd = 560, L = 1060, R = L / 2;
    const body = pal.body, upper = pal.trim, hood = pal.canopy;
    g.add(shadow(Wd, L));
    // chassis and footboard
    g.add(box(Wd * 0.7, 40, L * 0.9, '#1c1c1c', 0, 120, 0));
    g.add(box(Wd * 0.92, 44, 420, body, 0, 150, -40));
    // rear tub over the back wheels (with the old rear artwork on its back face)
    g.add(box(Wd, 260, 480, body, 0, 265, R - 240));
    g.add(box(Wd * 1.01, 34, 482, upper, 0, 380, R - 240));                          // trim stripe
    for (const sx of [-1, 1]) g.add(box(40, 120, 300, body, sx * (Wd / 2 + 8), 200, R - 190)); // rear wheel arches
    // rear bench seat and backrest
    g.add(box(Wd * 0.84, 90, 230, '#2d4f8a', 0, 440, R - 390));
    g.add(box(Wd * 0.84, 230, 60, '#2d4f8a', 0, 560, R - 285));
    // front: narrow nose down to the front wheel, mudguard, dashboard panel in the upper colour
    g.add(box(250, 300, 190, body, 0, 300, -R + 110));
    g.add(box(Wd * 0.86, 150, 170, upper, 0, 500, -R + 150));                        // dash / upper front panel
    // mudguard: the top half of a short tube arched over the front wheel, its axis across the auto
    const guard = new T.Mesh(halfTube, lambert(body, { side: T.DoubleSide })); guard.rotation.order = 'YXZ'; guard.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    guard.scale.set(290, 150, 290); guard.position.set(0, 118, -R + 70); g.add(guard);
    const lamp = cyl(46, 40, '#fff8d0', 0, 380, -R + 12); lamp.rotation.x = Math.PI / 2;
    lamp.material = lambert('#fff8d0', { emissive: '#fff3b0', emissiveIntensity: 0.6 }); g.add(lamp);
    g.add(box(30, 30, 30, '#ff9800', -90, 440, -R + 40)); g.add(box(30, 30, 30, '#ff9800', 90, 440, -R + 40)); // indicators
    // windscreen (slightly raked) with a frame in the upper colour, and mirrors
    const ws = new T.Group(); ws.position.set(0, 575, -R + 205); ws.rotation.x = 0.16;
    ws.add(box(Wd * 0.82, 250, 12, lambert('#9fc3d6', { transparent: true, opacity: 0.45 }), 0, 125, 0));
    for (const sx of [-1, 1]) ws.add(box(26, 262, 30, upper, sx * Wd * 0.42, 125, 0));
    ws.add(box(Wd * 0.86, 24, 30, upper, 0, 252, 0));
    g.add(ws);
    for (const sx of [-1, 1]) {
      g.add(box(10, 90, 10, '#333', sx * (Wd * 0.46), 640, -R + 190));
      const mir = new T.Mesh(unitSphere, lambert('#333')); mir.scale.set(60, 44, 18); mir.position.set(sx * (Wd * 0.5), 690, -R + 190); g.add(mir);
    }
    // canopy: roof with a visor over the windscreen, canvas back wall, side panels over the rear seat, pillars
    g.add(box(Wd * 1.03, 44, L * 0.86, hood, 0, 830, 10));
    g.add(box(Wd * 0.9, 34, L * 0.8, hood, 0, 866, 20));                            // softer, domed roof edge
    g.add(box(Wd * 1.03, 30, 90, hood, 0, 818, -R + 150));                          // visor
    g.add(box(Wd * 0.99, 400, 40, hood, 0, 630, R - 260));                          // back wall
    for (const sx of [-1, 1]) {
      g.add(box(18, 150, 470, hood, sx * (Wd / 2 + 4), 745, R - 470));              // canvas strip over the doorway
      g.add(box(18, 440, 260, hood, sx * (Wd / 2 + 4), 600, R - 390));              // canvas side behind the passengers
      g.add(box(26, 420, 26, upper, sx * (Wd / 2 - 6), 620, -R + 240));             // A-pillar
      g.add(box(26, 420, 26, hood, sx * (Wd / 2 - 6), 620, R - 520));               // B-pillar
    }
    // driver and passengers
    g.add(box(120, 170, 110, '#3949ab', 0, 470, -R + 400));
    const head = new T.Mesh(unitSphere, lambert('#8d5524')); head.scale.set(100, 115, 100); head.position.set(0, 620, -R + 400); g.add(head);
    g.add(box(40, 30, 160, '#222', 0, 560, -R + 300));                                // handlebar
    for (const px of [-120, 120]) { const h = new T.Mesh(unitSphere, lambert('#2b2b2b')); h.scale.set(90, 100, 90); h.position.set(px, 600, R - 380); g.add(h); }
    // wheels: two at the back under the tub, one in front under the mudguard
    g.add(wheel(125, 80, -Wd / 2 + 40, 125, R - 190));
    g.add(wheel(125, 80, Wd / 2 - 40, 125, R - 190));
    g.add(wheel(118, 70, 0, 118, -R + 70));
    // the painted rear (plate, HORN OK PLEASE, tail lights, rear window) on the back faces
    if (rearCanvas) {
      g.add(facePanel(crop(rearCanvas, 10, 108, 230, 206), Wd, 250, 0, 262, R + 1));
      g.add(facePanel(crop(rearCanvas, 18, 4, 222, 112), Wd * 0.99, 400, 0, 630, R - 239));
    }
    // lathi arm, shown while swinging
    const arm = new T.Group(); arm.position.set(0, 560, -R + 400);
    const armPivot = new T.Group(); armPivot.position.x = Wd * 0.3;
    armPivot.add(box(220, 44, 44, '#3949ab', 110, 0, 0));
    armPivot.add(box(640, 30, 30, '#c8a165', 490, 0, 0));
    arm.add(armPivot); arm.visible = false;
    g.userData.arm = arm; g.userData.armPivot = armPivot; g.add(arm);
    g.userData.size = { w: Wd, h: 880, l: L };
    return g;
  }
  function busModel(rearCanvas) {
    const g = new T.Group(), Wd = 1120, L = 3200;
    g.add(shadow(Wd, L));
    g.add(box(Wd, 900, L, '#c62828', 0, 640, 0));
    g.add(box(Wd * 1.005, 190, L * 1.002, '#f3e2b3', 0, 830, 0));
    for (const sx of [-1, 1]) g.add(box(12, 250, L * 0.86, '#1c2833', sx * (Wd / 2 + 4), 960, -40));
    g.add(box(Wd * 0.9, 330, 12, '#1c2833', 0, 930, -L / 2 - 4));                           // windscreen
    g.add(box(Wd * 0.9, 40, L * 0.8, '#555', 0, 1115, 0));                                   // roof rack
    const bags = ['#8d6e63', '#1565c0', '#c62828', '#558b2f', '#f9a825'];
    for (let i = 0; i < 6; i++) g.add(box(300, 150, 360, bags[i % 5], (i % 2 ? 1 : -1) * 220, 1210, -L / 2 + 500 + i * 380));
    for (const z of [-L / 2 + 520, L / 2 - 560]) for (const sx of [-1, 1]) g.add(wheel(190, 150, sx * (Wd / 2 - 70), 190, z));
    if (rearCanvas) g.add(rearPanel(rearCanvas, Wd, L / 2 + 4, 0));
    g.userData.size = { w: Wd, h: 1300, l: L };
    return g;
  }
  function truckModel(rearCanvas) {
    const g = new T.Group(), Wd = 1120, L = 2800;
    g.add(shadow(Wd, L));
    g.add(box(Wd, 980, 780, '#f4a300', 0, 700, -L / 2 + 390));                             // cab
    g.add(box(Wd * 0.88, 330, 14, '#1c2833', 0, 950, -L / 2 - 4));                           // windscreen
    g.add(box(Wd * 1.01, 90, 790, '#d32f2f', 0, 1120, -L / 2 + 390));                        // painted visor
    g.add(box(Wd, 880, 1900, '#ffca28', 0, 640, L / 2 - 950));                               // cargo body
    g.add(box(Wd * 0.98, 360, 1880, '#1565c0', 0, 1260, L / 2 - 950));                       // tarpaulin
    g.add(box(Wd * 0.9, 120, 1860, '#1976d2', 0, 1480, L / 2 - 950));
    for (const z of [-L / 2 + 420, L / 2 - 700, L / 2 - 330]) for (const sx of [-1, 1]) g.add(wheel(195, 170, sx * (Wd / 2 - 80), 195, z));
    if (rearCanvas) g.add(rearPanel(rearCanvas, Wd, L / 2 + 4, 0));
    g.userData.size = { w: Wd, h: 1500, l: L };
    return g;
  }
  function carModel(color, rearCanvas) {
    const g = new T.Group(), Wd = 760, L = 1500;
    g.add(shadow(Wd, L));
    g.add(box(Wd, 330, L, color, 0, 270, 0));
    g.add(box(Wd * 0.84, 250, L * 0.55, '#1c2833', 0, 560, 60));
    g.add(box(Wd * 0.86, 40, L * 0.5, color, 0, 700, 60));
    for (const z of [-L / 2 + 280, L / 2 - 300]) for (const sx of [-1, 1]) g.add(wheel(125, 110, sx * (Wd / 2 - 50), 125, z));
    if (rearCanvas) g.add(rearPanel(rearCanvas, Wd, L / 2 + 3, 0));
    g.userData.size = { w: Wd, h: 720, l: L };
    return g;
  }
  function legs(g, color, spots, h, r, dz) {
    const out = [];
    for (const [x, z] of spots) {
      const pivot = new T.Group(); pivot.position.set(x, h, z);
      const leg = cyl(r, h, color, 0, -h / 2, 0); pivot.add(leg);
      const hoof = cyl(r * 1.1, h * 0.12, '#3a3030', 0, -h + h * 0.06, 0); pivot.add(hoof);
      g.add(pivot); out.push(pivot);
    }
    g.userData.legs = out; return out;
  }
  function cowModel() {
    const g = new T.Group();
    g.add(shadow(420, 820));
    g.add(box(360, 320, 760, '#f3efe6', 0, 550, 0));
    g.add(box(260, 150, 220, '#f3efe6', 0, 760, -200));                                     // hump
    g.add(box(170, 230, 160, '#f3efe6', 0, 640, -420));                                     // neck
    g.add(box(200, 200, 300, '#f3efe6', 0, 700, -560));                                     // head
    g.add(box(130, 110, 90, '#f2a7a7', 0, 650, -720));                                      // nose
    for (const sx of [-1, 1]) { const horn = new T.Mesh(unitCone, lambert('#c9b48a')); horn.scale.set(40, 170, 40); horn.position.set(sx * 80, 860, -560); horn.rotation.z = -sx * 0.4; g.add(horn); }
    for (const [x, y, z, w, l] of [[182, 600, 80, 6, 200], [-182, 520, -120, 6, 160], [182, 480, -200, 6, 120], [-182, 620, 200, 6, 180]]) g.add(box(w, 120, l, '#2b2222', x, y, z));
    for (let i = 0; i < 7; i++) { const b = new T.Mesh(unitSphere, lambert(i % 2 ? '#ffb300' : '#ff6f00')); b.scale.setScalar(55); const a = -Math.PI / 2 + i * Math.PI / 6; b.position.set(Math.cos(a) * 105, 590 + Math.sin(a) * 60 + 60, -420); g.add(b); }
    const tail = box(24, 300, 24, '#f3efe6', 0, 560, 400); tail.rotation.x = 0.35; g.add(tail);
    legs(g, '#e0dacb', [[-120, -240], [120, -240], [-120, 250], [120, 250]], 390, 38);
    g.userData.size = { w: 360, h: 900, l: 900 };
    return g;
  }
  function dogModel(coat) {
    const g = new T.Group();
    g.add(shadow(180, 420));
    const body = box(170, 160, 400, coat.body, 0, 250, 0); g.add(body);
    g.add(box(172, 50, 300, coat.belly, 0, 180, 0));
    const head = new T.Group(); head.position.set(0, 340, -240);
    head.add(box(150, 140, 160, coat.body, 0, 0, 0));
    head.add(box(90, 70, 110, coat.belly, 0, -30, -120));
    head.add(box(40, 34, 30, '#111', 0, -10, -178));
    for (const sx of [-1, 1]) { const ear = new T.Mesh(unitCone, lambert(coat.dark)); ear.scale.set(50, 90, 40); ear.position.set(sx * 45, 110, 0); head.add(ear); }
    g.add(head); g.userData.head = head;
    const tail = box(26, 170, 26, coat.body, 0, 360, 230); tail.rotation.x = -0.7; g.add(tail);
    if (coat.spots) { g.add(box(174, 80, 120, coat.spots, 0, 280, -40)); }
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
      const facade = new T.MeshLambertMaterial({ map: t });
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
  function archModel(canvas) {
    const g = new T.Group(), w = 2.6 * ROAD_W, h = w * canvas.height / canvas.width;
    const face = new T.Mesh(unitPlane, spriteMat(canvas)); face.scale.set(w, h, 1); face.position.y = h / 2; g.add(face);
    for (const sx of [-1, 1]) g.add(box(260, h * 0.88, 260, '#b71c1c', sx * (w / 2 - 140), h * 0.44, 0));
    g.userData.size = { w, h, l: 260 }; return g;
  }
  function sceneryModel(s) {
    const side = s.offset < 0 ? -1 : 1;
    switch (s.kind) {
      case 'building': return buildingModel(s);
      case 'palm': case 'tree': case 'temple': return crossedModel(s.img, s.nw * ROAD_W);
      case 'billboard': case 'chai': return boardModel(s.img, s.nw * ROAD_W, side);
      case 'lamp': return lampModel(side);
      case 'milestone': return milestoneModel();
      case 'arch': return archModel(s.img);
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
    road = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true }));
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
      white: c('#f5f5f5'),
    };
    scene.fog = new T.Fog(theme.fog, 20000, DRAW * SEG_LEN * 0.97);
    const night = !!theme.night;
    hemi.color.set(night ? '#5a6aa0' : theme.sky[2]); hemi.groundColor.set(night ? '#101020' : theme.light.grass);
    hemi.intensity = night ? 0.55 : 0.95; sun.intensity = night ? 0.15 : 0.55;
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
  function strip(n, o1, o2, yOff, col) {
    const a = P[n], b = P[n + 1], t1 = TH[n], t2 = TH[n + 1], y1 = Y[n] + yOff, y2 = Y[n + 1] + yOff;
    const c1 = Math.cos(t1), s1 = Math.sin(t1), c2 = Math.cos(t2), s2 = Math.sin(t2);
    quad(a.x + c1 * o1, y1, a.z + s1 * o1, a.x + c1 * o2, y1, a.z + s1 * o2,
         b.x + c2 * o2, y2, b.z + s2 * o2, b.x + c2 * o1, y2, b.z + s2 * o1, col);
  }
  function buildRoad() {
    vi = 0;
    const L = segments.length, R = ROAD_W, rw = R / 6, sw = R * 0.35, lw = R / 16;
    for (let n = 0; n < DRAW; n++) {
      const seg = segments[(baseIdx + n) % L], col = seg.dark ? colors.dark : colors.light;
      strip(n, -26000, -R - rw - sw, -6, col.grass); strip(n, R + rw + sw, 26000, -6, col.grass);
      strip(n, -R - rw - sw, -R - rw, -3, col.shoulder); strip(n, R + rw, R + rw + sw, -3, col.shoulder);
      strip(n, -R - rw, -R, 0, col.rumble); strip(n, R, R + rw, 0, col.rumble);
      strip(n, -R, R, 0, col.road);
      let used = 7;
      if (seg.finish) {
        const phase = seg.finish === 2 ? 1 : 0;
        for (let k = 0; k < 12; k++) { if ((k + phase) % 2) continue; strip(n, -R + 2 * R * k / 12, -R + 2 * R * (k + 1) / 12, 3, colors.white); used++; }
      } else if (col.lane) {
        strip(n, -R / 3 - lw / 2, -R / 3 + lw / 2, 3, col.lane); strip(n, R / 3 - lw / 2, R / 3 + lw / 2, 3, col.lane); used += 2;
      }
      for (; used < QUADS; used++) { for (let k = 0; k < 18; k++) roadPos[vi * 3 + k] = 0; vi += 6; }
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
    if (obj.isRival) m = autoModel(obj.palette || { body: obj.color || '#ffcc00', trim: '#111', canopy: '#151515' }, obj.img);
    else if (obj.isPlayer) m = autoModel({ body: '#1e9e4a', trim: '#ffd21f', canopy: '#151515' }, SP.player);
    else if (obj.type === 'bus') m = busModel(SP.bus);
    else if (obj.type === 'truck') m = truckModel(SP.truck);
    else if (obj.type === 'car') { const i = Math.max(0, SP.cars.indexOf(obj.img)); m = carModel(cfg.CAR_COLORS[i] || '#e9e9ea', obj.img); }
    else if (obj.type === 'cow') m = cowModel();
    else if (obj.type === 'dog') { const i = Math.max(0, SP.dogs.indexOf(obj.look)); m = dogModel(cfg.DOG_COATS[i]); }
    else return null;
    scene.add(m); vehicles.set(obj, m);
    return m;
  }
  function placeAuto(obj, m, d, x, rot, atk, hurt, bounce) {
    const p = placeAt(d, x);
    m.position.set(p.x + (hurt > 0 ? Math.sin(hurt * 90) * 18 : 0), p.y + bounce, p.z);
    m.rotation.set(0, -p.th, -rot, 'YXZ');
    const arm = m.userData.arm;
    if (atk) {
      const k = Math.min(1, atk.t / atk.dur), a = -1.9 + 2.25 * (1 - (1 - k) * (1 - k));
      arm.visible = true; arm.rotation.y = atk.side < 0 ? Math.PI : 0; m.userData.armPivot.rotation.z = -a;
    } else arm.visible = false;
    spinWheels(m, obj.dist || 0);
    return p;
  }

  // ---------------------------------------------------------------- frame
  let lastVisible = new Set();
  function frame(state) {
    if (!ready || !segments.length) return null;
    const { player, rivals, traffic, frameNo, shake, t } = state;
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
        else p = placeAt(d, s.offset + side * s.nw / 2);
        m.position.set(p.x, p.y, p.z);
        m.rotation.y = -p.th + (s.kind === 'billboard' || s.kind === 'chai' ? -side * 0.45 : 0);
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
      const p = placeAt(dd, c.x);
      let yaw = -p.th;
      if (c.type === 'cow') yaw += (c.vx || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (c.type === 'dog') {
        if (c.mode === 'cross') yaw += (c.vx || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;
        else if (c.mode === 'sit' || c.mode === 'sleep') yaw += c.x > 0 ? Math.PI / 2 : -Math.PI / 2;
        m.scale.y = c.mode === 'sleep' ? 0.45 : 1;
        for (const leg of m.userData.legs) leg.visible = c.mode !== 'sleep';
      }
      m.position.set(p.x, p.y, p.z); m.rotation.set(0, yaw, 0);
      if (c.type === 'cow' || c.type === 'dog') walk(m, t * (c.type === 'dog' ? 14 : 6), c.type === 'dog' ? (c.mode === 'chase' || c.mode === 'cross' ? 1 : 0) : (c.pause > 0 ? 0 : Math.abs(c.vx || 0)));
      else spinWheels(m, c.z);
      const sz = m.userData.size; screenOf(c, p, sz.h * 1.05, sz.w, frameNo);
    }
    // the player's auto
    const pm = modelFor(player);
    const bump = player.crash > 0 ? 0 : (Math.random() - 0.5) * (Math.abs(player.x) > 1 ? 18 : 5) * (player.speed / cfg.MAX_SPEED);
    const pp = placeAuto(player, pm, cam.back, player.x, player.rot || 0, player.atk, player.hurt, bump);
    pm.visible = !(player.inv > 0 && Math.floor(player.inv * 10) % 2); visible.add(pm);
    for (const m of lastVisible) if (!visible.has(m)) m.visible = false;
    lastVisible = visible;

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
      : kind === 'rival' ? autoModel({ body: '#1a1a1a', trim: '#f5c400', canopy: '#f5c400' }, SP.rivals[0]) : null;
    sc.add(m);
    const cam = new T.PerspectiveCamera(35, 1, 10, 20000); r.setScissorTest(true);
    [[-0.8, 0], [0.8, 0], [Math.PI, 0], [Math.PI / 2, 0]].forEach(([a], i) => {
      const x = (i % 2) * size, y = (1 - Math.floor(i / 2)) * size;
      cam.position.set(Math.sin(a) * 2600, 1100, -Math.cos(a) * 2600); cam.lookAt(0, 420, 0);
      r.setViewport(x, y, size, size); r.setScissor(x, y, size, size); r.render(sc, cam);
    });
    return cv;
  }

  return { init, setTrack, frame, forget, horizonY, setCamera, turntable, get camera() { return camMode; }, get ready() { return ready; } };
})();
