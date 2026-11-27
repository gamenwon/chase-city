import { CONFIG } from "../game/config.js";
export function createLayout() {
  const buildings = [],
    parks = [];
  for (let x = -90; x <= 90; x += 30)
    for (let z = -90; z <= 90; z += 30) {
      const cx = x + 15,
        cz = z + 15;
      if (cx > 100 || cz > 100) continue;
      if (((x + 90) / 30 + (2 * (z + 90)) / 30) % 5 === 0) {
        parks.push({ x: cx, z: cz });
        continue;
      }
      for (let a = -1; a <= 1; a += 2)
        for (let b = -1; b <= 1; b += 2) {
          const seed = Math.abs(x * 17 + z * 31 + a * 19 + b * 7);
          buildings.push({
            x: cx + a * 4.6,
            z: cz + b * 4.6,
            w: 7,
            d: 7,
            h: 5 + (seed % 13),
            color: seed % 6,
          });
        }
    }
  // Benches use the same dimensions and positions as the visible park props.
  const obstacles = parks.map((p) => ({
    x: p.x + 4,
    z: p.z,
    w: 3,
    d: 0.8,
    kind: "bench",
  }));
  return { buildings, parks, obstacles };
}
export function resolveBuilding(body, box, radius = CONFIG.radius) {
  const nx = Math.max(box.x - box.w / 2, Math.min(body.x, box.x + box.w / 2));
  const nz = Math.max(box.z - box.d / 2, Math.min(body.z, box.z + box.d / 2));
  let dx = body.x - nx,
    dz = body.z - nz,
    dist = Math.hypot(dx, dz);
  if (dist >= radius) return false;
  if (dist === 0) {
    const sides = [
      { v: body.x - (box.x - box.w / 2), x: -1, z: 0 },
      { v: box.x + box.w / 2 - body.x, x: 1, z: 0 },
      { v: body.z - (box.z - box.d / 2), x: 0, z: -1 },
      { v: box.z + box.d / 2 - body.z, x: 0, z: 1 },
    ].sort((a, b) => a.v - b.v);
    dx = sides[0].x;
    dz = sides[0].z;
    body.x += dx * (sides[0].v + radius);
    body.z += dz * (sides[0].v + radius);
  } else {
    body.x += (dx / dist) * (radius - dist);
    body.z += (dz / dist) * (radius - dist);
  }
  return true;
}
// Gaps between buildings too narrow for a car (the car is 2.3 m across)
// are filled with an invisible collider, so a building row reads as one
// flat wall to physics (a shallow 0.6 m notch at the mouth): no V-shaped pocket at a gap's mouth that a car
// shoved into it can wedge in. Gaps a car fits through (alleys) are kept.
// (In a mini passage (citygen.js) the filler stops every car but the
// mini: kind "minigap".)
export function gapFillers(buildings, maxGap = 2 * CONFIG.radius + 0.9, passages = []) {
  const out = [];
  for (let i = 0; i < buildings.length; i++)
    for (let j = i + 1; j < buildings.length; j++) {
      const a = buildings[i], b = buildings[j];
      for (const [k, w, o, ow] of [["x", "w", "z", "d"], ["z", "d", "x", "w"]]) {
        const lo = a[k] < b[k] ? a : b, hi = lo === a ? b : a;
        const gap = hi[k] - hi[w] / 2 - (lo[k] + lo[w] / 2);
        if (gap <= 0.01 || gap > maxGap) continue;
        // Recessed 0.6 m into the gap at each end: a car (radius 1.15) in
        // the mouth rests on the filler and cannot reach both corners.
        const s0 = Math.max(a[o] - a[ow] / 2, b[o] - b[ow] / 2) + 0.6, s1 = Math.min(a[o] + a[ow] / 2, b[o] + b[ow] / 2) - 0.6;
        if (s1 - s0 < 0.5) continue;
        const c = (lo[k] + lo[w] / 2 + hi[k] - hi[w] / 2) / 2;
        const box = { kind: "gap", hidden: true };
        box[k] = c;
        box[w] = gap + 0.02;
        box[o] = (s0 + s1) / 2;
        box[ow] = s1 - s0;
        if (passages.some((q) => box.x > q.x0 - 0.1 && box.x < q.x1 + 0.1 && box.z > q.z0 - 0.1 && box.z < q.z1 + 0.1)) box.kind = "minigap";
        out.push(box);
      }
    }
  return out;
}
