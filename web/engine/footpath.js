'use strict';
// The rules of the footpath and of jumping off a cart, as plain functions: which band of the road a position
// is in, when the kerb is crossed, when an auto is lined up with a cart, and how a jump flies. No DOM, no state.
// Distances across the road are in road units (one lane is 0.6); `half` is a segment's half-width and `fp` a
// track's footpath settings ({ width, climbLoss, dropLoss, stallEvery }), or false when the track has none.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});

const KERB_W = 1 / 6;   // the painted kerb stones between the lane edge and the footpath (road level)
// a cart ramp: segments before its stall, segments long, road units wide, how near its centre you must be to take
// off, and the segments past it that must be plain road (no junction, no lanes tapering) so that a straight jump
// at any speed comes down on the footpath
// (laneEvery: segments between the carts parked in our lanes, ramps off the road itself; laneBend: the hardest bend
// allowed from a lane cart's run-up to its landing)
const CART = { lead: 8, length: 4, width: 0.4, takeoff: 0.2, runout: 100, laneEvery: [300, 600], laneBend: 4 };
// potholes in our lanes: segments between them, road units wide, and the share of speed one costs
const POTHOLE = { every: [40, 120], width: 0.3, loss: 0.2 };
const STALL_W = 0.6;    // a stall blocks a footpath one lane wide
// a jump: the least speed that takes off (a share of 80 km/h), seconds in the air = airBase + airPerSpeed × speed
// share, peak height = peak × seconds² (track units), and the share of speed a landing costs
const JUMP = { minSpeed: 0.375, airBase: 0.35, airPerSpeed: 0.75, peak: 450, landLoss: 0.05 };

// where the footpath starts and ends, measured from the centre line
const kerbLine = half => half + KERB_W;
const backEdge = (half, fp) => half + KERB_W + fp.width;
const centre = (half, fp) => half + KERB_W + fp.width / 2;

// 'road', 'footpath' or 'grass'. flat: a junction, where the footpath dips to road level (it all counts as road).
// Without a footpath the road ends at the lane edge, as it always did.
function zoneAt(half, fp, x, flat = false) {
  const a = Math.abs(x);
  if (!fp) return a <= half ? 'road' : 'grass';
  if (a <= kerbLine(half)) return 'road';
  if (a <= backEdge(half, fp)) return flat ? 'road' : 'footpath';
  return 'grass';
}
// 'climb' (road to footpath), 'drop' (footpath to road) or null, for a sideways move from x0 to x1 on one stretch
function kerbCrossing(half, fp, x0, x1, flat = false) {
  if (!fp || flat || Math.sign(x0) !== Math.sign(x1)) return null;
  const was = zoneAt(half, fp, x0), now = zoneAt(half, fp, x1);
  return was === 'road' && now === 'footpath' ? 'climb' : was === 'footpath' && now === 'road' ? 'drop' : null;
}
// is an auto at x, doing speedShare of 80 km/h, lined up to take off from a cart centred at cartX?
const takesOff = (cartX, x, speedShare) => Math.abs(x - cartX) <= CART.takeoff && speedShare >= JUMP.minSpeed;
// the flight a take-off at this speed gives: seconds in the air and peak height
function jump(speedShare) {
  const airTime = JUMP.airBase + JUMP.airPerSpeed * speedShare;
  return { airTime, peak: JUMP.peak * airTime * airTime };
}
// height above the road t seconds into a flight (a parabola; 0 before take-off and after landing)
const heightAt = (j, t) => (t <= 0 || t >= j.airTime ? 0 : 4 * j.peak * (t / j.airTime) * (1 - t / j.airTime));
// how far roadside furniture stands out from where it stood without a footpath, so the footpath is clear
const furnitureShift = fp => (fp ? KERB_W + fp.width - 0.07 : 0); // 0.07 less: the nearest furniture stood 0.1 out from the road's edge, and now stands just behind the footpath

RRR.footpath = { KERB_W, CART, POTHOLE, STALL_W, JUMP, kerbLine, backEdge, centre, zoneAt, kerbCrossing, takesOff, jump, heightAt, furnitureShift };
})();
