// Casual visual pass: giant 3D advertising sculptures for shop roofs
// (burger, donut, pizza slice, coffee cup, ice-cream cone, hot dog, apple,
// the fireworks shop's rocket). Chunky low-poly, bright, readable from the
// chase camera. Each is built round its own centre (so it can tumble and
// roll as one piece): `r` its collision radius, `lift` the height of its
// centre when it rests on the ground, `rolls` round enough to roll away
// along the road, `wheel` rolls upright like a wheel (the donut).
// Local frame: +z faces the street, +y up.
import * as THREE from "three";
import { B, G, cyl, add } from "./parts.js";

const seg = (n) => n;
function sphere(p, r, c, x, y, z, sx = 1, sy = 1, sz = 1, ws = 10, hs = 7, phiLen = Math.PI) {
  const m = add(p, new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, phiLen), c, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
function disc(p, r, h, c, x, y, z, n = 14) {
  return cyl(p, r, r, h, c, x, y - h / 2, z, n);
}

function burger(g) {
  // Bun bottom, patty, cheese drips, lettuce, tomato, bun top with seeds.
  disc(g, 1.5, 0.45, 0xd9973c, 0, -0.95, 0);
  disc(g, 1.62, 0.42, 0x5a2e1a, 0, -0.52, 0);
  const cheese = B(g, 2.9, 0.1, 2.9, 0xffc21a, 0, -0.33, 0);
  cheese.rotation.y = Math.PI / 4;
  disc(g, 1.7, 0.14, 0x4fbf3a, 0, -0.18, 0, 12);
  disc(g, 1.45, 0.16, 0xe8402a, 0, -0.04, 0);
  sphere(g, 1.55, 0xe0a24a, 0, 0.02, 0, 1, 0.72, 1, 14, 8, Math.PI / 2);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39, rr = 0.35 + (i % 4) * 0.27;
    const s = B(g, 0.16, 0.06, 0.08, 0xfff4d6, Math.cos(a) * rr, 0.0 + Math.sqrt(Math.max(0, 1 - (rr / 1.55) ** 2)) * 1.1, Math.sin(a) * rr, a);
    s.rotation.x = 0.3;
  }
}
function donut(g) {
  // Standing upright (its hole facing the street): dough, pink icing,
  // sprinkles.
  const ring = new THREE.Group();
  ring.rotation.x = 0; // torus lies in the x-y plane: faces +z already
  g.add(ring);
  add(ring, new THREE.TorusGeometry(1.15, 0.58, 8, 18), 0xe0a65a, 0, 0, 0);
  const icing = add(ring, new THREE.TorusGeometry(1.15, 0.6, 8, 18, Math.PI * 2), 0xff6fb4, 0, 0, 0.12);
  icing.scale.set(1, 1, 0.75);
  const cols = [0xffffff, 0x4ae8ff, 0xffd23a, 0x5cd65a, 0x8a5aff];
  for (let i = 0; i < 26; i++) {
    const a = i * 0.83, rr = 1.15 + Math.sin(i * 1.7) * 0.35;
    const s = B(g, 0.22, 0.07, 0.07, cols[i % cols.length], Math.cos(a) * rr, Math.sin(a) * rr - 0.035, 0.5 + 0.1 * Math.cos(i));
    s.rotation.z = a * 1.7;
  }
}
function pizza(g) {
  // A slice standing on its crust, tip up and tilted to the street.
  const slice = new THREE.Group();
  slice.rotation.x = -0.35;
  g.add(slice);
  const shape = new THREE.Shape();
  shape.moveTo(-1.35, -1.3);
  shape.lineTo(1.35, -1.3);
  shape.lineTo(0, 1.9);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
  geo.translate(0, 0, -0.11);
  add(slice, geo, 0xffc83a, 0, 0, 0);
  const crust = B(slice, 2.9, 0.42, 0.42, 0xc8792a, 0, -1.5, 0);
  crust.rotation.x = 0;
  for (const [x, y] of [[-0.5, -0.6], [0.5, -0.7], [0, 0.1], [-0.15, 0.95], [0.6, -0.15]]) {
    const pep = cyl(slice, 0.26, 0.26, 0.06, 0xc8282a, x, y, 0.12, 10);
    pep.rotation.x = Math.PI / 2;
  }
  for (const [x, y] of [[-0.8, -0.95], [0.2, -0.35], [0.95, -0.95]]) {
    const o = B(slice, 0.2, 0.08, 0.06, 0x3a9a3a, x, y, 0.13);
    o.rotation.z = x;
  }
}
function coffee(g) {
  // A takeaway-style cup on its saucer with a handle and steam.
  disc(g, 1.35, 0.14, 0xf4f1ea, 0, -1.05, 0, 16);
  cyl(g, 1.0, 0.75, 1.9, 0xf4f1ea, 0, -0.98, 0, 14);
  cyl(g, 1.02, 1.0, 0.36, 0xd62f2a, 0, -0.2, 0, 14);
  disc(g, 0.92, 0.06, 0x5a3420, 0, 0.9, 0, 14);
  const handle = add(g, new THREE.TorusGeometry(0.42, 0.13, 6, 10, Math.PI * 1.2), 0xf4f1ea, 0.98, -0.05, 0);
  handle.rotation.z = -Math.PI * 0.6;
  for (const [x, h] of [[-0.3, 0.7], [0.25, 0.9]]) {
    const s = cyl(g, 0.12, 0.18, h, 0xffffff, x, 1.0, 0, 6);
    s.rotation.z = x * 0.4;
  }
}
function icecream(g) {
  // A waffle cone with two scoops and a cherry.
  const cone = cyl(g, 0.78, 0.08, 2.0, 0xd9973c, 0, -1.6, 0, 10);
  cone.rotation.y = 0.3;
  for (let i = 0; i < 4; i++) B(g, 1.3 - i * 0.28, 0.05, 0.05, 0xb5742a, 0, -0.95 - i * 0.42, 0.56 - i * 0.11);
  sphere(g, 0.82, 0x7affd8, 0, 0.45, 0, 1, 0.9, 1, 10, 8);
  sphere(g, 0.72, 0xff8ac8, 0.05, 1.3, 0.05, 1, 0.9, 1, 10, 8);
  sphere(g, 0.2, 0xd8202c, 0.1, 2.0, 0.1, 1, 1, 1, 6, 5);
  B(g, 0.04, 0.3, 0.04, 0x3a7a2a, 0.15, 2.12, 0.1);
}
function hotdog(g) {
  // Bun, sausage, mustard zigzag, lying along x.
  for (const s of [-1, 1]) {
    const bun = cyl(g, 0.55, 0.55, 3.2, 0xe0a24a, 0, -1.6, s * 0.38, 10);
    bun.rotation.z = Math.PI / 2;
    bun.position.set(0, -0.15, s * 0.38);
  }
  const saus = cyl(g, 0.42, 0.42, 3.8, 0xb8402a, 0, -1.9, 0, 10);
  saus.rotation.z = Math.PI / 2;
  saus.position.set(0, 0.2, 0);
  for (const s of [-1, 1]) sphere(g, 0.42, 0xb8402a, s * 1.9, 0.2, 0, 1, 1, 1, 8, 6);
  for (let i = 0; i < 9; i++) {
    const m = B(g, 0.46, 0.08, 0.12, 0xffd21a, -1.6 + i * 0.4, 0.58, 0);
    m.rotation.y = i % 2 ? 0.7 : -0.7;
  }
}
function apple(g) {
  sphere(g, 1.25, 0xe02a2a, 0, 0, 0, 1, 0.92, 1, 12, 9);
  sphere(g, 0.5, 0xff6a5a, -0.55, 0.45, 0.85, 1, 0.7, 0.5, 6, 5);
  cyl(g, 0.07, 0.09, 0.6, 0x5a3a24, 0, 1.0, 0, 6);
  const leaf = B(g, 0.7, 0.05, 0.32, 0x4fbf3a, 0.35, 1.35, 0);
  leaf.rotation.z = 0.5;
}
function rocket(g) {
  // The fireworks shop's rocket on its launch frame (red and gold).
  cyl(g, 0.55, 0.55, 2.8, 0xd62f2a, 0, -1.3, 0, 10);
  for (let i = 0; i < 3; i++) cyl(g, 0.57, 0.57, 0.18, 0xffd23a, 0, -1.0 + i * 0.9, 0, 10);
  cyl(g, 0.02, 0.55, 1.2, 0xffd23a, 0, 1.5, 0, 10);
  for (let i = 0; i < 4; i++) {
    const f = B(g, 0.08, 0.9, 0.7, 0x2457c5, 0, -1.6, 0, (i * Math.PI) / 2);
    f.position.set(Math.sin((i * Math.PI) / 2) * 0.55, -1.15, Math.cos((i * Math.PI) / 2) * 0.55);
  }
  const star = B(g, 0.6, 0.6, 0.05, 0xffffff, 0, 0.05, 0.57);
  star.rotation.z = Math.PI / 4;
}

// r: radius, lift: centre height lying/resting, mount: centre height
// above the pedestal top, mass (as a car = 1), roll behaviour. Modelled
// at about 3 m and drawn SCALE times that (big enough to read from the
// chase camera, as in the art references).
export const SCALE = 1.65;
const RAW = {
  burger: { build: burger, r: 1.6, mount: 1.15, lift: 1.1, mass: 1.4, rolls: true, wheel: false },
  donut: { build: donut, r: 1.75, mount: 1.8, lift: 0.6, mass: 1.0, rolls: true, wheel: true },
  pizza: { build: pizza, r: 1.7, mount: 1.6, lift: 0.3, mass: 0.9, rolls: false },
  coffee: { build: coffee, r: 1.3, mount: 1.2, lift: 1.0, mass: 1.0, rolls: true, wheel: false },
  icecream: { build: icecream, r: 1.2, mount: 2.65, lift: 0.8, mass: 0.8, rolls: true, wheel: false },
  hotdog: { build: hotdog, r: 1.9, mount: 0.8, lift: 0.6, mass: 1.0, rolls: true, wheel: false },
  apple: { build: apple, r: 1.3, mount: 1.25, lift: 1.15, mass: 1.1, rolls: true, wheel: false },
  rocket: { build: rocket, r: 1.0, mount: 2.7, lift: 0.6, mass: 0.7, rolls: true, wheel: false },
};
export const SCULPTURES = Object.fromEntries(
  Object.entries(RAW).map(([k, d]) => [
    k,
    {
      ...d,
      build: (g) => {
        const inner = new THREE.Group();
        inner.scale.setScalar(SCALE);
        g.add(inner);
        d.build(inner);
      },
      r: d.r * SCALE,
      mount: d.mount * SCALE,
      lift: d.lift * SCALE,
      mass: d.mass * 1.6,
    },
  ]),
);
void seg;
void G;
