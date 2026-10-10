'use strict';
// Race order and prize money, as plain functions. No DOM access.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const PRIZES = [1500, 1000, 700, 400, 200, 100, 50, 0];
// finishers in the order they crossed the line, then everyone still racing, furthest along first
const order = (finishOrder, racers) => [...finishOrder, ...racers.filter(a => !a.finished).sort((a, b) => b.dist - a.dist)];
const prize = rank => PRIZES[rank - 1] || 0;
RRR.standings = { PRIZES, order, prize };
})();
