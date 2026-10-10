'use strict';
// Race state, loading a track and setting up a race.
// ------------------------------------------------------------------ world state
let segments = [], trackLength = 0, themeSprites = {}, bgLayers = {};
// def: the loaded track's resolved definition (engine/registry.js) · theme: its look (sky, fog, road colours, scenery)
let def = null, theme = null;
// level: the selected race's place in ORDER (saved as a track id)
let level = RRR.selectedTrackIndex(store, ORDER), cash = store.get('cash', 0), round = store.get('round', 0);
const unlocked = ORDER.length - 1; // every race is open from the start
// stats: this race's drift score and close passes (engine/race-stats.js) · records: per-track bests (engine/records.js)
// titleBest: the selected track's records, shown on the title screen
const records = new RRR.Records(store);
let stats = null, titleBest = null;
let state = 'title', paused = false, pauseSel = 0, countdown = 0, raceTime = 0, finishTimer = 0, finishDist = 0, startZ = 0;
let position = 0, skyOffset = 0, farOffset = 0, nearOffset = 0, shake = 0;
let rivals = [], traffic = [], finishOrder = [], results = null;
let junctions = [], crossTraffic = [], worldT = 0; // road junctions (with signals) and the traffic crossing at them
let particles = [], popups = [], messages = [], bubbles = [], frameNo = 0, hawkerT = 2;
const player = {};

// your auto's footprint on the road turns with it: across the road it's wider and shorter
const bodyAngle = () => (player.heading || 0) + (player.slip || 0); // where the auto points (heading + drift slip)
const playerW = () => (Math.abs(Math.cos(bodyAngle())) * TUK_NW * ROAD_W + Math.abs(Math.sin(bodyAngle())) * TUK_LEN) / ROAD_W;
const playerL = () => Math.abs(Math.cos(bodyAngle())) * TUK_LEN + Math.abs(Math.sin(bodyAngle())) * TUK_NW * ROAD_W;
function resetPlayer() {
  Object.assign(player, { x: 0, dist: PLAYER_Z, speed: 0, health: 100, lean: 0, rot: 0, tip: 0, crash: 0, crashDir: 1,
    atk: null, hurt: 0, inv: 0, kos: 0, finished: false, time: 0, name: 'YOU', steer: 0, puff: 0, hornCd: 0, isPlayer: true, heading: 0, slip: 0, drift: 0, brkWas: false,
    boost: 0, boostT: 0, driftT: 0, driftPts: 0, // boost: share of top speed added while boostT lasts · driftT, driftPts: the current drift's time and points
    air: null, y: 0 }); // air: the jump in progress (off a cart ramp), or null · y: height above the road
}

// ------------------------------------------------------------------ track loading
// The road is built by engine/track-builder.js and its traffic by engine/traffic-spawner.js, both from the
// track's definition. x is in fixed units (1 = 2000 world units, one lane is LANE_W); we keep left, so our
// carriageway is x < 0 and oncoming traffic uses x > 0.
const { LANE_W, laneX } = RRR.road;
const halfAt = z => findSegment(z).half;
// The footpath (engine/footpath.js): a raised, driveable strip behind the kerb stones on both sides, with chai
// stalls blocking it and a hand cart before each stall as a ramp. zoneOf: 'road', 'footpath' or 'grass'.
const FP = RRR.footpath;
const footpath = () => def.road.footpath; // this track's footpath settings, or false
const zoneOf = (seg, x) => FP.zoneAt(seg.half, footpath(), x, !!seg.junction);
const gridGap = () => (use3D ? TUK_LEN + 350 : 520); // between rows of the starting grid: 3D autos need a real gap
// traffic lights (engine/junction.js), on the world clock
const lightOf = j => RRR.junction.light(worldT, j);
const crossGo = j => RRR.junction.crossGo(worldT, j);

function loadTrack(idx) {
  def = RRR.resolve(ORDER[idx % ORDER.length]);
  theme = def.look;
  setPlayerDriver(playerDriver());
  Music.setCity(def.city);
  Ambience.setCity(def.city.id);
  const r = mulberry32(def.seed * 3);
  themeSprites = { buildings: theme.buildings.map(col => makeBuilding(r, col)),
    billboards: [...BILLBOARDS, ...def.city.ads.map((lines, i) => ({ ...AD_COLORS[i % AD_COLORS.length], lines }))].map(makeBillboard) };
  bgLayers = { far: def.skyline.far(PAINT, theme, def.seed), near: def.skyline.near(PAINT, theme, def.seed + 5) };
  ({ segments, trackLength, startZ, junctions } = RRR.buildTrack({ def, round, sprites: SP, themeSprites,
    constants: { SEG_LEN, RUMBLE_LEN, PLAYER_Z, GRID_GAP: gridGap() } }));
  if (use3D) World3D.setTrack({ segments, trackLength, theme, city: def.city.id, SP, themeSprites, CAR_COLORS, CAR_LOOKS, TRACTOR_LOOKS, BUS_LOOKS, BIKE_LOOKS, DOG_COATS, DRIVERS, attackPose, attackPoseAt, moveOf, hitRock, MAX_SPEED, LANE_W, footpath: def.road.footpath });
}

function findSegment(z) { return segments[Math.floor(((z % trackLength) + trackLength) % trackLength / SEG_LEN) % segments.length]; }
function wrapDelta(d) { d = ((d % trackLength) + trackLength) % trackLength; return d > trackLength / 2 ? d - trackLength : d; }

// ------------------------------------------------------------------ race setup
function setupRace() {
  loadTrack(level);
  stats = new RRR.RaceStats(def.scoring);
  trackEvent(`race-start/${def.city.id}/${def.id}`, `Race started: ${def.name} (${def.style})`);
  resetPlayer();
  const diff = 1 + round * 0.04;
  const nR = def.rivals.count;
  rivals = [];
  // grid: two per row, player in the middle of the pack
  const slots = [];
  for (let i = 0; i < nR + 1; i++) slots.push({ row: Math.floor(i / 2), x: laneX(1, i % 2) }); // our side of the road, two lanes
  const rows = Math.ceil((nR + 1) / 2);
  const playerSlot = Math.min(nR, Math.floor((nR + 1) / 2) + ((nR + 1) % 2 ? 0 : 1));
  const rowZ = row => PLAYER_Z + (rows - 1 - row) * gridGap();
  const shiftZ = PLAYER_Z - rowZ(slots[playerSlot].row);
  player.x = slots[playerSlot].x;
  const grid = pickGrid(def.city.id, nR, player.driver);
  let ri = 0;
  for (let i = 0; i < slots.length; i++) {
    if (i === playerSlot) continue;
    const d = grid[ri], st = d.style; // the driver: their auto, their weapon and the way they drive
    rivals.push({ name: d.name, driver: d, style: st, weapon: d.weapon, color: d.look.body, palette: d.look, img: SP.rivalOf[d.id], nw: TUK_NW,
      x: slots[i].x, dist: rowZ(slots[i].row) + shiftZ, speed: 0,
      top: MAX_SPEED * def.handling.topSpeed * clamp(def.rivals.skill * diff + st.pace + rand(-0.01, 0.01), 0.7, 1.02),
      health: 100, ko: 0, koBy: null, rot: 0, atk: null, cd: rand(1, 3), grudgeT: 0, out: false, outT: 0, outCd: rand(2, 5), path: false, pathT: 0, air: null, y: 0, laneX: laneX(1, Math.floor(Math.random() * 2)),
      laneT: rand(st.weave[0], st.weave[1]), delay: rand(st.launch[0], st.launch[1]), finished: false, time: 0, hurt: 0, scr: null, isRival: true });
    ri++;
  }
  traffic = RRR.spawnTraffic({ def, round, sprites: SP, maxSpeed: MAX_SPEED, looks: { CAR_LOOKS, TRACTOR_LOOKS, BIKE_CALM, BIKE_RASH },
    world: { startZ, trackLength, halfAt, findSegment } });
  skidMarks = []; crossTraffic = []; for (const j of junctions) { j.busy = false; j.spawn = [0, 0]; j.fined = false; }

  finishDist = startZ + def.laps * trackLength;
  finishOrder = []; results = null; particles = []; popups = []; messages = []; bubbles = [];
  raceTime = 0; position = 0; countdown = 3.99;
  state = 'countdown'; lastBeep = 4;
  Sfx.startEngine();
}
