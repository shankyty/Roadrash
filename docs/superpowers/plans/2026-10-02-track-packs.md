# Track Packs (Step 1: Restructure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every track's and city's data out of `web/game.js` into per-track and per-city packs that the game reads through one resolved definition, with the 7 races playing exactly as they do today.

**Architecture:** Packs are plain script files that register on a global `RRR` (tracks, cities, skylines, styles). `web/engine/registry.js` validates them and merges a track with its city and style into one frozen definition. `web/engine/track-builder.js` and `web/engine/traffic-spawner.js` build the road and traffic from that definition; `web/game.js` keeps simulation, audio and rendering and loses all track and city data.

**Tech Stack:** Classic browser scripts (no build step, no modules), Three.js r149 (unchanged), Node's built-in test runner for the DOM-free engine files.

**Spec:** `docs/superpowers/specs/2026-10-02-track-packs-design.md` (this plan covers its step 1; step 2 has its own plan, `2026-10-02-track-styles.md`).

## Global Constraints

- No build step and no packages. The game is classic scripts loaded by `web/index.html`. Packs register themselves on `RRR`; no `fetch`, no JSON files, no ES modules (the Mac app loads `index.html` from `file://`).
- Files under `web/engine/` touch no DOM except inside `RRR.load`, so they run under Node.
- Tests run with `node --test tests/*.test.js` (Node 20 or later). Nothing is installed.
- Step 1 changes no gameplay. `tests/golden-roads.test.js` must pass: the classic style rebuilds all 7 roads and their traffic exactly as commit `e274c43` did.
- The seeded generators must be drawn from in the original order. Do not reorder, add or remove a call to `R()` or `tr()` in the builder or the spawner.
- `e274c43` is the base commit. Scripts in this plan read the old `web/game.js` from it with `git show e274c43:web/game.js`, so their line numbers never go stale.
- Do not split or tidy the rest of `web/game.js`. Match its style: dense one-line statements, short comments that say why.
- Work only in this worktree. Other sessions release from `main` at the same time; never switch branches in the main checkout.
- End every commit message with: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
| --- | --- |
| `web/engine/util.js` | Helpers shared by the engine files and `game.js` (`clamp`, `lerp`, easing, `rand`, `pick`, `mulberry32`, `weightedPick`) |
| `web/engine/registry.js` | `Registry` class; `RRR.tracks`, `RRR.cities`, `RRR.skylines`, `RRR.styles`; `RRR.load`, `RRR.validate`, `RRR.resolve` |
| `web/engine/track-builder.js` | `RRR.buildTrack`: road pieces, lanes, junctions, scenery, signs. Owns `RRR.road` (`LANE_W`, `laneX`) and `RRR.PIECES` |
| `web/engine/traffic-spawner.js` | `RRR.spawnTraffic`: vehicles, cows, dogs. Owns `RRR.VEHICLES` and `RRR.busLook` |
| `web/engine/records.js` | `RRR.Records` (per-track bests) and `RRR.selectedTrackIndex` |
| `web/packs.js` | The manifest: style, city and track ids, tracks in race order |
| `web/styles/classic.js` | Today's road recipe, traffic mix and handling numbers |
| `web/cities/<id>/city.js` | Hawker calls, curses, song, ads, bus liveries |
| `web/cities/<id>/skyline.js` | The city's two skyline painters |
| `web/cities/<id>/ambience.js` | The street recording (moved from `web/ambience-<id>.js`) |
| `web/tracks/<id>/track.js` | One race: name, city, style, seed, length, rivals, traffic counts, look |
| `web/game.js`, `web/world3d.js` | Simulation, audio, rendering. Read the resolved definition |
| `tests/` | Node tests, the golden fingerprints and their capture harness |

Track ids, in race order: `marine-drive`, `charminar-road`, `sea-link`, `ring-road`, `western-express`, `marina-beach`, `juhu-beach`.

---

### Task 1: Fingerprint today's roads

Captures what "unchanged" means before any game code moves. The harness cuts the original track-building and traffic code out of commit `e274c43` and runs it in Node with string tokens in place of sprite canvases.

**Files:**
- Create: `tests/fingerprint.js`
- Create: `tests/stub-sprites.js`
- Create: `tests/golden/capture.js`
- Create (generated): `tests/golden/classic-roads.json`, `tests/golden/legacy-data.json`

**Interfaces:**
- Produces: `fingerprint(road, traffic)` returning `{ segments, junctions, traffic, road, trafficHash }` from `tests/fingerprint.js`; `stubSprites()` and `stubThemeSprites(buildings, billboards)` from `tests/stub-sprites.js`; `{ legacy, capture, IDS }` from `tests/golden/capture.js`; `classic-roads.json` keyed `"<track id>/3d"` and `"<track id>/2d"`; `legacy-data.json` with `IDS`, `TRACKS`, `THEMES`, `HAWKER_CALLS`, `CURSES`, `SONGS`, `BUS_LOOKS`.

- [ ] **Step 1: Check the base has not moved**

Run:
```bash
git fetch origin && git diff --stat e274c43 origin/main -- web/game.js web/world3d.js web/index.html build.sh
```
Expected: no output. If any of these files changed on `main` since `e274c43`, stop and report it: the line numbers and anchors in this plan were checked against `e274c43`.

- [ ] **Step 2: Write `tests/fingerprint.js`**

```js
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
```

- [ ] **Step 3: Write `tests/stub-sprites.js`**

```js
'use strict';
// Stand-ins for the game's sprite canvases: plain string tokens, so tests need no DOM.
const many = (name, n) => Array.from({ length: n }, (_, i) => `${name}:${i}`);
function stubSprites({ dogs = 3, bikes = 9, tractors = 4, carLooks = 21 } = {}) {
  const SP = { signs: {} };
  for (const k of ['palm', 'palmF', 'temple', 'lampL', 'lampR', 'chai', 'milestone', 'arch', 'signal', 'cop', 'bus', 'truck']) SP[k] = k;
  for (const k of ['signal', 'junction', 'narrow', 'nohorn', 'keepleft', 'limit40', 'limit50', 'limit60']) SP.signs[k] = `sign:${k}`;
  SP.trees = many('tree', 3); SP.dogs = many('dog', dogs); SP.bikes = many('bike', bikes); SP.tractors = many('tractor', tractors); SP.carLooks = many('car', carLooks);
  return SP;
}
const stubThemeSprites = (buildings, billboards) => ({ buildings: many('building', buildings), billboards: many('billboard', billboards) });
module.exports = { stubSprites, stubThemeSprites };
```

- [ ] **Step 4: Write `tests/golden/capture.js`**

```js
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
```

- [ ] **Step 5: Capture, and confirm the capture is stable**

Run:
```bash
node tests/golden/capture.js && cp tests/golden/classic-roads.json /tmp/first.json && node tests/golden/capture.js && cmp /tmp/first.json tests/golden/classic-roads.json && echo STABLE
```
Expected: `captured 14 fingerprints` twice, then `STABLE`.

Run:
```bash
node -e "const g=require('./tests/golden/classic-roads.json'); for (const k of Object.keys(g)) if (k.endsWith('/3d')) console.log(k, g[k].segments, g[k].junctions, g[k].traffic)"
```
Expected:
```
marine-drive/3d 3515 4 83
charminar-road/3d 3410 4 102
sea-link/3d 3665 6 83
ring-road/3d 4010 6 124
western-express/3d 3845 7 120
marina-beach/3d 3995 5 115
juhu-beach/3d 4190 4 115
```

- [ ] **Step 6: Commit**

```bash
git add tests/fingerprint.js tests/stub-sprites.js tests/golden
git commit -m "Tests: fingerprint today's 7 roads and their traffic

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Shared helpers and the pack registry

**Files:**
- Create: `web/engine/util.js`
- Create: `web/engine/registry.js`
- Test: `tests/registry.test.js`

**Interfaces:**
- Produces:
  - `RRR.util = { clamp, lerp, easeIn, easeInOut, rand, pick, mulberry32, weightedPick }`
  - `RRR.tracks`, `RRR.cities`, `RRR.skylines`, `RRR.styles`: each a `Registry` with `register(def)`, `get(id)`, `has(id)`, `ids()`
  - `RRR.load(manifest)` where `manifest = { styles: [id], cities: [id], tracks: [id] }`; `RRR.manifest`; `RRR.packFiles(manifest)` returning relative file paths; `RRR.order()` returning track ids
  - `RRR.validate()` returning an array of problem strings (empty when sound)
  - `RRR.resolveDef(rawTrack)` and `RRR.resolve(trackId)` returning the frozen definition: the track's fields plus `city` (the city pack), `skyline` (`{ id, far, near }`), `styleLabel`, `ambience` (boolean), and `road`, `traffic`, `handling`, `scoring` merged from the style with the track's overrides
- Consumes (at validate time only, defined in Tasks 4 and 5): `RRR.PIECES` and `RRR.VEHICLES`, objects whose keys are the known road piece kinds and vehicle types.

- [ ] **Step 1: Write the failing test, `tests/registry.test.js`**

```js
'use strict';
const test = require('node:test'), assert = require('node:assert');
const path = require('path');

// a fresh RRR for every test, with the shipped packs replaced by small ones the test controls
function fresh() {
  delete globalThis.RRR;
  for (const f of ['util', 'registry']) {
    const file = path.join(__dirname, '..', 'web', 'engine', `${f}.js`);
    delete require.cache[require.resolve(file)]; require(file);
  }
  const RRR = globalThis.RRR;
  RRR.PIECES = { straight() {} }; RRR.VEHICLES = { car() {} }; // stand-ins for engine/track-builder.js and traffic-spawner.js
  RRR.styles.register(style());
  RRR.cities.register(city());
  RRR.skylines.register({ id: 'pune', far() {}, near() {} });
  RRR.tracks.register(track());
  RRR.load({ styles: ['plain'], cities: ['pune'], tracks: ['fc-road'] });
  return RRR;
}
const style = () => ({ id: 'plain', label: 'PLAIN',
  road: { lengths: [25], pieces: [{ kind: 'straight', weight: 1 }], lanes: 'alternate', junctions: true },
  traffic: { countScale: 1, oncoming: 0.8, mix: { car: 1 } },
  handling: { topSpeed: 1, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 0, passCash: 0 } });
const city = () => ({ id: 'pune', hawkerCalls: ['MISAL!'], curses: ['ARE!'], song: { bpm: 100 }, ads: [['A', 'B']], busLooks: [{ op: 'PMT' }] });
const track = () => ({ id: 'fc-road', name: 'PUNE · FC ROAD', city: 'pune', style: 'plain', seed: 5, length: 400, laps: 1,
  rivals: { count: 3, skill: 0.9 }, traffic: { count: 10, cows: 1, dogs: 2 },
  look: { sky: ['#000', '#111', '#222'], sun: '#fff', fog: '#ccc', sea: '#00f', far: '#777', near: '#333', lights: 0, density: 0.4,
    light: { road: '#555', grass: '#060', rumble: '#fff', lane: '#eee', shoulder: '#888' },
    dark: { road: '#444', grass: '#050', rumble: '#c00', shoulder: '#777' },
    buildings: ['#abc'], scenery: { tree: 1 } } });
// registers a changed copy of the track under a new id and puts it in the manifest
function withTrack(RRR, change) {
  const t = track(); t.id = 'changed'; change(t);
  RRR.tracks.register(t); RRR.manifest.tracks.push('changed');
  return RRR.validate();
}

test('registering the same id twice throws', () => {
  const RRR = fresh();
  assert.throws(() => RRR.tracks.register(track()), /track "fc-road" is registered twice/);
});
test('a pack without an id throws', () => {
  assert.throws(() => fresh().styles.register({ label: 'X' }), /style pack has no id/);
});
test('sound packs validate with no problems', () => {
  assert.deepStrictEqual(fresh().validate(), []);
});
test('order() is the manifest order and a copy', () => {
  const RRR = fresh(), order = RRR.order();
  order.push('x');
  assert.deepStrictEqual(RRR.order(), ['fc-road']);
});
test('packFiles lists styles, then each city and its skyline, then tracks', () => {
  assert.deepStrictEqual(fresh().packFiles({ styles: ['a'], cities: ['c'], tracks: ['t'] }),
    ['styles/a.js', 'cities/c/city.js', 'cities/c/skyline.js', 'tracks/t/track.js']);
});

test('resolve attaches the city pack, its skyline and the style label', () => {
  const RRR = fresh(), def = RRR.resolve('fc-road');
  assert.strictEqual(def.city, RRR.cities.get('pune'));
  assert.strictEqual(def.skyline, RRR.skylines.get('pune'));
  assert.strictEqual(def.styleLabel, 'PLAIN');
  assert.strictEqual(def.style, 'plain');
  assert.strictEqual(def.ambience, true);
});
test('resolve merges style values with the track\'s overrides, per key', () => {
  const RRR = fresh();
  const t = track(); t.id = 'fast'; t.traffic.oncoming = 0.2; t.handling = { topSpeed: 1.25 }; t.road = { junctions: false }; t.ambience = false;
  RRR.tracks.register(t);
  const def = RRR.resolve('fast');
  assert.deepStrictEqual(def.traffic, { countScale: 1, oncoming: 0.2, mix: { car: 1 }, count: 10, cows: 1, dogs: 2 });
  assert.deepStrictEqual(def.handling, { topSpeed: 1.25, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 });
  assert.strictEqual(def.road.junctions, false);
  assert.strictEqual(def.road.lanes, 'alternate');
  assert.strictEqual(def.ambience, false);
});
test('a resolved definition is frozen all the way down', () => {
  const def = fresh().resolve('fc-road');
  assert.ok(Object.isFrozen(def) && Object.isFrozen(def.look) && Object.isFrozen(def.look.light) && Object.isFrozen(def.road.pieces[0]) && Object.isFrozen(def.city.busLooks[0]));
});
test('resolve of an unknown track throws', () => {
  assert.throws(() => fresh().resolve('nope'), /unknown track "nope"/);
});

test('validate reports a track the manifest names but nothing registered', () => {
  const RRR = fresh(); RRR.manifest.tracks.push('ghost');
  assert.deepStrictEqual(RRR.validate(), ['track "ghost": not registered (tracks/ghost/track.js is missing or failed to load)']);
});
test('validate reports an unknown city', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.city = 'goa'; }), ['track "changed".city: unknown city "goa"']);
});
test('validate reports an unknown style', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.style = 'rally'; }), ['track "changed".style: unknown style "rally"']);
});
test('validate reports a missing field', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { delete t.rivals.skill; }), ['track "changed".rivals.skill: missing']);
});
test('validate reports a wrong type', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.seed = '5'; }), ['track "changed".seed: expected number, got string']);
});
test('validate reports an unknown key, at the top level and nested', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.lapz = 2; t.look.fogg = '#fff'; }),
    ['track "changed".look.fogg: unknown key', 'track "changed".lapz: unknown key']);
});
test('validate reports an unknown road piece, lane pattern and vehicle', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.road = { pieces: [{ kind: 'loop', weight: 1 }], lanes: 'narrow' }; t.traffic.mix = { rickshaw: 1 }; }), [
    'track "changed".road.lanes: must be \'alternate\' or \'wide\'',
    'track "changed".road.pieces[0].kind: unknown piece "loop"',
    'track "changed".traffic.mix.rickshaw: unknown vehicle',
  ]);
});
test('validate reports a city without a skyline', () => {
  const RRR = fresh();
  RRR.cities.register({ ...city(), id: 'goa' }); RRR.manifest.cities.push('goa');
  assert.deepStrictEqual(RRR.validate(), ['skyline "goa": not registered (cities/goa/skyline.js is missing or failed to load)']);
});
test('validate without a manifest says packs.js did not load', () => {
  const RRR = fresh(); RRR.manifest = null;
  assert.deepStrictEqual(RRR.validate(), ['packs.js did not load: there is no manifest']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/registry.test.js`
Expected: FAIL, `Cannot find module '.../web/engine/util.js'`.

- [ ] **Step 3: Write `web/engine/util.js`**

These are the same functions `web/game.js` defines today (lines 133 to 150); Task 7 makes `game.js` use these.

```js
'use strict';
// Small helpers shared by the engine files and game.js. No DOM access, so it also runs under Node for tests.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeIn = (a, b, p) => a + (b - a) * p * p;
const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
// seeded random numbers: the same seed always gives the same road
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function weightedPick(weights, r) {
  const entries = Object.entries(weights); let total = 0; for (const [, w] of entries) total += w;
  let x = r() * total; for (const [k, w] of entries) { if ((x -= w) < 0) return k; } return entries[0][0];
}
RRR.util = { clamp, lerp, easeIn, easeInOut, rand, pick, mulberry32, weightedPick };
})();
```

- [ ] **Step 4: Write `web/engine/registry.js`**

```js
'use strict';
// Track, city, skyline and style packs register here. resolve() merges a track with its city and style
// into the one definition the game reads; validate() checks every pack named in the manifest (packs.js).
// No DOM access outside load(), so it also runs under Node for tests.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});

class Registry {
  constructor(kind) { this.kind = kind; this.items = new Map(); }
  register(def) {
    if (!def || typeof def.id !== 'string') throw new Error(`${this.kind} pack has no id`);
    if (this.items.has(def.id)) throw new Error(`${this.kind} "${def.id}" is registered twice`);
    this.items.set(def.id, def);
  }
  get(id) { return this.items.get(id); }
  has(id) { return this.items.has(id); }
  ids() { return [...this.items.keys()]; }
}

// Pack shapes: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function', or a nested shape.
// A key ending in ? is optional. Keys that aren't listed are reported, which catches typos.
const ROAD = { lengths: 'array', pieces: 'array', lanes: 'string', junctions: 'boolean' };
const TRAFFIC = { countScale: 'number', oncoming: 'number', mix: 'object' };
const HANDLING = { topSpeed: 'number', driftScrub: 'number', driftExitBoost: 'number', slipstream: 'number' };
const SCORING = { driftCashPer100: 'number', passCash: 'number' };
const optional = shape => Object.fromEntries(Object.entries(shape).map(([k, v]) => [k.endsWith('?') ? k : k + '?', v]));
const SHAPES = {
  style: { id: 'string', label: 'string', road: ROAD, traffic: TRAFFIC, handling: HANDLING, scoring: SCORING },
  city: { id: 'string', hawkerCalls: 'array', curses: 'array', song: 'object', ads: 'array', busLooks: 'array' },
  skyline: { id: 'string', far: 'function', near: 'function' },
  track: {
    id: 'string', name: 'string', city: 'string', style: 'string', seed: 'number', length: 'number', laps: 'number',
    rivals: { count: 'number', skill: 'number' },
    traffic: { count: 'number', cows: 'number', dogs: 'number', ...optional(TRAFFIC) },
    'ambience?': 'boolean',
    look: {
      'night?': 'boolean', sky: 'array', sun: 'string', fog: 'string', sea: 'string', far: 'string', near: 'string', lights: 'number', density: 'number',
      light: { road: 'string', grass: 'string', rumble: 'string', lane: 'string', shoulder: 'string' },
      dark: { road: 'string', grass: 'string', rumble: 'string', shoulder: 'string' },
      buildings: 'array', scenery: 'object',
    },
    'road?': optional(ROAD), 'handling?': optional(HANDLING), 'scoring?': optional(SCORING),
  },
};
const typeOf = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
function check(value, shape, where, problems) {
  if (typeof shape === 'string') { if (typeOf(value) !== shape) problems.push(`${where}: expected ${shape}, got ${typeOf(value)}`); return; }
  if (typeOf(value) !== 'object') { problems.push(`${where}: expected object, got ${typeOf(value)}`); return; }
  const known = new Set();
  for (const [key, sub] of Object.entries(shape)) {
    const opt = key.endsWith('?'), name = opt ? key.slice(0, -1) : key;
    known.add(name);
    if (value[name] === undefined) { if (!opt) problems.push(`${where}.${name}: missing`); continue; }
    check(value[name], sub, `${where}.${name}`, problems);
  }
  for (const key of Object.keys(value)) if (!known.has(key)) problems.push(`${where}.${key}: unknown key`);
}
// a track's road and traffic after its style and its own overrides are merged: values the shapes can't express
function checkMerged(road, traffic, where, problems) {
  if (!['alternate', 'wide'].includes(road.lanes)) problems.push(`${where}.road.lanes: must be 'alternate' or 'wide'`);
  (Array.isArray(road.pieces) ? road.pieces : []).forEach((p, i) => {
    if (!p || !(RRR.PIECES || {})[p.kind]) problems.push(`${where}.road.pieces[${i}].kind: unknown piece "${p && p.kind}"`);
    else if (!(p.weight > 0)) problems.push(`${where}.road.pieces[${i}].weight: must be above 0`);
  });
  for (const type of Object.keys(typeOf(traffic.mix) === 'object' ? traffic.mix : {}))
    if (!(RRR.VEHICLES || {})[type]) problems.push(`${where}.traffic.mix.${type}: unknown vehicle`);
}

RRR.styles = new Registry('style');
RRR.cities = new Registry('city');
RRR.skylines = new Registry('skyline');
RRR.tracks = new Registry('track');
RRR.manifest = null;

// every pack file the manifest names, in load order
RRR.packFiles = m => [...m.styles.map(id => `styles/${id}.js`), ...m.cities.flatMap(id => [`cities/${id}/city.js`, `cities/${id}/skyline.js`]),
  ...m.tracks.map(id => `tracks/${id}/track.js`)];
// called by packs.js: remembers the manifest and, in a browser, loads every pack file (in order, before the
// scripts that follow packs.js)
RRR.load = manifest => {
  RRR.manifest = manifest;
  if (typeof document === 'undefined') return;
  for (const file of RRR.packFiles(manifest)) document.write(`<script src="${file}"><\/script>`);
};
RRR.order = () => RRR.manifest.tracks.slice();

// a list of problems, each naming the pack and field; empty when every pack in the manifest is sound
RRR.validate = () => {
  const m = RRR.manifest, problems = [];
  if (!m) return ['packs.js did not load: there is no manifest'];
  const each = (ids, registry, shape, file) => {
    for (const id of ids) {
      const pack = registry.get(id);
      if (!pack) problems.push(`${registry.kind} "${id}": not registered (${file(id)} is missing or failed to load)`);
      else check(pack, shape, `${registry.kind} "${id}"`, problems);
    }
  };
  each(m.styles, RRR.styles, SHAPES.style, id => `styles/${id}.js`);
  each(m.cities, RRR.cities, SHAPES.city, id => `cities/${id}/city.js`);
  each(m.cities, RRR.skylines, SHAPES.skyline, id => `cities/${id}/skyline.js`);
  each(m.tracks, RRR.tracks, SHAPES.track, id => `tracks/${id}/track.js`);
  for (const id of m.tracks) {
    const t = RRR.tracks.get(id), where = `track "${id}"`;
    if (!t) continue;
    if (typeof t.city === 'string' && !RRR.cities.has(t.city)) problems.push(`${where}.city: unknown city "${t.city}"`);
    const style = RRR.styles.get(t.style);
    if (typeof t.style === 'string' && !style) problems.push(`${where}.style: unknown style "${t.style}"`);
    if (style && typeOf(style.road) === 'object' && typeOf(style.traffic) === 'object')
      checkMerged({ ...style.road, ...t.road }, { ...style.traffic, ...t.traffic }, where, problems);
  }
  return problems;
};

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
// The definition the game reads: the track's own fields, its city pack and skyline, and the style's road,
// traffic, handling and scoring with the track's overrides applied per key. Frozen all the way down.
RRR.resolveDef = track => {
  const style = RRR.styles.get(track.style), city = RRR.cities.get(track.city);
  if (!style) throw new Error(`track "${track.id}": unknown style "${track.style}"`);
  if (!city) throw new Error(`track "${track.id}": unknown city "${track.city}"`);
  return deepFreeze({
    ...track, ambience: track.ambience !== false,
    city, skyline: RRR.skylines.get(track.city), styleLabel: style.label,
    road: { ...style.road, ...track.road }, traffic: { ...style.traffic, ...track.traffic },
    handling: { ...style.handling, ...track.handling }, scoring: { ...style.scoring, ...track.scoring },
  });
};
RRR.resolve = id => {
  const track = RRR.tracks.get(id);
  if (!track) throw new Error(`unknown track "${id}"`);
  return RRR.resolveDef(track);
};
})();
```

- [ ] **Step 5: Run the test**

Run: `node --test tests/registry.test.js`
Expected: `pass 18`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add web/engine/util.js web/engine/registry.js tests/registry.test.js
git commit -m "Engine: pack registry with validation and resolve

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Records and the selected race

Step 2 of the spec uses the bests; step 1 uses only `selectedTrackIndex`, which replaces the saved list index with a saved track id.

**Files:**
- Create: `web/engine/records.js`
- Test: `tests/records.test.js`

**Interfaces:**
- Consumes: a store with `get(key, fallback)` and `set(key, value)`. `web/game.js` already has one (`store`, which prefixes keys with `rrr_` and JSON-encodes values).
- Produces:
  - `new RRR.Records(store)` with `get(trackId)` returning `{ bestTime: number|null, bestDrift: number, bestPasses: number, wins: number }` and `submit(trackId, { time: number|null, rank, driftScore, passes })` returning `{ time: bool, drift: bool, passes: bool }`
  - `RRR.selectedTrackIndex(store, order)` returning an index into `order`

- [ ] **Step 1: Write the failing test, `tests/records.test.js`**

```js
'use strict';
const test = require('node:test'), assert = require('node:assert');
require('../web/engine/records.js');
const { Records, selectedTrackIndex } = globalThis.RRR;

// the game's store, backed by a plain object
const memoryStore = (data = {}) => ({ data, get: (k, d) => (k in data ? data[k] : d), set(k, v) { data[k] = v; } });
const ORDER = ['marine-drive', 'charminar-road', 'sea-link'];

test('a track with no races has empty records', () => {
  assert.deepStrictEqual(new Records(memoryStore()).get('sea-link'), { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 });
});
test('the first finish sets every best and says which were beaten', () => {
  const rec = new Records(memoryStore());
  assert.deepStrictEqual(rec.submit('sea-link', { time: 95.5, rank: 2, driftScore: 120, passes: 7 }), { time: true, drift: true, passes: true });
  assert.deepStrictEqual(rec.get('sea-link'), { bestTime: 95.5, bestDrift: 120, bestPasses: 7, wins: 0 });
});
test('only better results replace a best; a slower time does not', () => {
  const rec = new Records(memoryStore());
  rec.submit('sea-link', { time: 95.5, rank: 2, driftScore: 120, passes: 7 });
  assert.deepStrictEqual(rec.submit('sea-link', { time: 99, rank: 3, driftScore: 300, passes: 7 }), { time: false, drift: true, passes: false });
  assert.deepStrictEqual(rec.get('sea-link'), { bestTime: 95.5, bestDrift: 300, bestPasses: 7, wins: 0 });
});
test('finishing first counts a win', () => {
  const rec = new Records(memoryStore());
  rec.submit('sea-link', { time: 90, rank: 1, driftScore: 0, passes: 0 });
  rec.submit('sea-link', { time: 91, rank: 1, driftScore: 0, passes: 0 });
  assert.strictEqual(rec.get('sea-link').wins, 2);
});
test('a race you did not finish sets no best time', () => {
  const rec = new Records(memoryStore());
  assert.deepStrictEqual(rec.submit('sea-link', { time: null, rank: 6, driftScore: 40, passes: 2 }), { time: false, drift: true, passes: true });
  assert.strictEqual(rec.get('sea-link').bestTime, null);
});
test('tracks keep separate records', () => {
  const rec = new Records(memoryStore());
  rec.submit('sea-link', { time: 90, rank: 1, driftScore: 10, passes: 1 });
  assert.deepStrictEqual(rec.get('marine-drive'), { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 });
});
test('corrupt saved records are treated as empty', () => {
  for (const bad of ['oops', 7, null, [1, 2], { 'sea-link': 'oops' }])
    assert.deepStrictEqual(new Records(memoryStore({ records: bad })).get('sea-link'), { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 });
});

test('the selected race is read from the saved track id', () => {
  assert.strictEqual(selectedTrackIndex(memoryStore({ track: 'sea-link', level: 1 }), ORDER), 2);
});
test('an old save with a list index is used when no id is saved', () => {
  assert.strictEqual(selectedTrackIndex(memoryStore({ level: 1 }), ORDER), 1);
});
test('a fresh save, an unknown id or a bad index all select the first race', () => {
  assert.strictEqual(selectedTrackIndex(memoryStore(), ORDER), 0);
  assert.strictEqual(selectedTrackIndex(memoryStore({ track: 'gone' }), ORDER), 0);
  assert.strictEqual(selectedTrackIndex(memoryStore({ level: 9 }), ORDER), 0);
  assert.strictEqual(selectedTrackIndex(memoryStore({ level: 'x' }), ORDER), 0);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/records.test.js`
Expected: FAIL, `Cannot find module '.../web/engine/records.js'`.

- [ ] **Step 3: Write `web/engine/records.js`**

```js
'use strict';
// Per-track bests, and which race is selected. Storage is passed in (the game's `store`: get(key, fallback)
// and set(key, value)), so this runs under Node for tests.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const EMPTY = { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 };

class Records {
  constructor(store) { this.store = store; }
  all() { const v = this.store.get('records', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  get(trackId) { const r = this.all()[trackId]; return { ...EMPTY, ...(r && typeof r === 'object' ? r : {}) }; }
  // stats: { time, rank, driftScore, passes }; time is null when you didn't finish. Returns which bests were beaten.
  submit(trackId, stats) {
    const old = this.get(trackId), next = { ...old }, beaten = { time: false, drift: false, passes: false };
    if (stats.time != null && (old.bestTime === null || stats.time < old.bestTime)) { next.bestTime = stats.time; beaten.time = true; }
    if (stats.driftScore > old.bestDrift) { next.bestDrift = stats.driftScore; beaten.drift = true; }
    if (stats.passes > old.bestPasses) { next.bestPasses = stats.passes; beaten.passes = true; }
    if (stats.rank === 1) next.wins = old.wins + 1;
    this.store.set('records', { ...this.all(), [trackId]: next });
    return beaten;
  }
}
RRR.Records = Records;

// The selected race's place in the race order. It is saved as a track id ('track'); saves from before
// track packs hold a list index ('level'), which is used once and then replaced.
RRR.selectedTrackIndex = (store, order) => {
  const id = store.get('track', null);
  if (id !== null) return Math.max(0, order.indexOf(id));
  const old = store.get('level', 0);
  return Number.isInteger(old) && old >= 0 && old < order.length ? old : 0;
};
})();
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/records.test.js`
Expected: `pass 10`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add web/engine/records.js tests/records.test.js
git commit -m "Engine: per-track records and the selected race by id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Track builder

The code is today's `addSegment`, `addRoad`, `buildTrack`, `layoutLanes`, `layoutJunctions` and `placeSigns` (`web/game.js` lines 1794 to 1940 at `e274c43`), reshaped into a class that takes everything it needs as arguments. Two things are new: the road pieces come from the definition's recipe in place of hardcoded probabilities, and `lanes: 'wide'` and `junctions: false` are honoured.

**Files:**
- Create: `web/engine/track-builder.js`
- Create: `tests/build-world.js`
- Test: `tests/track-builder.test.js`

**Interfaces:**
- Consumes: `RRR.util` (Task 2).
- Produces:
  - `RRR.buildTrack({ def, round, constants: { SEG_LEN, RUMBLE_LEN, PLAYER_Z, GRID_GAP }, sprites, themeSprites: { buildings, billboards }, random? })` returning `{ segments, trackLength, startZ, junctions }`. `def` needs `seed`, `length`, `road`, `look.density`, `look.scenery`.
  - `RRR.road = { LANE_W, TAPER, JUNCTION_LEN, laneX(dir, lane) }`
  - `RRR.PIECES`: piece kind to function. Kinds: `straight`, `curve` (`curves`, `hills`), `sCurve` (`curve`, `hills`), `hill` (`hills`), `rollers`, `bumps`, `curveHill` (`curve`, `hill`).
  - From `tests/build-world.js`: `RRR`, `buildRoad(def, { in3D, round })`, `testDef({ road, traffic })`

- [ ] **Step 1: Write the test helper, `tests/build-world.js`**

```js
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
```

- [ ] **Step 2: Write the failing test, `tests/track-builder.test.js`**

```js
'use strict';
const test = require('node:test'), assert = require('node:assert');
const { RRR, buildRoad, testDef } = require('./build-world.js');

test('the road is at least as long as asked and comes back down to the starting height', () => {
  const { segments, trackLength } = buildRoad(testDef());
  assert.ok(segments.length >= 2600);
  assert.strictEqual(trackLength, segments.length * 200);
  assert.ok(Math.abs(segments[segments.length - 1].p2.world.y) < 10); // a few units off at most: the lap joins up
  assert.ok(segments.every((s, i) => s.index === i && (i === 0 || s.p1.world.y === segments[i - 1].p2.world.y)));
});
test('the start line sits just past the grid, under the arch', () => {
  const { segments, startZ } = buildRoad(testDef()), fs = Math.floor(startZ / 200);
  assert.strictEqual(segments[fs].finish, true);
  assert.strictEqual(segments[fs + 1].finish, 2);
  assert.ok(segments[fs].sprites.some(q => q.kind === 'arch'));
  assert.ok(buildRoad(testDef(), { in3D: false }).startZ < startZ); // the 2D grid is shorter
});
test('the same definition and tour always build the same road; a later tour builds another', () => {
  const curves = road => road.segments.map(s => s.curve).join();
  assert.strictEqual(curves(buildRoad(testDef())), curves(buildRoad(testDef())));
  assert.notStrictEqual(curves(buildRoad(testDef())), curves(buildRoad(testDef(), { round: 1 })));
});
test('lanes "alternate" narrows to two lanes in places and signs it', () => {
  const { segments } = buildRoad(testDef());
  assert.ok(segments.some(s => s.lanes === 2) && segments.some(s => s.lanes === 3));
  assert.ok(segments.some(s => s.sprites.some(q => q.img === 'sign:narrow')));
});
test('lanes "wide" keeps three lanes each way for the whole road', () => {
  const { segments } = buildRoad(testDef({ road: { lanes: 'wide' } }));
  assert.ok(segments.every(s => s.lanes === 3 && s.hw1 === s.hw2 && s.half === 3 * RRR.road.LANE_W));
  assert.ok(!segments.some(s => s.sprites.some(q => q.img === 'sign:narrow')));
});
test('junctions sit on flat, straight road and keep their stretch clear of scenery', () => {
  const { segments, junctions } = buildRoad(testDef());
  assert.ok(junctions.length > 0);
  for (const j of junctions) {
    for (let i = j.s0; i <= j.s1; i++) assert.ok(segments[i].junction === j && Math.abs(segments[i].curve) <= 0.5);
    assert.ok(segments.slice(j.s0, j.s1 + 1).every(s => s.sprites.every(q => !['building', 'temple', 'palm', 'tree', 'billboard', 'chai'].includes(q.kind))));
  }
});
test('junctions off builds a road with no junctions, signals or cops', () => {
  const { segments, junctions } = buildRoad(testDef({ road: { junctions: false } }));
  assert.strictEqual(junctions.length, 0);
  assert.ok(!segments.some(s => s.junction || s.clear || s.sprites.some(q => ['signal', 'cop'].includes(q.kind))));
});
test('a recipe of one piece kind lays only that piece between the start and the closing bend', () => {
  const { segments } = buildRoad(testDef({ road: { pieces: [{ kind: 'straight', weight: 1 }] } }));
  assert.ok(segments.slice(80, 2600).every(s => s.curve === 0 && s.p2.world.y === 0));
});
test('bends are no sharper than the recipe allows', () => {
  const gentle = { pieces: [{ kind: 'curve', weight: 1, curves: [1, 2, 3], hills: [0] }] };
  const { segments } = buildRoad(testDef({ road: gentle }));
  assert.ok(segments.slice(80, 2600).every(s => Math.abs(s.curve) <= 3));
  assert.ok(segments.some(s => Math.abs(s.curve) === 3));
});
test('solid roadside things block every segment they span', () => {
  const { segments } = buildRoad(testDef());
  const n = segments.findIndex(s => s.sprites.some(q => q.kind === 'building')), b = segments[n].sprites.find(q => q.kind === 'building');
  for (let k = 0; k < Math.ceil(b.len / 200); k++) assert.ok(segments[n + k].solids.includes(b));
  assert.ok(Math.abs(b.offset) > segments[n].half); // moved out past the road edge
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test tests/track-builder.test.js`
Expected: FAIL, `Cannot find module '.../web/engine/track-builder.js'`.

- [ ] **Step 4: Write `web/engine/track-builder.js`**

The order of calls to `R()` (through `this.R`, `this.sgn()`, `pick(..., R)` and `weightedPick(..., R)`) is what makes a seed give the same road. Copy it exactly.

```js
'use strict';
// Builds a track's road from its resolved definition: the road pieces from the style's recipe, then lanes,
// junctions, the start line, roadside scenery and signs. No DOM access and no state between builds.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const { easeIn, easeInOut, pick, mulberry32, weightedPick } = RRR.util;

// The road is two-way and we keep left: our carriageway is x < 0, oncoming traffic uses x > 0. x is in fixed
// units (1 = 2000 world units, one lane is LANE_W); stretches alternate between 4 lanes (2 each way) and
// 6 lanes (3 each way), with a tapered transition. Every segment carries its half-width at both ends
// (hw1, hw2), the wider of the two (half) and the lanes each way that are usable along all of it (lanes).
const LANE_W = 0.6, TAPER = 30, JUNCTION_LEN = 12;
const laneX = (dir, i) => -dir * (i + 0.5) * LANE_W;  // lane i counted from the centre line; dir +1 = our way

// The pieces a style's road recipe can ask for. Each lays itself with b.addRoad(enter, hold, leave, curve, hill);
// b.R is the track's seeded generator, b.sgn() a seeded -1 or 1, L the length drawn for this piece.
const PIECES = {
  straight: (b, p, L) => b.addRoad(L, L, L, 0, 0),
  curve: (b, p, L) => b.addRoad(L, L, L, b.sgn() * pick(p.curves, b.R), pick(p.hills, b.R)),
  sCurve: (b, p) => { const s = b.sgn(); b.addRoad(50, 50, 50, s * p.curve, 0); b.addRoad(50, 50, 50, -s * p.curve * 2, pick(p.hills, b.R)); b.addRoad(50, 50, 50, s * p.curve, 0); },
  hill: (b, p, L) => b.addRoad(L, L, L, 0, b.sgn() * pick(p.hills, b.R)),
  rollers: b => { for (let i = 0; i < 4; i++) b.addRoad(25, 25, 25, 0, (i % 2 ? -1 : 1) * 10); },
  bumps: b => { for (let i = 0; i < 8; i++) b.addRoad(10, 10, 10, 0, (i % 2 ? -1 : 1) * 3); },
  curveHill: (b, p, L) => b.addRoad(L, L, L, b.sgn() * p.curve, b.sgn() * p.hill),
};

class TrackBuilder {
  // def: resolved track definition · round: tour number (later tours reshuffle the road)
  // constants: { SEG_LEN, RUMBLE_LEN, PLAYER_Z, GRID_GAP } · sprites: the shared sprite table (SP)
  // themeSprites: { buildings, billboards } painted for this track · random: source for cosmetic offsets
  constructor({ def, round, constants, sprites, themeSprites, random = Math.random }) {
    Object.assign(this, { def, constants, SP: sprites, themeSprites });
    this.rand = (a, b) => a + random() * (b - a);
    this.R = mulberry32(def.seed + round * 1000);
    this.sgn = () => (this.R() < 0.5 ? -1 : 1);
    this.segments = []; this.junctions = [];
  }
  build() {
    const { SEG_LEN, PLAYER_Z, GRID_GAP } = this.constants, { segments } = this;
    this.layPieces();
    const trackLength = segments.length * SEG_LEN;
    this.layoutLanes();
    // start / finish
    const startZ = PLAYER_Z + 3 * GRID_GAP + 400, fs = Math.floor(startZ / SEG_LEN);
    segments[fs].finish = true; segments[fs + 1].finish = 2;
    segments[fs].sprites.push({ img: this.SP.arch, offset: 0, nw: segments[fs].half * 2 + 0.6, center: true, kind: 'arch' });
    if (this.def.road.junctions) this.layoutJunctions(fs);
    this.placeScenery();
    this.placeSigns(fs);
    this.settleRoadside();
    return { segments, trackLength, startZ, junctions: this.junctions };
  }

  lastY() { const s = this.segments; return s.length ? s[s.length - 1].p2.world.y : 0; }
  addSegment(curve, y) {
    const { SEG_LEN, RUMBLE_LEN } = this.constants, n = this.segments.length;
    this.segments.push({ index: n, curve, sprites: [], solids: [], cars: [], dark: Math.floor(n / RUMBLE_LEN) % 2 === 1,
      p1: { world: { x: 0, y: this.lastY(), z: n * SEG_LEN }, camera: {}, screen: {} },
      p2: { world: { x: 0, y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} } });
  }
  addRoad(enter, hold, leave, curve, y = 0) {
    const { SEG_LEN } = this.constants, startY = this.lastY(), endY = startY + Math.round(y) * SEG_LEN, total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }
  // a straight off the line, pieces drawn by weight until the road is long enough, then a long bend back
  // down to the starting height so the lap joins up
  layPieces() {
    const { road, length } = this.def, { R, segments } = this;
    let total = 0; for (const p of road.pieces) total += p.weight;
    this.addRoad(20, 40, 20, 0, 0);
    while (segments.length < length) {
      const t = R() * total, L = pick(road.lengths, R);
      let piece = road.pieces[road.pieces.length - 1], upTo = 0;
      for (const p of road.pieces) { upTo += p.weight; if (t < upTo) { piece = p; break; } }
      PIECES[piece.kind](this, piece, L);
    }
    this.addRoad(150, 150, 150, this.sgn() * 2, -this.lastY() / this.constants.SEG_LEN);
    this.addRoad(30, 30, 30, 0, 0);
  }
  layoutLanes() {
    const { R, segments } = this, N = segments.length, blocks = [];
    if (this.def.road.lanes === 'wide') blocks.push({ s: 0, per: 3 });
    else {
      let at = 0, per = 3;
      while (at < N - 120) { blocks.push({ s: at, per }); at += at === 0 ? 300 : 160 + Math.floor(R() * 220); per = per === 3 ? 2 : 3; }
      if (blocks[blocks.length - 1].per !== 3) blocks.pop(); // wrap back into the start stretch without a jump
    }
    const blockAt = k => { let b = 0; while (b + 1 < blocks.length && blocks[b + 1].s <= k) b++; return b; };
    const halfAtK = k => {
      const b = blockAt(k), cur = blocks[b], prev = blocks[b - 1];
      if (!prev || k - cur.s >= TAPER) return cur.per * LANE_W;
      return easeInOut(prev.per, cur.per, (k - cur.s) / TAPER) * LANE_W;
    };
    segments.forEach((seg, k) => {
      seg.hw1 = halfAtK(k); seg.hw2 = halfAtK(k + 1); seg.half = Math.max(seg.hw1, seg.hw2);
      const b = blockAt(k), cur = blocks[b], prev = blocks[b - 1];
      seg.lanes = prev && k - cur.s < TAPER ? Math.min(prev.per, cur.per) : cur.per;
    });
    segments.blocks = blocks;
  }
  layoutJunctions(fs) {
    const { R, segments, junctions } = this, { SEG_LEN } = this.constants;
    const N = segments.length, flat = (a, b) => Math.abs(segments[b].p1.world.y - segments[a].p1.world.y) < 300;
    let n = fs + 200;
    while (n < N - 200) {
      let found = -1;
      for (let k = n; k < Math.min(N - 200, n + 260) && found < 0; k++) {
        let ok = flat(k, k + JUNCTION_LEN);
        for (let i = k - 25; ok && i < k + JUNCTION_LEN + 25; i++) { const q = segments[i]; if (Math.abs(q.curve) > 0.5 || q.hw1 !== q.hw2 || q.finish) ok = false; }
        if (ok) found = k;
      }
      if (found < 0) { n += 260; continue; }
      const j = { i: junctions.length, s0: found, s1: found + JUNCTION_LEN - 1, z0: found * SEG_LEN, z1: (found + JUNCTION_LEN) * SEG_LEN,
        phase: R() * 22, cop: junctions.length % 2 === 0, busy: false, spawn: [0, 0], fined: false };
      j.zc = (j.z0 + j.z1) / 2; j.half = segments[found].half;
      for (let i = found; i <= j.s1; i++) segments[i].junction = j;
      for (let i = found - 5; i <= j.s1 + 5; i++) segments[i].clear = true;
      junctions.push(j);
      n = found + JUNCTION_LEN + 260 + Math.floor(R() * 200);
    }
  }
  // buildings and temples stand in a row along each side and never overlap (they're solid 3D boxes);
  // trees, palms, hoardings and chai stalls go in front of them, nearer the road
  placeScenery() {
    const { R, SP, rand, segments, themeSprites } = this, { SEG_LEN } = this.constants, { density, scenery } = this.def.look;
    const busyUntil = { '-1': 0, '1': 0 };
    for (let n = 30; n < segments.length; n++) {
      const seg = segments[n];
      if (seg.clear) continue; // junction: the cross road runs through here
      if (n % 18 === 0) { const side = (n / 18) % 2 ? 1 : -1; seg.sprites.push({ img: side < 0 ? SP.lampL : SP.lampR, offset: side * 1.12, nw: 0.13, solid: true, kind: 'lamp' }); }
      if (n % 150 === 0) seg.sprites.push({ img: SP.milestone, offset: pick([-1, 1], R) * 1.1, nw: 0.08, solid: true, kind: 'milestone' });
      if (R() < density) {
        const side = R() < 0.5 ? -1 : 1;
        let kind = weightedPick(scenery, R);
        if ((kind === 'building' || kind === 'temple') && (n < busyUntil[side] || segments.slice(n, n + 9).some(q => q.clear))) kind = scenery.palm ? 'palm' : 'tree';
        let s;
        if (kind === 'palm') s = { img: side < 0 ? SP.palm : SP.palmF, offset: side * rand(1.25, 1.5), nw: 0.45, solid: true };
        else if (kind === 'tree') s = { img: pick(SP.trees, R), offset: side * rand(1.25, 1.4), nw: 0.8, solid: true };
        else if (kind === 'building') { s = { img: pick(themeSprites.buildings, R), offset: side * rand(2.05, 2.35), nw: 1.1, solid: true, len: 1200 + Math.floor(R() * 400) }; busyUntil[side] = n + Math.ceil(s.len / SEG_LEN) + 1; }
        else if (kind === 'billboard') s = { img: pick(themeSprites.billboards, R), offset: side * rand(1.2, 1.4), nw: 0.95, solid: true };
        else if (kind === 'temple') { s = { img: SP.temple, offset: side * rand(2.1, 2.4), nw: 1.1, solid: true }; busyUntil[side] = n + 12; }
        else s = { img: SP.chai, offset: side * rand(1.2, 1.35), nw: 0.6, solid: true };
        s.kind = kind;
        seg.sprites.push(s);
      }
    }
  }
  // signals, the cop's post and the roadside signs (offsets are for a road edge at 1; moved out later)
  placeSigns(fs) {
    const { R, SP, segments } = this, N = segments.length;
    const put = (n, s) => { n = ((n % N) + N) % N; if (!segments[n].clear || s.kind !== 'sign') segments[n].sprites.push(s); };
    const sign = (n, name, side = -1) => put(n, { img: SP.signs[name], offset: side * 1.3, nw: 0.3, solid: true, kind: 'sign', facing: side < 0 ? 1 : -1 });
    for (const j of this.junctions) {
      put(j.s0 - 1, { img: SP.signal, offset: -1.22, nw: 0.2, solid: true, kind: 'signal', junction: j, facing: 1 });
      put(j.s1 + 1, { img: SP.signal, offset: 1.22, nw: 0.2, solid: true, kind: 'signal', junction: j, facing: -1 });
      if (j.cop) put(j.s0 - 2, { img: SP.cop, offset: -1.55, nw: 0.22, solid: false, kind: 'cop', junction: j });
      sign(j.s0 - 70, 'signal'); sign(j.s1 + 70, 'signal', 1);
    }
    for (const b of segments.blocks) if (b.s > 0 && b.per === 2) { sign(b.s - 60, 'narrow'); sign(b.s + TAPER + 60, 'narrow', 1); }
    for (let n = fs + 60; n < N - 60; n += 90 + Math.floor(R() * 160)) {
      if (segments[n].clear) continue;
      sign(n, pick(['limit40', 'limit50', 'limit60', 'limit50', 'keepleft', 'nohorn'], R), R() < 0.75 ? -1 : 1);
    }
  }
  settleRoadside() {
    const { segments } = this, { SEG_LEN } = this.constants;
    // everything by the roadside was placed for a road edge at 1: move it out to this stretch's edge
    segments.forEach((seg, n) => {
      for (const s of seg.sprites) {
        if (s.center || s.edgeDone) continue;
        const span = s.kind === 'building' ? Math.ceil((s.len || 1400) / SEG_LEN) : 1;
        let h = 0; for (let k = 0; k <= span; k++) h = Math.max(h, segments[(n + k) % segments.length].half);
        s.offset += Math.sign(s.offset) * (h - 1); s.edgeDone = true;
      }
    });
    // solid things block every segment they span (a building is several segments long)
    segments.forEach((seg, n) => {
      for (const s of seg.sprites) if (s.solid) {
        const span = s.kind === 'building' ? Math.ceil(s.len / SEG_LEN) : 1;
        for (let k = 0; k < span; k++) segments[(n + k) % segments.length].solids.push(s);
      }
    });
  }
}

RRR.road = { LANE_W, TAPER, JUNCTION_LEN, laneX };
RRR.PIECES = PIECES;
RRR.buildTrack = opts => new TrackBuilder(opts).build();
})();
```

- [ ] **Step 5: Run the test**

Run: `node --test tests/track-builder.test.js`
Expected: `pass 10`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add web/engine/track-builder.js tests/build-world.js tests/track-builder.test.js
git commit -m "Engine: track builder driven by a road recipe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Traffic spawner

The code is the traffic, cow and dog setup from `setupRace` (`web/game.js` lines 1995 to 2024 at `e274c43`) and `busLookFor` (line 1731), with the mix, the oncoming share and the bus liveries read from the definition.

**Files:**
- Create: `web/engine/traffic-spawner.js`
- Modify: `tests/build-world.js` (replace the whole file)
- Test: `tests/traffic-spawner.test.js`

**Interfaces:**
- Consumes: `RRR.util`, `RRR.road.laneX` (Task 4).
- Produces:
  - `RRR.spawnTraffic({ def, round, world: { startZ, trackLength, halfAt(z), findSegment(z) }, sprites, looks: { CAR_LOOKS, TRACTOR_LOOKS, BIKE_CALM, BIKE_RASH }, maxSpeed, random? })` returning the traffic array. `def` needs `seed`, `traffic: { count, cows, dogs, countScale, oncoming, mix }`, `city.busLooks`.
  - `RRR.VEHICLES`: vehicle type to maker. Types: `car`, `bike`, `bus`, `truck`, `tractor`.
  - `RRR.busLook(busLooks, r)` returning one livery, sometimes with `crowd: true`
  - From `tests/build-world.js`: adds `buildWorld(def, { in3D, round })` returning `{ road, traffic }`

- [ ] **Step 1: Replace `tests/build-world.js` with the version that also spawns traffic**

```js
'use strict';
// Builds a road and its traffic in Node from a definition, with stub sprites and the game's own constants.
const path = require('path');
for (const f of ['util', 'registry', 'track-builder', 'traffic-spawner']) require(path.join(__dirname, '..', 'web', 'engine', `${f}.js`));
const RRR = globalThis.RRR;
const { stubSprites, stubThemeSprites } = require('./stub-sprites.js');

const SEG_LEN = 200, CAM_H = 1000, FOV = 100, TUK_LEN = 1060, MAX_SPEED = SEG_LEN * 60;
const PLAYER_Z = CAM_H * (1 / Math.tan((FOV / 2) * Math.PI / 180));
const SHARED_BILLBOARDS = 5; // BILLBOARDS in game.js: hoardings every city has
// the vehicle catalogue lives in game.js; the spawner only needs how many looks there are and a few fields
const LOOKS = {
  CAR_LOOKS: Array.from({ length: 21 }, (_, i) => ({ model: `m${i}`, nw: 0.3, len: 1500, s: [0.3, 0.5], label: 'CAR' })),
  TRACTOR_LOOKS: [{ crop: 'cane' }, { crop: 'hay' }, { crop: 'hay' }, { crop: 'cane' }],
  BIKE_CALM: [0, 1, 2, 3, 4, 5], BIKE_RASH: [6, 7, 8],
};

// in3D: the starting grid is longer in 3D, which moves the start line · round: the tour number
function buildRoad(def, { in3D = true, round = 0 } = {}) {
  return RRR.buildTrack({ def, round, sprites: stubSprites(),
    constants: { SEG_LEN, RUMBLE_LEN: 3, PLAYER_Z, GRID_GAP: in3D ? TUK_LEN + 350 : 520 },
    themeSprites: stubThemeSprites(def.look.buildings.length, SHARED_BILLBOARDS + def.city.ads.length) });
}
function buildWorld(def, { in3D = true, round = 0 } = {}) {
  const road = buildRoad(def, { in3D, round }), { segments, trackLength, startZ } = road;
  const findSegment = z => segments[Math.floor(((z % trackLength) + trackLength) % trackLength / SEG_LEN) % segments.length];
  const traffic = RRR.spawnTraffic({ def, round, sprites: stubSprites(), looks: LOOKS, maxSpeed: MAX_SPEED,
    world: { startZ, trackLength, findSegment, halfAt: z => findSegment(z).half } });
  return { road, traffic };
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
module.exports = { RRR, buildRoad, buildWorld, testDef };
```

- [ ] **Step 2: Write the failing test, `tests/traffic-spawner.test.js`**

```js
'use strict';
const test = require('node:test'), assert = require('node:assert');
const { buildWorld, testDef } = require('./build-world.js');

const count = (traffic, f) => traffic.filter(f).length;
const vehicle = c => c.type !== 'cow' && c.type !== 'dog';

test('same-way vehicles, oncoming vehicles, cows and dogs come in the configured numbers', () => {
  const { traffic } = buildWorld(testDef());
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === 1), 30);
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === -1), 24); // 30 × 0.8
  assert.strictEqual(count(traffic, c => c.type === 'cow'), 4);
  assert.strictEqual(count(traffic, c => c.type === 'dog'), 6);
});
test('countScale scales same-way traffic, and oncoming follows it', () => {
  const { traffic } = buildWorld(testDef({ traffic: { countScale: 1.6, oncoming: 0.5 } }));
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === 1), 48);
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === -1), 24);
});
test('vehicle types come in exactly the mix\'s proportions', () => {
  const { traffic } = buildWorld(testDef({ traffic: { count: 24, mix: { car: 3, bus: 1 } } }));
  const sameWay = traffic.filter(c => vehicle(c) && c.dir === 1);
  assert.strictEqual(count(sameWay, c => c.type === 'car'), 18);
  assert.strictEqual(count(sameWay, c => c.type === 'bus'), 6);
});
test('vehicles sit in a lane on their own side, clear of the starting grid', () => {
  const { road, traffic } = buildWorld(testDef());
  for (const c of traffic.filter(vehicle)) {
    assert.ok(c.dir === 1 ? c.x < 0 : c.x > 0);
    assert.ok(c.lane >= 0 && c.lane < 3);
    assert.ok(c.z >= road.startZ + 7000 && c.z <= road.trackLength - 6000 + road.startZ);
    assert.ok(c.speed > 0);
  }
});
test('buses wear one of the city\'s liveries', () => {
  const { traffic } = buildWorld(testDef());
  const buses = traffic.filter(c => c.type === 'bus');
  assert.ok(buses.length > 0 && buses.every(b => b.look.op === 'B.E.S.T.' && ['1', '83'].includes(b.look.route)));
});
test('the same definition and tour always spawn the same traffic', () => {
  const spots = w => w.traffic.map(c => `${c.type}@${c.z}`).join();
  assert.strictEqual(spots(buildWorld(testDef())), spots(buildWorld(testDef())));
  assert.notStrictEqual(spots(buildWorld(testDef())), spots(buildWorld(testDef(), { round: 1 })));
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test tests/traffic-spawner.test.js`
Expected: FAIL, `Cannot find module '.../web/engine/traffic-spawner.js'`.

- [ ] **Step 4: Write `web/engine/traffic-spawner.js`**

As in the builder, the order of calls to `tr()` is fixed. In `addDog`, the object literal's fields are evaluated top to bottom (`vx`, then `t`, then `look`): keep that order.

```js
'use strict';
// Fills a built road with traffic, cows and dogs from the definition's traffic profile. No DOM access.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const { pick, mulberry32 } = RRR.util;

// most buses are packed (people at every window, hanging off the footboard); r picks the livery
const busLook = (list, r) => { const l = list[Math.floor(r() * list.length)]; return r() < 0.7 ? { ...l, crowd: true } : l; };

// What each vehicle type in a traffic mix looks like and how fast it goes (s: share of top speed).
// s.tr is the track's seeded traffic generator; draws happen in a fixed order so a seed always gives the same road.
const VEHICLES = {
  car: s => { const i = Math.floor(s.tr() * s.looks.CAR_LOOKS.length); return { ...s.looks.CAR_LOOKS[i], look: s.looks.CAR_LOOKS[i], img: s.SP.carLooks[i] }; },
  bike: s => { const rash = s.tr() < 0.3; return { img: s.SP.bikes[pick(rash ? s.looks.BIKE_RASH : s.looks.BIKE_CALM, s.tr)], rash, nw: 0.17, len: 860, s: rash ? [0.6, 0.78] : [0.38, 0.55], label: 'BIKE' }; },
  bus: s => ({ img: s.SP.bus, look: busLook(s.def.city.busLooks, s.tr), nw: 0.56, len: 3200, s: [0.28, 0.38], label: 'BUS' }),
  truck: s => ({ img: s.SP.truck, nw: 0.56, len: 2800, s: [0.25, 0.35], label: 'TRUCK' }),
  tractor: s => { const i = Math.floor(s.tr() * s.looks.TRACTOR_LOOKS.length), look = s.looks.TRACTOR_LOOKS[i]; return { look, img: s.SP.tractors[i], nw: look.crop === 'hay' ? 0.65 : 0.56, len: 3800, s: [0.14, 0.2], label: 'TRACTOR' }; },
};

class TrafficSpawner {
  // def: resolved track definition · round: tour number · world: { startZ, trackLength, halfAt, findSegment }
  // sprites: the shared sprite table (SP) · looks: { CAR_LOOKS, TRACTOR_LOOKS, BIKE_CALM, BIKE_RASH }
  // maxSpeed: the auto's top speed in track units · random: source for cosmetic offsets and speeds
  constructor({ def, round, world, sprites, looks, maxSpeed, random = Math.random }) {
    Object.assign(this, { def, world, SP: sprites, looks, maxSpeed });
    this.rand = (a, b) => a + random() * (b - a);
    this.tr = mulberry32(def.seed + 99 + round);
    this.traffic = [];
  }
  spawn() {
    const { count, countScale, oncoming, cows, dogs } = this.def.traffic, sameWay = Math.round(count * countScale);
    for (const type of this.deck(sameWay)) this.addVehicle(type, 1);
    for (const type of this.deck(Math.round(sameWay * oncoming))) this.addVehicle(type, -1);
    for (let i = 0; i < cows; i++) this.addCow();
    for (let i = 0; i < dogs; i++) this.addDog();
    return this.traffic;
  }
  // n vehicle types in exactly the mix's proportions, shuffled (random picks can come out lopsided on a track)
  deck(n) {
    const pattern = Object.entries(this.def.traffic.mix).flatMap(([type, share]) => Array(share).fill(type));
    const d = Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.tr() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  roadSpot() { return this.world.startZ + 7000 + this.tr() * (this.world.trackLength - 13000); } // clear of the starting grid (front and back)
  addVehicle(type, dir) {
    const { tr, rand, world } = this, z = this.roadSpot(), v = VEHICLES[type](this);
    const lanes = world.findSegment(z).lanes, lane = type === 'car' || type === 'bike' ? Math.floor(tr() * lanes) : lanes - 1;
    this.traffic.push({ type, dir, z, lane, x: RRR.road.laneX(dir, lane), img: v.img, look: v.look, rash: v.rash, nw: v.nw, len: v.len, speed: this.maxSpeed * rand(v.s[0], v.s[1]), label: v.label });
  }
  addCow() {
    const { tr, rand } = this, z = this.roadSpot(), h = this.world.halfAt(z);
    this.traffic.push({ type: 'cow', z, x: rand(-h - 0.2, h + 0.2), speed: 0, vx: pick([-1, 1], tr) * rand(0.05, 0.12), nw: 0.42, len: 380, pause: 0, scared: 0, label: 'HOLY COW' });
  }
  addDog() {
    const { tr, rand, world, SP } = this, z = world.startZ + 3000 + tr() * (world.trackLength - 8000), r = tr();
    const mode = r < 0.28 ? 'sleep' : r < 0.8 ? 'sit' : 'cross';
    const h = world.halfAt(z), x = mode === 'sleep' ? rand(-h + 0.1, h - 0.1) : mode === 'sit' ? pick([-1, 1], tr) * (h + rand(0.15, 0.5)) : rand(-h - 0.2, h + 0.2);
    this.traffic.push({ type: 'dog', label: 'DOG', z, x, speed: 0, vx: mode === 'cross' ? pick([-1, 1], tr) * rand(0.25, 0.4) : 0,
      mode, t: tr() * 3, look: SP.dogs[Math.floor(tr() * SP.dogs.length)], tried: false, barkT: 0, img: null, nw: 0.2, len: 170 });
  }
}

RRR.VEHICLES = VEHICLES;
RRR.busLook = busLook;
RRR.spawnTraffic = opts => new TrafficSpawner(opts).spawn();
})();
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/traffic-spawner.test.js tests/track-builder.test.js`
Expected: `pass 16`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add web/engine/traffic-spawner.js tests/build-world.js tests/traffic-spawner.test.js
git commit -m "Engine: traffic spawner driven by a traffic profile

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The packs

Writes the classic style by hand and generates the track, city and skyline packs from the old tables with a one-off script, so no value is retyped. Three tests guard the result: the packs validate and carry exactly the old data, every skyline painter runs with only the paint kit, and the classic style rebuilds all 7 roads and their traffic exactly.

**Files:**
- Create: `web/styles/classic.js`
- Create (generated, then reviewed): `web/packs.js`, `web/tracks/<id>/track.js` (7), `web/cities/<id>/city.js` (4), `web/cities/<id>/skyline.js` (4)
- Create: `tests/load-game.js`
- Test: `tests/packs.test.js`, `tests/skylines.test.js`, `tests/golden-roads.test.js`
- Temporary, not committed: `make-packs.js`

**Interfaces:**
- Consumes: everything from Tasks 1 to 5.
- Produces:
  - Registered packs: style `classic`; cities and skylines `mumbai`, `hyderabad`, `delhi`, `chennai`; the 7 tracks.
  - A city pack: `{ id, hawkerCalls: [string], curses: [string], song: { bpm, swing, lead, drums, melody }, ads: [[line1, line2]], busLooks: [livery] }`
  - A skyline pack: `{ id, far(paint, look, seed), near(paint, look, seed) }`, each returning a canvas. `paint` is `{ mk, ell, rr, shade, lerp, mulberry32, LAYER_W, litWindows, fillerBlocks, trees, waterBand, cutOut, archPath, onion }`.
  - `tests/load-game.js`: exports `RRR` with the engine and every shipped pack loaded.

- [ ] **Step 1: Write `tests/load-game.js`**

```js
'use strict';
// Loads the engine and every pack named in web/packs.js into this Node process, the way index.html does
// in a browser. Returns the shared RRR namespace.
const path = require('path');
const web = f => path.join(__dirname, '..', 'web', f);
for (const f of ['engine/util.js', 'engine/registry.js', 'engine/track-builder.js', 'engine/traffic-spawner.js', 'engine/records.js', 'packs.js']) require(web(f));
for (const f of globalThis.RRR.packFiles(globalThis.RRR.manifest)) require(web(f));
module.exports = globalThis.RRR;
```

- [ ] **Step 2: Write the failing tests**

`tests/packs.test.js`:
```js
'use strict';
// The shipped packs: they validate, and they carry exactly the data the game had before track packs
// (tests/golden/legacy-data.json, captured by tests/golden/capture.js).
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');
const legacy = require('./golden/legacy-data.json');

test('every shipped pack validates', () => {
  assert.deepStrictEqual(RRR.validate(), []);
});
test('race order is unchanged', () => {
  assert.deepStrictEqual(RRR.order(), legacy.TRACKS.map(t => legacy.IDS[t.theme]));
});
for (const old of legacy.TRACKS) {
  const id = legacy.IDS[old.theme];
  test(`${id} carries its old numbers and look`, () => {
    const t = RRR.tracks.get(id), { city, ads, ambience, ...look } = legacy.THEMES[old.theme];
    assert.strictEqual(t.name, old.name);
    assert.strictEqual(t.city, city);
    assert.deepStrictEqual([t.seed, t.length, t.laps, t.rivals.count, t.rivals.skill, t.traffic.count, t.traffic.cows, t.traffic.dogs],
      [old.seed, old.length, old.laps, old.rivals, old.skill, old.traffic, old.cows, old.dogs]);
    assert.deepStrictEqual(t.look, look);
    assert.strictEqual(t.ambience, ambience);
    assert.deepStrictEqual(RRR.cities.get(city).ads, ads);
  });
}
for (const id of Object.keys(legacy.SONGS)) {
  test(`${id} carries its old calls, curses, song and bus liveries`, () => {
    const c = RRR.cities.get(id);
    assert.deepStrictEqual(c.hawkerCalls, legacy.HAWKER_CALLS[id]);
    assert.deepStrictEqual(c.curses, legacy.CURSES[id]);
    assert.deepStrictEqual(c.song, legacy.SONGS[id]);
    assert.deepStrictEqual(c.busLooks, legacy.BUS_LOOKS[id]);
  });
}
```

`tests/skylines.test.js`:
```js
'use strict';
// Every city's skyline painters run with nothing but the paint kit game.js passes in. The kit here is a
// stand-in that draws nothing; a painter reaching for anything outside the kit throws a ReferenceError.
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');

// a 2D context where every method does nothing and every property can be set
const blankContext = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })), set: (o, k, v) => { o[k] = v; return true; } });
const kit = () => {
  const noop = () => {};
  return { mk: (w, h) => ({ width: w, height: h, getContext: blankContext }), ell: noop, rr: noop, shade: c => c, lerp: (a, b, p) => a + (b - a) * p,
    mulberry32: RRR.util.mulberry32, LAYER_W: 1920, litWindows: noop, fillerBlocks: noop, trees: noop, waterBand: noop, cutOut: noop, archPath: noop, onion: noop };
};

for (const id of RRR.manifest.cities) for (const layer of ['far', 'near']) {
  test(`${id} ${layer} skyline paints a full-width layer from the kit alone`, () => {
    const look = RRR.resolve(RRR.order().find(t => RRR.tracks.get(t).city === id)).look;
    const canvas = RRR.skylines.get(id)[layer](kit(), look, 11);
    assert.strictEqual(canvas.width, 1920);
    assert.ok(canvas.height > 0);
  });
}
```

`tests/golden-roads.test.js`:
```js
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
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --test tests/packs.test.js tests/skylines.test.js tests/golden-roads.test.js`
Expected: all three FAIL with `Cannot find module '.../web/packs.js'`.

- [ ] **Step 4: Write `web/styles/classic.js`**

```js
'use strict';
// Classic: the original Rickshaw Rumble mix of straights, bends, hills and bumps, with everyday traffic.
RRR.styles.register({
  id: 'classic',
  label: 'CLASSIC',
  road: {
    lengths: [25, 50, 75],               // a piece's enter / hold / leave length, in segments
    pieces: [                            // drawn by weight until the road is long enough
      { kind: 'straight', weight: 16 },
      { kind: 'curve', weight: 26, curves: [2, 4, 6], hills: [0, 0, 20, -20, 40] },
      { kind: 'sCurve', weight: 14, curve: 2, hills: [0, 20, -20] },   // curve, twice as sharp back, curve
      { kind: 'hill', weight: 12, hills: [20, 40, 60] },
      { kind: 'rollers', weight: 12 },
      { kind: 'bumps', weight: 10 },
      { kind: 'curveHill', weight: 10, curve: 6, hill: 30 },
    ],
    lanes: 'alternate',                  // 'alternate': 3 and 2 lanes each way in turn · 'wide': always 3
    junctions: true,
  },
  traffic: {
    countScale: 1,                       // same-way vehicles = the track's count × this
    oncoming: 0.8,                       // oncoming vehicles = same-way vehicles × this
    mix: { car: 4, bike: 4, bus: 2, truck: 1, tractor: 1 },
  },
  handling: { topSpeed: 1, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 0, passCash: 0 },
});
```

- [ ] **Step 5: Write the one-off generator, `make-packs.js`, at the repo root**

```js
'use strict';
// One-off: writes the track, city and skyline packs and the manifest from the game's tables as they were
// before track packs (commit e274c43), so nothing is retyped. Run once from the repo root:
//   node make-packs.js
// Not committed: the pack files it writes are the source of truth from here on.
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const { legacy, IDS } = require('./tests/golden/capture.js');
const { TRACKS, THEMES, HAWKER_CALLS, CURSES, SONGS, BUS_LOOKS } = legacy;
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// ---- a JS literal the way the game writes them: single quotes, bare keys, arrays and objects on one line
const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const js = v => Array.isArray(v) ? `[${v.map(js).join(', ')}]` : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k)}: ${js(x)}`).join(', ')} }` : typeof v === 'string' ? q(v) : String(v);

// ---- tracks
const NOTE = { marine: "sunset over the Queen's Necklace", sealink: 'night on the bridge, the sea either side', express: 'hazy afternoon traffic', juhu: 'bright morning by the beach',
  hyderabad: 'golden hour over the old city and Hussain Sagar', delhi: 'hazy winter morning', chennai: 'blazing midday on the Marina' };
for (const t of TRACKS) {
  const th = THEMES[t.theme], id = IDS[t.theme];
  const title = t.name.split(' · ').map(p => p.split(/([ -])/).map(x => x.length > 1 ? x[0] + x.slice(1).toLowerCase() : x).join('')).join(' · ');
  w(`web/tracks/${id}/track.js`, `'use strict';
// ${title}: ${NOTE[t.theme]}
RRR.tracks.register({
  id: ${q(id)},
  name: ${q(t.name)},
  city: ${q(th.city)},
  style: 'classic',
  seed: ${t.seed}, length: ${t.length}, laps: ${t.laps},
  rivals: { count: ${t.rivals}, skill: ${t.skill} },
  traffic: { count: ${t.traffic}, cows: ${t.cows}, dogs: ${t.dogs} },
${th.ambience === false ? '  ambience: false,                        // no street recording out here\n' : ''}  look: {
${th.night ? '    night: true,\n' : ''}    sky: ${js(th.sky)}, sun: ${q(th.sun)}, fog: ${q(th.fog)}, sea: ${q(th.sea)},
    far: ${q(th.far)}, near: ${q(th.near)}, lights: ${th.lights}, density: ${th.density},
    light: ${js(th.light)},
    dark: ${js(th.dark)},
    buildings: ${js(th.buildings)},
    scenery: ${js(th.scenery)},
  },
});
`);
}
// ---- cities
const CITY_NOTE = { mumbai: 'Bambaiya street talk and a filmi dholak groove', hyderabad: 'Dakhni street talk and a qawwali: tabla, claps, harmonium in Kafi',
  delhi: 'Dilli street talk and bhangra: dhol chaal and a tumbi riff', chennai: 'Tamil street talk and a kuthu beat with a reed tune in Mohanam' };
const cityAds = c => Object.values(THEMES).find(t => t.city === c).ads;
for (const c of Object.keys(SONGS)) {
  const s = SONGS[c], name = c[0].toUpperCase() + c.slice(1);
  w(`web/cities/${c}/city.js`, `'use strict';
// ${name}: what every race in the city shares. ${CITY_NOTE[c]}.
RRR.cities.register({
  id: ${q(c)},
  // roadside hawkers call out to passing autos in the city's street lingo
  hawkerCalls: ${js(HAWKER_CALLS[c])},
  // what a driver shouts after taking a lathi hit
  curses: ${js(CURSES[c])},
  // background music, generated live. Pitches are semitones above Sa (D3); the melody loops every 32
  // steps, drum patterns every 16
  song: { bpm: ${s.bpm}, swing: ${s.swing}, lead: ${q(s.lead)},
    drums: ${js(s.drums)},
    melody: ${js(s.melody)} },
  // billboard ads (two lines each), alongside the hoardings every city has
  ads: ${js(cityAds(c))},
  // 1990s city buses: the transport undertaking's livery and well-known routes of the time
  // (destination boards read "route  destination")
  busLooks: [
${BUS_LOOKS[c].map(l => `    ${js(l)},`).join('\n')}
  ],
});
`);
}

// ---- skylines: the painters move out of game.js as they are, drawing with a kit passed in (paint)
const src = execSync('git show e274c43:web/game.js', { maxBuffer: 1 << 26 }).toString().split('\n');
const KIT = ['mk', 'ell', 'rr', 'shade', 'lerp', 'mulberry32', 'LAYER_W', 'litWindows', 'fillerBlocks', 'trees', 'waterBand', 'cutOut', 'archPath', 'onion'];
// [first line of the painter's leading comment or its `function` line, its closing brace]
const CITIES = {
  mumbai: { title: 'Mumbai: Imperial towers, World One, Antilia and the Sea Link far; Gateway of India, the Taj and Rajabai Tower near', far: [1364, 1403], near: [1404, 1449] },
  hyderabad: { title: src[1471].replace('// ---- ', ''), far: [1473, 1488], near: [1489, 1513] },
  delhi: { title: src[1514].replace('// ---- ', ''), far: [1516, 1535], near: [1536, 1565] },
  chennai: { title: src[1566].replace('// ---- ', ''), far: [1568, 1584], near: [1585, 1621] },
};
function painter(name, [a, b]) {
  const body = src.slice(a - 1, b), at = body.findIndex(l => l.startsWith('function '));
  const used = KIT.filter(k => new RegExp(`\\b${k}\\b`).test(body.slice(at + 1).join('\n')));
  return [...body.slice(0, at).map(l => '  ' + l), `  ${name}(paint, t, seed) {`, `    const { ${used.join(', ')} } = paint;`,
    ...body.slice(at + 1, -1).map(l => '  ' + l), '  },'].join('\n');
}
for (const [id, c] of Object.entries(CITIES)) {
  w(`web/cities/${id}/skyline.js`, `'use strict';
// ${c.title}.
// Two parallax layers, each tiling horizontally at LAYER_W px. The painters draw with the kit game.js
// passes in (paint); t is the track's look and seed its road seed.
RRR.skylines.register({
  id: '${id}',
${painter('far', c.far)}
${painter('near', c.near)}
});
`);
}

// ---- the manifest
w(`web/packs.js`, `'use strict';
// The manifest: every style, city and track the game ships, with tracks in race order.
// To add a track: make web/tracks/<id>/track.js and add its id here.
RRR.load({
  styles: ['classic'],
  cities: ['mumbai', 'hyderabad', 'delhi', 'chennai'],
  tracks: [${TRACKS.map(t => q(IDS[t.theme])).join(', ')}],
});
`);
```

- [ ] **Step 6: Generate the packs and remove the generator**

Run:
```bash
node make-packs.js && rm make-packs.js && ls web/tracks web/cities && cat web/packs.js
```
Expected: 7 folders under `web/tracks`, 4 under `web/cities`, and a manifest listing `styles: ['classic']`, the 4 cities, and the 7 tracks in race order.

- [ ] **Step 7: Read what was generated**

Open `web/tracks/sea-link/track.js`. It must read:
```js
'use strict';
// Mumbai · Bandra-Worli Sea Link: night on the bridge, the sea either side
RRR.tracks.register({
  id: 'sea-link',
  name: 'MUMBAI · BANDRA-WORLI SEA LINK',
  city: 'mumbai',
  style: 'classic',
  seed: 27, length: 3000, laps: 1,
  rivals: { count: 6, skill: 0.9 },
  traffic: { count: 46, cows: 0, dogs: 0 },
  ambience: false,                        // no street recording out here
  look: {
    night: true,
    sky: ['#050816', '#141c3d', '#2c3a6b'], sun: '#f4f1de', fog: '#1d2748', sea: '#0e1a33',
    far: '#26325a', near: '#141b36', lights: 0.6, density: 0.06,
    light: { road: '#3c3d44', grass: '#10223f', rumble: '#e0e0e0', lane: '#d8d8d8', shoulder: '#6b6f78' },
    dark: { road: '#393a41', grass: '#0e1f3a', rumble: '#c62828', shoulder: '#666a73' },
    buildings: ['#455a64'],
    scenery: { billboard: 1 },
  },
});
```

Open `web/cities/mumbai/city.js` and check it has `hawkerCalls`, `curses`, `song`, `ads` and four `busLooks`, and `web/cities/mumbai/skyline.js` and check each painter starts by taking what it needs from `paint`, for example:
```js
  far(paint, t, seed) {
    const { mk, rr, mulberry32, LAYER_W, litWindows } = paint;
```

- [ ] **Step 8: Run the whole suite**

Run: `node --test tests/*.test.js`
Expected: `pass 79`, `fail 0`. If a golden test fails, the builder or the spawner draws random numbers in a different order from the original: compare with `web/game.js` at `e274c43`, do not edit the golden file.

- [ ] **Step 9: Commit**

```bash
git add web/packs.js web/styles web/tracks web/cities tests/load-game.js tests/packs.test.js tests/skylines.test.js tests/golden-roads.test.js
git status --short   # make-packs.js must not be listed
git commit -m "Packs: 7 tracks, 4 cities and the classic style as data

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The game loads the engine; street recordings move into city folders

After this task the game still reads its own tables. It loads the engine files and packs, takes its helper functions from `engine/util.js`, and finds each street recording in its city's folder.

**Files:**
- Move: `web/ambience-<city>.js` to `web/cities/<city>/ambience.js` (4 files)
- Modify: `web/index.html`, `web/game.js`, `build.sh`, `README.md`
- Temporary, not committed: `step1-edits-1.py`

**Interfaces:**
- Consumes: `RRR.util` (Task 2).
- Produces: `index.html` loads, in order, `engine/util.js`, `engine/registry.js`, `engine/track-builder.js`, `engine/traffic-spawner.js`, `engine/records.js`, `packs.js`, then `world3d.js` and `game.js`. `window.RRR` is complete before `game.js` runs.

- [ ] **Step 1: Move the recordings**

```bash
for c in mumbai hyderabad delhi chennai; do git mv web/ambience-$c.js web/cities/$c/ambience.js; done
```

- [ ] **Step 2: Write the edit script, `step1-edits-1.py`, at the repo root**

```python
"""One-off edits to the game for the track-pack refactor. Run from the repo root; every edit asserts that the
text it replaces is there exactly once, so a changed file fails loudly instead of being half-edited. Not committed."""
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)
def cut(s, first, last, new=''):
    """replace from the line starting with `first` through the next line starting with `last` (inclusive)"""
    a = s.index('\n' + first) + 1
    b = s.index('\n', s.index('\n' + last, a) + 1) + 1
    return s[:a] + new + s[b:]

g = load('web/game.js')

# --- A: utils come from engine/util.js
g = cut(g, 'const clamp = ', 'const easeInOut = ', "const { clamp, lerp, easeIn, easeInOut, rand, pick, mulberry32, weightedPick } = RRR.util; // engine/util.js\n")
g = rep(g, "const rand = (a, b) => a + Math.random() * (b - a);\nconst pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];\n", "")
g = cut(g, 'function mulberry32(a) {', 'function weightedPick(weights, r) {', '')
g = rep(g, "  const entries = Object.entries(weights); let total = 0; for (const [, w] of entries) total += w;\n  let x = r() * total; for (const [k, w] of entries) { if ((x -= w) < 0) return k; } return entries[0][0];\n}\n", "")

# --- B: ambience files live in the city folders
g = rep(g, "(web/ambience-<city>.js, loaded on demand)", "(web/cities/<city>/ambience.js, loaded on demand)")
g = rep(g, "tag.src = `ambience-${city}.js`;", "tag.src = `cities/${city}/ambience.js`;")
g = rep(g, "reportError('audio', `ambience-${city}.js failed to load`)", "reportError('audio', `cities/${city}/ambience.js failed to load`)")
save('web/game.js', g)

h = load('web/index.html')
h = rep(h, '<script src="world3d.js"></script>', '<script src="engine/util.js"></script>\n<script src="engine/registry.js"></script>\n<script src="engine/track-builder.js"></script>\n<script src="engine/traffic-spawner.js"></script>\n<script src="engine/records.js"></script>\n<script src="packs.js"></script>\n<script src="world3d.js"></script>')
save('web/index.html', h)
print('edits 1 applied')
```

- [ ] **Step 3: Apply it and remove it**

Run: `python3 step1-edits-1.py && rm step1-edits-1.py && node --check web/game.js`
Expected: `edits 1 applied` and no syntax error. If an assertion fails, the text it names is not in the file as expected: read that part of `web/game.js` and report, do not force it.

- [ ] **Step 4: Bundle the new folders in the Mac app**

In `build.sh`, replace this line:
```bash
cp web/index.html web/sounds.js web/voices.js web/animals.js web/horns.js web/ambience-*.js web/game.js web/icon.png "$APP/Contents/Resources/web/"
```
with:
```bash
cp web/index.html web/sounds.js web/voices.js web/animals.js web/horns.js web/packs.js web/game.js web/icon.png "$APP/Contents/Resources/web/"
cp -R web/engine web/styles web/cities web/tracks "$APP/Contents/Resources/web/"
```

In `README.md`, replace `web/ambience-*.js` with `web/cities/<city>/ambience.js`.

- [ ] **Step 5: Check it in the browser**

Start the preview server named `roadrash` (it serves `web/`; if `.claude/launch.json` is missing, create it with `python3 -m http.server ${PORT:-8765} --directory web` as the command). Then run in the page:
```js
const r = window.__rrr; r.setupRace(); r.step(120);
({ state: r.state, util: typeof window.RRR.util.mulberry32, order: window.RRR.order().length, ambience: !!document.querySelector('script[src="cities/mumbai/ambience.js"]') })
```
Expected: `{ state: 'countdown' or 'race', util: 'function', order: 7, ambience: true }`, no errors in the console, and the request for `cities/mumbai/ambience.js` returned 200.

- [ ] **Step 6: Run the tests and commit**

Run: `node --test tests/*.test.js`
Expected: `pass 79`, `fail 0`.

```bash
git add -A web build.sh README.md
git status --short   # step1-edits-1.py must not be listed
git commit -m "Game loads the engine and packs; street recordings move into city folders

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The game reads the packs

The switch-over. `web/game.js` loses `TRACKS`, `THEMES`, `HAWKER_CALLS`, `CURSES`, `SONGS`, the skyline painters, `BUS_LOOKS`, the track-building functions and the traffic setup, and reads one resolved definition, `def`. A broken pack shows an error screen in place of the title.

What changes in `web/game.js`, for the reviewer:

| Before | After |
| --- | --- |
| `TRACKS[i]`, `track.name`, `track.rivals`, `track.skill`, `track.laps` | `def = RRR.resolve(ORDER[i])`, `def.name`, `def.rivals.count`, `def.rivals.skill`, `def.laps` |
| `theme = THEMES[track.theme]` | `theme = def.look` (the ~40 uses of `theme.sky`, `theme.fog`, `theme.light` and so on are untouched) |
| `theme.city`, `theme.ads`, `theme.ambience === false` | `def.city` (the pack), `def.city.ads`, `!def.ambience` |
| `HAWKER_CALLS[city]`, `CURSES[city]`, `SONGS[city]`, `BUS_LOOKS[city]` | `def.city.hawkerCalls`, `def.city.curses`, `def.city.song`, `def.city.busLooks` |
| `SKYLINES[city].far(theme, seed)` | `def.skyline.far(PAINT, theme, seed)` |
| `buildTrack(track)` and the traffic loop in `setupRace` | `RRR.buildTrack({...})`, `RRR.spawnTraffic({...})` |
| saved `rrr_level` (an index) | saved `rrr_track` (an id), read through `RRR.selectedTrackIndex` |
| analytics `race-start/mumbai/marine` | `race-start/mumbai/marine-drive` |

**Files:**
- Modify: `web/game.js`, `web/world3d.js`
- Temporary, not committed: `step1-edits-2.py`

**Interfaces:**
- Consumes: `RRR.validate`, `RRR.order`, `RRR.resolve`, `RRR.tracks.get`, `RRR.cities` (Task 2); `RRR.selectedTrackIndex` (Task 3); `RRR.buildTrack`, `RRR.road` (Task 4); `RRR.spawnTraffic`, `RRR.busLook` (Task 5); the packs (Task 6).
- Produces, inside `web/game.js`: `CONFIG_PROBLEMS`, `ORDER`, `def`, `theme`, `PAINT`, `gridGap()`, `drawConfigError()`. `window.__rrr` gains `RRR` and `def` and loses `THEMES` and `SKYLINES`. `World3D.setTrack` receives `city` (the city id) alongside `BUS_LOOKS`.

- [ ] **Step 1: Write the edit script, `step1-edits-2.py`, at the repo root**

```python
"""One-off edits to the game for the track-pack refactor. Run from the repo root; every edit asserts that the
text it replaces is there exactly once, so a changed file fails loudly instead of being half-edited. Not committed."""
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)
def cut(s, first, last, new=''):
    """replace from the line starting with `first` through the next line starting with `last` (inclusive)"""
    a = s.index('\n' + first) + 1
    b = s.index('\n', s.index('\n' + last, a) + 1) + 1
    return s[:a] + new + s[b:]

g = load('web/game.js')

# --- C: tracks, themes and city tables come from packs
g = cut(g, 'const TRACKS = [', '];', """// Tracks, cities and styles are packs under web/tracks, web/cities and web/styles, listed in web/packs.js.
// engine/registry.js checks them (a list of problems, empty when all is well) and merges each track with
// its city and style into the definition the game reads.
const CONFIG_PROBLEMS = RRR.validate();
const ORDER = CONFIG_PROBLEMS.length ? [] : RRR.order(); // track ids in race order
""")
g = cut(g, '// Roadside hawkers call out to passing autos', 'const THEMES = {', '')   # HAWKER_CALLS, CURSES, MUMBAI_ADS, start of THEMES
a = g.index("  marine: { city: 'mumbai', ads: MUMBAI_ADS,"); b = g.index("// ------------------------------------------------------------------ utils")
g = g[:a] + '\n' + g[b:]
g = rep(g, "on ${THEMES[track.theme].city}/${track.theme}`", "on ${def.city.id}/${def.id}`")
g = rep(g, "// Pitches are semitones above Sa (D3). Melodies loop every 32 steps, drum patterns every 16.\n", "// Each city pack carries its song (web/cities/<id>/city.js); pitches are semitones above Sa (D3).\n")
g = cut(g, 'const SONGS = {', '};', '')
g = rep(g, "song = SONGS[this.city]; if", "song = this.city && this.city.song; if")
g = rep(g, "const quiet = theme.ambience === false; // e.g. out on the Sea Link", "const quiet = !def || !def.ambience; // e.g. out on the Sea Link")

# skylines: keep the helpers as a kit, drop the painters
g = rep(g, "// ---- Mumbai skyline backdrop (two parallax layers, each tiles horizontally at 1920 px)\nconst LAYER_W = 1920;\n",
  "// ---- skyline painting kit: each city's painters (web/cities/<id>/skyline.js) draw two parallax layers with it\nconst LAYER_W = 1920; // a layer tiles horizontally at this width\n")
g = cut(g, '// Distant high-rises: Imperial twin towers', '// ---- shared skyline helpers', '')
a = g.index("// ---- Hyderabad: Golconda Fort"); b = g.index("// Indian street dogs:")
g = g[:a] + "const PAINT = { mk, ell, rr, shade, lerp, mulberry32, LAYER_W, litWindows, fillerBlocks, trees, waterBand, cutOut, archPath, onion };\n\n" + g[b:]

# bus liveries
a = g.index("// 1990s city buses: each city's transport undertaking"); b = g.index("// tractors towing a trolley")
g = g[:a] + "// each city's bus liveries come from its pack (web/cities/<id>/city.js); the 3D turntable looks them up by city\nconst BUS_LOOKS = Object.fromEntries(RRR.cities.ids().map(id => [id, RRR.cities.get(id).busLooks]));\n" + g[b:]

# world state
g = rep(g, "let segments = [], trackLength = 0, theme = THEMES.marine, themeSprites = {}, bgLayers = {};\nlet track = TRACKS[0], level = clamp(store.get('level', 0), 0, TRACKS.length - 1), cash = store.get('cash', 0), round = store.get('round', 0);\nconst unlocked = TRACKS.length - 1; // every race is open from the start\n",
  "let segments = [], trackLength = 0, themeSprites = {}, bgLayers = {};\n// def: the loaded track's resolved definition (engine/registry.js) · theme: its look (sky, fog, road colours, scenery)\nlet def = null, theme = null;\n// level: the selected race's place in ORDER (saved as a track id)\nlet level = RRR.selectedTrackIndex(store, ORDER), cash = store.get('cash', 0), round = store.get('round', 0);\nconst unlocked = ORDER.length - 1; // every race is open from the start\n")

# track building moves to engine/track-builder.js
a = g.index("// ------------------------------------------------------------------ track building"); b = g.index("// traffic lights: a 22 s cycle per junction")
g = g[:a] + """// ------------------------------------------------------------------ track loading
// The road is built by engine/track-builder.js and its traffic by engine/traffic-spawner.js, both from the
// track's definition. x is in fixed units (1 = 2000 world units, one lane is LANE_W); we keep left, so our
// carriageway is x < 0 and oncoming traffic uses x > 0.
const { LANE_W, laneX } = RRR.road;
const halfAt = z => findSegment(z).half;
const gridGap = () => (use3D ? TUK_LEN + 350 : 520); // between rows of the starting grid: 3D autos need a real gap
""" + g[b:]
g = cut(g, 'function loadTrack(idx) {', '}', """function loadTrack(idx) {
  def = RRR.resolve(ORDER[idx % ORDER.length]);
  theme = def.look;
  Music.setCity(def.city);
  Ambience.setCity(def.city.id);
  const r = mulberry32(def.seed * 3);
  themeSprites = { buildings: theme.buildings.map(col => makeBuilding(r, col)),
    billboards: [...BILLBOARDS, ...def.city.ads.map((lines, i) => ({ ...AD_COLORS[i % AD_COLORS.length], lines }))].map(makeBillboard) };
  bgLayers = { far: def.skyline.far(PAINT, theme, def.seed), near: def.skyline.near(PAINT, theme, def.seed + 5) };
  ({ segments, trackLength, startZ, junctions } = RRR.buildTrack({ def, round, sprites: SP, themeSprites,
    constants: { SEG_LEN, RUMBLE_LEN, PLAYER_Z, GRID_GAP: gridGap() } }));
  if (use3D) World3D.setTrack({ segments, trackLength, theme, city: def.city.id, SP, themeSprites, CAR_COLORS, CAR_LOOKS, TRACTOR_LOOKS, BUS_LOOKS, BIKE_LOOKS, DOG_COATS, MAX_SPEED, LANE_W });
}
""")

# race setup
g = rep(g, "  const next = TRACKS[level % TRACKS.length];\n  trackEvent(`race-start/${THEMES[next.theme].city}/${next.theme}`, `Race started: ${next.name}`);\n  loadTrack(level);\n",
  "  loadTrack(level);\n  trackEvent(`race-start/${def.city.id}/${def.id}`, `Race started: ${def.name}`);\n")
g = rep(g, "  const nR = track.rivals;\n", "  const nR = def.rivals.count;\n")
g = rep(g, "(rows - 1 - row) * (use3D ? TUK_LEN + 350 : 520); // 3D autos need a real gap between rows", "(rows - 1 - row) * gridGap();")
g = rep(g, "clamp(track.skill * diff - 0.06", "clamp(def.rivals.skill * diff - 0.06")
a = g.index("  // traffic\n  traffic = [];\n  const tr = mulberry32(track.seed + 99 + round);"); b = g.index("  finishDist = startZ + track.laps * trackLength;")
g = g[:a] + """  traffic = RRR.spawnTraffic({ def, round, sprites: SP, maxSpeed: MAX_SPEED, looks: { CAR_LOOKS, TRACTOR_LOOKS, BIKE_CALM, BIKE_RASH },
    world: { startZ, trackLength, halfAt, findSegment } });
  skidMarks = []; crossTraffic = []; for (const j of junctions) { j.busy = false; j.spawn = [0, 0]; j.fined = false; }

""" + g[b:]
g = rep(g, "finishDist = startZ + track.laps * trackLength;", "finishDist = startZ + def.laps * trackLength;")

# the rest of the readers
g = rep(g, "if (next !== level) { level = next; store.set('level', level); attractSetup(); Sfx.beep(false); }", "if (next !== level) { level = next; store.set('track', ORDER[level]); attractSetup(); Sfx.beep(false); }")
g = rep(g, "look: busLookFor(Math.random) };", "look: RRR.busLook(def.city.busLooks, Math.random) };")
g = rep(g, "pick(HAWKER_CALLS[theme.city] || HAWKER_CALLS.mumbai)", "pick(def.city.hawkerCalls)")
g = rep(g, "pick(CURSES[theme.city] || CURSES.mumbai)", "pick(def.city.curses)")
g = rep(g, "(0.8 + track.skill * 0.3)", "(0.8 + def.rivals.skill * 0.3)")
g = rep(g, "`Finished ${ordinal(rank)}: ${track.name}`", "`Finished ${ordinal(rank)}: ${def.name}`")
g = rep(g, "    if (level >= TRACKS.length) { level = 0; round++; store.set('round', round); store.set('level', level); state = 'champion'; attractSetup(); return; }\n    store.set('level', level);\n",
  "    if (level >= ORDER.length) { level = 0; round++; store.set('round', round); store.set('track', ORDER[level]); state = 'champion'; attractSetup(); return; }\n    store.set('track', ORDER[level]);\n")
g = rep(g, "text(track.name, W - 24, 58, 10, '#ffcc80', 'right');", "text(def.name, W - 24, 58, 10, '#ffcc80', 'right');")
g = rep(g, "text(track.name, W / 2, H / 2 + 20, 24, '#ffcc80');", "text(def.name, W / 2, H / 2 + 20, 24, '#ffcc80');")
g = rep(g, "text(TRACKS[level].name, W / 2, 425, 16, '#fff');", "text(def.name, W / 2, 425, 16, '#fff');")
g = rep(g, "`Race ${level + 1} of ${TRACKS.length}  ", "`Race ${level + 1} of ${ORDER.length}  ")
g = rep(g, "`You won all ${TRACKS.length} races across India.", "`You won all ${ORDER.length} races across India.")
g = rep(g, "(level + 1 >= TRACKS.length ? 'ENTER — CLAIM YOUR CROWN' : `ENTER — NEXT: ${TRACKS[level + 1].name}`)", "(level + 1 >= ORDER.length ? 'ENTER — CLAIM YOUR CROWN' : `ENTER — NEXT: ${RRR.tracks.get(ORDER[level + 1]).name}`)")
g = rep(g, "VoiceClips, Animals, SKYLINES, THEMES, SP,", "VoiceClips, Animals, RRR, get def() { return def; }, SP,")

# --- D: error attribution and the config error screen
g = rep(g, "  ['track', /^(buildTrack|loadTrack|addRoad|addSegment|lastY|findSegment|attractSetup)$/],\n  ['sprites', /^(make[A-Z]\\w*|buildSharedSprites|flipped|litWindows|fillerBlocks|trees|waterBand|gopuram|cutOut|archPath|onion)$/],\n",
  "  ['config', /^(?:Registry\\.|RRR\\.)?(register|check|checkMerged|deepFreeze|validate|resolve|resolveDef)$/],\n"
  "  ['traffic', /^(?:TrafficSpawner\\.)?(spawn|deck|busLook|roadSpot|addVehicle|addCow|addDog|spawnTraffic)$/],\n"
  "  ['track', /^(?:TrackBuilder\\.)?(build|loadTrack|addRoad|addSegment|lastY|layPieces|layoutLanes|layoutJunctions|placeScenery|placeSigns|settleRoadside|findSegment|attractSetup)$/],\n"
  "  ['sprites', /^(?:Object\\.)?(make[A-Z]\\w*|buildSharedSprites|flipped|litWindows|fillerBlocks|trees|waterBand|cutOut|archPath|onion|far|near)$/],\n")
g = rep(g, "const pauseItemRect = i =>", """// a pack is broken: engine/registry.js names the track and field, shown in place of the title screen
function drawConfigError() {
  ctx.fillStyle = '#1a0f1f'; ctx.fillRect(0, 0, W, H);
  text('TRACK CONFIG ERROR', W / 2, 120, 36, '#ef5350');
  CONFIG_PROBLEMS.slice(0, 10).forEach((p, i) => text(p, W / 2, 190 + i * 26, 14, '#fff', 'center', 'system-ui, sans-serif'));
  if (CONFIG_PROBLEMS.length > 10) text(`and ${CONFIG_PROBLEMS.length - 10} more`, W / 2, 190 + 10 * 26, 14, '#ffcc80', 'center', 'system-ui, sans-serif');
}
const pauseItemRect = i =>""")
g = rep(g, "if (!use3D) disable3D(); else World3D.setCamera(store.get('camera', 'heli'));\nattractSetup();\nfit();\n",
  "if (!use3D) disable3D(); else World3D.setCamera(store.get('camera', 'heli'));\nfit();\nif (CONFIG_PROBLEMS.length) { // no track can be loaded: say what is wrong and stop here\n  state = 'config-error'; disable3D(); drawConfigError();\n  reportError('config', CONFIG_PROBLEMS[0]);\n  return;\n}\nstore.set('track', ORDER[level]);\nattractSetup();\n")
save('web/game.js', g)

w = load('web/world3d.js')
w = rep(w, "...((cfg.BUS_LOOKS || {})[theme.city] || [BUS_DEFAULT]).flatMap(", "...((cfg.BUS_LOOKS || {})[cfg.city] || [BUS_DEFAULT]).flatMap(")
w = rep(w, "[(arg || '').split('/')[0] || theme.city] || [BUS_DEFAULT])", "[(arg || '').split('/')[0] || cfg.city] || [BUS_DEFAULT])")
save('web/world3d.js', w)
print('edits 2 applied')
```

- [ ] **Step 2: Apply it and remove it**

Run: `python3 step1-edits-2.py && rm step1-edits-2.py && node --check web/game.js && node --check web/world3d.js && wc -l web/game.js`
Expected: `edits 2 applied`, no syntax error, and `web/game.js` is about 2,840 lines (it was 3,373).

- [ ] **Step 3: Confirm nothing still reads the old tables**

Run:
```bash
grep -nE "\b(TRACKS|THEMES|SONGS|SKYLINES|HAWKER_CALLS|CURSES|MUMBAI_ADS|busLookFor|layoutLanes|JUNCTION_LEN)\b|\btrack\.|theme\.(city|ads|ambience)" web/game.js web/world3d.js
```
Expected: one line only, the `['track', /^(?:TrackBuilder\.)?(build|loadTrack|...` entry in the error-attribution table.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/*.test.js`
Expected: `pass 79`, `fail 0`.

- [ ] **Step 5: Race every track in 3D**

Reload the `roadrash` preview. If `localStorage.rrr_round` is set, remove it and reload (later tours reshuffle the roads). Run in the page:
```js
const r = window.__rrr, out = [];
for (let i = 0; i < 7; i++) { r.setLevel(i); r.setupRace(); r.keys.ArrowUp = true; r.step(900);
  out.push([r.def.id, r.state, r.segments.length, r.junctions.length, r.traffic.length, r.rivals.length, (r.traffic.find(c => c.type === 'bus') || { look: {} }).look.op].join(' ')); }
r.keys.ArrowUp = false; out
```
Expected, with no errors in the console:
```
marine-drive race 3515 4 83 5 B.E.S.T.
charminar-road race 3410 4 102 6 A.P.S.R.T.C.
sea-link race 3665 6 83 6 B.E.S.T.
ring-road race 4010 6 124 7 D.T.C.
western-express race 3845 7 120 7 B.E.S.T.
marina-beach race 3995 5 115 7 PALLAVAN
juhu-beach race 4190 4 115 7 B.E.S.T.
```
The bus operator is whichever bus the seed puts first; any operator from that city's pack is right (Delhi has `D.T.C.` and `BLUELINE`). Take a screenshot of the title screen: the skyline, the road and a track name must be there. Also check that `localStorage.rrr_track` holds a track id in quotes, for example `"marine-drive"`, not a number.

- [ ] **Step 6: Race in 2D**

Load the preview with `?2d` added to the URL and run the same snippet.
Expected: the same seven lines and no console errors. Take a screenshot: the 2D skyline is painted by the city packs, so it must show.

- [ ] **Step 7: See the config error screen**

In `web/tracks/juhu-beach/track.js` change `style: 'classic',` to `style: 'clasic', lapz: 2,`. Reload without cache (run `await fetch('tracks/juhu-beach/track.js', { cache: 'reload' }); location.reload()` in the page).
Expected: a dark screen titled `TRACK CONFIG ERROR` listing `track "juhu-beach".lapz: unknown key` and `track "juhu-beach".style: unknown style "clasic"`. Pressing Enter does nothing.

Then undo it: `git checkout web/tracks/juhu-beach/track.js`, reload without cache the same way, and confirm the title screen is back.

- [ ] **Step 8: Commit**

```bash
git status --short   # only web/game.js and web/world3d.js
git add web/game.js web/world3d.js
git commit -m "Game reads tracks, cities and styles from packs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Document the layout and check the Mac app

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

Replace the `**Code layout:**` bullet in the `## 3D` section with:
```markdown
- **Code layout:** `web/game.js` runs the race (physics, rivals, audio, HUD) for both renderers and `web/world3d.js` draws it in 3D. Each frame it rebuilds the road around the camera from the track's curves and hills and places the models. Tracks themselves are data: see **Tracks, cities and styles**.
```

Add this section before `## Installer (DMG)`:
```markdown
## Tracks, cities and styles

Every race is a pack of plain data. Nothing about a particular track lives in the game code.

| Pack | Files | Holds |
| --- | --- | --- |
| Track | `web/tracks/<id>/track.js` | Name, city, style, road seed and length, rivals, traffic counts and the look (sky, fog, road colours, scenery) |
| City | `web/cities/<id>/city.js`, `skyline.js`, `ambience.js` | Street calls, curses, song, billboard ads, bus liveries, the skyline painters and the street recording |
| Style | `web/styles/<id>.js` | How the road is put together, the traffic mix and the handling numbers |

`web/packs.js` lists the packs, with tracks in race order. The files in `web/engine/` check them at startup and build the road and its traffic from them. A mistake in a pack shows a message naming the track and field in place of the title screen.

To add a track, copy a folder under `web/tracks/`, change its `id` and values, and add the id to `web/packs.js`. A track can override any of its style's values, for example `traffic: { count: 40, cows: 0, dogs: 0, oncoming: 0.3 }`.

Run the tests with `node --test tests/*.test.js` (Node 20 or later, nothing to install).
```

- [ ] **Step 2: Build the Mac app and check the bundle**

Run:
```bash
./build.sh && ls "build/Road Rash.app/Contents/Resources/web" "build/Road Rash.app/Contents/Resources/web/tracks" "build/Road Rash.app/Contents/Resources/web/cities/mumbai"
```
Expected: `✓ built build/Road Rash.app`; the `web` folder lists `engine`, `styles`, `cities`, `tracks` and `packs.js` and no `ambience-*.js`; 7 track folders; `ambience.js`, `city.js` and `skyline.js` under `cities/mumbai`.

- [ ] **Step 3: Launch the Mac app**

Run: `open "build/Road Rash.app"`
The app loads the game from `file://`, which the browser preview does not exercise. Confirm the title screen shows the 3D road, the skyline and `MUMBAI · MARINE DRIVE`, then start a race with Enter. If you cannot see the app's window, say so in your report: do not report this step as checked.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "README: tracks, cities and styles as packs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Release

Each finished update ships to web and Homebrew. Do this after the branch is merged to `main` (use superpowers:finishing-a-development-branch for the merge). Other sessions release from `main` too, so read the current version at release time; never reuse a number from this plan.

**Files:**
- Modify: `web/game.js` (`GAME_VERSION`), `macos/Info.plist`, `CHANGELOG.md`, `Casks/roadrash.rb`

- [ ] **Step 1: Work from a worktree on `main` and read the current version**

```bash
set -euo pipefail
git fetch origin
git worktree add ../release-track-packs origin/main -b release-track-packs 2>/dev/null || true
cd ../release-track-packs && git branch --show-current
grep -n "GAME_VERSION = " web/game.js && git tag --sort=-v:refname | head -1
```
The new version is the next patch after `GAME_VERSION` (for example `3.3.4` becomes `3.3.5`). Confirm the merge is in: `ls web/tracks` lists 7 folders.

- [ ] **Step 2: Bump the version and write the changelog entry**

Set `GAME_VERSION` in `web/game.js` and both `CFBundleShortVersionString` and `CFBundleVersion` in `macos/Info.plist` to the new version. Add at the top of `CHANGELOG.md` (under `# Changelog`), with the real version:
```markdown
## vX.Y.Z: Tracks become packs

- **Nothing changes on the road:** all 7 races have the same roads, traffic, music and skylines as before.
- **Every track is now a folder of data:** each race, city and race style is its own file under `web/tracks`, `web/cities` and `web/styles`, so a new track is a new folder and one line in `web/packs.js`.
- **A mistake in a track file is reported on screen,** naming the track and the field, in place of the title screen.
```

- [ ] **Step 3: Test, commit and push**

```bash
set -euo pipefail
node --test tests/*.test.js
git add web/game.js macos/Info.plist CHANGELOG.md
git commit -m "vX.Y.Z: tracks, cities and styles become data packs; no gameplay change

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin HEAD:main
```

- [ ] **Step 4: Deploy the web build and confirm it is live**

```bash
set -euo pipefail
./deploy-web.sh
sleep 90
curl -s https://shankyty.github.io/Roadrash/game.js | grep -o "GAME_VERSION = '[0-9.]*'"
curl -s -o /dev/null -w "%{http_code}\n" https://shankyty.github.io/Roadrash/tracks/marine-drive/track.js
```
Expected: the new version, and `200`.

- [ ] **Step 5: Build, publish the DMG and update the cask**

```bash
set -euo pipefail
./build.sh && ./make-dmg.sh
gh release create vX.Y.Z build/RoadRash.dmg --title "vX.Y.Z" --notes "Tracks, cities and styles become data packs. No gameplay change."
curl -sL -o /tmp/RoadRash.dmg https://github.com/shankyty/Roadrash/releases/download/vX.Y.Z/RoadRash.dmg
shasum -a 256 build/RoadRash.dmg /tmp/RoadRash.dmg
```
Expected: the two hashes match. Set `version` and `sha256` in `Casks/roadrash.rb` to the new version and that hash, then:
```bash
set -euo pipefail
git add Casks/roadrash.rb
git commit -m "Cask: vX.Y.Z

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin HEAD:main
```

- [ ] **Step 6: Confirm Homebrew upgrades**

```bash
brew update && brew upgrade --cask roadrash && brew info --cask roadrash | head -3
```
Expected: the installed version is the new one. Then remove the release worktree: `cd - && git worktree remove ../release-track-packs`.
