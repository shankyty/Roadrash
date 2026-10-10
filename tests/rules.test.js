'use strict';
// The game rules that live outside game.js (traffic lights, how traffic drives, race order), so a port to another
// engine can check itself against the same cases.
const test = require('node:test'), assert = require('node:assert');
for (const f of ['util', 'track-builder', 'junction', 'traffic-ai', 'standings']) require(`../web/engine/${f}.js`);
const { junction, driveTraffic, standings, road: { laneX } } = globalThis.RRR;

test('a junction light: green 11 s, amber 2.5 s, then red; the cross road goes from 14.5 to 21 s', () => {
  const j = { phase: 0 };
  assert.deepStrictEqual([0, 10.9, 11, 13.4, 13.5, 21.9].map(t => junction.light(t, j)), ['G', 'G', 'A', 'A', 'R', 'R']);
  assert.deepStrictEqual([13.5, 14.5, 20.9, 21].map(t => junction.crossGo(t, j)), [false, true, true, false]);
  assert.strictEqual(junction.light(22 + 5, j), 'G');                 // the cycle repeats
  assert.strictEqual(junction.light(0, { phase: -5 }), 'R');            // a negative offset still lands in the cycle
});

// a straight road: segLen 200, `lanes(z)` lanes our way, one junction whose stop line is at z = 5000
const LEN = 200000, wrap = d => { d = ((d % LEN) + LEN) % LEN; return d > LEN / 2 ? d - LEN : d; };
const world = ({ lanes = () => 3, light = 'G' } = {}) => {
  const js = [{ z0: 5150, z1: 6000, phase: 0 }];
  return { findSegment: z => ({ lanes: lanes(((z % LEN) + LEN) % LEN) }), wrapDelta: wrap, trackLength: LEN, segLen: 200, solid: true,
    lightOf: () => light, random: () => 0.5, stopLineAhead: (z, dir, front, range) => junction.stopLineAhead(js, wrap, z, dir, front, range) };
};
const car = (o = {}) => ({ type: 'car', dir: 1, z: 1000, lane: 1, x: laneX(1, 1), nw: 0.38, len: 1500, speed: 3000, ...o });
const run = (c, w, secs, obs = [{ z: c.z, x: c.x, vz: 0, nw: c.nw, len: c.len, who: c }]) => {
  for (let t = 0; t < secs; t += 1 / 60) { obs[0].z = c.z; obs[0].x = c.x; driveTraffic(c, obs, 1 / 60, w); }
  return c;
};

test('traffic stops at a red light, short of the stop line, and drives through on green', () => {
  const red = run(car(), world({ light: 'R' }), 10);
  assert.ok(red.speed < 1, `still moving at ${red.speed}`);
  assert.ok(red.z + red.len / 2 < 5000 && red.z + red.len / 2 > 4500, `front at ${red.z + red.len / 2}`);
  assert.ok(run(car(), world(), 10).z > 6000);
});

test('rash bikers jump the red', () => {
  assert.ok(run(car({ type: 'bike', rash: true, nw: 0.17, len: 860 }), world({ light: 'R' }), 10).z > 6000);
});

test('traffic keeps a safe gap behind a stopped vehicle', () => {
  const c = car({ lane: 0, x: laneX(1, 0) });                      // a one-lane road: nowhere to overtake
  const obs = [{ z: c.z, x: c.x, vz: 0, nw: c.nw, len: c.len, who: c }, { z: 4000, x: c.x, vz: 0, nw: 0.38, len: 1500, who: {} }];
  run(c, world({ lanes: () => 1 }), 8, obs);
  const gap = 4000 - c.z - 1500;
  assert.ok(c.speed < 1 && gap > 200 && gap < 400, `gap ${gap}, speed ${c.speed}`);
});

test('traffic merges out of a lane before it ends', () => {
  const c = run(car({ lane: 2, x: laneX(1, 2) }), world({ lanes: z => (z < 3000 ? 3 : 2) }), 4);
  assert.strictEqual(c.lane, 1);
  assert.ok(Math.abs(c.x - laneX(1, 1)) < 0.01);
});

test('race order: finishers first in the order they finished, then the rest by distance', () => {
  const a = { dist: 9, finished: true }, b = { dist: 5 }, c = { dist: 7 }, d = { dist: 8, finished: true };
  assert.deepStrictEqual(standings.order([d, a], [a, b, c, d]), [d, a, c, b]);
  assert.deepStrictEqual([1, 3, 8, 9].map(standings.prize), [1500, 700, 0, 0]);
});

test('traffic in the inside lane goes round a parked cart on the outside', () => {
  const c = car({ lane: 0, x: laneX(1, 0), cruise: 3000, pref: 0, stuck: 0, signal: 0, signalT: 0, checkT: 2 }), cart = { z: 5000, x: laneX(1, 0), vz: 0, nw: 0.4, len: 800, who: {} };
  run(c, world(), 6, [{ z: c.z, x: c.x, vz: 0, nw: c.nw, len: c.len, who: c }, cart]); // (well before a jam squeezes it out, at 10 s)
  assert.ok(c.z > 6000 && c.lane === 1, `at ${Math.round(c.z)} in lane ${c.lane}`);
});
