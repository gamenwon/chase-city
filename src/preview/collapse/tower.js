// The collapsing tower, built in pre-cut sections (angular low-poly, vivid
// colours) plus the pre-authored broken pieces that replace them (behind
// dust) as the collapse plays out.
//
//   A  floors 0-1   lobby; becomes a jagged stump
//   B  floors 2-5   crushed flat (pancake), replaced by a rubble pile
//   C  floors 6-8   tips north and comes to rest leaning on the pile
//   D  floors 9-11  set back, with the crown (billboard, antenna, tank);
//                   breaks off, falls onto the road, becomes the crown wreck
import * as THREE from "three";
import { C, B, G, cyl, ico, add, pieceMesh } from "../locations/parts.js";

export const FH = 3; // floor height
const W = 13, DW = 9.4; // footprints: main body, set-back top
const WALL = 0x1f8fb3, WALL2 = 0x16708d, TRIM = C.white, ACCENT = 0xf5a51a, GLASS = 0x9fdcf0;

// One floor of facade: wall band, a row of recessed windows on all four
// faces (frames stand off the wall, glass behind), a floor band.
function floor(g, y, w, cols, accent = false) {
  B(g, w, FH, w, (Math.round(y / FH) % 2 ? WALL : WALL2), 0, y, 0);
  for (let f = 0; f < 4; f++) {
    const fg = G(g, 0, 0, 0, (f * Math.PI) / 2);
    const span = w - 2;
    for (let i = 0; i < cols; i++) {
      const x = -span / 2 + ((i + 0.5) * span) / cols;
      const ww = span / cols - 0.55;
      B(fg, ww, 1.7, 0.03, GLASS, x, y + 0.7, w / 2 + 0.015);
      B(fg, ww + 0.24, 0.12, 0.2, TRIM, x, y + 2.4, w / 2 + 0.1);
      B(fg, ww + 0.3, 0.12, 0.26, TRIM, x, y + 0.58, w / 2 + 0.13);
      for (const s of [-1, 1]) B(fg, 0.1, 1.7, 0.18, TRIM, x + s * (ww / 2 + 0.05), y + 0.7, w / 2 + 0.09);
    }
  }
  // Floor band (4 pieces, ends meet, no overlap).
  const bandC = accent ? ACCENT : TRIM, o = 0.14;
  B(g, w + 2 * o, 0.22, o, bandC, 0, y + FH - 0.22, w / 2 + o / 2);
  B(g, w + 2 * o, 0.22, o, bandC, 0, y + FH - 0.22, -w / 2 - o / 2);
  B(g, o, 0.22, w, bandC, w / 2 + o / 2, y + FH - 0.22, 0);
  B(g, o, 0.22, w, bandC, -w / 2 - o / 2, y + FH - 0.22, 0);
}

export function sectionA(g) {
  // Lobby: dark plinth, tall glass, entrance canopy, then floor 1.
  B(g, W, 0.4, W, 0x2a292e, 0, 0, 0);
  B(g, W, FH - 0.4, W, WALL2, 0, 0.4, 0);
  for (let f = 0; f < 4; f++) {
    const fg = G(g, 0, 0, 0, (f * Math.PI) / 2);
    B(fg, W - 2.4, 2.2, 0.03, GLASS, 0, 0.5, W / 2 + 0.015);
    for (let i = 0; i <= 5; i++) B(fg, 0.12, 2.2, 0.16, TRIM, -(W - 2.4) / 2 + (i * (W - 2.4)) / 5, 0.5, W / 2 + 0.08);
  }
  B(g, 5, 0.2, 2.2, ACCENT, 0, 2.6, W / 2 + 1.1); // canopy (south)
  for (const s of [-1, 1]) B(g, 0.14, 2.2, 0.14, C.dark, s * 2.3, 0.4, W / 2 + 2.0);
  floor(g, FH, W, 4, true);
}
export function stumpA(g) {
  // What is left of the lobby: walls standing, a jagged broken top with
  // slabs and bent rebar, dark gaps where the glass was.
  B(g, W, 0.4, W, 0x2a292e, 0, 0, 0);
  B(g, W, FH - 0.4, W, WALL2, 0, 0.4, 0);
  for (let f = 0; f < 4; f++) {
    const fg = G(g, 0, 0, 0, (f * Math.PI) / 2);
    B(fg, W - 2.4, 2.2, 0.03, 0x141316, 0, 0.5, W / 2 + 0.015);
    // Jagged wall tops: blocks of different height along each face.
    for (let i = 0; i < 6; i++) B(fg, W / 6, 0.6 + ((i * 7 + f * 3) % 5) * 0.55, 0.6, i % 2 ? WALL : WALL2, -W / 2 + W / 12 + (i * W) / 6, FH, W / 2 - 0.3);
  }
  for (let i = 0; i < 9; i++) {
    const r = B(g, 0.06, 1.4, 0.06, 0x8a3b2a, -4 + i, FH + 1.0, ((i * 5) % 7) - 3);
    r.rotation.set(0.5 * Math.sin(i), 0, 0.6 * Math.cos(i * 2));
  }
}
export function sectionB(g) {
  for (let k = 0; k < 4; k++) floor(g, k * FH, W, 4, k === 3);
}
export function pile(g) {
  // Rubble pile on the block: stepped angular mound of broken floor slabs
  // (still with window rows on some), concrete lumps, rebar, glass.
  const cone = add(g, new THREE.ConeGeometry(8.6, 6.5, 7), 0x8f8a84, 0, 3.25, -0.5);
  cone.scale.set(1, 1, 0.92);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39, r = 2 + (i % 4) * 1.3;
    const slab = B(g, 3.5 + (i % 3), 0.35, 2.2 + (i % 2), i % 3 ? 0xbdb7ae : WALL, Math.cos(a) * r, 0.6 + (5.5 - r) * 0.9, Math.sin(a) * r, a);
    slab.rotation.x = 0.3 * Math.sin(i * 1.7);
    slab.rotation.z = 0.35 * Math.cos(i * 1.3);
  }
  // Facade panels with windows lying on the pile.
  for (let i = 0; i < 4; i++) {
    const p = G(g, Math.cos(i * 1.6) * 4.5, 2.2 + (i % 2), Math.sin(i * 1.6) * 4.5, i * 1.6);
    p.rotation.x = -0.7 - 0.2 * (i % 2);
    B(p, 4, 0.3, 2.6, i % 2 ? WALL : WALL2, 0, 0, 0);
    for (let k = 0; k < 2; k++) B(p, 1.4, 0.04, 1.2, GLASS, -1 + k * 2, 0.3, 0);
  }
  for (let i = 0; i < 10; i++) {
    const r = B(g, 0.07, 1.8, 0.07, 0x8a3b2a, Math.cos(i) * 3, 4.2 - (i % 3), Math.sin(i * 1.3) * 3);
    r.rotation.set(0.6 * Math.sin(i), i, 0.7 * Math.cos(i));
  }
  for (let i = 0; i < 12; i++) ico(g, 0.6 + (i % 3) * 0.3, 0x9a948c, Math.cos(i * 0.9) * (6 + (i % 2)), 0.4, Math.sin(i * 0.9) * (6 + (i % 2)));
}
export function sectionC(g) {
  for (let k = 0; k < 3; k++) floor(g, k * FH, W, 4, k === 2);
  // Roof terrace on the set-back: a parapet ring round the 13 m roof.
  B(g, W, 0.12, W, 0x8a8781, 0, 3 * FH, 0);
}
export function sectionD(g) {
  // Set-back top floors, then the crown: roof, water tank, antenna, big
  // billboard frame with an orange panel.
  for (let k = 0; k < 3; k++) floor(g, k * FH, DW, 3, k === 2);
  const top = 3 * FH;
  B(g, DW + 0.3, 0.3, DW + 0.3, TRIM, 0, top, 0);
  const tank = G(g, -2.4, top + 0.3, -2.2);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) B(tank, 0.12, 1.4, 0.12, C.dark, x, 0, z);
  cyl(tank, 1.0, 1.0, 1.8, 0x8a5a3a, 0, 1.4, 0, 8);
  cyl(tank, 0.1, 1.05, 0.5, 0x6b4a33, 0, 3.2, 0, 8); // conical lid
  // Billboard frame (south-facing) and panel.
  for (const x of [-3, 3]) B(g, 0.2, 3.6, 0.2, C.dark, x, top + 0.3, 2.6);
  B(g, 7.2, 2.4, 0.2, ACCENT, 0, top + 1.5, 2.6);
  B(g, 6.6, 0.5, 0.05, C.white, 0, top + 2.4, 2.72);
  B(g, 4.4, 0.4, 0.05, 0xe0367a, 0, top + 1.8, 2.72);
  // Antenna mast with a red tip.
  cyl(g, 0.12, 0.2, 5.0, C.metal, 2.6, top + 0.3, -2.4, 6);
  ico(g, 0.22, 0xff2a3c, 2.6, top + 5.4, -2.4);
}
export function crownWreck(g) {
  // The top lying on the road (it fell north, crown first): broken floors
  // as a long low heap with window rows showing, the billboard bent over,
  // the tank burst open, the antenna snapped.
  const L = 12.6, Wd = 9.4;
  for (let k = 0; k < 4; k++) {
    const s = G(g, 0, 0, -1.2 - k * 2.9, 0);
    s.rotation.z = (k % 2 ? 1 : -1) * 0.12;
    B(s, Wd - (k % 2) * 0.6, 2.4 - k * 0.25, 2.8, k % 2 ? WALL : WALL2, 0, 0, 0);
    for (let i = 0; i < 3; i++) B(s, 1.8, 1.2, 0.03, GLASS, -2.6 + i * 2.6, 0.6, 1.42);
    B(s, Wd + 0.2, 0.2, 0.15, TRIM, 0, 2.2 - k * 0.25, 1.45);
  }
  const bb = G(g, 0.6, 0.2, -L + 0.8, 0.3);
  bb.rotation.x = -1.2;
  B(bb, 7.2, 2.4, 0.2, ACCENT, 0, 0, 0);
  B(bb, 6.6, 0.5, 0.05, C.white, 0, 0.9, 0.12);
  B(bb, 4.4, 0.4, 0.05, 0xe0367a, 0, 0.3, 0.12);
  const tank = cyl(g, 1.0, 1.0, 1.8, 0x8a5a3a, -3.4, 1.0, -L + 2.4, 8);
  tank.rotation.set(1.4, 0, 0.3);
  const ant = cyl(g, 0.12, 0.2, 4.0, C.metal, 3.5, 0.3, -L + 1.5, 6);
  ant.rotation.set(1.45, 0.4, 0);
  for (let i = 0; i < 16; i++) {
    const c = B(g, 0.5 + (i % 3) * 0.4, 0.3 + (i % 2) * 0.3, 0.5, i % 3 ? 0xbdb7ae : WALL, ((i * 37) % 11) - 5, 0, -((i * 23) % 13), i);
    c.rotation.z = (i % 3) * 0.3;
  }
}
// Detonator pad: hazard-striped plate, plunger box, warning signs.
export function pad(g) {
  const R = 2.6;
  cyl(g, R, R, 0.06, C.dark, 0, 0, 0, 8);
  for (let i = 0; i < 8; i++) {
    const s = B(g, 0.6, 0.02, R * 1.7, C.yellow, Math.cos((i * Math.PI) / 4) * 0.01, 0.06, 0, (i * Math.PI) / 4 + 0.4);
    s.scale.x = 0.9;
  }
  cyl(g, R * 0.55, R * 0.55, 0.08, 0x2a292e, 0, 0.06, 0, 8);
  B(g, 0.9, 0.7, 0.6, 0xd62f2a, 0, 0.14, 0);
  B(g, 0.1, 0.6, 0.1, C.metal, 0, 0.84, 0);
  B(g, 0.7, 0.12, 0.14, C.dark, 0, 1.44, 0);
}
export const sections = { A: sectionA, B: sectionB, C: sectionC, D: sectionD };
export const pieceOf = (fn) => pieceMesh(fn);
