import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { RoadNavigation } from "../src/game/navigation.js";
import { makePolice, steerPolice } from "../src/game/police.js";
import { CONFIG } from "../src/game/config.js";
import { updateWrecks } from "../src/game/wrecks.js";
import {
  WreckRenderer,
  wreckPose,
  flareBoost,
  EMBER_COUNT,
  WRECK_LIFT,
  WRECK_ROLL,
} from "../src/render/wrecks.js";
import { ExplosionEffects, explosionScale, smokeSeconds, chunkCount, SEE_THROUGH } from "../src/render/explosions.js";
import { ChaseCamera } from "../src/render/camera.js";
import { updateBlasts } from "../src/game/blast.js";

const empty = () => {
  const s = new Simulation(
    { buildings: [], obstacles: [] },
    { reinforcements: false, barricades: false },
  );
  s.start();
  return s;
};
// Player heading -z at full speed, as if fleeing down a long road.
const fleeing = () => ({
  x: 0,
  z: 0,
  angle: 0,
  vx: 0,
  vz: -24,
  speed: 24,
  netSpeed: 24,
  fleeSpeed: 24,
  groundSpeed: 24,
});

test("a fleeing player is pressed from behind, alongside and in front", () => {
  const nav = new RoadNavigation([]),
    player = fleeing();
  const fleet = [
    Object.assign(makePolice(0), { x: 0, z: 6 }),
    Object.assign(makePolice(1), { x: 3, z: 14 }),
    Object.assign(makePolice(2), { x: -3, z: 20 }),
    Object.assign(makePolice(3), { x: 3, z: 28 }),
  ];
  for (const c of fleet) c.vz = -20;
  fleet.forEach((c, i) => steerPolice(c, i, player, 1 / 60, nav, fleet, 20));
  assert.deepEqual(
    fleet.map((c) => c.role),
    ["pursuit", "flank", "flank", "front"],
  );
  // The two flankers take opposite sides of the player (a box with the rear
  // pursuer and the front blocker).
  const sideOf = (c) => Math.sign(c.vx);
  for (let i = 0; i < 30; i++)
    fleet.forEach((c, k) => steerPolice(c, k, player, 1 / 60, nav, fleet, 20));
  assert.notEqual(sideOf(fleet[1]), sideOf(fleet[2]));
  // Blockers out-run the 24-unit player to get in front of it.
  assert.ok(fleet[3].effectiveSpeed > CONFIG.playerSpeed);
  assert.ok(fleet[1].effectiveSpeed > CONFIG.playerSpeed);
  // A blocker already in front brakes into a roadblock, it does not charge.
  const blocker = Object.assign(makePolice(2), { x: 0, z: -16, vz: 0 });
  const trio = [fleet[0], fleet[1], blocker];
  for (let i = 0; i < 60; i++)
    steerPolice(blocker, 2, player, 1 / 60, nav, trio, 20);
  assert.equal(blocker.role, "front");
  assert.equal(blocker.pressure, "front");
  assert.ok(
    Math.hypot(blocker.vx, blocker.vz) <=
      CONFIG.blockerApproachSpeed + (16 - 6) * 0.6 + 1e-9,
  );
});

test("a slow or pinned player is converged on by every officer so the cordon can form", () => {
  const nav = new RoadNavigation([]),
    player = { ...fleeing(), vz: -3, netSpeed: 3, fleeSpeed: 3 };
  const fleet = [0, 1, 2, 3].map((i) =>
    Object.assign(makePolice(i), { x: (i - 1.5) * 4, z: 14 + i * 3 }),
  );
  fleet.forEach((c, i) => steerPolice(c, i, player, 1 / 60, nav, fleet, 20));
  assert.ok(fleet.every((c) => c.role === "pursuit"));
});

test("a blocker routes around the player via a parallel street (A* avoid)", () => {
  const layout = createLayout(),
    nav = new RoadNavigation(layout.buildings);
  const start = { x: 0, z: 60 },
    goal = { x: 0, z: -30 },
    player = { x: 0, z: 30 };
  const straight = nav.findPath(start, goal);
  const around = nav.findPath(start, goal, undefined, {
    ...player,
    radius: 16,
    penalty: 70,
  });
  const nearPlayer = (path) =>
    path.filter((n) => Math.hypot(n.x - player.x, n.z - player.z) < 16).length;
  assert.ok(straight.length && around.length);
  assert.ok(nearPlayer(around) < nearPlayer(straight));
});

test("same-lane officers keep a gap instead of rear-ending into self-destruction", () => {
  const s = empty();
  Object.assign(s.player, { x: 0, z: -40 });
  // Leader and a faster follower in the same lane, behind the player.
  const leader = Object.assign(makePolice(0), { x: 0, z: 0, vz: -20 });
  const follower = Object.assign(makePolice(1), { x: 0, z: 6, vz: -26 });
  s.police = [leader, follower];
  for (let i = 0; i < 90; i++) s.update(1 / 60, {});
  assert.equal(s.stats.pairCollisions, 0);
  assert.equal(leader.health, 100);
  assert.equal(follower.health, 100);
});

test("far from the player, oncoming officers keep right; near it, crashes stay physical", () => {
  const nav = new RoadNavigation([]);
  // Player far down the same road: route runs straight at the oncoming car.
  const far = { ...fleeing(), x: 0, z: -90 };
  const a = Object.assign(makePolice(0), { x: 0, z: 0, angle: 0, vz: -20 }),
    b = Object.assign(makePolice(1), {
      x: 0,
      z: -7,
      angle: Math.PI,
      vz: 20,
    });
  steerPolice(a, 0, far, 1 / 60, nav, [a, b], 20);
  assert.equal(a.overtaking, true);
  // The same encounter right next to the player is not avoided.
  const near = { ...fleeing(), x: 0, z: -12 };
  const c = Object.assign(makePolice(0), { x: 0, z: 0, angle: 0, vz: -20 }),
    d = Object.assign(makePolice(1), { x: 0, z: -7, angle: Math.PI, vz: 20 });
  steerPolice(c, 0, near, 1 / 60, nav, [c, d], 20);
  assert.equal(c.overtaking, false);
});

test("chain reactions go link by link with short varied delays, and stop at a healthy car", () => {
  const s = empty();
  Object.assign(s.player, { x: 80, z: 80 });
  // Five cars in a row, 5 m apart: damaged ones carry the chain, the healthy
  // car at the end is thrown but survives.
  s.police = [0, 5, 10, 15, 20].map((x, i) =>
    Object.assign(makePolice(i), { x, z: 0, health: [100, 25, 25, 25, 100][i] }),
  );
  s.explodePolice(s.police[0]);
  const went = [];
  for (let i = 0; i < 5 * 60; i++) {
    s.elapsed += 1 / 60;
    updateBlasts(s);
    for (const [k, c] of s.police.entries()) if (k > 0 && c.state === "wreck" && !went.some((w) => w.k === k)) went.push({ k, t: s.elapsed });
  }
  assert.deepEqual(s.police.map((c) => c.state), ["wreck", "wreck", "wreck", "wreck", "active"]);
  assert.deepEqual(went.map((w) => w.k), [1, 2, 3]);
  const gaps = went.map((w, i) => w.t - (i ? went[i - 1].t : 0));
  for (const g of gaps.slice(1)) assert.ok(g >= 0.2 && g <= 0.8, `gap ${g}`);
  const events = s.events.filter((e) => e.type === "explosion");
  assert.equal(events.length, 4);
  // Each link is a deeper chain step (drawn a little bigger).
  assert.deepEqual(events.map((e) => e.chainDepth), [0, 1, 2, 3]);
});
test("the crash animation ends exactly in the persistent wreck pose", () => {
  const start = wreckPose(0),
    end = wreckPose(CONFIG.wreckSeconds),
    later = wreckPose(60);
  assert.deepEqual(start, { y: 0, pitch: 0, roll: 0 });
  assert.ok(wreckPose(-0.3).y === 0, "staged links wait on the road");
  for (const pose of [end, later]) {
    assert.ok(Math.abs(pose.y - WRECK_LIFT) < 1e-9);
    assert.ok(Math.abs(pose.pitch - Math.PI) < 1e-9);
    assert.ok(Math.abs(pose.roll - WRECK_ROLL) < 1e-9);
  }
  // The wreck model uses the same Euler as the police mesh at that pose.
  const scene = new THREE.Scene(),
    r = new WreckRenderer(scene),
    s = empty();
  s.police = [Object.assign(makePolice(0), { x: 0, z: 0, angle: 0.7 })];
  s.explodePolice(s.police[0]);
  s.elapsed = 1;
  updateWrecks(s);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(20, 30, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  r.update(s, camera);
  const slot = r.pool.find((p) => p.id === s.wrecks[0].id);
  assert.ok(slot.group.visible);
  assert.deepEqual(
    [slot.body.rotation.x, slot.body.rotation.y, slot.body.rotation.z],
    [Math.PI, 0.7, WRECK_ROLL],
  );
  assert.equal(slot.body.position.y, WRECK_LIFT);
  // Still burning and still the same object long afterwards.
  for (let t = 2; t <= 180; t += 0.5) {
    s.elapsed = t;
    r.update(s, camera);
  }
  assert.ok(slot.group.visible && slot.id === s.wrecks[0].id);
  assert.ok(slot.flames.every((f) => f.scale.y > 0.3));
  assert.ok(slot.smoke.some((m) => m.position.y > 5));
});

test("explosion fragments land and stay until RESTART; staged links wait their turn", () => {
  const scene = new THREE.Scene(),
    started = [],
    fx = new ExplosionEffects(scene, (e, s) => started.push([e.id, s]));
  const events = [
    { id: 1, type: "explosion", x: 0, z: 0, time: 10, delay: 0, chainDepth: 0 },
    { id: 2, type: "explosion", x: 4, z: 0, time: 10, delay: 0.22, chainDepth: 1 },
  ];
  fx.update(events, 10.1);
  assert.deepEqual(started.map((s) => s[0]), [1]);
  assert.equal(fx.pending.length, 1); // the staged link waits its turn
  fx.update(events, 10.3);
  assert.deepEqual(started.map((s) => s[0]), [1, 2]);
  // The later chain link is bigger.
  assert.ok(started[1][1] > started[0][1]);
  const thrown = chunkCount(started[0][1]) + chunkCount(started[1][1]);
  for (let t = 10.3; t < 16; t += 0.05) fx.update(events, t);
  assert.equal(fx.counts.chunks, 0);
  assert.equal(fx.counts.fire, 0);
  assert.equal(fx.debris.total, thrown);
  for (const mesh of fx.debris.meshes) assert.ok(scene.children.includes(mesh));
  // The smoke columns are still rising after the fire is out.
  assert.equal(fx.counts.columns, 2);
  assert.ok(fx.counts.smoke > 10);
  // Many at once: no fragment is lost (a full pool lands its oldest).
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: 3 + i,
    type: "explosion",
    x: i,
    z: 0,
    time: 20,
    delay: 0,
  }));
  for (let t = 20; t < 25; t += 0.05) fx.update(many, t);
  assert.equal(fx.debris.total, thrown + 60 * chunkCount(explosionScale(many[0])));
  // Budgets hold however many blasts there are.
  assert.ok(fx.counts.smoke <= 1600 && fx.counts.fire <= 900);
  fx.reset();
  assert.equal(fx.debris.total, 0);
  assert.equal(fx.counts.columns, 0);
  assert.equal(fx.counts.smoke, 0);
  assert.ok(fx.debris.meshes.every((m) => m.count === 0));
});

test("explosion sizes: car < fuel island < major, smoke lasts accordingly", () => {
  const car = explosionScale({ type: "explosion" });
  const gas = explosionScale({ type: "explosion", cause: "gas", chainDepth: 3 });
  const major = explosionScale({ type: "explosion", major: true });
  assert.ok(car < gas && gas < major);
  assert.ok(smokeSeconds(car) < smokeSeconds(gas) && smokeSeconds(gas) < smokeSeconds(major));
  assert.ok(smokeSeconds(gas) >= 30);
});

test("camera shake only applies to the drawn frame and decays", () => {
  const rig = new ChaseCamera(1100, 740);
  rig.update({ x: 0, z: 0 }, 0);
  const before = rig.camera.position.clone();
  rig.kick(0.8);
  let during = null;
  rig.withShake(1 / 60, 3.1, () => (during = rig.camera.position.clone()));
  assert.ok(during.distanceTo(before) > 0.05);
  assert.ok(rig.camera.position.distanceTo(before) < 1e-9);
  for (let i = 0; i < 120; i++) rig.withShake(1 / 60, i, () => {});
  assert.ok(rig.shake < 0.01);
});

test("a new explosion next to an old wreck makes its fire flare up and throw sparks", () => {
  const scene = new THREE.Scene(),
    r = new WreckRenderer(scene),
    s = empty();
  Object.assign(s.player, { x: 80, z: 80 });
  s.police = [
    Object.assign(makePolice(0), { x: 0, z: 0 }),
    Object.assign(makePolice(1), { x: 5, z: 0 }),
  ];
  s.explodePolice(s.police[0]);
  s.elapsed = 10;
  updateWrecks(s);
  const old = s.wrecks[0];
  assert.equal(flareBoost(old, s.elapsed), 0);
  s.explodePolice(s.police[1]);
  assert.equal(old.flaredAt, 10);
  assert.ok(flareBoost(old, 10.1) > 1);
  assert.ok(flareBoost(old, 20) < 0.01);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(20, 30, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  s.elapsed = 10.2;
  r.update(s, camera);
  const slot = r.pool.find((p) => p.id === old.id);
  const flaring = slot.flames[0].scale.x;
  assert.equal(slot.embers.length, EMBER_COUNT);
  assert.ok(slot.embers.some((m) => m.position.y > 2));
  s.elapsed = 30;
  r.update(s, camera);
  assert.ok(slot.flames[0].scale.x < flaring, "flare settles back down");
});

test("smoke hiding the player turns see-through smoothly; elsewhere it stays opaque", () => {
  const scene = new THREE.Scene(),
    fx = new ExplosionEffects(scene);
  const camera = { x: 0, y: 30, z: 30 };
  const car = { x: 0, z: 0 };
  // One blast on the camera-to-car line, one well off to the side.
  const events = [
    { id: 1, type: "explosion", x: 0, z: 9, time: 1, delay: 0 },
    { id: 2, type: "explosion", x: 30, z: -20, time: 1, delay: 0 },
  ];
  fx.setViewers(camera, [car]);
  fx.update(events, 1);
  const [hiding, clear] = fx.columns;
  let previous = 1, steps = 0;
  for (let t = 1; t < 4; t += 1 / 30) {
    fx.update(events, t);
    // Smooth: never jumps by more than a fraction per frame.
    assert.ok(previous - hiding.alpha < 0.25);
    previous = hiding.alpha;
    steps++;
  }
  assert.ok(steps > 60);
  assert.equal(hiding.alpha, SEE_THROUGH);
  assert.equal(clear.alpha, 1);
  assert.ok(fx.counts.seeThrough > 0);
  assert.ok(fx.counts.smoke > fx.counts.seeThrough); // the other column is still opaque
  // The car drives away: the smoke fills back in.
  car.x = -40;
  for (let t = 4; t < 6; t += 1 / 30) fx.update(events, t);
  assert.equal(hiding.alpha, 1);
  assert.equal(fx.counts.seeThrough, 0);
});
