'use strict';
// How road traffic drives: one vehicle's step per frame, as a plain function. No DOM access.
// Traffic is solid and drives by the rules. The road is two-way and India keeps left: our traffic uses the
// left carriageway (x < 0), oncoming traffic the right. Lanes are counted from the centre line; buses and
// trucks keep to the outermost (left) lane, cars pick one. Everyone keeps a safe gap that grows with speed
// and brakes for whatever is ahead (you, rival autos, traffic, cows), overtakes only on the inside (pulling
// out towards the centre) and moves back out once past, always indicating first and never into a lane with
// something alongside. They merge before a lane ends and stop at red lights (and for a busy junction).
//
// c: the vehicle (mutated) · obs: everything on the road ({ z, x, vz, nw, len, who }) · dt: seconds
// w: { findSegment, wrapDelta, trackLength, segLen, solid (3D: bodies touch end to end), stopLineAhead(z, dir,
//      front, range), lightOf(j), random }
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const { clamp, pick } = RRR.util;
const { LANE_W, laneX } = RRR.road;

function driveTraffic(c, obs, dt, w) {
  const { findSegment, wrapDelta, trackLength } = w, SEG_LEN = w.segLen;
  const rand = (a, b) => a + w.random() * (b - a);
  const dir = c.dir;
  if (c.cruise == null) { c.cruise = c.speed; c.stuck = 0; c.signal = 0; c.signalT = 0; c.checkT = rand(1, 3); c.pref = c.type === 'car' || c.type === 'bike' ? Math.floor(w.random() * 3) : 2; }
  const reachOf = o => w.solid ? (c.len + o.len) / 2 : 250;
  const hits = (x, o) => Math.abs(o.x - x) < (c.nw + o.nw) / 2 - 0.02;
  const fwd = o => wrapDelta(o.z - c.z) * dir;                 // how far ahead of me, going my way
  const laneFree = (x, ahead, behind) => !obs.some(o => o.who !== c && hits(x, o) && fwd(o) > -reachOf(o) - behind && fwd(o) < reachOf(o) + ahead);
  const lanesNow = findSegment(c.z).lanes;
  let lanesAhead = lanesNow, laneEnds = Infinity;
  for (let d = SEG_LEN; d <= 2600; d += SEG_LEN) { const l = findSegment(c.z + dir * d).lanes; if (l < lanesAhead) lanesAhead = l; if (l <= c.lane && laneEnds === Infinity) laneEnds = d; }
  // what's ahead: the nearest thing in my lane, a stop line at red, or the end of my lane
  let gap = Infinity, aheadV = 0, ahead = null;
  for (const o of obs) {
    if (o.who === c || !hits(c.x, o)) continue;
    const d = fwd(o), g = d - reachOf(o);
    if (d > 0 && g < 3000 && g < gap) { gap = g; aheadV = Math.max(0, o.vz * dir); ahead = o; }
  }
  const sl = w.stopLineAhead(c.z, dir, c.len / 2, 3000);
  let atRed = false;                                            // waiting for the lights (that's not a jam)
  if (sl && !c.rash) {                                          // (rash bikers jump the red)
    const L = w.lightOf(sl.j), brakeDist = c.speed * c.speed / 12000;
    if ((L === 'R' || sl.j.busy || (L === 'A' && sl.d > brakeDist)) && sl.d < gap) { gap = sl.d; aheadV = 0; ahead = null; atRed = true; }
  }
  if (laneEnds < Infinity && laneEnds - c.len / 2 - 120 < gap) { gap = laneEnds - c.len / 2 - 120; aheadV = 0; ahead = null; }
  const safe = c.rash ? 90 + c.speed * 0.1 : 250 + c.speed * 0.35;
  const target = gap < Infinity ? Math.min(c.cruise, Math.max(0, aheadV + (gap - safe) * 1.6)) : c.cruise;
  c.speed += clamp(target - c.speed, -9000 * dt, 2500 * dt);
  c.z = ((c.z + dir * c.speed * dt) % trackLength + trackLength) % trackLength;
  if (ahead && gap < 0) { c.z = ((ahead.z - dir * reachOf(ahead)) % trackLength + trackLength) % trackLength; c.speed = Math.min(c.speed, aheadV); }
  // lane changes (signal: -1 towards the centre to overtake or merge, +1 back out to the left)
  if (c.lane >= lanesNow) c.lane = lanesNow - 1;
  if (c.yieldT > 0) c.yieldT -= dt;
  const atLane = Math.abs(laneX(dir, c.lane) - c.x) < 0.01;
  if (c.rash) {
    // rash biker: never indicates; cuts into whichever lane (either side) is free the moment anything is
    // in the way, and weaves now and then anyway
    c.signal = 0; c.signalT = 0; c.checkT -= dt;
    if ((ahead && gap < 900) || c.checkT <= 0 || c.lane >= lanesAhead) {
      c.checkT = rand(0.6, 1.8);
      const opts = [c.lane - 1, c.lane + 1].filter(l => l >= 0 && l < lanesAhead && laneFree(laneX(dir, l), 350, 250));
      if (opts.length) c.lane = pick(opts, w.random);
    }
  } else if (c.signalT > 0) {
    c.signalT -= dt;
    if (c.signalT <= 0) {
      const l = c.lane + c.signal;
      if (l >= 0 && l < lanesNow && laneFree(laneX(dir, l), 600, 500)) c.lane = l;  // go (keeps blinking until in the lane)
      else if (c.signal < 0 && c.lane >= lanesAhead) c.signalT = 0.3;             // must merge: keep indicating, try again
      else c.signal = 0;
    }
  } else if (atLane) {
    c.signal = 0;
    if (ahead && gap < safe + 400 && c.speed < c.cruise * 0.8) c.stuck += dt; else c.stuck = 0;
    c.checkT -= dt;
    const home = Math.min(c.pref, lanesAhead - 1);
    if (c.lane >= lanesAhead && c.lane > 0) { c.signal = -1; c.signalT = 0.6; }                                   // my lane ends: merge in
    else if (c.yieldT > 0 && c.lane + 1 < lanesAhead && laneFree(laneX(dir, c.lane + 1), 700, 600)) { c.signal = 1; c.signalT = 0.35; c.yieldT = 0; } // let the honker through
    else if (c.stuck > 0.8 && c.lane > 0 && laneFree(laneX(dir, c.lane - 1), 900, 700)) { c.signal = -1; c.signalT = 0.8; c.stuck = 0; } // overtake on the inside
    else if (c.stuck > 0.8 && aheadV < 1 && c.lane + 1 < lanesAhead && laneFree(laneX(dir, c.lane + 1), 900, 700)) { c.signal = 1; c.signalT = 0.8; c.stuck = 0; } // round a parked cart on the outside
    else if (c.checkT <= 0) { c.checkT = rand(1.5, 3); if (c.lane < home && laneFree(laneX(dir, c.lane + 1), 1400, 900)) { c.signal = 1; c.signalT = 0.8; } } // back out to the left
  }
  // jam watch: time spent (nearly) stopped other than at the lights. After a while a jammed vehicle squeezes
  // into any lane that's free right alongside (off screen it's moved on altogether: see updateTraffic)
  c.stuckT = c.speed < 150 && !atRed ? (c.stuckT || 0) + dt : 0;
  if (c.stuckT > 10 && !c.rash && c.signalT <= 0 && atLane) {
    const opts = [c.lane - 1, c.lane + 1].filter(l => l >= 0 && l < lanesNow && laneFree(laneX(dir, l), 250, 250));
    if (opts.length) { const l = pick(opts, w.random); c.signal = l < c.lane ? -1 : 1; c.lane = l; c.stuckT = 6; }
  }
  // steer toward the lane, never sliding into something alongside
  const turn = c.rash ? 1.3 : 0.45, tx = laneX(dir, c.lane) + (c.rash ? Math.sin(c.z / 900) * 0.05 : 0); // rash: swerves fast, wobbles in lane
  const nx = c.x + clamp(tx - c.x, -turn * dt, turn * dt);
  if (nx !== c.x) {
    const blocked = obs.some(o => o.who !== c && Math.abs(fwd(o)) < reachOf(o) && hits(nx, o) && !hits(c.x, o));
    if (blocked) c.lane = clamp(Math.round(Math.abs(c.x) / LANE_W - 0.5), 0, lanesNow - 1); else c.x = nx;
  }
  if (Math.abs(laneX(dir, c.lane) - c.x) < 0.01 && c.signalT <= 0) c.signal = 0;
  c.signalX = -c.signal * dir; // the side (in x) that's blinking
}
RRR.driveTraffic = driveTraffic;
})();
