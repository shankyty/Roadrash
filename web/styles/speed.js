'use strict';
// Speed: long straights and gentle bends on a wide road with no junctions and light traffic. The autos are
// tuned for 100 km/h; traffic is not, so everything ahead comes at you faster.
RRR.styles.register({
  id: 'speed',
  label: 'SPEED',
  road: {
    lengths: [50, 75, 100],
    pieces: [
      { kind: 'straight', weight: 40 },
      { kind: 'curve', weight: 35, curves: [1, 2, 3], hills: [0, 0, 20, -20] },
      { kind: 'hill', weight: 15, hills: [20, 40] },
      { kind: 'rollers', weight: 10 },
    ],
    lanes: 'wide',
    junctions: false,
    footpath: { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [250, 450] },
  },
  traffic: {
    countScale: 0.5,
    oncoming: 0.5,
    mix: { car: 5, bike: 3, bus: 2, truck: 2 },
  },
  handling: { topSpeed: 1.25, driftScrub: 0.22, driftGrip: 1, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 20, passCash: 10, jumpCash: 15, flyoverCash: 40 },
});
