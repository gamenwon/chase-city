// Gold coins (game/coins.js): one instanced mesh for all of them (a thick
// gold disc with a raised star on both faces), spinning and bobbing, only
// those near the player drawn. A picked coin flies to the car and shrinks,
// with a burst of sparkles, a gold ring and a flash (bigger still for the
// coin carrier's big coin); destruction rewards pop a few coins up from the
// wreck that fly to the car. Pooled particles; gold reads by day and,
// slightly self-lit, at night.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const MAX = 260, FLY = 40, SPARK = 260, RINGS = 10;

function coinGeometry() {
  const parts = [];
  const tint = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  };
  const disc = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 20);
  disc.rotateX(Math.PI / 2); // faces along z
  parts.push(tint(disc.toNonIndexed(), 0xf2b51c));
  const rim = new THREE.TorusGeometry(0.5, 0.05, 4, 20);
  for (const z of [-0.075, 0.075]) parts.push(tint(rim.clone().translate(0, 0, z).toNonIndexed(), 0xffd84a));
  // A five-point star on each face.
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.13 : 0.3, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  parts.push(tint(star.clone().translate(0, 0, 0.07).toNonIndexed(), 0xffe98a));
  parts.push(tint(star.clone().rotateY(Math.PI).translate(0, 0, -0.07).toNonIndexed(), 0xffe98a));
  const g = mergeGeometries(parts.map((p) => {
    for (const k of Object.keys(p.attributes)) if (!["position", "normal", "color"].includes(k)) p.deleteAttribute(k);
    return p;
  }));
  g.computeVertexNormals();
  return g;
}

export class CoinRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32, emissive: 0x6a4a00, emissiveIntensity: 0.35, flatShading: true });
    this.mesh = new THREE.InstancedMesh(coinGeometry(), this.mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.fly = new THREE.InstancedMesh(this.mesh.geometry, this.mat, FLY);
    this.fly.frustumCulled = false;
    this.fly.count = 0;
    scene.add(this.fly);
    this.sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xfff3a0, toneMapped: false }), SPARK);
    this.sparks.frustumCulled = false;
    this.sparks.count = 0;
    scene.add(this.sparks);
    // Pickup flash: expanding gold rings and a bright flash ball (pooled).
    const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.rings = Array.from({ length: RINGS }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), ringMat());
      m.visible = false;
      scene.add(m);
      return { m, t: 9, dur: 0.5, size: 4, delay: 0 };
    });
    this.flashes = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.visible = false;
      scene.add(m);
      return { m, t: 9, dur: 0.3, size: 2 };
    });
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.reset();
  }
  reset() {
    this.seenIds = new WeakSet();
    this.flying = [];
    this.sparkList = [];
    this.run = null;
  }
  setNight(night) {
    this.mat.emissiveIntensity = night ? 0.9 : 0.35;
  }
  update(sim, dt, night) {
    if (sim.runNumber !== this.run) {
      this.reset();
      this.run = sim.runNumber;
    }
    this.setNight(night);
    const now = sim.elapsed, p = sim.player;
    // Coins on the map near the player.
    let n = 0;
    for (const c of sim.coins || []) {
      if (c.taken || n >= MAX) continue;
      if (Math.abs(c.x - p.x) > 85 || Math.abs(c.z - p.z) > 85) continue;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), now * 3 + c.id * 0.7);
      const bob = Math.sin(now * 2.4 + c.id) * 0.15;
      // Thrown out of the coin carrier: an arc from the van to where it lies.
      const fl = c.born != null ? (now - c.born) / 0.45 : 1;
      if (fl < 1) {
        const u = Math.max(0, fl);
        this.v.set(c.fromX + (c.x - c.fromX) * u, 2.2 + (c.y - 2.2) * u + Math.sin(Math.PI * u) * 2.2, c.fromZ + (c.z - c.fromZ) * u);
        this.q.setFromAxisAngle(this.s.set(1, 0, 0), now * 14 + c.id);
        this.m.compose(this.v, this.q, this.s.setScalar(1.3 * (c.size || 1)));
      } else this.m.compose(this.v.set(c.x, c.y + bob * (c.size ? 1.6 : 1), c.z), this.q, this.s.setScalar(1.3 * (c.size || 1)));
      this.mesh.setMatrixAt(n++, this.m);
      // A glint now and then.
      if (Math.random() < 0.004 && this.sparkList.length < SPARK) this.sparkList.push({ x: c.x + (Math.random() - 0.5) * 0.8, y: c.y + 0.3, z: c.z, vx: 0, vy: 0.6, vz: 0, life: 0.35, max: 0.35, size: 1.4 });
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    // New pickups / rewards since last frame.
    for (const f of sim.coinFx || []) {
      this.seenIds ||= new WeakSet();
      if (this.seenIds.has(f)) continue;
      this.seenIds.add(f);
      if (f.kind === "pick") {
        const big = (f.size || 1) > 1.5;
        this.flying.push({ x: f.x, y: f.y, z: f.z, t: 0, dur: big ? 0.4 : 0.28, size: f.size || 1 });
        // A bigger, brighter pickup: sparkles, a gold ring, a flash; the big
        // coin a fountain of sparkles, two rings and a big flash.
        this.burst(f.x, f.y, f.z, big ? 70 : 18, big ? 2.2 : 1.3, big ? 2.2 : 1.2);
        this.ring(f.x, f.y, f.z, big ? 9 : 3.6, big ? 0.6 : 0.4);
        if (big) this.ring(f.x, f.y + 0.4, f.z, 6, 0.45, 0.12);
        this.flash(f.x, f.y, f.z, big ? 4.2 : 1.6);
      } else {
        // A reward: a little fountain of coins from the wreck to the car.
        const k = Math.min(6, 2 + Math.floor(f.value / 3));
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2;
          this.flying.push({ x: f.x + Math.cos(a) * 0.8, y: 1.5, z: f.z + Math.sin(a) * 0.8, t: -i * 0.06, dur: 0.75, arc: 4 });
        }
        this.burst(f.x, 1.5, f.z, 14);
      }
    }
    // Coins flying to the car.
    let nf = 0;
    this.flying = this.flying.filter((c) => (c.t += dt) < c.dur);
    for (const c of this.flying) {
      if (nf >= FLY) break;
      const t = Math.max(0, c.t / c.dur), e = t * t;
      const x = c.x + (p.x - c.x) * e, z = c.z + (p.z - c.z) * e;
      const y = c.y + ((p.y || 0) + 1.2 - c.y) * e + (c.arc || 1) * Math.sin(t * Math.PI);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), now * 12);
      this.m.compose(this.v.set(x, y, z), this.q, this.s.setScalar(1.3 * (c.size || 1) * (1 - 0.6 * t)));
      this.fly.setMatrixAt(nf++, this.m);
    }
    this.fly.count = nf;
    this.fly.instanceMatrix.needsUpdate = true;
    // Sparkles.
    let ns = 0;
    this.sparkList = this.sparkList.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparkList) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= 3 * dt;
      const k = (s.life / s.max) * s.size;
      this.e.set(now * 5, now * 3, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(s.x, s.y, s.z), this.q, this.s.setScalar(k));
      this.sparks.setMatrixAt(ns++, this.m);
    }
    this.sparks.count = ns;
    this.sparks.instanceMatrix.needsUpdate = true;
    for (const r of this.rings) {
      if (r.t >= r.dur + r.delay) {
        r.m.visible = false;
        continue;
      }
      r.t += dt;
      const k = (r.t - r.delay) / r.dur;
      r.m.visible = k > 0 && k < 1;
      const e = 1 - (1 - Math.max(0, k)) ** 2;
      r.m.scale.setScalar(0.5 + r.size * e);
      r.m.material.opacity = 0.95 * (1 - Math.max(0, k));
      // (Lying flat, a little tilted toward the camera.)
      r.m.rotation.set(-Math.PI / 2 + 0.35, 0, 0);
    }
    for (const f of this.flashes) {
      if (f.t >= f.dur) {
        f.m.visible = false;
        continue;
      }
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.m.visible = true;
      f.m.scale.setScalar(f.size * (0.4 + 0.6 * k));
      f.m.material.opacity = 0.9 * (1 - k);
    }
  }
  ring(x, y, z, size, dur, delay = 0) {
    const r = this.rings.find((q) => q.t >= q.dur + q.delay) || this.rings[0];
    Object.assign(r, { t: 0, dur, size, delay });
    r.m.position.set(x, y, z);
  }
  flash(x, y, z, size) {
    const f = this.flashes.find((q) => q.t >= q.dur) || this.flashes[0];
    Object.assign(f, { t: 0, size });
    f.m.position.set(x, y, z);
  }
  burst(x, y, z, n, speed = 1, size = 1) {
    for (let i = 0; i < n && this.sparkList.length < SPARK; i++) {
      const a = Math.random() * Math.PI * 2, sp = (1.5 + Math.random() * 2.5) * speed;
      const life = 0.45 + Math.random() * 0.35 * speed;
      this.sparkList.push({ x, y, z, vx: Math.cos(a) * sp, vy: (1.5 + Math.random() * 2.5) * speed, vz: Math.sin(a) * sp, life, max: life, size });
    }
  }
}
