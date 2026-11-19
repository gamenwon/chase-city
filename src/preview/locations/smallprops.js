// Small street and site props (shop fronts, parking, construction, car
// wash): light things a car knocks flying without slowing down. A light
// hit throws one whole (tumbling along the hit); a hard hit breaks it
// into a few pieces and a spray of small bits (papers, goods, tools,
// bottles, planks, pot shards). Every piece stays where it lands until
// restart. Models are low-poly boxes like the rest of the kit; the kinds
// below join furniture.js's FLYERS table and use the same FlyerSystem.
import * as THREE from "three";
import { C, B, G, cyl, ico, add } from "./parts.js";

// ---------------------------------------------------------------- shop --
// A-frame sandwich board (tinted per shop): two boards hinged at the top.
export function sandwichBoard(g) {
  for (const s of [-1, 1]) {
    const p = G(g, 0, 0, s * 0.2);
    p.rotation.x = s * 0.2;
    boardHalf(G(p, 0, 0.55, 0));
  }
}
export function boardHalf(g) {
  B(g, 0.62, 1.05, 0.04, 0x3a3940, 0, -0.55, 0);
  B(g, 0.5, 0.7, 0.02, 0xffffff, 0, -0.43, 0.025); // the menu (tinted)
  B(g, 0.36, 0.06, 0.02, 0x232227, 0, -0.05, 0.04);
}
// Display rack outside a shop: a wire stand with goods on three shelves.
export function displayRack(g) {
  for (const x of [-0.4, 0.4]) for (const z of [-0.2, 0.2]) B(g, 0.04, 1.4, 0.04, 0x9da1a8, x, 0, z);
  const goods = [0xe8401c, 0xf5c01a, 0x2457c5, 0x5cb23a, 0xe0367a];
  for (let l = 0; l < 3; l++) {
    B(g, 0.86, 0.03, 0.46, 0xb9bcc2, 0, 0.3 + l * 0.42, 0);
    for (let i = 0; i < 4; i++) B(g, 0.16, 0.2, 0.14, goods[(i + l * 2) % 5], -0.3 + i * 0.2, 0.33 + l * 0.42, -0.08 + (i % 2) * 0.14);
  }
}
export function rackFrame(g) {
  for (const x of [-0.4, 0.4]) B(g, 0.04, 1.4, 0.04, 0x9da1a8, x, -0.7, 0);
  for (let l = 0; l < 3; l++) B(g, 0.86, 0.03, 0.12, 0xb9bcc2, 0, -0.4 + l * 0.42, 0);
}
// Terracotta pot with a shrub and flowers.
export function flowerPot(g) {
  cyl(g, 0.34, 0.26, 0.55, 0xc4683e, 0, 0, 0, 8);
  cyl(g, 0.37, 0.37, 0.07, 0xb05a34, 0, 0.5, 0, 8);
  ico(g, 0.36, C.leaf[0], 0, 0.85, 0);
  for (let i = 0; i < 5; i++) ico(g, 0.08, C.flower[i % 4], Math.cos(i * 1.3) * 0.26, 1.0 + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.26);
}
// Newspaper vending box on short legs.
export function newsStand(g) {
  for (const x of [-0.2, 0.2]) B(g, 0.05, 0.35, 0.05, C.dark, x, 0, 0);
  B(g, 0.52, 0.7, 0.44, 0x2457c5, 0, 0.35, 0);
  B(g, 0.42, 0.3, 0.02, C.glass, 0, 0.65, -0.23);
  B(g, 0.36, 0.22, 0.01, 0xf4f4f0, 0, 0.68, -0.235);
  B(g, 0.54, 0.06, 0.46, 0x1b3f8f, 0, 1.05, 0);
}
export function newsBox(g) {
  B(g, 0.52, 0.7, 0.44, 0x2457c5, 0, -0.35, 0);
  B(g, 0.42, 0.3, 0.02, C.glass, 0, -0.05, -0.23);
}
// Street vendor cart: a box on two wheels with a small striped parasol.
export function vendorCart(g) {
  B(g, 1.4, 0.75, 0.8, 0xf4f4f0, 0, 0.35, 0);
  B(g, 1.44, 0.08, 0.84, 0xd62f2a, 0, 1.1, 0);
  B(g, 1.4, 0.18, 0.02, 0xd62f2a, 0, 0.75, -0.41);
  for (const s of [-1, 1]) {
    const w = cyl(g, 0.3, 0.3, 0.08, C.rubber, s * 0.55, 0.3, 0.44, 8);
    w.rotation.x = Math.PI / 2;
  }
  B(g, 0.05, 0.05, 0.5, C.dark, 0.85, 0.85, 0).rotation.z = 0.3;
  cyl(g, 0.025, 0.025, 1.2, C.white, -0.5, 1.18, 0.2, 6);
  const c = add(g, new THREE.ConeGeometry(0.85, 0.35, 8), 0xf5c01a, -0.5, 2.4, 0.2);
  c.rotation.y = Math.PI / 8;
  for (let i = 0; i < 5; i++) ico(g, 0.09, [0xe8401c, 0xf5c01a, 0x5cb23a][i % 3], -0.45 + i * 0.22, 1.24, -0.1);
}
export function cartBody(g) {
  B(g, 1.4, 0.75, 0.8, 0xf4f4f0, 0, -0.35, 0);
  B(g, 1.44, 0.08, 0.84, 0xd62f2a, 0, 0.4, 0);
}
export function cartWheel(g) {
  const w = cyl(g, 0.3, 0.3, 0.08, C.rubber, 0, 0, 0, 8);
  w.rotation.x = Math.PI / 2;
}
export function cartShade(g) {
  const c = add(g, new THREE.ConeGeometry(0.85, 0.35, 8), 0xf5c01a, 0, 0, 0);
  c.rotation.y = Math.PI / 8;
  cyl(g, 0.025, 0.025, 1.2, C.white, 0, -1.22, 0, 6);
}

// ------------------------------------------------------------- parking --
export function shoppingCart(g) {
  for (const [x, z] of [[-0.25, -0.35], [0.25, -0.35], [-0.25, 0.35], [0.25, 0.35]]) cyl(g, 0.06, 0.06, 0.06, C.dark, x, 0, z, 6);
  for (const x of [-0.25, 0.25]) B(g, 0.03, 0.04, 0.8, 0x9da1a8, x, 0.08, 0);
  // Basket: wire walls (thin boxes), a red handle.
  B(g, 0.6, 0.03, 0.8, 0xb9bcc2, 0, 0.45, 0);
  for (const s of [-1, 1]) B(g, 0.02, 0.45, 0.8, 0xb9bcc2, s * 0.3, 0.45, 0);
  B(g, 0.6, 0.45, 0.02, 0xb9bcc2, 0, 0.45, -0.4);
  B(g, 0.6, 0.45, 0.02, 0xb9bcc2, 0, 0.45, 0.4);
  for (let i = 1; i < 4; i++) B(g, 0.62, 0.015, 0.82, 0xd0d3d8, 0, 0.45 + i * 0.11, 0);
  B(g, 0.66, 0.05, 0.05, 0xd62f2a, 0, 0.95, 0.47);
}
export function parkingSign(g) {
  cyl(g, 0.04, 0.04, 2.1, 0x9da1a8, 0, 0, 0, 6);
  B(g, 0.6, 0.6, 0.04, 0x2457c5, 0, 1.75, -0.04);
  B(g, 0.08, 0.38, 0.02, 0xffffff, -0.08, 1.86, -0.07);
  B(g, 0.2, 0.08, 0.02, 0xffffff, 0.03, 2.1, -0.07);
  B(g, 0.2, 0.08, 0.02, 0xffffff, 0.03, 1.94, -0.07);
  B(g, 0.08, 0.1, 0.02, 0xffffff, 0.11, 2.0, -0.07);
}
export function ticketMachine(g) {
  B(g, 0.5, 0.15, 0.4, 0x8f8a84, 0, 0, 0);
  B(g, 0.4, 1.3, 0.32, 0xf5c01a, 0, 0.15, 0);
  B(g, 0.3, 0.2, 0.02, C.glassDark, 0, 1.1, -0.17);
  B(g, 0.12, 0.05, 0.02, C.dark, 0, 0.75, -0.17);
}

// -------------------------------------------------------- construction --
export function toolTable(g) {
  // Sawhorse bench: a plank top on two A legs, tools on it.
  for (const x of [-0.7, 0.7])
    for (const s of [-1, 1]) {
      const l = B(g, 0.06, 0.85, 0.06, 0x9c6a3a, x, 0, s * 0.18);
      l.rotation.x = s * 0.22;
    }
  B(g, 1.7, 0.06, 0.6, 0xc9935a, 0, 0.82, 0);
  B(g, 0.5, 0.2, 0.25, 0xd62f2a, -0.4, 0.88, 0); // toolbox
  B(g, 0.06, 0.05, 0.45, C.dark, 0.35, 0.88, -0.05, 0.4); // a saw / bar
  B(g, 0.3, 0.12, 0.12, 0xf5c01a, 0.6, 0.88, 0.1); // drill
}
export function tablePlank(g) {
  B(g, 1.7, 0.06, 0.6, 0xc9935a, 0, 0, 0);
}
export function sawhorse(g) {
  for (const s of [-1, 1]) {
    const l = B(g, 0.06, 0.85, 0.06, 0x9c6a3a, 0, -0.42, s * 0.18);
    l.rotation.x = s * 0.22;
  }
  B(g, 0.08, 0.06, 0.5, 0x9c6a3a, 0, 0.4, 0);
}
// A stack of planks or steel bars strapped on bearers.
export function plankStack(g) {
  for (const x of [-0.8, 0.8]) B(g, 0.12, 0.1, 0.9, 0x6b4a2c, x, 0, 0);
  for (let l = 0; l < 4; l++) for (let i = 0; i < 4; i++) B(g, 2.2, 0.08, 0.18, l % 2 ? 0xd9a868 : 0xc9935a, 0, 0.1 + l * 0.09, -0.3 + i * 0.2);
  for (const x of [-0.5, 0.5]) B(g, 0.04, 0.46, 0.92, 0xd62f2a, x, 0.08, 0);
}
export function generator(g) {
  B(g, 1.0, 0.6, 0.6, 0xf0781e, 0, 0.12, 0);
  B(g, 1.06, 0.06, 0.66, C.dark, 0, 0.72, 0);
  for (const x of [-0.45, 0.45]) B(g, 0.06, 0.8, 0.06, C.dark, x, 0, 0.3);
  for (const x of [-0.45, 0.45]) B(g, 0.06, 0.8, 0.06, C.dark, x, 0, -0.3);
  B(g, 0.3, 0.3, 0.02, C.dark, 0.2, 0.3, -0.31);
}

// ------------------------------------------------------------ car wash --
export function supplyRack(g) {
  for (const x of [-0.6, 0.6]) for (const z of [-0.22, 0.22]) B(g, 0.05, 1.6, 0.05, 0x3a3940, x, 0, z);
  const cols = [0x2fa4e0, 0xe0367a, 0x5cb23a, 0xf5c01a];
  for (let l = 0; l < 3; l++) {
    B(g, 1.25, 0.04, 0.5, 0x8f8a84, 0, 0.3 + l * 0.5, 0);
    for (let i = 0; i < 5; i++) cyl(g, 0.07, 0.08, 0.28, cols[(i + l) % 4], -0.48 + i * 0.24, 0.34 + l * 0.5, (i % 2) * 0.12 - 0.06, 6);
  }
}
export function rackShelf(g) {
  for (const x of [-0.6, 0.6]) B(g, 0.05, 1.6, 0.05, 0x3a3940, x, -0.8, 0);
  for (let l = 0; l < 3; l++) B(g, 1.25, 0.04, 0.2, 0x8f8a84, 0, -0.5 + l * 0.5, 0);
}
// Car wash sign on an A-frame (blue, tinted white).
export function washSign(g) {
  for (const s of [-1, 1]) {
    const p = G(g, 0, 0, s * 0.24);
    p.rotation.x = s * 0.2;
    B(p, 0.9, 1.2, 0.05, 0x2fa4e0, 0, 0, 0);
    B(p, 0.7, 0.18, 0.02, 0xffffff, 0, 0.85, s * 0.03);
    for (let i = 0; i < 3; i++) ico(p, 0.08, 0xffffff, -0.2 + i * 0.2, 0.45 + (i % 2) * 0.12, s * 0.04);
  }
}
// Inflatable-style dancing tube man base and a vacuum post.
export function vacuum(g) {
  B(g, 0.6, 0.15, 0.6, 0x8f8a84, 0, 0, 0);
  B(g, 0.45, 1.2, 0.45, 0xe8401c, 0, 0.15, 0);
  B(g, 0.47, 0.12, 0.47, 0xf4f4f0, 0, 1.05, 0);
  const hose = cyl(g, 0.05, 0.05, 1.0, C.dark, 0.32, 0.9, 0, 6);
  hose.rotation.z = 0.8;
}
export function bucket(g) {
  cyl(g, 0.2, 0.16, 0.32, 0x2fa4e0, 0, 0, 0, 8);
  B(g, 0.36, 0.02, 0.02, C.dark, 0, 0.38, 0);
}

// ------------------------------------------------------------ bits --
export function paper(g) {
  B(g, 0.28, 0.01, 0.2, 0xf4f4f0, 0, 0, 0);
  B(g, 0.2, 0.012, 0.03, 0x3a3940, 0, 0, -0.05);
}
export function tool(g) {
  B(g, 0.32, 0.06, 0.06, 0x3a3940, 0, 0, 0);
  B(g, 0.1, 0.08, 0.08, 0xd62f2a, 0.12, 0, 0);
}
export function bottle(g) {
  cyl(g, 0.07, 0.08, 0.26, 0xffffff, 0, -0.13, 0, 6);
}
export function plank(g) {
  B(g, 1.6, 0.08, 0.18, 0xd9a868, 0, -0.04, 0);
}
export function shard(g) {
  B(g, 0.22, 0.04, 0.16, 0xc4683e, 0, -0.02, 0);
}

// Kind table entries (merged into furniture.js FLYERS). mass: how far it
// flies; breakAt: impact speed (m/s) that breaks it; shatter: pieces
// [kind, x, y, z] in its own frame; bits: small pieces sprayed out.
export const SMALL_FLYERS = {
  sandwichBoard: { build: sandwichBoard, tint: true, mass: 0.2, r: 0.4, side: 0.05, breakAt: 7, shatter: [["boardHalf", 0, 1.1, -0.2], ["boardHalf", 0, 1.1, 0.2]], bits: "paper", bitN: 3 },
  boardHalf: { build: boardHalf, mass: 0.15, r: 0.35, side: 0.04, spawnOnly: true, tintFrom: true },
  displayRack: { build: displayRack, mass: 0.45, r: 0.5, side: 0.25, breakAt: 6, shatter: [["rackFrame", 0, 1.4, 0]], bits: "bottle", bitN: 10, bounces: 2 },
  rackFrame: { build: rackFrame, mass: 0.35, r: 0.4, side: 0.1, spawnOnly: true, bounces: 2 },
  flowerPot: { build: flowerPot, mass: 0.6, r: 0.4, side: 0.34, breakAt: 6, hideOnBreak: true, bits: "shard", bitN: 8, bitsAlso: "fruit", bitsAlsoN: 4 },
  newsStand: { build: newsStand, mass: 0.6, r: 0.35, side: 0.22, breakAt: 8, shatter: [["newsBox", 0, 0.7, 0]], bits: "paper", bitN: 12, bounces: 2 },
  newsBox: { build: newsBox, mass: 0.5, r: 0.35, side: 0.22, spawnOnly: true, bounces: 2 },
  vendorCart: {
    build: vendorCart, mass: 1.3, r: 0.85, side: 0.4, breakAt: 6,
    shatter: [["cartBody", 0, 0.7, 0], ["cartShade", -0.5, 2.4, 0.2], ["cartWheel", -0.55, 0.3, 0.44], ["cartWheel", 0.55, 0.3, 0.44]],
    bits: "fruit", bitN: 8,
  },
  cartBody: { build: cartBody, mass: 0.9, r: 0.7, side: 0.4, spawnOnly: true, bounces: 1 },
  cartShade: { build: cartShade, mass: 0.25, r: 0.7, side: 0.3, spawnOnly: true },
  cartWheel: { build: cartWheel, mass: 0.2, r: 0.3, side: 0.08, spawnOnly: true, bounces: 3 },
  shoppingCart: { build: shoppingCart, mass: 0.4, r: 0.45, side: 0.3, flipLift: 1.0, bounces: 2 },
  parkingSign: { build: parkingSign, mass: 0.35, r: 0.25, side: 0.3 },
  ticketMachine: { build: ticketMachine, mass: 0.9, r: 0.35, side: 0.2, bits: "paper", bitN: 6 },
  toolTable: {
    build: toolTable, mass: 0.9, r: 0.9, side: 0.3, breakAt: 6,
    shatter: [["tablePlank", 0, 0.85, 0], ["sawhorse", -0.7, 0.42, 0], ["sawhorse", 0.7, 0.42, 0]],
    bits: "tool", bitN: 6,
  },
  tablePlank: { build: tablePlank, mass: 0.5, r: 0.8, side: 0.06, spawnOnly: true },
  sawhorse: { build: sawhorse, mass: 0.3, r: 0.3, side: 0.3, spawnOnly: true, bounces: 2 },
  plankStack: { build: plankStack, mass: 2.2, r: 1.0, side: 0.3, bits: "plank", bitN: 8 },
  generator: { build: generator, mass: 1.8, r: 0.6, side: 0.35, bits: "tool", bitN: 3 },
  supplyRack: { build: supplyRack, mass: 0.7, r: 0.65, side: 0.25, breakAt: 6, shatter: [["rackShelf", 0, 1.6, 0]], bits: "bottle", bitN: 14 },
  rackShelf: { build: rackShelf, mass: 0.5, r: 0.6, side: 0.1, spawnOnly: true, bounces: 2 },
  washSign: { build: washSign, mass: 0.25, r: 0.5, side: 0.06 },
  vacuum: { build: vacuum, mass: 0.8, r: 0.35, side: 0.22 },
  bucket: { build: bucket, tint: true, mass: 0.15, r: 0.25, side: 0.2, bounces: 3 },
};
export const SMALL_BITS = {
  paper: { build: paper, cap: 120 },
  tool: { build: tool, cap: 60 },
  bottle: { build: bottle, cap: 120, tint: true },
  plank: { build: plank, cap: 60 },
  shard: { build: shard, cap: 80 },
};
// Spawn-pool sizes of the break pieces.
export const SMALL_CAPS = { boardHalf: 24, rackFrame: 12, newsBox: 12, cartBody: 8, cartShade: 8, cartWheel: 16, tablePlank: 10, sawhorse: 20, rackShelf: 10 };
