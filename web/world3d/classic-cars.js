'use strict';
// Classic Indian cars.
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
    for (const z of handles) s.add(rbox(8, 12, 54, chrome3D, x, beltY - 30, z, 4));
    s.add(rbox(50, 18, 26, satin, sx * (sp.Wd / 2 + 2), mirrorY - 14, mirrorZ, 6));
    s.add(rbox(26, 50, 74, satin, sx * (sp.Wd / 2 + 26), mirrorY, mirrorZ - 6, 12));
  }
}
const rectLamp = (s, w, h, x, y, z, mat, bezel = chrome3D) => { s.add(rbox(w + 16, h + 16, 30, bezel, x, y, z + 6, 8)); s.add(rbox(w, h, 30, mat, x, y, z, 8)); };
// a chrome ring facing forward (round headlamp surrounds)
const ringZ = (s, R, t, x, y, z) => { const m = torusX(R, t, chrome3D); m.rotation.set(0, 0, 0); m.position.set(x, y, z); s.add(m); };
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
    for (const y of [228, 248]) s.add(rbox(190, 4, 8, chrome3D, 0, y, -R - 12, 2));
    for (const z of [-R - 10, R + 10]) s.add(rbox(sp.Wd + 8, 46, 50, satin, 0, 150, z, 14));
    s.add(facePanel(plate('DL 2C 800', '#fff'), 130, 34, 0, 150, -R - 36, Math.PI));
    s.add(facePanel(plate('DL 2C 800', '#fff'), 130, 34, 0, 250, R + 2));
    for (const sx of [-1, 1]) s.add(rbox(6, 8, 590, chrome3D, sx * (sp.gw / 2 + 4), 584, 205, 3)); // rain gutters
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
    s.add(rbox(sp.Wd * 0.34, 30, 20, dark, 0, 292, -R - 4, 8)); s.add(rbox(sp.Wd * 0.36, 40, 12, chrome3D, 0, 292, -R - 1, 6));
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
    const M = blenderModel('amby', { body, chrome: chrome3D, glass, dark });
    if (M) {
      s.add(M);
      for (const sx of [-1, 1]) {
        roundLamp(s, 44, sx * 272, 306, -R + 26); ringZ(s, 54, 9, sx * 272, 306, -R + 14);          // headlamps in the wings
        s.add(sph(lambert('#ffb020'), 36, 28, 20, sx * 200, 232, -R - 14));                            // parking lamps
        s.add(rbox(60, 96, 30, tailGlow, sx * 285, 310, R - 38, 16));                                   // tail lamps
        spokeTo(s, [sx * 262, 420, -600], [sx * 262, 500, -610], 6, chrome3D);                           // wing mirrors
        s.add(sph(chrome3D, 56, 40, 20, sx * 262, 515, -612));
        for (const z of [-180, 250]) s.add(rbox(8, 12, 54, chrome3D, sx * 343, 380, z, 4));            // door handles
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
    s.add(rbox(10, sp.gbev * 2 + 300, 14, chrome3D, 0, 470, -235, 4));                               // split windscreen bar
    // big chrome grille with dark slats
    s.add(rbox(sp.Wd * 0.5, 140, 24, chrome3D, 0, 285, -R - 6, 22));
    for (let i = 0; i < 11; i++) s.add(rbox(10, 112, 14, dark, -150 + i * 30, 285, -R - 14, 3));
    for (const sx of [-1, 1]) {
      roundLamp(s, 46, sx * (sp.Wd / 2 - 92), 310, -R + 18);
      ringZ(s, 56, 9, sx * (sp.Wd / 2 - 92), 310, -R + 6);
      s.add(sph(lambert('#ffb020'), 40, 30, 20, sx * (sp.Wd / 2 - 100), 228, -R - 2));              // parking lamps
      s.add(rbox(66, 104, 30, tailGlow, sx * (sp.Wd / 2 - 66), 300, R + 4, 18));
      for (const z of [-R - 30, R + 30]) s.add(rbox(36, 90, 40, chrome3D, sx * 200, 205, z, 12));    // overriders
      s.add(rbox(10, 14, sp.L * 0.84, chrome3D, sx * ((sp.Wd - 10) / 2 + 4), 300, 0, 5));               // side chrome strip
    }
    for (const z of [-R - 16, R + 16]) s.add(rbox(sp.Wd + 30, 50, 50, chrome3D, 0, 180, z, 20));
    s.add(rbox(16, 10, 360, chrome3D, 0, 412, -560, 5));                                                // bonnet strip
    s.add(facePanel(plate(taxi ? 'WB 04 T' : 'DL 3C AM', taxi ? '#ffd21f' : '#fff'), 150, 38, 0, 180, -R - 44, Math.PI));
    s.add(facePanel(plate(taxi ? 'WB 04 T' : 'DL 3C AM', taxi ? '#ffd21f' : '#fff'), 150, 38, 0, 270, R + 2));
    s.add(rbox(80, 14, 20, chrome3D, 0, 340, R + 2, 6));                                                // boot handle
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
    s.add(rbox(70, 14, 16, chrome3D, 0, 340, R + 2, 6));
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
      s.add(rbox(8, 12, 50, chrome3D, sx * ((Wd - 10) / 2 + 1), 470, -470, 4));
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
