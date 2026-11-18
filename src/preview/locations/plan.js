// Where the park features and the outer-ring yards go (plain data, no
// three.js: the collision layout and the renderer both read it).
//
// Parks: each of the game's parks (except the fountain park) gets one
// coherent theme, picked by a fixed hash of its position. Features stand in
// the four lawn quarters, clear of the cross paths (|x|,|z| < 1 from the
// park centre), the park trees at (±6, ±6) and the bench on the east path.
//
// Yards: the outer ring of plain pavement between the outermost roads
// (±95.5) and the city edge (±108) is cut by the road ends into segments
// 19 m long and 12.5 m deep. Some become parking lots, building sites or
// storage yards. Their big pieces (containers, site cabin) stand against
// the city edge; the road side stays open, so a car can always drive in,
// across and out, and the police can follow.
import { PARK } from "./layout-consts.js";
import { cafeClusters } from "./sites.js";

const hash = (x, z) => {
  let h = Math.imul(Math.round(x) * 73856093 ^ Math.round(z) * 19349663, 0x5bd1e995);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

export const THEMES = ["memorial", "family", "art", "market"];

export function parkPlan(parks) {
  return parks
    .filter((p) => !(p.x === PARK.x && p.z === PARK.z))
    .map((p, i) => {
      // Every theme is used (round the list in park order), mirrored per
      // park, and each gets its own café seating, so no two look alike.
      const theme = THEMES[(i + 1) % 4];
      const flip = hash(p.z, p.x) < 0.5 ? 1 : -1;
      const at = (x, z) => ({ x: p.x + x * flip, z: p.z + z });
      const f = { park: p, theme, items: [], flyers: [], vehicles: [], solids: [] };
      // Park lawns (scene.js) are 0.49 m high.
      const Y = 0.49;
      const add = (kind, x, z, ry = 0, extra = {}) => f.items.push({ kind, ...at(x, z), y: Y, ry: ry * flip, ...extra });
      const seats = (spots) => f.flyers.push(...cafeClusters({ at: (u, v) => at(u, v) }, i * 5 + 3, spots, Y));
      if (theme === "memorial") {
        const s = at(-3.4, -3.4);
        f.solids.push({ x: s.x, z: s.z, w: 1.4, d: 1.4, kind: "plinth" });
        add("statue", -3.4, -3.4, Math.PI / 4);
        add("planter", -6.6, -2.4, Math.PI / 2);
        add("planter", -2.4, -6.6, 0);
        add("bin", 2.6, -6.8, 0);
        seats([[3.6, 3.6]]);
      } else if (theme === "family") {
        f.vehicles.push({ kind: "iceTruck", ...at(-3.2, 4.6), y: Y, ry: 0 });
        add("kiosk", 3.6, -3.6, 0);
        add("bin", -2.6, 7.4, 0);
        seats([[3.0, -6.8], [6.9, -2.8], [2.6, 2.8]]);
      } else if (theme === "art") {
        add("sculptureA", -3.4, 3.4, 0.3);
        add("sculptureB", 3.4, -3.4, -0.5);
        add("planter", -3.4, -3.6, Math.PI / 4);
        add("planter", 3.6, 3.4, -Math.PI / 4);
        seats([[-6.8, -2.6]]);
      } else {
        add("kiosk", -3.6, -3.6, Math.PI / 2);
        add("kiosk", 3.6, 3.6, -Math.PI / 2);
        add("bikeRack", -3.4, 3.6, 0);
        add("bin", 2.6, -6.8, 0);
        seats([[3.6, -3.6], [6.9, -2.2], [-2.2, 6.9]]);
      }
      return f;
    });
}

// Outer-ring segments: centre, long axis, outward direction.
function segments() {
  const out = [];
  const EDGE = 101.75; // middle of the 95.5..108 strip
  for (const c of [-75, -45, -15, 15, 45, 75])
    for (const s of [-1, 1]) {
      out.push({ x: s * EDGE, z: c, along: "z", out: [s, 0] });
      out.push({ x: c, z: s * EDGE, along: "x", out: [0, s] });
    }
  return out;
}
export const YARD_KINDS = ["parking", "construction", "storage"];
export function yardPlan() {
  const yards = [];
  segments().forEach((seg, i) => {
    const h = hash(seg.x * 3 + 7, seg.z * 5 + 11);
    if (h > 0.5) return; // about half the segments; the rest stay plain
    const kind = YARD_KINDS[i % 3];
    // Local frame: u along the segment (19 m), v outward (strip 12.5 m,
    // v = +6.25 is the city edge, -6.25 the road kerb).
    const ux = seg.along === "x" ? 1 : 0, uz = seg.along === "z" ? 1 : 0;
    const vx = seg.out[0], vz = seg.out[1];
    const ry = Math.atan2(vx, vz); // local +z (v) points outward
    const at = (u, v) => ({ x: seg.x + ux * u + vx * v, z: seg.z + uz * u + vz * v });
    const y = { ...seg, kind, ry, items: [], pushers: [], solids: [], at };
    // The yard surface is 0.05 m (outer pavement 0.03 + a 0.02 slab).
    const add = (k, u, v, r = 0, extra = {}) => y.items.push({ kind: k, ...at(u, v), y: 0.05, ry: ry + r, ...extra });
    const box = (u, v, wu, dv, k) => {
      const c = at(u, v);
      const w = seg.along === "x" ? wu : dv, d = seg.along === "x" ? dv : wu;
      y.solids.push({ x: c.x, z: c.z, w, d, kind: k });
    };
    if (kind === "parking") {
      // Bays along the edge, cars parked in some, wheel stops; the aisle
      // on the road side is open the whole length.
      for (let b = 0; b < 6; b++) {
        const u = -7.5 + b * 3;
        if (hash(b + seg.x, seg.z - b) < 0.65)
          y.pushers.push({ kind: "parkedCar", ...at(u, 3.2), y: 0.05, ry: ry, color: Math.floor(hash(seg.z + b, b) * 8) });
      }
      add("lampPole", -9.0, 5.6, 0);
      add("lampPole", 9.0, 5.6, 0);
      add("cone", -9.0, -4.8, 0);
      add("cone", 9.0, -4.8, 0);
    } else if (kind === "construction") {
      // Site cabin and a container against the edge (solid), a dirt pile,
      // pipes, crates, cones and barriers along the open side.
      box(-6.0, 4.6, 6.0, 2.6, "cabin");
      box(3.8, 4.7, 6.0, 2.4, "container");
      add("barrier", -6.5, -1.2, 0);
      add("barrier", -2.5, -1.2, 0);
      add("barrier", 3.5, -1.2, 0);
      for (const [u, v] of [[-8.5, -3.8], [-4.5, -3.8], [0.5, -3.8], [5.5, -3.8], [8.5, -3.8]]) add("cone", u, v, 0);
      add("crate", 0.4, 1.8, 0.2);
      add("crate", 1.3, 2.3, -0.3);
      add("crate", 8.9, -0.4, 0.1);
      // The dirt pile and the pipe stack are solid too (low, off the road
      // side: the strip in front stays open).
      box(6.6, 1.8, 3.6, 2.6, "dirt");
      box(-1.8, 1.9, 3.0, 2.0, "pipes");
      y.decor = "site";
    } else {
      // Storage yard: two containers against the edge (solid), pallet
      // stacks and crates in front, a forklift-style cart.
      box(-5.2, 4.7, 6.0, 2.4, "container");
      box(4.4, 4.7, 6.0, 2.4, "container");
      for (const [u, v] of [[-7.2, 1.2], [-4.6, 1.4], [2.4, 1.2], [5.2, 1.4], [8.4, 0.4]]) add("pallet", u, v, hash(u, v) - 0.5);
      for (const [u, v] of [[-1.4, 2.4], [-0.6, 1.6], [0.8, 2.6]]) add("crate", u, v, hash(v, u) - 0.5);
      add("cone", -9.0, -4.8, 0);
      add("cone", 9.0, -4.8, 0);
      y.pushers.push({ kind: "forklift", ...at(-1.8, -1.2), y: 0.05, ry: ry + 0.4 });
      y.decor = "yard";
    }
    yards.push(y);
  });
  return yards;
}
