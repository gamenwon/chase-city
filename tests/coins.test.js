// Coins: placement, collection (player only, airborne over the ramp),
// destruction rewards (once per object, capped), persistence (paid once).
import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/world/citygen.js";
import { createLayout } from "../src/world/layout.js";
import { Simulation } from "../src/game/simulation.js";
import { COINS, awardCoins, rampArc } from "../src/game/coins.js";
import { Progress } from "../src/game/progress.js";

const make = (seed, extra = {}) => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, reinforcements: false, barricades: false, ...extra });
  s.start();
  return s;
};

test("coins on every city (20 seeds): spread over roads, alleys, the ramp arc and facilities; none inside a solid or off the map", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = make(seed);
    const kinds = {};
    for (const c of s.coins) kinds[c.kind] = (kinds[c.kind] || 0) + c.value;
    assert.ok(s.coins.length >= 50 && s.coins.length <= 160, `seed ${seed}: ${s.coins.length} coins`);
    assert.ok(kinds.road && kinds.ramp && kinds.facility, `seed ${seed}: ${JSON.stringify(kinds)}`);
    for (const c of s.coins) {
      assert.ok(Math.max(Math.abs(c.x), Math.abs(c.z)) < 104);
      if (c.kind === "ramp") continue;
      assert.ok(!s.staticSolids.some((q) => Math.abs(q.x - c.x) < q.w / 2 + 0.5 && Math.abs(q.z - c.z) < q.d / 2 + 0.5), `seed ${seed}: coin in a solid`);
    }
    // No two coins on top of each other; not a coin line through the city.
    for (const a of s.coins) for (const b of s.coins) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.5);
  }
});

test("the player collects a coin by driving near it (forgiving radius); police and traffic never do; it does not come back", () => {
  const s = make(3);
  s.police = [];
  const c = s.coins.find((q) => q.kind === "road");
  // A police car parked right on it first: nothing.
  s.police = [{ id: 99, x: c.x, z: c.z, vx: 0, vz: 0, state: "active", health: 100, angle: 0, level: 0 }];
  for (const t of s.city?.traffic || []) Object.assign(t, { x: c.x, z: c.z });
  s.update(1 / 60, {});
  assert.equal(c.taken, false);
  s.police = [];
  // 2 m beside it, off the line of its row (the next coin is 3 m along).
  const next = s.coins.filter((q) => q !== c).reduce((a, q) => (Math.hypot(q.x - c.x, q.z - c.z) < Math.hypot(a.x - c.x, a.z - c.z) ? q : a));
  const rl = Math.hypot(next.x - c.x, next.z - c.z) || 1, ox = -(next.z - c.z) / rl, oz = (next.x - c.x) / rl;
  Object.assign(s.player, { x: c.x + ox * 2.0, z: c.z + oz * 2.0, vx: 0, vz: 0, speed: 0 });
  s.update(1 / 60, {});
  assert.equal(c.taken, true);
  assert.equal(s.runCoins, c.value);
  const before = s.runCoins;
  for (let i = 0; i < 30; i++) s.update(1 / 60, {});
  assert.equal(s.runCoins >= before, true);
  assert.equal(s.coins.filter((q) => q === c && !q.taken).length, 0);
});

test("airborne coins sit on the real jump arc: a car jumping the ramp at speed collects them", () => {
  const s = make(3);
  s.police = [];
  const m = s.layout.mounds.find((q) => q.main), p = s.player;
  // (The coins over this ramp's arc; dune crests have their own.)
  const arc = s.coins.filter((c) => c.kind === "ramp" && c.y > 2 && Math.abs(-(c.x - m.x) * m.uz + (c.z - m.z) * m.ux) < 2 && Math.abs((c.x - m.x) * m.ux + (c.z - m.z) * m.uz) < 30);
  assert.ok(arc.length >= 3, `${arc.length} airborne coins`);
  Object.assign(p, { x: m.x - m.ux * (m.len + 5), z: m.z - m.uz * (m.len + 5), angle: Math.atan2(-m.ux, -m.uz), vx: m.ux * 22, vz: m.uz * 22, speed: 22 });
  s.previousPlayer = { x: p.x, z: p.z };
  let air = false;
  for (let f = 0; f < 90; f++) {
    s.update(1 / 60, {});
    air ||= !!p.air;
  }
  assert.ok(air, "it jumped");
  const got = arc.filter((c) => c.taken).length;
  assert.ok(got >= arc.length - 1, `collected ${got}/${arc.length} in the air`);
  assert.ok(rampArc(s.layout).every((q) => q.y > 0.3));
});

test("destruction rewards: once per object, chain links and the per-run total capped", () => {
  const s = make(4);
  const a = awardCoins(s, "police:1:0", "police", 0, 0, 0);
  assert.equal(a, COINS.reward.police);
  assert.equal(awardCoins(s, "police:1:0", "police", 0, 0, 0), 0, "same object pays once");
  let chain = 0;
  for (let i = 0; i < 40; i++) chain += awardCoins(s, `car:${i}`, "civilian", 0, 0, 3) - COINS.reward.civilian;
  assert.ok(s.coinStats.chain <= COINS.reward.chainCap);
  for (let i = 0; i < 200; i++) awardCoins(s, `x:${i}`, "bridge", 0, 0, 0);
  assert.ok(s.coinStats.destruction <= COINS.destructionCap);
  // A blown-up police car pays through the game itself.
  const s2 = make(4);
  const c = s2.police.find((q) => q.state === "active");
  if (c) {
    const before = s2.runCoins;
    s2.explodePolice(c);
    assert.equal(s2.runCoins - before, COINS.reward.police);
  }
});

test("coins are paid into the saved balance once per run (success or failure), a restart starts at zero, the balance survives a reload", () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const pr = new Progress(storage);
  const s = make(5);
  s.runCoins = 37;
  const key = `t:${s.runNumber}`;
  assert.equal(pr.pay(key, "coins-0", s.runCoins), 37);
  assert.equal(pr.pay(key, "coins-0", s.runCoins), 0, "result shown again: not paid twice");
  s.reset();
  assert.equal(s.runCoins, 0);
  assert.ok(s.coins.every((c) => !c.taken));
  const reload = new Progress(storage);
  assert.equal(reload.credits, 37);
});
