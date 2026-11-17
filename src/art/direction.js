// CHASE CITY art-direction preview (for approval only).
// A standalone page (art-direction.html): the game does not load this file
// and none of the game's assets are changed. It shows the proposed style on
// one player car, one police car, a small city block and the destructible
// street furniture, each before and after destruction.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ------------------------------------------------------------- palette --
// Taken from the three references (see docs/art-direction-v2.md).
export const PALETTE = {
  sky: 0xcde0ff,
  asphalt: 0x8f7a91, // dusty lavender road
  marking: 0xf6ead6,
  sidewalk: 0xe6bcb2, // blush tiles
  curb: 0xf2d9cf,
  grass: 0xa9b65e,
  grassDark: 0x8f9e47,
  path: 0xeebb8b,
  soil: 0x8f6a42,
  sand: 0xd8b27f,
  water: 0x8ec2c2,
  leaf: [0x7fa543, 0x5f8a3a, 0xa8bf5e],
  trunk: 0x8a5f3c,
  cream: 0xf3ecdf,
  peach: 0xeebb8b,
  salmon: 0xd98f7c,
  brick: 0xb8665a,
  pink: 0xe6aab6,
  mint: 0xabc9c0,
  skyBlue: 0xacdde8,
  coral: 0xde7170,
  teal: 0x4fa9a4,
  roofBrown: 0x845a58,
  red: 0xdb4746,
  yellow: 0xfac27a,
  navy: 0x2f3a63,
  charcoal: 0x3d383a,
  glass: 0x7fa6c9,
  white: 0xfbf7f0,
  player: 0xf7894a, // tangerine getaway car
  playerStripe: 0xfff1dc,
  metal: 0x5a5466,
};
const P = PALETTE;

// ------------------------------------------------------------- helpers --
const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key))
    mats.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }),
    );
  return mats.get(key);
}
function mesh(parent, geo, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const rbox = (p, w, h, d, r, c, x, y, z, o) =>
  mesh(p, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), c, x, y, z, o);
const box = (p, w, h, d, c, x, y, z, o) =>
  mesh(p, new THREE.BoxGeometry(w, h, d), c, x, y, z, o);
const cyl = (p, rt, rb, h, c, x, y, z, seg = 16, o) =>
  mesh(p, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, o);
const ball = (p, r, c, x, y, z, o) =>
  mesh(p, new THREE.SphereGeometry(r, 18, 12), c, x, y, z, o);
const group = (parent, x = 0, y = 0, z = 0, ry = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
};
// A flat label/sign texture (Latin text only: canvas fonts vary by device).
function signTexture(text, bg, fg, w = 512, h = 128, font = "bold 78px sans-serif") {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, 28);
  g.fill();
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function sign(parent, text, w, h, x, y, z, bg = "#ffffff", fg = "#2f3a63") {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: signTexture(text, bg, fg), roughness: 0.7 }),
  );
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ------------------------------------------------------------ vehicles --
// Proportions: chunky toy cars, about 3.4 m long, 2 m wide, 1.9 m tall
// (fits the game's 2.1 x 3.6 m collision box); wheels a quarter of the
// length across; cabin over half the length with big windows.
function wheel(p, x, z, r = 0.44) {
  const w = cyl(p, r, r, 0.38, P.charcoal, x, r, z, 18);
  w.rotation.z = Math.PI / 2;
  const hub = cyl(p, r * 0.48, r * 0.48, 0.4, P.white, x, r, z, 14);
  hub.rotation.z = Math.PI / 2;
  return w;
}
function headlights(p, z, color = 0xfff4c2, y = 0.92) {
  for (const x of [-0.6, 0.6]) {
    const l = cyl(p, 0.17, 0.17, 0.1, color, x, y, z, 16, { emissive: 0xffe9a3, emissiveIntensity: 0.35 });
    l.rotation.x = Math.PI / 2;
  }
}
export function playerCar() {
  const g = new THREE.Group();
  rbox(g, 1.95, 0.8, 3.4, 0.32, P.player, 0, 0.88, 0);
  // Cabin: tall and rounded, set slightly back, with a cream racing stripe.
  rbox(g, 1.72, 0.86, 1.85, 0.3, P.player, 0, 1.68, 0.2);
  rbox(g, 0.5, 0.08, 3.42, 0.04, P.playerStripe, 0, 1.29, 0);
  rbox(g, 0.5, 0.06, 1.86, 0.03, P.playerStripe, 0, 2.12, 0.2);
  // Windows.
  rbox(g, 1.5, 0.52, 0.06, 0.04, P.glass, 0, 1.72, -0.74, { roughness: 0.25 });
  rbox(g, 1.5, 0.48, 0.06, 0.04, P.glass, 0, 1.72, 1.14, { roughness: 0.25 });
  for (const x of [-0.87, 0.87])
    rbox(g, 0.06, 0.48, 1.4, 0.04, P.glass, x, 1.72, 0.2, { roughness: 0.25 });
  // Bumpers, lights, little rear spoiler (the getaway car's silhouette cue).
  rbox(g, 2.0, 0.26, 0.3, 0.12, P.playerStripe, 0, 0.56, -1.7);
  rbox(g, 2.0, 0.26, 0.3, 0.12, P.playerStripe, 0, 0.56, 1.7);
  headlights(g, -1.71);
  for (const x of [-0.62, 0.62]) rbox(g, 0.34, 0.16, 0.06, 0.03, P.red, x, 1.02, 1.71);
  rbox(g, 1.6, 0.1, 0.42, 0.05, P.charcoal, 0, 2.22, 1.1);
  for (const x of [-0.65, 0.65]) box(g, 0.08, 0.16, 0.14, P.charcoal, x, 2.12, 1.1);
  for (const x of [-0.98, 0.98]) for (const z of [-1.08, 1.08]) wheel(g, x, z);
  return g;
}
export function policeCar() {
  const g = new THREE.Group();
  // Black hood and trunk, white doors (as in the references), a little
  // bigger and boxier than the player's car.
  rbox(g, 2.05, 0.86, 3.65, 0.3, P.charcoal, 0, 0.92, 0);
  rbox(g, 2.08, 0.62, 1.7, 0.2, P.white, 0, 0.98, 0.1);
  rbox(g, 1.82, 0.88, 1.9, 0.26, P.white, 0, 1.76, 0.15);
  rbox(g, 1.6, 0.52, 0.06, 0.04, P.glass, 0, 1.8, -0.8, { roughness: 0.25 });
  rbox(g, 1.6, 0.48, 0.06, 0.04, P.glass, 0, 1.8, 1.11, { roughness: 0.25 });
  for (const x of [-0.92, 0.92])
    rbox(g, 0.06, 0.48, 1.45, 0.04, P.glass, x, 1.8, 0.15, { roughness: 0.25 });
  // Light bar.
  rbox(g, 1.4, 0.14, 0.5, 0.06, P.white, 0, 2.27, 0.15);
  rbox(g, 0.62, 0.24, 0.42, 0.1, 0xff4a5a, -0.36, 2.44, 0.15, { emissive: 0xff2840, emissiveIntensity: 0.5 });
  rbox(g, 0.62, 0.24, 0.42, 0.1, 0x3d8bff, 0.36, 2.44, 0.15, { emissive: 0x2a6bff, emissiveIntensity: 0.5 });
  // Push bar, star badges, lights.
  rbox(g, 1.7, 0.42, 0.18, 0.08, P.metal, 0, 0.72, -1.95);
  for (const x of [-0.5, 0.5]) box(g, 0.12, 0.3, 0.3, P.metal, x, 0.72, -1.8);
  for (const x of [-1.05, 1.05]) {
    const s = cyl(g, 0.22, 0.22, 0.04, P.yellow, x, 1.02, 0.1, 5);
    s.rotation.z = Math.PI / 2;
  }
  headlights(g, -1.83);
  for (const x of [-0.65, 0.65]) rbox(g, 0.34, 0.16, 0.06, 0.03, P.red, x, 1.06, 1.83);
  for (const x of [-1.04, 1.04]) for (const z of [-1.15, 1.15]) wheel(g, x, z, 0.46);
  return g;
}

// ------------------------------------------------------- street props --
function tree(p, x, z, kind = 0, s = 1) {
  const g = group(p, x, 0, z);
  cyl(g, 0.16 * s, 0.24 * s, 1.6 * s, P.trunk, 0, 0.8 * s, 0, 10);
  const leaf = P.leaf[kind % 3];
  if (kind === 2) {
    // Tall rounded cypress (reference 2).
    const c = ball(g, 1.05 * s, leaf, 0, 2.7 * s, 0);
    c.scale.set(0.85, 1.7, 0.85);
  } else {
    // Puffy cluster (references 1 and 2).
    ball(g, 1.25 * s, leaf, 0, 2.5 * s, 0);
    ball(g, 0.9 * s, leaf, 0.75 * s, 2.1 * s, 0.3 * s);
    ball(g, 0.85 * s, leaf, -0.7 * s, 2.2 * s, -0.25 * s);
    ball(g, 0.75 * s, leaf, 0.1 * s, 3.25 * s, -0.2 * s);
  }
  return g;
}
function bush(p, x, z, s = 0.6, color = P.leaf[1], flowers = false) {
  const b = ball(p, s, color, x, s * 0.75, z);
  b.scale.y = 0.8;
  if (flowers)
    for (let i = 0; i < 5; i++)
      ball(p, 0.11, i % 2 ? 0xf29bb5 : 0xfff1a8, x + Math.cos(i * 1.3) * s * 0.7, s * 1.05, z + Math.sin(i * 1.3) * s * 0.7);
}
function lamp(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  cyl(g, 0.3, 0.36, 0.25, P.metal, 0, 0.12, 0, 12);
  cyl(g, 0.09, 0.11, 3.6, P.metal, 0, 1.9, 0, 10);
  rbox(g, 0.62, 0.16, 0.62, 0.06, P.metal, 0, 3.75, 0);
  rbox(g, 0.46, 0.5, 0.46, 0.1, 0xfff2c4, 0, 3.45, 0, { emissive: 0xffd98a, emissiveIntensity: 0.6 });
  return g;
}
function bin(p, x, z, ry = 0) {
  // Rounded wheelie bin (reference 2), lid in a darker shade.
  const g = group(p, x, 0, z, ry);
  rbox(g, 0.9, 1.15, 0.9, 0.14, 0x6f86d6, 0, 0.62, 0);
  rbox(g, 1.0, 0.14, 1.0, 0.06, 0x4f63b4, 0, 1.25, 0.02);
  for (const s of [-0.32, 0.32]) {
    const w = cyl(g, 0.13, 0.13, 0.1, P.charcoal, s, 0.13, 0.48, 10);
    w.rotation.z = Math.PI / 2;
  }
  return g;
}
function fence(p, x, z, n = 5, ry = 0) {
  const g = group(p, x, 0, z, ry);
  for (let i = 0; i < n; i++) {
    rbox(g, 0.22, 1.1, 0.12, 0.05, P.white, -((n - 1) * 0.5) / 2 + i * 0.5, 0.55, 0);
    const tip = cyl(g, 0, 0.15, 0.2, P.white, -((n - 1) * 0.5) / 2 + i * 0.5, 1.2, 0, 4);
    tip.rotation.y = Math.PI / 4;
  }
  for (const y of [0.35, 0.8]) rbox(g, n * 0.5, 0.12, 0.08, 0.04, P.white, 0, y, -0.08);
  return g;
}
function hydrant(p, x, z) {
  const g = group(p, x, 0, z);
  cyl(g, 0.28, 0.32, 0.9, P.red, 0, 0.45, 0, 14);
  ball(g, 0.28, P.red, 0, 0.92, 0);
  for (const s of [-1, 1]) {
    const n = cyl(g, 0.1, 0.1, 0.22, P.red, s * 0.33, 0.62, 0, 10);
    n.rotation.z = Math.PI / 2;
  }
  cyl(g, 0.36, 0.36, 0.12, P.red, 0, 0.06, 0, 14);
  return g;
}
function cone(p, x, z) {
  const g = group(p, x, 0, z);
  rbox(g, 0.62, 0.08, 0.62, 0.04, 0xe8703c, 0, 0.04, 0);
  cyl(g, 0.06, 0.26, 0.82, 0xe8703c, 0, 0.48, 0, 14);
  cyl(g, 0.15, 0.19, 0.16, P.white, 0, 0.55, 0, 14);
  return g;
}
function barricade(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  for (const s of [-0.9, 0.9]) {
    box(g, 0.1, 1.0, 0.1, P.white, s, 0.5, 0);
    rbox(g, 0.5, 0.08, 0.4, 0.03, P.metal, s, 0.04, 0);
  }
  for (const y of [0.55, 0.9])
    for (let i = 0; i < 4; i++)
      box(g, 0.5, 0.22, 0.08, i % 2 ? P.white : P.red, -0.75 + i * 0.5, y, 0.06);
  return g;
}
function bench(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  for (let i = 0; i < 3; i++) rbox(g, 2.2, 0.08, 0.22, 0.03, 0xc98a55, 0, 0.55, -0.25 + i * 0.25);
  for (let i = 0; i < 2; i++) rbox(g, 2.2, 0.2, 0.08, 0.03, 0xc98a55, 0, 0.85 + i * 0.25, 0.4);
  for (const s of [-0.9, 0.9]) box(g, 0.1, 0.55, 0.7, P.metal, s, 0.3, 0.05);
  return g;
}
function crates(p, x, z) {
  const g = group(p, x, 0, z, 0.3);
  rbox(g, 0.9, 0.7, 0.9, 0.06, 0xd9a066, 0, 0.35, 0);
  rbox(g, 0.8, 0.6, 0.8, 0.06, 0xe2ad75, 0.9, 0.3, 0.2);
  rbox(g, 0.7, 0.55, 0.7, 0.06, 0xd9a066, 0.4, 0.98, 0.1);
  for (const [bx, by, bz] of [[0, 0.71, 0], [0.4, 1.26, 0.1]])
    box(g, 0.94, 0.02, 0.16, 0xc78d52, bx, by, bz);
  return g;
}

// --------------------------------------------------------- buildings --
function windows(p, w, floors, h, z, color = P.skyBlue, frame = P.white, step = 1.6) {
  for (let f = 0; f < floors; f++)
    for (let x = -w / 2 + step / 2 + 0.3; x <= w / 2 - step / 2 - 0.3 + 1e-6; x += step) {
      rbox(p, 1.0, 1.15, 0.14, 0.06, frame, x, 1.0 + f * h + h / 2, z);
      rbox(p, 0.8, 0.95, 0.16, 0.05, color, x, 1.0 + f * h + h / 2, z + 0.02, { roughness: 0.3 });
    }
}
function awning(p, w, y, z, a, b, depth = 1.2) {
  const n = Math.round(w / 0.6);
  for (let i = 0; i < n; i++) {
    const s = box(p, w / n, 0.12, depth, i % 2 ? b : a, -w / 2 + (i + 0.5) * (w / n), y, z + depth / 2 - 0.1);
    s.rotation.x = 0.32;
  }
}
function rooftop(p, w, d, y) {
  rbox(p, 1.2, 0.7, 0.9, 0.08, 0xc9c6cf, -w / 4, y + 0.35, -d / 4);
  box(p, 0.06, 1.2, 0.06, P.metal, w / 3, y + 0.6, d / 4);
  box(p, 0.8, 0.05, 0.05, P.metal, w / 3, y + 1.1, d / 4);
}
function donutShop(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  rbox(g, 7, 4.2, 6, 0.3, P.pink, 0, 2.1, 0);
  rbox(g, 7.4, 0.5, 6.4, 0.2, P.cream, 0, 4.4, 0);
  rbox(g, 3.6, 2.0, 0.16, 0.08, P.skyBlue, -1.2, 1.5, 3.02, { roughness: 0.3 });
  rbox(g, 1.2, 2.3, 0.16, 0.08, 0x9c6b5a, 2.2, 1.15, 3.02);
  awning(g, 7, 2.95, 3.0, 0xf08aa6, P.white);
  sign(g, "DONUTS", 3.4, 0.8, 0, 3.75, 3.05, "#fff7ef", "#d1577c");
  // Giant donut on the roof (reference 3).
  const d = group(g, 0, 6.2, 0.5);
  const dough = mesh(d, new THREE.TorusGeometry(1.25, 0.62, 16, 32), 0xe2a965);
  const icing = mesh(d, new THREE.TorusGeometry(1.25, 0.64, 16, 32, Math.PI * 2), 0xf28fb3);
  icing.scale.set(1, 1, 0.55);
  icing.position.z = 0.2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const s = box(d, 0.28, 0.08, 0.08, [0xfff1a8, 0x8fd7ff, 0xffffff][i % 3], Math.cos(a) * (1.25 + (i % 2 ? 0.25 : -0.2)), Math.sin(a) * (1.25 + (i % 2 ? 0.25 : -0.2)), 0.62);
    s.rotation.z = a * 2;
  }
  dough.castShadow = icing.castShadow = true;
  cyl(g, 0.12, 0.12, 1.4, P.metal, 0, 4.9, 0.5, 8);
  return g;
}
function burgerShop(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  rbox(g, 7, 3.8, 6, 0.3, P.cream, 0, 1.9, 0);
  rbox(g, 7.4, 0.5, 6.4, 0.2, P.red, 0, 4.0, 0);
  rbox(g, 4.2, 1.8, 0.16, 0.08, P.skyBlue, -0.8, 1.45, 3.02, { roughness: 0.3 });
  rbox(g, 1.1, 2.2, 0.16, 0.08, 0x9c6b5a, 2.5, 1.1, 3.02);
  awning(g, 7, 2.75, 3.0, P.yellow, P.white);
  sign(g, "BURGER", 3.4, 0.8, 0, 3.35, 3.05, "#ffe9c2", "#c8473f");
  // Giant burger on the roof.
  const b = group(g, 0.8, 4.25, 0);
  const bottom = cyl(b, 1.5, 1.3, 0.5, P.yellow, 0, 0.25, 0, 24);
  bottom.scale.z = 1;
  cyl(b, 1.6, 1.6, 0.35, 0x7a4a33, 0, 0.65, 0, 24);
  cyl(b, 1.7, 1.7, 0.1, 0x8fcf5a, 0, 0.88, 0, 12);
  box(b, 2.6, 0.08, 2.6, 0xffd24a, 0, 0.95, 0).rotation.y = 0.4;
  const top = ball(b, 1.55, P.yellow, 0, 1.0, 0);
  top.scale.set(1, 0.62, 1);
  for (let i = 0; i < 9; i++) ball(b, 0.07, P.white, Math.cos(i * 2.1) * 0.9, 1.85, Math.sin(i * 2.1) * 0.9);
  // A table with a parasol.
  const t = group(g, -2.4, 0, 4.4);
  cyl(t, 0.6, 0.6, 0.08, P.white, 0, 0.9, 0, 16);
  cyl(t, 0.06, 0.06, 0.9, P.metal, 0, 0.45, 0, 8);
  cyl(t, 0.04, 0.04, 2.2, P.metal, 0, 1.4, 0, 8);
  cyl(t, 0, 1.3, 0.5, P.red, 0, 2.5, 0, 8);
  return g;
}
function policeStation(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  rbox(g, 9, 6.6, 7, 0.3, P.white, 0, 3.3, 0);
  rbox(g, 9.3, 0.5, 7.3, 0.2, 0x4f7fc4, 0, 6.8, 0);
  rbox(g, 9.1, 0.4, 7.1, 0.15, 0x4f7fc4, 0, 3.45, 0);
  windows(g, 9, 2, 2.6, 3.52, P.skyBlue, 0x4f7fc4, 2.0);
  rbox(g, 1.8, 2.4, 0.2, 0.1, 0x4f7fc4, 0, 1.2, 3.55);
  sign(g, "POLICE", 4.2, 0.9, 0, 6.15, 3.68, "#4f7fc4", "#ffffff");
  for (const s of [-1.4, 1.4]) ball(g, 0.25, s < 0 ? 0xff4a5a : 0x3d8bff, s, 2.5, 3.7, { emissive: s < 0 ? 0xff2840 : 0x2a6bff, emissiveIntensity: 0.5 });
  // Helipad.
  cyl(g, 2.4, 2.4, 0.08, 0xd9e7f2, 0, 7.1, 0, 32);
  const h = sign(g, "H", 1.8, 1.8, 0, 7.16, 0, "#d9e7f2", "#4f7fc4");
  h.rotation.x = -Math.PI / 2;
  return g;
}
function brickApartment(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  rbox(g, 6, 9.4, 6.4, 0.25, P.brick, 0, 4.7, 0);
  rbox(g, 6.4, 0.5, 6.8, 0.2, P.cream, 0, 9.55, 0);
  for (let f = 1; f < 3; f++) box(g, 6.05, 0.18, 6.45, 0xd08c75, 0, f * 3.1, 0);
  windows(g, 6, 3, 2.9, 3.22, P.skyBlue, P.cream, 1.9);
  rbox(g, 1.3, 2.3, 0.2, 0.08, P.teal, 0, 1.15, 3.25);
  // Fire-escape ladder on the side (reference 1).
  const l = group(g, 3.15, 0, 1.2);
  for (const s of [-0.4, 0.4]) box(l, 0.08, 8.5, 0.08, P.metal, 0, 4.8, s);
  for (let y = 1; y < 9.2; y += 0.55) box(l, 0.06, 0.06, 0.8, P.metal, 0, y, 0);
  rooftop(g, 6, 6.4, 9.8);
  cyl(g, 0.7, 0.7, 1.2, 0x9fb3c7, 1.6, 10.6, -1.6, 14);
  return g;
}
function house(p, x, z, ry = 0) {
  const g = group(p, x, 0, z, ry);
  rbox(g, 6, 3.6, 5.4, 0.25, P.peach, 0, 1.8, 0);
  // Pitched coral roof (reference 2).
  const roofGeo = new THREE.CylinderGeometry(0.01, 3.7, 2.4, 4, 1);
  const roof = mesh(g, roofGeo, P.coral, 0, 4.75, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 1.02);
  rbox(g, 0.7, 1.6, 0.7, 0.08, P.cream, 1.5, 5.2, -0.8);
  windows(g, 6, 1, 2.4, 2.72, P.skyBlue, P.white, 2.6);
  rbox(g, 1.1, 2.0, 0.16, 0.06, P.teal, 0, 1.0, 2.75);
  rbox(g, 1.6, 0.25, 0.5, 0.1, 0xd9734f, 1.6, 1.15, 2.85);
  bush(g, 1.6, 2.95, 0.3, P.leaf[0], true);
  return g;
}

// ------------------------------------------------------------- terrain --
// A raised city tile: grass top, soil and sand layers on the sides
// (reference 2), sitting on soft water.
function tile(p, w, d, x = 0, z = 0) {
  const g = group(p, x, 0, z);
  rbox(g, w, 1.0, d, 0.45, P.grass, 0, -0.5, 0);
  rbox(g, w - 0.3, 2.0, d - 0.3, 0.4, P.soil, 0, -1.9, 0);
  rbox(g, w - 0.6, 1.0, d - 0.6, 0.35, P.sand, 0, -3.2, 0);
  return g;
}
function cityBlock(root) {
  const g = group(root);
  tile(g, 46, 46);
  // Roads (lavender) with cream markings and zebra crossings.
  rbox(g, 46, 0.14, 8, 0.05, P.asphalt, 0, 0.07, 0);
  rbox(g, 8, 0.15, 46, 0.05, P.asphalt, 0, 0.075, 0);
  for (let k = -21; k <= 21; k += 3) {
    if (Math.abs(k) < 7) continue;
    box(g, 1.5, 0.02, 0.18, P.marking, k, 0.16, 0);
    box(g, 0.18, 0.02, 1.5, P.marking, 0, 0.16, k);
  }
  for (let i = -3; i <= 3; i++) {
    for (const s of [-5.6, 5.6]) {
      box(g, 0.55, 0.02, 1.8, P.marking, i * 1.0, 0.17, s);
      box(g, 1.8, 0.02, 0.55, P.marking, s, 0.17, i * 1.0);
    }
  }
  // Four blocks of blush sidewalk with a pale kerb.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      rbox(g, 18.6, 0.36, 18.6, 0.25, P.curb, sx * 13.3, 0.18, sz * 13.3);
      rbox(g, 18, 0.4, 18, 0.22, P.sidewalk, sx * 13.3, 0.2, sz * 13.3);
    }
  const top = 0.4;
  const on = (x, z) => group(g, x, top, z);
  // NW: donut shop and brick apartment.
  donutShop(on(-16.2, -14.5), 0, 0, 0);
  brickApartment(on(-7.8, -15.5), 0, 0, 0);
  crates(on(-20, -9), 0, 0);
  bin(on(-11.5, -6.2), 0, 0);
  // NE: police station, parked police car.
  policeStation(on(14.5, -14.5), 0, 0, 0);
  barricade(on(7.5, -6.4), 0, 0, 0);
  cone(on(9.5, -6.2), 0, 0);
  cone(on(10.5, -6.5), 0, 0);
  // SW: park with a fountain, paths, benches, trees and flowers.
  const park = on(-13.3, 13.3);
  rbox(park, 15, 0.12, 15, 0.3, P.grass, 0, 0.06, 0);
  rbox(park, 3, 0.14, 15, 0.1, P.path, 0, 0.08, 0);
  rbox(park, 15, 0.14, 3, 0.1, P.path, 0, 0.09, 0);
  cyl(park, 2.4, 2.6, 0.6, P.white, 0, 0.35, 0, 24);
  cyl(park, 2.1, 2.1, 0.62, P.water, 0, 0.37, 0, 24, { roughness: 0.2 });
  cyl(park, 0.4, 0.5, 1.4, P.white, 0, 1.0, 0, 16);
  cyl(park, 1.0, 0.4, 0.3, P.white, 0, 1.75, 0, 16);
  bench(park, -4.5, 3.2, 0);
  bench(park, 4.5, -3.2, Math.PI);
  tree(park, -5, -5, 0);
  tree(park, 5, 5, 1, 0.9);
  tree(park, 5.2, -5.2, 2);
  tree(park, -5.3, 5.3, 0, 1.1);
  for (const [bx, bz] of [[-2.5, -5], [2.5, 5], [-5.5, -1.8], [5.5, 1.8]]) bush(park, bx, bz, 0.55, P.leaf[(bx > 0) | 0], true);
  // SE: house with a picket fence and garden, burger shop.
  house(on(9.8, 15.5), 0, 0, Math.PI);
  burgerShop(on(17.5, 11.5), 0, 0, Math.PI);
  const fenceRow = on(9.8, 11.4);
  fence(fenceRow, -2.1, 0, 4);
  fence(fenceRow, 2.1, 0, 4);
  bush(on(7, 18.8), 0, 0, 0.7);
  hydrant(on(5.4, 7.2), 0, 0);
  bin(on(14, 6.2), 0, 0);
  // Street lamps at the corners and along the roads.
  for (const [lx, lz] of [[-5.3, -5.3], [5.3, -5.3], [-5.3, 5.3], [5.3, 5.3], [-15, -5.3], [15, 5.3], [-5.3, 16], [5.3, -16]])
    lamp(on(lx, lz), 0, 0);
  for (const [tx, tz, k] of [[-21, -5.5, 2], [21, -5.6, 0], [21, 5.6, 1], [-21, 5.6, 0], [5.6, 21, 2], [-5.6, -21, 1]])
    tree(on(tx, tz), 0, 0, k, 0.8);
  // The chase: getaway car with a police car right behind it.
  const player = group(g, 1.9, 0.15, 6.5, 0);
  player.add(playerCar());
  const cop = group(g, 1.9, 0.15, 12.5, 0);
  cop.add(policeCar());
  return { group: g, player, cop };
}

// ------------------------------------------------ before / after showcase --
// Each destructible gets an intact model and a destroyed one. Destroyed
// pieces marked `debris` fly out from the object's centre when the replay
// runs. Destruction is toy-like: things tip over, snap, pop apart and
// leave chunky pieces; smoke is soft puffs; nothing is gory.
function puff(p, x, y, z, s = 0.6, color = 0xe9e4ee, op = 0.9) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(s, 14, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: op }),
  );
  m.position.set(x, y, z);
  m.userData.smoke = true;
  p.add(m);
  return m;
}
const debris = (m) => ((m.userData.debris = true), m);

const ITEMS = [
  {
    id: "tree",
    label: "가로수",
    intact: (g) => tree(g, 0, 0, 0),
    broken(g) {
      cyl(g, 0.24, 0.28, 0.45, P.trunk, 0, 0.22, 0, 10);
      // Snapped trunk lying on the ground, crown and all.
      const fallen = group(g, 0.4, 0.3, 0.2);
      fallen.rotation.z = -Math.PI / 2 + 0.12;
      fallen.rotation.y = 0.5;
      cyl(fallen, 0.16, 0.22, 1.3, P.trunk, 0, 0.9, 0, 10);
      ball(fallen, 1.1, P.leaf[0], 0, 2.3, 0);
      ball(fallen, 0.8, P.leaf[0], 0.6, 1.9, 0.3);
      debris(fallen);
      for (let i = 0; i < 6; i++) debris(ball(g, 0.18, P.leaf[i % 3], Math.cos(i) * 1.6 - 0.6, 0.15, Math.sin(i * 1.7) * 1.2));
    },
  },
  {
    id: "lamp",
    label: "가로등",
    intact: (g) => lamp(g, 0, 0),
    broken(g) {
      cyl(g, 0.3, 0.36, 0.25, P.metal, 0, 0.12, 0, 12);
      cyl(g, 0.09, 0.11, 1.7, P.metal, 0, 0.95, 0, 10);
      // The top bends over; the lantern pops off and lies on the pavement.
      const top = group(g, 0, 1.75, 0);
      top.rotation.z = 1.15;
      cyl(top, 0.09, 0.09, 1.9, P.metal, 0, 0.95, 0, 10);
      const lantern = rbox(g, 0.46, 0.5, 0.46, 0.1, 0xfff2c4, 1.9, 0.25, 0.6);
      lantern.rotation.set(0.4, 0.5, 1.2);
      debris(lantern);
      for (let i = 0; i < 5; i++) debris(box(g, 0.14, 0.03, 0.1, 0xe8f4ff, 1.3 + i * 0.25, 0.03, 0.2 + (i % 2) * 0.4));
    },
  },
  {
    id: "bin",
    label: "쓰레기통",
    intact: (g) => bin(g, 0, 0),
    broken(g) {
      // Knocked flat, lid flipped off, rubbish spilled (paper, cans, banana).
      const body = rbox(g, 0.9, 1.15, 0.9, 0.14, 0x6f86d6, 0, 0.45, 0);
      body.rotation.z = Math.PI / 2;
      const lid = rbox(g, 1.0, 0.14, 1.0, 0.06, 0x4f63b4, 1.4, 0.1, 0.7);
      lid.rotation.set(0.2, 0.7, 0.1);
      debris(lid);
      const litter = [0xffffff, 0xf2e3b0, 0xdb4746, 0x8fd7ff, 0xffd24a, 0xffffff];
      for (let i = 0; i < 8; i++) {
        const m = i % 3 === 0
          ? ball(g, 0.16, litter[i % 6], 1.1 + Math.cos(i) * 1.1, 0.16, Math.sin(i * 1.3) * 1.1)
          : box(g, 0.28, 0.1, 0.2, litter[i % 6], 1.1 + Math.cos(i) * 1.2, 0.05, Math.sin(i * 1.3) * 1.2);
        m.rotation.y = i;
        debris(m);
      }
    },
  },
  {
    id: "fence",
    label: "울타리",
    intact: (g) => fence(g, 0, 0, 5),
    broken(g) {
      // A gap smashed through it: pickets knocked flat and scattered.
      for (const i of [0, 4]) {
        rbox(g, 0.22, 1.1, 0.12, 0.05, P.white, -1 + i * 0.5, 0.55, 0);
      }
      const rail = rbox(g, 1.3, 0.12, 0.08, 0.04, P.white, -0.6, 0.35, -0.08);
      rail.rotation.z = -0.35;
      for (let i = 0; i < 4; i++) {
        const pk = rbox(g, 0.22, 1.1, 0.12, 0.05, P.white, -0.5 + i * 0.45, 0.07, 0.9 + (i % 2) * 0.5);
        pk.rotation.set(Math.PI / 2, i * 0.6, 0);
        debris(pk);
      }
    },
  },
  {
    id: "hydrant",
    label: "소화전",
    intact: (g) => hydrant(g, 0, 0),
    broken(g) {
      cyl(g, 0.36, 0.36, 0.12, P.red, 0, 0.06, 0, 14);
      const top = group(g, 0.9, 0.3, 0.4);
      top.rotation.z = -1.4;
      cyl(top, 0.28, 0.32, 0.9, P.red, 0, 0, 0, 14);
      ball(top, 0.28, P.red, 0, 0.45, 0);
      debris(top);
      // A cartoon fountain of water.
      const water = mesh(g, new THREE.CylinderGeometry(0.12, 0.3, 3.2, 12, 1, true), 0x9fd8ff, 0, 1.7, 0, { transparent: true, opacity: 0.75, roughness: 0.1 });
      water.castShadow = false;
      for (let i = 0; i < 6; i++) {
        const d = ball(g, 0.22, 0xbfe8ff, Math.cos(i) * 0.7, 3.2 - (i % 2) * 0.4, Math.sin(i) * 0.7, { transparent: true, opacity: 0.8, roughness: 0.1 });
        d.castShadow = false;
      }
    },
  },
  {
    id: "barricade",
    label: "바리케이드",
    intact: (g) => barricade(g, 0, 0),
    broken(g) {
      for (const [s, r] of [[-0.9, 0.5], [0.9, -0.3]]) {
        const leg = group(g, s, 0, 0);
        leg.rotation.z = r;
        box(leg, 0.1, 1.0, 0.1, P.white, 0, 0.5, 0);
        rbox(g, 0.5, 0.08, 0.4, 0.03, P.metal, s, 0.04, 0);
      }
      for (let i = 0; i < 4; i++) {
        const b = box(g, 0.5, 0.22, 0.08, i % 2 ? P.white : P.red, -0.6 + i * 0.55, 0.06, 0.9 + (i % 2) * 0.4);
        b.rotation.set(Math.PI / 2, i * 0.5, 0);
        debris(b);
      }
      const c = cone(g, 1.6, -0.6);
      c.rotation.z = Math.PI / 2;
      c.position.y = 0.3;
      debris(c);
    },
  },
  {
    id: "police",
    label: "경찰차",
    wide: true,
    intact: (g) => g.add(policeCar()),
    broken(g) {
      // Flipped onto its side, squashed, light bar knocked off, a wheel
      // rolled away, soft grey smoke puffs; no fire, no people.
      const car = policeCar();
      car.rotation.set(0, 0.2, Math.PI / 2 - 0.15);
      car.position.set(-0.9, 1.05, 0);
      car.scale.set(1, 0.85, 0.95);
      // Its lights are out.
      for (const m of car.children)
        if (m.material?.emissive?.getHex()) m.material = mat(0x6d6a74);
      g.add(car);
      const bar = rbox(g, 1.4, 0.3, 0.5, 0.08, P.white, 2.2, 0.15, 1.6);
      bar.rotation.y = 0.8;
      debris(bar);
      const w = cyl(g, 0.46, 0.46, 0.38, P.charcoal, 2.6, 0.2, -1.4, 18);
      w.rotation.x = Math.PI / 2;
      debris(w);
      for (let i = 0; i < 6; i++) debris(rbox(g, 0.35, 0.08, 0.25, i % 2 ? P.white : P.charcoal, 1.6 + Math.cos(i) * 1.4, 0.04, Math.sin(i * 1.4) * 1.6, 0.03));
      for (const [x, y, z, s] of [[-0.6, 2.6, 0.2, 0.6], [-0.1, 3.3, -0.2, 0.5], [0.3, 4.0, 0.1, 0.4], [-0.9, 3.0, -0.4, 0.45]])
        puff(g, x, y, z, s, 0xb9b4c2, 0.85);
    },
  },
  {
    id: "player",
    label: "플레이어 차량(손상)",
    wide: true,
    intact: (g) => g.add(playerCar()),
    broken(g) {
      // Battered but still driving: dented body, bonnet popped up, bumper
      // hanging, cracked glass, smoke from the engine.
      const car = playerCar();
      car.rotation.z = 0.06;
      g.add(car);
      const bonnet = rbox(g, 1.8, 0.1, 1.1, 0.04, P.player, 0, 1.45, -1.15);
      bonnet.rotation.x = -0.55;
      const bumper = rbox(g, 2.0, 0.26, 0.3, 0.12, P.playerStripe, 0.3, 0.2, -2.1);
      bumper.rotation.set(0.2, 0.25, 0.35);
      debris(bumper);
      box(g, 0.9, 0.05, 0.08, P.white, 0.2, 1.85, -0.77).rotation.z = 0.5;
      box(g, 0.7, 0.05, 0.08, P.white, -0.3, 1.65, -0.77).rotation.z = -0.4;
      for (const [x, y, z, s] of [[0, 2.0, -1.4, 0.45], [0.3, 2.6, -1.6, 0.38], [-0.2, 3.1, -1.5, 0.32]])
        puff(g, x, y, z, s, 0xd9d4e0, 0.85);
    },
  },
];

function showcase(root) {
  const g = group(root, 0, 0, 0);
  const z0 = 37;
  tile(g, 50, 18, 0, z0);
  // Two lanes of blush paving: BEFORE (back) and AFTER (front).
  rbox(g, 48, 0.3, 6.5, 0.2, P.sidewalk, 0, 0.15, z0 - 4);
  rbox(g, 48, 0.3, 6.5, 0.2, P.sidewalk, 0, 0.15, z0 + 4);
  for (const [text, z, bg] of [["BEFORE", z0 - 4, "#7fa543"], ["AFTER", z0 + 4, "#de7170"]]) {
    const s = sign(g, text, 4.2, 1.1, -21.2, 2.6, z, bg, "#ffffff");
    s.rotation.y = Math.PI / 2 - 0.6;
    const post = cyl(g, 0.08, 0.08, 2.2, P.metal, -21.2, 1.1, z, 8);
    post.castShadow = true;
  }
  const xs = [-16.5, -12, -7.8, -3.6, 0.4, 4.4, 10.2, 18];
  const after = [];
  ITEMS.forEach((item, i) => {
    const before = group(g, xs[i], 0.3, z0 - 4);
    item.intact(before);
    const intact = group(g, xs[i], 0.3, z0 + 4);
    item.intact(intact);
    intact.visible = false;
    const broken = group(g, xs[i], 0.3, z0 + 4);
    item.broken(broken);
    if (item.wide) {
      before.rotation.y = intact.rotation.y = broken.rotation.y = Math.PI / 2;
    }
    after.push({ item, intact, broken });
  });
  return { group: g, after, z0 };
}

// ---------------------------------------------------------------- scene --
const canvas = document.querySelector("#view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(P.sky);
scene.fog = new THREE.Fog(P.sky, 120, 260);
// Soft, warm key light from the upper left; sky/lavender fill so shadows
// are tinted, never black (references 1 and 2).
scene.add(new THREE.HemisphereLight(0xf4f1ff, 0xc9b0c4, 1.55));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
sun.position.set(-30, 52, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5;
sun.shadow.blurSamples = 16;
sun.shadow.bias = -0.0004;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 52, bottom: -40, near: 1, far: 160 });
sun.target.position.set(0, 0, 10);
scene.add(sun, sun.target);
// Soft water all round (reference 2).
const water = new THREE.Mesh(
  new THREE.CircleGeometry(160, 48),
  new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.35 }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = -3.4;
water.receiveShadow = true;
scene.add(water);

const city = cityBlock(scene);
const show = showcase(scene);

const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 600);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 6;
controls.maxDistance = 160;
const VIEWS = {
  all: { pos: [52, 50, 78], target: [0, 0, 14] },
  city: { pos: [40, 38, 40], target: [0, 1, 0] },
  cars: { pos: [-3.2, 4.6, -1.5], target: [1.9, 1.3, 9.0] },
  wreck: { pos: [0.5, 25, 80], target: [0.5, 1, 37] },
  wreckLeft: { pos: [-9, 10, 52], target: [-9, 1, 37] },
  wreckRight: { pos: [12, 10, 52], target: [12, 1, 37] },
};
let fly = null;
function goTo(name, instant = false) {
  const v = VIEWS[name];
  const to = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) };
  const portrait = innerHeight > innerWidth;
  if (portrait) to.pos.sub(to.target).multiplyScalar(1.45).add(to.target);
  if (instant) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    fly = null;
  } else fly = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t: 0 };
  for (const b of document.querySelectorAll("[data-view]"))
    b.setAttribute("aria-pressed", String(b.dataset.view === name));
}

// Destruction replay on the AFTER lane: one item after another, each with a
// puff of dust, its pieces flying out on short arcs and landing where the
// still frame shows them.
let replay = null;
function startReplay() {
  replay = { t: 0, items: show.after.map((a, i) => ({ ...a, at: 0.5 + i * 0.45, state: "wait" })) };
  for (const a of show.after) {
    a.intact.visible = true;
    a.broken.visible = false;
  }
}
const dust = [];
function burst(x, y, z) {
  for (let i = 0; i < 9; i++) {
    const m = puff(scene, x, y, z, 0.35 + Math.random() * 0.3, i % 3 ? 0xfdfaf4 : 0xffe3a3, 0.95);
    m.castShadow = false;
    dust.push({ m, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0 });
  }
}
function stepReplay(dt) {
  if (!replay) return;
  replay.t += dt;
  let busy = false;
  for (const it of replay.items) {
    if (it.state === "wait") {
      busy = true;
      if (replay.t >= it.at) {
        it.state = "fly";
        it.intact.visible = false;
        it.broken.visible = true;
        const w = it.broken.getWorldPosition(new THREE.Vector3());
        burst(w.x, 1.2, w.z);
        it.pieces = [];
        it.broken.traverse((o) => {
          if (o.userData.debris) {
            it.pieces.push({ o, end: o.position.clone(), endRot: o.rotation.clone() });
            o.position.set(0, 1.2, 0);
          }
        });
        it.broken.scale.set(1, 0.6, 1);
        it.k = 0;
      }
    } else if (it.state === "fly") {
      busy = true;
      it.k = Math.min(1, it.k + dt / 0.65);
      const k = it.k;
      it.broken.scale.y = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.12;
      for (const p of it.pieces) {
        p.o.position.lerpVectors(new THREE.Vector3(0, 1.2, 0), p.end, k);
        p.o.position.y += Math.sin(k * Math.PI) * 2.2;
        p.o.rotation.set(p.endRot.x * k + (1 - k) * 4, p.endRot.y + (1 - k) * 3, p.endRot.z * k);
      }
      if (k >= 1) {
        it.broken.scale.y = 1;
        it.state = "done";
      }
    }
  }
  if (!busy) replay = null;
}

function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
goTo("all", true);

for (const b of document.querySelectorAll("[data-view]"))
  b.addEventListener("click", () => goTo(b.dataset.view));
document.querySelector("#replay").addEventListener("click", () => {
  goTo("wreck");
  startReplay();
});
let spin = false;
document.querySelector("#spin").addEventListener("click", (e) => {
  spin = !spin;
  e.currentTarget.setAttribute("aria-pressed", String(spin));
});

let last = performance.now();
const smokes = [];
scene.traverse((o) => o.userData.smoke && smokes.push({ o, y: o.position.y, ph: Math.random() * 6 }));
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 0.9);
    const e = 1 - Math.pow(1 - fly.t, 3);
    camera.position.lerpVectors(fly.from.pos, fly.to.pos, e);
    controls.target.lerpVectors(fly.from.target, fly.to.target, e);
    if (fly.t >= 1) fly = null;
  }
  if (spin && !fly) {
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.15);
    camera.position.copy(controls.target).add(off);
  }
  // Police light bar blink and soft smoke bob.
  const blink = Math.floor(now / 260) % 2;
  city.cop.traverse((o) => {
    if (o.material?.emissive && o.material.color.getHex() === 0xff4a5a) o.material.emissiveIntensity = blink ? 1.2 : 0.2;
    if (o.material?.emissive && o.material.color.getHex() === 0x3d8bff) o.material.emissiveIntensity = blink ? 0.2 : 1.2;
  });
  for (const s of smokes) s.o.position.y = s.y + Math.sin(now / 700 + s.ph) * 0.12;
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.life += dt;
    d.vy -= 6 * dt;
    d.m.position.x += d.vx * dt;
    d.m.position.y = Math.max(0.3, d.m.position.y + d.vy * dt);
    d.m.position.z += d.vz * dt;
    d.m.scale.setScalar(1 + d.life * 1.4);
    d.m.material.opacity = Math.max(0, 0.95 - d.life * 1.2);
    if (d.life > 0.8) {
      scene.remove(d.m);
      dust.splice(i, 1);
    }
  }
  stepReplay(dt);
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.__ART__ = { goTo, startReplay, VIEWS };
