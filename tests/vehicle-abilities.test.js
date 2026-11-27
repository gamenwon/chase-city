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

test("hill streets: about four places on the city's own streets go flat, up, down, up, down, flat; buildings along them stand on the slope", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const L = generateCity(seed);
    const fs = L.features.filter((q) => q.kind === "hillstreet");
    // About four places per city.
    assert.ok(fs.length >= 3 && fs.length <= 4, `seed ${seed}: ${fs.length}`);
    // Existing streets (no new ones), no hill block.
    assert.equal(L.features.some((q) => q.kind === "hillroad" || q.kind === "dunes"), false);
    // One of them a single tall hill, about two storeys high.
    const tall = fs.filter((f) => f.tall);
    assert.equal(tall.length, 1, `seed ${seed}: one tall hill`);
    assert.equal(tall[0].mounds.length, 1);
    assert.ok(tall[0].mounds[0].h >= 5.5 && tall[0].mounds[0].h <= 6.4, `seed ${seed}: tall ${tall[0].mounds[0].h}`);
    for (const f of fs) {
      // Two hills: one long hill on each of two streets in line through a
      // junction (or two on one street).
      if (!f.tall) assert.equal(f.mounds.length, 2);
      const ids = new Set(f.mounds.map((m) => m.edge));
      for (const id of ids) {
        const e = L.graph.edges.find((q) => q.id === id);
        assert.ok(e && e.hill && e.kind === "road" && !e.ring && !e.avenue, "an ordinary street");
      }
    }
    assert.ok(L.buildings.some((b) => b.baseY > 0.2), "buildings raised along the slope");
  }
});

test("hill street: a car drives over both crests and back to level; fast over a crest it takes off", () => {
  const run = (speed) => {
    const s = make("starter");
    const f = s.layout.features.find((q) => q.kind === "hillstreet");
    const p = s.player, { a, ux, uz } = f.segs[0];
    const L = f.segs.reduce((n, q) => n + q.L, 0);
    Object.assign(p, { x: a.x + ux * 2, z: a.z + uz * 2, angle: Math.atan2(-ux, -uz), vx: ux * speed, vz: uz * speed, speed, y: 0 });
    const ys = [];
    let air = 0;
    for (let i = 0; i < Math.ceil(((L - 4) / speed) * 60); i++) {
      p.vx = ux * speed;
      p.vz = uz * speed;
      s.move(p, 1 / 60, s.vehicle.stats.radius);
      updateJump(s, p, 1 / 60, 1);
      ys.push(p.y || 0);
      if (p.air) air++;
    }
    return { ys, air };
  };
  const slow = run(8);
  let peaks = 0;
  for (let i = 1; i < slow.ys.length - 1; i++) if (slow.ys[i] > 0.5 && slow.ys[i] >= slow.ys[i - 1] && slow.ys[i] > slow.ys[i + 1]) peaks++;
  assert.equal(peaks, 2, `peaks ${peaks}`);
  assert.equal(slow.air, 0, "slow: no jump");
  assert.ok(slow.ys.at(-1) < 0.05);
  assert.ok(run(22).air > 6, "fast: airborne over a crest");
});

test("tall hill street: slowly up two storeys and down to level; fast over the crest it flies", () => {
  const run = (speed) => {
    const s = make("starter");
    const f = s.layout.features.find((q) => q.kind === "hillstreet" && q.tall);
    const p = s.player, { a, ux, uz, L } = f.segs[0];
    Object.assign(p, { x: a.x + ux * 1, z: a.z + uz * 1, angle: Math.atan2(-ux, -uz), vx: ux * speed, vz: uz * speed, speed, y: 0 });
    let top = 0, air = 0;
    const ys = [];
    for (let i = 0; i < Math.ceil(((L - 2) / speed) * 60); i++) {
      p.vx = ux * speed;
      p.vz = uz * speed;
      s.move(p, 1 / 60, s.vehicle.stats.radius);
      updateJump(s, p, 1 / 60, 1);
      top = Math.max(top, p.y || 0);
      ys.push(p.y || 0);
      if (p.air) air++;
    }
    return { top, air, end: ys.at(-1) };
  };
  const slow = run(7);
  assert.ok(slow.top > 5.4, `top ${slow.top}`);
  assert.equal(slow.air, 0, "slow: no jump");
  assert.ok(slow.end < 0.05);
  assert.ok(run(22).air > 6, "fast: airborne over the crest");
});
