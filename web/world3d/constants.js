'use strict';
// 3D world renderer (Three.js r149, WebGL). The game logic stays in game.js and keeps its track
// coordinates (distance along the track + lateral offset); every frame web/world3d/ rebuilds the road
// around the camera by integrating the track's curves and hills from the camera's segment, then
// places 3D models for the player, rival autos, traffic, animals and roadside scenery.
// api.js exposes window.World3D, or null when WebGL / Three.js isn't available (game.js falls back to 2D).
// The files here share their top-level names (plain scripts, loaded in order by index.html).
const T = window.THREE; // (no Three.js: the other files fail to load and api.js sets World3D to null)
// ---------------------------------------------------------------- constants
const DRAW = 300;             // road segments drawn ahead of the camera
// cameras: a high helicopter view (default) and a low chase view (C switches)
const CAMS = {
  heli: { back: 2800, height: 2400, pitch: -25, fov: 55 },
  chase: { back: 1500, height: 950, pitch: -10, fov: 60 },
};
let cam = CAMS.heli, camMode = 'heli';
const PITCH_RAD = () => cam.pitch * Math.PI / 180;
const OBJ_FAR = 46000;        // scenery / vehicles further than this are hidden
const CURVE_TO_RAD = 1 / 200; // heading change per segment per unit of track curve (matches the 2D look)

let W_3D = 960, H_3D = 540, ROAD_W_3D = 2000, SEG_LEN_3D = 200;
let renderer, scene, camera, hemi, sun, ready = false, roadShade = null, post = null;
let road, roadPos, roadCol, roadUV, roadDet, det = 1;
let segments3D = [], trackLength3D = 1, theme3D = null, SP3D = null, TS = null, cfg = {};
const FP_H = 70;              // how high the footpath stands above the road
const QUADS = 30; // per segment: footpath, kerb and road (7), kerb faces (4), centre line (2), lane lines (4), or finish cells (12) / zebra + stop line
const P = [], TH = [], Y = [];     // per-frame centreline points, headings, heights (camera space)
// the road is laid out by adding up its bends, so past a turn of this much it curls back towards the camera and
// anything standing there would land on the camera; scenery and vehicles beyond that segment are not placed
const AROUND = 1.75; let aroundIdx = 300;
let camAbs = 0, camFrac = 0, baseIdx = 0;
