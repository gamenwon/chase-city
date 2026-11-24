// Big set pieces of the casual pass, each with predefined destruction
// states (no structural simulation):
//   containers  (yard.js) shoved -> slide; hard hit -> the upper ones topple
//               off the stack onto whatever is beside it (crushing cars),
//               sometimes setting off the next stack; very hard -> a lone
//               container rolls over; blasts do the same. Always pushable.
//   Ferris wheel (funpark.js) turns; a hard hit on a support or a blast
//               breaks it off its axle: it rolls away down the street
//               (Tumblers), gondolas flying.
//   carousel    turns; a hit or blast throws the canopy and the horses off.
//   balloons    float away when a car runs through the cart or a blast.
//   landmarks   (robot, dinosaur) lean when hit, crack, then break into
//               their big pieces, which tumble and hit cars.
// Everything is lit up at night (vertex-colour glow), and stays as it is
// until restart.
import * as THREE from "three";
import { pieceGeometry, bakedMaterial } from "./parts.js";
import { CONTAINER, ROBOT_PARTS } from "./yard.js";
import { wheelGeometryBuild, gondolaBuild, carouselTopBuild, horseBuild, DINO_PARTS } from "./funpark.js";
import { Tumblers } from "./tumble.js";
import { damageCar } from "../../game/city.js";

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

function glowMaterial(base = 0) {
  const glow = { value: base };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.glow = glow;
    s.fragmentShader = "uniform float glow;\n" + s.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * glow;");
  };
  m.customProgramCacheKey = () => "sculpture-glow";
  m.userData.glow = glow;
  return m;
}
function containerBuild(g) {
  const { w, d, h } = CONTAINER;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  box.position.y = 0;
  g.add(box);
  // Ribs on the long sides, a darker frame, doors at one end.
  for (let i = 0; i < 14; i++) {
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, h - 0.25, 0.06), new THREE.MeshBasicMaterial({ color: 0xc8c8c8 }));
      r.position.set(-w / 2 + 0.3 + i * ((w - 0.6) / 13), 0, s * (d / 2 + 0.02));
      g.add(r);
    }
  }
  for (const y of [-h / 2 + 0.06, h / 2 - 0.06])
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0x8a8a8a }));
      f.position.set(0, y, s * (d / 2 + 0.03));
      g.add(f);
    }
  for (const s of [-0.5, 0.5]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.3, d / 2 - 0.08), new THREE.MeshBasicMaterial({ color: 0xb0b0b0 }));
    door.position.set(w / 2 + 0.02, 0, s * (d / 2));
    g.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.4, 0.05), new THREE.MeshBasicMaterial({ color: 0x5a5a5a }));
    bar.position.set(w / 2 + 0.05, 0, s * 0.3);
    g.add(bar);
  }
}

export class BigProps {
  constructor(scene, layout, runtime, storefronts) {
    this.scene = scene;
    this.runtime = runtime;
    this.tumblers = new Tumblers(runtime, storefronts);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.c = new THREE.Color();
    this.e = new THREE.Euler();
    this.glowMats = [];
    const feats = layout.features || [];
    // ---- containers
    this.containers = [];
    for (const f of feats) if (f.kind === "containers") for (const c of f.containers) this.containers.push({ spec: c, feature: f });
    if (this.containers.length) {
      this.cmesh = new THREE.InstancedMesh(pieceGeometry(containerBuild), bakedMaterial, this.containers.length);
      this.cmesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.containers.length * 3), 3);
      this.cmesh.castShadow = this.cmesh.receiveShadow = true;
      this.cmesh.frustumCulled = false;
      scene.add(this.cmesh);
      this.containers.forEach((c, i) => this.cmesh.setColorAt(i, this.c.setHex(c.spec.color)));
    }
    // ---- Ferris wheels and carousels
    this.wheels = [];
    this.carousels = [];
    this.balloonSpots = [];
    this.landmarks = [];
    for (const f of feats) {
      if (f.kind === "funpark") {
        const w = f.wheel;
        const mat = glowMaterial();
        this.glowMats.push(mat);
        const mesh = new THREE.Mesh(pieceGeometry(wheelGeometryBuild(w.R)), mat);
        mesh.castShadow = true;
        scene.add(mesh);
        const gon = new THREE.InstancedMesh(pieceGeometry(gondolaBuild), bakedMaterial, 10);
        gon.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(30), 3);
        gon.castShadow = true;
        gon.frustumCulled = false;
        scene.add(gon);
        for (let i = 0; i < 10; i++) gon.setColorAt(i, this.c.setHex([0xff3a3a, 0xffd23a, 0x3a8aff, 0x3aff6a, 0xff5fd8][i % 5]));
        const wheel = {
          f: w,
          mesh,
          mat,
          gon,
          def: { r: w.R, lift: w.R, mass: 8, rolls: true, wheel: true },
          home: new THREE.Vector3(w.x, w.hub, w.z),
          q0: new THREE.Quaternion().setFromAxisAngle(UP, w.ry + (Math.abs(w.axle.x) > 0.5 ? Math.PI / 2 : 0)),
          state: "mounted",
        };
        // Gondolas: tumbling pieces once the wheel goes.
        wheel.gondolas = Array.from({ length: 10 }, () => this.tumblers.add({ def: { r: 0.8, lift: 0.5, mass: 0.6, rolls: false }, state: "mounted" }));
        this.tumblers.add(wheel);
        wheel.onRest = (pc) => {
          pc.q.setFromAxisAngle(X, Math.PI / 2);
          pc.pos.y = 0.6;
        };
        this.wheels.push(wheel);
        const c = f.carousel;
        const cmat = glowMaterial();
        this.glowMats.push(cmat);
        const top = new THREE.Mesh(pieceGeometry(carouselTopBuild(c.R)), cmat);
        top.castShadow = true;
        scene.add(top);
        const horses = new THREE.InstancedMesh(pieceGeometry(horseBuild), bakedMaterial, 6);
        horses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
        horses.castShadow = true;
        horses.frustumCulled = false;
        scene.add(horses);
        for (let i = 0; i < 6; i++) horses.setColorAt(i, this.c.setHex([0xffffff, 0xffe0f0, 0xe0f0ff][i % 3]));
        const car = { f: c, top, horses, mat: cmat, def: { r: c.R + 0.3, lift: 1.0, mass: 2.0, rolls: false }, state: "mounted", home: new THREE.Vector3(c.x, 0.4, c.z) };
        car.horsePieces = Array.from({ length: 6 }, () => this.tumblers.add({ def: { r: 0.7, lift: 0.4, mass: 0.4, rolls: false }, state: "mounted" }));
        this.tumblers.add(car);
        this.carousels.push(car);
        for (const b of f.balloons) this.balloonSpots.push({ ...b });
      }
      if (f.landmark) this.addLandmark(f.landmark);
    }
    // String lights over the park lanes (bulbs, glowing at night).
    for (const f of feats) {
      if (f.kind !== "funpark") continue;
      const { cx, cz, L, S, alongX } = f.block;
      const mat = glowMaterial();
      this.glowMats.push(mat);
      const build = (g) => {
        const cols = [0xffd23a, 0xff5fd8, 0x4ae8ff, 0x7aff6a, 0xffffff];
        for (const [ax, len] of [[0, L], [1, S]])
          for (let k = 0; k < Math.floor(len / 0.55); k++) {
            const t = -len / 2 + 0.3 + k * 0.55;
            const sag = 6.2 - 0.6 * Math.cos((t / len) * Math.PI) ** 2;
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: cols[k % cols.length] }));
            m.position.set(ax ? 0.6 : t, sag + 0.05, ax ? t : 0.6);
            g.add(m);
          }
      };
      const mesh = new THREE.Mesh(pieceGeometry(build), mat);
      mesh.position.set(cx, 0, cz);
      mesh.rotation.y = alongX ? 0 : Math.PI / 2;
      scene.add(mesh);
    }
    // Balloons (spheres + a string), instanced.
    const nb = this.balloonSpots.reduce((a, b) => a + b.n, 0);
    if (nb) {
      const bg = new THREE.SphereGeometry(0.38, 8, 6);
      bg.scale(1, 1.2, 1);
      this.balloons = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ roughness: 0.35 }), nb);
      this.balloons.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nb * 3), 3);
      this.balloons.frustumCulled = false;
      this.balloons.castShadow = true;
      scene.add(this.balloons);
      const sg = new THREE.BoxGeometry(0.02, 1.6, 0.02);
      sg.translate(0, -1.2, 0);
      this.strings = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff }), nb);
      this.strings.frustumCulled = false;
      scene.add(this.strings);
      let i = 0;
      this.balloonList = [];
      for (const sp of this.balloonSpots)
        for (let k = 0; k < sp.n; k++) {
          const a = (k / sp.n) * Math.PI * 2;
          this.balloonList.push({ spot: sp, i: i, hx: sp.x + Math.cos(a) * 0.5, hz: sp.z + Math.sin(a) * 0.5, hy: 2.6 + (k % 3) * 0.45 });
          this.balloons.setColorAt(i++, this.c.setHex([0xff3a3a, 0xffd23a, 0x3a8aff, 0x3aff6a, 0xff5fd8, 0xffffff][k % 6]));
        }
    }
    this.reset();
  }
  addLandmark(spec) {
    const parts = spec.kind === "robot" ? ROBOT_PARTS : DINO_PARTS;
    const mat = glowMaterial();
    this.glowMats.push(mat);
    const mk = (build) => {
      const mesh = new THREE.Mesh(pieceGeometry(build), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    // Pieces in the statue's frame: offset of each part's origin, its size.
    const layout =
      spec.kind === "robot"
        ? [
            ["base", [0, 0, 0], null],
            ["torso", [0, 4.6, 0], { r: 1.7, lift: 1.0, mass: 3, rolls: false }],
            ["head", [0, 6.85, 0], { r: 1.0, lift: 0.8, mass: 1.2, rolls: true }],
            ["arm", [-1.95, 6.0, 0], { r: 1.0, lift: 0.4, mass: 1.0, rolls: false }],
            ["arm", [1.95, 6.0, 0], { r: 1.0, lift: 0.4, mass: 1.0, rolls: false }],
          ]
        : [
            ["base", [0, 0, 0], null],
            ["body", [0, 4.4, 0], { r: 1.9, lift: 1.0, mass: 3, rolls: false }],
            ["head", [0, 6.6, 1.5], { r: 1.3, lift: 0.7, mass: 1.5, rolls: false }],
            ["tail", [0, 3.6, -1.6], { r: 1.8, lift: 0.5, mass: 1.5, rolls: false }],
          ];
    const L = { spec, health: 100, lean: 0, leanDir: 0, state: "standing", parts: [], mat, base: null };
    const qBase = new THREE.Quaternion().setFromAxisAngle(UP, spec.ry || 0);
    for (const [name, off, def] of layout) {
      const mesh = mk(parts[name]);
      const local = new THREE.Vector3(...off);
      if (!def) {
        L.base = { mesh, local };
        continue;
      }
      const p = this.tumblers.add({ mesh, def, state: "mounted", name, local });
      L.parts.push(p);
    }
    L.q0 = qBase;
    this.landmarks.push(L);
  }
  reset() {
    this.tumblers.reset();
    this.stats = { slid: 0, toppled: 0, overturned: 0, crushed: 0, wheels: 0, carousels: 0, balloons: 0, landmarksHit: 0, landmarksBroken: 0 };
    this.anims = [];
    this.pending = [];
    for (const c of this.containers) {
      const s = c.spec;
      Object.assign(c, { x: s.x, y: s.y, z: s.z, ry: s.ry, roll: 0, level: s.level, mode: s.level ? "stack" : "base", vx: 0, vz: 0, across: CONTAINER.d, height: CONTAINER.h, hitAt: -9 });
    }
    this.poseContainers();
    for (const w of this.wheels) {
      w.state = "mounted";
      w.pos.copy(w.home);
      w.vel.set(0, 0, 0);
      w.q.copy(w.q0);
      w.angle = 0;
      for (const g of w.gondolas) g.state = "mounted";
    }
    for (const c of this.carousels) {
      c.state = "mounted";
      c.pos.copy(c.home);
      c.vel.set(0, 0, 0);
      c.q.identity();
      c.angle = 0;
      for (const h of c.horsePieces) h.state = "mounted";
    }
    for (const b of this.balloonList || []) Object.assign(b, { state: "tied", x: b.hx, y: b.hy, z: b.hz, vy: 0 });
    for (const L of this.landmarks) {
      Object.assign(L, { health: 100, lean: 0, leanDir: 0, state: "standing", hitAt: -9 });
      for (const p of L.parts) p.state = "mounted";
    }
    this.time = 0;
  }

  // ------------------------------------------------------- containers --
  poseContainers() {
    if (!this.cmesh) return;
    this.containers.forEach((c, i) => {
      this.q.setFromAxisAngle(UP, c.ry);
      this.q2.setFromAxisAngle(X, c.roll);
      this.q.multiply(this.q2);
      const centreUp = Math.abs(Math.sin(c.roll)) > 0.5 ? CONTAINER.d / 2 : CONTAINER.h / 2;
      this.m.compose(this.v.set(c.x, c.y + (c.animY ?? centreUp), c.z), this.q, this.s.set(1, 1, 1));
      this.cmesh.setMatrixAt(i, this.m);
    });
    this.cmesh.instanceMatrix.needsUpdate = true;
  }
  above(c) {
    return this.containers.filter((o) => o !== c && o.mode === "stack" && o.level > c.level && Math.hypot(o.x - c.x, o.z - c.z) < 1.5);
  }
  // A car against the ground-level containers (an oriented box each).
  touchContainers(sim, car, radius, isPlayer) {
    for (const c of this.containers) {
      if (c.mode === "stack" || c.mode === "anim" || c.level > 0) continue;
      if (Math.abs(car.x - c.x) > 6 || Math.abs(car.z - c.z) > 6) continue;
      const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
      const dx = car.x - c.x, dz = car.z - c.z;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const hx = CONTAINER.w / 2, hz = c.across / 2;
      const px = Math.max(-hx, Math.min(hx, lx)), pz = Math.max(-hz, Math.min(hz, lz));
      let ox = lx - px, oz = lz - pz, d = Math.hypot(ox, oz);
      if (d >= radius) continue;
      if (d < 1e-6) {
        // Centre inside: out by the nearest side.
        if (hx - Math.abs(lx) < hz - Math.abs(lz)) (ox = Math.sign(lx) || 1), (oz = 0);
        else (ox = 0), (oz = Math.sign(lz) || 1);
        d = 0;
      }
      const ln = Math.hypot(ox, oz) || 1;
      const nlx = ox / ln, nlz = oz / ln;
      const nx = nlx * cs + nlz * sn, nz = -nlx * sn + nlz * cs; // world normal, container -> car
      const push = radius - d;
      const stackN = 1 + this.above(c).length;
      const M = 4 * stackN, carM = isPlayer ? 1.3 * ((sim.vehicle?.stats.durability || 100) / 100) : 1.2;
      const share = M / (M + carM);
      car.x += nx * push * share;
      car.z += nz * push * share;
      c.x -= nx * push * (1 - share);
      c.z -= nz * push * (1 - share);
      const closing = Math.max(0, -((car.vx || 0) * nx + (car.vz || 0) * nz) + (c.vx * nx + c.vz * nz));
      if (closing <= 0.5) continue;
      car.vx += nx * closing * share * 0.95;
      car.vz += nz * closing * share * 0.95;
      if (isPlayer) car.speed = Math.max(0, (car.speed ?? 0) - closing * share * 0.8);
      // Shove: pressing slides it slowly (never a wall); a hit, more.
      const imp = closing * (1 - share) * (closing > 4 ? 1.6 : 0.6) + (closing <= 4 ? 0.6 : 0);
      c.vx -= nx * imp;
      c.vz -= nz * imp;
      if (c.mode === "base" && imp > 0.8) (c.mode = "slide"), this.stats.slid++;
      if (closing > 4 && sim.elapsed - c.hitAt > 0.5) {
        c.hitAt = sim.elapsed;
        sim.city?.events.push({ id: ++sim.city.eventId, type: "container", action: "hit", x: c.x, z: c.z, strength: Math.min(15, closing), sound: "metal", byPlayer: isPlayer });
        if (isPlayer) sim.damage?.(Math.min(10, closing * 0.35));
        else if (car.health != null) car.health -= closing * 1.5;
        // What falls: the upper ones off the stack, away from the car;
        // a lone one rolls over when hit very hard.
        const up = this.above(c);
        if (closing >= 10 && up.length) this.toppleStack(sim, c, -nx, -nz, closing >= 16 ? 2 : 1);
        else if (closing >= 15 && !up.length && Math.abs(c.roll) < 0.1) this.overturn(sim, c, -nx, -nz);
      }
    }
  }
  toppleStack(sim, base, dx, dz, domino) {
    const up = this.above(base).sort((a, b) => b.level - a.level);
    up.forEach((c, k) => this.pending.push({ at: sim.elapsed + 0.08 + k * 0.28, run: () => this.topple(sim, c, dx, dz, domino) }));
  }
  // An upper container falls off its stack to the side (rotating about
  // its long axis onto its side) and lands on whatever is there.
  topple(sim, c, dx, dz, domino = 0) {
    if (c.mode !== "stack") return;
    const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
    // Across the container: which side is "away".
    const side = Math.sign(dx * sn + dz * cs) || 1;
    const out = CONTAINER.d / 2 + CONTAINER.h / 2 + 0.2 + c.level * 0.6;
    const to = { x: c.x + sn * side * out, z: c.z + cs * side * out };
    c.mode = "anim";
    this.anims.push({ c, t0: sim.elapsed, dur: 0.55 + c.level * 0.15, from: { x: c.x, y: c.y, z: c.z, roll: c.roll }, to: { x: to.x, y: 0.05, z: to.z, roll: side * Math.PI / 2 }, domino, dir: { x: dx, z: dz } });
    this.stats.toppled++;
    sim.city?.events.push({ id: ++sim.city.eventId, type: "container", action: "topple", x: c.x, z: c.z, strength: 12, sound: "topple" });
  }
  overturn(sim, c, dx, dz) {
    const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
    const side = Math.sign(dx * sn + dz * cs) || 1;
    c.mode = "anim";
    const out = CONTAINER.h / 2 - CONTAINER.d / 2 + 0.4;
    this.anims.push({ c, t0: sim.elapsed, dur: 0.6, from: { x: c.x, y: c.y, z: c.z, roll: c.roll }, to: { x: c.x + sn * side * out, y: 0.05, z: c.z + cs * side * out, roll: side * Math.PI / 2 }, domino: 0, dir: { x: dx, z: dz } });
    this.stats.overturned++;
    sim.city?.events.push({ id: ++sim.city.eventId, type: "container", action: "overturn", x: c.x, z: c.z, strength: 12, sound: "topple" });
  }
  landContainer(sim, a) {
    const c = a.c;
    Object.assign(c, { x: a.to.x, y: a.to.y, z: a.to.z, roll: a.to.roll, level: 0, mode: "down", across: CONTAINER.h, vx: a.dir.x * 1.5, vz: a.dir.z * 1.5 });
    c.animY = null;
    // Crushes what is under it.
    const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
    const under = (o) => {
      const dx = o.x - c.x, dz = o.z - c.z;
      return Math.abs(dx * cs - dz * sn) < CONTAINER.w / 2 + 0.9 && Math.abs(dx * sn + dz * cs) < c.across / 2 + 0.9;
    };
    for (const p of sim.police) if (p.state === "active" && !(p.level) && under(p)) (p.health -= 70), (p.lastDamageCause = "container"), this.stats.crushed++;
    for (const t of sim.city?.traffic || []) if (!(t.level) && under(t)) (damageCar(sim, t, 30), this.stats.crushed++);
    if (!(sim.player.level) && under(sim.player)) {
      sim.damage?.(12);
      sim.player.vx += sn * 5;
      sim.player.vz += cs * 5;
    }
    sim.city?.events.push({ id: ++sim.city.eventId, type: "container", action: "land", x: c.x, z: c.z, strength: 15, sound: "rumble", kick: 0.35 });
    this.runtime?.fx.push({ kind: "dust", x: c.x, z: c.z, born: sim.elapsed, size: 1.1 });
    // Domino: the next stack it lands against gives too.
    if (a.domino > 0)
      for (const o of this.containers)
        if (o.mode === "base" || o.mode === "slide")
          if (o !== c && this.above(o).length && Math.hypot(o.x - c.x, o.z - c.z) < CONTAINER.w * 0.75 + 1.5) {
            this.toppleStack(sim, o, a.dir.x, a.dir.z, a.domino - 1);
            break;
          }
  }
  stepContainers(sim, dt) {
    for (const c of this.containers) {
      if (c.mode !== "slide" && c.mode !== "down") continue;
      if (Math.abs(c.vx) + Math.abs(c.vz) < 0.02) continue;
      const before = { x: c.x, z: c.z };
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      const f = Math.exp(-dt * 3.2);
      c.vx *= f;
      c.vz *= f;
      // The stack rides on its base until it slides out from under it.
      for (const o of this.above(c)) {
        if (Math.hypot(c.x - c.spec.x, c.z - c.spec.z) > 1.1) this.topple(sim, o, c.vx, c.vz, 0);
        else (o.x += c.x - before.x), (o.z += c.z - before.z);
      }
      // Not into buildings or other solids.
      for (const box of sim.nearSolids(c.x, c.z, 4)) {
        if (box.kind === "craneFoot" || box.w > 60) continue;
        const px = box.w / 2 + 1.3 - Math.abs(c.x - box.x), pz = box.d / 2 + 1.3 - Math.abs(c.z - box.z);
        if (px > 0 && pz > 0) {
          if (px < pz) (c.x += Math.sign(c.x - box.x || 1) * px), (c.vx = 0);
          else (c.z += Math.sign(c.z - box.z || 1) * pz), (c.vz = 0);
        }
      }
      if (Math.abs(c.vx) + Math.abs(c.vz) < 0.05 && c.mode === "slide") c.mode = "base";
    }
    // Animations (falling off, rolling over).
    const now = sim.elapsed;
    for (const a of [...this.anims]) {
      const t = Math.min(1, (now - a.t0) / a.dur), e = t * t;
      const c = a.c;
      c.x = a.from.x + (a.to.x - a.from.x) * e;
      c.z = a.from.z + (a.to.z - a.from.z) * e;
      c.roll = a.from.roll + (a.to.roll - a.from.roll) * Math.min(1, t * 1.15);
      const h0 = CONTAINER.h / 2, h1 = CONTAINER.d / 2;
      c.y = a.from.y + (a.to.y - a.from.y) * e;
      c.animY = h0 + (h1 - h0) * t + Math.sin(t * Math.PI) * 0.6;
      if (t >= 1) {
        this.anims.splice(this.anims.indexOf(a), 1);
        this.landContainer(sim, a);
      }
    }
    if (this.cmesh) this.poseContainers();
  }

  // ------------------------------------------------- wheel / carousel --
  touchFunpark(sim, car, radius, speed) {
    for (const w of this.wheels) {
      if (w.state !== "mounted") continue;
      const f = w.f;
      for (const s of [-1, 1]) {
        const fx = f.x + f.axle.x * s * 1.4, fz = f.z + f.axle.z * s * 1.4;
        if (Math.hypot(car.x - fx, car.z - fz) < radius + 1.6 && speed >= 11) this.breakWheel(sim, w, car.vx || 0, car.vz || 0);
      }
    }
    for (const c of this.carousels) {
      if (c.state !== "mounted") continue;
      if (Math.hypot(car.x - c.f.x, car.z - c.f.z) < c.f.R + radius && speed >= 7) this.breakCarousel(sim, c, car.vx || 0, car.vz || 0, speed);
    }
    for (const b of this.balloonList || []) {
      if (b.state !== "tied") continue;
      if (Math.abs(car.x - b.hx) < radius + 1.2 && Math.abs(car.z - b.hz) < radius + 1.2 && speed > 3) this.releaseBalloons(sim, b.spot, speed);
    }
  }
  breakWheel(sim, w, vx, vz) {
    if (w.state !== "mounted") return;
    this.stats.wheels++;
    // Off its axle: it rolls away in its own plane, the way the hit pushed.
    const f = w.f;
    const px = -f.axle.z, pz = f.axle.x; // in-plane direction
    const dir = Math.sign(vx * px + vz * pz) || (Math.random() < 0.5 ? 1 : -1);
    w.pos.y = f.hub;
    this.tumblers.launch(w, px * dir * 7, 1.5, pz * dir * 7, 2);
    w.axleX = Math.abs(f.axle.x) > 0.5;
    // Gondolas fly off.
    w.gondolas.forEach((g, i) => {
      const a = w.angle + (i / 10) * Math.PI * 2;
      g.pos.set(f.x + px * Math.cos(a) * f.R, f.hub + Math.sin(a) * f.R - 0.9, f.z + pz * Math.cos(a) * f.R);
      g.q.identity();
      this.tumblers.launch(g, px * dir * (2 + Math.random() * 4) + (Math.random() - 0.5) * 4, 2 + Math.random() * 3, pz * dir * (2 + Math.random() * 4) + (Math.random() - 0.5) * 4, 5);
    });
    sim.city?.events.push({ id: ++sim.city.eventId, type: "funpark", action: "wheel", x: f.x, z: f.z, strength: 15, sound: "topple", kick: 0.4 });
  }
  breakCarousel(sim, c, vx, vz, speed) {
    if (c.state !== "mounted") return;
    this.stats.carousels++;
    const sp = Math.hypot(vx, vz) || 1;
    c.pos.set(c.f.x, 0.4 + 1.0, c.f.z);
    this.tumblers.launch(c, (vx / sp) * 3, 6 + speed * 0.15, (vz / sp) * 3, 2);
    c.horsePieces.forEach((h, i) => {
      const a = c.angle + (i / 6) * Math.PI * 2;
      h.pos.set(c.f.x + Math.cos(a) * c.f.R * 0.7, 1.4, c.f.z + Math.sin(a) * c.f.R * 0.7);
      h.q.setFromAxisAngle(UP, -a);
      this.tumblers.launch(h, Math.cos(a) * (3 + Math.random() * 4) + (vx / sp) * 3, 3 + Math.random() * 3, Math.sin(a) * (3 + Math.random() * 4) + (vz / sp) * 3, 6);
    });
    sim.city?.events.push({ id: ++sim.city.eventId, type: "funpark", action: "carousel", x: c.f.x, z: c.f.z, strength: 13, sound: "metal" });
  }
  releaseBalloons(sim, spot, speed) {
    for (const b of this.balloonList) {
      if (b.spot !== spot || b.state !== "tied") continue;
      if (speed > 12 && Math.random() < 0.3) {
        b.state = "popped";
        continue;
      }
      b.state = "free";
      b.vy = 1.2 + Math.random() * 1.3;
      b.vx = (Math.random() - 0.5) * 2;
      b.vz = (Math.random() - 0.5) * 2;
      this.stats.balloons++;
    }
    sim.city?.events.push({ id: ++sim.city.eventId, type: "funpark", action: "balloons", x: spot.x, z: spot.z, strength: 8, sound: "pop" });
  }

  // ------------------------------------------------------- landmarks --
  touchLandmarks(sim, car, radius, speed) {
    for (const L of this.landmarks) {
      if (L.state === "broken") continue;
      const d = Math.hypot(car.x - L.spec.x, car.z - L.spec.z);
      if (d > radius + 1.8 || speed < 6 || sim.elapsed - L.hitAt < 0.5) continue;
      L.hitAt = sim.elapsed;
      this.damageLandmark(sim, L, speed * 3.4, Math.atan2(L.spec.x - car.x, L.spec.z - car.z));
    }
  }
  damageLandmark(sim, L, dmg, dir) {
    if (L.state === "broken") return;
    L.health -= dmg;
    L.leanDir = dir;
    L.lean = Math.min(0.32, (100 - Math.max(0, L.health)) / 220);
    this.stats.landmarksHit++;
    sim.city?.events.push({ id: ++sim.city.eventId, type: "landmark", action: "hit", x: L.spec.x, z: L.spec.z, strength: 12, sound: "crack" });
    this.runtime?.fx.push({ kind: "dust", x: L.spec.x, z: L.spec.z, born: sim.elapsed, size: 0.5 });
    for (let i = 0; i < 5; i++) this.runtime?.throwChunk(1, L.spec.x, L.spec.z, 2 + Math.random() * 3, Math.random() * 6.3);
    // Badly hit: the top part goes first; then it all comes apart.
    if (L.health < 45 && L.parts[1]?.state === "mounted") this.launchPart(sim, L, L.parts[1], 1);
    if (L.health <= 0) {
      L.state = "broken";
      this.stats.landmarksBroken++;
      for (const p of L.parts) if (p.state === "mounted") this.launchPart(sim, L, p, 1.3);
      sim.city?.events.push({ id: ++sim.city.eventId, type: "landmark", action: "break", x: L.spec.x, z: L.spec.z, strength: 15, sound: "rumble", kick: 0.4 });
    }
  }
  launchPart(sim, L, p, k) {
    const sx = Math.sin(L.leanDir), sz = Math.cos(L.leanDir);
    this.tumblers.launch(p, sx * (3 + Math.random() * 3) * k + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, sz * (3 + Math.random() * 3) * k + (Math.random() - 0.5) * 2, 2.5);
  }
  landmarkPose(L, local, out, q) {
    // The statue's frame (leaning about its base) applied to a local point.
    this.q.setFromAxisAngle(this.v.set(Math.cos(L.leanDir), 0, -Math.sin(L.leanDir)), L.lean);
    q.copy(this.q).multiply(L.q0);
    out.copy(local).applyQuaternion(q).add(this.s.set(L.spec.x, L.spec.y ?? 0.05, L.spec.z));
    return out;
  }

  // -------------------------------------------------------- systems --
  touch(sim, car, radius, speed, isPlayer) {
    if (this.containers.length) this.touchContainers(sim, car, radius, isPlayer);
    if (this.wheels.length) this.touchFunpark(sim, car, radius, speed);
    if (this.landmarks.length) this.touchLandmarks(sim, car, radius, speed);
  }
  blast(sim, e, R, s) {
    for (const c of this.containers) {
      if (c.mode === "anim") continue;
      const dx = c.x - e.x, dz = c.z - e.z, d = Math.hypot(dx, dz);
      if (d > R + 3) continue;
      const k = (1 - d / (R + 3)) * Math.sqrt(s);
      if (c.mode === "stack") {
        if (k > 0.3) this.topple(sim, c, dx / (d || 1), dz / (d || 1), 1);
        continue;
      }
      c.vx += (dx / (d || 1)) * 6 * k;
      c.vz += (dz / (d || 1)) * 6 * k;
      if (c.mode === "base") c.mode = "slide";
      if (k > 0.75 && !this.above(c).length && Math.abs(c.roll) < 0.1) this.overturn(sim, c, dx, dz);
    }
    for (const w of this.wheels) {
      const d = Math.hypot(w.f.x - e.x, w.f.z - e.z);
      if (w.state === "mounted" && d < R + 2 && (1 - d / (R + 2)) * Math.sqrt(s) > 0.4) this.breakWheel(sim, w, w.f.x - e.x, w.f.z - e.z);
    }
    for (const c of this.carousels) {
      const d = Math.hypot(c.f.x - e.x, c.f.z - e.z);
      if (c.state === "mounted" && d < R + 2 && (1 - d / (R + 2)) * Math.sqrt(s) > 0.3) this.breakCarousel(sim, c, c.f.x - e.x, c.f.z - e.z, 12);
    }
    for (const b of this.balloonList || []) if (b.state === "tied" && Math.hypot(b.hx - e.x, b.hz - e.z) < R + 3) this.releaseBalloons(sim, b.spot, 14);
    for (const L of this.landmarks) {
      const d = Math.hypot(L.spec.x - e.x, L.spec.z - e.z);
      if (d < R + 2) this.damageLandmark(sim, L, 110 * (1 - d / (R + 2)) * s, Math.atan2(L.spec.x - e.x, L.spec.z - e.z));
    }
  }
  step(sim, dt) {
    this.sim = sim;
    this.stepContainers(sim, dt);
    this.tumblers.step(sim, dt);
    for (const p of [...this.pending])
      if (sim.elapsed >= p.at) {
        this.pending.splice(this.pending.indexOf(p), 1);
        p.run();
      }
  }
  render(dt, sim, night) {
    const now = sim.elapsed;
    for (const m of this.glowMats) m.userData.glow.value = night ? 0.5 : 0.04;
    // Ferris wheels: turning (gondolas hanging level) or loose.
    for (const w of this.wheels) {
      const f = w.f;
      if (w.state === "mounted") {
        w.angle = now * 0.18;
        w.pos.copy(w.home);
        this.q2.setFromAxisAngle(this.v.set(0, 0, 1), w.angle);
        w.q.copy(w.q0).multiply(this.q2);
      }
      w.mesh.position.copy(w.pos);
      w.mesh.quaternion.copy(w.q);
      const px = -f.axle.z, pz = f.axle.x;
      w.gondolas.forEach((g, i) => {
        if (g.state === "mounted") {
          const a = w.angle + (i / 10) * Math.PI * 2;
          this.m.compose(this.v.set(f.x + px * Math.cos(a) * f.R, f.hub + Math.sin(a) * f.R, f.z + pz * Math.cos(a) * f.R), this.q.setFromAxisAngle(UP, f.ry), this.s.set(1, 1, 1));
        } else this.m.compose(g.pos, g.q, this.s.set(1, 1, 1));
        w.gon.setMatrixAt(i, this.m);
      });
      w.gon.instanceMatrix.needsUpdate = true;
    }
    for (const c of this.carousels) {
      if (c.state === "mounted") {
        c.angle = now * 0.6;
        c.pos.copy(c.home);
        c.q.setFromAxisAngle(UP, c.angle);
      }
      c.top.position.copy(c.pos);
      c.top.quaternion.copy(c.q);
      c.horsePieces.forEach((h, i) => {
        if (h.state === "mounted") {
          const a = c.angle + (i / 6) * Math.PI * 2;
          const bob = Math.sin(now * 3 + i) * 0.25;
          this.q.setFromAxisAngle(UP, -a);
          this.m.compose(this.v.set(c.f.x + Math.cos(a) * c.f.R * 0.7, 0.4 + bob, c.f.z - Math.sin(a) * c.f.R * 0.7), this.q, this.s.set(1, 1, 1));
        } else this.m.compose(h.pos, h.q, this.s.set(1, 1, 1));
        c.horses.setMatrixAt(i, this.m);
      });
      c.horses.instanceMatrix.needsUpdate = true;
    }
    // Balloons: bobbing on the cart, floating up when free.
    if (this.balloons) {
      for (const b of this.balloonList) {
        if (b.state === "free") {
          b.y += b.vy * dt;
          b.x += (b.vx + Math.sin(now + b.i) * 0.6) * dt;
          b.z += b.vz * dt;
          if (b.y > 45) b.state = "gone";
        } else if (b.state === "tied") {
          b.x = b.hx + Math.sin(now * 1.3 + b.i) * 0.12;
          b.y = b.hy + Math.sin(now * 1.7 + b.i * 2) * 0.08;
          b.z = b.hz;
        }
        const show = b.state === "tied" || b.state === "free";
        this.m.compose(this.v.set(b.x, b.y, b.z), this.q.identity(), this.s.setScalar(show ? 1 : 0));
        this.balloons.setMatrixAt(b.i, this.m);
        this.strings.setMatrixAt(b.i, this.m);
      }
      this.balloons.instanceMatrix.needsUpdate = this.strings.instanceMatrix.needsUpdate = true;
    }
    // Landmarks: the stump leans; parts follow it until they come off.
    for (const L of this.landmarks) {
      const q = new THREE.Quaternion();
      if (L.base) {
        this.landmarkPose(L, L.base.local, L.base.mesh.position, q);
        L.base.mesh.quaternion.copy(q);
      }
      for (const p of L.parts) {
        if (p.state === "mounted") {
          this.landmarkPose(L, p.local, p.pos, p.q);
        }
        p.mesh.position.copy(p.pos);
        p.mesh.quaternion.copy(p.q);
      }
    }
  }
}
