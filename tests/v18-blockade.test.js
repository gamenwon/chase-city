import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { makePolice } from "../src/game/police.js";
import { CONFIG } from "../src/game/config.js";
import {
  carsToSeal,
  slotPositions,
  roadExtent,
  playerRoad,
} from "../src/game/roadblock.js";
import { BonnetCamera, BONNET } from "../src/render/pip.js";

// Player fleeing east along the z = 0 road; one officer tailing it and three
// on the x = -30 cross street ahead, where a front blocker would come from.
function blockScenario(steer = () => ({})) {
  const s = new Simulation(createLayout(), {
    reinforcements: false,
    barricades: false,
  });
  s.start();
  Object.assign(s.player, {
    x: -100,
    z: 0,
    angle: -Math.PI / 2,
    vx: 24,
    vz: 0,
  });
  s.police = [
    Object.assign(makePolice(0), {
      x: -108,
      z: 0,
      angle: -Math.PI / 2,
      vx: 20,
    }),
    ...[12, 17, 22].map((z, i) =>
      Object.assign(makePolice(i + 1), { x: -30, z, angle: 0, vz: -10 }),
    ),
  ];
  const frames = [];
  for (let f = 0; f < 60 * 14 && !s.result; f++) {
    s.update(1 / 60, steer(s));
    frames.push({
      t: s.elapsed,
      player: { x: s.player.x, z: s.player.z },
      arrest: s.arrest,
      cars: s.police.map((c) => ({
        id: c.id,
        x: c.x,
        z: c.z,
        angle: c.angle,
        state: c.blockState,
        mode: c.mode,
        speed: Math.hypot(c.vx, c.vz),
      })),
    });
  }
  return { s, frames };
}

test("a roadblock is planned on the predicted road, cars stop across it and hold still, and a car that runs into it is BUSTED", () => {
  const { s, frames } = blockScenario();
  const plan = s.roadblockEvents.find((e) => e.type === "plan");
  assert.ok(plan, "a block was planned");
  // Ahead of the player on its own road, mid-block (not in a junction).
  assert.equal(plan.z, 0);
  assert.ok(plan.x > -100 && plan.ahead >= CONFIG.blockMinAhead);
  assert.equal(plan.cars.length, 3);
  assert.ok(!plan.cars.includes(0), "the tailing officer keeps chasing");
  // All three blockers come to rest before the player reaches the block.
  const held = frames.find(
    (f) => f.cars.filter((c) => c.state === "hold").length === 3,
  );
  assert.ok(held);
  assert.ok(held.player.x < plan.x - 5);
  // Holding: stationary, turned across the road, not twitching.
  const holding = frames.filter((f) => f.t >= held.t);
  for (const id of plan.cars) {
    const track = holding.map((f) => f.cars.find((c) => c.id === id));
    assert.ok(track.every((c) => c.state === "hold" && c.speed === 0));
    const xs = track.map((c) => c.x),
      zs = track.map((c) => c.z);
    assert.ok(Math.max(...xs) - Math.min(...xs) < 0.05);
    assert.ok(Math.max(...zs) - Math.min(...zs) < 0.05);
    const last = track.at(-1);
    assert.ok(Math.abs(Math.sin(last.angle)) < 0.05, "parked across the road");
  }
  // The player is stopped by the block and arrested by the 3-second rule.
  assert.equal(s.result, "arrested");
  assert.ok(Math.abs(s.player.x - plan.x) < 6);
  assert.equal(s.stats.explosions, 0);
  const lastZero = frames.findLastIndex((f) => f.arrest === 0);
  assert.ok(s.elapsed - frames[lastZero].t >= CONFIG.arrestSeconds - 0.02);
});

test("a held block stays put when the player pins itself against it and scrapes along", () => {
  // Steer into the kerb side of the block: heading changes must not release it.
  const { s } = blockScenario((sim) => ({
    left: sim.player.x > -55 && sim.player.angle < -1.2,
  }));
  const releases = s.roadblockEvents.filter((e) => e.type === "release");
  assert.equal(s.result, "arrested");
  assert.ok(releases.every((e) => e.reason !== "player-turned"));
});

test("when the player gets away from a block it is released and the blockers chase again", () => {
  const { s, frames } = blockScenario((sim) => ({
    right: sim.player.x > -69 && sim.player.angle > -Math.PI + 0.08,
  }));
  const release = s.roadblockEvents.find((e) => e.type === "release");
  assert.ok(release, "the block was released");
  assert.ok(["player-escaped", "player-turned"].includes(release.reason));
  const after = frames.filter((f) => f.t > release.time + 0.1);
  assert.ok(after.length > 30);
  // Released officers drop the block and go back to chasing (no one stays
  // parked across an empty road).
  for (const f of after.slice(0, 5))
    assert.ok(f.cars.every((c) => c.state === null || c.state === undefined));
  const gap = (f) =>
    Math.min(
      ...f.cars
        .filter((c) => release.members && c.id !== 0)
        .map((c) => Math.hypot(c.x - f.player.x, c.z - f.player.z)),
    );
  assert.ok(after.some((f) => f.cars.some((c) => c.speed > 15)));
  assert.ok(gap(after.at(-1)) < gap(after[0]) + 40);
});

test("block width is measured to the real kerb and enough cars are sent to leave no passable gap", () => {
  const s = new Simulation(createLayout());
  const road = { axis: "x", center: 0, dir: 1 };
  const extent = roadExtent(s, road, { x: -39.6, z: 0 });
  assert.ok(extent.width > CONFIG.roadWidth, "pavements count as road");
  const count = carsToSeal(extent.width);
  assert.ok(count >= 2 && count <= CONFIG.blockMaxCars);
  const slots = slotPositions(road, -39.6, extent.lo, extent.hi, count);
  const edges = [
    extent.lo,
    ...slots.flatMap((q) => [q.z - 1.8, q.z + 1.8]),
    extent.hi,
  ];
  for (let i = 0; i < edges.length; i += 2)
    assert.ok(edges[i + 1] - edges[i] <= CONFIG.blockMaxGap + 1e-9);
  // Too wide to seal with the cars we can spare: no block there.
  assert.equal(carsToSeal(30), null);
  assert.equal(carsToSeal(10), 2);
  assert.equal(
    playerRoad({ x: 0, z: 0.5, angle: -Math.PI / 2 }).axis,
    "x",
    "heading east on z = 0",
  );
  assert.equal(playerRoad({ x: 0, z: 15, angle: -Math.PI / 2 }), null);
});

test("roadblocks are not planned while a cordon is forming or in the first second", () => {
  const s = new Simulation(
    { buildings: [], obstacles: [] },
    { reinforcements: false, barricades: false },
  );
  s.start();
  Object.assign(s.player, { x: 0, z: 0, vx: 0, vz: 0, speed: 0 });
  s.police = Array.from({ length: 4 }, (_, i) =>
    Object.assign(makePolice(i), {
      x: Math.sin((i * Math.PI) / 2) * 3.4,
      z: Math.cos((i * Math.PI) / 2) * 3.4,
      angle: (i * Math.PI) / 2,
    }),
  );
  for (let i = 0; i < 200 && !s.result; i++) s.update(1 / 60);
  assert.equal(s.result, "arrested");
  assert.equal(s.roadblockEvents.length, 0);
});

test("the bonnet camera sits over the bonnet looking down the road and maps its frame to a GL viewport", () => {
  const cam = new BonnetCamera();
  cam.update({ x: 10, z: 20, angle: -Math.PI / 2 });
  const p = cam.camera.position;
  assert.ok(Math.abs(p.x - (10 + BONNET.forward)) < 1e-9);
  assert.equal(p.y, BONNET.up);
  assert.ok(Math.abs(p.z - 20) < 1e-9);
  assert.ok(Math.abs(cam.target.x - 35) < 1e-9, "looks ahead, east");
  const box = (left, top, width, height) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const frame = {
    hidden: false,
    getBoundingClientRect: () => box(418, 132, 264, 149),
  };
  const canvas = { getBoundingClientRect: () => box(0, 0, 1100, 740) };
  assert.deepEqual(cam.frameRect(frame, canvas), {
    x: 420,
    y: 740 - 281 + 2,
    w: 260,
    h: 145,
  });
  assert.equal(cam.frameRect({ ...frame, hidden: true }, canvas), null);
  const collapsed = {
    hidden: false,
    getBoundingClientRect: () => box(0, 0, 0, 0),
  };
  assert.equal(cam.frameRect(collapsed, canvas), null);
});
