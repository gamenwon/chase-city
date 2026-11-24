import * as THREE from "three";
import { civilianCarGeometry } from "./kit.js";
import { carStage } from "../game/city.js";

// Civilian car damage drawing (casual destruction pass).
const SMOKE_MAX = 110, FLAME_MAX = 72;
// Smoke tint per stage: 1 light, 2 medium, 3 heavy (burning), 4 wreck, 5 burned out.
const SMOKE_TINT = [0, 0xb7bcbe, 0x6e7173, 0x3d3f42, 0x2a2b2e, 0x4a4b4d];
// Flame spots along the car (forward = engine bay), lit in this order as
// the fire spreads.
const FIRE_SPOTS = [[0, 1.35, 0.55], [0.35, 0.7, 0.75], [-0.35, 0.9, 0.7], [0, -0.1, 1.05], [0.3, -0.95, 0.8], [-0.3, -1.4, 0.65]];

// V1.9 city life renderer. Everything is instanced (one draw call per part
// type), nothing casts shadows, and props are only re-uploaded when they
// change, so it stays cheap on phones. Same flat low-poly style as the rest
// of the city.

// Approved art direction: dark poles with warm heads, faceted trees in
// three greens, bright signs. Canopies stay inside the old footprints so no
// prop reaches a wall or another prop.
const PROP_PARTS = {
  trash: [
    { geo: "box", size: [0.62, 0.8, 0.62], at: [0, 0.4, 0], color: 0x2f8a4c },
    { geo: "box", size: [0.7, 0.1, 0.7], at: [0, 0.85, 0], color: 0x1f5a34 },
    { geo: "box", size: [0.3, 0.04, 0.64], at: [0, 0.91, 0], color: 0x2a292e },
  ],
  sign: [
    { geo: "box", size: [0.1, 2.4, 0.1], at: [0, 1.2, 0], color: 0x55535c },
    { geo: "box", size: [0.9, 0.9, 0.08], at: [0, 2.3, 0], color: 0x2457c5 },
    { geo: "box", size: [0.5, 0.12, 0.09], at: [0, 2.3, 0], color: 0xf4f4f0 },
  ],
  lamp: [
    { geo: "box", size: [0.26, 0.4, 0.26], at: [0, 0.2, 0], color: 0x2a292e },
    { geo: "box", size: [0.14, 4.4, 0.14], at: [0, 2.2, 0], color: 0x2a292e },
    { geo: "box", size: [0.12, 0.1, 1.2], at: [0, 4.35, 0.55], color: 0x2a292e },
    { geo: "box", size: [0.42, 0.16, 0.5], at: [0, 4.3, 1.1], color: 0xffe08a, emissive: 0xffc850 },
  ],
  hydrant: [
    { geo: "box", size: [0.42, 0.08, 0.42], at: [0, 0.04, 0], color: 0x9a1c18 },
    { geo: "box", size: [0.3, 0.62, 0.3], at: [0, 0.39, 0], color: 0xd62f2a },
    { geo: "box", size: [0.36, 0.08, 0.36], at: [0, 0.72, 0], color: 0xb92420 },
    { geo: "box", size: [0.22, 0.14, 0.22], at: [0, 0.83, 0], color: 0xd62f2a },
    { geo: "box", size: [0.56, 0.11, 0.11], at: [0, 0.5, 0], color: 0xf5c01a },
    { geo: "box", size: [0.11, 0.11, 0.2], at: [0, 0.5, 0.18], color: 0xf5c01a },
  ],
  tree: [
    { geo: "box", size: [0.3, 1.6, 0.3], at: [0, 0.8, 0], color: 0x7a4a2a },
    { geo: "ico", size: [1.15, 1.4, 1.15], at: [0, 2.3, 0], color: 0x3da04a },
    { geo: "ico", size: [0.7, 0.8, 0.7], at: [0, 3.35, 0], color: 0x5cb23a },
  ],
  bigTree: [
    { geo: "box", size: [0.55, 2.2, 0.55], at: [0, 1.1, 0], color: 0x6b3f22 },
    { geo: "ico", size: [1.8, 2.25, 1.8], at: [0, 3.2, 0], color: 0x2e8b3e },
    { geo: "ico", size: [1.1, 1.3, 1.1], at: [0, 4.9, 0], color: 0x3da04a },
  ],
};
const SHIRTS = [0xe8473b, 0x2f6fd8, 0xf2b636, 0x3aa776, 0x9b59d0, 0xf07fb0];
const SKIN = [0xf1c8a0, 0xc68a5a, 0x7d4f2f];
const CAR_COLORS = [0x2457c5, 0xf4f4f0, 0xd62f2a, 0x3a3940, 0x2fa36b, 0xf5c01a, 0xf0781e, 0x1f6e6a];

function geometry(kind) {
  if (kind === "cyl") return new THREE.CylinderGeometry(0.5, 0.45, 1, 8);
  if (kind === "ico") return new THREE.IcosahedronGeometry(1, 0);
  return new THREE.BoxGeometry(1, 1, 1);
}

export class CityLifeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.ready = false;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.part = new THREE.Matrix4();
    this.base = new THREE.Matrix4();
  }
  material(color, extra = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      flatShading: true,
      ...extra,
    });
  }
  instanced(geo, mat, count) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = count;
    this.scene.add(mesh);
    return mesh;
  }
  build(city) {
    this.city = city;
    // Props: one instanced mesh per (kind, part).
    this.propMeshes = [];
    for (const [kind, parts] of Object.entries(PROP_PARTS)) {
      const props = city.props.filter((p) => p.kind === kind);
      if (!props.length) continue;
      const meshes = parts.map((part) => ({
        part,
        mesh: this.instanced(
          geometry(part.geo),
          this.material(part.color, part.emissive ? { emissive: part.emissive, emissiveIntensity: 0.6 } : {}),
          props.length,
        ),
      }));
      this.propMeshes.push({ kind, props, meshes });
      props.forEach((p) => (p.dirty = true));
    }
    // Litter: small flat scraps, persistent.
    this.litterMesh = this.instanced(
      new THREE.BoxGeometry(0.3, 0.03, 0.2),
      this.material(0xffffff),
      300,
    );
    this.litterMesh.count = 0;
    this.litterShown = 0;
    // Pedestrians: torso, head, two legs, two arms.
    const P = 24;
    this.pedMeshes = {
      torso: this.instanced(
        new THREE.BoxGeometry(0.42, 0.62, 0.26),
        this.material(0xffffff),
        P,
      ),
      head: this.instanced(
        new THREE.BoxGeometry(0.26, 0.28, 0.26),
        this.material(0xffffff),
        P,
      ),
      legs: this.instanced(
        new THREE.BoxGeometry(0.15, 0.7, 0.17),
        this.material(0x223040),
        P * 2,
      ),
      arms: this.instanced(
        new THREE.BoxGeometry(0.12, 0.55, 0.13),
        this.material(0xffffff),
        P * 2,
      ),
    };
    // Civilian cars (moving, parked, wrecked) in one draw call.
    this.carMesh = this.instanced(
      civilianCarGeometry(),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.6,
        flatShading: true,
      }),
      40,
    );
    this.carMesh.count = 0;
    // Impact particles: leaves, sparks, dust, rubbish.
    this.particles = [];
    this.particleMesh = this.instanced(
      new THREE.BoxGeometry(0.16, 0.16, 0.16),
      this.material(0xffffff),
      140,
    );
    this.particleMesh.count = 0;
    // Damage smoke (tinted per car stage) and engine fire (casual pass):
    // two cone layers, an orange body and a yellow core, flickering.
    this.smokeMesh = this.instanced(
      new THREE.IcosahedronGeometry(0.5, 0),
      this.material(0xffffff, { transparent: true, opacity: 0.6, depthWrite: false }),
      SMOKE_MAX,
    );
    this.smokeMesh.count = 0;
    const flameGeo = new THREE.ConeGeometry(0.55, 1.7, 6);
    flameGeo.translate(0, 0.85, 0);
    this.flameMesh = this.instanced(
      flameGeo,
      new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false }),
      FLAME_MAX,
    );
    this.flameMesh.count = 0;
    this.coreMesh = this.instanced(
      flameGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
      FLAME_MAX,
    );
    this.coreMesh.count = 0;
    this.coreMesh.renderOrder = 2;
    this.lastEvent = 0;
    this.color = new THREE.Color();
    this.ready = true;
  }
  // Prop pose: standing (with a wobble), falling over its base in fallDir,
  // or tumbling through the air (trash).
  propMatrix(p, out) {
    let tilt =
      p.state === "stand" ? Math.sin(p.wobble * 18) * p.wobble * 0.25 : 0;
    if (p.state === "falling" || p.state === "down")
      tilt = (p.kind === "trash" ? 1 : 0.98) * (Math.PI / 2) * easeOut(p.fall);
    if (p.state === "tumble")
      tilt = p.fall * Math.PI * 2 * (p.spin > 0 ? 1 : -1);
    if (p.state === "down" && (p.kind === "trash" || p.kind === "hydrant")) tilt = Math.PI / 2;
    // Rotate about X (toward +z), then yaw so +z points along fallDir.
    this.e.set(tilt, p.state === "stand" ? p.angle : p.fallDir, 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.v.set(
      p.x,
      p.y + (p.state === "down" && p.kind === "trash" ? 0.45 : p.state === "down" && p.kind === "hydrant" ? 0.2 : 0),
      p.z,
    );
    this.s.set(1, 1, 1);
    out.compose(this.v, this.q, this.s);
  }
  update(city, sim, camera, dt, kick) {
    if (!city) return;
    if (!this.ready || this.city !== city) {
      if (this.ready) this.dispose();
      this.build(city);
    }
    // Props (only changed ones are re-uploaded).
    for (const group of this.propMeshes) {
      let changed = false;
      group.props.forEach((p, i) => {
        if (!p.dirty) return;
        changed = true;
        this.propMatrix(p, this.base);
        for (const { part, mesh } of group.meshes) {
          this.part.compose(
            this.v.set(...part.at),
            this.q.identity(),
            this.s.set(...part.size),
          );
          this.m.multiplyMatrices(this.base, this.part);
          mesh.setMatrixAt(i, this.m);
        }
      });
      if (changed)
        for (const { mesh } of group.meshes)
          mesh.instanceMatrix.needsUpdate = true;
    }
    for (const g of this.propMeshes) for (const p of g.props) p.dirty = false;
    // Litter (append only).
    const litter = city.litter;
    if (litter.length !== this.litterShown) {
      litter.forEach((l, i) => {
        this.e.set(0, l.angle, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(l.x, 0.17, l.z), this.q, this.s.set(1, 1, 1));
        this.litterMesh.setMatrixAt(i, this.m);
        this.litterMesh.setColorAt(
          i,
          this.color.set([0xf2efe4, 0x9fc6e8, 0xd9b48f, 0x8a9c6b][l.color]),
        );
      });
      this.litterMesh.count = litter.length;
      this.litterMesh.instanceMatrix.needsUpdate = true;
      if (this.litterMesh.instanceColor)
        this.litterMesh.instanceColor.needsUpdate = true;
      this.litterShown = litter.length;
    }
    this.updatePeds(city, sim);
    this.updateCars(city, sim);
    this.updateEvents(city, sim, kick);
    this.updateParticles(dt);
  }
  updatePeds(city, sim) {
    const M = this.pedMeshes;
    let n = 0;
    // Colours only go to the GPU when the set of people changes.
    const key = city.pedestrians.map((q) => q.id).join(",");
    const recolor = key !== this.pedKey;
    this.pedKey = key;
    for (const q of city.pedestrians) {
      if (n >= 24) break;
      const running =
        q.state === "flee" || q.state === "dive" || q.state === "recover";
      const speed = running ? 14 : 8;
      const swing = Math.sin(q.phase * speed) * (running ? 0.9 : 0.45);
      const dive = q.state === "dive" ? 1 : 0;
      this.e.set(dive * 1.1, q.heading, 0, "YXZ");
      this.q.setFromEuler(this.e);
      // A little larger than life so people read on a phone screen.
      this.base.compose(
        this.v.set(q.x, 0.12 + dive * 0.25, q.z),
        this.q,
        this.s.setScalar(1.3),
      );
      const put = (mesh, i, x, y, z, rx, color) => {
        this.part.compose(
          this.v.set(x, y, z),
          this.q.setFromEuler(this.e.set(rx, 0, 0)),
          this.s.set(1, 1, 1),
        );
        this.m.multiplyMatrices(this.base, this.part);
        mesh.setMatrixAt(i, this.m);
        if (recolor && color !== undefined)
          mesh.setColorAt(i, this.color.set(color));
      };
      put(M.torso, n, 0, 1.08, 0, 0, SHIRTS[q.color]);
      put(M.head, n, 0, 1.55, 0, 0, SKIN[q.skin]);
      // Pivot legs/arms near the hip/shoulder by offsetting half their length.
      put(M.legs, n * 2, -0.11, 0.42 + 0.0, 0, swing);
      put(M.legs, n * 2 + 1, 0.11, 0.42, 0, -swing);
      const armUp = running ? 0.4 : 0;
      put(M.arms, n * 2, -0.29, 1.1, 0, -swing * 0.8 - armUp, SHIRTS[q.color]);
      put(
        M.arms,
        n * 2 + 1,
        0.29,
        1.1,
        0,
        swing * 0.8 - armUp,
        SHIRTS[q.color],
      );
      n++;
    }
    M.torso.count = n;
    M.head.count = n;
    M.legs.count = n * 2;
    M.arms.count = n * 2;
    if (!n && !this.pedCount) return;
    this.pedCount = n;
    for (const mesh of Object.values(M)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (recolor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  updateCars(city, sim) {
    let n = 0,
      smoke = 0,
      flames = 0;
    const key = city.traffic
      .map((t) => `${t.id}${carStage(t)}`)
      .join(",");
    const recolor = key !== this.carKey;
    this.carKey = key;
    const now = sim.elapsed, p = sim.player;
    for (const t of city.traffic) {
      if (n >= 40) break;
      const stage = carStage(t);
      const wreck = t.state === "wreck";
      // A car that just went up hops and rolls a little.
      const pop = t.pop != null ? Math.max(0, 1 - (now - t.pop) / 0.7) : 0;
      let hop = pop > 0 ? Math.sin((1 - pop) * Math.PI) * 1.6 : 0;
      // Casual pass: flipped by a big hit or a blast: up in the air, a
      // roll (a wreck lands on its roof and stays so; a live car rolls all
      // the way round and drives on).
      let roll = (t.burned ? 0.1 : 0) + pop * 0.6;
      if (t.flip) {
        const ft = Math.min(1, (now - t.flip.at) / 0.9);
        const full = t.state === "wreck" ? Math.PI : Math.PI * 2;
        const a = full * (1 - (1 - ft) * (1 - ft));
        roll = a * (t.flip.side || 1);
        hop += Math.sin(ft * Math.PI) * t.flip.h + 1.45 * (1 - Math.cos(a)) / 2;
        if (ft >= 1 && t.state === "wreck") t.upside = true;
        if (ft >= 1) t.flip = null;
      } else if (t.upside) {
        roll = Math.PI;
        hop += 1.45;
      }
      this.e.set(wreck ? 0.12 : 0, t.angle + (t.pop != null ? 0.5 * Math.min(1, (now - t.pop) / 0.7) : 0), roll, "YXZ");
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(t.x, (t.y || 0) + hop, t.z), this.q, this.s.set(1, t.burned ? 0.9 : 1, 1));
      this.carMesh.setMatrixAt(n, this.m);
      if (recolor) {
        this.color.set(CAR_COLORS[t.color]);
        // Dented and dirty, scorched, charred.
        this.color.multiplyScalar([1, 0.9, 0.72, 0.55, 0.32, 0.16][stage]);
        this.carMesh.setColorAt(n, this.color);
      }
      n++;
      if (!stage) continue;
      // Effects only where they can be seen (near the player).
      if (Math.hypot(t.x - p.x, t.z - p.z) > 75) continue;
      const fx = -Math.sin(t.angle), fz = -Math.cos(t.angle), rx = Math.cos(t.angle), rz = -Math.sin(t.angle);
      // Light damage only smokes for a while after the hit.
      const since = now - (t.hitAt ?? -99);
      if (stage === 1 && since > 6) continue;
      // Smoke: more, darker and taller with each stage.
      const puffs = [0, 1, 2, 3, 4, 3][stage];
      const engine = stage < 4 || t.burned ? 1.3 : 0.6;
      for (let k = 0; k < puffs && smoke < SMOKE_MAX; k++) {
        const age = ((now + (t.id % 7) * 0.37) * (0.45 + stage * 0.05) + k / puffs) % 1;
        const rise = 1.2 + stage * 0.7;
        this.m.compose(
          this.v.set(t.x + fx * engine + Math.sin(age * 9 + t.id) * 0.4 + age * 0.8, 1.1 + age * rise * 2.2, t.z + fz * engine + Math.cos(age * 7 + t.id) * 0.3),
          this.q.identity(),
          this.s.setScalar((0.5 + age * (1 + stage * 0.35)) * (stage >= 3 ? 1.25 : 1)),
        );
        this.smokeMesh.setMatrixAt(smoke, this.m);
        this.smokeMesh.setColorAt(smoke++, this.color.setHex(SMOKE_TINT[stage]));
      }
      // Sparks now and then from a medium-damaged car.
      if (stage === 2 && Math.random() < 0.012) this.burst(t.x + fx * 1.4, t.z + fz * 1.4, 4, 0xffd84a, 3, 4);
      if (stage < 3) continue;
      // Fire: from the engine bay; it spreads over the car with time, is
      // biggest when the car is wrecked, and burns down to a few low
      // flames once it has exploded.
      const burnt = t.fireSince != null ? now - t.fireSince : 0;
      let spots, size;
      if (t.burned) {
        const after = now - (t.burnedAt ?? now);
        spots = after < 6 ? 6 : after < 25 ? 3 : 2;
        size = after < 6 ? 1.25 : after < 25 ? 0.85 : 0.6;
      } else if (wreck) {
        spots = Math.min(6, 2 + Math.floor(burnt / 1.2));
        size = 1.05 + (t.blowAt != null ? 0.25 : 0);
      } else {
        spots = Math.min(3, 1 + Math.floor(burnt / 2.5));
        size = 0.8;
      }
      for (let k = 0; k < spots && flames < FLAME_MAX; k++) {
        const [lx, lz, h] = FIRE_SPOTS[k];
        const f = 0.75 + 0.25 * Math.sin(now * (17 + k * 3) + t.id * 1.7) + 0.12 * Math.sin(now * 31 + k);
        const x = t.x + fx * lz + rx * lx, z = t.z + fz * lz + rz * lx, y = (t.y || 0) + hop + h;
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), now * 2 + k);
        this.m.compose(this.v.set(x, y, z), this.q, this.s.set(size * (0.9 + 0.1 * f), size * f * 1.25, size * (0.9 + 0.1 * f)));
        this.flameMesh.setMatrixAt(flames, this.m);
        this.m.compose(this.v.set(x, y, z), this.q, this.s.set(size * 0.55, size * f * 0.8, size * 0.55));
        this.coreMesh.setMatrixAt(flames++, this.m);
      }
    }
    if (n || this.carMesh.count) {
      this.carMesh.count = n;
      this.carMesh.instanceMatrix.needsUpdate = true;
      if (recolor && this.carMesh.instanceColor)
        this.carMesh.instanceColor.needsUpdate = true;
    }
    if (smoke || this.smokeMesh.count) {
      this.smokeMesh.count = smoke;
      this.smokeMesh.instanceMatrix.needsUpdate = true;
      if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    }
    if (flames || this.flameMesh.count) {
      this.flameMesh.count = this.coreMesh.count = flames;
      this.flameMesh.instanceMatrix.needsUpdate = this.coreMesh.instanceMatrix.needsUpdate = true;
    }
  }
  burst(x, z, count, color, power, lift = 4) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 140) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x,
        y: 0.6 + Math.random(),
        z,
        vx: Math.cos(a) * power * (0.4 + Math.random()),
        vz: Math.sin(a) * power * (0.4 + Math.random()),
        vy: lift * (0.5 + Math.random()),
        life: 0.7 + Math.random() * 0.5,
        color,
        spin: Math.random() * 6,
      });
    }
  }
  updateEvents(city, sim, kick) {
    for (const e of city.events) {
      if (e.id <= this.lastEvent) continue;
      this.lastEvent = e.id;
      const near = Math.hypot(e.x - sim.player.x, e.z - sim.player.z) < 45;
      if (!near) continue;
      if (e.type === "prop") {
        if (e.kind === "tree" || e.kind === "bigTree")
          this.burst(e.x, e.z, e.action === "land" ? 14 : 9, 0x3faa4a, 3, 3);
        else if (e.kind === "lamp" || e.kind === "sign")
          this.burst(e.x, e.z, 8, 0xffd84a, 5, 5);
        else if (e.kind === "trash") this.burst(e.x, e.z, 10, 0xd8d0b8, 4, 4);
        else if (e.kind === "hydrant") this.burst(e.x, e.z, 10, 0x9fd8ff, 6, 4);
        if (e.action === "land") this.burst(e.x, e.z, 6, 0xb9a98a, 2, 1.5);
      } else if (e.type === "traffic" && e.action !== "honk") {
        this.burst(e.x, e.z, 10, 0xc9d3d6, 4, 3);
        // Sparks off the crash, more the harder it was.
        this.burst(e.x, e.z, Math.min(10, 2 + Math.round((e.strength || 0) / 3)), 0xffc23a, 5, 4);
      }
      if (kick && e.kick) kick(e.kick);
      else if (kick && e.byPlayer && e.strength > 5)
        kick(Math.min(0.3, e.strength / 50));
    }
  }
  updateParticles(dt) {
    const mesh = this.particleMesh;
    if (!this.particles.length && !mesh.count) return;
    let n = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y = Math.max(0.15, p.y + p.vy * dt);
      if (p.y <= 0.15) {
        p.vx *= 0.8;
        p.vz *= 0.8;
      }
      this.e.set(p.spin * p.life, p.spin, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(
        this.v.set(p.x, p.y, p.z),
        this.q,
        this.s.setScalar(Math.min(1, p.life * 1.5)),
      );
      mesh.setMatrixAt(n, this.m);
      mesh.setColorAt(n, this.color.set(p.color));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    const all = [
      ...this.propMeshes.flatMap((g) => g.meshes.map((m) => m.mesh)),
      this.litterMesh,
      ...Object.values(this.pedMeshes),
      this.carMesh,
      this.particleMesh,
      this.smokeMesh,
      this.flameMesh,
      this.coreMesh,
    ];
    for (const mesh of all) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose?.();
    }
    this.ready = false;
  }
  reset() {
    if (this.ready) this.dispose();
    this.city = null;
    this.particles = [];
  }
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
