'use strict';
// Keyboard, touch and menu commands.
// ------------------------------------------------------------------ input
// Two mirrored layouts: one hand drives, the other swings the lathi (key direction = swing direction).
// Touch buttons send T_* codes, which work in either layout.
const LAYOUTS = [
  { id: 'arrows', label: 'DRIVE: ARROWS  ·  HIT: A / D',
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    hitL: ['KeyA'], hitR: ['KeyD'], horn: ['KeyW', 'KeyS'], hand: ['Space'] },
  { id: 'wasd', label: 'DRIVE: W A S D  ·  HIT: ← / →',
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    hitL: ['ArrowLeft'], hitR: ['ArrowRight'], horn: ['ArrowUp', 'ArrowDown'], hand: ['Space'] },
];
let layoutIdx = clamp(store.get('layout', 0), 0, LAYOUTS.length - 1);
const keys = {};
const held = action => keys['T_' + action] || LAYOUTS[layoutIdx][action].some(c => keys[c]);
const I = { left: () => held('left'), right: () => held('right'), up: () => held('up'), down: () => held('down'), hand: () => held('hand') }; // hand: handbrake (Space)
const actionFor = code => {
  if (code.startsWith('T_')) return code.slice(2);
  const L = LAYOUTS[layoutIdx];
  return ['hitL', 'hitR', 'horn'].find(a => L[a].includes(code));
};
function toggleLayout() { layoutIdx = (layoutIdx + 1) % LAYOUTS.length; store.set('layout', layoutIdx); for (const k in keys) keys[k] = false; }
function keyDown(code) {
  const was = keys[code]; keys[code] = true;
  Sfx.init();
  if (!was) onPress(code);
}
function keyUp(code) { keys[code] = false; }
let unlockCheck = null;
const unlockAudio = e => {
  Sfx.init();
  const a = Sfx.ctx; if (!a || a.state === 'running') return;
  const p = a.resume(); if (p && p.catch) p.catch(err => reportProblem('audio', 'resume() rejected', err));
  // the tap should have started audio; if it is still not running, sound is blocked on this device
  clearTimeout(unlockCheck);
  unlockCheck = setTimeout(() => {
    if (a.state !== 'running') {
      Sfx.problem = a.state === 'interrupted' ? 'Sound paused by your phone (call, screen recording or another app): tap to resume'
        : isIOS ? 'Sound blocked: switch off silent mode, then tap again' : 'Sound blocked by the browser: tap again or check the tab isn\'t muted';
      reportProblem('audio', `still ${a.state} after ${e && e.type || 'gesture'}`);
    } else Sfx.problem = null;
  }, 1500);
};
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, unlockAudio, { capture: true, passive: true });
// iPhone Safari ignores user-scalable=no: block its pinch gestures, and stop a quick second tap from zooming
// (it would otherwise zoom on accidental double taps); taps on the game canvas still reach the menus
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
let lastTapEnd = 0;
document.addEventListener('touchend', e => {
  const now = performance.now();
  if (now - lastTapEnd < 350) {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (t && e.target === canvas) canvas.dispatchEvent(new MouseEvent('click', { clientX: t.clientX, clientY: t.clientY, bubbles: true }));
  }
  lastTapEnd = now;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// swallow every non-shortcut key so the macOS WKWebView shell never plays the "unhandled key" beep
addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && !/^F\d+$/.test(e.code)) e.preventDefault(); if (!e.repeat) keyDown(e.code); else keys[e.code] = true; });
addEventListener('keyup', e => keyUp(e.code));
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'race') openPause(); });

const RACING_STATES = ['countdown', 'race', 'finished'];
const PAUSE_MENU = [{ label: 'RESUME', cmd: 'resume' }, { label: 'RESTART RACE', cmd: 'restart' }, { label: 'SOUND MIXER', cmd: 'mixer' }, { label: 'QUIT TO MAIN MENU', cmd: 'menu' }];
const MIXER = [['master', 'ALL SOUND'], ['race', 'RACE', 'engines, horns, traffic, fights'], ['voices', 'VOICES', 'curses & hawker shouts'], ['music', 'MUSIC'], ['city', 'CITY NOISE', 'street sounds & animals']];
let mixer = null;
function openMixer() { mixer = { sel: 0 }; }
function openPause() { paused = true; pauseSel = 0; Voice.stopVoices(); Sfx.squeal(0); DriftMusic.silence(); }
// Commands shared by the pause menu, mouse clicks and the macOS app menu (window.rrrCommand).
function runCommand(cmd) {
  if (state === 'config-error') return; // no track is loaded: the app menu would throw in loadTrack
  if (cmd === 'mixer') { openMixer(); return; }
  if (cmd === 'pause') { if (RACING_STATES.includes(state) && !paused) openPause(); else if (paused) paused = false; return; }
  paused = false;
  if (cmd === 'restart' && state !== 'title' && state !== 'champion') setupRace();
  if (cmd === 'menu' || cmd === 'restart') Voice.stopVoices();
  if (cmd === 'menu') { state = 'title'; results = null; messages = []; attractSetup(); }
}
window.rrrCommand = runCommand;
function onPress(code) {
  if (state === 'config-error') return; // nothing behind the error screen to control (V would open an invisible mixer)
  if (code === 'KeyM') { Sfx.toggleMute(); return; }
  if (code === 'KeyC' && use3D) { const m = World3D.setCamera(World3D.camera === 'heli' ? 'chase' : 'heli'); store.set('camera', m); msg(m === 'heli' ? 'HELI CAM' : 'CHASE CAM', '#fff', 1); return; }
  if (code === 'KeyN') { Music.toggle(); msg(Music.on ? 'MUSIC ON' : 'MUSIC OFF', '#fff', 1); return; }
  if (mixer) {
    const k = { ArrowUp: -1, KeyW: -1, T_up: -1, ArrowDown: 1, KeyS: 1, T_down: 1 }[code];
    const d = { ArrowLeft: -0.1, KeyA: -0.1, T_left: -0.1, ArrowRight: 0.1, KeyD: 0.1, T_right: 0.1 }[code];
    if (k) mixer.sel = (mixer.sel + MIXER.length + k) % MIXER.length;
    if (d) { Sfx.setVol(MIXER[mixer.sel][0], Sfx.vol[MIXER[mixer.sel][0]] + d); Sfx.beep(false); }
    if (['Escape', 'Enter', 'KeyV', 'Space'].includes(code)) mixer = null;
    return;
  }
  if (code === 'KeyV') { if (RACING_STATES.includes(state) && !paused) openPause(); openMixer(); return; }
  if (code === 'Tab' && (state === 'title' || paused)) { toggleLayout(); return; }
  if (paused) {
    if (code === 'KeyP' || code === 'Escape') { paused = false; return; }
    if (code === 'ArrowUp' || code === 'KeyW') { pauseSel = (pauseSel + PAUSE_MENU.length - 1) % PAUSE_MENU.length; Sfx.beep(false); }
    if (code === 'ArrowDown' || code === 'KeyS') { pauseSel = (pauseSel + 1) % PAUSE_MENU.length; Sfx.beep(false); }
    if (code === 'Enter' || code === 'Space') runCommand(PAUSE_MENU[pauseSel].cmd);
    return;
  }
  if ((code === 'KeyP' || code === 'Escape') && RACING_STATES.includes(state)) { openPause(); return; }
  if (code === 'Escape' && (state === 'results' || state === 'champion')) { runCommand('menu'); return; }
  if (state === 'title' && code === 'Enter') { setupRace(); return; }
  if (state === 'title' && ['ArrowUp', 'KeyW', 'T_up', 'ArrowDown', 'KeyS', 'T_down'].includes(code)) { cycleDriver(['ArrowUp', 'KeyW', 'T_up'].includes(code) ? -1 : 1); return; }
  if (state === 'title' && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'T_left', 'T_right'].includes(code)) {
    const next = clamp(level + (['ArrowRight', 'KeyD', 'T_right'].includes(code) ? 1 : -1), 0, unlocked);
    if (next !== level) { level = next; store.set('track', ORDER[level]); attractSetup(); Sfx.beep(false); }
    return;
  }
  if (state === 'results' && code === 'Enter') { advanceAfterResults(); return; }
  if (state === 'champion' && code === 'Enter') { state = 'title'; attractSetup(); return; }
  if (state === 'race' && player.crash <= 0) {
    const act = actionFor(code);
    if (act === 'hitL' && !player.atk) startAttack(player, -1);
    if (act === 'hitR' && !player.atk) startAttack(player, 1);
    if (act === 'horn') honk();
  }
}

// touch buttons
(() => {
  const t = document.getElementById('touch');
  if (!t) return;
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) t.classList.add('on');
  t.querySelectorAll('.tbtn').forEach(b => {
    const k = b.dataset.key;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); keyDown(k); });
    const up = () => { b.classList.remove('down'); keyUp(k); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
})();
