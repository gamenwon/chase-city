// A car driving straight into a big park tree (no steering, no police):
// does it get away, how often is the camera kicked, how much damage?
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { random } from "./autoplay.js";
const layout = createLayout();
export function treeRun({ treeIndex = 0, heading = 0, offset = 0, seconds = 10, steer = {} } = {}) {
  const s = new Simulation(layout, { width: 390, height: 664, reinforcements: false, barricades: false, random: random(3), city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 } });
  s.start();
  s.police = [];
  const tree = s.city.props.filter((q) => q.kind === "bigTree")[treeIndex];
  const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  Object.assign(s.player, { x: tree.x - fx * 12 + rx * offset, z: tree.z - fz * 12 + rz * offset, angle: heading, speed: 24, vx: fx * 24, vz: fz * 24 });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  let kicks = 0, kickFrames = 0, start = { x: s.player.x, z: s.player.z }, maxD = 0, health0 = s.health;
  let lastKick = 0;
  for (let f = 0; f < seconds * 60; f++) {
    s.update(1 / 60, steer);
    if ((s.cameraKick || 0) > 0) { kickFrames++; if (f - lastKick > 3) kicks++; lastKick = f; }
    maxD = Math.max(maxD, Math.hypot(s.player.x - start.x, s.player.z - start.z));
  }
  const dTree = Math.hypot(s.player.x - tree.x, s.player.z - tree.z);
  return { kicks, kickFrames, damage: +(health0 - s.health).toFixed(1), distFromTree: +dTree.toFixed(2), escaped: maxD > 25 };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const treeIndex of [0, 3, 6, 9]) for (const heading of [0, 1.57, 3.14, 4.71]) for (const offset of [0, 0.3]) rows.push({ treeIndex, heading, offset, ...treeRun({ treeIndex, heading, offset }) });
  const stuck = rows.filter((r) => !r.escaped);
  console.log(`runs ${rows.length}, stuck (never got 25 m away in 10 s) ${stuck.length}, avg kicks ${(rows.reduce((a, r) => a + r.kicks, 0) / rows.length).toFixed(1)}, max kicks ${Math.max(...rows.map((r) => r.kicks))}, max damage ${Math.max(...rows.map((r) => r.damage))}`);
  for (const r of stuck.slice(0, 6)) console.log(JSON.stringify(r));
}
