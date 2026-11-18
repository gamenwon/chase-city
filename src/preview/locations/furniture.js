// Loose things that fly: café chairs and tables, parasols, crates, bricks,
// pipes, scaffold sections, gate arms, fruit. Each kind has a mass: a hit
// launches it with a speed and spin from the car's speed and direction
// divided by its mass (light chairs fly far and tumble, heavy pipes and
// tables flip and roll a little). Stacks (cargo crates, scaffolding) come
// down one after another. Pieces in the air are integrated; once landed
// they are frozen (no updates) and can be knocked again at most 3 times.
// Instanced per kind and 60 m map cell (culled off screen).
import * as THREE from "three";
import { C, B, G, cyl, ico, add, pieceGeometry, bakedMaterial } from "./parts.js";

// ------------------------------------------------------------- models --
export function chair(g, color = C.red) {
  // Bistro chair: tubular frame (thin boxes), seat, slatted back.
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) B(g, 0.04, 0.45, 0.04, C.dark, x, 0, z);
  B(g, 0.46, 0.05, 0.44, color, 0, 0.45, 0);
  for (const s of [-1, 1]) B(g, 0.04, 0.45, 0.04, C.dark, s * 0.2, 0.5, 0.2);
  for (let i = 0; i < 3; i++) B(g, 0.42, 0.06, 0.03, color, 0, 0.6 + i * 0.12, 0.21);
}
export function roundTable(g, top = C.white) {
  // Café table: octagonal top with a rim, column, cross foot.
  const t = cyl(g, 0.45, 0.45, 0.05, top, 0, 0.72, 0, 8);
  t.rotation.y = Math.PI / 8;
  cyl(g, 0.47, 0.47, 0.03, C.dark, 0, 0.7, 0, 8).rotation.y = Math.PI / 8;
  cyl(g, 0.04, 0.05, 0.7, C.dark, 0, 0.02, 0, 6);
  B(g, 0.6, 0.04, 0.08, C.dark, 0, 0, 0);
  B(g, 0.08, 0.04, 0.6, C.dark, 0, 0, 0);
}
export function tableTop(g) {
  const t = cyl(g, 0.45, 0.45, 0.05, C.white, 0, 0, 0, 8);
  t.rotation.y = Math.PI / 8;
  cyl(g, 0.47, 0.47, 0.03, C.dark, 0, -0.02, 0, 8).rotation.y = Math.PI / 8;
}
export function tableBase(g) {
  cyl(g, 0.04, 0.05, 0.7, C.dark, 0, 0, 0, 6);
  B(g, 0.6, 0.04, 0.08, C.dark, 0, 0, 0);
  B(g, 0.08, 0.04, 0.6, C.dark, 0, 0, 0);
}
export function parasol(g, a = C.red, b = C.white) {
  // Market parasol: weighted base, pole, 8-panel canopy in two colours.
  cyl(g, 0.3, 0.32, 0.12, C.dark, 0, 0, 0, 8);
  cyl(g, 0.03, 0.03, 2.3, C.white, 0, 0.12, 0, 6);
  for (let i = 0; i < 8; i++) {
    const p = add(g, new THREE.CylinderGeometry(0, 1.25, 0.45, 3, 1, true), i % 2 ? a : b, 0, 2.2, 0);
    p.rotation.y = (i * Math.PI) / 4;
    p.scale.set(0.42, 1, 1);
    p.position.set(Math.sin((i * Math.PI) / 4) * 0.55, 2.2, Math.cos((i * Math.PI) / 4) * 0.55);
    p.rotation.x = 0.0;
  }
  cyl(g, 0.05, 0.05, 0.1, C.dark, 0, 2.45, 0, 6);
}
export function crate(g, fruit = null) {
  B(g, 0.8, 0.5, 0.6, 0xc9935a, 0, 0, 0);
  for (const s of [-1, 1]) B(g, 0.82, 0.08, 0.04, 0x9c6a3a, 0, 0.35, s * 0.31);
  if (fruit != null) for (let i = 0; i < 6; i++) ico(g, 0.11, fruit, -0.25 + (i % 3) * 0.25, 0.55, -0.12 + Math.floor(i / 3) * 0.24);
}
export function cargoCrate(g, c = C.blue) {
  B(g, 1.0, 0.9, 1.0, c, 0, 0, 0);
  B(g, 1.02, 0.1, 1.02, C.white, 0, 0.8, 0);
  for (const s of [-1, 1]) B(g, 0.06, 0.9, 1.02, C.white, s * 0.48, 0, 0);
  B(g, 0.4, 0.25, 0.02, C.white, 0, 0.35, 0.51);
}
export function brickPallet(g) {
  B(g, 1.2, 0.14, 1.0, 0xb98a55, 0, 0, 0);
  for (let l = 0; l < 4; l++)
    for (let i = 0; i < 4; i++) B(g, 0.27, 0.12, 0.9, l % 2 ? 0xb84a2e : 0xc95a3a, -0.43 + i * 0.29, 0.14 + l * 0.13, 0);
}
export function brick(g) {
  B(g, 0.27, 0.12, 0.13, 0xb84a2e, 0, -0.06, 0);
}
export function pipe(g) {
  // Concrete drain pipe lying on its side (1.2 m across).
  const p = add(g, new THREE.CylinderGeometry(0.6, 0.6, 1.6, 10, 1, true), 0xb9b4ac, 0, 0.6, 0);
  p.rotation.z = Math.PI / 2;
  p.material = p.material.clone();
  p.material.side = THREE.DoubleSide;
  const r = add(g, new THREE.TorusGeometry(0.55, 0.08, 4, 10), 0x9a958d, 0.8, 0.6, 0);
  r.rotation.y = Math.PI / 2;
}
export function scaffold(g) {
  // One scaffold bay (2.4 x 1.2 x 2.2): uprights, ledgers, diagonal brace,
  // plank deck, toe board, a few orange safety nets.
  for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) B(g, 0.06, 2.2, 0.06, 0x9da1a8, x, 0, z);
  for (const y of [0.05, 1.1, 2.15]) for (const z of [-0.6, 0.6]) B(g, 2.46, 0.05, 0.05, 0x9da1a8, 0, y, z);
  const br = B(g, 0.05, 2.6, 0.05, 0x9da1a8, 0, 0, -0.62);
  br.rotation.z = 0.83;
  br.position.y = 0.0;
  for (let i = 0; i < 4; i++) B(g, 2.4, 0.06, 0.28, 0xc9935a, 0, 2.2, -0.45 + i * 0.3);
  B(g, 2.4, 0.15, 0.03, C.yellow, 0, 2.26, -0.62);
  B(g, 2.3, 0.9, 0.02, C.orange, 0, 1.15, 0.64);
}
export function gateArm(g) {
  // Barrier arm (red/white), 4 m, pivot end at the origin.
  for (let i = 0; i < 8; i++) B(g, 0.5, 0.1, 0.08, i % 2 ? C.white : C.red, 0.25 + i * 0.5, 0, 0);
}
export function siteFence(g) {
  // Temporary site fence panel (2.4 m) on concrete feet, mesh infill.
  for (const x of [0, 2.4]) {
    B(g, 0.5, 0.15, 0.3, 0x8f8a84, x, 0, 0);
    B(g, 0.05, 2.0, 0.05, 0x9da1a8, x, 0.15, 0);
  }
  for (const y of [0.2, 2.1]) B(g, 2.4, 0.04, 0.04, 0x9da1a8, 1.2, y, 0);
  for (let i = 1; i < 12; i++) B(g, 0.02, 1.9, 0.02, 0xb9bcc2, i * 0.2, 0.2, 0);
  for (let j = 1; j < 6; j++) B(g, 2.4, 0.02, 0.02, 0xb9bcc2, 1.2, 0.2 + j * 0.32, 0);
  B(g, 1.2, 0.4, 0.02, C.orange, 1.2, 1.2, 0.03);
}
export function lightTower(g) {
  // Mobile site light tower: trailer, mast, a bar of four lamps.
  B(g, 1.4, 0.5, 2.2, C.yellow, 0, 0.3, 0);
  for (const z of [-0.6, 0.6]) {
    const w = cyl(g, 0.25, 0.25, 1.5, C.rubber, 0, 0.25, z, 8);
    w.rotation.z = Math.PI / 2;
  }
  cyl(g, 0.08, 0.1, 5.5, C.metal, 0, 0.8, 0, 6);
  B(g, 1.6, 0.12, 0.12, C.dark, 0, 6.2, 0);
  for (let i = 0; i < 4; i++) B(g, 0.35, 0.3, 0.2, 0xfff1c0, -0.6 + i * 0.4, 6.0, -0.12);
}
export function cctv(g) {
  cyl(g, 0.1, 0.12, 4.0, C.dark, 0, 0, 0, 6);
  B(g, 0.6, 0.06, 0.06, C.dark, 0.3, 3.9, 0);
  B(g, 0.4, 0.22, 0.22, C.white, 0.6, 3.7, 0);
  B(g, 0.06, 0.12, 0.12, C.glassDark, 0.82, 3.75, 0);
}
export function fruit(g) {
  ico(g, 0.11, 0xffffff, 0, 0, 0);
}

// Kind table: model, mass, hit radius, rest lift (centre height when
// lying on its side), and specials.
export const FLYERS = {
  chair: { build: (g) => chair(g, 0xffffff), tint: true, flipLift: 0.96, mass: 0.25, r: 0.35, side: 0.22 },
  table: { build: (g) => roundTable(g), mass: 1.2, r: 0.5, side: 0.45, breakAt: 13, parts: ["tableTop", "tableBase"] },
  tableTop: { build: tableTop, mass: 0.5, r: 0.45, side: 0.03, spawnOnly: true },
  tableBase: { build: tableBase, mass: 0.6, r: 0.3, side: 0.3, spawnOnly: true },
  parasol: { build: (g) => parasol(g, 0xffffff, 0xa8a8a8), tint2: true, mass: 0.6, r: 0.4, side: 0.5 },
  crateRed: { build: (g) => crate(g, 0xe8401c), mass: 0.7, r: 0.45, side: 0.3, bits: "fruit", bitN: 6 },
  crateOrange: { build: (g) => crate(g, 0xf0781e), mass: 0.7, r: 0.45, side: 0.3, bits: "fruit", bitN: 6 },
  crateGreen: { build: (g) => crate(g, 0x5cb23a), mass: 0.7, r: 0.45, side: 0.3, bits: "fruit", bitN: 6 },
  cargo: { build: (g) => cargoCrate(g, 0xffffff), tint: true, mass: 0.9, r: 0.6, side: 0.45 },
  bricks: { build: brickPallet, mass: 2.5, r: 0.65, side: 0.3, bits: "brick", bitN: 12 },
  pipe: { build: pipe, mass: 3.0, r: 0.8, side: 0.6, roll: true },
  scaffold: { build: scaffold, mass: 2.0, r: 1.3, side: 0.6 },
  gateArm: { build: gateArm, mass: 0.4, r: 0.4, side: 0.05, armLength: 4 },
  siteFence: { build: siteFence, mass: 0.8, r: 0.3, side: 0.1, panel: 2.4 },
  lightTower: { build: lightTower, mass: 1.6, r: 0.9, side: 0.6 },
  cctv: { build: cctv, mass: 0.7, r: 0.3, side: 0.15 },
};
export const BITS = {
  fruit: { build: fruit, cap: 160, tint: true },
  brick: { build: brick, cap: 160 },
};
const FRUIT = [0xe8401c, 0xf5c01a, 0x5cb23a, 0xf0781e].map((c) => new THREE.Color(c));
const CELL = 60;
const cellOf = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
const UP = new THREE.Vector3(0, 1, 0);

export class FlyerSystem {
  // specs: [{ kind, x, y, z, ry, color?, color2?, group?, level? }]
  constructor(scene, specs, hooks = {}) {
    this.hooks = hooks;
    this.mat = bakedMaterial;
    this.tintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
    this.geos = {};
    const geo = (k) => (this.geos[k] ||= pieceGeometry(FLYERS[k]?.build || BITS[k].build));
    const groups = new Map();
    this.items = specs.map((spec, i) => {
      const key = `${spec.kind}|${cellOf(spec.x, spec.z)}`;
      if (!groups.has(key)) groups.set(key, []);
      const it = { spec, i, def: FLYERS[spec.kind] };
      groups.get(key).push(it);
      return it;
    });
    const tinted = (k) => FLYERS[k]?.tint || FLYERS[k]?.tint2 || BITS[k]?.tint;
    for (const [key, list] of groups) {
      const [kind, cell] = key.split("|");
      const [cx, cz] = cell.split(",").map(Number);
      const m = new THREE.InstancedMesh(geo(kind), tinted(kind) ? this.tintMat : this.mat, list.length);
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * CELL, 2, (cz + 0.5) * CELL), CELL * 0.75 + 30);
      m.castShadow = !["chair", "crate", "cargo", "cctv"].includes(kind);
      m.receiveShadow = true;
      if (tinted(kind)) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
      scene.add(m);
      list.forEach((it, idx) => {
        it.mesh = m;
        it.idx = idx;
        if (tinted(kind)) m.setColorAt(idx, new THREE.Color(it.spec.color ?? 0xffffff));
      });
    }
    // Spawn pools (table halves, fruit, bricks): global, frustum-free.
    this.pools = {};
    for (const k of ["tableTop", "tableBase", "fruit", "brick"]) {
      const cap = BITS[k]?.cap || 40;
      const m = new THREE.InstancedMesh(geo(k), tinted(k) ? this.tintMat : this.mat, cap);
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      if (tinted(k)) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      scene.add(m);
      this.pools[k] = { mesh: m, cap, used: 0 };
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.e = new THREE.Euler();
    this.reset();
  }
  reset() {
    this.active = [];
    this.pending = [];
    for (const p of Object.values(this.pools)) {
      p.used = 0;
      p.mesh.count = 0;
      p.mesh.visible = false;
    }
    for (const it of this.items) {
      const s = it.spec;
      it.x = s.x;
      it.y = s.y ?? 0.05;
      it.z = s.z;
      it.q = new THREE.Quaternion().setFromAxisAngle(UP, s.ry || 0);
      it.state = "rest";
      it.hits = 0;
      it.hidden = false;
      this.pose(it);
    }
    for (const it of this.items) it.mesh.instanceMatrix.needsUpdate = true;
    this.stats = { launched: 0, broken: 0, bits: 0 };
  }
  pose(it) {
    const s = it.hidden ? 0 : 1;
    this.m.compose(this.v.set(it.x, it.y, it.z), it.q, this.s.set(s, s, s));
    it.mesh.setMatrixAt(it.idx, this.m);
    it.mesh.instanceMatrix.needsUpdate = true;
  }
  // A car near the loose things: knock what it touches.
  touch(sim, car, radius, speed) {
    if (speed < 2) return;
    for (const it of this.items) {
      if (it.state === "fly" || it.hidden || it.hits >= 3) continue;
      if (Math.abs(car.x - it.x) > 4 || Math.abs(car.z - it.z) > 4) continue;
      const dx = it.x - car.x, dz = it.z - car.z, d = Math.hypot(dx, dz);
      if (d > radius + it.def.r) continue;
      this.launch(sim, it, car, speed, dx / (d || 1), dz / (d || 1));
      if (it.spec.group != null)
        for (const o of this.items)
          if (o !== it && o.spec.group === it.spec.group && o.state === "rest")
            this.pending.push({ at: sim.elapsed + 0.1 + (o.spec.level || 0) * 0.14, it: o, car: { vx: car.vx * 0.5, vz: car.vz * 0.5 }, speed: speed * 0.5, nx: dx / (d || 1), nz: dz / (d || 1) });
    }
  }
  launch(sim, it, car, speed, nx, nz) {
    if (this.active.length >= 90) return; // the air is full: leave it
    const def = it.def;
    if (def.breakAt && speed >= def.breakAt && def.parts) {
      // Breaks in two: the halves fly instead.
      it.hidden = true;
      this.pose(it);
      this.stats.broken++;
      def.parts.forEach((p, i) => this.spawn(sim, p, it.x, it.y + 0.6 - i * 0.3, it.z, car, speed, nx, nz, FLYERS[p].mass));
      return;
    }
    if (def.bits) for (let i = 0; i < def.bitN; i++) this.spawn(sim, def.bits, it.x, it.y + 0.5, it.z, car, speed * 0.8, nx, nz, 0.3);
    const base = Math.min(1.8, Math.max(0.55, 1 / Math.sqrt(def.mass)));
    const r = () => Math.random();
    const along = 0.35 + 0.35 * r(), side = (r() - 0.5) * 0.7;
    const vx = ((car.vx || 0) * along + nx * speed * 0.3 + -nz * speed * side * 0.4) * base;
    const vz = ((car.vz || 0) * along + nz * speed * 0.3 + nx * speed * side * 0.4) * base;
    it.vx = vx;
    it.vz = vz;
    it.vy = Math.min(11, (1.2 + speed * 0.22) * base * (0.6 + 0.7 * r()));
    if (def.roll) it.vy *= 0.35;
    const spinAxis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    it.w = { axis: spinAxis, rate: (4 + 10 * r()) * base };
    it.state = "fly";
    it.hits++;
    it.bounced = false;
    this.active.push(it);
    this.stats.launched++;
    if (it.hits === 1) sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: it.x, z: it.z, strength: Math.min(15, speed) * Math.min(1, def.mass + 0.3) });
  }
  // A loose piece (table half, fruit, brick) from a pool.
  spawn(sim, kind, x, y, z, car, speed, nx, nz, mass) {
    const pool = this.pools[kind];
    if (!pool || pool.used >= pool.cap || this.active.length >= 140) return;
    const idx = pool.used++;
    pool.mesh.count = pool.used;
    pool.mesh.visible = true;
    if (kind === "fruit") pool.mesh.setColorAt(idx, FRUIT[idx % 4]), (pool.mesh.instanceColor.needsUpdate = true);
    const it = { spec: { kind }, def: FLYERS[kind] || { mass, side: 0.06 }, mesh: pool.mesh, idx, x, y, z, q: new THREE.Quaternion(), hits: 3, state: "rest" };
    const base = Math.min(2.2, 1 / Math.sqrt(mass));
    const a = Math.random() * Math.PI * 2;
    it.vx = ((car.vx || 0) * 0.35 + Math.cos(a) * speed * 0.25 + nx * speed * 0.2) * base;
    it.vz = ((car.vz || 0) * 0.35 + Math.sin(a) * speed * 0.25 + nz * speed * 0.2) * base;
    it.vy = (2 + Math.random() * speed * 0.25) * base;
    it.w = { axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), rate: 6 + 10 * Math.random() };
    it.state = "fly";
    it.bounced = false;
    this.active.push(it);
    this.stats.bits++;
  }
  update(sim, dt) {
    for (const p of [...this.pending])
      if (sim.elapsed >= p.at) {
        this.pending.splice(this.pending.indexOf(p), 1);
        if (p.it.state === "rest") this.launch(sim, p.it, p.car, Math.max(4, p.speed), p.nx, p.nz);
      }
    if (!this.active.length) return;
    const keep = [];
    for (const it of this.active) {
      it.vy -= 15 * dt;
      const drag = Math.exp(-dt * 0.5);
      it.vx *= drag;
      it.vz *= drag;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      this.q2.setFromAxisAngle(it.w.axis, it.w.rate * dt);
      it.q.premultiply(this.q2);
      const floor = (it.spec.y ?? it.baseY ?? 0.05) + (it.def.side ?? 0.1) * 0.5;
      if (it.y <= floor && it.vy < 0) {
        if (!it.bounced && it.vy < -3) {
          // One bounce, losing most energy.
          it.bounced = true;
          it.vy = -it.vy * 0.3;
          it.vx *= 0.55;
          it.vz *= 0.55;
          it.w.rate *= 0.5;
          it.y = floor;
        } else {
          // Settle: lie on the side nearest to how it came down.
          it.y = (it.spec.y ?? 0.05) + this.restLift(it);
          it.state = "down";
          this.pose(it);
          continue;
        }
      }
      this.pose(it);
      keep.push(it);
    }
    this.active = keep;
  }
  restLift(it) {
    // Upright (its up axis still mostly up) or lying on a side.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(it.q);
    if (up.y > 0.75) {
      it.q.setFromAxisAngle(UP, Math.atan2(up.x, up.z));
      return 0;
    }
    // Lay it down: tip about the horizontal axis to exactly 90 degrees.
    const yaw = Math.atan2(up.x, up.z);
    it.q.setFromEuler(this.e.set(up.y < -0.75 ? Math.PI : Math.PI / 2, yaw, 0, "YXZ"));
    return up.y < -0.75 ? (it.def.flipLift ?? 0.75) : it.def.side ?? 0.2;
  }
}
