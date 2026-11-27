// Elevated road drawing (map quality pass): the deck and its ramps follow
// the road's polyline (straight or curved), sampled every 2 m, with eased
// ramps; under the low end of each ramp a solid embankment (where cars
// cannot pass under), parapets both sides, a dashed centre line, and
// pillars with cap beams in the avenue's median. It turns see-through
// when it hides the player driving underneath. Destruction pass: deck in
// pieces cut at the pillars, pillars cracking and crumbling, a span
// falling when the pillar under it gives way.
import * as THREE from "three";
import { overpassHeight, OVERPASS } from "../world/citygen.js";
import { makePath, pointAt } from "../game/citygraph.js";
import { overpassLocal } from "../game/overpass.js";

// The driving surface (deck and both ramps) is the same asphalt and the
// same markings as the streets (world.js: theme.road, a white dashed
// centre line 2 m on / 2 m off); the structure (sides, underside,
// parapets, pillars) stays concrete.
const SIDE = 0xa8a299, PARAPET = 0xe9e5dd, LINE = 0xf2efe6, UNDER = 0x8d877f;
const ASPHALT = 0x37363b;

// Flat-coloured triangles into position/colour arrays.
function quad(pos, col, a, b, c, d, hex) {
  const k = new THREE.Color(hex);
  for (const p of [a, b, c, a, c, d]) {
    pos.push(p[0], p[1], p[2]);
    col.push(k.r, k.g, k.b);
  }
}
function geometry(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class OverpassRenderer {
  constructor(scene, theme = {}) {
    this.scene = scene;
    this.road = theme.road ?? ASPHALT;
    this.items = [];
    // Same material settings as the ground (world.js), so day and night
    // light it the same way.
    this.deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
    this.pillarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    // (Faded see-through now and then for the camera: snow all the same.)
    this.deckMat.userData.wxFade = this.pillarMat.userData.wxFade = true;
    this.deckMat.userData.wxNoSlush = true;
    this.crackMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 });
    this.opacity = 1;
  }
  setLayout(layout) {
    for (const it of this.items) for (const m of it.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.items = (layout.overpasses || []).map((op) => this.build(op));
    this.opacity = 1;
    this.applyOpacity(1);
  }
  build(op) {
    const path = makePath(op.pts || [op.a, { x: op.a.x + op.u.x * op.L, z: op.a.z + op.u.z * op.L }]);
    const W = op.W, T = 0.7;
    const solidTo = (() => { for (let s = 0; s < op.R; s += 0.25) if (overpassHeight(op, s) >= OVERPASS.clear) return s; return op.R; })();
    // Pieces (destruction pass): the deck is cut at every pillar and where
    // each embankment ends, so the span a broken pillar carried can fall
    // on its own (pillar to pillar, as game/overpass.js collapses it).
    const pillars = op.pillars.slice().sort((a, b) => a.s - b.s);
    const cuts = [0, solidTo, ...pillars.map((q) => q.s), path.len - solidTo, path.len].filter((v, i, arr) => i === 0 || v > arr[i - 1] + 0.3);
    const pieces = [];
    for (let k = 1; k < cuts.length; k++) pieces.push(this.piece(op, path, cuts[k - 1], cuts[k], solidTo));
    // Pillars, each its own mesh (damage, cracks, collapse): column, cap
    // beam, foot; the weak ones (they can break) carry hazard stripes.
    const pillarMeshes = pillars.map((q) => {
      const pp = [], pc = [];
      const loc = pointAt(path, q.s);
      const h = overpassHeight(op, q.s) - T;
      const ang = Math.atan2(loc.ux, loc.uz);
      const box = (cx, cy, cz, w, hh, d, hex) => {
        const g = new THREE.BoxGeometry(w, hh, d);
        g.rotateY(ang);
        g.translate(cx, cy, cz);
        const k = new THREE.Color(hex), arr = g.toNonIndexed();
        const p = arr.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) {
          pp.push(p[i], p[i + 1], p[i + 2]);
          pc.push(k.r, k.g, k.b);
        }
        g.dispose();
        arr.dispose();
      };
      box(0, h / 2, 0, q.w, h, q.d, 0xbab5ac);
      box(0, h - 0.35, 0, W - 1.2, 0.7, 1.6, 0xa8a299);
      box(0, 0.25, 0, q.w + 0.5, 0.5, q.d + 0.5, 0x8d877f);
      if (q.weak) for (let i = 0; i < 4; i++) box(0, 0.75 + i * 0.36, 0, q.w + 0.04, 0.18, q.d + 0.04, i % 2 ? 0x232227 : 0xf5c01a);
      const m = new THREE.Mesh(geometry(pp, pc), this.pillarMat);
      m.position.set(q.x, 0, q.z);
      m.castShadow = m.receiveShadow = true;
      // Cracks: dark streaks shown as it is damaged (two stages).
      const cracks = [0, 1].map((stage) => {
        const cg = new THREE.Group();
        for (let i = 0; i < 4 + stage * 3; i++) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6 + (i % 3) * 0.4, q.d + 0.06), this.crackMat);
          c.position.set(-q.w / 2 + 0.15 + ((i * 0.37) % 1) * (q.w - 0.3), 0.9 + ((i * 0.53) % 1) * (h - 1.6), 0);
          c.rotation.z = (i % 2 ? 1 : -1) * (0.3 + stage * 0.2);
          cg.add(c);
        }
        cg.rotation.y = ang;
        cg.visible = false;
        m.add(cg);
        return cg;
      });
      this.scene.add(m);
      return { q, mesh: m, cracks, h, ang, state: "up" };
    });
    for (const pc of pieces) this.scene.add(pc.mesh);
    return { op, pieces, pillars: pillarMeshes, meshes: [...pieces.map((p) => p.mesh), ...pillarMeshes.map((p) => p.mesh)] };
  }
  // One deck piece from s0 to s1, built round its own centre (so it can
  // drop and tilt as a whole).
  piece(op, path, s0, s1, solidTo) {
    const W = op.W, T = 0.7;
    const ss = new Set([s0, s1]);
    for (let s = Math.ceil(s0 / 2) * 2; s < s1; s += 2) ss.add(s);
    for (const c of path.cum) if (c > s0 && c < s1) ss.add(c);
    const S = [...ss].sort((a, b) => a - b);
    const P = S.map((s) => {
      const q = pointAt(path, Math.min(s, path.len - 1e-6));
      const h = overpassHeight(op, s);
      const solid = s <= solidTo + 1e-6 || s >= path.len - solidTo - 1e-6;
      return { s, x: q.x, z: q.z, nx: -q.uz, nz: q.ux, top: h + 0.02, bot: solid ? 0.02 : Math.max(0.02, h - T) };
    });
    const mid = pointAt(path, (s0 + s1) / 2), my = overpassHeight(op, (s0 + s1) / 2);
    const c = { x: mid.x, y: my, z: mid.z };
    const pos = [], col = [];
    const pt = (p, lat, y) => [p.x + p.nx * lat - c.x, y - c.y, p.z + p.nz * lat - c.z];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      quad(pos, col, pt(a, -W / 2, a.top), pt(b, -W / 2, b.top), pt(b, W / 2, b.top), pt(a, W / 2, a.top), this.road);
      quad(pos, col, pt(a, -W / 2, a.bot), pt(a, W / 2, a.bot), pt(b, W / 2, b.bot), pt(b, -W / 2, b.bot), UNDER);
      for (const side of [-1, 1]) {
        quad(pos, col, pt(a, (side * W) / 2, a.bot), pt(b, (side * W) / 2, b.bot), pt(b, (side * W) / 2, b.top), pt(a, (side * W) / 2, a.top), SIDE);
        const o = side * (W / 2 - 0.15);
        for (const d of [-0.15, 0.15]) quad(pos, col, pt(a, o + d, a.top), pt(b, o + d, b.top), pt(b, o + d, b.top + 0.9), pt(a, o + d, a.top + 0.9), PARAPET);
        quad(pos, col, pt(a, o - 0.15, a.top + 0.9), pt(b, o - 0.15, b.top + 0.9), pt(b, o + 0.15, b.top + 0.9), pt(a, o + 0.15, a.top + 0.9), PARAPET);
      }
      // Dashed centre line, as on the streets (2 m dash every 4 m, 0.12 m).
      if (Math.floor((a.s + 1e-6) / 2) % 2 === 0) quad(pos, col, pt(a, -0.06, a.top + 0.015), pt(b, -0.06, b.top + 0.015), pt(b, 0.06, b.top + 0.015), pt(a, 0.06, a.top + 0.015), LINE);
    }
    // Street lamps on the parapets every 16 m (alternating sides), part of
    // the piece (they fall with it; the night lights go out with it).
    const lamps = [];
    for (const p of P) {
      const k = Math.round(p.s / 8);
      if (Math.abs(p.s - k * 8) > 1 || k % 2 || p.s < s0 + 1 || p.s > s1 - 1 || lamps.some((l) => Math.abs(l.s - p.s) < 6)) continue;
      const side = (k / 2) % 2 ? 1 : -1, o = side * (W / 2 - 0.15), y0 = p.top + 0.9;
      const post = (lat0, lat1, ya, yb, w) => {
        // A thin box from (lat0, ya) to (lat1, yb) across the road.
        const a0 = pt(p, lat0, ya), b0 = pt(p, lat1, yb);
        const t = [p.nz * w, 0, -p.nx * w];
        quad(pos, col, [a0[0] - t[0], a0[1], a0[2] - t[2]], [a0[0] + t[0], a0[1], a0[2] + t[2]], [b0[0] + t[0], b0[1], b0[2] + t[2]], [b0[0] - t[0], b0[1], b0[2] - t[2]], 0x5d6168);
      };
      post(o, o, y0, y0 + 4.2, 0.09);
      post(o, o - side * 1.4, y0 + 4.2, y0 + 4.2, 0.09);
      const h = pt(p, o - side * 1.4, y0 + 4.05);
      lamps.push({ s: p.s, x: h[0] + c.x, z: h[2] + c.z, y: h[1] + c.y, ground: p.top });
    }
    // Broken ends: close the piece's end faces (seen once a span has gone).
    for (const e of [P[0], P[P.length - 1]]) quad(pos, col, pt(e, -W / 2, e.bot), pt(e, W / 2, e.bot), pt(e, W / 2, e.top), pt(e, -W / 2, e.top), SIDE);
    const mesh = new THREE.Mesh(geometry(pos, col), this.deckMat);
    mesh.position.set(c.x, c.y, c.z);
    mesh.castShadow = mesh.receiveShadow = true;
    return { s0, s1, mesh, home: { ...c }, dir: { x: mid.ux, z: mid.uz }, state: "up", lamps };
  }
  applyOpacity(o) {
    const m = this.deckMat, t = o < 0.999;
    if (m.transparent !== t) {
      m.transparent = t;
      m.depthWrite = !t;
      m.needsUpdate = true;
    }
    m.opacity = o;
  }
  // Damage and collapse from the simulation's state (game/overpass.js).
  sync(sim) {
    this.items.forEach((it, i) => {
      const op = sim.overpasses?.[i];
      if (!op) return;
      if (sim.runNumber !== it.run) {
        // A new run: everything back up.
        it.run = sim.runNumber;
        for (const pc of it.pieces) {
          pc.state = "up";
          pc.mesh.position.set(pc.home.x, pc.home.y, pc.home.z);
          pc.mesh.rotation.set(0, 0, 0);
        }
        for (const pm of it.pillars) {
          pm.state = "up";
          pm.mesh.position.y = 0;
          pm.mesh.rotation.set(0, 0, 0);
          pm.mesh.scale.set(1, 1, 1);
          pm.cracks.forEach((c) => (c.visible = false));
        }
      }
      // Pillars: cracks by health; a broken one buckles and sinks into a
      // heap at its foot.
      for (const pm of it.pillars) {
        const q = op.pillars.find((x) => x.id === pm.q.id) || op.pillars[pm.q.id];
        if (!q) continue;
        const frac = q.health / (q.maxHealth || 100);
        pm.cracks[0].visible = frac < 0.75;
        pm.cracks[1].visible = frac < 0.45;
        if (pm.state === "up") {
          // A hit shakes it; badly damaged it leans a little (partial
          // failure), the deck above trembling with it.
          const since = sim.elapsed - (q.lastHit ?? -9);
          const shake = since < 0.45 ? Math.sin(since * 70) * 0.12 * (1 - since / 0.45) : 0;
          const lean = frac < 0.45 ? 0.035 * (1 - frac / 0.45) + 0.012 : 0;
          pm.mesh.position.x = q.x + shake * Math.cos(pm.ang);
          pm.mesh.position.z = q.z - shake * Math.sin(pm.ang);
          pm.mesh.rotation.set(lean, 0, shake * 0.08);
          pm.mesh.scale.y = 1 - (frac < 0.45 ? 0.03 : 0);
        }
        if (!q.alive && pm.state === "up") pm.state = "down", (pm.at = q.brokeAt ?? sim.elapsed);
        if (pm.state === "down") {
          const t = Math.min(1, (sim.elapsed - pm.at) / 0.7);
          pm.mesh.scale.y = 1 - 0.78 * t;
          pm.mesh.rotation.x = 0.25 * t;
          pm.mesh.rotation.z = -0.18 * t;
        }
      }
      // Deck pieces inside a fallen span drop (accelerating), tip and
      // settle on the street, broken ends down.
      for (const g of op.gaps || [])
        for (const pc of it.pieces) {
          if (pc.s0 < g.s0 - 0.3 || pc.s1 > g.s1 + 0.3) continue;
          if (pc.state === "up") (pc.state = "falling"), (pc.at = g.fellAt), (pc.tip = pc.s0 < (g.s0 + g.s1) / 2 - 0.3 ? 1 : -1);
          const t = Math.min(1, (sim.elapsed - pc.at) / 1.1);
          const drop = (pc.home.y - 0.55) * t * t;
          pc.mesh.position.y = pc.home.y - drop;
          // Tip about the road's sideways axis (one end hits first).
          const tilt = pc.tip * 0.16 * t;
          pc.mesh.rotation.set(0, 0, 0);
          pc.mesh.rotateOnWorldAxis(new THREE.Vector3(-pc.dir.z, 0, pc.dir.x), tilt);
          pc.mesh.rotateOnWorldAxis(new THREE.Vector3(pc.dir.x, 0, pc.dir.z), 0.05 * pc.tip * t);
        }
    });
  }
  // Night: lamp heads on the deck pieces still standing.
  lampHeads() {
    const out = [];
    for (const it of this.items) for (const pc of it.pieces) if (pc.state === "up") out.push(...pc.lamps);
    return out;
  }
  // The deck fades when the player drives underneath it.
  update(sim, dt = 1 / 60) {
    if (!this.items.length) return;
    this.sync(sim);
    const p = sim.player;
    let under = false;
    if (!p.level)
      for (const it of this.items) {
        const loc = overpassLocal(it.op, p.x, p.z);
        if (loc.s > 0 && loc.s < it.op.L && Math.abs(loc.lat) < it.op.W / 2 + 3 && overpassHeight(it.op, loc.s) > 2.2) under = true;
      }
    const want = under ? 0.32 : 1;
    this.opacity += (want - this.opacity) * (1 - Math.exp(-dt * 8));
    if (Math.abs(this.opacity - want) < 0.01) this.opacity = want;
    this.applyOpacity(this.opacity);
  }
}
