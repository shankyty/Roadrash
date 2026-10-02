# Track packs and race styles: design

Date: 2026-10-02
Status: awaiting review

## Goal

Make every track config-driven, with one folder per track, and give tracks distinct race styles: high speed, drift, and traffic (lane surfing). Finishing order decides every race. Each track records best time, drift score and close passes.

The work is built in two steps:

1. **Restructure.** Move all track and city data out of `web/game.js` into packs. The 7 races play exactly as they do today.
2. **Styles.** Add the speed, drift and traffic styles, race stats, and per-track records.

Each step ships as its own release to web and Homebrew.

## Constraints

- No build step. The game is classic scripts loaded by `web/index.html`.
- The Mac app loads `index.html` from `file://`, so packs are script files that register themselves. No `fetch`, no JSON files, no ES modules.
- `web/game.js` is a single 3,373-line closure with no tests. The refactor moves data and two functions out of it; it does not split the rest.
- Road and traffic generation is seeded. Step 1 must preserve the order of random draws so the 7 roads come out identical.

## Out of scope

- Splitting audio, rendering, input or AI out of `game.js`.
- New tracks, new art or new audio.
- New rival AI (rivals already slow for bends and steer around traffic).
- The Unreal fork in `unreal/`.

## File layout

```
web/
  packs.js                    manifest: style, city and track ids in race order
  tracks/
    marine-drive/track.js
    charminar-road/track.js
    sea-link/track.js
    ring-road/track.js
    western-express/track.js
    marina-beach/track.js
    juhu-beach/track.js
  cities/
    mumbai/      city.js  skyline.js  ambience.js
    hyderabad/   city.js  skyline.js  ambience.js
    delhi/       city.js  skyline.js  ambience.js
    chennai/     city.js  skyline.js  ambience.js
  styles/
    classic.js  speed.js  drift.js  traffic.js
  engine/
    registry.js
    track-builder.js
    traffic-spawner.js
    records.js
    race-stats.js             (step 2)
  game.js  world3d.js
tests/
  registry.test.js  records.test.js  golden-roads.test.js
  styles.test.js  race-stats.test.js      (step 2)
  golden/classic-roads.json
```

`web/ambience-<city>.js` moves to `web/cities/<city>/ambience.js`. Race order is unchanged: Marine Drive, Charminar Road, Sea Link, Ring Road, Western Express, Marina Beach, Juhu Beach.

## Packs

All packs register on one global, `RRR`, created by `engine/registry.js`.

### Track pack

Owns what is unique to one race.

```js
RRR.tracks.register({
  id: 'sea-link',
  name: 'MUMBAI · BANDRA-WORLI SEA LINK',
  city: 'mumbai',
  style: 'classic',                 // step 2 changes this to 'speed'
  seed: 27, length: 3000, laps: 1,
  rivals: { count: 6, skill: 0.9 },
  traffic: { count: 46, cows: 0, dogs: 0 },
  ambience: false,                  // optional, default true
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

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Folder name, storage key and analytics key |
| `name`, `city`, `style` | yes | Display name; ids of a registered city and style |
| `seed`, `length`, `laps` | yes | Road seed, length in segments, laps |
| `rivals.count`, `rivals.skill` | yes | Field size and rival top-speed factor |
| `traffic.count`, `.cows`, `.dogs` | yes | Base counts for this road |
| `look` | yes | Today's `THEMES` entry, minus `city` and `ads`, same field names |
| `ambience` | no | `false` silences the street recording |
| `road`, `traffic.*`, `handling`, `scoring` | no | Per-key overrides of the style's values |

### City pack

Owns what the Mumbai races share, and the equivalent for each other city.

- `city.js`: `id`, `hawkerCalls`, `curses`, `song` (today's `SONGS` entry), `busLooks`, `ads`.
- `skyline.js`: `RRR.cities.skyline(id, { far(paint, look, seed), near(paint, look, seed) })`. `paint` is a kit of the six helpers the painters use from `game.js` today: `mk`, `ell`, `rr`, `shade`, `lerp`, `mulberry32`. The shared skyline helpers (`litWindows`, `fillerBlocks`, `trees`, `waterBand`, `cutOut`, `archPath`, `onion`, `LAYER_W`) join the kit.
- `ambience.js`: the street recording, lazy-loaded when a race in that city starts, as today.

### Style pack

Owns how a kind of race is built and tuned. `classic` holds today's exact values.

```js
RRR.styles.register({
  id: 'classic',
  label: 'CLASSIC',
  road: {
    lengths: [25, 50, 75],
    pieces: [                       // ordered; weight is the share out of 100
      { kind: 'straight',  weight: 16 },
      { kind: 'curve',     weight: 26, curves: [2, 4, 6], hills: [0, 0, 20, -20, 40] },
      { kind: 'sCurve',    weight: 14, curve: 2, hills: [0, 20, -20] },
      { kind: 'hill',      weight: 12, hills: [20, 40, 60] },
      { kind: 'rollers',   weight: 12 },
      { kind: 'bumps',     weight: 10 },
      { kind: 'curveHill', weight: 10, curve: 6, hill: 30 },
    ],
    lanes: 'alternate',             // 'alternate' = 3 and 2 lanes each way in turn; 'wide' = always 3
    junctions: true,
  },
  traffic: {
    countScale: 1,                  // same-way vehicles = track count × this
    oncoming: 0.8,                  // oncoming vehicles = same-way count × this
    mix: { car: 4, bike: 4, bus: 2, truck: 1, tractor: 1 },
  },
  handling: { topSpeed: 1, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 0, passCash: 0 },   // step 2 sets these
});
```

## Engine units

### `engine/registry.js`

- `Registry`: `register(def)`, `get(id)`, `has(id)`, `ids()`. Registering a duplicate id throws. Used three times: `RRR.tracks`, `RRR.cities`, `RRR.styles`.
- `RRR.load(manifest)`: stores the manifest and, in a browser, writes one script tag per pack file in order: styles, cities (`city.js` then `skyline.js`), tracks.
- `RRR.validate()`: checks every track in the manifest. Returns a list of problems, each naming the track and field.
  - Track is registered and its `city` and `style` are registered.
  - Required fields are present with the right type.
  - No unknown keys at the top level or inside `rivals`, `traffic`, `look`, `road`, `handling`, `scoring`.
  - Every `road.pieces[].kind` is one the builder knows.
- `RRR.resolve(trackId)`: returns one deep-frozen `TrackDefinition`:
  - track fields;
  - `city`: the city pack;
  - `road`, `traffic`, `handling`, `scoring`: the style's values with the track's overrides applied per key;
  - `styleId`, `styleLabel`.
- `RRR.order()`: track ids in race order.

The file touches `document` only inside `RRR.load`, behind a check, so it runs under Node.

### `engine/track-builder.js`

`RRR.buildTrack({ def, round, constants, sprites, themeSprites, random })` returns `{ segments, trackLength, startZ, junctions }`.

- Replaces `buildTrack`, `layoutLanes`, `layoutJunctions`, `placeSigns` and the scenery loop in `game.js`.
- Piece kinds are a table of `kind → function(ctx, piece, L)`. Adding a kind is one entry.
- Holds no module state. `sprites` is the shared sprite table (`SP`), injected so tests can pass a stub. `random` is the unseeded source used for cosmetic offsets.
- For the `classic` recipe it draws from the seeded generator in exactly today's order: `t`, then `L`, then the piece's own draws.

### `engine/traffic-spawner.js`

`RRR.spawnTraffic({ def, round, world, sprites, looks, random })` returns the traffic array.

- Replaces the traffic, cow and dog setup in `setupRace`.
- The deck is built by expanding `mix` in key order, so `classic` reproduces today's deck before the seeded shuffle.
- `world` supplies `startZ`, `trackLength`, `halfAt`, `findSegment`, `laneX`.

### `engine/records.js`

- `RRR.records.get(trackId)` returns `{ bestTime, bestDrift, bestPasses, wins }` with nulls and zero as defaults.
- `RRR.records.submit(trackId, raceStats)` updates bests and returns which ones were beaten.
- Stored under `rrr_records`. Takes the storage object as a dependency. Unreadable stored data is treated as empty.

### `game.js` and `world3d.js`

- Removed from `game.js`: `TRACKS`, `THEMES`, `MUMBAI_ADS`, `HAWKER_CALLS`, `CURSES`, `SONGS`, `SKYLINES` and the skyline painters, `BUS_LOOKS`, the track-building functions and the traffic setup.
- `loadTrack` calls `RRR.resolve` and keeps one `def`. The rest of the file reads `def`, `def.look` and `def.city`.
- `Music` and `Ambience` take the city pack rather than a city name.
- `World3D.setTrack` receives the look and the city's bus liveries. It stops indexing tables by city name.
- The selected race is stored as a track id under `rrr_track`. On first run, an existing `rrr_level` index is converted to the id at that position.
- `window.__rrr` exposes `RRR` and the current `def` in place of `THEMES` and `SKYLINES`.
- The error-attribution table (`COMPONENTS`) gains entries for the new files.

### Loading order in `index.html`

`engine/registry.js`, `engine/track-builder.js`, `engine/traffic-spawner.js`, `engine/records.js`, `packs.js`, then `world3d.js` and `game.js` as today.

### Build

`build.sh` copies `web/packs.js` and the `tracks`, `cities`, `styles` and `engine` folders into the app bundle, in place of the `ambience-*.js` entry. `deploy-web.sh` already publishes all of `web/`.

## Error handling

- **Invalid pack:** `game.js` calls `RRR.validate()` before anything else. On any problem it reports through the existing `reportError` (component `config`) and draws a plain message naming the track and field in place of the title screen. No race starts.
- **Pack file fails to load:** the track is then unregistered, which validation reports the same way.
- **Ambience fails to load or decode:** unchanged; the race runs without the street recording and the error is reported.
- **Corrupt records:** treated as empty.

## Step 2: styles

Every mechanic runs on every track. A style changes the road, the traffic and how much each mechanic pays.

### Assignment

| Track | Style |
| --- | --- |
| Marine Drive, Juhu Beach | drift |
| Sea Link, Marina Beach | speed |
| Western Express, Ring Road | traffic |
| Charminar Road | classic |

### Style values

These are starting values, tuned by playing each track before release.

| | speed | drift | traffic |
| --- | --- | --- | --- |
| Piece lengths | 50, 75, 100 | 25, 50 | 50, 75 |
| Pieces (weight) | straight 40, curve 35, hill 15, rollers 10 | curve 40, sCurve 35, curveHill 15, straight 10 | straight 45, curve 30, hill 15, rollers 10 |
| Bend sharpness | 1 to 3 | 4 to 8 | 1 to 3 |
| Lanes | wide | alternate | wide |
| Junctions | no | yes | yes |
| `countScale` | 0.5 | 0.6 | 1.6 |
| `oncoming` | 0.5 | 0.5 | 0.4 |
| Mix | car 5, bike 3, bus 2, truck 2 | as classic | car 5, bike 2, bus 3, truck 2 |
| `topSpeed` | 1.25 | 1 | 1 |
| `driftScrub` | 0.22 | 0.08 | 0.22 |
| `driftExitBoost` | 0 | 0.08 | 0 |
| `slipstream` | 0 | 0 | 0.04 |
| `driftCashPer100` | ₹20 | ₹40 | ₹20 |
| `passCash` | ₹10 | ₹10 | ₹25 |

Classic keeps today's road, traffic and handling, and pays ₹20 per 100 drift points and ₹10 per pass.

Bend sharpness 8 is above today's maximum of 6. At 8, taking the bend flat out without drifting tips the auto under the existing lean rule, and a drift does not. Both renderers are checked at sharpness 8 before the drift tracks ship.

### Mechanics

- **Top speed.** The player's speed cap and each rival's top speed are multiplied by `topSpeed`. Traffic speeds are unchanged. The speedo reads up to `80 × topSpeed` km/h.
- **Boost.** One mechanism, `player.boost = { amount, secs }`, raises the speed cap by `amount` while it lasts and is cleared by a crash.
  - Drift exit: a drift held for at least 0.6 s gives `driftExitBoost` for 1.2 s when it ends.
  - Slipstream: each close pass gives `slipstream × chain` for 1.5 s, where `chain` counts passes made before the timer lapses, up to 5.
- **Close pass.** A same-way vehicle (not a cow, dog or oncoming vehicle) goes from ahead of the player to behind, the player is faster and not crashed, and the sideways gap between the two bodies is under 0.25 road units. A vehicle counts once per 5 s.
- **Drift score.** While drifting above the drift-end speed, points grow by `100 × (speed ÷ max speed) × (slip ÷ full slip)` per second.

### `engine/race-stats.js`

`RaceStats` is created per race with the definition's `scoring` values.

- `drift(dt, speedPct, slipPct)`, `closePass()`, `tick(dt)`, `finish(time, rank)`.
- Exposes `driftScore`, `passes`, `chain`, `bestChain`, `time`, `rank`, and `cash()` returning the drift and pass bonuses.
- No DOM or game-state access.

### Results, records and screens

- Finishing order decides the result on every style. Top 3 qualifies and prize money by rank is unchanged.
- On finish, `RRR.records.submit` saves best time (any finishing rank), best drift score, most passes, and a win for 1st place.
- Title screen: style label and best time under the track name.
- Race HUD: drift points while sliding; pass popups showing the chain.
- Results screen: time with a NEW BEST callout, drift score, close passes, and the two bonuses added to the wallet.

### Analytics

Event paths use the track id where they used the theme key, for example `race-start/mumbai/marine` becomes `race-start/mumbai/marine-drive`. Step 2 adds the style id to the race-start title. Past and future counts for a track therefore sit under different paths.

## Testing

Tests run with Node's built-in runner: `node --test tests/`. No packages are installed. Test files load the engine and pack scripts with `require`, reading the file list from the manifest.

**Step 1**

- `registry.test.js`: merge order in `resolve`; frozen result; each validation failure (unregistered track, unknown city, unknown style, missing field, wrong type, unknown key, unknown piece kind); duplicate id.
- `records.test.js`: defaults, best-of logic, corrupt storage. The `rrr_level` to `rrr_track` conversion is covered here as a pure function.
- `golden-roads.test.js`: before any code moves, a fingerprint of each of the 7 roads is captured from the current game through `window.__rrr`, at tour 0, in both 3D and 2D grid spacing, and saved to `tests/golden/classic-roads.json`. The fingerprint covers what is seeded: per-segment curve, height, lane half-widths and lane count; junction positions; scenery and sign kinds per segment; and each vehicle's type, direction, lane and position. After the refactor the builder and spawner must reproduce all 7 exactly.
- In the browser: one race started and finished in 3D and one in 2D (`?2d`), the Mac app built and launched from `file://`, and the console checked for errors.

**Step 2**

- `styles.test.js`: for each style, a built road respects its limits (bend sharpness range, lane pattern, junctions on or off) and the spawner's counts match `countScale` and `oncoming`.
- `race-stats.test.js`: drift scoring, chain growth and lapse, the chain cap, cash.
- In the browser: one race per style in 3D and one in 2D, checking the boost, the popups, the results screen and that records persist across a reload.

## Releases

Each step is released to web and Homebrew and verified with `brew upgrade`. Version numbers are chosen at release time from the then-current `main`, because other sessions release concurrently.

- Step 1: a patch release with no visible change.
- Step 2: a minor release with the styles, stats and records in the changelog.
