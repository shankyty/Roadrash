'use strict';
// Traffic lights at road junctions, as plain functions of the world clock t (seconds). No DOM access.
// A 22 s cycle per junction (j.phase offsets it): main road green 11 s, amber 2.5 s, then red while the
// cross road goes (14.5–21 s).
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const CYCLE = 22;
const phase = (t, j) => (((t + j.phase) % CYCLE) + CYCLE) % CYCLE;
const light = (t, j) => { const p = phase(t, j); return p < 11 ? 'G' : p < 13.5 ? 'A' : 'R'; };
const crossGo = (t, j) => { const p = phase(t, j); return p >= 14.5 && p < 21; };
// the next junction ahead of z going dir, and how far its stop line is (from the front bumper)
function stopLineAhead(junctions, wrapDelta, z, dir, front, range) {
  for (const j of junctions) {
    const stop = dir > 0 ? j.z0 - 150 : j.z1 + 150, d = wrapDelta(stop - z) * dir - front;
    if (d > -60 && d < range) return { j, d };
  }
  return null;
}
RRR.junction = { CYCLE, phase, light, crossGo, stopLineAhead };
})();
