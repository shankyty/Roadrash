'use strict';
// Vehicle looks and the shared sprite table.
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
