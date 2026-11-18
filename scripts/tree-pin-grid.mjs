// Tight boxes against a big park tree: police touching both sides of the
// player (shifted forward by f), one across the rear; nose on the tree.
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { makePolice } from "../src/game/police.js";
import { random } from "./autoplay.js";
import { escapeAttempts } from "./audit-arrests.js";
const layout = createLayout();
const W = 390, H = 664;
export function boxScene({ treeIndex = 0, heading = 0, gap = 0.1, f = 0.6, yaw = 0.1, rear = true, rearGap = 0.1, sideOff = 0 }) {
  const s = new Simulation(layout, { width: W, height: H, reinforcements: false, barricades: false, random: random(5), city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 } });
  s.start();
  const tree = s.city.props.filter((q) => q.kind === "bigTree")[treeIndex];
  const p = s.player;
  // Forward unit for angle a is (-sin a, -cos a). Nose touches the tree.
  const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  const back = 0.75 + 1.15 + 0.02;
  Object.assign(p, { x: tree.x - fx * back + rx * sideOff, z: tree.z - fz * back + rz * sideOff, angle: heading, speed: 4, vx: 0, vz: 0 });
  s.previousPlayer = { x: p.x, z: p.z };
  const at = (side, fwd, ang) => ({ x: p.x + rx * side + fx * fwd, z: p.z + rz * side + fz * fwd, angle: ang });
  const cars = [at(-(2.1 + gap), f, heading + yaw), at(2.1 + gap, f, heading - yaw)];
  if (rear) cars.push(at(0, -(1.8 + 1.05 + rearGap), heading + Math.PI / 2));
  s.police = cars.map((c, i) => Object.assign(makePolice(i + 1, 0), c, { vx: 0, vz: 0, speed: 0, stunTimer: 1e9 }));
  s.cordonCooldownUntil = Infinity;
  s.roadblockCooldownUntil = Infinity;
  s.openEscape = () => {};
  return s;
}
export function play(s, steer, seconds = 9) {
  for (let f = 0; f < seconds * 60 && !s.result; f++) { s.health = 100; s.update(1 / 60, steer); }
  return s.result;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const treeIndex of [0, 5])
    for (const heading of [0, 1.2, 2.6])
      for (const f of [0, 0.8, 1.6])
        for (const gap of [0.05, 0.4]) {
          const cfg = { treeIndex, heading, f, gap };
          const truth = Math.max(...escapeAttempts(layout, boxScene(cfg), W, H).map((a) => a.best));
          const out = {};
          for (const [k, st] of [["none", {}], ["left", { left: true }], ["right", { right: true }]]) {
            const g = boxScene(cfg);
            out[k] = play(g, st) || "-";
            out[k + "R"] = g.pin.reason;
          }
          const arrested = ["none", "left", "right"].filter((k) => out[k] === "arrested").length;
          const kind = truth < 4 ? (arrested === 3 ? "ok-arrest" : "MISSED") : truth > 10 ? (arrested ? "FALSE" : "ok-free") : "unclear";
          rows.push({ ...cfg, truth: +truth.toFixed(1), ...out, kind });
          console.log(JSON.stringify(rows.at(-1)));
        }
  const c = (k) => rows.filter((r) => r.kind === k).length;
  console.log(`summary: ok-arrest ${c("ok-arrest")} MISSED ${c("MISSED")} ok-free ${c("ok-free")} FALSE ${c("FALSE")} unclear ${c("unclear")}`);
}
