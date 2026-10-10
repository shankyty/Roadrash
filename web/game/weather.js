'use strict';
// Monsoon tracks (look.rain): rain over everything, storm clouds (see cloudLayer), and now and then lightning
// behind the skyline, a flash, and the thunder a moment later. Hail (look.hail: { from, to }, shares of the lap)
// falls for a stretch of the track only, coming on and easing off over the stretch's ends.
const weather = { flash: 0, bolt: null, nextT: 3, thunderT: 0, hail: 0 };
const HAIL_EDGE = 0.03; // the share of a lap it takes to come on and to ease off
function hailAt(dist) {
  const h = theme && theme.hail; if (!h) return 0;
  const p = ((dist % trackLength) + trackLength) % trackLength / trackLength;
  return clamp(Math.min(p - h.from, h.to - p) / HAIL_EDGE + 0.5, 0, 1);
}
// a jagged bolt from the top of the sky down to the skyline, in screen widths across and sky heights down
function boltPath() {
  const pts = [[rand(0.12, 0.88), 0]];
  for (let i = 1; i <= 10; i++) pts.push([pts[i - 1][0] + rand(-0.035, 0.035), i / 10]);
  const k = 3 + Math.floor(rand(0, 4)), fork = [pts[k]]; // a fork off part of the way down
  for (let i = 1; i <= 4; i++) fork.push([fork[i - 1][0] + rand(0.005, 0.04) * (pts[0][0] < 0.5 ? 1 : -1), pts[k][1] + i * 0.08]);
  return [pts, fork];
}
function updateWeather(dt) {
  weather.hail = state === 'title' ? 0 : hailAt(player.dist);
  const rain = !!(theme && theme.rain);
  Sfx.rain(rain ? 1 : weather.hail); // (hail comes with a downpour of its own)
  if (weather.hail > 0 && Math.random() < dt * 28 * weather.hail) Sfx.hailTick(); // stones clattering on the roof
  if (!rain) { weather.flash = 0; weather.bolt = null; return; }
  weather.flash = Math.max(0, weather.flash - dt * 3);
  if (weather.bolt && (weather.bolt.t -= dt) <= 0) weather.bolt = null;
  if ((weather.nextT -= dt) <= 0) {
    weather.nextT = rand(6, 14); weather.flash = 1; weather.bolt = { paths: boltPath(), t: 0.3 }; weather.thunderT = rand(0.4, 1.8);
  }
  if (weather.thunderT > 0 && (weather.thunderT -= dt) <= 0) Sfx.thunder();
}
// the bolt, in the sky behind the skyline (drawn into the background, hz: the horizon's height)
function drawBolt(g, hz) {
  if (!weather.bolt) return;
  g.save(); g.lineJoin = 'round';
  for (const [width, color] of [[9, 'rgba(170,190,255,.35)'], [2.5, '#ffffff']]) {
    g.strokeStyle = color; g.lineWidth = width;
    for (const p of weather.bolt.paths) { g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, x * W, y * (hz + 30))); g.stroke(); }
  }
  g.restore();
}
// rain streaks or hailstones over the whole picture, and the lightning's flash
function drawRain() {
  if (!theme.rain && !weather.hail) return;
  const t = performance.now() / 1000;
  if (weather.hail) { ctx.fillStyle = `rgba(40,46,58,${(0.28 * weather.hail).toFixed(3)})`; ctx.fillRect(0, 0, W, H); } // the sky darkens over it
  if (theme.rain) {
    ctx.strokeStyle = 'rgba(205,215,230,.32)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < 170; i++) {
      const fall = 950 + (i * 37) % 450, y = (t * fall + i * 53) % (H + 60) - 30, x = ((i * 97.13 + y * 0.22) % W + W) % W;
      ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 20 + (i % 3) * 6);
    }
    ctx.stroke();
  }
  if (weather.hail) drawHail(t, weather.hail);
  if (weather.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${(weather.flash * 0.35).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
}
// hailstones: each falls fast to a spot on the lower part of the picture, bounces once and is gone, then falls again
function drawHail(t, amount) {
  ctx.fillStyle = 'rgba(240,246,255,.9)';
  for (let i = 0; i < Math.round(140 * amount); i++) {
    const land = H * (0.5 + ((i * 0.618) % 1) * 0.5), fall = 1300 + (i * 41) % 500, cycle = (land + 40) / fall + 0.3;
    const p = ((t + i * 0.137) % cycle + cycle) % cycle, x0 = ((i * 131.7) % W + W) % W, size = 1.6 + (i % 4) * 0.7;
    let x = x0 - p * 60, y = -40 + p * fall;
    if (y > land) { const u = (p - (land + 40) / fall) / 0.3; x += u * (i % 2 ? 26 : -26); y = land - Math.sin(Math.min(1, u) * Math.PI) * (18 + size * 4); } // the bounce
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
}
