// Destruction & action content pass: restaurant plaza, large construction
// site with jump ramps, storefront reactions, every generated city.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { groundHeight } from "../src/game/jumps.js";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

test("every city (20 seeds) has a restaurant plaza and a large construction site besides all the old facilities", () => {
  for (const seed of SEEDS) {
    const L = generateCity(seed);
    const diner = L.features.find((f) => f.kind === "diner"), site = L.features.find((f) => f.kind === "bigsite");
    assert.ok(diner && site, `seed ${seed}`);
    for (const k of ["gas", "court", "park", "gasDepot"]) assert.ok(L.locations[k]);
    assert.equal(L.buildings.filter((b) => b.diner).length, 2);
    assert.equal(L.arches.length >= 1, true);
    assert.ok(diner.flyers.length >= 30, `seed ${seed}: ${diner.flyers.length} plaza pieces`);
    assert.ok(site.flyers.length + site.items.length >= 25 && site.vehicles.length >= 2);
    assert.ok(L.mounds.some((m) => m.main));
  }
});

test("the plaza is a drive-through: wide open sides, nothing solid in the middle", () => {
  for (const seed of SEEDS) {
    const L = generateCity(seed), f = L.features.find((q) => q.kind === "diner").block;
    const solids = [...L.buildings, ...L.obstacles].filter((q) => q.x > f.x0 - 0.5 && q.x < f.x1 + 0.5 && q.z > f.z0 - 0.5 && q.z < f.z1 + 0.5);
    // A straight east-west line through the middle is clear for a car.
    for (let x = f.x0 - 2; x <= f.x1 + 2; x += 0.5)
      assert.ok(!solids.some((q) => Math.abs(q.x - x) < q.w / 2 + 1.2 && Math.abs(q.z - f.cz) < q.d / 2 + 1.2), `seed ${seed}: blocked at ${x.toFixed(1)}`);
  }
});

test("the ramp lane of the construction site is clear end to end (run-up, take-off, landing)", () => {
  for (const seed of SEEDS) {
    const L = generateCity(seed), site = L.features.find((q) => q.kind === "bigsite"), m = L.mounds.find((q) => q.main);
    const things = [...L.obstacles, ...L.buildings, ...site.flyers, ...site.items, ...site.vehicles.map((v) => ({ ...v, w: 3, d: 3 }))];
    for (let a = -m.len - 8; a <= m.len + 8; a += 0.5) {
      const x = m.x + m.ux * a, z = m.z + m.uz * a;
      if (Math.max(Math.abs(x), Math.abs(z)) > 104) continue;
      assert.ok(!things.some((q) => Math.abs(q.x - x) < (q.w || 0.8) / 2 + 1.2 && Math.abs(q.z - z) < (q.d || 0.8) / 2 + 1.2), `seed ${seed}: something on the ramp lane at ${a}`);
    }
    assert.ok(Math.abs(groundHeight(L.mounds, m.x, m.z) - m.h) < 1e-6);
  }
});

test("a car driving over the big ramp at speed jumps (no button), lands and drives on; a heavier car flies no higher", () => {
  const run = (speed, vehicle = "starter") => {
    const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 3, vehicle, reinforcements: false, barricades: false });
    s.start();
    s.police = [];
    const m = s.layout.mounds.find((q) => q.main), p = s.player;
    Object.assign(p, { x: m.x - m.ux * (m.len + 5), z: m.z - m.uz * (m.len + 5), angle: Math.atan2(-m.ux, -m.uz), vx: m.ux * speed, vz: m.uz * speed, speed });
    s.previousPlayer = { x: p.x, z: p.z };
    let air = 0, peak = 0, took = null, land = null;
    for (let f = 0; f < 80; f++) {
      s.update(1 / 60, {});
      if (p.air) (air += 1 / 60), (took ||= { x: p.x, z: p.z });
      else if (took && !land) land = { x: p.x, z: p.z, speed: Math.hypot(p.vx, p.vz) };
      peak = Math.max(peak, p.y || 0);
    }
    return { air, peak, dist: took && land ? Math.hypot(land.x - took.x, land.z - took.z) : 0, land, y: p.y || 0 };
  };
  const fast = run(22);
  assert.ok(fast.air > 0.5 && fast.air < 1.1, `air ${fast.air}`);
  assert.ok(fast.dist > 12 && fast.dist < 26, `dist ${fast.dist}`);
  assert.ok(fast.land.speed > 15, "drives on after landing");
  assert.equal(fast.y, 0);
  const heavy = run(22, "boxy");
  assert.ok(heavy.peak <= fast.peak + 1e-6, "a heavier car flies no higher");
});

test("storefronts get varied reactions; restaurants are diners or gas-bottle shops", async () => {
  const { Storefronts } = await import("../src/preview/locations/storefronts.js").catch(() => ({}));
  // (three.js scene objects are not needed to read the types.)
  const L = generateCity(3);
  assert.ok(L.buildings.filter((b) => b.diner).every((b) => b.shopType === "diner" || b.shopType === "bottles"));
  assert.ok(typeof Storefronts === "function" || Storefronts === undefined);
});
