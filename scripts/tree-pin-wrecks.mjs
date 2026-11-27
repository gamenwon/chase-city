// Player nose-in to a big tree, police wrecks along one or both sides
// (cars blown up there), the live police then close in. Truth from the
// audit's full-game escape attempts at the stuck moment.
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { random } from "./autoplay.js";
import { escapeAttempts } from "./audit-arrests.js";
const layout = createLayout();
export function wreckScene({ treeIndex = 3, heading = 0, seed = 1, sides = [-1, 1], f = 0.4, gap = 0.15, rear = false, fixedTree = false } = {}) {
  const s = new Simulation(layout, { width: 390, height: 664, random: random(seed), city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 } });
  s.start();
  const tree = s.city.props.filter((q) => q.kind === "bigTree")[treeIndex];
  // (Big trees can be knocked down now; fixedTree keeps this one standing,
  // a stand-in for any obstacle the car cannot break.)
  if (fixedTree) tree.breakAt = Infinity;
  const p = s.player;
  const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  Object.assign(p, { x: tree.x - fx * 1.95, z: tree.z - fz * 1.95, angle: heading, speed: 3, vx: 0, vz: 0 });
  s.previousPlayer = { x: p.x, z: p.z };
  // Blow up police cars right beside the player: their wrecks stay there.
  sides.forEach((side, i) => {
    const c = s.police[i];
    Object.assign(c, { x: p.x + rx * side * (2.1 + gap) + fx * f, z: p.z + rz * side * (2.1 + gap) + fz * f, angle: heading, vx: 0, vz: 0 });
    s.explodePolice(c);
  });
  // Optionally a wreck across the back too (fully boxed in).
  if (rear) {
    const c = s.police[sides.length];
    Object.assign(c, { x: p.x - fx * 4.6, z: p.z - fz * 4.6, angle: heading + Math.PI / 2, vx: 0, vz: 0 });
    s.explodePolice(c);
    // Boxed in for real: the wrecks have settled (solid, as they are 0.9 s
    // after the crash), so the car cannot slip out through them first.
    for (const w of s.wrecks) w.solid = true;
  }
  // The rest start 14-20 m away and chase.
  s.police.forEach((c, i) => {
    if (c.state !== "active") return;
    const a = heading + Math.PI * (0.8 + i * 0.25);
    c.x = p.x + Math.sin(a) * (14 + i * 2);
    c.z = p.z + Math.cos(a) * (14 + i * 2);
  });
  s.openEscape = () => {};
  s.refreshNavigation();
  return s;
}
export function runWreck(cfg, steer = {}, seconds = 20) {
  const s = wreckScene(cfg);
  const start = { x: s.player.x, z: s.player.z };
  let maxMove = 0;
  const reasons = {};
  for (let f = 0; f < seconds * 60 && !s.result; f++) {
    s.health = 100;
    s.update(1 / 60, steer);
    reasons[s.pin.reason] = (reasons[s.pin.reason] || 0) + 1 / 60;
    maxMove = Math.max(maxMove, Math.hypot(s.player.x - start.x, s.player.z - start.z));
  }
  return { s, maxMove, reasons };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const treeIndex of [0, 3, 5, 9])
    for (const heading of [0, 1.6, 3.1, 4.7])
      for (const sides of [[-1, 1], [-1], [1]]) {
        const cfg = { treeIndex, heading, sides, seed: treeIndex + 11 };
        const runs = [{}, { left: true }, { right: true }].map((st) => runWreck(cfg, st));
        const stuck = runs.map((r) => r.s.result !== "arrested" && r.maxMove < 6);
        if (!stuck.some(Boolean)) { rows.push({ ...cfg, kind: "fine" }); continue; }
        // Truth at the stuck moment (the no-steering run, 12 s in).
        const t = wreckScene(cfg);
        for (let f = 0; f < 12 * 60 && !t.result; f++) { t.health = 100; t.update(1 / 60, {}); }
        const truth = t.result ? -1 : Math.max(...escapeAttempts(layout, t, 390, 664).map((a) => a.best));
        const row = { ...cfg, truth, results: runs.map((r) => r.s.result || "-"), moves: runs.map((r) => +r.maxMove.toFixed(1)), reasons: runs.map((r) => Object.entries(r.reasons).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(" ")), kind: truth >= 0 && truth < 4 ? "MISSED" : "escapable-stuck" };
        rows.push(row);
        console.log(JSON.stringify(row));
      }
  const c = (k) => rows.filter((r) => r.kind === k).length;
  console.log(`runs ${rows.length}: fine ${c("fine")}, MISSED (truly trapped, no arrest) ${c("MISSED")}, stuck-but-escapable ${c("escapable-stuck")}`);
}
