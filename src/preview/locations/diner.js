// Restaurant plaza (destruction pass): a whole city block of food shops,
// dining tables and advertising, built to be driven through and wrecked.
//
//   restaurants   two small restaurant buildings on opposite corners
//                 (north-west, south-east): real buildings, so their fronts
//                 break, burn and blow up like any shop (diner type, one
//                 with gas bottles); a billboard on each roof
//   arches        two big billboard arches over the east and west
//                 entrances (FOOD COURT, BURGERS...): a hard hit to a post
//                 snaps it and the sign beam topples into the plaza
//                 (gantries.js), crushing what is under it
//   dining        tables, chairs and parasols in clusters, menu boards,
//                 pole signs, flower pots, a vendor cart, a food truck,
//                 lamp posts with string lights between them (lit at night)
//
// Driving: the east and west sides are open their whole length (under the
// arches), the north side beside the north-west restaurant and the south
// side beside the south-east one: four ways in and out, 9 m+ wide, no
// pocket anywhere. Only the restaurants, the arch posts and the truck are
// solid; everything else breaks or flies.
import { B, G, cyl, ico, signBoard } from "./parts.js";
import { cafeClusters } from "./sites.js";
import { gantrySolids } from "./gantries.js";

const SIDEWALK = 2.4;
const Y = 0.4; // plaza at pavement height
const COLORS = [0xd62f2a, 0x2457c5, 0x2fa36b, 0xf5c01a, 0xf0781e, 0x7a3fb8, 0x1f6e6a, 0xe0367a];
const NAMES = [
  ["FOOD COURT", "#f5c01a", "#d62f2a"],
  ["BURGERS", "#d62f2a", "#ffe14a"],
  ["PIZZA", "#2fa36b", "#ffffff"],
  ["NOODLES", "#232227", "#ff4fa8"],
  ["TACOS", "#f0781e", "#ffffff"],
  ["SUSHI", "#2457c5", "#ffffff"],
];

// The plan of a restaurant plaza on block b (kerb rectangle kx0..kx1,
// kz0..kz1). R: the city's random stream.
export function dinerPlan(b, R) {
  const x0 = b.kx0 + SIDEWALK, x1 = b.kx1 - SIDEWALK, z0 = b.kz0 + SIDEWALK, z1 = b.kz1 - SIDEWALK;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const wR = Math.min(9, W * 0.4), dR = Math.min(7, D * 0.36);
  const pick = (k) => NAMES[(Math.floor(R() * NAMES.length) + k) % NAMES.length];
  // Two restaurants (layout buildings: drawn and broken like every shop).
  const buildings = [
    { x: x0 + wR / 2, z: z0 + dR / 2, w: wR, d: dR, h: 5 + Math.round(R() * 2), color: Math.floor(R() * 6), district: "commercial", shopType: "diner", diner: true },
    { x: x1 - wR / 2, z: z1 - dR / 2, w: wR, d: dR, h: 5 + Math.round(R() * 2), color: Math.floor(R() * 6), district: "commercial", shopType: R() < 0.5 ? "bottles" : "diner", diner: true },
  ];
  const f = { kind: "diner", block: { x0, x1, z0, z1, cx, cz }, items: [], flyers: [], vehicles: [], solids: [], roofSigns: [], lights: [] };
  const fly = (kind, x, z, ry = 0, extra = {}) => f.flyers.push({ kind, x, z, y: Y, ry, ...extra });
  const item = (kind, x, z, ry = 0, extra = {}) => f.items.push({ kind, x, z, y: Y, ry, ...extra });
  // Billboards on the restaurant roofs (scenery).
  buildings.forEach((r, k) => f.roofSigns.push({ x: r.x, z: r.z, y: Y + r.h, w: Math.min(6, r.w - 1), name: pick(k + 1), ry: k ? 0 : Math.PI }));
  // Arches over the open east and west sides (pseudo-sites for gantries.js:
  // a frame at the arch centre whose local x runs along the opening).
  const arches = [];
  const arch = (xa, za0, za1, side, name) => {
    const span = za1 - za0;
    if (span < 7) return;
    const half = span / 2 - 0.6;
    // ry = PI/2: local x -> world -z, local z -> world +x; falls inward.
    arches.push({
      x: xa, z: (za0 + za1) / 2, ry: Math.PI / 2, kind: "arch",
      gantry: { posts: [-half, half], cx: 0, lz: 0, h: 5.6, pw: 0.4, beam: { w: span - 0.4, h: 1.5, y: 5.3 }, postColor: 0xd62f2a, beamColor: 0xf5c01a, sign: [name[0], span - 1.2, 1.25, name[1], name[2]], lights: true, fallDir: side },
    });
  };
  arch(x1 - 0.5, z0, z1 - dR, -1, pick(0));
  arch(x0 + 0.5, z0 + dR, z1, 1, pick(3));
  for (const a of arches) f.solids.push(...gantrySolids(a));
  // A food truck parked along the north side, by the opening (solid,
  // wrecks and blows up like any parked vehicle).
  f.vehicles.push({ kind: "iceTruck", x: x1 - 3.2, z: z0 + 1.8, y: Y, ry: Math.PI / 2 });
  // Dining: table clusters over the open middle, clear of the buildings,
  // the posts and each other.
  const spots = [];
  for (let u = x0 + 3; u <= x1 - 3; u += 3.6)
    for (let v = z0 + 3; v <= z1 - 3; v += 3.6) {
      const inR = buildings.some((r) => Math.abs(u - r.x) < r.w / 2 + 1.6 && Math.abs(v - r.z) < r.d / 2 + 1.6);
      const nearTruck = Math.abs(u - (x1 - 3.2)) < 4 && Math.abs(v - (z0 + 1.8)) < 2.6;
      if (!inR && !nearTruck && R() < 0.85) spots.push([u + (R() - 0.5), v + (R() - 0.5)]);
    }
  f.flyers.push(...cafeClusters({ at: (u, v) => ({ x: u, z: v }) }, Math.floor(R() * 50), spots, Y));
  // Menu boards and pole signs along the restaurants' fronts; pots.
  for (const [k, r] of buildings.entries()) {
    const fz = k ? -1 : 1; // front faces the plaza (south for NW, north for SE)
    const zf = r.z + fz * (r.d / 2 + 0.9);
    for (let i = 0; i < 3; i++) fly("sandwichBoard", r.x - r.w / 2 + 1.2 + i * (r.w - 2.4) / 2, zf, k ? Math.PI : 0, { color: COLORS[(i + k * 3) % 8] });
    fly("poleSign", r.x + (k ? -1 : 1) * (r.w / 2 + 1.4), r.z, 0.3, { color: COLORS[(k * 5 + 2) % 8] });
    fly("flowerPot", r.x - r.w / 2 + 0.6, zf + fz * 0.9, 0);
    fly("flowerPot", r.x + r.w / 2 - 0.6, zf + fz * 0.9, 1);
    fly("displayRack", r.x + r.w / 2 - 1.2, zf + fz * 0.4, k ? Math.PI : 0);
  }
  fly("poleSign", cx + (R() - 0.5) * 4, z0 + 1.0, 1.2, { color: COLORS[Math.floor(R() * 8)] });
  fly("poleSign", cx + (R() - 0.5) * 4, z1 - 1.0, -0.4, { color: COLORS[Math.floor(R() * 8)] });
  // Pole signs at the plaza's open corners too (a forest of menus).
  for (const [x, z] of [[x1 - 1.2, z1 - dR - 1.4], [x0 + 1.2, z0 + dR + 1.4], [cx + 3, cz - 3], [cx - 3, cz + 3]]) fly("poleSign", x, z, R() * 6.28, { color: COLORS[Math.floor(R() * 8)] });
  fly("vendorCart", x0 + 2.2, z1 - 2.2, R() * 6.28);
  fly("newsStand", x1 - 1.2, cz + 2, Math.PI / 2);
  // Lamp posts at the plaza's four inner corners, string lights between.
  const lamps = [[x0 + 1.0, cz - 1.5], [x1 - 1.0, cz + 1.5], [cx - 2, z0 + 1.0], [cx + 2, z1 - 1.0]];
  for (const [x, z] of lamps) item("lampPole", x, z, 0);
  f.lights = [[lamps[0], lamps[2]], [lamps[2], lamps[1]], [lamps[1], lamps[3]], [lamps[3], lamps[0]]];
  return { buildings, feature: f, arches };
}

// The plaza's static pieces (baked): coloured paving, painted lines, roof
// billboards on their frames, string lights between the lamp posts.
export function dinerDecor(root, f) {
  const { x0, x1, z0, z1, cx, cz } = f.block;
  const g = G(root, cx, 0, cz);
  const W = x1 - x0, D = z1 - z0;
  // Paving: warm tiles in a checker, a dark band round the edge.
  B(g, W, 0.4, D, 0xd8cdb8, 0, 0, 0);
  for (let i = 0; i < Math.floor(W / 2); i++)
    for (let k = 0; k < Math.floor(D / 2); k++)
      if ((i + k) % 2 === 0) B(g, 1.96, 0.012, 1.96, 0xc9a77c, -W / 2 + 1 + i * 2, 0.4, -D / 2 + 1 + k * 2);
  // Roof billboards: a steel frame and a lit board facing the plaza.
  for (const s of f.roofSigns) {
    const p = G(root, s.x, s.y, s.z, s.ry);
    for (const u of [-s.w / 2 + 0.4, s.w / 2 - 0.4]) B(p, 0.15, 1.2, 0.15, 0x55535c, u, 0, 0);
    B(p, s.w, 1.6, 0.2, 0x232227, 0, 1.1, 0);
    signBoard(p, s.name[0], s.w - 0.3, 1.3, 0, 2.55, 0.12, 0, s.name[1], s.name[2]);
  }
  // String lights: bulbs hanging between the lamp heads.
  const bulbs = [0xffe14a, 0xff4f6a, 0x7fd0ff, 0x9cff6a, 0xffffff];
  f.lights.forEach(([a, b2], k) => {
    const n = Math.max(6, Math.round(Math.hypot(b2[0] - a[0], b2[1] - a[1]) / 1.1));
    for (let i = 1; i < n; i++) {
      const t = i / n, sag = Math.sin(t * Math.PI) * 0.7;
      ico(root, 0.09, bulbs[(i + k) % bulbs.length], a[0] + (b2[0] - a[0]) * t, Y + 5.3 - sag, a[1] + (b2[1] - a[1]) * t);
    }
  });
  return root;
}
