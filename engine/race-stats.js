'use strict';
// What you did in one race: drift score, close passes and their chain, your time and place. The game feeds
// it events; the results screen and the records read it. No DOM access.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const CHAIN_MAX = 5, CHAIN_SECS = 1.5; // a chain of close passes: its longest, and how long each pass keeps it alive

class RaceStats {
  // scoring: the track definition's { driftCashPer100, passCash }
  constructor(scoring) {
    this.scoring = scoring;
    this.driftScore = 0; this.passes = 0; this.chain = 0; this.bestChain = 0; this.chainT = 0; this.time = null; this.rank = null;
  }
  // a moment of sliding: speedPct is the speed as a share of top speed (it goes above 1 on speed tracks and under a boost, so points per metre stay constant); slipPct is the share (0 to 1) of a full slide. Returns the points it earned
  drift(dt, speedPct, slipPct) { const pts = 100 * speedPct * slipPct * dt; this.driftScore += pts; return pts; }
  // a close pass: lengthens the chain and restarts its timer. Returns the chain's length
  closePass() {
    this.passes++; this.chain = Math.min(CHAIN_MAX, this.chain + 1); this.bestChain = Math.max(this.bestChain, this.chain); this.chainT = CHAIN_SECS;
    return this.chain;
  }
  advance(dt) { if (this.chainT > 0 && (this.chainT -= dt) <= 0) this.chain = 0; }
  breakChain() { this.chain = 0; this.chainT = 0; } // a crash ends it
  // time is null when you didn't cross the line
  finish(time, rank) { this.time = time; this.rank = rank; }
  bonuses() { return { drift: Math.round(this.driftScore / 100 * this.scoring.driftCashPer100), passes: this.passes * this.scoring.passCash }; }
  // what the records keep (see engine/records.js)
  summary() { return { time: this.time, rank: this.rank, driftScore: Math.round(this.driftScore), passes: this.passes }; }
}
RaceStats.CHAIN_MAX = CHAIN_MAX; RaceStats.CHAIN_SECS = CHAIN_SECS;
RRR.RaceStats = RaceStats;
})();
