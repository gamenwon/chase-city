// CITY CHAOS: every activity at once, nothing resets the city, wanted
// level, heavy police, combo, mode isolation.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { CHAOS, chaosDestroyed } from "../src/game/chaos.js";
import { HEAVY_POLICE } from "../src/game/police.js";
import { random } from "../scripts/autoplay.js";

const make = (extra = {}) => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 3, mission: "cityChaos", reinforcements: true, random: random(42), ...extra });
  s.start();
  return s;
};
// (The player sits still in these tests: the police are kept from
// arresting it, durability from running out, so the run goes on.)
const step = (s, n = 1) => {
  for (let i = 0; i < n && !s.result; i++) {
    s.arrest = 0;
    s.update(1 / 60, {});
  }
};

test("start: police, a target, coins and repairs all active at once; calm start", () => {
  const s = make();
  assert.ok(s.chaos);
  assert.equal(s.police.length, CHAOS.startPolice);
  assert.ok(s.target);
  // (Evaluation build: no parcels or drop-offs in CITY CHAOS.)
  assert.equal(s.pickups.length, CHAOS.parcels.enabled ? CHAOS.parcels.onMap : 0);
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

test("evaluation build: CITY CHAOS has no parcels or drop-offs; the parcel mission still does", () => {
  const s = make();
  step(s, 120);
  assert.equal(CHAOS.parcels.enabled, false);
  assert.equal(s.pickups.length, 0);
  assert.equal(s.chaos.carried, 0);
  assert.equal(s.chaos.delivery, null);
  const p = make({ mission: "parcels" });
  assert.equal(p.pickups.length, 5);
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
  assert.ok(active.some((c) => c.heavy === "armored"), "an armored truck joins at 4");
  assert.ok(!active.some((c) => c.heavy === "suv"), "no heavy SUV in this lineup");
  assert.ok(s.heli, "helicopter at 4");
  s.chaos.heat = CHAOS.levels[4];
  step(s, 60 * 12);
  assert.equal(s.chaos.level, 5);
  assert.ok(s.police.filter((c) => c.state === "active" && c.heavy === "armored").length >= 1, "armored trucks at 5");
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

test("coin carrier: never destroyed in CITY CHAOS; every hit throws one big coin worth 10 beside it (not into buildings), picked up after it lands", async () => {
  const { resolveTargetContact } = await import("../src/game/target.js");
  const s = make();
  const t = s.target;
  t.state = "fleeing";
  const before = s.coins.length;
  let hits = 0;
  for (let k = 0; k < 6; k++) {
    // A hard ram, past the hit cooldown.
    Object.assign(s.player, { x: t.x - 2.2, z: t.z, vx: 22, vz: 0, level: 0 });
    Object.assign(t, { vx: 0, vz: 0, lastHitAt: -99, level: 0 });
    if (resolveTargetContact(s) > 0) hits++;
  }
  assert.ok(hits >= 3, `hits ${hits}`);
  assert.equal(t.health, 100, "no damage");
  assert.equal(t.state, "fleeing");
  const spilled = s.coins.slice(before);
  assert.equal(spilled.length, hits);
  for (const c of spilled) assert.ok(c.value === 10 && c.size > 2, "a big coin worth 10");
  for (const c of spilled) assert.equal(s.nearSolids(c.x, c.z, 0.6).length, 0, "on open ground");
  // Still flying: not picked yet; once landed, the player collects them.
  const c = spilled.at(-1);
  Object.assign(s.player, { x: c.x, z: c.z, vx: 0, vz: 0 });
  s.update(1 / 60, {});
  assert.equal(c.taken, false, "not while flying");
  step(s, 30);
  // Easy to grab: picked up from 3.8 m away (a normal coin needs 2.6 m).
  Object.assign(s.player, { x: c.x + 3.8, z: c.z, vx: 0, vz: 0 });
  const coins0 = s.runCoins;
  s.update(1 / 60, {});
  assert.ok(c.taken && s.runCoins >= coins0 + 10, "picked up after landing, worth 10");
});
