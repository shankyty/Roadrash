'use strict';
// Captures fingerprints of the 7 roads and their traffic from the game as it was before the track-pack
// refactor (commit e274c43), by running the original functions cut out of that commit's web/game.js.
// Line numbers are pinned to that commit, so they never go stale.
//   node tests/golden/capture.js          writes classic-roads.json and legacy-data.json next to this file
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const { fingerprint } = require('../fingerprint.js');
const { stubSprites, stubThemeSprites } = require('../stub-sprites.js');

const BASE = 'e274c43';
const src = execSync(`git show ${BASE}:web/game.js`, { maxBuffer: 1 << 26 }).toString().split('\n');
const lines = (a, b) => src.slice(a - 1, b).join('\n');

const body = [
  'let use3D = false; const store = { get: (k, d) => d, set() {} };',
  lines(12, 28),        // constants
  lines(31, 39),        // TRACKS
  lines(53, 65),        // HAWKER_CALLS, CURSES
  lines(69, 130),       // THEMES
  lines(133, 150),      // utils, mulberry32, weightedPick
  lines(487, 502),      // SONGS
  lines(1235, 1242),    // AD_COLORS, BILLBOARDS
  lines(1631, 1635),    // DOG_COATS
  lines(1693, 1750),    // CAR / BUS / TRACTOR / BIKE looks, busLookFor
  'let SP = null;',
  lines(1774, 1782),    // world state
  lines(1794, 1876),    // addSegment, addRoad, buildTrack
  lines(1883, 1940),    // lanes, junctions, signs
  lines(1962, 1963),    // findSegment, wrapDelta
  'function legacyTraffic() {', lines(1995, 2024), 'return traffic; }',
  `return {
    TRACKS, THEMES, HAWKER_CALLS, CURSES, SONGS, BUS_LOOKS, BILLBOARDS,
    build(i, in3D, sprites, themeSpritesFor) {
      use3D = in3D; SP = sprites; round = 0;
      track = TRACKS[i]; track.themeDef = THEMES[track.theme]; theme = track.themeDef;
      themeSprites = themeSpritesFor(theme);
      buildTrack(track);
      const road = { segments, junctions, startZ, trackLength };
      return { road, traffic: legacyTraffic() };
    },
  };`,
].join('\n');
const legacy = new Function(body)();
// the old theme keys and the track ids that replace them
const IDS = { marine: 'marine-drive', hyderabad: 'charminar-road', sealink: 'sea-link', delhi: 'ring-road', express: 'western-express', chennai: 'marina-beach', juhu: 'juhu-beach' };

function capture() {
  const out = {};
  legacy.TRACKS.forEach((t, i) => {
    for (const mode of ['3d', '2d']) {
      const SP = stubSprites();
      const { road, traffic } = legacy.build(i, mode === '3d', SP, th => stubThemeSprites(th.buildings.length, legacy.BILLBOARDS.length + th.ads.length));
      out[`${IDS[t.theme]}/${mode}`] = fingerprint(road, traffic);
    }
  });
  return out;
}
module.exports = { legacy, capture, IDS };

if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, 'classic-roads.json'), JSON.stringify(capture(), null, 1) + '\n');
  const { TRACKS, THEMES, HAWKER_CALLS, CURSES, SONGS, BUS_LOOKS } = legacy;
  fs.writeFileSync(path.join(__dirname, 'legacy-data.json'), JSON.stringify({ IDS, TRACKS, THEMES, HAWKER_CALLS, CURSES, SONGS, BUS_LOOKS }, null, 1) + '\n');
  console.log('captured', Object.keys(capture()).length, 'fingerprints');
}
