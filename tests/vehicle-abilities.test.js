// Vehicle abilities: the mini slips past a barricade over the pavement,
// the monster truck goes over barricades and leaps off the elevated road;
// sand dunes launch a fast car.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { overpassHeight } from "../src/world/citygen.js";

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

test("mini: slips past a barricade over the pavement, never through the carriageway part", () => {
  assert.equal(barricadeRun("mini", 5.6).through, true);
  assert.ok(barricadeRun("mini", 5.6).slips >= 1);
  assert.equal(barricadeRun("mini", 0).through, false);
  // Other cars are stopped on the pavement too.
  assert.equal(barricadeRun("starter", 5.6).through, false);
  assert.equal(barricadeRun("armored", 5.6).through, false);
});

test("monster truck: goes over a barricade (a hop), anywhere across it", () => {
  for (const lat of [0, 5.6]) {
    const r = barricadeRun("monster", lat);
    assert.equal(r.through, true, `lat ${lat}`);
    assert.ok(r.vaults >= 1);
  }
});

test("monster truck leaps off the elevated road over the parapet and lands in the street; other cars are kept on the deck", () => {
  const run = (vehicle) => {
    const s = make(vehicle);
    const op = s.overpasses[0];
    assert.ok(op, "a city with an elevated road");
    const sMid = op.L / 2;
    const path = op.pts ? null : null;
    void path;
    const x = op.a.x + op.u.x * sMid, z = op.a.z + op.u.z * sMid;
    const nx = -op.u.z, nz = op.u.x;
    const p = s.player;
    Object.assign(p, { x, z, level: 1, op: op.id, y: overpassHeight(op, sMid), vx: nx * 9 + op.u.x * 12, vz: nz * 9 + op.u.z * 12, speed: 15, angle: Math.atan2(-(nx * 9 + op.u.x * 12), -(nz * 9 + op.u.z * 12)) });
    s.previousPlayer = { x, z };
    let left = false;
    for (let i = 0; i < 150 && !s.result; i++) {
      s.arrest = 0;
      s.update(1 / 60, { right: true });
      if ((p.level || 0) === 0) left = true;
    }
    return { left, leaps: s.stats.deckLeaps || 0, y: p.y || 0, level: p.level || 0 };
  };
  const m = run("monster");
  assert.ok(m.leaps >= 1 && m.left, JSON.stringify(m));
  assert.equal(m.level, 0);
  assert.ok(m.y < 0.05, "it reached the street");
  const c = run("starter");
  assert.equal(c.leaps, 0);
});

test("sand dunes: every city has a dune block; a fast car takes off over a crest and flies a while", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const L = generateCity(seed);
    assert.ok(L.features.some((f) => f.kind === "dunes"), `seed ${seed}`);
    assert.ok(L.mounds.filter((m) => m.dune).length >= 2);
  }
  const fly = (speed) => {
    const s = make("starter");
    const d = s.layout.mounds.filter((m) => m.dune)[0], p = s.player;
    Object.assign(p, { x: d.x - d.ux * (d.len + 4), z: d.z - d.uz * (d.len + 4), angle: Math.atan2(-d.ux, -d.uz), vx: d.ux * speed, vz: d.uz * speed, speed });
    s.previousPlayer = { x: p.x, z: p.z };
    let frames = 0;
    for (let i = 0; i < 90 && !s.result; i++) {
      s.arrest = 0;
      s.update(1 / 60, {});
      if (p.air) frames++;
    }
    return frames / 60;
  };
  // (The game keeps the throttle open, so every car gets up to speed.)
  assert.ok(fly(22) > 0.3, "airborne for a while");
});
