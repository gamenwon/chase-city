// Map quality pass: destruction density, road geometry, crossings,
// barricades, vehicle mass (generated cities).
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity, polyDist, KIND, overpassHeight } from "../src/world/citygen.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import { createCity } from "../src/game/city.js";
import { Simulation } from "../src/game/simulation.js";
import { junctionGeometry, sidewalkBands, crossings } from "../src/render/sidewalks.js";
import { overpassLocal } from "../src/game/overpass.js";
import { clearSegment } from "../src/game/navigation.js";
import { random } from "../scripts/autoplay.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

test("interactive objects per city back to the old downtown's level (654 props), with far more kinds", () => {
  const old = createCity(createLayout(), { seed: 1 }).props.length;
  assert.equal(old, 654);
  let markets = 0;
  for (const seed of SEEDS) {
    const L = generateCity(seed);
    const props = createCity(L, { seed: 1 }).props;
    const kinds = new Set([...props.map((p) => p.kind), ...L.flyers.map((f) => f.kind)]);
    assert.ok(props.length >= 400, `seed ${seed}: ${props.length} street props`);
    assert.ok(props.length + L.flyers.length >= 0.9 * old, `seed ${seed}: ${props.length + L.flyers.length} interactive objects`);
    assert.ok(kinds.size >= 15, `seed ${seed}: ${kinds.size} kinds`);
    assert.ok(props.filter((p) => p.kind === "hydrant").length >= 30);
    markets += L.markets.length;
  }
  assert.ok(markets >= SEEDS.length - 1, `${markets} markets in ${SEEDS.length} cities`);
});

test("loose furniture stands on open ground: never on a road or in a building", () => {
  for (const seed of SEEDS) {
    const L = generateCity(seed), { kind, N, CELL, half } = L.raster;
    for (const f of L.flyers) {
      const k = kind[Math.floor((f.z + half) / CELL) * N + Math.floor((f.x + half) / CELL)];
      assert.ok(k !== KIND.ROAD && k !== KIND.ALLEY && k !== KIND.BUILT, `seed ${seed}: ${f.kind} on ${k}`);
      assert.ok(!L.buildings.some((b) => Math.abs(b.x - f.x) < b.w / 2 && Math.abs(b.z - f.z) < b.d / 2));
    }
  }
});

test("crossings: only at 3+ street junctions, never overlapping, never on an elevated road's ramp", () => {
  for (const seed of SEEDS) {
    const L = generateCity(seed), J = junctionGeometry(L), cs = crossings(L, J);
    assert.ok(cs.length > 10);
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) assert.ok(Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z) > 3, `seed ${seed}: overlapping crossings`);
      const near = J.polygons.filter((p) => p.degree >= 3 && !p.foot).some((p) => Math.hypot(p.n.x - cs[i].x, p.n.z - cs[i].z) < 40);
      assert.ok(near);
      for (const op of L.overpasses) {
        const loc = overpassLocal(op, cs[i].x, cs[i].z);
        const onRamp = loc.s > 0 && loc.s < op.L && Math.abs(loc.lat) < op.W / 2 && overpassHeight(op, loc.s) < 4.5;
        assert.ok(!onRamp, `seed ${seed}: crossing on a ramp`);
      }
    }
  }
});

test("sidewalk bands follow their own street: under 2% of band points inside another street", () => {
  let pts = 0, bad = 0;
  for (const seed of SEEDS) {
    const L = generateCity(seed), J = junctionGeometry(L), roads = L.graph.edges.filter((e) => e.kind === "road");
    for (const b of sidewalkBands(L, J))
      for (const p of b.pts) {
        const mid = (b.w0 + b.w1) / 2, x = p.x + p.nx * mid, z = p.z + p.nz * mid;
        pts++;
        if (roads.some((e) => e.id !== b.edge && polyDist(x, z, e.pts) < e.width / 2 - 0.3)) bad++;
      }
  }
  assert.ok(bad / pts < 0.02, `${((100 * bad) / pts).toFixed(2)}%`);
});

test("police barricades reach the buildings either side: no way round over the pavement", () => {
  let checked = 0;
  for (const seed of [1, 2, 3, 4]) {
    const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, city: true, cityProfile: "mobile", random: random(seed) });
    s.start();
    const rng = random(seed * 5);
    let steer = 0, until = 0;
    for (let f = 0; f < 60 * 52 && !s.result; f++) {
      if (s.elapsed > until) {
        const r = rng();
        steer = r < 0.55 ? 0 : r < 0.78 ? 1 : -1;
        until = s.elapsed + 0.5 + rng() * 2;
      }
      s.health = 100;
      s.arrest = 0;
      s.update(1 / 60, { left: steer > 0, right: steer < 0 });
    }
    const others = s.staticSolids;
    for (const b of s.barricades) {
      const alongX = b.w > b.d;
      for (const sg of [-1, 1]) {
        const q = alongX ? { x: b.x + sg * (b.w / 2 + 0.5), z: b.z } : { x: b.x, z: b.z + sg * (b.d / 2 + 0.5) };
        // Just past each end there is no room for a car (a building, or
        // the world's edge).
        assert.ok(!clearSegment(q, q, others, 1.0) || !s.navigation.allowed(q), `seed ${seed}: gap past a barricade end`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 4, `${checked} barricades checked`);
});

test("a heavier car shoves a civilian car further (vehicle mass)", () => {
  const push = (vehicle) => {
    const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 2, vehicle, city: true, reinforcements: false, barricades: false, cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 } });
    s.start();
    s.police = [];
    const p = s.player;
    const t = { id: 999, x: p.x - Math.sin(p.angle) * 3.2, z: p.z - Math.cos(p.angle) * 3.2, angle: p.angle, vx: 0, vz: 0, speed: 0, state: "parked", parked: true, health: 100, spot: { x: 0, z: 0 }, color: 1 };
    s.city.traffic.push(t);
    const t0 = { x: t.x, z: t.z };
    for (let f = 0; f < 30; f++) s.update(1 / 60, {});
    return Math.hypot(t.x - t0.x, t.z - t0.z);
  };
  assert.ok(push("boxy") > push("starter"));
});
