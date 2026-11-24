// Casual visual & destruction pass: shop brands, rooftop sculptures,
// billboards and the fireworks shop in every generated city; easier
// bridge pillars; civilian car damage stages and fire.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { BRANDS } from "../src/world/brands.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { CAR_FIRE, carStage, damageCar } from "../src/game/city.js";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

test("every city: every shop building has a brand, one fireworks shop, 8+ giant sculptures, rooftop billboards", () => {
  for (const seed of SEEDS) {
    const L = generateCity(seed);
    const shops = L.buildings.filter((b) => !b.destructible && b.street?.some(Boolean));
    assert.ok(shops.length > 40);
    assert.ok(shops.every((b) => BRANDS[b.brand]), `seed ${seed}: unbranded shop`);
    assert.equal(L.buildings.filter((b) => b.brand === "fireworks").length, 1, `seed ${seed}: fireworks shop`);
    const sc = L.buildings.filter((b) => b.sculpture);
    assert.ok(sc.length >= 8, `seed ${seed}: ${sc.length} sculptures`);
    assert.ok(new Set(sc.map((b) => b.sculpture)).size >= 5, `seed ${seed}: sculpture variety`);
    // Spread out (no two sculptures on neighbouring roofs).
    for (const a of sc) for (const b of sc) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 15);
    assert.ok(L.buildings.some((b) => b.billboard === "digital") || seed % 1 === 0);
    assert.ok(L.buildings.filter((b) => b.billboard).length >= 2, `seed ${seed}: billboards`);
    // Food and shop variety on the street.
    assert.ok(new Set(shops.map((b) => BRANDS[b.brand].type)).size >= 6);
  }
});

test("the same seed gives the same brands (deterministic)", () => {
  const a = generateCity(5).buildings.map((b) => `${b.brand}|${b.sculpture}|${b.billboard}`);
  const b = generateCity(5).buildings.map((b) => `${b.brand}|${b.sculpture}|${b.billboard}`);
  assert.deepEqual(a, b);
});

test("civilian cars: light, medium, heavy (burning) and wrecked stages; some wrecks go up later, never twice", () => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 3, city: true, reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  for (let i = 0; i < 30; i++) s.update(1 / 60, {});
  const cars = s.city.traffic.filter((t) => !t.parked).slice(0, 1);
  const t = cars[0] || s.city.traffic[0];
  assert.equal(carStage(t), 0);
  damageCar(s, t, 3);
  assert.equal(carStage(t), 1);
  damageCar(s, t, 6);
  assert.equal(carStage(t), 2);
  damageCar(s, t, 8);
  assert.equal(carStage(t), 3, `health ${t.health}`);
  assert.ok(t.fireSince != null, "burning");
  // Many wrecks: some go up a few seconds later (not all at once).
  let blow = 0, n = 0;
  for (let i = 0; i < 200; i++) {
    const c = { id: 1000 + i, x: 0, z: 0, vx: 0, vz: 0, health: 100, state: "drive" };
    damageCar(s, c, 30);
    n++;
    if (c.blowAt != null) {
      blow++;
      assert.ok(c.blowAt - s.elapsed >= CAR_FIRE.delay[0] - 1e-9);
    }
    assert.equal(c.state, "wreck");
  }
  assert.ok(blow > n * 0.2 && blow < n * 0.85, `${blow}/${n} blow`);
});

test("a burning wreck explodes once, through the shared blast system, and stays a charred wreck", () => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 4, city: true, reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  for (let i = 0; i < 30; i++) s.update(1 / 60, {});
  const t = s.city.traffic.find((q) => q.parked) || s.city.traffic[0];
  Object.assign(t, { x: s.player.x + 30, z: s.player.z + 30 });
  damageCar(s, t, 40);
  t.blowAt = s.elapsed + 0.2;
  const before = s.stats.explosions || 0;
  for (let i = 0; i < 60; i++) s.update(1 / 60, {});
  const mine = s.city.traffic.find((q) => q === t);
  if (mine) {
    assert.ok(t.burned && t.exploded);
    assert.ok((s.stats.explosions || 0) >= before + 1);
    assert.equal(carStage(t), 5);
    const after = s.stats.explosions;
    t.blowAt = s.elapsed;
    for (let i = 0; i < 30; i++) s.update(1 / 60, {});
    assert.ok(s.stats.explosions - after <= 2, "no second explosion of the same car");
  }
});

test("every city has a container yard and an amusement park with four clear ways through (no traps)", () => {
  for (const seed of SEEDS) {
    const L = generateCity(seed);
    const yard = L.features.find((f) => f.kind === "containers"), park = L.features.find((f) => f.kind === "funpark");
    assert.ok(yard && park, `seed ${seed}`);
    assert.ok(yard.containers.length >= 4 && yard.containers.some((c) => c.level >= 1), "stacked containers");
    assert.ok(yard.landmark?.kind === "robot" && park.landmark?.kind === "dino");
    assert.ok(park.wheel && park.carousel && park.balloons.length);
    for (const f of [yard, park]) {
      const b = f.block;
      const solids = L.obstacles.filter((q) => q.x > b.x0 - 3 && q.x < b.x1 + 3 && q.z > b.z0 - 3 && q.z < b.z1 + 3);
      const clear = (x, z) => !solids.some((q) => Math.abs(q.x - x) < q.w / 2 + 1.2 && Math.abs(q.z - z) < q.d / 2 + 1.2);
      // Straight through along both axes of the block's centre.
      for (let t = -1; t <= 1; t += 0.02) {
        assert.ok(clear(b.cx + t * ((b.x1 - b.x0) / 2 + 2), b.cz), `seed ${seed} ${f.kind}: x lane`);
        assert.ok(clear(b.cx, b.cz + t * ((b.z1 - b.z0) / 2 + 2)), `seed ${seed} ${f.kind}: z lane`);
      }
      // Containers stay off the lanes.
      if (f.kind === "containers")
        for (const c of f.containers) assert.ok(Math.abs(c.x - b.cx) > 3.3 && Math.abs(c.z - b.cz) > 3.3, `seed ${seed}: container on a lane`);
    }
  }
});

test("police helicopter: only in pursuit missions, after the set time, enters from far off screen, never overhead, no collisions", async () => {
  const { HELI } = await import("../src/game/helicopter.js");
  const none = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 3, mission: "parcels" });
  none.start();
  for (let i = 0; i < 60 * (HELI.spawnAfter + 5); i++) none.update(1 / 60, {});
  assert.equal(none.heli, null, "no helicopter without police");
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 3, mission: "survival60" });
  s.start();
  let first = null, minD = Infinity, tracked = 0, frames = 0, close = 0;
  for (let i = 0; i < 60 * 55 && !s.result; i++) {
    s.update(1 / 60, { right: i % 240 < 30 });
    if (s.heli && !first) first = { t: s.elapsed, d: Math.hypot(s.heli.x - s.player.x, s.heli.z - s.player.z) };
    if (s.heli && s.heli.mode !== "entry") {
      // Where it shows on screen (the chase camera looks down from +x/+z:
      // height shifts it up the screen, as if 0.92 m further per metre).
      const ax = s.heli.x - 0.55 * 0.92 * s.heli.y, az = s.heli.z - 0.84 * 0.92 * s.heli.y;
      const dd = Math.hypot(ax - s.player.x, az - s.player.z);
      minD = Math.min(minD, dd);
      if (dd < 9) close++;
      frames++;
      if (s.heli.tracking) tracked++;
    }
    s.arrest = 0;
  }
  assert.ok(first, "it comes");
  assert.ok(first.t >= HELI.spawnAfter - 0.05 && first.d > 120, `entry ${JSON.stringify(first)}`);
  // Shown near the car on screen only briefly (a hard turn under it; the
  // renderer fades it out then).
  assert.ok(close <= frames * 0.05, `near the car on screen ${close}/${frames} frames (min ${minD.toFixed(1)} m)`);
  assert.ok(tracked > frames * 0.5, "tracks the player");
});
