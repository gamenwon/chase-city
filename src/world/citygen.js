// V2.1 procedural city. A new, playable layout for every run, from a seed
// (the same seed always gives the same city, so a bad map can be replayed:
// ?seed=1234). The result has the shape of world/layout.js plus a road
// graph, so physics (axis-aligned boxes), the renderer and the police all
// keep working:
//
//   road graph   a jittered lattice of junctions with uneven spacing; a
//                straight ring road round the city and one wide avenue
//                each way; some streets removed (T-junctions, bigger and
//                odd-shaped blocks), diagonals across some blocks (angled
//                and Y junctions), some streets bent into gentle curves;
//                widths from narrow (8 m) to wide (14 m)
//   blocks       the land between the roads (a 1 m raster) becomes a park,
//                a car park, a petrol station, a plaza, or a built block:
//                buildings tiled edge to edge (no dead-end gaps; slots too
//                narrow for a car are closed by gapFillers), commercial
//                (taller, shopfronts) towards the centre, residential and
//                low-rise further out; some big blocks get a straight 6 m
//                alley cut through them, open at both ends
//   exits        four gates on the ring road (one per side) for the
//                escape phase, each a road out past the city edge
//
// Every generated city is checked (validateCity) and regenerated from the
// next derived seed if it fails: connected roads, clearance, alleys open
// at both ends, spawns and exits on the road, no closed pockets.
import { CONFIG } from "../game/config.js";

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
function spacedLines(R) {
  const out = [-RING];
  while (RING - out.at(-1) > 46) {
    let step = 24 + R() * 18;
    step = Math.min(step, RING - out.at(-1) - 22);
    out.push(out.at(-1) + step);
  }
  out.push(RING);
  return out;
}

// Lines with at least one inner line that has a long gap (39 m+) on both
// sides (room for an overpass's ramps either side of that junction).
function linesWithRoom(R) {
  for (let k = 0; k < 40; k++) {
    const l = spacedLines(R);
    for (let i = 1; i < l.length - 1; i++) if (l[i] - l[i - 1] >= 39 && l[i + 1] - l[i] >= 39) return l;
  }
  return spacedLines(R);
}
function roadGraph(R) {
  const xs = linesWithRoom(R), zs = linesWithRoom(R);
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
  const nodes = [];
  const at = (i, j) => nodes[i * J + j];
  for (let i = 0; i < I; i++)
    for (let j = 0; j < J; j++) {
      const ringX = i === 0 || i === I - 1, ringZ = j === 0 || j === J - 1;
      const span = (arr, k) => Math.min(k > 0 ? arr[k] - arr[k - 1] : 99, k < arr.length - 1 ? arr[k + 1] - arr[k] : 99);
      const jx = ringX || i === ia ? 0 : (R() - 0.5) * Math.min(12, span(xs, i) * 0.4);
      const jz = ringZ || j === ja ? 0 : (R() - 0.5) * Math.min(12, span(zs, j) * 0.4);
      nodes.push({ id: nodes.length, i, j, x: xs[i] + jx, z: zs[j] + jz, ring: ringX || ringZ });
    }
  const edges = [];
  const addEdge = (a, b, o) => edges.push({ id: edges.length, a: a.id, b: b.id, kind: "road", curve: 0, ...o });
  for (let i = 0; i < I; i++)
    for (let j = 0; j < J; j++) {
      const n = at(i, j);
      if (i < I - 1) {
        const m = at(i + 1, j), ring = j === 0 || j === J - 1;
        addEdge(n, m, { width: ring ? 11 : j === ja ? 14 : pick(R, [8, 10, 11, 11, 12]), ring, avenue: j === ja, cell: [i, j, "h"] });
      }
      if (j < J - 1) {
        const m = at(i, j + 1), ring = i === 0 || i === I - 1;
        addEdge(n, m, { width: ring ? 11 : i === ia ? 14 : pick(R, [8, 10, 11, 11, 12]), ring, avenue: i === ia, cell: [i, j, "v"] });
      }
    }
  // Remove some inner streets: T-junctions and merged blocks. Never a
  // dead end (every junction keeps 2+ roads) and the network stays one.
  const alive = new Set(edges.map((e) => e.id));
  const degree = (id) => edges.filter((e) => alive.has(e.id) && (e.a === id || e.b === id)).length;
  // The streets at the roomy avenue junctions stay (overpass room).
  const keep = new Set();
  for (const [i, j] of [[ia, rz], [rx, ja]]) if (i > 0 && j > 0 && i < I - 1 && j < J - 1) for (const e of edges) if (e.a === at(i, j).id || e.b === at(i, j).id) keep.add(e.id);
  const order = edges.filter((e) => !e.ring && !e.avenue && !keep.has(e.id)).sort(() => R() - 0.5);
  for (const e of order) {
    if (R() > 0.27) continue;
    if (degree(e.a) <= 2 || degree(e.b) <= 2) continue;
    alive.delete(e.id);
    if (!connected(nodes, edges.filter((x) => alive.has(x.id)))) alive.add(e.id);
  }
  let list = edges.filter((e) => alive.has(e.id));
  // Diagonals across some intact blocks (angled / Y junctions).
  const hasEdge = (a, b) => list.some((e) => (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id));
  const diagCells = new Set();
  for (let i = 0; i < I - 1; i++)
    for (let j = 0; j < J - 1; j++) {
      if (R() > 0.2) continue;
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      if (!(hasEdge(a, b) && hasEdge(c, d) && hasEdge(a, c) && hasEdge(b, d))) continue;
      if (Math.min(b.x - a.x, c.z - a.z) < 26) continue;
      if ([[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].some(([p, q]) => diagCells.has(`${p},${q}`))) continue;
      diagCells.add(`${i},${j}`);
      const [p, q] = R() < 0.5 ? [a, d] : [b, c];
      list.push({ id: edges.length + list.length, a: p.id, b: q.id, kind: "road", width: pick(R, [9, 10]), diagonal: true, curve: 0, cell: [i, j, "d"] });
    }
  // Gentle curves on some inner streets away from diagonal blocks.
  for (const e of list) {
    if (e.ring || e.avenue || e.diagonal || R() > 0.26) continue;
    const [i, j, dir] = e.cell;
    const cells = dir === "h" ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]];
    if (cells.some(([p, q]) => diagCells.has(`${p},${q}`))) continue;
    const a = nodes[e.a], b = nodes[e.b], len = Math.hypot(b.x - a.x, b.z - a.z);
    e.curve = (R() < 0.5 ? -1 : 1) * (0.1 + R() * 0.08) * len;
  }
  list.forEach((e, k) => (e.id = k));
  for (const e of list) e.pts = polyline(nodes[e.a], nodes[e.b], e.curve);
  const overpass = placeOverpass(nodes, list, R, { I, J, ia, ja, at });
  list.forEach((e, k) => (e.id = k));
  return { nodes, edges: list, xs, zs, overpass };
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
function buildCity(seed) {
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
  // Under the low part of the ramps: solid (not open ground).
  const ramps = graph.overpass ? rampSolids(graph.overpass) : [];
  for (const q of ramps)
    for (let r = cellOf(q.z - q.d / 2); r <= cellOf(q.z + q.d / 2 - 0.01); r++)
      for (let c = cellOf(q.x - q.w / 2); c <= cellOf(q.x + q.w / 2 - 0.01); c++) if (r >= 0 && c >= 0 && r < N && c < N) kind[r * N + c] = 11;
  // Outside the city: not part of any block.
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const x = worldOf(c), z = worldOf(r);
      if (Math.max(Math.abs(x), Math.abs(z)) > CITY_HALF - 0.5) kind[r * N + c] = 6;
    }
  const { list: blocks } = components(kind, LAND);
  const buildings = [], parks = [], lots = [], plazas = [], stations = [], trees = [], obstacles = [...ramps], alleys = [];
  const counts = { park: 0, parking: 0, gas: 0, plaza: 0, built: 0, market: 0 };
  const markets = [];
  const outer = (b) => Math.max(Math.abs(b.cx), Math.abs(b.cz)) > RING + 3;
  // Lot types first (so each city gets its parks, a petrol station and a
  // car park), then the blocks are built.
  const order = blocks.slice().sort((a, b) => b.area - a.area).map((b) => {
    const inB = new Set(b.cells);
    const inSet = (r, c) => inB.has(r * N + c);
    const rect = b.area >= 8 ? largestRect(inSet, b.c0, b.c1, b.r0, b.r1) : { area: 0, c0: b.c0, c1: b.c0, r0: b.r0, r1: b.r0 };
    return { b, inB, inSet, rect, rw: rectWorld(rect), type: b.area < 8 ? "sliver" : !outer(b) && b.area < 55 ? "plaza" : "built" };
  });
  const choose = (n, ok) => {
    const cands = order.filter((o) => o.type === "built" && !outer(o.b) && ok(o));
    for (let k = 0; k < n && cands.length; k++) cands.splice(Math.floor(R() * cands.length), 1)[0].type = "_" + k;
    return cands;
  };
  const mark = (t) => order.forEach((o) => o.type.startsWith("_") && (o.type = t));
  choose(1 + (R() < 0.45 ? 1 : 0), (o) => o.rw.w >= 16 && o.rw.d >= 14 && o.b.area <= 760); mark("gas");
  choose(1 + Math.floor(R() * 3), (o) => o.b.area >= 240 && o.b.area <= 1500); mark("park");
  choose(1 + (R() < 0.5 ? 1 : 0), (o) => o.rw.w >= 14 && o.rw.d >= 14 && o.b.area <= 700); mark("parking");
  // A street market (stalls, crates, parasols) in every city.
  choose(1, (o) => o.rw.w >= 11 && o.rw.d >= 9 && o.b.area >= 120 && o.b.area <= 1200); mark("market");
  for (const o of order) {
    const { b, inB, inSet, rect, rw } = o;
    if (o.type === "sliver") {
      for (const i of b.cells) kind[i] = WALK; // slivers: pavement
      continue;
    }
    const rCenter = Math.hypot(b.cx, b.cz);
    const type = o.type;
    counts[type]++;
    const info = { x: rw.x, z: rw.z, w: rw.w, d: rw.d, area: b.area };
    if (type !== "built") {
      const code = { park: 7, parking: 8, plaza: 9, gas: 10, market: 9 }[type] ?? LOT;
      for (const i of b.cells) kind[i] = code;
      if (type === "park") {
        parks.push({ ...info, rects: coverRects(b, inSet) });
        // Trees in the park (solid), clear of each other.
        const n = Math.max(2, Math.min(7, Math.round(b.area / 180)));
        for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
          const c = b.cells[Math.floor(R() * b.cells.length)];
          const x = worldOf(c % N), z = worldOf((c / N) | 0);
          if (near[c] < SIDEWALK + 2.5 || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
          trees.push({ x, z });
          k++;
        }
      } else if (type === "parking") lots.push({ ...info, bays: parkingBays(rw, R) });
      else if (type === "plaza") plazas.push({ ...info, rects: coverRects(b, inSet) });
      else if (type === "market") markets.push({ ...info, rects: coverRects(b, inSet) });
      else stations.push(gasStation(rw, R, obstacles));
      continue;
    }
    // Built block: maybe a straight alley through it first.
    const commercial = !outer(b) && (rCenter < 50 || R() < 0.3);
    const alley = !outer(b) && Math.max(rect.c1 - rect.c0, rect.r1 - rect.r0) * CELL >= 26 && Math.min(rect.c1 - rect.c0, rect.r1 - rect.r0) * CELL >= 15 && R() < 0.85 ? cutAlley(b, inB, kind, R) : null;
    if (alley) alleys.push(alley);
    packBuildings(b, inB, kind, R, buildings, { commercial, outer: outer(b), rCenter });
  }
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
    // Drive-through only where it opens a real way through: open ground on
    // two opposite sides, at most 12 m deep between them.
    const st = b.street;
    b.through = st[0] && st[1] && b.d <= 12 ? "z" : st[2] && st[3] && b.w <= 12 ? "x" : null;
    b.destructible = !!(b.destructible && b.through);
  }
  // Graph with alleys added (for navigation and drawing).
  const roadEdges = graph.edges.map((e) => ({ ...e }));
  const allEdges = [...roadEdges];
  for (const a of alleys) allEdges.push({ id: allEdges.length, kind: "alley", width: ALLEY_WIDTH, pts: a.pts, a: null, b: null });
  for (const e of exits) allEdges.push({ id: allEdges.length, kind: "exit", width: 11, pts: [{ ...e.anchor }, { x: e.anchor.x + e.dx * 18, z: e.anchor.z + e.dz * 18 }], a: null, b: null });
  const streetProps = placeStreetProps(graph, kind, near, R, buildings);
  const flyers = placeFlyers({ graph, kind, near, R, buildings, streetProps, plazas, markets, lots, stations, parks, obstacles });
  const parking = kerbParking(graph, kind, R);
  // Player start: on a straight inner street near the centre, heading
  // along it; police spread out behind on the same road network.
  const start = startPose(graph);
  return {
    seed,
    procedural: true,
    buildings,
    parks,
    obstacles,
    lots,
    plazas,
    markets,
    flyers,
    stations,
    trees,
    alleys,
    exits,
    overpasses: graph.overpass ? [graph.overpass] : [],
    graph: { nodes: graph.nodes.map(({ id, x, z, ring, foot }) => ({ id, x, z, ring, foot })), edges: allEdges },
    streetProps,
    parking,
    start,
    counts,
    raster: { kind, near, N, CELL, half: CITY_HALF },
  };
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

// A straight alley (6 m) across the block, open at both ends to pavement.
function cutAlley(b, inB, kind, R) {
  const tries = [];
  // Along the block's long side first: two rows of buildings, each between
  // a street and the alley (good drive-through buildings).
  const long = b.c1 - b.c0 >= b.r1 - b.r0 ? "x" : "z";
  for (const axis of R() < 0.85 ? [long, long === "x" ? "z" : "x"] : [long === "x" ? "z" : "x", long]) {
    const lo = axis === "x" ? b.r0 : b.c0, hi = axis === "x" ? b.r1 : b.c1;
    const span = hi - lo;
    if (span < 15) continue;
    for (let k = 0; k < 8; k++) tries.push({ axis, mid: Math.round(lo + span * (0.35 + R() * 0.3)) });
  }
  const W = ALLEY_WIDTH / CELL;
  for (const { axis, mid } of tries) {
    // Cells along the band: every row/col of the band must be one
    // unbroken run inside the block, with open ground beyond both ends.
    const across = [];
    for (let o = -W / 2; o < W / 2; o++) across.push(mid + o);
    let s0 = -Infinity, s1 = Infinity, ok = true;
    for (const line of across) {
      const cellsOn = [];
      const lo = axis === "x" ? b.c0 : b.r0, hi = axis === "x" ? b.c1 : b.r1;
      for (let s = lo; s <= hi; s++) {
        const i = axis === "x" ? line * N + s : s * N + line;
        if (inB.has(i)) cellsOn.push(s);
      }
      if (!cellsOn.length) { ok = false; break; }
      const a = cellsOn[0], z = cellsOn.at(-1);
      if (z - a + 1 !== cellsOn.length) { ok = false; break; } // broken run
      s0 = Math.max(s0, a); s1 = Math.min(s1, z);
      const before = axis === "x" ? line * N + a - 1 : (a - 1) * N + line;
      const after = axis === "x" ? line * N + z + 1 : (z + 1) * N + line;
      if (![before, after].every((i) => kind[i] === WALK || kind[i] === ROAD)) { ok = false; break; }
    }
    if (!ok || s1 - s0 < 10) continue;
    // Carve the full width of the band from end to end (the union of
    // runs, so the ends are flush with the pavement).
    for (const line of across) {
      const lo = axis === "x" ? b.c0 : b.r0, hi = axis === "x" ? b.c1 : b.r1;
      for (let s = lo; s <= hi; s++) {
        const i = axis === "x" ? line * N + s : s * N + line;
        if (inB.has(i)) { kind[i] = ALLEY; inB.delete(i); }
      }
    }
    const c = worldOf(mid) - CELL / 2; // band centre line
    const lo = worldOf(axis === "x" ? b.c0 : b.r0) - 4, hi = worldOf(axis === "x" ? b.c1 : b.r1) + 4;
    const pts = axis === "x" ? [{ x: lo, z: c }, { x: hi, z: c }] : [{ x: c, z: lo }, { x: c, z: hi }];
    return { axis, pts, width: ALLEY_WIDTH };
  }
  return null;
}

// Tile the block's remaining cells with buildings on a 2 m grid, edge to
// edge. Leftover single cells along the pavement stay pavement.
function packBuildings(b, inB, kind, R, out, { commercial, outer, rCenter }) {
  const G = 2; // m per packing cell
  const g0c = Math.floor(b.c0 / G), g1c = Math.floor(b.c1 / G), g0r = Math.floor(b.r0 / G), g1r = Math.floor(b.r1 / G);
  const full = (gr, gc) => {
    for (let r = gr * G; r < gr * G + G; r++) for (let c = gc * G; c < gc * G + G; c++) if (!inB.has(r * N + c)) return false;
    return true;
  };
  const used = new Set();
  const free = (gr, gc) => !used.has(gr * 1000 + gc) && full(gr, gc);
  for (let gr = g0r; gr <= g1r; gr++)
    for (let gc = g0c; gc <= g1c; gc++) {
      if (!free(gr, gc)) continue;
      const lim = commercial ? [5, 9] : outer ? [5, 9] : [4, 6];
      const tw = lim[0] + Math.floor(R() * (lim[1] - lim[0] + 1)), td = lim[0] + Math.floor(R() * (lim[1] - lim[0] + 1));
      let w = 1;
      while (w < tw && free(gr, gc + w)) w++;
      let d = 1;
      grow: while (d < td) {
        for (let k = 0; k < w; k++) if (!free(gr + d, gc + k)) break grow;
        d++;
      }
      for (let r = 0; r < d; r++) for (let c = 0; c < w; c++) used.add((gr + r) * 1000 + gc + c);
      const x0 = -CITY_HALF + gc * G * CELL, z0 = -CITY_HALF + gr * G * CELL;
      const bw = w * G * CELL, bd = d * G * CELL;
      for (let r = gr * G; r < (gr + d) * G; r++) for (let c = gc * G; c < (gc + w) * G; c++) kind[r * N + c] = BUILT;
      const small = Math.min(bw, bd) <= 4;
      const centre = Math.max(0, 1 - rCenter / 110);
      let h;
      if (small) h = 3.2 + R() * 1.6;
      else if (commercial) h = 9 + R() * 9 + centre * 8;
      else if (outer) h = 6 + R() * 8;
      else h = 4.2 + R() * 4.5;
      h = Math.round(h * 2) / 2;
      const area = bw * bd;
      out.push({
        x: x0 + bw / 2,
        z: z0 + bd / 2,
        w: bw,
        d: bd,
        h,
        color: Math.floor(R() * 6),
        district: commercial ? "commercial" : outer ? "edge" : "residential",
        // One- and two-storey buildings of a fair size can be driven
        // through (V2.1 destructible low-rise); high-rises stay solid.
        destructible: !outer && !small && h <= 9 && area >= 24 && area <= 240,
      });
    }
  for (const i of inB) if (kind[i] === LAND) kind[i] = WALK;
}

function parkingBays(rw, R) {
  // Rows of bays across the lot, aisle down the middle; cars in some.
  const bays = [];
  const alongX = rw.w >= rw.d;
  const len = alongX ? rw.w : rw.d, wid = alongX ? rw.d : rw.w;
  const rows = wid >= 22 ? [-wid / 2 + 3, wid / 2 - 3] : [-wid / 2 + 3];
  for (const off of rows)
    for (let s = -len / 2 + 2; s <= len / 2 - 2; s += 3) {
      const x = alongX ? rw.x + s : rw.x + off, z = alongX ? rw.z + off : rw.z + s;
      bays.push({ x, z, angle: alongX ? 0 : Math.PI / 2, car: R() < 0.55 });
    }
  return bays;
}

function gasStation(rw, R, obstacles) {
  // Canopy over two pump islands (solid kerbs that can blow up), a shop
  // on the far side. Driving lanes round the islands stay open.
  const alongX = rw.w >= rw.d;
  const islands = [];
  const n = 2;
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * 6;
    const isl = alongX
      ? { x: rw.x + off, z: rw.z - rw.d * 0.08, w: 1.2, d: 5.4 }
      : { x: rw.x - rw.w * 0.08, z: rw.z + off, w: 5.4, d: 1.2 };
    islands.push(isl);
    obstacles.push({ ...isl, kind: "gas-island" });
  }
  const shop = alongX
    ? { x: rw.x, z: rw.z + rw.d / 2 - 2.6, w: Math.min(10, rw.w - 4), d: 4 }
    : { x: rw.x + rw.w / 2 - 2.6, z: rw.z, w: 4, d: Math.min(10, rw.d - 4) };
  obstacles.push({ ...shop, kind: "gas-shop" });
  return { x: rw.x, z: rw.z, w: rw.w, d: rw.d, alongX, islands, shop };
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
      for (let s = 3 + R() * 2; s < total - 3; s += 3.6 + R() * 1.2) {
        const g = segs.find((q) => s >= q.s && s <= q.s + q.L) || segs.at(-1);
        const t = (s - g.s) / g.L, ux = (g.b.x - g.a.x) / g.L, uz = (g.b.z - g.a.z) / g.L;
        const off = e.width / 2 + 1.25;
        const x = g.a.x + (g.b.x - g.a.x) * t - uz * off * side, z = g.a.z + (g.b.z - g.a.z) * t + ux * off * side;
        const c = cellOf(x), r = cellOf(z);
        if (c < 1 || r < 1 || c >= N - 1 || r >= N - 1) continue;
        const kk = kind[r * N + c];
        if (kk !== WALK && kk !== LAND) continue;
        if (near[r * N + c] < 0.6) continue; // too close to another road's kerb
        if (graph.nodes.some((n) => nodeW.has(n.id) && Math.hypot(n.x - x, n.z - z) < nodeW.get(n.id) / 2 + 4.5)) continue;
        if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 2.6)) continue;
        if (buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 0.6 && Math.abs(b.z - z) < b.d / 2 + 0.6)) continue;
        out.push({ kind: kindsAt[k++ % kindsAt.length], x, z, angle: Math.atan2(ux, uz) });
      }
  }
  return out;
}

// Loose breakable furniture (render/furniture.js): shop fronts, café sets,
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
      if (!on || R() > (b.district === "commercial" ? 0.6 : 0.12)) return;
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
  return { ok: problems.length === 0, problems };
}

// A validated city for this seed (deterministic: the same seed gives the
// same city, retries included).
export function generateCity(seed = randomSeed()) {
  const tried = [];
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = (seed + attempt * 7919) >>> 0;
    const L = buildCity(s);
    const v = validateCity(L);
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
