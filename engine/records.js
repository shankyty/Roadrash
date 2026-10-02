'use strict';
// Per-track bests, and which race is selected. Storage is passed in (the game's `store`: get(key, fallback)
// and set(key, value)), so this runs under Node for tests.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const EMPTY = { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 };

class Records {
  constructor(store) { this.store = store; }
  all() { const v = this.store.get('records', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  get(trackId) { const r = this.all()[trackId]; return { ...EMPTY, ...(r && typeof r === 'object' ? r : {}) }; }
  // stats: { time, rank, driftScore, passes }; time is null when you didn't finish. Returns which bests were beaten.
  submit(trackId, stats) {
    const old = this.get(trackId), next = { ...old }, beaten = { time: false, drift: false, passes: false };
    if (stats.time != null && (old.bestTime === null || stats.time < old.bestTime)) { next.bestTime = stats.time; beaten.time = true; }
    if (stats.driftScore > old.bestDrift) { next.bestDrift = stats.driftScore; beaten.drift = true; }
    if (stats.passes > old.bestPasses) { next.bestPasses = stats.passes; beaten.passes = true; }
    if (stats.rank === 1) next.wins = old.wins + 1;
    this.store.set('records', { ...this.all(), [trackId]: next });
    return beaten;
  }
}
RRR.Records = Records;

// The selected race's place in the race order. It is saved as a track id ('track'); saves from before
// track packs hold a list index ('level'), which is used once and then replaced.
RRR.selectedTrackIndex = (store, order) => {
  const id = store.get('track', null);
  if (id !== null) return Math.max(0, order.indexOf(id));
  const old = store.get('level', 0);
  return Number.isInteger(old) && old >= 0 && old < order.length ? old : 0;
};
})();
