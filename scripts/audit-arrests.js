// Audit of arrests in natural play: at the moment each arrest is confirmed,
// the game state is copied and the player tries every simple forward-driving
// escape (straight, hard/soft left or right, and switches between them) for
// 5 seconds with the arrest timer held at zero. If any attempt gets the car
// 9 m clear of where it was caught, a real way out was still open and the
// arrest was false. Usage: node scripts/audit-arrests.js [seeds] [out.json]
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { CONFIG } from "../src/game/config.js";
import { stageDriver } from "./pursuit.js";
import { random } from "./autoplay.js";

const POLICIES = [
  ["straight", () => ({})],
  ["left", () => ({ left: true })],
  ["right", () => ({ right: true })],
  ...[0.3, 0.6, 1.0].flatMap((t) => [
    [`left${t}-straight`, (e) => ({ left: e < t })],
    [`right${t}-straight`, (e) => ({ right: e < t })],
  ]),
  [
    "left-right",
    (e) => (e < 0.6 ? { left: true } : e < 1.4 ? { right: true } : {}),
  ],
  [
    "right-left",
    (e) => (e < 0.6 ? { right: true } : e < 1.4 ? { left: true } : {}),
  ],
  ["pulse", (e) => ({ left: Math.floor(e * 3) % 2 === 0 })],
];

function copy(layout, s, width, height) {
  const t = new Simulation(layout, {
    width,
    height,
    reinforcements: false,
    barricades: false,
    random: () => 0.5,
    city: !!s.city,
    cityBudget: s.cityBudget,
  });
  t.start();
  // Every plain piece of game state (player, police, cordon, roadblock,
  // officers, wrecks, timers...) is carried over as it is.
  for (const key of Object.keys(s)) {
    if (["layout", "navigation", "solids", "random", "cameraRig"].includes(key))
      continue;
    try {
      t[key] = structuredClone(s[key]);
    } catch {
      // functions and class instances stay as the fresh copy made them
    }
  }
  // V1.9 city: copy its plain state (props, traffic, pedestrians, fallen
  // trees...) into the copy's own city, which keeps its grids/helpers.
  if (s.city) {
    const plain = structuredClone({
      props: s.city.props,
      traffic: s.city.traffic,
      parking: s.city.parking,
      pedestrians: s.city.pedestrians.map((q) => ({ ...q, threat: null })),
      litter: s.city.litter,
      solids: s.city.solids,
      stats: s.city.stats,
      nextId: s.city.nextId,
      eventId: s.city.eventId,
    });
    Object.assign(t.city, plain, { budget: s.city.budget, events: [] });
    t.city.grid = new Map();
    for (const q of t.city.props) {
      const k = t.city.key(q.x, q.z);
      if (!t.city.grid.has(k)) t.city.grid.set(k, []);
      t.city.grid.get(k).push(q);
    }
    t.city.moving = new Set(
      t.city.props.filter((q) => q.state === "falling" || q.state === "tumble"),
    );
  }
  t.reinforcementsEnabled = false;
  t.barricadesEnabled = false;
  t.refreshNavigation();
  return t;
}

export function escapeAttempts(layout, s, width, height) {
  const start = { x: s.player.x, z: s.player.z };
  const out = [];
  {
    for (const [name, steer] of POLICIES) {
      const t = copy(layout, s, width, height);
      const t0 = t.elapsed;
      let best = 0;
      for (let f = 0; f < 300; f++) {
        t.arrest = 0; // arrest rule off for the escape attempt
        t.health = 100;
        t.update(1 / 60, steer(t.elapsed - t0));
        best = Math.max(
          best,
          Math.hypot(t.player.x - start.x, t.player.z - start.z),
        );
      }
      out.push({ name, best: +best.toFixed(2) });
    }
  }
  return out;
}

if (
  typeof process !== "undefined" &&
  import.meta.url === `file://${process.argv[1]}`
) {
  const seedCount = Number(process.argv[2] || 12);
  const layout = createLayout();
  const arrests = [];
  for (const width of [1100, 390])
    for (const mode of ["roads", "evasive"])
      for (let seed = 1; seed <= seedCount; seed++) {
        // AUDIT_ONLY="1100,evasive,8;390,roads,11" limits the audit to runs.
        if (
          process.env.AUDIT_ONLY &&
          !process.env.AUDIT_ONLY.split(";").includes(
            `${width},${mode},${seed}`,
          )
        )
          continue;
        const height = width === 390 ? 664 : 740;
        const s = new Simulation(layout, {
          width,
          height,
          random: random(seed + 40000),
          // CITY=1: audit with the V1.9 city on (phone budget at phone width).
          city: process.env.CITY === "1",
          cityProfile: width === 390 ? "mobile" : "desktop",
        });
        let drive = stageDriver(seed, mode),
          restarts = 0;
        s.start();
        for (let f = 0; f < 3600; f++) {
          if (s.result) {
            s.reset();
            s.start();
            restarts++;
            drive = stageDriver(seed + restarts, mode);
          }
          // Copy the state one step before the arrest becomes final.
          if (s.arrest >= CONFIG.arrestSeconds - 1 / 60 - 1e-9 && !s.result) {
            const attempts = escapeAttempts(layout, s, width, height);
            const escaped = attempts.filter((a) => a.best > 9);
            arrests.push({
              width,
              mode,
              seed,
              run: restarts,
              time: +s.elapsed.toFixed(2),
              player: { x: +s.player.x.toFixed(2), z: +s.player.z.toFixed(2) },
              police: s.police.filter(
                (c) =>
                  c.state === "active" &&
                  Math.hypot(c.x - s.player.x, c.z - s.player.z) < 10,
              ).length,
              falseArrest: escaped.length > 0,
              escapes: escaped.map((a) => a.name),
              bestEscape: Math.max(...attempts.map((a) => a.best)),
            });
          }
          s.update(1 / 60, drive(s));
        }
      }
  const summary = {
    arrests: arrests.length,
    falseArrests: arrests.filter((a) => a.falseArrest).length,
  };
  console.log(JSON.stringify(summary));
  for (const a of arrests.filter((a) => a.falseArrest))
    console.log(JSON.stringify(a));
  if (process.argv[3])
    (await import("node:fs")).writeFileSync(
      process.argv[3],
      JSON.stringify({ summary, arrests }, null, 1),
    );
}
