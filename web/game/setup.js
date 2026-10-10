'use strict';
// Road Rash: Rickshaw Rumble — a pseudo-3D combat racer where you drive an auto-rickshaw. Canvases, constants and small helpers.
const canvas = document.getElementById('game');            // UI layer (HUD, bubbles, menus); also the whole game in 2D mode
const ctx = canvas.getContext('2d');
const bgCanvas = document.getElementById('bg'), glCanvas = document.getElementById('gl'); // sky + 3D world layers
const bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
let use3D = false, playerScr = null; // playerScr: where the 3D auto is on screen (for exhaust, dust, your bubble)
const W = 960, H = 540;

// ------------------------------------------------------------------ constants
const SEG_LEN = 200, RUMBLE_LEN = 3, ROAD_W = 2000, LANES = 3;
const FOV = 100, CAM_H = 1000, DRAW_DIST = 300, FOG_DENSITY = 5;
const CAM_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const MAX_SPEED = SEG_LEN * 60;
const ACCEL = MAX_SPEED / 6, BRAKE = -MAX_SPEED, DECEL = -MAX_SPEED / 5;
const OFFROAD_DECEL = -MAX_SPEED / 2, OFFROAD_LIMIT = MAX_SPEED / 4, CENTRIFUGAL = 0.25;
const KMH = 80; // top speed shown on the speedo
// heading: the way your auto faces relative to the road (radians, + = right). Under PIVOT_SPEED (15 km/h)
// steering pivots it almost on the spot, up to 90 degrees; at racing speed it's held to a gentle angle
const PIVOT_SPEED = MAX_SPEED * 15 / KMH, MAX_PIVOT = Math.PI / 2, MAX_RACE_HEADING = 0.33;
// drift: above DRIFT_MIN, steering + a brake tap kicks the back out (body swings up to DRIFT_SLIP off the
// way you're travelling); it ends when you let go of the steer, change sides, or drop under DRIFT_END
const DRIFT_MIN = MAX_SPEED * 25 / KMH, DRIFT_END = MAX_SPEED * 20 / KMH, DRIFT_SLIP = Math.PI / 4;
let skidMarks = []; // tyre marks on the road: { d1, x1, d2, x2, t } in track coordinates
const TUK_NW = 0.27; // auto-rickshaw width, normalised to half road width
const TUK_LEN = 1060; // auto-rickshaw length in track units (the 3D model; vehicles are centred on their position)
const FONT = '"Bungee", Impact, "Arial Black", sans-serif';

// Tracks, cities and styles are packs under web/tracks, web/cities and web/styles, listed in web/packs.js.
// engine/registry.js checks them (a list of problems, empty when all is well) and merges each track with
// its city and style into the definition the game reads.
const CONFIG_PROBLEMS = RRR.validate();
const ORDER = CONFIG_PROBLEMS.length ? [] : RRR.order(); // track ids in race order
const HIT_WORDS = ['DHISHOOM!', 'DHISHKYAON!', 'THAPPAD!', 'DHAMAKA!', 'BAM!'];

// ------------------------------------------------------------------ utils
const { clamp, lerp, easeIn, easeInOut, rand, pick, mulberry32, weightedPick } = RRR.util; // engine/util.js
const pctRemaining = (n, total) => (n % total) / total;
const overlap = (x1, w1, x2, w2) => !((x1 + w1 / 2) < (x2 - w2 / 2) || (x1 - w1 / 2) > (x2 + w2 / 2));
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
const fmtCash = n => '₹' + Math.round(n).toLocaleString('en-IN');
function project(p, camX, camY, camZ) {
  p.camera.x = p.world.x - camX; p.camera.y = p.world.y - camY; p.camera.z = p.world.z - camZ;
  p.screen.scale = CAM_DEPTH / p.camera.z;
  p.screen.x = Math.round(W / 2 + p.screen.scale * p.camera.x * W / 2);
  p.screen.y = Math.round(H / 2 - p.screen.scale * p.camera.y * H / 2);
  p.screen.w = Math.round(p.screen.scale * ROAD_W * W / 2);
}
