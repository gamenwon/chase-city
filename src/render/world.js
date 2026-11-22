// V2.1 drawing of a generated city (world/citygen.js): roads as ribbons
// that follow their curves, junction discs, lane markings and zebra
// crossings, raised pavements from the generator's raster, parks, car
// parks, petrol stations, plazas and the exit roads out of the city. All
// the ground is a handful of merged, vertex-coloured meshes; all the
// buildings are one BatchedMesh (one draw call). A building that hides the
// car from the camera is swapped for its own see-through copy while it
// fades (camera occlusion, as downtown).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { K, buildingGroup, coloredGeometry } from "./kit.js";
import { KIND } from "../world/citygen.js";
import { junctionGeometry, sidewalkBands, crossings, inside, KERB_TOP } from "./sidewalks.js";
import { makePath } from "../game/citygraph.js";

const C3 = (hex) => new THREE.Color(hex);
// A box with a flat vertex colour, positioned.
function cbox(list, x, y, z, w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  paint(g, color);
  list.push(g.toNonIndexed());
  g.dispose();
}
function paint(g, color) {
  const c = C3(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}
// A flat ribbon along a polyline (width w) at height y.
function ribbon(list, pts, w, y, color) {
  const pos = [];
  const side = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: -(b.z - a.z) / L, z: (b.x - a.x) / L };
  });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], sa = side[i - 1], sb = side[i], h = w / 2;
    const A0 = [a.x + sa.x * h, y, a.z + sa.z * h], A1 = [a.x - sa.x * h, y, a.z - sa.z * h];
    const B0 = [b.x + sb.x * h, y, b.z + sb.z * h], B1 = [b.x - sb.x * h, y, b.z - sb.z * h];
    // Counter-clockwise seen from above (faces up, not culled).
    const tri = (p, q, r) => {
      const ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
      if (ny >= 0) pos.push(...p, ...q, ...r);
      else pos.push(...p, ...r, ...q);
    };
    tri(A0, B1, B0);
    tri(A0, A1, B1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Faces must point up whatever the winding came out as.
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  paint(g, color);
  list.push(g);
}
function disc(list, x, z, r, y, color) {
  const g = new THREE.CircleGeometry(r, 20);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  paint(g, color);
  list.push(g.toNonIndexed());
  g.dispose();
}
// Raster cells of one kind as merged rectangles (row runs, stacked).
function rasterRects(raster, test) {
  const { kind, N, CELL, half } = raster;
  const out = [];
  let open = new Map(); // "c0,c1" -> rect
  for (let r = 0; r <= N; r++) {
    const runs = new Map();
    if (r < N) {
      let c = 0;
      while (c < N) {
        if (!test(kind[r * N + c], r * N + c)) { c++; continue; }
        let e = c;
        while (e < N && test(kind[r * N + e], r * N + e)) e++;
        runs.set(`${c},${e}`, { c0: c, c1: e, r0: r, r1: r + 1 });
        c = e;
      }
    }
    const next = new Map();
    for (const [k, run] of runs) {
      const o = open.get(k);
      if (o) { o.r1 = r + 1; next.set(k, o); open.delete(k); } else next.set(k, run);
    }
    for (const o of open.values()) out.push(o);
    open = next;
  }
  return out.map((q) => ({ x: -half + ((q.c0 + q.c1) / 2) * CELL, z: -half + ((q.r0 + q.r1) / 2) * CELL, w: (q.c1 - q.c0) * CELL, d: (q.r1 - q.r0) * CELL }));
}

export class GeneratedWorld {
  constructor(scene, layout, theme) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
    this.buildGround(layout, theme);
    this.buildBuildings(layout);
  }
  addMerged(list, { shadow = false } = {}) {
    if (!list.length) return null;
    const g = mergeGeometries(list);
    list.forEach((x) => x.dispose());
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = true;
    m.castShadow = shadow;
    this.group.add(m);
    return m;
  }
  buildGround(L, theme) {
    const flat = [], raised = [], props = [];
    // Grass outside, pavement under the whole city.
    cbox(flat, 0, -0.7, 0, 400, 1, 400, theme.grass);
    // Asphalt under the whole city: whatever the raised pavement does not
    // cover is road, so junctions are road right up to their kerbs.
    cbox(flat, 0, -0.12, 0, 216, 0.3, 216, theme.road);
    // Roads, alleys, exit roads; junction discs.
    for (const e of L.graph.edges) {
      if (e.kind === "exit") {
        const a = e.pts[0], dx = Math.sign(e.pts[1].x - a.x), dz = Math.sign(e.pts[1].z - a.z);
        ribbon(flat, [a, { x: a.x + dx * 70, z: a.z + dz * 70 }], 11, 0.06, theme.road);
        // Gate posts at the city edge.
        for (const s of [-1, 1]) cbox(props, a.x + dx * 19 + dz * s * 6.4, 1.6, a.z + dz * 19 + dx * s * 6.4, 0.6, 3.2, 0.6, K.yellow);
        continue;
      }
      if (e.kind === "overpass") continue; // drawn by overpass.js, up in the air
      ribbon(flat, e.pts, e.width, e.kind === "alley" ? 0.065 : 0.06, e.kind === "alley" ? 0x47454c : theme.road);
    }
    // Junction surfaces: the polygon the corner kerb arcs bound.
    const J = junctionGeometry(L);
    this.junctions = J;
    // Markings: dashed centre line (double yellow on wide roads), zebra
    // crossings near the junctions.
    for (const e of L.graph.edges) {
      if (e.kind !== "road") continue;
      const pts = e.pts;
      const elen = J.lens.get(e.id) ?? makePath(pts).len;
      const t0 = Math.max(J.trims.get(`${e.id}:a:L`) ?? 0, J.trims.get(`${e.id}:a:R`) ?? 0) + 2;
      const t1 = elen - Math.max(J.trims.get(`${e.id}:b:L`) ?? 0, J.trims.get(`${e.id}:b:R`) ?? 0) - 2;
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
        const ang = Math.atan2(ux, uz);
        for (let s = (4 - acc % 4) % 4; s < len; s += 4) {
          const t = acc + s;
          if (t < t0 || t > t1) continue;
          const x = a.x + ux * s, z = a.z + uz * s;
          const offs = e.width >= 12 ? [-0.16, 0.16] : [0];
          for (const o of offs) {
            const g = new THREE.BoxGeometry(0.12, 0.02, 2.0);
            g.rotateY(ang);
            g.translate(x - uz * o, 0.1, z + ux * o);
            paint(g, e.width >= 12 ? theme.marking : 0xf2efe6);
            flat.push(g.toNonIndexed());
            g.dispose();
          }
        }
        acc += len;
      }
    }
    // Zebra crossings: real street intersections only (sidewalks.js).
    this.crossings = crossings(L, J);
    for (const c of this.crossings)
      for (let t = -c.width / 2 + 0.8; t <= c.width / 2 - 0.8; t += 1.2) {
        const g = new THREE.BoxGeometry(0.6, 0.02, 2.4);
        g.rotateY(Math.atan2(c.ux, c.uz));
        g.translate(c.x - c.uz * t, 0.11, c.z + c.ux * t);
        paint(g, K.lineWhite);
        flat.push(g.toNonIndexed());
        g.dispose();
      }
    // Sidewalks: smooth raised bands along every street side and round
    // every corner, with kerb faces; the raster only fills in behind them
    // (cells at least 1 m from the road, outside the junction surfaces),
    // a hair lower, so no stepped edge ever shows at a kerb.
    const R = L.raster;
    this.buildSidewalks(raised, L, J);
    // Inside a rounded corner (between the kerb arc and where the kerbs
    // would have met) is road: no fill there.
    const inJunction = new Uint8Array(R.N * R.N);
    for (const c of J.corners) {
      if (!c.tip) continue;
      const tri = c.tip, xs = tri.map((p) => p.x), zs = tri.map((p) => p.z);
      const c0 = Math.max(0, Math.floor((Math.min(...xs) - 1 + R.half) / R.CELL)), c1 = Math.min(R.N - 1, Math.floor((Math.max(...xs) + 1 + R.half) / R.CELL));
      const r0 = Math.max(0, Math.floor((Math.min(...zs) - 1 + R.half) / R.CELL)), r1 = Math.min(R.N - 1, Math.floor((Math.max(...zs) + 1 + R.half) / R.CELL));
      for (let r = r0; r <= r1; r++)
        for (let k = c0; k <= c1; k++) {
          const x = -R.half + (k + 0.5) * R.CELL, z = -R.half + (r + 0.5) * R.CELL;
          if (inside(tri, x, z) && Math.hypot(x - c.o.x, z - c.o.z) > c.r1 - 0.7) inJunction[r * R.N + k] = 1;
        }
    }
    const behind = (i) => (R.near ? R.near[i] >= 1.6 : true) && !inJunction[i];
    for (const q of rasterRects(R, (k, i) => (k === KIND.WALK || k === KIND.BUILT || k === KIND.LAND || k === KIND.LOT) && behind(i))) cbox(raised, q.x, (KERB_TOP - 0.005) / 2, q.z, q.w, KERB_TOP - 0.005, q.d, K.walk);
    for (const q of rasterRects(R, (k, i) => k === KIND.PLAZA && behind(i))) cbox(raised, q.x, (KERB_TOP - 0.005) / 2, q.z, q.w, KERB_TOP - 0.005, q.d, K.pave);
    // Parks: lawn (below the sidewalk band, which covers its edge).
    for (const q of rasterRects(R, (k) => k === KIND.PARK)) cbox(raised, q.x, 0.19, q.z, q.w, 0.38, q.d, K.grass);
    for (const p of L.parks) for (const q of p.rects) for (let s = -q.d / 2 + 1.5; s < q.d / 2 - 1; s += 3.6) cbox(flat, q.x, 0.385, q.z + s, q.w - 0.6, 0.01, 1.6, K.grassStripe);
    // Car parks: asphalt at road level, white bay lines.
    for (const q of rasterRects(R, (k) => k === KIND.PARKING)) cbox(flat, q.x, 0.03, q.z, q.w, 0.08, q.d, theme.road);
    for (const lot of L.lots)
      for (const bay of lot.bays) {
        const along = bay.angle === 0; // car along z
        for (const s of [-1.45, 1.45]) cbox(flat, bay.x + (along ? s : 0), 0.085, bay.z + (along ? 0 : s), along ? 0.1 : 4.6, 0.01, along ? 4.6 : 0.1, K.lineWhite);
      }
    // Petrol stations: concrete forecourt, canopy on posts, pumps, shop.
    for (const q of rasterRects(R, (k) => k === KIND.GAS)) cbox(flat, q.x, 0.03, q.z, q.w, 0.08, q.d, 0xc9c5bd);
    for (const st of L.stations) {
      const span = st.alongX ? { w: 14, d: 9 } : { w: 9, d: 14 };
      const cz = st.islands.reduce((a, i) => a + i.z, 0) / st.islands.length, cx = st.islands.reduce((a, i) => a + i.x, 0) / st.islands.length;
      cbox(props, cx, 5.0, cz, span.w, 0.5, span.d, K.red);
      cbox(props, cx, 4.68, cz, span.w - 0.4, 0.15, span.d - 0.4, 0xf4f4f0);
      for (const isl of st.islands) {
        cbox(props, isl.x, 0.25, isl.z, isl.w, 0.3, isl.d, 0x8f8a84);
        const long = isl.d > isl.w;
        for (const s of [-1.3, 1.3]) cbox(props, isl.x + (long ? 0 : s), 1.0, isl.z + (long ? s : 0), 0.7, 1.5, 0.7, s < 0 ? K.yellow : K.red);
        // Posts at the island ends (inside the solid island).
        for (const s of [-2.3, 2.3]) cbox(props, isl.x + (long ? 0 : s), 2.6, isl.z + (long ? s : 0), 0.3, 4.6, 0.3, 0xf4f4f0);
      }
      const sh = st.shop;
      cbox(props, sh.x, 1.6, sh.z, sh.w, 3.2, sh.d, 0xf4f4f0);
      cbox(props, sh.x, 3.35, sh.z, sh.w + 0.3, 0.3, sh.d + 0.3, K.red);
    }
    // Plazas: a mosaic star in the middle.
    for (const pz of L.plazas) {
      const r = Math.min(pz.w, pz.d) * 0.3;
      if (r > 1.2) disc(flat, pz.x, pz.z, r, 0.402, 0xb8ab92), disc(flat, pz.x, pz.z, r * 0.55, 0.405, 0xd9cdb8);
    }
    this.ground = this.addMerged(flat);
    this.pavement = this.addMerged(raised);
    this.props = this.addMerged(props, { shadow: true });
  }
  // Raised sidewalk bands and corner arc bands: a top face and a kerb face
  // (and the back face where it stands above a low lot).
  buildSidewalks(list, L, J) {
    const pos = [], col = [];
    const top = KERB_TOP, kerb = new THREE.Color(K.curb), walk = new THREE.Color(K.walk);
    const tri = (a, b, c, k) => {
      // Always facing up / outwards consistently is not needed: the
      // material is double-sided for these strips.
      for (const p of [a, b, c]) {
        pos.push(p[0], p[1], p[2]);
        col.push(k.r, k.g, k.b);
      }
    };
    const quad = (a, b, c, d, k) => {
      tri(a, b, c, k);
      tri(a, c, d, k);
    };
    for (const band of sidewalkBands(L, J)) {
      const P = band.pts;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        const ai = [a.x + a.nx * band.w0, top, a.z + a.nz * band.w0], ao = [a.x + a.nx * band.w1, top, a.z + a.nz * band.w1];
        const bi = [b.x + b.nx * band.w0, top, b.z + b.nz * band.w0], bo = [b.x + b.nx * band.w1, top, b.z + b.nz * band.w1];
        quad(ai, bi, bo, ao, walk);
        quad([ai[0], 0.04, ai[2]], [bi[0], 0.04, bi[2]], bi, ai, kerb);
        quad([ao[0], 0.04, ao[2]], ao, bo, [bo[0], 0.04, bo[2]], walk);
      }
    }
    for (const c of J.corners) {
      const n = Math.max(4, Math.ceil(Math.abs(c.da) / 0.2));
      for (let k = 0; k < n; k++) {
        const a0 = c.a0 + (c.da * k) / n, a1 = c.a0 + (c.da * (k + 1)) / n;
        const P = (a, r) => [c.o.x + Math.cos(a) * r, top, c.o.z + Math.sin(a) * r];
        quad(P(a0, c.r0), P(a0, c.r1), P(a1, c.r1), P(a1, c.r0), walk);
        // Kerb face on the road side: the outer radius at an inside corner,
        // the inner radius round the outside of a bend.
        const rk = c.r0 > 0 && c.r1 - c.r0 > 2 && c.r0 > 2 ? c.r0 : c.r1;
        const A = P(a0, rk), B = P(a1, rk);
        quad([A[0], 0.04, A[2]], [B[0], 0.04, B[2]], B, A, kerb);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    list.push(g);
  }
  buildBuildings(L) {
    const geos = [];
    let verts = 0;
    for (const b of L.buildings) {
      if (b.destructible) {
        geos.push(null); // drawn as wall cells (cells.js)
        continue;
      }
      const seed = Math.abs(Math.round(b.x * 7 + b.z * 13 + b.h * 3));
      const group = buildingGroup(b, seed, [0, 0]);
      const g = coloredGeometry(group, { dropDown: true, flush: b });
      g.translate(b.x, 0, b.z);
      const ng = g.index ? g.toNonIndexed() : g;
      if (ng !== g) g.dispose();
      for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "color"].includes(k)) ng.deleteAttribute(k);
      geos.push(ng);
      verts += ng.attributes.position.count;
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
    this.buildingMaterial = mat;
    const batch = new THREE.BatchedMesh(Math.max(1, geos.filter(Boolean).length), Math.max(3, verts), 0, mat);
    batch.castShadow = batch.receiveShadow = true;
    batch.perObjectFrustumCulled = true;
    batch.sortObjects = false;
    this.group.add(batch);
    this.batch = batch;
    this.entries = geos.map((g, i) => {
      if (!g) {
        const b = L.buildings[i];
        return { bounds: b, visualBounds: new THREE.Box3(new THREE.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2), new THREE.Vector3(b.x + b.w / 2, b.h + 0.4, b.z + b.d / 2)), opacity: 1, occluded: false, setOpacity: () => {}, destructible: true };
      }
      const gid = batch.addGeometry(g);
      const id = batch.addInstance(gid);
      g.computeBoundingBox();
      const entry = {
        bounds: L.buildings[i],
        visualBounds: g.boundingBox.clone(),
        opacity: 1,
        occluded: false,
        geometry: g,
        ghost: null,
        // Fading: hidden in the batch, its own see-through copy shown.
        setOpacity: (op) => {
          entry.opacity = op;
          const fading = op < 0.999;
          batch.setVisibleAt(id, !fading && !entry.gone);
          if (fading && !entry.ghost) {
            entry.ghost = new THREE.Mesh(g, mat.clone());
            entry.ghost.material.transparent = true;
            entry.ghost.material.depthWrite = false;
            this.group.add(entry.ghost);
          }
          if (entry.ghost) {
            entry.ghost.visible = fading && !entry.gone;
            entry.ghost.material.opacity = op;
          }
        },
        batchId: id,
      };
      return entry;
    });
  }
  dispose() {
    this.group.traverse((o) => {
      if (o.geometry && o !== this.batch) o.geometry.dispose?.();
    });
    this.batch?.dispose?.();
    for (const e of this.entries || []) {
      e.geometry?.dispose();
      e.ghost?.material.dispose();
    }
    this.material.dispose();
    this.buildingMaterial?.dispose();
    this.scene.remove(this.group);
  }
}
