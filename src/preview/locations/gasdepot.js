// Gas storage depot (block -45, 45, south-west): a big spherical LPG tank
// on braced legs, two horizontal "bullet" tanks on saddles, an elevated
// pipe rack with valves, a caged rack of gas cylinders, a control hut, a
// hazard-striped pad with chain-link fence panels and two open gates.
//
// Destruction: a hard ram (or a blast next to it) ruptures a tank in a
// major explosion, and the others follow in a chain. Pre-fractured: the
// sphere bursts into shell petals and the bullets split into halves, end
// caps flung far; legs buckle, saddles bend, the pipe rack and its pipes
// come down, cylinders are thrown out; fires keep burning on the wreckage
// and everything stays until restart. The tanks' footprints stay solid
// (their wreckage is there), flung pieces are not (they never block).
import { awardCoins } from "../../game/coins.js";
import * as THREE from "three";
import { C, B, G, cyl, add, bake, signBoard, pieceMesh } from "./parts.js";

import { GASDEPOT } from "./layout-consts.js";
export { GASDEPOT };
export const GD_PLAN = {
  sphere: { x: 3.4, z: -3.4, r: 2.9, cy: 4.7 },
  bullets: [
    { x: -4.6, z: -4.5, len: 7.0, r: 1.45 },
    { x: -4.6, z: 0.7, len: 7.0, r: 1.45 },
  ],
  cage: { x: 5.4, z: 4.8, w: 3.0, d: 1.8 },
  hut: { x: -6.0, z: 6.2, w: 3.2, d: 2.4 },
  rack: { z: -7.9, x0: -8.2, x1: 7.6, y: 3.0 },
};
const TOP = 0.4;
const WHITE = 0xf2efe6, BAND = 0xf0781e, LEG = 0xf5c01a, PIPE = 0xd8b23a, STEEL = 0x8a8d93;

// Solid boxes (world), for the layout.
export function depotSolids() {
  const P = GD_PLAN, o = GASDEPOT;
  const s = (x, z, w, d, kind) => ({ x: o.x + x, z: o.z + z, w, d, kind });
  return [
    s(P.sphere.x, P.sphere.z, 5.4, 5.4, "gas-sphere"),
    ...P.bullets.map((b) => s(b.x, b.z, b.len + 0.6, b.r * 2 + 0.4, "gas-bullet")),
    s(P.cage.x, P.cage.z, P.cage.w, P.cage.d, "gas-cage"),
    s(P.hut.x, P.hut.z, P.hut.w, P.hut.d, "gas-hut"),
    s((P.rack.x0 + P.rack.x1) / 2, P.rack.z, P.rack.x1 - P.rack.x0, 0.8, "pipe-rack"),
  ];
}
// Loose pieces (FlyerSystem): fence panels round the pad (two gates left
// open), gas cylinders standing by the cage.
export function depotFlyers() {
  const o = GASDEPOT, out = [];
  const Y = TOP + 0.02;
  for (let i = 0; i < 7; i++) {
    const u = -8.4 + i * 2.6;
    if (i !== 3) out.push({ kind: "depotFence", x: o.x + u, z: o.z + 9.3, y: Y, ry: 0 }); // south side, gate in the middle
    if (i < 2 || i > 4) out.push({ kind: "depotFence", x: o.x + 9.3, z: o.z + u, y: Y, ry: Math.PI / 2 }); // east side, wide gate
  }
  const colors = [0xf5c01a, 0x2f7fe0, 0x5cb23a, 0xd62f2a];
  for (let i = 0; i < 6; i++) out.push({ kind: "gasBottle", x: o.x + 3.8 + i * 0.55, z: o.z + 6.4 + (i % 2) * 0.3, y: Y, ry: i, color: colors[i % 4] });
  return out;
}

// ------------------------------------------------------------ models --
function sphereTank(g) {
  const P = GD_PLAN.sphere;
  const shell = add(g, new THREE.IcosahedronGeometry(P.r, 1), WHITE, 0, P.cy, 0);
  shell.rotation.y = 0.3;
  cyl(g, P.r * 1.01, P.r * 1.01, 0.35, BAND, 0, P.cy - 0.17, 0, 14);
  // Eight legs with cross-bracing, a ring girder at the equator.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, x = Math.sin(a) * P.r * 0.92, z = Math.cos(a) * P.r * 0.92;
    B(g, 0.26, P.cy, 0.26, LEG, x, 0, z);
    const br = B(g, 0.08, 2.6, 0.08, STEEL, Math.sin(a + 0.39) * P.r * 0.92, 0.6, Math.cos(a + 0.39) * P.r * 0.92, a + Math.PI / 2);
    br.rotation.z = 0.75;
  }
  // Ladder up the side, a platform rail on top, valves, a sign.
  for (let k = 0; k < 2; k++) B(g, 0.06, P.cy + 2.4, 0.06, STEEL, P.r + 0.15, 0, -0.25 + k * 0.5);
  for (let k = 0; k < 14; k++) B(g, 0.06, 0.05, 0.5, STEEL, P.r + 0.15, 0.4 + k * 0.5, 0);
  cyl(g, 0.9, 0.9, 0.1, STEEL, 0, P.cy + P.r - 0.05, 0, 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    B(g, 0.05, 0.6, 0.05, STEEL, Math.sin(a) * 0.9, P.cy + P.r, Math.cos(a) * 0.9);
  }
  cyl(g, 0.22, 0.22, 0.35, 0xd62f2a, 0.5, P.cy + P.r + 0.05, 0.3, 8);
  signBoard(g, "LPG", 2.0, 0.7, 0, P.cy + 0.5, P.r + 0.05, 0, "#f0781e", "#ffffff");
}
function sphereLegsWrecked(g) {
  const P = GD_PLAN.sphere;
  // Legs buckled outwards and snapped, the ring girder down in pieces.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lg = G(g, Math.sin(a) * P.r * 0.92, 0, Math.cos(a) * P.r * 0.92, a);
    const part = B(lg, 0.26, P.cy * (0.35 + (i % 3) * 0.15), 0.26, i % 2 ? 0x3a3532 : LEG, 0, 0, 0);
    part.rotation.x = 0.5 + (i % 3) * 0.3;
  }
  for (let i = 0; i < 6; i++) {
    const s = B(g, 1.8, 0.25, 0.25, 0x3a3532, Math.cos(i) * 2.4, 0.1, Math.sin(i * 1.7) * 2.4, i);
    s.rotation.z = 0.15 * (i % 2 ? 1 : -1);
  }
  // Scorched ground.
  cyl(g, 4.6, 4.6, 0.02, 0x1d1b1d, 0, 0.01, 0, 9);
}
// A shell petal of the sphere (a slice of a low-poly sphere).
function petal(g, i) {
  const r = GD_PLAN.sphere.r;
  const geo = new THREE.SphereGeometry(r, 4, 3, (i * Math.PI * 2) / 5, (Math.PI * 2) / 5, 0.2, Math.PI - 0.4);
  const m = add(g, geo, i % 2 ? WHITE : 0xd9d4c8, 0, 0, 0);
  m.material = m.material.clone();
  m.material.side = THREE.DoubleSide;
  // Its burnt inside edge.
  B(g, 0.12, r * 1.4, 0.12, 0x2a2628, Math.sin((i + 0.5) * 1.2566) * r * 0.8, -r * 0.7, Math.cos((i + 0.5) * 1.2566) * r * 0.8);
}
function bulletTank(g, b) {
  // Cylinder along x on two saddles, hemispherical ends, band, valves.
  const body = add(g, new THREE.CylinderGeometry(b.r, b.r, b.len - b.r, 10, 1), WHITE, 0, 0, 0);
  body.rotation.z = Math.PI / 2;
  body.position.y = b.r + 0.7;
  for (const s of [-1, 1]) {
    const cap = add(g, new THREE.SphereGeometry(b.r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, s * (b.len - b.r) / 2, b.r + 0.7, 0);
    cap.rotation.z = -s * Math.PI / 2;
    const sad = G(g, s * b.len * 0.28, 0, 0);
    B(sad, 0.5, 0.9, b.r * 1.7, 0x6b6e75, 0, 0, 0);
    B(sad, 0.6, 0.12, b.r * 1.9, 0x55535c, 0, 0, 0);
  }
  const band = add(g, new THREE.CylinderGeometry(b.r * 1.01, b.r * 1.01, 0.4, 10, 1), BAND, 0, 0, 0);
  band.rotation.z = Math.PI / 2;
  band.position.y = b.r + 0.7;
  for (const x of [-1.2, 0.4]) {
    cyl(g, 0.12, 0.12, 0.5, STEEL, x, b.r * 2 + 0.7, 0, 8);
    cyl(g, 0.24, 0.24, 0.05, 0xd62f2a, x, b.r * 2 + 1.2, 0, 8);
  }
  signBoard(g, "PROPANE", 2.6, 0.5, 0.8, b.r + 0.9, b.r + 0.05, 0, "#ffffff", "#d62f2a");
}
function bulletWrecked(g, b) {
  // Saddles bent and blackened, the cradle of a burst tank.
  for (const s of [-1, 1]) {
    const sad = G(g, s * b.len * 0.28, 0, 0);
    const p = B(sad, 0.5, 0.75, b.r * 1.7, 0x3a3532, 0, 0, 0);
    p.rotation.z = s * 0.35;
  }
  cyl(g, 3.6, 3.6, 0.02, 0x1d1b1d, 0, 0.01, 0, 9).scale.x = 1.6;
}
function bulletHalf(g, b, s) {
  // Half the tank: a torn open shell with its end cap.
  const len = (b.len - b.r) / 2;
  const body = add(g, new THREE.CylinderGeometry(b.r, b.r * 0.92, len, 10, 1, true), WHITE, s * len / 2, 0, 0);
  body.rotation.z = Math.PI / 2;
  body.material = body.material.clone();
  body.material.side = THREE.DoubleSide;
  const cap = add(g, new THREE.SphereGeometry(b.r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, s * len, 0, 0);
  cap.rotation.z = -s * Math.PI / 2;
  const band = add(g, new THREE.CylinderGeometry(b.r * 1.01, b.r * 1.01, 0.3, 10, 1, true), 0x2a2628, 0, 0, 0);
  band.rotation.z = Math.PI / 2;
}
function rackStatic(g) {
  // Rack supports (portal frames) along the north edge.
  const R = GD_PLAN.rack;
  for (let x = R.x0; x <= R.x1 + 0.01; x += (R.x1 - R.x0) / 5) {
    for (const s of [-1, 1]) B(g, 0.22, R.y, 0.22, LEG, x, 0, R.z + s * 0.3);
    B(g, 0.3, 0.2, 0.9, LEG, x, R.y, R.z);
  }
}
function rackPipes(g) {
  const R = GD_PLAN.rack;
  const len = R.x1 - R.x0;
  [[PIPE, -0.25, 0.22], [STEEL, 0.05, 0.16], [0xd62f2a, 0.3, 0.12]].forEach(([c, dz, r]) => {
    const p = add(g, new THREE.CylinderGeometry(r, r, len, 8), c, 0, 0, dz);
    p.rotation.z = Math.PI / 2;
  });
  for (const x of [-len / 2 + 1.5, 0, len / 2 - 2]) {
    const v = add(g, new THREE.TorusGeometry(0.3, 0.05, 4, 8), 0xd62f2a, x, 0.45, -0.25);
    v.rotation.y = Math.PI / 2;
  }
}
function cage(g) {
  const P = GD_PLAN.cage;
  B(g, P.w, 0.12, P.d, 0x55535c, 0, 0, 0);
  for (const x of [-P.w / 2, P.w / 2]) for (const z of [-P.d / 2, P.d / 2]) B(g, 0.08, 2.0, 0.08, 0x3a8a4a, x, 0, z);
  for (const y of [0.9, 1.95]) {
    B(g, P.w, 0.06, 0.06, 0x3a8a4a, 0, y, -P.d / 2);
    B(g, P.w, 0.06, 0.06, 0x3a8a4a, 0, y, P.d / 2);
    B(g, 0.06, 0.06, P.d, 0x3a8a4a, -P.w / 2, y, 0);
    B(g, 0.06, 0.06, P.d, 0x3a8a4a, P.w / 2, y, 0);
  }
  const colors = [0xf5c01a, 0x2f7fe0, 0x5cb23a, 0xd62f2a];
  for (let i = 0; i < 10; i++) {
    cyl(g, 0.17, 0.17, 1.1, colors[i % 4], -P.w / 2 + 0.3 + (i % 5) * 0.6, 0.12, -0.35 + Math.floor(i / 5) * 0.7, 8);
    cyl(g, 0.08, 0.08, 0.15, STEEL, -P.w / 2 + 0.3 + (i % 5) * 0.6, 1.22, -0.35 + Math.floor(i / 5) * 0.7, 6);
  }
}
function hut(g, broken) {
  const P = GD_PLAN.hut;
  B(g, P.w, 2.5, P.d, 0xe8e2d4, 0, 0, 0);
  B(g, P.w + 0.3, 0.2, P.d + 0.3, 0x3a6b8a, 0, 2.5, 0);
  B(g, 1.6, 0.8, 0.04, broken ? 0x141316 : C.glass, 0.4, 1.2, P.d / 2 + 0.01);
  B(g, 0.8, 1.9, 0.04, 0x3a6b8a, -0.9, 0, P.d / 2 + 0.01);
  B(g, 1.0, 0.6, 0.8, 0xcfd0d4, 0.6, 2.7, 0);
  signBoard(g, "GAS DEPOT", 2.4, 0.45, 0, 2.95, P.d / 2 + 0.16, 0, "#2f7fe0", "#ffffff");
}
function pad(g) {
  B(g, 18.6, 0.06, 18.6, C.concrete, 0, TOP - 0.06, 0);
  // Hazard edging and lane markings.
  for (let i = 0; i < 18; i++) for (const s of [-1, 1]) {
    B(g, 0.5, 0.012, 0.3, i % 2 ? 0x2a292e : 0xf5c01a, -8.75 + i * 1.03, TOP, s * 9.1);
    B(g, 0.3, 0.012, 0.5, i % 2 ? 0x2a292e : 0xf5c01a, s * 9.1, TOP, -8.75 + i * 1.03);
  }
  for (let i = 0; i < 8; i++) B(g, 0.12, 0.012, 1.2, 0xffffff, 1.5 + i * 0.01, TOP, -7 + i * 2);
  // Kerb blocks round the tanks, drains, a fire hydrant, warning signs.
  cyl(g, 0.2, 0.22, 0.8, 0xd62f2a, 8.3, TOP, -1.0, 8);
  for (const [x, z] of [[-1.2, 4.0], [8.0, 7.6]]) {
    B(g, 0.08, 1.4, 0.08, STEEL, x, TOP, z);
    const s = add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.04, 3), 0xf5c01a, x, TOP + 1.6, z + 0.05);
    s.rotation.x = Math.PI / 2;
  }
}

// --------------------------------------------------------- the depot --
export class GasDepot {
  // rt: the LocationsRuntime (fx list, flyers, items, chunks).
  constructor(scene, rt) {
    this.rt = rt;
    const o = GASDEPOT, P = GD_PLAN;
    this.root = new THREE.Group();
    this.root.position.set(o.x, 0, o.z);
    scene.add(this.root);
    const s = new THREE.Group();
    pad(s);
    rackStatic(G(s, 0, TOP, 0));
    cage(G(s, P.cage.x, TOP, P.cage.z));
    this.root.add(bake(s));
    const hutG = (broken) => {
      const h = new THREE.Group();
      hut(G(h, P.hut.x, TOP, P.hut.z), broken);
      return bake(h);
    };
    this.hut = [hutG(false), hutG(true)];
    this.root.add(...this.hut);
    this.hut[1].visible = false;
    this.pipes = pieceMesh(rackPipes);
    this.pipes.position.set((P.rack.x0 + P.rack.x1) / 2, TOP + P.rack.y + 0.3, P.rack.z);
    this.root.add(this.pipes);
    // Vessels: intact model, wreck model, and pre-fractured pieces.
    const vessel = (kind, x, z, intact, wreck, pieces) => {
      const live = new THREE.Group();
      intact(live);
      const liveMesh = bake(live);
      liveMesh.position.set(x, TOP, z);
      const wreckMesh = pieceMesh(wreck);
      wreckMesh.position.set(x, TOP, z);
      wreckMesh.visible = false;
      this.root.add(liveMesh, wreckMesh);
      const parts = pieces.map((build) => {
        const m = pieceMesh(build);
        m.visible = false;
        this.root.add(m);
        return m;
      });
      return { kind, x, z, live: liveMesh, wreck: wreckMesh, parts, state: "intact" };
    };
    this.vessels = [
      vessel("sphere", P.sphere.x, P.sphere.z, sphereTank, sphereLegsWrecked, [0, 1, 2, 3, 4].map((i) => (g) => petal(g, i))),
      ...P.bullets.map((b) => vessel("bullet", b.x, b.z, (g) => bulletTank(g, b), (g) => bulletWrecked(g, b), [-1, 1].map((sd) => (g) => bulletHalf(g, b, sd)))),
    ];
    this.flying = [];
    this.pending = [];
    this.stats = { ruptured: 0, chains: 0 };
    this.reset();
  }
  reset() {
    for (const v of this.vessels) {
      v.state = "intact";
      v.live.visible = true;
      v.wreck.visible = false;
      for (const m of v.parts) m.visible = false;
    }
    this.hut[0].visible = true;
    this.hut[1].visible = false;
    const P = GD_PLAN;
    this.pipes.position.set((P.rack.x0 + P.rack.x1) / 2, TOP + P.rack.y + 0.3, P.rack.z);
    this.pipes.rotation.set(0, 0, 0);
    this.pipesFall = null;
    this.flying = [];
    this.pending = [];
    this.lastEvent = Infinity;
    this.stats = { ruptured: 0, chains: 0 };
  }
  world(v) {
    return { x: GASDEPOT.x + v.x, z: GASDEPOT.z + v.z };
  }
  // A car rams a tank hard enough: it ruptures.
  touch(sim, car, radius, speed) {
    if (Math.abs(car.x - GASDEPOT.x) > 13 || Math.abs(car.z - GASDEPOT.z) > 13) return;
    for (const v of this.vessels) {
      if (v.state !== "intact") continue;
      const w = this.world(v);
      const half = v.kind === "sphere" ? { w: 2.7, d: 2.7 } : { w: GD_PLAN.bullets[0].len / 2 + 0.3, d: GD_PLAN.bullets[0].r + 0.2 };
      const dx = Math.max(Math.abs(car.x - w.x) - half.w, 0), dz = Math.max(Math.abs(car.z - w.z) - half.d, 0);
      if (Math.hypot(dx, dz) > radius + 0.35) continue;
      // Closing speed towards the tank.
      const nx = w.x - car.x, nz = w.z - car.z, n = Math.hypot(nx, nz) || 1;
      const closing = ((car.vx || 0) * nx + (car.vz || 0) * nz) / n;
      if (closing >= 8 || speed >= 14) this.rupture(sim, v, car);
    }
  }
  // Explosions elsewhere set off a tank they go off next to.
  watch(sim) {
    for (const e of sim.events) {
      if (e.type !== "explosion" || e.id <= (this.seen ?? 0)) continue;
      this.seen = e.id;
      if (e.depot) continue;
      for (const v of this.vessels) {
        if (v.state !== "intact") continue;
        const w = this.world(v);
        if (Math.hypot(e.x - w.x, e.z - w.z) < (e.cause === "gas" ? 11 : 7)) this.pending.push({ at: sim.elapsed + 0.45, v });
      }
    }
  }
  rupture(sim, v, car = null) {
    if (v.state !== "intact") return;
    v.state = "burst";
    this.stats.ruptured++;
    const w = this.world(v);
    awardCoins(sim, `tank:${w.x.toFixed(1)},${w.z.toFixed(1)}`, "depot", w.x, w.z, 0);
    const now = sim.elapsed;
    // The largest blast in the game (major), then the fire and the smoke
    // columns of the explosion system.
    sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "gas", major: true, depot: true, x: w.x, z: w.z, angle: 0, time: now, delay: 0, chainDepth: 3, playerX: sim.player.x, playerZ: sim.player.z });
    if (sim.events.length > 64) sim.events.shift();
    v.live.visible = false;
    v.wreck.visible = true;
    // Fragments: up and outward, spinning; they land and stay.
    v.parts.forEach((m, i) => {
      const a = (i / v.parts.length) * Math.PI * 2 + 0.4;
      // (Thrown hard but landing inside the depot or on its pavement, not
      // out on the road.)
      const out = v.kind === "sphere" ? 3.2 + (i % 3) * 0.9 : 3.6 + i * 1.2;
      m.visible = true;
      const y0 = v.kind === "sphere" ? GD_PLAN.sphere.cy : GD_PLAN.bullets[0].r + 0.7;
      const dir = v.kind === "sphere" ? { x: Math.sin(a), z: Math.cos(a) } : { x: i ? 1 : -1, z: 0.3 * (i ? 1 : -1) };
      m.position.set(v.x, TOP + y0, v.z);
      m.rotation.set(0, 0, 0);
      this.flying.push({ m, vx: dir.x * out, vz: dir.z * out, vy: 9 + (i % 2) * 4, wx: 2 + i, wz: 1.5 - i * 0.5, rest: TOP + 0.6 + (v.kind === "sphere" ? 1.4 : 0.7) * 0.5 });
    });
    // Fire that keeps burning on the wreck.
    const fx = this.rt.fx;
    fx.push({ kind: "burn", x: w.x, z: w.z, born: now + 0.6, size: 2.0 });
    for (let k = 0; k < 3; k++) fx.push({ kind: "burn", x: w.x + Math.cos(k * 2.1) * 2.2, z: w.z + Math.sin(k * 2.1) * 2.2, born: now + 0.9 + k * 0.2, size: 1.1 });
    // The pipe rack comes down with the first blast.
    if (!this.pipesFall) this.pipesFall = { at: now + 0.15 };
    this.hut[0].visible = false;
    this.hut[1].visible = true;
    // Cylinders and fence panels thrown out by the blast.
    const fl = this.rt.flyers;
    for (const it of fl.items) {
      if (it.state === "fly" || it.hidden) continue;
      const dx = it.x - w.x, dz = it.z - w.z, d = Math.hypot(dx, dz);
      if (d < 14) fl.launch(sim, it, { vx: (dx / (d || 1)) * 16, vz: (dz / (d || 1)) * 16 }, 18 * (1 - d / 16), dx / (d || 1), dz / (d || 1));
    }
    for (let i = 0; i < 14; i++) this.rt.throwChunk(i % 2, w.x, w.z, 6 + Math.random() * 8, Math.random() * Math.PI * 2);
    // Blast: police cars close by are wrecked, further out shoved and
    // damaged; the player is hurt if close.
    for (const c of sim.police) {
      if (c.state !== "active") continue;
      const dx = c.x - w.x, dz = c.z - w.z, d = Math.hypot(dx, dz);
      if (d < 9) {
        c.lastDamageCause = "gas";
        sim.explodePolice(c);
      } else if (d < 17) {
        const k = 1 - d / 17;
        c.health = Math.max(1, c.health - 50 * k);
        c.vx += (dx / d) * 12 * k;
        c.vz += (dz / d) * 12 * k;
      }
    }
    const pd = Math.hypot(sim.player.x - w.x, sim.player.z - w.z);
    if (pd < 12) {
      sim.damage(26 * (1 - pd / 12));
      const k = 1 - pd / 12;
      sim.player.vx += ((sim.player.x - w.x) / (pd || 1)) * 9 * k;
      sim.player.vz += ((sim.player.z - w.z) / (pd || 1)) * 9 * k;
    }
    // TARGET HUNT: the target caught in it takes heavy damage.
    const t = sim.target;
    if (t?.state === "fleeing" && Math.hypot(t.x - w.x, t.z - w.z) < 12) t.health = Math.max(1, t.health - 40);
    // Chain reaction: the other tanks go up one after another.
    const others = this.vessels.filter((o) => o.state === "intact").sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z));
    others.forEach((o, k) => {
      this.pending.push({ at: now + 0.55 + k * 0.65, v: o });
      this.stats.chains++;
    });
  }
  step(sim, now, dt) {
    if (this.lastEvent === Infinity) this.seen = sim.eventId;
    this.lastEvent = 0;
    this.watch(sim);
    for (const p of [...this.pending])
      if (now >= p.at) {
        this.pending.splice(this.pending.indexOf(p), 1);
        this.rupture(sim, p.v);
      }
    // Flying fragments: ballistic, then they lie where they land.
    for (const f of [...this.flying]) {
      f.vy -= 18 * dt;
      f.m.position.x += f.vx * dt;
      f.m.position.y += f.vy * dt;
      f.m.position.z += f.vz * dt;
      f.m.rotation.x += f.wx * dt;
      f.m.rotation.z += f.wz * dt;
      if (f.m.position.y <= f.rest && f.vy < 0) {
        f.m.position.y = f.rest;
        this.flying.splice(this.flying.indexOf(f), 1);
      }
    }
    // Pipe rack: sags, then drops onto its supports' feet.
    if (this.pipesFall) {
      const t = Math.min(1, (now - this.pipesFall.at) / 0.8);
      if (t > 0) {
        const P = GD_PLAN;
        const e = t * t;
        this.pipes.position.y = TOP + P.rack.y + 0.3 - (P.rack.y - 0.2) * e;
        this.pipes.position.z = P.rack.z + 0.9 * e;
        this.pipes.rotation.set(0.25 * e, 0, 0.12 * e);
      }
    }
  }
}
