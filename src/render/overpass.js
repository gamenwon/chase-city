// V2.1 elevated road drawing (game/overpass.js): concrete embankments
// under the low part of each ramp, sloped ramp slabs, the deck in two
// halves (so it can break in the middle), parapets, lane lines and the
// four pillars. Pillars darken as they are damaged and leave a stump when
// they go. When the deck comes down its halves drop and settle, broken
// and tilted, on the street below, where they stay; concrete chunks lie
// at the sides.
import * as THREE from "three";
import { overpassHeight } from "../world/citygen.js";
import { PILLAR } from "../game/overpass.js";

const CONCRETE = 0xc9c5bd, SIDE = 0xa9a39a, PARAPET = 0xe9e5dd, LINE = 0xf2b705;
const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });

export class OverpassRenderer {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.mats = { concrete: mat(CONCRETE), side: mat(SIDE), parapet: mat(PARAPET), line: mat(LINE), rubble: mat(0x9c968d) };
  }
  setLayout(layout) {
    for (const it of this.items) {
      if (it.rubble) this.scene.remove(it.rubble);
      this.scene.remove(it.group);
      it.group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && !Object.values(this.mats).includes(o.material)) o.material.dispose();
      });
    }
    this.items = (layout.overpasses || []).map((op) => this.build(op));
  }
  box(parent, w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  build(op) {
    const g = new THREE.Group();
    g.position.set(op.a.x, 0, op.a.z);
    g.rotation.y = Math.atan2(-op.u.z, op.u.x); // local x along u, local z along n
    this.scene.add(g);
    const { L, R, H, W } = op;
    const T = 0.55; // slab thickness
    // Embankments under the low part of each ramp (solid in the game).
    const s1 = (4.3 / H) * R;
    for (const end of [0, 1])
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * s1, b = ((k + 1) / 5) * s1, h = overpassHeight(op, (a + b) / 2) - 0.1;
        if (h <= 0.05) continue;
        const sx = end ? L - (a + b) / 2 : (a + b) / 2;
        this.box(g, b - a + 0.02, h, op.groundWidth, this.mats.side, sx, h / 2, 0);
      }
    // Ramp slabs and their parapets.
    const slope = Math.atan2(H, R), len = Math.hypot(R, H);
    for (const end of [0, 1]) {
      const r = new THREE.Group();
      r.position.set(end ? L - R / 2 : R / 2, H / 2 - T / 2, 0);
      r.rotation.z = end ? -slope : slope;
      g.add(r);
      this.box(r, len, T, W, this.mats.concrete, 0, 0, 0);
      for (const side of [-1, 1]) this.box(r, len, 0.9, 0.3, this.mats.parapet, 0, 0.7, side * (W / 2 - 0.15));
      this.box(r, len * 0.9, 0.02, 0.15, this.mats.line, 0, T / 2 + 0.01, 0);
    }
    // Deck halves (each with its parapets and line), pivot at their middle.
    const span = L - 2 * R, half = span / 2;
    const halves = [R + half / 2, L - R - half / 2].map((cx, k) => {
      const h = new THREE.Group();
      h.position.set(cx, H - T / 2, 0);
      g.add(h);
      this.box(h, half - 0.05, T, W, this.mats.concrete, 0, 0, 0);
      this.box(h, half - 0.05, 0.25, W - 0.6, this.mats.side, 0, -T / 2 - 0.12, 0);
      for (const side of [-1, 1]) this.box(h, half - 0.05, 0.9, 0.3, this.mats.parapet, 0, 0.7, side * (W / 2 - 0.15));
      for (let x = -half / 2 + 1; x < half / 2 - 1; x += 3) this.box(h, 1.6, 0.02, 0.15, this.mats.line, x, T / 2 + 0.01, 0);
      return { group: h, home: { x: cx, y: H - T / 2 }, k };
    });
    // Pillars (own material each: they darken with damage).
    const pillars = op.pillars.map((q) => {
      const s = q.s, lat = q.side * (W / 2 - 0.6);
      const m = this.box(g, q.w, H - T, q.d, mat(CONCRETE), s, (H - T) / 2, lat);
      const stump = this.box(g, q.w * 1.1, 0.7, q.d * 1.1, this.mats.rubble, s, 0.35, lat);
      stump.visible = false;
      return { mesh: m, stump };
    });
    return { op, group: g, halves, pillars, rubble: null };
  }
  update(sim) {
    for (const it of this.items) {
      const live = sim.overpasses?.[it.op.id ?? 0] || sim.overpasses?.[0];
      if (!live) continue;
      live.pillars.forEach((q, i) => {
        const p = it.pillars[i];
        p.mesh.visible = q.alive;
        p.stump.visible = !q.alive;
        const k = Math.max(0, q.health) / PILLAR.health;
        p.mesh.material.color.setHex(CONCRETE).lerp(new THREE.Color(0x5a554f), 1 - k);
      });
      // The deck coming down: each half drops (accelerating) and tips to
      // its resting tilt on the street.
      const t = live.state === "up" ? 0 : live.state === "down" ? 1 : Math.min(1, (sim.elapsed - live.fellAt) / PILLAR.fall);
      const e = t * t;
      for (const h of it.halves) {
        const rest = { y: 0.4, tilt: h.k ? -0.1 : 0.12, roll: h.k ? 0.06 : -0.05 };
        h.group.position.y = h.home.y + (rest.y - h.home.y) * e;
        h.group.rotation.z = rest.tilt * e;
        h.group.rotation.x = rest.roll * e;
      }
      if (live.state === "down" && !it.rubble) {
        // Concrete chunks where they came to rest (world coordinates).
        it.rubble = new THREE.Group();
        this.scene.add(it.rubble);
        for (const d of live.debris) {
          const m = this.box(it.rubble, d.w, 1.1, d.d, this.mats.rubble, d.x, 0.55, d.z);
          m.rotation.set(0.2, d.x * 0.7, 0.15);
        }
      }
      if (live.state === "up" && it.rubble) {
        this.scene.remove(it.rubble);
        it.rubble = null;
      }
    }
  }
}
