'use strict';
// City buses.
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
  s.add(rbox(14, 14, 380, chrome3D, -(Wd / 2 - 12), 1080, -R + 400, 5));                     // door rail
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
        s.add(rbox(14, 14, L - 300, chrome3D, x + sx * 2, y + 70, 60, 5));
      });
      s.add(facePanel(lettering(look.op, look.body, look.band, 512, 64, 'bold 40px Arial'), 1000, 125, sx * (Wd / 2 + 1), 440, 200, sx * Math.PI / 2));
    }
    // BEST double-deckers: the open rear platform on the kerb side, with the staircase up to the top deck and
    // a grab pole at the edge
    if (dd) {
      const pz = R - 360, px = -(Wd / 2 - 150);
      s.add(rbox(300, 860, 560, lambert('#1c1c1c'), px, 610, pz, 10));                          // the open platform
      for (let i = 0; i < 6; i++) s.add(rbox(250, 30, 90, lambert('#5d4037'), px + 10, 230 + i * 150, pz + 220 - i * 85, 6));   // stairs
      spokeTo(s, [-(Wd / 2 + 6), 190, pz - 270], [-(Wd / 2 + 6), 1040, pz - 270], 12, chrome3D);    // grab pole
      s.add(rbox(14, 14, 560, chrome3D, -(Wd / 2 + 4), 1040, pz, 5));
    }
    // front door on the kerb side (-x): glass leaf with frame and a step
    if (!look.crowd) s.add(rbox(10, 820, 380, glass, -(Wd / 2 + 2), 600, -R + 400, 6));     // (crowded: door open)
    for (const z of [-R + 205, -R + 595]) s.add(rbox(14, 830, 20, chrome3D, -(Wd / 2 + 4), 600, z, 5));
    s.add(rbox(16, 20, 380, chrome3D, -(Wd / 2 + 5), 640, -R + 400, 5));
    s.add(rbox(120, 40, 360, dark, -(Wd / 2 - 40), 190, -R + 400, 10));
    // front: windscreen divider(s), wipers, destination board, grille, headlamps, bumper, plate
    for (const y of bands) s.add(rbox(50, 330, 24, body, 0, y, -R + 4, 10));
    for (const sx of [-1, 1]) { const w = box(10, 280, 8, dark, sx * 200, 820, -R - 2); w.rotation.z = sx * 0.5; s.add(w); }
    const boardY = dd ? 1140 : 1110, board = lettering(`${look.route}  ${look.dest}`, '#111', '#fff3c4', 384, 48, 'bold 28px Arial');
    s.add(rbox(Wd * 0.8, 100, 24, dark, 0, boardY, -R - 2, 10));
    s.add(facePanel(board, Wd * 0.76, 84, 0, boardY, -R - 16, Math.PI));
    s.add(rbox(Wd * 0.46, 150, 24, dark, 0, 440, -R - 2, 12));
    for (let i = 0; i < 4; i++) s.add(rbox(Wd * 0.44, 10, 10, chrome3D, 0, 390 + i * 34, -R - 14, 4));
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
