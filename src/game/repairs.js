// Repair pickups: cartoon toolboxes on ordinary streets, picked up by
// driving through them (no button), each restoring DAMAGE.repair (25 %) of
// the car's maximum durability, never above it, once per run. A handful
// per city, spread over the map, on drivable road only. An undamaged car
// drives through without using one up.
import { DAMAGE, heal } from "./durability.js";

export const REPAIRS = Object.freeze({ count: 6, radius: 2.8, spacing: 45 });

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
}

export function placeRepairs(sim) {
  const L = sim.layout;
  const R = rng((L.seed || 1) * 4241 + 7);
  const roads = (L.graph?.edges || []).filter((e) => e.kind === "road" && e.pts?.length >= 2);
  const out = [];
  const clear = (x, z) =>
    Math.max(Math.abs(x), Math.abs(z)) < 100 &&
    !sim.staticSolids.some((q) => Math.abs(q.x - x) < q.w / 2 + 1.5 && Math.abs(q.z - z) < q.d / 2 + 1.5) &&
    (!sim.navigation?.allowed || sim.navigation.allowed({ x, z })) &&
    !(sim.layout.start && Math.hypot(sim.layout.start.x - x, sim.layout.start.z - z) < 25) &&
    !(sim.coins || []).some((c) => Math.hypot(c.x - x, c.z - z) < 6);
  for (let tries = 0; out.length < REPAIRS.count && tries < 400 && roads.length; tries++) {
    const e = roads[Math.floor(R() * roads.length)];
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    const t = 0.3 + R() * 0.4;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (!clear(x, z) || out.some((q) => Math.hypot(q.x - x, q.z - z) < REPAIRS.spacing)) continue;
    out.push({ id: out.length, x, z, y: 1.1, taken: false });
  }
  return out;
}
export function resetRepairs(sim) {
  sim.repairs = sim.layout ? placeRepairs(sim) : [];
  sim.repairFx = [];
}
export function updateRepairs(sim) {
  const p = sim.player;
  if (!sim.repairs?.length || sim.result) return;
  for (const r of sim.repairs) {
    if (r.taken || sim.hp >= sim.maxHp) continue; // a full car leaves it for later
    if (Math.abs(r.x - p.x) > REPAIRS.radius || Math.abs(r.z - p.z) > REPAIRS.radius) continue;
    if (Math.hypot(r.x - p.x, r.z - p.z) > REPAIRS.radius || (p.y || 0) > 3) continue;
    r.taken = true;
    const restored = heal(sim, DAMAGE.repair);
    sim.repairFx.push({ x: r.x, y: r.y, z: r.z, time: sim.elapsed, restored });
    if (sim.repairFx.length > 10) sim.repairFx.shift();
  }
}
