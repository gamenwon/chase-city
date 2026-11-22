// Elevated road drawing (map quality pass): the deck and its ramps follow
// the road's polyline (straight or curved), sampled every 2 m, with eased
// ramps; under the low end of each ramp a solid embankment (where cars
// cannot pass under), parapets both sides, a dashed centre line, and
// pillars with cap beams in the avenue's median. Deck, ramps and parapets
// are one merged mesh; it turns see-through when it hides the player
// driving underneath. (No collapse in this phase.)
import * as THREE from "three";
import { overpassHeight, OVERPASS } from "../world/citygen.js";
import { makePath, pointAt } from "../game/citygraph.js";
import { overpassLocal } from "../game/overpass.js";

const CONCRETE = 0xcac6be, SIDE = 0xa8a299, PARAPET = 0xe9e5dd, LINE = 0xf2b705, UNDER = 0x8d877f;

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
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    this.pillarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
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
    // Samples: every 2 m plus every polyline vertex (corners exact).
    const ss = new Set([0, path.len]);
    for (let s = 0; s < path.len; s += 2) ss.add(s);
    for (const c of path.cum) ss.add(c);
    const S = [...ss].sort((a, b) => a - b);
    const P = S.map((s) => {
      const q = pointAt(path, Math.min(s, path.len - 1e-6));
      const h = overpassHeight(op, s);
      // Under the low part of a ramp: solid down to the ground.
      const solid = s <= solidTo || s >= path.len - solidTo;
      return { s, x: q.x, z: q.z, nx: -q.uz, nz: q.ux, top: h + 0.02, bot: solid ? 0.02 : Math.max(0.02, h - T) };
    });
    const pos = [], col = [];
    const pt = (p, lat, y) => [p.x + p.nx * lat, y, p.z + p.nz * lat];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      // Deck top, underside, sides.
      quad(pos, col, pt(a, -W / 2, a.top), pt(b, -W / 2, b.top), pt(b, W / 2, b.top), pt(a, W / 2, a.top), CONCRETE);
      quad(pos, col, pt(a, -W / 2, a.bot), pt(a, W / 2, a.bot), pt(b, W / 2, b.bot), pt(b, -W / 2, b.bot), UNDER);
      for (const side of [-1, 1]) {
        quad(pos, col, pt(a, (side * W) / 2, a.bot), pt(b, (side * W) / 2, b.bot), pt(b, (side * W) / 2, b.top), pt(a, (side * W) / 2, a.top), SIDE);
        // Parapet (0.3 thick, 0.9 high) along the edge.
        const o = side * (W / 2 - 0.15);
        for (const d of [-0.15, 0.15]) quad(pos, col, pt(a, o + d, a.top), pt(b, o + d, b.top), pt(b, o + d, b.top + 0.9), pt(a, o + d, a.top + 0.9), PARAPET);
        quad(pos, col, pt(a, o - 0.15, a.top + 0.9), pt(b, o - 0.15, b.top + 0.9), pt(b, o + 0.15, b.top + 0.9), pt(a, o + 0.15, a.top + 0.9), PARAPET);
      }
      // Dashed centre line.
      if (Math.floor(a.s / 3) % 2 === 0) quad(pos, col, pt(a, -0.08, a.top + 0.015), pt(b, -0.08, b.top + 0.015), pt(b, 0.08, b.top + 0.015), pt(a, 0.08, a.top + 0.015), LINE);
    }
    // End faces of the solid embankments are at ground level (nothing to
    // close). Pillars with a cap beam under the deck.
    const pp = [], pc = [];
    const box = (cx, cy, cz, w, h, d, ang, hex) => {
      const g = new THREE.BoxGeometry(w, h, d);
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
    for (const q of op.pillars) {
      const loc = pointAt(path, q.s);
      const h = overpassHeight(op, q.s) - T;
      const ang = Math.atan2(loc.ux, loc.uz);
      box(q.x, h / 2, q.z, q.w, h, q.d, ang, 0xbab5ac);
      box(q.x, h - 0.35, q.z, W - 1.2, 0.7, 1.6, ang, 0xa8a299);
      box(q.x, 0.25, q.z, q.w + 0.5, 0.5, q.d + 0.5, ang, 0x8d877f);
    }
    const deck = new THREE.Mesh(geometry(pos, col), this.deckMat);
    deck.castShadow = deck.receiveShadow = true;
    const meshes = [deck];
    if (pp.length) {
      const pil = new THREE.Mesh(geometry(pp, pc), this.pillarMat);
      pil.castShadow = pil.receiveShadow = true;
      meshes.push(pil);
    }
    for (const m of meshes) this.scene.add(m);
    return { op, meshes };
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
  // The deck fades when the player drives underneath it.
  update(sim, dt = 1 / 60) {
    if (!this.items.length) return;
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
