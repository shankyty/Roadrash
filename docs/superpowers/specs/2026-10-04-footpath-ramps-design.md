# Driveable footpaths and cart ramps: design

Date: 2026-10-04
Status: approved; revised after prototyping (see "Changes from prototyping")

## Goal

Every track gets a raised footpath on both sides that the auto can drive on. Crossing the kerb costs speed. Chai stalls block the footpath at intervals, and a parked hand cart before each stall is a ramp: hit it and the auto jumps, in the direction it is pointing. Jumps pay a cash bonus. The daring rival drivers use the footpath and the ramps too.

## Constraints

- No build step, no packages, classic scripts, packs register on `RRR`. Engine files touch no DOM and run under Node.
- A style contains numbers only. `web/game.js` does not branch on a style id.
- With `footpath: false` the builder produces exactly today's road. The golden road tests run that way and keep passing.
- The footpath pass uses its own seeded generator. It never draws from the road's generator, so existing roads do not change shape.
- Other sessions release from `main` concurrently. Work in a worktree and read the version at release time.

## Out of scope

- Traffic, cows or pedestrians using the footpath.
- Rivals other than the daring ones leaving the road.
- Steering in the air.
- A saved "most jumps" record.
- A footpath along the cross roads at junctions.

## How it plays

### The footpath

- It runs on both sides of every track, directly outside the painted kerb stones, and is one lane wide. It replaces the narrow paved strip drawn there today.
- Driving on it is at full speed, with no off-road slowdown. Beyond its back edge is grass, which slows the auto as it does now.
- Crossing the kerb sideways costs speed, with a jolt and a thump. Climbing costs more than dropping off.
- Across a junction the footpath is at road level, so driving straight along it through a junction costs nothing.
- Street furniture stands behind the footpath. Building and temple fronts move out to make room.

### Stalls and carts

- A chai stall blocks the footpath at intervals. The stall and its calling hawker already exist in both renderers.
- A hand cart stands before each stall, resting on its pull handles so its bed slopes up in the direction of travel. Carts are on the footpath only.
- Driving onto the cart at 30 km/h or more launches the auto. Faster means higher and longer.
- The jump goes where the auto is pointing at take-off. There is no steering in the air.
  - Pointing straight: the auto clears the stall and lands on the footpath.
  - Pointing at the road: it flies over the nearest lane or lanes and lands in the road.
- In the air the auto touches nothing: not traffic, cows, the stall or the kerb.
- Landing on clear ground keeps most of the speed. Landing on a vehicle is a crash. Landing on a roadside object is a wreck.
- Hitting the cart below 30 km/h, hitting it from the side, or hitting a stall without jumping is a wreck, like any roadside object today.

### Daring rivals

- A driver with `daring` above 0 who is held up by traffic chooses between pulling out onto the oncoming side (today's behaviour) and mounting the footpath. The footpath is chosen with probability `0.5 × daring`.
- On the footpath a rival pays the same kerb costs, lines up with each cart, jumps straight, and lands on the footpath.
- A rival approaching a cart below the take-off speed drops back to the road before it. One that reaches a cart too slowly anyway is knocked out by it.
- A rival only mounts the footpath when no cart is within 25 segments, so it has room to line up.
- A rival leaves the footpath when there is room in the outer lane and it has been on the footpath at least 1.5 s, or after 8 s. The cooldown before the next attempt is the one used for pulling out.
- A rival in the air cannot hit or be hit.
- Drivers with `daring` 0 never leave the road.

### Cash

- Every jump pays `jumpCash`.
- A flyover pays `flyoverCash` in place of `jumpCash`. A flyover is a jump that takes off from the footpath, passes over at least one vehicle, and lands on the road.
- Drift cash and close-pass cash are unchanged. The results screen cash line becomes Prize + KO + Drift + Lane surf + Jumps.

## Geometry

Distances across the road are in road units (one lane is 0.6). `half` is a segment's half-width.

| Band | From | To |
| --- | --- | --- |
| Road | 0 | `half` |
| Kerb stones (road level, painted) | `half` | `half + 1/6` |
| Footpath (raised) | `half + 1/6` | `half + 1/6 + width` |
| Grass | beyond | |

- The kerb line is at `half + 1/6`. The band between the lane edge and the kerb line counts as road when a footpath exists (no off-road slowdown).
- `B` is the footpath's back edge, `half + 1/6 + width`.
- With a footpath, every piece of street furniture (lamp posts, signs, signals, milestones, trees, hoardings, scenery stalls, building and temple fronts) stands 0.7 road units further out than it does without one, which puts the nearest of them just behind `B`.
- With `footpath: false` every offset is today's.
- The raised height is visual only. Zones are decided by the sideways position.

### Stalls and carts

Placed per side by the footpath pass, with a generator seeded from the track seed and the tour number.

- The first stall on a side is at least 150 segments after the start line. The gap to the next is drawn from `stallEvery`.
- A stall is skipped unless the road is plain (no junction or its clear zone, no lane taper, not the start line) from 4 segments before its cart to 100 after it. That run-out is longer than the longest jump, so a straight jump at any speed comes down on the footpath.
- The stall stands at the footpath's centre and covers its width.
- The cart starts 8 segments before the stall and is 4 segments long (800 track units). It stands at the footpath's centre and is 0.4 wide.
- Both are solid roadside objects. A stall is a `chai` sprite flagged as standing on the footpath, so its hawker calls out like any other stall's. A cart has the new kind `cart`.

## Jump rules

Starting values, tuned by play.

- **Lined up:** the auto is on the footpath, moving forward, its centre within 0.2 road units of the cart's centre as it reaches the cart's first segment, at or above `0.375 × 80 km/h` (30 km/h).
- **Air time:** `T = 0.35 + 0.75 × (speed ÷ 80 km/h)` seconds. That is about 0.6 s at 30 km/h, 1.1 s at 80 km/h and 1.3 s at 100 km/h.
- **Height:** a parabola over `T` with a peak of `450 × T²` track units.
- **Forward:** speed is held for the flight. Throttle and brake do nothing.
- **Sideways:** the auto moves sideways at the rate its take-off heading gives on the ground (`speed × sin(heading) ÷ road width`). A bend does not push the auto in the air: its sideways position is measured along the road, so a jump taken straight comes down on the footpath on a bend as well as on a straight. (Changed in the final review: with the push, most straight jumps on the bendy tracks came down off the footpath.)
- **Landing:** speed × 0.95. The drift, if any, has ended at take-off. No kerb cost is charged for where the auto comes down.
- **Shortest jump:** at 30 km/h the auto travels about 2,800 track units in the air. The cart's end to the stall's far side is about 1,000, so every valid jump clears the stall.

## Config

The footpath is part of a style's road recipe. A track can override it per key or turn it off.

```js
road: {
  lengths: [...], pieces: [...], lanes: 'alternate', junctions: true,
  footpath: {
    width: 0.6,              // road units
    climbLoss: 0.25,         // share of speed lost climbing the kerb
    dropLoss: 0.12,          // share lost dropping off it
    stallEvery: [150, 300],  // segments between stalls on each side
  },
},
scoring: { driftCashPer100: 20, passCash: 10, jumpCash: 15, flyoverCash: 40 },
```

| Style | `stallEvery` |
| --- | --- |
| traffic | 120 to 220 |
| classic, drift | 150 to 300 |
| speed | 250 to 450 |

All four styles share the width, the kerb costs and the cash rates to start with.

A track sets `road: { footpath: false }` to have no footpath.

## Engine units

### `web/engine/footpath.js` (new)

Pure functions on `RRR.footpath`. No DOM, no game state.

- `zoneAt(half, footpath, x)`: `'road'`, `'footpath'` or `'grass'`. With `footpath` false, the zones are today's: road up to `half`, grass beyond.
- `kerbCrossing(half, footpath, xBefore, xAfter)`: `'climb'`, `'drop'` or `null`.
- `takesOff(cartX, x, speedShare)`: whether the auto is within the cart's take-off width and fast enough.
- `jump(speedShare)`: `{ airTime, peak }`. The game keeps the auto's heading frozen for the flight, so its sideways movement in the air is the same rule as on the ground.
- `heightAt(jump, t)`: height above the road at time `t` into the flight.
- `furnitureShift(footpath)`: how far out street furniture moves (0 without a footpath).

The constants for the jump (minimum speed, air-time terms, peak factor, landing loss, take-off width) live here.

### `web/engine/track-builder.js`

- A footpath pass, run after scenery and signs when `def.road.footpath` is set: places stalls and carts, and tags each affected segment so the game can find the cart and stall near the auto without searching.
- Roadside offsets come from `RRR.footpath.furnitureOffsets`.
- The pass uses `mulberry32(seed × 7 + round)`, not the road's generator.

### `web/engine/registry.js`

- `road.footpath` is either `false` or an object with `width`, `climbLoss`, `dropLoss` (numbers, losses between 0 and 1) and `stallEvery` (two positive numbers, low to high).
- `scoring` gains `jumpCash` and `flyoverCash`.

### `web/engine/race-stats.js`

- `jump(flyover)` counts `jumps` and `flyovers`.
- `bonuses()` gains `jumps`: `(jumps − flyovers) × jumpCash + flyovers × flyoverCash`.
- `summary()` is unchanged. Records do not keep jumps.

## Game changes (`web/game.js`)

- **Zones.** The off-road slowdown applies in the grass zone only. The kerb cost is applied when the auto's position crosses the kerb line on the ground.
- **Player in the air.** The player gains `air` (the jump in progress, or null) and `y` (height). While `air` is set: no steering, throttle, drift, kerb, close passes or collisions. On landing: the 5% loss, a dust puff, and the landing checks.
- **Take-off.** Checked each step while on the footpath, using the cart tagged on the auto's segment.
- **Collisions.** Carts and stalls are in each segment's `solids`. The wreck test for roadside objects is skipped while airborne.
- **Rivals.** A `path` mode beside the existing `out` mode, with the same jump state as the player. Lathi hits skip anyone airborne.
- **Popups and results.** `JUMP!` or `FLYOVER!` on landing. The results stats line gains `Jumps n`, and the cash line gains `Jumps ₹n`.
- **Analytics.** Unchanged.

## Renderers

### 3D (`web/world3d.js`)

- The road mesh gains a raised footpath top and a kerb face on each side, in place of today's shoulder strip. The quads-per-segment budget grows to fit.
- A hand cart model built in code: plank bed, two tyres, two shafts and a pull bar, tilted to rest on the shafts.
- The stall uses the existing chai stall model.
- An airborne auto is lifted by its height and pitched nose-up on the way up and nose-down on the way down. Its shadow stays on the road.
- An auto on the footpath is lifted by the footpath's height.

### 2D (`web/game.js`)

- The footpath strip is drawn at its new width with a darker kerb line.
- A painted cart sprite.
- An airborne auto is drawn above its shadow, scaled by its height.

## Error handling

- A bad `footpath` or missing cash rate is reported by pack validation on the error screen, like any other pack mistake.
- A stall that cannot be placed (junction or taper) is skipped. A side may end up with no stalls on a short road; that is valid.

## Testing

Node tests (`node --test tests/*.test.js`):

- `footpath.test.js`: zones at each boundary, with and without a footpath; climb and drop detection; lined-up limits; air time, peak and sideways rate against speed and heading; the shortest jump clears a stall.
- `track-builder.test.js`: with a footpath, every stall has a cart 8 segments before it; no stall or cart within a junction or taper; nothing else solid stands between the kerb line and `B`; the same seed and tour give the same footpath and a later tour gives another; with `footpath: false` no stalls or carts exist and offsets are today's.
- `registry.test.js`: each new validation failure.
- `race-stats.test.js`: jump and flyover counts and cash.
- `styles.test.js`: every shipped style has a footpath, and stall spacing matches its range.
- `golden-roads.test.js`: unchanged expectations, built with `footpath: false`.

Scripted browser checks, in 3D and 2D:

- Climbing the kerb multiplies speed by `1 − climbLoss`; dropping by `1 − dropLoss`; driving along the footpath through a junction costs nothing.
- A straight jump at 60 km/h clears the stall and lands on the footpath.
- A jump with the auto pointed at the road lands in a lane.
- Landing on a bus crashes. Hitting a cart at 20 km/h wrecks. Hitting a stall without jumping wrecks.
- A flyover pays `flyoverCash`; a plain jump pays `jumpCash`; both show on the results screen.
- A rival with `daring` 1 held up by traffic mounts the footpath, jumps a cart and returns to the road. A rival with `daring` 0 never does.
- Classic handling on the road is unchanged.

By eye: both renderers at a cart and stall, and the Mac bundle loaded from `file://` headlessly.

## Build order

1. Footpath rules and config (engine, validation, stats, tests).
2. Builder: footpath pass and furniture offsets.
3. Game: zones, kerb, the player's jump, collisions, popups and results.
4. Renderers: 3D footpath, cart, airborne auto; 2D strip, cart sprite, airborne sprite.
5. Daring rivals on the footpath.
6. README, changelog, release as the next minor version.

Rivals are last so they can be held back without affecting the rest.

## Changes from prototyping

The feature was prototyped outside the repo before the plan was written. These points differ from the design as first approved:

- **Run-out after a cart.** Flights are long (66 segments at 80 km/h, 97 at 100 km/h), and the footpath moves sideways where lanes taper. Stalls are now placed only where the road is plain for 100 segments past the cart, so a straight jump always lands on the footpath. This removes some stall positions; traffic tracks' spacing moved to 120 to 220 to keep the next cart clear of a landing.
- **Full-width blocking.** With the roadside collision test used for trees and posts, an auto straddling the kerb slipped past a stall. Stalls and carts use their full width.
- **Furniture moves by one amount** (0.7 road units) in place of per-kind ranges. It keeps today's layout, shifted out.
- **Sideways flight comes from a frozen heading** in the game, not from a value the rules module returns.
- **Rivals:** one that reaches a cart too slowly is knocked out; one only mounts the footpath when no cart is close.
- **3D:** the footpath slopes down to road level in the segment next to a junction, and an auto's contact shadow stays on the ground while it is in the air.

