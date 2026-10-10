'use strict';
// Tyre marks.
// ---------------------------------------------------------------- tyre marks
// dark streaks the rear wheels leave on the road while drifting; each fades out over MARK_LIFE seconds
const MARK_N = 700, MARK_LIFE = 10, MARK_W = 55;
let marksMesh = null;
function updateMarks(marks, now) {
  if (!marksMesh) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(MARK_N * 18), 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(MARK_N * 24), 4).setUsage(T.DynamicDrawUsage));
    marksMesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    marksMesh.frustumCulled = false; marksMesh.renderOrder = 2; scene.add(marksMesh);
  }
  const pos = marksMesh.geometry.attributes.position.array, col = marksMesh.geometry.attributes.color.array, a = {}, b = {};
  let n = 0;
  for (let i = Math.max(0, marks.length - MARK_N); i < marks.length; i++) {
    const m = marks[i], age = now - m.t; if (age > MARK_LIFE) continue;
    const d1 = wrapD(m.d1 - camAbs), d2 = wrapD(m.d2 - camAbs);
    if (d1 < -600 || d1 > 30000) continue;
    placeAt(d1, m.x1, a); placeAt(d2, m.x2, b);
    let px = -(b.z - a.z), pz = b.x - a.x; const l = Math.hypot(px, pz) || 1; px = px / l * MARK_W / 2; pz = pz / l * MARK_W / 2;
    const q = [a.x - px, a.y + 3, a.z - pz, a.x + px, a.y + 3, a.z + pz, b.x + px, b.y + 3, b.z + pz, a.x - px, a.y + 3, a.z - pz, b.x + px, b.y + 3, b.z + pz, b.x - px, b.y + 3, b.z - pz];
    for (let k = 0; k < 18; k++) pos[n * 18 + k] = q[k];
    const alpha = 0.55 * (1 - age / MARK_LIFE);
    for (let k = 0; k < 6; k++) { col[n * 24 + k * 4] = 0.06; col[n * 24 + k * 4 + 1] = 0.06; col[n * 24 + k * 4 + 2] = 0.07; col[n * 24 + k * 4 + 3] = alpha; }
    n++;
  }
  marksMesh.geometry.setDrawRange(0, n * 6);
  marksMesh.geometry.attributes.position.needsUpdate = true; marksMesh.geometry.attributes.color.needsUpdate = true;
}
