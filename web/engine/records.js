'use strict';
// Per-track bests, and which race is selected. Storage is passed in (the game's `store`: get(key, fallback)
// and set(key, value)), so this runs under Node for tests.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
// a saved value counts only if it is a real number of the right kind: a hand-edited or corrupt save must not poison later comparisons
const count = v => (Number.isFinite(v) && v >= 0 ? v : 0), time = v => (Number.isFinite(v) && v > 0 ? v : null);

class Records {
  constructor(store) { this.store = store; }
  all() { const v = this.store.get('records', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  get(trackId) {
    const saved = this.all()[trackId], r = saved && typeof saved === 'object' ? saved : {};
    return { bestTime: time(r.bestTime), bestDrift: count(r.bestDrift), bestPasses: count(r.bestPasses), wins: count(r.wins) };
  }
  // stats: { time, rank, driftScore, passes }; time is null when you didn't finish. Returns which bests were beaten.
  submit(trackId, stats) {
    const old = this.get(trackId), next = { ...old }, beaten = { time: false, drift: false, passes: false };
    if (time(stats.time) !== null && (old.bestTime === null || stats.time < old.bestTime)) { next.bestTime = stats.time; beaten.time = true; }
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
