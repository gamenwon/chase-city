// Outer-ring sites. The strip of plain pavement between the outermost
// roads (+-95.5) and the city edge (+-108) is cut by the road ends into 24
// segments (19 x 12.5 m) and 4 corners (12.5 x 12.5 m). Every one becomes
// a site with a landmark, its own destruction and an open road side:
//
//   parking (4)       tall P sign; barrier arm, booth, CCTV; parked cars
//   construction (4)  excavator, dump truck; scaffolding comes down in
//                     sequence, site fence, pipes, bricks, light tower
//   depot (3)         DEPOT gantry; loading dock, vans, crate stacks that
//                     cascade
//   carwash (3)       bubble sign; drive-through bay with spinning brushes
//                     that burst into foam and water
//   market (3)        MARKET arch; stalls collapse, fruit crates burst
//   cafe (4)          coffee-cup sign; terrace tables, chairs, parasols fly
//   plaza (3)         statue on a plinth, flagpoles, benches, planters
//   corners (4)       billboard tower, benches, planters
//
// Local frame per segment: u along it (-9.5..9.5), v outward (-6.25 at the
// road kerb, +6.25 at the city edge). Solid pieces stand at v >= 2.4 (or
// are small posts), so the road side stays open the whole length.
const hash = (x, z) => {
  let h = Math.imul(Math.round(x * 7) * 73856093 ^ Math.round(z * 7) * 19349663, 0x5bd1e995);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
export const SITE_ORDER = [
  "parking", "carwash", "construction", "market", "cafe", "depot", "plaza", "parking",
  "cafe", "construction", "market", "depot", "carwash", "parking", "plaza", "cafe",
  "construction", "market", "depot", "carwash", "parking", "cafe", "construction", "plaza",
];
const COLORS = [0x2457c5, 0xd62f2a, 0x2fa36b, 0xf5c01a, 0xf0781e, 0x7a3fb8, 0x1f6e6a, 0xe0367a];

function segments() {
  const out = [];
  const EDGE = 101.75;
  for (const c of [-75, -45, -15, 15, 45, 75])
    for (const s of [-1, 1]) {
      out.push({ x: s * EDGE, z: c, along: "z", out: [s, 0] });
      out.push({ x: c, z: s * EDGE, along: "x", out: [0, s] });
    }
  return out;
}

function frame(seg) {
  const ux = seg.along === "x" ? 1 : 0, uz = seg.along === "z" ? 1 : 0;
  const vx = seg.out[0], vz = seg.out[1];
  const ry = Math.atan2(vx, vz);
  const at = (u, v) => ({ x: seg.x + ux * u + vx * v, z: seg.z + uz * u + vz * v });
  return { ux, uz, vx, vz, ry, at };
}

export function sitePlan() {
  const sites = [];
  segments().forEach((seg, i) => {
    const kind = SITE_ORDER[i];
    const f = frame(seg);
    const y = { ...seg, kind, ry: f.ry, items: [], flyers: [], vehicles: [], solids: [], at: f.at, h: hash(seg.x, seg.z) };
    const Y = 0.05;
    const item = (k, u, v, r = 0, extra = {}) => y.items.push({ kind: k, ...f.at(u, v), y: Y, ry: f.ry + r, ...extra });
    const fly = (k, u, v, r = 0, extra = {}) => y.flyers.push({ kind: k, ...f.at(u, v), y: Y, ry: f.ry + r, ...extra });
    const veh = (k, u, v, r = 0, extra = {}) => y.vehicles.push({ kind: k, ...f.at(u, v), y: Y, ry: f.ry + r, ...extra });
    const box = (u, v, wu, dv, k) => {
      const c = f.at(u, v);
      const w = seg.along === "x" ? wu : dv, d = seg.along === "x" ? dv : wu;
      y.solids.push({ x: c.x, z: c.z, w, d, kind: k });
    };
    const g = i * 7 + 1; // group ids for cascades
    if (kind === "parking") {
      const pick = ["sedan", "sedan", "van", "pickup", "sedan", "van"];
      for (let b = 0; b < 6; b++) {
        if (b === 5 || hash(b + seg.x, seg.z - b) > 0.85) continue; // bay 5: the booth
        // Nose in, front toward the edge (front is -z: ry + PI faces +v).
        veh(pick[(b + i) % 6], -7.5 + b * 3, 3.3, Math.PI + (hash(b, i) - 0.5) * 0.12, { color: Math.floor(hash(seg.z + b, b) * 9) });
      }
      item("lampPole", -9.0, 5.7);
      item("lampPole", 9.0, 5.7);
      // Entrance from the cross road at u = -9.5: barrier arm across the
      // aisle (snaps off), a CCTV pole by the exit, a booth by the bays.
      fly("gateArm", -8.9, -5.6, -Math.PI / 2);
      fly("cctv", 9.0, -5.8, 0);
      item("booth", 8.6, 1.4, Math.PI / 2);
      item("cone", -2.0, -0.6);
      item("cone", 4.0, -0.6);
    } else if (kind === "construction") {
      box(-5.0, 4.7, 7.0, 2.8, "foundation");
      box(5.6, 4.8, 5.0, 2.4, "cabin");
      veh("excavator", -6.2, 0.3, Math.PI / 2 + 0.3);
      veh("dumpTruck", 3.2, 0.9, -Math.PI / 2);
      // Scaffold bays in front of the foundation: they come down in turn.
      for (let k = 0; k < 3; k++) fly("scaffold", -7.4 + k * 2.45, 2.4, 0, { group: g, level: k });
      fly("pipe", 0.6, 3.5, Math.PI / 2);
      fly("pipe", 0.6, 5.0, Math.PI / 2);
      fly("bricks", 7.6, 2.7, 0.2);
      fly("lightTower", 9.0, 4.6, 0);
      // Site fence along the road side with a wide gap in the middle.
      for (const u of [-9.5, -7.1, 4.7, 7.1]) fly("siteFence", u + 1.2, -5.7, 0);
      item("cone", -4.2, -5.0);
      item("cone", 4.2, -5.0);
      item("barrier", 0, -2.6, 0);
    } else if (kind === "depot") {
      box(-2.0, 4.8, 13.0, 2.8, "dock");
      box(6.6, 5.9, 0.4, 0.4, "post");
      box(9.2, 5.9, 0.4, 0.4, "post");
      veh("van", -6.4, 0.6, Math.PI, { color: 1 });
      veh("van", -1.4, 0.6, Math.PI, { color: 4 });
      // Cargo stacks (4 high, 3 high): hit one, the stack comes down.
      [[3.4, 1.6, 4], [5.6, 1.6, 3]].forEach(([u, v, n], s) => {
        for (let l = 0; l < n; l++) fly("cargo", u, v, (hash(l, s) - 0.5) * 0.2, { y: Y + l * 0.9, group: g + s, level: l, color: COLORS[(l + s * 3 + i) % 8] });
      });
      item("pallet", 8.2, 1.4, 0.3);
      item("pallet", 8.4, 3.0, -0.2);
      item("cone", -9.0, -5.0);
      item("cone", 9.0, -5.0);
    } else if (kind === "carwash") {
      for (const [u, v] of [[-6, -0.4], [6, -0.4], [-6, 4.4], [6, 4.4]]) box(u, v, 0.4, 0.4, "column");
      // Spinning brushes on both sides of the drive-through lane.
      for (const u of [-2.2, 2.2]) for (const v of [0.55, 3.45]) item("brush", u, v, 0);
      item("cone", -9.0, -5.0);
      item("cone", 9.0, -5.0);
      item("bin", 8.6, 5.7, 0);
    } else if (kind === "market") {
      for (const [u, v] of [[-4.2, -5.6], [4.2, -5.6]]) box(u, v, 0.3, 0.3, "post");
      for (const u of [-6.0, 0, 6.0]) item("stall", u, 4.2, 0);
      const crates = ["crateRed", "crateOrange", "crateGreen"];
      for (let k = 0; k < 9; k++) fly(crates[k % 3], -7.2 + k * 1.8, 2.3 + (k % 2) * 0.25, (hash(k, i) - 0.5) * 0.5);
      for (const u of [-3.0, 3.0]) {
        fly("table", u, 0.0, 0);
        fly("parasol", u + 0.9, 0.6, 0, { color: COLORS[(i + (u > 0 ? 3 : 0)) % 8] });
      }
    } else if (kind === "cafe") {
      box(0, 4.8, 6.0, 2.6, "cafe");
      y.flyers.push(...cafeClusters(f, i, [[-6.4, 0.6], [-1.6, -0.6], [3.4, 0.4], [7.2, 1.6]], Y));
      item("planter", -8.6, 3.6, Math.PI / 2);
      item("planter", 8.6, 3.8, Math.PI / 2);
    } else {
      box(0, 3.6, 1.4, 1.4, "plinth");
      item("statue", 0, 3.6, Math.PI);
      for (const u of [-6.5, -4.5, 4.5, 6.5]) item("flagpole", u, 5.4, 0, { color: COLORS[(Math.abs(Math.round(u)) + i) % 8] });
      item("bench", -3.2, 0.6, 0);
      item("bench", 3.2, 0.6, 0);
      item("planter", -7.4, 1.6, 0);
      item("planter", 7.4, 1.6, 0);
    }
    sites.push(y);
  });
  // Corners: a billboard tower on two legs (solid), benches, planters.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 101.75, z = sz * 101.75;
      const ry = Math.atan2(sx, sz) + Math.PI; // board faces the city
      const y = { x, z, kind: "corner", ry, items: [], flyers: [], vehicles: [], solids: [], at: (u, v) => ({ x: x + u, z: z + v }) };
      // Billboard legs on the outer corner, across the diagonal.
      y.legs = [[x + sx * 4.2, z + sz * 1.6], [x + sx * 1.6, z + sz * 4.2]];
      for (const [lx, lz] of y.legs) y.solids.push({ x: lx, z: lz, w: 0.6, d: 0.6, kind: "post" });
      y.items.push({ kind: "bench", x: x - sx * 3.0, z: z + sz * 1.2, y: 0.05, ry: Math.atan2(sx, 0) });
      y.items.push({ kind: "planter", x: x + sx * 1.2, z: z - sz * 3.4, y: 0.05, ry: Math.PI / 2 });
      y.flyers.push(...cafeClusters({ at: (u, v) => ({ x: x - sx * 2.6 + u, z: z - sz * 2.6 + v }) }, 31 + sx + sz * 2, [[0, 0]], 0.05));
      sites.push(y);
    }
  return sites;
}

// Café seating: a table with 2-4 chairs round it at uneven angles, often
// a parasol. `spots` are [u, v] in the site frame.
export function cafeClusters(f, seed, spots, Y) {
  const out = [];
  spots.forEach(([u, v], k) => {
    const c = f.at(u, v);
    const r = (n) => hash(seed * 13 + k * 7 + n, seed + n * 3);
    out.push({ kind: "table", x: c.x, z: c.z, y: Y, ry: r(1) * 6.28 });
    const n = 2 + Math.floor(r(2) * 3);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + r(3 + j) * 0.7;
      const d = 0.78 + r(9 + j) * 0.12;
      out.push({ kind: "chair", x: c.x + Math.sin(a) * d, z: c.z + Math.cos(a) * d, y: Y, ry: a + (r(20 + j) - 0.5) * 0.5, color: COLORS[(seed + k + j) % 8] });
    }
    if (r(4) > 0.35) out.push({ kind: "parasol", x: c.x + 0.05, z: c.z + 0.05, y: Y + 0.0, ry: r(5) * 6.28, color: COLORS[(seed * 3 + k) % 8], noHitWithTable: true });
  });
  return out;
}
