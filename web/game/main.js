'use strict';
// Starts the game: page layout and the main loop.
// ------------------------------------------------------------------ layout & loop
const PORTRAIT_PANEL = 220;
function fit() {
  const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
  const s = Math.min(innerWidth / W, (innerHeight - (portrait ? PORTRAIT_PANEL : 0)) / H);
  for (const c of [canvas, bgCanvas, glCanvas]) if (c) { c.style.width = `${Math.floor(W * s)}px`; c.style.height = `${Math.floor(H * s)}px`; }
  for (const c of [bgCanvas, glCanvas]) if (c) { c.style.left = `${canvas.offsetLeft}px`; c.style.top = `${canvas.offsetTop}px`; }
}
addEventListener('resize', fit);

buildSharedSprites();
use3D = !/[?&]2d\b/.test(location.search) && (!IS_MOBILE || /[?&]3d\b/.test(location.search)) && !!(window.World3D && glCanvas && bgCtx &&
  guard('renderer', () => World3D.init(glCanvas, { W, H, ROAD_W, SEG_LEN, quality: QUALITY, maxPixelRatio: { smooth: 1.25, high: 1.75, ultra: 2 }[QUALITY] })));
if (!use3D) disable3D(); else World3D.setCamera(store.get('camera', 'heli'));
fit();
(function boot() { // (a function, so a config error can stop here with return)
  if (CONFIG_PROBLEMS.length) { // no track can be loaded: say what is wrong and stop here
    state = 'config-error'; disable3D(); drawConfigError();
    reportProblem('config', CONFIG_PROBLEMS[0]);
    return;
  }
  store.set('track', ORDER[level]);
  try { attractSetup(); } catch (err) { // a pack the checks let through still broke the build: say so instead of a black canvas
    CONFIG_PROBLEMS.push(`could not build the first track: ${err && err.message}`);
    state = 'config-error'; disable3D(); drawConfigError();
    reportProblem('config', CONFIG_PROBLEMS[0], err, 'boot');
    return;
  }
  let last = performance.now(), acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    try { step(now); } catch (err) { reportProblem(componentOf(err) || 'game-loop', err && err.message, err, 'frame'); }
  }
  function step(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
    else Sfx.setEngine(0, false);
    render();
  }
  requestAnimationFrame(frame);
  // expose for debugging
  window.__rrr = { get state() { return state; }, player, drivers: DRIVERS, pickGrid, homeDriver, cycleDriver, get rivals() { return rivals; }, get results() { return results; }, setupRace,
    step(n) { for (let i = 0; i < n; i++) update(STEP); render(); }, keys, Sfx, Music, Ambience, VehicleAudio, VoiceClips, Animals, RRR, get def() { return def; }, get stats() { return stats; }, records, SP, get traffic() { return traffic; }, get segments() { return segments; }, get bubbles() { return bubbles; }, get junctions() { return junctions; }, get cross() { return crossTraffic; }, get marks() { return skidMarks; }, DriftMusic, lightOf, setLevel(l) { level = l; attractSetup(); } };
})();
