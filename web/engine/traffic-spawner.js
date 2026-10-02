'use strict';
// Fills a built road with traffic, cows and dogs from the definition's traffic profile. No DOM access.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const { pick, mulberry32 } = RRR.util;

// most buses are packed (people at every window, hanging off the footboard); r picks the livery
const busLook = (list, r) => { const l = list[Math.floor(r() * list.length)]; return r() < 0.7 ? { ...l, crowd: true } : l; };

// What each vehicle type in a traffic mix looks like and how fast it goes (s: share of top speed).
// s.tr is the track's seeded traffic generator; draws happen in a fixed order so a seed always gives the same road.
const VEHICLES = {
  car: s => { const i = Math.floor(s.tr() * s.looks.CAR_LOOKS.length); return { ...s.looks.CAR_LOOKS[i], look: s.looks.CAR_LOOKS[i], img: s.SP.carLooks[i] }; },
  bike: s => { const rash = s.tr() < 0.3; return { img: s.SP.bikes[pick(rash ? s.looks.BIKE_RASH : s.looks.BIKE_CALM, s.tr)], rash, nw: 0.17, len: 860, s: rash ? [0.6, 0.78] : [0.38, 0.55], label: 'BIKE' }; },
  bus: s => ({ img: s.SP.bus, look: busLook(s.def.city.busLooks, s.tr), nw: 0.56, len: 3200, s: [0.28, 0.38], label: 'BUS' }),
  truck: s => ({ img: s.SP.truck, nw: 0.56, len: 2800, s: [0.25, 0.35], label: 'TRUCK' }),
  tractor: s => { const i = Math.floor(s.tr() * s.looks.TRACTOR_LOOKS.length), look = s.looks.TRACTOR_LOOKS[i]; return { look, img: s.SP.tractors[i], nw: look.crop === 'hay' ? 0.65 : 0.56, len: 3800, s: [0.14, 0.2], label: 'TRACTOR' }; },
};

class TrafficSpawner {
  // def: resolved track definition · round: tour number · world: { startZ, trackLength, halfAt, findSegment }
  // sprites: the shared sprite table (SP) · looks: { CAR_LOOKS, TRACTOR_LOOKS, BIKE_CALM, BIKE_RASH }
  // maxSpeed: the auto's top speed in track units · random: source for cosmetic offsets and speeds
  constructor({ def, round, world, sprites, looks, maxSpeed, random = Math.random }) {
    Object.assign(this, { def, world, SP: sprites, looks, maxSpeed });
    this.rand = (a, b) => a + random() * (b - a);
    this.tr = mulberry32(def.seed + 99 + round);
    this.traffic = [];
  }
  spawn() {
    const { count, countScale, oncoming, cows, dogs } = this.def.traffic, sameWay = Math.round(count * countScale);
    for (const type of this.deck(sameWay)) this.addVehicle(type, 1);
    for (const type of this.deck(Math.round(sameWay * oncoming))) this.addVehicle(type, -1);
    for (let i = 0; i < cows; i++) this.addCow();
    for (let i = 0; i < dogs; i++) this.addDog();
    return this.traffic;
  }
  // n vehicle types in exactly the mix's proportions, shuffled (random picks can come out lopsided on a track)
  deck(n) {
    const pattern = Object.entries(this.def.traffic.mix).flatMap(([type, share]) => Array(share).fill(type));
    const d = Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.tr() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  roadSpot() { return this.world.startZ + 7000 + this.tr() * (this.world.trackLength - 13000); } // clear of the starting grid (front and back)
  addVehicle(type, dir) {
    const { tr, rand, world } = this, z = this.roadSpot(), v = VEHICLES[type](this);
    const lanes = world.findSegment(z).lanes, lane = type === 'car' || type === 'bike' ? Math.floor(tr() * lanes) : lanes - 1;
    this.traffic.push({ type, dir, z, lane, x: RRR.road.laneX(dir, lane), img: v.img, look: v.look, rash: v.rash, nw: v.nw, len: v.len, speed: this.maxSpeed * rand(v.s[0], v.s[1]), label: v.label });
  }
  addCow() {
    const { tr, rand } = this, z = this.roadSpot(), h = this.world.halfAt(z);
    this.traffic.push({ type: 'cow', z, x: rand(-h - 0.2, h + 0.2), speed: 0, vx: pick([-1, 1], tr) * rand(0.05, 0.12), nw: 0.42, len: 380, pause: 0, scared: 0, label: 'HOLY COW' });
  }
  addDog() {
    const { tr, rand, world, SP } = this, z = world.startZ + 3000 + tr() * (world.trackLength - 8000), r = tr();
    const mode = r < 0.28 ? 'sleep' : r < 0.8 ? 'sit' : 'cross';
    const h = world.halfAt(z), x = mode === 'sleep' ? rand(-h + 0.1, h - 0.1) : mode === 'sit' ? pick([-1, 1], tr) * (h + rand(0.15, 0.5)) : rand(-h - 0.2, h + 0.2);
    this.traffic.push({ type: 'dog', label: 'DOG', z, x, speed: 0, vx: mode === 'cross' ? pick([-1, 1], tr) * rand(0.25, 0.4) : 0,
      mode, t: tr() * 3, look: SP.dogs[Math.floor(tr() * SP.dogs.length)], tried: false, barkT: 0, img: null, nw: 0.2, len: 170 });
  }
}

RRR.VEHICLES = VEHICLES;
RRR.busLook = busLook;
RRR.spawnTraffic = opts => new TrafficSpawner(opts).spawn();
})();
