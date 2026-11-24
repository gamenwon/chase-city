import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { CONFIG } from "../src/game/config.js";
import {
  makePolice,
  collidePolice,
  wallImpact,
  policeContact,
} from "../src/game/police.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import { updateBlasts } from "../src/game/blast.js";
const none = { left: false, right: false };
const create = (layout = { buildings: [] }) => {
  const sim = new Simulation(layout, {
    reinforcements: false,
    barricades: false,
  });
  sim.start();
  return sim;
};
const tick = (s, seconds, input = none) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) s.update(1 / 60, input);
};
function pair(speed) {
  const a = makePolice(0),
    b = makePolice(1);
  Object.assign(a, { x: 0, z: 0, vx: speed, vz: 0 });
  Object.assign(b, { x: 2, z: 0, vx: -speed, vz: 0 });
  return [a, b];
}
test("city contains solid buildings and traversable parks", () => {
  const l = createLayout();
  assert.ok(l.buildings.length > 100);
  assert.ok(l.parks.length > 5);
});
test("mission briefing freezes all vehicles and mission clock until START", () => {
  const s = new Simulation({ buildings: [] });
  const before = JSON.stringify([s.player, s.police]);
  tick(s, 3, { left: true });
  assert.equal(JSON.stringify([s.player, s.police]), before);
  assert.equal(s.elapsed, 0);
  assert.equal(s.mission.status, "pending");
  s.start();
  s.update(1 / 60, none);
  assert.ok(s.player.z < 8);
});
test("automatic forward and left/right steering; obsolete drift input has no effect", () => {
  const s = create(),
    other = create();
  s.police = [];
  other.police = [];
  tick(s, 0.5, { left: true });
  tick(other, 0.5, { left: true, drift: true });
  assert.ok(s.player.angle > 0.4);
  assert.deepEqual(s.player, other.player);
  const angle = s.player.angle;
  tick(s, 0.5, { right: true });
  assert.ok(s.player.angle < angle - 0.25);
});
test("base 22 police and short eligible boosts close a straight-line rear gap", () => {
  assert.equal(CONFIG.playerSpeed, 24);
  assert.equal(CONFIG.policeSpeed, 22);
  const s = create();
  s.player.z = 70;
  s.police = [Object.assign(makePolice(0), { x: 0, z: 100, vx: 0, vz: -22 })];
  tick(s, 1.5);
  assert.ok(
    s.police[0].effectiveSpeed >= 26 && s.police[0].effectiveSpeed <= 28,
  );
  tick(s, 1.5);
  assert.ok(s.police[0].z - s.player.z < 29);
  assert.equal(s.police[0].speed, 22);
  tick(s, 0.7, { left: true });
  assert.equal(s.police[0].boostTimer, 0);
});
test("circle is expelled from all sides and inside a building", () => {
  const box = { x: 0, z: 0, w: 8, d: 8 };
  for (const p of [
    { x: 0, z: 0 },
    { x: 4.5, z: 0 },
    { x: -4.5, z: 0 },
    { x: 0, z: 4.5 },
    { x: 0, z: -4.5 },
  ]) {
    assert.ok(resolveBuilding(p, box));
    assert.ok(Math.abs(p.x) >= 5.149 || Math.abs(p.z) >= 5.149);
  }
});
test("building collision prevents tunnelling without player durability loss", () => {
  const s = create({ buildings: [{ x: 0, z: 0, w: 8, d: 8 }] });
  s.police = [];
  tick(s, 1.5);
  assert.equal(
    resolveBuilding({ ...s.player }, { x: 0, z: 0, w: 8, d: 8 }, 1.14),
    false,
  );
  assert.equal(s.health, 100);
});
test("police contacts separate vehicles, exchange impulse, and damage in proportion to impact", () => {
  const [a, b] = pair(4);
  const light = collidePolice(a, b);
  assert.equal(light, 0);
  assert.equal(policeContact(a, b), null);
  assert.ok(a.vx < 4 && b.vx > -4);
  const [c, d] = pair(10);
  assert.ok(collidePolice(c, d) > light);
  assert.equal(c.health, d.health);
});
test("separating and resting police contacts do not repeatedly damage cars", () => {
  const [a, b] = pair(-4);
  assert.equal(collidePolice(a, b), 0);
  assert.equal(a.health, 100);
  a.x = 0;
  b.x = 2;
  a.vx = 0;
  b.vx = 0;
  assert.equal(collidePolice(a, b), 0);
  assert.equal(b.health, 100);
});
test("several moderate impacts accumulate damage and high-energy impact is lethal", () => {
  // A moderate knock (closing 12, under the lethal line) only damages; it
  // takes several to wreck a car.
  const [a, b] = pair(0);
  let hits = 0;
  while (a.health > 0 && hits < 20) {
    Object.assign(a, { x: 0, vx: 9, pairCooldown: 0, stunTimer: 0 });
    Object.assign(b, { x: 2, vx: -3, pairCooldown: 0, stunTimer: 0 });
    const damage = collidePolice(a, b);
    assert.ok(damage > 0 && damage < 100);
    hits++;
  }
  assert.ok(hits >= 3);
  assert.equal(a.health, 0);
  assert.equal(b.health, 0);
  // V1.8: a hard head-on impact wrecks both cars at once.
  const [e, f] = pair(20);
  assert.equal(collidePolice(e, f), 100);
  assert.equal(e.health, 0);
  assert.equal(f.health, 0);
});
test("actual simulation contacts reduce durability, then explode after a second strong impact", () => {
  const s = create();
  s.police = pair(0);
  Object.assign(s.police[0], { vx: 9 });
  Object.assign(s.police[1], { vx: -3 });
  s.player.x = 50;
  s.player.z = 50;
  tick(s, 1 / 60);
  assert.ok(s.police.every((c) => c.health > 0 && c.health < 100));
  Object.assign(s.police[0], { x: 0, z: 0, vx: 20, vz: 0, pairCooldown: 0 });
  Object.assign(s.police[1], { x: 2, z: 0, vx: -20, vz: 0, pairCooldown: 0 });
  tick(s, 1 / 60);
  assert.ok(s.police.every((c) => c.state === "wreck"));
  assert.equal(s.events.length, 2);
});
test("blast impulses and weakened neighbors produce bounded chain reactions (V2.5 shared blast)", () => {
  const s = create();
  s.police = [0, 4, 8, 30].map((x, i) =>
    Object.assign(makePolice(i), { x, z: 0, health: i === 1 ? 20 : 100 }),
  );
  s.explodePolice(s.police[0]);
  // Only the car itself goes up at once; the blast is applied when it goes off.
  assert.deepEqual(s.police.map((c) => c.state), ["wreck", "active", "active", "active"]);
  updateBlasts(s);
  // The damaged car 4 m away is destroyed and goes up a moment later; the
  // healthy one 8 m away is hurt and shoved but survives; 30 m away: untouched.
  assert.equal(s.police[1].health, 0);
  assert.ok(s.police[2].health > 0 && s.police[2].health < 100);
  assert.ok(s.police[2].vx > 0);
  assert.equal(s.police[3].health, 100);
  for (let i = 0; i < 60; i++) {
    s.elapsed += 1 / 60;
    updateBlasts(s);
  }
  assert.deepEqual(s.police.map((c) => c.state), ["wreck", "wreck", "active", "active"]);
  assert.equal(s.events.filter((e) => e.type === "explosion").length, 2);
  // A wreck never explodes again.
  s.explodePolice(s.police[0]);
  assert.equal(s.events.filter((e) => e.type === "explosion").length, 2);
});
test("wrecks stop chasing and respawn on roads away from player after delay", () => {
  const s = create();
  s.police = [makePolice(0)];
  s.explodePolice(s.police[0]);
  const wreck = s.police[0];
  tick(s, 2.4);
  assert.equal(s.police[0], wreck);
  assert.equal(wreck.state, "wreck");
  tick(s, 0.4);
  const c = s.police[0];
  assert.equal(c.state, "active");
  assert.equal(c.generation, 1);
  assert.equal(c.health, 100);
  assert.ok(Math.hypot(c.x - s.player.x, c.z - s.player.z) > 25);
});
test("the player's car is never destroyed (durability disabled); reset lifecycle is retained", () => {
  const s = create();
  s.health = 0;
  s.update(0.016, none);
  assert.notEqual(s.result, "destroyed");
  assert.equal(s.health, 100);
  s.reset();
  assert.equal(s.health, 100);
  assert.equal(s.result, null);
  assert.equal(s.started, false);
  s.start();
  s.arrest = CONFIG.arrestSeconds - 0.01;
  s.player.speed = 0;
  s.player.vx = 0;
  s.player.vz = 0;
  s.police = Array.from({ length: 4 }, (_, i) =>
    Object.assign(makePolice(i), {
      x: Math.sin((i * Math.PI) / 2) * 3.4,
      z: 8 + Math.cos((i * Math.PI) / 2) * 3.4,
      angle: (i * Math.PI) / 2,
      speed: 0,
      // V1.8: parked (braced) cordon cars; only those close a gap.
      blockState: "hold",
      blockSlot: {
        x: Math.sin((i * Math.PI) / 2) * 3.4,
        z: 8 + Math.cos((i * Math.PI) / 2) * 3.4,
        angle: (i * Math.PI) / 2,
      },
    }),
  );
  s.update(0.05, none);
  assert.equal(s.result, "arrested");
});
test("60 seconds opens escape without success; crossing the gate pays once and freezes", () => {
  const s = create();
  s.police = [];
  s.elapsed = 59.99;
  s.update(0.05, none);
  assert.equal(s.result, null);
  assert.equal(s.escape.phase, "open");
  assert.equal(s.credits, 0);
  assert.equal(s.mission.status, "escape");
  const e = s.escape.exit;
  Object.assign(s.player, {
    x: e.x - e.dx * 0.1,
    z: e.z - e.dz * 0.1,
    vx: e.dx * 24,
    vz: e.dz * 24,
    angle: Math.atan2(-e.dx, -e.dz),
    steering: 0,
    speed: 24,
  });
  s.update(1 / 60, none);
  assert.equal(s.result, "success");
  assert.equal(s.credits, 500);
  assert.equal(s.escape.phase, "escaped");
  const elapsed = s.elapsed;
  tick(s, 1);
  assert.equal(s.credits, 500);
  assert.equal(s.elapsed, elapsed);
  s.reset();
  assert.equal(s.credits, 0);
  assert.equal(s.mission.rewardGranted, false);
});
test("hits never end the run: the car survives to the mission deadline", () => {
  const s = create();
  s.elapsed = 59.99;
  for (let i = 0; i < 20; i++) (s.hitCooldown = 0), s.damage(50);
  s.update(0.05, none);
  assert.notEqual(s.result, "destroyed");
  assert.equal(s.health, 100);
});
test("full city pursuit stays finite with intact building colliders", () => {
  const s = create(createLayout());
  for (let i = 0; i < 3000; i++) {
    if (s.result) s.reset(), s.start();
    s.update(1 / 60, { left: i % 600 < 180, right: i % 600 > 400 });
    for (const c of [s.player, ...s.police]) {
      assert.ok(Number.isFinite(c.x + c.z + c.vx + c.vz));
      for (const b of s.layout.buildings)
        assert.equal(
          resolveBuilding({ ...c }, b, c === s.player ? 1.14 : 1.39),
          false,
        );
    }
  }
});

test("ordinary flanking pursuit produces police accidents without scripted explosions", () => {
  const s = create(createLayout());
  let explosions = 0;
  for (let i = 0; i < 2400; i++) {
    if (s.result) {
      explosions += s.events.length;
      s.reset();
      s.start();
    }
    s.update(1 / 60, { left: i % 480 < 110, right: i % 480 > 330 });
  }
  assert.ok(explosions + s.events.length > 0);
});

test("police wall impacts use normal closing speed, threshold and cooldown", () => {
  const c = makePolice(0);
  assert.equal(wallImpact(c, 3), 0);
  assert.equal(c.health, 100);
  const damage = wallImpact(c, 20);
  assert.ok(damage > 0);
  assert.ok(c.health > 0);
  const health = c.health;
  for (let i = 0; i < 50; i++) wallImpact(c, 20);
  assert.equal(c.health, health);
  c.wallCooldown = 0;
  wallImpact(c, 20);
  assert.ok(c.health < health);
});
test("navigation prevents deliberate repeated wall charges", () => {
  const s = create({ buildings: [{ x: 0, z: 0, w: 8, d: 8 }] });
  s.player.x = 0;
  s.player.z = -12;
  s.police = [Object.assign(makePolice(0), { x: 0, z: 12, angle: 0 })];
  tick(s, 8);
  assert.equal(s.police[0].health, 100);
  assert.equal(s.stats.wallCollisions, 0);
  assert.ok(s.police[0].replans > 0);
  assert.ok(s.police[0].z < 0);
});
test("resting wall contact and rapid repeated light pair contacts cannot instantly explode", () => {
  const [a, b] = pair(4);
  const first = collidePolice(a, b);
  const health = a.health;
  for (let i = 0; i < 100; i++) {
    Object.assign(a, { x: 0, z: 0, vx: 4 });
    Object.assign(b, { x: 2, z: 0, vx: -4 });
    collidePolice(a, b);
  }
  assert.equal(first, 0);
  assert.equal(a.health, health);
  assert.ok(a.health > 85);
});

test("visible park obstacles share the police impact/health pipeline", () => {
  const s = create({
    buildings: [],
    obstacles: [{ x: 0, z: 0, w: 3, d: 0.8, kind: "bench" }],
  });
  s.player.x = 60;
  s.player.z = -60;
  s.police = [
    Object.assign(makePolice(0), { x: 0, z: 1.9, angle: 0, vx: 0, vz: -20 }),
  ];
  s.update(1 / 60, {});
  assert.equal(s.police[0].health, 100);
  assert.equal(s.stats.wallCollisions, 0);
  assert.ok(createLayout().obstacles.length > 0);
});
