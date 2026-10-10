'use strict';
// The renderer's interface for the game (web/game/), or null when Three.js isn't available.
window.World3D = window.THREE ? { init, setTrack, frame, forget, horizonY, setCamera, turntable, warmStep, get debug() { return { renderer, scene, sun, camera, roadShade }; }, get quality() { return quality; }, get smoke() { return smoke; }, get camera() { return camMode; }, get ready() { return ready; } } : null;
