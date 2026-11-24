import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { REPAIRS } from "../src/game/repairs.js";
import { DAMAGE, hurt } from "../src/game/durability.js";

function sim(vehicle = "starter") {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 3, vehicle, reinforcements: false, barricades: false });
  s.start();
  return s;
}

test("repair toolboxes are placed on clear road, spread out, limited", () => {
  const s = sim();
  assert.ok(s.repairs.length >= 3 && s.repairs.length <= REPAIRS.count);
  for (const r of s.repairs) {
    assert.ok(!s.staticSolids.some((q) => Math.abs(q.x - r.x) < q.w / 2 && Math.abs(q.z - r.z) < q.d / 2));
    for (const o of s.repairs) if (o !== r) assert.ok(Math.hypot(o.x - r.x, o.z - r.z) >= REPAIRS.spacing);
  }
});

test("a toolbox restores 25 % of max HP, capped, once; a full car leaves it", () => {
  const s = sim("armored");
  const r = s.repairs[0];
  Object.assign(s.player, { x: r.x, z: r.z, vx: 0, vz: 0, speed: 0 });
  s.update(1 / 60);
  assert.equal(r.taken, false, "full car does not use it");
  s.hp = s.maxHp - 100;
  s.health = (s.hp / s.maxHp) * 100;
  s.update(1 / 60);
  assert.equal(r.taken, true);
  assert.ok(Math.abs(s.hp - (s.maxHp - 100 + s.maxHp * DAMAGE.repair)) < 1e-6);
  assert.equal(s.repairFx.length, 1);
  const hp = s.hp;
  s.update(1 / 60);
  assert.equal(s.hp, hp, "taken once");
  // Capped at max.
  const r2 = s.repairs[1];
  s.hp = s.maxHp - 5;
  Object.assign(s.player, { x: r2.x, z: r2.z });
  s.update(1 / 60);
  assert.equal(s.hp, s.maxHp);
});

test("damage cooldown and window cap stop stacking", () => {
  const s = sim();
  const a = hurt(s, "wall", 4, "w1");
  const b = hurt(s, "wall", 4, "w1");
  assert.ok(a > 0 && b === 0);
  let total = 0;
  for (let i = 0; i < 10; i++) total += hurt(s, "blast", 10, "b" + i);
  assert.ok(total <= DAMAGE.windowCap);
});
