// Collapse prototype layout: the downtown layout with the four buildings
// of one block replaced by a single 36 m tower (the only building that can
// collapse; a special-mission target). The game's layout is not changed.
import { createLayout } from "../../world/layout.js";

export const TOWER = {
  x: 45, z: -15, // block centre
  w: 13, d: 13, // footprint
  pad: { x: 45, z: -6.6, r: 2.6 }, // detonator pad on the south pavement
  fall: -1, // falls north (toward -z), across the road at z = -30
};
// After the collapse: the rubble keeps the tower's footprint; the crown
// lies across the road to the north (that road segment is closed, every
// other route stays open).
export const RUBBLE = [
  { x: TOWER.x, z: TOWER.z, w: 13, d: 13, kind: "tower-rubble" },
  { x: TOWER.x, z: TOWER.z - 15.9, w: 9.4, d: 12.6, kind: "crown-wreck" },
];

export function collapseLayout() {
  const base = createLayout();
  const inBlock = (b) => Math.abs(b.x - TOWER.x) < 10 && Math.abs(b.z - TOWER.z) < 10;
  return {
    buildings: base.buildings.filter((b) => !inBlock(b)),
    parks: base.parks,
    obstacles: [...base.obstacles, { x: TOWER.x, z: TOWER.z, w: TOWER.w, d: TOWER.d, kind: "tower" }],
    tower: TOWER,
  };
}
