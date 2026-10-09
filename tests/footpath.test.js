'use strict';
const test = require('node:test'), assert = require('node:assert');
require('../web/engine/footpath.js');
const F = globalThis.RRR.footpath;

const FP = { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [150, 300] };
const HALF = 1.8, KERB = HALF + 1 / 6, BACK = KERB + 0.6;

test('the road runs to the kerb line, the footpath to its back edge, then grass, on both sides', () => {
  for (const side of [-1, 1]) {
    assert.strictEqual(F.zoneAt(HALF, FP, side * 0.5), 'road');
    assert.strictEqual(F.zoneAt(HALF, FP, side * (HALF + 0.1)), 'road');       // the kerb stones are road level
    assert.strictEqual(F.zoneAt(HALF, FP, side * (KERB + 0.01)), 'footpath');
    assert.strictEqual(F.zoneAt(HALF, FP, side * (BACK - 0.01)), 'footpath');
    assert.strictEqual(F.zoneAt(HALF, FP, side * (BACK + 0.01)), 'grass');
  }
});
test('without a footpath the road ends at the lane edge, as before', () => {
  assert.strictEqual(F.zoneAt(HALF, false, HALF - 0.01), 'road');
  assert.strictEqual(F.zoneAt(HALF, false, HALF + 0.01), 'grass');
  assert.strictEqual(F.zoneAt(HALF, undefined, -(HALF + 0.3)), 'grass');
});
test('at a junction the footpath is at road level', () => {
  assert.strictEqual(F.zoneAt(HALF, FP, KERB + 0.3, true), 'road');
  assert.strictEqual(F.zoneAt(HALF, FP, BACK + 0.1, true), 'grass');
});
test('crossing the kerb line is a climb one way and a drop the other', () => {
  assert.strictEqual(F.kerbCrossing(HALF, FP, KERB - 0.01, KERB + 0.01), 'climb');
  assert.strictEqual(F.kerbCrossing(HALF, FP, -(KERB + 0.01), -(KERB - 0.01)), 'drop');
});
test('moves that stay in one band, or onto the grass, cross no kerb', () => {
  assert.strictEqual(F.kerbCrossing(HALF, FP, 0.2, 0.4), null);
  assert.strictEqual(F.kerbCrossing(HALF, FP, KERB + 0.1, KERB + 0.2), null);
  assert.strictEqual(F.kerbCrossing(HALF, FP, BACK - 0.01, BACK + 0.01), null);
});
test('there is no kerb at a junction or on a track without a footpath', () => {
  assert.strictEqual(F.kerbCrossing(HALF, FP, KERB - 0.01, KERB + 0.01, true), null);
  assert.strictEqual(F.kerbCrossing(HALF, false, HALF - 0.01, HALF + 0.3), null);
});
test('the footpath centre is half its width behind the kerb line', () => {
  assert.ok(Math.abs(F.centre(HALF, FP) - (KERB + 0.3)) < 1e-12);
  assert.ok(Math.abs(F.backEdge(HALF, FP) - BACK) < 1e-12);
});
test('an auto takes off only when near the cart centre and fast enough', () => {
  const cartX = -F.centre(HALF, FP);
  assert.strictEqual(F.takesOff(cartX, cartX + 0.15, 0.5), true);
  assert.strictEqual(F.takesOff(cartX, cartX - 0.19, 0.375), true);
  assert.strictEqual(F.takesOff(cartX, cartX + 0.25, 0.5), false);   // off to one side
  assert.strictEqual(F.takesOff(cartX, cartX, 0.37), false);         // under 30 km/h
});
test('a faster take-off flies longer and higher', () => {
  const slow = F.jump(0.375), fast = F.jump(1), fastest = F.jump(1.25);
  assert.ok(Math.abs(slow.airTime - 0.63125) < 1e-9 && Math.abs(fast.airTime - 1.1) < 1e-9 && Math.abs(fastest.airTime - 1.2875) < 1e-9);
  assert.ok(slow.peak < fast.peak && fast.peak < fastest.peak);
  assert.ok(Math.abs(fast.peak - 450 * 1.1 * 1.1) < 1e-9);
});
test('the flight is a parabola: on the ground at both ends, at its peak half way', () => {
  const j = F.jump(1);
  assert.strictEqual(F.heightAt(j, 0), 0);
  assert.strictEqual(F.heightAt(j, j.airTime), 0);
  assert.strictEqual(F.heightAt(j, j.airTime + 1), 0);
  assert.ok(Math.abs(F.heightAt(j, j.airTime / 2) - j.peak) < 1e-9);
  assert.ok(F.heightAt(j, j.airTime * 0.25) < j.peak && F.heightAt(j, j.airTime * 0.25) > 0);
});
test('the slowest jump still clears the stall behind the cart', () => {
  // 30 km/h is 4500 track units a second; from the cart's first segment to the stall's far side is
  // lead + 1 segments of 200 units, and the auto is 1060 long
  const flown = 4500 * F.jump(F.JUMP.minSpeed).airTime, toClear = (F.CART.lead + 1) * 200 + 1060 / 2;
  assert.ok(flown > toClear, `${Math.round(flown)} flown, ${toClear} to clear`);
});
test('furniture moves out by the footpath, and not at all without one', () => {
  assert.strictEqual(F.furnitureShift(false), 0);
  assert.ok(Math.abs(F.furnitureShift(FP) - (1 / 6 + 0.6 - 0.07)) < 1e-12);
  // a lamp post stood 0.12 outside the lane edge: with a footpath it stands just behind the back edge
  assert.ok(HALF + 0.12 + F.furnitureShift(FP) > BACK);
});
