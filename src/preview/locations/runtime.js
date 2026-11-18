// Location destruction for the preview. Runs beside the game's own
// simulation (it never changes police AI, arrest rules, controls or car
// handling): after each simulation step it looks for cars touching
// location objects and breaks them; each frame it animates what is
// falling or burning. Everything broken stays broken until the run is
// restarted (sim.runNumber changes). Settled pieces stop updating.
import * as THREE from "three";
import { CONFIG } from "../../game/config.js";
import { C, B, G, bake, pieceGeometry, bakedMaterial, parkBench, lampPost, binPair } from "./parts.js";
import { buildGas } from "./gas.js";
import { buildCourt, fencePanel, hoop } from "./court.js";
import { buildPark } from "./park.js";
import { GAS, COURT, PARK, FOUNTAIN_R } from "./layout.js";
import * as P from "./props.js";
import { civilianCarGeometry } from "../../render/kit.js";

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
  // Park features and yard props.
  statue: { build: P.statue, r: 0.95, fall: 1.5, lift: 0.3, slide: 1.4, y0: 1.27, viaSolid: true },
  sculptureA: { build: P.sculptureA, r: 0.8, fall: 1.4, lift: 0.4, slide: 1.0 },
  sculptureB: { build: P.sculptureB, r: 0.75, fall: 1.45, lift: 0.3, slide: 0.8 },
  bikeRack: { build: P.bikeRack, r: 1.3, fall: Math.PI / 2, lift: 0.25, slide: 1.2, spin: 0.8 },
  lampPole: { build: P.lampPole, r: 0.4, fall: 1.48, lift: 0.25, slide: 0 },
  cone: { build: P.cone, r: 0.35, fall: Math.PI / 2, lift: 0.2, slide: 3.0, spin: 3 },
  barrier: { build: P.barrier, r: 1.0, fall: Math.PI / 2, lift: 0.25, slide: 1.6, spin: 1 },
  crate: { build: P.crate, r: 0.6, fall: Math.PI / 2, lift: 0.45, slide: 2.0, spin: 2 },
  pallet: { build: P.pallet, r: 0.8, fall: 1.2, lift: 0.4, slide: 1.4, spin: 1 },
  planter: { build: (g) => P.planter(g), broken: (g) => P.planter(g, true), r: 1.0 },
  kiosk: { build: (g) => P.kiosk(g), broken: (g) => P.kiosk(g, true), r: 1.4 },
};
// Pushable vehicles: shoved out of the way by any car (the car itself is
// not slowed), take damage from hard hits and end up as wrecks.
const PUSHERS = {
  iceTruck: { build: (g) => P.iceTruck(g), wreck: (g) => P.iceTruck(g, true), L: 4.6, W: 2.0, mass: 1.6, wreckAt: 14 },
  parkedCar: { geometry: () => civilianCarGeometry(), L: 3.7, W: 1.8, mass: 1.0, wreckAt: 16 },
  forklift: { build: P.forklift, L: 2.6, W: 1.3, mass: 0.9, wreckAt: 10 },
};
const CAR_COLORS = [0x2457c5, 0xf4f4f0, 0xd62f2a, 0x3a3940, 0x2fa36b, 0xf5c01a, 0xf0781e, 0x1f6e6a];
const CELL = 60;
const SMALL = new Set(["cone", "bin", "crate", "pallet", "barrier", "lamp", "lampPole", "bench", "planter", "bikeRack"]);
const cellOf = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
// An instanced group for one map cell: bounds cover the cell (plus room
// for pieces that get knocked or shoved a few metres out of it).
function cellMesh(scene, geometry, material, count, cell) {
  const m = new THREE.InstancedMesh(geometry, material, count);
  const [cx, cz] = cell.split(",").map(Number);
  m.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * CELL, 2, (cz + 0.5) * CELL), CELL * 0.75 + 14);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
}

export class LocationsRuntime {
  constructor(scene, sim, renderer, layout = sim.layout) {
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
    // Park features and yard props (plan.js), plus their static pieces
    // (plinths, yard ground, cabins, containers) baked into one mesh.
    const groups = [...(layout.features || []), ...(layout.yards || [])];
    for (const f of groups)
      for (const it of f.items) (specs[it.kind] ||= []).push(it);
    // One baked mesh per park / yard (each culled on its own).
    for (const f of layout.features || []) {
      const decor = new THREE.Group();
      for (const it of f.items) if (it.kind === "statue") P.plinth(G(decor, it.x, it.y, it.z, it.ry));
      if (decor.children.length) scene.add(bake(decor));
    }
    for (const y of layout.yards || []) {
      const decor = new THREE.Group();
      P.yardDecor(decor, y);
      scene.add(bake(decor));
    }
    // Instanced copies are grouped by 60 m map cell, each group with real
    // bounds, so only the cells on screen (and in the shadow camera) are
    // drawn. Broken / wrecked variants get a copy only once something
    // breaks (a group with nothing broken is not drawn at all).
    this.items = [];
    const groupBy = (list, kindOf) => {
      const out = new Map();
      for (const s of list) {
        const key = `${kindOf(s)}|${cellOf(s.x, s.z)}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(s);
      }
      return out;
    };
    const geos = {};
    const geo = (key, build) => (geos[key] ||= pieceGeometry(build));
    const allSpecs = Object.entries(specs).flatMap(([kind, list]) => list.map((s) => ({ ...s, kind })));
    for (const [key, list] of groupBy(allSpecs, (s) => s.kind)) {
      const kind = list[0].kind, def = KINDS[kind], cell = key.split("|")[1];
      const live = cellMesh(scene, geo(kind, def.build), bakedMaterial, list.length, cell);
      const broken = def.broken ? cellMesh(scene, geo(kind + "!", def.broken), bakedMaterial, list.length, cell) : null;
      // Small street furniture casts no shadow (as the game's own street
      // props); big pieces do.
      if (SMALL.has(kind)) for (const m of [live, broken]) if (m) m.castShadow = false;
      list.forEach((spec, idx) => this.items.push({ kind, spec, ...def, mesh: live, idx, bmesh: broken }));
    }
    // Pushable vehicles.
    this.pushers = [];
    this.pusherGroups = [];
    const pushSpecs = groups.flatMap((f) => f.pushers);
    const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true });
    for (const [key, list] of groupBy(pushSpecs, (s) => s.kind)) {
      const kind = list[0].kind, def = PUSHERS[kind], cell = key.split("|")[1];
      const g = def.geometry ? (geos[kind] ||= def.geometry()) : geo(kind, def.build);
      const mat = def.geometry ? carMat : bakedMaterial;
      const live = cellMesh(scene, g, mat, list.length, cell);
      const dead = cellMesh(scene, def.wreck ? geo(kind + "!", def.wreck) : g, mat, list.length, cell);
      if (def.geometry) list.forEach((p, i) => live.setColorAt(i, new THREE.Color(CAR_COLORS[p.color ?? i % 8])));
      if (def.geometry) for (let i = 0; i < list.length; i++) dead.setColorAt(i, new THREE.Color(0x3a3437));
      this.pusherGroups.push({ live, dead });
      list.forEach((spec, idx) => this.pushers.push({ kind, spec, def, mesh: live, idx, dmesh: dead }));
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
    // Geyser: a fat, tall column (11 m) with a ragged top.
    const gg = new THREE.CylinderGeometry(0.55, 0.95, 11, 8, 3);
    gg.translate(0, 5.5, 0);
    this.geyser = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: C.waterLight, transparent: true, opacity: 0.75, depthWrite: false }));
    this.geyser.position.set(PARK.x, TOP + 0.5, PARK.z);
    this.geyser.visible = false;
    scene.add(this.geyser);
    // Splash rings: low translucent walls that race out over the plaza.
    this.rings = [0, 1].map(() => {
      const g = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
      g.translate(0, 0.5, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: C.waterLight, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set(PARK.x, TOP + 0.05, PARK.z);
      m.visible = false;
      scene.add(m);
      return m;
    });
    this.stats = { islands: 0, fountain: 0, policeWrecked: 0, knocked: 0, broken: 0, pushed: 0, wrecked: 0 };
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
    this.chunkKinds.forEach((m) => {
      m.count = 0;
      m.visible = false;
    });
    this.dropList = [];
    this.speeds = new WeakMap();
    for (const it of this.items)
      if (it.bmesh) {
        it.bmesh.count = 0;
        it.bmesh.visible = false;
      }
    for (const it of this.items) {
      it.bidx = null;
      it.state = "stand";
      it.t = 0;
      it.dir = { x: 0, z: 1 };
      it.dy = 0;
      this.pose(it, 0);
    }
    for (const g of this.pusherGroups) {
      g.dead.count = 0;
      g.dead.visible = false;
    }
    for (const p of this.pushers) {
      Object.assign(p, { x: p.spec.x, z: p.spec.z, ry: p.spec.ry, vx: 0, vz: 0, spin: 0, dmg: 0, hitAt: -1, wrecked: false, moving: false, didx: null });
      this.pusherPose(p);
    }
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
      // Every breakable and pushable piece (each test starts with a cheap
      // 6 m box reject, so far pieces cost almost nothing).
      this.touchItems(car, radius, speed);
      this.touchPushers(sim, car, radius);
      if (near(GAS, 13)) this.touchGas(sim, car, radius, speed);
      if (near(PARK, 13)) this.touchFountain(sim, car, radius, speed);
      if (near(GAS, 13) || near(COURT, 13) || near(PARK, 13)) {
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
    for (let i = 0; i < 10; i++) this.throwChunk(1, f.x, f.z, 4 + Math.random() * 5, a + Math.PI + (Math.random() - 0.5) * 2.2);
    this.renderer?.cameraRig?.kick?.(0.6);
  }
  touchItems(car, radius, speed) {
    if (speed < 2) return;
    for (const it of this.items) {
      if (it.state !== "stand") continue;
      const s = it.spec;
      if (Math.abs(car.x - s.x) > 6 || Math.abs(car.z - s.z) > 6) continue;
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
        // A statue is reached through its solid plinth (the car stops at
        // the plinth; a hard enough hit knocks the figure off).
        hit = Math.hypot(car.x - x, car.z - s.z) < radius + it.r + (it.viaSolid ? 0.35 : 0) && (!it.viaSolid || speed > 4);
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
    this.stats[it.broken ? "broken" : "knocked"]++;
    if (it.broken) {
      // Swapped for its broken model where it stood; bits fly off.
      it.state = "down";
      this.pose(it, 0);
      for (let i = 0; i < 5; i++) this.throwChunk(1, it.spec.x, it.spec.z, 3 + Math.random() * 3, Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.6);
      return;
    }
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
    this.chunkKinds[kind].visible = true;
    this.chunks.push({ kind, index, x, y: TOP + 1.2, z, vx: Math.sin(heading) * speed * 0.5, vy: 6 + speed * 0.4, vz: Math.cos(heading) * speed * 0.5, rx: 0, rz: 0, spin: 4 + Math.random() * 6, done: false });
  }

  // Pushable vehicles: two circles along the body; a car that overlaps one
  // shoves the vehicle out (position and velocity), the car is not slowed.
  touchPushers(sim, car, radius) {
    for (const p of this.pushers) {
      if (Math.abs(car.x - p.x) > 5 || Math.abs(car.z - p.z) > 5) continue;
      const ax = Math.sin(p.ry), az = Math.cos(p.ry), r = p.def.W / 2 + 0.1;
      for (const o of [-p.def.L / 4, p.def.L / 4]) {
        const cx = p.x + ax * o, cz = p.z + az * o;
        const dx = cx - car.x, dz = cz - car.z, d = Math.hypot(dx, dz);
        if (d >= radius + r || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, push = radius + r - d;
        p.x += nx * push;
        p.z += nz * push;
        const closing = Math.max(0, (car.vx || 0) * nx + (car.vz || 0) * nz);
        p.vx += (nx * closing * 0.9) / p.def.mass;
        p.vz += (nz * closing * 0.9) / p.def.mass;
        p.spin += ((nx * az - nz * ax) * closing * 0.35 * Math.sign(o)) / p.def.mass;
        p.moving = true;
        // Damage counts once per hit (a long shove is one hit), so a gentle
        // nudge never wrecks anything and a hard ram (or a few) does.
        if (closing > 4 && sim.elapsed - (p.hitAt ?? -1) > 0.6) {
          p.hitAt = sim.elapsed;
          p.dmg += closing;
          this.stats.pushed++;
          if (!p.wrecked && p.dmg >= p.def.wreckAt) {
            p.wrecked = true;
            this.stats.wrecked++;
            this.fx.push({ kind: "smolder", x: p.x, z: p.z, born: sim.elapsed, size: 0.8, follow: p });
            for (let i = 0; i < 6; i++) this.throwChunk(1, p.x, p.z, 3 + Math.random() * 3, Math.random() * 6.3);
          }
        }
      }
    }
  }
  pushersStep(sim, dt) {
    for (const p of this.pushers) {
      if (!p.moving) continue;
      const was = { x: p.x, z: p.z };
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.ry += p.spin * dt;
      const k = Math.exp(-dt * 2.2);
      p.vx *= k;
      p.vz *= k;
      p.spin *= k;
      // Keep out of buildings and walls (same collision as the cars).
      sim.constrain(p, p.def.W / 2 + 0.3, was);
      if (Math.hypot(p.vx, p.vz) < 0.05 && Math.abs(p.spin) < 0.02) {
        p.vx = p.vz = p.spin = 0;
        p.moving = false; // settled: no more updates
      }
      this.pusherPose(p);
    }
  }
  pusherPose(p) {
    this.q.setFromAxisAngle(UP, p.ry);
    this.m.compose(this.v.set(p.x, p.spec.y ?? 0.05, p.z), this.q, this.s.setScalar(p.wrecked ? 0 : 1));
    p.mesh.setMatrixAt(p.idx, this.m);
    p.mesh.instanceMatrix.needsUpdate = true;
    if (!p.wrecked) return;
    if (p.didx == null) {
      p.didx = p.dmesh.count++;
      p.dmesh.visible = true;
    }
    this.m.compose(this.v, this.q, this.s.setScalar(1));
    p.dmesh.setMatrixAt(p.didx, this.m);
    p.dmesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ render --
  render(dt, sim) {
    if (sim.runNumber !== this.run) this.reset(sim);
    const now = sim.elapsed;
    // Falling pieces: ease into the fallen pose, then freeze.
    for (const it of this.items)
      if (it.state === "falling") {
        it.t = Math.min(1, it.t + dt / 0.5);
        this.pose(it, it.t * it.t);
        if (it.t >= 1) it.state = "down";
      }
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
    this.pushersStep(sim, dt);
    this.canopyStep(dt);
    this.fxStep(now);
    this.waterStep(dt, now);
  }
  pose(it, k) {
    const s = it.spec;
    if (it.broken) {
      const down = it.state !== "stand";
      this.q.setFromAxisAngle(UP, s.ry);
      const y = s.y ?? TOP;
      this.m.compose(this.v.set(s.x, y, s.z), this.q, this.s.setScalar(down ? 0 : 1));
      it.mesh.setMatrixAt(it.idx, this.m);
      it.mesh.instanceMatrix.needsUpdate = true;
      if (!down) return;
      if (it.bidx == null) {
        it.bidx = it.bmesh.count++;
        it.bmesh.visible = true;
      }
      this.m.compose(this.v.set(s.x, y, s.z), this.q, this.s.setScalar(1));
      it.bmesh.setMatrixAt(it.bidx, this.m);
      it.bmesh.instanceMatrix.needsUpdate = true;
      return;
    }
    const ang = it.fall * k;
    // Tip over about the base, away from the hit; slide a little; spin.
    this.q.setFromAxisAngle(this.v.set(it.dir.z, 0, -it.dir.x), ang);
    this.q2.setFromAxisAngle(UP, s.ry + (it.spinTo || 0) * k);
    this.q.multiply(this.q2);
    const sx = it.kind === "panel" ? s.len / 2.4 : 1;
    this.m.compose(
      this.v.set(s.x + it.dir.x * it.slide * k, (s.y ?? TOP) + (it.y0 || 0) + (it.lift - (it.y0 || 0)) * k, s.z + it.dir.z * it.slide * k),
      this.q,
      this.s.set(sx, 1, 1),
    );
    it.mesh.setMatrixAt(it.idx, this.m);
    it.mesh.instanceMatrix.needsUpdate = true;
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
      if (f.kind === "smolder") {
        const fx = f.follow ? f.follow.x : f.x, fz = f.follow ? f.follow.z : f.z;
        for (let i = 0; i < 3; i++) {
          const ph = ((now * 0.3 + i / 3) % 1 + 1) % 1;
          puff(fx + ph * 0.5, TOP + 1.8 + ph * 4, fz, f.size * (0.4 + ph) * (1 - ph));
        }
        continue;
      }
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
    this.fire.visible = nf > 0;
    this.smoke.visible = ns > 0;
    if (nf) {
      this.fire.instanceMatrix.needsUpdate = true;
      this.fire.instanceColor.needsUpdate = true;
    }
    if (ns) this.smoke.instanceMatrix.needsUpdate = true;
  }
  waterStep(dt, now) {
    const f = this.park.fountain;
    // Geyser: shoots up in 0.2 s, stands wobbling, then collapses (2.6 s);
    // its crown throws spray; two splash rings race out; puddles spread.
    const gt = f.burstAt == null ? -1 : now - f.burstAt;
    this.geyser.visible = gt >= 0 && gt < 2.6;
    if (this.geyser.visible) {
      const up = Math.min(1, gt / 0.2), fade = gt < 1.6 ? 1 : 1 - (gt - 1.6) / 1.0;
      const wob = 1 + Math.sin(now * 23) * 0.06;
      this.geyser.scale.set(wob * (0.7 + up * 0.5), Math.max(0.05, up * (0.85 + Math.sin(now * 9) * 0.08) * fade), wob * (0.7 + up * 0.5));
      this.geyser.material.opacity = 0.7 * Math.min(1, fade + 0.2);
      if (gt < 1.8 && this.dropList.length < 210)
        for (let i = 0; i < 3; i++) {
          const h = Math.random() * Math.PI * 2, s = 2 + Math.random() * 2.5;
          this.dropList.push({ x: f.x, y: TOP + 0.5 + 11 * up * fade * 0.9, z: f.z, vx: Math.sin(h) * s, vy: 1 + Math.random() * 2, vz: Math.cos(h) * s });
        }
    }
    this.rings.forEach((ring, i) => {
      const t = gt - i * 0.25;
      ring.visible = gt >= 0 && t >= 0 && t < 1.1;
      if (!ring.visible) return;
      const r = 2.4 + t * 7;
      ring.scale.set(r, 1.3 * (1 - t / 1.1) + 0.1, r);
      ring.material.opacity = 0.6 * (1 - t / 1.1);
    });
    if (f.state === "broken") {
      const grow = Math.min(1, Math.max(0, gt) / 2.2);
      for (const p of f.puddles) p.scale.copy(p.userData.full).multiplyScalar(0.15 + 0.85 * grow).setY(1);
      f.pour.scale.y = 0.9 + Math.sin(now * 7) * 0.1;
      f.leakJet.scale.set(1 + Math.sin(now * 19) * 0.1, 0.85 + Math.sin(now * 5.3) * 0.15, 1);
    }
    if (f.state === "intact") {
      // Gentle shimmer on the falling sheets and the jet.
      for (let i = 0; i < f.sheets.length; i++) f.sheets[i].scale.set(1 + Math.sin(now * 6 + i) * 0.015, 1, 1 + Math.sin(now * 6 + i) * 0.015);
      f.jet.scale.y = 0.9 + Math.sin(now * 9) * 0.12;
    } else if (now - f.leakAt > 2.0 && this.dropList.length < 60) {
      // The broken pipe keeps spurting a little.
      for (let i = 0; i < 2; i++)
        this.dropList.push({
          x: f.x + (Math.random() - 0.5) * 0.2, y: TOP + 4.2, z: f.z + (Math.random() - 0.5) * 0.2,
          vx: (Math.random() - 0.5) * 2.4, vy: 0.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 2.4,
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
    this.drops.visible = n > 0;
    if (n) this.drops.instanceMatrix.needsUpdate = true;
  }
}
