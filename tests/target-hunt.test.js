// TARGET HUNT: the fleeing target drives the roads (never through solids,
// never jumps, does not loop), only real ramming hurts it (damage follows
// impact severity), the takedown wins the mission, there are no police,
// and a restart brings a fresh target.
import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import { TARGET, resolveTargetContact } from "../src/game/target.js";
import { MISSIONS } from "../src/game/missions.js";
import { missionOrder } from "../src/game/catalog.js";
import { random } from "../scripts/autoplay.js";

const layout = createLayout();
const hunt = (seed = 1) => {
  const s = new Simulation(layout, { width: 390, height: 664, random: random(seed + 7000), city: true, cityProfile: "mobile", mission: "targetHunt" });
  return s;
};

test("TARGET HUNT is listed after the existing missions (CITY CHAOS first), no police, no clock", () => {
  assert.deepEqual(missionOrder(), ["cityChaos", "survival60", "parcels", "targetHunt"]);
  const def = MISSIONS.targetHunt;
  assert.equal(def.rules.police, false);
  assert.equal(def.timeLimit, null);
  const s = hunt();
  assert.equal(s.police.length, 0);
  assert.ok(s.target && s.target.state === "waiting");
  // A reachable start on a road, 45-62 m from the player, clear of solids.
  const d = Math.hypot(s.target.x - s.player.x, s.target.z - s.player.z);
  assert.ok(d > 40 && d < 70, `${d}`);
  assert.equal(s.nearSolids(s.target.x, s.target.z, 1.5).filter((b) => resolveBuilding({ ...s.target }, b, 1.2)).length, 0);
  // It waits for START (briefing), then flees.
  for (let i = 0; i < 30; i++) s.update(1 / 60, {});
  assert.equal(s.target.state, "waiting");
});

test("the target drives the roads for a minute: never in a solid, never jumps, visits many junctions, no loop", () => {
  for (const seed of [1, 2, 3]) {
    const s = hunt(seed);
    s.start();
    const t = s.target, park = { x: s.player.x, z: s.player.z, angle: s.player.angle };
    let last = { x: t.x, z: t.z };
    const seq = [];
    for (let f = 0; f < 60 * 60; f++) {
      Object.assign(s.player, { ...park, vx: 0, vz: 0, speed: 0 });
      s.update(1 / 60, {});
      assert.ok(Math.hypot(t.x - last.x, t.z - last.z) < 0.7, "no jumps");
      last = { x: t.x, z: t.z };
      for (const b of s.nearSolids(t.x, t.z, 3)) assert.ok(!resolveBuilding({ x: t.x, z: t.z }, b, 0.6), "inside a solid");
      const k = `${t.from.x},${t.from.z}`;
      if (seq.at(-1) !== k) seq.push(k);
    }
    assert.equal(s.police.length, 0);
    assert.ok(new Set(seq).size >= 10, `${new Set(seq).size} junctions`);
    assert.ok(t.turns >= 4, `${t.turns} turns`);
    for (let i = 8; i <= seq.length; i++)
      assert.notEqual(seq.slice(i - 8, i - 4).join("|"), seq.slice(i - 4, i).join("|"), "a repeated loop");
    assert.equal(t.replans, 0);
  }
});

test("only contact hurts it, in proportion to the impact; being close does nothing", () => {
  const s = hunt();
  s.start();
  const t = s.target, p = s.player;
  t.state = "fleeing";
  // Close alongside (4 m) but not touching: no damage.
  Object.assign(p, { x: t.x + 4, z: t.z, vx: -t.vx, vz: -t.vz, angle: t.angle });
  assert.equal(resolveTargetContact(s), 0);
  assert.equal(t.health, TARGET.health);
  const ram = (closing) => {
    Object.assign(t, { vx: 0, vz: 0, lastHitAt: -10 });
    // The player's nose into the target's side, moving at `closing` towards it.
    Object.assign(p, { x: t.x + 2.6, z: t.z, angle: Math.PI / 2, vx: -closing, vz: 0 });
    t.angle = 0;
    const before = t.health;
    resolveTargetContact(s);
    return before - t.health;
  };
  const light = ram(5), hard = ram(14);
  assert.ok(light > 0 && hard > light * 2, `light ${light}, hard ${hard}`);
  assert.ok(hard <= 34);
  // A brush below the threshold is nothing.
  assert.equal(ram(1.5), 0);
});

test("takedown: it explodes, leaves a wreck, the mission is won after the crash; restart brings a fresh target", () => {
  const s = hunt();
  s.start();
  const t = s.target, p = s.player;
  t.state = "fleeing";
  t.health = 10;
  Object.assign(t, { vx: 0, vz: 0, angle: 0 });
  Object.assign(p, { x: t.x + 2.6, z: t.z, angle: Math.PI / 2, vx: -16, vz: 0 });
  resolveTargetContact(s);
  assert.equal(t.state, "wrecked");
  assert.ok(s.events.some((e) => e.type === "explosion" && e.cause === "target"));
  assert.ok(s.wrecks.length >= 1);
  assert.equal(s.result, null);
  for (let i = 0; i < Math.ceil(TARGET.winDelay * 60) + 2; i++) s.update(1 / 60, {});
  assert.equal(s.result, "success");
  assert.equal(s.credits, MISSIONS.targetHunt.reward.amount);
  s.reset();
  assert.equal(s.target.state, "waiting");
  assert.equal(s.target.health, TARGET.health);
  assert.equal(s.wrecks.length, 0);
});
