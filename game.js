'use strict';
// Road Rash: Rickshaw Rumble — a pseudo-3D combat racer where you drive an auto-rickshaw.
(() => {
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
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
const TUK_NW = 0.27; // auto-rickshaw width, normalised to half road width
const FONT = '"Bungee", Impact, "Arial Black", sans-serif';

const TRACKS = [
  { name: 'MUMBAI · MARINE DRIVE', theme: 'marine', length: 2600, laps: 1, rivals: 5, skill: 0.86, traffic: 34, cows: 8, dogs: 14, seed: 11 },
  { name: 'HYDERABAD · CHARMINAR ROAD', theme: 'hyderabad', length: 2800, laps: 1, rivals: 6, skill: 0.88, traffic: 40, cows: 12, dogs: 18, seed: 37 },
  { name: 'MUMBAI · BANDRA-WORLI SEA LINK', theme: 'sealink', length: 3000, laps: 1, rivals: 6, skill: 0.9, traffic: 46, cows: 0, dogs: 0, seed: 27 },
  { name: 'DELHI · RING ROAD', theme: 'delhi', length: 3100, laps: 1, rivals: 7, skill: 0.92, traffic: 50, cows: 16, dogs: 18, seed: 61 },
  { name: 'MUMBAI · WESTERN EXPRESS HIGHWAY', theme: 'express', length: 3200, laps: 1, rivals: 7, skill: 0.94, traffic: 52, cows: 14, dogs: 12, seed: 53 },
  { name: 'CHENNAI · MARINA BEACH ROAD', theme: 'chennai', length: 3400, laps: 1, rivals: 7, skill: 0.96, traffic: 44, cows: 16, dogs: 20, seed: 73 },
  { name: 'MUMBAI · JUHU BEACH ROAD', theme: 'juhu', length: 3600, laps: 1, rivals: 7, skill: 0.97, traffic: 44, cows: 18, dogs: 18, seed: 91 },
];
const PRIZES = [1500, 1000, 700, 400, 200, 100, 50, 0];
const RIVAL_NAMES = ['RAJU', 'PAPPU', 'BABLU', 'CHINTU', 'MUNNA', 'GUDDU', 'TINKU', 'BUNTY', 'SONU', 'LALLU'];
const RIVAL_COLORS = [
  { body: '#1a1a1a', trim: '#f5c400', canopy: '#f5c400', plate: 'MH 02 AU' },
  { body: '#1f64c8', trim: '#ffffff', canopy: '#141414', plate: 'KA 05 RR' },
  { body: '#d7263d', trim: '#ffd166', canopy: '#141414', plate: 'UP 32 BT' },
  { body: '#ff7b00', trim: '#111111', canopy: '#2b2b2b', plate: 'RJ 14 PK' },
  { body: '#8e44ad', trim: '#f1c40f', canopy: '#141414', plate: 'TN 09 MA' },
  { body: '#f06292', trim: '#ffffff', canopy: '#141414', plate: 'GA 07 SU' },
  { body: '#00a896', trim: '#fff3b0', canopy: '#1a1a1a', plate: 'WB 04 KO' },
];
const HIT_WORDS = ['DHISHOOM!', 'DHISHKYAON!', 'THAPPAD!', 'DHAMAKA!', 'BAM!'];
// Roadside hawkers call out to passing autos in the city's street lingo.
const HAWKER_CALLS = {
  mumbai: ['VADA PAV! GARAM GARAM!', 'CUTTING CHAI, BOSS!', 'BHEL PURI LE LO!', 'PAV BHAJI, EKDUM FRESH!', 'NIMBU PAANI THANDA!'],
  hyderabad: ['IRANI CHAI, AAO MIYAN!', 'HALEEM GARAM HAI!', 'BIRYANI KHAO NA!', 'OSMANIA BISCUIT LE LO!', 'MIRCHI BAJJI, HAU!'],
  delhi: ['CHOLE BHATURE, AA JAO!', 'GOLGAPPE BHAIYA!', 'RABDI JALEBI, GARMA GARAM!', 'MOMOS, PAAJI!', 'CHAI PEE LO, YAAR!'],
  chennai: ['KAAPI! KAAPI!', 'SUNDAL, SUNDAL!', 'IDLI VADAI, VAANGA!', 'MURUKKU, SAAPDUNGA!', 'ELANEER, ELANEER!'],
};
// What a driver shouts after taking a lathi hit, in the local street slang of the race's city.
const CURSES = {
  mumbai: ['ABE O HERO!', 'KYA RE, DIMAAG KHARAB?', 'AYE BHIDU, SAMBHAL KE!', 'APUN KO MAARA?!', 'CHAL NIKAL!', 'WAAT LAGA DUNGA!', 'GHANTA!'],
  hyderabad: ['KYA RE MIYAN!', 'NAKKO RE!', 'HAU, AB DEKH!', 'EK DENGA NA!', 'KAIKU MAARA?!', 'CHUP BAITH!', 'BAIGAN!'],
  delhi: ['OYE! JAANTA HAI MERA BAAP KAUN HAI?', 'ABEY OYE!', 'KYA KAR RAHA HAI YAAR!', 'TERI TOH...!', 'BADTAMEEZ!', 'OYE HOYE!', 'BHAI SAHAB, DHANG SE!'],
  chennai: ['DEI!', 'ENNA DA?!', 'PODA!', 'AIYYO!', 'ENNA MACHAAN?!', 'SUMMA IRU DA!', 'ITHU TOO MUCH DA!'],
};

// Each theme picks a city skyline (SKYLINES) plus sky, road colours and city-specific billboards.
// `sea` is the band at the foot of the skyline: sea, lake or lawns depending on the city.
const MUMBAI_ADS = [['CUTTING CHAI', '₹10 ONLY'], ['VADA PAV', 'KING']];
const THEMES = {
  marine: { city: 'mumbai', ads: MUMBAI_ADS, // sunset over the Queen's Necklace
    sky: ['#2b1e5a', '#c2477a', '#ffae5a'], sun: '#ffe2a0', fog: '#c96a7a', sea: '#5a4f8a',
    far: '#7a4a7e', near: '#3b2350', lights: 0.35, density: 0.4,
    light: { road: '#5b5860', grass: '#6b6158', rumble: '#f2f2f2', lane: '#eeeeee', shoulder: '#8a8078' },
    dark: { road: '#56535b', grass: '#655b52', rumble: '#c62828', shoulder: '#837a72' },
    buildings: ['#f4d35e', '#ee964b', '#8ecae6', '#f28482', '#cdb4db', '#e9edc9'],
    scenery: { palm: 4, building: 5, billboard: 2, tree: 1, chai: 1 },
  },
  sealink: { city: 'mumbai', ads: MUMBAI_ADS, ambience: false, // night on the bridge, the sea either side
    sky: ['#050816', '#141c3d', '#2c3a6b'], sun: '#f4f1de', night: true, fog: '#1d2748', sea: '#0e1a33',
    far: '#26325a', near: '#141b36', lights: 0.6, density: 0.06,
    light: { road: '#3c3d44', grass: '#10223f', rumble: '#e0e0e0', lane: '#d8d8d8', shoulder: '#6b6f78' },
    dark: { road: '#393a41', grass: '#0e1f3a', rumble: '#c62828', shoulder: '#666a73' },
    buildings: ['#455a64'],
    scenery: { billboard: 1 },
  },
  express: { city: 'mumbai', ads: MUMBAI_ADS, // hazy afternoon traffic
    sky: ['#8e9aa3', '#d9c9a3', '#f3e0b0'], sun: '#fff6d0', fog: '#cfc3a3', sea: '#9aa7a8',
    far: '#b3ab96', near: '#8a8070', lights: 0, density: 0.45,
    light: { road: '#5e5e5e', grass: '#7d7a45', rumble: '#f5c400', lane: '#f2f2f2', shoulder: '#a39a7c' },
    dark: { road: '#595959', grass: '#76733f', rumble: '#141414', shoulder: '#9c9376' },
    buildings: ['#e9c46a', '#f4a261', '#e76f51', '#dcd3c0', '#a8dadc', '#f1faee'],
    scenery: { tree: 3, building: 6, billboard: 3, temple: 1, chai: 1 },
  },
  juhu: { city: 'mumbai', ads: MUMBAI_ADS, // bright morning by the beach
    sky: ['#1e78e0', '#87cefa', '#e0f7ff'], sun: '#ffffff', fog: '#bfe3f0', sea: '#3f8fc4',
    far: '#8fb0c8', near: '#5d7d96', lights: 0, density: 0.4,
    light: { road: '#5a5a5e', grass: '#e2cf9e', rumble: '#ffffff', lane: '#f5f5f5', shoulder: '#cdb98c' },
    dark: { road: '#555559', grass: '#dcc896', rumble: '#e53935', shoulder: '#c6b284' },
    buildings: ['#ffe066', '#70c1b3', '#f25f5c', '#ffffff', '#b8f2e6', '#ffa69e'],
    scenery: { palm: 6, tree: 1, chai: 2, billboard: 1, building: 1 },
  },
  hyderabad: { city: 'hyderabad', // golden hour over the old city and Hussain Sagar
    sky: ['#3d2a5c', '#e0785a', '#ffc46b'], sun: '#fff0c0', fog: '#d98a6a', sea: '#5a6f96',
    far: '#9a6474', near: '#4a2f45', lights: 0.25, density: 0.42,
    light: { road: '#5c5a5e', grass: '#8b7355', rumble: '#f5c400', lane: '#eeeeee', shoulder: '#a08a70' },
    dark: { road: '#57555a', grass: '#846c50', rumble: '#1a1a1a', shoulder: '#99836a' },
    buildings: ['#f2d7a7', '#e8b27a', '#d4a5a5', '#a3c4bc', '#f4e1c1', '#c9a0dc'],
    scenery: { building: 5, tree: 2, billboard: 2, chai: 2 },
    ads: [['HYDERABADI', 'BIRYANI'], ['IRANI CHAI', '& OSMANIA'], ['PEARL CITY', 'JEWELLERS']],
  },
  delhi: { city: 'delhi', // hazy winter morning
    sky: ['#6f8fb0', '#c9d6e0', '#f0ede4'], sun: '#fffdf2', fog: '#d8dcdc', sea: '#6f8a4a',
    far: '#a3acb4', near: '#6a6f78', lights: 0, density: 0.45,
    light: { road: '#5e5e62', grass: '#6f8a4a', rumble: '#ffffff', lane: '#f2f2f2', shoulder: '#b0a890' },
    dark: { road: '#59595d', grass: '#688345', rumble: '#c62828', shoulder: '#a8a088' },
    buildings: ['#e9c46a', '#f4a261', '#dcd3c0', '#c97b63', '#a8dadc', '#f1faee'],
    scenery: { tree: 4, building: 4, billboard: 2, temple: 1, chai: 1 },
    ads: [['CHOLE', 'BHATURE'], ['DILLI', 'DARSHAN'], ['PARANTHE', 'WALI GALI']],
  },
  chennai: { city: 'chennai', // blazing midday on the Marina
    sky: ['#0f6fd6', '#5fb8f5', '#fff4d6'], sun: '#fffbe6', fog: '#cfe8f0', sea: '#1f7fb0',
    far: '#86a9bf', near: '#4f6f86', lights: 0, density: 0.42,
    light: { road: '#5a5a5e', grass: '#e6d3a3', rumble: '#ffffff', lane: '#f5f5f5', shoulder: '#d6c291' },
    dark: { road: '#555559', grass: '#dfcb99', rumble: '#1a1a1a', shoulder: '#cfba88' },
    buildings: ['#ffe066', '#f28482', '#84dcc6', '#ffffff', '#ffb4a2', '#cdb4db'],
    scenery: { palm: 5, building: 2, chai: 2, billboard: 1, temple: 1 },
    ads: [['FILTER', 'KAAPI'], ['IDLI · DOSA', 'VADA'], ['SUPERSTAR', 'FILM TODAY!']],
  },
};

// ------------------------------------------------------------------ utils
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeIn = (a, b, p) => a + (b - a) * p * p;
const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
const pctRemaining = (n, total) => (n % total) / total;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
const overlap = (x1, w1, x2, w2) => !((x1 + w1 / 2) < (x2 - w2 / 2) || (x1 - w1 / 2) > (x2 + w2 / 2));
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
const fmtCash = n => '₹' + Math.round(n).toLocaleString('en-IN');
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function weightedPick(weights, r) {
  const entries = Object.entries(weights); let total = 0; for (const [, w] of entries) total += w;
  let x = r() * total; for (const [k, w] of entries) { if ((x -= w) < 0) return k; } return entries[0][0];
}
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

// ------------------------------------------------------------------ audio
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
  ctx: null, master: null, engine: null, muted: store.get('muted', false),
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const a = this.ctx;
    this.master = a.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(a.destination);
    const len = a.sampleRate; this.noiseBuf = a.createBuffer(1, len, a.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadSamples();
    Music.ensure();
    Ambience.ensure();
    if (a.audioWorklet) {
      const url = URL.createObjectURL(new Blob([TWO_STROKE_WORKLET], { type: 'application/javascript' }));
      a.audioWorklet.addModule(url).then(() => {
        const node = new AudioWorkletNode(a, 'two-stroke');
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
        node.connect(hp); hp.connect(this.master);
        this.engine = { worklet: node, rpm: node.parameters.get('rpm'), throttle: node.parameters.get('throttle'), level: node.parameters.get('level') };
      }).catch(() => this.fallbackEngine());
    } else this.fallbackEngine();
  },
  // simple oscillator engine for browsers without AudioWorklet
  fallbackEngine() {
    const a = this.ctx;
    const o = a.createOscillator(); o.type = 'square';
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 2;
    const eg = a.createGain(); eg.gain.value = 0;
    const lfo = a.createOscillator(); lfo.type = 'square'; const lg = a.createGain(); lg.gain.value = 0;
    lfo.connect(lg); lg.connect(eg.gain); o.connect(f); f.connect(eg); eg.connect(this.master); o.start(); lfo.start();
    this.engine = { o, f, eg, lfo, lg };
  },
  // Recorded engine (web/sounds.js): an idle loop and a rev loop, crossfaded by load and pitched by speed.
  // Until they decode (or if they fail) the synthesised two-stroke plays instead.
  loadSamples() {
    const src = window.RRR_SOUNDS; if (!src) return;
    const a = this.ctx, bufs = {};
    const decode = url => {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Promise((res, rej) => a.decodeAudioData(bytes.buffer, res, rej));
    };
    Promise.all(Object.entries(src).map(([k, url]) => decode(url).then(b => { bufs[k] = b; }))).then(() => {
      const loop = buf => { const n = a.createBufferSource(); n.buffer = buf; n.loop = true; const g = a.createGain(); g.gain.value = 0; n.connect(g); g.connect(this.master); n.start(); return { n, g }; };
      const idle = loop(bufs.idle), rev = loop(bufs.rev);
      this.samples = { idleSrc: idle.n, idleGain: idle.g, revSrc: rev.n, revGain: rev.g, start: bufs.start };
    }).catch(() => { this.samples = null; });
  },
  // kick-start at the beginning of a race; the loops fade in once it has caught
  startEngine() {
    const s = this.samples; if (!s || !this.ctx) return;
    const n = this.ctx.createBufferSource(); n.buffer = s.start;
    const g = this.ctx.createGain(); g.gain.value = 0.8; n.connect(g); g.connect(this.master); n.start();
    this.engineOnAt = this.ctx.currentTime + 1.6;
  },
  toggleMute() { this.muted = !this.muted; store.set('muted', this.muted); if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; },
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
    node.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, filter = 1000, delay = 0) {
    if (!this.ctx) return; const a = this.ctx, t = a.currentTime + delay;
    const s = a.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter;
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  },
  horn() { this.tone(380, 0.13, 'square', 0.16, 360, 0, 1800); this.tone(300, 0.22, 'square', 0.16, 280, 0.15, 1600); },
  hit() { this.noise(0.12, 0.5, 1400); this.tone(120, 0.2, 'sine', 0.55, 50); },
  whoosh() { this.noise(0.14, 0.12, 3500); },
  crash() { this.noise(0.8, 0.6, 700); this.tone(90, 0.6, 'sine', 0.5, 30); this.noise(0.3, 0.3, 4000, 0.1); },
  bump() { this.tone(90, 0.12, 'sine', 0.4, 60); this.noise(0.08, 0.2, 900); },
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
// Pitches are semitones above Sa (D3). Melodies loop every 32 steps, drum patterns every 16.
const SA_HZ = 146.83;
const SONGS = {
  mumbai: { bpm: 104, swing: 0, lead: 'harmonium', // filmi dholak groove
    drums: { dha: 'x.....x...x.....', na: '..x.x..x..x.x.x.', shaker: 'x.x.x.x.x.x.x.x.' },
    melody: [[0, 0, 2], [2, 2, 2], [4, 4, 2], [6, 7, 4], [10, 4, 2], [12, 2, 2], [14, 0, 2], [16, 4, 2], [18, 7, 2], [20, 9, 2], [22, 7, 4], [26, 4, 2], [28, 2, 2], [30, 0, 2]] },
  hyderabad: { bpm: 92, swing: 0.08, lead: 'harmonium', // qawwali: tabla, claps, harmonium in Kafi
    drums: { ghe: 'x.....x.x.......', na: '..x.x..x..x.x..x', clap: '....x.......x.x.' },
    melody: [[0, 7, 2], [2, 9, 2], [4, 10, 2], [6, 12, 6], [12, 10, 2], [14, 9, 2], [16, 7, 4], [20, 5, 2], [22, 7, 2], [24, 3, 2], [26, 2, 2], [28, 0, 4]] },
  delhi: { bpm: 100, swing: 0.14, lead: 'tumbi', // bhangra: dhol chaal and a tumbi riff
    drums: { dha: 'x.....x...x.....', na: '..x.x..xx.x.x.xx', clap: '....x.......x...' },
    melody: [[0, 12, 1], [2, 12, 1], [3, 14, 1], [4, 12, 1], [6, 10, 1], [8, 12, 1], [10, 7, 1], [11, 9, 1], [12, 10, 1], [14, 12, 1],
      [16, 12, 1], [18, 12, 1], [19, 14, 1], [20, 16, 1], [22, 14, 1], [24, 12, 1], [26, 10, 1], [28, 9, 1], [30, 7, 1], [31, 9, 1]] },
  chennai: { bpm: 124, swing: 0, lead: 'nadaswaram', // kuthu beat and a reed tune in Mohanam
    drums: { dha: 'x..x..x.x..x..x.', na: '.x.x.xx..x.x.xx.', shaker: 'xxxxxxxxxxxxxxxx' },
    melody: [[0, 7, 2], [2, 9, 2], [4, 12, 4], [8, 9, 2], [10, 7, 2], [12, 4, 4], [16, 2, 2], [18, 4, 2], [20, 7, 2], [22, 4, 2], [24, 2, 2], [26, 0, 6]] },
};
const Music = {
  on: store.get('music', true), city: null, bus: null, step: 0, next: 0, timer: null,
  hz(semi) { return SA_HZ * Math.pow(2, semi / 12); },
  ensure() {
    const a = Sfx.ctx; if (!a || !Sfx.master) return false;
    if (!this.bus) {
      this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.master);
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
    const a = Sfx.ctx, song = SONGS[this.city]; if (!a || !song) return;
    const vol = !this.on ? 0 : paused ? 0.1 : state === 'title' || state === 'champion' || state === 'results' ? 0.3 : 0.2;
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

// ------------------------------------------------------------------ street ambience
// Real market/street recordings per city (web/ambience-<city>.js, loaded on demand). The loop is
// played as overlapping copies with crossfades so there is no seam, and it swells near shops.
const Ambience = {
  city: null, bufs: {}, requested: {}, bus: null, next: 0, timer: null, sources: [],
  XF: 2,
  setCity(city) {
    if (city === this.city) return;
    this.city = city; this.stopAll();
    if (!this.requested[city]) {
      this.requested[city] = true;
      const tag = document.createElement('script'); tag.src = `ambience-${city}.js`; document.head.appendChild(tag);
    }
  },
  stopAll() { const a = Sfx.ctx; for (const s of this.sources) { try { s.g.gain.setTargetAtTime(0, a.currentTime, 0.3); s.n.stop(a.currentTime + 1.5); } catch (e) { /* not started */ } } this.sources = []; this.next = 0; },
  ensure() {
    const a = Sfx.ctx; if (!a || this.bus) return;
    this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.master);
    this.timer = setInterval(() => this.tick(), 200);
  },
  decode(city) {
    const url = (window.RRR_AMBIENCE || {})[city]; if (!url || this.bufs[city] !== undefined) return;
    this.bufs[city] = null;
    const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.bufs[city] = b; }, () => { this.bufs[city] = false; });
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
    const quiet = theme.ambience === false; // e.g. out on the Sea Link
    const base = paused ? 0.15 : state === 'title' || state === 'champion' ? 0.35 : 0.55;
    this.bus.gain.setTargetAtTime(quiet ? 0 : base * (0.55 + 0.45 * this.shopsNearby()), a.currentTime, 0.8);
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
function makeTuk(body, trim, canopy, plate) {
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
  g.fillStyle = trim; g.fillRect(15, 121, 210, 16);
  g.fillStyle = isLight(trim) ? '#111' : '#fff'; g.font = 'bold 11px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HORN OK PLEASE', 120, 129.5);
  for (const tx of [22, 196]) {
    g.fillStyle = '#7a0000'; rr(g, tx, 142, 22, 26, 5); g.fill();
    g.fillStyle = '#ff2b2b'; rr(g, tx + 3, 145, 16, 20, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; rr(g, tx + 5, 147, 6, 6, 2); g.fill();
  }
  g.fillStyle = '#ffd400'; rr(g, 86, 148, 68, 24, 3); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 1.5; rr(g, 86, 148, 68, 24, 3); g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 12px Arial, sans-serif'; g.fillText(plate, 120, 160.5);
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

function makeBus() {
  const c = mk(300, 340), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 150, 330, 146, 10); g.fill();
  g.fillStyle = '#111'; rr(g, 14, 290, 50, 44, 8); g.fill(); rr(g, 236, 290, 50, 44, 8); g.fill();
  // luggage on the roof
  g.fillStyle = '#555'; g.fillRect(24, 26, 252, 5);
  const bags = ['#8d6e63', '#1565c0', '#c62828', '#558b2f', '#f9a825'];
  let bx = 30; for (let i = 0; i < 7; i++) { const bw = 24 + (i * 13) % 20; g.fillStyle = bags[i % bags.length]; rr(g, bx, 8 + (i % 3) * 3, bw, 20 - (i % 3) * 3, 4); g.fill(); bx += bw + 6; }
  g.fillStyle = '#c62828'; rr(g, 8, 30, 284, 272, 16); g.fill();
  g.fillStyle = '#f3e2b3'; g.fillRect(8, 150, 284, 22);
  g.fillStyle = '#111'; rr(g, 70, 38, 160, 22, 3); g.fill();
  g.fillStyle = '#ffb300'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MUMBAI CST  ⇢', 150, 49.5);
  g.fillStyle = '#1c2833'; rr(g, 28, 66, 244, 80, 8); g.fill();
  g.fillStyle = '#0c1116'; for (const hx of [70, 120, 180, 230]) { ell(g, hx, 118, 13, 15); g.fill(); ell(g, hx, 150, 22, 16); g.fill(); }
  g.fillStyle = '#1c2833'; g.fillRect(28, 140, 244, 6);
  g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(28, 120); g.lineTo(90, 66); g.lineTo(120, 66); g.lineTo(40, 146); g.lineTo(28, 146); g.fill();
  g.fillStyle = '#c62828'; g.font = 'bold 13px Arial'; g.fillText('STATE TRANSPORT', 150, 161.5);
  // ladder
  g.strokeStyle = '#bdbdbd'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(248, 30); g.lineTo(248, 290); g.moveTo(270, 30); g.lineTo(270, 290); g.stroke();
  for (let y = 44; y < 290; y += 22) { g.beginPath(); g.moveTo(248, y); g.lineTo(270, y); g.stroke(); }
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

// ---- Mumbai skyline backdrop (two parallax layers, each tiles horizontally at 1920 px)
const LAYER_W = 1920;
function litWindows(g, r, x, y, w, h, amount, color = '255,214,130') {
  if (amount <= 0) return;
  for (let wy = y + 6; wy < y + h - 6; wy += 9) for (let wx = x + 4; wx < x + w - 5; wx += 7)
    if (r() < amount) { g.fillStyle = `rgba(${color},${0.45 + r() * 0.5})`; g.fillRect(wx, wy, 3, 4); }
}
// Distant high-rises: Imperial twin towers, World One, Antilia, the Sea Link pylon
function makeMumbaiFar(t, seed) {
  const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed);
  const base = h - 30, col = t.far;
  const tower = (x, w, th) => { g.fillStyle = col; g.fillRect(x, base - th, w, th + 30); litWindows(g, r, x, base - th, w, th, t.lights * 0.5); };
  // generic high-rise filler
  for (let x = 0; x < LAYER_W; x += 26 + r() * 40) {
    if ((x > 250 && x < 420) || (x > 860 && x < 960) || (x > 1500 && x < 1860)) continue;
    const w = 22 + r() * 34, th = 40 + r() * 110; tower(x, w, th);
    if (r() < 0.25) { g.fillStyle = col; g.fillRect(x + w / 2 - 1, base - th - 14, 2, 14); }
  }
  // Imperial twin towers (rounded tops)
  for (const x of [290, 350]) {
    g.fillStyle = col; rr(g, x, base - 190, 44, 220, 20); g.fill();
    g.fillRect(x + 20, base - 206, 4, 18); litWindows(g, r, x, base - 180, 44, 180, t.lights * 0.6);
  }
  // World One: tall tower with a crown
  g.fillStyle = col; g.beginPath(); g.moveTo(880, base + 30); g.lineTo(884, base - 180); g.lineTo(900, base - 205); g.lineTo(916, base - 180); g.lineTo(920, base + 30); g.fill();
  litWindows(g, r, 884, base - 175, 32, 175, t.lights * 0.6);
  // Antilia: stacked offset slabs
  for (let i = 0; i < 7; i++) { g.fillStyle = col; g.fillRect(1180 + (i % 2) * 10, base - 20 - i * 20, 50, 20); }
  litWindows(g, r, 1180, base - 160, 60, 160, t.lights * 0.4);
  // Bandra-Worli Sea Link: cable-stayed pylons over the water
  g.strokeStyle = col; g.fillStyle = col;
  g.fillRect(1500, base + 4, 360, 7); // deck
  for (const px of [1600, 1760]) {
    g.lineWidth = 6; g.beginPath(); g.moveTo(px - 14, base + 10); g.lineTo(px, base - 110); g.lineTo(px + 14, base + 10); g.stroke();
    g.fillRect(px - 3, base - 150, 6, 42);
    g.lineWidth = 1.2; g.globalAlpha = 0.8;
    for (let k = 1; k <= 9; k++) {
      const topY = base - 150 + k * 4;
      g.beginPath(); g.moveTo(px, topY); g.lineTo(px - k * 9, base + 4); g.moveTo(px, topY); g.lineTo(px + k * 9, base + 4); g.stroke();
    }
    g.globalAlpha = 1;
  }
  // sea
  g.fillStyle = t.sea; g.fillRect(0, base + 10, LAYER_W, h - base - 10);
  if (t.lights) { g.fillStyle = 'rgba(255,220,140,.5)'; for (let x = 1500; x < 1860; x += 8) g.fillRect(x, base + 2, 2, 2); }
  return c;
}
// Nearer landmarks: Gateway of India, Taj Palace, Rajabai tower, CST, the Queen's Necklace
function makeMumbaiNear(t, seed) {
  const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed);
  const base = h - 34, col = t.near;
  const block = (x, w, bh) => { g.fillStyle = col; g.fillRect(x, base - bh, w, bh + 34); litWindows(g, r, x, base - bh, w, bh, t.lights); };
  const dome = (cx, y, rad) => { g.beginPath(); g.arc(cx, y, rad, Math.PI, 0); g.fill(); g.fillRect(cx - 1, y - rad - 8, 2, 8); };
  // mid-rise filler (skipping landmark spots)
  const skip = [[180, 600], [880, 960], [1220, 1440]];
  for (let x = 0; x < LAYER_W;) {
    const w = 30 + r() * 50;
    if (!skip.some(([a, b]) => x + w > a && x < b)) block(x, w, 24 + r() * 60);
    x += w + 2 + r() * 8;
  }
  g.fillStyle = col;
  // Gateway of India
  const gx = 200, gw = 120;
  g.fillRect(gx, base - 70, gw, 104);
  for (const tx of [gx - 6, gx + 26, gx + gw - 38, gx + gw - 6]) { g.fillRect(tx, base - 92, 12, 30); dome(tx + 6, base - 92, 6); }
  g.fillRect(gx - 4, base - 76, gw + 8, 8);
  g.fillStyle = t.sea; g.beginPath(); g.moveTo(gx + 40, base + 34); g.lineTo(gx + 40, base - 30); g.quadraticCurveTo(gx + 60, base - 58, gx + 80, base - 30); g.lineTo(gx + 80, base + 34); g.fill();
  // Taj Mahal Palace: long facade, big central dome, corner domes
  g.fillStyle = col; const tj = 360;
  g.fillRect(tj, base - 80, 220, 114);
  dome(tj + 110, base - 80, 34); g.fillRect(tj + 106, base - 124, 8, 12);
  for (const dx of [14, 206]) { g.fillRect(tj + dx - 12, base - 104, 24, 30); dome(tj + dx, base - 104, 12); }
  for (const dx of [60, 160]) dome(tj + dx, base - 80, 10);
  litWindows(g, r, tj, base - 76, 220, 74, t.lights * 1.1);
  // Rajabai clock tower
  const rx = 910; g.fillStyle = col;
  g.fillRect(rx - 11, base - 130, 22, 164); g.fillRect(rx - 15, base - 90, 30, 6);
  g.beginPath(); g.moveTo(rx - 11, base - 130); g.lineTo(rx, base - 172); g.lineTo(rx + 11, base - 130); g.fill();
  g.fillStyle = t.lights ? 'rgba(255,230,160,.9)' : 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(rx, base - 112, 5, 0, Math.PI * 2); g.fill();
  // Chhatrapati Shivaji Terminus: gothic block, central dome, spires
  g.fillStyle = col; const cs = 1240;
  g.fillRect(cs, base - 64, 190, 98); g.fillRect(cs + 70, base - 96, 50, 34);
  dome(cs + 95, base - 96, 26); g.fillRect(cs + 93, base - 136, 4, 16);
  for (const dx of [0, 36, 150, 184]) { g.beginPath(); g.moveTo(cs + dx, base - 64); g.lineTo(cs + dx + 3, base - 88); g.lineTo(cs + dx + 6, base - 64); g.fill(); }
  litWindows(g, r, cs, base - 60, 190, 58, t.lights * 0.9);
  // promenade + sea with the Queen's Necklace street-light arc
  g.fillStyle = shade(t.sea, 0.06); g.fillRect(0, base + 2, LAYER_W, 32);
  g.fillStyle = t.sea; g.fillRect(0, base + 8, LAYER_W, 26);
  g.fillStyle = t.lights ? 'rgba(255,214,120,.95)' : 'rgba(255,255,255,.55)';
  for (let x = 4; x < LAYER_W; x += 12) g.fillRect(x, base + 3 + Math.sin(x / LAYER_W * Math.PI * 4) * 1.5, 3, 3);
  g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 90; i++) g.fillRect(r() * LAYER_W, base + 12 + r() * 20, 6 + r() * 16, 1);
  return c;
}

// ---- shared skyline helpers
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

// ---- Hyderabad: Golconda Fort + HITEC City far; Charminar, Birla Mandir, Buddha in Hussain Sagar near
function makeHyderabadFar(t, seed) {
  const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 30, col = t.far;
  // Golconda: rocky hill crowned with walls, bastions and the Bala Hissar pavilion
  const hillY = x => base - 20 - Math.max(0, Math.sin((x - 60) / 640 * Math.PI)) * 110;
  g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= 760; x += 8) g.lineTo(x, hillY(x)); g.lineTo(760, h); g.fill();
  for (let x = 120; x < 700; x += 70) { const y = hillY(x); g.fillRect(x - 12, y - 22, 24, 26); for (let k = -10; k < 12; k += 7) g.fillRect(x + k, y - 28, 4, 6); g.fillRect(x + 12, y - 12, 58, 10); }
  const py = hillY(380); g.fillRect(352, py - 60, 56, 40); for (let k = 0; k < 3; k++) cutOut(g, () => archPath(g, 358 + k * 17, py - 52, 10, 26));
  g.fillStyle = col; g.fillRect(348, py - 64, 64, 6);
  // HITEC City: Cyber Towers (rounded glass block) and glass towers
  fillerBlocks(g, r, t, col, base, 800, LAYER_W, 40, 130, [[1060, 1180]], 0.6);
  g.fillStyle = col; rr(g, 1060, base - 150, 120, 190, 50); g.fill();
  g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = base - 130; y < base; y += 12) g.fillRect(1064, y, 112, 3);
  litWindows(g, r, 1066, base - 130, 108, 128, t.lights * 0.8);
  g.fillStyle = col; g.fillRect(0, base, LAYER_W, h - base);
  return c;
}
function makeHyderabadNear(t, seed) {
  const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 34, col = t.near;
  fillerBlocks(g, r, t, col, base, 0, LAYER_W, 20, 55, [[500, 760], [1180, 1420], [1560, 1760]]);
  // Charminar
  const cx = 630, bw = 130;
  g.fillStyle = col; g.fillRect(cx - bw / 2, base - 80, bw, 120); g.fillRect(cx - bw / 2 - 4, base - 84, bw + 8, 8);
  g.fillRect(cx - bw / 2 + 8, base - 104, bw - 16, 22);
  cutOut(g, () => archPath(g, cx - 26, base - 66, 52, 100));
  for (let k = 0; k < 6; k++) cutOut(g, () => archPath(g, cx - bw / 2 + 14 + k * 18, base - 100, 9, 14));
  g.fillStyle = col;
  for (const mx of [cx - bw / 2 - 2, cx + bw / 2 + 2]) {
    g.fillRect(mx - 8, base - 176, 16, 216);
    for (const by of [base - 84, base - 118, base - 150]) g.fillRect(mx - 12, by, 24, 6);
    onion(g, mx, base - 176, 10); g.fillRect(mx - 1, base - 206, 2, 12);
  }
  onion(g, cx, base - 104, 12);
  // Birla Mandir on its hillock
  g.beginPath(); g.moveTo(1560, base + 10); g.quadraticCurveTo(1660, base - 60, 1760, base + 10); g.fill();
  for (const [dx, th] of [[-30, 36], [0, 62], [30, 36]]) { g.beginPath(); g.moveTo(1660 + dx - 12, base - 40); g.lineTo(1660 + dx, base - 40 - th); g.lineTo(1660 + dx + 12, base - 40); g.fill(); }
  waterBand(g, r, t, base, h, t.lights > 0);
  // Buddha statue on the Hussain Sagar islet
  g.fillStyle = col; ell(g, 1300, base + 16, 50, 7); g.fill();
  g.fillRect(1284, base - 8, 32, 22); g.fillRect(1290, base - 58, 20, 52); ell(g, 1300, base - 64, 8, 9); g.fill();
  return c;
}

// ---- Delhi: Qutub Minar, Lotus Temple far; Rashtrapati Bhavan, India Gate, Red Fort, Jama Masjid near
function makeDelhiFar(t, seed) {
  const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 30, col = t.far;
  fillerBlocks(g, r, t, col, base, 0, LAYER_W, 18, 60, [[260, 360], [1020, 1200]]);
  trees(g, r, shade(col, -0.05), base, 0, LAYER_W, 60);
  // Qutub Minar: tapered, banded, with balconies
  g.fillStyle = col; g.beginPath(); g.moveTo(290, base + 30); g.lineTo(300, base - 190); g.lineTo(318, base - 190); g.lineTo(328, base + 30); g.fill();
  for (const k of [0.25, 0.48, 0.68, 0.84]) { const y = base - 190 * k, half = lerp(19, 9, k) + 4; g.fillRect(309 - half, y - 3, half * 2, 5); }
  g.fillRect(304, base - 202, 10, 12); ell(g, 309, base - 203, 6, 4); g.fill();
  // Lotus Temple: overlapping pointed petals
  const lx = 1110;
  for (const [layer, spread, hgt] of [[0, 22, 70], [1, 16, 56], [2, 10, 40]]) {
    g.fillStyle = shade(col, 0.06 - layer * 0.04);
    for (let i = -3; i <= 3; i++) {
      const px = lx + i * spread, tip = base - hgt + Math.abs(i) * 6;
      g.beginPath(); g.moveTo(px - spread * 0.8, base); g.quadraticCurveTo(px - spread * 0.6, tip + 18, px, tip); g.quadraticCurveTo(px + spread * 0.6, tip + 18, px + spread * 0.8, base); g.fill();
    }
  }
  g.fillStyle = col; g.fillRect(0, base, LAYER_W, h - base);
  return c;
}
function makeDelhiNear(t, seed) {
  const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 34, col = t.near;
  fillerBlocks(g, r, t, col, base, 0, LAYER_W, 16, 44, [[80, 330], [480, 640], [930, 1380], [1540, 1760]]);
  trees(g, r, shade(col, 0.04), base, 0, LAYER_W, 40);
  g.fillStyle = col;
  // Rashtrapati Bhavan: long colonnade, dome on a drum
  g.fillRect(90, base - 40, 230, 80); g.fillRect(170, base - 60, 70, 22); g.beginPath(); g.arc(205, base - 60, 28, Math.PI, 0); g.fill(); g.fillRect(203, base - 98, 4, 12);
  g.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 100; x < 316; x += 9) g.fillRect(x, base - 34, 3, 30);
  // India Gate
  g.fillStyle = col; const ix = 560;
  g.fillRect(ix - 58, base - 112, 116, 152); g.fillRect(ix - 64, base - 118, 128, 8); g.fillRect(ix - 40, base - 132, 80, 16); g.fillRect(ix - 26, base - 142, 52, 10);
  g.beginPath(); g.arc(ix, base - 142, 18, Math.PI, 0); g.fill();
  cutOut(g, () => archPath(g, ix - 26, base - 88, 52, 130));
  // Red Fort: crenellated wall, Lahori Gate with chhatris
  g.fillStyle = col; g.fillRect(940, base - 52, 440, 92);
  for (let x = 942; x < 1378; x += 12) g.fillRect(x, base - 60, 7, 8);
  g.fillRect(1120, base - 86, 80, 40);
  cutOut(g, () => archPath(g, 1144, base - 62, 32, 100));
  g.fillStyle = col;
  for (const x of [1128, 1160, 1192]) { g.fillRect(x - 7, base - 102, 14, 16); g.beginPath(); g.arc(x, base - 102, 8, Math.PI, 0); g.fill(); }
  for (const x of [950, 1370]) { g.fillRect(x - 10, base - 82, 20, 32); g.beginPath(); g.arc(x, base - 82, 11, Math.PI, 0); g.fill(); }
  // Jama Masjid: three onion domes between two minarets
  const jx = 1650;
  g.fillRect(jx - 90, base - 44, 180, 84);
  onion(g, jx, base - 44, 26); onion(g, jx - 52, base - 44, 18); onion(g, jx + 52, base - 44, 18);
  for (const mx of [jx - 96, jx + 96]) { g.fillRect(mx - 6, base - 130, 12, 170); onion(g, mx, base - 130, 8); g.fillRect(mx - 9, base - 96, 18, 4); }
  g.fillStyle = t.sea; g.fillRect(0, base + 4, LAYER_W, h - base);
  g.fillStyle = shade(t.sea, 0.06); for (let x = 0; x < LAYER_W; x += 60) g.fillRect(x, base + 4, 30, h - base);
  return c;
}

// ---- Chennai: LIC building, Chennai Central far; Kapaleeshwarar gopuram, Marina lighthouse, beach near
function makeChennaiFar(t, seed) {
  const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 30, col = t.far;
  fillerBlocks(g, r, t, col, base, 0, LAYER_W, 24, 90, [[470, 560], [1100, 1330]]);
  g.fillStyle = col;
  // LIC building with its antenna mast
  g.fillRect(480, base - 150, 64, 190); g.strokeStyle = col; g.lineWidth = 3;
  g.beginPath(); g.moveTo(512, base - 150); g.lineTo(512, base - 200); g.moveTo(502, base - 150); g.lineTo(512, base - 190); g.lineTo(522, base - 150); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = base - 140; y < base; y += 10) g.fillRect(484, y, 56, 2);
  // Chennai Central: long gothic front, clock tower, corner spires
  g.fillStyle = col; const cc = 1110;
  g.fillRect(cc, base - 60, 220, 100); g.fillRect(cc + 95, base - 130, 30, 72);
  g.beginPath(); g.moveTo(cc + 92, base - 130); g.lineTo(cc + 110, base - 168); g.lineTo(cc + 128, base - 130); g.fill();
  for (const dx of [0, 60, 160, 212]) { g.fillRect(cc + dx, base - 82, 8, 24); g.beginPath(); g.moveTo(cc + dx - 2, base - 82); g.lineTo(cc + dx + 4, base - 100); g.lineTo(cc + dx + 10, base - 82); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(cc + 110, base - 108, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = col; g.fillRect(0, base, LAYER_W, h - base);
  return c;
}
function makeChennaiNear(t, seed) {
  const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 34, col = t.near;
  fillerBlocks(g, r, t, col, base, 0, LAYER_W, 16, 46, [[260, 460], [850, 950], [1440, 1580]]);
  // Kapaleeshwarar gopuram: stepped tiers, barrel-vault crown with kalasams
  const gopuram = (cx, bw, tw, gh) => {
    const tiers = 9;
    for (let i = 0; i < tiers; i++) {
      const k = i / tiers, w = lerp(bw, tw, k), y = base - gh * (i + 1) / tiers;
      g.fillStyle = i % 2 ? col : shade(col, 0.07); g.fillRect(cx - w / 2, y, w, gh / tiers + 1);
      g.fillStyle = shade(col, 0.14); for (let x = cx - w / 2 + 4; x < cx + w / 2 - 4; x += 9) g.fillRect(x, y + 3, 4, gh / tiers - 6);
    }
    g.fillStyle = col; rr(g, cx - tw / 2 - 4, base - gh - 14, tw + 8, 16, 7); g.fill();
    for (let k = 0; k < 5; k++) { const kx = cx - tw / 2 + 4 + k * (tw - 8) / 4; g.fillRect(kx - 2, base - gh - 22, 4, 9); ell(g, kx, base - gh - 23, 3, 3); g.fill(); }
    g.fillRect(cx - bw / 2 - 6, base - 6, bw + 12, 46);
    cutOut(g, () => { g.beginPath(); g.rect(cx - 12, base - 32, 24, 40); });
  };
  gopuram(360, 130, 56, 160); gopuram(1510, 90, 40, 104);
  // Marina lighthouse
  g.fillStyle = col; g.beginPath(); g.moveTo(884, base + 20); g.lineTo(892, base - 140); g.lineTo(908, base - 140); g.lineTo(916, base + 20); g.fill();
  g.fillStyle = shade(col, 0.12); for (const k of [0.2, 0.45, 0.7]) g.fillRect(886 + k * 6, base - 160 * k, 28 - k * 12, 10);
  g.fillStyle = col; g.fillRect(888, base - 158, 24, 18); g.beginPath(); g.arc(900, base - 158, 12, Math.PI, 0); g.fill();
  g.fillStyle = 'rgba(255,240,180,.8)'; g.fillRect(892, base - 154, 16, 8);
  // palms along the beach
  g.strokeStyle = col; g.fillStyle = col;
  for (let x = 30; x < LAYER_W; x += 90 + r() * 120) {
    if ((x > 250 && x < 470) || (x > 840 && x < 960) || (x > 1430 && x < 1590)) continue;
    const th = 40 + r() * 40, lean = (r() - 0.5) * 20; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, base + 4); g.quadraticCurveTo(x + lean, base - th / 2, x + lean, base - th); g.stroke();
    g.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = -Math.PI + k * Math.PI / 5; g.beginPath(); g.moveTo(x + lean, base - th); g.quadraticCurveTo(x + lean + Math.cos(a) * 16, base - th + Math.sin(a) * 16 - 4, x + lean + Math.cos(a) * 26, base - th + Math.sin(a) * 12 + 10); g.stroke(); }
  }
  // sand, surf, catamarans
  g.fillStyle = '#e8d6a8'; g.fillRect(0, base + 2, LAYER_W, 10);
  waterBand(g, r, t, base + 6, h, false);
  g.fillStyle = '#fff'; for (let x = 0; x < LAYER_W; x += 24) g.fillRect(x + r() * 8, base + 12, 12, 2);
  g.fillStyle = shade(col, -0.1); for (let i = 0; i < 8; i++) { const bx = r() * LAYER_W, by = base + 20 + r() * 8; g.fillRect(bx, by, 22, 3); g.beginPath(); g.moveTo(bx + 10, by); g.lineTo(bx + 10, by - 12); g.lineTo(bx + 18, by); g.fill(); }
  return c;
}

const SKYLINES = {
  mumbai: { far: makeMumbaiFar, near: makeMumbaiNear },
  hyderabad: { far: makeHyderabadFar, near: makeHyderabadNear },
  delhi: { far: makeDelhiFar, near: makeDelhiNear },
  chennai: { far: makeChennaiFar, near: makeChennaiNear },
};

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
const SP = {};
function buildSharedSprites() {
  SP.player = makeTuk('#1e9e4a', '#ffd21f', '#151515', 'DL 1R 4207');
  SP.rivals = RIVAL_COLORS.map(c => makeTuk(c.body, c.trim, c.canopy, c.plate));
  SP.cowR = makeCow(); SP.cowL = flipped(SP.cowR);
  SP.dogs = DOG_COATS.map(coat => {
    const side = [makeDogSide(coat, 0), makeDogSide(coat, 1)];
    return { right: side, left: side.map(flipped), rear: [makeDogRear(coat, 0), makeDogRear(coat, 1)], sleep: makeDogSleep(coat) };
  });
  SP.cars = [makeCar('#e9e9ea'), makeCar('#b71c1c'), makeCar('#1f4e9c'), makeCar('#9e9e9e')];
  SP.bus = makeBus(); SP.truck = makeTruck();
  SP.palm = makePalm(); SP.palmF = flipped(SP.palm);
  const r = mulberry32(7); SP.trees = [makeTree(r), makeTree(r), makeTree(r)];
  SP.temple = makeTemple(); SP.lampL = makeLamp(-1); SP.lampR = makeLamp(1);
  SP.chai = makeChai(); SP.milestone = makeMilestone(); SP.arch = makeArch();
}

// ------------------------------------------------------------------ world state
let segments = [], trackLength = 0, theme = THEMES.marine, themeSprites = {}, bgLayers = {};
let track = TRACKS[0], level = clamp(store.get('level', 0), 0, TRACKS.length - 1), cash = store.get('cash', 0), round = store.get('round', 0);
const unlocked = TRACKS.length - 1; // every race is open from the start
let state = 'title', paused = false, pauseSel = 0, countdown = 0, raceTime = 0, finishTimer = 0, finishDist = 0, startZ = 0;
let position = 0, skyOffset = 0, farOffset = 0, nearOffset = 0, shake = 0;
let rivals = [], traffic = [], finishOrder = [], results = null;
let particles = [], popups = [], messages = [], bubbles = [], frameNo = 0, hawkerT = 2;
const player = {};

function resetPlayer() {
  Object.assign(player, { x: 0, dist: PLAYER_Z, speed: 0, health: 100, lean: 0, rot: 0, tip: 0, crash: 0, crashDir: 1,
    atk: null, hurt: 0, inv: 0, kos: 0, finished: false, time: 0, name: 'YOU', steer: 0, puff: 0, hornCd: 0, isPlayer: true });
}

// ------------------------------------------------------------------ track building
function lastY() { return segments.length ? segments[segments.length - 1].p2.world.y : 0; }
function addSegment(curve, y) {
  const n = segments.length;
  segments.push({ index: n, curve, sprites: [], cars: [], dark: Math.floor(n / RUMBLE_LEN) % 2 === 1,
    p1: { world: { x: 0, y: lastY(), z: n * SEG_LEN }, camera: {}, screen: {} },
    p2: { world: { x: 0, y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} } });
}
function addRoad(enter, hold, leave, curve, y = 0) {
  const startY = lastY(), endY = startY + Math.round(y) * SEG_LEN, total = enter + hold + leave;
  for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
  for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
  for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
}

function buildTrack(tr) {
  segments = [];
  const R = mulberry32(tr.seed + round * 1000);
  const sgn = () => (R() < 0.5 ? -1 : 1);
  addRoad(20, 40, 20, 0, 0);
  while (segments.length < tr.length) {
    const t = R(), L = pick([25, 50, 75], R);
    if (t < 0.16) addRoad(L, L, L, 0, 0);
    else if (t < 0.42) addRoad(L, L, L, sgn() * pick([2, 4, 6], R), pick([0, 0, 20, -20, 40], R));
    else if (t < 0.56) { const s = sgn(); addRoad(50, 50, 50, s * 2, 0); addRoad(50, 50, 50, -s * 4, pick([0, 20, -20], R)); addRoad(50, 50, 50, s * 2, 0); }
    else if (t < 0.68) addRoad(L, L, L, 0, sgn() * pick([20, 40, 60], R));
    else if (t < 0.8) { for (let i = 0; i < 4; i++) addRoad(25, 25, 25, 0, (i % 2 ? -1 : 1) * 10); }
    else if (t < 0.9) { for (let i = 0; i < 8; i++) addRoad(10, 10, 10, 0, (i % 2 ? -1 : 1) * 3); }
    else addRoad(L, L, L, sgn() * 6, sgn() * 30);
  }
  addRoad(150, 150, 150, sgn() * 2, -lastY() / SEG_LEN);
  addRoad(30, 30, 30, 0, 0);
  trackLength = segments.length * SEG_LEN;

  // start / finish
  startZ = PLAYER_Z + 3 * 520 + 400;
  const fs = Math.floor(startZ / SEG_LEN);
  segments[fs].finish = true; segments[fs + 1].finish = 2;
  segments[fs].sprites.push({ img: SP.arch, offset: 0, nw: 2.6, center: true });

  // scenery
  for (let n = 30; n < segments.length; n++) {
    const seg = segments[n];
    if (n % 18 === 0) { const side = (n / 18) % 2 ? 1 : -1; seg.sprites.push({ img: side < 0 ? SP.lampL : SP.lampR, offset: side * 1.12, nw: 0.13, solid: true }); }
    if (n % 150 === 0) seg.sprites.push({ img: SP.milestone, offset: pick([-1, 1], R) * 1.1, nw: 0.08, solid: true });
    if (R() < (tr.themeDef.density ?? 0.4)) {
      const kind = weightedPick(tr.themeDef.scenery, R), side = R() < 0.5 ? -1 : 1;
      let s;
      if (kind === 'palm') s = { img: side < 0 ? SP.palm : SP.palmF, offset: side * rand(1.3, 2.6), nw: 0.45, solid: true };
      else if (kind === 'tree') s = { img: pick(SP.trees, R), offset: side * rand(1.4, 2.8), nw: 0.8, solid: true };
      else if (kind === 'building') s = { img: pick(themeSprites.buildings, R), offset: side * rand(1.7, 2.6), nw: 1.1, solid: true };
      else if (kind === 'billboard') s = { img: pick(themeSprites.billboards, R), offset: side * rand(1.25, 1.6), nw: 0.95, solid: true };
      else if (kind === 'temple') s = { img: SP.temple, offset: side * rand(1.8, 2.6), nw: 1.1, solid: true };
      else s = { img: SP.chai, offset: side * rand(1.2, 1.5), nw: 0.6, solid: true };
      s.kind = kind;
      seg.sprites.push(s);
    }
  }
}

function loadTrack(idx) {
  track = TRACKS[idx % TRACKS.length];
  track.themeDef = THEMES[track.theme];
  theme = track.themeDef;
  Music.setCity(theme.city);
  Ambience.setCity(theme.city);
  const r = mulberry32(track.seed * 3);
  themeSprites = { buildings: theme.buildings.map(col => makeBuilding(r, col)),
    billboards: [...BILLBOARDS, ...theme.ads.map((lines, i) => ({ ...AD_COLORS[i % AD_COLORS.length], lines }))].map(makeBillboard) };
  const sky = SKYLINES[theme.city];
  bgLayers = { far: sky.far(theme, track.seed), near: sky.near(theme, track.seed + 5) };
  buildTrack(track);
}

function findSegment(z) { return segments[Math.floor(((z % trackLength) + trackLength) % trackLength / SEG_LEN) % segments.length]; }
function wrapDelta(d) { d = ((d % trackLength) + trackLength) % trackLength; return d > trackLength / 2 ? d - trackLength : d; }

// ------------------------------------------------------------------ race setup
function setupRace() {
  const next = TRACKS[level % TRACKS.length];
  trackEvent(`race-start/${THEMES[next.theme].city}/${next.theme}`, `Race started: ${next.name}`);
  loadTrack(level);
  resetPlayer();
  const diff = 1 + round * 0.04;
  const nR = track.rivals;
  rivals = [];
  // grid: two per row, player in the middle of the pack
  const slots = [];
  for (let i = 0; i < nR + 1; i++) slots.push({ row: Math.floor(i / 2), x: i % 2 ? 0.42 : -0.42 });
  const rows = Math.ceil((nR + 1) / 2);
  const playerSlot = Math.min(nR, Math.floor((nR + 1) / 2) + ((nR + 1) % 2 ? 0 : 1));
  const rowZ = row => PLAYER_Z + (rows - 1 - row) * 520;
  const shiftZ = PLAYER_Z - rowZ(slots[playerSlot].row);
  player.x = slots[playerSlot].x;
  const names = [...RIVAL_NAMES].sort(() => Math.random() - 0.5);
  let ri = 0;
  for (let i = 0; i < slots.length; i++) {
    if (i === playerSlot) continue;
    const c = RIVAL_COLORS[ri % RIVAL_COLORS.length];
    rivals.push({ name: names[ri], color: c.body, img: SP.rivals[ri % SP.rivals.length], nw: TUK_NW,
      x: slots[i].x, dist: rowZ(slots[i].row) + shiftZ, speed: 0,
      top: MAX_SPEED * clamp(track.skill * diff - 0.06 + Math.random() * 0.08, 0.7, 1.02),
      health: 100, ko: 0, koBy: null, rot: 0, atk: null, cd: rand(1, 3), aggr: rand(0.6, 1.2), laneX: pick([-0.6, 0, 0.6]),
      laneT: rand(3, 8), delay: rand(0.05, 0.5), finished: false, time: 0, hurt: 0, scr: null, isRival: true });
    ri++;
  }
  // traffic
  traffic = [];
  const tr = mulberry32(track.seed + 99 + round);
  const addTraffic = (type) => {
    const z = startZ + 4000 + tr() * (trackLength - 9000);
    const lane = pick([-0.66, 0, 0.66], tr);
    if (type === 'cow') traffic.push({ type, z, x: rand(-1.2, 1.2), speed: 0, vx: pick([-1, 1], tr) * rand(0.05, 0.12), nw: 0.42, pause: 0, scared: 0, label: 'HOLY COW' });
    else {
      const def = type === 'bus' ? { img: SP.bus, nw: 0.58, s: [0.28, 0.38], label: 'BUS' } : type === 'truck' ? { img: SP.truck, nw: 0.58, s: [0.25, 0.35], label: 'TRUCK' } : { img: pick(SP.cars, tr), nw: 0.38, s: [0.35, 0.5], label: 'CAR' };
      traffic.push({ type, z, x: lane, tx: lane, img: def.img, nw: def.nw, speed: MAX_SPEED * rand(def.s[0], def.s[1]), laneT: rand(4, 12), label: def.label });
    }
  };
  for (let i = 0; i < track.traffic; i++) addTraffic(pick(['car', 'car', 'bus', 'truck'], tr));
  for (let i = 0; i < track.cows; i++) addTraffic('cow');
  for (let i = 0; i < (track.dogs || 0); i++) {
    const z = startZ + 3000 + tr() * (trackLength - 8000), r = tr();
    const mode = r < 0.28 ? 'sleep' : r < 0.8 ? 'sit' : 'cross';
    const x = mode === 'sleep' ? rand(-0.9, 0.9) : mode === 'sit' ? pick([-1, 1], tr) * rand(1.15, 1.5) : rand(-1.2, 1.2);
    traffic.push({ type: 'dog', label: 'DOG', z, x, speed: 0, vx: mode === 'cross' ? pick([-1, 1], tr) * rand(0.25, 0.4) : 0,
      mode, t: tr() * 3, look: SP.dogs[Math.floor(tr() * SP.dogs.length)], tried: false, barkT: 0, img: null, nw: 0.2 });
  }

  finishDist = startZ + track.laps * trackLength;
  finishOrder = []; results = null; particles = []; popups = []; messages = []; bubbles = [];
  raceTime = 0; position = 0; countdown = 3.99;
  state = 'countdown'; lastBeep = 4;
  Sfx.startEngine();
}

// ------------------------------------------------------------------ input
// Two mirrored layouts: one hand drives, the other swings the lathi (key direction = swing direction).
// Touch buttons send T_* codes, which work in either layout.
const LAYOUTS = [
  { id: 'arrows', label: 'DRIVE: ARROWS  ·  LATHI: A / D',
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    hitL: ['KeyA'], hitR: ['KeyD'], horn: ['Space', 'KeyW', 'KeyS'] },
  { id: 'wasd', label: 'DRIVE: W A S D  ·  LATHI: ← / →',
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    hitL: ['ArrowLeft'], hitR: ['ArrowRight'], horn: ['Space', 'ArrowUp', 'ArrowDown'] },
];
let layoutIdx = clamp(store.get('layout', 0), 0, LAYOUTS.length - 1);
const keys = {};
const held = action => keys['T_' + action] || LAYOUTS[layoutIdx][action].some(c => keys[c]);
const I = { left: () => held('left'), right: () => held('right'), up: () => held('up'), down: () => held('down') };
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
// swallow every non-shortcut key so the macOS WKWebView shell never plays the "unhandled key" beep
addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && !/^F\d+$/.test(e.code)) e.preventDefault(); if (!e.repeat) keyDown(e.code); else keys[e.code] = true; });
addEventListener('keyup', e => keyUp(e.code));
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'race') openPause(); });

const RACING_STATES = ['countdown', 'race', 'finished'];
const PAUSE_MENU = [{ label: 'RESUME', cmd: 'resume' }, { label: 'RESTART RACE', cmd: 'restart' }, { label: 'QUIT TO MAIN MENU', cmd: 'menu' }];
function openPause() { paused = true; pauseSel = 0; }
// Commands shared by the pause menu, mouse clicks and the macOS app menu (window.rrrCommand).
function runCommand(cmd) {
  if (cmd === 'pause') { if (RACING_STATES.includes(state) && !paused) openPause(); else if (paused) paused = false; return; }
  paused = false;
  if (cmd === 'restart' && state !== 'title' && state !== 'champion') setupRace();
  if (cmd === 'menu') { state = 'title'; results = null; messages = []; attractSetup(); }
}
window.rrrCommand = runCommand;
function onPress(code) {
  if (code === 'KeyM') { Sfx.toggleMute(); return; }
  if (code === 'KeyN') { Music.toggle(); msg(Music.on ? 'MUSIC ON' : 'MUSIC OFF', '#fff', 1); return; }
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
  if (state === 'title' && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'T_left', 'T_right'].includes(code)) {
    const next = clamp(level + (['ArrowRight', 'KeyD', 'T_right'].includes(code) ? 1 : -1), 0, unlocked);
    if (next !== level) { level = next; store.set('level', level); attractSetup(); Sfx.beep(false); }
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
  for (let n = 3; n < 60; n++) for (const sp of segments[(findSegment(position).index + n) % segments.length].sprites)
    if (sp.scr && sp.scr.frame === frameNo && sp.scr.w > 60 && sp.scr.x > 40 && sp.scr.x < W - 40 && !bubbles.some(b => b.who === sp)) seen.push(sp);
  if (seen.length) bubbles.push({ who: pick(seen), text: pick(HAWKER_CALLS[theme.city] || HAWKER_CALLS.mumbai), t: 2.2, hawker: true });
}
function curse(who) {
  bubbles = bubbles.filter(b => b.who !== who);
  bubbles.push({ who, text: pick(CURSES[theme.city] || CURSES.mumbai), t: 1.7 });
  setTimeout(() => Sfx.grunt(), 120);
}
function startAttack(who, side) { who.atk = { t: 0, side, dur: 0.34, done: false }; }

function honk() {
  if (player.hornCd > 0) return;
  player.hornCd = 0.45; Sfx.horn();
  popup('POM POM!', W / 2 + rand(-30, 30), H - 250, '#fff', 22);
  for (const c of traffic) {
    const dz = wrapDelta(c.z - player.dist);
    if (dz < 0 || dz > 3000) continue;
    if (c.type === 'cow') { c.vx = (c.x >= player.x ? 1 : -1) * 0.7; c.scared = 2.5; }
    else if (c.type === 'dog') { if (c.mode === 'sleep' || c.mode === 'sit') { c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 0.9; } }
    else if (Math.abs(c.x - player.x) < 0.5) {
      let nx = c.x + (c.x >= player.x ? 0.66 : -0.66);
      if (Math.abs(nx) > 0.7) nx = c.x - Math.sign(nx) * 0.66 * 2;
      c.tx = clamp(nx, -0.66, 0.66);
    }
  }
}

function resolveAttack(att, side) {
  const attIsPlayer = !!att.isPlayer;
  const targets = attIsPlayer ? rivals.filter(r => !r.ko) : [player];
  let best = null, bestDz = 1e9;
  for (const t of targets) {
    if (t === att) continue;
    if (t.isPlayer && (t.crash > 0 || t.inv > 0)) continue;
    const dz = t.dist - att.dist, dx = t.x - att.x;
    if (Math.abs(dz) < 440 && dx * side > 0.02 && Math.abs(dx) < 0.8 && Math.abs(dz) < bestDz) { best = t; bestDz = Math.abs(dz); }
  }
  if (!best) { if (attIsPlayer) Sfx.whoosh(); return; }
  Sfx.hit();
  const dmg = attIsPlayer ? rand(14, 22) : rand(7, 12) * (1 + round * 0.1) * (0.8 + track.skill * 0.3);
  best.health -= dmg; best.hurt = 0.3; best.x += side * 0.12; best.speed *= 0.86;
  const word = pick(HIT_WORDS);
  if (best.health <= 0 || Math.random() < 0.75) curse(best);
  if (best.isPlayer) { popup(word, W / 2 + side * 80, H - 300, '#ff5252', 38); shake = Math.max(shake, 0.25);
    if (best.health <= 0) crashPlayer('KNOCKED OUT!', 0, side); }
  else {
    const s = best.scr; popup(word, s ? s.x : W / 2 + side * 200, s ? s.y : H - 300, '#ffeb3b', 40);
    if (best.health <= 0) {
      best.ko = 4.5; best.koBy = 'player'; best.koDir = side; player.kos++;
      Sfx.ko(); msg(`${best.name} KNOCKED OUT!  +${fmtCash(100)}`, '#ffeb3b');
    }
  }
}

function crashPlayer(reason, dmg, dir) {
  if (player.crash > 0) return;
  player.crash = 2.4; player.crashDir = dir || (Math.random() < 0.5 ? -1 : 1);
  player.health = Math.max(0, player.health - dmg); player.atk = null;
  Sfx.crash(); shake = 0.6; msg(reason, '#ff5252', 2);
  for (let i = 0; i < 18; i++) particles.push({ x: W / 2 + rand(-60, 60), y: H - 80, vx: rand(-200, 200), vy: rand(-260, -60), t: rand(0.5, 1), size: rand(3, 7), color: pick(['#ffd54f', '#bdbdbd', '#795548', '#ff7043']), g: 500 });
}

// ------------------------------------------------------------------ update
let lastBeep = 4;
function update(dt) {
  for (const m of messages) m.t -= dt; messages = messages.filter(m => m.t > 0);
  for (const p of popups) { p.t -= dt; p.y -= 30 * dt; } popups = popups.filter(p => p.t > 0);
  for (const b of bubbles) b.t -= dt; bubbles = bubbles.filter(b => b.t > 0);
  for (const p of particles) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; } particles = particles.filter(p => p.t > 0);
  shake = Math.max(0, shake - dt);

  if (state === 'title' || state === 'champion') { updateAttract(dt); return; }
  if (state === 'countdown') {
    countdown -= dt;
    const c = Math.ceil(countdown);
    if (c < lastBeep) { lastBeep = c; if (c > 0) Sfx.beep(false); }
    if (countdown <= 0) { state = 'race'; Sfx.beep(true); msg('CHALO!', '#ffeb3b', 1.2); }
    updateTraffic(dt); updateEngine();
    return;
  }
  if (state === 'race' || state === 'finished' || state === 'results') {
    if (state === 'race') raceTime += dt;
    updatePlayer(dt, state === 'race');
    updateRivals(dt);
    updateTraffic(dt);
    if (state === 'race') checkCollisions();
    updateHawkers(dt);
    checkFinish();
    if (state === 'finished') { finishTimer -= dt; if (finishTimer <= 0) buildResults(); }
    updateEngine();
  }
}

function updateEngine() {
  const racing = state === 'race' || state === 'countdown';
  const throttle = racing && player.crash <= 0 ? (I.up() ? 1 : 0) : (state === 'finished' ? 0.3 : 0.15);
  Sfx.setEngine(player.speed / MAX_SPEED, state !== 'title' && state !== 'champion', throttle);
}

function updatePlayer(dt, controlled) {
  const seg = findSegment(player.dist);
  const sp = player.speed / MAX_SPEED;
  const dx = dt * 2 * sp;
  let steer = 0, acc = false, brk = false;
  if (controlled) { steer = (I.right() ? 1 : 0) - (I.left() ? 1 : 0); acc = I.up(); brk = I.down(); }
  else { acc = player.speed < MAX_SPEED * 0.45; steer = clamp(-player.x * 1.5, -1, 1) * 0.6; }
  player.steer = lerp(player.steer, steer, Math.min(1, dt * 10));
  player.hornCd -= dt; player.inv -= dt; player.hurt -= dt;

  if (player.atk) { player.atk.t += dt; if (!player.atk.done && player.atk.t > 0.15) { player.atk.done = true; resolveAttack(player, player.atk.side); } if (player.atk.t > player.atk.dur) player.atk = null; }

  if (player.crash > 0) {
    player.crash -= dt;
    player.speed = Math.max(0, player.speed - player.speed * 2.5 * dt - 1500 * dt);
    player.rot = lerp(player.rot, player.crashDir * 1.45, Math.min(1, dt * 7));
    player.x += player.crashDir * dt * 0.35 * sp;
    if (player.crash <= 0) {
      player.rot = 0; player.lean = 0; player.tip = 0; player.speed = 0; player.x = clamp(player.x, -0.8, 0.8);
      if (player.health <= 0) player.health = 60;
      player.inv = 1.5; msg('BACK ON THE ROAD!', '#8bc34a', 1.2);
    }
  } else {
    player.x += dx * player.steer;
    player.x -= dx * sp * seg.curve * CENTRIFUGAL;
    if (acc) player.speed += ACCEL * dt; else if (brk) player.speed += BRAKE * dt; else player.speed += DECEL * dt;
    if (Math.abs(player.x) > 1) {
      if (player.speed > OFFROAD_LIMIT) player.speed += OFFROAD_DECEL * dt;
      if (Math.random() < sp * 0.8) particles.push({ x: W / 2 + rand(-100, 100), y: H - 30, vx: rand(-60, 60), vy: rand(-80, -20), t: 0.6, size: rand(6, 12), color: 'rgba(160,120,70,.6)' });
    }
    // three wheels are tippy: lateral load from curves + steering
    const lat = sp * sp * (seg.curve / 6 * 0.85 + player.steer * 0.38);
    player.lean = lerp(player.lean, -lat, Math.min(1, dt * 5));
    if (Math.abs(player.lean) > 0.95) {
      player.tip += dt;
      if (player.tip > 0.7) crashPlayer('TIPPED OVER!', 15, Math.sign(player.lean));
    } else player.tip = Math.max(0, player.tip - dt * 1.5);
    const wobble = player.tip > 0 ? Math.sin(performance.now() / 40) * 0.05 : 0;
    player.rot = player.lean * 0.2 + wobble + (player.atk ? player.atk.side * 0.04 : 0);
  }
  player.x = clamp(player.x, -3, 3);
  player.speed = clamp(player.speed, 0, MAX_SPEED);
  const move = player.speed * dt;
  player.dist += move;
  position = ((player.dist - PLAYER_Z) % trackLength + trackLength) % trackLength;
  const segDelta = move / SEG_LEN;
  skyOffset = (skyOffset + 0.0006 * seg.curve * segDelta + 1) % 1;
  farOffset = (farOffset + 0.0012 * seg.curve * segDelta + 1) % 1;
  nearOffset = (nearOffset + 0.0022 * seg.curve * segDelta + 1) % 1;
  // exhaust
  player.puff -= dt;
  if (player.puff <= 0 && player.crash <= 0) { player.puff = 0.07 + (1 - sp) * 0.08; particles.push({ x: W / 2 + 75, y: H - 50, vx: rand(10, 40), vy: rand(-50, -20), t: 0.7, size: rand(4, 8), color: 'rgba(200,200,200,.35)', grow: 16 }); }
}

function updateRivals(dt) {
  for (const r of rivals) {
    const seg = findSegment(r.dist);
    r.hurt -= dt;
    if (state === 'race' || state === 'finished' || state === 'results') { if (r.delay > 0) { r.delay -= dt; continue; } }
    if (r.atk) { r.atk.t += dt; if (!r.atk.done && r.atk.t > 0.17) { r.atk.done = true; resolveAttack(r, r.atk.side); } if (r.atk.t > r.atk.dur) r.atk = null; }
    if (r.ko > 0) {
      r.ko -= dt; r.speed = Math.max(0, r.speed - r.speed * 3 * dt - 2000 * dt);
      r.rot = lerp(r.rot, (r.koDir || 1) * 1.45, Math.min(1, dt * 7));
      if (r.ko <= 0) { r.health = 55; r.rot = 0; r.x = clamp(r.x, -0.8, 0.8); }
      r.dist += r.speed * dt; continue;
    }
    r.rot = lerp(r.rot, 0, Math.min(1, dt * 8));
    const dz = r.dist - player.dist;
    let target = r.top * (1 - 0.22 * Math.abs(seg.curve) / 6);
    if (dz < -2500) target *= 1.1; else if (dz > 6000) target *= 0.92;
    const engaged = !r.finished && !player.finished && player.crash <= 0 && Math.abs(dz) < 900;
    if (engaged) target = clamp(player.speed + (dz < 0 ? 700 : -250), MAX_SPEED * 0.3, r.top * 1.03);
    if (r.finished) target = MAX_SPEED * 0.35;
    r.speed += clamp(target - r.speed, -MAX_SPEED * 0.6 * dt, MAX_SPEED / 5 * dt);

    // steering: avoid traffic, otherwise chase player or keep lane
    let tx = r.laneX;
    r.laneT -= dt; if (r.laneT <= 0) { r.laneT = rand(3, 8); r.laneX = pick([-0.6, 0, 0.6]); }
    if (engaged) tx = player.x + (r.x >= player.x ? 1 : -1) * 0.4;
    let nearest = null, nd = 1800;
    for (const c of traffic) {
      const cdz = wrapDelta(c.z - r.dist);
      if (cdz > 0 && cdz < nd && Math.abs(c.x - r.x) < (r.nw + c.nw) / 2 + 0.1) { nearest = c; nd = cdz; }
    }
    if (nearest) {
      const gap = (r.nw + nearest.nw) / 2 + 0.16;
      let side = r.x >= nearest.x ? 1 : -1;
      if (Math.abs(nearest.x + side * gap) > 0.95) side = -side;
      tx = nearest.x + side * gap;
      if (nd < 300) r.speed = Math.min(r.speed, nearest.speed + 400);
    }
    tx = clamp(tx, -0.9, 0.9);
    r.x += clamp(tx - r.x, -1.3 * dt, 1.3 * dt);
    r.dist += r.speed * dt;

    if (engaged && !r.atk) {
      r.cd -= dt;
      const dx = player.x - r.x;
      if (r.cd <= 0 && Math.abs(dz) < 380 && Math.abs(dx) < 0.72 && Math.abs(dx) > 0.05) {
        startAttack(r, Math.sign(dx)); r.cd = rand(0.9, 2.0) / r.aggr / (1 + round * 0.1);
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
    if (Math.abs(c.x) > 1.5) { c.x = Math.sign(c.x) * 1.5; c.vx = 0; c.mode = 'sit'; }
  } else if (c.mode === 'chase') {
    c.chaseT -= dt;
    // run alongside the front wheel (a little ahead of the auto) until it outpaces the dog
    const top = MAX_SPEED * (c.chaseT > 2 ? 0.7 : 0.4); // strong sprint, then it tires
    c.speed += clamp(clamp(player.speed + (220 - dz) * 2, 0, top) - c.speed, -MAX_SPEED * dt, MAX_SPEED * 0.6 * dt);
    const tx = clamp(player.x + c.side * 0.32, -1.6, 1.6);
    c.x += clamp(tx - c.x, -1.2 * dt, 1.2 * dt);
    if (c.barkT <= 0 && Math.abs(dz) < 900) {
      c.barkT = rand(0.35, 0.7); Sfx.bark();
      const s = c.scr && c.scr.frame === frameNo ? c.scr : null;
      popup(pick(['BHOW!', 'BHOW BHOW!', 'WOOF!', 'GRRR!']), s ? s.x : W / 2 + c.side * 190, s ? s.y : H - 210, '#fff', 20);
    }
    if (c.chaseT <= 0 || dz < -700) { c.mode = 'sit'; c.tx = Math.sign(c.x || 1) * 1.3; }
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
  for (const c of traffic) {
    if (c.type === 'dog') { updateDog(c, dt); continue; }
    if (c.type === 'cow') {
      c.scared -= dt;
      if (c.pause > 0) c.pause -= dt;
      else { c.x += c.vx * dt; if (Math.random() < dt * 0.1 && c.scared <= 0) c.pause = rand(1, 4); }
      if (Math.abs(c.x) > 1.4) { c.vx = -Math.sign(c.x) * rand(0.05, 0.12); c.x = Math.sign(c.x) * 1.4; }
      c.img = c.vx > 0 ? SP.cowR : SP.cowL;
    } else {
      c.laneT -= dt; if (c.laneT <= 0) { c.laneT = rand(5, 14); c.tx = pick([-0.66, 0, 0.66]); }
      c.x += clamp(c.tx - c.x, -0.35 * dt, 0.35 * dt);
      c.z = (c.z + c.speed * dt) % trackLength;
    }
  }
}

function checkCollisions() {
  if (player.crash > 0) return;
  const pw = TUK_NW, seg = findSegment(player.dist);
  if (Math.abs(player.x) > 1) {
    for (const s of seg.sprites) {
      if (!s.solid) continue;
      const cx = s.offset + Math.sign(s.offset) * s.nw / 2;
      if (overlap(player.x, pw * 0.7, cx, s.nw * 0.55)) {
        crashPlayer('WRECKED!', 25, -Math.sign(s.offset)); player.speed = 0;
        player.x = s.offset - Math.sign(s.offset) * pw * 0.6; return;
      }
    }
  }
  for (const c of traffic) {
    const dz = wrapDelta(c.z - player.dist);
    if (dz < -60 || dz > 230 || !overlap(player.x, pw * 0.85, c.x, c.nw * 0.85)) continue;
    if (player.speed <= c.speed) continue;
    if (c.type === 'dog') { // the dog always leaps clear; you lose speed swerving
      if (c.mode === 'chase') continue;
      Sfx.yelp(); c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 1.1; c.x += Math.sign(c.vx) * 0.25; c.tried = true;
      player.speed *= 0.75; player.lean -= Math.sign(c.vx) * 0.4; shake = 0.12;
      popup('KAI KAI!', W / 2 + Math.sign(c.vx) * 120, H - 250, '#fff', 22);
      return;
    }
    const rel = (player.speed - c.speed) / MAX_SPEED;
    if (c.type === 'cow') { Sfx.moo(); c.vx = (c.x >= player.x ? 1 : -1) * 0.8; c.scared = 2; }
    if (rel > 0.3) { crashPlayer(`SMASHED INTO A ${c.label}!`, 20 + rel * 25); player.speed = c.speed * 0.3; }
    else { player.speed = c.speed * 0.8; player.health -= 3; Sfx.bump(); shake = 0.15; }
    player.dist -= 230 - dz;
    return;
  }
  for (const r of rivals) {
    const dz = r.dist - player.dist;
    if (Math.abs(dz) > 200 || !overlap(player.x, pw, r.x, r.nw)) continue;
    if (r.ko > 0) {
      if (dz > 0 && player.speed / MAX_SPEED > 0.3) { crashPlayer(`TRIPPED OVER ${r.name}!`, 15); player.speed *= 0.3; player.dist -= 200 - dz; return; }
      continue;
    }
    const dx = player.x - r.x, ov = (pw + r.nw) / 2 - Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    if (Math.abs(dx) < (pw + r.nw) / 2 * 0.55) {
      if (dz > 0 && player.speed > r.speed) { player.speed = r.speed * 0.95; player.dist -= 200 - dz; Sfx.bump(); }
      else if (dz < 0 && r.speed > player.speed) { r.speed = player.speed * 0.95; r.dist = player.dist - 200; }
    } else { player.x += dir * ov * 0.5; r.x -= dir * ov * 0.5; }
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
  cash += prize + bonus;
  results = { order, rank, prize, bonus, qualified: rank <= 3 };
  trackEvent(`race-finish/${ordinal(rank)}`, `Finished ${ordinal(rank)}: ${track.name}`);
  store.set('cash', cash);
  state = 'results';
}

function advanceAfterResults() {
  if (results.qualified) {
    level++;
    if (level >= TRACKS.length) { level = 0; round++; store.set('round', round); store.set('level', level); state = 'champion'; attractSetup(); return; }
    store.set('level', level);
  }
  setupRace();
}

function attractSetup() {
  loadTrack(level);
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
  const x1 = seg.p1.screen.x, y1 = seg.p1.screen.y, w1 = seg.p1.screen.w;
  const x2 = seg.p2.screen.x, y2 = seg.p2.screen.y, w2 = seg.p2.screen.w;
  ctx.fillStyle = col.grass; ctx.fillRect(0, y2, W, y1 - y2 + 1);
  const r1 = w1 / 6, r2 = w2 / 6, s1 = w1 * 0.35, s2 = w2 * 0.35;
  poly(x1 - w1 - r1 - s1, y1, x1 - w1 - r1, y1, x2 - w2 - r2, y2, x2 - w2 - r2 - s2, y2, col.shoulder);
  poly(x1 + w1 + r1 + s1, y1, x1 + w1 + r1, y1, x2 + w2 + r2, y2, x2 + w2 + r2 + s2, y2, col.shoulder);
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
  } else if (col.lane) {
    const l1 = w1 / 32, l2 = w2 / 32, lw1 = w1 * 2 / LANES, lw2 = w2 * 2 / LANES;
    let lx1 = x1 - w1 + lw1, lx2 = x2 - w2 + lw2;
    for (let lane = 1; lane < LANES; lane++, lx1 += lw1, lx2 += lw2) poly(lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, col.lane);
  }
  const fog = 1 / Math.pow(Math.E, (n / DRAW_DIST) * (n / DRAW_DIST) * FOG_DENSITY);
  if (fog < 1) { ctx.globalAlpha = 1 - fog; ctx.fillStyle = theme.fog; ctx.fillRect(0, y2, W, y1 - y2 + 1); ctx.globalAlpha = 1; }
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  g.addColorStop(0, theme.sky[0]); g.addColorStop(0.6, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * (0.72 - skyOffset * 0.5), sy = H * (theme.night ? 0.16 : 0.27);
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
  const layer = (img, off, bottom) => {
    const lw = img.width, x0 = -Math.floor(off * lw);
    for (let x = x0; x < W; x += lw) ctx.drawImage(img, x, bottom - img.height);
    if (x0 > 0) ctx.drawImage(img, x0 - lw, bottom - img.height);
  };
  layer(bgLayers.far, farOffset, H / 2 + 30);
  layer(bgLayers.near, nearOffset, H / 2 + 50);
  ctx.fillStyle = theme.fog; ctx.fillRect(0, H / 2 + 50, W, H / 2);
}

function drawSprite(img, destX, destY, destW, destH, clipY) {
  const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
  if (clipH >= destH || destW < 1) return;
  ctx.drawImage(img, 0, 0, img.width, img.height - (img.height * clipH / destH), destX, destY, destW, destH - clipH);
}

// lathi (bamboo stick) swing, drawn on top of a tuk-tuk sprite rect
function drawLathi(x, y, w, h, atk) {
  const side = atk.side, p = clamp(atk.t / atk.dur, 0, 1);
  const sx = x + w * (0.5 + side * 0.34), sy = y + h * 0.3;
  const a = lerp(-1.9, 0.35, 1 - (1 - p) * (1 - p));
  const dx = Math.cos(a) * side, dy = Math.sin(a);
  const hx = sx + dx * w * 0.28, hy = sy + dy * w * 0.28;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3949ab'; ctx.lineWidth = w * 0.07; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dx * w * 0.12, sy + dy * w * 0.12); ctx.stroke();
  ctx.strokeStyle = '#8d5524'; ctx.lineWidth = w * 0.05; ctx.beginPath(); ctx.moveTo(sx + dx * w * 0.1, sy + dy * w * 0.1); ctx.lineTo(hx, hy); ctx.stroke();
  const ex = hx + dx * w * 0.5, ey = hy + dy * w * 0.5;
  ctx.strokeStyle = '#c8a165'; ctx.lineWidth = w * 0.035; ctx.beginPath(); ctx.moveTo(hx - dx * w * 0.06, hy - dy * w * 0.06); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = w * 0.037;
  for (const t of [0.3, 0.6, 0.9]) { const bx = lerp(hx, ex, t), by = lerp(hy, ey, t); ctx.beginPath(); ctx.moveTo(bx - dx * 2, by - dy * 2); ctx.lineTo(bx + dx * 2, by + dy * 2); ctx.stroke(); }
  ctx.fillStyle = '#8d5524'; ctx.beginPath(); ctx.arc(hx, hy, w * 0.035, 0, Math.PI * 2); ctx.fill();
  if (p > 0.25 && p < 0.75) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = w * 0.02; ctx.beginPath();
    const R = w * 0.75; const a0 = -1.6, a1 = a;
    if (side > 0) ctx.arc(sx, sy, R, a0, a1); else ctx.arc(sx, sy, R, Math.PI - a1, Math.PI - a0);
    ctx.stroke();
  }
}

function drawTuk(img, x, y, w, h, rot, atk, hurt) {
  ctx.save();
  if (hurt > 0) x += Math.sin(hurt * 90) * w * 0.04; // shudder when hit
  if (rot) {
    const px = x + w * (rot > 0 ? 0.9 : 0.1), py = y + h * 0.93;
    ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py);
  }
  ctx.drawImage(img, x, y, w, h);
  if (atk) drawLathi(x, y, w, h, atk);
  ctx.restore();
}

function render() {
  frameNo++;
  ctx.save();
  if (shake > 0) ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 10);
  drawBackground();

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
        const y = cy - destH + bounce;
        if (y + destH <= seg.clip + destH * 0.5) drawTuk(car.img, cx - destW / 2, y, destW, destH, car.rot, car.atk, car.hurt);
        car.scr = { x: cx, y: cy - destH * 1.1, w: destW, frame: frameNo };
      } else { drawSprite(car.img, cx - destW / 2, cy - destH, destW, destH, seg.clip); car.scr = { x: cx, y: cy - destH * 1.2, w: destW, frame: frameNo }; }
    }
    if (seg === playerSeg) drawPlayer(playerSeg, playerPct);
  }
  for (const s of touched) s.cars.length = 0;

  // particles
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.t * 1.5, 0, 1); ctx.fillStyle = p.color;
    const sz = p.size + (p.grow ? (0.7 - p.t) * p.grow : 0);
    ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawPopups();
  drawBubbles();
  if (state === 'title') drawTitle();
  else if (state === 'champion') drawChampion();
  else { drawHUD(); if (state === 'countdown') drawCountdown(); if (state === 'results') drawResults(); }
  if (paused) drawPaused(); else drawMessages();
}

function drawPlayer(seg, pct) {
  const scale = CAM_DEPTH / PLAYER_Z;
  const destW = TUK_NW * ROAD_W * scale * W / 2, destH = destW * SP.player.height / SP.player.width;
  const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, pct);
  const sp = player.speed / MAX_SPEED;
  const bumpy = Math.abs(player.x) > 1 ? 4 : 1.2;
  const bounce = player.crash > 0 ? 0 : (Math.random() - 0.5) * bumpy * sp * 2;
  const y = H / 2 - (scale * camY * H / 2) - destH + bounce;
  if (player.inv > 0 && Math.floor(player.inv * 10) % 2) return;
  drawTuk(SP.player, W / 2 - destW / 2, y, destW, destH, player.rot, player.atk, player.hurt);
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

function drawHUD() {
  const rank = currentRank(), total = rivals.length + 1;
  panel(12, 12, 190, 84);
  text(`${rank}`, 24, 50, 44, rank <= 3 ? '#ffeb3b' : '#fff', 'left');
  text(`/${total}`, 24 + ctx.measureText(`${rank}`).width + 4, 58, 18, '#ddd', 'left');
  text(fmtTime(raceTime), 190, 34, 18, '#fff', 'right');
  text(`TRACK ${level + 1}`, 190, 58, 12, '#ffcc80', 'right');
  text(`KO ${player.kos}`, 190, 80, 12, '#ff8a80', 'right');
  text('ESC MENU', 24, 84, 9, 'rgba(255,255,255,.55)', 'left');

  panel(W - 212, 12, 200, 60);
  text(fmtCash(cash), W - 24, 34, 20, '#a5d6a7', 'right');
  text(track.name, W - 24, 58, 10, '#ffcc80', 'right');

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
  bar(24, H - 44, 200, 14, player.health / 100, player.health > 35 ? '#66bb6a' : '#ef5350', 'YOUR AUTO');
  // tip warning
  if (Math.abs(player.lean) > 0.7 && player.crash <= 0 && state === 'race') {
    const a = 0.6 + Math.sin(performance.now() / 70) * 0.4;
    ctx.globalAlpha = a; text(player.tip > 0 ? '⚠ TIPPING! SLOW DOWN' : '⚠ EASY ON THE TURN', W / 2, H - 290, 22, '#ff5252'); ctx.globalAlpha = 1;
  }
  // nearest rival
  let near = null, nd = 1600;
  for (const r of rivals) { const d = Math.abs(r.dist - player.dist); if (d < nd) { nd = d; near = r; } }
  if (near) bar(W - 250, H - 110, 200, 12, near.ko > 0 ? 0 : near.health / 100, near.ko > 0 ? '#9e9e9e' : '#ffa726', near.ko > 0 ? `${near.name} (KO)` : near.name);

  // speedometer
  const cx = W - 80, cy = H - 26, R = 58;
  panel(cx - R - 12, cy - R - 14, R * 2 + 24, R + 36, 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, 0); ctx.stroke();
  const sp = player.speed / MAX_SPEED;
  ctx.strokeStyle = sp > 0.85 ? '#ff7043' : '#ffd21f'; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, Math.PI + Math.PI * sp); ctx.stroke();
  const na = Math.PI + Math.PI * sp; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (R - 14), cy + Math.sin(na) * (R - 14)); ctx.stroke();
  text(`${Math.round(sp * KMH)}`, cx, cy - 20, 22, '#fff');
  text('KM/H', cx, cy - 4, 9, '#ccc');
}

function drawBubbles() {
  for (const b of bubbles) {
    let x, y;
    if (b.who.isPlayer) { x = W / 2 + 60; y = H - 270; }
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
  text(track.name, W / 2, H / 2 + 20, 24, '#ffcc80');
  text(`Finish top 3 to qualify  ·  ${rivals.length} rival autos`, W / 2, H / 2 + 52, 14, '#fff', 'center', 'system-ui, sans-serif');
  text(LAYOUTS[layoutIdx].label, W / 2, H / 2 + 80, 14, '#ffd21f');
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
    text('gas · brake · steer', cx, top + 124, 12, '#ddd', 'center', 'system-ui, sans-serif');
  };
  const fight = cx => {
    text('LATHI', cx, top + 18, 14, '#ff8a65');
    keycap(cx - 34, top + 60, cap(L.hitL[0]), 44, true); keycap(cx + 34, top + 60, cap(L.hitR[0]), 44, true);
    text('◀ swing', cx - 34, top + 88, 11, '#ddd', 'center', 'system-ui, sans-serif');
    text('swing ▶', cx + 34, top + 88, 11, '#ddd', 'center', 'system-ui, sans-serif');
    text(`horn: SPACE · ${cap(L.horn[1])} · ${cap(L.horn[2])}`, cx, top + 120, 12, '#ddd', 'center', 'system-ui, sans-serif');
  };
  panel(W / 2 - 300, top, 600, 176, 0.55);
  text('LEFT HAND', W / 2 - 150, top + 2 + 150, 10, '#aaa'); text('RIGHT HAND', W / 2 + 150, top + 2 + 150, 10, '#aaa');
  if (arrowsDrive) { fight(W / 2 - 150); drive(W / 2 + 150); } else { drive(W / 2 - 150); fight(W / 2 + 150); }
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2, top + 14); ctx.lineTo(W / 2, top + 160); ctx.stroke();
  text(`TAB: switch hands  ·  P pause  ·  M mute`, W / 2, top + 168, 11, '#ffcc80', 'center', 'system-ui, sans-serif');
}
function drawTitle() {
  ctx.fillStyle = 'rgba(10,5,20,.45)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, 110); ctx.rotate(-0.04);
  text('ROAD RASH', 0, 0, 84, '#ffd21f'); ctx.restore();
  ctx.save(); ctx.translate(W / 2, 178); ctx.rotate(-0.04);
  text('RICKSHAW RUMBLE', 0, 0, 38, '#4caf50'); ctx.restore();
  drawControls(222);
  const a = 0.5 + Math.sin(performance.now() / 250) * 0.5;
  ctx.globalAlpha = 0.4 + a * 0.6; text('PRESS ENTER TO RACE', W / 2, 462, 26, '#fff'); ctx.globalAlpha = 1;
  // track selector
  const canL = level > 0, canR = level < unlocked;
  panel(W / 2 - 250, 408, 500, 34, 0.55);
  text('\u25c0', W / 2 - 232, 425, 16, canL ? '#ffd21f' : 'rgba(255,255,255,.2)');
  text('\u25b6', W / 2 + 232, 425, 16, canR ? '#ffd21f' : 'rgba(255,255,255,.2)');
  text(TRACKS[level].name, W / 2, 425, 16, '#fff');
  text(`Race ${level + 1} of ${TRACKS.length}  \u00b7  \u2190 \u2192 choose  \u00b7  Wallet ${fmtCash(cash)}${round ? `  \u00b7  Tour ${round + 1}` : ''}`, W / 2, 500, 12, '#ffcc80', 'center', 'system-ui, sans-serif');
  text('Mind the tip-over: three wheels don\'t like sharp turns at full speed!', W / 2, 522, 12, '#ddd', 'center', 'system-ui, sans-serif');
  text('Engine: "Auto Rickshaw - Start, Idle, Revving" by kalhan \u00b7 Chennai street: Nielsvdb \u00b7 both CC BY 4.0 via freesound.org', W - 8, 534, 8, 'rgba(255,255,255,.45)', 'right', 'system-ui, sans-serif', false);
}
function drawChampion() {
  ctx.fillStyle = 'rgba(10,5,20,.55)'; ctx.fillRect(0, 0, W, H);
  text('🏆', W / 2, 140, 80, '#fff', 'center', 'sans-serif', false);
  text('AUTO KING OF INDIA!', W / 2, 240, 48, '#ffd21f');
  text(`You won all ${TRACKS.length} races across India. Wallet: ${fmtCash(cash)}`, W / 2, 300, 18, '#fff', 'center', 'system-ui, sans-serif');
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
    text(me ? 'YOU' : a.name, W / 2 - 132, y, 16, me ? '#ffd21f' : '#fff', 'left');
    text(a.finished ? fmtTime(a.time) : '—', W / 2 + 220, y, 16, '#ddd', 'right');
  });
  const by = 140 + r.order.length * 28;
  text(`Prize ${fmtCash(r.prize)}   +   KO bonus ${fmtCash(r.bonus)}   =   ${fmtCash(r.prize + r.bonus)}`, W / 2, by + 8, 16, '#a5d6a7', 'center', 'system-ui, sans-serif');
  text(`Wallet: ${fmtCash(cash)}`, W / 2, by + 36, 18, '#fff');
  const a = 0.5 + Math.sin(performance.now() / 250) * 0.5;
  ctx.globalAlpha = 0.4 + a * 0.6;
  text(r.qualified ? (level + 1 >= TRACKS.length ? 'ENTER — CLAIM YOUR CROWN' : `ENTER — NEXT: ${TRACKS[level + 1].name}`) : 'ENTER — TRY AGAIN (TOP 3 NEEDED)', W / 2, by + 76, 20, '#ffd21f');
  ctx.globalAlpha = 1;
  text('ESC — MAIN MENU', W / 2, by + 104, 13, '#ddd');
}
const pauseItemRect = i => ({ x: W / 2 - 170, y: 118 + i * 50, w: 340, h: 40 });
function drawPaused() {
  ctx.fillStyle = 'rgba(12,6,20,.86)'; ctx.fillRect(0, 0, W, H);
  text('PAUSED', W / 2, 66, 50, '#fff');
  PAUSE_MENU.forEach((m, i) => {
    const r = pauseItemRect(i), sel = i === pauseSel;
    ctx.fillStyle = sel ? '#ffd21f' : 'rgba(255,255,255,.1)'; rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    text((sel ? '\u25b6  ' : '') + m.label, W / 2, r.y + r.h / 2 + 1, 18, sel ? '#1a1a1a' : '#fff', 'center', FONT, !sel);
  });
  text('\u2191 \u2193 choose  \u00b7  ENTER select  \u00b7  ESC resume  \u00b7  TAB switch hands', W / 2, 284, 12, '#ffcc80', 'center', 'system-ui, sans-serif');
  drawControls(300);
}
// mouse / trackpad on the pause menu
canvas.addEventListener('click', e => {
  if (!paused) return;
  const b = canvas.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  PAUSE_MENU.forEach((m, i) => { const r = pauseItemRect(i); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) runCommand(m.cmd); });
});
canvas.addEventListener('mousemove', e => {
  if (!paused) return;
  const b = canvas.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  PAUSE_MENU.forEach((m, i) => { const r = pauseItemRect(i); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) pauseSel = i; });
});

// ------------------------------------------------------------------ layout & loop
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${Math.floor(W * s)}px`; canvas.style.height = `${Math.floor(H * s)}px`;
}
addEventListener('resize', fit);

buildSharedSprites();
attractSetup();
fit();
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
  else Sfx.setEngine(0, false);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// expose for debugging
window.__rrr = { get state() { return state; }, player, get rivals() { return rivals; }, get results() { return results; }, setupRace,
  step(n) { for (let i = 0; i < n; i++) update(STEP); render(); }, keys, Sfx, Music, Ambience, SKYLINES, THEMES, SP, get traffic() { return traffic; }, get bubbles() { return bubbles; }, setLevel(l) { level = l; attractSetup(); } };
})();
