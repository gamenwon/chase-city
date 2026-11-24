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
import { GasCollapse } from "./gas-collapse.js";
import { Gantries, gantryWorld } from "./gantries.js";
import { GasDepot, GASDEPOT } from "./gasdepot.js";
import { buildCourt, fencePanel, hoop } from "./court.js";
import { buildPark } from "./park.js";
import { GAS, COURT, PARK, FOUNTAIN_R } from "./layout.js";
import * as P from "./props.js";
import { VehicleSystem } from "./vehicles.js";
import { FlyerSystem } from "./furniture.js";
import { dinerDecor } from "./diner.js";
import { bigsiteDecor } from "./bigsite.js";
import { yardDecor } from "./yard.js";
import { funparkDecor } from "./funpark.js";
import { BigProps } from "./bigprops.js";
import { siteDecor } from "./sites-decor.js";
import { PERIMETER, perimeterBuilding } from "./perimeter.js";
import { Storefronts } from "./storefronts.js";
import { AdSystem } from "./ads.js";
import { hitPillar } from "../../game/overpass.js";
import { PropBatch, PropInstances } from "./batch.js";

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
  brush: { build: (g) => P.brush(g), broken: (g) => P.brush(g, true), r: 0.45, burst: "foam" },
  stall: { build: (g) => P.stall(g), broken: (g) => P.stall(g, true), r: 1.6, burst: "fruit" },
  booth: { build: (g) => P.booth(g), broken: (g) => P.booth(g, true), r: 0.9, burst: "glass" },
  flagpole: { build: P.flagpole, r: 0.3, fall: 1.48, lift: 0.15, slide: 0 },
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

// Debris pieces per kind (instanced; settled pieces cost nothing to update).
const CHUNKS = 160;
export class LocationsRuntime {
  constructor(scene, sim, renderer, layout = sim.layout) {
    // Everything this builds hangs off one group, so a new generated city
    // can drop the old locations in one go (dispose).
    this.parent = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    scene = this.root;
    this.scene = scene;
    this.renderer = renderer;
    this.gas = buildGas(scene);
    this.collapse = new GasCollapse(this.gas, { x: GAS.x, y: 0, z: GAS.z });
    this.gantries = new Gantries(scene, [...(layout.yards || []), ...(layout.arches || [])]);
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
      if (f.kind === "diner") dinerDecor(decor, f);
      if (f.kind === "bigsite") bigsiteDecor(decor, f);
      if (f.kind === "containers") yardDecor(decor, f);
      if (f.kind === "funpark") funparkDecor(decor, f);
      if (decor.children.length) scene.add(bake(decor));
    }
    (layout.yards || []).forEach((y, i) => {
      const decor = new THREE.Group();
      siteDecor(decor, y);
      scene.add(bake(decor));
      // A building behind some of the outer sites (scenery past the city
      // edge: not solid, nothing on any route).
      const per = layout.modular ? y.perimeter : PERIMETER[i];
      if (per && y.kind !== "corner") {
        const pg = new THREE.Group();
        perimeterBuilding(per, i * 7 + 3)(G(pg, y.x, 0, y.z, y.ry));
        const baked = bake(pg);
        // Past the city edge: its shadow falls on nothing that matters.
        if (layout.modular) baked.traverse((o) => o.isMesh && (o.castShadow = false));
        scene.add(baked);
      }
    });
    // Instanced copies are grouped by 60 m map cell, each group with real
    // bounds, so only the cells on screen (and in the shadow camera) are
    // drawn. Broken / wrecked variants get a copy only once something
    // breaks (a group with nothing broken is not drawn at all).
    // Every breakable piece, loose piece and parked vehicle is one instance
    // in a single batched mesh (one draw call, culled per instance); a
    // broken variant is a second instance, hidden until it breaks.
    const multiDraw = !!renderer?.renderer?.extensions?.has?.("WEBGL_multi_draw") && !/[?&]nobatch/.test(globalThis.location?.search || "");
    this.batch = multiDraw ? new PropBatch(scene) : new PropInstances(scene);
    this.batchMode = multiDraw ? "batched" : "instanced";
    this.items = [];
    for (const [kind, list] of Object.entries(specs)) {
      const def = KINDS[kind];
      const live = this.batch.geometry(kind, () => pieceGeometry(def.build));
      const broken = def.broken ? this.batch.geometry(kind + "!", () => pieceGeometry(def.broken)) : null;
      list.forEach((spec, idx) =>
        this.items.push({ kind, spec, ...def, idx, h: this.batch.instance(live, true, spec.x, spec.z), bh: broken == null ? null : this.batch.instance(broken, false, spec.x, spec.z) }),
      );
    }
    // Parked and work vehicles (damage stages, mass), and loose things
    // that fly (café furniture, crates, scaffolding...).
    this.vehicles = new VehicleSystem(this.batch, groups.flatMap((f) => f.vehicles || []), {
      boom: (sim, v) => {
        // A wrecked vehicle goes up like a car (the game's own explosion
        // look and sound), then burns and smokes.
        sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "parked", x: v.x, z: v.z, angle: v.ry, time: sim.elapsed, delay: 0, chainDepth: v.def.mass > 3 ? 2 : 0, playerX: sim.player.x, playerZ: sim.player.z });
        if (sim.events.length > 64) sim.events.shift();
        this.fx.push({ kind: "burn", follow: v, x: v.x, z: v.z, born: sim.elapsed, size: 0.7 + Math.min(1.2, v.def.mass * 0.25), decay: true });
        for (let i = 0; i < 6; i++) this.throwChunk(1, v.x, v.z, 3 + Math.random() * 4, Math.random() * 6.3);
      },
    });
    this.storefronts = new Storefronts(scene, layout.buildings || [], {
      glass: (x, z, nx, nz) => {
        for (let i = 0; i < 10; i++) this.throwChunk(1, x, z, 2 + Math.random() * 4, Math.atan2(nx, nz) + (Math.random() - 0.5) * 1.8);
      },
      fire: (x, z, nx, nz) => {
        // Flames out of the shop window, smoke up the facade.
        for (const s of [-1.4, 1.2]) this.fx.push({ kind: "burn", x: x + nz * s, z: z - nx * s, y: TOP + 0.6, born: this.sim?.elapsed ?? 0, size: 1.1, decay: true, long: true });
      },
      // The shop's stock thrown out over the pavement (coloured boxes).
      stock: (x, z, nx, nz, n) => {
        for (let i = 0; i < n; i++) this.throwChunk(2, x + nz * (Math.random() - 0.5) * 4, z - nx * (Math.random() - 0.5) * 4, 2.5 + Math.random() * 4, Math.atan2(nx, nz) + (Math.random() - 0.5) * 1.4);
      },
      // Casual pass: what each kind of shop spills over the pavement and
      // into the road (fruit rolling away, petals fluttering, cups and
      // café chairs, market baskets and a stall front, plates and food).
      spill: (type, x, z, nx, nz, speed, f) => this.spill(type, x, z, nx, nz, speed, f),
      broke: (f, speed) => this.ads?.shopBroken(this.sim, f, speed),
      fireworks: (f, speed) => this.ads?.fireworks(this.sim, f, speed),
      // Sparks from torn wiring at the top of the window, a few seconds.
      sparks: (x, z, nx, nz) => {
        this.fx.push({ kind: "spark", x, z, nx, nz, born: this.sim?.elapsed ?? 0 });
      },
      // A gas-bottle blast in a shop, or the big one in a major building:
      // a real explosion (the shared blast system: it sets off what is
      // near it), smaller for a shop.
      blast: (x, z, k, cause) => {
        const sim = this.sim;
        if (!sim) return;
        sim.events.push({ id: ++sim.eventId, type: "explosion", cause, strength: k, x, z, angle: 0, time: sim.elapsed, delay: 0.05, chainDepth: 1, playerX: sim.player.x, playerZ: sim.player.z });
        if (sim.events.length > 64) sim.events.shift();
        sim.stats.explosions = (sim.stats.explosions || 0) + 1;
        for (let i = 0; i < 8 * k; i++) this.throwChunk(i % 2, x, z, 4 + Math.random() * 5 * k, Math.random() * 6.3);
      },
    });
    this.storefronts.later = (sec, run) => this.pending.push({ at: (this.sim?.elapsed ?? 0) + sec, run });
    // Casual pass: shop signs, neon, billboards, rooftop sculptures,
    // the fireworks shop.
    this.ads = new AdSystem(scene, layout, this.storefronts, renderer, this);
    // Container yard, amusement park, landmark statues.
    this.big = new BigProps(scene, layout, this, this.storefronts);
    this.flyers = new FlyerSystem(this.batch, groups.flatMap((f) => f.flyers || []), {
      outside: (it) => {
        const sim = this.sim;
        if (!sim) return;
        for (const b of sim.nearSolids(it.x, it.z, 1)) {
          const px = b.w / 2 + 0.3 - Math.abs(it.x - b.x), pz = b.d / 2 + 0.3 - Math.abs(it.z - b.z);
          if (px <= 0 || pz <= 0) continue;
          if (px < pz) it.x += Math.sign(it.x - b.x || 1) * px;
          else it.z += Math.sign(it.z - b.z || 1) * pz;
        }
      },
    });
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
    this.foam = new THREE.InstancedMesh(puff, new THREE.MeshLambertMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.92, depthWrite: false }), 64);
    this.dust = new THREE.InstancedMesh(puff, new THREE.MeshLambertMaterial({ color: 0xc09a6a, transparent: true, opacity: 0.7, depthWrite: false }), 48);
    for (const m of [this.fire, this.smoke, this.foam, this.dust]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    const chunkGeo = pieceGeometry((g) => {
      B(g, 0.92, 0.55, 0.72, C.red, 0, -0.27, 0);
      B(g, 0.94, 0.08, 0.74, C.yellow, 0, -0.06, 0);
    });
    const shardGeo = pieceGeometry((g) => B(g, 0.6, 0.12, 0.45, 0x9a9da3, 0, -0.06, 0));
    // A shop's stock: a carton, a blue tin, a white pack.
    const goodsGeo = pieceGeometry((g) => {
      B(g, 0.42, 0.32, 0.36, 0xc79a5c, -0.18, -0.16, 0);
      B(g, 0.2, 0.28, 0.2, 0x2f7fe0, 0.2, -0.14, 0.08);
      B(g, 0.26, 0.14, 0.2, 0xf4f1ea, 0.12, -0.07, -0.18);
    });
    this.chunkKinds = [chunkGeo, shardGeo, goodsGeo].map((geo) => {
      const m = new THREE.InstancedMesh(geo, bakedMaterial, CHUNKS);
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
    // Gas storage depot: tanks, pipes and their chain-reaction blast.
    this.depot = new GasDepot(scene, this);
    // The shared explosion system (game/blast.js) reaches the locations too.
    sim.blastListeners = [(s, e, R, k, later, depth) => this.blast(s, e, R, k, later, depth)];
    this.stats = { islands: 0, fountain: 0, policeWrecked: 0, knocked: 0, broken: 0, pushed: 0, wrecked: 0 };
    this.reset(sim);
  }

  dispose() {
    this.parent.remove(this.root);
    this.root.traverse((o) => o.geometry?.dispose?.());
  }

  // ------------------------------------------------------------ state --
  reset(sim) {
    this.run = sim.runNumber;
    this.time = 0;
    this.pending = [];
    this.fx = []; // bursts and burning spots
    this.chunks = []; // flying debris; settled ones stay put, not updated
    this.chunkCounts = [0, 0, 0];
    this.chunkKinds.forEach((m) => {
      m.count = 0;
      m.visible = false;
    });
    this.dropList = [];
    this.speeds = new WeakMap();
    for (const it of this.items) {
      it.state = "stand";
      it.t = 0;
      it.dir = { x: 0, z: 1 };
      it.dy = 0;
      this.pose(it, 0);
    }
    this.vehicles.reset();
    this.flyers.reset();
    this.storefronts.reset();
    this.ads?.reset();
    this.big?.reset();
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
    this.collapse.reset(sim);
    this.gantries.reset(sim);
    this.depot?.reset();
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
    this.sim = sim;
    if (sim.runNumber !== this.run) this.reset(sim);
    this.time = sim.elapsed;
    const cars = [sim.player, ...sim.police.filter((c) => c.state === "active")];
    // TARGET HUNT: the fleeing car smashes through the locations too.
    if (sim.target?.state === "fleeing") cars.push(sim.target);
    for (const car of cars) {
      // In the air over a dirt ramp: clear of everything on the ground.
      if (car.air && car.y > 1.0) continue;
      const sp = Math.hypot(car.vx || 0, car.vz || 0);
      const before = this.speeds.get(car) ?? sp;
      this.speeds.set(car, sp);
      const speed = Math.max(sp, before);
      const near = (c, r) => Math.abs(car.x - c.x) < r && Math.abs(car.z - c.z) < r;
      const radius = car === sim.player ? CONFIG.radius : CONFIG.policeRadius;
      // Every breakable and pushable piece (each test starts with a cheap
      // 6 m box reject, so far pieces cost almost nothing).
      this.touchItems(car, radius, speed);
      this.vehicles.touch(sim, car, radius, car === sim.player);
      this.storefronts.touch(sim, car, radius);
      this.big.touch(sim, car, radius, speed, car === sim.player);
      this.gantries.touch(sim, car, radius);
      this.depot?.touch(sim, car, radius, speed);
      this.flyers.touch(sim, car, radius, speed);
      if (near(GAS, 13)) this.touchGas(sim, car, radius, speed);
      if (near(PARK, 13)) this.touchFountain(sim, car, radius, speed);
      if (near(GAS, 13) || near(COURT, 13) || near(PARK, 13)) {
        if (near(COURT, 13)) this.touchBalls(car, radius);
      }
    }
    // Dirt-ramp landings throw up dust (and a few clods).
    for (const e of sim.city?.events || []) {
      if (e.id <= (this.seenCity ?? 0)) continue;
      this.seenCity = e.id;
      if (e.type === "pillar" && e.action === "crack") {
        // Concrete chips and a puff of dust off a cracked pillar.
        this.fx.push({ kind: "dust", x: e.x, z: e.z, born: sim.elapsed, size: 0.5 });
        for (let i = 0; i < 5; i++) this.throwChunk(1, e.x, e.z, 2 + Math.random() * 3, Math.random() * 6.3);
      }
      if (e.type === "jump" && e.action === "land") {
        this.fx.push({ kind: "dust", x: e.x, z: e.z, born: sim.elapsed, size: 0.6 + Math.min(0.8, (e.strength - 6) / 10) });
        for (let i = 0; i < 4; i++) this.throwChunk(1, e.x, e.z, 2 + Math.random() * 2, Math.random() * 6.3);
      }
    }
    this.ads.step(sim, dt);
    this.big.step(sim, dt);
    for (const p of [...this.pending])
      if (sim.elapsed >= p.at) {
        this.pending.splice(this.pending.indexOf(p), 1);
        p.run();
      }
  }
  // An explosion (any: a police car, a parked car, a pump, a tank, the
  // target): parked vehicles damaged and set off in a chain, loose
  // furniture thrown out, breakable props knocked over, fuel pumps set
  // off, overhead gantries toppled, shop windows blown in.
  blast(sim, e, R, s, later, depth) {
    const jitter = () => 0.25 + Math.random() * 0.55;
    this.vehicles.blast(sim, e.x, e.z, R, s, later, jitter);
    this.ads?.blast(sim, e, R, s);
    this.big?.blast(sim, e, R, s);
    for (const it of this.flyers.items) {
      if (it.state === "fly" || it.hidden || it.hits >= 3) continue;
      const dx = it.x - e.x, dz = it.z - e.z, d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-6) continue;
      const k = 1 - d / R, sp = 20 * k * Math.sqrt(s);
      if (sp < 3) continue;
      this.flyers.launch(sim, it, { vx: (dx / d) * sp, vz: (dz / d) * sp }, sp, dx / d, dz / d);
    }
    for (const it of this.items) {
      if (it.state !== "stand") continue;
      const dx = it.spec.x - e.x, dz = it.spec.z - e.z, d = Math.hypot(dx, dz);
      if (d >= R * 0.6 || d < 1e-6) continue;
      it.broken = !!it.bh;
      this.knock(it, dx / d, dz / d);
    }
    for (const isl of this.gas.islands)
      if (isl.state === "intact" && Math.hypot(isl.x - e.x, isl.z - e.z) < 4 + 2 * s && e.cause !== "gas")
        later(jitter(), () => this.explodeIsland(sim, isl));
    for (const a of this.gantries.list) {
      if (a.state !== "up") continue;
      a.gt.posts.forEach((px, i) => {
        if (a.state !== "up") return;
        const w = gantryWorld(a.y, a.gt.cx + px, a.gt.lz);
        if (Math.hypot(w.x - e.x, w.z - e.z) < R * 0.55) this.gantries.topple(sim, a, i, { x: e.x, z: e.z, vx: 0, vz: 0 });
      });
    }
    for (const f of this.storefronts.faces) {
      if (f.broken) continue;
      const wx = f.b.x + f.nx * (f.half + 0.1), wz = f.b.z + f.nz * (f.half + 0.1);
      if (Math.hypot(wx - e.x, wz - e.z) < R * 0.55) this.storefronts.breakFace(sim, f, 8 + 6 * s);
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
    // Structural collapse (gas-collapse.js): columns buckle, the slabs over
    // this island come down, the shop sign tears loose. With both islands
    // gone the whole canopy is down: a third, major blast as the fuel under
    // it goes up, and fires on the wreckage that keep burning.
    const full = this.collapse.collapse(sim, isl.k, sim.elapsed);
    const cp = this.gas.canopy.plan;
    for (const [dx, dz, size] of [[-3.2, 0, 0.9], [3.4, 0.4, 0.8], [0.4, -0.6, 0.7]])
      this.fx.push({ kind: "burn", x: GAS.x + cp.x + dx, z: isl.z + dz, y: TOP + 1.1, born: sim.elapsed + 1.1, size });
    if (full) {
      this.stats.canopyDown = 1;
      this.pending.push({
        at: sim.elapsed + 0.9,
        run: () => {
          sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "gas", major: true, x: GAS.x + cp.x, z: GAS.z + cp.z, angle: 0, time: sim.elapsed, delay: 0, chainDepth: 3, playerX: sim.player.x, playerZ: sim.player.z });
          if (sim.events.length > 64) sim.events.shift();
          const mp = this.gas.martSign.home;
          for (const dx of [-4, 0, 4]) this.fx.push({ kind: "burn", x: GAS.x + mp.x + dx, z: GAS.z + mp.z + 0.6, y: TOP, born: sim.elapsed + 0.4, size: 0.85 });
        },
      });
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
      this.burst(it, dx, dz);
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
  // A big loose piece (sculpture, wheel, container) slamming a pillar.
  hitPillar(sim, pillar, impact, mass) {
    if (pillar.alive) hitPillar(sim, pillar, impact, mass);
  }
  spill(type, x, z, nx, nz, speed, f) {
    const sim = this.sim;
    if (!sim) return;
    const out = { vx: nx * speed * 0.55, vz: nz * speed * 0.55 };
    const sp = Math.max(7, Math.min(16, speed));
    const along = (k) => (Math.random() - 0.5) * Math.min(5, (f?.span || 6) - 1) * k;
    const go = (kind, n, mass, y = 1.0, k = 1) => {
      for (let i = 0; i < n; i++) {
        const a = along(1);
        const piece = this.flyers.spawn(sim, kind, x + nz * a + nx * 0.4, TOP + y, z - nx * a + nz * 0.4, out, sp * k, nx, nz, mass, TOP);
        if (piece) piece.kerb = { x, z, nx, nz };
      }
    };
    if (type === "fruit") {
      go("bigFruit", 22, 0.2, 0.9, 1.1);
      go("produceBox", 3, 0.4, 0.7);
      go("plank", 5, 0.3, 0.7);
    } else if (type === "flower") {
      go("bloom", 14, 0.2, 1.0);
      go("petal", 34, 0.12, 1.6, 0.8);
      go("shard", 10, 0.3, 0.6);
    } else if (type === "cafe") {
      go("cup", 12, 0.15, 1.0);
      go("plate", 6, 0.2, 1.0);
      go("chair", 3, 0.25, 0.6, 0.8);
      go("parasolCanopy", 1, 0.25, 1.4, 0.6);
      go("boardHalf", 2, 0.15, 0.8);
    } else if (type === "market") {
      go("basket", 6, 0.3, 0.8);
      go("produceBox", 4, 0.4, 0.8);
      go("bigFruit", 10, 0.2, 0.9);
      go("stallAwning", 1, 0.4, 2.0, 0.5);
      go("stallBoard", 1, 0.35, 1.2, 0.6);
      go("stallPost", 2, 0.3, 1.0, 0.6);
    } else if (type === "diner") {
      go("chair", 4, 0.25, 0.6, 0.9);
      go("tableTop", 1, 0.5, 0.8, 0.7);
      go("foodBox", 6, 0.2, 1.0);
      go("plate", 6, 0.2, 1.0);
    } else if (type === "fireworks") {
      go("paper", 10, 0.15, 1.2);
    }
  }
  throwChunk(kind, x, z, speed, heading) {
    let index;
    if (this.chunkCounts[kind] >= CHUNKS) {
      // Full: the oldest piece of this kind is picked up and thrown anew.
      const old = this.chunks.findIndex((c) => c.kind === kind);
      index = this.chunks[old].index;
      this.chunks.splice(old, 1);
    } else index = this.chunkCounts[kind]++;
    this.chunkKinds[kind].count = this.chunkCounts[kind];
    this.chunkKinds[kind].visible = true;
    this.chunks.push({ kind, index, x, y: TOP + 1.2, z, vx: Math.sin(heading) * speed * 0.5, vy: 6 + speed * 0.4, vz: Math.cos(heading) * speed * 0.5, rx: 0, rz: 0, spin: 4 + Math.random() * 6, done: false });
  }

  // What a broken piece throws out: a car-wash brush bursts into foam and
  // water, a market stall into fruit, a booth into glass.
  burst(it, dx, dz) {
    const s = it.spec, sim = this.sim;
    if (it.burst === "foam") {
      this.fx.push({ kind: "foam", x: s.x, z: s.z, y: s.y ?? 0.05, born: sim?.elapsed ?? 0 });
      for (let i = 0; i < 70 && this.dropList.length < 210; i++) {
        const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 4;
        this.dropList.push({ x: s.x, y: (s.y ?? 0.05) + 1.2, z: s.z, vx: Math.cos(a) * v + dx * 3, vy: 3 + Math.random() * 5, vz: Math.sin(a) * v + dz * 3, floor: s.y ?? 0.05 });
      }
    } else if (it.burst === "fruit" && sim) {
      const car = { vx: dx * 12, vz: dz * 12 };
      for (let i = 0; i < 22; i++) this.flyers.spawn(sim, "fruit", s.x + (Math.random() - 0.5) * 2.4, (s.y ?? 0.05) + 1.1, s.z, car, 9, dx, dz, 0.2, s.y ?? 0.05);
    } else if (it.burst === "glass") {
      for (let i = 0; i < 8; i++) this.throwChunk(1, s.x, s.z, 2 + Math.random() * 3, Math.atan2(dx, dz) + (Math.random() - 0.5) * 2);
    }
  }
  spinBrushes(now) {
    for (const it of this.items) {
      if (it.kind !== "brush" || it.state !== "stand") continue;
      const s = it.spec;
      this.q.setFromAxisAngle(UP, s.ry + now * 5 * (it.idx % 2 ? 1 : -1));
      this.m.compose(this.v.set(s.x, s.y ?? TOP, s.z), this.q, this.s.setScalar(1));
      this.batch.matrix(it.h, this.m);
    }
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
    this.vehicles.update(sim, dt);
    this.flyers.update(sim, dt);
    this.spinBrushes(now);
    this.collapse.step(this.sim, this.time);
    this.gantries.step(this.sim, this.time);
    if (this.depot && this.sim) this.depot.step(this.sim, this.time, dt);
    this.fxStep(now);
    this.waterStep(dt, now);
    this.ads.render(dt, sim);
    this.big.render(dt, sim, this.renderer?.tod === "night");
  }
  pose(it, k) {
    const s = it.spec;
    if (it.broken) {
      const down = it.state !== "stand";
      this.q.setFromAxisAngle(UP, s.ry);
      const y = s.y ?? TOP;
      this.m.compose(this.v.set(s.x, y, s.z), this.q, this.s.setScalar(1));
      this.batch.matrix(it.h, this.m);
      this.batch.matrix(it.bh, this.m);
      this.batch.visible(it.h, !down);
      this.batch.visible(it.bh, down);
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
    this.batch.matrix(it.h, this.m);
  }
  ballPose(b, i) {
    this.m.makeTranslation(b.x, b.y, b.z);
    this.ballMesh.setMatrixAt(i, this.m);
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
    let nfo = 0;
    const foam = (x, y, z, r) => {
      if (nfo >= 64 || r <= 0.02) return;
      this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.set(r, r * 0.7, r));
      this.foam.setMatrixAt(nfo++, this.m);
    };
    let nd = 0;
    const dustPuff = (x, y, z, r) => {
      if (nd >= 48 || r <= 0.02) return;
      this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.set(r, r * 0.7, r));
      this.dust.setMatrixAt(nd++, this.m);
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
      if (f.kind === "dust") {
        // A brown cloud that swells and settles in ~1.5 s (smoke puffs).
        if (t > 1.6) continue;
        const k = Math.min(1, t / 0.25) * (1 - t / 1.6);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + f.x, r = 0.6 + t * 2.2;
          dustPuff(f.x + Math.cos(a) * r, 0.35 + t * 0.6 + (i % 2) * 0.3, f.z + Math.sin(a) * r, f.size * (0.7 + t) * k);
        }
        continue;
      }
      if (f.kind === "spark") {
        // Bright flickering bits at the top of the window for ~3 s.
        if (t > 3) continue;
        const on = Math.sin(now * 53 + f.x) > -0.2;
        for (let i = 0; i < 4 && on; i++) {
          const ph = ((now * 7 + i * 0.37) % 1 + 1) % 1;
          const side = Math.sin(i * 2.3 + f.z) * 2.2;
          flame(f.x + f.nz * side + f.nx * (0.3 + ph * 0.8), TOP + 2.4 - ph * 1.8, f.z - f.nx * side + f.nz * (0.3 + ph * 0.8), 0.09 + 0.05 * (1 - ph), 2);
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
        if (f.kind === "foam") {
          // Foam heaps: swell up, sit there, slowly settle.
          const age = now - f.born, k = Math.min(1, age / 0.6) * (age > 10 ? Math.max(0.35, 1 - (age - 10) / 10) : 1);
          for (let i = 0; i < 7; i++) {
            const a = i * 0.9 + f.x, r = 0.8 + (i % 3) * 0.6;
            foam(f.x + Math.cos(a) * r, (f.y ?? 0.05) + 0.25 + (i % 2) * 0.3, f.z + Math.sin(a) * r, (0.55 + (i % 3) * 0.25) * k);
          }
          continue;
        }
        // A spot that keeps burning: flickering flames, a thin smoke trail.
        // On a wreck it follows the vehicle and dies down to smoke.
        if (f.follow) {
          f.x = f.follow.x;
          f.z = f.follow.z;
        }
        const age = now - f.born;
        const fade = f.decay ? Math.max(0.2, 1 - Math.max(0, age - (f.long ? 20 : 8)) / 14) : 1;
        const fl = (0.85 + Math.sin(now * 17 + f.x) * 0.1 + Math.sin(now * 29 + f.z) * 0.07) * fade;
        const fy = (f.y ?? TOP) - TOP;
        flame(f.x, TOP + 0.55 + fy, f.z, f.size * 0.75 * fl, 0);
        flame(f.x + 0.15, TOP + 0.85 + fy, f.z - 0.1, f.size * 0.55 * fl, 1);
        flame(f.x - 0.05, TOP + 1.05 + fy, f.z + 0.05, f.size * 0.32 * fl, 2);
        for (let i = 0; i < 2; i++) {
          const ph = ((now * 0.35 + i * 0.5 + f.x * 0.1) % 1 + 1) % 1;
          puff(f.x + ph * 0.6, TOP + 1.5 + fy + ph * 4.5, f.z, f.size * (0.5 + ph * 0.9) * (1 - ph));
        }
      }
    }
    this.dust.count = nd;
    this.dust.visible = nd > 0;
    if (nd) this.dust.instanceMatrix.needsUpdate = true;
    this.fire.count = nf;
    this.smoke.count = ns;
    this.foam.count = nfo;
    this.foam.visible = nfo > 0;
    if (nfo) this.foam.instanceMatrix.needsUpdate = true;
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
      if (d.y < (d.floor ?? TOP) + 0.05) continue;
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
