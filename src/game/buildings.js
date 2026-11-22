// V2.1 destructible low-rise buildings (generated cities). One- and
// two-storey buildings the generator marks `destructible` are solid as a
// grid of wall cells (about 2.4 m) instead of one box. A hard hit damages
// the cell it lands on by impact speed and the car's mass (a heavier car
// does more), and the blow carries on through the cells behind it along
// the line of travel, losing strength cell by cell. Every cell it breaks
// over a corridor wider than a car (3.4 m) is gone for the rest of the
// run: a full-speed ram goes right through a small building, a slower or
// glancing one only knocks a hole in the wall or cracks it. The car keeps
// most of its speed when it breaks through. Rubble stays where it fell.
// High-rises are never cells: they stay solid.
export const WALL = Object.freeze({ cell: 2.4, hp: 70, min: 6, scale: 7, falloff: 0.86, corridor: 1.7, keep: 0.75 });

export function createBuildingCells(layout) {
  const cells = [];
  (layout.buildings || []).forEach((b, bi) => {
    if (!b.destructible) return;
    const nx = Math.max(2, Math.round(b.w / WALL.cell)), nz = Math.max(2, Math.round(b.d / WALL.cell));
    const cw = b.w / nx, cd = b.d / nz;
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++)
        cells.push({
          id: cells.length,
          building: bi,
          x: b.x - b.w / 2 + cw * (i + 0.5),
          z: b.z - b.d / 2 + cd * (k + 0.5),
          w: cw,
          d: cd,
          h: b.h,
          kind: "bcell",
          hp: WALL.hp,
          alive: true,
          edge: i === 0 || k === 0 || i === nx - 1 || k === nz - 1,
        });
  });
  return { cells, broken: [], version: 0 };
}
export const cellSolids = (sim) => (sim.buildingCells?.cells || []).filter((c) => c.alive);

// A car (body, moving at v0 before the hit) struck `cell` with `impact`
// (closing speed into the wall). Returns true if it broke through.
export function hitWall(sim, body, cell, impact, mass, v0) {
  if (!cell.alive || impact < WALL.min) return false;
  const speed = Math.hypot(v0.x, v0.z) || 1;
  const ux = v0.x / speed, uz = v0.z / speed;
  let damage = (impact - WALL.min) * WALL.scale * mass;
  // The cells along the blow (from the car through the building), nearest
  // first, over a corridor wider than the car.
  const all = sim.buildingCells.cells;
  const line = all
    .filter((c) => c.alive && c.building === cell.building)
    .map((c) => {
      const dx = c.x - body.x, dz = c.z - body.z;
      return { c, along: dx * ux + dz * uz, side: Math.abs(dx * uz - dz * ux) };
    })
    .filter((q) => q.along > -0.5 && q.side < WALL.corridor + Math.max(q.c.w, q.c.d) / 2)
    .sort((a, b) => a.along - b.along);
  let broke = 0;
  // Rows across the corridor take the blow together.
  let row = [], rowAt = -Infinity;
  const flush = () => {
    let any = false;
    for (const q of row) {
      q.c.hp -= damage;
      q.c.hitAt = sim.elapsed;
      q.c.hitDir = { x: ux, z: uz };
      if (q.c.hp <= 0) {
        breakCell(sim, q.c, ux, uz, speed);
        broke++;
        any = true;
      }
    }
    row = [];
    damage *= WALL.falloff;
    return any;
  };
  for (const q of line) {
    if (q.along - rowAt > 1.2 && row.length) {
      if (!flush()) break; // the blow stops at the first row that holds
    }
    if (!row.length) rowAt = q.along;
    row.push(q);
  }
  if (row.length) flush();
  if (broke) {
    sim.stats.wallsBroken = (sim.stats.wallsBroken || 0) + broke;
    body.vx = v0.x * WALL.keep;
    body.vz = v0.z * WALL.keep;
    if (body.speed != null) body.speed *= WALL.keep;
    sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: cell.x, z: cell.z, strength: Math.min(15, impact), byPlayer: body === sim.player });
    sim.events.push({ id: ++sim.eventId, type: "wallBreak", x: cell.x, z: cell.z, building: cell.building, strength: impact, time: sim.elapsed });
    if (sim.events.length > 64) sim.events.shift();
    sim.buildingCells.version++;
    // Through-routes for the police: the middle of every broken cell.
    sim.navigation.holes = sim.buildingCells.broken.map((c) => ({ x: c.x, z: c.z }));
    sim.refreshNavigation();
  }
  return broke > 0;
}
function breakCell(sim, c, ux, uz, speed) {
  c.alive = false;
  c.hp = 0;
  c.brokeAt = sim.elapsed;
  c.blow = { x: ux, z: uz, speed };
  sim.buildingCells.broken.push(c);
}
// Explosions knock holes in low-rise walls too.
export function blastWalls(sim, e, R, s) {
  const cells = sim.buildingCells?.cells;
  if (!cells?.length) return;
  let broke = 0;
  for (const c of cells) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x - e.x, c.z - e.z);
    if (d >= R * 0.7) continue;
    c.hp -= 90 * (1 - d / (R * 0.7)) * s;
    if (c.hp <= 0) {
      const ux = (c.x - e.x) / (d || 1), uz = (c.z - e.z) / (d || 1);
      breakCell(sim, c, ux, uz, 12);
      broke++;
    }
  }
  if (broke) {
    sim.buildingCells.version++;
    sim.navigation.holes = sim.buildingCells.broken.map((c) => ({ x: c.x, z: c.z }));
    sim.refreshNavigation();
  }
}
