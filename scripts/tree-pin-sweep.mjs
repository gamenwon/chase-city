// Sweep: player against a big park tree, 2-3 police placed tightly round it
// (frozen). Ground truth = the audit's full-game escape attempts; then the
// game is run with the throttle on (no steering, left, right) to see if it
// arrests. Prints trapped-but-free (missed arrests) and escapable-but-
// arrested (false arrests).
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { makePolice } from "../src/game/police.js";
import { random } from "./autoplay.js";
import { escapeAttempts } from "./audit-arrests.js";

const layout = createLayout();
const W = 390, H = 664;
function rect(c) {
  const ax = [{ x: Math.cos(c.angle), z: -Math.sin(c.angle) }, { x: -Math.sin(c.angle), z: -Math.cos(c.angle) }];
  return { c, ax, h: [1.05, 1.8] };
}
function overlap(a, b, pad = 0.05) {
  const A = rect(a), Bq = rect(b), dx = b.x - a.x, dz = b.z - a.z;
  for (const axis of [...A.ax, ...Bq.ax]) {
    const proj = (R) => R.h[0] * Math.abs(axis.x * R.ax[0].x + axis.z * R.ax[0].z) + R.h[1] * Math.abs(axis.x * R.ax[1].x + axis.z * R.ax[1].z);
    if (Math.abs(dx * axis.x + dz * axis.z) > proj(A) + proj(Bq) + pad) return false;
  }
  return true;
}
export function scene(seed) {
  const rnd = random(seed);
  const s = new Simulation(layout, { width: W, height: H, reinforcements: false, barricades: false, random: random(seed), city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 } });
  s.start();
  const trees = s.city.props.filter((q) => q.kind === "bigTree");
  const tree = trees[Math.floor(rnd() * trees.length)];
  // Player nose-in to the tree from a random side.
  const side = rnd() * Math.PI * 2;
  const d = 0.75 + 1.15 + 0.01;
  const p = s.player;
  Object.assign(p, { x: tree.x + Math.sin(side) * d, z: tree.z + Math.cos(side) * d, speed: 6, vx: 0, vz: 0 });
  p.angle = side + (rnd() - 0.5) * 0.6; // facing the tree (front is -z at angle 0)
  s.previousPlayer = { x: p.x, z: p.z };
  const n = 2 + Math.floor(rnd() * 2);
  const cars = [];
  for (let tries = 0; cars.length < n && tries < 400; tries++) {
    const a = p.angle + Math.PI * (0.25 + rnd() * 1.5); // sides and rear
    const r = 2.3 + rnd() * 1.8;
    const c = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, angle: rnd() * Math.PI * 2 };
    if (overlap(c, p, 0.02)) continue;
    if (cars.some((o) => overlap(c, o, 0.1))) continue;
    if (Math.hypot(c.x - tree.x, c.z - tree.z) < 2.6) continue;
    if (s.solids.some((b) => Math.abs(c.x - b.x) < b.w / 2 + 1.9 && Math.abs(c.z - b.z) < b.d / 2 + 1.9)) continue;
    cars.push(c);
  }
  s.police = cars.map((c, i) => Object.assign(makePolice(i + 1, 0), c, { vx: 0, vz: 0, speed: 0, stunTimer: 1e9 }));
  s.cordonCooldownUntil = Infinity;
  s.roadblockCooldownUntil = Infinity;
  s.openEscape = () => {};
  return { s, tree, n: cars.length };
}
export function play(s, steer, seconds = 9) {
  for (let f = 0; f < seconds * 60 && !s.result; f++) {
    s.health = 100;
    s.update(1 / 60, steer);
  }
  return s.result;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const from = +(process.argv[2] || 1), to = +(process.argv[3] || 60);
  const rows = [];
  for (let seed = from; seed <= to; seed++) {
    const { s, n } = scene(seed);
    if (n < 2) continue;
    const truth = Math.max(...escapeAttempts(layout, s, W, H).map((a) => a.best));
    const out = {};
    for (const [k, steer] of [["none", {}], ["left", { left: true }], ["right", { right: true }]]) {
      const { s: g } = scene(seed);
      out[k] = play(g, steer) || "-";
      out[k + "Reason"] = g.pin.reason;
    }
    const arrested = ["none", "left", "right"].filter((k) => out[k] === "arrested").length;
    const kind = truth < 4 ? (arrested === 3 ? "ok-arrest" : "MISSED") : truth > 10 ? (arrested ? "FALSE" : "ok-free") : "unclear";
    rows.push({ seed, n, truth: +truth.toFixed(1), ...out, kind });
    console.log(JSON.stringify(rows.at(-1)));
  }
  const count = (k) => rows.filter((r) => r.kind === k).length;
  console.log(`summary: ok-arrest ${count("ok-arrest")} MISSED ${count("MISSED")} ok-free ${count("ok-free")} FALSE ${count("FALSE")} unclear ${count("unclear")}`);
}
