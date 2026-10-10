'use strict';
// Tractor and trolley.
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
    for (let i = 0; i < 7; i++) s.add(rbox(10, 230, 10, chrome3D, -105 + i * 35, 670, -R + 46, 3));         // vertical chrome slats
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
