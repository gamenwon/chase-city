// Hill streets (map review pass, after play): a few of the city's own
// streets roll like a San Francisco street: flat at the junction, up, over
// a crest, down, up again, over, down, flat into the next junction. The
// block layout stays as it was; only the street (asphalt, lane paint,
// kerbs and pavements, all as on every other street) follows the hills,
// and the buildings along it stand on the slope: each one raised to the
// pavement in front of it on a base in its own colour (stepped fronts),
// with its windows, shopfronts and signs. Street props, parked and moving
// cars and pedestrians follow the surface.
//
// Physics: the hills are mounds (game/jumps.js) with a firmer crest: a car
// fast over the top takes off and lands down the slope; slower cars just
// drive over. Police and the target use the same physics; traffic follows
// the surface. Only some streets (one or two per city): long straight
// ones between built blocks, away from the ring road, the avenues, the
// elevated road and the facility blocks.
import * as THREE from "three";
import { groundHeight } from "../../game/jumps.js";

const ROAD_Y = 0.1, WALK_Y = 0.4;
const TALL_H = 6.4, TALL_F = 4;
const ASPHALT = 0x37363b, WALK = 0xbdbab3, KERB = 0xd9d6cf, LINE = 0xf2efe6, WALL = 0x9a968e;

export function hillStreets({ graph, kind, buildings, R, avoid, cellOf, N, KIND, MODULE, SIDEWALK }) {
  const at = (x, z) => {
    const c = cellOf(x), r = cellOf(z);
    return c < 0 || r < 0 || c >= N || r >= N ? -1 : kind[r * N + c];
  };
  const ok = new Set([KIND.BUILT, KIND.LAND, KIND.ALLEY, KIND.LOT, KIND.PARKING, KIND.ROAD, KIND.WALK, KIND.PARK, KIND.PLAZA]);
  const cands = [];
  for (const e of graph.edges) {
    if (e.kind !== "road" || e.ring || e.avenue || e.pts.length !== 2) continue;
    const a = e.pts[0], b = e.pts[1], L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 30) continue;
    const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, nx = -uz, nz = ux;
    const band = e.width / 2 + SIDEWALK;
    // Both sides: built ground just past the pavement (no facility, park
    // or plaza), some buildings along it, none of them breakable.
    let good = true, built = 0;
    for (let s = 8; s <= L - 8 && good; s += 2)
      for (const sg of [-1, 1])
        for (const d of [band + 0.8, band + 2.5]) {
          const k = at(a.x + ux * s + nx * sg * d, a.z + uz * s + nz * sg * d);
          if (k === KIND.BUILT) built++;
          if (k === MODULE || !ok.has(k)) good = false;
        }
    if (!good || built < 4) continue;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (avoid.some((q) => Math.abs((q.x - mid.x) * ux + (q.z - mid.z) * uz) < L / 2 + 14 && Math.abs((q.x - mid.x) * nx + (q.z - mid.z) * nz) < band + 14)) continue;
    const near = buildings.filter((q) => Math.abs((q.x - mid.x) * ux + (q.z - mid.z) * uz) < L / 2 + Math.max(q.w, q.d) && Math.abs((q.x - mid.x) * nx + (q.z - mid.z) * nz) < band + Math.max(q.w, q.d) / 2 + 1.5);
    if (near.some((q) => q.destructible)) continue;
    cands.push({ e, a, b, L, ux, uz, nx, nz, mid, band, near });
  }
  // Best: two street segments in a straight line through a junction, one
  // long hill each (flat, up, down, the level crossing, up, down, flat).
  // Otherwise one street with two shorter hills.
  const byId = new Map(cands.map((c) => [c.e.id, c]));
  const chains = [];
  for (const n of graph.nodes) {
    const inc = cands.filter((c) => c.e.a === n.id || c.e.b === n.id);
    for (let i = 0; i < inc.length; i++)
      for (let j = i + 1; j < inc.length; j++) {
        const away = (c) => (c.e.a === n.id ? [c.ux, c.uz] : [-c.ux, -c.uz]);
        const [ax, az] = away(inc[i]), [bx, bz] = away(inc[j]);
        if (ax * bx + az * bz > -0.999) continue;
        chains.push({ n, segs: [inc[i], inc[j]], mid: { x: n.x, z: n.z } });
      }
  }
  void byId;
  // About four places per city, spread out (a new set each new city).
  const WANT = 4;
  const plans = [];
  const apart = (m) => plans.every((p) => Math.hypot(p.mid.x - m.x, p.mid.z - m.z) > 36);
  const used = (e) => plans.some((p) => p.edges.includes(e));
  // One of them a single tall hill, as high as a two-storey building, on
  // one long street (a random one of the longest).
  const longs = cands.filter((c) => c.L >= 34).sort((p, q) => q.L - p.L).slice(0, 3);
  if (longs.length) {
    const c = longs[Math.floor(R() * longs.length)];
    plans.push({ mid: c.mid, edges: [c.e], tall: true, segs: [{ a: c.a, ux: c.ux, uz: c.uz, L: c.L, c, hills: 1, tall: true }] });
  }
  for (const ch of chains.sort(() => R() - 0.5)) {
    if (plans.length >= WANT - 1) break;
    if (!apart(ch.mid) || plans.some((p) => p.edges.some((e) => ch.segs.some((c) => c.e === e)))) continue;
    // Oriented through the junction: first segment toward it, second away.
    const [c1, c2] = ch.segs;
    const toward = c1.e.b === ch.n.id ? { a: c1.a, ux: c1.ux, uz: c1.uz } : { a: c1.b, ux: -c1.ux, uz: -c1.uz };
    const away2 = c2.e.a === ch.n.id ? { a: c2.a, ux: c2.ux, uz: c2.uz } : { a: c2.b, ux: -c2.ux, uz: -c2.uz };
    plans.push({ mid: ch.mid, edges: [c1.e, c2.e], segs: [{ ...toward, L: c1.L, c: c1, hills: 1 }, { ...away2, L: c2.L, c: c2, hills: 1 }] });
  }
  for (const c of cands.sort(() => R() - 0.5)) {
    if (plans.length >= WANT) break;
    if (used(c.e) || !apart(c.mid)) continue;
    plans.push({ mid: c.mid, edges: [c.e], segs: [{ a: c.a, ux: c.ux, uz: c.uz, L: c.L, c, hills: 2 }] });
  }
  const mounds = [], features = [];
  const F = 5;
  for (const plan of plans) {
    const ms = [];
    const Fp = plan.tall ? TALL_F : F;
    for (const sg of plan.segs) {
      const { a, ux, uz, L, hills } = sg, band = sg.c.band;
      const span = L - 2 * Fp, len = span / (2 * hills);
      // The tall one: two storeys (a 3.4 m ground floor and a 3 m floor),
      // climbing almost evenly (an easy foot, a firm crest).
      const h = sg.tall ? Math.min(TALL_H, len * 0.42) : hills === 1 ? Math.min(2.0, len * 0.13) : Math.min(1.8, len * 0.2);
      for (let k = 0; k < hills; k++)
        ms.push({ x: a.x + ux * (Fp + len * (2 * k + 1)), z: a.z + uz * (Fp + len * (2 * k + 1)), ux, uz, len, w: band, h: h * (k ? 0.85 : 1), crest: true, ...(sg.tall ? { pow: 1.15, tall: true } : {}), takeoff: 4, hill: true, edge: sg.c.e.id });
      sg.c.e.hill = true;
    }
    mounds.push(...ms);
    // The buildings along it stand at the pavement's height in front.
    for (const sg of plan.segs) {
      const { a, ux, uz, L } = sg, band = sg.c.band, nx = -uz, nz = ux;
      for (const q of sg.c.near) {
        const s = Math.max(0, Math.min(L, (q.x - a.x) * ux + (q.z - a.z) * uz));
        const side = Math.sign((q.x - a.x) * nx + (q.z - a.z) * nz) || 1;
        const y = groundHeight(ms, a.x + ux * s + nx * side * (band - 0.2), a.z + uz * s + nz * side * (band - 0.2));
        if (y > 0.05) q.baseY = Math.max(q.baseY || 0, Math.round(y * 20) / 20);
      }
    }
    features.push({ kind: "hillstreet", tall: !!plan.tall, segs: plan.segs.map(({ a, ux, uz, L, c }) => ({ a: { x: a.x, z: a.z }, ux, uz, L, width: c.e.width })), sidewalk: SIDEWALK, F: Fp, mounds: ms, items: [], flyers: [], vehicles: [], solids: [] });
  }
  // (The tall hill listed last.)
  features.sort((p, q) => (p.tall ? 1 : 0) - (q.tall ? 1 : 0));
  return { mounds, features };
}

// The street over the hills: road, kerbs, pavements, lane paint and the
// retaining walls where the pavement stands above the ground beside it,
// as one mesh (vertex colours; the material pass gives it the same
// asphalt and paving as the flat streets).
export function hillStreetDecor(root, f) {
  const pos = [], col = [];
  for (const sg of f.segs) hillSegment(pos, col, f, sg);
  return finishMesh(root, pos, col);
}
function hillSegment(pos, col, f, sg) {
  const { a, ux, uz, L, width } = sg, { sidewalk, F } = f;
  const nx = -uz, nz = ux;
  const H = (s, v) => groundHeight(f.mounds, a.x + ux * s + nx * v, a.z + uz * s + nz * v);
  const P = (s, v, y) => [a.x + ux * s + nx * v, y, a.z + uz * s + nz * v];
  const tint = new THREE.Color();
  const quad = (p0, p1, p2, p3, color) => {
    tint.setHex(color);
    for (const p of [p0, p1, p2, p0, p2, p3]) {
      pos.push(...p);
      col.push(tint.r, tint.g, tint.b);
    }
  };
  const hw = width / 2, ww = hw + sidewalk;
  const s0 = F - 1, s1 = L - F + 1, step = 0.5;
  for (let s = s0; s < s1 - 1e-6; s += step) {
    const t = Math.min(s + step, s1);
    const road = (v) => [P(s, v, H(s, v) + ROAD_Y + 0.012), P(t, v, H(t, v) + ROAD_Y + 0.012)];
    const walk = (v) => [P(s, v, H(s, v) + WALK_Y + 0.012), P(t, v, H(t, v) + WALK_Y + 0.012)];
    // Road.
    {
      const [l0, l1] = road(-hw), [r0, r1] = road(hw);
      quad(l0, l1, r1, r0, ASPHALT);
    }
    for (const sg of [1, -1]) {
      const v0 = sg * hw, v1 = sg * (hw + 0.25), v2 = sg * ww;
      // Kerb face, kerb top, pavement.
      const [rb0, rb1] = road(v0), [kt0, kt1] = walk(v0), [kb0, kb1] = walk(v1), [pw0, pw1] = walk(v2);
      quad(rb0, rb1, kt1, kt0, KERB);
      quad(kt0, kt1, kb1, kb0, KERB);
      quad(kb0, kb1, pw1, pw0, WALK);
      // Retaining wall down to the flat pavement level behind (between
      // buildings, at alleys and lots).
      const hs = H(s, v2), ht = H(t, v2);
      if (hs > 0.04 || ht > 0.04) quad(pw0, pw1, P(t, v2, WALK_Y), P(s, v2, WALK_Y), WALL);
    }
    // Dashed centre line (2 m of paint every 4 m, as on the flat).
    if (((s - s0) % 4) < 2 - 1e-6) {
      const y0 = H(s, 0) + ROAD_Y + 0.025, y1 = H(t, 0) + ROAD_Y + 0.025;
      quad(P(s, -0.06, y0), P(t, -0.06, y1), P(t, 0.06, y1), P(s, 0.06, y0), LINE);
    }
  }
}
function finishMesh(root, pos, col) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // (Drawn over the flat street it lies on: no flicker where they meet.)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  mesh.receiveShadow = true;
  mesh.userData.keep = true; // (its own vertex colours: not re-baked by material colour)
  mesh.userData.hillStreet = true;
  root.add(mesh);
  return mesh;
}
