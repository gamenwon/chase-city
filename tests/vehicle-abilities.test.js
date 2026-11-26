// Vehicle abilities: the mini slips past a barricade over the pavement,
// the monster truck goes over barricades and leaps off the elevated road;
// sand dunes launch a fast car.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { overpassHeight } from "../src/world/citygen.js";
import { updateJump } from "../src/game/jumps.js";

const make = (vehicle, seed = 3) => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, vehicle, reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  return s;
};
// A barricade across an open test strip: carriageway |lat| < 4, pavement
// beyond, 14 m wide in all; the player drives into it along -z.
function barricadeRun(vehicle, lat) {
  const s = make(vehicle);
  // (Inside the world; only this barricade is solid for the run.)
  const x0 = -60, z0 = -60;
  const b = { kind: "barricade", x: x0, z: z0, w: 14, d: 1.2, vertical: true, road: { x: x0, z: z0 }, roadHalf: 4, id: 1, forward: { x: 0, z: -1 } };
  s.solids = [b];
  s.solidGridFor = null;
  const p = s.player;
  Object.assign(p, { x: x0 + lat, z: z0 + 6, angle: 0, vx: 0, vz: -14, speed: 14, level: 0, y: 0 });
  const start = p.z;
  for (let i = 0; i < 50; i++) {
    const before = { x: p.x, z: p.z };
    p.vx = 0;
    p.vz = -14;
    s.move(p, 1 / 60, s.vehicle.stats.radius);
    if (p.falling) {
      p.vy -= 18 / 60;
      p.y += p.vy / 60;
      if (p.y <= 0) Object.assign(p, { y: 0, vy: 0, falling: false });
    }
    void before;
  }
  return { through: p.z < z0 - 1, moved: start - p.z, vaults: s.stats.barricadeVaults || 0, slips: s.stats.barricadeSlips || 0 };
}

test("mini: slips past a barricade over the pavement or the outer lane (easy to aim for), never through the middle", () => {
  for (const lat of [5.6, 3.0, -2.6]) {
    const r = barricadeRun("mini", lat);
    assert.equal(r.through, true, `lat ${lat}`);
    assert.ok(r.slips >= 1);
  }
  assert.equal(barricadeRun("mini", 0).through, false);
  // Other cars are stopped everywhere along it.
  assert.equal(barricadeRun("starter", 5.6).through, false);
  assert.equal(barricadeRun("armored", 3.0).through, false);
});

test("monster truck: goes over a barricade (a hop) anywhere across it, even slowly", () => {
  for (const lat of [0, 3, 5.6]) {
    const r = barricadeRun("monster", lat);
    assert.equal(r.through, true, `lat ${lat}`);
    assert.ok(r.vaults >= 1);
  }
});

test("monster truck: climbs over a police car parked across the road (roadblock); other cars are stopped by it", () => {
  const run = (vehicle) => {
    const s = make(vehicle);
    const p = s.player;
    const c = { ...s.police[0] };
    s.police = [Object.assign(c, { state: "active", health: 100, x: p.x, z: p.z - 2.4, vx: 0, vz: 0, angle: Math.PI / 2, blockState: "hold", mode: "block" })];
    Object.assign(p, { vx: 0, vz: -8, speed: 8, angle: 0 });
    s.resolvePlayerPolice();
    return { crushed: c.health <= 0, hop: !!p.air };
  };
  const m = run("monster");
  assert.ok(m.crushed && m.hop, JSON.stringify(m));
  assert.equal(run("starter").crushed, false);
});

test("the elevated road keeps every car on the deck (no jumping off)", () => {
  const s = make("monster");
  const op = s.overpasses[0];
  const sMid = op.L / 2;
  const x = op.a.x + op.u.x * sMid, z = op.a.z + op.u.z * sMid;
  const nx = -op.u.z, nz = op.u.x;
  const p = s.player;
  Object.assign(p, { x, z, level: 1, op: op.id, y: overpassHeight(op, sMid), vx: nx * 9 + op.u.x * 12, vz: nz * 9 + op.u.z * 12, speed: 15, angle: Math.atan2(-(nx * 9 + op.u.x * 12), -(nz * 9 + op.u.z * 12)) });
  s.previousPlayer = { x, z };
  for (let i = 0; i < 30 && !s.result; i++) {
    s.arrest = 0;
    s.update(1 / 60, { right: true });
  }
  assert.equal(p.level, 1);
  assert.equal(s.stats.deckLeaps || 0, 0);
});

test("hill road: every city has a street that goes up, down, up and down, joined to the road graph; cars ride over it", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const L = generateCity(seed);
    const f = L.features.find((q) => q.kind === "hillroad");
    assert.ok(f, `seed ${seed}`);
    const hills = L.mounds.filter((m) => m.hill);
    assert.equal(hills.length, 2);
    const e = L.graph.edges.find((q) => q.hill);
    assert.ok(e, "a street in the road graph");
    // Both ends are junctions with the side streets (3 roads meet there).
    for (const id of [e.a, e.b]) assert.equal(L.graph.edges.filter((q) => q.a === id || q.b === id).length, 3);
    assert.equal(L.features.some((q) => q.kind === "dunes"), false);
  }
  // A car driving the street: up over the first hill, down, up over the
  // second, down again, and out at street level.
  const s = make("starter");
  const e = s.layout.graph.edges.find((q) => q.hill), a = e.pts[0], b = e.pts[1];
  const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
  const p = s.player, speed = 9;
  Object.assign(p, { x: a.x + ux * 2, z: a.z + uz * 2, angle: Math.atan2(-ux, -uz), vx: ux * speed, vz: uz * speed, speed });
  s.previousPlayer = { x: p.x, z: p.z };
  const ys = [];
  for (let i = 0; i < Math.ceil(((len - 4) / speed) * 60) && !s.result; i++) {
    s.arrest = 0;
    p.vx = ux * speed;
    p.vz = uz * speed;
    s.move(p, 1 / 60, s.vehicle.stats.radius);
    updateJump(s, p, 1 / 60, 1);
    ys.push(p.y || 0);
  }
  // Two crests (up-down-up-down), back to street level at the far end.
  let peaks = 0;
  for (let i = 1; i < ys.length - 1; i++) if (ys[i] > 0.5 && ys[i] >= ys[i - 1] && ys[i] > ys[i + 1]) peaks++;
  assert.equal(peaks, 2, `peaks ${peaks}`);
  assert.ok(Math.max(...ys) > 1.2);
  assert.ok(ys.at(-1) < 0.05);
});
