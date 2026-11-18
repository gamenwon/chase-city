// Preview-only city layout: the downtown layout with three blocks turned
// into locations. The game's own layout (world/layout.js) is not changed.
//
//   gas station        block (15, -15)   east of the start road, ahead
//   basketball court   block (-15, -15)  west of the start road, ahead
//   fountain park      block (-45, -15)  the park west of the court
//
// Solid boxes added here use the game's normal collision (axis-aligned
// boxes). Breakable things (fence panels, hoops, benches, lamps, bins) are
// not solid: cars break them and drive on, so no escape route is ever
// closed by debris.
import { createLayout } from "../../world/layout.js";

export const GAS = { x: 15, z: -15 };
export const COURT = { x: -15, z: -15 };
export const PARK = { x: -45, z: -15 };

// Gas station plan (block-local metres; x east, z south).
export const GAS_PLAN = {
  mart: { x: 1.5, z: -5.8, w: 13, d: 5.5, h: 4.0 },
  canopy: { x: -1.5, z: 3.6, w: 11.4, d: 8.6, h: 4.8 },
  // Pump islands (solid kerbs, 6.4 x 1.2) with two pumps each.
  islands: [
    { x: -1.5, z: 1.2 },
    { x: -1.5, z: 6.0 },
  ],
  pylon: { x: -8.0, z: 8.0 },
};
// Fountain: an octagon approximated by two crossed boxes.
export const FOUNTAIN_R = 2.6;

const inBlock = (b, c) => Math.abs(b.x - c.x) < 10 && Math.abs(b.z - c.z) < 10;

export function previewLayout() {
  const base = createLayout();
  const buildings = base.buildings.filter((b) => !inBlock(b, GAS) && !inBlock(b, COURT));
  const parks = base.parks.filter((p) => !(p.x === PARK.x && p.z === PARK.z));
  const obstacles = base.obstacles.filter((o) => !inBlock(o, PARK));
  const solid = (c, x, z, w, d, kind) => obstacles.push({ x: c.x + x, z: c.z + z, w, d, kind });
  const m = GAS_PLAN.mart;
  // The shop, with its front kit (ice chest, vending machine) inside the box.
  solid(GAS, m.x, m.z + 0.45, m.w, m.d + 0.9, "gas-mart");
  for (const i of GAS_PLAN.islands) solid(GAS, i.x, i.z, 6.4, 1.2, "gas-island");
  solid(GAS, GAS_PLAN.pylon.x, GAS_PLAN.pylon.z, 2.6, 0.9, "gas-pylon");
  // Court trees (outside the fence, north and south strips).
  for (const x of [-7.0, 4.3]) for (const z of [-7.5, 7.5]) solid(COURT, x, z, 0.6, 0.6, "tree");
  // Fountain and park trees.
  const f = FOUNTAIN_R;
  solid(PARK, 0, 0, 2 * f, f * 0.9, "fountain");
  solid(PARK, 0, 0, f * 0.9, 2 * f, "fountain");
  for (const x of [-6.8, 6.8]) for (const z of [-6.8, 6.8]) solid(PARK, x, z, 0.6, 0.6, "tree");
  return { buildings, parks, obstacles, locations: { gas: GAS, court: COURT, park: PARK } };
}
