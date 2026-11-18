// Reproduce: player nose-in to a big park tree, police boxing the other
// sides, throttle on. Prints how the pin rule sees it over time.
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { makePolice } from "../src/game/police.js";
import { random } from "./autoplay.js";
import { probeEscape } from "../src/game/pin.js";

export function treeScene({ police = "box", steer = {}, gap = 0.2, layoutFn = createLayout } = {}) {
  const layout = layoutFn();
  const s = new Simulation(layout, {
    width: 390, height: 664, reinforcements: false, barricades: false, random: random(3), city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 },
  });
  s.start();
  const park = layout.parks.find((p) => p.x === -45 && p.z === -15);
  const tree = s.city.props.find((q) => q.kind === "bigTree" && q.x === park.x + 6 && q.z === park.z + 6);
  // Player pointing north (-z) with its nose on the tree (tree south side).
  const R = 1.15;
  Object.assign(s.player, { x: tree.x, z: tree.z + 0.75 + R + 0.02, angle: 0, speed: 0, vx: 0, vz: 0 });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  const cars = [];
  const add = (x, z, angle) => cars.push({ x, z, angle });
  const p = s.player;
  // Body 2.1 x 3.6: police alongside (left/right) and behind, `gap` m off.
  if (police === "box" || police === "sides") {
    add(p.x - 2.1 - gap, p.z + 0.4, 0.15);
    add(p.x + 2.1 + gap, p.z + 0.4, -0.15);
  }
  if (police === "box" || police === "rear") add(p.x, p.z + 3.6 + gap, Math.PI / 2);
  s.police = cars.map((c, i) => Object.assign(makePolice(i + 1, 0), c, { vx: 0, vz: 0, speed: 0, stunTimer: 1e9 }));
  s.cordonCooldownUntil = Infinity;
  s.roadblockCooldownUntil = Infinity;
  s.openEscape = () => {};
  s.refreshNavigation();
  return { s, tree };
}

export function runScene(s, seconds, steer = () => ({})) {
  const log = [];
  for (let f = 0; f < seconds * 60 && !s.result; f++) {
    s.update(1 / 60, steer(f / 60));
    for (const c of s.police) { c.vx = c.vz = 0; }
    if (f % 30 === 0) log.push(`${(f / 60).toFixed(1)}s pos=${s.player.x.toFixed(2)},${s.player.z.toFixed(2)} reason=${s.pin.reason} trapped=${s.pin.trapped} arrest=${s.arrest.toFixed(2)}`);
  }
  return { result: s.result, log };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const steerName of ["none", "left", "right"]) {
    const { s } = treeScene();
    console.log("probe with police", JSON.stringify(probeEscape(s)), "without", JSON.stringify(probeEscape(s, { withPolice: false })));
    const steer = steerName === "none" ? () => ({}) : () => ({ [steerName]: true });
    const r = runScene(s, 9, steer);
    console.log(`--- steer ${steerName}: result=${r.result}`);
    console.log(r.log.filter((_, i) => i % 2 === 0).join("\n"));
  }
}
