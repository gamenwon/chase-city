// Location destruction for the preview. Runs beside the game's own
// simulation (it never changes police AI, arrest rules, controls or car
// handling): after each simulation step it looks for cars touching
// location objects and breaks them; each frame it animates what is
// falling or burning. Everything broken stays broken until the run is
// restarted (sim.runNumber changes). Settled pieces stop updating.
import * as THREE from "three";
import { CONFIG } from "../../game/config.js";
import { C, B, pieceGeometry, bakedMaterial, parkBench, lampPost, binPair } from "./parts.js";
import { buildGas } from "./gas.js";
import { buildCourt, fencePanel, hoop } from "./court.js";
import { buildPark } from "./park.js";
import { GAS, COURT, PARK, FOUNTAIN_R } from "./layout.js";

const TOP = 0.4;
const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// One InstancedMesh per kind of breakable; every piece has its own pose.
const KINDS = {
  bench: { build: (g) => parkBench(g, 0xc77a45), r: 1.1, fall: Math.PI / 2, lift: 0.3, slide: 1.0 },
  lamp: { build: lampPost, r: 0.35, fall: 1.45, lift: 0.22, slide: 0 },
  bin: { build: binPair, r: 0.75, fall: Math.PI / 2, lift: 0.32, slide: 1.6, spin: 1.2 },
  panel: { build: (g) => fencePanel(g, 2.4), r: 0, fall: 1.5, lift: 0.06, slide: 0.3 },
  hoop: { build: hoop, r: 0.6, fall: 1.05, lift: 0.0, slide: 0 },
};

export class LocationsRuntime {
  constructor(scene, sim, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.gas = buildGas(scene);
    this.court = buildCourt(scene);
    this.park = buildPark(scene);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    // Breakables.
    const specs = {
      bench: [...this.court.benches, ...this.park.benches],
      lamp: this.park.lamps,
      bin: [...this.gas.bins, ...this.court.bins, ...this.park.bins],
      panel: this.court.panels,
      hoop: this.court.hoops,
    };
    this.items = [];
    this.meshes = {};
    for (const [kind, list] of Object.entries(specs)) {
      const mesh = new THREE.InstancedMesh(pieceGeometry(KINDS[kind].build), bakedMaterial, list.length);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes[kind] = mesh;
      list.forEach((spec, i) => this.items.push({ kind, i, spec, ...KINDS[kind] }));
    }
    // Basketballs.
    this.ballMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshStandardMaterial({ color: C.ball, roughness: 0.6, flatShading: true }), this.court.balls.length);
    this.ballMesh.castShadow = true;
    this.ballMesh.frustumCulled = false;
    scene.add(this.ballMesh);
    // Fire and smoke (instanced puffs, one draw call each), debris chunks,
    // water drops.
    const puff = new THREE.IcosahedronGeometry(1, 0);
    this.fire = new THREE.InstancedMesh(puff, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false }), 96);
    this.fire.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3);
    this.smoke = new THREE.InstancedMesh(puff, new THREE.MeshBasicMaterial({ color: C.smoke, transparent: true, opacity: 0.6, depthWrite: false }), 64);
    for (const m of [this.fire, this.smoke]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    const chunkGeo = pieceGeometry((g) => {
      B(g, 0.92, 0.55, 0.72, C.red, 0, -0.27, 0);
      B(g, 0.94, 0.08, 0.74, C.yellow, 0, -0.06, 0);
    });
    const shardGeo = pieceGeometry((g) => B(g, 0.6, 0.12, 0.45, 0x9a9da3, 0, -0.06, 0));
    this.chunkKinds = [chunkGeo, shardGeo].map((geo) => {
      const m = new THREE.InstancedMesh(geo, bakedMaterial, 48);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    });
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshBasicMaterial({ color: C.waterLight, transparent: true, opacity: 0.8, depthWrite: false }), 220);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    scene.add(this.drops);
    this.fireColors = C.fire.map((c) => new THREE.Color(c));
    const gg = new THREE.CylinderGeometry(0.25, 0.55, 5.5, 8);
    gg.translate(0, 2.75, 0);
    this.geyser = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: C.waterLight, transparent: true, opacity: 0.75, depthWrite: false }));
    this.geyser.position.set(PARK.x, TOP + 0.5, PARK.z);
    this.geyser.visible = false;
    scene.add(this.geyser);
    this.stats = { islands: 0, panels: 0, hoops: 0, benches: 0, lamps: 0, bins: 0, fountain: 0, policeWrecked: 0 };
    this.reset(sim);
  }

  // ------------------------------------------------------------ state --
  reset(sim) {
    this.run = sim.runNumber;
    this.time = 0;
    this.pending = [];
    this.fx = []; // bursts and burning spots
    this.chunks = []; // flying debris; settled ones stay put, not updated
    this.chunkCounts = [0, 0];
    this.chunkKinds.forEach((m) => (m.count = 0));
    this.dropList = [];
    this.speeds = new WeakMap();
    for (const it of this.items) {
      it.state = "stand";
      it.t = 0;
      it.dir = { x: 0, z: 1 };
      it.dy = 0;
      this.pose(it, 0);
    }
    for (const k in this.meshes) this.meshes[k].instanceMatrix.needsUpdate = true;
    this.balls = this.court.balls.map((b) => ({ ...b, vx: 0, vy: 0, vz: 0, rest: true }));
    this.balls.forEach((b, i) => this.ballPose(b, i));
    this.ballMesh.instanceMatrix.needsUpdate = true;
    const g = this.gas;
    for (const isl of g.islands) {
      isl.state = "intact";
      isl.intact.visible = true;
      isl.wrecked.visible = false;
    }
    g.glass.visible = true;
    g.glassBroken.visible = false;
    g.canopy.target = { rx: 0, rz: 0, dy: 0 };
    g.canopy.now = { rx: 0, rz: 0, dy: 0 };
    this.canopyPose();
    const f = this.park.fountain;
    f.state = "intact";
    f.intact.visible = f.water.visible = true;
    f.broken.visible = f.spill.visible = false;
    f.leakAt = 0;
    f.burstAt = null;
    for (const k in this.stats) this.stats[k] = 0;
  }

  // ------------------------------------------------- simulation step --
  // Called after every sim.update(1/60).
  step(sim, dt) {
    if (sim.runNumber !== this.run) this.reset(sim);
    this.time = sim.elapsed;
    const cars = [sim.player, ...sim.police.filter((c) => c.state === "active")];
    for (const car of cars) {
      const sp = Math.hypot(car.vx || 0, car.vz || 0);
      const before = this.speeds.get(car) ?? sp;
      this.speeds.set(car, sp);
      const speed = Math.max(sp, before);
      const near = (c, r) => Math.abs(car.x - c.x) < r && Math.abs(car.z - c.z) < r;
      const radius = car === sim.player ? CONFIG.radius : CONFIG.policeRadius;
      if (near(GAS, 13)) this.touchGas(sim, car, radius, speed);
      if (near(PARK, 13)) this.touchFountain(sim, car, radius, speed);
      if (near(GAS, 13) || near(COURT, 13) || near(PARK, 13)) {
        this.touchItems(car, radius, speed);
        if (near(COURT, 13)) this.touchBalls(car, radius);
      }
    }
    for (const p of [...this.pending])
      if (sim.elapsed >= p.at) {
        this.pending.splice(this.pending.indexOf(p), 1);
        p.run();
      }
  }
  touchGas(sim, car, radius, speed) {
    for (const isl of this.gas.islands) {
      if (isl.state !== "intact") continue;
      const dx = Math.max(Math.abs(car.x - isl.x) - 3.2, 0),
        dz = Math.max(Math.abs(car.z - isl.z) - 0.6, 0);
      if (Math.hypot(dx, dz) < radius + 0.35 && speed > 4) this.explodeIsland(sim, isl);
    }
  }
  explodeIsland(sim, isl) {
    if (isl.state !== "intact") return;
    isl.state = "wrecked";
    isl.intact.visible = false;
    isl.wrecked.visible = true;
    this.stats.islands++;
    // The game's own explosion (flash, ring, debris, sound, camera shake)
    // at its largest size, plus a fuel fireball and a smoke column.
    sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "gas", x: isl.x, z: isl.z, angle: 0, time: sim.elapsed, delay: 0, chainDepth: 3, playerX: sim.player.x, playerZ: sim.player.z });
    if (sim.events.length > 64) sim.events.shift();
    this.fx.push({ kind: "burst", x: isl.x, z: isl.z, born: sim.elapsed, size: 1.6 });
    for (const px of [-1.3, 1.3]) this.fx.push({ kind: "burn", x: isl.x + px, z: isl.z + (Math.random() - 0.5) * 0.4, born: sim.elapsed + 0.4, size: 0.75 });
    // Pump heads and panels thrown out; they land and stay.
    for (let i = 0; i < 2; i++) this.throwChunk(0, isl.x + (i ? 1.3 : -1.3), isl.z, 7 + i * 2, i * 3.1 + Math.random());
    for (let i = 0; i < 10; i++) this.throwChunk(1, isl.x, isl.z, 5 + Math.random() * 6, Math.random() * Math.PI * 2);
    // Blast: wrecks police cars right at the pumps, shoves and damages
    // those further out, hurts the player a little if close.
    for (const c of sim.police) {
      if (c.state !== "active") continue;
      const dx = c.x - isl.x, dz = c.z - isl.z, d = Math.hypot(dx, dz);
      if (d < 7) {
        c.lastDamageCause = "gas";
        sim.explodePolice(c);
        this.stats.policeWrecked++;
      } else if (d < 14) {
        const k = 1 - d / 14;
        c.health = Math.max(1, c.health - 45 * k);
        c.vx += (dx / d) * 10 * k;
        c.vz += (dz / d) * 10 * k;
      }
    }
    const pd = Math.hypot(sim.player.x - isl.x, sim.player.z - isl.z);
    if (pd < 10) sim.damage(24 * (1 - pd / 10));
    for (const it of this.items)
      if (it.state === "stand") {
        const dx = it.spec.x - isl.x, dz = it.spec.z - isl.z, d = Math.hypot(dx, dz);
        if (d < 10) this.knock(it, dx / (d || 1), dz / (d || 1));
      }
    // Shop glass blown in; the canopy slumps toward the blast.
    this.gas.glass.visible = false;
    this.gas.glassBroken.visible = true;
    const wrecked = this.gas.islands.filter((i) => i.state === "wrecked").length;
    const cv = this.gas.canopy;
    if (wrecked >= 2) cv.target = { rx: 0, rz: 0.06, dy: -2.4 };
    else {
      const sign = isl.k === 0 ? -1 : 1; // north island: north edge down
      const th = Math.asin(2.5 / cv.plan.d);
      cv.target = { rx: sign * th, rz: 0.04, dy: -(cv.plan.d / 2) * Math.sin(th) };
    }
    // The other island goes up a moment later.
    for (const other of this.gas.islands)
      if (other.state === "intact" && Math.hypot(other.x - isl.x, other.z - isl.z) < 7)
        this.pending.push({ at: sim.elapsed + 0.45, run: () => this.explodeIsland(sim, other) });
  }
  touchFountain(sim, car, radius, speed) {
    const f = this.park.fountain;
    if (f.state !== "intact") return;
    const dx = car.x - f.x, dz = car.z - f.z;
    if (Math.hypot(dx, dz) > FOUNTAIN_R + radius + 0.45 || speed < 4) return;
    f.state = "broken";
    this.stats.fountain++;
    const a = Math.atan2(dx, dz);
    f.intact.visible = f.water.visible = false;
    f.broken.visible = f.spill.visible = true;
    f.broken.rotation.y = f.spill.rotation.y = a;
    f.leakAt = sim.elapsed;
    f.leakDir = a;
    // Burst: a fan of water thrown up and away from the car.
    for (let i = 0; i < 150; i++) {
      const s = 1.5 + Math.random() * 3, h = Math.random() * Math.PI * 2;
      this.dropList.push({
        x: f.x + Math.sin(h) * 0.6, y: TOP + 1.0, z: f.z + Math.cos(h) * 0.6,
        vx: Math.sin(h) * s - Math.sin(a) * 1.5, vy: 4 + Math.random() * 5, vz: Math.cos(h) * s - Math.cos(a) * 1.5,
      });
    }
    f.burstAt = sim.elapsed;
    this.renderer?.cameraRig?.kick?.(0.35);
  }
  touchItems(car, radius, speed) {
    if (speed < 2) return;
    for (const it of this.items) {
      if (it.state !== "stand") continue;
      const s = it.spec;
      let hit = false, nx = car.vx || 0, nz = car.vz || 0;
      if (it.kind === "panel") {
        // Distance from the car to the panel's segment.
        const ax = s.x, az = s.z, bx = ax + Math.cos(s.ry) * s.len, bz = az - Math.sin(s.ry) * s.len;
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
        const t = Math.max(0, Math.min(1, ((car.x - ax) * ex + (car.z - az) * ez) / l2));
        hit = Math.hypot(car.x - (ax + ex * t), car.z - (az + ez * t)) < radius + 0.12;
        // Fall away from the car, flat across the panel.
        const px = -ez / Math.sqrt(l2), pz = ex / Math.sqrt(l2);
        const side = (car.vx || 0) * px + (car.vz || 0) * pz >= 0 ? 1 : -1;
        nx = px * side;
        nz = pz * side;
      } else {
        const x = it.kind === "hoop" ? s.x - Math.cos(s.ry) * 0.6 : s.x;
        hit = Math.hypot(car.x - x, car.z - s.z) < radius + it.r;
        const l = Math.hypot(nx, nz) || 1;
        nx /= l;
        nz /= l;
      }
      if (hit) this.knock(it, nx, nz);
    }
  }
  knock(it, dx, dz) {
    it.state = "falling";
    it.t = 0;
    it.dir = { x: dx, z: dz };
    it.spinTo = (it.spin || 0) * (Math.random() - 0.5) * 2;
    const key = { bench: "benches", lamp: "lamps", bin: "bins", panel: "panels", hoop: "hoops" }[it.kind];
    this.stats[key]++;
    if (it.kind === "hoop")
      for (const b of this.balls)
        if (Math.hypot(b.x - it.spec.x, b.z - it.spec.z) < 9) {
          b.rest = false;
          b.vx += (Math.random() - 0.5) * 6 + dx * 3;
          b.vz += (Math.random() - 0.5) * 6 + dz * 3;
          b.vy += 3 + Math.random() * 3;
        }
  }
  touchBalls(car, radius) {
    for (const b of this.balls) {
      const dx = b.x - car.x, dz = b.z - car.z, d = Math.hypot(dx, dz);
      if (d < radius + 0.35) {
        b.rest = false;
        b.vx = (car.vx || 0) * 0.9 + (dx / (d || 1)) * 3;
        b.vz = (car.vz || 0) * 0.9 + (dz / (d || 1)) * 3;
        b.vy = 3 + Math.random() * 2;
      }
    }
  }
  throwChunk(kind, x, z, speed, heading) {
    if (this.chunkCounts[kind] >= 48) return;
    const index = this.chunkCounts[kind]++;
    this.chunkKinds[kind].count = this.chunkCounts[kind];
    this.chunks.push({ kind, index, x, y: TOP + 1.2, z, vx: Math.sin(heading) * speed * 0.5, vy: 6 + speed * 0.4, vz: Math.cos(heading) * speed * 0.5, rx: 0, rz: 0, spin: 4 + Math.random() * 6, done: false });
  }

  // ------------------------------------------------------------ render --
  render(dt, sim) {
    if (sim.runNumber !== this.run) this.reset(sim);
    const now = sim.elapsed;
    // Falling pieces: ease into the fallen pose, then freeze.
    const dirty = new Set();
    for (const it of this.items)
      if (it.state === "falling") {
        it.t = Math.min(1, it.t + dt / 0.5);
        this.pose(it, it.t * it.t);
        dirty.add(it.kind);
        if (it.t >= 1) it.state = "down";
      }
    for (const k of dirty) this.meshes[k].instanceMatrix.needsUpdate = true;
    // Balls: bounce until they rest, then stop being updated.
    let ballsMoved = false;
    this.balls.forEach((b, i) => {
      if (b.rest) return;
      ballsMoved = true;
      b.vy -= 9.8 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const floor = TOP + 0.15;
      if (b.y < floor) {
        b.y = floor;
        b.vy = Math.abs(b.vy) > 1 ? -b.vy * 0.55 : 0;
        b.vx *= 0.8;
        b.vz *= 0.8;
      }
      if (b.y === floor && Math.hypot(b.vx, b.vz) < 0.3 && b.vy === 0) b.rest = true;
      this.ballPose(b, i);
    });
    if (ballsMoved) this.ballMesh.instanceMatrix.needsUpdate = true;
    // Debris chunks fly, land, then freeze where they are.
    const touched = new Set();
    for (const c of this.chunks) {
      if (c.done) continue;
      c.vy -= 14 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rx += c.spin * dt;
      if (c.y <= TOP + 0.12) {
        c.y = TOP + 0.12;
        c.rx = Math.round(c.rx / Math.PI) * Math.PI;
        c.done = true;
      }
      this.q.setFromEuler(new THREE.Euler(c.rx, c.index, 0));
      this.m.compose(this.v.set(c.x, c.y, c.z), this.q, this.s.set(1, 1, 1));
      this.chunkKinds[c.kind].setMatrixAt(c.index, this.m);
      touched.add(c.kind);
    }
    for (const k of touched) this.chunkKinds[k].instanceMatrix.needsUpdate = true;
    this.canopyStep(dt);
    this.fxStep(now);
    this.waterStep(dt, now);
  }
  pose(it, k) {
    const s = it.spec;
    const ang = it.fall * k;
    // Tip over about the base, away from the hit; slide a little; spin.
    this.q.setFromAxisAngle(this.v.set(it.dir.z, 0, -it.dir.x), ang);
    this.q2.setFromAxisAngle(UP, s.ry + (it.spinTo || 0) * k);
    this.q.multiply(this.q2);
    const sx = it.kind === "panel" ? s.len / 2.4 : 1;
    this.m.compose(
      this.v.set(s.x + it.dir.x * it.slide * k, TOP + it.lift * k, s.z + it.dir.z * it.slide * k),
      this.q,
      this.s.set(sx, 1, 1),
    );
    this.meshes[it.kind].setMatrixAt(it.i, this.m);
  }
  ballPose(b, i) {
    this.m.makeTranslation(b.x, b.y, b.z);
    this.ballMesh.setMatrixAt(i, this.m);
  }
  canopyPose() {
    const cv = this.gas.canopy;
    cv.pivot.rotation.set(cv.now.rx, 0, cv.now.rz);
    cv.pivot.position.y = TOP + cv.plan.h + 0.3 + cv.now.dy;
  }
  canopyStep(dt) {
    const cv = this.gas.canopy;
    const k = 1 - Math.exp(-dt * 6);
    let moved = false;
    for (const key of ["rx", "rz", "dy"]) {
      const d = cv.target[key] - cv.now[key];
      if (Math.abs(d) > 1e-4) {
        cv.now[key] += d * k;
        moved = true;
      }
    }
    if (moved) this.canopyPose();
  }
  fxStep(now) {
    // Fire and smoke puffs, rebuilt each frame from the few live sources.
    let nf = 0, ns = 0;
    const flame = (x, y, z, r, ci) => {
      if (nf >= 96 || r <= 0.02) return;
      this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.set(r, r * 1.25, r));
      this.fire.setMatrixAt(nf, this.m);
      this.fire.setColorAt(nf++, this.fireColors[ci]);
    };
    const puff = (x, y, z, r) => {
      if (ns >= 64 || r <= 0.02) return;
      this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.set(r, r * 0.85, r));
      this.smoke.setMatrixAt(ns++, this.m);
    };
    for (const f of this.fx) {
      const t = now - f.born;
      if (t < 0) continue;
      if (f.kind === "burst") {
        if (t > 4.5) continue;
        const grow = Math.min(1, t / 0.35), fade = Math.max(0, 1 - Math.max(0, t - 0.6) / 1.0);
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9;
          const r = f.size * (1.6 + (i % 3) * 0.5) * grow * fade;
          flame(f.x + Math.sin(a) * 1.4 * grow, TOP + 1.2 + (i % 3) * 0.9 * grow + t * 1.2, f.z + Math.cos(a) * 1.4 * grow, r, i % 2);
        }
        flame(f.x, TOP + 1.5 + t, f.z, f.size * 1.5 * grow * fade, 2);
        for (let i = 0; i < 6; i++) {
          const tt = t - i * 0.25;
          if (tt < 0) continue;
          puff(f.x + Math.sin(i * 2.1) * 1.2, TOP + 2.5 + tt * 2.4, f.z + Math.cos(i * 2.1) * 1.2, f.size * (1.0 + tt * 0.45) * Math.max(0, 1 - tt / 4.2));
        }
      } else {
        // A spot that keeps burning: flickering flames, a thin smoke trail.
        const fl = 0.85 + Math.sin(now * 17 + f.x) * 0.1 + Math.sin(now * 29 + f.z) * 0.07;
        flame(f.x, TOP + 0.55, f.z, f.size * 0.75 * fl, 0);
        flame(f.x + 0.15, TOP + 0.85, f.z - 0.1, f.size * 0.55 * fl, 1);
        flame(f.x - 0.05, TOP + 1.05, f.z + 0.05, f.size * 0.32 * fl, 2);
        for (let i = 0; i < 2; i++) {
          const ph = ((now * 0.35 + i * 0.5 + f.x * 0.1) % 1 + 1) % 1;
          puff(f.x + ph * 0.6, TOP + 1.5 + ph * 4.5, f.z, f.size * (0.5 + ph * 0.9) * (1 - ph));
        }
      }
    }
    this.fire.count = nf;
    this.smoke.count = ns;
    if (nf) {
      this.fire.instanceMatrix.needsUpdate = true;
      this.fire.instanceColor.needsUpdate = true;
    }
    if (ns) this.smoke.instanceMatrix.needsUpdate = true;
  }
  waterStep(dt, now) {
    const f = this.park.fountain;
    // Geyser: a column of water shooting up from the broken pipe, 1.2 s.
    const gt = f.burstAt == null ? -1 : now - f.burstAt;
    this.geyser.visible = gt >= 0 && gt < 1.2;
    if (this.geyser.visible) {
      const up = Math.min(1, gt / 0.18), fade = 1 - Math.max(0, gt - 0.5) / 0.7;
      this.geyser.scale.set(0.6 + up * 0.6, Math.max(0.05, up * fade), 0.6 + up * 0.6);
      this.geyser.material.opacity = 0.75 * fade;
    }
    if (f.state === "intact") {
      // Gentle shimmer on the falling sheets and the jet.
      for (let i = 0; i < f.sheets.length; i++) f.sheets[i].scale.x = 0.9 + Math.sin(now * 6 + i) * 0.1;
      f.jet.scale.y = 0.9 + Math.sin(now * 9) * 0.12;
    } else if (now - f.leakAt > 0.6 && this.dropList.length < 200) {
      // The broken pipe keeps spurting a little.
      for (let i = 0; i < 2; i++)
        this.dropList.push({
          x: f.x + (Math.random() - 0.5) * 0.15, y: TOP + 0.85, z: f.z + (Math.random() - 0.5) * 0.15,
          vx: Math.sin(f.leakDir) * 0.8 + (Math.random() - 0.5) * 0.9, vy: 3.2 + Math.random() * 1.6, vz: Math.cos(f.leakDir) * 0.8 + (Math.random() - 0.5) * 0.9,
        });
    }
    let n = 0;
    const keep = [];
    for (const d of this.dropList) {
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y < TOP + 0.05) continue;
      keep.push(d);
      if (n < 220) {
        this.m.makeTranslation(d.x, d.y, d.z);
        this.drops.setMatrixAt(n++, this.m);
      }
    }
    this.dropList = keep;
    this.drops.count = n;
    if (n) this.drops.instanceMatrix.needsUpdate = true;
  }
}
