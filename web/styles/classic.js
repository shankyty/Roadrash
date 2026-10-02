'use strict';
// Classic: the original Rickshaw Rumble mix of straights, bends, hills and bumps, with everyday traffic.
RRR.styles.register({
  id: 'classic',
  label: 'CLASSIC',
  road: {
    lengths: [25, 50, 75],               // a piece's enter / hold / leave length, in segments
    pieces: [                            // drawn by weight until the road is long enough
      { kind: 'straight', weight: 16 },
      { kind: 'curve', weight: 26, curves: [2, 4, 6], hills: [0, 0, 20, -20, 40] },
      { kind: 'sCurve', weight: 14, curve: 2, hills: [0, 20, -20] },   // curve, twice as sharp back, curve
      { kind: 'hill', weight: 12, hills: [20, 40, 60] },
      { kind: 'rollers', weight: 12 },
      { kind: 'bumps', weight: 10 },
      { kind: 'curveHill', weight: 10, curve: 6, hill: 30 },
    ],
    lanes: 'alternate',                  // 'alternate': 3 and 2 lanes each way in turn · 'wide': always 3
    junctions: true,
  },
  traffic: {
    countScale: 1,                       // same-way vehicles = the track's count × this
    oncoming: 0.8,                       // oncoming vehicles = same-way vehicles × this
    mix: { car: 4, bike: 4, bus: 2, truck: 1, tractor: 1 },
  },
  handling: { topSpeed: 1, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 0, passCash: 0 },
});
