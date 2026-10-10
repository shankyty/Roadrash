'use strict';
// The classic style must build every road exactly as the game did before track packs. The expected
// fingerprints were captured from that code by tests/golden/capture.js.
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');
const { buildWorld } = require('./build-world.js');
const { fingerprint } = require('./fingerprint.js');
const golden = require('./golden/classic-roads.json');

// tour 0 and tour 1: the road is seeded with seed + round * 1000, the traffic with seed + 99 + round
// (only the tracks that existed then: ones added since have no old road to match)
for (const id of RRR.order().filter(id => golden[`${id}/3d`])) for (const mode of ['3d', '2d']) for (const round of [0, 1]) {
  test(`${id} (${mode}, tour ${round}) is unchanged under the classic style`, () => {
    // forced to classic with no overrides, so this keeps guarding the classic recipe after tracks change style
    const { road, handling, scoring, ...base } = RRR.tracks.get(id), { count, cows, dogs } = base.traffic;
    // (and without the footpath, whose stalls and carts came later: the road, scenery and signs must not have moved)
    const def = RRR.resolveDef({ ...base, style: 'classic', road: { footpath: false }, traffic: { count, cows, dogs } });
    const world = buildWorld(def, { in3D: mode === '3d', round });
    assert.deepStrictEqual(fingerprint(world.road, world.traffic), golden[`${id}/${mode}` + (round ? `/tour${round}` : '')]);
  });
}
