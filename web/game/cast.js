'use strict';
// The drivers: their weapons, attack moves and the starting grid.
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
    if (bad) reportProblem('drivers', `driver ${d && d.id}: ${bad}`); else out.push(d);
  }
  if (!out.length) reportProblem('drivers', 'drivers.js missing or empty: plain rivals');
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
