'use strict';
// Vehicle model kit and the auto-rickshaw.
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
  else if (shape === 'cloth') {
    // a gamchha: a broad strip of cloth, hung face-on to the camera behind (edge-on it was a thin line), drooping
    // towards its end, with the white bands of its check and a fringe
    for (const [x, y, len, h, rz] of [[345, 0, 240, 100, 0], [565, -16, 240, 112, -0.13], [770, -52, 210, 122, -0.27]]) {
      const seg = rbox(len, h, 12, c, x, y, 0, 6); seg.rotation.z = rz; s.add(seg);
      const band = box(18, h + 2, 14, '#f5f5f5', x + len * 0.22, y - Math.sin(-rz) * len * 0.22, 0); band.rotation.z = rz; s.add(band);
    }
    const fringe = box(26, 128, 14, '#f5f5f5', 872, -80, 0); fringe.rotation.z = -0.27; s.add(fringe);
  }
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
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
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
  const seat = (look && look.seat) || '#2d4f8a';
  g.add(rbox(Wd * 0.84, 90, 230, seat, 0, 440 - lowY, R - 390, 25));
  g.add(rbox(Wd * 0.84, 230, 60, seat, 0, 560 - lowY, R - 285, 22));
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
  const driverParts = g.userData.driver = []; // the driver, to duck a blow to the roof
  const addD = o => { o.userData.y0 = o.position.y; driverParts.push(o); g.add(o); return o; };
  const drv = new T.Mesh(capsule(62, 60), lambert(shirt)); drv.position.set(0, 470 - lowY, drvZ); addD(drv);
  const head = new T.Mesh(unitSphere, lambert('#8d5524')); head.scale.set(100, 115, 100); head.position.set(0, 620 - lowY, drvZ); addD(head);
  // a canvas visor strip across the front of the hood, with a tricolour stripe down the middle of it
  if (look && look.visor) {
    const vy = 812 - lowY, vz = -R + (M ? 215 : 150);
    g.add(rbox(Wd * 1.07, 46, 170, look.visor, 0, vy, vz, 20));
    if (look.visorFlag) [['#ff9933', -22], ['#ffffff', 0], ['#138808', 22]].forEach(([c, dx]) => g.add(box(20, 48, 174, c, 60 + dx, vy + 1, vz)));
  }
  // what the driver wears on their head
  const hg = look && look.headgear, hc = look && look.headgearColor, hy = 620 - lowY;
  if (hg === 'turban' || hg === 'safa') {
    addD(sph(hc, 128, 86, 128, 0, hy + 44, drvZ + 4));                             // the wrap
    addD(sph(hc, 70, 50, 60, 0, hy + 78, drvZ - 22));                              // its peak at the front
    if (hg === 'safa') addD(rbox(34, 170, 16, hc, 30, hy - 40, drvZ + 62, 7));     // the tail down the back
  } else if (hg === 'cap') addD(rbox(96, 40, 122, hc, 0, hy + 56, drvZ, 14));
  else if (hg === 'pallu') {
    addD(sph(hc, 124, 128, 124, 0, hy + 10, drvZ + 16));                           // over the head
    addD(rbox(150, 60, 70, hc, -40, hy - 110, drvZ + 20, 24));                     // and across the shoulder
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
  // tail lamps that glow, standing proud of the painted ones (every other vehicle's lamps are lit this way)
  for (const sx of [-1, 1]) g.add(rbox(50, 62, 22, tailGlow, sx * 206, 270, R + 8, 9));
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
  g.userData.arm = arm; g.userData.armPivot = armPivot; g.userData.armX = armPivot.position.x; g.userData.weapon = weapon; g.add(arm);
  // neon strip lights (a decked-out auto, on a night track): along the foot of the tub, round the edge of the
  // hood, and their glow on the road
  if (look && look.neon && theme3D && theme3D.night) {
    const nm = new T.MeshBasicMaterial({ color: look.neon }), hoodY = 808 - lowY;
    const halo = new T.MeshBasicMaterial({ color: look.neon, transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false });
    const fat = d => (d < 40 ? d * 2.6 : d) + 10; // the halo swells the strip's thin sides, not its length
    const strip = (w, h, l, x, y, z) => { g.add(box(w, h, l, nm, x, y, z)); const b = box(fat(w), fat(h), fat(l), halo, x, y, z); b.renderOrder = 3; g.add(b); };
    for (const sx of [-1, 1]) {
      strip(18, 18, L * 0.52, sx * (Wd / 2 + 6), 150, R - L * 0.27);                   // the foot of the tub
      strip(16, 16, L * 0.8, sx * (Wd * 0.525 + 6), hoodY, R - L * 0.42);               // the hood's side edges
    }
    strip(Wd * 0.96, 18, 18, 0, 150, R + 8);                                            // across the back of the tub
    strip(Wd * 1.06, 16, 16, 0, hoodY, R + 8);                                          // the hood's back edge
    strip(Wd * 1.06, 16, 16, 0, hoodY, R - L * 0.82);                                   // and its front edge
    const glow = new T.Mesh(unitPlane, neonGlowMat(look.neon)); glow.rotation.x = -Math.PI / 2;
    glow.scale.set(Wd * 3.4, L * 2.3, 1); glow.position.y = 7; glow.renderOrder = 2; g.add(glow);
  }
  g.userData.size = { w: Wd, h: 890, l: L };
  return g;
}
