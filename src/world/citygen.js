// Procedural city (core recovery pass: a module city). A new, playable
// layout for every run, from a seed (the same seed always gives the same
// city, so a bad map can be replayed: ?seed=1234). The result has the
// shape of world/layout.js plus a road graph, so physics (axis-aligned
// boxes), the renderer, the police and the facility locations all work:
//
//   road graph   a straight lattice (5 x 5 blocks of 33-40 m, a ring road,
//                one wide avenue each way); one to three pairs of blocks
//                merged into long blocks (T-junctions, a straight alley
//                where the street was); an elevated road along an avenue,
//                straight over two junctions or curving onto the other
//                avenue
//   modules      the facility modules of the last stable build, placed
//                whole: the gas station, the basketball court, the
//                fountain park and the gas depot each take a block (spread
//                over the city); two themed parks; the rest are building
//                blocks: continuous rows edge to edge along every street
//                (no recesses or slots), shopfronts on every street face,
//                a low drive-through hall in some (a shortcut)
//   edge         the strip past the ring road holds the yard sites
//                (parking, car wash, construction, market, café, depot,
//                plaza, billboard corners) with buildings past the edge
//                behind some; a visible wall along the edge, open only at
//                the four exit gates (a boom, down until the escape)
//
// Every generated city is checked (validateCity) and regenerated from the
// next derived seed if it fails: connected roads, clearance, alleys open
// at both ends, every facility placed, spawns and exits on the road, no
// closed pockets.
import { CONFIG } from "../game/config.js";
import { setLocations } from "../preview/locations/layout-consts.js";
import { locationSolids } from "../preview/locations/layout.js";
import { depotFlyers } from "../preview/locations/gasdepot.js";
import { parkPlan } from "../preview/locations/plan.js";
import { sitePlan } from "../preview/locations/sites.js";

export const CITY_HALF = 108; // city edge (|x|, |z|)
export const RING = 90; // ring road centre line
const CELL = 1; // raster cell, m
const N = (CITY_HALF * 2) / CELL;
const SIDEWALK = 2.4;
export const ALLEY_WIDTH = 6;

export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randomSeed = () => (Math.random() * 2 ** 31) >>> 0;

// Distance from point to segment, and the parameter along it.
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}
export function polyDist(px, pz, pts) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(px, pz, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z));
  return d;
}

// ------------------------------------------------------------ road graph --
// Lines of the lattice (core recovery pass): 4 or 5 blocks across, each
// 33-47 m centre to centre, so every block is a clean rectangle 21-36 m
// kerb to kerb: big enough for a whole facility module (20 x 20 m, the
// downtown block the gas station, court, fountain park and depot were
// built and tuned for) or two continuous rows of buildings. At least one
// inner line has 39 m+ either side (room for an elevated road's ramps).
function moduleLines(R) {
  // Two long steps of 39-40.5 m: side by side (a roomy line between them:
  // room for a curved elevated road's ramps), or one block apart (room for
  // a straight one across two junctions); the other three share the rest
  // (33-35.5 m each).
  const gap = R() < 0.5 ? 1 : 2;
  const r = Math.floor(R() * (5 - gap));
  const steps = [];
  for (let k = 0; k < 5; k++) steps.push(k === r || k === r + gap ? 39 + R() * 1.5 : 0);
  let rest = 2 * RING - steps.reduce((a, v) => a + v, 0);
  const free = steps.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
  const p = free.map(() => 0.93 + R() * 0.14), sum = p.reduce((a, v) => a + v, 0);
  free.forEach((k, i) => (steps[k] = (p[i] / sum) * rest));
  const out = [-RING];
  for (const v of steps) out.push(Math.round((out.at(-1) + v) * 2) / 2);
  out[out.length - 1] = RING;
  return out;
}
export function roadGraph(R) {
  const xs = moduleLines(R), zs = moduleLines(R);
  const I = xs.length, J = zs.length;
  const roomy = (l) => {
    for (let i = 1; i < l.length - 1; i++) if (l[i] - l[i - 1] >= 39 && l[i + 1] - l[i] >= 39) return i;
    return -1;
  };
  const rx = roomy(xs), rz = roomy(zs);
  // Avenues (straight, wide), not on the roomy lines themselves, so a
  // roomy junction lies on an avenue (overpass room).
  const pickLine = (n, avoid) => {
    for (let k = 0; k < 10; k++) {
      const i = 1 + Math.floor(R() * (n - 2));
      if (i !== avoid) return i;
    }
    return 1 + Math.floor(R() * (n - 2));
  };
  const ia = pickLine(I, rx), ja = pickLine(J, rz);
  // One width per line (a block side is one straight kerb).
  const lineW = (n, av) => Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 11 : i === av ? 14 : pick(R, [10, 11, 11, 12])));
  const wx = lineW(I, ia), wz = lineW(J, ja);
  const nodes = [];
  const at = (i, j) => nodes[i * J + j];
  for (let i = 0; i < I; i++)
    for (let j = 0; j < J; j++) nodes.push({ id: nodes.length, i, j, x: xs[i], z: zs[j], ring: i === 0 || i === I - 1 || j === 0 || j === J - 1 });
  const edges = [];
  const addEdge = (a, b, o) => edges.push({ id: edges.length, a: a.id, b: b.id, kind: "road", curve: 0, ...o });
  for (let i = 0; i < I; i++)
    for (let j = 0; j < J; j++) {
      const n = at(i, j);
      if (i < I - 1) addEdge(n, at(i + 1, j), { width: wz[j], ring: j === 0 || j === J - 1, avenue: j === ja, cell: [i, j, "h"] });
      if (j < J - 1) addEdge(n, at(i, j + 1), { width: wx[i], ring: i === 0 || i === I - 1, avenue: i === ia, cell: [i, j, "v"] });
    }
  // Merge a few pairs of blocks (one inner street segment removed: two
  // T-junctions and a long block, which gets a straight alley where the
  // street was). A block merges once at most; the network stays one.
  const alive = new Set(edges.map((e) => e.id));
  const keep = new Set();
  for (const [i, j] of [[ia, rz], [rx, ja]]) if (i > 0 && j > 0 && i < I - 1 && j < J - 1) for (const e of edges) if (e.a === at(i, j).id || e.b === at(i, j).id) keep.add(e.id);
  const merged = new Set(), removed = [];
  const target = 1 + Math.floor(R() * 3);
  for (const e of edges.filter((e) => !e.ring && !e.avenue && !keep.has(e.id)).sort(() => R() - 0.5)) {
    if (removed.length >= target) break;
    const [i, j, dir] = e.cell;
    // The two blocks either side of the segment.
    const cells = dir === "h" ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]];
    if (cells.some(([p, q]) => merged.has(`${p},${q}`))) continue;
    alive.delete(e.id);
    if (!connected(nodes, edges.filter((x) => alive.has(x.id)))) {
      alive.add(e.id);
      continue;
    }
    for (const [p, q] of cells) merged.add(`${p},${q}`);
    removed.push({ cells, dir, line: dir === "h" ? zs[j] : xs[i], width: dir === "h" ? wz[j] : wx[i] });
  }
  const list = edges.filter((e) => alive.has(e.id));
  list.forEach((e, k) => (e.id = k));
  for (const e of list) e.pts = polyline(nodes[e.a], nodes[e.b], 0);
  const overpass = placeOverpass(nodes, list, R, { I, J, ia, ja, at });
  list.forEach((e, k) => (e.id = k));
  return { nodes, edges: list, xs, zs, removed, overpass };
}

// The blocks of the lattice: rectangles (two cells for a merged pair),
// each with its kerb rectangle (inside the widest road on every side).
export function latticeBlocks(graph) {
  const { xs, zs, removed, edges } = graph;
  const I = xs.length - 1, J = zs.length - 1;
  const owner = new Map();
  const blocks = [];
  for (const r of removed) {
    const [[i0, j0], [i1, j1]] = r.cells;
    const b = { i0: Math.min(i0, i1), i1: Math.max(i0, i1), j0: Math.min(j0, j1), j1: Math.max(j0, j1), alley: r };
    blocks.push(b);
    for (const [p, q] of r.cells) owner.set(`${p},${q}`, b);
  }
  for (let i = 0; i < I; i++) for (let j = 0; j < J; j++) if (!owner.has(`${i},${j}`)) blocks.push({ i0: i, i1: i, j0: j, j1: j, alley: null });
  // Widest road along a side (x = const or z = const) over a span.
  const sideW = (axis, v, lo, hi) => {
    let w = 0;
    for (const e of edges) {
      if (e.kind !== "road") continue;
      const a = e.pts[0], b = e.pts.at(-1);
      if (axis === "x" ? Math.abs(a.x - v) > 0.01 || Math.abs(b.x - v) > 0.01 : Math.abs(a.z - v) > 0.01 || Math.abs(b.z - v) > 0.01) continue;
      const s0 = Math.min(axis === "x" ? a.z : a.x, axis === "x" ? b.z : b.x), s1 = Math.max(axis === "x" ? a.z : a.x, axis === "x" ? b.z : b.x);
      if (s1 <= lo + 0.5 || s0 >= hi - 0.5) continue;
      w = Math.max(w, e.width);
    }
    return w || 10;
  };
  for (const b of blocks) {
    const x0 = xs[b.i0], x1 = xs[b.i1 + 1], z0 = zs[b.j0], z1 = zs[b.j1 + 1];
    b.kx0 = x0 + sideW("x", x0, z0, z1) / 2;
    b.kx1 = x1 - sideW("x", x1, z0, z1) / 2;
    b.kz0 = z0 + sideW("z", z0, x0, x1) / 2;
    b.kz1 = z1 - sideW("z", z1, x0, x1) / 2;
    b.cx = (b.kx0 + b.kx1) / 2;
    b.cz = (b.kz0 + b.kz1) / 2;
    b.w = b.kx1 - b.kx0;
    b.d = b.kz1 - b.kz0;
  }
  return blocks;
}

// Elevated road (map quality pass): a real elevated roadway above an
// avenue, 2-3 blocks long. Ramps (28 m, eased at both ends) rise from the
// middle of the avenue, which is 18 m wide so ground traffic keeps a lane
// each side of a ramp; the deck (5.2 m up) crosses two or more junctions,
// or turns on a 16 m curve at the avenue crossing onto the other avenue.
// The streets underneath keep running (the avenue under the deck too).
// Pillars stand in the avenue's median, never in a crossing street.
export const OVERPASS = Object.freeze({ H: 5.2, R: 28, W: 8.6, solidFrom: 0.7, clear: 3.6, rc: 16, pillarStep: 12 });
const ease = (t) => t * t * (3 - 2 * t);
// s at which an eased ramp reaches height h.
function rampAt(h) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (ease(m) * OVERPASS.H < h) lo = m;
    else hi = m;
  }
  return lo * OVERPASS.R;
}
function placeOverpass(nodes, edges, R, { I, J, ia, ja, at }) {
  const inc = (n) => edges.filter((e) => e.a === n.id || e.b === n.id);
  const crossW = (n) => Math.max(8, ...inc(n).filter((e) => !e.avenue).map((e) => e.width), ...(inc(n).filter((e) => e.avenue).length > 2 ? [18] : []));
  const lineV = Array.from({ length: J }, (_, j) => at(ia, j)), lineH = Array.from({ length: I }, (_, i) => at(i, ja));
  const clearH = rampAt(OVERPASS.clear);
  const need = (n) => clearH + crossW(n) / 2 + 2.5; // foot -> first junction centre
  const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const dir = (p, q) => ({ x: (q.x - p.x) / dist(p, q), z: (q.z - p.z) / dist(p, q) });
  // The segment of an avenue line a point lies in, if it keeps clear of
  // the junctions at its ends.
  const segOf = (line, p) => {
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1], L = dist(a, b), u = dir(a, b);
      const t = (p.x - a.x) * u.x + (p.z - a.z) * u.z;
      const off = Math.abs((p.x - a.x) * u.z - (p.z - a.z) * u.x);
      if (off < 0.5 && t >= 0 && t <= L) return dist(p, a) >= 12 && dist(p, b) >= 12 ? { k, a, b } : null;
    }
    return null;
  };
  const cands = [];
  // Straight, across 2-3 junctions.
  for (const line of [lineV, lineH])
    for (let t1 = 0; t1 < line.length - 1; t1++)
      for (let t2 = t1 + 2; t2 < Math.min(line.length - 1, t1 + 4); t2++) {
        const J1 = line[t1 + 1], J2 = line[t2], u = dir(line[t1], line[t1 + 1]);
        const F1 = { x: J1.x - u.x * need(J1), z: J1.z - u.z * need(J1) }, F2 = { x: J2.x + u.x * need(J2), z: J2.z + u.z * need(J2) };
        const s1 = segOf(line, F1), s2 = segOf(line, F2);
        if (s1 && s2 && s1.k === t1 && s2.k === t2) cands.push({ pts: [F1, F2], feet: [[line, s1], [line, s2]], curved: false });
      }
  // Curved: along one avenue, round the avenue crossing, along the other.
  const C = at(ia, ja), iC = ja, jC = ia;
  for (const da of [-1, 1])
    for (const db of [-1, 1]) {
      const A = lineV, B = lineH;
      const aPrev = A[iC - da], bNext = B[jC + db];
      if (!aPrev || !bNext) continue;
      const uA = dir(aPrev, C), uB = dir(C, bNext);
      let F1 = null, F2 = null, s1 = null, s2 = null;
      for (let d = OVERPASS.R + OVERPASS.rc + 4; d < OVERPASS.R + OVERPASS.rc + 40 && !s1; d += 2) {
        const p = { x: C.x - uA.x * d, z: C.z - uA.z * d };
        const seg = segOf(A, p);
        // Junctions between the foot and the crossing are passed high.
        const ok = seg && A.every((n) => {
          const t = (n.x - p.x) * uA.x + (n.z - p.z) * uA.z;
          return t <= 0 || t >= d - 0.1 || t >= need(n);
        });
        if (ok) (F1 = p), (s1 = seg);
      }
      for (let d = OVERPASS.R + OVERPASS.rc + 4; d < OVERPASS.R + OVERPASS.rc + 40 && !s2; d += 2) {
        const p = { x: C.x + uB.x * d, z: C.z + uB.z * d };
        const seg = segOf(B, p);
        const ok = seg && B.every((n) => {
          const t = (p.x - n.x) * uB.x + (p.z - n.z) * uB.z;
          return t <= 0 || t >= d - 0.1 || t >= need(n);
        });
        if (ok) (F2 = p), (s2 = seg);
      }
      if (!F1 || !F2) continue;
      // Quarter circle from the first avenue onto the second.
      const rc = OVERPASS.rc, O = { x: C.x - uA.x * rc + uB.x * rc, z: C.z - uA.z * rc + uB.z * rc };
      const arc = [];
      for (let k = 0; k <= 10; k++) {
        const ph = (k / 10) * (Math.PI / 2);
        arc.push({ x: O.x + (-uB.x * Math.cos(ph) + uA.x * Math.sin(ph)) * rc, z: O.z + (-uB.z * Math.cos(ph) + uA.z * Math.sin(ph)) * rc });
      }
      cands.push({ pts: [F1, ...arc, F2], feet: [[A, s1], [B, s2]], curved: true });
    }
  if (!cands.length) return null;
  const curved = cands.filter((c) => c.curved), straight = cands.filter((c) => !c.curved);
  const pool = curved.length && (R() < 0.5 || !straight.length) ? curved : straight;
  const c = pool[Math.floor(R() * pool.length)];
  // Ramp feet become junctions on the avenue (the ground street carries
  // on through; traffic can take the ramp).
  const feet = c.pts.length ? [c.pts[0], c.pts.at(-1)] : [];
  const footNodes = feet.map((p, k) => {
    const [line, seg] = c.feet[k];
    const F = { id: nodes.length, x: p.x, z: p.z, foot: true };
    nodes.push(F);
    const e = edges.find((q) => (q.a === seg.a.id && q.b === seg.b.id) || (q.a === seg.b.id && q.b === seg.a.id));
    const [P, Q] = e.a === seg.a.id ? [seg.a, seg.b] : [seg.b, seg.a];
    edges.splice(edges.indexOf(e), 1);
    const mk = (u, v) => ({ ...e, id: -1, a: u.id, b: v.id, pts: [{ x: u.x, z: u.z }, { x: v.x, z: v.z }] });
    edges.push(mk(P, F), mk(F, Q));
    return F;
  });
  // Under the elevated road the avenue is 18 m wide (a lane each side of
  // a ramp or a pillar); elsewhere avenues stay 14 m.
  for (const e of edges)
    if (e.avenue && e.kind === "road") {
      const m = { x: (e.pts[0].x + e.pts.at(-1).x) / 2, z: (e.pts[0].z + e.pts.at(-1).z) / 2 };
      if (polyDist(m.x, m.z, c.pts) < 1 || footNodes.some((f) => f.id === e.a || f.id === e.b)) e.width = 18;
    }
  // The polyline, its length and directions at the ends.
  let L = 0;
  for (let k = 1; k < c.pts.length; k++) L += dist(c.pts[k - 1], c.pts[k]);
  const u = dir(c.pts[0], c.pts[1]), uEnd = dir(c.pts.at(-2), c.pts.at(-1));
  const op = { pts: c.pts, L, W: OVERPASS.W, H: OVERPASS.H, R: OVERPASS.R, a: { ...c.pts[0] }, u, n: { x: -u.z, z: u.x }, end: { ...c.pts.at(-1) }, uEnd, groundWidth: 18, curved: c.curved, destructible: false };
  {
    // Middle point (where a collapse would centre; collapse is off).
    let acc = 0;
    for (let k = 1; k < c.pts.length; k++) {
      const d = dist(c.pts[k - 1], c.pts[k]);
      if (acc + d >= L / 2) {
        const t = (L / 2 - acc) / d;
        op.junction = { x: c.pts[k - 1].x + (c.pts[k].x - c.pts[k - 1].x) * t, z: c.pts[k - 1].z + (c.pts[k].z - c.pts[k - 1].z) * t };
        break;
      }
      acc += d;
    }
  }
  // Pillars in the median every ~12 m under the high part, never inside a
  // junction or a crossing street.
  op.pillars = [];
  const cum = [0];
  for (let k = 1; k < c.pts.length; k++) cum.push(cum[k - 1] + dist(c.pts[k - 1], c.pts[k]));
  const at2 = (s) => {
    let k = 1;
    while (k < c.pts.length - 1 && cum[k] < s) k++;
    const t = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    return { x: c.pts[k - 1].x + (c.pts[k].x - c.pts[k - 1].x) * t, z: c.pts[k - 1].z + (c.pts[k].z - c.pts[k - 1].z) * t };
  };
  const roads = edges.filter((e) => e.kind === "road");
  for (let s = clearH + 3; s < L - clearH - 3; s += 2) {
    if (op.pillars.length && s - op.pillars.at(-1).s < 9) continue;
    const p = at2(s);
    if (nodes.some((n) => !n.foot && dist(n, p) < crossW(n) / 2 + 3)) continue;
    if (roads.some((e) => !e.avenue && polyDist(p.x, p.z, e.pts) < e.width / 2 + 1.5)) continue;
    // Only in an avenue's median (not on the curve over a junction).
    if (!roads.some((e) => e.avenue && polyDist(p.x, p.z, e.pts) < 0.8)) continue;
    op.pillars.push({ x: p.x, z: p.z, w: 1.3, d: 1.3, s });
  }
  edges.push({ id: -1, a: footNodes[0].id, b: footNodes[1].id, kind: "overpass", curve: 0, width: OVERPASS.W, pts: c.pts.map((p) => ({ ...p })), op });
  return op;
}
// Height of the elevated road `s` metres along it (eased ramps).
export function overpassHeight(op, s) {
  if (s <= 0 || s >= op.L) return 0;
  if (s < op.R) return op.H * ease(s / op.R);
  if (s > op.L - op.R) return op.H * ease((op.L - s) / op.R);
  return op.H;
}
// The part of each ramp a ground car cannot drive under (from 0.7 m up to
// 3.6 m), as axis-aligned boxes (ramps rise along an avenue). Only the
// ramp's own width: the avenue's lanes either side stay open.
export function rampSolids(op) {
  const s0 = rampAt(OVERPASS.solidFrom), s1 = rampAt(OVERPASS.clear);
  const out = [];
  for (const [p, u] of [[op.a, op.u], [op.end, { x: -op.uEnd.x, z: -op.uEnd.z }]]) {
    const cx = p.x + u.x * (s0 + s1) / 2, cz = p.z + u.z * (s0 + s1) / 2;
    const along = s1 - s0, across = op.W + 0.4;
    const alongX = Math.abs(u.x) > 0.5;
    out.push({ x: cx, z: cz, w: alongX ? along : across, d: alongX ? across : along, kind: "ramp" });
  }
  return out;
}
function pick(R, arr) {
  return arr[Math.floor(R() * arr.length)];
}
function connected(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const seen = new Set([nodes[0].id]), stack = [nodes[0].id];
  while (stack.length) for (const m of adj.get(stack.pop())) if (!seen.has(m)) seen.add(m), stack.push(m);
  return seen.size === nodes.length;
}
// A straight edge, or a quadratic bend with its control point pushed
// sideways by `curve` metres.
function polyline(a, b, curve) {
  if (!curve) return [{ x: a.x, z: a.z }, { x: b.x, z: b.z }];
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
  const cx = mx + nx * curve * 2, cz = mz + nz * curve * 2; // control point (peak = curve)
  const pts = [];
  const n = Math.max(6, Math.ceil(len / 4));
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, z: u * u * a.z + 2 * u * t * cz + t * t * b.z });
  }
  return pts;
}

// ---------------------------------------------------------------- raster --
// kind: 0 land, 1 road, 2 sidewalk, 3 alley, 4 open lot (park, car park,
// plaza, petrol station), 5 building, 6 outside the city
const LAND = 0, ROAD = 1, WALK = 2, ALLEY = 3, LOT = 4, BUILT = 5;
// Open lots by type (all count as open ground).
export const KIND = Object.freeze({ LAND, ROAD, WALK, ALLEY, LOT, BUILT, OUT: 6, PARK: 7, PARKING: 8, PLAZA: 9, GAS: 10 });
const isOpen = (k) => k === ROAD || k === WALK || k === ALLEY || k === LOT || k >= 7;
const cellOf = (v) => Math.floor((v + CITY_HALF) / CELL);
const worldOf = (c) => -CITY_HALF + (c + 0.5) * CELL;

function rasterRoads(graph, exits) {
  const kind = new Uint8Array(N * N);
  const near = new Float32Array(N * N).fill(Infinity); // to the nearest road centre minus half width
  const stamp = (pts, width) => {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], pad = width / 2 + SIDEWALK + 1;
      const c0 = Math.max(0, cellOf(Math.min(a.x, b.x) - pad)), c1 = Math.min(N - 1, cellOf(Math.max(a.x, b.x) + pad));
      const r0 = Math.max(0, cellOf(Math.min(a.z, b.z) - pad)), r1 = Math.min(N - 1, cellOf(Math.max(a.z, b.z) + pad));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const d = segDist(worldOf(c), worldOf(r), a.x, a.z, b.x, b.z) - width / 2;
          const i = r * N + c;
          if (d < near[i]) near[i] = d;
        }
    }
  };
  for (const e of graph.edges) stamp(e.pts, e.width);
  // Junctions: a disc as wide as the widest road there (rounded corners).
  for (const n of graph.nodes) {
    const w = Math.max(0, ...graph.edges.filter((e) => e.a === n.id || e.b === n.id).map((e) => e.width));
    if (w) stamp([{ x: n.x, z: n.z }, { x: n.x + 0.01, z: n.z }], w + 2);
  }
  for (const e of exits) stamp([e.anchor, { x: e.anchor.x + e.dx * 30, z: e.anchor.z + e.dz * 30 }], 11);
  for (let i = 0; i < N * N; i++) kind[i] = near[i] <= 0 ? ROAD : near[i] <= SIDEWALK ? WALK : LAND;
  return { kind, near };
}

function components(kind, value) {
  const comp = new Int32Array(N * N).fill(-1);
  const out = [];
  for (let s = 0; s < N * N; s++) {
    if (kind[s] !== value || comp[s] >= 0) continue;
    const id = out.length, cells = [s];
    comp[s] = id;
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k], r = (i / N) | 0, c = i % N;
      for (const j of [c > 0 ? i - 1 : -1, c < N - 1 ? i + 1 : -1, r > 0 ? i - N : -1, r < N - 1 ? i + N : -1])
        if (j >= 0 && kind[j] === value && comp[j] < 0) {
          comp[j] = id;
          cells.push(j);
        }
    }
    let c0 = N, c1 = 0, r0 = N, r1 = 0, sx = 0, sz = 0;
    for (const i of cells) {
      const r = (i / N) | 0, c = i % N;
      c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
      sx += worldOf(c); sz += worldOf(r);
    }
    out.push({ id, cells, area: cells.length * CELL * CELL, c0, c1, r0, r1, cx: sx / cells.length, cz: sz / cells.length });
  }
  return { comp, list: out };
}

// Largest axis-aligned rectangle of cells in a set (maximal rectangle in
// a histogram), within the component's bounding box.
function largestRect(inSet, c0, c1, r0, r1) {
  const w = c1 - c0 + 1, h = new Int32Array(w);
  let best = { area: 0 };
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) h[c - c0] = inSet(r, c) ? h[c - c0] + 1 : 0;
    const stack = [];
    for (let k = 0; k <= w; k++) {
      const v = k < w ? h[k] : 0;
      let start = k;
      while (stack.length && stack.at(-1)[1] >= v) {
        const [s, hv] = stack.pop();
        if (hv * (k - s) > best.area) best = { area: hv * (k - s), c0: c0 + s, c1: c0 + k - 1, r0: r - hv + 1, r1: r };
        start = s;
      }
      stack.push([start, v]);
    }
  }
  return best;
}
const rectWorld = (q) => ({
  x: (worldOf(q.c0) + worldOf(q.c1)) / 2,
  z: (worldOf(q.r0) + worldOf(q.r1)) / 2,
  w: (q.c1 - q.c0 + 1) * CELL,
  d: (q.r1 - q.r0 + 1) * CELL,
});

// --------------------------------------------------------------- the city --
// The facility modules of the last stable build (the locations), placed
// whole into the lattice: four landmark blocks, themed parks, building
// blocks; the outer strip between the ring road and the city edge holds
// the yard sites (parking, car wash, construction, market, café, depot,
// plaza), with buildings past the edge behind some of them.
const MODULE = 12; // raster: a facility module draws its own ground
const LANDMARKS = ["gas", "court", "park", "gasDepot"];
const YARD_BASE = ["parking", "carwash", "construction", "market", "cafe", "depot", "plaza"];
// The rest, weighted to the sites with vehicles (car parks, building
// sites, depots: more to wreck and blow up).
const YARD_MORE = ["parking", "parking", "construction", "depot", "parking", "market", "construction", "cafe", "depot", "parking", "carwash", "construction", "market", "depot", "cafe", "carwash", "plaza"];
const EDGE_MID = 101.75; // middle of the 95.5..108 strip
export function buildCity(seed) {
  const R = mulberry32(seed);
  const graph = roadGraph(R);
  // Exits: one gate per side, on a ring junction where a street meets the
  // ring, away from the corners.
  const exits = [];
  const sides = [
    { name: "NORTH GATE", id: "north", dx: 0, dz: -1, test: (n) => n.z === -RING },
    { name: "SOUTH GATE", id: "south", dx: 0, dz: 1, test: (n) => n.z === RING },
    { name: "WEST GATE", id: "west", dx: -1, dz: 0, test: (n) => n.x === -RING },
    { name: "EAST GATE", id: "east", dx: 1, dz: 0, test: (n) => n.x === RING },
  ];
  for (const s of sides) {
    const cands = graph.nodes.filter((n) => s.test(n) && Math.abs(s.dx ? n.z : n.x) < RING - 20 && graph.edges.filter((e) => e.a === n.id || e.b === n.id).length >= 3);
    if (!cands.length) continue;
    const n = cands[Math.floor(R() * cands.length)];
    exits.push({ id: `${s.id}-${Math.round(s.dx ? n.z : n.x)}`, name: s.name, dx: s.dx, dz: s.dz, x: s.dx ? s.dx * 140 : n.x, z: s.dz ? s.dz * 140 : n.z, anchor: { x: n.x, z: n.z } });
  }
  const { kind, near } = rasterRoads(graph, exits);
  const ramps = graph.overpass ? rampSolids(graph.overpass) : [];
  for (const q of ramps)
    for (let r = cellOf(q.z - q.d / 2); r <= cellOf(q.z + q.d / 2 - 0.01); r++)
      for (let c = cellOf(q.x - q.w / 2); c <= cellOf(q.x + q.w / 2 - 0.01); c++) if (r >= 0 && c >= 0 && r < N && c < N) kind[r * N + c] = 11;
  // Outside the city; the outer strip (past the ring road's kerb) is yard
  // ground at road level.
  const KERB = RING + 5.5;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const x = worldOf(c), z = worldOf(r), m = Math.max(Math.abs(x), Math.abs(z)), i = r * N + c;
      if (m > CITY_HALF - 0.5) kind[i] = 6;
      else if (m > KERB && kind[i] !== ROAD) kind[i] = KIND.PARKING;
    }
  const blocks = latticeBlocks(graph);
  const cellsIn = (x0, x1, z0, z1, fn) => {
    // Cells whose centre lies inside the rectangle.
    const lo = (v) => Math.max(0, Math.ceil((v + CITY_HALF) / CELL - 0.5)), hi = (v) => Math.min(N - 1, Math.floor((v + CITY_HALF) / CELL - 0.5));
    for (let r = lo(z0 + 0.01); r <= hi(z1 - 0.01); r++) for (let c = lo(x0 + 0.01); c <= hi(x1 - 0.01); c++) fn(r * N + c, worldOf(c), worldOf(r));
  };
  // ---- block types: four landmark modules, spread out; themed parks.
  const fits = (b, lo = 20.5, hi = 31) => !b.alley && b.w >= lo && b.d >= lo && b.w <= hi && b.d <= hi;
  const free = blocks.slice().sort(() => R() - 0.5);
  const taken = [];
  const spreadPick = (ok) => {
    const c = free.filter(ok);
    if (!c.length) return null;
    // The candidate farthest from the blocks already chosen (a little
    // randomness so the same lattice does not always give the same map).
    // Any block at least ~55 m from the others will do (not always the
    // corners): spacing capped, plus a random share.
    const score = (b) => (taken.length ? Math.min(55, ...taken.map((t) => Math.hypot(t.cx - b.cx, t.cz - b.cz))) : 0) + R() * 30;
    const best = c.reduce((a, b) => (score(b) > score(a) ? b : a));
    free.splice(free.indexOf(best), 1);
    taken.push(best);
    return best;
  };
  const loc = {};
  for (const name of LANDMARKS) {
    const b = spreadPick((x) => fits(x));
    if (!b) return { failed: `no block for the ${name}` };
    b.type = name;
    loc[name] = { x: b.cx, z: b.cz };
  }
  setLocations(loc);
  const parks = [], trees = [];
  for (let k = 0; k < 2; k++) {
    const b = spreadPick((x) => fits(x, 20.5, 40));
    if (!b) break;
    b.type = "green";
  }
  for (const b of free) b.type = "built";
  // ---- raster and contents per block.
  const buildings = [], alleys = [];
  const counts = { landmark: 0, park: 0, built: 0, alley: 0, shortcut: 0 };
  for (const b of blocks) {
    const S = SIDEWALK;
    if (LANDMARKS.includes(b.type)) {
      counts.landmark++;
      // The module's own 20 x 20 m ground; any margin round it is paving.
      cellsIn(b.kx0, b.kx1, b.kz0, b.kz1, (i, x, z) => {
        if (kind[i] === ROAD || kind[i] === 11) return;
        if (Math.abs(x - b.cx) < 10 && Math.abs(z - b.cz) < 10) kind[i] = MODULE;
        else if (kind[i] === LAND) kind[i] = KIND.PLAZA;
      });
      continue;
    }
    if (b.type === "green") {
      counts.park++;
      cellsIn(b.kx0 + S, b.kx1 - S, b.kz0 + S, b.kz1 - S, (i) => kind[i] === LAND && (kind[i] = KIND.PARK));
      parks.push({ x: b.cx, z: b.cz, w: b.w - 2 * S, d: b.d - 2 * S, area: (b.w - 2 * S) * (b.d - 2 * S), rects: [{ x: b.cx, z: b.cz, w: b.w - 2 * S, d: b.d - 2 * S }] });
      for (const sx of [-6, 6]) for (const sz of [-6, 6]) trees.push({ x: b.cx + sx, z: b.cz + sz });
      continue;
    }
    counts.built++;
    const commercial = Math.hypot(b.cx, b.cz) < 52 || R() < 0.3;
    const district = commercial ? "commercial" : "residential";
    const zone = { x0: b.kx0 + S, x1: b.kx1 - S, z0: b.kz0 + S, z1: b.kz1 - S };
    const zones = [];
    if (b.alley) {
      // A straight 6 m alley where the removed street ran, open at both
      // ends onto the pavement; a row of buildings either side.
      counts.alley++;
      const h = b.alley.dir === "h", v = b.alley.line, A = ALLEY_WIDTH / 2;
      const pts = h ? [{ x: b.kx0, z: v }, { x: b.kx1, z: v }] : [{ x: v, z: b.kz0 }, { x: v, z: b.kz1 }];
      alleys.push({ pts });
      cellsIn(h ? b.kx0 : v - A, h ? b.kx1 : v + A, h ? v - A : b.kz0, h ? v + A : b.kz1, (i) => kind[i] !== ROAD && (kind[i] = ALLEY));
      if (h) zones.push({ ...zone, z1: v - A }, { ...zone, z0: v + A });
      else zones.push({ ...zone, x1: v - A }, { ...zone, x0: v + A });
    } else zones.push(zone);
    const shortcut = !b.alley && R() < 0.85;
    for (const z of zones) if (packZone(z, R, buildings, { district, shortcut })) counts.shortcut++;
  }
  for (const b of buildings) cellsIn(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, (i) => kind[i] !== ROAD && kind[i] !== ALLEY && (kind[i] = BUILT));
  // Street faces of each building (next to pavement, road, alley or lot).
  const open = (x, z) => {
    const c = cellOf(x), r = cellOf(z);
    if (c < 0 || r < 0 || c >= N || r >= N) return false;
    return isOpen(kind[r * N + c]);
  };
  for (const b of buildings) {
    const probe = (fx, fz) => {
      let hit = 0, n = 0;
      const span = fx ? b.d : b.w;
      for (let s = -span / 2 + 0.5; s <= span / 2 - 0.5; s += 1) {
        n++;
        const x = b.x + (fx ? fx * (b.w / 2 + 0.6) : s), z = b.z + (fz ? fz * (b.d / 2 + 0.6) : s);
        if (open(x, z)) hit++;
      }
      return n > 0 && hit / n > 0.5;
    };
    b.street = [probe(0, 1), probe(0, -1), probe(1, 0), probe(-1, 0)]; // +z, -z, +x, -x
    const st = b.street;
    b.through = st[0] && st[1] && b.d <= 18 ? "z" : st[2] && st[3] && b.w <= 18 ? "x" : null;
    b.destructible = !!(b.destructible && b.through);
  }
  // ---- the outer strip: yard sites between the corners and the exits.
  const segs = [], stripItems = [], stripFlyers = [];
  for (const [axis, s] of [["x", -1], ["x", 1], ["z", -1], ["z", 1]]) {
    const ex = exits.find((e) => (axis === "x" ? e.dz === s : e.dx === s));
    const cut = ex ? (axis === "x" ? ex.anchor.x : ex.anchor.z) : null;
    const spans = cut == null ? [[-KERB, KERB]] : [[-KERB, cut - 8.5], [cut + 8.5, KERB]];
    for (const [lo, hi] of spans) {
      const n = Math.floor((hi - lo + 1) / 24.5);
      if (n < 1) continue;
      const gap = (hi - lo - 19 * n) / (n + 1);
      for (let k = 0; k < n; k++) {
        const c = lo + gap * (k + 1) + 19 * k + 9.5;
        segs.push(axis === "x" ? { x: c, z: s * EDGE_MID, along: "x", out: [0, s] } : { x: s * EDGE_MID, z: c, along: "z", out: [s, 0] });
      }
      // Between the sites: a lamp, a bench, a bin and a planter (all
      // breakable, none solid), a news stand now and then.
      if (gap >= 3.5)
        for (let k = 0; k <= n; k++) {
          const c = lo + gap * k + 19 * k + gap / 2;
          const at = (u, v) => (axis === "x" ? { x: c + u, z: s * (EDGE_MID + v) } : { x: s * (EDGE_MID + v), z: c + u });
          const ry = axis === "x" ? (s > 0 ? Math.PI : 0) : s > 0 ? -Math.PI / 2 : Math.PI / 2;
          const it = (kind, u, v, r = 0) => stripItems.push({ kind, ...at(u, v), y: 0.05, ry: ry + r });
          it("lampPole", 0, 4.6);
          it("bench", 0, 1.6);
          it("bin", gap > 5 ? 1.6 : 0.9, 0.4);
          it("planter", 0, -1.4, Math.PI / 2);
          if (R() < 0.5) stripFlyers.push({ kind: "newsStand", ...at(-1.2, -0.2), y: 0.05, ry });
        }
    }
  }
  const more = YARD_MORE.slice().sort(() => R() - 0.5);
  const kinds = [...YARD_BASE, ...more, ...more].slice(0, segs.length);
  kinds.sort(() => R() - 0.5);
  segs.forEach((g, i) => (g.kind = kinds[i]));
  const yards = sitePlan(segs, kinds, true);
  // Buildings just past the edge behind some of the sites (scenery: the
  // rim reads as more city, not a wall of grass).
  const PER = { parking: "garage", carwash: "wash", construction: "frame" };
  for (const y of yards) if (y.kind !== "corner" && R() < 0.45) y.perimeter = PER[y.kind] || "shops";
  // ---- solids: the landmarks, park features, yards, the edge wall.
  const obstacles = [...ramps, ...locationSolids()];
  const features = parkPlan(parks, 0.4);
  features.push({ kind: "gasdepot", items: [], vehicles: [], flyers: depotFlyers(), solids: [] });
  features.push({ kind: "strip", items: stripItems, vehicles: [], flyers: stripFlyers, solids: [] });
  for (const f of [...features, ...yards]) obstacles.push(...f.solids);
  // A low wall along the city edge (visible, solid), open only at the
  // exit roads, which a gate closes until the escape opens it.
  for (const [axis, s] of [["x", -1], ["x", 1], ["z", -1], ["z", 1]]) {
    const ex = exits.find((e) => (axis === "x" ? e.dz === s : e.dx === s));
    const cut = ex ? (axis === "x" ? ex.anchor.x : ex.anchor.z) : null;
    const spans = cut == null ? [[-CITY_HALF, CITY_HALF]] : [[-CITY_HALF, cut - 7], [cut + 7, CITY_HALF]];
    for (const [lo, hi] of spans) {
      const c = (lo + hi) / 2, L = hi - lo, o = s * 107.6;
      obstacles.push(axis === "x" ? { x: c, z: o, w: L, d: 0.8, kind: "edge-wall" } : { x: o, z: c, w: 0.8, d: L, kind: "edge-wall" });
    }
  }
  // Graph with alleys added (for navigation and drawing).
  const allEdges = graph.edges.map((e) => ({ ...e }));
  for (const a of alleys) allEdges.push({ id: allEdges.length, kind: "alley", width: ALLEY_WIDTH, pts: a.pts, a: null, b: null });
  for (const e of exits) allEdges.push({ id: allEdges.length, kind: "exit", width: 11, pts: [{ ...e.anchor }, { x: e.anchor.x + e.dx * 18, z: e.anchor.z + e.dz * 18 }], a: null, b: null });
  // Street furniture, clear of the modules and of every solid.
  const modules = LANDMARKS.map((k) => loc[k]);
  const clearOf = (x, z, pad) => !modules.some((m) => Math.abs(m.x - x) < 10 + pad && Math.abs(m.z - z) < 10 + pad) && !obstacles.some((q) => Math.abs(q.x - x) < q.w / 2 + pad && Math.abs(q.z - z) < q.d / 2 + pad);
  const streetProps = placeStreetProps(graph, kind, near, R, buildings).filter((p) => clearOf(p.x, p.z, 0.2));
  const flyers = placeFlyers({ graph, kind, near, R, buildings, streetProps, plazas: [], markets: [], lots: [], stations: [], parks: [] }).filter((f) => clearOf(f.x, f.z, 0.4));
  // The shop-front clutter joins the locations' loose pieces (one system).
  features.push({ kind: "street", items: [], vehicles: [], flyers, solids: [] });
  const parking = kerbParking(graph, kind, R).filter((p) => clearOf(p.x, p.z, 1.5));
  const start = startPose(graph);
  return {
    seed,
    procedural: true,
    modular: true,
    buildings,
    parks,
    obstacles,
    lots: [],
    plazas: [],
    markets: [],
    flyers: [],
    stations: [],
    trees,
    alleys,
    exits,
    overpasses: graph.overpass ? [graph.overpass] : [],
    graph: { nodes: graph.nodes.map(({ id, x, z, ring, foot }) => ({ id, x, z, ring, foot })), edges: allEdges },
    streetProps,
    parking,
    start,
    counts,
    blocks: blocks.map(({ type, cx, cz, w, d, kx0, kx1, kz0, kz1 }) => ({ type, cx, cz, w, d, kx0, kx1, kz0, kz1 })),
    locations: { gas: { ...loc.gas }, court: { ...loc.court }, park: { ...loc.park }, gasDepot: { ...loc.gasDepot } },
    features,
    yards,
    raster: { kind, near, N, CELL, half: CITY_HALF },
  };
}

// Building rows filling a zone edge to edge: two rows back to back, or a
// ring of buildings round a closed courtyard on a big block. Fronts run in
// one straight line along each street (no recesses, no gaps a car could
// nose into); widths 6.5-10 m, heights vary (taller on the corners and in
// the commercial middle). Returns true if it made a drive-through
// shortcut: one low building across the whole block (it breaks open).
function splitLen(len, R) {
  const n = Math.max(1, Math.round(len / 8));
  for (let k = 0; k < 30; k++) {
    const p = Array.from({ length: n }, () => 0.8 + R() * 0.4);
    const s = p.reduce((a, v) => a + v, 0);
    const w = p.map((v) => (v / s) * len);
    if (w.every((v) => v >= 5.5 && v <= 11)) return w;
  }
  return Array(n).fill(len / n);
}
function bands(len, R) {
  if (len < 23) return { a: len / 2, b: len / 2, mid: 0 };
  const a = 7.5 + R() * 2, b = 7.5 + R() * 2;
  return { a, b, mid: len - a - b };
}
function packZone(z, R, out, { district, shortcut }) {
  const W = z.x1 - z.x0, D = z.z1 - z.z0;
  if (W < 5 || D < 5) return false;
  const com = district === "commercial";
  const row = bands(D, R);
  // A block that gets a drive-through hall keeps one wide middle bay for
  // it (narrow corners); otherwise corners and middle bays as usual.
  const hall = shortcut && row.mid === 0 && D <= 18 && W >= 23;
  const col = hall ? { a: 6.5, b: 6.5, mid: W - 13 } : bands(W, R);
  const made = [];
  const add = (x0, x1, z0, z1, corner) => {
    // Heights as downtown (5-17 m): taller in the commercial middle and on
    // corners, low-rise further out.
    const h = com ? 7 + R() * 8 + (corner ? 2 : 0) : 5 + R() * 5 + (corner ? 1.5 : 0);
    const b = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h: Math.round(h * 2) / 2, color: Math.floor(R() * 6), district };
    made.push(b);
    return b;
  };
  // Column edges along a full-width row: corner, middle pieces, corner.
  const xs = [z.x0, z.x0 + col.a];
  if (col.mid > 0) {
    for (const w of hall ? [col.mid] : splitLen(col.mid, R)) xs.push(xs.at(-1) + w);
    xs[xs.length - 1] = z.x1 - col.b;
    xs.push(z.x1);
  } else xs[1] = z.x1 - col.b === z.x0 + col.a ? z.x0 + col.a : z.x0 + W / 2, xs.push(z.x1);
  const rowsAt = row.mid > 0 ? [[z.z0, z.z0 + row.a], [z.z1 - row.b, z.z1]] : [[z.z0, z.z0 + D / 2], [z.z0 + D / 2, z.z1]];
  const grid = rowsAt.map(([r0, r1]) => xs.slice(0, -1).map((x, k) => add(x, xs[k + 1], r0, r1, k === 0 || k === xs.length - 2)));
  if (row.mid > 0)
    for (const [c0, c1] of [[z.x0, z.x0 + col.a], [z.x1 - col.b, z.x1]]) {
      let zz = z.z0 + row.a;
      const ds = splitLen(row.mid, R);
      ds.forEach((d, k) => {
        const z1 = k === ds.length - 1 ? z.z1 - row.b : zz + d;
        add(c0, c1, zz, z1, false);
        zz = z1;
      });
    }
  // A big block's courtyard is filled by a lower back building (no closed
  // pocket anywhere: nothing to get pushed into, nothing to see into).
  if (row.mid > 0 && col.mid > 0) made.push({ x: z.x0 + col.a + col.mid / 2, z: z.z0 + row.a + row.mid / 2, w: col.mid, d: row.mid, h: 4 + R() * 2, color: Math.floor(R() * 6), district, back: true });
  // Drive-through shortcut: a middle pair of a two-row block becomes one
  // low building across the block (both its faces on a street).
  let cut = false;
  if (hall) {
    // The wide middle bay becomes one low hall across the block: a ram
    // punches a corridor through it, the rest stands.
    const n = 1, k = 1;
    const gone = [...grid[0].slice(k, k + n), ...grid[1].slice(k, k + n)];
    for (const q of gone) made.splice(made.indexOf(q), 1);
    made.push({ x: (xs[k] + xs[k + n]) / 2, z: (z.z0 + z.z1) / 2, w: xs[k + n] - xs[k], d: D, h: 4.5, color: Math.floor(R() * 6), district, destructible: true });
    cut = true;
  }
  out.push(...made);
  return cut;
}

// Cover a block's cells with a few rectangles (for drawing lawns etc.).
function coverRects(b, inSet) {
  const used = new Set(), out = [];
  const free = (r, c) => inSet(r, c) && !used.has(r * N + c);
  for (let k = 0; k < 6; k++) {
    const q = largestRect(free, b.c0, b.c1, b.r0, b.r1);
    if (q.area < 12) break;
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) used.add(r * N + c);
    out.push(rectWorld(q));
  }
  return out;
}

// Street furniture along the pavements (the same kinds as downtown):
// lamps, trees, bins, signs and hydrants, clear of junctions, alleys and
// each other.
function placeStreetProps(graph, kind, near, R, buildings) {
  // As dense as the old downtown (about four pieces per 30 m of kerb, both
  // sides): lamps, bins, trees, signs, a hydrant now and then; clear of
  // the junction corners, alleys and each other.
  const out = [];
  const kindsAt = ["lamp", "trash", "tree", "sign", "lamp", "tree", "trash", "hydrant"];
  const nodeW = new Map();
  for (const e of graph.edges) if (e.kind === "road") for (const id of [e.a, e.b]) nodeW.set(id, Math.max(nodeW.get(id) || 0, e.width));
  let k = 0;
  for (const e of graph.edges) {
    if (e.kind !== "road") continue;
    const pts = e.pts;
    let total = 0;
    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      segs.push({ a: pts[i - 1], b: pts[i], L, s: total });
      total += L;
    }
    for (const side of [-1, 1])
      for (let s = 2.5 + R() * 1.5; s < total - 2.5; s += 2.7 + R() * 0.7) {
        const g = segs.find((q) => s >= q.s && s <= q.s + q.L) || segs.at(-1);
        const t = (s - g.s) / g.L, ux = (g.b.x - g.a.x) / g.L, uz = (g.b.z - g.a.z) / g.L;
        const off = e.width / 2 + 1.25;
        const x = g.a.x + (g.b.x - g.a.x) * t - uz * off * side, z = g.a.z + (g.b.z - g.a.z) * t + ux * off * side;
        const c = cellOf(x), r = cellOf(z);
        if (c < 1 || r < 1 || c >= N - 1 || r >= N - 1) continue;
        const kk = kind[r * N + c];
        if (kk !== WALK && kk !== LAND) continue;
        if (near[r * N + c] < 0.6) continue; // too close to another road's kerb
        if (graph.nodes.some((n) => nodeW.has(n.id) && Math.hypot(n.x - x, n.z - z) < nodeW.get(n.id) / 2 + 4)) continue;
        if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 2.4)) continue;
        if (buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 0.6 && Math.abs(b.z - z) < b.d / 2 + 0.6)) continue;
        out.push({ kind: kindsAt[k++ % kindsAt.length], x, z, angle: Math.atan2(ux, uz) });
      }
  }
  return out;
}

// Loose breakable furniture (locations FlyerSystem): shop fronts, café sets,
// a street market, car park and petrol station kit, junction corners and
// a small roadworks site. Placed on open pavement, never on a road, clear
// of the street props and of each other.
const FCOL = [0xd62f2a, 0x2457c5, 0x2fa36b, 0xf5c01a, 0xf0781e, 0xe0367a, 0x1f6e6a, 0x7a3fb8];
export const SIDEWALK_Y = 0.4;
function placeFlyers({ graph, kind, near, R, buildings, streetProps, plazas, markets, lots, stations, parks }) {
  const out = [];
  const surface = (x, z) => {
    const c = cellOf(x), r = cellOf(z);
    if (c < 1 || r < 1 || c >= N - 1 || r >= N - 1) return null;
    const k = kind[r * N + c];
    if (k === ROAD || k === ALLEY || k === BUILT || k === 6 || k === 11) return null;
    if (near[r * N + c] < 0.5) return null;
    return k === 8 || k === 10 ? 0.07 : k === 7 ? 0.38 : SIDEWALK_Y;
  };
  const free = (x, z, r = 1.1) =>
    !out.some((q) => Math.hypot(q.x - x, q.z - z) < r) &&
    !streetProps.some((q) => Math.hypot(q.x - x, q.z - z) < 1.3) &&
    !buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 0.35 && Math.abs(b.z - z) < b.d / 2 + 0.35);
  const put = (kind, x, z, ry = 0, extra = {}, r = 1.1) => {
    const y = surface(x, z);
    if (y == null || !free(x, z, r)) return false;
    out.push({ kind, x, z, y, ry, ...extra });
    return true;
  };
  const cafe = (x, z, seed) => {
    if (!put("table", x, z, R() * 6.28, {}, 1.6)) return;
    const n = 2 + Math.floor(R() * 3);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + R() * 0.6, d = 0.82;
      const cx = x + Math.sin(a) * d, cz = z + Math.cos(a) * d, y = surface(cx, cz);
      if (y != null) out.push({ kind: "chair", x: cx, z: cz, y, ry: a + Math.PI, color: FCOL[(seed + j) % 8] });
    }
    if (R() < 0.7) out.push({ kind: "parasol", x: x + 0.05, z: z + 0.05, y: surface(x, z), ry: R() * 6.28, color: FCOL[(seed * 3) % 8] });
  };
  // Shop fronts: commercial faces mostly, a few residential ones.
  const faces = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const b of buildings) {
    if (!b.street || b.district === "edge") continue;
    b.street.forEach((on, k) => {
      if (!on || R() > (b.district === "commercial" ? 0.85 : 0.35)) return;
      const [fx, fz] = faces[k], span = fx ? b.d : b.w;
      const along = (R() - 0.5) * Math.max(0, span - 2.4);
      const x = b.x + fx * (b.w / 2 + 0.75) + (fx ? 0 : along), z = b.z + fz * (b.d / 2 + 0.75) + (fz ? 0 : along);
      const ry = Math.atan2(fx, fz);
      const pick = b.district === "commercial" ? ["sandwichBoard", "displayRack", "newsStand", "flowerPot", "sandwichBoard", "displayRack"][Math.floor(R() * 6)] : ["flowerPot", "bucket", "flowerPot"][Math.floor(R() * 3)];
      if (put(pick, x, z, ry, pick === "sandwichBoard" ? { color: FCOL[Math.floor(R() * 8)] } : {}) && pick === "flowerPot") {
        const ox = fx ? 0 : 0.9, oz = fz ? 0 : 0.9;
        put("flowerPot", x + ox, z + oz, 1, {}, 0.8);
      }
    });
  }
  // Junction corners: news boxes, pots, boards.
  for (const n of graph.nodes) {
    const inc = graph.edges.filter((e) => e.kind === "road" && (e.a === n.id || e.b === n.id));
    if (inc.length < 3 || n.foot) continue;
    const dirs = inc.map((e) => {
      const p = e.a === n.id ? e.pts[1] : e.pts.at(-2), L = Math.hypot(p.x - n.x, p.z - n.z);
      return { x: (p.x - n.x) / L, z: (p.z - n.z) / L, w: e.width };
    });
    for (let i = 0; i < dirs.length; i++)
      for (let j = i + 1; j < dirs.length; j++) {
        const a = dirs[i], c = dirs[j], dot = a.x * c.x + a.z * c.z;
        if (dot < -0.5 || R() > 0.4) continue;
        const bx = a.x + c.x, bz = a.z + c.z, bl = Math.hypot(bx, bz) || 1;
        const half = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
        const d = Math.min(20, (Math.max(a.w, c.w) / 2 + 2.2) / Math.max(0.3, Math.sin(half)));
        put(["newsStand", "flowerPot", "sandwichBoard", "displayRack"][Math.floor(R() * 4)], n.x + (bx / bl) * d, n.z + (bz / bl) * d, Math.atan2(bx, bz), { color: FCOL[Math.floor(R() * 8)] });
      }
  }
  // Street market: two rows of stalls facing an aisle, crates in front,
  // parasols and tables, a vendor cart, goods racks.
  for (const m of markets) {
    const alongX = m.w >= m.d, len = alongX ? m.w : m.d, wid = alongX ? m.d : m.w;
    const rows = wid >= 13 ? [-wid / 2 + 2.2, wid / 2 - 2.2] : [-wid / 2 + 2.2];
    const at = (s, o) => (alongX ? { x: m.x + s, z: m.z + o } : { x: m.x + o, z: m.z + s });
    for (const o of rows) {
      const ry = (alongX ? 0 : Math.PI / 2) + (o < 0 ? Math.PI : 0);
      for (let s2 = -len / 2 + 2.4; s2 <= len / 2 - 2.4; s2 += 4.2) {
        const p = at(s2, o);
        put("stall", p.x, p.z, ry, {}, 1.9);
        const q = at(s2 + (R() - 0.5), o - Math.sign(o) * 2.0);
        put(["crateRed", "crateOrange", "crateGreen"][Math.floor(R() * 3)], q.x, q.z, R() * 0.6, {}, 0.8);
      }
    }
    for (let k = 0; k < 2; k++) {
      const p = at((R() - 0.5) * (len - 6), 0);
      cafe(p.x, p.z, k + 3);
    }
    const v = at(len / 2 - 2, 0);
    put("vendorCart", v.x, v.z, R() * 6.28, {}, 1.6);
    const d = at(-len / 2 + 1.6, 0);
    put("displayRack", d.x, d.z, 0);
  }
  // Plazas and parks: café sets, a vendor cart now and then.
  for (const pz of plazas) if (pz.area > 30) cafe(pz.x, pz.z, Math.floor(pz.x));
  for (const pk of parks) {
    const r = pk.rects[0];
    if (!r) continue;
    cafe(r.x + r.w * 0.3, r.z - r.d * 0.3, 5);
    if (R() < 0.6) put("vendorCart", r.x - r.w * 0.3, r.z + r.d * 0.3, R() * 6.28, {}, 1.6);
  }
  // Car parks: trolleys, P signs, a pay station.
  for (const lot of lots) {
    for (let k = 0; k < 3; k++) put("shoppingCart", lot.x + (R() - 0.5) * (lot.w - 4), lot.z + (R() - 0.5) * (lot.d - 4), R() * 6.28);
    put("parkingSign", lot.x - lot.w / 2 + 1.2, lot.z - lot.d / 2 + 1.2, 0);
    put("parkingSign", lot.x + lot.w / 2 - 1.2, lot.z + lot.d / 2 - 1.2, Math.PI);
    put("ticketMachine", lot.x + lot.w / 2 - 1.2, lot.z - lot.d / 2 + 1.2, Math.PI);
  }
  // Petrol stations: gas bottles and buckets by the shop.
  for (const st of stations) {
    const sh = st.shop, fx = st.alongX ? 0 : -1, fz = st.alongX ? -1 : 0;
    for (let k = 0; k < 3; k++) put("gasBottle", sh.x + fx * (sh.w / 2 + 0.8) + (fz ? (k - 1) * 0.7 : 0), sh.z + fz * (sh.d / 2 + 0.8) + (fx ? (k - 1) * 0.7 : 0), 0, { color: 0xd62f2a }, 0.5);
    put("bucket", sh.x + fx * (sh.w / 2 + 1.2) + (fz ? 2.2 : 0), sh.z + fz * (sh.d / 2 + 1.2) + (fx ? 2.2 : 0), 0, { color: 0x2457c5 }, 0.5);
  }
  // One small roadworks site on a pavement: fence panels, a work bench,
  // planks, a generator.
  const quiet = buildings.filter((b) => b.district === "residential" && b.street?.some(Boolean));
  if (quiet.length) {
    const b = quiet[Math.floor(R() * quiet.length)], k = b.street.findIndex(Boolean), [fx, fz] = faces[k];
    const x = b.x + fx * (b.w / 2 + 1.2), z = b.z + fz * (b.d / 2 + 1.2), ry = Math.atan2(fx, fz) + Math.PI / 2;
    put("toolTable", x, z, ry, {}, 1.2);
    put("plankStack", x + (fz ? 2.6 : 0), z + (fx ? 2.6 : 0), ry, {}, 1.4);
    put("generator", x - (fz ? 2.4 : 0), z - (fx ? 2.4 : 0), ry, {}, 1.0);
  }
  return out;
}

// Cars parked along the kerb of wider straight streets.
function kerbParking(graph, kind, R) {
  const out = [];
  for (const e of graph.edges) {
    if (e.curve || e.width < 11 || e.ring) continue;
    const a = e.pts[0], b = e.pts.at(-1), L = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
    for (let s = 12; s < L - 12; s += 9) {
      if (R() > 0.35) continue;
      const side = R() < 0.5 ? -1 : 1, off = e.width / 2 - 1.05;
      out.push({ x: a.x + ux * s - uz * off * side, z: a.z + uz * s + ux * off * side, angle: Math.atan2(ux, uz) });
    }
  }
  return out;
}

function startPose(graph) {
  let best = null;
  const feet = new Set(graph.nodes.filter((n) => n.foot).map((n) => n.id));
  for (const e of graph.edges) {
    if (e.curve || e.ring || e.kind !== "road" || feet.has(e.a) || feet.has(e.b)) continue;
    const a = e.pts[0], b = e.pts.at(-1), L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 28) continue;
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const score = Math.hypot(m.x, m.z) - (e.width >= 11 ? 6 : 0);
    if (!best || score < best.score) best = { score, e, a, b, L, m };
  }
  const { a, b, L, m } = best;
  const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
  return { x: m.x, z: m.z, angle: Math.atan2(-ux, -uz), along: { x: ux, z: uz } };
}

// ------------------------------------------------------------ validation --
// Checks that make a map playable; a failed map is regenerated.
export function validateCity(L) {
  const problems = [];
  const { kind, N: n } = L.raster;
  const solids = [...L.buildings, ...L.obstacles, ...(L.overpasses || []).flatMap((o) => o.pillars)];
  // 1. Road graph connected (alleys and exits attach to roads).
  const nodes = L.graph.nodes, roads = L.graph.edges.filter((e) => e.kind === "road" || e.kind === "overpass");
  if (!connected(nodes, roads)) problems.push("roads not connected");
  // ...and still connected if the overpass comes down.
  if (!connected(nodes, roads.filter((e) => e.kind !== "overpass"))) problems.push("depends on the overpass");
  // 2. Every road and alley keeps clearance for a police car along it.
  const r = CONFIG.policeRadius + 0.3;
  for (const e of L.graph.edges)
    for (let k = e.kind === "overpass" ? e.pts.length : 1; k < e.pts.length; k++) {
      const a = e.pts[k - 1], b = e.pts[k], len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= len; s += 2) {
        const x = a.x + ((b.x - a.x) * s) / (len || 1), z = a.z + ((b.z - a.z) * s) / (len || 1);
        if (Math.max(Math.abs(x), Math.abs(z)) > CITY_HALF - 2) continue;
        // A wide road is clear if a car can pass along its middle or along
        // either side (beside a ramp or a pillar in the median).
        const nx = -(b.z - a.z) / (len || 1), nz = (b.x - a.x) / (len || 1);
        const offs = e.width >= 14 ? [0, e.width / 2 - r - 0.4, -(e.width / 2 - r - 0.4)] : [0];
        const blocked = (ox) => solids.some((q) => Math.abs(q.x - (x + nx * ox)) < q.w / 2 + r && Math.abs(q.z - (z + nz * ox)) < q.d / 2 + r);
        if (offs.every(blocked)) {
          problems.push(`${e.kind} ${e.id} blocked at ${x.toFixed(1)},${z.toFixed(1)}`);
          s = len + 1;
          k = e.pts.length;
        }
      }
    }
  // 3. No building overlaps another or a road.
  for (const b of L.buildings) {
    const c0 = cellOf(b.x - b.w / 2 + 0.5), c1 = cellOf(b.x + b.w / 2 - 0.5), r0 = cellOf(b.z - b.d / 2 + 0.5), r1 = cellOf(b.z + b.d / 2 - 0.5);
    for (let rr = r0; rr <= r1; rr += 2) for (let cc = c0; cc <= c1; cc += 2) {
      const k = kind[rr * n + cc];
      if (k === ROAD || k === ALLEY) { problems.push(`building on road at ${b.x},${b.z}`); rr = r1 + 1; break; }
    }
  }
  // 4. Open ground (road, pavement, alley, lots) is one connected area:
  //    no closed courtyard or pocket cut off from the streets.
  const openKinds = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) openKinds[i] = isOpen(kind[i]) ? 1 : 0;
  const { list } = components(openKinds, 1);
  const big = list.filter((c) => c.area >= 6);
  if (big.length > 1) problems.push(`open ground split in ${big.length}`);
  // 5. Alleys: open at both ends onto pavement or road.
  for (const a of L.alleys) {
    for (const p of [a.pts[0], a.pts[1]]) {
      const c = cellOf(p.x), rr = cellOf(p.z);
      const k = c >= 0 && rr >= 0 && c < n && rr < n ? kind[rr * n + c] : 6;
      if (!isOpen(k)) problems.push(`alley end closed at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
  }
  // 6. Start and exits on clear road.
  const clearAt = (x, z, rad) => !solids.some((q) => Math.abs(q.x - x) < q.w / 2 + rad && Math.abs(q.z - z) < q.d / 2 + rad);
  if (!clearAt(L.start.x, L.start.z, 3)) problems.push("start blocked");
  // Police start behind on the road network (placed along the roads by
  // the game): the start street itself must be clear behind the car.
  for (const d of [6, 12]) if (!clearAt(L.start.x - L.start.along.x * d, L.start.z - L.start.along.z * d, 2)) problems.push("police start blocked");
  if (L.exits.length < 3) problems.push("too few exits");
  for (const e of L.exits) if (!clearAt(e.anchor.x + e.dx * 10, e.anchor.z + e.dz * 10, 2)) problems.push(`exit ${e.id} blocked`);
  // 7. Module city: every facility of the stable build is placed; enough
  //    to break; no slot between buildings a car could nose into; no road
  //    running out to the edge except the gated exits.
  if (L.modular) {
    for (const k of ["gas", "court", "park", "gasDepot"]) if (!L.locations?.[k]) problems.push(`missing ${k}`);
    const kinds = new Set((L.yards || []).map((y) => y.kind));
    for (const k of ["parking", "carwash", "construction", "market", "cafe", "depot", "plaza", "corner"]) if (!kinds.has(k)) problems.push(`missing yard ${k}`);
    const content = L.streetProps.length + [...L.features, ...L.yards].reduce((a, f) => a + f.items.length + f.flyers.length + (f.vehicles?.length || 0), 0);
    if (content < 1000) problems.push(`too little to break (${content})`);
    const B = L.buildings, filled = (x, z) => B.some((q) => Math.abs(q.x - x) < q.w / 2 && Math.abs(q.z - z) < q.d / 2);
    for (let i = 0; i < B.length; i++)
      for (let j = i + 1; j < B.length; j++) {
        const a = B[i], b = B[j];
        const gx = Math.abs(a.x - b.x) - (a.w + b.w) / 2, gz = Math.abs(a.z - b.z) - (a.d + b.d) / 2;
        const slot = (gz < -0.5 && gx > 0.05 && gx < 5.9) || (gx < -0.5 && gz > 0.05 && gz < 5.9);
        if (slot && !filled((a.x + b.x) / 2, (a.z + b.z) / 2)) problems.push(`slot between buildings at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
        if (gx < -0.05 && gz < -0.05) problems.push(`buildings overlap at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
      }
    for (const e of L.graph.edges) if (e.kind === "road" && e.pts.some((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) > RING + 0.01)) problems.push(`road ${e.id} past the ring`);
  }
  return { ok: problems.length === 0, problems };
}

// A validated city for this seed (deterministic: the same seed gives the
// same city, retries included).
export function generateCity(seed = randomSeed()) {
  const tried = [];
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = (seed + attempt * 7919) >>> 0;
    const L = buildCity(s);
    const v = L.failed ? { ok: false, problems: [L.failed] } : validateCity(L);
    if (v.ok) {
      L.seed = seed;
      L.mapSeed = s;
      L.attempts = attempt + 1;
      L.rejected = tried;
      return L;
    }
    tried.push({ seed: s, problems: v.problems.slice(0, 4) });
  }
  throw new Error(`No valid city for seed ${seed}: ${JSON.stringify(tried.slice(-2))}`);
}
