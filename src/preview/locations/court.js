// Basketball court: grass surround, fenced court (chain-link panels with
// gates north and south), walkways from both gates to the pavement, two
// hoops, team benches, a ball rack, trees and bins. Fence panels, hoops,
// benches and bins break when a car hits them; balls scatter.
import * as THREE from "three";
import { C, B, G, cyl, bake, tree, octRing } from "./parts.js";
import { COURT } from "./layout.js";

const TOP = 0.4;
export const FENCE = { hx: 8.4, hz: 6.0, gateX: -3.0, gate: 2.4 };
const L = 15, W = 10; // court length (x) and width (z)

// Fence panel: origin at its left post base, runs along +x for `len`.
export function fencePanel(g, len = 2.4) {
  const h = 3.0;
  B(g, 0.1, h, 0.1, C.fence, 0, 0, 0);
  for (const y of [0.08, 1.5, h - 0.06]) B(g, len, 0.06, 0.06, C.fence, len / 2, y, 0);
  const n = Math.max(6, Math.round(len / 0.22));
  for (let i = 1; i < n; i++) B(g, 0.025, h - 0.14, 0.02, C.wire, (i * len) / n, 0.08, 0);
  for (let j = 1; j < 8; j++) B(g, len, 0.02, 0.02, C.wire, len / 2, 0.08 + (j * (h - 0.14)) / 8, 0);
}
// Hoop: origin at the post base; faces -x (the rim is toward -x).
export function hoop(g) {
  B(g, 0.6, 0.06, 0.6, C.dark, 0, 0, 0);
  B(g, 0.2, 3.5, 0.2, C.blue, 0, 0.06, 0);
  B(g, 0.9, 0.14, 0.14, C.blue, -0.4, 3.3, 0);
  const brace = B(g, 0.08, 0.9, 0.08, C.blue, -0.32, 2.55, 0);
  brace.rotation.z = 0.6;
  B(g, 0.06, 1.1, 1.8, C.white, -0.85, 2.75, 0);
  B(g, 0.07, 0.45, 0.6, C.red, -0.86, 2.9, 0); // target square
  B(g, 0.05, 0.4, 0.52, C.white, -0.875, 2.94, 0);
  // Rim (8 short bars round an octagon) and a net of tapering cords.
  const r = 0.24, cx = -1.12, y = 3.05;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    B(g, 0.2, 0.04, 0.04, C.courtKey, cx + Math.cos(a) * r, y, Math.sin(a) * r, -a + Math.PI / 2);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const cord = B(g, 0.02, 0.45, 0.02, C.white, cx + Math.cos(a) * r * 0.82, y - 0.45, Math.sin(a) * r * 0.82);
    cord.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
  }
}
function line(g, w, d, x, z) {
  B(g, w, 0.008, d, C.white, x, TOP + 0.03, z);
}
function arc(g, cx, r, from, to, side) {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = from + ((i + 0.5) * (to - from)) / n;
    const seg = (r * (to - from)) / n + 0.02;
    B(g, 0.08, 0.008, seg, C.white, cx + side * Math.cos(a) * r, TOP + 0.03, Math.sin(a) * r, -side * a);
  }
}

export function buildCourt(scene) {
  const root = new THREE.Group();
  root.position.set(COURT.x, 0, COURT.z);
  scene.add(root);
  const s = new THREE.Group();
  // Grass surround with mowing stripes; apron and court surface inside
  // the fence.
  B(s, 18.4, 0.1, 18.4, C.grass, 0, 0.3, 0);
  for (const z of [-8.2, 8.2]) B(s, 18.4, 0.006, 1.6, C.grassStripe, 0, TOP, z);
  B(s, 2 * FENCE.hx, 0.012, 2 * FENCE.hz, C.courtEdge, 0, TOP, 0);
  B(s, L, 0.02, W, C.court, 0, TOP + 0.01, 0);
  // Keys (painted lanes), lines, centre circle, three-point arcs.
  for (const side of [-1, 1]) {
    B(s, 4.2, 0.006, 3.6, C.courtKey, side * (L / 2 - 2.1), TOP + 0.03, 0);
    arc(s, side * (L / 2 - 4.2), 1.8, -Math.PI / 2, Math.PI / 2, -side);
    arc(s, side * (L / 2 - 1.2), 4.6, -Math.PI / 2 + 0.25, Math.PI / 2 - 0.25, -side);
    for (const z of [-1, 1]) line(s, 2.34, 0.08, side * (L / 2 - 1.17), z * 4.46);
  }
  line(s, L, 0.08, 0, -W / 2 + 0.04);
  line(s, L, 0.08, 0, W / 2 - 0.04);
  line(s, 0.08, W, -L / 2 + 0.04, 0);
  line(s, 0.08, W, L / 2 - 0.04, 0);
  line(s, 0.08, W, 0, 0);
  arc(s, 0, 1.6, -Math.PI / 2, Math.PI / 2, 1);
  arc(s, 0, 1.6, -Math.PI / 2, Math.PI / 2, -1);
  // Walkways from both gates to the pavement (paving + edging).
  const gx = FENCE.gateX;
  for (const sz of [-1, 1]) {
    const z0 = sz * FENCE.hz, z1 = sz * 9.2;
    const len = Math.abs(z1 - z0), mid = (z0 + z1) / 2;
    B(s, FENCE.gate, 0.03, len, C.pave, gx, TOP, mid);
    for (const ex of [-1, 1]) B(s, 0.15, 0.06, len, C.paveEdge, gx + ex * (FENCE.gate / 2 + 0.075), TOP, mid);
    // Gate frame: two taller posts and a header bar.
    for (const ex of [-1, 1]) B(s, 0.16, 3.4, 0.16, C.fence, gx + ex * (FENCE.gate / 2 + 0.08), TOP, z0);
    B(s, FENCE.gate + 0.32, 0.12, 0.12, C.fence, gx, TOP + 3.3, z0);
  }
  // Corner posts (the panels carry their own left posts).
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(s, 0.14, 3.1, 0.14, C.fence, x * FENCE.hx, TOP, z * FENCE.hz);
  // Ball rack (inside, north-east).
  const rack = G(s, 5.8, TOP, -5.45);
  for (const x of [-0.6, 0.6]) B(rack, 0.06, 0.8, 0.5, C.metal, x, 0, 0);
  for (const z of [-0.18, 0.18]) B(rack, 1.3, 0.05, 0.05, C.metal, 0, 0.62, z);
  // Trees outside the fence (solid in the layout).
  [[-7.0, -7.5], [4.3, -7.5], [-7.0, 7.5], [4.3, 7.5]].forEach(([x, z], k) => tree(G(s, x, TOP, z, k), k, 0.9));
  root.add(bake(s));

  // Breakables (positions in world space, for runtime.js).
  const w = (x, z) => ({ x: COURT.x + x, z: COURT.z + z });
  const panels = [];
  const run = (x0, x1, z, along) => {
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 2.5));
    const len = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * len;
      if (along === "x") panels.push({ ...w(a, z), ry: 0, len, cx: COURT.x + a + len / 2, cz: COURT.z + z });
      else panels.push({ ...w(z, a), ry: -Math.PI / 2, len, cx: COURT.x + z, cz: COURT.z + a + len / 2 });
    }
  };
  for (const sz of [-1, 1]) {
    run(-FENCE.hx, gx - FENCE.gate / 2, sz * FENCE.hz, "x");
    run(gx + FENCE.gate / 2, FENCE.hx, sz * FENCE.hz, "x");
  }
  for (const sx of [-1, 1]) run(-FENCE.hz, FENCE.hz, sx * FENCE.hx, "z");
  // Panels along z: rotated -90 deg so local +x runs along world +z.
  const hoops = [-1, 1].map((side) => ({ ...w(side * (L / 2 + 0.45), 0), ry: side > 0 ? 0 : Math.PI }));
  const benches = [-6.3, 0.9].map((x) => ({ ...w(x, -5.45), ry: Math.PI }));
  const bins = [{ ...w(gx + 2.3, 6.9), ry: 0 }, { ...w(gx + 2.3, -6.9), ry: 0 }];
  const balls = [
    [5.5, -5.25], [5.85, -5.25], [6.2, -5.25], // on the rack
    [-1.2, 1.4], [3.8, -2.2], [-5.0, 2.6],
  ].map(([x, z], i) => ({ ...w(x, z), y: i < 3 ? TOP + 0.79 : TOP + 0.15 }));
  return { root, panels, hoops, benches, bins, balls };
}
