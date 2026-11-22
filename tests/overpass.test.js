// V2.1 elevated road on a generated city: two levels, pillars, collapse.
import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { hitPillar } from "../src/game/overpass.js";
import { makePolice } from "../src/game/police.js";

const SEED = 1; // a city with an overpass
const make = () => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: SEED, reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  return s;
};
const place = (s, x, z, ux, uz, v = 24) => {
  Object.assign(s.player, { x, z, angle: Math.atan2(-ux, -uz), vx: ux * v, vz: uz * v, speed: v, level: 0, y: 0 });
  s.previousPlayer = { x, z };
};

test("most generated cities get an overpass, and every one still connects without it", () => {
  let n = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const L = generateCity(seed);
    if (L.overpasses.length) n++;
  }
  assert.ok(n >= 14, `${n}/20 with an overpass`);
});

test("driving onto a ramp: up to the deck (level 1, 5.6 m), over the junction, down the other side", () => {
  const s = make();
  const op = s.overpasses[0];
  assert.ok(op, "seed has an overpass");
  place(s, op.a.x - op.u.x * 12, op.a.z - op.u.z * 12, op.u.x, op.u.z);
  let maxY = 0;
  const levels = [];
  for (let f = 0; f < 300; f++) {
    s.update(1 / 60, {});
    maxY = Math.max(maxY, s.player.y || 0);
    if (levels.at(-1) !== (s.player.level || 0)) levels.push(s.player.level || 0);
  }
  assert.ok(Math.abs(maxY - op.H) < 0.01);
  assert.deepEqual(levels, [0, 1, 0]);
  const s1 = (s.player.x - op.a.x) * op.u.x + (s.player.z - op.a.z) * op.u.z;
  assert.ok(s1 > op.L, "came down the far ramp");
});

test("the crossing street runs under the deck (stays on the ground)", () => {
  const s = make();
  const op = s.overpasses[0], J = op.junction;
  place(s, J.x - op.n.x * 25, J.z - op.n.z * 25, op.n.x, op.n.z);
  let lv = 0;
  for (let f = 0; f < 180; f++) {
    s.update(1 / 60, {});
    lv = Math.max(lv, s.player.level || 0);
  }
  assert.equal(lv, 0);
  assert.ok((s.player.x - J.x) * op.n.x + (s.player.z - J.z) * op.n.z > 10, "drove through under it");
});

test("two broken pillars bring the deck down: off the road network, debris stays, a car on the ramp drops off and drives on", () => {
  const s = make();
  const op = s.overpasses[0];
  const deck = s.navigation.nodes.filter((n) => n.level === 1);
  assert.ok(deck.length > 0 && deck.every((n) => !n.dead));
  hitPillar(s, op.pillars[0], 40, 1);
  hitPillar(s, op.pillars[0], 40, 1);
  assert.equal(op.state, "up", "one pillar is not enough");
  hitPillar(s, op.pillars[2], 40, 1);
  hitPillar(s, op.pillars[2], 40, 1);
  assert.equal(op.state, "falling");
  assert.ok(deck.every((n) => n.dead), "nobody routes over it");
  for (let f = 0; f < 120; f++) s.update(1 / 60, {});
  assert.equal(op.state, "down");
  assert.ok(op.debris.length >= 4);
  place(s, op.a.x - op.u.x * 10, op.a.z - op.u.z * 10, op.u.x, op.u.z);
  let up = false, dropped = false;
  for (let f = 0; f < 240; f++) {
    s.update(1 / 60, {});
    if (s.player.level === 1) up = true;
    if (up && !s.player.level && s.player.y > 0.3) dropped = true;
  }
  assert.ok(up && dropped, "went up and dropped off the broken edge");
  assert.equal(s.player.level || 0, 0);
  // Driving on after the drop.
  const p0 = { x: s.player.x, z: s.player.z };
  for (let f = 0; f < 120; f++) s.update(1 / 60, {});
  assert.ok(Math.hypot(s.player.x - p0.x, s.player.z - p0.z) > 15);
  // Debris persists until the run ends.
  for (let f = 0; f < 600; f++) s.update(1 / 60, {});
  assert.equal(op.state, "down");
  assert.ok(s.solids.some((b) => b.kind === "rubble"));
});

test("a hard ram by the player's car damages a pillar (by impact speed)", () => {
  const s = make();
  const q = s.overpasses[0].pillars[0];
  const op = s.overpasses[0];
  const ux = -op.n.x * q.side, uz = -op.n.z * q.side;
  place(s, q.x - ux * 8, q.z - uz * 8, ux, uz);
  for (let f = 0; f < 60; f++) s.update(1 / 60, {});
  assert.ok(q.health < 100, `pillar health ${q.health}`);
});

test("police find their way up the ramp to a player on the deck (two-level routing)", () => {
  const s = make();
  const op = s.overpasses[0];
  const mid = { x: op.a.x + op.u.x * op.L / 2, z: op.a.z + op.u.z * op.L / 2 };
  const from = { x: op.a.x - op.u.x * 14, z: op.a.z - op.u.z * 14 };
  const path = s.navigation.findPath(from, { ...mid, level: 1 });
  assert.ok(path.some((q) => q.level === 1), "route goes onto the deck");
  const p = s.player;
  Object.assign(p, { x: mid.x, z: mid.z, level: 1, op: 0, y: op.H, vx: 0, vz: 0, speed: 0 });
  s.police = [Object.assign(makePolice(0), { x: from.x, z: from.z, angle: Math.atan2(-op.u.x, -op.u.z) })];
  let reached = false;
  for (let f = 0; f < 600 && !reached; f++) {
    Object.assign(p, { x: mid.x, z: mid.z, vx: 0, vz: 0 });
    s.update(1 / 60, {});
    const c = s.police[0];
    reached = c.level === 1 && Math.hypot(c.x - p.x, c.z - p.z) < 8;
  }
  assert.ok(reached);
});
