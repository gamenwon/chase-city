// Buildings on the outer edge, behind the open sites: a multi-storey car
// park, a car-wash hall, a half-built frame with a tower crane, and
// ordinary shop buildings, so the city's rim reads as more city instead of
// open grass. Each stands just outside the city edge (front wall at
// v = 6.5 in the site frame; the drivable area stops at |x|, |z| = 106), so
// nothing here is solid: no route, exit lane or police path is touched.
// Some sites are left without one (open sky between the buildings: not a
// wall round the map). Each building is baked into one static mesh.
import { buildingGroup } from "../../render/kit.js";
import { C, B, G, cyl, ico } from "./parts.js";

const FRONT = 6.5; // front wall, site frame (city edge is 6.25)

// Which sites get one (index in sitePlan order) and what kind.
//   parking 0, 7, 13, 20 · carwash 1, 12, 19 · construction 2, 9, 16, 22
export const PERIMETER = {
  0: "garage", 7: "shops", 20: "garage", // 13 left open
  1: "wash", 12: "wash", // 19 left open
  2: "frame", 16: "shops", 22: "frame", // 9 left open
};

export function perimeterBuilding(kind, seed) {
  const g = { garage, wash, frame, shops }[kind];
  return (parent) => g(parent, seed);
}

// Multi-storey car park: three open decks on columns, striped parapets,
// a ramp, parked cars, a tall blue P panel and a glazed pay office.
function garage(p, seed) {
  const w = 16, d = 10, lv = 3, H = 2.9;
  const g = G(p, 0, 0, FRONT + d / 2);
  for (let l = 0; l <= lv; l++) {
    const y = l * H;
    if (l) B(g, w, 0.3, d, 0xb9b4ac, 0, y, 0);
    if (l) for (const [z, r] of [[-d / 2, 0], [d / 2, 0]]) B(g, w, 0.8, 0.2, l % 2 ? 0xd9d4cb : 0xc9c5bd, 0, y + 0.3, z + (z < 0 ? 0.1 : -0.1), r);
    if (l && l < lv + 1) for (let i = 0; i < 8; i++) B(g, 0.9, 0.12, 0.03, i % 2 ? C.yellow : C.dark, -w / 2 + 1 + i * 2, y + 0.75, -d / 2 - 0.02);
  }
  for (let i = 0; i <= 4; i++) for (const z of [-d / 2 + 0.4, d / 2 - 0.4]) B(g, 0.4, lv * H, 0.4, 0xa8a39b, -w / 2 + 0.4 + i * ((w - 0.8) / 4), 0, z);
  // Ramp up the side, cars on the decks.
  const ramp = B(g, 3.2, 0.25, 7.5, 0x9f9c95, w / 2 + 1.7, H / 2, 0);
  ramp.rotation.x = 0.38;
  const cols = [C.red, C.blue, C.white, C.yellow, C.green, C.orange];
  for (let l = 1; l <= lv; l++)
    for (let i = 0; i < 5; i++) {
      if ((i + l + seed) % 3 === 0) continue;
      const x = -w / 2 + 1.8 + i * 3.1;
      B(g, 1.8, 0.7, 3.6, cols[(i * 2 + l + seed) % 6], x, l * H + 0.3, -1.6);
      B(g, 1.5, 0.5, 1.8, C.glassDark, x, l * H + 1.0, -1.4);
    }
  // Pay office with a glass front and an awning on the ground floor.
  B(g, 5, 2.6, 3.2, C.cream, -w / 2 + 2.6, 0, -d / 2 + 1.7);
  B(g, 4.4, 1.8, 0.04, C.glass, -w / 2 + 2.6, 0.4, -d / 2 + 0.08);
  const aw = B(g, 5.2, 0.08, 1.0, C.blue, -w / 2 + 2.6, 2.6, -d / 2 - 0.4);
  aw.rotation.x = -0.25;
  // Big P panel on a pylon at the corner.
  B(g, 0.5, lv * H + 3.5, 0.5, C.dark, w / 2 - 0.6, 0, -d / 2 - 0.3);
  B(g, 2.4, 2.8, 0.25, C.blue, w / 2 - 0.6, lv * H + 1.2, -d / 2 - 0.55);
  B(g, 0.4, 2.0, 0.05, C.white, w / 2 - 1.1, lv * H + 1.6, -d / 2 - 0.7);
  B(g, 1.0, 0.4, 0.05, C.white, w / 2 - 0.6, lv * H + 3.2, -d / 2 - 0.7);
  B(g, 1.0, 0.4, 0.05, C.white, w / 2 - 0.6, lv * H + 2.4, -d / 2 - 0.7);
  B(g, 0.4, 0.5, 0.05, C.white, w / 2 - 0.05, lv * H + 2.8, -d / 2 - 0.7);
}

// Car-wash hall: a long shed with a pitched blue roof, two open tunnel
// mouths (dark inside, brushes showing), a glazed shop corner with an
// awning, bubble sign on the roof, a jet-wash bay canopy at the side.
function wash(p, seed) {
  const w = 15, d = 8, h = 4.6;
  const g = G(p, 0, 0, FRONT + d / 2);
  B(g, w, h, d, 0xf4f4f0, 0, 0, 0);
  B(g, w + 0.4, 0.4, d + 0.4, 0x2fa4e0, 0, h, 0);
  for (const s of [-1, 1]) {
    const r = B(g, w + 0.6, 0.25, d / 2 + 0.6, 0x2471b8, 0, h + 0.4 + 0.9, s * (d / 4));
    r.rotation.x = s * -0.42;
  }
  // Tunnel mouths with brushes inside.
  for (const x of [-3.4, 1.6]) {
    B(g, 3.4, 3.4, 0.05, 0x141316, x, 0.05, -d / 2 - 0.02);
    B(g, 3.8, 0.3, 0.2, 0x2fa4e0, x, 3.45, -d / 2 - 0.1);
    for (const s of [-1, 1]) cyl(g, 0.45, 0.45, 2.8, s > 0 ? 0x2fa4e0 : 0xe0367a, x + s * 1.1, 0.2, -d / 2 + 0.6, 8);
    for (let i = 0; i < 5; i++) B(g, 0.6, 0.06, 0.04, i % 2 ? C.yellow : C.dark, x - 1.2 + i * 0.6, 3.25, -d / 2 - 0.08);
  }
  // Shop corner.
  B(g, 3.6, 2.6, 0.04, C.glass, w / 2 - 2.2, 0.3, -d / 2 - 0.03);
  B(g, 0.9, 2.3, 0.05, C.trim, w / 2 - 0.7, 0.3, -d / 2 - 0.05);
  const aw = B(g, 4.2, 0.08, 1.1, C.yellow, w / 2 - 2.2, 3.0, -d / 2 - 0.5);
  aw.rotation.x = -0.25;
  B(g, 3.8, 0.5, 0.08, 0x2fa4e0, w / 2 - 2.2, 3.5, -d / 2 - 0.08);
  // Bubble sign on the roof.
  B(g, 0.25, 2.2, 0.25, C.dark, -w / 2 + 2, h + 0.4, -1);
  B(g, 4.2, 1.5, 0.3, 0x2fa4e0, -w / 2 + 2, h + 2.4, -1);
  for (let i = 0; i < 5; i++) ico(g, 0.25 + (i % 3) * 0.12, C.white, -w / 2 + 0.6 + i * 0.75, h + 3.2 + (i % 2) * 0.5, -1.2);
  // Jet-wash bays: a flat canopy on posts at the side, a coin post.
  for (const [x, z] of [[-w / 2 - 3.6, -d / 2 + 0.5], [-w / 2 - 0.4, -d / 2 + 0.5], [-w / 2 - 3.6, d / 2 - 0.5]]) B(g, 0.25, 3.6, 0.25, 0xb9bcc2, x, 0, z);
  B(g, 4.0, 0.3, d, 0x2fa4e0, -w / 2 - 2, 3.6, 0);
  B(g, 0.5, 1.2, 0.4, C.yellow, -w / 2 - 2, 0, -d / 2 + 1.2);
  if (seed % 2) B(g, 2, 0.9, 0.1, C.red, w / 2 - 2.2, h + 0.4, -d / 2); // rooftop banner
}

// Half-built block: a concrete frame (slabs on columns), the two lower
// floors walled and glazed, scaffolding up one side with orange nets, a
// site hoarding in front and a yellow tower crane.
function frame(p, seed) {
  const w = 13, d = 9, fl = 5, H = 3.1;
  const g = G(p, 0, 0, FRONT + 0.6 + d / 2);
  for (let l = 1; l <= fl; l++) B(g, w, 0.3, d, 0xb9b4ac, 0, l * H, 0);
  for (let i = 0; i <= 3; i++) for (let k = 0; k <= 2; k++) B(g, 0.4, fl * H, 0.4, 0xa8a39b, -w / 2 + 0.3 + i * ((w - 0.6) / 3), 0, -d / 2 + 0.3 + k * ((d - 0.6) / 2));
  for (let l = 0; l < 2; l++) {
    B(g, w - 0.2, H - 0.3, 0.2, l ? 0x6fa8c8 : C.cream, 0, l * H + 0.3, -d / 2 + 0.2);
    for (let i = 0; i < 4; i++) B(g, 1.8, 1.4, 0.04, C.glass, -w / 2 + 1.8 + i * 3.1, l * H + 1.0, -d / 2 + 0.08);
  }
  // Scaffolding on the left with nets.
  for (let l = 0; l < fl; l++) {
    for (const z of [-d / 2 - 0.2, d / 2 + 0.2]) B(g, 1.3, 0.05, 0.05, 0x9da1a8, -w / 2 - 0.6, (l + 1) * H, z);
    B(g, 1.2, 0.06, d, 0xc9935a, -w / 2 - 0.6, (l + 1) * H - 0.05, 0);
  }
  for (const [x, z] of [[-w / 2 - 1.2, -d / 2 - 0.2], [-w / 2, -d / 2 - 0.2], [-w / 2 - 1.2, d / 2 + 0.2]]) B(g, 0.06, fl * H + 1, 0.06, 0x9da1a8, x, 0, z);
  B(g, 0.03, fl * H - 1, d * 0.7, C.orange, -w / 2 - 1.25, 1.5, -0.5);
  // Hoarding along the front (low, painted), with a gate.
  for (let i = 0; i < 6; i++) if (i !== 3) B(g, 2.1, 2.0, 0.08, i % 2 ? 0x2fa36b : 0xf4f4f0, -w / 2 + 1.1 + i * 2.2, 0, -d / 2 - 0.5);
  // Tower crane: lattice mast (a box with braces), jib, counter-jib,
  // counterweight, operator cab, hook.
  const cx = w / 2 + 2.2, top = fl * H + 9;
  B(g, 1.0, top, 1.0, C.yellow, cx, 0, 1);
  for (let y = 1.5; y < top; y += 3) for (const s of [-1, 1]) B(g, 1.05, 0.08, 1.05, s > 0 ? C.dark : C.yellow, cx, y + s * 0.6, 1);
  B(g, 1.6, 1.2, 1.6, C.yellow, cx, top, 1);
  B(g, 1.1, 1.0, 1.1, C.glassDark, cx + 0.6, top + 0.1, 0.1);
  const jibLen = 18 + (seed % 3) * 2;
  B(g, jibLen, 0.7, 0.7, C.yellow, cx - jibLen / 2 + 1, top + 1.2, 1);
  B(g, 6, 0.6, 0.7, C.yellow, cx + 3.6, top + 1.2, 1);
  B(g, 2.2, 1.6, 1.2, 0x8f8a84, cx + 5.6, top + 0.2, 1);
  B(g, 0.2, 3.2, 0.2, C.dark, cx, top + 1.9, 1);
  B(g, 0.05, 7, 0.05, C.dark, cx - jibLen + 6, top - 5.8, 1);
  B(g, 0.6, 0.5, 0.6, C.orange, cx - jibLen + 6, top - 6.3, 1);
}

// Two ordinary shop buildings of the city's own kind (shopfronts on the
// side facing the city), different heights, with a gap between them.
function shops(p, seed) {
  const list = [
    { x: -5.0, w: 8, d: 8, h: 8 + (seed % 5) },
    { x: 5.2, w: 7, d: 9, h: 12 + (seed % 4) },
  ];
  list.forEach((b, i) => {
    const grp = buildingGroup({ w: b.w, d: b.d, h: b.h }, seed + i * 3, [0, -1]);
    grp.position.set(b.x, -0.37, FRONT + b.d / 2);
    p.add(grp);
  });
}
