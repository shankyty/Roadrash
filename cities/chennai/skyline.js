'use strict';
// Chennai: LIC building, Chennai Central far; Kapaleeshwarar gopuram, Marina lighthouse, beach near.
// Two parallax layers, each tiling horizontally at LAYER_W px. The painters draw with the kit game.js
// passes in (paint); t is the track's look and seed its road seed.
RRR.skylines.register({
  id: 'chennai',
  far(paint, t, seed) {
    const { mk, mulberry32, LAYER_W, fillerBlocks } = paint;
    const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 30, col = t.far;
    fillerBlocks(g, r, t, col, base, 0, LAYER_W, 24, 90, [[470, 560], [1100, 1330]]);
    g.fillStyle = col;
    // LIC building with its antenna mast
    g.fillRect(480, base - 150, 64, 190); g.strokeStyle = col; g.lineWidth = 3;
    g.beginPath(); g.moveTo(512, base - 150); g.lineTo(512, base - 200); g.moveTo(502, base - 150); g.lineTo(512, base - 190); g.lineTo(522, base - 150); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = base - 140; y < base; y += 10) g.fillRect(484, y, 56, 2);
    // Chennai Central: long gothic front, clock tower, corner spires
    g.fillStyle = col; const cc = 1110;
    g.fillRect(cc, base - 60, 220, 100); g.fillRect(cc + 95, base - 130, 30, 72);
    g.beginPath(); g.moveTo(cc + 92, base - 130); g.lineTo(cc + 110, base - 168); g.lineTo(cc + 128, base - 130); g.fill();
    for (const dx of [0, 60, 160, 212]) { g.fillRect(cc + dx, base - 82, 8, 24); g.beginPath(); g.moveTo(cc + dx - 2, base - 82); g.lineTo(cc + dx + 4, base - 100); g.lineTo(cc + dx + 10, base - 82); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(cc + 110, base - 108, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.fillRect(0, base, LAYER_W, h - base);
    return c;
  },
  near(paint, t, seed) {
    const { mk, ell, rr, shade, lerp, mulberry32, LAYER_W, fillerBlocks, waterBand, cutOut } = paint;
    const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 34, col = t.near;
    fillerBlocks(g, r, t, col, base, 0, LAYER_W, 16, 46, [[260, 460], [850, 950], [1440, 1580]]);
    // Kapaleeshwarar gopuram: stepped tiers, barrel-vault crown with kalasams
    const gopuram = (cx, bw, tw, gh) => {
      const tiers = 9;
      for (let i = 0; i < tiers; i++) {
        const k = i / tiers, w = lerp(bw, tw, k), y = base - gh * (i + 1) / tiers;
        g.fillStyle = i % 2 ? col : shade(col, 0.07); g.fillRect(cx - w / 2, y, w, gh / tiers + 1);
        g.fillStyle = shade(col, 0.14); for (let x = cx - w / 2 + 4; x < cx + w / 2 - 4; x += 9) g.fillRect(x, y + 3, 4, gh / tiers - 6);
      }
      g.fillStyle = col; rr(g, cx - tw / 2 - 4, base - gh - 14, tw + 8, 16, 7); g.fill();
      for (let k = 0; k < 5; k++) { const kx = cx - tw / 2 + 4 + k * (tw - 8) / 4; g.fillRect(kx - 2, base - gh - 22, 4, 9); ell(g, kx, base - gh - 23, 3, 3); g.fill(); }
      g.fillRect(cx - bw / 2 - 6, base - 6, bw + 12, 46);
      cutOut(g, () => { g.beginPath(); g.rect(cx - 12, base - 32, 24, 40); });
    };
    gopuram(360, 130, 56, 160); gopuram(1510, 90, 40, 104);
    // Marina lighthouse
    g.fillStyle = col; g.beginPath(); g.moveTo(884, base + 20); g.lineTo(892, base - 140); g.lineTo(908, base - 140); g.lineTo(916, base + 20); g.fill();
    g.fillStyle = shade(col, 0.12); for (const k of [0.2, 0.45, 0.7]) g.fillRect(886 + k * 6, base - 160 * k, 28 - k * 12, 10);
    g.fillStyle = col; g.fillRect(888, base - 158, 24, 18); g.beginPath(); g.arc(900, base - 158, 12, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,240,180,.8)'; g.fillRect(892, base - 154, 16, 8);
    // palms along the beach
    g.strokeStyle = col; g.fillStyle = col;
    for (let x = 30; x < LAYER_W; x += 90 + r() * 120) {
      if ((x > 250 && x < 470) || (x > 840 && x < 960) || (x > 1430 && x < 1590)) continue;
      const th = 40 + r() * 40, lean = (r() - 0.5) * 20; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x, base + 4); g.quadraticCurveTo(x + lean, base - th / 2, x + lean, base - th); g.stroke();
      g.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = -Math.PI + k * Math.PI / 5; g.beginPath(); g.moveTo(x + lean, base - th); g.quadraticCurveTo(x + lean + Math.cos(a) * 16, base - th + Math.sin(a) * 16 - 4, x + lean + Math.cos(a) * 26, base - th + Math.sin(a) * 12 + 10); g.stroke(); }
    }
    // sand, surf, catamarans
    g.fillStyle = '#e8d6a8'; g.fillRect(0, base + 2, LAYER_W, 10);
    waterBand(g, r, t, base + 6, h, false);
    g.fillStyle = '#fff'; for (let x = 0; x < LAYER_W; x += 24) g.fillRect(x + r() * 8, base + 12, 12, 2);
    g.fillStyle = shade(col, -0.1); for (let i = 0; i < 8; i++) { const bx = r() * LAYER_W, by = base + 20 + r() * 8; g.fillRect(bx, by, 22, 3); g.beginPath(); g.moveTo(bx + 10, by); g.lineTo(bx + 10, by - 12); g.lineTo(bx + 18, by); g.fill(); }
    return c;
  },
});
