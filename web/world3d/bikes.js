'use strict';
// Motorcycles, scooters and their riders.
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
      for (let i = 0; i < 4; i++) s.add(rbox(176, 10, 120, chrome3D, 0, 220 + i * 28, -90, 4));            // cylinder fins
      const tank = rbox(200, 130, 310, body, 0, 480, -95, 58); tank.rotation.x = -0.1; s.add(tank);      // fuel tank
      for (const sx of [-1, 1]) s.add(rbox(10, 60, 120, chrome3D, sx * 101, 480, -110, 8));                // tank badges
      s.add(rbox(150, 120, 180, body, 0, 395, 150, 30));                                                  // side panels
      s.add(rbox(170, 52, 360, dark, 0, 530, 170, 24));                                                   // seat
      const tail = rbox(140, 40, 280, body, 0, 470, 330, 18); tail.rotation.x = -0.18; s.add(tail);      // tail and rear mudguard
      s.add(rbox(120, 40, 26, tailGlow, 0, 500, 455, 12));
      s.add(facePanel(plate('DL 3S', '#fff'), 110, 30, 0, 410, 452));
      s.add(limb([92, 225, -60], [104, 300, 410], 24, chrome3D));                                         // exhaust
      s.add(rbox(20, 60, 300, dark, -76, 225, 130, 10));                                                  // chain guard
      for (const sx of [-1, 1]) {
        s.add(limb([sx * 58, r, -wb], [sx * 58, 610, -wb + 125], 16, chrome3D));                           // telescopic forks
        s.add(limb([sx * 82, r, wb], [sx * 82, 480, 190], 14, chrome3D));                                  // rear shocks
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
      for (const sx of [-1, 1]) s.add(limb([sx * 95, 545, 250], [sx * 95, 545, 390], 9, chrome3D));    // grab rail
      s.add(limb([-95, 545, 390], [95, 545, 390], 9, chrome3D));
    }
    for (const sx of [-1, 1]) {
      s.add(limb([sx * 120, grip[1], grip[2]], [sx * 175, grip[1] + 130, grip[2] - 10], 6, chrome3D));    // mirror stalks
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
