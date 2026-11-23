// V2.1 procedural city: generation, validation, replay, gameplay hooks.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity, validateCity, KIND } from "../src/world/citygen.js";
import { Simulation } from "../src/game/simulation.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import { wedgeSweep } from "../scripts/wedge-repro.mjs";
import { CONFIG } from "../src/game/config.js";

test("60 seeds: every city generates, passes validation and has the features (modules, T-junctions, alleys, parks, shortcuts, overpass)", () => {
  const seen = { t: 0, alleys: 0, parks: 0, overpass: 0, curvedOverpass: 0, destructible: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const L = generateCity(seed);
    assert.ok(validateCity(L).ok, `seed ${seed}`);
    const roads = L.graph.edges.filter((e) => e.kind === "road");
    const deg = new Map();
    for (const e of roads) for (const id of [e.a, e.b]) deg.set(id, (deg.get(id) || 0) + 1);
    if ([...deg.values()].some((d) => d === 3)) seen.t++;
    seen.alleys += L.alleys.length > 0;
    seen.parks += L.parks.length > 0;
    seen.overpass += L.overpasses.length > 0;
    seen.curvedOverpass += !!L.overpasses[0]?.curved;
    seen.destructible += L.buildings.some((b) => b.destructible);
    assert.equal(L.exits.length, 4);
    // Every landmark module, and every yard kind of the stable build.
    for (const k of ["gas", "court", "park", "gasDepot"]) assert.ok(L.locations[k], `seed ${seed}: ${k}`);
    const kinds = new Set(L.yards.map((y) => y.kind));
    for (const k of ["parking", "carwash", "construction", "market", "cafe", "depot", "plaza", "corner"]) assert.ok(kinds.has(k), `seed ${seed}: ${k}`);
  }
  for (const [k, v] of Object.entries(seen)) assert.ok(v >= (k === "curvedOverpass" ? 8 : 30), `${k}: ${v}/60`);
});

test("same seed, same city (replay); a new seed, a different city", () => {
  const a = generateCity(4242), b = generateCity(4242), c = generateCity(4243);
  assert.deepEqual(a.buildings, b.buildings);
  assert.deepEqual(a.graph.edges.map((e) => e.pts), b.graph.edges.map((e) => e.pts));
  assert.notDeepEqual(a.buildings.map((q) => [q.x, q.z]), c.buildings.map((q) => [q.x, q.z]));
});

test("a run keeps its city; restart makes a new one; a fixed seed replays it", () => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity });
  const first = s.layout;
  s.start();
  for (let f = 0; f < 60; f++) s.update(1 / 60, {});
  assert.equal(s.layout, first);
  s.reset();
  assert.notEqual(s.layout.seed, first.seed);
  const r = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 99 });
  r.reset();
  assert.equal(r.layout.seed, 99);
  assert.deepEqual(r.layout.buildings, generateCity(99).buildings);
});

test("player start, police starts and pickups are on clear road, never inside a building", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const mission of ["survival60", "parcels"]) {
      const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, mission });
      const solids = s.solids;
      const inside = (q, r) => solids.some((b) => resolveBuilding({ x: q.x, z: q.z }, b, r));
      assert.ok(!inside(s.player, CONFIG.radius), `player ${seed}`);
      for (const c of s.police) assert.ok(!inside(c, CONFIG.policeRadius - 0.1), `police ${seed}`);
      for (const q of s.pickups) assert.ok(!inside(q, 1), `pickup ${seed}`);
      // Every pickup is reachable from the start.
      for (const q of s.pickups) assert.ok(s.navigation.findPath(s.player, q).length > 0, `route to pickup ${seed}`);
    }
  }
});

test("alleys are on the road network: police can route through them", () => {
  let checked = 0;
  for (let seed = 1; seed <= 6 && checked < 3; seed++) {
    const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed });
    for (const a of s.layout.alleys) {
      const mid = { x: (a.pts[0].x + a.pts[1].x) / 2, z: (a.pts[0].z + a.pts[1].z) / 2 };
      const near = s.navigation.nodes.filter((n) => Math.hypot(n.x - mid.x, n.z - mid.z) < 6);
      assert.ok(near.length, `alley node near ${mid.x},${mid.z} (seed ${seed})`);
      const path = s.navigation.findPath(s.player, mid);
      assert.ok(path.length > 1, `route into the alley (seed ${seed})`);
      checked++;
    }
  }
  assert.ok(checked >= 2);
});

test("every exit gate is reachable on the road network once the escape opens", () => {
  for (const seed of [1, 2, 3]) {
    const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, reinforcements: false });
    for (const e of s.layout.exits) {
      s.escape.exit = e;
      s.navigation.addExit(e);
      assert.ok(s.navigation.findPath(s.player, { x: e.anchor.x + e.dx * 30, z: e.anchor.z + e.dz * 30 }).length > 1, `exit ${e.id} seed ${seed}`);
    }
  }
});

test("wedge sweep on generated cities (both cars): shoved into corners, alleys and gaps, never stuck or inside a wall", () => {
  for (const [seed, vehicle] of [[3, "starter"], [5, "boxy"]]) {
    const make = () => new Simulation(createLayout(), { cityGenerator: generateCity, seed, vehicle, reinforcements: false, barricades: false });
    const layout = make().layout;
    const r = wedgeSweep({ layout, make, limit: 160 });
    assert.ok(r.runs > 100, `${r.runs} runs`);
    assert.equal(r.stuck.length, 0, `seed ${seed}: ${JSON.stringify(r.stuck.slice(0, 2))}`);
    assert.equal(r.overlaps, 0);
  }
});

test("drive-through buildings: a full-speed ram goes through, a slow nudge does nothing, high-rises stay solid", () => {
  let through = 0, tried = 0, standing = 0;
  for (let seed = 1; seed <= 12 && tried < 8; seed++) {
    const mk = () => {
      const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, reinforcements: false, barricades: false });
      s.start();
      s.police = [];
      return s;
    };
    const s0 = mk();
    assert.ok(s0.layout.buildings.filter((b) => !b.destructible).every((b) => !s0.buildingCells.cells.some((c) => s0.layout.buildings[c.building] === b)));
    assert.ok(s0.layout.buildings.filter((b) => b.destructible).every((b) => b.h <= 9));
    for (const [i, b] of s0.layout.buildings.entries()) {
      if (!b.destructible || tried >= 8) continue;
      const fx = b.through === "x" ? 1 : 0, fz = b.through === "z" ? 1 : 0;
      const s = mk(), p = s.player;
      const start = { x: b.x + fx * (b.w / 2 + 10), z: b.z + fz * (b.d / 2 + 10) };
      if (s.solids.some((q) => Math.abs(q.x - start.x) < q.w / 2 + 1.3 && Math.abs(q.z - start.z) < q.d / 2 + 1.3)) continue;
      // Slow first: nothing breaks.
      Object.assign(p, { x: b.x + fx * (b.w / 2 + 2.5), z: b.z + fz * (b.d / 2 + 2.5), angle: Math.atan2(fx, fz), vx: -fx * 5, vz: -fz * 5, speed: 5 });
      for (let f = 0; f < 20; f++) s.update(1 / 60, {});
      assert.equal(s.buildingCells.cells.filter((c) => c.building === i && !c.alive).length, 0, "slow nudge");
      Object.assign(p, { x: start.x, z: start.z, angle: Math.atan2(fx, fz), vx: -fx * 24, vz: -fz * 24, speed: 24 });
      s.previousPlayer = { ...start };
      for (let f = 0; f < 120; f++) s.update(1 / 60, {});
      tried++;
      const past = (p.x - b.x) * -fx + (p.z - b.z) * -fz;
      if (past > (fx ? b.w : b.d) / 2 + 1) through++;
      // A corridor along the blow breaks, not the whole building (a very
      // small one can fall inside the corridor).
      const cells = s.buildingCells.cells.filter((c) => c.building === i);
      if (cells.some((c) => c.alive)) standing++;
    }
  }
  assert.ok(tried >= 5 && through >= tried - 1, `${through}/${tried} through`);
  assert.ok(standing >= tried / 2, `${standing}/${tried} keep standing parts`);
});

test("the heavier car breaks walls more readily (impact x mass)", () => {
  const dmg = (vehicle) => {
    let seed = 1;
    while (!generateCity(seed).buildings.some((q) => q.destructible)) seed++;
    const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, vehicle, reinforcements: false, barricades: false });
    s.start();
    s.police = [];
    const b = s.layout.buildings.find((q) => q.destructible);
    const fx = b.through === "x" ? 1 : 0, fz = b.through === "z" ? 1 : 0;
    const p = s.player;
    Object.assign(p, { x: b.x + fx * (b.w / 2 + 3), z: b.z + fz * (b.d / 2 + 3), angle: Math.atan2(fx, fz), vx: -fx * 12, vz: -fz * 12, speed: 12 });
    for (let f = 0; f < 20; f++) s.update(1 / 60, {});
    return s.buildingCells.cells.reduce((a, c) => a + (70 - Math.max(0, c.hp)), 0);
  };
  assert.ok(dmg("boxy") > dmg("starter"));
});

test("raster kinds are exported for the renderer", () => {
  assert.equal(KIND.PARK, 7);
  assert.equal(KIND.GAS, 10);
});
