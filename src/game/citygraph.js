// V2.1 street life on a generated city (world/citygen.js): traffic lanes
// and pavement walks follow the road graph's polylines instead of the
// downtown grid lines.

// A polyline with its length and cumulative distances.
export function makePath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, len: cum.at(-1) };
}
// Point and unit direction `s` metres along a path (clamped to its ends).
export function pointAt(path, s) {
  const { pts, cum, len } = path;
  s = Math.max(0, Math.min(len, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1;
  const t = (s - cum[i - 1]) / L;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ux: (b.x - a.x) / L, uz: (b.z - a.z) / L };
}
// Nearest point of a path to (x, z): its distance along and from it.
export function project(path, x, z) {
  let best = { s: 0, d: Infinity };
  const { pts, cum } = path;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2));
    const d = Math.hypot(a.x + vx * t - x, a.z + vz * t - z);
    if (d < best.d) best = { s: cum[i - 1] + t * Math.sqrt(l2), d };
  }
  return best;
}
// The polyline moved sideways by `off` (right of travel is (-uz, ux)).
function offset(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: p.x - ((b.z - a.z) / L) * off, z: p.z + ((b.x - a.x) / L) * off };
  });
}

// Traffic lanes: both directions of every road, keeping right; indexed by
// the junction each one starts from.
export function buildLanes(graph) {
  const lanes = [], from = new Map();
  for (const e of graph.edges) {
    if ((e.kind !== "road" && e.kind !== "overpass") || e.a == null) continue;
    const off = e.kind === "overpass" ? 2.4 : e.width >= 10 ? 2.75 : 2.0;
    for (const dir of [1, -1]) {
      const pts = dir > 0 ? e.pts : e.pts.slice().reverse();
      const lane = { id: lanes.length, edge: e.id, dir, start: dir > 0 ? e.a : e.b, end: dir > 0 ? e.b : e.a, op: e.kind === "overpass" ? 0 : null, ...makePath(offset(pts, off)) };
      lanes.push(lane);
      if (!from.has(lane.start)) from.set(lane.start, []);
      from.get(lane.start).push(lane);
    }
  }
  return { lanes, from };
}

// Pavement walks: both sides of every road, just off the kerb.
export function buildWalks(graph) {
  const walks = [];
  for (const e of graph.edges) {
    if (e.kind !== "road") continue;
    for (const side of [1, -1]) walks.push({ id: walks.length, edge: e.id, ...makePath(offset(e.pts, side * (e.width / 2 + 1.2))) });
  }
  return walks;
}
export function nearestWalk(walks, x, z) {
  let best = null;
  for (const w of walks) {
    const p = project(w, x, z);
    if (!best || p.d < best.d) best = { walk: w, s: p.s, d: p.d };
  }
  return best;
}
