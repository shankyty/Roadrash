'use strict';
// Track, city, skyline and style packs register here. resolve() merges a track with its city and style
// into the one definition the game reads; validate() checks every pack named in the manifest (packs.js).
// No DOM access outside load(), so it also runs under Node for tests.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});

class Registry {
  constructor(kind) { this.kind = kind; this.items = new Map(); }
  register(def) {
    if (!def || typeof def.id !== 'string') throw new Error(`${this.kind} pack has no id`);
    if (this.items.has(def.id)) throw new Error(`${this.kind} "${def.id}" is registered twice`);
    this.items.set(def.id, def);
  }
  get(id) { return this.items.get(id); }
  has(id) { return this.items.has(id); }
  ids() { return [...this.items.keys()]; }
}

// Pack shapes: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function', or a nested shape.
// A key ending in ? is optional. Keys that aren't listed are reported, which catches typos.
const ROAD = { lengths: 'array', pieces: 'array', lanes: 'string', junctions: 'boolean', footpath: 'any' }; // footpath: settings or false, see checkFootpath
const TRAFFIC = { countScale: 'number', oncoming: 'number', mix: 'object' };
const HANDLING = { topSpeed: 'number', driftScrub: 'number', driftGrip: 'number', driftExitBoost: 'number', slipstream: 'number' };
const SCORING = { driftCashPer100: 'number', passCash: 'number', jumpCash: 'number', flyoverCash: 'number' };
const optional = shape => Object.fromEntries(Object.entries(shape).map(([k, v]) => [k.endsWith('?') ? k : k + '?', v]));
const SHAPES = {
  style: { id: 'string', label: 'string', road: ROAD, traffic: TRAFFIC, handling: HANDLING, scoring: SCORING },
  city: { id: 'string', hawkerCalls: 'array', curses: 'array', song: 'object', ads: 'array', busLooks: 'array' },
  skyline: { id: 'string', far: 'function', near: 'function' },
  track: {
    id: 'string', name: 'string', city: 'string', style: 'string', seed: 'number', length: 'number', laps: 'number',
    rivals: { count: 'number', skill: 'number' },
    traffic: { count: 'number', cows: 'number', dogs: 'number', ...optional(TRAFFIC) },
    'ambience?': 'boolean',
    look: {
      'night?': 'boolean', sky: 'array', sun: 'string', fog: 'string', sea: 'string', far: 'string', near: 'string', lights: 'number', density: 'number',
      light: { road: 'string', grass: 'string', rumble: 'string', lane: 'string', shoulder: 'string' },
      dark: { road: 'string', grass: 'string', rumble: 'string', shoulder: 'string' },
      buildings: 'array', scenery: 'object',
    },
    'road?': optional(ROAD), 'handling?': optional(HANDLING), 'scoring?': optional(SCORING),
  },
};
const typeOf = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
function check(value, shape, where, problems) {
  if (shape === 'any') return;
  if (typeof shape === 'string') { if (typeOf(value) !== shape) problems.push(`${where}: expected ${shape}, got ${typeOf(value)}`); return; }
  if (typeOf(value) !== 'object') { problems.push(`${where}: expected object, got ${typeOf(value)}`); return; }
  const known = new Set();
  for (const [key, sub] of Object.entries(shape)) {
    const opt = key.endsWith('?'), name = opt ? key.slice(0, -1) : key;
    known.add(name);
    if (value[name] === undefined) { if (!opt) problems.push(`${where}.${name}: missing`); continue; }
    check(value[name], sub, `${where}.${name}`, problems);
  }
  for (const key of Object.keys(value)) if (!known.has(key)) problems.push(`${where}.${key}: unknown key`);
}
const nums = v => Array.isArray(v) && v.length > 0 && v.every(Number.isFinite);
// a track's road and traffic after its style and its own overrides are merged: values the shapes can't express.
// Which parameters a piece takes and which scenery kinds exist is the builder's to say (RRR.PIECE_PARAMS, RRR.SCENERY_KINDS).
function checkMerged(road, traffic, where, problems) {
  if (!['alternate', 'wide'].includes(road.lanes)) problems.push(`${where}.road.lanes: must be 'alternate' or 'wide'`);
  checkFootpath(road.footpath, `${where}.road.footpath`, problems);
  // a wrong type is already reported by the shape; here only what a hang or a throw at build time would come from
  if (Array.isArray(road.lengths) && !(road.lengths.length && road.lengths.every(n => Number.isFinite(n) && n > 0)))
    problems.push(`${where}.road.lengths: must be a non-empty array of numbers above 0`);
  if (Array.isArray(road.pieces) && !road.pieces.length) problems.push(`${where}.road.pieces: must be a non-empty array`);
  (Array.isArray(road.pieces) ? road.pieces : []).forEach((p, i) => {
    const at = `${where}.road.pieces[${i}]`;
    if (!p || !(RRR.PIECES || {})[p.kind]) { problems.push(`${at}.kind: unknown piece "${p && p.kind}"`); return; }
    if (!(p.weight > 0)) problems.push(`${at}.weight: must be above 0`);
    const params = (RRR.PIECE_PARAMS || {})[p.kind] || {};
    for (const [name, type] of Object.entries(params)) {
      if (p[name] === undefined) problems.push(`${at}.${name}: missing`);
      else if (type === 'number' && !Number.isFinite(p[name])) problems.push(`${at}.${name}: must be a number`);
      else if (type === 'numbers' && !nums(p[name])) problems.push(`${at}.${name}: must be a non-empty array of numbers`);
    }
    for (const key of Object.keys(p)) if (key !== 'kind' && key !== 'weight' && !(key in params)) problems.push(`${at}.${key}: unknown key`);
  });
  if (typeOf(traffic.mix) !== 'object') return;
  if (!Object.keys(traffic.mix).length) problems.push(`${where}.traffic.mix: must be a non-empty object`);
  for (const [type, share] of Object.entries(traffic.mix)) {
    if (!(RRR.VEHICLES || {})[type]) problems.push(`${where}.traffic.mix.${type}: unknown vehicle`);
    if (!(Number.isInteger(share) && share > 0)) problems.push(`${where}.traffic.mix.${type}: must be a positive whole number`);
  }
}
// the roadside kinds a track's look.scenery weights
// a track's footpath: false for none, or how wide it is, what the kerb costs and how far apart the stalls stand
function checkFootpath(fp, where, problems) {
  if (fp === false) return;
  if (typeOf(fp) !== 'object') { problems.push(`${where}: must be false or footpath settings`); return; }
  const share = v => Number.isFinite(v) && v >= 0 && v < 1, gap = fp.stallEvery;
  if (!(Number.isFinite(fp.width) && fp.width > 0)) problems.push(`${where}.width: must be a number above 0`);
  for (const k of ['climbLoss', 'dropLoss']) if (!share(fp[k])) problems.push(`${where}.${k}: must be a share from 0 up to 1`);
  if (!(Array.isArray(gap) && gap.length === 2 && gap.every(n => Number.isFinite(n) && n > 0) && gap[0] <= gap[1]))
    problems.push(`${where}.stallEvery: must be two numbers above 0, low then high`);
  for (const key of Object.keys(fp)) if (!['width', 'climbLoss', 'dropLoss', 'stallEvery'].includes(key)) problems.push(`${where}.${key}: unknown key`);
}
function checkScenery(scenery, where, problems) {
  if (typeOf(scenery) !== 'object') return;
  if (!Object.keys(scenery).length) problems.push(`${where}.look.scenery: must be a non-empty object`);
  for (const [kind, weight] of Object.entries(scenery)) {
    if (!(RRR.SCENERY_KINDS || []).includes(kind)) problems.push(`${where}.look.scenery.${kind}: unknown scenery kind`);
    if (!(Number.isFinite(weight) && weight > 0)) problems.push(`${where}.look.scenery.${kind}: must be a number above 0`);
  }
}

RRR.styles = new Registry('style');
RRR.cities = new Registry('city');
RRR.skylines = new Registry('skyline');
RRR.tracks = new Registry('track');
RRR.manifest = null;

// every pack file the manifest names, in load order
RRR.packFiles = m => [...m.styles.map(id => `styles/${id}.js`), ...m.cities.flatMap(id => [`cities/${id}/city.js`, `cities/${id}/skyline.js`]),
  ...m.tracks.map(id => `tracks/${id}/track.js`)];
// called by packs.js: remembers the manifest and, in a browser, loads every pack file (in order, before the
// scripts that follow packs.js)
RRR.load = manifest => {
  RRR.manifest = manifest;
  if (typeof document === 'undefined' || document.readyState !== 'loading') return; // document.write after parsing would wipe the page
  for (const file of RRR.packFiles(manifest)) document.write(`<script src="${file}"><\/script>`);
};
RRR.order = () => RRR.manifest.tracks.slice();

// a list of problems, each naming the pack and field; empty when every pack in the manifest is sound
RRR.validate = () => {
  const m = RRR.manifest, problems = [];
  if (!m) return ['packs.js did not load: there is no manifest'];
  const lists = ['styles', 'cities', 'tracks'].filter(k => !Array.isArray(m[k]));
  if (lists.length) return lists.map(k => `packs.js manifest: "${k}" must be a list of pack ids`);
  const each = (ids, registry, shape, file) => {
    for (const id of ids) {
      const pack = registry.get(id);
      if (!pack) problems.push(`${registry.kind} "${id}": not registered (${file(id)} is missing or failed to load)`);
      else check(pack, shape, `${registry.kind} "${id}"`, problems);
    }
  };
  each(m.styles, RRR.styles, SHAPES.style, id => `styles/${id}.js`);
  each(m.cities, RRR.cities, SHAPES.city, id => `cities/${id}/city.js`);
  each(m.cities, RRR.skylines, SHAPES.skyline, id => `cities/${id}/skyline.js`);
  each(m.tracks, RRR.tracks, SHAPES.track, id => `tracks/${id}/track.js`);
  for (const id of m.tracks) {
    const t = RRR.tracks.get(id), where = `track "${id}"`;
    if (!t) continue;
    if (typeOf(t.look) === 'object') checkScenery(t.look.scenery, where, problems);
    if (typeof t.city === 'string' && !RRR.cities.has(t.city)) problems.push(`${where}.city: unknown city "${t.city}"`);
    const style = RRR.styles.get(t.style);
    if (typeof t.style === 'string' && !style) problems.push(`${where}.style: unknown style "${t.style}"`);
    if (style && typeOf(style.road) === 'object' && typeOf(style.traffic) === 'object')
      checkMerged(mergeRoad(style.road, t.road), { ...style.traffic, ...t.traffic }, where, problems);
  }
  return problems;
};

// a style's road with a track's overrides, per key; the footpath's own keys merge too, and false switches it off
function mergeRoad(base, over = {}) {
  const road = { ...base, ...over }, fp = over.footpath;
  if (typeOf(fp) === 'object' && typeOf(base.footpath) === 'object') road.footpath = { ...base.footpath, ...fp };
  return road;
}
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
// The definition the game reads: the track's own fields, its city pack and skyline, and the style's road,
// traffic, handling and scoring with the track's overrides applied per key. Frozen all the way down.
RRR.resolveDef = track => {
  const style = RRR.styles.get(track.style), city = RRR.cities.get(track.city);
  if (!style) throw new Error(`track "${track.id}": unknown style "${track.style}"`);
  if (!city) throw new Error(`track "${track.id}": unknown city "${track.city}"`);
  return deepFreeze({
    ...track, ambience: track.ambience !== false,
    city, skyline: RRR.skylines.get(track.city), styleLabel: style.label,
    road: mergeRoad(style.road, track.road), traffic: { ...style.traffic, ...track.traffic },
    handling: { ...style.handling, ...track.handling }, scoring: { ...style.scoring, ...track.scoring },
  });
};
RRR.resolve = id => {
  const track = RRR.tracks.get(id);
  if (!track) throw new Error(`unknown track "${id}"`);
  return RRR.resolveDef(track);
};
})();
