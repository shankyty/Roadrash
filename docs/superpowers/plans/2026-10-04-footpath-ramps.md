# Driveable Footpaths and Cart Ramps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every track a raised footpath the auto can drive on, with a speed cost for crossing the kerb, chai stalls blocking it, and a parked hand cart before each stall that works as a ramp: the auto jumps in the direction it is pointing. Jumps pay cash, and the daring rival drivers use the footpath too.

**Architecture:** The rules (which band of the road a position is in, kerb crossings, take-off, the flight) are pure functions in a new DOM-free file, `web/engine/footpath.js`. The footpath is config on each style's road recipe; the track builder places stalls and carts with its own seeded generator, so existing roads do not change. `web/game.js` and `web/world3d.js` read the config and call the rules.

**Tech Stack:** Classic browser scripts (no build step, no modules), Three.js r149 (unchanged), Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-04-footpath-ramps-design.md`

## Global Constraints

- No build step and no packages. Packs register on `RRR`; no `fetch`, no runtime JSON, no ES modules (the Mac app loads `index.html` from `file://`).
- Files under `web/engine/` touch no DOM, so they run under Node. Tests: `node --test tests/*.test.js`.
- A style contains numbers only. `web/game.js` does not branch on a style id.
- With `footpath: false` the builder produces exactly today's road. `tests/golden-roads.test.js` runs that way and must keep passing; never edit files under `tests/golden/`.
- The footpath pass uses its own seeded generator (`mulberry32(seed × 7 + round)`). It never draws from the road's generator.
- The numbers in this plan (kerb costs, jump air time, stall spacing, cash) are starting values that were checked with scripted driving. Do not tune them while executing; the user tunes them by playing.
- The edit scripts in Tasks 2 to 6 are temporary: run each once from the repo root, delete it, and never commit it. Each edit asserts that the text it replaces exists exactly once. If an assertion fails, restore the files with `git checkout` and report it; do not weaken or bypass the assertion.
- Do not split or tidy the rest of `web/game.js` or `web/world3d.js`. Match their style: dense one-line statements, short comments that say why.
- Other sessions release from `main` at the same time. Work only in this worktree; never switch branches in the main checkout.
- End each commit message with the attribution trailer your own session specifies.

## File Structure

| File | Responsibility |
| --- | --- |
| `web/engine/footpath.js` (new) | `RRR.footpath`: zones, kerb crossing, take-off test, jump flight, furniture shift, and the cart and jump constants |
| `web/engine/registry.js` | Validates `road.footpath` and the jump cash rates; merges a track's footpath overrides per key |
| `web/engine/race-stats.js` | Counts jumps and flyovers; adds jump cash to the bonuses |
| `web/engine/track-builder.js` | Footpath pass (stalls and carts); moves street furniture behind the footpath |
| `web/styles/*.js` | Each style's footpath settings and jump cash rates |
| `web/game.js` | Kerb cost, the player's jump, collisions with carts and stalls, results, the 2D footpath and airborne sprite, daring rivals on the footpath |
| `web/world3d.js` | Raised footpath and kerb faces, the hand cart model, autos lifted on the footpath and in a jump |
| `web/index.html` | Loads `engine/footpath.js` |
| `tests/footpath.test.js` (new), other tests | Rules; validation; builder placement; style spacing |

Terms used throughout: distances across the road are in road units (one lane is 0.6). `half` is a segment's half-width. The kerb line is at `half + 1/6`; the footpath runs from there to `half + 1/6 + width`. A segment is 200 track units long; 80 km/h is 12,000 track units a second.

---

### Task 1: Footpath rules

**Files:**
- Create: `web/engine/footpath.js`
- Test: `tests/footpath.test.js`

**Interfaces:**
- Produces `RRR.footpath` with:
  - `KERB_W` (1/6); `CART = { lead: 8, length: 4, width: 0.4, takeoff: 0.2, runout: 100 }`; `STALL_W` (0.6); `JUMP = { minSpeed: 0.375, airBase: 0.35, airPerSpeed: 0.75, peak: 450, landLoss: 0.05 }`
  - `kerbLine(half)`, `backEdge(half, fp)`, `centre(half, fp)`: road units from the centre line
  - `zoneAt(half, fp, x, flat = false)`: `'road' | 'footpath' | 'grass'`
  - `kerbCrossing(half, fp, x0, x1, flat = false)`: `'climb' | 'drop' | null`
  - `takesOff(cartX, x, speedShare)`: boolean
  - `jump(speedShare)`: `{ airTime, peak }`; `heightAt(jump, t)`: track units
  - `furnitureShift(fp)`: road units
  - `fp` is a footpath settings object `{ width, climbLoss, dropLoss, stallEvery }` or `false`; `speedShare` is speed ÷ 12,000.

- [ ] **Step 1: Write the failing test, `tests/footpath.test.js`**

```js
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/footpath.test.js`
Expected: FAIL, `Cannot find module '.../web/engine/footpath.js'`.

- [ ] **Step 3: Write `web/engine/footpath.js`**

```js
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
const CART = { lead: 8, length: 4, width: 0.4, takeoff: 0.2, runout: 100 };
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
const furnitureShift = fp => (fp ? KERB_W + fp.width - 0.07 : 0);

RRR.footpath = { KERB_W, CART, STALL_W, JUMP, kerbLine, backEdge, centre, zoneAt, kerbCrossing, takesOff, jump, heightAt, furnitureShift };
})();
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/footpath.test.js && node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: 12 pass in the first run; `pass 144`, `fail 0` for the whole suite.

- [ ] **Step 5: Commit**

```bash
git add web/engine/footpath.js tests/footpath.test.js
git commit -m "Engine: footpath rules (zones, kerb, take-off, jump flight)"
```

---

### Task 2: Footpath config, validation and jump cash

**Files:**
- Modify: `web/engine/registry.js`, `web/engine/race-stats.js`, `web/styles/classic.js`, `web/styles/speed.js`, `web/styles/drift.js`, `web/styles/traffic.js`
- Test: `tests/registry.test.js`, `tests/race-stats.test.js`
- Temporary, not committed: `fp-edits-config.py`

**Interfaces:**
- Produces:
  - Every resolved definition has `def.road.footpath`: `false`, or `{ width, climbLoss, dropLoss, stallEvery: [low, high] }`. A track's `road.footpath` object overrides its style's per key; `false` switches the footpath off.
  - `def.scoring.jumpCash`, `def.scoring.flyoverCash`.
  - `RaceStats`: `jump(flyover)`, fields `jumps` and `flyovers`, and `bonuses()` returning `{ drift, passes, jumps }`. `summary()` is unchanged.
  - Style values: all four styles use `width: 0.6, climbLoss: 0.25, dropLoss: 0.12`, `jumpCash: 15`, `flyoverCash: 40`; `stallEvery` is `[150, 300]` for classic and drift, `[250, 450]` for speed, `[120, 220]` for traffic.

- [ ] **Step 1: Update the test fixtures**

In `tests/registry.test.js`, in the `style()` helper, replace
```js
  road: { lengths: [25], pieces: [{ kind: 'straight', weight: 1 }], lanes: 'alternate', junctions: true },
```
with
```js
  road: { lengths: [25], pieces: [{ kind: 'straight', weight: 1 }], lanes: 'alternate', junctions: true,
    footpath: { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [150, 300] } },
```
and replace
```js
  scoring: { driftCashPer100: 0, passCash: 0 } });
```
with
```js
  scoring: { driftCashPer100: 0, passCash: 0, jumpCash: 0, flyoverCash: 0 } });
```

In `tests/race-stats.test.js`, replace
```js
const stats = () => new RaceStats({ driftCashPer100: 40, passCash: 25 });
```
with
```js
const stats = () => new RaceStats({ driftCashPer100: 40, passCash: 25, jumpCash: 15, flyoverCash: 40 });
```
and replace
```js
  assert.deepStrictEqual(s.bonuses(), { drift: 100, passes: 75 });
```
with
```js
  assert.deepStrictEqual(s.bonuses(), { drift: 100, passes: 75, jumps: 0 });
```

- [ ] **Step 2: Add the new tests**

Append to the end of `tests/registry.test.js`:
```js
test('a track overrides its style\'s footpath per key, or switches it off', () => {
  const RRR = fresh();
  const narrow = track(); narrow.id = 'narrow'; narrow.road = { footpath: { stallEvery: [50, 60] } };
  const none = track(); none.id = 'none'; none.road = { footpath: false };
  RRR.tracks.register(narrow); RRR.tracks.register(none);
  assert.deepStrictEqual(RRR.resolve('narrow').road.footpath, { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [50, 60] });
  assert.strictEqual(RRR.resolve('none').road.footpath, false);
  assert.deepStrictEqual(RRR.resolve('fc-road').road.footpath, { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [150, 300] });
  RRR.manifest.tracks.push('narrow', 'none');
  assert.deepStrictEqual(RRR.validate(), []);
});
test('validate reports footpath settings that are missing, out of range or mistyped', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.road = { footpath: { width: 0, climbLoss: 1, dropLoss: -0.1, stallEvery: [300, 150], widht: 1 } }; }), [
    'track "changed".road.footpath.width: must be a number above 0',
    'track "changed".road.footpath.climbLoss: must be a share from 0 up to 1',
    'track "changed".road.footpath.dropLoss: must be a share from 0 up to 1',
    'track "changed".road.footpath.stallEvery: must be two numbers above 0, low then high',
    'track "changed".road.footpath.widht: unknown key',
  ]);
  assert.deepStrictEqual(withTrack(fresh(), t => { t.road = { footpath: 'wide' }; }), ['track "changed".road.footpath: must be false or footpath settings']);
});
test('validate reports a style without a footpath setting or jump cash rates', () => {
  const RRR = fresh();
  const bare = style(); bare.id = 'bare'; delete bare.road.footpath; delete bare.scoring.jumpCash; delete bare.scoring.flyoverCash;
  RRR.styles.register(bare); RRR.manifest.styles.push('bare');
  assert.deepStrictEqual(RRR.validate(), ['style "bare".road.footpath: missing', 'style "bare".scoring.jumpCash: missing', 'style "bare".scoring.flyoverCash: missing']);
});
```

Append to the end of `tests/race-stats.test.js`:
```js
test('jumps count, and a flyover pays its own rate in place of the plain jump\'s', () => {
  const s = stats();
  s.jump(false); s.jump(false); s.jump(true);
  assert.deepStrictEqual([s.jumps, s.flyovers], [3, 1]);
  assert.strictEqual(s.bonuses().jumps, 2 * 15 + 40);
});
test('jumps are not part of what the records keep', () => {
  const s = stats();
  s.jump(true);
  assert.deepStrictEqual(s.summary(), { time: null, rank: null, driftScore: 0, passes: 0 });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `pass 128`, `fail 21` (the registry rejects the unknown `footpath` and cash keys; `RaceStats` has no `jump`).

- [ ] **Step 4: Write the edit script, `fp-edits-config.py`, at the repo root**

```python
"""One-off edits for the footpath's config: the pack shape and validation (web/engine/registry.js), jump cash
(web/engine/race-stats.js) and the four styles. Run from the repo root; every edit asserts that the text it
replaces is there exactly once. Not committed."""
import re
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)

r = load('web/engine/registry.js')
r = rep(r, "const ROAD = { lengths: 'array', pieces: 'array', lanes: 'string', junctions: 'boolean' };",
  "const ROAD = { lengths: 'array', pieces: 'array', lanes: 'string', junctions: 'boolean', footpath: 'any' }; // footpath: settings or false, see checkFootpath")
r = rep(r, "const SCORING = { driftCashPer100: 'number', passCash: 'number' };",
  "const SCORING = { driftCashPer100: 'number', passCash: 'number', jumpCash: 'number', flyoverCash: 'number' };")
r = rep(r, "  if (typeof shape === 'string') { if (typeOf(value) !== shape)", "  if (shape === 'any') return;\n  if (typeof shape === 'string') { if (typeOf(value) !== shape)")
r = rep(r, "function checkMerged(road, traffic, where, problems) {\n  if (!['alternate', 'wide'].includes(road.lanes)) problems.push(`${where}.road.lanes: must be 'alternate' or 'wide'`);\n",
  "function checkMerged(road, traffic, where, problems) {\n  if (!['alternate', 'wide'].includes(road.lanes)) problems.push(`${where}.road.lanes: must be 'alternate' or 'wide'`);\n  checkFootpath(road.footpath, `${where}.road.footpath`, problems);\n")
r = rep(r, "function checkScenery(scenery, where, problems) {",
  """// a track's footpath: false for none, or how wide it is, what the kerb costs and how far apart the stalls stand
function checkFootpath(fp, where, problems) {
  if (fp === false) return;
  if (typeOf(fp) !== 'object') { problems.push(`${where}: must be false or footpath settings`); return; }
  const share = v => Number.isFinite(v) && v >= 0 && v < 1, gap = fp.stallEvery;
  if (!(Number.isFinite(fp.width) && fp.width > 0)) problems.push(`${where}.width: must be a number above 0`);
  for (const k of ['climbLoss', 'dropLoss']) if (!share(fp[k])) problems.push(`${where}.${k}: must be a share from 0 up to 1`);
  if (!(Array.isArray(gap) && gap.length === 2 && gap.every(n => Number.isFinite(n) && n > 0) && gap[0] <= gap[1]))
    problems.push(`${where}.stallEvery: must be two numbers above 0, low then high`);
  for (const key of Object.keys(fp)) if (!['width', 'climbLoss', 'dropLoss', 'stallEvery'].includes(key)) problems.push(`${where}.${key}: unknown key`);
}
function checkScenery(scenery, where, problems) {""")
r = rep(r, "      checkMerged({ ...style.road, ...t.road }, { ...style.traffic, ...t.traffic }, where, problems);",
  "      checkMerged(mergeRoad(style.road, t.road), { ...style.traffic, ...t.traffic }, where, problems);")
r = rep(r, "    road: { ...style.road, ...track.road }, traffic: { ...style.traffic, ...track.traffic },",
  "    road: mergeRoad(style.road, track.road), traffic: { ...style.traffic, ...track.traffic },")
r = rep(r, "function deepFreeze(o) {", """// a style's road with a track's overrides, per key; the footpath's own keys merge too, and false switches it off
function mergeRoad(base, over = {}) {
  const road = { ...base, ...over }, fp = over.footpath;
  if (typeOf(fp) === 'object' && typeOf(base.footpath) === 'object') road.footpath = { ...base.footpath, ...fp };
  return road;
}
function deepFreeze(o) {""")
save('web/engine/registry.js', r)

s = load('web/engine/race-stats.js')
s = rep(s, "  // scoring: the track definition's { driftCashPer100, passCash }", "  // scoring: the track definition's { driftCashPer100, passCash, jumpCash, flyoverCash }")
s = rep(s, "this.chainT = 0; this.time = null; this.rank = null;", "this.chainT = 0; this.jumps = 0; this.flyovers = 0; this.time = null; this.rank = null;")
s = rep(s, "  advance(dt) {", "  // a jump off a cart; flyover: it left the footpath, passed over a vehicle and came down in the road\n  jump(flyover) { this.jumps++; if (flyover) this.flyovers++; }\n  advance(dt) {")
s = rep(s, "  bonuses() { return { drift: Math.round(this.driftScore / 100 * this.scoring.driftCashPer100), passes: this.passes * this.scoring.passCash }; }",
  "  // a flyover pays its own rate in place of the plain jump's\n  bonuses() {\n    const s = this.scoring;\n    return { drift: Math.round(this.driftScore / 100 * s.driftCashPer100), passes: this.passes * s.passCash,\n      jumps: (this.jumps - this.flyovers) * s.jumpCash + this.flyovers * s.flyoverCash };\n  }")
save('web/engine/race-stats.js', s)

# the four styles: a footpath (stalls closest on traffic tracks, furthest apart on speed tracks) and jump cash
for st, gap in [('classic', '[150, 300]'), ('drift', '[150, 300]'), ('speed', '[250, 450]'), ('traffic', '[120, 220]')]:
    p = f'web/styles/{st}.js'; t = load(p)
    m = re.search(r"    junctions: (true|false),\n", t); assert m, st
    if st == 'classic':
        add = ("    footpath: {                          // a raised, driveable footpath on both sides (false for none)\n"
               "      width: 0.6,                        // road units (one lane)\n"
               "      climbLoss: 0.25,                   // share of speed lost climbing the kerb\n"
               "      dropLoss: 0.12,                    // share lost dropping off it\n"
               "      stallEvery: " + gap + ",            // segments between stalls on each side (a cart ramp stands before each)\n"
               "    },\n")
    else:
        add = "    footpath: { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: " + gap + " },\n"
    t = t.replace(m.group(0), m.group(0) + add)
    m2 = re.search(r"passCash: (\d+) \}", t); assert m2, st
    t = t.replace(m2.group(0), f"passCash: {m2.group(1)}, jumpCash: 15, flyoverCash: 40 }}")
    if st == 'classic': t = rep(t, "   // rupees per 100 drift points, and per close pass", "   // rupees per 100 drift points, per close pass, per jump and per flyover")
    save(p, t)
print('footpath config edits applied')
```

- [ ] **Step 5: Apply it and remove it**

Run: `python3 fp-edits-config.py && rm fp-edits-config.py && node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `footpath config edits applied`, then `pass 149`, `fail 0`.

Open `web/styles/traffic.js` and confirm it now has `footpath: { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [120, 220] },` after `junctions: true,` and `jumpCash: 15, flyoverCash: 40` in `scoring`.

- [ ] **Step 6: Commit**

```bash
git status --short   # fp-edits-config.py must not be listed
git add web/engine/registry.js web/engine/race-stats.js web/styles tests/registry.test.js tests/race-stats.test.js
git commit -m "Styles: footpath settings and jump cash; validation and jump counting"
```

---

### Task 3: The builder places stalls and carts

**Files:**
- Modify: `web/engine/track-builder.js`, `tests/stub-sprites.js`, `tests/build-world.js`, `tests/load-game.js`, `tests/golden-roads.test.js`
- Test: `tests/track-builder.test.js`, `tests/styles.test.js`
- Temporary, not committed: `fp-edits-builder.py`

**Interfaces:**
- Consumes: `RRR.footpath` (Task 1), `def.road.footpath` (Task 2).
- Produces, on a built road with a footpath:
  - A stall: a sprite in `segments[n].sprites` with `kind: 'chai'`, `onPath: true`, `solid: true`, `nw: 0.6`, standing in the middle of the footpath.
  - Its cart: a sprite in `segments[n - 8].sprites` with `kind: 'cart'`, `onPath: true`, `solid: true`, `nw: 0.4`, `len: 800`, `seg0: n - 8`, also in the middle of the footpath. It is in `solids` of the 4 segments it covers.
  - For both, `offset` is the inner edge (nearest the road); the centre is `offset + sign(offset) × nw / 2`.
  - From 4 segments before a cart to 100 after it, no segment is a junction, in a junction's clear zone, a lane taper or the start line.
  - Every other roadside sprite stands `RRR.footpath.furnitureShift(fp)` further out than without a footpath.

- [ ] **Step 1: Make the test helpers load the rules and know the cart sprite**

In `tests/stub-sprites.js` change `'arch', 'signal', 'cop', 'bus', 'truck']` to `'arch', 'signal', 'cop', 'bus', 'truck', 'cart']`.

In `tests/build-world.js` change `['util', 'registry', 'track-builder', 'traffic-spawner']` to `['util', 'registry', 'footpath', 'track-builder', 'traffic-spawner']`.

In `tests/load-game.js` change `'engine/registry.js', 'engine/track-builder.js'` to `'engine/registry.js', 'engine/footpath.js', 'engine/track-builder.js'`.

In `tests/golden-roads.test.js` replace
```js
    const def = RRR.resolveDef({ ...base, style: 'classic', traffic: { count, cows, dogs } });
```
with
```js
    // (and without the footpath, whose stalls and carts came later: the road, scenery and signs must not have moved)
    const def = RRR.resolveDef({ ...base, style: 'classic', road: { footpath: false }, traffic: { count, cows, dogs } });
```

- [ ] **Step 2: Add the new tests**

Append to the end of `tests/track-builder.test.js`:
```js
// ---- the footpath: stalls, cart ramps and where the street furniture goes
const FP = { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [150, 300] };
const F = RRR.footpath;
const onPath = (road, kind) => road.segments.flatMap((s, n) => s.sprites.filter(q => q.onPath && q.kind === kind).map(q => ({ n, q })));

test('with a footpath, every stall has a cart ramp a fixed way before it, on the same side', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } })), stalls = onPath(road, 'chai'), carts = onPath(road, 'cart');
  assert.ok(stalls.length >= 6, `only ${stalls.length} stalls`);
  assert.strictEqual(carts.length, stalls.length);
  for (const { n, q } of stalls) {
    const cart = carts.find(c => c.n === n - F.CART.lead && Math.sign(c.q.offset) === Math.sign(q.offset));
    assert.ok(cart, `no cart before the stall at ${n}`);
    assert.strictEqual(cart.q.seg0, cart.n);
    assert.ok(q.solid && cart.q.solid);
  }
  assert.ok(stalls.some(s => s.q.offset < 0) && stalls.some(s => s.q.offset > 0)); // both sides
});
test('stalls and carts stand in the middle of the footpath and block the segments they cover', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } }));
  for (const { n, q } of [...onPath(road, 'chai'), ...onPath(road, 'cart')]) {
    const half = road.segments[n].half, mid = Math.abs(q.offset) + q.nw / 2;
    assert.ok(Math.abs(mid - F.centre(half, FP)) < 1e-9, `${q.kind} at ${n} is off centre`);
    const span = q.kind === 'cart' ? F.CART.length : 1;
    for (let k = 0; k < span; k++) assert.ok(road.segments[n + k].solids.includes(q));
  }
});
test('from just before a cart to well past its stall the road is plain: no junction, no lane taper, no start line', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } }));
  for (const { n } of onPath(road, 'cart'))
    for (let k = n - 4; k <= n + F.CART.runout; k++) { const s = road.segments[k]; assert.ok(!s.junction && !s.clear && !s.finish && s.hw1 === s.hw2); }
});
test('the longest straight jump lands inside that plain stretch', () => {
  // 100 km/h is 15000 track units a second; the run-out is counted in segments of 200
  const flown = 15000 * F.jump(1.25).airTime;
  assert.ok(flown < F.CART.runout * 200, `${Math.round(flown)} flown`);
});
test('nothing but stalls and carts stands on the footpath', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } }));
  road.segments.forEach((s, n) => {
    for (const q of s.sprites) {
      if (q.center || q.onPath || !q.solid) continue;
      // buildings and temples have their front wall at the offset; everything else has its inner edge there
      assert.ok(Math.abs(q.offset) >= F.backEdge(s.half, FP), `${q.kind} at ${n} stands on the footpath`);
    }
  });
});
test('the footpath has its own seed: the same tour builds the same one, a later tour another, and the road itself never moves', () => {
  const spots = road => onPath(road, 'chai').map(s => `${s.n}${s.q.offset < 0 ? 'L' : 'R'}`).join();
  const def = testDef({ road: { footpath: FP } });
  assert.strictEqual(spots(buildRoad(def)), spots(buildRoad(def)));
  assert.notStrictEqual(spots(buildRoad(def)), spots(buildRoad(def, { round: 1 })));
  const shape = road => road.segments.map(s => `${s.curve}/${s.lanes}/${s.sprites.filter(q => !q.onPath).map(q => q.kind).join('+')}`).join();
  assert.strictEqual(shape(buildRoad(def)), shape(buildRoad(testDef())));
});
test('without a footpath there are no stalls or carts and furniture stands where it always did', () => {
  const road = buildRoad(testDef());
  assert.strictEqual(onPath(road, 'chai').length + onPath(road, 'cart').length, 0);
  const lamp = road.segments.flatMap(s => s.sprites.filter(q => q.kind === 'lamp').map(q => Math.abs(q.offset) - s.half))[0];
  assert.ok(Math.abs(lamp - 0.12) < 1e-9);
});
test('closer stall spacing puts more stalls on the road', () => {
  const count = every => onPath(buildRoad(testDef({ road: { footpath: { ...FP, stallEvery: every } } })), 'chai').length;
  assert.ok(count([100, 200]) > count([250, 450]));
});
```

Append to the end of `tests/styles.test.js`:
```js
for (const id of RRR.order()) {
  test(`${id} has a footpath with stalls spaced as its style says, each with a cart`, () => {
    const { def, road } = world(id), fp = def.road.footpath;
    assert.deepStrictEqual([fp.width, fp.climbLoss, fp.dropLoss], [0.6, 0.25, 0.12]);
    for (const side of [-1, 1]) {
      const at = road.segments.flatMap((s, n) => s.sprites.some(q => q.onPath && q.kind === 'chai' && Math.sign(q.offset) === side) ? [n] : []);
      assert.ok(at.length >= 2, `only ${at.length} stalls on side ${side}`);
      for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= fp.stallEvery[0]); // (a skipped spot makes a gap longer, never shorter)
    }
    const stalls = road.segments.reduce((n, s) => n + s.sprites.filter(q => q.onPath && q.kind === 'chai').length, 0);
    const carts = road.segments.reduce((n, s) => n + s.sprites.filter(q => q.kind === 'cart').length, 0);
    assert.strictEqual(carts, stalls);
  });
}
test('stalls are closest together on traffic tracks and furthest apart on speed tracks', () => {
  const low = id => RRR.resolve(id).road.footpath.stallEvery[0];
  assert.ok(low('western-express') < low('charminar-road') && low('charminar-road') < low('sea-link'));
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `pass 154`, `fail 11` (no stalls or carts are placed yet). The golden tests are among the passes.

- [ ] **Step 4: Write the edit script, `fp-edits-builder.py`, at the repo root**

```python
"""One-off edits to web/engine/track-builder.js for the footpath: the pass that places stalls and cart ramps, and
street furniture moving out behind the footpath. Run from the repo root; every edit asserts that the text it
replaces is there exactly once. Not committed."""
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)

b = load('web/engine/track-builder.js')
b = rep(b, "// junctions, the start line, roadside scenery and signs.", "// junctions, the start line, roadside scenery and signs, and the footpath's stalls and cart ramps.")
b = rep(b, "    Object.assign(this, { def, constants, SP: sprites, themeSprites });", "    Object.assign(this, { def, round, constants, SP: sprites, themeSprites });")
b = rep(b, "    this.placeSigns(fs);\n    this.settleRoadside();", "    this.placeSigns(fs);\n    if (this.def.road.footpath) this.placeFootpath(fs);\n    this.settleRoadside();")
b = rep(b, "  settleRoadside() {\n    const { segments } = this, { SEG_LEN } = this.constants;\n    // everything by the roadside was placed for a road edge at 1: move it out to this stretch's edge\n",
  """  // Stalls block the footpath at intervals, each with a cart ramp a little before it. They come from their own
  // seeded generator, so adding or moving them never changes the road, its scenery or its signs.
  placeFootpath(fs) {
    const { SP, segments } = this, { SEG_LEN } = this.constants, fp = this.def.road.footpath, F = RRR.footpath, N = segments.length;
    const G = mulberry32(this.def.seed * 7 + this.round);
    const gap = () => fp.stallEvery[0] + Math.floor(G() * (fp.stallEvery[1] - fp.stallEvery[0] + 1));
    // a cart, its stall and the landing beyond need a plain stretch: no junction, no lanes tapering, not the start line
    const plain = k => { const q = segments[k]; return !q.clear && !q.junction && !q.finish && q.hw1 === q.hw2; };
    // the inner edge of something w wide standing in the middle of the footpath (for a road edge at 1)
    const inner = (side, w) => side * (1 + F.KERB_W + (fp.width - w) / 2);
    for (const side of [-1, 1]) {
      for (let n = fs + 150 + gap(); n < N - 60; n += gap()) {
        const k0 = n - F.CART.lead; // the cart's first segment
        let ok = k0 + F.CART.runout < N; for (let k = k0 - 4; ok && k <= k0 + F.CART.runout; k++) ok = plain(k);
        if (!ok) continue;
        segments[n].sprites.push({ img: SP.chai, offset: inner(side, F.STALL_W), nw: F.STALL_W, solid: true, kind: 'chai', onPath: true });
        segments[k0].sprites.push({ img: SP.cart, offset: inner(side, F.CART.width), nw: F.CART.width, solid: true, kind: 'cart', onPath: true,
          len: F.CART.length * SEG_LEN, seg0: k0 });
      }
    }
  }
  settleRoadside() {
    const { segments } = this, { SEG_LEN } = this.constants, shift = RRR.footpath.furnitureShift(this.def.road.footpath);
    // everything by the roadside was placed for a road edge at 1: move it out to this stretch's edge, and
    // (all but what stands on the footpath) on past the footpath
""")
b = rep(b, "        s.offset += Math.sign(s.offset) * (h - 1); s.edgeDone = true;", "        s.offset += Math.sign(s.offset) * (h - 1 + (s.onPath ? 0 : shift)); s.edgeDone = true;")
b = rep(b, "    // solid things block every segment they span (a building is several segments long)\n    segments.forEach((seg, n) => {\n      for (const s of seg.sprites) if (s.solid) {\n        const span = s.kind === 'building' ? Math.ceil(s.len / SEG_LEN) : 1;",
  "    // solid things block every segment they span (a building or a cart is several segments long)\n    segments.forEach((seg, n) => {\n      for (const s of seg.sprites) if (s.solid) {\n        const span = s.len ? Math.ceil(s.len / SEG_LEN) : 1;")
save('web/engine/track-builder.js', b)
print('footpath builder edits applied')
```

- [ ] **Step 5: Apply it and remove it**

Run: `python3 fp-edits-builder.py && rm fp-edits-builder.py && node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `footpath builder edits applied`, then `pass 165`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git status --short   # fp-edits-builder.py must not be listed
git add web/engine/track-builder.js tests
git commit -m "Builder: stalls and cart ramps on the footpath; street furniture stands behind it"
```

---

### Task 4: The game: kerb, jump, collisions, results, and the 2D renderer

What changes in `web/game.js`, for the reviewer:

| Where | Change |
| --- | --- |
| Sprites | `makeCart()` paints the cart; `SP.cart` |
| State | The player gains `air` (the jump in progress, or null) and `y` (height). Helpers `FP`, `footpath()`, `zoneOf(seg, x)` |
| `updatePlayer` | An airborne branch (no steering, throttle or grip; heading frozen; the bend still pushes); off-road slowdown only on grass; the kerb cost |
| `hitKerb`, `takeOff`, `landPlayer` (new) | The kerb's jolt and speed loss; the start of a flight; landing: a crash on a vehicle or cow, else `JUMP!` or `FLYOVER!` and the stat |
| `checkCollisions` | Skipped in the air; a cart met at its near end, lined up and fast enough, is a take-off; stalls and carts block at their full width |
| `crashPlayer`, `resolveAttack`, `updateClosePasses` | A crash ends a jump; no hits to or from the air; no close passes in the air |
| `buildResults`, `drawResults` | Jump cash; `Jumps n` and `Jumps ₹n` on the results screen |
| `drawSegment`, `drawPlayer` | The footpath strip at its width with a kerb shadow; the auto above its shadow in a jump |
| `World3D.setTrack` | Receives `footpath` (used in Task 5) |

**Files:**
- Modify: `web/game.js`, `web/index.html`
- Temporary, not committed: `fp-edits-1.py`

**Interfaces:**
- Consumes: `RRR.footpath` (Task 1), `def.road.footpath`, `stats.jump`, `stats.bonuses().jumps` (Task 2), stalls and carts on the road (Task 3).
- Produces: `player.air` (`{ airTime, peak, t, over, fromPath }` or `null`) and `player.y`; `results.skill.jumps`; `cfg.footpath` passed to `World3D.setTrack`. `window.__rrr` is unchanged (`player`, `stats`, `def`, `segments`, `traffic`, `rivals`, `keys`, `setLevel`, `setupRace`, `step`).

- [ ] **Step 1: Write the edit script, `fp-edits-1.py`, at the repo root**

```python
"""One-off edits to web/game.js and web/index.html for the driveable footpath and cart jumps (player side and the
2D renderer). Run from the repo root; every edit asserts that the text it replaces is there exactly once, so a
changed file fails loudly instead of being half-edited. Not committed."""
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)

g = load('web/game.js')

# --- error attribution
g = rep(g, "  ['player-physics', /^(updatePlayer|crashPlayer|checkCollisions|endDrift|updateClosePasses)$/],",
  "  ['player-physics', /^(updatePlayer|crashPlayer|checkCollisions|endDrift|updateClosePasses|hitKerb|takeOff|landPlayer)$/],")

# --- the cart sprite (2D)
g = rep(g, "function makeChai() {", """// A hand cart parked on its pull handles, seen from behind: its plank bed slopes up away from you (the ramp).
function makeCart() {
  const c = mk(220, 170), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 110, 160, 100, 9); g.fill();
  for (const x of [22, 198]) { // the two tyres, either side of the bed
    g.fillStyle = '#1c1c1c'; ell(g, x, 108, 15, 40); g.fill();
    g.fillStyle = '#8d8d8d'; ell(g, x, 108, 6, 16); g.fill();
  }
  g.fillStyle = '#5d4037'; g.fillRect(36, 96, 148, 10);                                   // axle beam
  g.fillStyle = '#a1764a'; g.beginPath(); g.moveTo(34, 150); g.lineTo(186, 150); g.lineTo(164, 44); g.lineTo(56, 44); g.closePath(); g.fill(); // the bed
  g.strokeStyle = '#6d4c2f'; g.lineWidth = 2;
  for (let i = 1; i < 5; i++) { const t = i / 5; g.beginPath(); g.moveTo(34 + 152 * t, 150); g.lineTo(56 + 108 * t, 44); g.stroke(); }    // planks
  g.strokeStyle = '#4e342e'; g.lineWidth = 5; g.strokeRect(56, 42, 108, 4);                // the raised far end
  g.strokeStyle = '#7b3f1d'; g.lineWidth = 7; g.lineCap = 'round';
  for (const [a, b] of [[40, 28], [180, 192]]) { g.beginPath(); g.moveTo(a, 148); g.lineTo(b, 164); g.stroke(); }                        // shafts on the ground
  g.beginPath(); g.moveTo(24, 164); g.lineTo(196, 164); g.stroke();                        // pull bar
  return c;
}
function makeChai() {""")
g = rep(g, "  SP.chai = makeChai(); SP.milestone = makeMilestone(); SP.arch = makeArch();",
  "  SP.chai = makeChai(); SP.cart = makeCart(); SP.milestone = makeMilestone(); SP.arch = makeArch();")

# --- state and helpers
g = rep(g, "    boost: 0, boostT: 0, driftT: 0, driftPts: 0 }); // boost: share of top speed added while boostT lasts · driftT, driftPts: the current drift's time and points",
  "    boost: 0, boostT: 0, driftT: 0, driftPts: 0, // boost: share of top speed added while boostT lasts · driftT, driftPts: the current drift's time and points\n"
  "    air: null, y: 0 }); // air: the jump in progress (off a cart ramp), or null · y: height above the road")
g = rep(g, "const halfAt = z => findSegment(z).half;\n",
  "const halfAt = z => findSegment(z).half;\n"
  "// The footpath (engine/footpath.js): a raised, driveable strip behind the kerb stones on both sides, with chai\n"
  "// stalls blocking it and a hand cart before each stall as a ramp. zoneOf: 'road', 'footpath' or 'grass'.\n"
  "const FP = RRR.footpath;\n"
  "const footpath = () => def.road.footpath; // this track's footpath settings, or false\n"
  "const zoneOf = (seg, x) => FP.zoneAt(seg.half, footpath(), x, !!seg.junction);\n")
g = rep(g, "MAX_SPEED, LANE_W });", "MAX_SPEED, LANE_W, footpath: def.road.footpath });")

# --- a crash ends a jump
g = rep(g, "  player.drift = 0; player.driftT = 0; player.driftPts = 0; player.boostT = 0; if (stats) stats.breakChain();\n",
  "  player.drift = 0; player.driftT = 0; player.driftPts = 0; player.boostT = 0; if (stats) stats.breakChain();\n"
  "  player.air = null; player.y = 0;\n")

# --- updatePlayer: flying, the grass zone, the kerb
g = rep(g, "function updatePlayer(dt, controlled) {\n  const seg = findSegment(player.dist);\n",
  "function updatePlayer(dt, controlled) {\n  const seg = findSegment(player.dist), x0 = player.x;\n")
g = rep(g, "  if (player.crash > 0) {\n    player.crash -= dt;\n    player.speed = Math.max(0, player.speed - player.speed * 2.5 * dt - 1500 * dt);",
  "  if (player.air) {\n"
  "    // in the air: no steering, throttle or grip. The auto flies the way it was pointing; the road bends on underneath\n"
  "    const a = player.air; a.t += dt;\n"
  "    player.x += player.speed * Math.sin(player.heading) * dt / ROAD_W;\n"
  "    player.x -= dx * sp * seg.curve * CENTRIFUGAL;\n"
  "    player.y = FP.heightAt(a, a.t);\n"
  "    if (!a.over) a.over = traffic.some(c => c.type !== 'cow' && c.type !== 'dog' && Math.abs(wrapDelta(c.z - player.dist)) < ((c.len || 0) + TUK_LEN) / 2 && overlap(player.x, TUK_NW, c.x, c.nw));\n"
  "    if (a.t >= a.airTime) landPlayer();\n"
  "  } else if (player.crash > 0) {\n    player.crash -= dt;\n    player.speed = Math.max(0, player.speed - player.speed * 2.5 * dt - 1500 * dt);")
g = rep(g, "    if (Math.abs(player.x) > seg.half) {\n      if (player.speed > OFFROAD_LIMIT) player.speed += OFFROAD_DECEL * dt;",
  "    if (zoneOf(seg, player.x) === 'grass') {\n      if (player.speed > OFFROAD_LIMIT) player.speed += OFFROAD_DECEL * dt;")
g = rep(g, "  player.x = clamp(player.x, -seg.half - 1.8, seg.half + 1.8);\n  // top speed is the style's,",
  "  player.x = clamp(player.x, -seg.half - 1.8, seg.half + 1.8);\n"
  "  // the kerb: climbing onto the footpath or dropping off it costs speed (not in the air, and not at a junction,\n"
  "  // where the footpath is at road level)\n"
  "  if (!player.air && player.crash <= 0) { const k = FP.kerbCrossing(seg.half, footpath(), x0, player.x, !!seg.junction); if (k) hitKerb(k); }\n"
  "  // top speed is the style's,")

# --- the kerb, taking off and landing
g = rep(g, "// Lane surfing: overtaking same-way traffic", """// The kerb: a jolt, and a share of your speed (more going up than coming down).
function hitKerb(way) {
  const fp = footpath();
  player.speed *= 1 - (way === 'climb' ? fp.climbLoss : fp.dropLoss);
  shake = Math.max(shake, 0.12); Sfx.bump();
}
// Off the end of a cart: the flight is set by the speed, and its direction by where the auto is pointing.
function takeOff() {
  if (player.drift) endDrift();
  player.air = { ...FP.jump(player.speed / MAX_SPEED), t: 0, over: false, fromPath: zoneOf(findSegment(player.dist), player.x) === 'footpath' };
  player.lean = 0; player.tip = 0; player.rot = 0;
  Sfx.whoosh();
}
// Back down: on top of a vehicle or a cow it's a crash; otherwise the jump counts, and one that left the
// footpath, passed over a vehicle and came down in the road is a flyover.
function landPlayer() {
  const a = player.air, seg = findSegment(player.dist);
  player.air = null; player.y = 0; player.speed *= 1 - FP.JUMP.landLoss; shake = Math.max(shake, 0.2); Sfx.bump();
  for (const c of traffic) {
    if (c.type === 'dog' || Math.abs(wrapDelta(c.z - player.dist)) >= ((c.len || 0) + TUK_LEN) / 2 || !overlap(player.x, playerW(), c.x, c.nw)) continue;
    crashPlayer(`LANDED ON A ${c.label}!`, 25); player.speed = 0; return;
  }
  const flyover = a.fromPath && a.over && zoneOf(seg, player.x) === 'road';
  stats.jump(flyover);
  popup(flyover ? 'FLYOVER!' : 'JUMP!', W / 2, H - 260, flyover ? '#80deea' : '#ffd21f', 30);
}

// Lane surfing: overtaking same-way traffic""")
g = rep(g, "c.passCd > 0 || player.crash > 0 || player.speed <= c.speed || c.speed < PASS_MIN_SPEED) continue;",
  "c.passCd > 0 || player.crash > 0 || player.air || player.speed <= c.speed || c.speed < PASS_MIN_SPEED) continue;")

# --- collisions: nothing touches an auto in the air; a cart met squarely and fast enough is a ramp
g = rep(g, "function checkCollisions() {\n  if (player.crash > 0) return;", "function checkCollisions() {\n  if (player.crash > 0 || player.air) return;")
g = rep(g, "      if (Math.sign(s.offset) !== Math.sign(player.x)) continue;\n",
  "      if (Math.sign(s.offset) !== Math.sign(player.x)) continue;\n"
  "      // a cart ramp, met at its near end, lined up and fast enough: up and away (anything else about a cart is a wreck)\n"
  "      if (s.kind === 'cart' && seg.index - s.seg0 <= 1 && FP.takesOff(s.offset + Math.sign(s.offset) * s.nw / 2, player.x, player.speed / MAX_SPEED)) { takeOff(); return; }\n")
g = rep(g, "        : overlap(player.x, pw * 0.7, s.offset + Math.sign(s.offset) * s.nw / 2, s.nw * 0.55);",
  "        : s.onPath ? overlap(player.x, pw, s.offset + Math.sign(s.offset) * s.nw / 2, s.nw) // a stall or a cart blocks the footpath at its full width\n"
  "        : overlap(player.x, pw * 0.7, s.offset + Math.sign(s.offset) * s.nw / 2, s.nw * 0.55);")
g = rep(g, "  for (const t of targets) {\n    if (t === att) continue;\n", "  for (const t of targets) {\n    if (t === att || t.air) continue; // (no one can be hit in the air)\n")
g = rep(g, "function resolveAttack(att, side) {\n", "function resolveAttack(att, side) {\n  if (att.air) return; // (or hit from it)\n")

# --- results: jumps pay
g = rep(g, "  cash += prize + bonus + skill.drift + skill.passes;", "  cash += prize + bonus + skill.drift + skill.passes + skill.jumps;")
g = rep(g, "   \\u00b7   Close passes ${s.passes}${star(r.beaten.passes)}`, W / 2, by + 4, 14,", "   \\u00b7   Close passes ${s.passes}${star(r.beaten.passes)}   \\u00b7   Jumps ${s.jumps}`, W / 2, by + 4, 14,")
g = rep(g, "  +  Lane surf ${fmtCash(r.skill.passes)}  =  ${fmtCash(r.prize + r.bonus + r.skill.drift + r.skill.passes)}`, W / 2, by + 28, 15,",
  "  +  Lane surf ${fmtCash(r.skill.passes)}  +  Jumps ${fmtCash(r.skill.jumps)}  =  ${fmtCash(r.prize + r.bonus + r.skill.drift + r.skill.passes + r.skill.jumps)}`, W / 2, by + 28, 14,")

# --- 2D renderer: the footpath strip with its kerb line, and the auto above its shadow in a jump
g = rep(g, "  const r1 = u1 / 6, r2 = u2 / 6, s1 = u1 * 0.35, s2 = u2 * 0.35;\n  poly(x1 - w1 - r1 - s1, y1, x1 - w1 - r1, y1, x2 - w2 - r2, y2, x2 - w2 - r2 - s2, y2, col.shoulder);\n  poly(x1 + w1 + r1 + s1, y1, x1 + w1 + r1, y1, x2 + w2 + r2, y2, x2 + w2 + r2 + s2, y2, col.shoulder);\n",
  "  const fp = footpath(), sw = fp ? fp.width : 0.35; // the footpath (or, without one, the old narrow paved strip)\n"
  "  const r1 = u1 / 6, r2 = u2 / 6, s1 = u1 * sw, s2 = u2 * sw;\n"
  "  poly(x1 - w1 - r1 - s1, y1, x1 - w1 - r1, y1, x2 - w2 - r2, y2, x2 - w2 - r2 - s2, y2, col.shoulder);\n"
  "  poly(x1 + w1 + r1 + s1, y1, x1 + w1 + r1, y1, x2 + w2 + r2, y2, x2 + w2 + r2 + s2, y2, col.shoulder);\n"
  "  if (fp) for (const sd of [-1, 1]) { const k1 = u1 * 0.035, k2 = u2 * 0.035; // the kerb's shadowed face\n"
  "    poly(x1 + sd * (w1 + r1), y1, x1 + sd * (w1 + r1 + k1), y1, x2 + sd * (w2 + r2 + k2), y2, x2 + sd * (w2 + r2), y2, 'rgba(0,0,0,.3)'); }\n")
g = rep(g, "  const y = H / 2 - (scale * camY * H / 2) - destH + bounce;\n  if (player.inv > 0 && Math.floor(player.inv * 10) % 2) return;\n",
  "  const lift = scale * player.y * H / 2, ground = H / 2 - (scale * camY * H / 2); // in a jump the auto rises above its shadow\n"
  "  const y = ground - destH + bounce - lift;\n"
  "  if (player.inv > 0 && Math.floor(player.inv * 10) % 2) return;\n"
  "  if (lift > 2) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(W / 2, ground - 4, destW * 0.42, destW * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }\n")
save('web/game.js', g)

h = load('web/index.html')
h = rep(h, '<script src="engine/track-builder.js"></script>', '<script src="engine/footpath.js"></script>\n<script src="engine/track-builder.js"></script>')
save('web/index.html', h)
print('footpath edits 1 applied')
```

- [ ] **Step 2: Apply it and remove it**

Run: `python3 fp-edits-1.py && rm fp-edits-1.py && node --check web/game.js && node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `footpath edits 1 applied`, no syntax error, `pass 165`, `fail 0`.

- [ ] **Step 3: Open the game in the 2D renderer**

Start the preview server named `roadrash` (it serves `web/`, from `.claude/launch.json`; use the `mcp__Claude_Browser__*` tools and never start a server with Bash). Navigate to the preview URL with `?2d` added. In the page run, once:
```js
for (const f of ['game.js', 'index.html', 'packs.js', 'engine/footpath.js', 'engine/registry.js', 'engine/race-stats.js', 'engine/track-builder.js', 'styles/classic.js', 'styles/speed.js', 'styles/drift.js', 'styles/traffic.js']) await fetch(f, { cache: 'reload' });
localStorage.removeItem('rrr_round'); localStorage.removeItem('rrr_layout'); location.reload()
```
Wait two seconds. `window.RRR.validate()` must return `[]` and the console must have no errors.

- [ ] **Step 4: The kerb**

Run in the page:
```js
const r = window.__rrr, K = r.keys, off = () => { for (const k in K) K[k] = false; }, F = window.RRR.footpath;
r.setLevel(1); r.setupRace(); r.step(260); r.traffic.length = 0; r.rivals.length = 0; off();
const fp = r.def.road.footpath, s = r.segments; let k = 400;
while (s.slice(k, k + 80).some(q => q.curve !== 0 || q.junction || q.clear || q.hw1 !== q.hw2 || q.solids.some(o => o.onPath))) k++; // a straight, plain stretch
const half = s[k].half, kerb = half + 1 / 6, zone = () => F.zoneAt(half, fp, r.player.x);
const cross = (x, heading, key, drop) => { Object.assign(r.player, { dist: k * 200, x, speed: 9000, heading, crash: 0 }); K[key] = true; let share = null;
  for (let i = 0; i < 20 && !share; i++) { const before = r.player.speed; r.step(1); if (r.player.speed < before * drop) share = +(r.player.speed / before).toFixed(2); } off(); return share; };
const climb = cross(-(kerb - 0.02), -0.2, 'ArrowLeft', 0.9), after = zone(), drop = cross(-(kerb + 0.02), 0.2, 'ArrowRight', 0.95);
Object.assign(r.player, { dist: k * 200, x: -F.centre(half, fp), speed: 12000, heading: 0, crash: 0 }); K.ArrowUp = true; r.step(30); off();
({ climb, after, drop, cruise: Math.round(r.player.speed), crashed: r.player.crash > 0 })
```
Expected: `{ climb: 0.75, after: 'footpath', drop: 0.88, cruise: 12000, crashed: false }`. Climbing costs a quarter of the speed, dropping an eighth, and driving along the footpath at full speed costs nothing and hits nothing.

- [ ] **Step 5: Jumps**

Run in the page:
```js
const r = window.__rrr, K = r.keys, off = () => { for (const k in K) K[k] = false; }, F = window.RRR.footpath;
const start = lvl => { r.setLevel(lvl); r.setupRace(); r.step(260); const car = r.traffic.find(t => t.type === 'car' && t.dir === 1); r.traffic.length = 0; r.rivals.length = 0; off(); return car; };
// the first cart on our side with a dead-straight road around it
const cartOf = () => { const s = r.segments, k0 = s.findIndex((g, n) => n > 300 && g.sprites.some(q => q.kind === 'cart' && q.offset < 0) && s.slice(n - 15, n + 100).every(h => h.curve === 0));
  const q = s[k0].sprites.find(q => q.kind === 'cart' && q.offset < 0); return { k0, x: q.offset - q.nw / 2, half: s[k0].half }; };
let landed = null; // where the last flight came down: track distance and sideways position
const fly = ({ lvl = 4, speed = 9000, heading = 0, lead = 12, dx = 0, veh = null, key = null }) => { const car = start(lvl), c = cartOf(), fp = r.def.road.footpath;
  Object.assign(r.player, { dist: (c.k0 - lead) * 200, x: c.x + dx, speed, heading }); if (veh) r.traffic.push({ ...car, ...veh(c), passCd: 0, passDz: undefined });
  K.ArrowUp = true; if (key) K[key] = true; let air = 0, took = false, crashed = false, v0 = 0;
  for (let n = 0; n < 400; n++) { r.step(1); if (r.player.air) { if (!took) v0 = r.player.speed; took = true; air++; } crashed = crashed || r.player.crash > 0; if ((took && !r.player.air) || crashed) break; }
  off(); const seg = r.segments[Math.floor(r.player.dist / 200) % r.segments.length]; landed = { z: r.player.dist, x: r.player.x };
  return [took ? 'flew ' + (air / 60).toFixed(2) + 's at ' + Math.round(v0 / 150) + ' km/h' : 'no flight', crashed ? 'CRASHED' : 'lands on ' + F.zoneAt(seg.half, fp, r.player.x, !!seg.junction),
    'jumps ' + r.stats.jumps + ' flyovers ' + r.stats.flyovers + ' cash ' + r.stats.bonuses().jumps].join(' | '); };
const out = [fly({}), fly({ speed: 4500, lead: 4 }), fly({ lvl: 2, speed: 15000 }), fly({ speed: 2900, lead: 3 }), fly({ dx: 0.28 }),
  fly({ heading: 0.25, lead: 4, dx: -0.1, key: 'ArrowRight' })];
const spot = landed; // the same jump again, twice: over a slow car, and onto a cow standing where it comes down
out.push(
  fly({ heading: 0.25, lead: 4, dx: -0.1, key: 'ArrowRight', veh: c => ({ z: (c.k0 - 4) * 200 + 4800, x: -(c.half - 0.3), lane: 0, speed: 1500 }) }),
  fly({ heading: 0.25, lead: 4, dx: -0.1, key: 'ArrowRight', veh: () => ({ type: 'cow', dir: undefined, z: spot.z, x: spot.x, speed: 0, vx: 0, nw: 0.42, len: 380, pause: 99, scared: 0, label: 'HOLY COW' }) }));
out
```
Expected (speeds may differ by 1 km/h and times by 0.02 s):
```
flew 0.95s at 64 km/h | lands on footpath | jumps 1 flyovers 0 cash 15
flew 0.67s at 32 km/h | lands on footpath | jumps 1 flyovers 0 cash 15
flew 1.30s at 100 km/h | lands on footpath | jumps 1 flyovers 0 cash 15
no flight | CRASHED | jumps 0 flyovers 0 cash 0
no flight | CRASHED | jumps 0 flyovers 0 cash 0
flew 0.93s at 61 km/h | lands on road | jumps 1 flyovers 0 cash 15
flew 0.93s at 61 km/h | lands on road | jumps 1 flyovers 1 cash 40
flew 0.93s at 61 km/h | CRASHED | jumps 0 flyovers 0 cash 0
```
In order: a straight jump at about 60 km/h; the slowest valid jump; the fastest (a speed track); too slow (a wreck on the cart); off centre (a wreck); pointed at the road; the same over a slow car (a flyover); the same onto a cow standing where it lands (a crash).

- [ ] **Step 6: Results**

Run in the page:
```js
const r = window.__rrr; r.setLevel(4); r.setupRace(); r.step(300);
r.stats.jump(false); r.stats.jump(false); r.stats.jump(true);
r.player.dist = r.segments.length * 200 + 6000; r.step(300);
({ state: r.state, skill: r.results.skill, jumps: r.results.stats.jumps })
```
Expected: `{ state: 'results', skill: { drift: 0, passes: 0, jumps: 70 }, jumps: 3 }`. Wait a second and take a screenshot: under the finishing order it must read `... · Close passes 0 · Jumps 3`, then `Prize ₹1,500 + KO ₹0 + Drift ₹0 + Lane surf ₹0 + Jumps ₹70 = ₹1,570`, with nothing overlapping.

- [ ] **Step 7: See it**

Reload the page, then run:
```js
window.requestAnimationFrame = () => 0; const r = window.__rrr; r.setLevel(4); r.setupRace(); r.step(260); r.rivals.length = 0; r.traffic.length = 0;
const s = r.segments, k0 = s.findIndex((g, n) => n > 300 && g.sprites.some(q => q.kind === 'cart' && q.offset < 0) && s.slice(n - 15, n + 100).every(h => h.curve === 0)), q = s[k0].sprites.find(q => q.kind === 'cart' && q.offset < 0);
Object.assign(r.player, { dist: (k0 - 9) * 200, x: q.offset - q.nw / 2 + 0.45, speed: 0, heading: 0 }); r.step(2); 'placed'
```
Wait a second and take a screenshot. It must show the footpath as a paved strip left of the kerb stones, the wooden cart on it ahead, and the chai stall beyond the cart. Reload the page afterwards (the snippet stopped the game loop).

- [ ] **Step 8: Classic driving is unchanged, and commit**

Still in `?2d`, run:
```js
const r = window.__rrr, K = r.keys; r.setLevel(1); r.setupRace(); r.step(260); r.traffic.length = 0; r.rivals.length = 0;
const s = r.segments; let k = 400; while (s.slice(k, k + 70).some(q => q.curve !== 0 || q.junction)) k++;
Object.assign(r.player, { dist: k * 200, x: -0.9, speed: 11800, heading: 0 }); K.ArrowUp = true; r.step(60); K.ArrowUp = false; Math.round(r.player.speed)
```
Expected: `12000` (the road's top speed is still 80 km/h on a classic track). Stop the preview server.

```bash
git status --short   # only web/game.js and web/index.html
git add web/game.js web/index.html
git commit -m "Game: driveable footpath, kerb cost, cart jumps and flyovers, jump cash"
```

---

### Task 5: The 3D renderer

**Files:**
- Modify: `web/world3d.js`
- Temporary, not committed: `fp-edits-3d.py`

**Interfaces:**
- Consumes: `cfg.footpath` from `World3D.setTrack` (Task 4); `player.air`, `player.y` and the same fields on rivals (Tasks 4 and 6); sprites with `onPath` and kind `cart` (Task 3); `window.RRR.footpath.zoneAt` (Task 1).
- Produces: nothing other code calls. `FP_H` (70) is the footpath's height in world units.

- [ ] **Step 1: Write the edit script, `fp-edits-3d.py`, at the repo root**

```python
"""One-off edits to web/world3d.js for the footpath in 3D: a raised footpath with kerb faces, the hand cart
model, things on the footpath standing at its height, and the auto lifting and pitching in a jump. Run from the
repo root; every edit asserts that the text it replaces is there exactly once. Not committed."""
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)

w = load('web/world3d.js')

# --- constants and colours
w = rep(w, "  const QUADS = 30; //", "  const FP_H = 70;              // how high the footpath stands above the road\n  const QUADS = 30; //")
w = rep(w, "      white: c('#f5f5f5'), yellow: c('#f2c200'),\n", "      white: c('#f5f5f5'), yellow: c('#f2c200'), kerb: c('#6f6a63'),\n")
# the kerb's upright faces are seen from either side
w = rep(w, "new T.MeshBasicMaterial({ vertexColors: true, map: asphaltTexture() })", "new T.MeshBasicMaterial({ vertexColors: true, map: asphaltTexture(), side: T.DoubleSide })")

# --- road mesh: strips that can slope along a segment, and upright faces
w = rep(w, "  function stripT(n, f1, f2, a1, b1, a2, b2, yOff, col) {", "  function stripT(n, f1, f2, a1, b1, a2, b2, yOff, col, yOff2 = yOff) { // yOff2: the height at the far end, when it differs")
w = rep(w, "y1 = lerp(Y[n], Y[n + 1], f1) + yOff, y2 = lerp(Y[n], Y[n + 1], f2) + yOff;", "y1 = lerp(Y[n], Y[n + 1], f1) + yOff, y2 = lerp(Y[n], Y[n + 1], f2) + yOff2;")
w = rep(w, "  const strip = (n, o1, o2, yOff, col) => stripT(n, 0, 1, o1, o2, o1, o2, yOff, col);\n",
  "  const strip = (n, o1, o2, yOff, col) => stripT(n, 0, 1, o1, o2, o1, o2, yOff, col);\n"
  "  // an upright face along segment n, at lateral a at its near end and b at its far end: from y0 up to y1 at the\n"
  "  // near end, y2 up to y3 at the far end (a kerb)\n"
  "  function wallT(n, a, b, y0, y1, y2, y3, col) {\n"
  "    const A = P[n], B = P[n + 1], ax = A.x + Math.cos(TH[n]) * a, az = A.z + Math.sin(TH[n]) * a, bx = B.x + Math.cos(TH[n + 1]) * b, bz = B.z + Math.sin(TH[n + 1]) * b;\n"
  "    quad(ax, Y[n] + y0, az, ax, Y[n] + y1, az, bx, Y[n + 1] + y3, bz, bx, Y[n + 1] + y2, bz, col, [0, 0, 0, 0, 0, 0, 0, 0]);\n"
  "  }\n")
w = rep(w, "        det = 0; strip(n, -26000, -h1 - rw - sw, -6, col.grass); stripT(n, 0, 1, h1 + rw + sw, 26000, h2 + rw + sw, 26000, -6, col.grass);\n"
           "        det = 0.3; stripT(n, 0, 1, -h1 - rw - sw, -h1 - rw, -h2 - rw - sw, -h2 - rw, -3, col.shoulder); stripT(n, 0, 1, h1 + rw, h1 + rw + sw, h2 + rw, h2 + rw + sw, -3, col.shoulder);\n",
  "        // the footpath: raised, with a kerb face towards the road and a back face towards the grass; next to a\n"
  "        // junction it slopes down to road level (a dropped kerb). Without one, the old narrow paved strip.\n"
  "        const fp = cfg.footpath, fw = fp ? fp.width * U : sw;\n"
  "        const ya = !fp ? -3 : segments[(baseIdx + n - 1 + L) % L].junction ? 0 : FP_H, yb = !fp ? -3 : segments[(baseIdx + n + 1) % L].junction ? 0 : FP_H;\n"
  "        det = 0; strip(n, -26000, -h1 - rw - fw, -6, col.grass); stripT(n, 0, 1, h1 + rw + fw, 26000, h2 + rw + fw, 26000, -6, col.grass);\n"
  "        det = 0.3; stripT(n, 0, 1, -h1 - rw - fw, -h1 - rw, -h2 - rw - fw, -h2 - rw, ya, col.shoulder, yb); stripT(n, 0, 1, h1 + rw, h1 + rw + fw, h2 + rw, h2 + rw + fw, ya, col.shoulder, yb);\n"
  "        if (fp) { det = 0; for (const sd of [-1, 1]) { wallT(n, sd * (h1 + rw), sd * (h2 + rw), 0, ya, 0, yb, colors.kerb); wallT(n, sd * (h1 + rw + fw), sd * (h2 + rw + fw), -6, ya, -6, yb, colors.kerb); } }\n")

# --- the hand cart, and things on the footpath standing at its height
w = rep(w, "  function milestoneModel() {", """  // A hand cart parked on its pull handles: the plank bed slopes up the way the traffic goes (the ramp). The
  // model's origin is the cart's near end, on the ground.
  function cartModel(s) {
    const g = new T.Group(), Wd = s.nw * ROAD_W * 0.9, L = s.len || 800, rise = 260, tilt = Math.atan2(rise, L);
    const bed = new T.Group(); bed.position.set(0, rise / 2 + 26, -L / 2); bed.rotation.x = tilt; g.add(bed);
    bed.add(box(Wd, 26, L, '#a1764a', 0, 0, 0));                                                         // planks
    for (const x of [-1, 1]) bed.add(box(34, 70, L, '#6d4c2f', x * (Wd / 2 - 17), 22, 0));               // side rails
    bed.add(box(Wd, 90, 30, '#6d4c2f', 0, 32, -L / 2 + 15));                                             // the board across the far end
    for (const x of [-1, 1]) bed.add(box(44, 44, 420, '#7b3f1d', x * Wd * 0.3, -20, L / 2 + 190));       // the two shafts, down to the ground
    bed.add(cylX(22, Wd * 0.75, '#7b3f1d', 0, -20, L / 2 + 380));                                        // pull bar
    for (const x of [-1, 1]) g.add(wheel(150, 70, x * (Wd / 2 + 45), 150, -L * 0.55, '#6f6f6f'));        // two big tyres under the bed
    g.userData.size = { w: Wd + 160, h: rise + 110, l: L + 420 }; return g;
  }
  function milestoneModel() {""")
w = rep(w, "      case 'milestone': return milestoneModel();\n", "      case 'milestone': return milestoneModel();\n      case 'cart': return cartModel(s);\n")
w = rep(w, "        m.position.set(p.x, p.y, p.z);\n", "        m.position.set(p.x, p.y + (s.onPath ? FP_H : 0), p.z); // (a stall or a cart stands on the footpath)\n")

# --- autos: up on the footpath, and up and tilted in a jump
w = rep(w, "  function placeAuto(obj, m, d, x, rot, atk, hurt, bounce) {\n    const p = onGround(placeAt(d, x), d, x, m.userData.size.l);\n",
  "  // how high the ground an auto stands on is above the road: the footpath's height when it is on the footpath\n"
  "  function pathLift(d, x) {\n"
  "    const fp = cfg.footpath; if (!fp) return 0;\n"
  "    const seg = segments[(baseIdx + Math.max(0, Math.floor(d / SEG_LEN + camFrac))) % segments.length];\n"
  "    return window.RRR.footpath.zoneAt(seg.half, fp, x, !!seg.junction) === 'footpath' ? FP_H : 0;\n"
  "  }\n"
  "  function placeAuto(obj, m, d, x, rot, atk, hurt, bounce) {\n    const p = onGround(placeAt(d, x), d, x, m.userData.size.l);\n"
  "    // on the footpath it rides at the footpath's height (eased, so the kerb is a quick step and not a snap);\n"
  "    // in a jump it rises by its height and points along its flight: nose up on the way up, down on the way down\n"
  "    obj.lift3d = (obj.lift3d || 0) + (pathLift(d, x) - (obj.lift3d || 0)) * 0.3;\n"
  "    const a = obj.air, climb = a ? Math.atan2(4 * a.peak / a.airTime * (1 - 2 * a.t / a.airTime), Math.max(obj.speed, 1)) : 0;\n"
  "    bounce += obj.lift3d + (obj.y || 0); p.pitch += climb;\n")
w = rep(w, "    if (sh) sh.visible = Math.abs(rot) < 0.25;", "    if (sh) { sh.visible = Math.abs(rot) < 0.25; sh.userData.y0 ??= sh.position.y; sh.position.y = sh.userData.y0 - (obj.y || 0); } // (in a jump the shadow stays on the ground)")
save('web/world3d.js', w)
print('footpath 3D edits applied')
```

- [ ] **Step 2: Apply it and remove it**

Run: `python3 fp-edits-3d.py && rm fp-edits-3d.py && node --check web/world3d.js && node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `footpath 3D edits applied`, no syntax error, `pass 165`, `fail 0`.

- [ ] **Step 3: The footpath, cart and stall in 3D**

Start the `roadrash` preview (no `?2d`). Reload without cache: `for (const f of ['game.js', 'world3d.js', 'index.html']) await fetch(f, { cache: 'reload' }); location.reload()`. After two seconds run:
```js
window.requestAnimationFrame = () => 0; const r = window.__rrr; r.setLevel(4); r.setupRace(); r.step(260); r.rivals.length = 0; r.traffic.length = 0;
const s = r.segments, k0 = s.findIndex((g, n) => n > 300 && g.sprites.some(q => q.kind === 'cart' && q.offset < 0) && s.slice(n - 15, n + 100).every(h => h.curve === 0)), q = s[k0].sprites.find(q => q.kind === 'cart' && q.offset < 0);
Object.assign(r.player, { dist: (k0 - 14) * 200, x: q.offset - q.nw / 2, speed: 0, heading: 0 }); r.step(2); 'placed'
```
Wait a second and take a screenshot. It must show: the auto standing on a raised grey footpath to the left of the black-and-yellow kerb stones; a kerb face between the stones and the footpath; the hand cart ahead on the footpath (plank bed sloping up away from you, two tyres); the chai stall beyond it; lamp posts, hoardings and trees behind the footpath, none on it. The console must have no errors.

- [ ] **Step 4: The jump in 3D**

Run:
```js
const r = window.__rrr, K = r.keys; r.player.speed = 9000; K.ArrowUp = true; let n = 0; while (!r.player.air && n++ < 200) r.step(1);
const T = r.player.air.airTime; while (r.player.air && r.player.air.t < T * 0.42) r.step(1); K.ArrowUp = false; ({ y: Math.round(r.player.y), t: +r.player.air.t.toFixed(2) })
```
Expected: `y` near 390. Wait a second and take a screenshot: the auto is clearly off the ground, nose up, with its shadow left below on the footpath. Reload the page afterwards.

- [ ] **Step 5: The rules still hold in 3D**

Reload, wait two seconds, and run the kerb snippet and the jumps snippet from Task 4 (Steps 4 and 5) again.
Expected: the same results as in 2D (speeds may differ by 1 km/h and times by 0.02 s), with no console errors.

- [ ] **Step 6: A junction**

Run:
```js
window.requestAnimationFrame = () => 0; const r = window.__rrr; r.setLevel(4); r.setupRace(); r.step(260); r.rivals.length = 0; r.traffic.length = 0;
const j = r.junctions[0], h = r.segments[j.s0].half; Object.assign(r.player, { dist: (j.s0 - 12) * 200, x: -(h + 1 / 6 + 0.3), speed: 0, heading: 0 }); r.step(2); j.s0
```
Wait two seconds and take a screenshot (the pane shows frames a moment late; if it still shows the title screen, run `window.__rrr.step(1)` and take it again): the footpath must run up to the cross road and slope down to road level, with no hole or floating edge where it meets the junction. Reload the page and stop the preview server.

- [ ] **Step 7: Commit**

```bash
git status --short   # only web/world3d.js
git add web/world3d.js
git commit -m "3D: raised footpath with kerb faces, the hand cart, autos lifted on the footpath and in a jump"
```

---

### Task 6: Daring rivals on the footpath

**Files:**
- Modify: `web/game.js`
- Temporary, not committed: `fp-edits-rivals.py`

**Interfaces:**
- Consumes: `FP`, `footpath()` (Task 4); the rival fields `out`, `outT`, `outCd`, `style.daring` that exist today.
- Produces: rival fields `path` (on the footpath), `pathT`, `air`, `y`; `cartAhead(i, n)`.

Behaviour: a rival with `daring` above 0 that is held up picks the footpath with probability `0.5 × daring` (if no cart is within 25 segments), otherwise the oncoming side as before. On the footpath it drives at its top speed along the footpath's centre, pays the kerb costs, jumps straight from each cart and lands on the footpath. It comes back to the road when the outer lane has room and it has been up at least 1.5 s, after 8 s, or when a cart is coming and it is too slow to jump. A rival that reaches a cart too slowly is knocked out by it. A rival in the air cannot hit or be hit (Task 4 made `resolveAttack` skip anyone with `air`).

- [ ] **Step 1: Write the edit script, `fp-edits-rivals.py`, at the repo root**

```python
"""One-off edits to web/game.js so the daring rival drivers use the footpath and the cart ramps. Run from the repo
root, after the player-side footpath edits; every edit asserts that the text it replaces is there exactly once.
Not committed."""
def load(p): return open(p).read()
def save(p, s): open(p, 'w').write(s)
def rep(s, old, new):
    assert s.count(old) == 1, (s.count(old), old[:90])
    return s.replace(old, new)

g = load('web/game.js')

# --- state
g = rep(g, "out: false, outT: 0, outCd: rand(2, 5),", "out: false, outT: 0, outCd: rand(2, 5), path: false, pathT: 0, air: null, y: 0,")

# --- knocked out: off the footpath; in the air: straight on, untouchable, until it lands
g = rep(g, "      r.ko -= dt; r.speed = Math.max(0, r.speed - r.speed * 3 * dt - 2000 * dt);", "      r.path = false; r.ko -= dt; r.speed = Math.max(0, r.speed - r.speed * 3 * dt - 2000 * dt);")
g = rep(g, "    r.rot = lerp(r.rot, 0, Math.min(1, dt * 8));\n",
  "    r.rot = lerp(r.rot, 0, Math.min(1, dt * 8));\n"
  "    if (r.air) { // off a cart: straight along the footpath until it comes down\n"
  "      r.air.t += dt; r.y = FP.heightAt(r.air, r.air.t); r.dist += r.speed * dt;\n"
  "      if (r.air.t >= r.air.airTime) { r.air = null; r.y = 0; r.speed *= 1 - FP.JUMP.landLoss; }\n"
  "      continue;\n"
  "    }\n")
g = rep(g, "    if (r.out) target = Math.max(target, r.top * 1.03); // out on the wrong side: flat out, to get it over with\n",
  "    if (r.out) target = Math.max(target, r.top * 1.03); // out on the wrong side: flat out, to get it over with\n"
  "    if (r.path) target = Math.max(target, r.top);       // up on the footpath: nothing in the way\n")

# --- room in the outer lane, to come back down into
g = rep(g, "    const rMin = -seg.half + 0.2; let rMax = -0.15;", "    let rMin = -seg.half + 0.2, rMax = -0.15;")
g = rep(g, "    let nearest = null, nd = 1800, meet = 1e9, roomBack = true;", "    let nearest = null, nd = 1800, meet = 1e9, roomBack = true, roomOuter = true;")
g = rep(g, "      if (gapZ > -2 * reach - 300 && gapZ < 500 && c.x + (r.nw + c.nw) / 2 + 0.05 > laneX(1, 0)) roomBack = false;\n",
  "      if (gapZ > -2 * reach - 300 && gapZ < 500 && c.x + (r.nw + c.nw) / 2 + 0.05 > laneX(1, 0)) roomBack = false;\n"
  "      // ... or in the outer lane: no room to come down off the footpath yet\n"
  "      if (gapZ > -2 * reach - 300 && gapZ < 500 && Math.abs(c.x - laneX(1, seg.lanes - 1)) < (r.nw + c.nw) / 2 + 0.05) roomOuter = false;\n")

# --- held up: the footpath or the oncoming side
g = rep(g, "    } else if (daring > 0 && nearest && nd < 800 && r.outCd <= 0 && !r.finished && r.speed > MAX_SPEED * 0.25) {\n"
           "      if (meet > PASS_TIME * lerp(1.5, 0.6, daring)) { r.out = true; r.outT = 0; } else r.outCd = 0.5; // not now: look again in a moment\n"
           "    }\n"
           "    if (r.out) { tx = WRONG_SIDE_X; rMax = WRONG_SIDE_X; }\n",
  "    } else if (r.path) {\n"
  "      // up on the footpath: back to the road once there's room in the outer lane, or when it has gone on long\n"
  "      // enough; a cart coming up that it is too slow to jump from sends it back down early\n"
  "      r.pathT += dt;\n"
  "      const tooSlow = r.speed / MAX_SPEED < FP.JUMP.minSpeed + 0.05 && cartAhead(seg.index, 14);\n"
  "      if (roomOuter && r.pathT > 1.5 || r.pathT > 8 || tooSlow || r.finished) { r.path = false; r.outCd = rand(1.5, 4); r.laneX = laneX(1, seg.lanes - 1); }\n"
  "    } else if (daring > 0 && nearest && nd < 800 && r.outCd <= 0 && !r.finished && r.speed > MAX_SPEED * 0.25) {\n"
  "      // the footpath, if the track has one and no cart is too close to line up for (the more daring, the more often); else the oncoming side\n"
  "      if (footpath() && Math.random() < 0.5 * daring && !cartAhead(seg.index, 25)) { r.path = true; r.pathT = 0; }\n"
  "      else if (meet > PASS_TIME * lerp(1.5, 0.6, daring)) { r.out = true; r.outT = 0; } else r.outCd = 0.5; // not now: look again in a moment\n"
  "    }\n"
  "    if (r.path) { tx = -FP.centre(seg.half, footpath()); rMin = tx; }\n"
  "    else if (r.out) { tx = WRONG_SIDE_X; rMax = WRONG_SIDE_X; }\n")

# --- the kerb costs a rival what it costs you, and a cart sends it flying
g = rep(g, "    r.x += clamp(tx - r.x, -1.3 * dt, 1.3 * dt);\n    r.dist += r.speed * dt;\n",
  "    const xWas = r.x;\n"
  "    r.x += clamp(tx - r.x, -1.3 * dt, 1.3 * dt);\n    r.dist += r.speed * dt;\n"
  "    const kerb = FP.kerbCrossing(seg.half, footpath(), xWas, r.x, !!seg.junction);\n"
  "    if (kerb) r.speed *= 1 - (kerb === 'climb' ? footpath().climbLoss : footpath().dropLoss);\n"
  "    if (r.path) { // at a cart: line up and jump, straight along the footpath; too slow, and the cart wrecks it\n"
  "      const cart = seg.solids.find(q => q.kind === 'cart' && q.offset < 0 && q.seg0 === seg.index);\n"
  "      if (cart && r.speed / MAX_SPEED >= FP.JUMP.minSpeed) { r.x = cart.offset - cart.nw / 2; r.air = { ...FP.jump(r.speed / MAX_SPEED), t: 0 }; }\n"
  "      else if (cart) { r.ko = 3; r.koBy = 'traffic'; r.koDir = 1; r.speed *= 0.1; r.outCd = rand(4, 8); }\n"
  "    }\n")
g = rep(g, "function updateRivals(dt) {\n",
  "// is there a cart ramp on our side's footpath within n segments ahead of segment i?\n"
  "const cartAhead = (i, n) => { for (let k = 0; k <= n; k++) if (segments[(i + k) % segments.length].solids.some(q => q.kind === 'cart' && q.offset < 0)) return true; return false; };\n"
  "function updateRivals(dt) {\n")

# --- 2D: a rival in a jump is drawn above the road
g = rep(g, "        const y = cy - destH + bounce;\n        if (y + destH <= seg.clip + destH * 0.5) drawTuk(car.img,",
  "        const y = cy - destH + bounce - scale * (car.y || 0) * H / 2; // (up in a jump)\n        if (y + destH <= seg.clip + destH * 0.5) drawTuk(car.img,")
save('web/game.js', g)
print('footpath rival edits applied')
```

- [ ] **Step 2: Apply it and remove it**

Run: `python3 fp-edits-rivals.py && rm fp-edits-rivals.py && node --check web/game.js && node --test tests/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `footpath rival edits applied`, no syntax error, `pass 165`, `fail 0`.

- [ ] **Step 3: A rival on the footpath**

Start the `roadrash` preview (3D), reload without cache (`for (const f of ['game.js']) await fetch(f, { cache: 'reload' }); location.reload()`), wait two seconds, and run:
```js
const r = window.__rrr, F = window.RRR.footpath;
const run = speed => { r.setLevel(4); r.setupRace(); r.step(260); const car = r.traffic.find(t => t.type === 'car' && t.dir === 1); r.traffic.length = 0;
  const rv = r.rivals[0]; r.rivals.length = 1; rv.style = { ...rv.style, daring: 1, aggression: 0 }; const fp = r.def.road.footpath, s = r.segments;
  const k0 = s.findIndex((g, n) => n > 500 && g.sprites.some(q => q.kind === 'cart' && q.offset < 0)), half = s[k0].half;
  // the rival starts on the footpath 40 segments before a cart, with a queue in the outer lane so it has no room to come down
  Object.assign(rv, { dist: (k0 - 40) * 200, x: -F.centre(half, fp), speed, top: speed, path: true, pathT: 0, outCd: 0, ko: 0, delay: 0 });
  Object.assign(r.player, { dist: (k0 + 600) * 200, x: -0.3, speed: 0 });
  for (let z = rv.dist - 1500; z < rv.dist + 26000; z += 700) r.traffic.push({ ...car, z, x: -(half - 0.3), lane: 2, speed: 0, passCd: 0 });
  let air = 0, landed = 'never', ko = 0;
  for (let i = 0; i < 240; i++) { const was = !!rv.air; r.step(1); const seg = s[Math.floor(rv.dist / 200) % s.length];
    if (rv.air) air++; else if (was) landed = F.zoneAt(seg.half, fp, rv.x, !!seg.junction) + ' ' + (Math.floor(rv.dist / 200) - k0) + ' segments past the cart'; if (rv.ko > 0) ko++; }
  return [Math.round(speed / 150) + ' km/h', 'air ' + (air / 60).toFixed(2) + 's', 'landed ' + landed, 'on footpath at end ' + rv.path, 'knocked out ' + (ko > 0)].join(' | '); };
const held = daring => { r.setLevel(4); r.setupRace(); r.step(260); const car = r.traffic.find(t => t.type === 'car' && t.dir === 1); r.traffic.length = 0;
  const rv = r.rivals[0]; r.rivals.length = 1; rv.style = { ...rv.style, daring, aggression: 0 }; const fp = r.def.road.footpath, s = r.segments;
  const k0 = s.findIndex((g, n) => n > 500 && g.sprites.some(q => q.kind === 'cart' && q.offset < 0));
  Object.assign(rv, { dist: (k0 - 110) * 200, x: -0.9, speed: 9000, outCd: 0, ko: 0, delay: 0 }); Object.assign(r.player, { dist: (k0 + 400) * 200, x: -0.3, speed: 0 });
  for (const x of [-0.3, -0.9, -1.5]) r.traffic.push({ ...car, z: rv.dist + 1500, x, lane: Math.round((-x - 0.3) / 0.6), speed: 2500, passCd: 0 });
  const rnd = Math.random; Math.random = () => 0.01; let path = 0; const zones = new Set();
  for (let i = 0; i < 600; i++) { r.step(1); const seg = s[Math.floor(rv.dist / 200) % s.length]; zones.add(F.zoneAt(seg.half, fp, rv.x, !!seg.junction)); if (rv.path) path++; }
  Math.random = rnd; return 'daring ' + daring + ' | on the footpath ' + (path / 60).toFixed(1) + 's | zones ' + [...zones].sort().join('+'); };
[run(9000), run(3600), held(1), held(0)]
```
Expected (the seconds on the footpath in the third line vary between about 1.5 and 4):
```
60 km/h | air 0.98s | landed footpath 49 segments past the cart | on footpath at end false | knocked out false
24 km/h | air 0.00s | landed never | on footpath at end false | knocked out false
daring 1 | on the footpath 3.0s | zones footpath+road
daring 0 | on the footpath 0.0s | zones road
```
In order: a fast rival on the footpath jumps the cart and lands on the footpath; a slow one comes down before the cart; a daring rival held up by traffic mounts the footpath; one with no daring never does.

- [ ] **Step 4: Every track, both renderers**

Run in the page:
```js
const r = window.__rrr, K = r.keys, out = []; let onPath = 0;
for (let i = 0; i < 7; i++) { r.setLevel(i); r.setupRace(); K.ArrowUp = true;
  for (let n = 0; n < 100; n++) { r.step(12); for (const v of r.rivals) if (v.path) onPath++; }
  out.push([r.def.id, r.state, 'stalls ' + r.segments.reduce((a, s) => a + s.sprites.filter(q => q.onPath && q.kind === 'chai').length, 0), 'carts ' + r.segments.reduce((a, s) => a + s.sprites.filter(q => q.kind === 'cart').length, 0)].join(' ')); }
K.ArrowUp = false; ({ problems: window.RRR.validate(), out, rivalsSeenOnFootpath: onPath > 0 })
```
Expected: `problems: []`, seven lines each ending in the same number of stalls and carts with state `race`, `rivalsSeenOnFootpath: true`, and no console errors. Then load the preview with `?2d` and run it again: the same, with no console errors. Stop the preview server.

- [ ] **Step 5: Commit**

```bash
git status --short   # only web/game.js
git add web/game.js
git commit -m "Rivals: the daring ones use the footpath and the cart ramps when held up"
```

---

### Task 7: README and the Mac bundle

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Describe the footpath in the README**

In the `## Gameplay` list, directly after the bullet that starts `- To drift:`, add:
```markdown
- Every track has a raised footpath on both sides, and you can drive on it at full speed. Climbing the kerb costs a quarter of your speed and dropping off it about an eighth.
- Chai stalls block the footpath. A hand cart is parked before each one, resting on its handles: drive onto it at 30 km/h or more and you jump. The jump goes where the auto is pointing. Straight on, you clear the stall and land on the footpath; pointed at the road, you fly over the traffic and land in a lane. There is no steering in the air.
- Land on a vehicle or a cow and you crash. Hit a cart too slowly or off-centre, or a stall without jumping, and you are wrecked.
- Jumps pay cash on the results screen. A flyover (off the footpath, over a vehicle, into the road) pays more.
- The daring drivers use the footpath and the carts too when traffic holds them up.
```

In the `## Tracks, cities and styles` table, replace the row that starts `| Style |` with:
```markdown
| Style | `web/styles/<id>.js` | How the road is put together, the footpath (width, kerb cost, how far apart the stalls stand), the traffic mix, the handling numbers (top speed, drift, slipstream) and the cash rates |
```

After the sentence that ends `for example \`traffic: { count: 40, cows: 0, dogs: 0, oncoming: 0.3 }\`.`, add a sentence: `` `road: { footpath: false }` gives a track no footpath.``

- [ ] **Step 2: Build the Mac app and load the bundle from `file://`**

Run: `./build.sh && ls "build/Road Rash.app/Contents/Resources/web/engine"`
Expected: `✓ built build/Road Rash.app`, and `footpath.js` among the engine files.

`screencapture` does not work in agent sessions on this machine, so check the bundle with a headless WebKit view instead. Write this to a scratch file outside the repo (for example `/tmp/filecheck.swift`):
```swift
// Loads the bundled game from file:// in a WKWebView (as the Mac app does) and prints what it booted into.
import Cocoa
import WebKit
let web = URL(fileURLWithPath: CommandLine.arguments[1])
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 960, height: 540))
let win = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = view
view.loadFileURL(web.appendingPathComponent("index.html"), allowingReadAccessTo: web)
DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
  let js = "(() => { try { const r = window.__rrr; r.setupRace(); r.step(120); return JSON.stringify({ protocol: location.protocol, problems: RRR.validate(), def: r.def.id, footpath: r.def.road.footpath, carts: r.segments.reduce((a, s) => a + s.sprites.filter(q => q.kind === 'cart').length, 0), rules: typeof RRR.footpath.zoneAt, state: r.state }); } catch (e) { return 'ERROR ' + e.message; } })()"
  view.evaluateJavaScript(js) { result, error in
    print(result ?? "nil", error?.localizedDescription ?? "")
    exit(0)
  }
}
app.run()
```
Run:
```bash
swiftc -O -framework Cocoa -framework WebKit /tmp/filecheck.swift -o /tmp/filecheck && /tmp/filecheck "$PWD/build/Road Rash.app/Contents/Resources/web"
```
Expected: one line of JSON with `"protocol":"file:"`, `"problems":[]`, a `footpath` object, `carts` above 0, `"rules":"function"` and `"state":"countdown"`. This proves the bundle loads and builds a road with a footpath; it does not prove the app window renders. Say so in your report.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README: footpaths, cart ramps and jump cash"
```

---

### Task 8: Release

Each finished update ships to web and Homebrew. Do this after the branch is merged to `main`, from a separate worktree on `main`, reading the current version at that moment (other sessions release too).

**Files:**
- Modify: `web/game.js` (`GAME_VERSION`), `macos/Info.plist`, `CHANGELOG.md`, `Casks/roadrash.rb`

- [ ] **Step 1: Work from a worktree on `main` and read the current version**

```bash
set -euo pipefail
git fetch origin
git worktree add ../release-footpath origin/main -b release-footpath
cd ../release-footpath && git merge --ff-only <the feature branch>
grep -n "GAME_VERSION = " web/game.js && git tag --sort=-v:refname | head -1 && ls web/engine/footpath.js
```
The new version is the next minor after `GAME_VERSION` (for example `3.7.0` becomes `3.8.0`). If the fast-forward fails, `main` has moved: merge `origin/main` into the feature branch in its own worktree first, re-run the tests and the Task 6 smoke check, then come back.

- [ ] **Step 2: Bump the version and write the changelog entry**

Set `GAME_VERSION` in `web/game.js`, `CFBundleShortVersionString` in `macos/Info.plist` to the new version, and raise `CFBundleVersion` by one. Add at the top of `CHANGELOG.md` (under `# Changelog`), with the real version:
```markdown
## vX.Y.0: Footpaths and cart ramps

- **You can drive on the footpath:** every track has a raised footpath on both sides, at full speed. Climbing the kerb costs a quarter of your speed, dropping off it about an eighth.
- **Hand carts are ramps:** chai stalls block the footpath, and a hand cart parked before each one launches you at 30 km/h or more. The jump goes where the auto is pointing: straight on to clear the stall, or towards the road to fly over the traffic and land in a lane.
- **Jumps pay:** every jump pays cash on the results screen, and a flyover (off the footpath, over a vehicle, into the road) pays more.
- **Mind the landing:** come down on a vehicle or a cow and you crash; hit a cart slowly or off-centre and you are wrecked.
- **Daring rivals use it too:** held up by traffic, they mount the footpath and take the carts.
```

- [ ] **Step 3: Test, commit and push**

```bash
set -euo pipefail
node --check web/game.js && node --test tests/*.test.js
git add web/game.js macos/Info.plist CHANGELOG.md
git commit -m "vX.Y.0: driveable footpaths, hand-cart ramps, jump and flyover cash, daring rivals on the footpath"
git push origin HEAD:main
```

- [ ] **Step 4: Deploy the web build and confirm it is live**

```bash
set -euo pipefail
./deploy-web.sh
```
GitHub Pages takes one to three minutes. Then:
```bash
curl -s "https://shankyty.github.io/Roadrash/game.js?$(date +%s)" | grep -o "GAME_VERSION = '[0-9.]*'"
curl -s -o /dev/null -w "%{http_code}\n" "https://shankyty.github.io/Roadrash/engine/footpath.js?$(date +%s)"
```
Expected: the new version, and `200`. If it still shows the old version, check `gh api repos/shankyty/Roadrash/pages/builds/latest --jq .status` and wait for `built`.

- [ ] **Step 5: Build, publish the DMG and update the cask**

```bash
set -euo pipefail
./build.sh && ./make-dmg.sh
gh release create vX.Y.0 build/RoadRash.dmg --repo shankyty/Roadrash --target main --title "vX.Y.0" --notes "Driveable footpaths, hand-cart ramps, jump and flyover cash, daring rivals on the footpath."
curl -sL -o /tmp/RoadRash.dmg https://github.com/shankyty/Roadrash/releases/download/vX.Y.0/RoadRash.dmg
shasum -a 256 build/RoadRash.dmg /tmp/RoadRash.dmg
```
Expected: the two hashes match. Set `version` and `sha256` in `Casks/roadrash.rb`, then:
```bash
set -euo pipefail
git add Casks/roadrash.rb
git commit -m "Cask: vX.Y.0"
git push origin HEAD:main
```

- [ ] **Step 6: Confirm Homebrew upgrades**

```bash
brew update && brew upgrade --cask roadrash && brew info --cask roadrash | head -3
```
Expected: the installed version is the new one. Then remove the release worktree: `cd - && git worktree remove ../release-footpath && git branch -d release-footpath`.
