// Live police: player nose-in to a big park tree, throttle held, steering
// as given; the police chase normally. Logs the pin rule's view.
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { random } from "./autoplay.js";
const layout = createLayout();
export function liveScene({ treeIndex = 0, heading = 0, seed = 1, width = 390 } = {}) {
  const s = new Simulation(layout, { width, height: width === 390 ? 664 : 740, random: random(seed), city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 } });
  s.start();
  const tree = s.city.props.filter((q) => q.kind === "bigTree")[treeIndex];
  const p = s.player;
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  Object.assign(p, { x: tree.x - fx * 1.95, z: tree.z - fz * 1.95, angle: heading, speed: 3, vx: 0, vz: 0 });
  s.previousPlayer = { x: p.x, z: p.z };
  // Police start round the player 14-20 m out, chasing.
  s.police.forEach((c, i) => {
    const a = heading + Math.PI * (0.4 + i * 0.4);
    c.x = p.x + Math.sin(a) * (14 + i * 2);
    c.z = p.z + Math.cos(a) * (14 + i * 2);
  });
  s.openEscape = () => {};
  s.refreshNavigation();
  return s;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = [];
  for (const treeIndex of [0, 3, 5, 9, 14])
    for (const heading of [0, 1.6, 3.1, 4.7])
      for (const steer of [{}, { left: true }, { right: true }]) {
        const s = liveScene({ treeIndex, heading, seed: treeIndex * 7 + 1 });
        const start = { x: s.player.x, z: s.player.z };
        const reasons = new Map();
        let maxMove = 0, nearMax = 0, stuckFor = 0, lastPos = { ...start }, still = 0;
        for (let f = 0; f < 20 * 60 && !s.result; f++) {
          s.health = 100;
          s.update(1 / 60, steer);
          reasons.set(s.pin.reason, (reasons.get(s.pin.reason) || 0) + 1);
          maxMove = Math.max(maxMove, Math.hypot(s.player.x - start.x, s.player.z - start.z));
          const near = s.police.filter((c) => c.state === "active" && Math.hypot(c.x - s.player.x, c.z - s.player.z) < 5).length;
          nearMax = Math.max(nearMax, near);
          if (f % 60 === 0) { still = Math.hypot(s.player.x - lastPos.x, s.player.z - lastPos.z) < 1 ? still + 1 : 0; stuckFor = Math.max(stuckFor, still); lastPos = { x: s.player.x, z: s.player.z }; }
        }
        const row = { treeIndex, heading, steer: Object.keys(steer)[0] || "none", result: s.result || "-", t: +s.elapsed.toFixed(1), maxMove: +maxMove.toFixed(1), stuckSec: stuckFor, nearMax, reasons: Object.fromEntries([...reasons].map(([k, v]) => [k, +(v / 60).toFixed(1)])) };
        summary.push(row);
        if (row.result !== "arrested" && stuckFor >= 6) console.log("STUCK-NO-ARREST", JSON.stringify(row));
      }
  const by = (f) => summary.filter(f).length;
  console.log(`runs ${summary.length}, arrested ${by((r) => r.result === "arrested")}, stuck>=6s without arrest ${by((r) => r.result !== "arrested" && r.stuckSec >= 6)}`);
}
