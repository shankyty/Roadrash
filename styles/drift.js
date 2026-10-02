'use strict';
// Drift: tight bends chained one after another. Flat out without sliding you run wide or tip over; held in a
// drift the auto keeps its speed, is pulled round the bend and gets a kick on the way out.
RRR.styles.register({
  id: 'drift',
  label: 'DRIFT',
  road: {
    lengths: [25, 50],
    pieces: [
      { kind: 'curve', weight: 40, curves: [6, 8], hills: [0, 0, 20, -20] },
      { kind: 'sCurve', weight: 35, curve: 4, hills: [0, 20, -20] },   // 4, then 8 the other way, then 4
      { kind: 'curveHill', weight: 15, curve: 6, hill: 30 },
      { kind: 'straight', weight: 10 },
    ],
    lanes: 'alternate',
    junctions: true,
  },
  traffic: {
    countScale: 0.6,
    oncoming: 0.5,
    mix: { car: 4, bike: 4, bus: 2, truck: 1, tractor: 1 },
  },
  handling: { topSpeed: 1, driftScrub: 0.08, driftGrip: 0.25, driftExitBoost: 0.08, slipstream: 0 },
  scoring: { driftCashPer100: 40, passCash: 10 },
});
