'use strict';
// Lays out the track around the camera each frame.
// ---------------------------------------------------------------- per-frame track frame (camera space)
function buildFrame(player) {
  const L = segments3D.length;
  camAbs = ((player.dist - cam.back) % trackLength3D + trackLength3D) % trackLength3D;
  baseIdx = Math.floor(camAbs / SEG_LEN_3D) % L;
  camFrac = (camAbs % SEG_LEN_3D) / SEG_LEN_3D;
  const base = segments3D[baseIdx];
  // height is measured from the road under the player's auto (as the original game did), so your auto
  // stays in the same place on screen over crests and dips
  const pAbs = ((player.dist % trackLength3D) + trackLength3D) % trackLength3D, ps = segments3D[Math.floor(pAbs / SEG_LEN_3D) % L], pf = (pAbs % SEG_LEN_3D) / SEG_LEN_3D;
  const camY = ps.p1.world.y + (ps.p2.world.y - ps.p1.world.y) * pf + cam.height;
  // road centre at the camera: the camera follows the player sideways (slightly lagging)
  const camX = player.x * ROAD_W_3D * 0.8;
  let th = -base.curve * CURVE_TO_RAD * camFrac; aroundIdx = DRAW;
  let x = -camX - Math.sin(th) * camFrac * SEG_LEN_3D, z = camFrac * SEG_LEN_3D;
  for (let n = 0; n <= DRAW; n++) {
    const seg = segments3D[(baseIdx + n) % L];
    P[n] = P[n] || { x: 0, z: 0 }; P[n].x = x; P[n].z = z; TH[n] = th; Y[n] = seg.p1.world.y - camY;
    x += Math.sin(th) * SEG_LEN_3D; z -= Math.cos(th) * SEG_LEN_3D;
    th += seg.curve * CURVE_TO_RAD;
    if (n < aroundIdx && Math.abs(th) > AROUND) aroundIdx = n; // from here on the road is around the bend
  }
}
// camera-space position for something `d` units ahead of the camera, `xn` road half-widths from the centre
const tmp = { x: 0, y: 0, z: 0, th: 0 };
function placeAt(d, xn, out = tmp) {
  let s = d / SEG_LEN_3D + camFrac;
  if (s < 0) s = 0; if (s > DRAW - 1) s = DRAW - 1;
  const i = Math.floor(s), f = s - i;
  const th = TH[i] + (TH[i + 1] - TH[i]) * f;
  const cx = P[i].x + (P[i + 1].x - P[i].x) * f, cz = P[i].z + (P[i + 1].z - P[i].z) * f;
  out.th = th; out.x = cx + Math.cos(th) * xn * ROAD_W_3D; out.z = cz + Math.sin(th) * xn * ROAD_W_3D;
  out.y = Y[i] + (Y[i + 1] - Y[i]) * f;
  return out;
}
const wrapD = d => { d = ((d % trackLength3D) + trackLength3D) % trackLength3D; return d > trackLength3D / 2 ? d - trackLength3D : d; };
