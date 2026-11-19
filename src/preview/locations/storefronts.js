// Ground-floor storefront damage. Every street-facing shopfront has a
// striped awning and is breakable; about a quarter of them can catch fire
// after a severe hit. A car that slams into one
// shatters the glass (dark interior, jagged shards left in the frame,
// glass and frame bits sprayed over the pavement), tears the awning down,
// knocks the shop sign down (hanging from one end, or flat on the
// pavement), bends the door off. Upper floors and the building
// itself are never touched. Broken shopfronts stay until restart.
//
// The overlay pieces sit just in front of the game's own facade (the
// buildings are not rebuilt) and are drawn instanced: three draw calls in
// all, however many shops are broken.
import * as THREE from "three";
import { K } from "../../render/kit.js";
import { C, B, G, pieceGeometry, bakedMaterial } from "./parts.js";

const BASE = 0.4;
const SHOP_COLORS = [K.red, K.blue, K.green, K.yellow, K.orange];
const WALLS = [K.red, K.blue, K.yellow, K.green, K.orange, K.brick, K.cream, K.teal, K.amber];
const CAP = 200;

// Overlay in face-local space (x along the face, z out of it, y up), for a
// 7 m face (every game building is 7 x 7) whose wall is at z = 3.5.
function brokenFront(g) {
  const z = 3.5;
  B(g, 5.8, 2.2, 0.02, 0x141316, -0.3, BASE + 0.5, z + 0.1); // dark interior
  // Jagged glass left in the frame (top and bottom edges).
  for (let i = 0; i < 9; i++) {
    const x = -3.0 + i * 0.66;
    const top = B(g, 0.5, 0.25 + (i % 3) * 0.12, 0.02, C.glass, x, BASE + 2.45 - (i % 3) * 0.12, z + 0.12, 0);
    top.rotation.z = (i % 2 ? 1 : -1) * 0.5;
    const bot = B(g, 0.4, 0.2 + (i % 2) * 0.15, 0.02, C.glass, x + 0.2, BASE + 0.52, z + 0.12, 0);
    bot.rotation.z = (i % 2 ? -1 : 1) * 0.6;
  }
  // Bent mullions and a door hanging off its frame.
  for (const [x, r] of [[-1.6, 0.25], [0.9, -0.35]]) {
    const m = B(g, 0.08, 2.2, 0.06, K.trim, x, BASE + 0.5, z + 0.14);
    m.rotation.z = r;
  }
  const door = B(g, 0.9, 2.2, 0.04, 0x2a292e, 2.6, BASE + 0.35, z + 0.4, 0.9);
  door.rotation.z = 0.12;
  // Glass and frame bits on the pavement in front.
  for (let i = 0; i < 16; i++) {
    B(g, 0.25 + (i % 3) * 0.1, 0.02, 0.18, i % 4 ? C.glass : K.trim, -3 + ((i * 37) % 60) / 10, 0.37, z + 0.4 + ((i * 23) % 14) / 10, i);
  }
}
// Awning over the shop window: sloping striped canvas on a frame, 0.6 m
// deep (street props stand 0.7 m out, so it never touches them). White and
// pale stripes, tinted per shop by the instance colour.
function awning(g) {
  const z = 3.5;
  const a = G(g, -0.3, BASE + 2.62, z + 0.04);
  a.rotation.x = 0.42;
  for (let i = 0; i < 10; i++) B(a, 0.58, 0.05, 0.62, i % 2 ? 0xffffff : 0xb9b9b9, -2.61 + i * 0.58, 0, 0);
  // Scalloped valance along the front edge.
  for (let i = 0; i < 10; i++) B(a, 0.56, 0.2, 0.03, i % 2 ? 0xb9b9b9 : 0xffffff, -2.61 + i * 0.58, -0.2, 0.31);
  for (const s of [-1, 1]) {
    const arm = B(g, 0.04, 0.04, 0.62, 0x6b6e75, -0.3 + s * 2.85, BASE + 2.42, z + 0.33);
    arm.rotation.x = 0.42;
  }
}
// The awning torn down: hanging from one bracket to the pavement, the
// canvas ripped in two, the frame bent, scraps blown out on the pavement.
function tornAwning(g) {
  const z = 3.5;
  const h = G(g, -3.1, BASE + 2.62, z + 0.1);
  h.rotation.set(0.25, 0.15, -0.62);
  for (let i = 0; i < 6; i++) B(h, 0.58, 0.05, 0.62, i % 2 ? 0xffffff : 0xb9b9b9, 0.3 + i * 0.58, 0, 0);
  const d = G(g, 0.9, 0.42, z + 1.0);
  d.rotation.set(-0.2, 0.35, 0.08);
  for (let i = 0; i < 4; i++) B(d, 0.58, 0.05, 0.62, i % 2 ? 0xb9b9b9 : 0xffffff, i * 0.58, 0, 0);
  for (let i = 0; i < 5; i++) {
    const s = B(g, 0.5, 0.03, 0.4, i % 2 ? 0xffffff : 0xb9b9b9, -2 + i * 1.1, 0.4, z + 1.6 + (i % 3) * 0.6);
    s.rotation.y = i * 0.8;
  }
  const arm = B(g, 0.05, 0.05, 1.1, 0x6b6e75, 2.6, 0.42, z + 0.9);
  arm.rotation.y = 0.6;
}
// Debris thrown out over the pavement and into the gutter (clearly visible
// from the chase camera above): glass, frame bits, shelves and goods.
function spray(g) {
  const z = 3.5;
  for (let i = 0; i < 40; i++) {
    const x = -3.6 + ((i * 37) % 72) / 10, out = 0.5 + ((i * 23) % 47) / 10;
    const c = [C.glass, 0xdfeaf0, K.trim, C.glass, 0xffd34a, 0x3fa0e0][i % 6];
    const s = B(g, 0.4 + (i % 3) * 0.16, 0.05, 0.3 + (i % 2) * 0.14, c, x, out > 1.7 ? 0.02 : 0.37, z + out, i * 0.7);
    s.rotation.z = (i % 2 ? 0.1 : -0.1);
  }
  // A shelf unit and boxes knocked out on the pavement.
  const shelf = B(g, 1.6, 0.35, 0.6, 0x8a6a4a, 1.6, 0.37, z + 1.3, 0.5);
  shelf.rotation.z = 0.08;
  for (const [x, o, c] of [[-1.2, 1.9, 0xe0c080], [-0.6, 2.4, 0xd05a3a], [0.3, 1.6, 0x5ab04a]]) B(g, 0.4, 0.35, 0.4, c, x, 0.37, z + o, x);
}
function signDown(g) {
  // The sign band fallen flat on the pavement in front of the shop.
  const s = G(g, -0.2, 0.42, 3.5 + 1.2);
  s.rotation.set(-1.45, 0.12, 0.05);
  B(s, 6.4, 0.5, 0.08, 0xffffff, 0, 0, 0);
}
function wallPatch(g) {
  // Covers the intact sign band (painted in the wall colour).
  B(g, 6.7, 0.62, 0.02, 0xffffff, 0, BASE + 2.69, 3.5 + 0.13);
}
function fallenSign(g) {
  // The sign band hanging from its left end, tilted down to the right.
  const s = G(g, -3.3, BASE + 3.0, 3.5 + 0.22);
  s.rotation.z = -0.42;
  B(s, 6.6, 0.5, 0.08, 0xffffff, 3.3, -0.25, 0);
}
function scorch(g) {
  // Soot above the window and smoke-blackened lintel (burnt shops).
  // Streaks of soot licking up from the window top, two shades.
  for (let i = 0; i < 6; i++) {
    const h = 0.5 + ((i * 5) % 4) * 0.25;
    const s = B(g, 0.35 + (i % 2) * 0.2, h, 0.02, i % 2 ? 0x2a2628 : 0x3d3639, -2.4 + i * 0.9, BASE + 2.45, 3.5 + 0.145);
    s.rotation.z = (i % 2 ? 1 : -1) * 0.12;
  }
  B(g, 5.6, 0.12, 0.02, 0x2a2628, -0.3, BASE + 2.62, 3.5 + 0.15);
}

export class Storefronts {
  constructor(scene, buildings, hooks = {}) {
    this.hooks = hooks;
    this.faces = [];
    for (const b of buildings) {
      const cx = Math.round((b.x - 15) / 30) * 30 + 15, cz = Math.round((b.z - 15) / 30) * 30 + 15;
      const seed = Math.abs(Math.round(b.x * 7 + b.z * 13 + b.h * 3));
      const out = [Math.sign(b.x - cx), Math.sign(b.z - cz)];
      [
        { ry: 0, street: out[1] > 0 },
        { ry: Math.PI, street: out[1] < 0 },
        { ry: Math.PI / 2, street: out[0] > 0 },
        { ry: -Math.PI / 2, street: out[0] < 0 },
      ].forEach((f, k) => {
        if (!f.street) return;
        this.faces.push({
          b, ry: f.ry, nx: Math.sin(f.ry), nz: Math.cos(f.ry),
          sign: SHOP_COLORS[(seed + k) % SHOP_COLORS.length],
          wall: WALLS[seed % WALLS.length],
          burns: (seed + k) % 4 === 0,
        });
      });
    }
    const mk = (build, tinted) => {
      const m = new THREE.InstancedMesh(pieceGeometry(build), bakedMaterial, CAP);
      if (tinted) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    this.front = mk(brokenFront);
    this.patch = mk(wallPatch, true);
    this.signs = mk(fallenSign, true);
    this.signsDown = mk(signDown, true);
    this.soot = mk(scorch);
    this.torn = mk(tornAwning, true);
    this.spray = mk(spray);
    // Intact awnings: one instance per shop, hidden (zero scale) once torn.
    const cap = Math.max(CAP, this.faces.length);
    this.awnings = new THREE.InstancedMesh(pieceGeometry(awning), bakedMaterial, cap);
    this.awnings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.awnings.frustumCulled = false;
    this.awnings.receiveShadow = this.awnings.castShadow = true;
    scene.add(this.awnings);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.c = new THREE.Color();
    this.reset();
  }
  reset() {
    for (const f of this.faces) f.broken = false;
    for (const m of [this.front, this.patch, this.signs, this.signsDown, this.soot, this.torn, this.spray]) {
      m.count = 0;
      m.visible = false;
    }
    this.faces.forEach((f, i) => {
      f.index = i;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.ry);
      this.m.compose(this.v.set(f.b.x, 0, f.b.z), this.q, this.s.set(1, 1, 1));
      this.awnings.setMatrixAt(i, this.m);
      this.awnings.setColorAt(i, this.c.setHex(f.sign));
    });
    this.awnings.count = this.faces.length;
    this.awnings.instanceMatrix.needsUpdate = true;
    this.awnings.instanceColor.needsUpdate = true;
    this.stats = { broken: 0, burning: 0 };
  }
  place(mesh, f, color) {
    const i = mesh.count++;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.ry);
    this.m.compose(this.v.set(f.b.x, 0, f.b.z), this.q, this.s);
    mesh.setMatrixAt(i, this.m);
    mesh.instanceMatrix.needsUpdate = true;
    if (color != null) {
      mesh.setColorAt(i, this.c.setHex(color));
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.visible = true;
  }
  // A car near a breakable shopfront, driving into it hard enough.
  touch(sim, car, radius) {
    for (const f of this.faces) {
      if (f.broken) continue;
      const dx = car.x - f.b.x, dz = car.z - f.b.z;
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
      const out = dx * f.nx + dz * f.nz; // distance from the centre along the normal
      const side = dx * f.nz - dz * f.nx; // along the face
      if (out < 3.5 || out > 3.5 + radius + 0.4 || Math.abs(side) > 3.4) continue;
      const closing = -((car.vx || 0) * f.nx + (car.vz || 0) * f.nz);
      if (closing < 6) continue;
      this.breakFace(sim, f, closing);
    }
  }
  breakFace(sim, f, speed) {
    if (this.front.count >= CAP) return;
    f.broken = true;
    this.stats.broken++;
    this.place(this.front, f);
    this.place(this.patch, f, f.wall);
    // The sign hangs from one end on some shops, lies on the pavement on
    // the others; the awning comes down; debris sprays out.
    this.place(f.index % 2 ? this.signsDown : this.signs, f, f.sign);
    this.place(this.torn, f, f.sign);
    this.place(this.spray, f);
    this.m.makeScale(0, 0, 0);
    this.awnings.setMatrixAt(f.index, this.m);
    this.awnings.instanceMatrix.needsUpdate = true;
    const wx = f.b.x + f.nx * 3.7, wz = f.b.z + f.nz * 3.7;
    sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: wx, z: wz, strength: 15 });
    this.hooks.glass?.(wx, wz, f.nx, f.nz);
    // A designated shop catches fire after a severe hit.
    if (f.burns && speed >= 12) {
      this.place(this.soot, f);
      this.stats.burning++;
      this.hooks.fire?.(wx, wz, f.nx, f.nz);
    }
  }
}
