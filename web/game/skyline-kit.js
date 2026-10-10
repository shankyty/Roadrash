'use strict';
// The paint kit the cities' skyline painters use, and the dog sprites.
// ---- skyline painting kit: each city's painters (web/cities/<id>/skyline.js) draw two parallax layers with it
const LAYER_W = 1920; // a layer tiles horizontally at this width
function litWindows(g, r, x, y, w, h, amount, color = '255,214,130') {
  if (amount <= 0) return;
  for (let wy = y + 6; wy < y + h - 6; wy += 9) for (let wx = x + 4; wx < x + w - 5; wx += 7)
    if (r() < amount) { g.fillStyle = `rgba(${color},${0.45 + r() * 0.5})`; g.fillRect(wx, wy, 3, 4); }
}
const cutOut = (g, fn) => { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; fn(); g.fill(); g.restore(); };
const archPath = (g, x, y, w, h) => { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); };
const onion = (g, cx, y, rad) => { g.beginPath(); g.moveTo(cx - rad, y); g.bezierCurveTo(cx - rad * 1.3, y - rad * 1.1, cx - rad * 0.2, y - rad * 1.4, cx, y - rad * 2); g.bezierCurveTo(cx + rad * 0.2, y - rad * 1.4, cx + rad * 1.3, y - rad * 1.1, cx + rad, y); g.fill(); };
function fillerBlocks(g, r, t, col, base, from, to, minH, maxH, skip = [], lit = 1) {
  for (let x = from; x < to;) {
    const w = 26 + r() * 44;
    if (!skip.some(([a, b]) => x + w > a && x < b)) { const bh = minH + r() * (maxH - minH); g.fillStyle = col; g.fillRect(x, base - bh, w, bh + 40); litWindows(g, r, x, base - bh, w, bh, t.lights * lit); }
    x += w + 2 + r() * 10;
  }
}
function trees(g, r, col, base, from, to, n) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) { const x = from + r() * (to - from), rad = 10 + r() * 14; ell(g, x, base - rad * 0.6, rad * 1.3, rad); g.fill(); }
}
function waterBand(g, r, t, base, h, lights) {
  g.fillStyle = t.sea; g.fillRect(0, base + 6, LAYER_W, h - base);
  g.fillStyle = 'rgba(255,255,255,.2)'; for (let i = 0; i < 90; i++) g.fillRect(r() * LAYER_W, base + 10 + r() * (h - base - 14), 6 + r() * 16, 1);
  if (lights) { g.fillStyle = 'rgba(255,214,120,.9)'; for (let x = 4; x < LAYER_W; x += 14) g.fillRect(x, base + 3, 3, 3); }
}

const PAINT = { mk, ell, rr, shade, lerp, mulberry32, LAYER_W, litWindows, fillerBlocks, trees, waterBand, cutOut, archPath, onion };

// Indian street dogs: side view (trotting, 2 frames), rear view (chasing, 2 frames), curled up asleep.
const DOG_COATS = [
  { body: '#c8955a', belly: '#ecca98', dark: '#9c6c3a' },
  { body: '#2e2a28', belly: '#4a4440', dark: '#1a1716' },
  { body: '#ece4d4', belly: '#ffffff', dark: '#c9bca5', spots: '#8a5a3a' },
];
function makeDogSide(coat, frame) {
  const c = mk(200, 136), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 100, 126, 66, 6); g.fill();
  const angles = frame ? [-0.22, 0.26, -0.26, 0.22] : [0.36, -0.26, 0.3, -0.32];
  g.lineCap = 'round';
  [[132, coat.dark], [60, coat.dark], [146, coat.body], [74, coat.body]].forEach(([bx, col], i) => {
    const a = angles[i]; g.strokeStyle = col; g.lineWidth = 9;
    g.beginPath(); g.moveTo(bx, 80); g.lineTo(bx + Math.sin(a) * 22, 100); g.lineTo(bx + Math.sin(a) * 30, 121); g.stroke();
  });
  // curled tail over the back
  g.strokeStyle = coat.body; g.lineWidth = 8;
  g.beginPath(); g.moveTo(52, 66); g.quadraticCurveTo(30, 40, 50, 30); g.quadraticCurveTo(64, 26, 60, 44); g.stroke();
  g.fillStyle = coat.body; ell(g, 100, 72, 54, 21); g.fill();
  g.fillStyle = coat.belly; ell(g, 104, 84, 40, 8); g.fill();
  if (coat.spots) { g.fillStyle = coat.spots; ell(g, 84, 64, 16, 11); g.fill(); ell(g, 118, 70, 9, 7); g.fill(); }
  // neck, head, pointed ears, snout
  g.fillStyle = coat.body; g.beginPath(); g.moveTo(136, 60); g.lineTo(150, 38); g.lineTo(170, 52); g.lineTo(150, 82); g.closePath(); g.fill();
  ell(g, 160, 46, 18, 14); g.fill();
  g.fillStyle = coat.dark; g.beginPath(); g.moveTo(148, 38); g.lineTo(154, 12); g.lineTo(165, 34); g.closePath(); g.fill();
  g.fillStyle = coat.body; g.beginPath(); g.moveTo(152, 36); g.lineTo(156, 18); g.lineTo(162, 34); g.closePath(); g.fill();
  g.fillStyle = coat.belly; ell(g, 178, 54, 13, 7, 0.15); g.fill();
  g.fillStyle = '#111'; ell(g, 190, 52, 4, 3.5); g.fill(); ell(g, 166, 42, 2.6, 2.6); g.fill();
  return c;
}
function makeDogRear(coat, frame) {
  const c = mk(110, 132), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 55, 126, 34, 5); g.fill();
  g.lineCap = 'round'; g.strokeStyle = coat.dark; g.lineWidth = 12;
  g.beginPath(); g.moveTo(40, 86); g.lineTo(38, frame ? 110 : 122); g.stroke();
  g.beginPath(); g.moveTo(70, 86); g.lineTo(72, frame ? 122 : 110); g.stroke();
  g.fillStyle = coat.body; ell(g, 55, 36, 17, 15); g.fill();
  g.fillStyle = coat.dark;
  g.beginPath(); g.moveTo(40, 32); g.lineTo(42, 8); g.lineTo(52, 26); g.fill();
  g.beginPath(); g.moveTo(70, 32); g.lineTo(68, 8); g.lineTo(58, 26); g.fill();
  g.fillStyle = coat.body; ell(g, 55, 72, 27, 28); g.fill();
  if (coat.spots) { g.fillStyle = coat.spots; ell(g, 46, 66, 11, 13); g.fill(); }
  g.strokeStyle = coat.body; g.lineWidth = 8;
  g.beginPath(); g.moveTo(55, 52); g.quadraticCurveTo(frame ? 76 : 36, 34, 55, 24); g.stroke();
  return c;
}
function makeDogSleep(coat) {
  const c = mk(190, 84), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.25)'; ell(g, 95, 76, 78, 7); g.fill();
  g.fillStyle = coat.body; ell(g, 90, 56, 62, 20); g.fill();
  if (coat.spots) { g.fillStyle = coat.spots; ell(g, 76, 48, 18, 10); g.fill(); }
  g.fillStyle = coat.belly; ell(g, 96, 68, 46, 7); g.fill();
  g.strokeStyle = coat.body; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(32, 60); g.quadraticCurveTo(40, 80, 90, 74); g.stroke();
  g.fillStyle = coat.body; ell(g, 150, 60, 20, 13); g.fill();
  g.fillStyle = coat.belly; ell(g, 168, 64, 11, 6); g.fill();
  g.fillStyle = '#111'; ell(g, 178, 63, 3, 2.6); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(152, 56); g.lineTo(160, 57); g.stroke();
  g.fillStyle = coat.dark; g.beginPath(); g.moveTo(138, 52); g.lineTo(128, 40); g.lineTo(146, 48); g.fill();
  return c;
}
