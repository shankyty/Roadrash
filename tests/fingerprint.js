'use strict';
// Fingerprints of a built road and its traffic: everything that comes from the seeded generators, and
// nothing that comes from Math.random (cosmetic offsets, speeds). Sprites are the string tokens of
// stub-sprites.js, so they can be compared as they are. A vehicle's sprite token carries which look it drew;
// a bus's livery comes from the city pack, so it is compared in full.
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function roadRows({ segments, junctions, startZ, trackLength }) {
  return {
    startZ, trackLength,
    blocks: segments.blocks.map(b => [b.s, b.per]),
    junctions: junctions.map(j => [j.i, j.s0, j.s1, j.phase, j.cop ? 1 : 0, j.half]),
    segments: segments.map(s => [s.curve, s.p1.world.y, s.p2.world.y, s.hw1, s.hw2, s.half, s.lanes, s.dark ? 1 : 0,
      s.finish || 0, s.junction ? s.junction.i : -1, s.clear ? 1 : 0, s.solids.length,
      s.sprites.map(q => [q.kind, q.img, Math.sign(q.offset), q.nw, q.len || 0, q.solid ? 1 : 0, q.center ? 1 : 0, q.facing || 0, q.junction ? q.junction.i : -1])]),
  };
}
function trafficRows(traffic) {
  return traffic.map(c => c.type === 'cow' ? ['cow', c.z, Math.sign(c.vx)]
    : c.type === 'dog' ? ['dog', c.z, c.mode, c.t, c.look, Math.sign(c.vx)]
    : [c.type, c.dir, c.z, c.lane, c.x, c.img, c.rash ? 1 : 0, c.type === 'bus' ? JSON.stringify(c.look) : '']);
}
// summary + hashes: small enough to commit, exact enough to catch any drift
function fingerprint(road, traffic) {
  const r = roadRows(road), t = trafficRows(traffic);
  return { segments: r.segments.length, junctions: r.junctions.length, traffic: t.length, road: sha(r), trafficHash: sha(t) };
}
module.exports = { roadRows, trafficRows, fingerprint };
