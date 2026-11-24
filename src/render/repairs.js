// Repair toolboxes (game/repairs.js) and the player car's damage effects.
//
// Toolbox: a red cartoon toolbox with a handle and a white wrench badge on
// both sides, floating and turning; picked up: it pops with green sparks
// (and a rising chime, sound.js).
// Damage (by durability): 60-31 % now and then a light puff from the bonnet;
// 30-11 % steady grey engine smoke; 10-1 % thick dark smoke and flames.
// The smoke drifts back from the car (away from the road ahead) and stays
// thin enough to see the car through. Pooled instanced meshes.
import * as THREE from "three";
import { pieceGeometry, B } from "../preview/locations/parts.js";

function toolbox(g) {
  B(g, 0.95, 0.5, 0.48, 0xd62f2a, 0, -0.25, 0);
  B(g, 0.97, 0.12, 0.5, 0x9e2420, 0, 0.22, 0);
  B(g, 0.08, 0.22, 0.08, 0x8a8d94, -0.28, 0.32, 0);
  B(g, 0.08, 0.22, 0.08, 0x8a8d94, 0.28, 0.32, 0);
  B(g, 0.64, 0.08, 0.1, 0x8a8d94, 0, 0.52, 0);
  B(g, 0.16, 0.1, 0.52, 0xf5c01a, 0, -0.02, 0); // latch
  for (const s of [-1, 1]) {
    B(g, 0.5, 0.3, 0.02, 0xf4f4f0, 0, -0.2, s * 0.25);
    const w = B(g, 0.36, 0.07, 0.03, 0x2a292e, 0, -0.09, s * 0.26);
    w.rotation.z = 0.7;
    const h = B(g, 0.12, 0.12, 0.03, 0x2a292e, 0.13, -0.02, s * 0.26);
    h.rotation.z = 0.7;
  }
}

export class RepairRenderer {
  constructor(scene) {
    this.box = new THREE.InstancedMesh(pieceGeometry(toolbox), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true, emissive: 0x220000, emissiveIntensity: 0.4 }), 12);
    this.box.frustumCulled = false;
    this.box.count = 0;
    this.box.castShadow = true;
    scene.add(this.box);
    this.ring = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1.15, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.55, depthWrite: false }), 12);
    this.ring.frustumCulled = false;
    this.ring.count = 0;
    scene.add(this.ring);
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ toneMapped: false }), 120);
    this.parts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(360), 3);
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    scene.add(this.parts);
    // Player damage: smoke puffs and flame cones.
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }), 24);
    this.smoke.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(72), 3);
    this.smoke.frustumCulled = false;
    this.smoke.count = 0;
    scene.add(this.smoke);
    const fg = new THREE.ConeGeometry(0.32, 1.0, 6);
    fg.translate(0, 0.5, 0);
    this.flames = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }), 3);
    this.flames.frustumCulled = false;
    this.flames.count = 0;
    scene.add(this.flames);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.reset();
  }
  reset() {
    this.list = [];
    this.puffs = [];
    this.seen = new WeakSet();
    this.nextPuff = 0;
    this.run = null;
  }
  update(sim, dt) {
    if (sim.runNumber !== this.run) {
      this.reset();
      this.run = sim.runNumber;
    }
    const now = sim.elapsed, p = sim.player;
    // Toolboxes.
    let n = 0;
    for (const r of sim.repairs || []) {
      if (r.taken) continue;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), now * 1.6 + r.id);
      this.m.compose(this.v.set(r.x, r.y + Math.sin(now * 2 + r.id) * 0.25 + 0.6, r.z), this.q, this.s.setScalar(2.1));
      this.box.setMatrixAt(n, this.m);
      const k = 1 + 0.15 * Math.sin(now * 3 + r.id);
      this.m.compose(this.v.set(r.x, 0.08, r.z), this.q.identity(), this.s.set(1.6 * k, 1, 1.6 * k));
      this.ring.setMatrixAt(n++, this.m);
    }
    this.box.count = this.ring.count = n;
    this.box.instanceMatrix.needsUpdate = this.ring.instanceMatrix.needsUpdate = true;
    for (const f of sim.repairFx || []) {
      if (this.seen.has(f)) continue;
      this.seen.add(f);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        this.list.push({ x: f.x, y: 1.2, z: f.z, vx: Math.cos(a) * 4.5, vy: 4 + (i % 3), vz: Math.sin(a) * 4.5, life: 0.9, color: i % 2 ? 0x4cd964 : 0xffffff });
      }
    }
    // Damage smoke and flames from the bonnet.
    const hp = sim.health ?? 100;
    if (!sim.result && hp <= 60) {
      const rate = hp > 30 ? 0.7 : hp > 10 ? 0.18 : 0.09;
      if (now >= this.nextPuff || now < this.nextPuff - 2) {
        this.nextPuff = now + rate * (0.7 + Math.random() * 0.6);
        const fx = -Math.sin(p.angle), fz = -Math.cos(p.angle);
        this.puffs.push({ x: p.x + fx * 1.2, y: (p.y || 0) + 1.2, z: p.z + fz * 1.2, vx: -(p.vx || 0) * 0.45, vz: -(p.vz || 0) * 0.45, born: now, dark: hp <= 10 ? 0x26262a : hp <= 30 ? 0x55585c : 0xa8acb0, size: hp <= 10 ? 2.4 : hp <= 30 ? 1.9 : 1.5 });
        if (this.puffs.length > 24) this.puffs.shift();
      }
    }
    let ns = 0;
    this.puffs = this.puffs.filter((q) => now - q.born < 1.6);
    for (const q of this.puffs) {
      const a = (now - q.born) / 1.6;
      q.x += q.vx * dt;
      q.z += q.vz * dt;
      q.y += 1.6 * dt;
      this.m.compose(this.v.set(q.x, q.y, q.z), this.q.identity(), this.s.setScalar(q.size * (0.5 + a)));
      this.smoke.setMatrixAt(ns, this.m);
      this.smoke.setColorAt(ns++, this.c.setHex(q.dark));
    }
    this.smoke.count = ns;
    this.smoke.instanceMatrix.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    let nf = 0;
    if (!sim.result && hp <= 10 && hp > 0) {
      const fx = -Math.sin(p.angle), fz = -Math.cos(p.angle), rx = Math.cos(p.angle), rz = -Math.sin(p.angle);
      for (const [lx, lz] of [[0, 1.15], [0.35, 0.9], [-0.35, 0.95]]) {
        const f = 0.75 + 0.25 * Math.sin(now * 19 + lx * 7);
        this.m.compose(this.v.set(p.x + fx * lz + rx * lx, (p.y || 0) + 0.95, p.z + fz * lz + rz * lx), this.q.identity(), this.s.set(1.6, f * 2.0, 1.6));
        this.flames.setMatrixAt(nf++, this.m);
      }
    }
    this.flames.count = nf;
    this.flames.instanceMatrix.needsUpdate = true;
    // Pickup sparks.
    let np = 0;
    this.list = this.list.filter((q) => (q.life -= dt) > 0);
    for (const q of this.list) {
      q.vy -= 6 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      this.m.compose(this.v.set(q.x, q.y, q.z), this.q.identity(), this.s.setScalar(Math.min(1, q.life * 2)));
      this.parts.setMatrixAt(np, this.m);
      this.parts.setColorAt(np++, this.c.setHex(q.color));
    }
    this.parts.count = np;
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }
}
