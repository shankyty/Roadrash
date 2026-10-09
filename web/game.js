'use strict';
// Road Rash: Rickshaw Rumble — a pseudo-3D combat racer where you drive an auto-rickshaw.
(() => {
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
const PRIZES = [1500, 1000, 700, 400, 200, 100, 50, 0];
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
// ------------------------------------------------------------------ analytics
// GoatCounter (no cookies, no personal data). Only on the published website, so local
// testing and the Mac app (file://) are never counted. Dashboard: roadrash-shankyty.goatcounter.com
const GOATCOUNTER = 'https://roadrash-shankyty.goatcounter.com/count';
const analyticsOn = /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\]|.*\.localhost$)/.test(location.hostname);
const pendingEvents = [];
// custom events show up in the dashboard as paths like "race-start/delhi"; queued until count.js loads
function trackEvent(event, title) {
  if (!analyticsOn) return;
  const send = () => { try { window.goatcounter.count({ path: event, title: title || event, event: true }); } catch (e) { /* never break the game */ } };
  if (window.goatcounter && window.goatcounter.count) send(); else pendingEvents.push(send);
}
// which device, OS and browser this visit used, as one combined event: device/<kind>/<os>/<browser>
function deviceSummary() {
  const ua = navigator.userAgent || '', touch = navigator.maxTouchPoints > 1;
  const os = /iPhone|iPod/.test(ua) ? 'iOS' : /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) ? 'iPadOS' : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'ChromeOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /WhatsApp/i.test(ua) ? 'WhatsApp-in-app' : /Instagram/.test(ua) ? 'Instagram-in-app' : /FBAN|FBAV|FB_IAB/.test(ua) ? 'Facebook-in-app'
    : /SamsungBrowser/.test(ua) ? 'Samsung-Internet' : /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const short = Math.min(screen.width, screen.height);
  const kind = os === 'iPadOS' || (touch && short >= 600) ? 'tablet' : touch && short < 600 ? 'phone' : 'computer';
  return `device/${kind}/${os}/${browser}`;
}
// Problems on players' devices are reported to the dashboard, grouped as
//   error/<kind>/<problem>/<OS-browser>
// with the details needed to reproduce them in the title (version, game state, OS/browser versions,
// screen, audio state, stack). Nothing personal is sent. Also logged to the console.
const GAME_VERSION = '3.10.0';
// 3D quality tier: mobile browsers < laptop/desktop browsers < the Mac app. 'smooth' (phones and tablets,
// when 3D is forced there with ?3d) keeps the frame rate up with fewer polygons and a lower resolution; 'high' for computer browsers; 'ultra'
// in the Mac app (loaded from file://): finest models, detail kept farther away, full Retina resolution.
// ?quality=smooth|high|ultra overrides it.
// phones and tablets (incl. iPadOS, which reports itself as a Mac with touch) play the 2D game; ?3d forces 3D there
const IS_MOBILE = (() => { const ua = navigator.userAgent || ''; return /Android|iPhone|iPad|iPod|Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); })();
const QUALITY = (() => {
  const asked = new URLSearchParams(location.search).get('quality');
  if (['smooth', 'high', 'ultra'].includes(asked)) return asked;
  if (location.protocol === 'file:') return 'ultra';
  return IS_MOBILE ? 'smooth' : 'high';
})();
const safe = (f, fallback = '?') => { try { const v = f(); return v === undefined ? fallback : v; } catch (e) { return fallback; } };
function envDetails() {
  const ua = navigator.userAgent || '';
  const osVer = (ua.match(/Mac OS X (\d+[_.]\d+)/) || ua.match(/OS (\d+[_.]\d+)/) || ua.match(/Android (\d+(?:\.\d+)?)/) || ua.match(/Windows NT (\d+\.\d+)/) || ua.match(/CrOS \S+ ([\d.]+)/) || [])[1];
  const brVer = (ua.match(/(?:SamsungBrowser|CriOS|FxiOS|EdgA?|OPR|Firefox|Chrome|Version)\/(\d+(?:\.\d+)?)/) || [])[1];
  const a = safe(() => Sfx.ctx, null);
  return [
    `v${GAME_VERSION}`,
    safe(() => `${state}${paused ? '(paused)' : ''} on ${def.city.id}/${def.id}`),
    `${deviceSummary().replace('device/', '').replace(/\//g, ' ')} · os ${(osVer || '?').replace('_', '.')} · browser ${brVer || '?'}`,
    `screen ${screen.width}x${screen.height}@${Math.round(devicePixelRatio * 10) / 10}x quality=${QUALITY}`,
    a ? `audio=${a.state} ${a.sampleRate}Hz` : 'audio=none',
    `worklet=${'AudioWorkletNode' in window ? 'yes' : 'no'} iOS-session=${navigator.audioSession ? 'yes' : 'no'}`,
    `muted=${safe(() => Sfx.muted)} vol=${safe(() => JSON.stringify(Sfx.vol))}`,
    `${Math.round(performance.now() / 1000)}s after load`,
  ].join(' · ');
}
// Which part of the game an error came from: the first stack frame whose function belongs to a component.
const AUDIO_METHODS = 'loadHorns|hornClip|loadAnimals|playAt|spot|outAt|mooAt|barkAt|mooFrom|barkFrom|updateAnimals|ensureVoices|updateVehicles|honkAt|hornTone|kindOf|init|fallbackEngine|loadSamples|startEngine|setEngine|applyVol|setVol|toggleMute|tone|noise|horn|hit|whoosh|crash|bump|moo|bark|yelp|grunt|beep|ko|cash|ensure|setCity|toggle|tick|env|osc|drum|note|decode|stopAll|shopsNearby|unlockAudio';
const COMPONENTS = [
  ['audio', new RegExp(`^(?:Sfx|Music|Ambience|Object)?\\.?(?:${AUDIO_METHODS})$|^(?:Sfx|Music|Ambience|TwoStroke)`)],
  ['traffic', /^(updateDog|startChase|updateTraffic|honk)$/],
  ['rivals-combat', /^(updateRivals|resolveAttack|startAttack|curse)$/],
  ['player-physics', /^(updatePlayer|crashPlayer|checkCollisions|endDrift|updateClosePasses|hitKerb|takeOff|landPlayer|settleLanding)$/],
  ['hawkers', /^(updateHawkers)$/],
  ['race-rules', /^(?:RaceStats\.|Records\.)?(checkFinish|buildResults|advanceAfterResults|setupRace|currentRank|resetPlayer|updateAttract|closePass|breakChain|advance|bonuses|summary|submit)$/],
  ['config', /^(?:Registry\.|RRR\.)?(register|check|checkMerged|deepFreeze|validate|resolve|resolveDef)$/],
  ['traffic', /^(?:TrafficSpawner\.)?(spawn|deck|busLook|roadSpot|addVehicle|addCow|addDog|spawnTraffic)$/],
  ['track', /^(?:TrackBuilder\.)?(build|loadTrack|addRoad|addSegment|lastY|layPieces|layoutLanes|layoutJunctions|placeScenery|placeSigns|placeFootpath|settleRoadside|findSegment|attractSetup)$/],
  ['sprites', /^(?:Object\.)?(make[A-Z]\w*|buildSharedSprites|flipped|litWindows|fillerBlocks|trees|waterBand|cutOut|archPath|onion|far|near)$/],
  ['ui', /^(draw(?:HUD|Title|Results|Paused|Mixer|Controls|Countdown|Champion|Bubbles|Popups|Messages|SoundHint)|text|panel|bar|keycap)$/],
  ['renderer', /^(render|drawSegment|drawBackground|drawSprite|drawTuk|drawAttack|drawNeon|drawNeonStrips|drawPlayer|project|poly)$/],
  ['input', /^(onPress|keyDown|keyUp|runCommand|toggleLayout|openPause|openMixer)$/],
  ['voices', /^(?:Object\.|Voice\.|VoiceClips\.)?(sayLine|stopVoices|loadClips|playClip|place|updateClips|stopClips)$/],
  ['analytics', /^(trackEvent|deviceSummary|envDetails)$/],
  ['game-loop', /^(update|step|frame)$/],
];
function componentOf(err) {
  const stack = String(err && err.stack || '');
  for (const line of stack.split('\n')) {
    // Chrome/Edge: "at fnName (file:1:2)" · Safari/Firefox: "fnName@file:1:2"
    const m = line.match(/^\s*at\s+(?:async\s+)?([\w$.<>]+)\s*\(/) || line.match(/^\s*([\w$.<>]+)@/);
    if (!m) continue;
    const fn = m[1].replace(/^(?:Object|window)\./, '');
    for (const [name, re] of COMPONENTS) if (re.test(fn) || re.test(m[1])) return name;
  }
  return null;
}
// run one component's per-frame work; if it throws, report it (once) and keep the rest of the game going
function guard(component, fn) {
  try { return fn(); } catch (err) { reportError(componentOf(err) || component, err && err.message, err, `guard:${component}`); }
}
function guardDraw(component, fn) {
  ctx.save();
  try { fn(); } catch (err) { reportError(componentOf(err) || component, err && err.message, err, `guard:${component}`); }
  ctx.restore(); ctx.globalAlpha = 1;
}
const reportedErrors = new Set();
function reportError(kind, message, err, where) {
  message = String(message || (err && err.message) || 'unknown').replace(/\s+/g, ' ').trim();
  const key = `${kind}:${message}`;
  if (reportedErrors.has(key) || reportedErrors.size >= 8) return;
  reportedErrors.add(key);
  const slug = message.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'unknown';
  const who = deviceSummary().split('/').slice(2).join('-'); // e.g. iOS-Safari
  const stack = err && err.stack ? String(err.stack).split('\n').slice(0, 4).map(l => l.trim().replace(/https?:\/\/[^\s)]*\//g, '')).join(' ← ') : '';
  const title = [message, where && `at ${where}`, envDetails(), stack].filter(Boolean).join(' · ').slice(0, 900);
  try { console.warn('[RoadRash]', `error/${kind}/${slug}`, title); } catch (e) { /* ignore */ }
  trackEvent(`error/${kind}/${slug}/${who}`, title);
}
addEventListener('error', e => reportError(componentOf(e.error) || 'js', e.message, e.error, `${(e.filename || '').split('/').pop()}:${e.lineno || 0}:${e.colno || 0}`));
addEventListener('unhandledrejection', e => reportError(componentOf(e.reason) || 'promise', e.reason && e.reason.message || e.reason, e.reason));
if (analyticsOn) {
  const tag = document.createElement('script');
  tag.async = true; tag.src = '//gc.zgo.at/count.js'; tag.dataset.goatcounter = GOATCOUNTER;
  tag.onload = () => { const wait = setInterval(() => { if (window.goatcounter && window.goatcounter.count) { clearInterval(wait); pendingEvents.splice(0).forEach(f => f()); } }, 100); };
  document.head.appendChild(tag);
  // like GoatCounter's own page view, only count the device once the page is actually shown
  const deviceOnce = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', deviceOnce); trackEvent(deviceSummary(), 'Device · OS · browser'); } };
  if (document.visibilityState === 'visible') deviceOnce(); else document.addEventListener('visibilitychange', deviceOnce);
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('rrr_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rrr_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// ------------------------------------------------------------------ the rival cast
// web/drivers.js (window.RRR_DRIVERS): one driver per city, each with a look, a voice and curses of their own,
// a weapon and a driving style. You drive as the driver of the city you're racing in, against the others.
// A broken entry is reported and left out; PLAIN_DRIVER fills the grid if fewer than eight are left (the
// biggest grid and you), so a race always starts.
// How each attack moves. Keyframes [k, z, y, ext] over the attack (k from 0 to 1): z is the arm's (or leg's) angle
// up (+) or down (-) from level, y its sweep forward (+) or back (-), both in radians, and ext how far it thrusts
// out (model units: an auto is about 1000 long). `at` is the moment it lands. A weapon names its `move`, and its
// `contact` says where on the other auto it lands.
const MOVES = {
  chop: { at: 0.5, keys: [[0, 1.9, 0, 0], [0.5, -0.2, 0, 0], [1, -0.35, 0, 0]] },                              // overhead, straight down
  pull: { at: 0.5, keys: [[0, 0.5, -1.3, 0], [0.5, 0, 0.2, 0], [1, 0.25, 1.0, 0]] },                           // a cricket pull shot, level, back to front
  lowsweep: { at: 0.5, keys: [[0, -0.5, -1.2, 0], [0.5, -0.85, 0.1, 0], [1, -0.4, 1.1, 0]] },                  // stick down by the wheels, swept through
  jab: { at: 0.45, keys: [[0, 0.05, 0, -230], [0.45, 0, 0, 150], [0.6, 0, 0, 150], [1, 0.05, 0, -120]] },      // a straight poke
  uppercut: { at: 0.5, keys: [[0, -1.3, 0, 0], [0.5, 0.15, 0, 0], [1, 0.9, 0, 0]] },                           // flicked up from below
  whip: { at: 0.55, keys: [[0, 0.6, -0.4, 0], [0.3, 2.2, -0.2, 0], [0.55, -0.05, 0.1, 60], [1, -0.4, 0.1, 0]] }, // wound up, then cracked
  smack: { at: 0.5, keys: [[0, 2.3, 0, -60], [0.5, 0.35, 0, 0], [1, 0.6, 0, -40]] },                           // brought down on the head
  roundhouse: { at: 0.5, keys: [[0, 0.3, -1.6, 0], [0.5, -0.1, 0.1, 0], [1, 0.1, 1.3, 0]] },                   // swung right round
  double: { at: 0.3, keys: [[0, 1.3, 0, 0], [0.3, 0, 0, 0], [0.5, 0.9, 0.2, 0], [0.72, -0.05, 0.2, 0], [1, 0.3, 0, 0]] }, // tap, tap
  slap: { at: 0.5, keys: [[0, 0.35, -1.1, 0], [0.5, 0.3, 0.1, 40], [1, 0.25, 0.9, 0]] },                       // open hand, across the face
  sidekick: { at: 0.5, keys: [[0, -1.3, 0, 0], [0.5, 0.1, 0, 0], [1, -0.4, 0, 0]] },                           // straight out of the side
  highkick: { at: 0.5, keys: [[0, -1.3, 0.2, 0], [0.5, 0.55, 0, 0], [1, -0.3, 0, 0]] },                        // film-hero high
  volley: { at: 0.5, keys: [[0, -0.9, -1.1, 0], [0.5, -0.35, 0.1, 0], [1, -0.5, 0.9, 0]] },                    // a footballer's swing through
};
const moveOf = w => MOVES[w.move] || (w.kind === 'kick' ? MOVES.sidekick : MOVES.chop);
// the pose k of the way through a move: { z, y, ext }
function attackPoseAt(w, k) {
  const keys = moveOf(w).keys; k = clamp(k, 0, 1);
  let i = 1; while (i < keys.length - 1 && k > keys[i][0]) i++;
  const a = keys[i - 1], b = keys[i], u = (k - a[0]) / (b[0] - a[0] || 1), e = u * u * (3 - 2 * u);
  return { z: lerp(a[1], b[1], e), y: lerp(a[2], b[2], e), ext: lerp(a[3], b[3], e) };
}
const attackPose = (atk, w) => attackPoseAt(w, atk.t / atk.dur);
// where a blow lands on the other auto: how far up it (0 road, 1 roof), the sideways shove and the speed it keeps
const CONTACTS = { head: { up: 0.95, shove: 0.08, keep: 0.9 }, body: { up: 0.55, shove: 0.16, keep: 0.88 }, low: { up: 0.14, shove: 0.06, keep: 0.78 } };
const PLAIN_DRIVER = { id: 'plain', name: 'RAJU', city: '', cityName: '', tag: '',
  look: { body: '#d7263d', trim: '#ffd166', canopy: '#141414', plate: 'UP 32 BT', slogan: 'HORN OK PLEASE', shirt: '#3949ab', headgear: 'none', headgearColor: '#000000', neon: null },
  voice: { lang: 'hi', describe: '', rate: 1 }, curses: [],
  weapon: { kind: 'swing', move: 'chop', contact: 'head', shape: 'lathi', color: '#c8a165', power: 1, reach: 1, cooldown: 1, sound: 'wood', hitWords: HIT_WORDS },
  style: { pace: -0.02, bends: 0.22, aggression: 0.9, chase: 900, weave: [3, 8], nerve: 0.5, launch: [0.05, 0.5], grudge: 1, daring: 0 } };
const LATHI = PLAIN_DRIVER.weapon; // what you swing in a city that has no driver of its own
function driverProblem(d) {
  const num = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi, span = (v, lo, hi) => Array.isArray(v) && v.length === 2 && num(v[0], lo, hi) && num(v[1], v[0], hi);
  const hex = v => /^#[0-9a-f]{6}$/i.test(v || '');
  if (!d || typeof d.id !== 'string' || !d.name || !d.city) return 'no id, name or city';
  const l = d.look, w = d.weapon, st = d.style;
  if (!l || !['body', 'trim', 'canopy', 'shirt'].every(k => hex(l[k])) || typeof l.plate !== 'string' || (l.neon && !hex(l.neon)) || (l.visor && !hex(l.visor)) || (l.seat && !hex(l.seat))) return 'bad look';
  if (!w || !['swing', 'kick'].includes(w.kind) || !hex(w.color) || !num(w.power, 0.5, 2) || !num(w.reach, 0.5, 1.5) || !num(w.cooldown, 0.5, 2) || !Array.isArray(w.hitWords) || !w.hitWords.length || (w.move && !MOVES[w.move]) || (w.contact && !CONTACTS[w.contact])) return 'bad weapon';
  if (!st || !num(st.pace, -0.1, 0.05) || !num(st.bends, 0, 0.5) || !num(st.aggression, 0, 2) || !num(st.chase, 100, 3000) || !span(st.weave, 0.5, 30) || !num(st.nerve, 0, 1) || !span(st.launch, 0, 2) || !num(st.grudge, 1, 5) || (st.daring !== undefined && !num(st.daring, 0, 1))) return 'bad style';
  if (!Array.isArray(d.curses) || !d.curses.every(c => c && typeof c.text === 'string') || !d.voice || typeof d.voice.rate !== 'number') return 'bad curses or voice';
  return null;
}
const DRIVERS = (() => {
  const out = [];
  for (const d of Array.isArray(window.RRR_DRIVERS) ? window.RRR_DRIVERS : []) {
    const bad = driverProblem(d) || (out.some(o => o.id === d.id) && 'duplicate id');
    if (bad) reportError('drivers', `driver ${d && d.id}: ${bad}`); else out.push(d);
  }
  if (!out.length) reportError('drivers', 'drivers.js missing or empty: plain rivals');
  for (let i = 0; out.length < 8; i++) out.push({ ...PLAIN_DRIVER, id: 'plain' + i, name: ['RAJU', 'PAPPU', 'CHINTU', 'MUNNA', 'GUDDU', 'TINKU', 'SONU'][i] });
  return out;
})();
// You race as one of the cast: their auto, their voice, their weapon. It's whoever you picked on the title
// screen (remembered), or, until you pick, the track city's own driver.
const homeDriver = city => DRIVERS.find(d => d.city === city) || null;
let pickedDriver = store.get('driver', null);
const playerDriver = () => DRIVERS.find(d => d.id === pickedDriver) || homeDriver(def.city.id);
function setPlayerDriver(me) {
  Object.assign(player, { driver: me, weapon: me ? me.weapon : LATHI, palette: me ? me.look : null, img: me ? SP.rivalOf[me.id] : SP.player });
  if (use3D) World3D.forget([player]); // your 3D auto is rebuilt in this driver's colours (and neon, at night)
}
function cycleDriver(step) {
  const next = DRIVERS[(Math.max(0, DRIVERS.indexOf(player.driver)) + step + DRIVERS.length) % DRIVERS.length];
  pickedDriver = next.id; store.set('driver', pickedDriver); setPlayerDriver(next); Sfx.beep(false);
}
const WEAPON_NAMES = { lathi: 'LATHI', bat: 'CRICKET BAT', hockey: 'HOCKEY STICK', umbrella: 'UMBRELLA', cane: 'WALKING CANE', cloth: 'WET GAMCHHA', shoe: 'JOOTI', bag: 'LAPTOP BAG', dandiya: 'DANDIYA', hand: 'SLAP' };
const weaponName = w => w.kind === 'kick' ? 'KICK' : WEAPON_NAMES[w.shape] || 'LATHI';
// Your rivals: the track city's own driver is always among them (unless that's you); the rest are a draw from
// everyone else.
function pickGrid(city, n, me = homeDriver(city), r = Math.random) {
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const home = DRIVERS.filter(d => d.city === city && d !== me).slice(0, 1);
  return shuffle([...home, ...shuffle(DRIVERS.filter(d => d !== me && !home.includes(d)))].slice(0, n));
}
const rivalLabel = r => r.driver && r.driver.cityName ? `${r.name} · ${r.driver.cityName}` : r.name;

// ------------------------------------------------------------------ audio
// iOS: play as media so the silent switch doesn't mute the game (Safari 17+)
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
const VOL_DEFAULTS = { master: 1, race: 0.3, voices: 1, music: 0.3, city: 0.3 };
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// Auto-rickshaw engine: single-cylinder two-stroke. Each firing is a pop that rings an exhaust
// resonance and a tinny body rattle; off-throttle it misfires ("ring-ding-ding").
const TWO_STROKE_WORKLET = `
class TwoStroke extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: 'rpm', defaultValue: 0, minValue: 0, maxValue: 1 },
    { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1 },
    { name: 'level', defaultValue: 0, minValue: 0, maxValue: 1 } ]; }
  constructor() { super(); this.ph = 0; this.env = 0; this.kick = 0; this.lvl = 0; this.rpm = 0; this.thr = 0;
    this.a1 = 0; this.a2 = 0; this.b1 = 0; this.b2 = 0; this.hp = 0; this.jit = 1; }
  process(_, outputs, p) {
    const out = outputs[0][0], sr = sampleRate;
    for (let i = 0; i < out.length; i++) {
      const tr = p.rpm.length > 1 ? p.rpm[i] : p.rpm[0], tt = p.throttle.length > 1 ? p.throttle[i] : p.throttle[0], tl = p.level.length > 1 ? p.level[i] : p.level[0];
      this.rpm += (tr - this.rpm) * 0.0004; this.thr += (tt - this.thr) * 0.002; this.lvl += (tl - this.lvl) * 0.001;
      const f = (24 + this.rpm * 82) * this.jit;
      this.ph += f / sr;
      if (this.ph >= 1) {
        this.ph -= 1; this.jit = 0.93 + Math.random() * 0.14;
        const misfire = Math.random() < (this.thr < 0.3 ? 0.18 + this.rpm * 0.25 : 0.03);
        if (!misfire) { this.env = (0.75 + Math.random() * 0.5) * (0.55 + this.thr * 0.45); this.kick = 1; }
      }
      const noise = Math.random() * 2 - 1;
      const x = this.env * noise * 0.6 + this.kick * 0.9;
      this.kick = 0;
      this.env *= Math.exp(-1 / (sr * (0.006 + (1 - this.rpm) * 0.01)));
      // exhaust resonance (low, "phut") and body rattle (high, tinny)
      // input gains are scaled by sin(w) so each resonator peaks near the excitation level
      const w1 = 2 * Math.PI * (150 + this.rpm * 170) / sr, r1 = 0.9975;
      const y1 = 2 * r1 * Math.cos(w1) * this.a1 - r1 * r1 * this.a2 + x * Math.sin(w1) * 0.7; this.a2 = this.a1; this.a1 = y1;
      const w2 = 2 * Math.PI * (1150 + this.rpm * 500) / sr, r2 = 0.99;
      const y2 = 2 * r2 * Math.cos(w2) * this.b1 - r2 * r2 * this.b2 + x * Math.sin(w2) * 0.35; this.b2 = this.b1; this.b1 = y2;
      this.hp += (noise - this.hp) * 0.2;
      let y = y1 + y2 + (noise - this.hp) * 0.01 * (0.4 + this.rpm);
      y = Math.tanh(y * 0.3) * 0.9; // raw peaks ~3 at idle, ~6 flat out: light crunch only when revved
      out[i] = y * this.lvl;
    }
    return true;
  }
}
registerProcessor('two-stroke', TwoStroke);`;

const Sfx = {
  ctx: null, master: null, engine: null, muted: store.get('muted', false), vol: { ...VOL_DEFAULTS, ...store.get('vol', {}) },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {
      if (!this.problem) { this.problem = 'Sound isn\'t supported in this browser'; reportError('audio', 'AudioContext unavailable', e); }
      return;
    }
    const a = this.ctx;
    // iOS can interrupt audio (call, screen recording, another app); explain it and recover by itself
    a.onstatechange = () => {
      if (a.state === 'running') this.problem = null;
      else if (a.state === 'interrupted') this.problem = 'Sound paused by your phone (call, screen recording or another app): tap to resume';
    };
    this.master = a.createGain(); this.master.connect(a.destination);
    // three channels the player can balance: race (engine, horn, fights), music, city noise
    for (const k of ['raceBus', 'voiceBus', 'musicBus', 'cityBus']) { this[k] = a.createGain(); this[k].connect(this.master); }
    this.applyVol();
    // iOS unlock: a silent blip started from inside the tap
    const blip = a.createBufferSource(); blip.buffer = a.createBuffer(1, 1, 22050); blip.connect(a.destination); blip.start(0);
    const len = a.sampleRate; this.noiseBuf = a.createBuffer(1, len, a.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadSamples();
    VoiceClips.loadClips();
    Animals.loadAnimals();
    VehicleAudio.loadHorns();
    Music.ensure();
    Ambience.ensure();
    if (a.audioWorklet) {
      const url = URL.createObjectURL(new Blob([TWO_STROKE_WORKLET], { type: 'application/javascript' }));
      a.audioWorklet.addModule(url).then(() => {
        const node = new AudioWorkletNode(a, 'two-stroke');
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
        node.connect(hp); hp.connect(this.raceBus);
        this.engine = { worklet: node, rpm: node.parameters.get('rpm'), throttle: node.parameters.get('throttle'), level: node.parameters.get('level') };
      }).catch(e => { reportError('audio', 'engine synth AudioWorklet failed (using fallback)', e); this.fallbackEngine(); });
    } else this.fallbackEngine();
  },
  // simple oscillator engine for browsers without AudioWorklet
  fallbackEngine() {
    const a = this.ctx;
    const o = a.createOscillator(); o.type = 'square';
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 2;
    const eg = a.createGain(); eg.gain.value = 0;
    const lfo = a.createOscillator(); lfo.type = 'square'; const lg = a.createGain(); lg.gain.value = 0;
    lfo.connect(lg); lg.connect(eg.gain); o.connect(f); f.connect(eg); eg.connect(this.raceBus); o.start(); lfo.start();
    this.engine = { o, f, eg, lfo, lg };
  },
  // Recorded engine (web/sounds.js): an idle loop and a rev loop, crossfaded by load and pitched by speed.
  // Until they decode (or if they fail) the synthesised two-stroke plays instead.
  loadSamples() {
    const src = window.RRR_SOUNDS; if (!src) { reportError('audio', 'sounds.js missing: engine recording not loaded'); return; }
    const a = this.ctx, bufs = {};
    const decode = url => {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Promise((res, rej) => a.decodeAudioData(bytes.buffer, res, rej));
    };
    Promise.all(Object.entries(src).map(([k, url]) => decode(url).then(b => { bufs[k] = b; }))).then(() => {
      const loop = buf => { const n = a.createBufferSource(); n.buffer = buf; n.loop = true; const g = a.createGain(); g.gain.value = 0; n.connect(g); g.connect(this.raceBus); n.start(); return { n, g }; };
      const idle = loop(bufs.idle), rev = loop(bufs.rev);
      this.samples = { idleSrc: idle.n, idleGain: idle.g, revSrc: rev.n, revGain: rev.g, start: bufs.start };
    }).catch(e => { this.samples = null; reportError('audio', 'engine recording decode failed (using synth)', e); });
  },
  // kick-start at the beginning of a race; the loops fade in once it has caught
  startEngine() {
    const s = this.samples; if (!s || !this.ctx) return;
    const n = this.ctx.createBufferSource(); n.buffer = s.start;
    const g = this.ctx.createGain(); g.gain.value = 0.8; n.connect(g); g.connect(this.raceBus); n.start();
    this.engineOnAt = this.ctx.currentTime + 1.6;
  },
  toggleMute() { this.muted = !this.muted; store.set('muted', this.muted); this.applyVol(); },
  setVol(k, v) { this.vol[k] = Math.round(clamp(v, 0, 1) * 10) / 10; store.set('vol', this.vol); this.applyVol(); },
  applyVol() {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5 * this.vol.master, t, 0.03);
    this.raceBus.gain.setTargetAtTime(this.vol.race, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.03);
    this.cityBus.gain.setTargetAtTime(this.vol.city, t, 0.03);
    this.voiceBus.gain.setTargetAtTime(this.vol.voices, t, 0.03);
  },
  get running() { return !!this.ctx && this.ctx.state === 'running'; },
  setEngine(pct, on, throttle = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, smp = this.samples;
    if (smp) {
      if (this.engine && this.engine.worklet) this.engine.level.setTargetAtTime(0, t, 0.05);
      const live = on && t >= (this.engineOnAt || 0);
      const load = clamp(pct * 0.75 + throttle * 0.35, 0, 1);
      const k = clamp((load - 0.2) / 0.55, 0, 1), revMix = k * k * (3 - 2 * k);
      smp.idleGain.gain.setTargetAtTime(live ? (1 - revMix) * 0.8 : 0, t, 0.08);
      smp.revGain.gain.setTargetAtTime(live ? revMix * 0.7 : 0, t, 0.08);
      smp.idleSrc.playbackRate.setTargetAtTime(1 + pct * 0.7, t, 0.1);
      smp.revSrc.playbackRate.setTargetAtTime(0.82 + pct * 0.45 + throttle * 0.05, t, 0.1);
      return;
    }
    const e = this.engine; if (!e) return;
    if (e.worklet) {
      e.rpm.setTargetAtTime(clamp(pct * 0.85 + throttle * 0.15, 0, 1), t, 0.05);
      e.throttle.setTargetAtTime(throttle, t, 0.05);
      e.level.setTargetAtTime(on ? 0.55 : 0, t, 0.1);
      return;
    }
    e.eg.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.08); e.lg.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.08);
    e.o.frequency.setTargetAtTime(90 + pct * 160, t, 0.06); e.lfo.frequency.setTargetAtTime(24 + pct * 80, t, 0.06);
    e.f.frequency.setTargetAtTime(300 + pct * 700, t, 0.06);
  },
  tone(freq, dur, type = 'sine', vol = 0.3, slide = null, delay = 0, filter = null) {
    if (!this.ctx) return; const a = this.ctx, t = a.currentTime + delay;
    const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o; if (filter) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; o.connect(fl); node = fl; }
    node.connect(g); g.connect(this.raceBus); o.start(t); o.stop(t + dur + 0.05);
  },
  // tyre squeal while drifting: two detuned saws through a narrow band plus hiss, level set every frame
  squeal(level) {
    if (!this.ctx) return; const a = this.ctx, t = a.currentTime;
    if (!this.sq) {
      const g = a.createGain(); g.gain.value = 0; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 9;
      const o1 = a.createOscillator(), o2 = a.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.frequency.value = 1080; o2.frequency.value = 1210;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 7; lg.gain.value = 60; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      const n = a.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; const hp = a.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2600; hp.Q.value = 3;
      o1.connect(bp); o2.connect(bp); n.connect(hp); bp.connect(g); hp.connect(g); g.connect(this.raceBus);
      for (const s of [o1, o2, lfo, n]) s.start();
      this.sq = g;
    }
    this.sq.gain.setTargetAtTime(level * 0.11, t, 0.06);
  },
  noise(dur, vol, filter = 1000, delay = 0) {
    if (!this.ctx) return; const a = this.ctx, t = a.currentTime + delay;
    const s = a.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter;
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.raceBus); s.start(t); s.stop(t + dur + 0.05);
  },
  horn() { this.tone(380, 0.13, 'square', 0.16, 360, 0, 1800); this.tone(300, 0.22, 'square', 0.16, 280, 0.15, 1600); },
  hit(kind = 'wood') { // wood: a stick's thwack; slap: a hand, a shoe, a wet cloth; thud: a kick or something heavy
    if (kind === 'slap') { this.noise(0.07, 0.6, 3200); this.tone(420, 0.06, 'triangle', 0.25, 180); }
    else if (kind === 'thud') { this.noise(0.16, 0.4, 600); this.tone(80, 0.26, 'sine', 0.7, 38); }
    else { this.noise(0.12, 0.5, 1400); this.tone(120, 0.2, 'sine', 0.55, 50); }
  },
  whoosh() { this.noise(0.14, 0.12, 3500); },
  crash() { this.noise(0.8, 0.6, 700); this.tone(90, 0.6, 'sine', 0.5, 30); this.noise(0.3, 0.3, 4000, 0.1); },
  bump() { this.tone(90, 0.12, 'sine', 0.4, 60); this.noise(0.08, 0.2, 900); },
  whistle() { for (const [t, d] of [[0, 0.12], [0.18, 0.5]]) { this.tone(2900, d, 'sine', 0.16, 3100, t); this.tone(3350, d, 'sine', 0.08, 3500, t); } }, // traffic cop's whistle
  grunt() { this.tone(rand(170, 230), 0.22, 'sawtooth', 0.12, 110, 0, 900); },
  bark() { this.tone(560, 0.08, 'sawtooth', 0.14, 330, 0, 1600); this.noise(0.05, 0.08, 2200); this.tone(520, 0.08, 'sawtooth', 0.12, 300, 0.14, 1600); },
  yelp() { this.tone(900, 0.12, 'triangle', 0.16, 1500); this.tone(1300, 0.22, 'triangle', 0.12, 700, 0.12); },
  moo() { this.tone(150, 1.0, 'sawtooth', 0.14, 100, 0, 500); },
  beep(hi) { this.tone(hi ? 880 : 520, hi ? 0.4 : 0.18, 'square', 0.14, null, 0, 2500); },
  ko() { this.tone(700, 0.5, 'triangle', 0.25, 140); },
  cash() { this.tone(1200, 0.08, 'square', 0.1); this.tone(1600, 0.14, 'square', 0.1, null, 0.08); },
};

// ------------------------------------------------------------------ music
// Light background music, one original groove per city, synthesised live (16th-note sequencer).
// Each city pack carries its song (web/cities/<id>/city.js); pitches are semitones above Sa (D3).
const SA_HZ = 146.83;
const Music = {
  on: store.get('music', true), city: null, bus: null, step: 0, next: 0, timer: null,
  hz(semi) { return SA_HZ * Math.pow(2, semi / 12); },
  ensure() {
    const a = Sfx.ctx; if (!a || !Sfx.master) return false;
    if (!this.bus) {
      this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.musicBus);
      // tanpura-style drone on Sa and Pa
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const dg = a.createGain(); dg.gain.value = 0.045; lp.connect(dg); dg.connect(this.bus);
      for (const [semi, det] of [[-12, 0], [-5, 3], [0, -3]]) { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(semi); o.detune.value = det; o.connect(lp); o.start(); }
      this.next = a.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
    }
    return true;
  },
  setCity(city) { if (city !== this.city) { this.city = city; this.step = 0; if (Sfx.ctx) this.next = Sfx.ctx.currentTime + 0.1; } },
  toggle() { this.on = !this.on; store.set('music', this.on); },
  tick() {
    const a = Sfx.ctx, song = this.city && this.city.song; if (!a || !song) return;
    const vol = (!this.on ? 0 : paused ? 0.1 : state === 'title' || state === 'champion' || state === 'results' ? 0.3 : 0.2) * DriftMusic.duck;
    this.bus.gain.setTargetAtTime(vol, a.currentTime, 0.3);
    if (a.state !== 'running' || !this.on) { this.next = a.currentTime + 0.1; return; }
    const stepDur = 60 / song.bpm / 4;
    if (this.next < a.currentTime - 0.2) this.next = a.currentTime + 0.05;
    while (this.next < a.currentTime + 0.12) {
      const s = this.step, t = this.next + (s % 2 ? song.swing * stepDur : 0);
      for (const [inst, pat] of Object.entries(song.drums)) if (pat[s % pat.length] === 'x') this.drum(inst, t, s);
      for (const [at, semi, len] of song.melody) if (at === s % 32) this.note(song.lead, t, semi, len * stepDur);
      this.next += stepDur; this.step++;
    }
  },
  env(t, peak, attack, dur) { const g = Sfx.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(this.bus); return g; },
  osc(type, f, t, dur, dest, f2) { const o = Sfx.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.8); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; },
  noise(t, dur, peak, type, freq, q = 1) {
    const a = Sfx.ctx, n = a.createBufferSource(); n.buffer = Sfx.noiseBuf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    n.connect(f); f.connect(this.env(t, peak, 0.003, dur)); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
  },
  drum(inst, t, s) {
    const accent = s % 4 === 0 ? 1 : 0.75;
    if (inst === 'dha') { this.osc('sine', 120, t, 0.35, this.env(t, 0.9 * accent, 0.004, 0.35), 52); this.noise(t, 0.04, 0.15, 'lowpass', 900); }
    if (inst === 'ghe') { this.osc('sine', 72, t, 0.4, this.env(t, 0.8, 0.004, 0.4), 105); } // tabla bayan: pitch bends up
    if (inst === 'na') { this.osc('triangle', 520 + Math.random() * 60, t, 0.1, this.env(t, 0.32 * accent, 0.002, 0.1), 470); this.noise(t, 0.025, 0.08, 'highpass', 3500); }
    if (inst === 'clap') { for (const d of [0, 0.012, 0.024]) this.noise(t + d, 0.05, 0.25, 'bandpass', 1400, 1.2); }
    if (inst === 'shaker') this.noise(t, 0.035, 0.05 * accent, 'highpass', 6500);
  },
  note(lead, t, semi, dur) {
    const a = Sfx.ctx, f = this.hz(semi + 12);
    if (lead === 'harmonium') {
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.connect(this.env(t, 0.09, 0.04, dur + 0.08));
      this.osc('sawtooth', f * 1.002, t, dur + 0.08, lp); this.osc('sawtooth', f * 0.998, t, dur + 0.08, lp); this.osc('square', f / 2, t, dur + 0.08, lp);
    } else if (lead === 'tumbi') {
      const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; hp.connect(this.env(t, 0.13, 0.002, 0.22));
      this.osc('sawtooth', f * 2.04, t, 0.22, hp, f * 2);
    } else if (lead === 'nadaswaram') {
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1; bp.connect(this.env(t, 0.11, 0.05, dur + 0.05));
      const o1 = this.osc('sawtooth', f * 2, t, dur + 0.05, bp), o2 = this.osc('square', f * 2, t, dur + 0.05, bp);
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 7; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
    }
  },
};

// ------------------------------------------------------------------ drift anthem
// An original drift track (not a copy of any song): 132 BPM trap beat with an 808 kick that slides,
// claps on 2 and 4, hi-hat rolls, and a koto-like plucked riff in the Japanese "in" scale on E. It slams
// in with a gong when you start drifting, keeps going while you chain drifts and fades out ~2 s after
// the last one; the city music ducks under it. It plays on the music bus, so the Music slider and N apply.
const DRIFT_SONG = {
  bpm: 132,
  // 32 sixteenth steps (2 bars)
  kick:  'x.....x...x.....x.....x..x..x...',
  clap:  '........x...............x.......',
  hat:   'x.x.x.x.x.x.x.x.x.x.x.x.xxxxx.x.',
  // 808 root per step (semitones from E1); '.' = hold
  bass:  [[0, 0], [6, 0], [10, 3], [16, 5], [22, 3], [26, -2]],
  // koto riff over 4 bars: [step 0..63, semitone from E4, length in steps]  (E F A B C = 0 1 5 7 8)
  koto:  [[0, 12, 2], [2, 8, 2], [4, 7, 2], [6, 5, 2], [8, 7, 4], [14, 1, 2], [16, 0, 4], [22, 5, 2], [24, 7, 2], [26, 8, 2], [28, 7, 4],
          [32, 12, 2], [34, 13, 2], [36, 12, 2], [38, 8, 2], [40, 7, 4], [46, 5, 2], [48, 8, 2], [50, 7, 2], [52, 5, 2], [54, 1, 2], [56, 0, 8]],
};
const DriftMusic = {
  bus: null, on: false, step: 0, next: 0, timer: null, hold: 0, level: 0, lastT: 0,
  hz(semi, oct = 4) { return 329.63 * Math.pow(2, (semi + (oct - 4) * 12) / 12); }, // E4 = 329.63
  ensure() {
    const a = Sfx.ctx; if (!a || !Sfx.musicBus) return false;
    if (!this.bus) {
      this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.musicBus);
      this.timer = setInterval(() => this.tick(), 25);
    }
    return true;
  },
  // called every frame: drifting = the player is mid-drift right now
  update(drifting) {
    if (!this.ensure()) return;
    const a = Sfx.ctx, now = performance.now() / 1000, dt = Math.min(0.1, now - (this.lastT || now)); this.lastT = now;
    const allowed = Music.on && !paused && state === 'race';
    if (drifting && allowed) {
      if (!this.on) { this.on = true; this.step = 0; this.next = a.currentTime + 0.06; this.gong(a.currentTime + 0.02); }
      this.hold = 2;
    } else this.hold -= dt;
    if (this.on && (this.hold <= 0 || !allowed)) this.on = false;
    this.level += ((this.on ? 1 : 0) - this.level) * Math.min(1, dt * (this.on ? 8 : 0.8));
    this.bus.gain.setTargetAtTime(this.level * 0.42, a.currentTime, 0.05);
  },
  get duck() { return 1 - 0.85 * this.level; }, // how much of the city music is left
  silence() { this.on = false; this.level = 0; this.hold = 0; if (this.bus) this.bus.gain.setTargetAtTime(0, Sfx.ctx.currentTime, 0.02); },
  tick() {
    const a = Sfx.ctx; if (!a || !this.bus || a.state !== 'running') return;
    if (!this.on && this.level < 0.02) { this.next = a.currentTime + 0.05; return; }
    const sd = 60 / DRIFT_SONG.bpm / 4;
    if (this.next < a.currentTime - 0.2) this.next = a.currentTime + 0.05;
    while (this.next < a.currentTime + 0.12) {
      const s = this.step, t = this.next, b = s % 32;
      if (DRIFT_SONG.kick[b] === 'x') this.kick(t);
      if (DRIFT_SONG.clap[b] === 'x') this.clap(t);
      if (DRIFT_SONG.hat[b] === 'x') this.hat(t, b >= 24 && b <= 28 ? 0.6 : b % 4 === 0 ? 1 : 0.7);
      for (const [at, semi] of DRIFT_SONG.bass) if (at === b) this.bass(t, semi, sd * 6);
      for (const [at, semi, len] of DRIFT_SONG.koto) if (at === s % 64) this.koto(t, semi, len * sd);
      this.next += sd; this.step++;
    }
  },
  env(t, peak, attack, dur, dest = this.bus) { const g = Sfx.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest); return g; },
  osc(type, f, t, dur, dest, f2, glide = 0.8) { const o = Sfx.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * glide); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; },
  noise(t, dur, peak, type, freq, q = 1) {
    const a = Sfx.ctx, n = a.createBufferSource(); n.buffer = Sfx.noiseBuf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    n.connect(f); f.connect(this.env(t, peak, 0.002, dur)); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
  },
  kick(t) { this.osc('sine', 150, t, 0.5, this.env(t, 0.95, 0.003, 0.5), 45, 0.25); this.noise(t, 0.02, 0.2, 'lowpass', 1500); },
  clap(t) { for (const d of [0, 0.011, 0.022, 0.034]) this.noise(t + d, 0.09, 0.32, 'bandpass', 1300, 1.4); this.noise(t + 0.03, 0.35, 0.06, 'bandpass', 1800, 0.8); },
  hat(t, v) { this.noise(t, 0.04, 0.09 * v, 'highpass', 8000); },
  bass(t, semi, dur) { // 808: sine with a little saturation-ish square layer, sliding into the note
    const f = this.hz(semi, 1), g = this.env(t, 0.55, 0.01, dur);
    this.osc('sine', f * 1.25, t, dur, g, f, 0.12); this.osc('square', f, t, dur * 0.5, this.env(t, 0.05, 0.01, dur * 0.5));
  },
  koto(t, semi, dur) { // plucked string: bright attack, quick decay, a tiny pitch bend down (the koto "oshi" release)
    const a = Sfx.ctx, f = this.hz(semi, 4), hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    hp.connect(this.env(t, 0.2, 0.002, Math.max(0.35, dur * 1.4)));
    this.osc('triangle', f * 1.012, t, Math.max(0.35, dur * 1.4), hp, f, 0.15); this.osc('sawtooth', f * 2, t, 0.12, this.env(t, 0.05, 0.001, 0.12, hp));
  },
  gong(t) { // the drift hit: inharmonic partials with a long, shimmering tail
    for (const [f, v, d] of [[82, 0.5, 2.6], [128, 0.3, 2.2], [197, 0.22, 1.8], [263, 0.14, 1.5], [419, 0.08, 1.1]]) {
      const o = this.osc('sine', f, t, d, this.env(t, v, 0.01, d)); o.detune.setValueAtTime(-15, t); o.detune.linearRampToValueAtTime(10, t + d);
    }
    this.noise(t, 0.6, 0.12, 'bandpass', 900, 0.7);
  },
};

// ------------------------------------------------------------------ street ambience
// Real market/street recordings per city (web/cities/<city>/ambience.js, loaded on demand). The loop is
// played as overlapping copies with crossfades so there is no seam, and it swells near shops.
const Ambience = {
  city: null, bufs: {}, requested: {}, bus: null, next: 0, timer: null, sources: [],
  XF: 2,
  setCity(city) {
    if (city === this.city) return;
    this.city = city; this.stopAll();
    if (!this.requested[city]) {
      this.requested[city] = true;
      const tag = document.createElement('script'); tag.src = `cities/${city}/ambience.js`;
      tag.onerror = () => reportError('audio', `cities/${city}/ambience.js failed to load`);
      document.head.appendChild(tag);
    }
  },
  stopAll() { const a = Sfx.ctx; for (const s of this.sources) { try { s.g.gain.setTargetAtTime(0, a.currentTime, 0.3); s.n.stop(a.currentTime + 1.5); } catch (e) { /* not started */ } } this.sources = []; this.next = 0; },
  ensure() {
    const a = Sfx.ctx; if (!a || this.bus) return;
    this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.cityBus);
    this.timer = setInterval(() => this.tick(), 200);
  },
  decode(city) {
    const url = (window.RRR_AMBIENCE || {})[city]; if (!url || this.bufs[city] !== undefined) return;
    this.bufs[city] = null;
    const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.bufs[city] = b; }, e => { this.bufs[city] = false; reportError('audio', `${city} street sound decode failed`, e); });
  },
  shopsNearby() {
    if (!segments.length) return 0;
    let n = 0; const base = findSegment(position).index;
    for (let i = 0; i < 40; i++) for (const s of segments[(base + i) % segments.length].sprites) if (s.kind === 'chai' || s.kind === 'building') n++;
    return Math.min(1, n / 6);
  },
  tick() {
    const a = Sfx.ctx; if (!a || a.state !== 'running') return;
    this.decode(this.city);
    const buf = this.bufs[this.city];
    const quiet = !def || !def.ambience; // e.g. out on the Sea Link
    const base = paused ? 0.2 : state === 'title' || state === 'champion' ? 0.5 : 0.8;
    this.bus.gain.setTargetAtTime(quiet ? 0 : base * (0.7 + 0.3 * this.shopsNearby()), a.currentTime, 0.8);
    if (!buf) return;
    if (!this.next || this.next < a.currentTime) this.next = a.currentTime + 0.05;
    if (this.next - a.currentTime > this.XF + 0.5) return;
    // schedule the next overlapping copy: fade in over XF, fade out over the last XF
    const t = this.next, d = buf.duration, n = a.createBufferSource(), g = a.createGain();
    n.buffer = buf; n.connect(g); g.connect(this.bus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + this.XF);
    g.gain.setValueAtTime(1, t + d - this.XF); g.gain.linearRampToValueAtTime(0, t + d);
    n.start(t); n.stop(t + d + 0.05);
    const entry = { n, g }; this.sources.push(entry); n.onended = () => { this.sources = this.sources.filter(s => s !== entry); };
    this.next = t + d - this.XF;
  },
};

// ------------------------------------------------------------------ animals
// Cows moo and dogs bark from where they stand on the road: distance gain, stereo pan and a
// Doppler-ish pitch nudge. Played on the City noise channel.
const Animals = {
  mooT: 2, lastMoo: 0,
  spot(c) {
    const dz = wrapDelta(c.z - player.dist), closeness = clamp(1 - Math.abs(dz) / 3200, 0, 1);
    const closing = clamp((player.speed - (c.speed || 0)) * Math.sign(dz || 1) / MAX_SPEED, -1, 1);
    return { dz, gain: closeness * closeness, pan: clamp((c.x - player.x) * 0.55, -0.9, 0.9), rate: 1 + 0.12 * closing };
  },
  outAt(gain, pan) {
    const a = Sfx.ctx; if (!a || !Sfx.cityBus || gain < 0.02) return null;
    const g = a.createGain(); g.gain.value = gain;
    if (a.createStereoPanner) { const pn = a.createStereoPanner(); pn.pan.value = pan; g.connect(pn); pn.connect(Sfx.cityBus); } else g.connect(Sfx.cityBus);
    return g;
  },
  // real recordings from web/animals.js (dog barks, a bark-and-growl, two cow moos)
  bufs: {}, loaded: false,
  loadAnimals() {
    if (this.loaded || !Sfx.ctx) return; this.loaded = true;
    const src = window.RRR_ANIMALS;
    if (!src) { reportError('audio', 'animals.js missing: cows and dogs will be silent'); return; }
    for (const [name, url] of Object.entries(src)) {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.bufs[name] = b; }, e => reportError('audio', `animal sound ${name} decode failed`, e));
    }
  },
  playAt(name, gain, pan, rate, delay = 0) {
    const a = Sfx.ctx, buf = this.bufs[name], out = buf && this.outAt(gain, pan); if (!out) return;
    const n = a.createBufferSource(); n.buffer = buf; n.playbackRate.value = rate * rand(0.94, 1.06); // every animal a little different
    n.connect(out); n.start(a.currentTime + delay);
  },
  mooAt(gain, pan, rate) { this.playAt(pick(['moo1', 'moo2']), gain, pan, rate); },
  barkAt(gain, pan, rate, times = 2) {
    if (times >= 3) { this.playAt('growl', gain, pan, rate); return; } // riled up: bark and growl
    this.playAt(pick(['bark1', 'bark2']), gain, pan, rate);
    if (times === 2) this.playAt(pick(['bark1', 'bark2']), gain, pan, rate * 1.04, rand(0.28, 0.4));
  },
  mooFrom(c) { const p = this.spot(c); this.mooAt(Math.max(p.gain, 0.3), p.pan, p.rate); this.lastMoo = performance.now(); },
  barkFrom(c, times) { const p = this.spot(c); this.barkAt(p.gain, p.pan, p.rate, times || 1 + Math.floor(Math.random() * 3)); },
  updateAnimals(dt) {
    if (!Sfx.ctx || !RACING_STATES.includes(state) || paused) return;
    this.mooT -= dt;
    for (const c of traffic) {
      const dz = wrapDelta(c.z - player.dist);
      if (dz < -400 || dz > 2600) { if (c.type === 'cow' && Math.abs(dz) > 3000) c.mooed = false; continue; }
      // most cows moo once as you come up on them
      if (c.type === 'cow' && !c.mooed && dz > 0 && dz < 2200) { c.mooed = true; if (this.mooT <= 0 && Math.random() < 0.7) { this.mooFrom(c); this.mooT = rand(1.2, 2.5); } }
      // roadside dogs sound off as you come up to them (chasers bark from updateDog)
      if (c.type === 'dog' && c.mode === 'sit' && dz > 0 && dz < 1500 && Math.random() < dt * 0.25) this.barkFrom(c);
    }
  },
};

// ------------------------------------------------------------------ voice clips
// Recorded (TTS-generated) lines from web/voices.js, played from the speaker's spot on the road:
// distance gain + muffling, stereo pan, and Doppler pitch while they play. Falls back to Voice (speech).
const VoiceClips = {
  bufs: {}, active: [], loading: false, failed: false,
  loadClips() {
    if (this.loading || !Sfx.ctx) return; this.loading = true;
    const src = window.RRR_VOICES;
    if (!src) { this.failed = true; reportError('voices', 'voices.js missing: bubbles will be silent'); return; }
    let bad = 0;
    for (const [line, url] of Object.entries(src)) {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.bufs[line] = b; }, e => { if (!bad++) reportError('voices', 'voice clip decode failed', e, line); });
    }
  },
  // where: () => ({ dz, x, vz }) for a speaker on the road, or null for your own driver (centre, no Doppler)
  playClip(line, { kind, rate = 1, where = null, owner = null }) {
    const a = Sfx.ctx, buf = this.bufs[line];
    if (!a || !buf || !Sfx.voiceBus || paused) return false;
    if (kind === 'hawker' && this.active.some(c => c.kind === 'hawker')) return true; // one hawker at a time
    for (const c of this.active) if (owner && c.owner === owner) { try { c.src.stop(); } catch (e) { /* ended */ } }
    const src = a.createBufferSource(); src.buffer = buf;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    const g = a.createGain(); g.gain.value = 0;
    const pan = a.createStereoPanner ? a.createStereoPanner() : null;
    src.connect(lp); lp.connect(g);
    if (pan) { g.connect(pan); pan.connect(Sfx.voiceBus); } else g.connect(Sfx.voiceBus);
    const clip = { src, lp, g, pan, rate, where, owner, kind, base: kind === 'hawker' ? 0.85 : 1 };
    this.place(clip, true);
    src.start();
    this.active.push(clip);
    src.onended = () => { this.active = this.active.filter(c => c !== clip); };
    return true;
  },
  place(c, now) {
    const a = Sfx.ctx, t = a.currentTime, tc = now ? 0.001 : 0.06;
    let gain = c.base, pan = 0, rate = c.rate, cutoff = 9000;
    if (c.where) {
      const { dz, x, vz } = c.where();
      const near = clamp(1 - Math.abs(dz) / 4200, 0, 1);
      gain *= Math.pow(near, 1.4);
      cutoff = 900 + 8000 * near;                                   // far away sounds muffled
      pan = clamp((x - player.x) * 0.5, -0.9, 0.9);
      const closing = clamp((player.speed - vz) * Math.sign(dz || 1) / MAX_SPEED, -1, 1);
      rate *= 1 + 0.16 * closing;                                    // Doppler: up while closing in, down after passing
    }
    c.g.gain.setTargetAtTime(gain, t, tc);
    c.lp.frequency.setTargetAtTime(cutoff, t, tc);
    c.src.playbackRate.setTargetAtTime(rate, t, tc);
    if (c.pan) c.pan.pan.setTargetAtTime(pan, t, tc);
  },
  updateClips() { for (const c of this.active) this.place(c, false); },
  stopClips() { for (const c of this.active) { try { c.src.stop(); } catch (e) { /* ended */ } } this.active = []; },
};

// ------------------------------------------------------------------ voices
// Bubble lines are only ever heard as the recorded clips (VoiceClips); the game never uses the
// browser's text-to-speech. If a clip can't play, the bubble simply stays silent.
const Voice = {
  sayLine(line, { kind, where = null, owner = null, clipRate = 1 }) { VoiceClips.playClip(line, { kind, rate: clipRate, where, owner }); },
  stopVoices() { VoiceClips.stopClips(); },
};
addEventListener('visibilitychange', () => {
  if (document.hidden) { Voice.stopVoices(); return; }
  // coming back to the tab: pick audio up again if the phone had paused it
  const a = Sfx.ctx; if (a && a.state !== 'running') { const p = a.resume(); if (p && p.catch) p.catch(() => {}); }
});

// ------------------------------------------------------------------ other vehicles
// Positional engine sound for the nearest buses, trucks, cars and rival autos (louder when close,
// panned to their side of the road, Doppler-shifted as you close in or drop back), plus Indian
// traffic horns: random honking, and vehicles honking at you when you overtake them closely.
const VEHICLE_SOUND = {
  truck: { f: 30, f2: 2, lp: 230, am: [8, 0.45], gain: 0.55, horn: { notes: [196, 247], dur: 0.75, wave: 'sawtooth', cut: 1700, blasts: 1 } },
  bus: { f: 36, f2: 2, lp: 260, am: [9, 0.35], gain: 0.5, horn: { notes: [294, 370], dur: 0.35, wave: 'sawtooth', cut: 2200, blasts: 2 } },
  tractor: { f: 24, f2: 2, lp: 200, am: [11, 0.75], gain: 0.5, horn: { notes: [220, 277], dur: 0.45, wave: 'sawtooth', cut: 1500, blasts: 1 } },
  bike: { f: 58, f2: 1.7, lp: 900, am: [28, 0.35], gain: 0.16, horn: { notes: [560, 660], dur: 0.1, wave: 'square', cut: 3600, blasts: 2 } },
  car: { f: 70, f2: 1.5, lp: 600, am: [0, 0], gain: 0.25, horn: { notes: [415, 523], dur: 0.12, wave: 'square', cut: 3000, blasts: 2 } },
  auto: { f: 34, f2: 1.5, lp: 500, am: [22, 0.6], gain: 0.22, horn: { notes: [380, 300], dur: 0.16, wave: 'square', cut: 1800, blasts: 2, bulb: true } },
};
const VehicleAudio = {
  voices: [], ready: false, honkT: 3,
  kindOf(c) { return c.isRival ? 'auto' : VEHICLE_SOUND[c.type] ? c.type : null; },
  ensureVoices() {
    const a = Sfx.ctx; if (this.ready) return true; if (!a || !Sfx.raceBus) return false;
    for (let i = 0; i < 5; i++) {
      const g = a.createGain(); g.gain.value = 0;
      const pan = a.createStereoPanner ? a.createStereoPanner() : null;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 1.5;
      const o1 = a.createOscillator(); o1.type = 'sawtooth';
      const o2 = a.createOscillator(); o2.type = 'square';
      const am = a.createGain(); am.gain.value = 1;
      const lfo = a.createOscillator(); lfo.type = 'square';
      const lfoG = a.createGain(); lfoG.gain.value = 0; lfo.connect(lfoG); lfoG.connect(am.gain);
      o1.connect(lp); o2.connect(lp); lp.connect(am); am.connect(g);
      if (pan) { g.connect(pan); pan.connect(Sfx.raceBus); } else g.connect(Sfx.raceBus);
      o1.start(); o2.start(); lfo.start();
      this.voices.push({ o1, o2, lp, g, pan, lfo, lfoG });
    }
    return (this.ready = true);
  },
  updateVehicles(dt) {
    if (!this.ensureVoices()) return;
    const a = Sfx.ctx, t = a.currentTime, live = RACING_STATES.includes(state) && !paused;
    const near = [];
    if (live) {
      for (const c of traffic) {
        const kind = this.kindOf(c); if (!kind) continue;
        const dz = wrapDelta(c.z - player.dist);
        // overtaking close by: they often lean on the horn
        if (c.dir !== -1 && c._dz > 0 && dz <= 0 && Math.abs(c.x - player.x) < 0.9 && player.speed > c.speed && Math.random() < 0.55) this.honkAt(c, dz, true);
        // rash bikers lean on the horn coming up behind you
        if (c.rash && c.dir !== -1 && dz < 0 && dz > -1800 && Math.abs(c.x - player.x) < 0.5 && !(c.honkCd > 0)) { c.honkCd = 1.1; this.honkAt(c, dz, true); }
        // you're in an oncoming vehicle's lane, heading at it: long angry horn
        if (c.dir === -1 && dz > 0 && dz < 4500 && Math.abs(c.x - player.x) < (c.nw + TUK_NW) / 2 && !(c.honkCd > 0)) { c.honkCd = 2.5; this.honkAt(c, dz, true); }
        if (c.honkCd > 0) c.honkCd -= dt;
        c._dz = dz;
        if (dz > -800 && dz < 3500) near.push({ c, kind, dz });
      }
      for (const r of rivals) { const dz = r.dist - player.dist; if (r.ko <= 0 && dz > -800 && dz < 3500) near.push({ c: r, kind: 'auto', dz }); }
      // random city honking from someone in view
      this.honkT -= dt;
      if (this.honkT <= 0) {
        this.honkT = rand(1.5, 4.5);
        const pool = near.filter(n => n.dz > -300); if (pool.length) { const n = pick(pool); this.honkAt(n.c, n.dz, false); }
      }
    }
    near.sort((x, y) => Math.abs(x.dz) - Math.abs(y.dz));
    this.voices.forEach((v, i) => {
      const e = near[i];
      if (!e) { v.g.gain.setTargetAtTime(0, t, 0.15); return; }
      const { c, kind, dz } = e, p = VEHICLE_SOUND[kind];
      const closeness = Math.max(0, 1 - Math.abs(dz) / 3500);
      const closing = clamp((dz > 0 ? 1 : -1) * (player.speed - (c.dir || 1) * c.speed) / MAX_SPEED, -1, 1); // + while approaching
      const rpm = kind === 'auto' ? c.speed / MAX_SPEED : 0.6;
      const f = p.f * (1 + (kind === 'auto' ? rpm * 1.6 : 0.2)) * (1 + 0.12 * closing);
      v.o1.frequency.setTargetAtTime(f, t, 0.1); v.o2.frequency.setTargetAtTime(f * p.f2, t, 0.1);
      v.lp.frequency.setTargetAtTime(p.lp * (0.6 + 0.8 * closeness), t, 0.1);
      v.lfo.frequency.setTargetAtTime(Math.max(1, p.am[0] * (kind === 'auto' ? 0.6 + rpm * 1.4 : 1)), t, 0.1);
      v.lfoG.gain.setTargetAtTime(p.am[1] * 0.5, t, 0.1);
      v.g.gain.setTargetAtTime(p.gain * closeness * closeness, t, 0.12);
      if (v.pan) v.pan.pan.setTargetAtTime(clamp((c.x - player.x) * 0.7, -0.9, 0.9), t, 0.1);
    });
  },
  // real horns (web/horns.js): musical truck horns and a deep bus air horn, recorded in Jaipur
  hornBufs: {}, hornsLoaded: false,
  loadHorns() {
    if (this.hornsLoaded || !Sfx.ctx) return; this.hornsLoaded = true;
    const src = window.RRR_HORNS;
    if (!src) { reportError('audio', 'horns.js missing: using synthesised horns'); return; }
    for (const [name, url] of Object.entries(src)) {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.hornBufs[name] = b; }, e => reportError('audio', `horn ${name} decode failed`, e));
    }
  },
  honkAt(c, dz, angry) {
    const kind = this.kindOf(c); if (!kind) return;
    const h = VEHICLE_SOUND[kind].horn, closeness = Math.max(0, 1 - Math.abs(dz) / 3500);
    const vol = 0.35 * closeness * closeness + (angry ? 0.1 : 0), pan = clamp((c.x - player.x) * 0.7, -0.9, 0.9);
    const rec = kind === 'truck' ? this.hornBufs[pick(['truck1', 'truck2'])] : kind === 'bus' ? this.hornBufs.bus : null;
    if (rec) this.hornClip(rec, vol * 2.2, pan, angry); else this.hornTone(h, vol, pan, angry ? 1.6 : 1);
  },
  hornClip(buf, vol, panX, angry) {
    const a = Sfx.ctx; if (!a || vol < 0.01) return;
    const out = a.createGain(); out.gain.value = Math.min(vol, 1.2);
    if (a.createStereoPanner) { const pn = a.createStereoPanner(); pn.pan.value = panX; out.connect(pn); pn.connect(Sfx.raceBus); } else out.connect(Sfx.raceBus);
    const n = a.createBufferSource(); n.buffer = buf; n.playbackRate.value = rand(0.97, 1.03); n.connect(out);
    // an angry driver cuts the horn short and hits it again
    if (angry) { n.start(a.currentTime, 0, Math.min(0.7, buf.duration)); const n2 = a.createBufferSource(); n2.buffer = buf; n2.connect(out); n2.start(a.currentTime + 0.8); }
    else n.start();
  },
  hornTone(h, vol, panX, stretch) {
    const a = Sfx.ctx; if (!a || vol < 0.01) return;
    const out = a.createGain(); out.gain.value = vol;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = h.cut; lp.connect(out);
    if (a.createStereoPanner) { const pn = a.createStereoPanner(); pn.pan.value = panX; out.connect(pn); pn.connect(Sfx.raceBus); } else out.connect(Sfx.raceBus);
    const blast = h.dur * stretch;
    for (let b = 0; b < h.blasts; b++) {
      const t0 = a.currentTime + b * (blast + 0.08);
      const env = a.createGain(); env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(1, t0 + 0.02);
      env.gain.setValueAtTime(1, t0 + blast * 0.8); env.gain.exponentialRampToValueAtTime(0.0001, t0 + blast); env.connect(lp);
      (h.bulb ? [h.notes[b % 2]] : h.notes).forEach(f => {
        const o = a.createOscillator(); o.type = h.wave; o.frequency.setValueAtTime(f, t0);
        if (!h.bulb) o.frequency.linearRampToValueAtTime(f * 0.97, t0 + blast); // air horns sag a little
        o.connect(env); o.start(t0); o.stop(t0 + blast + 0.05);
      });
    }
  },
};

// ------------------------------------------------------------------ sprite painting
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function isLight(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 150; }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => clamp(Math.round(v + amt * 255), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function flipped(src) { const c = mk(src.width, src.height), g = c.getContext('2d'); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }

// Auto-rickshaw seen from behind.
// rear: 'slogan' (a band in the trim colour with a slogan, the plate in the middle) or 'grille' (the back of a
// rear-engined auto: a perforated engine hatch, any slogan painted above it, the plate low on the right with a tassel)
function makeTuk(body, trim, canopy, plate, slogan = 'HORN OK PLEASE', rear = 'slogan') {
  const c = mk(240, 232), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 120, 218, 114, 11); g.fill();
  for (const wx of [30, 210]) {
    g.fillStyle = '#141414'; rr(g, wx - 17, 158, 34, 64, 11); g.fill();
    g.fillStyle = '#343434'; rr(g, wx - 10, 170, 20, 42, 6); g.fill();
    g.fillStyle = '#8a8a8a'; ell(g, wx, 191, 5, 10); g.fill();
  }
  // canopy dome
  const dome = () => { g.beginPath(); g.moveTo(22, 120); g.lineTo(22, 56); g.quadraticCurveTo(24, 8, 120, 6); g.quadraticCurveTo(216, 8, 218, 56); g.lineTo(218, 120); g.closePath(); };
  dome(); g.fillStyle = canopy; g.fill();
  const hl = g.createLinearGradient(22, 0, 218, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.28, 'rgba(255,255,255,.2)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)');
  hl.addColorStop(1, 'rgba(0,0,0,.2)'); dome(); g.fillStyle = hl; g.fill();
  g.strokeStyle = isLight(canopy) ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(33, 114); g.lineTo(33, 58); g.quadraticCurveTo(35, 18, 120, 16); g.quadraticCurveTo(205, 18, 207, 58); g.lineTo(207, 114); g.stroke();
  g.setLineDash([]);
  // rear window with passengers
  g.save(); rr(g, 62, 34, 116, 54, 14); g.clip();
  g.fillStyle = '#26394a'; g.fillRect(62, 34, 116, 54);
  g.fillStyle = '#0d141b'; ell(g, 96, 66, 13, 15); g.fill(); ell(g, 146, 64, 12, 14); g.fill();
  ell(g, 96, 96, 26, 16); g.fill(); ell(g, 146, 94, 24, 16); g.fill();
  g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(62, 70); g.lineTo(110, 34); g.lineTo(130, 34); g.lineTo(72, 88); g.lineTo(62, 88); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 3; rr(g, 62, 34, 116, 54, 14); g.stroke();
  // lower body
  const lower = () => { g.beginPath(); g.moveTo(16, 112); g.lineTo(224, 112); g.lineTo(228, 168); g.quadraticCurveTo(228, 190, 204, 190); g.lineTo(36, 190); g.quadraticCurveTo(12, 190, 12, 168); g.closePath(); };
  lower(); g.fillStyle = body; g.fill();
  const sh = g.createLinearGradient(0, 112, 0, 190);
  sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
  lower(); g.fillStyle = sh; g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (rear === 'grille') {
    // the hood's canvas is riveted down along the top of the tub
    g.fillStyle = 'rgba(0,0,0,.28)'; for (let x = 24; x <= 216; x += 12) { g.beginPath(); g.arc(x, 117, 1.6, 0, Math.PI * 2); g.fill(); }
    // a slogan, if there is one, is painted straight onto the tub above the hatch, which sits a little lower for it
    const dy = slogan ? 10 : 0;
    if (slogan) {
      g.font = 'bold 11px Arial, sans-serif';
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(slogan, 120.8, 127.3, 190);
      g.fillStyle = isLight(body) ? '#111' : '#fff'; g.fillText(slogan, 120, 126.5, 190);
    }
    // engine hatch: a pressed panel with a perforated grille, a badge on it, and a second slot below
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 2; rr(g, 58, 124 + dy, 124, 60 - dy, 5); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1; rr(g, 60, 126 + dy, 120, 56 - dy, 4); g.stroke();
    const holes = (x0, y0, w, h) => {
      g.fillStyle = 'rgba(0,0,0,.16)'; rr(g, x0, y0, w, h, 5); g.fill();
      g.fillStyle = 'rgba(0,0,0,.55)';
      for (let y = y0 + 3, row = 0; y < y0 + h - 1; y += 3.5, row++) for (let x = x0 + 3 + (row % 2) * 1.75; x < x0 + w - 2; x += 3.5) { g.beginPath(); g.arc(x, y, 1, 0, Math.PI * 2); g.fill(); }
    };
    holes(70, 130 + dy, 100, 30 - dy * 0.6); holes(80, 166 + dy * 0.4, 80, 11);
    g.fillStyle = '#cfd4d8'; rr(g, 108, 141 + dy * 0.7, 24, 8, 3); g.fill();
    g.fillStyle = 'rgba(160,20,30,.75)'; g.fillRect(60, 187, 120, 2);
  } else {
    g.fillStyle = trim; g.fillRect(15, 121, 210, 16);
    g.fillStyle = isLight(trim) ? '#111' : '#fff'; g.font = 'bold 11px Arial, sans-serif';
    g.fillText(slogan, 120, 129.5, 200);
  }
  for (const tx of [22, 196]) {
    g.fillStyle = '#7a0000'; rr(g, tx, 142, 22, 26, 5); g.fill();
    g.fillStyle = '#ff2b2b'; rr(g, tx + 3, 145, 16, 20, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; rr(g, tx + 5, 147, 6, 6, 2); g.fill();
  }
  if (rear === 'grille') {
    g.fillStyle = 'rgba(255,255,255,.75)'; for (const tx of [22, 196]) { rr(g, tx + 3, 157, 16, 8, 3); g.fill(); }   // clear lower lens
    g.fillStyle = '#ffd400'; rr(g, 184, 171, 40, 15, 2); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1; rr(g, 184, 171, 40, 15, 2); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 7px Arial, sans-serif'; g.fillText(plate, 204, 179, 36);
    g.strokeStyle = '#d8502f'; g.lineWidth = 1.5;                                                                     // a tassel under the plate
    for (const dx of [-2, 0, 2]) { g.beginPath(); g.moveTo(204, 186); g.lineTo(204 + dx, 200); g.stroke(); }
  } else {
    g.fillStyle = '#ffd400'; rr(g, 86, 148, 68, 24, 3); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1.5; rr(g, 86, 148, 68, 24, 3); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 12px Arial, sans-serif'; g.fillText(plate, 120, 160.5);
  }
  g.fillStyle = '#9aa3a8'; rr(g, 28, 191, 184, 8, 4); g.fill();
  g.fillStyle = '#5a5a5a'; rr(g, 168, 198, 26, 8, 3); g.fill();
  // nimbu-mirchi charm
  g.strokeStyle = '#222'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(120, 199); g.lineTo(120, 206); g.stroke();
  g.fillStyle = '#f4e04d'; ell(g, 120, 210, 6, 6); g.fill();
  g.fillStyle = '#2e8b2e';
  ell(g, 114, 220, 2.5, 7, -0.35); g.fill(); ell(g, 120, 222, 2.5, 8); g.fill(); ell(g, 126, 220, 2.5, 7, 0.35); g.fill();
  return c;
}

function makeCow() {
  const c = mk(270, 196), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, 135, 186, 100, 9); g.fill();
  const white = '#f3efe6', leg = '#e0dacb';
  g.fillStyle = leg;
  for (const lx of [72, 96, 166, 190]) { g.fillRect(lx, 110, 14, 64); }
  g.fillStyle = '#3a3030'; for (const lx of [72, 96, 166, 190]) g.fillRect(lx - 1, 170, 16, 8);
  // tail
  g.strokeStyle = white; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(56, 80); g.quadraticCurveTo(38, 110, 44, 150); g.stroke();
  g.fillStyle = '#2b2222'; ell(g, 44, 156, 6, 11); g.fill();
  // body, hump
  g.fillStyle = white; ell(g, 132, 98, 84, 44); g.fill(); ell(g, 176, 60, 24, 18); g.fill();
  g.fillStyle = '#2b2222'; ell(g, 110, 86, 18, 12, 0.4); g.fill(); ell(g, 80, 108, 12, 9); g.fill(); ell(g, 148, 118, 14, 8, -0.2); g.fill();
  // neck + head
  g.fillStyle = white; g.beginPath(); g.moveTo(190, 70); g.lineTo(228, 66); g.lineTo(236, 104); g.lineTo(196, 126); g.closePath(); g.fill();
  g.fillStyle = '#ebe5d6'; g.beginPath(); g.moveTo(198, 112); g.quadraticCurveTo(212, 150, 224, 110); g.fill();
  g.fillStyle = white; ell(g, 236, 86, 26, 17, 0.5); g.fill();
  g.fillStyle = '#f2a7a7'; ell(g, 252, 100, 9, 8, 0.5); g.fill();
  g.fillStyle = '#111'; ell(g, 236, 78, 3, 3); g.fill();
  g.fillStyle = '#e2dccd'; ell(g, 216, 72, 11, 5, -0.4); g.fill();
  g.strokeStyle = '#c9b48a'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(226, 66); g.quadraticCurveTo(220, 44, 230, 34); g.stroke();
  g.beginPath(); g.moveTo(236, 68); g.quadraticCurveTo(242, 46, 254, 42); g.stroke();
  // marigold garland
  for (let i = 0; i <= 8; i++) { const t = i / 8; g.fillStyle = i % 2 ? '#ffb300' : '#ff6f00'; ell(g, lerp(200, 222, t), 76 + Math.sin(t * Math.PI) * 30, 5, 5); g.fill(); }
  return c;
}

function makeCar(color) {
  const c = mk(240, 170), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 120, 160, 116, 9); g.fill();
  g.fillStyle = '#111'; rr(g, 16, 118, 42, 44, 8); g.fill(); rr(g, 182, 118, 42, 44, 8); g.fill();
  g.fillStyle = color; g.beginPath(); g.moveTo(44, 18); g.lineTo(196, 18); g.lineTo(218, 76); g.lineTo(22, 76); g.closePath(); g.fill();
  g.fillStyle = '#1c2833'; g.beginPath(); g.moveTo(52, 26); g.lineTo(188, 26); g.lineTo(204, 70); g.lineTo(36, 70); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(60, 26); g.lineTo(100, 26); g.lineTo(70, 70); g.lineTo(40, 70); g.fill();
  g.fillStyle = color; rr(g, 8, 70, 224, 76, 16); g.fill();
  const sh = g.createLinearGradient(0, 70, 0, 146); sh.addColorStop(0, 'rgba(255,255,255,.3)'); sh.addColorStop(1, 'rgba(0,0,0,.3)');
  g.fillStyle = sh; rr(g, 8, 70, 224, 76, 16); g.fill();
  g.fillStyle = '#c00'; rr(g, 14, 80, 36, 22, 5); g.fill(); rr(g, 190, 80, 36, 22, 5); g.fill();
  g.fillStyle = '#ff9a3c'; rr(g, 14, 96, 12, 6, 2); g.fill(); rr(g, 214, 96, 12, 6, 2); g.fill();
  g.fillStyle = '#fff'; rr(g, 92, 104, 56, 18, 3); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MH 12 CR', 120, 113.5);
  g.fillStyle = '#2a2a2a'; rr(g, 10, 132, 220, 16, 8); g.fill();
  return c;
}

// two-wheeler from behind: rear tyre, mudguard with tail lamp and plate, the rider's back and helmet
function makeBike(look) {
  const c = mk(120, 220), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 60, 212, 34, 6); g.fill();
  g.fillStyle = '#111'; rr(g, 50, 160, 20, 54, 8); g.fill();
  g.fillStyle = look.color; rr(g, 34, 132, 52, 36, 10); g.fill();
  g.fillStyle = '#ff2b2b'; rr(g, 48, 136, 24, 10, 3); g.fill();
  g.fillStyle = '#fff'; rr(g, 44, 150, 32, 12, 2); g.fill();
  g.fillStyle = '#2b2b2b'; rr(g, 22, 112, 76, 14, 6); g.fill();                       // legs / footrests
  g.fillStyle = look.shirt; rr(g, 30, 46, 60, 74, 18); g.fill();                     // rider's back
  g.fillStyle = look.shirt; rr(g, 12, 56, 18, 46, 8); g.fill(); rr(g, 90, 56, 18, 46, 8); g.fill();
  g.fillStyle = look.helmet; ell(g, 60, 30, 22, 24); g.fill();
  g.fillStyle = 'rgba(255,255,255,.25)'; ell(g, 52, 22, 8, 6); g.fill();
  return c;
}

// tractor trolley from behind: wheels, the painted tailboard and the load (straw bale or sugarcane ends)
function makeTractor(look) {
  const c = mk(300, 320), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 150, 310, 146, 9); g.fill();
  g.fillStyle = '#111'; rr(g, 20, 250, 44, 64, 8); g.fill(); rr(g, 236, 250, 44, 64, 8); g.fill();
  g.fillStyle = '#1565c0'; g.fillRect(30, 200, 240, 60); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(34, 204, 232, 52);
  g.fillStyle = '#ff2b2b'; for (let x = 44; x < 260; x += 44) g.fillRect(x, 240, 22, 10);
  if (look.crop === 'hay') {
    g.fillStyle = '#e8d9a0'; rr(g, 6, 40, 288, 170, 70); g.fill();
    g.strokeStyle = '#6d4c41'; g.lineWidth = 3; for (let x = 40; x < 280; x += 50) { g.beginPath(); g.moveTo(x, 44); g.lineTo(x, 206); g.stroke(); }
  } else {
    const cols = ['#9aa83c', '#7f8f2a', '#6b3f4f', '#8c9a34'];
    for (let row = 0; row < 5; row++) for (let i = 0; i < 9 - row; i++) { g.fillStyle = cols[(row + i) % 4]; ell(g, 42 + row * 13 + i * 27, 186 - row * 25, 13, 13); g.fill(); }
    g.fillStyle = '#4caf50'; for (let i = 0; i < 6; i++) { ell(g, 60 + i * 36, 70 + (i % 2) * 20, 30, 22); g.fill(); }
  }
  return c;
}

function makeBus() {
  const c = mk(300, 340), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 150, 330, 146, 10); g.fill();
  g.fillStyle = '#111'; rr(g, 14, 290, 50, 44, 8); g.fill(); rr(g, 236, 290, 50, 44, 8); g.fill();
  g.fillStyle = '#c62828'; rr(g, 8, 30, 284, 272, 16); g.fill();
  g.fillStyle = '#f3e2b3'; g.fillRect(8, 150, 284, 22);
  g.fillStyle = '#111'; rr(g, 70, 38, 160, 22, 3); g.fill();
  g.fillStyle = '#ffb300'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MUMBAI CST  ⇢', 150, 49.5);
  g.fillStyle = '#1c2833'; rr(g, 28, 66, 244, 80, 8); g.fill();
  g.fillStyle = '#0c1116'; for (const hx of [70, 120, 180, 230]) { ell(g, hx, 118, 13, 15); g.fill(); ell(g, hx, 150, 22, 16); g.fill(); }
  g.fillStyle = '#1c2833'; g.fillRect(28, 140, 244, 6);
  g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(28, 120); g.lineTo(90, 66); g.lineTo(120, 66); g.lineTo(40, 146); g.lineTo(28, 146); g.fill();
  g.fillStyle = '#c62828'; g.font = 'bold 13px Arial'; g.fillText('STATE TRANSPORT', 150, 161.5);
  g.fillStyle = '#ff2b2b'; rr(g, 16, 190, 30, 50, 6); g.fill();
  g.fillStyle = '#ff9a3c'; rr(g, 16, 244, 30, 16, 4); g.fill();
  g.fillStyle = '#ff2b2b'; rr(g, 218, 190, 24, 50, 6); g.fill();
  g.fillStyle = '#fff'; rr(g, 110, 250, 80, 24, 3); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 13px Arial'; g.fillText('MH 01 BS', 150, 262.5);
  g.fillStyle = '#222'; rr(g, 6, 288, 288, 16, 6); g.fill();
  return c;
}

function makeTruck() {
  const c = mk(300, 350), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 150, 340, 146, 10); g.fill();
  g.fillStyle = '#111'; rr(g, 10, 290, 70, 54, 8); g.fill(); rr(g, 220, 290, 70, 54, 8); g.fill();
  g.fillStyle = '#1565c0'; rr(g, 12, 10, 276, 140, 44); g.fill();
  g.strokeStyle = '#0d3c7a'; g.lineWidth = 3;
  for (let x = 50; x < 280; x += 50) { g.beginPath(); g.moveTo(x, 18); g.quadraticCurveTo(x + 10, 80, x, 146); g.stroke(); }
  g.strokeStyle = '#e0c080'; g.lineWidth = 2; g.beginPath(); g.moveTo(14, 100); g.quadraticCurveTo(150, 80, 286, 100); g.stroke();
  g.fillStyle = '#ffca28'; g.fillRect(8, 130, 284, 160);
  g.strokeStyle = '#d32f2f'; g.lineWidth = 6; g.strokeRect(14, 136, 272, 148);
  g.strokeStyle = '#2e7d32'; g.lineWidth = 3; g.strokeRect(22, 144, 256, 132);
  g.fillStyle = '#d32f2f'; g.font = 'bold 30px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HORN OK', 150, 176); g.fillText('PLEASE', 150, 210);
  g.fillStyle = '#1b5e20'; g.font = 'bold 12px Arial'; g.fillText('USE DIPPER AT NIGHT', 150, 240);
  g.fillStyle = '#6a1b9a'; g.font = 'bold 11px Arial'; g.fillText('BURI NAZAR WALE TERA MUNH KALA', 150, 262);
  for (const ex of [44, 256]) {
    g.fillStyle = '#fff'; ell(g, ex, 190, 16, 10); g.fill(); g.fillStyle = '#111'; ell(g, ex, 190, 6, 6); g.fill();
  }
  g.fillStyle = '#222'; g.fillRect(8, 288, 284, 14);
  for (let x = 12; x < 290; x += 12) { g.fillStyle = x % 24 ? '#111' : '#d32f2f'; g.beginPath(); g.moveTo(x, 300); g.lineTo(x + 6, 316); g.lineTo(x + 12, 300); g.fill(); }
  g.fillStyle = '#111'; g.fillRect(24, 300, 40, 44); g.fillRect(236, 300, 40, 44);
  g.fillStyle = '#ff2b2b'; rr(g, 30, 322, 28, 8, 3); g.fill(); rr(g, 242, 322, 28, 8, 3); g.fill();
  return c;
}

function makePalm() {
  const c = mk(270, 440), g = c.getContext('2d');
  const base = { x: 120, y: 436 }, top = { x: 142, y: 110 }, ctl = { x: 92, y: 280 };
  const bez = (a, b, cc, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * cc + t * t * b;
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, x = bez(base.x, top.x, ctl.x, t), y = bez(base.y, top.y, ctl.y, t);
    g.fillStyle = i % 2 ? '#8b5a2b' : '#74481f'; ell(g, x, y, lerp(15, 9, t), 8); g.fill();
  }
  const fronds = [[-165, 118], [-138, 124], [-112, 104], [-72, 100], [-42, 122], [-14, 118], [18, 100], [165, 98], [-90, 80]];
  for (const [deg, len] of fronds) {
    const a = deg * Math.PI / 180;
    const ex = top.x + Math.cos(a) * len, ey = top.y + Math.sin(a) * len + 46;
    const cx = top.x + Math.cos(a) * len * 0.5, cy = top.y + Math.sin(a) * len * 0.5 - 26;
    g.strokeStyle = '#2e6b2e'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(top.x, top.y); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
    for (let k = 1; k <= 13; k++) {
      const t = k / 14, px = bez(top.x, ex, cx, t), py = bez(top.y, ey, cy, t);
      const tx = bez(top.x, ex, cx, t + 0.02) - px, ty = bez(top.y, ey, cy, t + 0.02) - py;
      const tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, L = 28 * (1 - t * 0.55);
      g.strokeStyle = k % 2 ? '#3a8f3a' : '#2f7d32'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * L + tx / tl * 8, py + ny * L + 10); g.stroke();
      g.beginPath(); g.moveTo(px, py); g.lineTo(px - nx * L + tx / tl * 8, py - ny * L + 10); g.stroke();
    }
  }
  g.fillStyle = '#5d3a1a'; for (const [dx, dy] of [[-8, 8], [6, 10], [-1, 16]]) { ell(g, top.x + dx, top.y + dy, 8, 8); g.fill(); }
  return c;
}

function makeTree(r) {
  const c = mk(320, 340), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.25)'; ell(g, 160, 332, 90, 8); g.fill();
  g.fillStyle = '#6b4423'; g.beginPath(); g.moveTo(140, 336); g.lineTo(150, 170); g.lineTo(172, 170); g.lineTo(182, 336); g.closePath(); g.fill();
  g.strokeStyle = '#6b4423'; g.lineWidth = 10; g.beginPath(); g.moveTo(160, 220); g.lineTo(110, 160); g.moveTo(162, 210); g.lineTo(215, 150); g.stroke();
  const greens = ['#2e7d32', '#388e3c', '#43a047', '#1b5e20', '#4caf50'];
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = 160 + Math.cos(a) * d * 120, y = 130 + Math.sin(a) * d * 90 - (1 - d) * 20;
    g.fillStyle = greens[Math.floor(r() * greens.length)]; ell(g, x, y, 24 + r() * 18, 20 + r() * 14); g.fill();
  }
  g.fillStyle = 'rgba(255,255,160,.12)'; for (let i = 0; i < 10; i++) { ell(g, 110 + r() * 100, 70 + r() * 60, 14, 10); g.fill(); }
  return c;
}

const SHOPS = ['SHARMA SWEETS', 'CHAI POINT', 'MOBILE REPAIR', 'KIRANA STORE', 'PAAN CORNER', 'DHABA', 'GUPTA TAILORS', 'CYBER CAFE', 'MEDICAL', 'SAREE PALACE'];
function makeBuilding(r, color) {
  const w = 320, h = 440, c = mk(w, h), g = c.getContext('2d');
  const bh = 260 + Math.floor(r() * 160), top = h - bh, floors = Math.floor((bh - 90) / 66);
  g.fillStyle = color; g.fillRect(10, top, 300, bh);
  g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(262, top, 48, bh);
  g.fillStyle = shade(color, -0.18); g.fillRect(4, top - 8, 312, 12);
  // rooftop water tank + dish
  g.fillStyle = '#1e1e1e'; rr(g, 40, top - 44, 40, 38, 6); g.fill();
  g.fillStyle = '#333'; g.fillRect(36, top - 48, 48, 6);
  if (r() < 0.6) { g.strokeStyle = '#ccc'; g.lineWidth = 3; ell(g, 230, top - 20, 14, 10, -0.5); g.stroke(); }
  for (let f = 0; f < floors; f++) {
    const fy = top + 20 + f * 66;
    for (let k = 0; k < 3; k++) {
      const wx = 30 + k * 92;
      g.fillStyle = r() < 0.5 ? '#2d3e50' : (r() < 0.5 ? '#3a7d44' : '#2a6f97'); g.fillRect(wx, fy, 60, 42);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(wx, fy, 60, 6);
      g.strokeStyle = shade(color, -0.3); g.lineWidth = 3; g.strokeRect(wx, fy, 60, 42);
      if (r() < 0.25) { g.fillStyle = '#b0b0b0'; g.fillRect(wx + 36, fy + 24, 26, 16); }
    }
    if (r() < 0.55) {
      g.strokeStyle = '#333'; g.lineWidth = 2; g.fillStyle = shade(color, -0.1); g.fillRect(20, fy + 42, 280, 6);
      for (let x = 22; x < 300; x += 10) { g.beginPath(); g.moveTo(x, fy + 42); g.lineTo(x, fy + 26); g.stroke(); }
      g.beginPath(); g.moveTo(20, fy + 26); g.lineTo(300, fy + 26); g.stroke();
      if (r() < 0.5) { const clothes = ['#e53935', '#fdd835', '#1e88e5', '#8e24aa', '#fff'];
        for (let i = 0; i < 5; i++) { g.fillStyle = clothes[i]; g.fillRect(40 + i * 48, fy + 28, 20, 16); } }
    }
  }
  // ground-floor shop
  const sy = h - 90;
  g.fillStyle = '#2b2b2b'; g.fillRect(30, sy + 20, 260, 70);
  g.fillStyle = '#9e9e9e'; for (let y = sy + 24; y < h; y += 6) g.fillRect(34, y, 252, 2);
  const stripe = r() < 0.5 ? ['#d32f2f', '#fff'] : ['#1e88e5', '#fff'];
  for (let i = 0; i < 13; i++) { g.fillStyle = stripe[i % 2]; g.beginPath(); g.moveTo(24 + i * 21, sy + 4); g.lineTo(45 + i * 21, sy + 4); g.lineTo(48 + i * 21, sy + 24); g.lineTo(21 + i * 21, sy + 24); g.fill(); }
  const signC = pick(['#ffeb3b', '#e53935', '#1565c0', '#2e7d32', '#ff9800'], r);
  g.fillStyle = signC; g.fillRect(24, sy - 32, 272, 34);
  g.fillStyle = isLight(signC) ? '#b71c1c' : '#fff'; g.font = 'bold 20px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(pick(SHOPS, r), 160, sy - 14);
  c.bh = bh; c.wallColor = shade(color, -0.12);
  return c;
}

const AD_COLORS = [{ bg: '#d62828', fg: '#fff' }, { bg: '#06d6a0', fg: '#073b4c' }, { bg: '#ffd166', fg: '#7a1f00' }, { bg: '#3a0ca3', fg: '#ffd60a' }];
const BILLBOARDS = [
  { bg: '#ffd166', fg: '#1d3557', lines: ['HORN OK', 'PLEASE'] },
  { bg: '#1d3557', fg: '#f1faee', lines: ['DRIVE SLOW', 'LIVE LONG'] },
  { bg: '#ef476f', fg: '#fff', lines: ['BOLLYWOOD', 'TONIGHT!'] },
  { bg: '#f77f00', fg: '#fff', lines: ['GHAR KA', 'KHANA'] },
  { bg: '#264653', fg: '#e9c46a', lines: ['SPEED THRILLS', 'BUT KILLS'] },
];
function makeBillboard(b) {
  const c = mk(340, 290), g = c.getContext('2d');
  g.fillStyle = '#555'; g.fillRect(70, 160, 14, 130); g.fillRect(256, 160, 14, 130);
  g.fillStyle = '#333'; g.fillRect(10, 8, 320, 160);
  g.fillStyle = b.bg; g.fillRect(18, 16, 304, 144);
  g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(18, 16, 304, 40);
  g.fillStyle = b.fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 40px Impact, Arial Black, sans-serif';
  g.fillText(b.lines[0], 170, 62, 290); g.font = 'bold 32px Impact, Arial Black, sans-serif'; g.fillText(b.lines[1], 170, 116, 290);
  g.fillStyle = '#777'; for (const x of [60, 170, 280]) { g.fillRect(x - 2, 0, 4, 10); ell(g, x, 2, 8, 4); g.fill(); }
  return c;
}

function makeTemple() {
  const c = mk(300, 430), g = c.getContext('2d');
  g.fillStyle = '#a89f91'; g.fillRect(10, 380, 280, 50); g.fillStyle = '#968d80'; g.fillRect(26, 364, 248, 18);
  const tower = () => { g.beginPath(); g.moveTo(150, 60); g.quadraticCurveTo(218, 110, 232, 364); g.lineTo(68, 364); g.quadraticCurveTo(82, 110, 150, 60); g.closePath(); };
  const gr = g.createLinearGradient(68, 0, 232, 0); gr.addColorStop(0, '#f4a261'); gr.addColorStop(0.5, '#e76f51'); gr.addColorStop(1, '#b5452e');
  tower(); g.fillStyle = gr; g.fill();
  g.save(); tower(); g.clip(); g.strokeStyle = 'rgba(80,20,0,.35)'; g.lineWidth = 3;
  for (let y = 90; y < 364; y += 18) { g.beginPath(); g.moveTo(40, y); g.lineTo(260, y); g.stroke(); }
  g.beginPath(); g.moveTo(150, 60); g.lineTo(150, 364); g.stroke(); g.restore();
  g.fillStyle = '#d4a017'; ell(g, 150, 58, 22, 7); g.fill(); ell(g, 150, 44, 8, 12); g.fill();
  g.strokeStyle = '#5d4037'; g.lineWidth = 3; g.beginPath(); g.moveTo(150, 34); g.lineTo(150, 4); g.stroke();
  g.fillStyle = '#ff6f00'; g.beginPath(); g.moveTo(152, 4); g.lineTo(190, 14); g.lineTo(152, 24); g.fill();
  g.fillStyle = '#3e2723'; g.beginPath(); g.moveTo(126, 364); g.lineTo(126, 318); g.quadraticCurveTo(150, 292, 174, 318); g.lineTo(174, 364); g.fill();
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#ffb300' : '#ff6f00'; ell(g, 126 + i * 5.3, 312 + Math.sin(i / 9 * Math.PI) * 10, 3.5, 3.5); g.fill(); }
  return c;
}

function makeLamp(side) {
  const c = mk(130, 340), g = c.getContext('2d');
  const px = side < 0 ? 16 : 114, dir = -side;
  g.fillStyle = '#6b6f73'; g.fillRect(px - 4, 40, 8, 300); g.fillRect(px - 8, 318, 16, 22);
  g.strokeStyle = '#6b6f73'; g.lineWidth = 6; g.beginPath(); g.moveTo(px, 44); g.quadraticCurveTo(px, 18, px + dir * 50, 20); g.lineTo(px + dir * 96, 24); g.stroke();
  g.fillStyle = '#444'; rr(g, px + dir * 96 - 18, 20, 36, 12, 4); g.fill();
  g.fillStyle = '#fff6c0'; rr(g, px + dir * 96 - 14, 30, 28, 5, 2); g.fill();
  return c;
}

// A hand cart parked on its pull handles, seen from behind: its plank bed slopes up away from you (the ramp).
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
function makeChai() {
  const c = mk(270, 240), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.25)'; ell(g, 135, 232, 120, 8); g.fill();
  g.fillStyle = '#5d4037'; g.fillRect(28, 50, 8, 180); g.fillRect(234, 50, 8, 180);
  for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? '#fff' : '#e53935'; g.beginPath(); g.moveTo(14 + i * 22, 40); g.lineTo(36 + i * 22, 40); g.lineTo(40 + i * 22, 72); g.lineTo(10 + i * 22, 72); g.fill(); }
  g.fillStyle = '#ffeb3b'; rr(g, 70, 4, 130, 36, 4); g.fill();
  g.fillStyle = '#b71c1c'; g.font = 'bold 26px Impact, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CHAI ☕', 135, 23);
  g.fillStyle = '#8d6e63'; g.fillRect(30, 140, 210, 80); g.fillStyle = '#6d4c41'; for (let x = 30; x < 240; x += 30) g.fillRect(x, 140, 3, 80);
  g.fillStyle = '#a1887f'; g.fillRect(24, 132, 222, 12);
  g.fillStyle = '#bdbdbd'; ell(g, 80, 116, 20, 16); g.fill(); g.fillRect(96, 108, 18, 5);
  g.fillStyle = '#ff7043'; ell(g, 80, 132, 16, 4); g.fill();
  for (let i = 0; i < 5; i++) { g.fillStyle = '#e0c080'; g.fillRect(140 + i * 16, 118, 10, 14); g.fillStyle = '#8d5524'; g.fillRect(140 + i * 16, 122, 10, 10); }
  return c;
}

function makeMilestone() {
  const c = mk(80, 110), g = c.getContext('2d');
  g.fillStyle = '#f5f5f5'; rr(g, 10, 30, 60, 76, 4); g.fill();
  g.fillStyle = '#ffcc00'; g.beginPath(); g.moveTo(10, 52); g.lineTo(10, 40); g.arc(40, 40, 30, Math.PI, 0); g.lineTo(70, 52); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('KM', 40, 74); g.fillText('42', 40, 92);
  return c;
}

// road signs (face at the top, post below; the 3D renderer uses the face on a real post)
function makeSign(kind) {
  const c = mk(120, 300), g = c.getContext('2d');
  g.fillStyle = '#8a8f96'; g.fillRect(55, 110, 10, 190);
  const tri = (fill = '#fff') => { g.fillStyle = '#d32f2f'; g.beginPath(); g.moveTo(60, 6); g.lineTo(114, 102); g.lineTo(6, 102); g.closePath(); g.fill();
    g.fillStyle = fill; g.beginPath(); g.moveTo(60, 24); g.lineTo(98, 92); g.lineTo(22, 92); g.closePath(); g.fill(); g.fillStyle = '#111'; };
  const ring = () => { g.fillStyle = '#d32f2f'; g.beginPath(); g.arc(60, 56, 52, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(60, 56, 40, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111'; };
  if (kind === 'signal') { tri(); rr(g, 50, 42, 20, 44, 5); g.fill(); for (const [y, col] of [[51, '#e53935'], [64, '#ffb300'], [77, '#43a047']]) { g.fillStyle = col; g.beginPath(); g.arc(60, y, 5, 0, 7); g.fill(); } }
  else if (kind === 'junction') { tri(); g.fillRect(55, 40, 10, 48); g.fillRect(36, 58, 48, 10); }
  else if (kind === 'narrow') { tri(); g.fillRect(44, 40, 8, 50); g.beginPath(); g.moveTo(76, 40); g.lineTo(84, 40); g.lineTo(76, 66); g.lineTo(76, 90); g.lineTo(68, 90); g.lineTo(68, 64); g.closePath(); g.fill(); }
  else if (kind === 'nohorn') { ring(); g.beginPath(); g.moveTo(36, 50); g.lineTo(52, 50); g.lineTo(80, 34); g.lineTo(80, 78); g.lineTo(52, 62); g.lineTo(36, 62); g.closePath(); g.fill();
    g.strokeStyle = '#d32f2f'; g.lineWidth = 9; g.beginPath(); g.moveTo(24, 20); g.lineTo(96, 92); g.stroke(); }
  else if (kind === 'keepleft') { g.fillStyle = '#1565c0'; g.beginPath(); g.arc(60, 56, 52, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(80, 30); g.lineTo(42, 76); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(28, 90); g.lineTo(34, 58); g.lineTo(58, 82); g.closePath(); g.fill(); }
  else { ring(); g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.fillText(kind.slice(5), 60, 72); } // limit40 / limit50 / limit60
  return c;
}
function makeSignal() {
  const c = mk(90, 320), g = c.getContext('2d');
  g.fillStyle = '#3b3f45'; g.fillRect(40, 110, 10, 210);
  g.fillStyle = '#16181b'; rr(g, 22, 4, 46, 112, 10); g.fill();
  for (const [y, col] of [[26, '#e53935'], [60, '#ffb300'], [94, '#43a047']]) { g.fillStyle = col; g.beginPath(); g.arc(45, y, 13, 0, 7); g.fill(); }
  return c;
}
function makeCop() {
  const c = mk(90, 200), g = c.getContext('2d');
  g.fillStyle = '#5d4b2a'; g.fillRect(30, 120, 12, 74); g.fillRect(48, 120, 12, 74);   // khaki trousers
  g.fillStyle = '#f4f4f4'; rr(g, 24, 62, 42, 64, 8); g.fill();                         // white shirt
  g.fillStyle = '#8d5524'; g.beginPath(); g.arc(45, 46, 15, 0, 7); g.fill();
  g.fillStyle = '#f4f4f4'; g.fillRect(28, 24, 34, 12); g.fillRect(24, 34, 42, 5);       // cap
  g.fillStyle = '#f4f4f4'; g.save(); g.translate(64, 70); g.rotate(-1.1); g.fillRect(0, -6, 44, 12); g.restore(); // raised arm
  g.fillStyle = '#111'; g.fillRect(24, 116, 42, 6);
  return c;
}

function makeArch() {
  const c = mk(640, 320), g = c.getContext('2d');
  for (const x of [0, 596]) {
    g.fillStyle = '#b71c1c'; g.fillRect(x, 40, 44, 280);
    g.fillStyle = '#ffca28'; for (let y = 60; y < 320; y += 40) g.fillRect(x + 6, y, 32, 14);
  }
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 20, 640, 80);
  for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { if ((i + j) % 2) { g.fillStyle = '#fff'; g.fillRect(i * 20, 20 + j * 12, 20, 12); } }
  g.fillStyle = '#ff6f00'; g.fillRect(0, 44, 640, 56);
  g.fillStyle = '#fff'; g.font = 'bold 42px Impact, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('START · FINISH', 320, 73);
  for (let s = 0; s < 4; s++) for (let i = 0; i <= 12; i++) {
    const t = i / 12; g.fillStyle = i % 2 ? '#ffb300' : '#ff6f00';
    ell(g, 44 + s * 138 + t * 138, 104 + Math.sin(t * Math.PI) * 30, 6, 6); g.fill();
  }
  return c;
}

// ---- skyline painting kit: each city's painters (web/cities/<id>/skyline.js) draw two parallax layers with it
const LAYER_W = 1920; // a layer tiles horizontally at this width
function litWindows(g, r, x, y, w, h, amount, color = '255,214,130') {
  if (amount <= 0) return;
  for (let wy = y + 6; wy < y + h - 6; wy += 9) for (let wx = x + 4; wx < x + w - 5; wx += 7)
    if (r() < amount) { g.fillStyle = `rgba(${color},${0.45 + r() * 0.5})`; g.fillRect(wx, wy, 3, 4); }
}
const cutOut = (g, fn) => { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; fn(); g.fill(); g.restore(); };
const archPath = (g, x, y, w, h) => { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); };
const onion = (g, cx, y, rad) => { g.beginPath(); g.moveTo(cx - rad, y); g.bezierCurveTo(cx - rad * 1.3, y - rad * 1.1, cx - rad * 0.2, y - rad * 1.4, cx, y - rad * 2); g.bezierCurveTo(cx + rad * 0.2, y - rad * 1.4, cx + rad * 1.3, y - rad * 1.1, cx + rad, y); g.fill(); };
function fillerBlocks(g, r, t, col, base, from, to, minH, maxH, skip = [], lit = 1) {
  for (let x = from; x < to;) {
    const w = 26 + r() * 44;
    if (!skip.some(([a, b]) => x + w > a && x < b)) { const bh = minH + r() * (maxH - minH); g.fillStyle = col; g.fillRect(x, base - bh, w, bh + 40); litWindows(g, r, x, base - bh, w, bh, t.lights * lit); }
    x += w + 2 + r() * 10;
  }
}
function trees(g, r, col, base, from, to, n) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) { const x = from + r() * (to - from), rad = 10 + r() * 14; ell(g, x, base - rad * 0.6, rad * 1.3, rad); g.fill(); }
}
function waterBand(g, r, t, base, h, lights) {
  g.fillStyle = t.sea; g.fillRect(0, base + 6, LAYER_W, h - base);
  g.fillStyle = 'rgba(255,255,255,.2)'; for (let i = 0; i < 90; i++) g.fillRect(r() * LAYER_W, base + 10 + r() * (h - base - 14), 6 + r() * 16, 1);
  if (lights) { g.fillStyle = 'rgba(255,214,120,.9)'; for (let x = 4; x < LAYER_W; x += 14) g.fillRect(x, base + 3, 3, 3); }
}

const PAINT = { mk, ell, rr, shade, lerp, mulberry32, LAYER_W, litWindows, fillerBlocks, trees, waterBand, cutOut, archPath, onion };

// Indian street dogs: side view (trotting, 2 frames), rear view (chasing, 2 frames), curled up asleep.
const DOG_COATS = [
  { body: '#c8955a', belly: '#ecca98', dark: '#9c6c3a' },
  { body: '#2e2a28', belly: '#4a4440', dark: '#1a1716' },
  { body: '#ece4d4', belly: '#ffffff', dark: '#c9bca5', spots: '#8a5a3a' },
];
function makeDogSide(coat, frame) {
  const c = mk(200, 136), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 100, 126, 66, 6); g.fill();
  const angles = frame ? [-0.22, 0.26, -0.26, 0.22] : [0.36, -0.26, 0.3, -0.32];
  g.lineCap = 'round';
  [[132, coat.dark], [60, coat.dark], [146, coat.body], [74, coat.body]].forEach(([bx, col], i) => {
    const a = angles[i]; g.strokeStyle = col; g.lineWidth = 9;
    g.beginPath(); g.moveTo(bx, 80); g.lineTo(bx + Math.sin(a) * 22, 100); g.lineTo(bx + Math.sin(a) * 30, 121); g.stroke();
  });
  // curled tail over the back
  g.strokeStyle = coat.body; g.lineWidth = 8;
  g.beginPath(); g.moveTo(52, 66); g.quadraticCurveTo(30, 40, 50, 30); g.quadraticCurveTo(64, 26, 60, 44); g.stroke();
  g.fillStyle = coat.body; ell(g, 100, 72, 54, 21); g.fill();
  g.fillStyle = coat.belly; ell(g, 104, 84, 40, 8); g.fill();
  if (coat.spots) { g.fillStyle = coat.spots; ell(g, 84, 64, 16, 11); g.fill(); ell(g, 118, 70, 9, 7); g.fill(); }
  // neck, head, pointed ears, snout
  g.fillStyle = coat.body; g.beginPath(); g.moveTo(136, 60); g.lineTo(150, 38); g.lineTo(170, 52); g.lineTo(150, 82); g.closePath(); g.fill();
  ell(g, 160, 46, 18, 14); g.fill();
  g.fillStyle = coat.dark; g.beginPath(); g.moveTo(148, 38); g.lineTo(154, 12); g.lineTo(165, 34); g.closePath(); g.fill();
  g.fillStyle = coat.body; g.beginPath(); g.moveTo(152, 36); g.lineTo(156, 18); g.lineTo(162, 34); g.closePath(); g.fill();
  g.fillStyle = coat.belly; ell(g, 178, 54, 13, 7, 0.15); g.fill();
  g.fillStyle = '#111'; ell(g, 190, 52, 4, 3.5); g.fill(); ell(g, 166, 42, 2.6, 2.6); g.fill();
  return c;
}
function makeDogRear(coat, frame) {
  const c = mk(110, 132), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 55, 126, 34, 5); g.fill();
  g.lineCap = 'round'; g.strokeStyle = coat.dark; g.lineWidth = 12;
  g.beginPath(); g.moveTo(40, 86); g.lineTo(38, frame ? 110 : 122); g.stroke();
  g.beginPath(); g.moveTo(70, 86); g.lineTo(72, frame ? 122 : 110); g.stroke();
  g.fillStyle = coat.body; ell(g, 55, 36, 17, 15); g.fill();
  g.fillStyle = coat.dark;
  g.beginPath(); g.moveTo(40, 32); g.lineTo(42, 8); g.lineTo(52, 26); g.fill();
  g.beginPath(); g.moveTo(70, 32); g.lineTo(68, 8); g.lineTo(58, 26); g.fill();
  g.fillStyle = coat.body; ell(g, 55, 72, 27, 28); g.fill();
  if (coat.spots) { g.fillStyle = coat.spots; ell(g, 46, 66, 11, 13); g.fill(); }
  g.strokeStyle = coat.body; g.lineWidth = 8;
  g.beginPath(); g.moveTo(55, 52); g.quadraticCurveTo(frame ? 76 : 36, 34, 55, 24); g.stroke();
  return c;
}
function makeDogSleep(coat) {
  const c = mk(190, 84), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.25)'; ell(g, 95, 76, 78, 7); g.fill();
  g.fillStyle = coat.body; ell(g, 90, 56, 62, 20); g.fill();
  if (coat.spots) { g.fillStyle = coat.spots; ell(g, 76, 48, 18, 10); g.fill(); }
  g.fillStyle = coat.belly; ell(g, 96, 68, 46, 7); g.fill();
  g.strokeStyle = coat.body; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(32, 60); g.quadraticCurveTo(40, 80, 90, 74); g.stroke();
  g.fillStyle = coat.body; ell(g, 150, 60, 20, 13); g.fill();
  g.fillStyle = coat.belly; ell(g, 168, 64, 11, 6); g.fill();
  g.fillStyle = '#111'; ell(g, 178, 63, 3, 2.6); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(152, 56); g.lineTo(160, 57); g.stroke();
  g.fillStyle = coat.dark; g.beginPath(); g.moveTo(138, 52); g.lineTo(128, 40); g.lineTo(146, 48); g.fill();
  return c;
}

// ------------------------------------------------------------------ sprites registry
const CAR_COLORS = ['#e9e9ea', '#b71c1c', '#1f4e9c', '#9e9e9e'];
// cars on the road: the modern hatchback and the Indian classics (Maruti 800, Esteem, Ambassador incl. the
// yellow taxi, Omni van) and the Tata Ace-style mini pickup; each has its own size (nw, len) and pace
const CAR_LOOKS = [
  ...CAR_COLORS.map(color => ({ model: 'hatch', color, nw: 0.38, len: 1500, s: [0.35, 0.5], label: 'CAR' })),
  ...['#f2f2f2', '#b71c1c', '#1f4e9c', '#b0b4b8'].map(color => ({ model: 'm800', color, nw: 0.31, len: 1300, s: [0.33, 0.48], label: 'CAR' })),
  ...['#f2f2f2', '#a7adb3', '#7b1e2b'].map(color => ({ model: 'esteem', color, nw: 0.34, len: 1600, s: [0.35, 0.5], label: 'CAR' })),
  ...['#f5f5f0', '#1a1a1a', '#efe6c8', '#f2c200'].map(color => ({ model: 'amby', color, nw: 0.36, len: 1680, s: [0.3, 0.42], label: 'CAR' })),
  ...['#f2f2f2', '#7b1e2b', '#b0b4b8'].map(color => ({ model: 'omni', color, nw: 0.31, len: 1330, s: [0.3, 0.42], label: 'VAN' })),
  ...['#1565c0', '#2e7d32', '#d32f2f'].map(bed => ({ model: 'ace', color: '#f2f2f2', bed, nw: 0.33, len: 1670, s: [0.28, 0.4], label: 'MINI TRUCK' })),
];
// each city's bus liveries come from its pack (web/cities/<id>/city.js); the 3D turntable looks them up by city
const BUS_LOOKS = Object.fromEntries(RRR.cities.ids().map(id => [id, RRR.cities.get(id).busLooks]));
// tractors towing a trolley overloaded with sugarcane or a netted bale of straw (wider than the trolley)
const TRACTOR_LOOKS = [
  { color: '#c62828', crop: 'cane', pagri: '#ff8f00', rim: '#f0b400' }, { color: '#1565c0', crop: 'hay', pagri: '#fdd835', rim: '#e0e0e0' },
  { color: '#e65100', crop: 'hay', pagri: '#e53935', rim: '#f0b400' }, { color: '#2e7d32', crop: 'cane', pagri: '#fafafa', rim: '#f2c200' },
];
// two-wheelers: motorcycles and scooters in a few paints, riders in different shirts and helmets
const BIKE_LOOKS = [
  { scooter: false, color: '#c62828', shirt: '#3949ab', helmet: '#111', pillion: false },
  { scooter: true, color: '#e9e9ea', shirt: '#f06292', helmet: '#fdd835', pillion: false },
  { scooter: false, color: '#111111', shirt: '#7cb342', helmet: '#e53935', pillion: true },
  { scooter: true, color: '#1565c0', shirt: '#ffb300', helmet: '#fafafa', pillion: false },
  { scooter: false, color: '#1f4e9c', shirt: '#5d4037', helmet: '#1e88e5', pillion: false },
  { scooter: true, color: '#8e24aa', shirt: '#26a69a', helmet: '#111', pillion: true },
  // rash drivers (90s RX100 boys): no helmets, loud shirts, sometimes three to a bike
  { scooter: false, color: '#111111', shirt: '#e53935', helmet: '#1a1a1a', bare: true, pillion: true, triple: true, rash: true },
  { scooter: false, color: '#1565c0', shirt: '#fdd835', helmet: '#2b1a10', bare: true, pillion: false, rash: true },
  { scooter: false, color: '#c62828', shirt: '#26c6da', helmet: '#1a1a1a', bare: true, pillion: true, rash: true },
];
const BIKE_CALM = BIKE_LOOKS.map((l, i) => i).filter(i => !BIKE_LOOKS[i].rash), BIKE_RASH = BIKE_LOOKS.map((l, i) => i).filter(i => BIKE_LOOKS[i].rash);
const SP = {};
function buildSharedSprites() {
  SP.player = makeTuk('#1e9e4a', '#ffd21f', '#151515', 'DL 1R 4207');
  SP.rivalOf = {};
  for (const d of DRIVERS) SP.rivalOf[d.id] = makeTuk(d.look.body, d.look.trim, d.look.canopy, d.look.plate, d.look.slogan, d.look.rear);
  SP.rivals = DRIVERS.map(d => SP.rivalOf[d.id]);
  SP.cowR = makeCow(); SP.cowL = flipped(SP.cowR);
  SP.dogs = DOG_COATS.map(coat => {
    const side = [makeDogSide(coat, 0), makeDogSide(coat, 1)];
    return { right: side, left: side.map(flipped), rear: [makeDogRear(coat, 0), makeDogRear(coat, 1)], sleep: makeDogSleep(coat) };
  });
  SP.cars = CAR_COLORS.map(makeCar);
  SP.bikes = BIKE_LOOKS.map(makeBike);
  SP.carLooks = CAR_LOOKS.map(l => makeCar(l.model === 'ace' ? l.bed : l.color));
  SP.tractors = TRACTOR_LOOKS.map(makeTractor);
  SP.bus = makeBus(); SP.truck = makeTruck();
  SP.palm = makePalm(); SP.palmF = flipped(SP.palm);
  const r = mulberry32(7); SP.trees = [makeTree(r), makeTree(r), makeTree(r)];
  SP.temple = makeTemple(); SP.lampL = makeLamp(-1); SP.lampR = makeLamp(1);
  SP.chai = makeChai(); SP.cart = makeCart(); SP.milestone = makeMilestone(); SP.arch = makeArch();
  SP.signs = Object.fromEntries(['signal', 'junction', 'narrow', 'nohorn', 'keepleft', 'limit40', 'limit50', 'limit60'].map(k => [k, makeSign(k)]));
  SP.signal = makeSignal(); SP.cop = makeCop();
}

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
// traffic lights: a 22 s cycle per junction; main road green, amber, then red while the cross road goes
const LIGHT_CYCLE = 22;
const lightPhase = j => (((worldT + j.phase) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
function lightOf(j) { const t = lightPhase(j); return t < 11 ? 'G' : t < 13.5 ? 'A' : 'R'; }
const crossGo = j => { const t = lightPhase(j); return t >= 14.5 && t < 21; };

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
  if (use3D) World3D.setTrack({ segments, trackLength, theme, city: def.city.id, SP, themeSprites, CAR_COLORS, CAR_LOOKS, TRACTOR_LOOKS, BUS_LOOKS, BIKE_LOOKS, DOG_COATS, DRIVERS, attackPose, attackPoseAt, moveOf, MAX_SPEED, LANE_W, footpath: def.road.footpath });
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
  const p = a.resume(); if (p && p.catch) p.catch(err => reportError('audio', 'resume() rejected', err));
  // the tap should have started audio; if it is still not running, sound is blocked on this device
  clearTimeout(unlockCheck);
  unlockCheck = setTimeout(() => {
    if (a.state !== 'running') {
      Sfx.problem = a.state === 'interrupted' ? 'Sound paused by your phone (call, screen recording or another app): tap to resume'
        : isIOS ? 'Sound blocked: switch off silent mode, then tap again' : 'Sound blocked by the browser: tap again or check the tab isn\'t muted';
      reportError('audio', `still ${a.state} after ${e && e.type || 'gesture'}`);
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

// ------------------------------------------------------------------ gameplay helpers
function msg(text, color = '#fff', dur = 1.6) { messages.push({ text, color, t: dur, dur }); if (messages.length > 3) messages.shift(); }
function popup(text, x, y, color = '#ffeb3b', size = 34) { popups.push({ text, x, y, color, size, t: 0.9 }); }
function updateHawkers(dt) {
  hawkerT -= dt; if (hawkerT > 0) return;
  hawkerT = rand(1.6, 3.2);
  const seen = [];
  for (let n = 3; n < 60; n++) {
    const seg = segments[(findSegment(position).index + n) % segments.length];
    for (const sp of seg.sprites)
      if (sp.scr && sp.scr.frame === frameNo && sp.scr.w > 60 && sp.scr.x > 40 && sp.scr.x < W - 40 && !bubbles.some(b => b.who === sp)) seen.push({ sp, z: seg.index * SEG_LEN });
  }
  if (!seen.length) return;
  const line = pick(def.city.hawkerCalls), { sp, z } = pick(seen);
  const sx = sp.offset + Math.sign(sp.offset) * sp.nw / 2; // centre of the stall
  bubbles.push({ who: sp, text: line, t: 2.2, hawker: true });
  // sing-song street call from the stall itself (it stands still, so you hear Doppler as you drive past)
  Voice.sayLine(line, { kind: 'hawker', clipRate: rand(0.95, 1.15), owner: sp,
    where: () => ({ dz: wrapDelta(z - player.dist), x: sx, vz: 0 }) });
}
function curse(who) {
  bubbles = bubbles.filter(b => b.who !== who);
  // every driver curses in their own language and their own voice (clip "<id>|<line>"), wherever the race is;
  // a driver without lines of their own uses the city's
  const own = who.driver && who.driver.curses.length ? pick(who.driver.curses).text : null;
  const line = own || pick(def.city.curses);
  bubbles.push({ who, text: line, t: 1.7 });
  setTimeout(() => Sfx.grunt(), 120);
  Voice.sayLine(own ? `${who.driver.id}|${line}` : line, { kind: 'curse',
    owner: who, clipRate: own ? who.driver.voice.rate : who.isPlayer ? 1 : rand(0.85, 1.2),
    where: who.isPlayer ? null : () => ({ dz: who.dist - player.dist, x: who.x, vz: who.speed }) });
}
function startAttack(who, side) {
  if (who.air) return; // nobody swings in a jump
  const w = who.weapon || LATHI, dur = who.isPlayer ? 0.34 * w.cooldown : 0.34;
  who.atk = { t: 0, side, dur, at: dur * moveOf(w).at, done: false, sleeve: who.driver ? who.driver.look.shirt : null };
}

function honk() {
  if (player.hornCd > 0) return;
  player.hornCd = 0.45; Sfx.horn();
  popup('POM POM!', W / 2 + rand(-30, 30), H - 250, '#fff', 22);
  for (const c of traffic) {
    const dz = wrapDelta(c.z - player.dist);
    if (dz < 0 || dz > 3000) continue;
    if (c.type === 'cow') { c.vx = (c.x >= player.x ? 1 : -1) * 0.7; c.scared = 2.5; }
    else if (c.type === 'dog') { if (dz < 2000) setTimeout(() => Animals.barkFrom(c, 3), rand(150, 500)); if (c.mode === 'sleep' || c.mode === 'sit') { c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 0.9; } }
    else if (c.dir === 1 && Math.abs(c.x - player.x) < 0.5) c.yieldT = 1.5; // they move over when there's room
  }
}

// What flies off where a blow lands: a burst of sparks, and from a wet weapon (Bhola's gamchha) a spray of water
function impact(x, y, w, side) {
  for (let i = 0; i < 7; i++) particles.push({ x, y, vx: rand(-160, 160) + side * 90, vy: rand(-190, 40), g: 420, t: rand(0.2, 0.4), size: rand(2, 4), color: pick(['#fff3b0', '#ffd54f', '#ffffff']) });
  if (w.wet) for (let i = 0; i < 30; i++) particles.push({ x: x + rand(-14, 14), y: y + rand(-12, 12), vx: rand(-260, 260) + side * 170, vy: rand(-380, -20), g: 760, t: rand(0.5, 1), size: rand(2.4, 5.4), color: pick(['#bfe6ff', '#8fd0ff', '#e3f4ff']) });
}
function resolveAttack(att, side) {
  if (att.air) return; // (or hit from it)
  const attIsPlayer = !!att.isPlayer, w = att.weapon || LATHI;
  const targets = attIsPlayer ? rivals.filter(r => !r.ko) : [player];
  let best = null, bestDz = 1e9;
  for (const t of targets) {
    if (t === att || t.air) continue; // (no one can be hit in the air)
    if (t.isPlayer && (t.crash > 0 || t.inv > 0)) continue;
    const dz = t.dist - att.dist, dx = t.x - att.x;
    if (Math.abs(dz) < 440 && dx * side > 0.02 && Math.abs(dx) < 0.8 * w.reach && Math.abs(dz) < bestDz) { best = t; bestDz = Math.abs(dz); }
  }
  if (!best) { if (attIsPlayer) Sfx.whoosh(); return; }
  Sfx.hit(w.sound);
  const dmg = attIsPlayer ? rand(14, 22) * w.power : rand(7, 12) * w.power * (1 + round * 0.1) * (0.8 + def.rivals.skill * 0.3);
  const c = CONTACTS[w.contact] || CONTACTS.body; // a blow to the head, the body or down by the wheels
  best.health -= dmg; best.hurt = 0.3; best.x += side * c.shove; best.speed *= c.keep;
  if (attIsPlayer) best.grudgeT = 10; // some of them don't forget it
  const word = pick(w.hitWords);
  if (best.health <= 0 || Math.random() < 0.75) curse(best);
  // the spot on screen where it landed: on the side facing the attacker, at the height the weapon strikes
  const s = best.isPlayer ? (playerScr ? { x: playerScr.x, top: playerScr.top ?? playerScr.y - 190, bottom: playerScr.y, w: 170 } : { x: W / 2, top: H - 250, bottom: H - 40, w: 240 })
    : best.scr ? { x: best.scr.x, top: best.scr.y, bottom: best.scr.y + best.scr.w * (use3D ? 1.5 : 1.05), w: best.scr.w } : null;
  const hitX = s ? s.x - side * s.w * 0.42 : W / 2 + side * 200, hitY = s ? lerp(s.bottom, s.top, c.up) : H - 300;
  impact(hitX, hitY, w, side);
  if (best.isPlayer) { popup(word, hitX + side * 40, hitY - 26, '#ff5252', 38); shake = Math.max(shake, 0.25);
    if (best.health <= 0) crashPlayer('KNOCKED OUT!', 0, side); }
  else {
    popup(word, hitX, hitY - 26, '#ffeb3b', 40);
    if (best.health <= 0) {
      best.ko = 4.5; best.koBy = 'player'; best.koDir = side; player.kos++;
      Sfx.ko(); msg(`${best.name} KNOCKED OUT!  +${fmtCash(100)}`, '#ffeb3b');
    }
  }
}

// lay a tyre mark under each rear wheel from where it was last frame to where it is now
function layTyreMarks() {
  const a = bodyAngle(), f = [Math.cos(a), Math.sin(a)], r = [-Math.sin(a), Math.cos(a)]; // forward / right, as (dist, world x)
  const now = [-1, 1].map(k => ({ d: player.dist - 340 * f[0] + k * 240 * r[0], x: (player.x * ROAD_W - 340 * f[1] + k * 240 * r[1]) / ROAD_W }));
  if (player.markAt) for (let k = 0; k < 2; k++) {
    const was = player.markAt[k];
    if (Math.abs(now[k].d - was.d) < 600) skidMarks.push({ d1: was.d, x1: was.x, d2: now[k].d, x2: now[k].x, t: worldT });
  }
  player.markAt = now;
  if (skidMarks.length > 700) skidMarks.splice(0, skidMarks.length - 700);
}
function crashPlayer(reason, dmg, dir) {
  if (player.crash > 0) return;
  player.crash = 2.4; player.crashDir = dir || (Math.random() < 0.5 ? -1 : 1);
  player.health = Math.max(0, player.health - dmg); player.atk = null;
  player.drift = 0; player.driftT = 0; player.driftPts = 0; player.boostT = 0; if (stats) stats.breakChain();
  player.air = null; player.y = 0;
  Sfx.crash(); shake = 0.6; msg(reason, '#ff5252', 2);
  for (let i = 0; i < 18; i++) particles.push({ x: W / 2 + rand(-60, 60), y: H - 80, vx: rand(-200, 200), vy: rand(-260, -60), t: rand(0.5, 1), size: rand(3, 7), color: pick(['#ffd54f', '#bdbdbd', '#795548', '#ff7043']), g: 500 });
}
// a knock from traffic: it costs a little health, and running out knocks you out (like a lathi hit)
function bumpPlayer(dmg, dir) {
  player.health = Math.max(0, player.health - dmg); Sfx.bump();
  if (player.health <= 0) crashPlayer('KNOCKED OUT!', 0, dir);
}

// ------------------------------------------------------------------ update
let lastBeep = 4;
function update(dt) {
  worldT += dt;
  for (const m of messages) m.t -= dt; messages = messages.filter(m => m.t > 0);
  for (const p of popups) { p.t -= dt; p.y -= 30 * dt; } popups = popups.filter(p => p.t > 0);
  for (const b of bubbles) b.t -= dt; bubbles = bubbles.filter(b => b.t > 0);
  for (const p of particles) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; } particles = particles.filter(p => p.t > 0);
  shake = Math.max(0, shake - dt);
  guard('audio', () => VehicleAudio.updateVehicles(dt));
  guard('voices', () => VoiceClips.updateClips());
  guard('audio', () => Animals.updateAnimals(dt));

  if (state === 'title' || state === 'champion') { guard('race-rules', () => updateAttract(dt)); return; }
  if (state === 'countdown') {
    countdown -= dt;
    const c = Math.ceil(countdown);
    if (c < lastBeep) { lastBeep = c; if (c > 0) Sfx.beep(false); }
    if (countdown <= 0) { state = 'race'; Sfx.beep(true); msg('CHALO!', '#ffeb3b', 1.2); }
    guard('traffic', () => updateTraffic(dt)); guard('audio', updateEngine);
    return;
  }
  if (state === 'race' || state === 'finished' || state === 'results') {
    if (state === 'race') raceTime += dt;
    guard('player-physics', () => updatePlayer(dt, state === 'race'));
    guard('rivals-combat', () => updateRivals(dt));
    guard('traffic', () => updateTraffic(dt));
    guard('traffic', () => updateCross(dt));
    guard('rivals-combat', separateRivals);
    if (state === 'race') guard('player-physics', checkCollisions);
    guard('player-physics', settleLanding);
    if (state === 'race') guard('player-physics', () => updateClosePasses(dt));
    guard('hawkers', () => updateHawkers(dt));
    guard('race-rules', () => {
      checkFinish();
      if (state === 'finished') { finishTimer -= dt; if (finishTimer <= 0) buildResults(); }
    });
    guard('audio', updateEngine);
  }
}

function updateEngine() {
  const racing = state === 'race' || state === 'countdown';
  const throttle = racing && player.crash <= 0 ? (I.up() ? 1 : 0) : (state === 'finished' ? 0.3 : 0.15);
  Sfx.setEngine(player.speed / MAX_SPEED, state !== 'title' && state !== 'champion', throttle);
  const sliding = state === 'race' && player.crash <= 0 && !player.air && player.speed > DRIFT_END * 0.8;
  Sfx.squeal(sliding ? clamp(Math.abs(player.slip || 0) / DRIFT_SLIP, 0, 1) : 0);
  DriftMusic.update(state === 'race' && player.crash <= 0 && !!player.drift);
}

function updatePlayer(dt, controlled) {
  const seg = findSegment(player.dist), x0 = player.x;
  const sp = player.speed / MAX_SPEED;
  const dx = dt * 2 * sp;
  let steer = 0, acc = false, brk = false, hand = false;
  if (controlled) { steer = (I.right() ? 1 : 0) - (I.left() ? 1 : 0); acc = I.up(); brk = I.down(); hand = I.hand(); }
  else { acc = player.speed < MAX_SPEED * 0.45; steer = clamp((clamp((laneX(1, 0) - player.x) * 0.8, -0.3, 0.3) - player.heading) * 4, -1, 1); }
  player.steer = lerp(player.steer, steer, Math.min(1, dt * 10));
  player.hornCd -= dt; player.inv -= dt; player.hurt -= dt;

  if (player.atk) { player.atk.t += dt; if (!player.atk.done && player.atk.t > player.atk.at) { player.atk.done = true; resolveAttack(player, player.atk.side); } if (player.atk.t > player.atk.dur) player.atk = null; }

  const flying = !!player.air, wrecked = player.crash > 0; // as the frame began: no kerb is charged on the frame a jump lands or a wreck is put back on the road
  if (player.air) {
    // in the air: no steering, throttle or grip. The auto keeps the sideways speed it left the ground with
    // (see takeOff), so it flies on along the line it was driving
    const a = player.air; a.t += dt;
    player.x += a.vx * dt;
    player.y = FP.heightAt(a, a.t);
    if (!a.over) a.over = traffic.some(c => c.type !== 'cow' && c.type !== 'dog' && Math.abs(wrapDelta(c.z - player.dist)) < ((c.len || 0) + TUK_LEN) / 2 && overlap(player.x, TUK_NW, c.x, c.nw));
    // over a cross-road vehicle at a junction: a flyover wherever the auto comes down
    if (!a.overCross) a.overCross = crossTraffic.some(c => Math.abs(wrapDelta(c.z - player.dist)) < (c.nw * ROAD_W + TUK_LEN) / 2 && Math.abs(player.x - c.x) < (c.lenX + TUK_NW) / 2);
    if (a.t >= a.airTime) landPlayer();
  } else if (player.crash > 0) {
    player.crash -= dt;
    player.speed = Math.max(0, player.speed - player.speed * 2.5 * dt - 1500 * dt);
    player.rot = lerp(player.rot, player.crashDir * 1.45, Math.min(1, dt * 7));
    player.x += player.crashDir * dt * 0.35 * sp;
    if (player.crash <= 0) {
      player.rot = 0; player.lean = 0; player.tip = 0; player.speed = 0; player.heading = 0; player.slip = 0; player.drift = 0; player.x = clamp(player.x, -halfAt(player.dist) + 0.3, -0.3);
      if (player.health <= 0) player.health = 60;
      player.inv = 1.5; msg('BACK ON THE ROAD!', '#8bc34a', 1.2);
    }
  } else {
    // heading: pivot almost on the spot when slow, gentle at speed; straightens up as you drive off
    const slow = player.speed < PIVOT_SPEED;
    const maxH = MAX_PIVOT + (MAX_RACE_HEADING - MAX_PIVOT) * clamp((player.speed - PIVOT_SPEED) / (MAX_SPEED * 0.25), 0, 1);
    if (steer) {
      const rate = slow ? (player.speed < 60 ? 2.2 : 3.2) : 2.0;   // ~90 degrees in half a second when creeping
      player.heading = clamp(player.heading + steer * rate * dt, -maxH, maxH);
    } else if (acc || player.speed > PIVOT_SPEED) player.heading *= Math.exp(-(0.8 + 3 * sp) * dt);
    if (Math.abs(player.heading) > maxH) player.heading += (Math.sign(player.heading) * maxH - player.heading) * Math.min(1, dt * 4);
    player.x += player.speed * Math.sin(player.heading) * dt / ROAD_W;  // the sideways part of where you're heading
    // a drift into the bend carries the auto round it: on drift tracks less of the bend's outward push gets through
    const grip = player.drift && player.drift === Math.sign(seg.curve) ? def.handling.driftGrip : 1;
    player.x -= dx * sp * seg.curve * CENTRIFUGAL * grip;
    if (acc) player.speed += ACCEL * dt; else if (brk) player.speed += BRAKE * dt; else player.speed += DECEL * dt;
    if (hand) player.speed += BRAKE * 0.5 * dt; // handbrake: rear wheels locked
    // drift: steer + brake tap at speed kicks the back out; the body slides at an angle while you keep going
    const tap = brk && !player.brkWas; player.brkWas = brk;
    // a brake tap or the handbrake (Space) kicks the back out
    if (!player.drift && steer && (tap || hand) && player.speed > DRIFT_MIN) { player.drift = Math.sign(steer); Sfx.noise(0.25, 0.25, 2500); }
    if (player.drift && (!steer || Math.sign(steer) !== player.drift || player.speed < DRIFT_END)) endDrift();
    player.slip += (player.drift * DRIFT_SLIP - player.slip) * Math.min(1, dt * (player.drift ? 3.5 : 6));
    if (player.drift) {
      player.speed -= player.speed * def.handling.driftScrub * dt;   // tyres scrubbing
      // only a slide into a bend counts: weaving on a straight earns no points and no exit boost
      if (player.drift === Math.sign(seg.curve) && Math.abs(seg.curve) >= DRIFT_BEND) {
        player.driftT += dt;
        if (controlled && player.speed > DRIFT_END) player.driftPts += stats.drift(dt, player.speed / MAX_SPEED, Math.abs(player.slip) / DRIFT_SLIP);
      }
    }
    if (Math.abs(player.slip) > 0.12 && player.speed > DRIFT_END * 0.8) layTyreMarks();
    else player.markAt = null;
    if (zoneOf(seg, player.x) === 'grass') {
      if (player.speed > OFFROAD_LIMIT) player.speed += OFFROAD_DECEL * dt;
      if (Math.random() < sp * 0.8) particles.push({ x: (playerScr ? playerScr.x : W / 2) + rand(-100, 100), y: playerScr ? playerScr.y - 6 : H - 30, vx: rand(-60, 60), vy: rand(-80, -20), t: 0.6, size: rand(6, 12), color: 'rgba(160,120,70,.6)' });
    }
    // three wheels are tippy: lateral load from curves + steering
    const lat = sp * sp * (seg.curve / 6 * 0.85 + player.steer * 0.38) * (player.drift ? 0.15 : 1); // a slide unloads the wheels
    player.lean = lerp(player.lean, -lat, Math.min(1, dt * 5));
    if (Math.abs(player.lean) > 0.95) {
      player.tip += dt;
      if (player.tip > 0.7) crashPlayer('TIPPED OVER!', 15, Math.sign(player.lean));
    } else player.tip = Math.max(0, player.tip - dt * 1.5);
    const wobble = player.tip > 0 ? Math.sin(performance.now() / 40) * 0.05 : 0;
    player.rot = player.lean * 0.2 + wobble + (player.atk ? player.atk.side * 0.04 : 0);
  }
  const edge = seg.half + 1.8 + FP.furnitureShift(footpath()); // the building line, as far out as you can go: a footpath moves it out
  player.x = clamp(player.x, -edge, edge);
  // the kerb: climbing onto the footpath or dropping off it costs speed (not in the air, and not at a junction,
  // where the footpath is at road level)
  if (!flying && !wrecked && player.crash <= 0) { const k = FP.kerbCrossing(seg.half, footpath(), x0, player.x, !!seg.junction); if (k) hitKerb(k); }
  // top speed is the style's, raised for a moment by a boost (a drift exit or a slipstream); above it, speed bleeds off
  player.boostT -= dt;
  const cap = MAX_SPEED * def.handling.topSpeed * (1 + (player.boostT > 0 ? player.boost : 0));
  player.speed = clamp(player.speed, 0, Math.max(cap, player.speed - MAX_SPEED * 0.5 * dt));
  const move = player.speed * Math.cos(player.crash > 0 ? 0 : player.heading) * dt; // the down-the-road part
  player.dist += move;
  position = ((player.dist - PLAYER_Z) % trackLength + trackLength) % trackLength;
  const segDelta = move / SEG_LEN;
  skyOffset = (skyOffset + 0.0006 * seg.curve * segDelta + 1) % 1;
  farOffset = (farOffset + 0.0012 * seg.curve * segDelta + 1) % 1;
  nearOffset = (nearOffset + 0.0022 * seg.curve * segDelta + 1) % 1;
  // exhaust (2D only: in 3D the smoke is in the world, see world3d.js)
  player.puff -= dt;
  if (!use3D && player.puff <= 0 && player.crash <= 0) { player.puff = 0.07 + (1 - sp) * 0.08; particles.push({ x: playerScr ? playerScr.x + (playerScr.y - playerScr.top) * 0.3 : W / 2 + 75, y: playerScr ? playerScr.y - 18 : H - 50, vx: rand(10, 40), vy: rand(-50, -20), t: 0.7, size: rand(4, 8), color: 'rgba(200,200,200,.35)', grow: 16 }); }
}

// A drift ends: its points pop up, and one held for DRIFT_HOLD seconds kicks the auto forward on tracks whose
// style gives a drift-exit boost.
const DRIFT_HOLD = 0.6, DRIFT_BEND = 1, BOOST_SECS = 1.2; // seconds · the least road curve that counts as a bend · seconds
function endDrift() {
  if (player.driftPts >= 10) popup(`DRIFT +${Math.round(player.driftPts)}`, W / 2, H - 250, '#ffd21f', 28);
  if (player.driftT >= DRIFT_HOLD && def.handling.driftExitBoost > 0) { player.boost = def.handling.driftExitBoost; player.boostT = BOOST_SECS; Sfx.whoosh(); }
  player.drift = 0; player.driftT = 0; player.driftPts = 0;
}

// The kerb: a jolt, and a share of your speed (more going up than coming down).
function hitKerb(way) {
  const fp = footpath();
  player.speed *= 1 - (way === 'climb' ? fp.climbLoss : fp.dropLoss);
  shake = Math.max(shake, 0.12); Sfx.bump();
}
// Off the end of a cart: the flight is set by the speed, and its direction by the way the auto was going.
function takeOff() {
  // the sideways speed it leaves the ground with, as on its last moment of driving: where it is pointing, less
  // the bend's push. Holding the footpath round a bend that is nothing, so the jump comes down on the footpath;
  // steering at the road it is the heading's, so the jump goes out over the lanes
  const seg = findSegment(player.dist), sp = player.speed / MAX_SPEED;
  const grip = player.drift && player.drift === Math.sign(seg.curve) ? def.handling.driftGrip : 1;
  const vx = player.speed * Math.sin(player.heading) / ROAD_W - 2 * sp * sp * seg.curve * CENTRIFUGAL * grip;
  if (player.drift) endDrift();
  player.air = { ...FP.jump(sp), t: 0, vx, over: false, fromPath: zoneOf(seg, player.x) === 'footpath' };
  player.lean = 0; player.tip = 0; player.rot = 0;
  Sfx.whoosh();
}
// Back down: on top of a vehicle or a cow it's a crash; otherwise the landing is noted for settleLanding. A jump
// that left the footpath, passed over a vehicle and came down in the road is a flyover, as is one over a junction's cross traffic.
function landPlayer() {
  const a = player.air, seg = findSegment(player.dist);
  player.air = null; player.y = 0; player.speed *= 1 - FP.JUMP.landLoss; shake = Math.max(shake, 0.2); Sfx.bump();
  for (const c of traffic) {
    if (c.type === 'dog' || Math.abs(wrapDelta(c.z - player.dist)) >= ((c.len || 0) + TUK_LEN) / 2 || !overlap(player.x, playerW(), c.x, c.nw)) continue;
    crashPlayer(`LANDED ON A ${c.label}!`, 25); player.speed = 0; return;
  }
  player.landed = { flyover: a.fromPath && (a.overCross || a.over && zoneOf(seg, player.x) === 'road') };
}
// The jump counts once the landing has held: coming down on something at the roadside is a wreck in this same
// frame's collision check, and a jump that ends in a crash doesn't count.
function settleLanding() {
  const l = player.landed; if (!l) return;
  player.landed = null; if (player.crash > 0) return;
  stats.jump(l.flyover);
  popup(l.flyover ? 'FLYOVER!' : 'JUMP!', W / 2, H - 260, l.flyover ? '#80deea' : '#ffd21f', 30);
}

// Lane surfing: overtaking same-way traffic with little room to spare is a close pass. Each one counts in the
// race's stats; on tracks whose style has a slipstream it also raises your top speed for a moment, more for
// each pass in a quick chain.
const CLOSE_GAP = 0.15, PASS_AGAIN = 5, PASS_MIN_SPEED = MAX_SPEED * 0.1; // road units between the two bodies · seconds before the same vehicle counts again · slower vehicles (a queue) don't count
function updateClosePasses(dt) {
  stats.advance(dt);
  for (const c of traffic) {
    if (c.dir !== 1) continue; // cows, dogs and oncoming traffic don't count
    const dz = wrapDelta(c.z - player.dist), was = c.passDz;
    c.passDz = dz; if (c.passCd > 0) c.passCd -= dt;
    // it was just ahead and now it isn't (a jump from far ahead is the lap wrapping round, not a pass)
    if (!(was > 0 && was < 2000 && dz <= 0) || c.passCd > 0 || player.crash > 0 || player.air || player.speed <= c.speed || c.speed < PASS_MIN_SPEED) continue;
    const gap = Math.abs(c.x - player.x) - (c.nw + playerW()) / 2;
    if (gap < 0 || gap > CLOSE_GAP) continue;
    c.passCd = PASS_AGAIN;
    const chain = stats.closePass();
    if (def.handling.slipstream > 0) { player.boost = def.handling.slipstream * chain; player.boostT = RRR.RaceStats.CHAIN_SECS; }
    popup(chain > 1 ? `CLOSE! \u00d7${chain}` : 'CLOSE!', W / 2 + Math.sign(c.x - player.x) * 150, H - 230, '#80deea', 26);
    Sfx.whoosh();
  }
}

const WRONG_SIDE_X = laneX(-1, 0), PASS_TIME = 2.2; // the oncoming lane by the centre line; seconds a pass takes
// is anything standing on our side's footpath (a cart ramp or a stall) within n segments ahead of segment i?
const pathBlocked = (i, n) => { for (let k = 0; k <= n; k++) if (segments[(i + k) % segments.length].solids.some(q => q.onPath && q.offset < 0)) return true; return false; };
function updateRivals(dt) {
  for (const r of rivals) {
    const seg = findSegment(r.dist);
    const st = r.style, wp = r.weapon;
    r.hurt -= dt; r.grudgeT -= dt;
    if (state === 'race' || state === 'finished' || state === 'results') { if (r.delay > 0) { r.delay -= dt; continue; } }
    if (r.atk) { r.atk.t += dt; if (!r.atk.done && r.atk.t > r.atk.at) { r.atk.done = true; resolveAttack(r, r.atk.side); } if (r.atk.t > r.atk.dur) r.atk = null; }
    if (r.ko > 0) {
      r.path = false; r.ko -= dt; r.speed = Math.max(0, r.speed - r.speed * 3 * dt - 2000 * dt);
      r.rot = lerp(r.rot, (r.koDir || 1) * 1.45, Math.min(1, dt * 7));
      if (r.x > -0.2) r.x = lerp(r.x, -0.2, Math.min(1, dt * 2)); // a wreck on the wrong side skids back towards its own
      if (r.ko <= 0) { r.health = 55; r.rot = 0; r.x = clamp(r.x, -halfAt(r.dist) + 0.3, -0.3); }
      r.dist += r.speed * dt; continue;
    }
    r.rot = lerp(r.rot, 0, Math.min(1, dt * 8));
    if (r.air) { // off a cart: straight along the footpath until it comes down
      r.air.t += dt; r.y = FP.heightAt(r.air, r.air.t); r.dist += r.speed * dt;
      if (r.air.t >= r.air.airTime) { r.air = null; r.y = 0; r.speed *= 1 - FP.JUMP.landLoss; }
      continue;
    }
    const dz = r.dist - player.dist;
    let target = r.top * (1 - st.bends * Math.abs(seg.curve) / 6);
    if (dz < -2500) target *= 1.1; else if (dz > 6000) target *= 0.92;
    const engaged = !r.finished && !player.finished && player.crash <= 0 && Math.abs(dz) < st.chase;
    if (engaged) target = clamp(player.speed + (dz < 0 ? 700 : -250), MAX_SPEED * 0.3, r.top * 1.03);
    if (r.out) target = Math.max(target, r.top * 1.03); // out on the wrong side: flat out, to get it over with
    if (r.path) target = Math.max(target, r.top);       // up on the footpath: nothing in the way
    if (r.finished) target = MAX_SPEED * 0.35;
    r.speed += clamp(target - r.speed, -MAX_SPEED * 0.6 * dt, MAX_SPEED / 5 * dt);

    // steering: avoid traffic, otherwise chase player or keep lane
    let tx = r.laneX;
    r.laneT -= dt; if (r.laneT <= 0) { r.laneT = rand(st.weave[0], st.weave[1]); r.laneX = laneX(1, Math.floor(Math.random() * seg.lanes)); }
    let rMin = -seg.half + 0.2, rMax = -0.15; // rivals keep to our side of the centre line (the daring: see below)
    if (engaged) tx = player.x + (r.x >= player.x ? 1 : -1) * 0.4;
    let nearest = null, nd = 1800, meet = 1e9, roomBack = true, roomOuter = true;
    for (const c of traffic) {
      const reach = use3D ? (c.len || 0) / 2 + TUK_LEN / 2 : 0, gapZ = wrapDelta(c.z - r.dist) - reach; // bumper-to-bumper gap
      if (c.dir === -1) { // oncoming: seconds until the nearest one in the lane by the centre line reaches us
        if (gapZ > -2 * reach - 200 && Math.abs(c.x - WRONG_SIDE_X) < (r.nw + c.nw) / 2 + 0.12) meet = Math.min(meet, Math.max(0, gapZ) / (r.speed + c.speed + 1));
        continue;
      }
      if (gapZ > -2 * reach && gapZ < nd && Math.abs(c.x - r.x) < (r.nw + c.nw) / 2 + 0.1) { nearest = c; nd = gapZ; }
      // anything alongside or just ahead in our inner lane: no room to pull back in yet
      if (gapZ > -2 * reach - 300 && gapZ < 500 && c.x + (r.nw + c.nw) / 2 + 0.05 > laneX(1, 0)) roomBack = false;
      // ... or in the outer lane: no room to come down off the footpath yet
      if (gapZ > -2 * reach - 300 && gapZ < 500 && Math.abs(c.x - laneX(1, seg.lanes - 1)) < (r.nw + c.nw) / 2 + 0.05) roomOuter = false;
    }
    // A daring driver held up by traffic pulls out onto the oncoming side to get past, if the gap in what's coming
    // looks big enough to them (the more daring, the smaller the gap they'll take). They dive back once there's
    // room, or when something is nearly on them. They don't always make it.
    const daring = st.daring || 0;
    r.outCd -= dt;
    if (r.out) {
      r.outT += dt;
      const coming = meet < lerp(1.0, 0.4, daring); // the more daring leave it later
      if (roomBack && (r.outT > 0.6 || coming) || r.outT > 7 || r.finished) { r.out = false; r.outCd = rand(1.5, 4); r.laneX = laneX(1, 0); }
      else if (coming) r.speed = Math.max(0, r.speed - MAX_SPEED * 0.9 * dt); // boxed in with something coming: stand on the brakes and hope
    } else if (r.path) {
      // up on the footpath: back to the road once there's room in the outer lane, or when it has gone on long
      // enough; a cart coming up that it is too slow to jump from sends it back down early
      r.pathT += dt;
      const tooSlow = r.speed / MAX_SPEED < FP.JUMP.minSpeed + 0.05 && pathBlocked(seg.index, 14);
      const clear = !pathBlocked(seg.index, 30); // not just before a cart: it could not get off the footpath in time
      if ((roomOuter && r.pathT > 1.5 || r.pathT > 8 || r.finished) && clear || tooSlow) { r.path = false; r.outCd = rand(1.5, 4); r.laneX = laneX(1, seg.lanes - 1); }
    } else if (daring > 0 && nearest && nd < 800 && r.outCd <= 0 && !r.finished && r.speed > MAX_SPEED * 0.25) {
      // the footpath, if the track has one and it is clear for as far as getting across to it (1.3 a second) and
      // lined up takes (the more daring, the more often); else the oncoming side
      const reachPath = () => 25 + Math.ceil(Math.abs(r.x + FP.centre(seg.half, footpath())) / 1.3 * r.speed / SEG_LEN);
      if (footpath() && Math.random() < 0.5 * daring && !pathBlocked(seg.index, reachPath())) { r.path = true; r.pathT = 0; }
      else if (meet > PASS_TIME * lerp(1.5, 0.6, daring)) { r.out = true; r.outT = 0; } else r.outCd = 0.5; // not now: look again in a moment
    }
    if (r.path) { tx = -FP.centre(seg.half, footpath()); rMin = tx; }
    else if (r.out) { tx = WRONG_SIDE_X; rMax = WRONG_SIDE_X; }
    else if (nearest) {
      const gap = (r.nw + nearest.nw) / 2 + lerp(0.22, 0.1, st.nerve); // the nervier, the closer they shave it
      let side = r.x >= nearest.x ? 1 : -1;
      const nx = nearest.x + side * gap; if (nx < rMin || nx > rMax) side = -side;
      tx = nearest.x + side * gap;
      if (nd < lerp(450, 200, st.nerve) && nd > -150) r.speed = Math.min(r.speed, nearest.speed + 400);
    }
    tx = clamp(tx, rMin, rMax);
    const xWas = r.x;
    r.x += clamp(tx - r.x, -1.3 * dt, 1.3 * dt);
    r.dist += r.speed * dt;
    const kerb = FP.kerbCrossing(seg.half, footpath(), xWas, r.x, !!seg.junction);
    if (kerb) r.speed *= 1 - (kerb === 'climb' ? footpath().climbLoss : footpath().dropLoss);
    // what stands on the footpath is as solid for a rival as for you, and judged by where the rival is: a cart met
    // at its near end (two segments, as a fast auto can step over one), lined up and fast enough, is a jump
    // straight along the footpath; anything else it runs into wrecks it
    for (const q of seg.solids) {
      const qx = q.offset - q.nw / 2;
      if (!q.onPath || q.offset > 0 || !overlap(r.x, r.nw, qx, q.nw)) continue;
      if (q.kind === 'cart' && seg.index - q.seg0 <= 1 && FP.takesOff(qx, r.x, r.speed / MAX_SPEED)) { r.x = qx; r.air = { ...FP.jump(r.speed / MAX_SPEED), t: 0 }; }
      else { r.ko = 3; r.koBy = 'traffic'; r.koDir = 1; r.speed *= 0.1; r.outCd = rand(4, 8); }
      break;
    }
    if (r.x > -0.1) { // on or over the centre line, oncoming traffic is solid: a head-on knocks them out
      for (const c of traffic) {
        if (c.dir !== -1) continue;
        const reach = use3D ? ((c.len || 0) + TUK_LEN) / 2 : 230;
        if (Math.abs(wrapDelta(c.z - r.dist)) >= reach || Math.abs(c.x - r.x) >= (r.nw + c.nw) / 2 * 0.9) continue;
        r.ko = 3; r.koBy = 'traffic'; r.koDir = r.x >= c.x ? 1 : -1; r.speed *= 0.1; r.out = false; r.outCd = rand(4, 8); c.speed = 0; r.headOns = (r.headOns || 0) + 1;
        if (Math.abs(dz) < 3500) { Sfx.crash(); curse(r); }
        break;
      }
    }

    if (engaged && !r.atk) {
      r.cd -= dt;
      const dx = player.x - r.x;
      // how keen they are to hit you: their nature, or (for 10 s after you hit them) their grudge
      const aggr = r.grudgeT > 0 ? Math.max(st.aggression, 0.8) * st.grudge : st.aggression;
      if (aggr > 0 && r.cd <= 0 && Math.abs(dz) < 380 && Math.abs(dx) < 0.72 * wp.reach && Math.abs(dx) > 0.05) {
        startAttack(r, Math.sign(dx)); r.cd = rand(0.9, 2.0) * wp.cooldown / aggr / (1 + round * 0.1);
      }
    }
  }
}

// Stray dogs sleep on the road, trot across it, or sit by the roadside and chase passing autos.
function startChase(c, side) { c.mode = 'chase'; c.chaseT = rand(5, 8); c.side = side; c.speed = Math.min(player.speed * 0.8, MAX_SPEED * 0.55); }
function updateDog(c, dt) {
  c.t += dt; c.barkT -= dt;
  const dz = wrapDelta(c.z - player.dist), sp = player.speed / MAX_SPEED;
  if (Math.abs(dz) > 2500) c.tried = false;
  if (c.mode === 'sleep' && dz > 0 && dz < 700 && sp > 0.2 && !c.tried) {
    c.tried = true;
    if (Math.random() < 0.6) { c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 0.9; }
  }
  if (c.mode === 'sit' && !c.tried && dz > -150 && dz < 450 && Math.abs(c.x - player.x) < 1.6 && sp > 0.25 && state === 'race') {
    c.tried = true;
    if (Math.random() < 0.85) {
      startChase(c, Math.sign(c.x - player.x) || 1);
      // sometimes a second dog joins in on the other side
      const buddy = traffic.find(o => o !== c && o.type === 'dog' && o.mode !== 'chase' && Math.abs(wrapDelta(o.z - c.z)) < 900);
      if (buddy && Math.random() < 0.45) { buddy.tried = true; startChase(buddy, -c.side); buddy.z = (player.dist + 150 + trackLength) % trackLength; buddy.x = player.x - c.side * 0.3; }
    }
  }
  if (c.mode === 'cross') {
    c.x += c.vx * dt;
    const h = halfAt(c.z) + 0.5; if (Math.abs(c.x) > h) { c.x = Math.sign(c.x) * h; c.vx = 0; c.mode = 'sit'; }
  } else if (c.mode === 'chase') {
    c.chaseT -= dt;
    // run alongside the front wheel (a little ahead of the auto) until it outpaces the dog
    const top = MAX_SPEED * (c.chaseT > 2 ? 0.7 : 0.4); // strong sprint, then it tires
    c.speed += clamp(clamp(player.speed + (220 - dz) * 2, 0, top) - c.speed, -MAX_SPEED * dt, MAX_SPEED * 0.6 * dt);
    const hh = halfAt(c.z) + 0.6, tx = clamp(player.x + c.side * 0.32, -hh, hh);
    c.x += clamp(tx - c.x, -1.2 * dt, 1.2 * dt);
    if (c.barkT <= 0 && Math.abs(dz) < 900) {
      c.barkT = rand(0.35, 0.7); Animals.barkFrom(c);
      const s = c.scr && c.scr.frame === frameNo ? c.scr : null;
      popup(pick(['BHOW!', 'BHOW BHOW!', 'WOOF!', 'GRRR!']), s ? s.x : W / 2 + c.side * 190, s ? s.y : H - 210, '#fff', 20);
    }
    if (c.chaseT <= 0 || dz < -700) { c.mode = 'sit'; c.tx = Math.sign(c.x || 1) * (halfAt(c.z) + 0.3); }
  } else {
    c.speed = Math.max(0, c.speed - MAX_SPEED * dt);
    if (c.mode === 'sit' && c.tx !== undefined) c.x += clamp(c.tx - c.x, -0.6 * dt, 0.6 * dt);
  }
  c.z = (c.z + c.speed * dt + trackLength) % trackLength;
  const frame = Math.floor(c.t * (c.mode === 'chase' ? 12 : 7)) % 2;
  if (c.mode === 'sleep') { c.img = c.look.sleep; c.nw = 0.2; }
  else if (c.mode === 'chase') { c.img = c.look.rear[frame]; c.nw = 0.1; }
  else if (c.mode === 'cross') { c.img = (c.vx > 0 ? c.look.right : c.look.left)[frame]; c.nw = 0.2; }
  else { c.img = (c.x > 0 ? c.look.left : c.look.right)[0]; c.nw = 0.2; }
}
function updateTraffic(dt) {
  const obs = trafficObstacles();
  for (const c of traffic) {
    if (c.type === 'dog') { updateDog(c, dt); continue; }
    if (c.type === 'cow') {
      c.scared -= dt;
      if (c.pause > 0) c.pause -= dt;
      else { c.x += c.vx * dt; if (Math.random() < dt * 0.1 && c.scared <= 0) c.pause = rand(1, 4); }
      const h = halfAt(c.z) + 0.4; if (Math.abs(c.x) > h) { c.vx = -Math.sign(c.x) * rand(0.05, 0.12); c.x = Math.sign(c.x) * h; }
      c.img = c.vx > 0 ? SP.cowR : SP.cowL;
    } else {
      driveTraffic(c, obs, dt);
      if (c.stuckT > 8 && offScreen(c.z)) respawnTraffic(c, obs);
    }
  }
}

// Traffic is solid and drives by the rules. The road is two-way and India keeps left: our traffic uses the
// left carriageway (x < 0), oncoming traffic the right. Lanes are counted from the centre line; buses and
// trucks keep to the outermost (left) lane, cars pick one. Everyone keeps a safe gap that grows with speed
// and brakes for whatever is ahead (you, rival autos, traffic, cows), overtakes only on the inside (pulling
// out towards the centre) and moves back out once past, always indicating first and never into a lane with
// something alongside. They merge before a lane ends and stop at red lights (and for a busy junction).
function trafficObstacles() {
  const obs = [{ z: player.dist, x: player.x, vz: player.speed * Math.cos(player.heading), nw: playerW(), len: playerL(), who: player }];
  for (const r of rivals) obs.push({ z: r.dist, x: r.x, vz: r.ko > 0 ? 0 : r.speed, nw: TUK_NW, len: TUK_LEN, who: r });
  for (const c of traffic) if (c.type !== 'dog') obs.push({ z: c.z, x: c.x, vz: (c.dir || 0) * c.speed, nw: c.nw, len: c.type === 'cow' ? 900 : c.len, who: c });
  return obs;
}
// the next junction ahead of z going dir, and how far its stop line is (from the front bumper)
function stopLineAhead(z, dir, front, range) {
  for (const j of junctions) {
    const stop = dir > 0 ? j.z0 - 150 : j.z1 + 150, d = wrapDelta(stop - z) * dir - front;
    if (d > -60 && d < range) return { j, d };
  }
  return null;
}
// Jams clear themselves out of sight: traffic stuck for a while (not at a red light) behind the camera or
// past the draw distance is moved to a free spot in a lane far ahead, clear of junctions and of other
// vehicles, beyond what you can see, and drives on from there.
const offScreen = z => { const dz = wrapDelta(z - player.dist); return dz < -3500 || dz > 44000; };
function respawnTraffic(c, obs) {
  for (let tries = 0; tries < 12; tries++) {
    const z = ((player.dist + rand(48000, 80000)) % trackLength + trackLength) % trackLength;
    if (junctions.some(j => { const d = wrapDelta(z - j.zc); return d > -3500 && d < 2000; })) continue;
    const lanes = findSegment(z).lanes, lane = c.type === 'car' || c.type === 'bike' ? Math.floor(Math.random() * lanes) : lanes - 1, x = laneX(c.dir, lane);
    if (obs.some(o => o.who !== c && Math.abs(o.x - x) < (c.nw + o.nw) / 2 + 0.05 && Math.abs(wrapDelta(o.z - z)) < (c.len + (o.len || 0)) / 2 + 1500)) continue;
    Object.assign(c, { z, lane, x, speed: c.cruise * 0.8, stuckT: 0, stuck: 0, signal: 0, signalT: 0 });
    return true;
  }
  return false;
}
function driveTraffic(c, obs, dt) {
  const dir = c.dir;
  if (c.cruise == null) { c.cruise = c.speed; c.stuck = 0; c.signal = 0; c.signalT = 0; c.checkT = rand(1, 3); c.pref = c.type === 'car' || c.type === 'bike' ? Math.floor(Math.random() * 3) : 2; }
  const reachOf = o => use3D ? (c.len + o.len) / 2 : 250;
  const hits = (x, o) => Math.abs(o.x - x) < (c.nw + o.nw) / 2 - 0.02;
  const fwd = o => wrapDelta(o.z - c.z) * dir;                 // how far ahead of me, going my way
  const laneFree = (x, ahead, behind) => !obs.some(o => o.who !== c && hits(x, o) && fwd(o) > -reachOf(o) - behind && fwd(o) < reachOf(o) + ahead);
  const lanesNow = findSegment(c.z).lanes;
  let lanesAhead = lanesNow, laneEnds = Infinity;
  for (let d = SEG_LEN; d <= 2600; d += SEG_LEN) { const l = findSegment(c.z + dir * d).lanes; if (l < lanesAhead) lanesAhead = l; if (l <= c.lane && laneEnds === Infinity) laneEnds = d; }
  // what's ahead: the nearest thing in my lane, a stop line at red, or the end of my lane
  let gap = Infinity, aheadV = 0, ahead = null;
  for (const o of obs) {
    if (o.who === c || !hits(c.x, o)) continue;
    const d = fwd(o), g = d - reachOf(o);
    if (d > 0 && g < 3000 && g < gap) { gap = g; aheadV = Math.max(0, o.vz * dir); ahead = o; }
  }
  const sl = stopLineAhead(c.z, dir, c.len / 2, 3000);
  let atRed = false;                                            // waiting for the lights (that's not a jam)
  if (sl && !c.rash) {                                          // (rash bikers jump the red)
    const L = lightOf(sl.j), brakeDist = c.speed * c.speed / 12000;
    if ((L === 'R' || sl.j.busy || (L === 'A' && sl.d > brakeDist)) && sl.d < gap) { gap = sl.d; aheadV = 0; ahead = null; atRed = true; }
  }
  if (laneEnds < Infinity && laneEnds - c.len / 2 - 120 < gap) { gap = laneEnds - c.len / 2 - 120; aheadV = 0; ahead = null; }
  const safe = c.rash ? 90 + c.speed * 0.1 : 250 + c.speed * 0.35;
  const target = gap < Infinity ? Math.min(c.cruise, Math.max(0, aheadV + (gap - safe) * 1.6)) : c.cruise;
  c.speed += clamp(target - c.speed, -9000 * dt, 2500 * dt);
  c.z = ((c.z + dir * c.speed * dt) % trackLength + trackLength) % trackLength;
  if (ahead && gap < 0) { c.z = ((ahead.z - dir * reachOf(ahead)) % trackLength + trackLength) % trackLength; c.speed = Math.min(c.speed, aheadV); }
  // lane changes (signal: -1 towards the centre to overtake or merge, +1 back out to the left)
  if (c.lane >= lanesNow) c.lane = lanesNow - 1;
  if (c.yieldT > 0) c.yieldT -= dt;
  const atLane = Math.abs(laneX(dir, c.lane) - c.x) < 0.01;
  if (c.rash) {
    // rash biker: never indicates; cuts into whichever lane (either side) is free the moment anything is
    // in the way, and weaves now and then anyway
    c.signal = 0; c.signalT = 0; c.checkT -= dt;
    if ((ahead && gap < 900) || c.checkT <= 0 || c.lane >= lanesAhead) {
      c.checkT = rand(0.6, 1.8);
      const opts = [c.lane - 1, c.lane + 1].filter(l => l >= 0 && l < lanesAhead && laneFree(laneX(dir, l), 350, 250));
      if (opts.length) c.lane = pick(opts);
    }
  } else if (c.signalT > 0) {
    c.signalT -= dt;
    if (c.signalT <= 0) {
      const l = c.lane + c.signal;
      if (l >= 0 && l < lanesNow && laneFree(laneX(dir, l), 600, 500)) c.lane = l;  // go (keeps blinking until in the lane)
      else if (c.signal < 0 && c.lane >= lanesAhead) c.signalT = 0.3;             // must merge: keep indicating, try again
      else c.signal = 0;
    }
  } else if (atLane) {
    c.signal = 0;
    if (ahead && gap < safe + 400 && c.speed < c.cruise * 0.8) c.stuck += dt; else c.stuck = 0;
    c.checkT -= dt;
    const home = Math.min(c.pref, lanesAhead - 1);
    if (c.lane >= lanesAhead && c.lane > 0) { c.signal = -1; c.signalT = 0.6; }                                   // my lane ends: merge in
    else if (c.yieldT > 0 && c.lane + 1 < lanesAhead && laneFree(laneX(dir, c.lane + 1), 700, 600)) { c.signal = 1; c.signalT = 0.35; c.yieldT = 0; } // let the honker through
    else if (c.stuck > 0.8 && c.lane > 0 && laneFree(laneX(dir, c.lane - 1), 900, 700)) { c.signal = -1; c.signalT = 0.8; c.stuck = 0; } // overtake on the inside
    else if (c.checkT <= 0) { c.checkT = rand(1.5, 3); if (c.lane < home && laneFree(laneX(dir, c.lane + 1), 1400, 900)) { c.signal = 1; c.signalT = 0.8; } } // back out to the left
  }
  // jam watch: time spent (nearly) stopped other than at the lights. After a while a jammed vehicle squeezes
  // into any lane that's free right alongside (off screen it's moved on altogether: see updateTraffic)
  c.stuckT = c.speed < 150 && !atRed ? (c.stuckT || 0) + dt : 0;
  if (c.stuckT > 10 && !c.rash && c.signalT <= 0 && atLane) {
    const opts = [c.lane - 1, c.lane + 1].filter(l => l >= 0 && l < lanesNow && laneFree(laneX(dir, l), 250, 250));
    if (opts.length) { const l = pick(opts); c.signal = l < c.lane ? -1 : 1; c.lane = l; c.stuckT = 6; }
  }
  // steer toward the lane, never sliding into something alongside
  const turn = c.rash ? 1.3 : 0.45, tx = laneX(dir, c.lane) + (c.rash ? Math.sin(c.z / 900) * 0.05 : 0); // rash: swerves fast, wobbles in lane
  const nx = c.x + clamp(tx - c.x, -turn * dt, turn * dt);
  if (nx !== c.x) {
    const blocked = obs.some(o => o.who !== c && Math.abs(fwd(o)) < reachOf(o) && hits(nx, o) && !hits(c.x, o));
    if (blocked) c.lane = clamp(Math.round(Math.abs(c.x) / LANE_W - 0.5), 0, lanesNow - 1); else c.x = nx;
  }
  if (Math.abs(laneX(dir, c.lane) - c.x) < 0.01 && c.signalT <= 0) c.signal = 0;
  c.signalX = -c.signal * dir; // the side (in x) that's blinking
}

// ------------------------------------------------------------------ junction cross traffic
// When the cross road has green, traffic streams across the junction (keeping left: eastbound on the far
// side, westbound on the near side); on red it queues at the cross road's stop lines. Cross vehicles brake
// for anything in their path but can't stop instantly, so jumping the red is a real risk. A traffic cop at
// every other junction fines you for jumping it.
const CROSS_TYPES = [
  { type: 'car', nw: 0.38, len: 1500, label: 'CAR' }, { type: 'car', nw: 0.38, len: 1500, label: 'CAR' },
  { type: 'bike', nw: 0.17, len: 860, label: 'BIKE' }, { type: 'bike', nw: 0.17, len: 860, label: 'BIKE' },
  { type: 'auto', nw: TUK_NW, len: TUK_LEN, label: 'AUTO' }, { type: 'bus', nw: 0.56, len: 3200, label: 'BUS' },
];
// where a cross road's queue waits: back from the road's edge, and behind the footpath where there is one
const stopLine = j => j.half + 0.35 + (footpath() ? FP.KERB_W + footpath().width : 0);
function spawnCross(j, dirX, queued) {
  let d = pick(CROSS_TYPES);
  if (d.type === 'car') { const i = Math.floor(Math.random() * CAR_LOOKS.length); d = { ...d, ...CAR_LOOKS[i], look: CAR_LOOKS[i], img: SP.carLooks[i] }; }
  if (d.type === 'bus') d = { ...d, look: RRR.busLook(def.city.busLooks, Math.random) };
  const lenX = d.len / ROAD_W;
  const stopX = -dirX * stopLine(j);
  const lineUp = crossTraffic.filter(c => c.j === j && c.dirX === dirX && c.x * dirX < stopX * dirX + 0.1);
  if (lineUp.length >= 4) return;
  const back = lineUp.reduce((m, c) => Math.min(m, c.x * dirX - c.lenX / 2), stopX * dirX) - 0.3 - lenX / 2;
  const x = queued ? back * dirX : -dirX * (j.half + 13);
  if (!queued && x * dirX > back) return;
  crossTraffic.push({ j, dirX, x, z: j.zc + dirX * 600, type: d.type, nw: d.nw, len: d.len, lenX, label: d.label, cruise: rand(1.9, 2.4), speed: queued ? 0 : 2.1,
    img: d.img || (d.type === 'bus' ? SP.bus : d.type === 'auto' ? cityAuto().img : pick(SP.bikes)), look: d.look, palette: d.type === 'auto' ? cityAuto().palette : null });
}
// autos in traffic wear the livery of the city you're racing in (no slogan, driver or weapon of their own)
const cityAutos = {};
function cityAuto() {
  const city = def.city.id;
  if (!cityAutos[city]) {
    const l = (homeDriver(city) || DRIVERS[0]).look, palette = { body: l.body, trim: l.trim, canopy: l.canopy };
    cityAutos[city] = { palette, img: makeTuk(l.body, l.trim, l.canopy, l.plate.slice(0, 5) + ' AU') };
  }
  return cityAutos[city];
}
function dropCross(gone) {
  const out = crossTraffic.filter(gone); if (!out.length) return;
  crossTraffic = crossTraffic.filter(c => !gone(c));
  if (use3D) World3D.forget(out); // free their 3D models
}
function updateCross(dt) {
  if (!use3D) return; // (the 2D fallback has no cross traffic)
  for (const j of junctions) {
    const dz = wrapDelta(j.zc - player.dist), active = dz > -4000 && dz < 30000;
    if (!active) { if (j.live) { dropCross(c => c.j === j); j.live = false; } continue; }
    if (!j.live) { j.live = true; for (const dx of [-1, 1]) for (let k = 0; k < 2; k++) spawnCross(j, dx, true); }
    for (const [k, dx] of [[0, -1], [1, 1]]) {
      j.spawn[k] -= dt;
      if (j.spawn[k] <= 0) { const go = crossGo(j); j.spawn[k] = go ? rand(1.2, 2.4) : rand(2.5, 5); spawnCross(j, dx, !go); }
    }
  }
  const bodies = [{ x: player.x, z: player.dist, w: playerW(), l: playerL(), who: player }, ...rivals.map(r => ({ x: r.x, z: r.dist, w: TUK_NW, l: TUK_LEN, who: r })),
    ...traffic.filter(c => c.type !== 'dog').map(c => ({ x: c.x, z: c.z, w: c.nw, l: c.type === 'cow' ? 900 : c.len, who: c }))];
  for (const j of junctions) j.busy = false;
  for (const c of crossTraffic) {
    const inLane = b => Math.abs(wrapDelta(b.z - c.z)) < (c.nw * ROAD_W + b.l) / 2;
    // nearest thing ahead in my path: a body on the road, the car in front, or my stop line when it's red
    let gap = Infinity;
    for (const b of bodies) if (inLane(b)) { const g = (b.x - c.x) * c.dirX - c.lenX / 2 - b.w / 2; if (g > -0.1 && g < gap) gap = g; }
    for (const o of crossTraffic) if (o !== c && o.j === c.j && o.dirX === c.dirX) { const g = (o.x - c.x) * c.dirX - (c.lenX + o.lenX) / 2; if (g > -0.2 && g < gap) gap = g; }
    const stop = (-c.dirX * stopLine(c.j) - c.x) * c.dirX - c.lenX / 2;
    if (!crossGo(c.j) && stop > -0.05 && stop < gap) gap = stop;
    const target = gap === Infinity ? c.cruise : Math.min(c.cruise, Math.sqrt(2 * 3 * Math.max(0, gap - 0.12)));
    c.speed += clamp(target - c.speed, -3 * dt, 1.2 * dt);  // brakes hard, but not instantly
    c.stuckT = c.speed < 0.05 && crossGo(c.j) ? (c.stuckT || 0) + dt : 0;
    c.x += c.dirX * c.speed * dt;
    if (Math.abs(c.x) - c.lenX / 2 < c.j.half + 0.2) c.j.busy = true;
    // hits: you get T-boned; a rival is knocked out
    for (const b of bodies) {
      if (b.who === player ? player.crash > 0 || player.inv > 0 || player.air : b.who.ko > 0 || b.who.air) continue;
      if (!inLane(b) || Math.abs(b.x - c.x) > (c.lenX + b.w) / 2) continue;
      if (b.who === player) { crashPlayer(`T-BONED BY A ${c.label}!`, 25 + c.speed * 6); player.speed = 0; }
      else if (b.who.isRival) { b.who.ko = 2.5; b.who.koDir = c.dirX; b.who.speed *= 0.2; }
      else { b.who.speed = 0; }
      c.speed = 0;
    }
  }
  dropCross(c => Math.abs(c.x) >= c.j.half + 16 || (c.stuckT > 8 && offScreen(c.z)) || c.stuckT > 25);   // (stuck on its green: a jam)
  // jumping the red: the cop blows his whistle and writes a challan
  const front = player.dist + TUK_LEN / 2;
  for (const j of junctions) {
    const line = j.z0 - 150, was = wrapDelta(line - (player._front ?? front)), now = wrapDelta(line - front);
    if (was > 0 && now <= 0 && was - now < 1500 && state === 'race' && player.x < 0.1) { // (a real crossing, not a respawn jump)
      if (lightOf(j) === 'R') {
        if (j.cop) { const fine = 200; cash = Math.max(0, cash - fine); store.set('cash', cash); Sfx.whistle(); msg(`CHALLAN! -₹${fine}`, '#ff8a65', 2); popup('JUMPED THE RED!', W / 2, H - 300, '#ff5252', 24); }
        else popup('JUMPED THE RED!', W / 2, H - 300, '#ff5252', 22);
      }
    }
  }
  player._front = front;
}

function checkCollisions() {
  if (player.crash > 0 || player.air) return;
  // in 3D every vehicle is a solid body centred on its position, so contact happens when the bodies' ends
  // meet (half of each length apart); the flat 2D sprites only touch just ahead of the auto
  const pw = playerW(), half = use3D ? playerL() / 2 : 0, seg = findSegment(player.dist + half * 0.8);
  if (Math.abs(player.x) > seg.half) {
    for (const s of seg.solids) {
      if (Math.sign(s.offset) !== Math.sign(player.x)) continue;
      // a cart ramp, met at its near end, lined up and fast enough: up and away (anything else about a cart is a wreck)
      if (s.kind === 'cart' && seg.index - s.seg0 <= 1 && FP.takesOff(s.offset + Math.sign(s.offset) * s.nw / 2, player.x, player.speed / MAX_SPEED)) { takeOff(); return; }
      // buildings and temples: their front wall is at the offset; other things are centred half their width out
      const wall = s.kind === 'building' || s.kind === 'temple';
      const hit = wall ? Math.abs(player.x) + pw * 0.45 > Math.abs(s.offset)
        : s.onPath ? overlap(player.x, pw, s.offset + Math.sign(s.offset) * s.nw / 2, s.nw) // a stall or a cart blocks the footpath at its full width
        : overlap(player.x, pw * 0.7, s.offset + Math.sign(s.offset) * s.nw / 2, s.nw * 0.55);
      if (hit) {
        crashPlayer('WRECKED!', 25, -Math.sign(s.offset)); player.speed = 0;
        player.x = s.offset - Math.sign(s.offset) * pw * 0.6; return;
      }
    }
  }
  for (const c of traffic) {
    const dz = wrapDelta(c.z - player.dist);
    const reach = use3D ? (c.len || 0) / 2 + half : 230;
    if (dz < (use3D ? -reach : -60) || dz > reach || !overlap(player.x, use3D ? pw : pw * 0.85, c.x, use3D ? c.nw : c.nw * 0.85)) continue;
    // oncoming, nose to nose: a head-on smash (alongside it's a scrape, below)
    if (c.dir === -1 && !(use3D && Math.abs(dz) < reach - 260)) {
      const rel = (player.speed + c.speed) / MAX_SPEED;
      crashPlayer(`HEAD-ON WITH A ${c.label}!`, 30 + rel * 25); player.speed = 0; c.speed = 0;
      if (dz > 0) player.dist -= reach - dz;
      return;
    }
    // alongside (3D): the auto scrapes the vehicle's side and is shoved back out into its own line
    if (use3D && dz < reach - 260 && c.type !== 'dog') {
      const dir = player.x >= c.x ? 1 : -1;
      player.x = c.x + dir * (pw + c.nw) / 2 + dir * 0.01;
      player.lean = dir * 0.5; player.speed *= 0.92; shake = 0.12; bumpPlayer(2, dir); c.passCd = PASS_AGAIN;  // (a touched vehicle isn't a close pass)
      if (c.type === 'cow') { Animals.mooFrom(c); c.vx = -dir * 0.8; c.scared = 2; }
      return;
    }
    if (player.speed <= c.speed) continue;
    if (c.type === 'dog') { // the dog always leaps clear; you lose speed swerving
      if (c.mode === 'chase') continue;
      Sfx.yelp(); c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 1.1; c.x += Math.sign(c.vx) * 0.25; c.tried = true;
      player.speed *= 0.75; player.lean -= Math.sign(c.vx) * 0.4; shake = 0.12;
      popup('KAI KAI!', W / 2 + Math.sign(c.vx) * 120, H - 250, '#fff', 22);
      return;
    }
    const rel = (player.speed - c.speed) / MAX_SPEED;
    if (c.type === 'cow') { Animals.mooFrom(c); c.vx = (c.x >= player.x ? 1 : -1) * 0.8; c.scared = 2; }
    if (rel > 0.3) { crashPlayer(`SMASHED INTO A ${c.label}!`, 20 + rel * 25); player.speed = c.speed * 0.3; }
    else { player.speed = c.speed * 0.8; if (rel > 0.02) { shake = 0.15; bumpPlayer(3); c.passCd = PASS_AGAIN; } }  // (leaning on its bumper isn't a bump)
    player.dist -= reach - dz;
    return;
  }
  const reachR = use3D ? TUK_LEN / 2 + half : 200;
  for (const r of rivals) {
    const dz = r.dist - player.dist;
    if (r.air || Math.abs(dz) > reachR || !overlap(player.x, pw, r.x, r.nw)) continue; // a rival in a jump is over your head
    if (r.ko > 0) {
      if (dz > 0 && player.speed / MAX_SPEED > 0.3) { crashPlayer(`TRIPPED OVER ${r.name}!`, 15); player.speed *= 0.3; player.dist -= reachR - dz; return; }
      continue;
    }
    const dx = player.x - r.x, ov = (pw + r.nw) / 2 - Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    const nose = use3D ? Math.abs(dz) > reachR - 260 : Math.abs(dx) < (pw + r.nw) / 2 * 0.55;
    if (nose) {
      if (dz > 0 && player.speed > r.speed) { player.speed = r.speed * 0.95; player.dist -= reachR - dz; Sfx.bump(); }
      else if (dz < 0 && r.speed > player.speed) { r.speed = player.speed * 0.95; r.dist = player.dist - reachR; }
    } else { player.x += dir * ov * 0.5; r.x -= dir * ov * 0.5; }
  }
}

// rivals are solid too: they can't drive into each other or into traffic. Nose to tail the one behind is
// held back at the other's bumper; side by side they're pushed apart.
function separateRivals() {
  const reachR = use3D ? TUK_LEN : 200;
  const push = (a, b, dz, reach, bw, both) => { // a is behind b by dz (>= 0); both: b can be moved sideways too
    const dx = a.x - b.x, ov = (TUK_NW + bw) / 2 - Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    if (ov <= 0) return;
    if (dz > reach - 260) { a.dist = Math.min(a.dist, b.dist - reach); a.speed = Math.min(a.speed, (b.speed || 0) * 0.98); }
    else if (both) { a.x += dir * ov * 0.5; b.x -= dir * ov * 0.5; } else a.x += dir * ov;
  };
  for (let i = 0; i < rivals.length; i++) {
    const a = rivals[i];
    for (let j = i + 1; j < rivals.length; j++) {
      const b = rivals[j], dz = b.dist - a.dist;
      if (a.air || b.air || Math.abs(dz) >= reachR) continue; // in a jump an auto touches nothing
      if (dz >= 0) push(a, b, dz, reachR, TUK_NW, true); else push(b, a, -dz, reachR, TUK_NW, true);
    }
    if (a.ko > 0 || a.air) continue;
    // alongside you: the rival gives way sideways (nose to tail is handled in checkCollisions)
    const pdz = player.dist - a.dist, pdx = a.x - player.x, pov = (TUK_NW + playerW()) / 2 - Math.abs(pdx);
    if (Math.abs(pdz) < (use3D ? (TUK_LEN + playerL()) / 2 : 200) - 260 && pov > 0) a.x += (pdx >= 0 ? 1 : -1) * pov;
    for (const c of traffic) {
      if (c.type === 'dog' || c.type === 'cow' || c.dir === -1) continue;
      const reach = use3D ? (c.len || 0) / 2 + TUK_LEN / 2 : 200, dz = wrapDelta(c.z - a.dist), cw = use3D ? c.nw : c.nw * 0.85;
      if (dz <= -reach || dz >= reach) continue;
      if (dz > 0) push(a, { dist: a.dist + dz, x: c.x, speed: c.speed }, dz, reach, cw, false);
      else { const dx = a.x - c.x, ov = (TUK_NW + cw) / 2 - Math.abs(dx); if (ov > 0) a.x += (dx >= 0 ? 1 : -1) * ov; }
    }
  }
}

function currentRank() {
  const all = [player, ...rivals];
  const unfinished = all.filter(a => !a.finished).sort((a, b) => b.dist - a.dist);
  const order = [...finishOrder, ...unfinished];
  return order.indexOf(player) + 1;
}

function checkFinish() {
  for (const a of [player, ...rivals]) {
    if (a.finished || a.dist < finishDist) continue;
    a.finished = true; a.time = raceTime; finishOrder.push(a);
    if (a === player) {
      const rank = finishOrder.length;
      state = 'finished'; finishTimer = 4; player.atk = null;
      msg(`FINISHED ${ordinal(rank)}!`, rank <= 3 ? '#ffeb3b' : '#ff8a65', 3.5);
      if (rank <= 3) Sfx.cash();
    }
  }
}

function buildResults() {
  const unfinished = [player, ...rivals].filter(a => !a.finished).sort((a, b) => b.dist - a.dist);
  const order = [...finishOrder, ...unfinished];
  const rank = order.indexOf(player) + 1;
  const prize = PRIZES[rank - 1] || 0, bonus = player.kos * 100;
  stats.finish(player.finished ? player.time : null, rank);
  const skill = stats.bonuses(); // drift and lane-surf cash, at the style's rates
  cash += prize + bonus + skill.drift + skill.passes + skill.jumps;
  // beaten: which of the track's bests this race beat · best: the bests after it
  results = { order, rank, prize, bonus, skill, stats, qualified: rank <= 3, beaten: records.submit(def.id, stats.summary()), best: records.get(def.id) };
  trackEvent(`race-finish/${ordinal(rank)}`, `Finished ${ordinal(rank)}: ${def.name}`);
  store.set('cash', cash);
  state = 'results';
}

function advanceAfterResults() {
  if (results.qualified) {
    level++;
    if (level >= ORDER.length) { level = 0; round++; store.set('round', round); store.set('track', ORDER[level]); state = 'champion'; attractSetup(); return; }
    store.set('track', ORDER[level]);
  }
  setupRace();
}

function attractSetup() {
  loadTrack(level);
  titleBest = records.get(def.id);
  resetPlayer(); rivals = []; traffic = []; player.speed = MAX_SPEED * 0.5;
}
function updateAttract(dt) {
  const seg = findSegment(player.dist);
  player.x = lerp(player.x, -seg.curve * 0.08, Math.min(1, dt * 2));
  player.speed = MAX_SPEED * 0.5; player.rot = 0;
  player.dist += player.speed * dt;
  position = ((player.dist - PLAYER_Z) % trackLength + trackLength) % trackLength;
  const segDelta = player.speed * dt / SEG_LEN;
  farOffset = (farOffset + 0.0012 * seg.curve * segDelta + 1) % 1;
  nearOffset = (nearOffset + 0.0022 * seg.curve * segDelta + 1) % 1;
  updateEngine();
}

// ------------------------------------------------------------------ rendering
function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
}

function drawSegment(seg, n) {
  const col = seg.dark ? theme.dark : theme.light;
  const x1 = seg.p1.screen.x, y1 = seg.p1.screen.y, u1 = seg.p1.screen.w;
  const x2 = seg.p2.screen.x, y2 = seg.p2.screen.y, u2 = seg.p2.screen.w;
  const w1 = u1 * seg.hw1, w2 = u2 * seg.hw2; // this stretch's road half-width (4 or 6 lanes)
  if (seg.junction) { ctx.fillStyle = col.road; ctx.fillRect(0, y2, W, y1 - y2 + 1); return; } // the cross road
  ctx.fillStyle = col.grass; ctx.fillRect(0, y2, W, y1 - y2 + 1);
  const fp = footpath(), sw = fp ? fp.width : 0.35; // the footpath (or, without one, the old narrow paved strip)
  const r1 = u1 / 6, r2 = u2 / 6, s1 = u1 * sw, s2 = u2 * sw;
  poly(x1 - w1 - r1 - s1, y1, x1 - w1 - r1, y1, x2 - w2 - r2, y2, x2 - w2 - r2 - s2, y2, col.shoulder);
  poly(x1 + w1 + r1 + s1, y1, x1 + w1 + r1, y1, x2 + w2 + r2, y2, x2 + w2 + r2 + s2, y2, col.shoulder);
  if (fp) for (const sd of [-1, 1]) { const k1 = u1 * 0.035, k2 = u2 * 0.035; // the kerb's shadowed face
    poly(x1 + sd * (w1 + r1), y1, x1 + sd * (w1 + r1 + k1), y1, x2 + sd * (w2 + r2 + k2), y2, x2 + sd * (w2 + r2), y2, 'rgba(0,0,0,.3)'); }
  poly(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, col.rumble);
  poly(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, col.rumble);
  poly(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, col.road);
  if (seg.finish) {
    const cells = 12, phase = seg.finish === 2 ? 1 : 0;
    for (let i = 0; i < cells; i++) {
      if ((i + phase) % 2) continue;
      const a1 = x1 - w1 + (2 * w1 * i) / cells, b1 = x1 - w1 + (2 * w1 * (i + 1)) / cells;
      const a2 = x2 - w2 + (2 * w2 * i) / cells, b2 = x2 - w2 + (2 * w2 * (i + 1)) / cells;
      poly(a1, y1, b1, y1, b2, y2, a2, y2, '#f5f5f5');
    }
    return;
  }
  // double yellow centre line (solid), dashed white lines between the lanes of each direction
  const l1 = u1 / 40, l2 = u2 / 40;
  for (const o of [-0.03, 0.03]) poly(x1 + o * u1 - l1 / 2, y1, x1 + o * u1 + l1 / 2, y1, x2 + o * u2 + l2 / 2, y2, x2 + o * u2 - l2 / 2, y2, '#f2c200');
  if (col.lane) for (const side of [-1, 1]) for (let i = 1; i < seg.lanes; i++) {
    const o = side * i * LANE_W;
    poly(x1 + o * u1 - l1 / 2, y1, x1 + o * u1 + l1 / 2, y1, x2 + o * u2 + l2 / 2, y2, x2 + o * u2 - l2 / 2, y2, col.lane);
  }
}

// Clouds: a wrap-around layer painted once per theme from soft puffs, lit on top (the sun's colour at
// sunset), shaded underneath by the sky; thin and faint at night. Drifts slowly and swings with the curves.
let cloudCanvas = null, cloudTheme = null;
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function cloudLayer() {
  if (cloudTheme === theme) return cloudCanvas;
  cloudTheme = theme;
  const c = mk(W * 2, Math.round(H * 0.42)), g = c.getContext('2d'), r = mulberry32(17), night = !!theme.night;
  const lit = night ? '#5a6890' : theme.sun, base = night ? '#252d4a' : theme.sky[1], alpha = night ? 0.3 : 0.75;
  for (let i = 0; i < (night ? 6 : 12); i++) {
    const cx = r() * c.width, cy = c.height * (0.2 + r() * 0.55), w = 130 + r() * 240, h = w * (0.2 + r() * 0.12);
    for (let k = 0; k < 10; k++) {
      const px = cx + (r() - 0.5) * w, py = cy + (r() - 0.65) * h, pr = h * (0.45 + r() * 0.7);
      for (const dx of [0, c.width, -c.width]) {
        const gr = g.createRadialGradient(px + dx, py - pr * 0.35, pr * 0.1, px + dx, py, pr);
        gr.addColorStop(0, hexA(night ? lit : '#ffffff', alpha)); gr.addColorStop(0.45, hexA(lit, alpha * 0.65));
        gr.addColorStop(0.8, hexA(base, alpha * 0.35)); gr.addColorStop(1, hexA(base, 0));
        g.fillStyle = gr; g.fillRect(px + dx - pr, py - pr, pr * 2, pr * 2);
      }
    }
  }
  return (cloudCanvas = c);
}
function drawBackground(ctx, hz) {
  const g = ctx.createLinearGradient(0, 0, 0, hz * 1.1);
  g.addColorStop(0, theme.sky[0]); g.addColorStop(0.6, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * (0.72 - skyOffset * 0.5), sy = hz * (theme.night ? 0.32 : 0.54);
  if (theme.night) {
    const r = mulberry32(5);
    for (let i = 0; i < 90; i++) { ctx.globalAlpha = 0.3 + r() * 0.7; ctx.fillStyle = '#fff'; ctx.fillRect(((r() - skyOffset * 0.3) % 1 + 1) % 1 * W, r() * H * 0.4, 1.5, 1.5); }
    ctx.globalAlpha = 1;
  }
  const glow = theme.night ? 60 : 120, disc = theme.night ? 20 : 34;
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, glow);
  sg.addColorStop(0, theme.sun); sg.addColorStop(0.25, theme.sun + (theme.night ? '55' : 'aa')); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - glow, sy - glow, glow * 2, glow * 2);
  ctx.fillStyle = theme.sun; ctx.beginPath(); ctx.arc(sx, sy, disc, 0, Math.PI * 2); ctx.fill();
  if (theme.night) { // crescent: shade part of the disc only
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, disc, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = theme.sky[1]; ctx.beginPath(); ctx.arc(sx + 9, sy - 6, disc * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const cl = cloudLayer(), co = ((skyOffset * 0.35 + performance.now() / 600000) % 1 + 1) % 1;
  ctx.drawImage(cl, -co * cl.width, hz * 0.04); ctx.drawImage(cl, (1 - co) * cl.width, hz * 0.04);
  const layer = (img, off, bottom) => {
    const lw = img.width, x0 = -Math.floor(off * lw);
    for (let x = x0; x < W; x += lw) ctx.drawImage(img, x, bottom - img.height);
    if (x0 > 0) ctx.drawImage(img, x0 - lw, bottom - img.height);
  };
  layer(bgLayers.far, farOffset, hz + 30);
  layer(bgLayers.near, nearOffset, hz + 50);
  ctx.fillStyle = theme.fog; ctx.fillRect(0, hz + 50, W, H);
}

function drawSprite(img, destX, destY, destW, destH, clipY) {
  const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
  if (clipH >= destH || destW < 1) return;
  ctx.drawImage(img, 0, 0, img.width, img.height - (img.height * clipH / destH), destX, destY, destW, destH - clipH);
}

// An attack drawn on top of a tuk-tuk sprite rect: the arm swings whatever the driver fights with (weapon.shape),
// or a leg shoots out of the side of the auto (weapon.kind 'kick').
function drawAttack(x, y, w, h, atk, weapon) {
  const side = atk.side, p = clamp(atk.t / atk.dur, 0, 1), kick = weapon.kind === 'kick';
  const line = (x0, y0, x1, y1, color, width) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  // The move seen from behind: z is the angle on screen, a sweep forward or back (y) foreshortens the limb and
  // lifts or drops it a little, and a thrust (ext) slides the hand out along it.
  const px = x + w * (0.5 + side * (kick ? 0.36 : 0.34)), py = y + h * (kick ? 0.6 : 0.3), limb = kick ? 0.42 : 0.28;
  const frame = k => {
    const q = attackPoseAt(weapon, k), f = Math.max(0.35, Math.cos(q.y)), a = -q.z;
    const dx = Math.cos(a) * side, dy = Math.sin(a), oy = py - Math.sin(q.y) * h * 0.05, r = limb * f + q.ext / 2000;
    return { f, dx, dy, ox: px, oy, hx: px + dx * w * r, hy: oy + dy * w * r };
  };
  // the path the end of it has just travelled
  const trail = reach => {
    if (p <= 0.12 || p >= 0.9) return;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = w * 0.02; ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const q = frame(p - 0.3 * (1 - i / 6)), tx = q.hx + q.dx * w * reach * q.f, ty = q.hy + q.dy * w * reach * q.f; if (i) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty); }
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  const { f, dx, dy, ox: sx, oy: sy, hx, hy } = frame(p), nx = -dy, ny = dx; // along the limb, and across it
  if (kick) { // a leg out of the side of the auto
    line(sx, sy, hx, hy, weapon.color, w * 0.09);
    line(hx, hy, hx - dy * side * w * 0.07, hy - Math.abs(dx) * w * 0.07, '#1a1a1a', w * 0.075); // the shoe, toes up
    trail(0.04);
    return;
  }
  const at = t => [hx + dx * w * t * f, hy + dy * w * t * f];
  line(sx, sy, sx + (hx - sx) * 0.43, sy + (hy - sy) * 0.43, atk.sleeve || '#3949ab', w * 0.07);
  line(sx + (hx - sx) * 0.36, sy + (hy - sy) * 0.36, hx, hy, '#8d5524', w * 0.05);
  const c = weapon.color, shape = weapon.shape;
  let len = 0.5; // how far the weapon reaches past the hand, in sprite widths (for the swoosh)
  if (shape === 'bat') {
    line(...at(-0.04), ...at(0.14), '#6d4c41', w * 0.028);
    ctx.lineCap = 'butt'; line(...at(0.13), ...at(0.46), c, w * 0.085); ctx.lineCap = 'round'; len = 0.46;
  } else if (shape === 'hockey') {
    line(...at(-0.06), ...at(0.52), c, w * 0.035);
    const [ex, ey] = at(0.52); line(ex, ey, ex + nx * side * w * 0.1 + dx * w * 0.03, ey + ny * side * w * 0.1 + dy * w * 0.03, c, w * 0.045); len = 0.54;
  } else if (shape === 'umbrella') {
    line(...at(-0.05), ...at(0.5), '#8d6e63', w * 0.018);
    line(...at(0.07), ...at(0.44), c, w * 0.06);
    const [kx, ky] = at(-0.05); ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = w * 0.02; ctx.beginPath(); ctx.arc(kx + nx * w * 0.025, ky + ny * w * 0.025, w * 0.025, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'cane') {
    line(...at(-0.04), ...at(0.42), c, w * 0.024); len = 0.42;
    ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.arc(...at(-0.04), w * 0.022, 0, Math.PI * 2); ctx.fill();
  } else if (shape === 'cloth') { // a wet gamchha: it trails behind the hand, then cracks out straight
    const wob = (1 - Math.min(1, p / moveOf(weapon).at)) * w * 0.16 * side, [mx, my] = at(0.28), [ex, ey] = at(0.56);
    ctx.lineCap = 'butt'; ctx.strokeStyle = c; ctx.lineWidth = w * 0.085; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx - nx * wob, my - ny * wob, ex, ey); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.085; ctx.setLineDash([w * 0.018, w * 0.11]); ctx.lineDashOffset = -w * 0.08; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx - nx * wob, my - ny * wob, ex, ey); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineDashOffset = 0; ctx.lineCap = 'round';
    len = 0.56;
  } else if (shape === 'shoe') {
    line(...at(0.0), ...at(0.15), c, w * 0.07);
    const [tx, ty] = at(0.17); line(tx, ty, tx + nx * side * w * 0.035, ty + ny * side * w * 0.035, c, w * 0.03); len = 0.18; // the curled toe
  } else if (shape === 'bag') {
    line(...at(0.0), ...at(0.18), '#555', w * 0.014);
    ctx.lineCap = 'butt'; line(...at(0.17), ...at(0.36), c, w * 0.15); ctx.lineCap = 'round';
    line(...at(0.2), ...at(0.33), '#9e9e9e', w * 0.012); len = 0.36;
  } else if (shape === 'dandiya') {
    for (const k of [-1, 1]) {
      const ox = nx * k * w * 0.03, oy = ny * k * w * 0.03, [ex, ey] = at(0.32);
      line(hx, hy, ex + ox, ey + oy, c, w * 0.026);
      for (const t of [0.1, 0.2]) { const [bx, by] = at(t); line(bx + ox * t * 3 - dx, by + oy * t * 3 - dy, bx + ox * t * 3 + dx, by + oy * t * 3 + dy, '#ffd21f', w * 0.028); }
    }
    len = 0.32;
  } else if (shape === 'hand') {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(...at(0.03), w * 0.05, 0, Math.PI * 2); ctx.fill(); len = 0.06;
  } else { // lathi
    const [ex, ey] = at(0.5);
    line(hx - dx * w * 0.06, hy - dy * w * 0.06, ex, ey, c, w * 0.035);
    for (const t of [0.3, 0.6, 0.9]) { const bx = lerp(hx, ex, t), by = lerp(hy, ey, t); line(bx - dx * 2, by - dy * 2, bx + dx * 2, by + dy * 2, '#6d4c41', w * 0.037); }
  }
  if (shape !== 'hand') { ctx.fillStyle = '#8d5524'; ctx.beginPath(); ctx.arc(hx, hy, w * 0.035, 0, Math.PI * 2); ctx.fill(); }
  trail(len);
}
// Neon strip lights on a decked-out auto, at night: a glow on the road under it and bright lines along the foot
// of the tub and the edge of the hood.
function drawNeon(x, y, w, h, color) {
  const cx = x + w / 2, gy = y + h * 0.93, g = ctx.createRadialGradient(cx, gy, 0, cx, gy, w * 0.75);
  g.addColorStop(0, hexA(color, 0.55)); g.addColorStop(1, hexA(color, 0));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, gy); ctx.scale(1, 0.22); ctx.translate(-cx, -gy);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, gy, w * 0.75, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawNeonStrips(x, y, w, h, color) {
  ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = color; ctx.shadowBlur = Math.max(4, w * 0.12);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, w * 0.018);
  for (const [fy, x0, x1] of [[0.815, 0.1, 0.9], [0.487, 0.1, 0.9]]) { ctx.beginPath(); ctx.moveTo(x + w * x0, y + h * fy); ctx.lineTo(x + w * x1, y + h * fy); ctx.stroke(); }
  ctx.restore();
}

function drawTuk(img, x, y, w, h, rot, atk, hurt, who) {
  const neon = theme.night && who && who.driver && who.driver.look.neon;
  ctx.save();
  if (hurt > 0) x += Math.sin(hurt * 90) * w * 0.04; // shudder when hit
  if (rot) {
    const px = x + w * (rot > 0 ? 0.9 : 0.1), py = y + h * 0.93;
    ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py);
  }
  if (neon) drawNeon(x, y, w, h, neon);
  ctx.drawImage(img, x, y, w, h);
  if (neon) drawNeonStrips(x, y, w, h, neon);
  if (atk) drawAttack(x, y, w, h, atk, (who && who.weapon) || LATHI);
  ctx.restore();
}

function render() {
  frameNo++;
  ctx.save();
  if (use3D && !render3D()) disable3D();
  if (!use3D) {
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 10);
    drawBackground(ctx, H / 2);
    renderWorld2D();
  }
  // particles
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.t * 1.5, 0, 1); ctx.fillStyle = p.color;
    const sz = p.size + (p.grow ? (0.7 - p.t) * p.grow : 0);
    ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  guardDraw('ui', drawPopups);
  guardDraw('ui', drawBubbles);
  guardDraw('ui', () => {
    if (state === 'title') drawTitle();
    else if (state === 'champion') drawChampion();
    else { drawHUD(); if (state === 'countdown') drawCountdown(); if (state === 'results') drawResults(); }
  });
  guardDraw('ui', () => { if (paused) drawPaused(); else drawMessages(); });
  guardDraw('ui', () => { if (mixer) drawMixer(); else drawSoundHint(); });
}

// 3D mode: sky on its own canvas, the world in WebGL, and this canvas cleared for the UI on top
function render3D() {
  try {
    drawBackground(bgCtx, World3D.horizonY());
    const info = World3D.frame({ player, rivals, traffic, frameNo, shake, t: performance.now() / 1000, cross: crossTraffic, lightOf, marks: skidMarks, now: worldT });
    playerScr = info ? info.player : null;
    ctx.clearRect(0, 0, W, H);
    return true;
  } catch (err) {
    reportError('renderer', '3D frame failed, switching to 2D', err);
    return false;
  }
}
function disable3D() {
  use3D = false; playerScr = null;
  if (bgCanvas) bgCanvas.style.display = 'none';
  if (glCanvas) glCanvas.style.display = 'none';
}

// the original pseudo-3D renderer (used when WebGL isn't available)
function renderWorld2D() {
  const baseSeg = findSegment(position);
  const basePct = pctRemaining(position, SEG_LEN);
  const playerSeg = findSegment(position + PLAYER_Z);
  const playerPct = pctRemaining(position + PLAYER_Z, SEG_LEN);
  const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
  let maxy = H, x = 0, dx = -(baseSeg.curve * basePct);

  // bucket cars into segments
  const touched = [];
  const bucket = (car, z) => { const s = findSegment(z); s.cars.push(car); car._z = ((z % trackLength) + trackLength) % trackLength; touched.push(s); };
  for (const c of traffic) bucket(c, c.z);
  for (const r of rivals) bucket(r, r.dist);

  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = segments[(baseSeg.index + n) % segments.length];
    const looped = seg.index < baseSeg.index;
    seg.clip = maxy; seg.n = n;
    const camZ = position - (looped ? trackLength : 0);
    project(seg.p1, player.x * ROAD_W - x, playerY + CAM_H, camZ);
    project(seg.p2, player.x * ROAD_W - x - dx, playerY + CAM_H, camZ);
    x += dx; dx += seg.curve;
    if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
    drawSegment(seg, n);
    maxy = seg.p1.screen.y;
    maxy = seg.p2.screen.y;
  }

  for (let n = DRAW_DIST - 1; n > 0; n--) {
    const seg = segments[(baseSeg.index + n) % segments.length];
    for (const s of seg.sprites) {
      const scale = seg.p1.screen.scale;
      const destW = s.nw * ROAD_W * scale * W / 2, destH = destW * s.img.height / s.img.width;
      const sx = seg.p1.screen.x + scale * s.offset * ROAD_W * W / 2;
      const ox = s.center ? -0.5 : (s.offset < 0 ? -1 : 0);
      drawSprite(s.img, sx + destW * ox, seg.p1.screen.y - destH, destW, destH, seg.clip);
      if (s.kind === 'chai' || s.kind === 'building') s.scr = { x: sx + destW * (ox + 0.5), y: seg.p1.screen.y - destH * (s.kind === 'chai' ? 0.75 : 0.3), w: destW, frame: frameNo };
    }
    if (seg.cars.length > 1) seg.cars.sort((a, b) => b._z - a._z);
    for (const car of seg.cars) {
      const pct = pctRemaining(car._z, SEG_LEN);
      const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
      const cx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * car.x * ROAD_W * W / 2;
      const cy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
      const destW = car.nw * ROAD_W * scale * W / 2, destH = destW * car.img.height / car.img.width;
      if (destW < 1 || !(scale > 0)) continue;
      if (car.isRival) {
        const bounce = car.speed > 0 ? Math.sin(performance.now() / 45 + car.dist) * destH * 0.006 : 0;
        const y = cy - destH + bounce - scale * (car.y || 0) * H / 2; // (up in a jump)
        if (y + destH <= seg.clip + destH * 0.5) drawTuk(car.img, cx - destW / 2, y, destW, destH, car.rot, car.atk, car.hurt, car);
        car.scr = { x: cx, y: cy - destH * 1.1, w: destW, frame: frameNo };
      } else { drawSprite(car.img, cx - destW / 2, cy - destH, destW, destH, seg.clip); car.scr = { x: cx, y: cy - destH * 1.2, w: destW, frame: frameNo }; }
    }
    if (seg === playerSeg) drawPlayer(playerSeg, playerPct);
  }
  for (const s of touched) s.cars.length = 0;
}

function drawPlayer(seg, pct) {
  const scale = CAM_DEPTH / PLAYER_Z;
  const destW = TUK_NW * ROAD_W * scale * W / 2, destH = destW * player.img.height / player.img.width;
  const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, pct);
  const sp = player.speed / MAX_SPEED;
  const bumpy = zoneOf(seg, player.x) === 'grass' ? 4 : 1.2; // the footpath rides as smoothly as the road
  const bounce = player.crash > 0 || player.y > 0 ? 0 : (Math.random() - 0.5) * bumpy * sp * 2;
  const lift = scale * player.y * H / 2, ground = H / 2 - (scale * camY * H / 2); // in a jump the auto rises above its shadow
  const y = ground - destH + bounce - lift;
  if (player.inv > 0 && Math.floor(player.inv * 10) % 2) return;
  if (lift > 2) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(W / 2, ground - 4, destW * 0.42, destW * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
  drawTuk(player.img, W / 2 - destW / 2, y, destW, destH, player.rot, player.atk, player.hurt, player);
}

// ------------------------------------------------------------------ HUD & screens
function text(str, x, y, size, color = '#fff', align = 'center', font = FONT, stroke = true) {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function panel(x, y, w, h, a = 0.45) { ctx.fillStyle = `rgba(10,5,20,${a})`; rr(ctx, x, y, w, h, 10); ctx.fill(); }
function bar(x, y, w, h, pct, color, label) {
  panel(x - 6, y - 22, w + 12, h + 30, 0.45);
  text(label, x, y - 10, 13, '#fff', 'left');
  ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(ctx, x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = color; rr(ctx, x, y, Math.max(0, w * clamp(pct, 0, 1)), h, 4); ctx.fill();
}

// on touch devices the on-screen buttons sit in the bottom corners, so the HUD moves to the top
const touchUI = () => { const t = document.getElementById('touch'); return !!t && t.classList.contains('on'); };
function drawHUD() {
  const rank = currentRank(), total = rivals.length + 1, touch = touchUI();
  panel(12, 12, 190, 84);
  text(`${rank}`, 24, 50, 44, rank <= 3 ? '#ffeb3b' : '#fff', 'left');
  text(`/${total}`, 24 + ctx.measureText(`${rank}`).width + 4, 58, 18, '#ddd', 'left');
  text(fmtTime(raceTime), 190, 34, 18, '#fff', 'right');
  text(`TRACK ${level + 1}`, 190, 58, 12, '#ffcc80', 'right');
  text(`KO ${player.kos}`, 190, 80, 12, '#ff8a80', 'right');
  if (player.drift && player.driftPts >= 1) text(`DRIFT ${Math.round(player.driftPts)}`, W / 2, 90, 22, '#ffd21f');
  if (stats.chain > 1 && player.boostT > 0 && def.handling.slipstream > 0) text(`SLIPSTREAM \u00d7${stats.chain}`, W / 2, 114, 16, '#80deea');
  if (touch) text(`${Math.round(player.speed / MAX_SPEED * KMH)} KM/H`, 24, 84, 11, '#ffd21f', 'left');
  else {
    text('ESC MENU', 24, 84, 9, 'rgba(255,255,255,.55)', 'left');
    panel(W - 212, 12, 200, 60);
    text(fmtCash(cash), W - 24, 34, 20, '#a5d6a7', 'right');
    text(def.name, W - 24, 58, 10, '#ffcc80', 'right');
  }

  // progress strip
  const px = W / 2 - 170, pw = 340, py = 26;
  panel(px - 10, 12, pw + 20, 30, 0.4);
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(px, py - 1, pw, 3);
  const prog = a => clamp((a.dist - startZ + 400) / (finishDist - startZ + 400), 0, 1);
  for (const r of rivals) { ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(px + pw * prog(r), py, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = '#1e9e4a'; ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2;
  const ppx = px + pw * prog(player); ctx.beginPath(); ctx.moveTo(ppx, py - 9); ctx.lineTo(ppx + 7, py + 6); ctx.lineTo(ppx - 7, py + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  text('🏁', px + pw + 2, py, 14, '#fff', 'left', 'sans-serif', false);

  // health
  if (touch) bar(24, 126, 166, 12, player.health / 100, player.health > 35 ? '#66bb6a' : '#ef5350', 'YOUR AUTO');
  else bar(24, H - 44, 200, 14, player.health / 100, player.health > 35 ? '#66bb6a' : '#ef5350', 'YOUR AUTO');
  // tip warning
  if (Math.abs(player.lean) > 0.7 && player.crash <= 0 && state === 'race') {
    const a = 0.6 + Math.sin(performance.now() / 70) * 0.4;
    ctx.globalAlpha = a; text(player.tip > 0 ? '⚠ TIPPING! SLOW DOWN' : '⚠ EASY ON THE TURN', W / 2, H - 290, 22, '#ff5252'); ctx.globalAlpha = 1;
  }
  // nearest rival
  let near = null, nd = 1600;
  for (const r of rivals) { const d = Math.abs(r.dist - player.dist); if (d < nd) { nd = d; near = r; } }
  if (near) bar(touch ? W - 206 : W - 250, touch ? 116 : H - 110, touch ? 180 : 200, 12, near.ko > 0 ? 0 : near.health / 100, near.ko > 0 ? '#9e9e9e' : '#ffa726', near.ko > 0 ? `${near.name} (KO)` : rivalLabel(near));

  // speedometer (touch devices show km/h in the top-left panel instead)
  if (touch) return;
  const cx = W - 80, cy = H - 26, R = 58;
  panel(cx - R - 12, cy - R - 14, R * 2 + 24, R + 36, 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, 0); ctx.stroke();
  const sp = player.speed / MAX_SPEED, dial = clamp(sp / def.handling.topSpeed, 0, 1); // full dial = this track's top speed
  ctx.strokeStyle = player.boostT > 0 ? '#80deea' : dial > 0.85 ? '#ff7043' : '#ffd21f'; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, Math.PI + Math.PI * dial); ctx.stroke();
  const na = Math.PI + Math.PI * dial; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (R - 14), cy + Math.sin(na) * (R - 14)); ctx.stroke();
  text(`${Math.round(sp * KMH)}`, cx, cy - 20, 22, '#fff');
  text('KM/H', cx, cy - 4, 9, '#ccc');
}

function drawBubbles() {
  for (const b of bubbles) {
    let x, y;
    if (b.who.isPlayer) { x = (playerScr ? playerScr.x : W / 2) + 60; y = playerScr ? playerScr.top - 6 : H - 270; }
    else { const s = b.who.scr; if (!s || s.frame !== frameNo || s.w < 30) continue; x = s.x; y = s.y - 6; }
    ctx.save(); ctx.globalAlpha = clamp(b.t * 3, 0, 1);
    ctx.font = `14px ${FONT}`;
    const tw = ctx.measureText(b.text).width, bw = tw + 22, bh = 30;
    const bx = clamp(x - bw / 2, 8, W - bw - 8), by = y - bh - 14;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, bx + 3, by + 3, bw, bh, 12); ctx.fill();
    ctx.fillStyle = b.hawker ? '#fff3c4' : '#fffdf4'; rr(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(clamp(x, bx + 14, bx + bw - 14) - 8, by + bh - 1); ctx.lineTo(clamp(x, bx + 14, bx + bw - 14) + 8, by + bh - 1); ctx.lineTo(x, by + bh + 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; rr(ctx, bx, by, bw, bh, 12); ctx.stroke();
    text(b.text, bx + bw / 2, by + bh / 2 + 1, 14, b.hawker ? '#e65100' : b.who.isPlayer ? '#1b5e20' : '#b71c1c', 'center', FONT, false);
    ctx.restore();
  }
}
function drawPopups() {
  for (const p of popups) {
    const k = 1 - p.t / 0.9, s = k < 0.15 ? lerp(0.4, 1.2, k / 0.15) : 1;
    ctx.save(); ctx.globalAlpha = clamp(p.t * 2, 0, 1); ctx.translate(p.x, p.y); ctx.rotate(-0.08); ctx.scale(s, s);
    text(p.text, 0, 0, p.size, p.color); ctx.restore();
  }
}
function drawMessages() {
  messages.forEach((m, i) => {
    const k = m.dur - m.t, s = k < 0.2 ? lerp(0.5, 1, k / 0.2) : 1;
    ctx.save(); ctx.globalAlpha = clamp(m.t * 2, 0, 1); ctx.translate(W / 2, 150 + i * 44); ctx.scale(s, s);
    text(m.text, 0, 0, 30, m.color); ctx.restore();
  });
}
function drawCountdown() {
  const c = Math.ceil(countdown), k = countdown - Math.floor(countdown);
  ctx.save(); ctx.translate(W / 2, H / 2 - 60); ctx.scale(1 + k * 0.6, 1 + k * 0.6); ctx.globalAlpha = clamp(k * 2, 0, 1);
  text(String(c), 0, 0, 90, c === 1 ? '#66bb6a' : c === 2 ? '#ffca28' : '#ef5350'); ctx.restore();
  text(def.name, W / 2, H / 2 + 20, 24, '#ffcc80');
  text(`Finish top 3 to qualify  ·  ${rivals.length} rival autos`, W / 2, H / 2 + 52, 14, '#fff', 'center', 'system-ui, sans-serif');
  text(LAYOUTS[layoutIdx].label, W / 2, H / 2 + 80, 14, '#ffd21f');
  const me = player.driver; // who you are in this city
  if (me && me.tag) text(`YOU ARE ${me.name} OF ${me.cityName}: ${me.tag}`, W / 2, H / 2 + 106, 13, '#ffcc80', 'center', 'system-ui, sans-serif');
}
function keycap(x, y, label, w = 40, hot = false) {
  ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(ctx, x - w / 2, y - 16, w, 36, 7); ctx.fill();
  ctx.fillStyle = hot ? '#ffd21f' : '#f3efe6'; rr(ctx, x - w / 2, y - 18, w, 34, 7); ctx.fill();
  text(label, x, y - 1, label.length > 2 ? 11 : 15, '#1a1a1a', 'center', FONT, false);
}
// Two-hand controls diagram for the current layout.
function drawControls(top) {
  const L = LAYOUTS[layoutIdx], arrowsDrive = L.id === 'arrows';
  const cap = c => ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'SPACE' }[c] || c.replace('Key', ''));
  const drive = cx => {
    text('DRIVE', cx, top + 18, 14, '#8bc34a');
    keycap(cx, top + 50, cap(L.up[0])); keycap(cx - 46, top + 90, cap(L.left[0])); keycap(cx, top + 90, cap(L.down[0])); keycap(cx + 46, top + 90, cap(L.right[0]));
    text('gas · brake · steer', cx, top + 120, 12, '#ddd', 'center', 'system-ui, sans-serif');
    text('SPACE handbrake: steer + SPACE to drift', cx, top + 135, 11, '#ffcc80', 'center', 'system-ui, sans-serif');
  };
  const fight = cx => {
    text('HIT', cx, top + 18, 14, '#ff8a65');
    keycap(cx - 34, top + 60, cap(L.hitL[0]), 44, true); keycap(cx + 34, top + 60, cap(L.hitR[0]), 44, true);
    text('◀ left', cx - 34, top + 88, 11, '#ddd', 'center', 'system-ui, sans-serif');
    text('right ▶', cx + 34, top + 88, 11, '#ddd', 'center', 'system-ui, sans-serif');
    text(`horn: ${cap(L.horn[0])} · ${cap(L.horn[1])}`, cx, top + 120, 12, '#ddd', 'center', 'system-ui, sans-serif');
  };
  panel(W / 2 - 300, top, 600, 176, 0.55);
  text('LEFT HAND', W / 2 - 150, top + 2 + 150, 10, '#aaa'); text('RIGHT HAND', W / 2 + 150, top + 2 + 150, 10, '#aaa');
  if (arrowsDrive) { fight(W / 2 - 150); drive(W / 2 + 150); } else { drive(W / 2 - 150); fight(W / 2 + 150); }
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2, top + 14); ctx.lineTo(W / 2, top + 160); ctx.stroke();
  text(`TAB: switch hands  ·  C camera  ·  P pause  ·  V sound mixer  ·  M mute  ·  N music`, W / 2, top + 168, 11, '#ffcc80', 'center', 'system-ui, sans-serif');
}
const TITLE_DRIVER_ROW = { x: W / 2 - 250, y: 439, w: 500, h: 40 }; // tap or click: left half previous driver, right half next
function drawTitle() {
  ctx.fillStyle = 'rgba(10,5,20,.45)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, 110); ctx.rotate(-0.04);
  text('ROAD RASH', 0, 0, 84, '#ffd21f'); ctx.restore();
  ctx.save(); ctx.translate(W / 2, 178); ctx.rotate(-0.04);
  text('RICKSHAW RUMBLE', 0, 0, 38, '#4caf50'); ctx.restore();
  drawControls(222);
  const a = 0.5 + Math.sin(performance.now() / 250) * 0.5;
  ctx.globalAlpha = 0.4 + a * 0.6; text('PRESS ENTER TO RACE', W / 2, 496, 24, '#fff'); ctx.globalAlpha = 1;
  // track selector
  const canL = level > 0, canR = level < unlocked;
  panel(W / 2 - 250, 398, 500, TITLE_DRIVER_ROW.y + TITLE_DRIVER_ROW.h - 398, 0.55);
  text('\u25c0', W / 2 - 232, 420, 16, canL ? '#ffd21f' : 'rgba(255,255,255,.2)');
  text('\u25b6', W / 2 + 232, 420, 16, canR ? '#ffd21f' : 'rgba(255,255,255,.2)');
  text(def.name, W / 2, 412, 16, '#fff');
  const b = titleBest, wins = b.wins ? `  \u00b7  ${b.wins} WIN${b.wins > 1 ? 'S' : ''}` : '';
  text(`${def.styleLabel}${b.bestTime === null ? '' : `  \u00b7  BEST ${fmtTime(b.bestTime)}`}${wins}`, W / 2, 429, 11, '#ffcc80');
  // driver selector: who you race as (their auto, weapon and voice)
  const me = player.driver, row = TITLE_DRIVER_ROW;
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(row.x + 14, row.y, row.w - 28, 1);
  text('\u25b2', W / 2 - 232, row.y + 12, 11, '#ffd21f'); text('\u25bc', W / 2 - 232, row.y + 27, 11, '#ffd21f');
  if (me) {
    ctx.drawImage(player.img, W / 2 - 214, row.y + 4, 34, 33);
    text(`YOU: ${me.name}  \u00b7  ${me.cityName}  \u00b7  ${weaponName(me.weapon)}`, W / 2 + 14, row.y + 13, 14, '#fff');
    text(me.tag, W / 2 + 14, row.y + 29, 11, '#ffcc80', 'center', 'system-ui, sans-serif');
  }
  text(`Race ${level + 1} of ${ORDER.length}  \u00b7  \u2190 \u2192 track  \u00b7  \u2191 \u2193 driver  \u00b7  Wallet ${fmtCash(cash)}${round ? `  \u00b7  Tour ${round + 1}` : ''}`, W / 2, 518, 12, '#ffcc80', 'center', 'system-ui, sans-serif');
  text('Engine: kalhan \u00b7 Chennai street: Nielsvdb \u00b7 Dog bark: AleXZavesa \u00b7 Horns: Anton (CC BY 4.0, freesound.org) \u00b7 Voices: AI4Bharat Indic Parler-TTS, Meta MMS-TTS (CC BY-NC 4.0)', W - 8, 534, 8, 'rgba(255,255,255,.45)', 'right', 'system-ui, sans-serif', false);
}
function drawChampion() {
  ctx.fillStyle = 'rgba(10,5,20,.55)'; ctx.fillRect(0, 0, W, H);
  text('🏆', W / 2, 140, 80, '#fff', 'center', 'sans-serif', false);
  text('AUTO KING OF INDIA!', W / 2, 240, 48, '#ffd21f');
  text(`You won all ${ORDER.length} races across India. Wallet: ${fmtCash(cash)}`, W / 2, 300, 18, '#fff', 'center', 'system-ui, sans-serif');
  text('The next tour is tougher. Press ENTER', W / 2, 360, 20, '#ffcc80');
  text('ESC — MAIN MENU', W / 2, 392, 13, '#ddd');
}
function drawResults() {
  ctx.fillStyle = 'rgba(10,5,20,.6)'; ctx.fillRect(0, 0, W, H);
  const r = results;
  text(r.qualified ? 'QUALIFIED!' : 'NOT QUALIFIED', W / 2, 60, 44, r.qualified ? '#66bb6a' : '#ef5350');
  panel(W / 2 - 250, 96, 500, 30 + r.order.length * 28, 0.6);
  r.order.forEach((a, i) => {
    const y = 118 + i * 28, me = a === player;
    if (me) { ctx.fillStyle = 'rgba(255,210,31,.2)'; ctx.fillRect(W / 2 - 244, y - 13, 488, 26); }
    text(ordinal(i + 1), W / 2 - 220, y, 16, i < 3 ? '#ffd21f' : '#fff', 'left');
    ctx.fillStyle = me ? '#1e9e4a' : a.color; ctx.beginPath(); ctx.arc(W / 2 - 150, y, 7, 0, Math.PI * 2); ctx.fill();
    text(me ? 'YOU' : rivalLabel(a), W / 2 - 132, y, 16, me ? '#ffd21f' : '#fff', 'left');
    text(a.finished ? fmtTime(a.time) : '—', W / 2 + 220, y, 16, '#ddd', 'right');
  });
  const by = 140 + r.order.length * 28;
  const s = r.stats, star = on => (on ? ' \u2605' : '');
  const time = s.time === null ? '\u2014' : fmtTime(s.time) + (r.beaten.time ? ' \u2605 NEW BEST' : `  (best ${fmtTime(r.best.bestTime)})`);
  text(`Time ${time}   \u00b7   Drift ${Math.round(s.driftScore)}${star(r.beaten.drift)}   \u00b7   Close passes ${s.passes}${star(r.beaten.passes)}   \u00b7   Jumps ${s.jumps}`, W / 2, by + 4, 14, '#ffcc80', 'center', 'system-ui, sans-serif');
  text(`Prize ${fmtCash(r.prize)}  +  KO ${fmtCash(r.bonus)}  +  Drift ${fmtCash(r.skill.drift)}  +  Lane surf ${fmtCash(r.skill.passes)}  +  Jumps ${fmtCash(r.skill.jumps)}  =  ${fmtCash(r.prize + r.bonus + r.skill.drift + r.skill.passes + r.skill.jumps)}`, W / 2, by + 28, 14, '#a5d6a7', 'center', 'system-ui, sans-serif');
  text(`Wallet: ${fmtCash(cash)}`, W / 2, by + 54, 18, '#fff');
  const a = 0.5 + Math.sin(performance.now() / 250) * 0.5;
  ctx.globalAlpha = 0.4 + a * 0.6;
  text(r.qualified ? (level + 1 >= ORDER.length ? 'ENTER — CLAIM YOUR CROWN' : `ENTER — NEXT: ${RRR.tracks.get(ORDER[level + 1]).name}`) : 'ENTER — TRY AGAIN (TOP 3 NEEDED)', W / 2, by + 90, 20, '#ffd21f');
  ctx.globalAlpha = 1;
  text('ESC — MAIN MENU', W / 2, by + 116, 13, '#ddd');
}
// a pack is broken: engine/registry.js names the track and field, shown in place of the title screen
function drawConfigError() {
  ctx.fillStyle = '#1a0f1f'; ctx.fillRect(0, 0, W, H);
  text('TRACK CONFIG ERROR', W / 2, 120, 36, '#ef5350');
  CONFIG_PROBLEMS.slice(0, 10).forEach((p, i) => text(p, W / 2, 190 + i * 26, 14, '#fff', 'center', 'system-ui, sans-serif'));
  if (CONFIG_PROBLEMS.length > 10) text(`and ${CONFIG_PROBLEMS.length - 10} more`, W / 2, 190 + 10 * 26, 14, '#ffcc80', 'center', 'system-ui, sans-serif');
  if (CONFIG_PROBLEMS.some(p => p.includes('failed to load'))) // a download failed, not a typo: it is the player's problem to retry
    text('Check your connection and reload the page.', W / 2, 190 + (Math.min(CONFIG_PROBLEMS.length, 10) + (CONFIG_PROBLEMS.length > 10 ? 1 : 0)) * 26, 14, '#ffcc80', 'center', 'system-ui, sans-serif');
}
const pauseItemRect = i => ({ x: W / 2 - 170, y: 100 + i * 44, w: 340, h: 36 });
// tell players why they might hear nothing
function drawSoundHint() {
  let t = null;
  if (Sfx.problem) t = '\u26a0 ' + Sfx.problem;
  else if (!Sfx.running) t = '\ud83d\udd0a Tap or press any key to turn on sound';
  else if (Sfx.muted) t = '\ud83d\udd07 Sound muted: press M (or \ud83d\udd0a) to change';
  else if (isIOS && !navigator.audioSession && state === 'title') t = 'iPhone: no sound? Switch off silent mode';
  if (!t) return;
  ctx.font = '13px system-ui, sans-serif'; const w = ctx.measureText(t).width + 24;
  panel(W / 2 - w / 2, state === 'title' ? 8 : 48, w, 26, 0.7);
  text(t, W / 2, (state === 'title' ? 8 : 48) + 13, 13, '#fff', 'center', 'system-ui, sans-serif', false);
}
function drawPaused() {
  ctx.fillStyle = 'rgba(12,6,20,.86)'; ctx.fillRect(0, 0, W, H);
  text('PAUSED', W / 2, 66, 50, '#fff');
  PAUSE_MENU.forEach((m, i) => {
    const r = pauseItemRect(i), sel = i === pauseSel;
    ctx.fillStyle = sel ? '#ffd21f' : 'rgba(255,255,255,.1)'; rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    text((sel ? '\u25b6  ' : '') + m.label, W / 2, r.y + r.h / 2 + 1, 18, sel ? '#1a1a1a' : '#fff', 'center', FONT, !sel);
  });
  text('\u2191 \u2193 choose  \u00b7  ENTER select  \u00b7  ESC resume  \u00b7  TAB switch hands', W / 2, 286, 12, '#ffcc80', 'center', 'system-ui, sans-serif');
  drawControls(300);
}
const mixRow = i => ({ x: W / 2 - 250, y: 124 + i * 58, w: 500, h: 50 });
const mixBar = i => { const r = mixRow(i); return { x: r.x + 220, y: r.y + 19, w: 200, h: 14 }; };
const mixDone = { x: W / 2 - 80, y: 124 + MIXER.length * 58 + 6, w: 160, h: 40 };
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function drawMixer() {
  ctx.fillStyle = 'rgba(12,6,20,.9)'; ctx.fillRect(0, 0, W, H);
  text('SOUND MIXER', W / 2, 70, 40, '#ffd21f');
  text(Sfx.muted ? '\ud83d\udd07 muted: press M to unmute' : '\u2191 \u2193 choose  \u00b7  \u2190 \u2192 adjust  \u00b7  or tap the bars', W / 2, 106, 13, Sfx.muted ? '#ff8a80' : '#ffcc80', 'center', 'system-ui, sans-serif');
  MIXER.forEach(([k, label, sub], i) => {
    const r = mixRow(i), b = mixBar(i), sel = i === mixer.sel, v = Sfx.vol[k];
    ctx.fillStyle = sel ? 'rgba(255,210,31,.18)' : 'rgba(255,255,255,.06)'; rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    text(label, r.x + 18, r.y + (sub ? 20 : r.h / 2), 16, sel ? '#ffd21f' : '#fff', 'left');
    if (sub) text(sub, r.x + 18, r.y + 38, 11, '#bbb', 'left', 'system-ui, sans-serif');
    ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(ctx, b.x, b.y, b.w, b.h, 7); ctx.fill();
    ctx.fillStyle = sel ? '#ffd21f' : '#8bc34a'; rr(ctx, b.x, b.y, Math.max(b.h, b.w * v), b.h, 7); ctx.fill();
    text(`${Math.round(v * 100)}%`, r.x + r.w - 18, r.y + r.h / 2, 15, '#fff', 'right');
  });
  ctx.fillStyle = '#ffd21f'; rr(ctx, mixDone.x, mixDone.y, mixDone.w, mixDone.h, 10); ctx.fill();
  text('DONE', W / 2, mixDone.y + mixDone.h / 2 + 1, 18, '#1a1a1a', 'center', FONT, false);
}
// mouse / trackpad / taps on the pause menu and the mixer
canvas.addEventListener('click', e => {
  const b = canvas.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  if (mixer) {
    if (inRect(x, y, mixDone)) { mixer = null; return; }
    MIXER.forEach(([k], i) => {
      const bar = mixBar(i);
      if (inRect(x, y, { x: bar.x - 10, y: bar.y - 14, w: bar.w + 20, h: bar.h + 28 })) { mixer.sel = i; Sfx.setVol(k, (x - bar.x) / bar.w); }
      else if (inRect(x, y, mixRow(i))) mixer.sel = i;
    });
    return;
  }
  if (state === 'title' && !paused && inRect(x, y, TITLE_DRIVER_ROW)) { cycleDriver(x < W / 2 ? -1 : 1); return; }
  if (!paused) return;
  PAUSE_MENU.forEach((m, i) => { const r = pauseItemRect(i); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) runCommand(m.cmd); });
});
canvas.addEventListener('mousemove', e => {
  if (!paused || mixer) return;
  const b = canvas.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  PAUSE_MENU.forEach((m, i) => { const r = pauseItemRect(i); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) pauseSel = i; });
});

// ------------------------------------------------------------------ layout & loop
const PORTRAIT_PANEL = 220;
function fit() {
  const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
  const s = Math.min(innerWidth / W, (innerHeight - (portrait ? PORTRAIT_PANEL : 0)) / H);
  for (const c of [canvas, bgCanvas, glCanvas]) if (c) { c.style.width = `${Math.floor(W * s)}px`; c.style.height = `${Math.floor(H * s)}px`; }
  for (const c of [bgCanvas, glCanvas]) if (c) { c.style.left = `${canvas.offsetLeft}px`; c.style.top = `${canvas.offsetTop}px`; }
}
addEventListener('resize', fit);

buildSharedSprites();
use3D = !/[?&]2d\b/.test(location.search) && (!IS_MOBILE || /[?&]3d\b/.test(location.search)) && !!(window.World3D && glCanvas && bgCtx &&
  guard('renderer', () => World3D.init(glCanvas, { W, H, ROAD_W, SEG_LEN, quality: QUALITY, maxPixelRatio: { smooth: 1.25, high: 1.75, ultra: 2 }[QUALITY] })));
if (!use3D) disable3D(); else World3D.setCamera(store.get('camera', 'heli'));
fit();
if (CONFIG_PROBLEMS.length) { // no track can be loaded: say what is wrong and stop here
  state = 'config-error'; disable3D(); drawConfigError();
  reportError('config', CONFIG_PROBLEMS[0]);
  return;
}
store.set('track', ORDER[level]);
try { attractSetup(); } catch (err) { // a pack the checks let through still broke the build: say so instead of a black canvas
  CONFIG_PROBLEMS.push(`could not build the first track: ${err && err.message}`);
  state = 'config-error'; disable3D(); drawConfigError();
  reportError('config', CONFIG_PROBLEMS[0], err, 'boot');
  return;
}
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  try { step(now); } catch (err) { reportError(componentOf(err) || 'game-loop', err && err.message, err, 'frame'); }
}
function step(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
  else Sfx.setEngine(0, false);
  render();
}
requestAnimationFrame(frame);
// expose for debugging
window.__rrr = { get state() { return state; }, player, drivers: DRIVERS, pickGrid, homeDriver, cycleDriver, get rivals() { return rivals; }, get results() { return results; }, setupRace,
  step(n) { for (let i = 0; i < n; i++) update(STEP); render(); }, keys, Sfx, Music, Ambience, VehicleAudio, VoiceClips, Animals, RRR, get def() { return def; }, get stats() { return stats; }, records, SP, get traffic() { return traffic; }, get segments() { return segments; }, get bubbles() { return bubbles; }, get junctions() { return junctions; }, get cross() { return crossTraffic; }, get marks() { return skidMarks; }, DriftMusic, lightOf, setLevel(l) { level = l; attractSetup(); } };
})();
