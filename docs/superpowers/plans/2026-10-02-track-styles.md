# Track Styles (Step 2: Speed, Drift, Traffic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 7 races distinct styles (speed, drift, traffic, classic), track drift score and close passes in every race, and save per-track bests, with finishing order still deciding every result.

**Architecture:** A style is a data pack (`web/styles/<id>.js`) that sets the road recipe, the traffic profile, handling numbers and cash rates. Every mechanic runs on every track; the style only changes how much it does. `web/engine/race-stats.js` holds one race's stats; `web/engine/records.js` (already built) saves the bests. `web/game.js` reads handling numbers from the track's resolved definition.

**Tech Stack:** Classic browser scripts (no build step, no modules), Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-02-track-packs-design.md`, section "Step 2: styles". This plan starts from the end of `docs/superpowers/plans/2026-10-02-track-packs.md` (step 1), which must be merged first.

## Global Constraints

- No build step and no packages. Packs register on `RRR`; no `fetch`, no JSON files, no ES modules.
- Files under `web/engine/` touch no DOM, so they run under Node. Tests: `node --test tests/*.test.js`.
- Finishing order decides the result on every style. Top 3 qualifies and prize money by rank is unchanged. No style is won on the clock or on a score.
- `tests/golden-roads.test.js` must keep passing: the classic recipe still builds the original 7 roads. Do not change a track's `seed`, `length`, `laps`, `rivals` or `traffic` counts in this plan; styles scale traffic with `countScale`.
- A style contains numbers only. Do not add `if (def.style === ...)` to `web/game.js`: read `def.handling`, `def.scoring`, `def.road`, `def.traffic`.
- Style numbers in this plan are starting values that were checked with scripted driving. Task 5 tunes them by playing; change values in `web/styles/*.js` only.
- Match `web/game.js` style: dense one-line statements, short comments that say why.
- End every commit message with: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
| --- | --- |
| `web/engine/race-stats.js` (new) | `RRR.RaceStats`: one race's drift score, close passes, chain, time and place; the cash bonuses |
| `web/engine/registry.js` | Gains the `driftGrip` handling value in the pack shape |
| `web/styles/classic.js` | Gains `driftGrip: 1` and cash rates |
| `web/styles/speed.js`, `drift.js`, `traffic.js` (new) | The three new styles |
| `web/packs.js`, `web/tracks/<id>/track.js` | The manifest lists the styles; six tracks change `style` |
| `web/game.js` | Top speed, boost, drift grip and scrub from `def.handling`; close passes; results, title and HUD |
| `tests/race-stats.test.js`, `tests/styles.test.js` (new) | Unit tests for the stats; per-style road and traffic checks |

Handling values, all in `def.handling`:

| Value | Meaning | classic | speed | drift | traffic |
| --- | --- | --- | --- | --- | --- |
| `topSpeed` | Top speed of your auto and the rivals, as a share of 80 km/h | 1 | 1.25 | 1 | 1 |
| `driftScrub` | Share of speed a drift loses each second | 0.22 | 0.22 | 0.08 | 0.22 |
| `driftGrip` | Share of a bend's outward push still felt while drifting into it | 1 | 1 | 0.25 | 1 |
| `driftExitBoost` | Top speed raised by this share for 1.2 s after a drift held 0.6 s | 0 | 0 | 0.08 | 0 |
| `slipstream` | Top speed raised by this share per close pass in a chain (up to 5), for 1.5 s | 0 | 0 | 0 | 0.04 |

`driftGrip` is not in the spec's table. It is needed because in this game a bend pushes the auto outward harder than steering can pull it back above about half speed, drifting or not, so without it a drift cannot be the fast way round a sharp bend.

---

### Task 1: Race stats

**Files:**
- Create: `web/engine/race-stats.js`
- Modify: `tests/load-game.js`
- Test: `tests/race-stats.test.js`

**Interfaces:**
- Produces: `new RRR.RaceStats(scoring)` where `scoring = { driftCashPer100, passCash }`, with
  - `drift(dt, speedPct, slipPct)` returning the points added
  - `closePass()` returning the chain length (1 to 5)
  - `advance(dt)`, `breakChain()`, `finish(time|null, rank)`
  - fields `driftScore`, `passes`, `chain`, `bestChain`, `time`, `rank`
  - `bonuses()` returning `{ drift, passes }` in rupees
  - `summary()` returning `{ time, rank, driftScore, passes }`, the shape `Records.submit` takes
  - `RRR.RaceStats.CHAIN_MAX` (5), `RRR.RaceStats.CHAIN_SECS` (1.5)

- [ ] **Step 1: Write the failing test, `tests/race-stats.test.js`**

```js
'use strict';
const test = require('node:test'), assert = require('node:assert');
require('../web/engine/race-stats.js');
const { RaceStats } = globalThis.RRR;

const stats = () => new RaceStats({ driftCashPer100: 40, passCash: 25 });

test('a new race has no score, no passes and no time', () => {
  assert.deepStrictEqual(stats().summary(), { time: null, rank: null, driftScore: 0, passes: 0 });
});
test('a full-speed, full-angle slide earns 100 points a second', () => {
  const s = stats();
  for (let i = 0; i < 60; i++) s.drift(1 / 60, 1, 1);
  assert.strictEqual(s.summary().driftScore, 100);
});
test('slower or shallower slides earn in proportion, and drift() returns what it added', () => {
  const s = stats();
  assert.strictEqual(s.drift(1, 0.5, 0.5), 25);
  assert.strictEqual(s.drift(2, 1, 0.25), 50);
  assert.strictEqual(s.summary().driftScore, 75);
});
test('close passes count and build a chain', () => {
  const s = stats();
  assert.deepStrictEqual([s.closePass(), s.closePass(), s.closePass()], [1, 2, 3]);
  assert.deepStrictEqual([s.passes, s.chain, s.bestChain], [3, 3, 3]);
});
test('the chain stops growing at CHAIN_MAX but passes keep counting', () => {
  const s = stats();
  for (let i = 0; i < 8; i++) s.closePass();
  assert.deepStrictEqual([s.passes, s.chain, s.bestChain], [8, RaceStats.CHAIN_MAX, RaceStats.CHAIN_MAX]);
});
test('the chain lapses when no pass comes in time; a pass in time keeps it', () => {
  const s = stats();
  s.closePass(); s.advance(RaceStats.CHAIN_SECS - 0.1); s.closePass();
  assert.strictEqual(s.chain, 2);
  s.advance(RaceStats.CHAIN_SECS + 0.1);
  assert.deepStrictEqual([s.chain, s.bestChain, s.passes], [0, 2, 2]);
  assert.strictEqual(s.closePass(), 1);
});
test('a crash breaks the chain', () => {
  const s = stats();
  s.closePass(); s.closePass(); s.breakChain();
  assert.deepStrictEqual([s.chain, s.bestChain], [0, 2]);
});
test('bonuses pay per 100 drift points and per pass, at the style\'s rates', () => {
  const s = stats();
  s.drift(2.5, 1, 1); for (let i = 0; i < 3; i++) s.closePass();
  assert.deepStrictEqual(s.bonuses(), { drift: 100, passes: 75 });
});
test('finish records the time and place', () => {
  const s = stats();
  s.finish(92.4, 2);
  assert.deepStrictEqual(s.summary(), { time: 92.4, rank: 2, driftScore: 0, passes: 0 });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/race-stats.test.js`
Expected: FAIL, `Cannot find module '.../web/engine/race-stats.js'`.

- [ ] **Step 3: Write `web/engine/race-stats.js`**

The method names avoid `tick` and `cash`: the game's error reporter attributes those names to the audio code.

```js
'use strict';
// What you did in one race: drift score, close passes and their chain, your time and place. The game feeds
// it events; the results screen and the records read it. No DOM access.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const CHAIN_MAX = 5, CHAIN_SECS = 1.5; // a chain of close passes: its longest, and how long each pass keeps it alive

class RaceStats {
  // scoring: the track definition's { driftCashPer100, passCash }
  constructor(scoring) {
    this.scoring = scoring;
    this.driftScore = 0; this.passes = 0; this.chain = 0; this.bestChain = 0; this.chainT = 0; this.time = null; this.rank = null;
  }
  // a moment of sliding: speedPct and slipPct are shares (0 to 1) of top speed and of a full slide. Returns the points it earned
  drift(dt, speedPct, slipPct) { const pts = 100 * speedPct * slipPct * dt; this.driftScore += pts; return pts; }
  // a close pass: lengthens the chain and restarts its timer. Returns the chain's length
  closePass() {
    this.passes++; this.chain = Math.min(CHAIN_MAX, this.chain + 1); this.bestChain = Math.max(this.bestChain, this.chain); this.chainT = CHAIN_SECS;
    return this.chain;
  }
  advance(dt) { if (this.chainT > 0 && (this.chainT -= dt) <= 0) this.chain = 0; }
  breakChain() { this.chain = 0; this.chainT = 0; } // a crash ends it
  // time is null when you didn't cross the line
  finish(time, rank) { this.time = time; this.rank = rank; }
  bonuses() { return { drift: Math.round(this.driftScore / 100 * this.scoring.driftCashPer100), passes: this.passes * this.scoring.passCash }; }
  // what the records keep (see engine/records.js)
  summary() { return { time: this.time, rank: this.rank, driftScore: Math.round(this.driftScore), passes: this.passes }; }
}
RaceStats.CHAIN_MAX = CHAIN_MAX; RaceStats.CHAIN_SECS = CHAIN_SECS;
RRR.RaceStats = RaceStats;
})();
```

- [ ] **Step 4: Load it with the rest of the engine in tests**

In `tests/load-game.js`, change `'engine/records.js', 'packs.js'` to `'engine/records.js', 'engine/race-stats.js', 'packs.js'`.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/*.test.js`
Expected: `pass 111`, `fail 0` (102 from step 1 plus 9).

- [ ] **Step 6: Commit**

```bash
git add web/engine/race-stats.js tests/race-stats.test.js tests/load-game.js
git commit -m "Engine: race stats (drift score, close passes, chain, bonuses)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The `driftGrip` handling value, and cash rates for classic

**Files:**
- Modify: `web/engine/registry.js`, `web/styles/classic.js`
- Test: `tests/registry.test.js`

**Interfaces:**
- Produces: every resolved definition has `def.handling.driftGrip` (number). `classic` pays ₹20 per 100 drift points and ₹10 per close pass.

- [ ] **Step 1: Update the test's style and expectation**

In `tests/registry.test.js`, in the `style()` helper change
```js
  handling: { topSpeed: 1, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 },
```
to
```js
  handling: { topSpeed: 1, driftScrub: 0.22, driftGrip: 1, driftExitBoost: 0, slipstream: 0 },
```
and in the test `resolve merges style values with the track's overrides, per key` change the expected handling to
```js
  assert.deepStrictEqual(def.handling, { topSpeed: 1.25, driftScrub: 0.22, driftGrip: 1, driftExitBoost: 0, slipstream: 0 });
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/registry.test.js`
Expected: FAIL. `sound packs validate with no problems` reports `style "plain".handling.driftGrip: unknown key`.

- [ ] **Step 3: Add the value to the pack shape**

In `web/engine/registry.js` change
```js
const HANDLING = { topSpeed: 'number', driftScrub: 'number', driftExitBoost: 'number', slipstream: 'number' };
```
to
```js
const HANDLING = { topSpeed: 'number', driftScrub: 'number', driftGrip: 'number', driftExitBoost: 'number', slipstream: 'number' };
```

- [ ] **Step 4: Give classic the value and its cash rates**

In `web/styles/classic.js` replace
```js
  handling: { topSpeed: 1, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 0, passCash: 0 },
```
with
```js
  handling: {
    topSpeed: 1,                         // the autos' top speed, as a share of 80 km/h
    driftScrub: 0.22,                    // share of speed a drift loses each second
    driftGrip: 1,                        // share of a bend's outward push still felt while drifting into it
    driftExitBoost: 0,                   // top speed raised by this share for a moment after a held drift
    slipstream: 0,                       // top speed raised by this share per close pass in a chain
  },
  scoring: { driftCashPer100: 20, passCash: 10 },   // rupees per 100 drift points, and per close pass
```

- [ ] **Step 5: Run the tests and commit**

Run: `node --test tests/*.test.js`
Expected: `pass 111`, `fail 0`.

```bash
git add web/engine/registry.js web/styles/classic.js tests/registry.test.js
git commit -m "Styles: driftGrip handling value; classic pays drift and close-pass cash

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The speed, drift and traffic styles

**Files:**
- Create: `web/styles/speed.js`, `web/styles/drift.js`, `web/styles/traffic.js`
- Modify: `web/packs.js`, six `web/tracks/<id>/track.js`
- Test: `tests/styles.test.js`

**Interfaces:**
- Produces: styles `speed`, `drift`, `traffic` registered and listed in the manifest. Track styles: `marine-drive` and `juhu-beach` drift; `sea-link` and `marina-beach` speed; `western-express` and `ring-road` traffic; `charminar-road` classic.

- [ ] **Step 1: Write the failing test, `tests/styles.test.js`**

```js
'use strict';
// Each shipped style builds the kind of road and traffic it promises, on the tracks that use it.
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');
const { buildWorld } = require('./build-world.js');

const STYLE_OF = { 'marine-drive': 'drift', 'charminar-road': 'classic', 'sea-link': 'speed', 'ring-road': 'traffic',
  'western-express': 'traffic', 'marina-beach': 'speed', 'juhu-beach': 'drift' };
const sharpest = road => Math.max(...road.segments.map(s => Math.abs(s.curve)));
const vehicles = (traffic, dir) => traffic.filter(c => c.type !== 'cow' && c.type !== 'dog' && c.dir === dir);
const world = id => { const def = RRR.resolve(id); return { def, ...buildWorld(def) }; };

test('every track has the style the design assigns it', () => {
  assert.deepStrictEqual(Object.fromEntries(RRR.order().map(id => [id, RRR.tracks.get(id).style])), STYLE_OF);
});
for (const id of RRR.order()) {
  test(`${id} spawns traffic in its style's numbers`, () => {
    const { def, traffic } = world(id), sameWay = Math.round(def.traffic.count * def.traffic.countScale);
    assert.strictEqual(vehicles(traffic, 1).length, sameWay);
    assert.strictEqual(vehicles(traffic, -1).length, Math.round(sameWay * def.traffic.oncoming));
    assert.ok(traffic.every(c => c.type === 'cow' || c.type === 'dog' || c.type in def.traffic.mix));
  });
}
for (const id of ['sea-link', 'marina-beach']) {
  test(`${id} (speed) is wide, gentle and has no junctions or tractors`, () => {
    const { def, road, traffic } = world(id);
    assert.strictEqual(def.handling.topSpeed, 1.25);
    assert.ok(sharpest(road) <= 3);
    assert.ok(road.segments.every(s => s.lanes === 3));
    assert.strictEqual(road.junctions.length, 0);
    assert.ok(!traffic.some(c => c.type === 'tractor'));
  });
}
for (const id of ['marine-drive', 'juhu-beach']) {
  test(`${id} (drift) has bends up to sharpness 8 and mostly bends`, () => {
    const { def, road } = world(id);
    assert.strictEqual(sharpest(road), 8);
    const bends = road.segments.filter(s => Math.abs(s.curve) >= 2).length;
    assert.ok(bends / road.segments.length > 0.5, `only ${Math.round(100 * bends / road.segments.length)}% bends`);
    assert.ok(def.handling.driftScrub < 0.22 && def.handling.driftGrip < 1 && def.handling.driftExitBoost > 0);
  });
}
for (const id of ['western-express', 'ring-road']) {
  test(`${id} (traffic) is wide and gentle, with junctions and more same-way than oncoming traffic`, () => {
    const { def, road, traffic } = world(id);
    assert.ok(sharpest(road) <= 3);
    assert.ok(road.segments.every(s => s.lanes === 3));
    assert.ok(road.junctions.length > 0);
    assert.ok(vehicles(traffic, 1).length > 2 * vehicles(traffic, -1).length);
    assert.ok(def.handling.slipstream > 0);
  });
}
test('charminar-road (classic) keeps the classic road, traffic and handling', () => {
  const { def, road } = world('charminar-road');
  assert.strictEqual(sharpest(road), 6);
  assert.deepStrictEqual([def.handling.topSpeed, def.handling.driftScrub, def.handling.driftGrip, def.handling.driftExitBoost, def.handling.slipstream], [1, 0.22, 1, 0, 0]);
  assert.deepStrictEqual([def.traffic.countScale, def.traffic.oncoming], [1, 0.8]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/styles.test.js`
Expected: FAIL. The first test reports every track as `classic`.

- [ ] **Step 3: Write `web/styles/speed.js`**

```js
'use strict';
// Speed: long straights and gentle bends on a wide road with no junctions and light traffic. The autos are
// tuned for 100 km/h; traffic is not, so everything ahead comes at you faster.
RRR.styles.register({
  id: 'speed',
  label: 'SPEED',
  road: {
    lengths: [50, 75, 100],
    pieces: [
      { kind: 'straight', weight: 40 },
      { kind: 'curve', weight: 35, curves: [1, 2, 3], hills: [0, 0, 20, -20] },
      { kind: 'hill', weight: 15, hills: [20, 40] },
      { kind: 'rollers', weight: 10 },
    ],
    lanes: 'wide',
    junctions: false,
  },
  traffic: {
    countScale: 0.5,
    oncoming: 0.5,
    mix: { car: 5, bike: 3, bus: 2, truck: 2 },
  },
  handling: { topSpeed: 1.25, driftScrub: 0.22, driftGrip: 1, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 20, passCash: 10 },
});
```

- [ ] **Step 4: Write `web/styles/drift.js`**

```js
'use strict';
// Drift: tight bends chained one after another. Flat out without sliding you run wide or tip over; held in a
// drift the auto keeps its speed, is pulled round the bend and gets a kick on the way out.
RRR.styles.register({
  id: 'drift',
  label: 'DRIFT',
  road: {
    lengths: [25, 50],
    pieces: [
      { kind: 'curve', weight: 40, curves: [6, 8], hills: [0, 0, 20, -20] },
      { kind: 'sCurve', weight: 35, curve: 4, hills: [0, 20, -20] },   // 4, then 8 the other way, then 4
      { kind: 'curveHill', weight: 15, curve: 6, hill: 30 },
      { kind: 'straight', weight: 10 },
    ],
    lanes: 'alternate',
    junctions: true,
  },
  traffic: {
    countScale: 0.6,
    oncoming: 0.5,
    mix: { car: 4, bike: 4, bus: 2, truck: 1, tractor: 1 },
  },
  handling: { topSpeed: 1, driftScrub: 0.08, driftGrip: 0.25, driftExitBoost: 0.08, slipstream: 0 },
  scoring: { driftCashPer100: 40, passCash: 10 },
});
```

- [ ] **Step 5: Write `web/styles/traffic.js`**

```js
'use strict';
// Traffic: a wide, mostly straight road packed with same-way traffic. Passing close gives a slipstream, and
// passes in quick succession stack it, so the fast line is through the gaps.
RRR.styles.register({
  id: 'traffic',
  label: 'TRAFFIC',
  road: {
    lengths: [50, 75],
    pieces: [
      { kind: 'straight', weight: 45 },
      { kind: 'curve', weight: 30, curves: [1, 2, 3], hills: [0, 0, 20, -20] },
      { kind: 'hill', weight: 15, hills: [20, 40] },
      { kind: 'rollers', weight: 10 },
    ],
    lanes: 'wide',
    junctions: true,
  },
  traffic: {
    countScale: 1.6,
    oncoming: 0.4,
    mix: { car: 5, bike: 2, bus: 3, truck: 2 },
  },
  handling: { topSpeed: 1, driftScrub: 0.22, driftGrip: 1, driftExitBoost: 0, slipstream: 0.04 },
  scoring: { driftCashPer100: 20, passCash: 25 },
});
```

- [ ] **Step 6: List the styles and assign them**

In `web/packs.js` change `styles: ['classic'],` to `styles: ['classic', 'speed', 'drift', 'traffic'],`.

In each track file change the line `  style: 'classic',`:

| File | New line |
| --- | --- |
| `web/tracks/marine-drive/track.js` | `  style: 'drift',` |
| `web/tracks/juhu-beach/track.js` | `  style: 'drift',` |
| `web/tracks/sea-link/track.js` | `  style: 'speed',` |
| `web/tracks/marina-beach/track.js` | `  style: 'speed',` |
| `web/tracks/western-express/track.js` | `  style: 'traffic',` |
| `web/tracks/ring-road/track.js` | `  style: 'traffic',` |

`web/tracks/charminar-road/track.js` stays `classic`.

- [ ] **Step 7: Run the tests**

Run: `node --test tests/*.test.js`
Expected: `pass 126`, `fail 0`. The golden tests still pass because they force every track to the classic style.

- [ ] **Step 8: Commit**

```bash
git add web/styles web/packs.js web/tracks tests/styles.test.js
git commit -m "Styles: speed, drift and traffic, assigned to six of the seven races

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

After this commit the roads and traffic differ per style, but the handling numbers are not read by the game yet. Task 4 does that.

---

### Task 4: The game reads handling, counts close passes and shows records

What changes in `web/game.js`, for the reviewer:

| Where | Change |
| --- | --- |
| World state | `records` (saved bests), `stats` (this race), `titleBest`; the player gains `boost`, `boostT`, `driftT`, `driftPts` |
| `setupRace` | New `RaceStats` per race; rival top speed scales with `topSpeed`; the race-start analytics title names the style |
| `updatePlayer` | Bend push scaled by `driftGrip` while drifting into the bend; drift loses `driftScrub` and scores points; top speed is `topSpeed`, raised while a boost lasts |
| `endDrift` (new) | Pops up the drift's points; grants `driftExitBoost` after a held drift |
| `updateClosePasses` (new) | Detects close passes, feeds the chain, grants the slipstream boost |
| `crashPlayer` | Ends the drift, the boost and the chain |
| `buildResults`, `drawResults` | Bonus cash, records submitted, a stats line and a four-part cash line |
| `drawTitle` | Style label, best time and wins under the track name |
| `drawHUD` | Live drift points, slipstream chain, speedometer dial scaled to the track's top speed |

**Files:**
- Modify: `web/game.js`, `web/index.html`
- Temporary, not committed: `step2-edits.py`

**Interfaces:**
- Consumes: `RRR.RaceStats` (Task 1), `RRR.Records` (step 1), `def.handling`, `def.scoring`, `def.style`, `def.styleLabel`.
- Produces: `window.__rrr.stats` (the current `RaceStats`) and `window.__rrr.records`; `results` gains `skill` (`{ drift, passes }`), `stats`, `beaten`, `best`.

- [ ] **Step 1: Write the edit script, `step2-edits.py`, at the repo root**

```python
"""One-off edits to the game for race styles. Run from the repo root; every edit asserts that the text it
replaces is there exactly once, so a changed file fails loudly instead of being half-edited. Not committed."""
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)

g = load('web/game.js')

# --- state: this race's stats, the saved records, and the player's boost and drift bookkeeping
g = rep(g, "const unlocked = ORDER.length - 1; // every race is open from the start\n",
  "const unlocked = ORDER.length - 1; // every race is open from the start\n"
  "// stats: this race's drift score and close passes (engine/race-stats.js) · records: per-track bests (engine/records.js)\n"
  "// titleBest: the selected track's records, shown on the title screen\n"
  "const records = new RRR.Records(store);\nlet stats = null, titleBest = null;\n")
g = rep(g, "isPlayer: true, heading: 0, slip: 0, drift: 0, brkWas: false });",
  "isPlayer: true, heading: 0, slip: 0, drift: 0, brkWas: false,\n"
  "    boost: 0, boostT: 0, driftT: 0, driftPts: 0 }); // boost: share of top speed added while boostT lasts · driftT, driftPts: the current drift's time and points")
g = rep(g, "  loadTrack(level);\n  trackEvent(`race-start/${def.city.id}/${def.id}`, `Race started: ${def.name}`);\n",
  "  loadTrack(level);\n  stats = new RRR.RaceStats(def.scoring);\n  trackEvent(`race-start/${def.city.id}/${def.id}`, `Race started: ${def.name} (${def.style})`);\n")
g = rep(g, "      top: MAX_SPEED * clamp(def.rivals.skill * diff", "      top: MAX_SPEED * def.handling.topSpeed * clamp(def.rivals.skill * diff")
g = rep(g, "function attractSetup() {\n  loadTrack(level);\n", "function attractSetup() {\n  loadTrack(level);\n  titleBest = records.get(def.id);\n")

# --- a crash ends the drift, the boost and the chain
g = rep(g, "  player.health = Math.max(0, player.health - dmg); player.atk = null;\n",
  "  player.health = Math.max(0, player.health - dmg); player.atk = null;\n"
  "  player.drift = 0; player.driftT = 0; player.driftPts = 0; player.boostT = 0; if (stats) stats.breakChain();\n")

# --- handling comes from the track's style
g = rep(g, "    player.x -= dx * sp * seg.curve * CENTRIFUGAL;\n",
  "    // a drift into the bend carries the auto round it: on drift tracks less of the bend's outward push gets through\n"
  "    const grip = player.drift && player.drift === Math.sign(seg.curve) ? def.handling.driftGrip : 1;\n"
  "    player.x -= dx * sp * seg.curve * CENTRIFUGAL * grip;\n")
g = rep(g, "    if (player.drift && (!steer || Math.sign(steer) !== player.drift || player.speed < DRIFT_END)) player.drift = 0;\n",
  "    if (player.drift && (!steer || Math.sign(steer) !== player.drift || player.speed < DRIFT_END)) endDrift();\n")
g = rep(g, "    if (player.drift) player.speed -= player.speed * 0.22 * dt;   // tyres scrubbing\n",
  "    if (player.drift) {\n"
  "      player.speed -= player.speed * def.handling.driftScrub * dt;   // tyres scrubbing\n"
  "      player.driftT += dt;\n"
  "      if (controlled && player.speed > DRIFT_END) player.driftPts += stats.drift(dt, player.speed / MAX_SPEED, Math.abs(player.slip) / DRIFT_SLIP);\n"
  "    }\n")
g = rep(g, "  player.speed = clamp(player.speed, 0, MAX_SPEED);\n",
  "  // top speed is the style's, raised for a moment by a boost (a drift exit or a slipstream); above it, speed bleeds off\n"
  "  player.boostT -= dt;\n"
  "  const cap = MAX_SPEED * def.handling.topSpeed * (1 + (player.boostT > 0 ? player.boost : 0));\n"
  "  player.speed = clamp(player.speed, 0, Math.max(cap, player.speed - MAX_SPEED * 0.5 * dt));\n")
g = rep(g, "function updateRivals(dt) {\n",
  "// A drift ends: its points pop up, and one held for DRIFT_HOLD seconds kicks the auto forward on tracks whose\n"
  "// style gives a drift-exit boost.\n"
  "const DRIFT_HOLD = 0.6, BOOST_SECS = 1.2;\n"
  "function endDrift() {\n"
  "  if (player.driftPts >= 10) popup(`DRIFT +${Math.round(player.driftPts)}`, W / 2, H - 250, '#ffd21f', 28);\n"
  "  if (player.driftT >= DRIFT_HOLD && def.handling.driftExitBoost > 0) { player.boost = def.handling.driftExitBoost; player.boostT = BOOST_SECS; Sfx.whoosh(); }\n"
  "  player.drift = 0; player.driftT = 0; player.driftPts = 0;\n"
  "}\n\n"
  "// Lane surfing: overtaking same-way traffic with little room to spare is a close pass. Each one counts in the\n"
  "// race's stats; on tracks whose style has a slipstream it also raises your top speed for a moment, more for\n"
  "// each pass in a quick chain.\n"
  "const CLOSE_GAP = 0.25, PASS_AGAIN = 5; // road units between the two bodies · seconds before the same vehicle counts again\n"
  "function updateClosePasses(dt) {\n"
  "  stats.advance(dt);\n"
  "  for (const c of traffic) {\n"
  "    if (c.dir !== 1) continue; // cows, dogs and oncoming traffic don't count\n"
  "    const dz = wrapDelta(c.z - player.dist), was = c.passDz;\n"
  "    c.passDz = dz; if (c.passCd > 0) c.passCd -= dt;\n"
  "    // it was just ahead and now it isn't (a jump from far ahead is the lap wrapping round, not a pass)\n"
  "    if (!(was > 0 && was < 2000 && dz <= 0) || c.passCd > 0 || player.crash > 0 || player.speed <= c.speed) continue;\n"
  "    const gap = Math.abs(c.x - player.x) - (c.nw + playerW()) / 2;\n"
  "    if (gap < 0 || gap > CLOSE_GAP) continue;\n"
  "    c.passCd = PASS_AGAIN;\n"
  "    const chain = stats.closePass();\n"
  "    if (def.handling.slipstream > 0) { player.boost = def.handling.slipstream * chain; player.boostT = RRR.RaceStats.CHAIN_SECS; }\n"
  "    popup(chain > 1 ? `CLOSE! \\u00d7${chain}` : 'CLOSE!', W / 2 + Math.sign(c.x - player.x) * 150, H - 230, '#80deea', 26);\n"
  "    Sfx.whoosh();\n"
  "  }\n"
  "}\n\n"
  "function updateRivals(dt) {\n")
g = rep(g, "    if (state === 'race') guard('player-physics', checkCollisions);\n",
  "    if (state === 'race') guard('player-physics', checkCollisions);\n    if (state === 'race') guard('player-physics', () => updateClosePasses(dt));\n")
g = rep(g, "  ['player-physics', /^(updatePlayer|crashPlayer|checkCollisions)$/],", "  ['player-physics', /^(updatePlayer|crashPlayer|checkCollisions|endDrift|updateClosePasses)$/],")
g = rep(g, "  ['race-rules', /^(checkFinish|buildResults|advanceAfterResults|setupRace|currentRank|resetPlayer|updateAttract)$/],",
  "  ['race-rules', /^(?:RaceStats\\.|Records\\.)?(checkFinish|buildResults|advanceAfterResults|setupRace|currentRank|resetPlayer|updateAttract|closePass|breakChain|advance|bonuses|summary|submit)$/],")

# --- results: bonuses and records
g = rep(g, "  cash += prize + bonus;\n  results = { order, rank, prize, bonus, qualified: rank <= 3 };\n",
  "  stats.finish(player.finished ? player.time : null, rank);\n"
  "  const skill = stats.bonuses(); // drift and lane-surf cash, at the style's rates\n"
  "  cash += prize + bonus + skill.drift + skill.passes;\n"
  "  // beaten: which of the track's bests this race beat · best: the bests after it\n"
  "  results = { order, rank, prize, bonus, skill, stats, qualified: rank <= 3, beaten: records.submit(def.id, stats.summary()), best: records.get(def.id) };\n")
g = rep(g, "  text(`Prize ${fmtCash(r.prize)}   +   KO bonus ${fmtCash(r.bonus)}   =   ${fmtCash(r.prize + r.bonus)}`, W / 2, by + 8, 16, '#a5d6a7', 'center', 'system-ui, sans-serif');\n  text(`Wallet: ${fmtCash(cash)}`, W / 2, by + 36, 18, '#fff');\n",
  "  const s = r.stats, star = on => (on ? ' \\u2605' : '');\n"
  "  const time = s.time === null ? '\\u2014' : fmtTime(s.time) + (r.beaten.time ? ' \\u2605 NEW BEST' : `  (best ${fmtTime(r.best.bestTime)})`);\n"
  "  text(`Time ${time}   \\u00b7   Drift ${Math.round(s.driftScore)}${star(r.beaten.drift)}   \\u00b7   Close passes ${s.passes}${star(r.beaten.passes)}`, W / 2, by + 4, 14, '#ffcc80', 'center', 'system-ui, sans-serif');\n"
  "  text(`Prize ${fmtCash(r.prize)}  +  KO ${fmtCash(r.bonus)}  +  Drift ${fmtCash(r.skill.drift)}  +  Lane surf ${fmtCash(r.skill.passes)}  =  ${fmtCash(r.prize + r.bonus + r.skill.drift + r.skill.passes)}`, W / 2, by + 28, 15, '#a5d6a7', 'center', 'system-ui, sans-serif');\n"
  "  text(`Wallet: ${fmtCash(cash)}`, W / 2, by + 54, 18, '#fff');\n")
g = rep(g, ": 'ENTER — TRY AGAIN (TOP 3 NEEDED)', W / 2, by + 76, 20, '#ffd21f');", ": 'ENTER — TRY AGAIN (TOP 3 NEEDED)', W / 2, by + 90, 20, '#ffd21f');")
g = rep(g, "  text('ESC — MAIN MENU', W / 2, by + 104, 13, '#ddd');", "  text('ESC — MAIN MENU', W / 2, by + 116, 13, '#ddd');")

# --- title: the track's style and your bests under its name
g = rep(g, "  panel(W / 2 - 250, 408, 500, 34, 0.55);\n", "  panel(W / 2 - 250, 402, 500, 44, 0.55);\n")
g = rep(g, "  text(def.name, W / 2, 425, 16, '#fff');\n",
  "  text(def.name, W / 2, 417, 16, '#fff');\n"
  "  const b = titleBest, wins = b.wins ? `  \\u00b7  ${b.wins} WIN${b.wins > 1 ? 'S' : ''}` : '';\n"
  "  text(`${def.styleLabel}${b.bestTime === null ? '' : `  \\u00b7  BEST ${fmtTime(b.bestTime)}`}${wins}`, W / 2, 435, 11, '#ffcc80');\n")

# --- HUD: the drift in progress, the slipstream chain, and a dial scaled to the track's top speed
g = rep(g, "  text(`KO ${player.kos}`, 190, 80, 12, '#ff8a80', 'right');\n",
  "  text(`KO ${player.kos}`, 190, 80, 12, '#ff8a80', 'right');\n"
  "  if (player.drift && player.driftPts >= 1) text(`DRIFT ${Math.round(player.driftPts)}`, W / 2, 30, 22, '#ffd21f');\n"
  "  if (stats.chain > 1 && def.handling.slipstream > 0) text(`SLIPSTREAM \\u00d7${stats.chain}`, W / 2, 58, 16, '#80deea');\n")
g = rep(g, "  const sp = player.speed / MAX_SPEED;\n  ctx.strokeStyle = sp > 0.85 ? '#ff7043' : '#ffd21f'; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, Math.PI + Math.PI * sp); ctx.stroke();\n  const na = Math.PI + Math.PI * sp; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;\n",
  "  const sp = player.speed / MAX_SPEED, dial = clamp(sp / def.handling.topSpeed, 0, 1); // full dial = this track's top speed\n"
  "  ctx.strokeStyle = player.boostT > 0 ? '#80deea' : dial > 0.85 ? '#ff7043' : '#ffd21f'; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, Math.PI + Math.PI * dial); ctx.stroke();\n"
  "  const na = Math.PI + Math.PI * dial; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;\n")

g = rep(g, "RRR, get def() { return def; }, SP,", "RRR, get def() { return def; }, get stats() { return stats; }, records, SP,")
save('web/game.js', g)

h = load('web/index.html')
h = rep(h, '<script src="engine/records.js"></script>\n', '<script src="engine/records.js"></script>\n<script src="engine/race-stats.js"></script>\n')
save('web/index.html', h)
print('step 2 edits applied')
```

- [ ] **Step 2: Apply it and remove it**

Run: `python3 step2-edits.py && rm step2-edits.py && node --check web/game.js && node --test tests/*.test.js`
Expected: `step 2 edits applied`, no syntax error, `pass 126`. If an assertion fails, read that part of `web/game.js` and report; do not force it.

- [ ] **Step 3: Every track loads with its style**

Reload the `roadrash` preview without cache. If `localStorage.rrr_round` is set, remove it and reload. Run in the page:
```js
const r = window.__rrr, out = [];
for (let i = 0; i < 7; i++) { r.setLevel(i); r.setupRace(); r.step(60);
  out.push([r.def.id, r.def.style, r.segments.length, r.junctions.length, Math.round(Math.max(...r.rivals.map(v => v.top)) / 120) + '%'].join(' ')); }
({ problems: window.RRR.validate(), out })
```
Expected: `problems: []`, no console errors, and
```
marine-drive drift 3320 1 <=102%
charminar-road classic 3410 4 <=102%
sea-link speed 3620 0 up to 128%
ring-road traffic 3770 7 <=102%
western-express traffic 3770 7 <=102%
marina-beach speed 4145 0 up to 128%
juhu-beach drift 4520 2 <=102%
```
The last column is the fastest rival's top speed as a share of 80 km/h; it varies run to run, within those limits.

- [ ] **Step 4: Top speed on a speed track**

```js
const r = window.__rrr, K = r.keys; r.setLevel(2); r.setupRace(); r.step(260); r.traffic.length = 0; r.rivals.length = 0;
r.player.speed = 14800; K.ArrowUp = true; let top = 0; for (let i = 0; i < 120; i++) { r.step(1); top = Math.max(top, r.player.speed); } K.ArrowUp = false; Math.round(top)
```
Expected: `15000` (1.25 × 12000).

- [ ] **Step 5: Drifting is the fast way round a sharp bend**

This drives a stretch with a sharp bend twice on Marine Drive: once sliding, once holding the highest speed that stays on the road without sliding.
```js
const r = window.__rrr, K = r.keys, off = () => { for (const k in K) K[k] = false; };
const start = lvl => { r.setLevel(lvl); r.setupRace(); r.step(260); r.traffic.length = 0; r.rivals.length = 0; off(); };
const bends = () => { const s = r.segments, out = []; for (let i = 300; i < s.length - 300 && out.length < 4; i++) if (Math.abs(s[i].curve) >= 6 && Math.abs(s[i - 1].curve) < 6 && !s.slice(i - 80, i + 160).some(q => q.junction)) { out.push(i); i += 200; } return out; };
const drive = (mode, n) => { start(0); const i = bends()[n], from = (i - 70) * 200; Object.assign(r.player, { dist: from, x: -0.9, speed: mode === 'slow' ? 5800 : 12000, heading: 0 });
  let crashed = false, steps = 0, offroad = 0;
  for (let s = 0; s < 700 && !crashed && r.player.dist - from < 34000; s++) { const p = r.player, seg = r.segments[Math.floor(p.dist / 200) % r.segments.length], dir = Math.abs(seg.curve) > 1.5 ? Math.sign(seg.curve) : 0;
    let steer = 0;
    if (mode === 'drift' && dir) steer = (dir > 0 ? p.x > -0.25 : p.x < -(seg.half - 0.5)) ? 0 : dir; // ease off when too far inside
    else { const want = (-0.9 - p.x) * 3 + dir * 0.8; steer = want > 0.2 ? 1 : want < -0.2 ? -1 : 0; }
    K.ArrowUp = mode === 'slow' ? p.speed < 5800 : true; K.ArrowRight = steer > 0; K.ArrowLeft = steer < 0;
    K.Space = mode === 'drift' && steer !== 0 && !p.drift && s % 2 === 0; r.step(1); steps++;
    if (Math.abs(p.x) > seg.half) offroad++; crashed = p.crash > 0; }
  off(); return [mode, crashed ? 'CRASHED' : 'ok', (steps / 60).toFixed(1) + 's', 'offroad ' + offroad, 'pts ' + Math.round(r.stats.driftScore)].join(' '); };
[0, 1, 2].flatMap(n => [drive('drift', n), drive('slow', n)])
```
Expected: every run `ok` with `offroad 0`; each `drift` run takes about 2.9 s and scores points; each `slow` run takes about 6 s and scores 0.

- [ ] **Step 6: Close passes, the chain and the slipstream**

```js
const r = window.__rrr, K = r.keys, off = () => { for (const k in K) K[k] = false; };
const go = (lvl, gaps) => { r.setLevel(lvl); r.setupRace(); r.step(260); const car = r.traffic.find(t => t.type === 'car' && t.dir === 1); r.traffic.length = 0; r.rivals.length = 0; off();
  const s = r.segments; let at = 400; while (!s.slice(at, at + 150).every(q => q.curve === 0 && !q.junction && q.lanes === 3)) at++;
  Object.assign(r.player, { dist: at * 200, speed: 12000, heading: 0, x: -0.9 + (car.nw + 0.27) / 2 + gaps[0] });
  gaps.forEach((g, k) => r.traffic.push({ ...car, z: r.player.dist + 1500 + k * 2500, lane: 1, x: -0.9, speed: 4000, passCd: 0, passDz: undefined }));
  K.ArrowUp = true; let top = 0; for (let i = 0; i < 150; i++) { r.step(1); top = Math.max(top, r.player.speed); } off();
  return [r.def.style, 'passes ' + r.stats.passes, 'chain ' + r.stats.bestChain, 'top ' + Math.round(top)].join(' '); };
[go(4, [0.1]), go(4, [0.5]), go(4, [0.1, 0.1, 0.1]), go(1, [0.1, 0.1])]
```
Expected:
```
traffic passes 1 chain 1 top 12480
traffic passes 0 chain 0 top 12000
traffic passes 3 chain 3 top 13440
classic passes 2 chain 2 top 12000
```
A pass with 0.1 road units to spare counts and one with 0.5 does not; on the traffic style each pass in the chain adds 4% to top speed; on classic the passes count but give no boost.

- [ ] **Step 7: Results, records and the title screen**

```js
localStorage.removeItem('rrr_records');
const r = window.__rrr; r.setLevel(4); r.setupRace(); r.step(300);
for (let i = 0; i < 4; i++) r.stats.closePass(); r.stats.drift(1.2, 1, 1);
r.player.dist = r.segments.length * 200 + 6000; r.step(300);
({ state: r.state, rank: r.results.rank, skill: r.results.skill, beaten: r.results.beaten, saved: localStorage.getItem('rrr_records') })
```
Expected: `state: 'results'`, `rank: 1`, `skill: { drift: 24, passes: 100 }`, all three `beaten` flags true, and `saved` holding `western-express` with `bestDrift: 120`, `bestPasses: 4`, `wins: 1` and a `bestTime`.

Take a screenshot. Under the finishing order it must read `Time 0:0x.x ★ NEW BEST · Drift 120 ★ · Close passes 4 ★`, then `Prize ₹1,500 + KO ₹0 + Drift ₹24 + Lane surf ₹100 = ₹1,624`, the wallet, and the two prompts, none overlapping.

Then:
```js
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); window.__rrr.setLevel(4); window.__rrr.step(2); window.__rrr.state
```
Expected: `'title'`. Take a screenshot: under `MUMBAI · WESTERN EXPRESS HIGHWAY` it must read `TRAFFIC · BEST 0:0x.x · 1 WIN`, clear of the controls card above and `PRESS ENTER TO RACE` below. Finish with `localStorage.removeItem('rrr_records')`.

- [ ] **Step 8: The same in 2D**

Load the preview with `?2d` and repeat Steps 3 and 6.
Expected: the same results and no console errors.

- [ ] **Step 9: Commit**

```bash
git status --short   # web/game.js and web/index.html only; step2-edits.py must not be listed
git add web/game.js web/index.html
git commit -m "Game: style handling, close passes and slipstream, drift score, per-track records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Play each style and tune

Note, added after execution: Tasks 1 to 4 and 6 are done, and a review fix pass changed some values this plan shows above: `CLOSE_GAP` is 0.15, stopped and just-touched vehicles do not count as close passes, drift points and the exit boost accrue only while sliding into a bend, and the HUD labels sit at y 90 and 114. `web/game.js` is the source of truth. Step 1 of this task (both renderers at sharpness 8) is done.

The numbers so far were checked with scripted driving, which cannot judge feel. This task needs a person at the keyboard; if you are an agent that cannot play in real time, do Step 1, then stop and ask the user to do Steps 2 and 3.

**Files:**
- Modify (only if tuning is needed): `web/styles/speed.js`, `web/styles/drift.js`, `web/styles/traffic.js`

- [ ] **Step 1: Check both renderers draw the sharpest bends**

Bends of sharpness 8 are new (the classic maximum is 6). Load Marine Drive in 3D and in `?2d`, and in each run `window.__rrr.setLevel(0); window.__rrr.setupRace();` then drive (or step) through the first sharp bend and take a screenshot mid-bend.
Expected: the road, verges and roadside buildings draw without gaps or flicker. If 3D shows the road crossing over itself, lower `curves: [6, 8]` in `web/styles/drift.js` to `[6, 7]` and the `sCurve` piece's `curve: 4` to `3.5`, then change the `sharpest(road)` expectation in `tests/styles.test.js` to match.

- [ ] **Step 2: Race one full race per style**

Race Sea Link (speed), Marine Drive (drift), Western Express (traffic) and Charminar Road (classic) to the finish. For each, note: could you finish in the top 3; did the style's trick (top speed, drifting, close passes) decide it; did anything feel unfair.

- [ ] **Step 3: Tune by the numbers, in the style files only**

| If | Change |
| --- | --- |
| Speed tracks feel no faster | Raise `topSpeed` (1.25) towards 1.35 |
| You tip over on speed-track bends | Lower the `curve` piece's `curves` from `[1, 2, 3]` to `[1, 2]` |
| Drifting runs you into the inside of bends | Raise `driftGrip` (0.25) towards 0.45 |
| Drifting still runs wide | Lower `driftGrip` towards 0.15 |
| Rivals are untouchable on drift tracks without drifting | That is intended; if it is too harsh lower `curves` to `[5, 7]` |
| The slipstream is too strong or too weak | Change `slipstream` (0.04 per pass) |
| Traffic tracks are a wall of vehicles | Lower `countScale` (1.6) towards 1.3 |
| Close passes are too hard to get | Not a style value: raise `CLOSE_GAP` (0.15) in `web/game.js` towards 0.25 |
| Close passes are too easy (they come without trying) | Lower `CLOSE_GAP` towards 0.1 |

After any change run `node --test tests/*.test.js`; `tests/styles.test.js` pins `topSpeed: 1.25` for speed and sharpness 8 for drift, so update those expectations with the values.

- [ ] **Step 4: Commit any tuning**

```bash
git add web/styles tests/styles.test.js web/game.js
git commit -m "Styles: tuning after play-testing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Skip the commit if nothing changed.

---

### Task 6: README and the Mac app

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Describe the styles in the README**

In the `## Gameplay` list, after the bullet `All 7 races are open from the start: ...`, add:
```markdown
- Every race has a style, shown under its name on the title screen:
  - **Speed** (Sea Link, Marina Beach Road): long straights, gentle bends, no junctions and light traffic. The autos are tuned for 100 km/h.
  - **Drift** (Marine Drive, Juhu Beach Road): tight bends one after another. A held drift keeps your speed, carries you round the bend and gives a short boost on the way out. Flat out without sliding, you run wide or tip over.
  - **Traffic** (Western Express Highway, Ring Road): a wide road packed with traffic. Pass a vehicle closely and you get a slipstream; passes in quick succession stack it up to 5 times.
  - **Classic** (Charminar Road): the original mix.
- The first across the line wins on every style. Each track also keeps your best time, best drift score, most close passes and wins, and the results screen marks a new best with a star.
- Drifting and close passes pay a cash bonus on the results screen.
```

In the `## Tracks, cities and styles` section, replace the Style row of the table with:
```markdown
| Style | `web/styles/<id>.js` | How the road is put together, the traffic mix, the handling numbers (top speed, drift, slipstream) and the cash rates |
```

- [ ] **Step 2: Build and launch the Mac app**

Run: `./build.sh && ls "build/Road Rash.app/Contents/Resources/web/styles" "build/Road Rash.app/Contents/Resources/web/engine" && open "build/Road Rash.app"`
Expected: four style files; `race-stats.js` among the engine files. The title screen shows a style label under the track name. If you cannot see the app's window, say so in your report.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README: race styles and records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Release

Same procedure as step 1's release, with a minor version. Do it after the branch is merged to `main`, from a worktree on `main`, reading the current version at that moment.

**Files:**
- Modify: `web/game.js` (`GAME_VERSION`), `macos/Info.plist`, `CHANGELOG.md`, `Casks/roadrash.rb`

- [ ] **Step 1: Work from a worktree on `main` and read the current version**

```bash
set -euo pipefail
git fetch origin
git worktree add ../release-track-styles origin/main -b release-track-styles 2>/dev/null || true
cd ../release-track-styles && git branch --show-current
grep -n "GAME_VERSION = " web/game.js && git tag --sort=-v:refname | head -1 && ls web/styles
```
The new version is the next minor after `GAME_VERSION` (for example `3.3.5` becomes `3.4.0`). `web/styles` must list four files.

- [ ] **Step 2: Bump the version and write the changelog entry**

Set `GAME_VERSION` in `web/game.js` and both `CFBundleShortVersionString` and `CFBundleVersion` in `macos/Info.plist`. Add at the top of `CHANGELOG.md`, with the real version:
```markdown
## vX.Y.0: Race styles

- **Every race now has a style,** shown under its name on the title screen:
  - **Speed** (Sea Link, Marina Beach Road): long straights and gentle bends with no junctions and light traffic, and the autos run to 100 km/h.
  - **Drift** (Marine Drive, Juhu Beach Road): tight bends one after another. A held drift keeps your speed, carries you round the bend and kicks you forward on the way out.
  - **Traffic** (Western Express Highway, Ring Road): a wide road packed with traffic. A close pass gives a slipstream, and quick passes stack it up to 5 times.
  - **Classic** (Charminar Road): the original mix.
- **Records per track:** your best time, best drift score, most close passes and wins are saved. The results screen marks a new best with a star.
- **Drift and lane-surf bonuses:** drifting and close passes pay cash on the results screen.
- **The first across the line still wins** on every style, and the top 3 qualify.
```

- [ ] **Step 3: Test, commit and push**

```bash
set -euo pipefail
node --test tests/*.test.js
git add web/game.js macos/Info.plist CHANGELOG.md
git commit -m "vX.Y.0: race styles (speed, drift, traffic), per-track records, drift and lane-surf bonuses

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin HEAD:main
```

- [ ] **Step 4: Deploy the web build and confirm it is live**

```bash
set -euo pipefail
./deploy-web.sh
sleep 90
curl -s https://shankyty.github.io/Roadrash/game.js | grep -o "GAME_VERSION = '[0-9.]*'"
curl -s -o /dev/null -w "%{http_code}\n" https://shankyty.github.io/Roadrash/styles/drift.js
```
Expected: the new version, and `200`.

- [ ] **Step 5: Build, publish the DMG and update the cask**

```bash
set -euo pipefail
./build.sh && ./make-dmg.sh
gh release create vX.Y.0 build/RoadRash.dmg --title "vX.Y.0" --notes "Race styles: speed, drift and traffic tracks, per-track records, drift and lane-surf bonuses."
curl -sL -o /tmp/RoadRash.dmg https://github.com/shankyty/Roadrash/releases/download/vX.Y.0/RoadRash.dmg
shasum -a 256 build/RoadRash.dmg /tmp/RoadRash.dmg
```
Expected: the two hashes match. Set `version` and `sha256` in `Casks/roadrash.rb`, then:
```bash
set -euo pipefail
git add Casks/roadrash.rb
git commit -m "Cask: vX.Y.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin HEAD:main
```

- [ ] **Step 6: Confirm Homebrew upgrades**

```bash
brew update && brew upgrade --cask roadrash && brew info --cask roadrash | head -3
```
Expected: the installed version is the new one. Then remove the release worktree: `cd - && git worktree remove ../release-track-styles`.
