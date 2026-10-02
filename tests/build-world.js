'use strict';
// Builds a road in Node from a definition, with stub sprites and the game's own constants.
const path = require('path');
for (const f of ['util', 'registry', 'track-builder']) require(path.join(__dirname, '..', 'web', 'engine', `${f}.js`));
const RRR = globalThis.RRR;
const { stubSprites, stubThemeSprites } = require('./stub-sprites.js');

const SEG_LEN = 200, CAM_H = 1000, FOV = 100, TUK_LEN = 1060;
const PLAYER_Z = CAM_H * (1 / Math.tan((FOV / 2) * Math.PI / 180));
const SHARED_BILLBOARDS = 5; // BILLBOARDS in game.js: hoardings every city has

// in3D: the starting grid is longer in 3D, which moves the start line · round: the tour number
function buildRoad(def, { in3D = true, round = 0 } = {}) {
  return RRR.buildTrack({ def, round, sprites: stubSprites(),
    constants: { SEG_LEN, RUMBLE_LEN: 3, PLAYER_Z, GRID_GAP: in3D ? TUK_LEN + 350 : 520 },
    themeSprites: stubThemeSprites(def.look.buildings.length, SHARED_BILLBOARDS + def.city.ads.length) });
}

// a small definition with the classic recipe, for tests that don't need the shipped packs
const CLASSIC_ROAD = { lengths: [25, 50, 75], lanes: 'alternate', junctions: true, pieces: [
  { kind: 'straight', weight: 16 }, { kind: 'curve', weight: 26, curves: [2, 4, 6], hills: [0, 0, 20, -20, 40] },
  { kind: 'sCurve', weight: 14, curve: 2, hills: [0, 20, -20] }, { kind: 'hill', weight: 12, hills: [20, 40, 60] },
  { kind: 'rollers', weight: 12 }, { kind: 'bumps', weight: 10 }, { kind: 'curveHill', weight: 10, curve: 6, hill: 30 }] };
const testDef = ({ road = {}, traffic = {} } = {}) => ({
  id: 'test-road', seed: 11, length: 2600, laps: 1,
  road: { ...CLASSIC_ROAD, ...road },
  traffic: { count: 30, cows: 4, dogs: 6, countScale: 1, oncoming: 0.8, mix: { car: 4, bike: 4, bus: 2, truck: 1, tractor: 1 }, ...traffic },
  look: { density: 0.4, buildings: ['#f4d35e', '#ee964b'], scenery: { palm: 4, building: 5, billboard: 2, tree: 1, chai: 1 } },
  city: { ads: [['CUTTING CHAI', '₹10 ONLY']], busLooks: [{ op: 'B.E.S.T.', route: '1' }, { op: 'B.E.S.T.', route: '83' }] },
});
module.exports = { RRR, buildRoad, testDef };
