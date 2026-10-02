'use strict';
// Mumbai: Imperial towers, World One, Antilia and the Sea Link far; Gateway of India, the Taj and Rajabai Tower near.
// Two parallax layers, each tiling horizontally at LAYER_W px. The painters draw with the kit game.js
// passes in (paint); t is the track's look and seed its road seed.
RRR.skylines.register({
  id: 'mumbai',
  // Distant high-rises: Imperial twin towers, World One, Antilia, the Sea Link pylon
  far(paint, t, seed) {
    const { mk, rr, mulberry32, LAYER_W, litWindows } = paint;
    const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed);
    const base = h - 30, col = t.far;
    const tower = (x, w, th) => { g.fillStyle = col; g.fillRect(x, base - th, w, th + 30); litWindows(g, r, x, base - th, w, th, t.lights * 0.5); };
    // generic high-rise filler
    for (let x = 0; x < LAYER_W; x += 26 + r() * 40) {
      if ((x > 250 && x < 420) || (x > 860 && x < 960) || (x > 1500 && x < 1860)) continue;
      const w = 22 + r() * 34, th = 40 + r() * 110; tower(x, w, th);
      if (r() < 0.25) { g.fillStyle = col; g.fillRect(x + w / 2 - 1, base - th - 14, 2, 14); }
    }
    // Imperial twin towers (rounded tops)
    for (const x of [290, 350]) {
      g.fillStyle = col; rr(g, x, base - 190, 44, 220, 20); g.fill();
      g.fillRect(x + 20, base - 206, 4, 18); litWindows(g, r, x, base - 180, 44, 180, t.lights * 0.6);
    }
    // World One: tall tower with a crown
    g.fillStyle = col; g.beginPath(); g.moveTo(880, base + 30); g.lineTo(884, base - 180); g.lineTo(900, base - 205); g.lineTo(916, base - 180); g.lineTo(920, base + 30); g.fill();
    litWindows(g, r, 884, base - 175, 32, 175, t.lights * 0.6);
    // Antilia: stacked offset slabs
    for (let i = 0; i < 7; i++) { g.fillStyle = col; g.fillRect(1180 + (i % 2) * 10, base - 20 - i * 20, 50, 20); }
    litWindows(g, r, 1180, base - 160, 60, 160, t.lights * 0.4);
    // Bandra-Worli Sea Link: cable-stayed pylons over the water
    g.strokeStyle = col; g.fillStyle = col;
    g.fillRect(1500, base + 4, 360, 7); // deck
    for (const px of [1600, 1760]) {
      g.lineWidth = 6; g.beginPath(); g.moveTo(px - 14, base + 10); g.lineTo(px, base - 110); g.lineTo(px + 14, base + 10); g.stroke();
      g.fillRect(px - 3, base - 150, 6, 42);
      g.lineWidth = 1.2; g.globalAlpha = 0.8;
      for (let k = 1; k <= 9; k++) {
        const topY = base - 150 + k * 4;
        g.beginPath(); g.moveTo(px, topY); g.lineTo(px - k * 9, base + 4); g.moveTo(px, topY); g.lineTo(px + k * 9, base + 4); g.stroke();
      }
      g.globalAlpha = 1;
    }
    // sea
    g.fillStyle = t.sea; g.fillRect(0, base + 10, LAYER_W, h - base - 10);
    if (t.lights) { g.fillStyle = 'rgba(255,220,140,.5)'; for (let x = 1500; x < 1860; x += 8) g.fillRect(x, base + 2, 2, 2); }
    return c;
  },
  // Nearer landmarks: Gateway of India, Taj Palace, Rajabai tower, CST, the Queen's Necklace
  near(paint, t, seed) {
    const { mk, shade, mulberry32, LAYER_W, litWindows } = paint;
    const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed);
    const base = h - 34, col = t.near;
    const block = (x, w, bh) => { g.fillStyle = col; g.fillRect(x, base - bh, w, bh + 34); litWindows(g, r, x, base - bh, w, bh, t.lights); };
    const dome = (cx, y, rad) => { g.beginPath(); g.arc(cx, y, rad, Math.PI, 0); g.fill(); g.fillRect(cx - 1, y - rad - 8, 2, 8); };
    // mid-rise filler (skipping landmark spots)
    const skip = [[180, 600], [880, 960], [1220, 1440]];
    for (let x = 0; x < LAYER_W;) {
      const w = 30 + r() * 50;
      if (!skip.some(([a, b]) => x + w > a && x < b)) block(x, w, 24 + r() * 60);
      x += w + 2 + r() * 8;
    }
    g.fillStyle = col;
    // Gateway of India
    const gx = 200, gw = 120;
    g.fillRect(gx, base - 70, gw, 104);
    for (const tx of [gx - 6, gx + 26, gx + gw - 38, gx + gw - 6]) { g.fillRect(tx, base - 92, 12, 30); dome(tx + 6, base - 92, 6); }
    g.fillRect(gx - 4, base - 76, gw + 8, 8);
    g.fillStyle = t.sea; g.beginPath(); g.moveTo(gx + 40, base + 34); g.lineTo(gx + 40, base - 30); g.quadraticCurveTo(gx + 60, base - 58, gx + 80, base - 30); g.lineTo(gx + 80, base + 34); g.fill();
    // Taj Mahal Palace: long facade, big central dome, corner domes
    g.fillStyle = col; const tj = 360;
    g.fillRect(tj, base - 80, 220, 114);
    dome(tj + 110, base - 80, 34); g.fillRect(tj + 106, base - 124, 8, 12);
    for (const dx of [14, 206]) { g.fillRect(tj + dx - 12, base - 104, 24, 30); dome(tj + dx, base - 104, 12); }
    for (const dx of [60, 160]) dome(tj + dx, base - 80, 10);
    litWindows(g, r, tj, base - 76, 220, 74, t.lights * 1.1);
    // Rajabai clock tower
    const rx = 910; g.fillStyle = col;
    g.fillRect(rx - 11, base - 130, 22, 164); g.fillRect(rx - 15, base - 90, 30, 6);
    g.beginPath(); g.moveTo(rx - 11, base - 130); g.lineTo(rx, base - 172); g.lineTo(rx + 11, base - 130); g.fill();
    g.fillStyle = t.lights ? 'rgba(255,230,160,.9)' : 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(rx, base - 112, 5, 0, Math.PI * 2); g.fill();
    // Chhatrapati Shivaji Terminus: gothic block, central dome, spires
    g.fillStyle = col; const cs = 1240;
    g.fillRect(cs, base - 64, 190, 98); g.fillRect(cs + 70, base - 96, 50, 34);
    dome(cs + 95, base - 96, 26); g.fillRect(cs + 93, base - 136, 4, 16);
    for (const dx of [0, 36, 150, 184]) { g.beginPath(); g.moveTo(cs + dx, base - 64); g.lineTo(cs + dx + 3, base - 88); g.lineTo(cs + dx + 6, base - 64); g.fill(); }
    litWindows(g, r, cs, base - 60, 190, 58, t.lights * 0.9);
    // promenade + sea with the Queen's Necklace street-light arc
    g.fillStyle = shade(t.sea, 0.06); g.fillRect(0, base + 2, LAYER_W, 32);
    g.fillStyle = t.sea; g.fillRect(0, base + 8, LAYER_W, 26);
    g.fillStyle = t.lights ? 'rgba(255,214,120,.95)' : 'rgba(255,255,255,.55)';
    for (let x = 4; x < LAYER_W; x += 12) g.fillRect(x, base + 3 + Math.sin(x / LAYER_W * Math.PI * 4) * 1.5, 3, 3);
    g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 90; i++) g.fillRect(r() * LAYER_W, base + 12 + r() * 20, 6 + r() * 16, 1);
    return c;
  },
});
