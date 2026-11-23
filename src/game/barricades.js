import { RoadNavigation, distance, clearSegment } from "./navigation.js";
export const BARRICADE_TIMES = Object.freeze([10, 20, 30, 40, 50]);
export function overlap(a, b, margin = 0) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin
  );
}
export function planBarricade(player, navigation, solids, active, fleet, id) {
  const speed = Math.hypot(player.vx, player.vz),
    fx = speed > 3 ? player.vx / speed : -Math.sin(player.angle),
    fz = speed > 3 ? player.vz / speed : -Math.cos(player.angle);
  const candidates = [];
  const graph = navigation.graph;
  for (const node of navigation.nodes) {
    if (Math.abs(node.x) > 90 || Math.abs(node.z) > 90) continue;
    let vertical = node.x % 30 === 0 && node.z % 30 !== 0,
      horizontal = node.z % 30 === 0 && node.x % 30 !== 0,
      across = 11.2;
    if (graph) {
      // Generated city: mid-street nodes of straight streets that run
      // close to an axis (a barricade is an axis-aligned box).
      const e = graph.edges[node.edge];
      if (!e || e.kind !== "road" || e.pts.length !== 2 || node.neighbors.length !== 2) continue;
      const a = e.pts[0], b = e.pts[1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (Math.min(Math.hypot(node.x - a.x, node.z - a.z), Math.hypot(node.x - b.x, node.z - b.z)) < 10) continue;
      vertical = Math.abs(b.z - a.z) / L > 0.97;
      horizontal = Math.abs(b.x - a.x) / L > 0.97;
      across = e.width + 0.2;
    }
    // Generated city: the barricade reaches across everything drivable
    // there (pavements, open frontage) up to the buildings either side,
    // so it cannot be driven round over the pavement.
    let shift = 0;
    if (graph && (vertical || horizontal)) {
      const probe = (o) => {
        const q = vertical ? { x: node.x + o, z: node.z } : { x: node.x, z: node.z + o };
        return clearSegment(q, q, solids, 0.15);
      };
      let lo = 0, hi = 0;
      while (lo > -14 && probe(lo - 0.25)) lo -= 0.25;
      while (hi < 14 && probe(hi + 0.25)) hi += 0.25;
      if (lo <= -14 || hi >= 14) continue; // open ground beside: cannot seal
      across = Math.max(across, hi - lo + 0.3);
      shift = (lo + hi) / 2;
    }
    if (!vertical && !horizontal) continue;
    const dist = distance(node, player),
      forward = (node.x - player.x) * fx + (node.z - player.z) * fz;
    if (dist < 25 || dist > 80) continue;
    const b = {
      id,
      x: node.x + (vertical ? shift : 0),
      z: node.z + (vertical ? 0 : shift),
      w: vertical ? across : 1.2,
      d: vertical ? 1.2 : across,
      kind: "barricade",
      vertical,
      road: { x: node.x, z: node.z },
      forward: { x: fx, z: fz },
    };
    if (
      solids.some((box) => overlap(b, box, graph ? -0.05 : 0.8)) ||
      active.some((box) => distance(box, b) < 20) ||
      fleet.some(
        (c) =>
          c.state === "active" &&
          Math.abs(c.x - b.x) < b.w / 2 + 3 &&
          Math.abs(c.z - b.z) < b.d / 2 + 3,
      )
    )
      continue;
    // Prefer the predicted road ahead; near the map edge use a connected next-turn road.
    const score =
      Math.hypot(node.x - (player.x + fx * 36), node.z - (player.z + fz * 36)) +
      (forward < 15 ? 80 : 0);
    const before = {
        x: node.x - (vertical ? 0 : 6),
        z: node.z - (vertical ? 6 : 0),
      },
      after = {
        x: node.x + (vertical ? 0 : 6),
        z: node.z + (vertical ? 6 : 0),
      };
    candidates.push({ b, score, before, after });
  }
  candidates.sort(
    (a, b) => a.score - b.score || a.b.x - b.b.x || a.b.z - b.b.z,
  );
  for (const candidate of candidates) {
    const trial = new RoadNavigation([...solids, ...active, candidate.b]);
    const detour = trial.findPath(candidate.before, candidate.after);
    if (detour.length >= 4) return { ...candidate.b, detour };
  }
  return null;
}
export function updateBarricades(sim) {
  let changed = false;
  for (const time of BARRICADE_TIMES) {
    if (sim.elapsed + 1e-7 >= time - 2 && !sim.barricadeWarnings.has(time)) {
      sim.barricadeWarnings.add(time);
      sim.barricadeWarning = { time, until: time };
    }
    if (
      sim.elapsed + 1e-7 >= time &&
      !sim.barricadeEvents.some((e) => e.time === time)
    ) {
      const b = planBarricade(
        sim.player,
        sim.navigation,
        [...sim.staticSolids, ...sim.wrecks.filter((w) => w.solid)],
        sim.barricades,
        sim.police,
        time / 10,
      );
      if (b) {
        Object.assign(b, {
          born: sim.elapsed,
          // Barricades stay until restart (the routes close down one by
          // one); each is only placed where a detour around it, and
          // around every earlier one, still exists.
          expires: Infinity,
          passedAt: null,
        });
        sim.barricades.push(b);
        changed = true;
      }
      sim.barricadeEvents.push({
        time,
        actualTime: sim.elapsed,
        placed: !!b,
        position: b ? { x: b.x, z: b.z } : null,
      });
      sim.barricadeWarning = null;
    }
  }
  for (const b of sim.barricades) {
    const passed =
      (sim.player.x - b.road.x) * b.forward.x +
      (sim.player.z - b.road.z) * b.forward.z;
    if (passed > 8 && distance(b, sim.player) > 14 && b.passedAt === null)
      b.passedAt = sim.elapsed;
  }
  if (changed) sim.refreshNavigation();
}
