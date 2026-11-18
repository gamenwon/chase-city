// Static pieces of the outer-ring sites (baked, one mesh per site):
// ground surfaces, markings, landmarks, buildings, the solid pieces.
import * as THREE from "three";
import { C, B, G, cyl, ico, add, signBoard } from "./parts.js";
// Sign faces are drawn from one texture atlas per site (parts.js bake).

const T = 0.02; // on top of the 0.02 slab (group at y 0.03)

function slab(g, color) {
  B(g, 19, 0.02, 12.2, color, 0, 0, 0);
}
function parking(g) {
  slab(g, 0x4a494f);
  for (let b = 0; b <= 6; b++) B(g, 0.12, 0.01, 5.2, C.lineWhite, -9 + b * 3, T, 3.3);
  for (let b = 0; b < 6; b++) B(g, 1.6, 0.14, 0.25, C.stone, -7.5 + b * 3, T, 5.6);
  B(g, 18, 0.01, 0.12, C.lineYellow, 0, T, 0.55);
  for (const u of [-6, 0, 6]) {
    B(g, 1.6, 0.012, 0.3, C.lineWhite, u, T, -2.6);
    const head = cyl(g, 0, 0.45, 0.012, C.lineWhite, u + 1.0, T, -2.6, 3);
    head.rotation.y = -Math.PI / 2;
  }
  // Painted "P" bay symbol and a kerb island at each end.
  for (const s of [-1, 1]) B(g, 0.6, 0.18, 4.0, C.curb, s * 9.2, 0, 3.5);
  // Pay machine.
  B(g, 0.6, 1.5, 0.4, C.blue, 0, T, 5.8);
  B(g, 0.4, 0.3, 0.02, C.glassDark, 0, T + 1.0, 5.59);
  B(g, 0.3, 0.06, 0.02, C.yellow, 0, T + 0.7, 5.59);
  // Gate post at the entrance (the arm itself flies).
  B(g, 0.4, 1.1, 0.4, C.yellow, -8.9, T, -6.0);
  B(g, 0.44, 0.2, 0.44, C.dark, -8.9, T + 1.1, -6.0);
  // Landmark: tall blue P pylon at the far corner.
  const p = G(g, -9.0, T, 5.9);
  B(p, 0.3, 6.5, 0.3, C.metal, 0, 0, 0);
  B(p, 1.8, 1.8, 0.3, C.blue, 0, 6.2, 0);
  B(p, 0.25, 1.3, 0.06, C.white, -0.3, 6.45, -0.16);
  B(p, 0.65, 0.25, 0.06, C.white, 0.05, 7.5, -0.16);
  B(p, 0.65, 0.25, 0.06, C.white, 0.05, 6.95, -0.16);
  B(p, 0.25, 0.8, 0.06, C.white, 0.3, 6.95, -0.16);
}
function construction(g) {
  slab(g, 0x8a7a64);
  // Foundation (solid): slab with exposed rebar and formwork.
  const fd = G(g, -5.0, T, 4.7);
  B(fd, 7.0, 0.9, 2.8, 0xb9b4ac, 0, 0, 0);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) B(fd, 0.06, 1.6 + ((i + j) % 3) * 0.3, 0.06, 0x8a3b2a, -3.2 + i * 0.8, 0.9, -0.9 + j * 0.9);
  for (let j = 0; j < 3; j++) B(fd, 6.6, 0.05, 0.05, 0x8a3b2a, 0, 1.8, -0.9 + j * 0.9);
  for (const s of [-1, 1]) B(fd, 7.0, 0.5, 0.06, 0xc9935a, 0, 0.9, s * 1.42);
  // Site office (solid): raised cabin, windows, door, steps.
  const cab = G(g, 5.6, T, 4.8);
  B(cab, 5.0, 0.3, 2.4, C.dark, 0, 0, 0);
  B(cab, 5.0, 2.3, 2.4, C.yellow, 0, 0.3, 0);
  B(cab, 5.1, 0.15, 2.5, C.white, 0, 2.6, 0);
  for (const x of [-1.4, 0.6]) B(cab, 1.1, 0.8, 0.04, C.glassDark, x, 1.3, -1.22);
  B(cab, 0.9, 1.9, 0.04, C.trim, 1.9, 0.35, -1.22);
  B(cab, 1.0, 0.3, 0.5, C.metal, 1.9, 0, -1.5);
  // Rebar mesh sheets on the ground; landmark: SITE board with stripes.
  for (let i = 0; i < 6; i++) B(g, 3.0, 0.03, 0.05, 0x8a3b2a, 3.6, T, -3.4 + i * 0.25);
  for (let i = 0; i < 12; i++) B(g, 0.05, 0.03, 1.3, 0x8a3b2a, 2.2 + i * 0.25, T, -2.8);
  const sb = G(g, 9.0, T, 1.4, -Math.PI / 2);
  for (const x of [-1, 1]) B(sb, 0.12, 3.2, 0.12, C.dark, x, 0, 0);
  B(sb, 2.6, 1.3, 0.08, C.yellow, 0, 2.0, 0);
  signBoard(sb, "SITE", 2.4, 1.1, 0, 2.65, -0.06, Math.PI, "#f5c01a", "#232227");
}
function depot(g) {
  slab(g, 0x9a968e);
  // Loading dock building (solid): platform, roller doors, bumpers, roof.
  const d = G(g, -2.0, T, 4.8);
  B(d, 13.0, 1.2, 2.8, 0x8f8a84, 0, 0, 0);
  B(d, 13.0, 3.4, 2.4, C.white, 0, 1.2, 0.2);
  B(d, 13.4, 0.3, 3.0, C.blue, 0, 4.6, 0.1);
  for (const x of [-4.5, 0, 4.5]) {
    B(d, 3.0, 2.6, 0.05, 0xb9bcc2, x, 1.2, -1.02);
    for (let k = 0; k < 8; k++) B(d, 3.0, 0.04, 0.06, 0x8a8d93, x, 1.3 + k * 0.32, -1.05);
    for (const s of [-1, 1]) B(d, 0.3, 0.4, 0.2, C.dark, x + s * 1.2, 0.7, -1.5);
  }
  for (let i = 0; i < 13; i++) B(d, 0.5, 0.06, 0.06, i % 2 ? C.dark : C.yellow, -6 + i, 1.2, -1.42);
  // Bay markings and the landmark DEPOT gantry (posts are solid).
  for (const u of [-8.8, -3.9, 1.0]) B(g, 0.12, 0.01, 6, C.lineYellow, u, T, 0.3);
  const gt = G(g, 7.9, T, 5.9);
  for (const x of [-1.3, 1.3]) B(gt, 0.3, 6.0, 0.3, C.yellow, x, 0, 0);
  B(gt, 3.0, 1.2, 0.3, C.orange, 0, 5.0, 0);
  signBoard(gt, "DEPOT", 2.8, 1.0, 0, 5.6, -0.16, Math.PI, "#f0781e", "#ffffff");
}
function carwash(g) {
  slab(g, 0x4f8fb8);
  // Lane markings through the bay; foam puddles.
  for (const v of [0.0, 4.0]) B(g, 14, 0.01, 0.12, C.white, 0, T, v);
  for (let i = 0; i < 6; i++) {
    const p = cyl(g, 0.6 + (i % 3) * 0.3, 0.6, 0.01, 0xe8f4fb, -5 + i * 2, T, 2 + ((i * 37) % 7) * 0.2 - 0.6, 7);
    p.scale.z = 0.6;
  }
  // Bay canopy on four columns (solid), sprayer bars, brush rails.
  for (const [u, v] of [[-6, -0.4], [6, -0.4], [-6, 4.4], [6, 4.4]]) B(g, 0.4, 3.8, 0.4, 0x2457c5, u, T, v);
  B(g, 12.8, 0.3, 5.4, C.white, 0, 3.8, 2.0);
  B(g, 13.0, 0.5, 0.2, 0x2457c5, 0, 3.6, -0.6);
  B(g, 13.0, 0.5, 0.2, 0x2457c5, 0, 3.6, 4.6);
  for (const u of [-4.5, 4.5]) {
    B(g, 0.12, 0.12, 4.6, C.metal, u, 3.4, 2.0);
    for (let k = 0; k < 6; k++) B(g, 0.06, 0.2, 0.06, C.metal, u, 3.2, 0.2 + k * 0.72);
  }
  for (const u of [-2.2, 2.2]) B(g, 0.12, 0.12, 3.6, C.metal, u, 3.5, 2.0);
  // Vacuum stations with hoses.
  for (const u of [-8.6, 8.6]) {
    B(g, 0.6, 1.4, 0.6, C.yellow, u, T, 5.4);
    const h = add(g, new THREE.TorusGeometry(0.4, 0.05, 4, 8, Math.PI * 1.4), C.rubber, u, T + 1.0, 5.0);
    h.rotation.y = Math.PI / 2;
  }
  // Landmark: WASH sign with big bubbles on the roof.
  const s = G(g, 0, 4.1, 2.0);
  B(s, 5.0, 1.4, 0.3, C.white, 0, 0.2, 0);
  signBoard(s, "CAR WASH", 4.6, 1.0, 0, 0.9, -0.12, Math.PI, "#2fa4e0", "#ffffff");
  for (const [x, y, r] of [[-2.4, 1.9, 0.6], [-1.2, 2.5, 0.45], [0.2, 2.1, 0.7], [1.6, 2.6, 0.5], [2.6, 1.8, 0.4]]) ico(s, r, 0x9fe0ff, x, y, 0);
}
function market(g) {
  slab(g, 0xd9b38c);
  for (let i = 0; i < 9; i++) B(g, 0.08, 0.01, 12, 0xc29b74, -8 + i * 2, T, 0);
  // Landmark: arch over the entrance (posts solid), string lights.
  const a = G(g, 0, T, -5.6);
  for (const x of [-4.2, 4.2]) B(a, 0.3, 4.6, 0.3, C.red, x, 0, 0);
  B(a, 9.0, 1.0, 0.3, C.yellow, 0, 4.4, 0);
  signBoard(a, "MARKET", 8.4, 0.85, 0, 4.9, -0.16, Math.PI, "#f5c01a", "#d62f2a");
  for (let i = 0; i < 12; i++) ico(g, 0.1, [C.red, C.yellow, C.blue, C.green][i % 4], -4 + i * 0.73, 3.6 - Math.sin((i / 11) * Math.PI) * 0.5, -5.6);
}
function cafe(g) {
  slab(g, 0xb98a55);
  for (let i = 0; i < 18; i++) B(g, 0.05, 0.01, 12, 0x9c6a3a, -8.5 + i, T, 0);
  // Café (solid): glazing, striped awning, counter window, big cup sign.
  const c = G(g, 0, T, 4.8);
  B(c, 6.0, 2.8, 2.6, C.cream, 0, 0, 0);
  B(c, 6.1, 0.3, 2.7, C.dark, 0, 2.8, 0);
  B(c, 4.6, 1.6, 0.04, C.glass, 0, 0.6, -1.32);
  for (let i = 0; i <= 4; i++) B(c, 0.08, 1.6, 0.08, C.dark, -2.3 + i * 1.15, 0.6, -1.33);
  for (let i = 0; i < 8; i++) {
    const s = B(c, 0.78, 0.05, 1.1, i % 2 ? C.white : C.green, -2.73 + i * 0.78, 2.4, -1.75);
    s.rotation.x = -0.3;
  }
  signBoard(c, "CAFE", 2.6, 0.5, 0, 2.95, -1.42, Math.PI, "#232227", "#f4f4f0");
  const cup = G(c, 0, 3.1, 0);
  cyl(cup, 0.9, 0.7, 1.4, C.white, 0, 0, 0, 8);
  cyl(cup, 0.92, 0.92, 0.25, C.red, 0, 1.0, 0, 8);
  const h = add(cup, new THREE.TorusGeometry(0.4, 0.1, 4, 8), C.white, 0.95, 0.7, 0);
  h.rotation.y = 0;
  for (let i = 0; i < 3; i++) {
    const st = B(cup, 0.1, 0.6, 0.1, 0xe6ded2, -0.3 + i * 0.3, 1.6, 0);
    st.rotation.z = 0.2 * Math.sin(i * 2);
  }
}
function plaza(g) {
  slab(g, 0xd9cdb8);
  for (let i = -4; i <= 4; i++) {
    B(g, 0.1, 0.01, 12, 0xbfb3a0, i * 2, T, 0);
    if (Math.abs(i) <= 3) B(g, 18, 0.01, 0.1, 0xbfb3a0, 0, T, i * 1.6);
  }
  // Plinth for the statue (solid), a ring of red paving round it.
  const ring = cyl(g, 2.4, 2.4, 0.01, 0xb84a2e, 0, T, 3.6, 8);
  ring.rotation.y = Math.PI / 8;
  const p = G(g, 0, T, 3.6, Math.PI);
  B(p, 1.4, 0.25, 1.4, 0xbfb6a6, 0, 0, 0);
  B(p, 1.1, 0.9, 1.1, C.stone, 0, 0.25, 0);
  B(p, 1.3, 0.12, 1.3, 0xbfb6a6, 0, 1.15, 0);
}
export function siteDecor(root, y) {
  if (y.kind === "corner") {
    // Billboard on two legs over the corner, facing the city.
    const [a, b] = y.legs;
    const g = G(root, (a[0] + b[0]) / 2, 0.05, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2);
    const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
    for (const s of [-1, 1]) B(g, 0.5, 7.0, 0.5, C.metal, s * half, 0, 0);
    B(g, half * 2 + 2.4, 3.4, 0.35, C.dark, 0, 6.4, 0);
    B(g, half * 2 + 2.0, 3.0, 0.1, [C.red, C.blue, C.yellow, C.green][Math.abs(Math.round(y.x + y.z)) % 4], 0, 6.6, -0.22);
    B(g, half * 2, 0.6, 0.12, C.white, 0, 7.6, -0.24);
    B(g, half * 1.2, 0.5, 0.12, C.white, -0.4, 6.9, -0.24);
    B(g, half * 2 + 2.4, 0.15, 1.0, C.metal, 0, 6.2, -0.6);
    return;
  }
  const g = G(root, y.x, 0.03, y.z, y.ry);
  ({ parking, construction, depot, carwash, market, cafe, plaza })[y.kind](g);
}
