'use strict';
// Paints the 2D sprites (autos, traffic, scenery) on canvases.
// ------------------------------------------------------------------ sprite painting
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function isLight(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 150; }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => clamp(Math.round(v + amt * 255), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function flipped(src) { const c = mk(src.width, src.height), g = c.getContext('2d'); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }

// Auto-rickshaw seen from behind.
// rear: 'slogan' (a band in the trim colour with a slogan, the plate in the middle) or 'grille' (the back of a
// rear-engined auto: a perforated engine hatch, any slogan painted above it, the plate low on the right with a tassel)
function makeTuk(body, trim, canopy, plate, slogan = 'HORN OK PLEASE', rear = 'slogan') {
  const c = mk(240, 232), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 120, 218, 114, 11); g.fill();
  for (const wx of [30, 210]) {
    g.fillStyle = '#141414'; rr(g, wx - 17, 158, 34, 64, 11); g.fill();
    g.fillStyle = '#343434'; rr(g, wx - 10, 170, 20, 42, 6); g.fill();
    g.fillStyle = '#8a8a8a'; ell(g, wx, 191, 5, 10); g.fill();
  }
  // canopy dome
  const dome = () => { g.beginPath(); g.moveTo(22, 120); g.lineTo(22, 56); g.quadraticCurveTo(24, 8, 120, 6); g.quadraticCurveTo(216, 8, 218, 56); g.lineTo(218, 120); g.closePath(); };
  dome(); g.fillStyle = canopy; g.fill();
  const hl = g.createLinearGradient(22, 0, 218, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.28, 'rgba(255,255,255,.2)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)');
  hl.addColorStop(1, 'rgba(0,0,0,.2)'); dome(); g.fillStyle = hl; g.fill();
  g.strokeStyle = isLight(canopy) ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(33, 114); g.lineTo(33, 58); g.quadraticCurveTo(35, 18, 120, 16); g.quadraticCurveTo(205, 18, 207, 58); g.lineTo(207, 114); g.stroke();
  g.setLineDash([]);
  // rear window with passengers
  g.save(); rr(g, 62, 34, 116, 54, 14); g.clip();
  g.fillStyle = '#26394a'; g.fillRect(62, 34, 116, 54);
  g.fillStyle = '#0d141b'; ell(g, 96, 66, 13, 15); g.fill(); ell(g, 146, 64, 12, 14); g.fill();
  ell(g, 96, 96, 26, 16); g.fill(); ell(g, 146, 94, 24, 16); g.fill();
  g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(62, 70); g.lineTo(110, 34); g.lineTo(130, 34); g.lineTo(72, 88); g.lineTo(62, 88); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 3; rr(g, 62, 34, 116, 54, 14); g.stroke();
  // lower body
  const lower = () => { g.beginPath(); g.moveTo(16, 112); g.lineTo(224, 112); g.lineTo(228, 168); g.quadraticCurveTo(228, 190, 204, 190); g.lineTo(36, 190); g.quadraticCurveTo(12, 190, 12, 168); g.closePath(); };
  lower(); g.fillStyle = body; g.fill();
  const sh = g.createLinearGradient(0, 112, 0, 190);
  sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
  lower(); g.fillStyle = sh; g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (rear === 'grille') {
    // the hood's canvas is riveted down along the top of the tub
    g.fillStyle = 'rgba(0,0,0,.28)'; for (let x = 24; x <= 216; x += 12) { g.beginPath(); g.arc(x, 117, 1.6, 0, Math.PI * 2); g.fill(); }
    // a slogan, if there is one, is painted straight onto the tub above the hatch, which sits a little lower for it
    const dy = slogan ? 10 : 0;
    if (slogan) {
      g.font = 'bold 11px Arial, sans-serif';
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(slogan, 120.8, 127.3, 190);
      g.fillStyle = isLight(body) ? '#111' : '#fff'; g.fillText(slogan, 120, 126.5, 190);
    }
    // engine hatch: a pressed panel with a perforated grille, a badge on it, and a second slot below
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 2; rr(g, 58, 124 + dy, 124, 60 - dy, 5); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1; rr(g, 60, 126 + dy, 120, 56 - dy, 4); g.stroke();
    const holes = (x0, y0, w, h) => {
      g.fillStyle = 'rgba(0,0,0,.16)'; rr(g, x0, y0, w, h, 5); g.fill();
      g.fillStyle = 'rgba(0,0,0,.55)';
      for (let y = y0 + 3, row = 0; y < y0 + h - 1; y += 3.5, row++) for (let x = x0 + 3 + (row % 2) * 1.75; x < x0 + w - 2; x += 3.5) { g.beginPath(); g.arc(x, y, 1, 0, Math.PI * 2); g.fill(); }
    };
    holes(70, 130 + dy, 100, 30 - dy * 0.6); holes(80, 166 + dy * 0.4, 80, 11);
    g.fillStyle = '#cfd4d8'; rr(g, 108, 141 + dy * 0.7, 24, 8, 3); g.fill();
    g.fillStyle = 'rgba(160,20,30,.75)'; g.fillRect(60, 187, 120, 2);
  } else {
    g.fillStyle = trim; g.fillRect(15, 121, 210, 16);
    g.fillStyle = isLight(trim) ? '#111' : '#fff'; g.font = 'bold 11px Arial, sans-serif';
    g.fillText(slogan, 120, 129.5, 200);
  }
  for (const tx of [22, 196]) {
    g.fillStyle = '#7a0000'; rr(g, tx, 142, 22, 26, 5); g.fill();
    g.fillStyle = '#ff2b2b'; rr(g, tx + 3, 145, 16, 20, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; rr(g, tx + 5, 147, 6, 6, 2); g.fill();
  }
  if (rear === 'grille') {
    g.fillStyle = 'rgba(255,255,255,.75)'; for (const tx of [22, 196]) { rr(g, tx + 3, 157, 16, 8, 3); g.fill(); }   // clear lower lens
    g.fillStyle = '#ffd400'; rr(g, 184, 171, 40, 15, 2); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1; rr(g, 184, 171, 40, 15, 2); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 7px Arial, sans-serif'; g.fillText(plate, 204, 179, 36);
    g.strokeStyle = '#d8502f'; g.lineWidth = 1.5;                                                                     // a tassel under the plate
    for (const dx of [-2, 0, 2]) { g.beginPath(); g.moveTo(204, 186); g.lineTo(204 + dx, 200); g.stroke(); }
  } else {
    g.fillStyle = '#ffd400'; rr(g, 86, 148, 68, 24, 3); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1.5; rr(g, 86, 148, 68, 24, 3); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 12px Arial, sans-serif'; g.fillText(plate, 120, 160.5);
  }
  g.fillStyle = '#9aa3a8'; rr(g, 28, 191, 184, 8, 4); g.fill();
  g.fillStyle = '#5a5a5a'; rr(g, 168, 198, 26, 8, 3); g.fill();
  // nimbu-mirchi charm
  g.strokeStyle = '#222'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(120, 199); g.lineTo(120, 206); g.stroke();
  g.fillStyle = '#f4e04d'; ell(g, 120, 210, 6, 6); g.fill();
  g.fillStyle = '#2e8b2e';
  ell(g, 114, 220, 2.5, 7, -0.35); g.fill(); ell(g, 120, 222, 2.5, 8); g.fill(); ell(g, 126, 220, 2.5, 7, 0.35); g.fill();
  return c;
}

function makeCow() {
  const c = mk(270, 196), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, 135, 186, 100, 9); g.fill();
  const white = '#f3efe6', leg = '#e0dacb';
  g.fillStyle = leg;
  for (const lx of [72, 96, 166, 190]) { g.fillRect(lx, 110, 14, 64); }
  g.fillStyle = '#3a3030'; for (const lx of [72, 96, 166, 190]) g.fillRect(lx - 1, 170, 16, 8);
  // tail
  g.strokeStyle = white; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(56, 80); g.quadraticCurveTo(38, 110, 44, 150); g.stroke();
  g.fillStyle = '#2b2222'; ell(g, 44, 156, 6, 11); g.fill();
  // body, hump
  g.fillStyle = white; ell(g, 132, 98, 84, 44); g.fill(); ell(g, 176, 60, 24, 18); g.fill();
  g.fillStyle = '#2b2222'; ell(g, 110, 86, 18, 12, 0.4); g.fill(); ell(g, 80, 108, 12, 9); g.fill(); ell(g, 148, 118, 14, 8, -0.2); g.fill();
  // neck + head
  g.fillStyle = white; g.beginPath(); g.moveTo(190, 70); g.lineTo(228, 66); g.lineTo(236, 104); g.lineTo(196, 126); g.closePath(); g.fill();
  g.fillStyle = '#ebe5d6'; g.beginPath(); g.moveTo(198, 112); g.quadraticCurveTo(212, 150, 224, 110); g.fill();
  g.fillStyle = white; ell(g, 236, 86, 26, 17, 0.5); g.fill();
  g.fillStyle = '#f2a7a7'; ell(g, 252, 100, 9, 8, 0.5); g.fill();
  g.fillStyle = '#111'; ell(g, 236, 78, 3, 3); g.fill();
  g.fillStyle = '#e2dccd'; ell(g, 216, 72, 11, 5, -0.4); g.fill();
  g.strokeStyle = '#c9b48a'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(226, 66); g.quadraticCurveTo(220, 44, 230, 34); g.stroke();
  g.beginPath(); g.moveTo(236, 68); g.quadraticCurveTo(242, 46, 254, 42); g.stroke();
  // marigold garland
  for (let i = 0; i <= 8; i++) { const t = i / 8; g.fillStyle = i % 2 ? '#ffb300' : '#ff6f00'; ell(g, lerp(200, 222, t), 76 + Math.sin(t * Math.PI) * 30, 5, 5); g.fill(); }
  return c;
}

function makeCar(color) {
  const c = mk(240, 170), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 120, 160, 116, 9); g.fill();
  g.fillStyle = '#111'; rr(g, 16, 118, 42, 44, 8); g.fill(); rr(g, 182, 118, 42, 44, 8); g.fill();
  g.fillStyle = color; g.beginPath(); g.moveTo(44, 18); g.lineTo(196, 18); g.lineTo(218, 76); g.lineTo(22, 76); g.closePath(); g.fill();
  g.fillStyle = '#1c2833'; g.beginPath(); g.moveTo(52, 26); g.lineTo(188, 26); g.lineTo(204, 70); g.lineTo(36, 70); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(60, 26); g.lineTo(100, 26); g.lineTo(70, 70); g.lineTo(40, 70); g.fill();
  g.fillStyle = color; rr(g, 8, 70, 224, 76, 16); g.fill();
  const sh = g.createLinearGradient(0, 70, 0, 146); sh.addColorStop(0, 'rgba(255,255,255,.3)'); sh.addColorStop(1, 'rgba(0,0,0,.3)');
  g.fillStyle = sh; rr(g, 8, 70, 224, 76, 16); g.fill();
  g.fillStyle = '#c00'; rr(g, 14, 80, 36, 22, 5); g.fill(); rr(g, 190, 80, 36, 22, 5); g.fill();
  g.fillStyle = '#ff9a3c'; rr(g, 14, 96, 12, 6, 2); g.fill(); rr(g, 214, 96, 12, 6, 2); g.fill();
  g.fillStyle = '#fff'; rr(g, 92, 104, 56, 18, 3); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MH 12 CR', 120, 113.5);
  g.fillStyle = '#2a2a2a'; rr(g, 10, 132, 220, 16, 8); g.fill();
  return c;
}

// two-wheeler from behind: rear tyre, mudguard with tail lamp and plate, the rider's back and helmet
function makeBike(look) {
  const c = mk(120, 220), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 60, 212, 34, 6); g.fill();
  g.fillStyle = '#111'; rr(g, 50, 160, 20, 54, 8); g.fill();
  g.fillStyle = look.color; rr(g, 34, 132, 52, 36, 10); g.fill();
  g.fillStyle = '#ff2b2b'; rr(g, 48, 136, 24, 10, 3); g.fill();
  g.fillStyle = '#fff'; rr(g, 44, 150, 32, 12, 2); g.fill();
  g.fillStyle = '#2b2b2b'; rr(g, 22, 112, 76, 14, 6); g.fill();                       // legs / footrests
  g.fillStyle = look.shirt; rr(g, 30, 46, 60, 74, 18); g.fill();                     // rider's back
  g.fillStyle = look.shirt; rr(g, 12, 56, 18, 46, 8); g.fill(); rr(g, 90, 56, 18, 46, 8); g.fill();
  g.fillStyle = look.helmet; ell(g, 60, 30, 22, 24); g.fill();
  g.fillStyle = 'rgba(255,255,255,.25)'; ell(g, 52, 22, 8, 6); g.fill();
  return c;
}

// tractor trolley from behind: wheels, the painted tailboard and the load (straw bale or sugarcane ends)
function makeTractor(look) {
  const c = mk(300, 320), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 150, 310, 146, 9); g.fill();
  g.fillStyle = '#111'; rr(g, 20, 250, 44, 64, 8); g.fill(); rr(g, 236, 250, 44, 64, 8); g.fill();
  g.fillStyle = '#1565c0'; g.fillRect(30, 200, 240, 60); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(34, 204, 232, 52);
  g.fillStyle = '#ff2b2b'; for (let x = 44; x < 260; x += 44) g.fillRect(x, 240, 22, 10);
  if (look.crop === 'hay') {
    g.fillStyle = '#e8d9a0'; rr(g, 6, 40, 288, 170, 70); g.fill();
    g.strokeStyle = '#6d4c41'; g.lineWidth = 3; for (let x = 40; x < 280; x += 50) { g.beginPath(); g.moveTo(x, 44); g.lineTo(x, 206); g.stroke(); }
  } else {
    const cols = ['#9aa83c', '#7f8f2a', '#6b3f4f', '#8c9a34'];
    for (let row = 0; row < 5; row++) for (let i = 0; i < 9 - row; i++) { g.fillStyle = cols[(row + i) % 4]; ell(g, 42 + row * 13 + i * 27, 186 - row * 25, 13, 13); g.fill(); }
    g.fillStyle = '#4caf50'; for (let i = 0; i < 6; i++) { ell(g, 60 + i * 36, 70 + (i % 2) * 20, 30, 22); g.fill(); }
  }
  return c;
}

function makeBus() {
  const c = mk(300, 340), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 150, 330, 146, 10); g.fill();
  g.fillStyle = '#111'; rr(g, 14, 290, 50, 44, 8); g.fill(); rr(g, 236, 290, 50, 44, 8); g.fill();
  g.fillStyle = '#c62828'; rr(g, 8, 30, 284, 272, 16); g.fill();
  g.fillStyle = '#f3e2b3'; g.fillRect(8, 150, 284, 22);
  g.fillStyle = '#111'; rr(g, 70, 38, 160, 22, 3); g.fill();
  g.fillStyle = '#ffb300'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MUMBAI CST  ⇢', 150, 49.5);
  g.fillStyle = '#1c2833'; rr(g, 28, 66, 244, 80, 8); g.fill();
  g.fillStyle = '#0c1116'; for (const hx of [70, 120, 180, 230]) { ell(g, hx, 118, 13, 15); g.fill(); ell(g, hx, 150, 22, 16); g.fill(); }
  g.fillStyle = '#1c2833'; g.fillRect(28, 140, 244, 6);
  g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(28, 120); g.lineTo(90, 66); g.lineTo(120, 66); g.lineTo(40, 146); g.lineTo(28, 146); g.fill();
  g.fillStyle = '#c62828'; g.font = 'bold 13px Arial'; g.fillText('STATE TRANSPORT', 150, 161.5);
  g.fillStyle = '#ff2b2b'; rr(g, 16, 190, 30, 50, 6); g.fill();
  g.fillStyle = '#ff9a3c'; rr(g, 16, 244, 30, 16, 4); g.fill();
  g.fillStyle = '#ff2b2b'; rr(g, 218, 190, 24, 50, 6); g.fill();
  g.fillStyle = '#fff'; rr(g, 110, 250, 80, 24, 3); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 13px Arial'; g.fillText('MH 01 BS', 150, 262.5);
  g.fillStyle = '#222'; rr(g, 6, 288, 288, 16, 6); g.fill();
  return c;
}

function makeTruck() {
  const c = mk(300, 350), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 150, 340, 146, 10); g.fill();
  g.fillStyle = '#111'; rr(g, 10, 290, 70, 54, 8); g.fill(); rr(g, 220, 290, 70, 54, 8); g.fill();
  g.fillStyle = '#1565c0'; rr(g, 12, 10, 276, 140, 44); g.fill();
  g.strokeStyle = '#0d3c7a'; g.lineWidth = 3;
  for (let x = 50; x < 280; x += 50) { g.beginPath(); g.moveTo(x, 18); g.quadraticCurveTo(x + 10, 80, x, 146); g.stroke(); }
  g.strokeStyle = '#e0c080'; g.lineWidth = 2; g.beginPath(); g.moveTo(14, 100); g.quadraticCurveTo(150, 80, 286, 100); g.stroke();
  g.fillStyle = '#ffca28'; g.fillRect(8, 130, 284, 160);
  g.strokeStyle = '#d32f2f'; g.lineWidth = 6; g.strokeRect(14, 136, 272, 148);
  g.strokeStyle = '#2e7d32'; g.lineWidth = 3; g.strokeRect(22, 144, 256, 132);
  g.fillStyle = '#d32f2f'; g.font = 'bold 30px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HORN OK', 150, 176); g.fillText('PLEASE', 150, 210);
  g.fillStyle = '#1b5e20'; g.font = 'bold 12px Arial'; g.fillText('USE DIPPER AT NIGHT', 150, 240);
  g.fillStyle = '#6a1b9a'; g.font = 'bold 11px Arial'; g.fillText('BURI NAZAR WALE TERA MUNH KALA', 150, 262);
  for (const ex of [44, 256]) {
    g.fillStyle = '#fff'; ell(g, ex, 190, 16, 10); g.fill(); g.fillStyle = '#111'; ell(g, ex, 190, 6, 6); g.fill();
  }
  g.fillStyle = '#222'; g.fillRect(8, 288, 284, 14);
  for (let x = 12; x < 290; x += 12) { g.fillStyle = x % 24 ? '#111' : '#d32f2f'; g.beginPath(); g.moveTo(x, 300); g.lineTo(x + 6, 316); g.lineTo(x + 12, 300); g.fill(); }
  g.fillStyle = '#111'; g.fillRect(24, 300, 40, 44); g.fillRect(236, 300, 40, 44);
  g.fillStyle = '#ff2b2b'; rr(g, 30, 322, 28, 8, 3); g.fill(); rr(g, 242, 322, 28, 8, 3); g.fill();
  return c;
}

function makePalm() {
  const c = mk(270, 440), g = c.getContext('2d');
  const base = { x: 120, y: 436 }, top = { x: 142, y: 110 }, ctl = { x: 92, y: 280 };
  const bez = (a, b, cc, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * cc + t * t * b;
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, x = bez(base.x, top.x, ctl.x, t), y = bez(base.y, top.y, ctl.y, t);
    g.fillStyle = i % 2 ? '#8b5a2b' : '#74481f'; ell(g, x, y, lerp(15, 9, t), 8); g.fill();
  }
  const fronds = [[-165, 118], [-138, 124], [-112, 104], [-72, 100], [-42, 122], [-14, 118], [18, 100], [165, 98], [-90, 80]];
  for (const [deg, len] of fronds) {
    const a = deg * Math.PI / 180;
    const ex = top.x + Math.cos(a) * len, ey = top.y + Math.sin(a) * len + 46;
    const cx = top.x + Math.cos(a) * len * 0.5, cy = top.y + Math.sin(a) * len * 0.5 - 26;
    g.strokeStyle = '#2e6b2e'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(top.x, top.y); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
    for (let k = 1; k <= 13; k++) {
      const t = k / 14, px = bez(top.x, ex, cx, t), py = bez(top.y, ey, cy, t);
      const tx = bez(top.x, ex, cx, t + 0.02) - px, ty = bez(top.y, ey, cy, t + 0.02) - py;
      const tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, L = 28 * (1 - t * 0.55);
      g.strokeStyle = k % 2 ? '#3a8f3a' : '#2f7d32'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * L + tx / tl * 8, py + ny * L + 10); g.stroke();
      g.beginPath(); g.moveTo(px, py); g.lineTo(px - nx * L + tx / tl * 8, py - ny * L + 10); g.stroke();
    }
  }
  g.fillStyle = '#5d3a1a'; for (const [dx, dy] of [[-8, 8], [6, 10], [-1, 16]]) { ell(g, top.x + dx, top.y + dy, 8, 8); g.fill(); }
  return c;
}

function makeTree(r) {
  const c = mk(320, 340), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.25)'; ell(g, 160, 332, 90, 8); g.fill();
  g.fillStyle = '#6b4423'; g.beginPath(); g.moveTo(140, 336); g.lineTo(150, 170); g.lineTo(172, 170); g.lineTo(182, 336); g.closePath(); g.fill();
  g.strokeStyle = '#6b4423'; g.lineWidth = 10; g.beginPath(); g.moveTo(160, 220); g.lineTo(110, 160); g.moveTo(162, 210); g.lineTo(215, 150); g.stroke();
  const greens = ['#2e7d32', '#388e3c', '#43a047', '#1b5e20', '#4caf50'];
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = 160 + Math.cos(a) * d * 120, y = 130 + Math.sin(a) * d * 90 - (1 - d) * 20;
    g.fillStyle = greens[Math.floor(r() * greens.length)]; ell(g, x, y, 24 + r() * 18, 20 + r() * 14); g.fill();
  }
  g.fillStyle = 'rgba(255,255,160,.12)'; for (let i = 0; i < 10; i++) { ell(g, 110 + r() * 100, 70 + r() * 60, 14, 10); g.fill(); }
  return c;
}

const SHOPS = ['SHARMA SWEETS', 'CHAI POINT', 'MOBILE REPAIR', 'KIRANA STORE', 'PAAN CORNER', 'DHABA', 'GUPTA TAILORS', 'CYBER CAFE', 'MEDICAL', 'SAREE PALACE'];
function makeBuilding(r, color) {
  const w = 320, h = 440, c = mk(w, h), g = c.getContext('2d');
  const bh = 260 + Math.floor(r() * 160), top = h - bh, floors = Math.floor((bh - 90) / 66);
  g.fillStyle = color; g.fillRect(10, top, 300, bh);
  g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(262, top, 48, bh);
  g.fillStyle = shade(color, -0.18); g.fillRect(4, top - 8, 312, 12);
  // rooftop water tank + dish
  g.fillStyle = '#1e1e1e'; rr(g, 40, top - 44, 40, 38, 6); g.fill();
  g.fillStyle = '#333'; g.fillRect(36, top - 48, 48, 6);
  if (r() < 0.6) { g.strokeStyle = '#ccc'; g.lineWidth = 3; ell(g, 230, top - 20, 14, 10, -0.5); g.stroke(); }
  for (let f = 0; f < floors; f++) {
    const fy = top + 20 + f * 66;
    for (let k = 0; k < 3; k++) {
      const wx = 30 + k * 92;
      g.fillStyle = r() < 0.5 ? '#2d3e50' : (r() < 0.5 ? '#3a7d44' : '#2a6f97'); g.fillRect(wx, fy, 60, 42);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(wx, fy, 60, 6);
      g.strokeStyle = shade(color, -0.3); g.lineWidth = 3; g.strokeRect(wx, fy, 60, 42);
      if (r() < 0.25) { g.fillStyle = '#b0b0b0'; g.fillRect(wx + 36, fy + 24, 26, 16); }
    }
    if (r() < 0.55) {
      g.strokeStyle = '#333'; g.lineWidth = 2; g.fillStyle = shade(color, -0.1); g.fillRect(20, fy + 42, 280, 6);
      for (let x = 22; x < 300; x += 10) { g.beginPath(); g.moveTo(x, fy + 42); g.lineTo(x, fy + 26); g.stroke(); }
      g.beginPath(); g.moveTo(20, fy + 26); g.lineTo(300, fy + 26); g.stroke();
      if (r() < 0.5) { const clothes = ['#e53935', '#fdd835', '#1e88e5', '#8e24aa', '#fff'];
        for (let i = 0; i < 5; i++) { g.fillStyle = clothes[i]; g.fillRect(40 + i * 48, fy + 28, 20, 16); } }
    }
  }
  // ground-floor shop
  const sy = h - 90;
  g.fillStyle = '#2b2b2b'; g.fillRect(30, sy + 20, 260, 70);
  g.fillStyle = '#9e9e9e'; for (let y = sy + 24; y < h; y += 6) g.fillRect(34, y, 252, 2);
  const stripe = r() < 0.5 ? ['#d32f2f', '#fff'] : ['#1e88e5', '#fff'];
  for (let i = 0; i < 13; i++) { g.fillStyle = stripe[i % 2]; g.beginPath(); g.moveTo(24 + i * 21, sy + 4); g.lineTo(45 + i * 21, sy + 4); g.lineTo(48 + i * 21, sy + 24); g.lineTo(21 + i * 21, sy + 24); g.fill(); }
  const signC = pick(['#ffeb3b', '#e53935', '#1565c0', '#2e7d32', '#ff9800'], r);
  g.fillStyle = signC; g.fillRect(24, sy - 32, 272, 34);
  g.fillStyle = isLight(signC) ? '#b71c1c' : '#fff'; g.font = 'bold 20px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(pick(SHOPS, r), 160, sy - 14);
  c.bh = bh; c.wallColor = shade(color, -0.12);
  return c;
}

const AD_COLORS = [{ bg: '#d62828', fg: '#fff' }, { bg: '#06d6a0', fg: '#073b4c' }, { bg: '#ffd166', fg: '#7a1f00' }, { bg: '#3a0ca3', fg: '#ffd60a' }];
const BILLBOARDS = [
  { bg: '#ffd166', fg: '#1d3557', lines: ['HORN OK', 'PLEASE'] },
  { bg: '#1d3557', fg: '#f1faee', lines: ['DRIVE SLOW', 'LIVE LONG'] },
  { bg: '#ef476f', fg: '#fff', lines: ['BOLLYWOOD', 'TONIGHT!'] },
  { bg: '#f77f00', fg: '#fff', lines: ['GHAR KA', 'KHANA'] },
  { bg: '#264653', fg: '#e9c46a', lines: ['SPEED THRILLS', 'BUT KILLS'] },
];
function makeBillboard(b) {
  const c = mk(340, 290), g = c.getContext('2d');
  g.fillStyle = '#555'; g.fillRect(70, 160, 14, 130); g.fillRect(256, 160, 14, 130);
  g.fillStyle = '#333'; g.fillRect(10, 8, 320, 160);
  g.fillStyle = b.bg; g.fillRect(18, 16, 304, 144);
  g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(18, 16, 304, 40);
  g.fillStyle = b.fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 40px Impact, Arial Black, sans-serif';
  g.fillText(b.lines[0], 170, 62, 290); g.font = 'bold 32px Impact, Arial Black, sans-serif'; g.fillText(b.lines[1], 170, 116, 290);
  g.fillStyle = '#777'; for (const x of [60, 170, 280]) { g.fillRect(x - 2, 0, 4, 10); ell(g, x, 2, 8, 4); g.fill(); }
  return c;
}

function makeTemple() {
  const c = mk(300, 430), g = c.getContext('2d');
  g.fillStyle = '#a89f91'; g.fillRect(10, 380, 280, 50); g.fillStyle = '#968d80'; g.fillRect(26, 364, 248, 18);
  const tower = () => { g.beginPath(); g.moveTo(150, 60); g.quadraticCurveTo(218, 110, 232, 364); g.lineTo(68, 364); g.quadraticCurveTo(82, 110, 150, 60); g.closePath(); };
  const gr = g.createLinearGradient(68, 0, 232, 0); gr.addColorStop(0, '#f4a261'); gr.addColorStop(0.5, '#e76f51'); gr.addColorStop(1, '#b5452e');
  tower(); g.fillStyle = gr; g.fill();
  g.save(); tower(); g.clip(); g.strokeStyle = 'rgba(80,20,0,.35)'; g.lineWidth = 3;
  for (let y = 90; y < 364; y += 18) { g.beginPath(); g.moveTo(40, y); g.lineTo(260, y); g.stroke(); }
  g.beginPath(); g.moveTo(150, 60); g.lineTo(150, 364); g.stroke(); g.restore();
  g.fillStyle = '#d4a017'; ell(g, 150, 58, 22, 7); g.fill(); ell(g, 150, 44, 8, 12); g.fill();
  g.strokeStyle = '#5d4037'; g.lineWidth = 3; g.beginPath(); g.moveTo(150, 34); g.lineTo(150, 4); g.stroke();
  g.fillStyle = '#ff6f00'; g.beginPath(); g.moveTo(152, 4); g.lineTo(190, 14); g.lineTo(152, 24); g.fill();
  g.fillStyle = '#3e2723'; g.beginPath(); g.moveTo(126, 364); g.lineTo(126, 318); g.quadraticCurveTo(150, 292, 174, 318); g.lineTo(174, 364); g.fill();
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#ffb300' : '#ff6f00'; ell(g, 126 + i * 5.3, 312 + Math.sin(i / 9 * Math.PI) * 10, 3.5, 3.5); g.fill(); }
  return c;
}

function makeLamp(side) {
  const c = mk(130, 340), g = c.getContext('2d');
  const px = side < 0 ? 16 : 114, dir = -side;
  g.fillStyle = '#6b6f73'; g.fillRect(px - 4, 40, 8, 300); g.fillRect(px - 8, 318, 16, 22);
  g.strokeStyle = '#6b6f73'; g.lineWidth = 6; g.beginPath(); g.moveTo(px, 44); g.quadraticCurveTo(px, 18, px + dir * 50, 20); g.lineTo(px + dir * 96, 24); g.stroke();
  g.fillStyle = '#444'; rr(g, px + dir * 96 - 18, 20, 36, 12, 4); g.fill();
  g.fillStyle = '#fff6c0'; rr(g, px + dir * 96 - 14, 30, 28, 5, 2); g.fill();
  return c;
}

// A hand cart parked on its pull handles, seen from behind: its plank bed slopes up away from you (the ramp).
function makeCart() {
  const c = mk(220, 170), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 110, 160, 100, 9); g.fill();
  for (const x of [22, 198]) { // the two tyres, either side of the bed
    g.fillStyle = '#1c1c1c'; ell(g, x, 108, 15, 40); g.fill();
    g.fillStyle = '#8d8d8d'; ell(g, x, 108, 6, 16); g.fill();
  }
  g.fillStyle = '#5d4037'; g.fillRect(36, 96, 148, 10);                                   // axle beam
  g.fillStyle = '#a1764a'; g.beginPath(); g.moveTo(34, 150); g.lineTo(186, 150); g.lineTo(164, 44); g.lineTo(56, 44); g.closePath(); g.fill(); // the bed
  g.strokeStyle = '#6d4c2f'; g.lineWidth = 2;
  for (let i = 1; i < 5; i++) { const t = i / 5; g.beginPath(); g.moveTo(34 + 152 * t, 150); g.lineTo(56 + 108 * t, 44); g.stroke(); }    // planks
  g.strokeStyle = '#4e342e'; g.lineWidth = 5; g.strokeRect(56, 42, 108, 4);                // the raised far end
  g.strokeStyle = '#7b3f1d'; g.lineWidth = 7; g.lineCap = 'round';
  for (const [a, b] of [[40, 28], [180, 192]]) { g.beginPath(); g.moveTo(a, 148); g.lineTo(b, 164); g.stroke(); }                        // shafts on the ground
  g.beginPath(); g.moveTo(24, 164); g.lineTo(196, 164); g.stroke();                        // pull bar
  return c;
}
function makeChai() {
  const c = mk(270, 240), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.25)'; ell(g, 135, 232, 120, 8); g.fill();
  g.fillStyle = '#5d4037'; g.fillRect(28, 50, 8, 180); g.fillRect(234, 50, 8, 180);
  for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? '#fff' : '#e53935'; g.beginPath(); g.moveTo(14 + i * 22, 40); g.lineTo(36 + i * 22, 40); g.lineTo(40 + i * 22, 72); g.lineTo(10 + i * 22, 72); g.fill(); }
  g.fillStyle = '#ffeb3b'; rr(g, 70, 4, 130, 36, 4); g.fill();
  g.fillStyle = '#b71c1c'; g.font = 'bold 26px Impact, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CHAI ☕', 135, 23);
  g.fillStyle = '#8d6e63'; g.fillRect(30, 140, 210, 80); g.fillStyle = '#6d4c41'; for (let x = 30; x < 240; x += 30) g.fillRect(x, 140, 3, 80);
  g.fillStyle = '#a1887f'; g.fillRect(24, 132, 222, 12);
  g.fillStyle = '#bdbdbd'; ell(g, 80, 116, 20, 16); g.fill(); g.fillRect(96, 108, 18, 5);
  g.fillStyle = '#ff7043'; ell(g, 80, 132, 16, 4); g.fill();
  for (let i = 0; i < 5; i++) { g.fillStyle = '#e0c080'; g.fillRect(140 + i * 16, 118, 10, 14); g.fillStyle = '#8d5524'; g.fillRect(140 + i * 16, 122, 10, 10); }
  return c;
}

function makeMilestone() {
  const c = mk(80, 110), g = c.getContext('2d');
  g.fillStyle = '#f5f5f5'; rr(g, 10, 30, 60, 76, 4); g.fill();
  g.fillStyle = '#ffcc00'; g.beginPath(); g.moveTo(10, 52); g.lineTo(10, 40); g.arc(40, 40, 30, Math.PI, 0); g.lineTo(70, 52); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('KM', 40, 74); g.fillText('42', 40, 92);
  return c;
}

// road signs (face at the top, post below; the 3D renderer uses the face on a real post)
function makeSign(kind) {
  const c = mk(120, 300), g = c.getContext('2d');
  g.fillStyle = '#8a8f96'; g.fillRect(55, 110, 10, 190);
  const tri = (fill = '#fff') => { g.fillStyle = '#d32f2f'; g.beginPath(); g.moveTo(60, 6); g.lineTo(114, 102); g.lineTo(6, 102); g.closePath(); g.fill();
    g.fillStyle = fill; g.beginPath(); g.moveTo(60, 24); g.lineTo(98, 92); g.lineTo(22, 92); g.closePath(); g.fill(); g.fillStyle = '#111'; };
  const ring = () => { g.fillStyle = '#d32f2f'; g.beginPath(); g.arc(60, 56, 52, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(60, 56, 40, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111'; };
  if (kind === 'signal') { tri(); rr(g, 50, 42, 20, 44, 5); g.fill(); for (const [y, col] of [[51, '#e53935'], [64, '#ffb300'], [77, '#43a047']]) { g.fillStyle = col; g.beginPath(); g.arc(60, y, 5, 0, 7); g.fill(); } }
  else if (kind === 'junction') { tri(); g.fillRect(55, 40, 10, 48); g.fillRect(36, 58, 48, 10); }
  else if (kind === 'narrow') { tri(); g.fillRect(44, 40, 8, 50); g.beginPath(); g.moveTo(76, 40); g.lineTo(84, 40); g.lineTo(76, 66); g.lineTo(76, 90); g.lineTo(68, 90); g.lineTo(68, 64); g.closePath(); g.fill(); }
  else if (kind === 'nohorn') { ring(); g.beginPath(); g.moveTo(36, 50); g.lineTo(52, 50); g.lineTo(80, 34); g.lineTo(80, 78); g.lineTo(52, 62); g.lineTo(36, 62); g.closePath(); g.fill();
    g.strokeStyle = '#d32f2f'; g.lineWidth = 9; g.beginPath(); g.moveTo(24, 20); g.lineTo(96, 92); g.stroke(); }
  else if (kind === 'keepleft') { g.fillStyle = '#1565c0'; g.beginPath(); g.arc(60, 56, 52, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(80, 30); g.lineTo(42, 76); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(28, 90); g.lineTo(34, 58); g.lineTo(58, 82); g.closePath(); g.fill(); }
  else { ring(); g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.fillText(kind.slice(5), 60, 72); } // limit40 / limit50 / limit60
  return c;
}
function makeSignal() {
  const c = mk(90, 320), g = c.getContext('2d');
  g.fillStyle = '#3b3f45'; g.fillRect(40, 110, 10, 210);
  g.fillStyle = '#16181b'; rr(g, 22, 4, 46, 112, 10); g.fill();
  for (const [y, col] of [[26, '#e53935'], [60, '#ffb300'], [94, '#43a047']]) { g.fillStyle = col; g.beginPath(); g.arc(45, y, 13, 0, 7); g.fill(); }
  return c;
}
function makeCop() {
  const c = mk(90, 200), g = c.getContext('2d');
  g.fillStyle = '#5d4b2a'; g.fillRect(30, 120, 12, 74); g.fillRect(48, 120, 12, 74);   // khaki trousers
  g.fillStyle = '#f4f4f4'; rr(g, 24, 62, 42, 64, 8); g.fill();                         // white shirt
  g.fillStyle = '#8d5524'; g.beginPath(); g.arc(45, 46, 15, 0, 7); g.fill();
  g.fillStyle = '#f4f4f4'; g.fillRect(28, 24, 34, 12); g.fillRect(24, 34, 42, 5);       // cap
  g.fillStyle = '#f4f4f4'; g.save(); g.translate(64, 70); g.rotate(-1.1); g.fillRect(0, -6, 44, 12); g.restore(); // raised arm
  g.fillStyle = '#111'; g.fillRect(24, 116, 42, 6);
  return c;
}

function makeArch() {
  const c = mk(640, 320), g = c.getContext('2d');
  for (const x of [0, 596]) {
    g.fillStyle = '#b71c1c'; g.fillRect(x, 40, 44, 280);
    g.fillStyle = '#ffca28'; for (let y = 60; y < 320; y += 40) g.fillRect(x + 6, y, 32, 14);
  }
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 20, 640, 80);
  for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { if ((i + j) % 2) { g.fillStyle = '#fff'; g.fillRect(i * 20, 20 + j * 12, 20, 12); } }
  g.fillStyle = '#ff6f00'; g.fillRect(0, 44, 640, 56);
  g.fillStyle = '#fff'; g.font = 'bold 42px Impact, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('START · FINISH', 320, 73);
  for (let s = 0; s < 4; s++) for (let i = 0; i <= 12; i++) {
    const t = i / 12; g.fillStyle = i % 2 ? '#ffb300' : '#ff6f00';
    ell(g, 44 + s * 138 + t * 138, 104 + Math.sin(t * Math.PI) * 30, 6, 6); g.fill();
  }
  return c;
}
