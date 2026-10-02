'use strict';
// The classic style must build every road exactly as the game did before track packs. The expected
// fingerprints were captured from that code by tests/golden/capture.js.
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');
const { buildWorld } = require('./build-world.js');
const { fingerprint } = require('./fingerprint.js');
const golden = require('./golden/classic-roads.json');

for (const id of RRR.order()) for (const mode of ['3d', '2d']) {
  test(`${id} (${mode}) is unchanged under the classic style`, () => {
    // forced to classic with no overrides, so this keeps guarding the classic recipe after tracks change style
    const { road, handling, scoring, ...base } = RRR.tracks.get(id), { count, cows, dogs } = base.traffic;
    const def = RRR.resolveDef({ ...base, style: 'classic', traffic: { count, cows, dogs } });
    const world = buildWorld(def, { in3D: mode === '3d' });
    assert.deepStrictEqual(fingerprint(world.road, world.traffic), golden[`${id}/${mode}`]);
  });
}
