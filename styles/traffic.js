'use strict';
// Traffic: a wide, mostly straight road packed with same-way traffic. Passing close gives a slipstream, and
// passes in quick succession stack it, so the fast line is through the gaps.
RRR.styles.register({
  id: 'traffic',
  label: 'TRAFFIC',
  road: {
    lengths: [50, 75],
    pieces: [
      { kind: 'straight', weight: 45 },
      { kind: 'curve', weight: 30, curves: [1, 2, 3], hills: [0, 0, 20, -20] },
      { kind: 'hill', weight: 15, hills: [20, 40] },
      { kind: 'rollers', weight: 10 },
    ],
    lanes: 'wide',
    junctions: true,
  },
  traffic: {
    countScale: 1.6,
    oncoming: 0.4,
    mix: { car: 5, bike: 2, bus: 3, truck: 2 },
  },
  handling: { topSpeed: 1, driftScrub: 0.22, driftGrip: 1, driftExitBoost: 0, slipstream: 0.04 },
  scoring: { driftCashPer100: 20, passCash: 25 },
});
