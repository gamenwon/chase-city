// Small urban amusement park (casual pass): a Ferris wheel, a carousel, a
// giant dinosaur, ticket booths, a balloon cart, food stalls and flags,
// all lit up at night. Four entrances (a clear cross of lanes through the
// middle), one attraction in each quarter.
//
// Destruction (bigprops.js): hit a wheel support hard (or blast it) and
// the wheel comes off its axle and rolls away down the street, gondolas
// flying; the carousel's canopy and horses fly off; balloons float away;
// booths and stalls break (furniture / props systems); the dinosaur leans,
// cracks and breaks into its big pieces. Nothing left behind is solid
// except the wheel's feet, the carousel pole and the dinosaur's stump.
import { B, G, cyl } from "./parts.js";
import * as THREE from "three";

const SIDEWALK = 2.4;
const Y = 0.05;

export function funparkPlan(b, R) {
  const x0 = b.kx0 + SIDEWALK, x1 = b.kx1 - SIDEWALK, z0 = b.kz0 + SIDEWALK, z1 = b.kz1 - SIDEWALK;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = W >= D;
  const L = alongX ? W : D, S = alongX ? D : W;
  const at = (u, v) => (alongX ? { x: cx + u, z: cz + v } : { x: cx + v, z: cz + u });
  const ry = alongX ? 0 : Math.PI / 2;
  const f = { kind: "funpark", block: { x0, x1, z0, z1, cx, cz, alongX, L, S }, items: [], flyers: [], vehicles: [], solids: [], wheel: null, carousel: null, landmark: null, balloons: [] };
  const LANE = 3.4;
  // Quarter centres.
  const qu = (L / 2 + LANE) / 2, qv = (S / 2 + LANE) / 2;
  // Ferris wheel in the far quarter (it is tall: behind, it hides nothing),
  // its plane along u (rolls along the block when it comes off).
  // (It may overhang the pavement; never the lanes.)
  const wR = Math.max(4.2, Math.min(6.0, L / 2 + 1.8 - qu, qu - LANE - 0.2 + 2.5));
  const wc = at(-qu, -qv);
  f.wheel = { ...wc, ry, R: wR, hub: wR + 2.1, axle: alongX ? { x: 0, z: 1 } : { x: 1, z: 0 } };
  for (const s of [-1, 1]) {
    const p = at(-qu, -qv + s * 1.4);
    f.solids.push({ x: p.x, z: p.z, w: 0.9, d: 0.9, kind: "wheelFoot" });
  }
  // Carousel in the opposite far quarter.
  const cc = at(qu, -qv);
  const cR = Math.max(2.4, Math.min(3.4, Math.min(L / 2 - LANE, S / 2 - LANE) / 2 - 0.3));
  f.carousel = { ...cc, R: cR };
  f.solids.push({ x: cc.x, z: cc.z, w: 0.8, d: 0.8, kind: "carouselPole" });
  // Dinosaur in a near quarter (seen from the chase camera).
  const dc = at(qu, qv);
  f.landmark = { kind: "dino", ...dc, y: Y, ry: ry - Math.PI / 4 };
  f.solids.push({ x: dc.x, z: dc.z, w: 2.0, d: 2.0, kind: "plinth" });
  // The last quarter: ticket booths, a balloon cart, food stalls, tables.
  const tq = (u, v) => at(-qu + u, qv + v);
  f.items.push({ kind: "booth", ...tq(-1.6, -1.4), y: Y, ry: ry });
  f.items.push({ kind: "booth", ...tq(1.6, -1.4), y: Y, ry: ry });
  f.items.push({ kind: "stall", ...tq(0, 1.8), y: Y, ry: ry + Math.PI });
  f.flyers.push({ kind: "vendorCart", ...tq(-2.2, 0.6), y: Y, ry: ry + 0.4 });
  f.balloons.push({ ...tq(-2.2, 0.6), n: 12 });
  f.balloons.push({ ...at(LANE + 0.8, LANE + 0.8), n: 8 });
  // Lamps and planters at the lane corners (lit at night), flags on poles.
  for (const su of [-1, 1])
    for (const sv of [-1, 1]) {
      f.items.push({ kind: "lampPole", ...at(su * (LANE + 0.6), sv * (LANE + 0.6)), y: Y, ry: 0 });
      f.flyers.push({ kind: "flowerPot", ...at(su * (L / 2 - 0.8), sv * (LANE + 0.9)), y: Y, ry: 0 });
      f.flyers.push({ kind: "flowerPot", ...at(su * (LANE + 0.9), sv * (S / 2 - 0.8)), y: Y, ry: 0 });
    }
  for (const [u, v] of [[-(L / 2 - 1.2), -(S / 2 - 1.0)], [L / 2 - 1.2, S / 2 - 1.0]]) f.items.push({ kind: "bench", ...at(u, v), y: Y, ry });
  return { feature: f };
}

// Static decor: coloured paving with a pale cross of paths, the wheel's
// A-frame supports, the carousel's platform, flag strings over the lanes.
export function funparkDecor(root, f) {
  const { cx, cz, L, S, alongX } = f.block;
  const g = G(root, cx, 0, cz, alongX ? 0 : Math.PI / 2);
  B(g, L + 0.2, 0.06, S + 0.2, 0xe86a8a, 0, 0.0, 0);
  B(g, L + 0.2, 0.02, 6.8, 0xf4e6c8, 0, 0.06, 0);
  B(g, 6.8, 0.02, S + 0.2, 0xf4e6c8, 0, 0.06, 0);
  for (let i = 0; i < 12; i++) B(g, 0.9, 0.02, 0.9, [0xffd23a, 0x4ae8ff, 0x7aff6a][i % 3], -L / 2 + 1 + ((i * 1.7) % (L - 2)), 0.08, (i % 2 ? 1 : -1) * (S / 2 - 1.2));
  // Flag strings across the lanes (high, over the cars).
  const flags = [0xff3a3a, 0xffd23a, 0x3a8aff, 0x3aff6a, 0xff5fd8];
  for (const [ax, len] of [[0, L], [1, S]]) {
    for (let k = 0; k < Math.floor(len / 1.1); k++) {
      const t = -len / 2 + 0.6 + k * 1.1;
      const sag = 6.2 - 0.6 * Math.cos((t / len) * Math.PI) ** 2;
      const flag = B(g, 0.5, 0.6, 0.04, flags[k % flags.length], ax ? 0.6 : t, sag - 0.6, ax ? t : 0.6);
      flag.rotation.y = ax ? Math.PI / 2 : 0;
    }
  }
  // Wheel supports (an A-frame each side of the axle) and its base.
  const w = f.wheel;
  const wg = G(root, w.x, 0, w.z, w.ry);
  for (const s of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const leg = B(wg, 0.28, w.hub + 0.6, 0.28, 0xffffff, lean * 1.25, 0, s * 1.4);
      leg.rotation.z = -lean * 0.2;
      leg.position.y = 0;
    }
    B(wg, 3.6, 0.3, 0.9, 0x3a3940, 0, 0, s * 1.4);
  }
  cyl(wg, 0.22, 0.22, 3.2, 0xc9ccd3, 0, w.hub - 1.6, 0, 8).rotation.x = Math.PI / 2;
  B(wg, 2.2, 1.2, 1.2, 0xd62f2a, 0, 0, -2.6);
  // Carousel platform.
  const c = f.carousel;
  cyl(root, c.R + 0.3, c.R + 0.4, 0.35, 0xf4e6c8, c.x, 0, c.z, 16);
  cyl(root, c.R, c.R, 0.05, 0xd62f2a, c.x, 0.35, c.z, 16);
}

// The wheel (rim, spokes, light bulbs) in its own frame: the plane x-y,
// centre at the origin, axle along z.
export function wheelGeometryBuild(Rw) {
  return (g) => {
    const n = 16;
    for (const side of [-0.45, 0.45])
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
        const x = Math.cos(a) * Rw, y = Math.sin(a) * Rw, x2 = Math.cos(a2) * Rw, y2 = Math.sin(a2) * Rw;
        const len = Math.hypot(x2 - x, y2 - y);
        const seg = B(g, len + 0.05, 0.22, 0.18, i % 2 ? 0xff5fb8 : 0xffffff, (x + x2) / 2, (y + y2) / 2 - 0.11, side);
        seg.rotation.z = Math.atan2(y2 - y, x2 - x);
        // Bulbs.
        B(g, 0.22, 0.22, 0.22, [0xffd23a, 0x4ae8ff, 0xff5fd8, 0x7aff6a][i % 4], x, y - 0.11, side * 1.25);
      }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sp = B(g, Rw, 0.12, 0.12, 0xe8e4da, (Math.cos(a) * Rw) / 2, (Math.sin(a) * Rw) / 2 - 0.06, 0);
      sp.rotation.z = a;
    }
    cyl(g, 0.55, 0.55, 1.2, 0xd62f2a, 0, -0.6, 0, 10).rotation.x = Math.PI / 2;
  };
}
// A gondola: a little cabin with a roof (tinted per instance).
export function gondolaBuild(g) {
  B(g, 0.06, 0.5, 0.06, 0x3a3940, 0, -0.2, 0);
  B(g, 1.1, 0.75, 0.9, 0xffffff, 0, -0.95, 0);
  B(g, 1.2, 0.12, 1.0, 0xe8e4da, 0, -0.25, 0);
}
// The carousel's turning part: canopy (striped cone), rim, horses on poles.
export function carouselTopBuild(R) {
  return (g) => {
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      const a = (i / stripes) * Math.PI * 2;
      const seg = cyl(g, 0.05, R * Math.sin(Math.PI / stripes) * 1.08, 1.6, i % 2 ? 0xd62f2a : 0xffffff, 0, 0, 0, 3);
      seg.position.set(Math.cos(a) * R * 0.5, 3.6, Math.sin(a) * R * 0.5);
      seg.rotation.set(0, -a, 0);
      seg.lookAt(new THREE.Vector3(0, 4.6, 0));
      seg.rotateX(Math.PI / 2);
    }
    const roof = cyl(g, 0.1, R + 0.3, 1.5, 0xd62f2a, 0, 3.0, 0, 12);
    roof.rotation.y = Math.PI / 12;
    cyl(g, R + 0.3, R + 0.3, 0.35, 0xffd23a, 0, 2.7, 0, 16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      B(g, 0.18, 0.18, 0.18, [0xffd23a, 0xffffff][i % 2], Math.cos(a) * (R + 0.32), 2.8, Math.sin(a) * (R + 0.32));
    }
    B(g, 0.2, 0.3, 0.2, 0xffd23a, 0, 4.5, 0);
  };
}
export function horseBuild(g) {
  B(g, 0.06, 2.3, 0.06, 0xffd23a, 0, 0.4, 0);
  B(g, 0.35, 0.45, 1.1, 0xffffff, 0, 1.0, 0);
  B(g, 0.3, 0.6, 0.35, 0xffffff, 0, 1.3, 0.5);
  B(g, 0.32, 0.18, 0.5, 0xff5fb8, 0, 1.45, 0);
  for (const z of [-0.4, 0.4]) for (const x of [-0.12, 0.12]) B(g, 0.1, 0.55, 0.1, 0xffffff, x, 0.5, z);
}
export const DINO_PARTS = {
  base: (g) => {
    B(g, 2.0, 0.4, 2.0, 0x55535c, 0, 0, 0);
    for (const s of [-0.55, 0.55]) {
      B(g, 0.7, 2.2, 1.0, 0x3f9a3a, s, 0.4, 0);
      B(g, 0.9, 0.3, 1.4, 0x2f7a2a, s, 0.4, 0.2);
    }
  },
  body: (g) => {
    const b = B(g, 2.0, 2.0, 3.4, 0x4fbf3a, 0, -1.0, 0);
    b.rotation.x = -0.25;
    B(g, 1.4, 1.2, 2.6, 0xc8e86a, 0, -1.3, 0.25);
    for (let i = 0; i < 5; i++) B(g, 0.3, 0.5, 0.4, 0xffd23a, 0, 1.0 - i * 0.12, -1.2 + i * 0.6);
    for (const s of [-1, 1]) B(g, 0.2, 0.7, 0.2, 0x3f9a3a, s * 0.8, -0.6, 1.4);
  },
  head: (g) => {
    B(g, 1.0, 2.2, 1.0, 0x4fbf3a, 0, -1.4, 0);
    B(g, 1.4, 1.1, 2.2, 0x4fbf3a, 0, 0.4, 0.5);
    B(g, 1.2, 0.4, 1.8, 0x3f9a3a, 0, 0.0, 0.7);
    for (const s of [-1, 1]) {
      B(g, 0.12, 0.3, 0.3, 0xffffff, s * 0.7, 1.0, 0.9);
      B(g, 0.14, 0.14, 0.14, 0x1a1a1a, s * 0.72, 1.06, 0.95);
    }
    for (let i = 0; i < 5; i++) B(g, 0.1, 0.16, 0.1, 0xffffff, -0.4 + i * 0.2, 0.32, 1.55);
  },
  tail: (g) => {
    for (let i = 0; i < 4; i++) B(g, 1.2 - i * 0.25, 1.2 - i * 0.25, 1.1, 0x4fbf3a, 0, -0.6 + i * 0.12 - i * 0.2, -0.55 - i * 1.0);
  },
};
