// CITY CHAOS: every activity at once, nothing resets the city, wanted
// level, heavy police, combo, mode isolation.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { CHAOS, chaosDestroyed } from "../src/game/chaos.js";
import { HEAVY_POLICE } from "../src/game/police.js";

const make = (extra = {}) => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 3, mission: "cityChaos", reinforcements: true, ...extra });
  s.start();
  return s;
};
const step = (s, n = 1) => {
  for (let i = 0; i < n && !s.result; i++) s.update(1 / 60, {});
};

test("start: police, a target, parcels, coins and repairs all active at once; calm start", () => {
  const s = make();
  assert.ok(s.chaos);
  assert.equal(s.police.length, CHAOS.startPolice);
  assert.ok(s.target);
  assert.equal(s.pickups.length, CHAOS.parcels.onMap);
  assert.ok(s.coins.length > 20);
  assert.ok(s.repairs.length >= 3);
  assert.equal(s.chaos.level, 1);
  assert.equal(s.mission.definition.timeLimit, null);
});

test("other missions do not turn CITY CHAOS on", () => {
  for (const mission of ["survival60", "parcels", "targetHunt"]) {
    const s = make({ mission });
    assert.equal(s.chaos, null, mission);
    step(s, 30);
    assert.equal(s.chaos, null, mission);
  }
});

test("parcel: picked up by driving through, carried, delivered at the drop-off; score and coins; parcel comes back", () => {
  const s = make();
  const q = s.pickups[0];
  Object.assign(s.player, { x: q.x, z: q.z, vx: 0, vz: 0, speed: 0 });
  s.previousPlayer = { x: q.x, z: q.z };
  step(s);
  assert.equal(q.taken, true);
  assert.equal(s.chaos.carried, 1);
  assert.ok(s.chaos.delivery, "a drop-off appears");
  const before = { score: s.chaos.score, coins: s.runCoins };
  const d = s.chaos.delivery;
  Object.assign(s.player, { x: d.x, z: d.z });
  s.previousPlayer = { x: d.x, z: d.z };
  step(s);
  assert.equal(s.chaos.carried, 0);
  assert.equal(s.chaos.counts.deliveries, 1);
  assert.equal(s.chaos.delivery, null);
  assert.ok(s.chaos.score >= before.score + CHAOS.score.delivery);
  assert.equal(s.runCoins, before.coins + CHAOS.coins.delivery);
  assert.equal(s.result, null, "a delivery never ends the run");
  step(s, Math.ceil(CHAOS.parcels.respawn * 60) + 2);
  assert.equal(s.pickups.filter((p) => !p.taken).length, CHAOS.parcels.onMap);
});

test("target: taken down -> reward once, a new target comes in off the player's position later; the run goes on", () => {
  const s = make();
  const t = s.target;
  t.health = 0;
  t.state = "wrecked";
  t.wreckedAt = s.elapsed;
  const coins = s.runCoins;
  step(s);
  assert.equal(s.chaos.counts.targets, 1);
  assert.equal(s.runCoins, coins + CHAOS.coins.target);
  step(s, 10);
  assert.equal(s.chaos.counts.targets, 1, "rewarded once");
  step(s, Math.ceil(CHAOS.target.respawn * 60) + 70);
  assert.notEqual(s.target, t);
  assert.notEqual(s.target.state, "wrecked");
  const d = Math.hypot(s.target.x - s.player.x, s.target.z - s.player.z);
  assert.ok(d > 50, `new target at ${d.toFixed(0)} m`);
  assert.equal(s.result, null);
});

test("combo: player destruction within the window raises it, each object once, far-away police crashes do not count", () => {
  const s = make();
  const p = s.player;
  step(s, 5);
  assert.ok(chaosDestroyed(s, "shop", "a", p.x, p.z));
  assert.ok(chaosDestroyed(s, "police", "b", p.x + 5, p.z));
  assert.equal(chaosDestroyed(s, "police", "b", p.x + 5, p.z), false, "same object once");
  assert.equal(s.chaos.combo.count, 2);
  assert.equal(chaosDestroyed(s, "police", "far", p.x + 300, p.z), false, "not the player's");
  assert.equal(s.chaos.counts.police, 1);
  step(s, Math.ceil(CHAOS.combo.window * 60) + 5);
  assert.equal(s.chaos.combo.count, 0);
  assert.equal(s.chaos.combo.best, 2);
  for (let i = 0; i < 40; i++) chaosDestroyed(s, "prop", "p" + i, p.x, p.z);
  assert.ok(s.chaos.combo.multiplier <= CHAOS.combo.maxMultiplier);
});

test("wanted level: grows with heat (never instantly), fleet and heavy units follow", () => {
  const s = make({ seed: 5 });
  step(s, 60 * 5);
  assert.equal(s.chaos.level, 1);
  s.chaos.heat = CHAOS.levels[3];
  step(s);
  assert.equal(s.chaos.level, 4);
  step(s, 60 * 12);
  const active = s.police.filter((c) => c.state === "active");
  assert.ok(active.length > CHAOS.startPolice, `fleet ${active.length}`);
  assert.ok(active.some((c) => c.heavy === "suv"), "a heavy SUV joins at 4");
  assert.ok(s.heli, "helicopter at 4");
  s.chaos.heat = CHAOS.levels[4];
  step(s, 60 * 12);
  assert.equal(s.chaos.level, 5);
  assert.ok(s.police.some((c) => c.state === "active" && c.heavy === "armored"), "armored truck at 5");
});

test("heavy police: heavier, sturdier, slower, not indestructible; shove heavy player cars", () => {
  assert.ok(HEAVY_POLICE.armored.mass > HEAVY_POLICE.suv.mass && HEAVY_POLICE.suv.mass > 1);
  assert.ok(HEAVY_POLICE.armored.topSpeed < 27.5);
  const run = (heavy) => {
    const s = make({ vehicle: "armored" });
    const c = s.police[0];
    if (heavy) Object.assign(c, { heavy, mass: HEAVY_POLICE[heavy].mass });
    const p = s.player;
    // Head-on at speed.
    Object.assign(p, { vx: 0, vz: -15, speed: 15, angle: 0 });
    Object.assign(c, { x: p.x, z: p.z - 3.6, vx: 0, vz: 10, angle: Math.PI });
    s.resolvePlayerPolice();
    return { pv: p.vz, hp: s.hp };
  };
  const normal = run(null), armored = run("armored");
  assert.ok(armored.pv > normal.pv, `the heavy one stops the armored car more (${normal.pv.toFixed(1)} vs ${armored.pv.toFixed(1)})`);
});
