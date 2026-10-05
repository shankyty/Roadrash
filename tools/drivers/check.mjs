// Checks web/drivers.js (the rival cast): schema, ranges, balance, one driver per city.
//   node tools/drivers/check.mjs            the config alone
//   node tools/drivers/check.mjs --clips    also: every curse has a recorded clip in web/voices.js
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const TRACK_CITIES = ['mumbai', 'hyderabad', 'delhi', 'chennai'];
const HEADGEAR = ['none', 'turban', 'safa', 'cap', 'pallu'];
const SHAPES = ['lathi', 'bat', 'hockey', 'umbrella', 'cane', 'cloth', 'shoe', 'bag', 'dandiya', 'hand'];
const SOUNDS = ['wood', 'slap', 'thud'];
const MOVES = ['chop', 'pull', 'lowsweep', 'jab', 'uppercut', 'whip', 'smack', 'roundhouse', 'double', 'slap', 'sidekick', 'highkick', 'volley'];
const CONTACTS = ['head', 'body', 'low'];
const fails = [];
const fail = (who, what) => fails.push(`${who}: ${what}`);

let drivers = [];
try {
  const src = readFileSync(join(WEB, 'drivers.js'), 'utf8');
  drivers = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
} catch (e) { fail('drivers.js', e.message); }

const hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const within = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;
const pair = (v, lo, hi) => Array.isArray(v) && v.length === 2 && within(v[0], lo, hi) && within(v[1], lo, hi) && v[0] <= v[1];

for (const d of drivers) {
  const id = d.id || '(no id)', must = (ok, what) => { if (!ok) fail(id, what); };
  must(/^[a-z]+$/.test(d.id || ''), 'id must be lowercase letters');
  for (const k of ['name', 'city', 'cityName', 'tag']) must(typeof d[k] === 'string' && d[k], `${k} missing`);
  const l = d.look || {}, v = d.voice || {}, w = d.weapon || {}, s = d.style || {};
  for (const k of ['body', 'trim', 'canopy', 'shirt', 'headgearColor']) must(hex(l[k]), `look.${k} must be #rrggbb`);
  must(typeof l.plate === 'string' && l.plate.length <= 10, 'look.plate missing or over 10 characters');
  must(typeof l.slogan === 'string' && l.slogan.length <= 24 && (l.slogan || l.rear === 'grille'), 'look.slogan missing or over 24 characters');
  must(l.rear === undefined || ['slogan', 'grille'].includes(l.rear), 'look.rear must be slogan or grille');
  must(l.visor === undefined || hex(l.visor), 'look.visor must be #rrggbb');
  must(l.seat === undefined || hex(l.seat), 'look.seat must be #rrggbb');
  must(HEADGEAR.includes(l.headgear), `look.headgear must be one of ${HEADGEAR}`);
  must(l.neon === null || hex(l.neon), 'look.neon must be #rrggbb or null');
  for (const k of ['lang', 'describe']) must(typeof v[k] === 'string' && v[k], `voice.${k} missing`);
  must(v.seed === undefined || Number.isInteger(v.seed), 'voice.seed must be a whole number');
  must(within(v.rate, 0.8, 1.2), 'voice.rate must be 0.8 to 1.2');
  must(Array.isArray(d.curses) && d.curses.length === 5, 'needs exactly five curses');
  for (const c of d.curses || []) must(c.text && c.say && c.text === c.text.toUpperCase(), `curse "${c.text}" needs upper-case text and say`);
  must(['swing', 'kick'].includes(w.kind), 'weapon.kind must be swing or kick');
  if (w.kind === 'swing') must(SHAPES.includes(w.shape), `weapon.shape must be one of ${SHAPES}`);
  must(hex(w.color), 'weapon.color must be #rrggbb');
  must(MOVES.includes(w.move), `weapon.move must be one of ${MOVES}`);
  must(CONTACTS.includes(w.contact), `weapon.contact must be one of ${CONTACTS}`);
  must(w.wet === undefined || typeof w.wet === 'boolean', 'weapon.wet must be true or false');
  must(within(w.power, 0.7, 1.4), 'weapon.power must be 0.7 to 1.4');
  must(within(w.reach, 0.8, 1.2), 'weapon.reach must be 0.8 to 1.2');
  must(within(w.cooldown, 0.7, 1.3), 'weapon.cooldown must be 0.7 to 1.3');
  must(SOUNDS.includes(w.sound), `weapon.sound must be one of ${SOUNDS}`);
  must(Array.isArray(w.hitWords) && w.hitWords.length >= 2, 'weapon.hitWords needs two or more');
  must(within(s.pace, -0.06, 0.02), 'style.pace must be -0.06 to 0.02');
  must(within(s.bends, 0.12, 0.32), 'style.bends must be 0.12 to 0.32');
  must(within(s.aggression, 0, 1.3), 'style.aggression must be 0 to 1.3');
  must(within(s.chase, 500, 1300), 'style.chase must be 500 to 1300');
  must(pair(s.weave, 1.5, 12), 'style.weave must be [min, max] within 1.5 to 12');
  must(within(s.nerve, 0, 1), 'style.nerve must be 0 to 1');
  must(pair(s.launch, 0.05, 0.6), 'style.launch must be [min, max] within 0.05 to 0.6');
  must(within(s.grudge, 1, 2.5), 'style.grudge must be 1 to 2.5');
  must(within(s.daring, 0, 1), 'style.daring must be 0 to 1');
}

const dup = key => drivers.map(d => d[key]).filter((v, i, a) => a.indexOf(v) !== i);
for (const k of ['id', 'city', 'name']) for (const v of dup(k)) fail('cast', `two drivers share ${k} "${v}"`);
for (const v of drivers.map(d => d.weapon?.move).filter((v, i, a) => a.indexOf(v) !== i)) fail('cast', `two drivers share the move "${v}"`);
for (const c of TRACK_CITIES) if (!drivers.some(d => d.city === c)) fail('cast', `no driver from track city ${c}`);
if (drivers.length < 7) fail('cast', `needs at least seven drivers, has ${drivers.length}`);
const mean = f => drivers.reduce((a, d) => a + f(d), 0) / (drivers.length || 1);
const pace = mean(d => d.style?.pace ?? 0), power = mean(d => d.weapon?.power ?? 0);
if (Math.abs(pace + 0.02) > 0.005) fail('balance', `mean pace is ${pace.toFixed(4)}, must be -0.02 ± 0.005`);
if (Math.abs(power - 1) > 0.05) fail('balance', `mean weapon power is ${power.toFixed(3)}, must be 1.0 ± 0.05`);

if (process.argv.includes('--clips')) {
  const src = readFileSync(join(WEB, 'voices.js'), 'utf8');
  const clips = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
  for (const d of drivers) for (const c of d.curses || []) if (!clips[`${d.id}|${c.text}`]) fail(d.id, `no voice clip for "${c.text}"`);
}

if (fails.length) { console.error(fails.join('\n')); console.error(`\n${fails.length} problem(s)`); process.exit(1); }
console.log(`${drivers.length} drivers OK (mean pace ${pace.toFixed(4)}, mean power ${power.toFixed(3)})`);
