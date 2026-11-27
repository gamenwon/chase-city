// Gold coins: collected by driving through them, paid into the saved
// balance when the run ends (main.js -> progress.pay, once per run, success
// or failure). Coins are the game's one currency (the former "credits"):
// in-game only, never the company's reward points.
//
// Where they are (placed once per run from the layout, deterministic per
// seed; never inside a building or any solid):
//   roads      a few short rows on ordinary streets
//   alleys     worth more, in the narrow alleys, and up on the elevated
//              road (a risky route: only reached from the deck)
//   ramps      along the real jump arc over the big dirt ramp (computed
//              with the same jump physics as the cars) and a few by the
//              construction site, the plaza, the yard, the park
//   facilities small groups at the gas station, depot, market and other
//              destructible places
// Destruction pays too (selected events only, each object once, chain
// links capped, a per-run cap): see COINS.reward.
//
// Only the player collects (police and traffic never do); coins are never
// solid. A collected coin does not come back in the same run.
import { groundHeight, updateJump, JUMP } from "./jumps.js";
import { overpassHeight } from "../world/citygen.js";
import { chaosDestroyed } from "./chaos.js";

export const COINS = Object.freeze({
  radius: 2.6, // forgiving pickup distance (m)
  height: 3.2, // vertical reach (airborne coins)
  value: { road: 1, alley: 2, ramp: 2, facility: 2 },
  // Share of the run's coins by source (initial balance, see report):
  // roads 40 %, alleys 25 %, ramps/special 15 %, destruction 20 %.
  groups: { road: 20, alley: 8, facility: 6 },
  perGroup: { road: 4, alley: 5, facility: 2 },
  reward: {
    police: 2, // a police car blown up
    civilian: 1, // a civilian car that goes up (not every wreck)
    gas: 10, // a fuel island
    depot: 8, // a gas depot tank
    bridge: 12, // a span of the elevated road
    sculpture: 3, // a giant ad off its roof
    landmark: 6, // a statue broken apart
    wheel: 6, // the Ferris wheel off its axle
    fireworks: 5,
    chainLink: 1, // each further link of a chain reaction...
    chainCap: 6, // ...up to this many per run
  },
  destructionCap: 40, // destruction coins per run at most
});

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
}
const clear = (sim, x, z, pad = 1.2) =>
  Math.max(Math.abs(x), Math.abs(z)) < 103 &&
  !sim.staticSolids.some((q) => Math.abs(q.x - x) < q.w / 2 + pad && Math.abs(q.z - z) < q.d / 2 + pad) &&
  (!sim.navigation?.allowed || sim.navigation.allowed({ x, z }));

// Points along a polyline, every `step` m, from `from` m in.
function along(pts, from, n, step, side = 0) {
  let len = 0;
  const segs = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], l = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ a, b, l, at: len });
    len += l;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = from + i * step;
    const g = segs.find((q) => s >= q.at && s <= q.at + q.l);
    if (!g) break;
    const t = (s - g.at) / (g.l || 1), ux = (g.b.x - g.a.x) / (g.l || 1), uz = (g.b.z - g.a.z) / (g.l || 1);
    out.push({ x: g.a.x + (g.b.x - g.a.x) * t - uz * side, z: g.a.z + (g.b.z - g.a.z) * t + ux * side });
  }
  return { pts: out, len };
}

// The arc a car flies over the main ramp at a typical speed (same physics
// as jumps.js), as points every ~2.5 m of flight.
export function rampArc(layout, speed = 22) {
  const m = (layout.mounds || []).find((q) => q.main);
  if (!m) return [];
  const sim = { layout, stats: {}, city: null, elapsed: 0, player: null };
  const body = { x: m.x - m.ux * (m.len + 4), z: m.z - m.uz * (m.len + 4), y: 0, vx: m.ux * speed, vz: m.uz * speed };
  sim.player = body;
  const arc = [];
  let lastX = null;
  for (let f = 0; f < 120; f++) {
    body.x += body.vx / 60;
    body.z += body.vz / 60;
    updateJump(sim, body, 1 / 60, 1);
    if (body.air) {
      if (!lastX || Math.hypot(body.x - lastX.x, body.z - lastX.z) > 2.5) {
        arc.push({ x: body.x, z: body.z, y: body.y });
        lastX = { x: body.x, z: body.z };
      }
    } else if (arc.length) break;
  }
  return arc;
}

export function placeCoins(sim) {
  const L = sim.layout;
  const R = rng((L.seed || 1) * 7919 + 17);
  const coins = [];
  const add = (x, z, kind, y = null) => {
    if (coins.some((c) => Math.hypot(c.x - x, c.z - z) < 1.6)) return;
    if (y == null && !clear(sim, x, z)) return;
    const ground = groundHeight(L.mounds || [], x, z);
    coins.push({ id: coins.length, x, z, y: y ?? ground + 1.0, kind, value: COINS.value[kind], taken: false });
  };
  // Roads: short rows on a lane of random street edges.
  // (The hill road has coins over its crests instead.)
  const roads = (L.graph?.edges || []).filter((e) => e.kind === "road" && !e.hill && e.pts?.length >= 2);
  for (let g = 0, tries = 0; g < COINS.groups.road && tries < 200 && roads.length; tries++) {
    const e = roads[Math.floor(R() * roads.length)];
    const lane = (e.width || 8) / 4 * (R() < 0.5 ? -1 : 1);
    const { len } = along(e.pts, 0, 0, 1);
    if (len < 22) continue;
    const start = 6 + R() * (len - 20);
    const { pts } = along(e.pts, start, COINS.perGroup.road, 3, lane);
    const before = coins.length;
    for (const p of pts) add(p.x, p.z, "road");
    if (coins.length > before) g++;
  }
  // Alleys and shortcuts: worth more.
  // (One group per 14 m of alley, up to the budget.)
  const alleys = L.alleys || [];
  let ag = 0;
  for (const a of alleys) {
    const { len } = along(a.pts, 0, 0, 1);
    const n = Math.max(1, Math.min(3, Math.floor(len / 14)));
    for (let k = 0; k < n && ag < COINS.groups.alley; k++, ag++) {
      const { pts } = along(a.pts, (len * (k + 0.5)) / n - 4.5, COINS.perGroup.alley, 2.4, 0);
      for (const p of pts) add(p.x, p.z, "alley");
    }
  }
  // Risky route: up on the elevated road deck (only a car on the deck
  // reaches them; one under it does not).
  for (const op of L.overpasses || []) {
    const path = op.pts || [op.a, { x: op.a.x + op.u.x * op.L, z: op.a.z + op.u.z * op.L }];
    const { len } = along(path, 0, 0, 1);
    for (const at of [0.3, 0.5, 0.7]) {
      const { pts } = along(path, len * at - 3, 3, 3, 0);
      for (const p of pts) {
        const s0 = len * at;
        const h = overpassHeight(op, Math.max(0, Math.min(op.L, s0)));
        if (h > 2.5) add(p.x, p.z, "alley", h + 1.0);
      }
    }
  }
  // Ramps: along the real jump arc (airborne coins), and one on each
  // small mound.
  for (const p of rampArc(L)) add(p.x, p.z, "ramp", p.y + 0.9);
  for (const m of (L.mounds || []).filter((q) => !q.main)) add(m.x, m.z, "ramp", m.h + 1.0);
  // Facilities: through the yard and the park lanes, by the plaza, the
  // gas station and the depot.
  const feats = L.features || [];
  const lane = (f, n) => {
    const b = f.block;
    if (!b) return;
    const ax = b.alongX ?? true;
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) * 3;
      add(ax ? b.cx + t : b.cx, ax ? b.cz : b.cz + t, "facility");
    }
  };
  for (const f of feats) if (["containers", "funpark", "diner"].includes(f.kind)) lane(f, COINS.perGroup.facility + 1);
  for (const k of ["gas", "gasDepot"]) {
    const l = L.locations?.[k];
    if (!l) continue;
    for (const [dx, dz] of [[0, 12.5], [0, -12.5]]) add(l.x + dx, l.z + dz, "facility");
  }
  return coins;
}

export function resetCoins(sim) {
  sim.coins = sim.layout ? placeCoins(sim) : [];
  sim.runCoins = 0;
  sim.coinStats = { picked: 0, pickedValue: 0, byKind: {}, destruction: 0, chain: 0, rewards: 0 };
  sim.coinKeys = new Set();
  sim.coinFx = []; // { x, y, z, value, time, kind: "pick" | "reward" } for the renderer and sound
}

// Destruction reward: once per key (object), chain links and the per-run
// total capped.
export function awardCoins(sim, key, kind, x, z, chainDepth = 0) {
  // (CITY CHAOS: every reward-worthy destruction feeds the combo and the
  // wanted level; it checks who caused it and counts each object once.)
  if (sim.chaos) chaosDestroyed(sim, kind, key, x, z, chainDepth);
  if (!sim.coinKeys || sim.coinKeys.has(key) || sim.result) return 0;
  sim.coinKeys.add(key);
  const R = COINS.reward;
  let amount = R[kind] || 0;
  if (chainDepth > 0 && sim.coinStats.chain < R.chainCap) {
    const extra = Math.min(chainDepth, R.chainCap - sim.coinStats.chain) * R.chainLink;
    sim.coinStats.chain += extra;
    amount += extra;
  }
  amount = Math.min(amount, COINS.destructionCap - sim.coinStats.destruction);
  if (amount <= 0) return 0;
  sim.coinStats.destruction += amount;
  sim.coinStats.rewards++;
  sim.runCoins += amount;
  sim.coinFx.push({ x, y: 2, z, value: amount, time: sim.elapsed, kind: "reward", reason: kind });
  if (sim.coinFx.length > 40) sim.coinFx.shift();
  return amount;
}

// CITY CHAOS coin carrier: every hit throws coins out round it (they arc
// out from the van and land on open ground, never in a building). Spilled
// coins left lying are capped (the oldest go first).
export const SPILL = Object.freeze({ count: 10, value: 1, r0: 2.6, r1: 4.6, cap: 120, flight: 0.45 });
export function spillCoins(sim, x, z, n = SPILL.count) {
  if (!sim.coins) return 0;
  let made = 0;
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++) {
      const a = base + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5 + k * 0.37;
      const r = SPILL.r0 + Math.random() * (SPILL.r1 - SPILL.r0) - k * 0.3;
      const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      if (sim.nearSolids && sim.nearSolids(cx, cz, 0.6).length) continue;
      const ground = groundHeight(sim.layout?.mounds || [], cx, cz);
      sim.coins.push({ id: sim.coins.length, x: cx, z: cz, y: ground + 1.0, kind: "spill", value: SPILL.value, taken: false, born: sim.elapsed, fromX: x, fromZ: z });
      made++;
      break;
    }
  }
  // Keep the spilled coins lying about bounded.
  const lying = sim.coins.filter((c) => c.kind === "spill" && !c.taken);
  for (const c of lying.slice(0, Math.max(0, lying.length - SPILL.cap))) c.taken = true;
  sim.coinStats.spilled = (sim.coinStats.spilled || 0) + made;
  return made;
}

// Every step: the player drives through coins (never police or traffic).
export function updateCoins(sim) {
  const p = sim.player;
  if (!sim.coins?.length || sim.result) return;
  const py = (p.y || 0) + 0.7;
  const R = sim.vehicle?.stats.coinRadius || COINS.radius;
  for (const c of sim.coins) {
    if (c.taken) continue;
    if (c.born != null && sim.elapsed - c.born < SPILL.flight) continue; // (still flying out)
    if (Math.abs(c.x - p.x) > R || Math.abs(c.z - p.z) > R) continue;
    if (Math.hypot(c.x - p.x, c.z - p.z) > R || Math.abs(c.y - py) > COINS.height) continue;
    c.taken = true;
    c.takenAt = sim.elapsed;
    sim.runCoins += c.value;
    sim.coinStats.picked++;
    sim.coinStats.pickedValue += c.value;
    sim.coinStats.byKind[c.kind] = (sim.coinStats.byKind[c.kind] || 0) + c.value;
    sim.coinFx.push({ x: c.x, y: c.y, z: c.z, value: c.value, time: sim.elapsed, kind: "pick", id: c.id });
    if (sim.coinFx.length > 40) sim.coinFx.shift();
  }
}
void JUMP;
