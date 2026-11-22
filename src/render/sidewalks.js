// Map quality pass: sidewalks, kerbs, junction surfaces and crossings
// built from the road geometry itself (not from the 1 m raster).
//
// Every street side gets a raised sidewalk band that follows the street's
// offset line (curves included). At a junction, the two kerb lines that
// meet at a corner are joined by a rounded kerb arc (the corner's band is
// an arc band), the outside of a bend gets an arc band round the node,
// and the junction's road surface is the polygon those kerb arcs bound
// (no disc, no gaps). Zebra crossings go only on real street
// intersections (3+ streets), just outside the corner arcs, never on an
// elevated road's ramp or by its pillars, never overlapping each other.
import { makePath, pointAt } from "../game/citygraph.js";
import { overpassLocal } from "../game/overpass.js";
import { overpassHeight } from "../world/citygen.js";

export const SIDEWALK_W = 2.9; // drawn width (covers the raster's 2.4 m)
export const KERB_TOP = 0.4;
const RC = 3.5; // corner kerb radius

// A street's kerb line on one side, as a polyline starting at the junction
// (oriented away from it), with cumulative lengths.
function kerbLine(it, sideSign, upto) {
  const raw = it.end === "a" ? it.e.pts : it.e.pts.slice().reverse();
  const out = [], cum = [0];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)];
    const d = norm(b.x - a.x, b.z - a.z);
    // CCW side (+1): (-dz, dx); CW side (-1): (dz, -dx).
    out.push({ x: raw[i].x - d.z * sideSign * it.w / 2, z: raw[i].z + d.x * sideSign * it.w / 2 });
    if (i) cum.push(cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
    if (cum[i] > upto) break;
  }
  return { pts: out, cum };
}
function lineAt(line, t) {
  const { pts, cum } = line;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < t) i++;
  const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, f = Math.max(0, (t - cum[i - 1]) / L);
  const d = norm(b.x - a.x, b.z - a.z);
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dx: d.x, dz: d.z };
}
// First crossing of two kerb lines: arclengths along each.
function crossing(A, B) {
  for (let i = 1; i < A.pts.length; i++)
    for (let j = 1; j < B.pts.length; j++) {
      const p = A.pts[i - 1], r = { x: A.pts[i].x - p.x, z: A.pts[i].z - p.z };
      const q = B.pts[j - 1], sv = { x: B.pts[j].x - q.x, z: B.pts[j].z - q.z };
      const den = r.x * sv.z - r.z * sv.x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q.x - p.x) * sv.z - (q.z - p.z) * sv.x) / den, u = ((q.x - p.x) * r.z - (q.z - p.z) * r.x) / den;
      if (t >= -0.05 && t <= 1.05 && u >= -0.05 && u <= 1.05) {
        const la = Math.hypot(r.x, r.z), lb = Math.hypot(sv.x, sv.z);
        return { t1: A.cum[i - 1] + Math.max(0, t) * la, t2: B.cum[j - 1] + Math.max(0, u) * lb };
      }
    }
  return null;
}
const norm = (x, z) => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
};

// Corner arcs, trims (how far from each junction a band starts, per edge
// end and side) and the junction polygons.
export function junctionGeometry(L) {
  const edges = L.graph.edges.filter((e) => e.kind === "road" || e.kind === "exit");
  const at = new Map();
  for (const n of L.graph.nodes) at.set(n.id, []);
  // Exit stubs attach to the ring junction they start from.
  const nodeAt = (p) => L.graph.nodes.find((n) => Math.abs(n.x - p.x) < 0.01 && Math.abs(n.z - p.z) < 0.01);
  const lens = new Map();
  for (const e of edges) {
    const path = makePath(e.pts);
    lens.set(e.id, path.len);
    const ends = e.kind === "exit" ? [["a", nodeAt(e.pts[0])]] : [["a", L.graph.nodes[e.a]], ["b", L.graph.nodes[e.b]]];
    for (const [end, n] of ends) {
      if (!n) continue;
      const p0 = end === "a" ? e.pts[0] : e.pts.at(-1), p1 = end === "a" ? e.pts[1] : e.pts.at(-2);
      const d = norm(p1.x - p0.x, p1.z - p0.z);
      at.get(n.id).push({ e, end, d, w: e.width, ang: Math.atan2(d.z, d.x), len: path.len });
    }
  }
  const trims = new Map(); // `${id}:${end}:${side}` -> metres
  const setTrim = (it, side, t) => trims.set(`${it.e.id}:${it.end}:${side}`, t);
  const corners = []; // { o, r0, r1, a0, a1 } arc bands
  const polygons = [];
  for (const n of L.graph.nodes) {
    const list = at.get(n.id).sort((a, b) => a.ang - b.ang);
    if (list.length < 2) continue;
    const poly = [];
    for (let i = 0; i < list.length; i++) {
      const A = list[i], B = list[(i + 1) % list.length];
      let th = B.ang - A.ang;
      if (th <= 0) th += Math.PI * 2;
      const nA = { x: -A.d.z, z: A.d.x }, nB = { x: B.d.z, z: -B.d.x };
      const sideA = A.end === "a" ? "L" : "R", sideB = B.end === "a" ? "R" : "L";
      const kA = { x: n.x + nA.x * A.w / 2, z: n.z + nA.z * A.w / 2 }, kB = { x: n.x + nB.x * B.w / 2, z: n.z + nB.z * B.w / 2 };
      // Inner corner: where the two kerb lines (the real, possibly
      // curved, ones) cross, rounded off with a kerb arc.
      const KA = th < Math.PI - 0.15 ? kerbLine(A, 1, A.len * 0.5) : null, KB = KA ? kerbLine(B, -1, B.len * 0.5) : null;
      const cr = KA ? crossing(KA, KB) : null;
      if (cr) {
        const { t1, t2 } = cr;
        const pa = lineAt(KA, t1), pb = lineAt(KB, t2);
        const cosc = Math.max(-1, Math.min(1, pa.dx * pb.dx + pa.dz * pb.dz));
        const tanh = Math.tan(Math.acos(cosc) / 2);
        const room = Math.min(A.len, B.len) * 0.45 - Math.max(t1, t2);
        const rc = Math.max(0.3, Math.min(RC, room * tanh));
        const ta = t1 + rc / tanh, tb = t2 + rc / tanh;
        const TA = lineAt(KA, ta), TB = lineAt(KB, tb);
        const O = { x: TA.x - TA.dz * rc, z: TA.z + TA.dx * rc };
        let a0 = Math.atan2(TA.z - O.z, TA.x - O.x), a1 = Math.atan2(TB.z - O.z, TB.x - O.x);
        let da = a1 - a0;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const r = Math.hypot(TB.x - O.x, TB.z - O.z) > rc * 1.6 ? null : rc;
        if (r) corners.push({ o: O, r0: Math.max(0, rc - SIDEWALK_W), r1: rc, a0, da, tip: [{ x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 }, { x: TA.x, z: TA.z }, { x: TB.x, z: TB.z }] });
        setTrim(A, sideA, ta);
        setTrim(B, sideB, tb);
        if (r) for (let k = 0; k <= 6; k++) {
          const a = a0 + (da * k) / 6;
          poly.push({ x: O.x + Math.cos(a) * rc, z: O.z + Math.sin(a) * rc });
        }
        else poly.push({ x: TA.x, z: TA.z }, { x: TB.x, z: TB.z });
      } else {
        setTrim(A, sideA, 0);
        setTrim(B, sideB, 0);
        if (th > Math.PI + 0.15) {
          // Outside of a bend: an arc band round the node.
          const a0 = Math.atan2(nA.z, nA.x);
          let da = Math.atan2(nB.z, nB.x) - a0;
          while (da <= 0) da += Math.PI * 2;
          const r = (A.w + B.w) / 4;
          corners.push({ o: { x: n.x, z: n.z }, r0: r, r1: r + SIDEWALK_W, a0, da });
          for (let k = 0; k <= 6; k++) {
            const a = a0 + (da * k) / 6;
            poly.push({ x: n.x + Math.cos(a) * r, z: n.z + Math.sin(a) * r });
          }
        } else poly.push(kA, kB);
      }
    }
    polygons.push({ n, pts: poly, degree: list.length, foot: !!n.foot });
  }
  return { trims, corners, polygons, lens, incident: at };
}

// Bands along every street side: [{ pts: [{x,z,nx,nz}], w0, w1, side }]
// with alley mouths cut out.
export function sidewalkBands(L, J) {
  const bands = [];
  const alleyEnds = (L.alleys || []).flatMap((a) => a.pts);
  for (const e of L.graph.edges) {
    if (e.kind !== "road" && e.kind !== "exit") continue;
    const path = makePath(e.pts);
    for (const side of ["L", "R"]) {
      const sg = side === "L" ? 1 : -1;
      const s0 = J.trims.get(`${e.id}:a:${side}`) ?? 0;
      const s1 = path.len - (J.trims.get(`${e.id}:b:${side}`) ?? 0);
      if (s1 - s0 < 0.3) continue;
      // Alley mouths crossing this side.
      const cuts = [];
      for (const p of alleyEnds)
        for (let t = s0; t <= s1; t += 1) {
          const q = pointAt(path, t);
          const lat = ((p.x - q.x) * -q.uz + (p.z - q.z) * q.ux) * sg;
          const along = (p.x - q.x) * q.ux + (p.z - q.z) * q.uz;
          if (Math.abs(along) < 0.6 && lat > e.width / 2 - 1.5 && lat < e.width / 2 + SIDEWALK_W + 5) {
            cuts.push([t - 3.3, t + 3.3]);
            break;
          }
        }
      let pieces = [[s0, s1]];
      for (const [c0, c1] of cuts)
        pieces = pieces.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]].filter(([x, y]) => y - x > 0.3)));
      for (const [a, b] of pieces) {
        const ss = new Set([a, b]);
        if (e.pts.length > 2) for (let t = a; t < b; t += 2) ss.add(t);
        const pts = [...ss].sort((x, y) => x - y).map((t) => {
          const q = pointAt(path, Math.min(t, path.len - 1e-6));
          return { x: q.x, z: q.z, nx: -q.uz * sg, nz: q.ux * sg };
        });
        bands.push({ pts, w0: e.width / 2, w1: e.width / 2 + SIDEWALK_W, edge: e.id, side });
      }
    }
  }
  return bands;
}

// Zebra crossings: [{ x, z, ux, uz, width }] (u = along the street).
export function crossings(L, J) {
  const out = [];
  const ops = L.overpasses || [];
  for (const poly of J.polygons) {
    if (poly.degree < 3 || poly.foot) continue;
    for (const it of J.incident.get(poly.n.id)) {
      if (it.e.kind !== "road" || it.w < 8) continue;
      const sides = it.end === "a" ? ["L", "R"] : ["R", "L"];
      const t = Math.max(...sides.map((sd) => J.trims.get(`${it.e.id}:${it.end}:${sd}`) ?? 0)) + 1.8;
      if (it.len < 2 * t + 6) continue;
      const path = makePath(it.e.pts);
      const q = pointAt(path, it.end === "a" ? t : path.len - t);
      // Not on a ramp, not by a pillar.
      let bad = false;
      for (const op of ops) {
        const loc = overpassLocal(op, q.x, q.z);
        const h = overpassHeight(op, loc.s);
        if (loc.s > -2 && loc.s < op.L + 2 && Math.abs(loc.lat) < op.W / 2 + 2 && h < 4.5) bad = true;
        if (op.pillars.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < it.w / 2 + 2)) bad = true;
      }
      if (bad) continue;
      if (out.some((c) => Math.hypot(c.x - q.x, c.z - q.z) < Math.max(c.width, it.w) / 2 + 2.6)) continue;
      out.push({ x: q.x, z: q.z, ux: q.ux, uz: q.uz, width: it.w });
    }
  }
  return out;
}

// Is (x, z) inside a polygon?
export function inside(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
