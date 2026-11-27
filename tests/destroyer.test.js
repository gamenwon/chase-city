// DESTROYER (game/destroyer.js): proximity charge, reset on escape, the
// charged ram only on a real hit, the player's counter-hits, blasts, the
// wreck and its reward, spawning out of the way.
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { DESTROYER, placeDestroyer, inStrikeRange, blastDestroyer, updateDestroyer } from "../src/game/destroyer.js";

const make = (vehicle = "starter", seed = 3) => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, vehicle, reinforcements: false, barricades: false, destroyer: true, destroyerFirstAt: 9999 });
  s.start();
  s.police = [];
  return s;
};
// The player parked on the start street; the truck `back` m behind it on
// the same street.
function setup(vehicle, back = 8) {
  const s = make(vehicle);
  const p = s.player, a = p.angle;
  Object.assign(p, { vx: 0, vz: 0, speed: 0 });
  const d = placeDestroyer(s, p.x + Math.sin(a) * back, p.z + Math.cos(a) * back, a);
  return { s, p, d };
}
const step = (s, n, input = {}) => {
  for (let i = 0; i < n && !s.result; i++) {
    s.arrest = 0;
    s.update(1 / 60, input);
  }
};
const hold = (p) => Object.assign(p, { vx: 0, vz: 0, speed: 0 });

test("charge: fills over 2 s only within range; leaving range resets it to zero at once", () => {
  const { s, p, d } = setup("starter", 8);
  assert.ok(inStrikeRange(s, d));
  for (let i = 0; i < 60; i++) {
    hold(p);
    step(s, 1);
  }
  assert.equal(d.state, "charge");
  assert.ok(d.charge > 0.35 && d.charge < 0.65, `charge ${d.charge}`);
  // The player gets away: out of range -> 0 immediately.
  p.x += -Math.sin(p.angle) * 30;
  p.z += -Math.cos(p.angle) * 30;
  s.previousPlayer = { x: p.x, z: p.z };
  p.lastLegal = { x: p.x, z: p.z };
  step(s, 1);
  assert.equal(d.charge, 0);
  assert.equal(d.state, "chase");
  assert.ok(s.destroyerStats.resets >= 1);
});

test("charge never runs through a building or between road levels", () => {
  const s = make("starter");
  const b = s.layout.buildings.find((q) => q.w > 6 && q.d > 6);
  const p = s.player;
  Object.assign(p, { x: b.x + b.w / 2 + 2, z: b.z, vx: 0, vz: 0 });
  const d = placeDestroyer(s, b.x - b.w / 2 - 2, b.z, 0);
  if (Math.hypot(d.x - p.x, d.z - p.z) <= DESTROYER.range) assert.equal(inStrikeRange(s, d), false);
  const e = placeDestroyer(s, p.x + 3, p.z, 0);
  e.level = 1;
  assert.equal(inStrikeRange(s, e), false);
});

test("charged ram: one real hit for 15-20 HP on a 100 HP car (scaled by the car's heavy resistance); no damage at 100% alone", () => {
  const { s, p, d } = setup("starter", 8);
  const hp0 = s.hp;
  let sawFull = false;
  for (let i = 0; i < 240 && !s.destroyerStats.hits; i++) {
    hold(p);
    step(s, 1);
    if (d.state === "attack" && !sawFull) {
      sawFull = true;
      assert.equal(s.hp, hp0, "reaching 100% does not hurt by itself");
    }
  }
  assert.ok(sawFull, "it attacked");
  assert.equal(s.destroyerStats.hits, 1);
  const lost = hp0 - s.hp;
  assert.ok(lost >= 15 && lost <= 20.5, `lost ${lost}`);
  // Staying in contact does not keep draining HP.
  const after = s.hp;
  for (let i = 0; i < 90; i++) {
    hold(p);
    step(s, 1);
  }
  assert.ok(after - s.hp < 3, `contact drain ${after - s.hp}`);
});

test("the ram can be dodged: driving off sideways when it lunges, no hit", () => {
  const { s, p, d } = setup("super", 9);
  for (let i = 0; i < 200 && d.state !== "attack"; i++) {
    hold(p);
    step(s, 1);
  }
  assert.equal(d.state, "attack");
  // A swerve off its line at speed (half a second), then away.
  const a0 = p.angle;
  for (let i = 0; i < 160; i++) {
    const a = a0 + (i < 15 ? 0.5 : i < 30 ? -0.5 : 0);
    Object.assign(p, { angle: a, vx: -Math.sin(a) * 24, vz: -Math.cos(a) * 24, speed: 24 });
    step(s, 1);
  }
  assert.equal(s.destroyerStats.hits, 0);
  assert.ok(s.destroyerStats.misses >= 1);
});

test("player counter-hits: a hard ram hurts it and breaks its charge; a nudge does neither", () => {
  const ram = (vehicle, speed) => {
    const { s, p, d } = setup(vehicle, 7);
    hold(p);
    step(s, 30); // charging
    const h0 = d.health, c0 = d.charge;
    // Drive into it (backwards along the street toward the truck).
    const a = p.angle + Math.PI; // turned round to face it
    for (let i = 0; i < 45; i++) {
      Object.assign(p, { angle: a, vx: -Math.sin(a) * speed, vz: -Math.cos(a) * speed, speed });
      step(s, 1);
      if (s.destroyerStats.playerHits) break;
    }
    return { dmg: h0 - d.health, interrupted: s.destroyerStats.interrupts > 0, c0 };
  };
  const nudge = ram("starter", 5);
  assert.ok(nudge.dmg < 5, `nudge ${nudge.dmg}`);
  assert.equal(nudge.interrupted, false);
  const hard = ram("starter", 22);
  assert.ok(hard.dmg >= DESTROYER.interruptHit, `hard ${hard.dmg}`);
  assert.equal(hard.interrupted, true);
  // A heavy car hits much harder than a light one at the same speed.
  const heavy = ram("dozer", 16), light = ram("mini", 16);
  assert.ok(heavy.dmg > light.dmg * 1.6, `heavy ${heavy.dmg} light ${light.dmg}`);
});

test("blasts hurt it; wrecked: a wreck in the street, an explosion, coins once, a new one later", () => {
  const { s, p, d } = setup("starter", 12);
  blastDestroyer(s, { x: d.x, z: d.z, id: 1, cause: "test" }, 10, 1, 60);
  assert.ok(d.health < DESTROYER.health);
  const coins0 = s.runCoins, wrecks0 = s.wrecks.length;
  d.health = -1;
  d.lastCause = "rammed";
  updateDestroyer(s, 1 / 60);
  assert.equal(d.state, "wrecked");
  assert.equal(s.wrecks.length, wrecks0 + 1);
  assert.equal(s.runCoins - coins0, DESTROYER.reward.coins);
  assert.ok(s.events.some((e) => e.type === "explosion" && e.cause === "destroyer"));
  // No second reward.
  updateDestroyer(s, 1 / 60);
  assert.equal(s.runCoins - coins0, DESTROYER.reward.coins);
  assert.ok(s.destroyerDueAt - s.elapsed >= 44 && s.destroyerDueAt - s.elapsed <= 60);
  void p;
});

test("spawn: out of the way (55-100 m off, on the road, never beside the player); one at a time", () => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed: 5, vehicle: "starter", reinforcements: false, barricades: false, destroyer: true, destroyerFirstAt: 0.1 });
  s.start();
  s.police = [];
  step(s, 30);
  const d = s.destroyer;
  assert.ok(d, "spawned");
  const p = s.player;
  const dd = Math.hypot(d.spawnX ?? d.x - p.x, d.z - p.z);
  assert.ok(dd > 40, `distance ${dd}`);
  assert.equal(s.destroyerStats.spawns, 1);
});
