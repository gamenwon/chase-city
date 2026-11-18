// Prop models for park features and outer-ring yards (angular low-poly,
// vivid colours). Each function builds one piece at the origin, standing
// on y = 0, front toward -z; the runtime bakes each into one geometry and
// draws all copies of a kind instanced.
import * as THREE from "three";
import { C, B, G, cyl, ico, add } from "./parts.js";

const BRONZE = 0x3f8a72, BRONZE_DARK = 0x2c6655;

export function plinth(g) {
  B(g, 1.4, 0.25, 1.4, 0xbfb6a6, 0, 0, 0);
  B(g, 1.1, 0.9, 1.1, C.stone, 0, 0.25, 0);
  B(g, 1.3, 0.12, 1.3, 0xbfb6a6, 0, 1.15, 0);
  B(g, 0.7, 0.18, 0.02, 0xd8b04a, 0, 0.65, -0.56); // plaque
}
// Bronze figure (origin at its feet, on the plinth top): heroic pose, one
// arm raised holding a torch.
export function statue(g) {
  B(g, 0.8, 0.12, 0.8, BRONZE_DARK, 0, 0, 0);
  for (const s of [-1, 1]) {
    const leg = B(g, 0.2, 0.9, 0.24, BRONZE, s * 0.14, 0.12, s * 0.06);
    leg.rotation.x = s * 0.12;
  }
  B(g, 0.5, 0.75, 0.3, BRONZE, 0, 1.0, 0);
  B(g, 0.56, 0.2, 0.34, BRONZE_DARK, 0, 1.0, 0); // belt / coat hem
  const armUp = B(g, 0.14, 0.75, 0.16, BRONZE, 0.32, 1.55, 0);
  armUp.rotation.z = -0.25;
  B(g, 0.14, 0.6, 0.16, BRONZE, -0.33, 1.15, 0);
  ico(g, 0.18, BRONZE, 0, 1.98, 0);
  cyl(g, 0.06, 0.04, 0.4, BRONZE_DARK, 0.48, 2.2, 0, 6);
  ico(g, 0.13, 0xf5c01a, 0.48, 2.68, 0);
}
export function sculptureA(g) {
  // Stacked tilted cubes in primary colours on a black base.
  B(g, 1.3, 0.3, 1.3, C.dark, 0, 0, 0);
  const cols = [C.red, C.yellow, C.blue];
  let y = 0.3;
  cols.forEach((c, i) => {
    const s = 0.95 - i * 0.18;
    const m = B(g, s, s, s, c, 0, y, 0, i * 0.5);
    m.rotation.x = i ? 0.35 : 0;
    m.rotation.z = i === 1 ? 0.3 : 0;
    y += s * 0.86;
  });
}
export function sculptureB(g) {
  // Tall twisted triangular blades (orange and white).
  B(g, 1.2, 0.25, 1.2, C.stone, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const m = add(g, new THREE.CylinderGeometry(0.08, 0.32, 2.8, 3), i % 2 ? C.white : C.orange, Math.cos(i * 2.1) * 0.3, 1.65, Math.sin(i * 2.1) * 0.3);
    m.rotation.set(Math.sin(i) * 0.2, i * 0.7, Math.cos(i) * 0.15);
  }
}
export function planter(g, broken = false) {
  const w = 2.2, d = 0.9;
  if (!broken) {
    B(g, w, 0.5, d, 0xd9cdb8, 0, 0, 0);
    B(g, w + 0.1, 0.08, d + 0.1, C.stone, 0, 0.5, 0);
    B(g, w - 0.25, 0.1, d - 0.25, C.soil, 0, 0.5, 0);
    for (let i = 0; i < 7; i++) {
      ico(g, 0.2, C.leaf[i % 3], -0.9 + i * 0.3, 0.75, 0.12 * ((i % 2) * 2 - 1));
      ico(g, 0.09, C.flower[i % 4], -0.9 + i * 0.3, 0.95, 0);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const m = B(g, 0.5 + (i % 2) * 0.3, 0.25 + (i % 3) * 0.08, 0.4, i % 2 ? 0xd9cdb8 : C.stone, -1.0 + i * 0.4, 0, (i % 3 - 1) * 0.35, i);
      m.rotation.z = (i % 2 ? 1 : -1) * 0.25;
    }
    B(g, 1.8, 0.05, 1.2, C.soil, 0, 0, 0.3);
    for (let i = 0; i < 5; i++) ico(g, 0.15, C.leaf[i % 3], -0.8 + i * 0.4, 0.12, 0.6 + (i % 2) * 0.2);
  }
}
export function kiosk(g, broken = false) {
  // Little stall: counter, painted walls, striped awning, roof with a sign.
  const w = 2.4, d = 2.0, h = 2.4;
  if (!broken) {
    B(g, w, 0.15, d, C.dark, 0, 0, 0);
    B(g, w, 1.0, d, C.teal, 0, 0.15, 0);
    B(g, w + 0.1, 0.08, 0.5, C.white, 0, 1.15, -d / 2 - 0.1); // counter
    for (const s of [-1, 1]) B(g, 0.12, h - 1.15, 0.12, C.white, s * (w / 2 - 0.06), 1.15, -d / 2 + 0.06);
    B(g, w, h - 1.15, 0.1, C.teal, 0, 1.15, d / 2 - 0.05);
    for (const s of [-1, 1]) B(g, 0.1, h - 1.15, d, C.teal, s * (w / 2 - 0.05), 1.15, 0);
    B(g, w - 0.3, 0.9, 0.04, C.glassDark, 0, 1.3, d / 2 - 0.12);
    // Awning: alternating red/white slats sloping out over the counter.
    for (let i = 0; i < 6; i++) {
      const sl = B(g, w / 6, 0.05, 0.9, i % 2 ? C.white : C.red, -w / 2 + w / 12 + (i * w) / 6, h - 0.15, -d / 2 - 0.35);
      sl.rotation.x = -0.35;
    }
    B(g, w + 0.3, 0.2, d + 0.3, C.white, 0, h, 0);
    B(g, w * 0.7, 0.45, 0.1, C.yellow, 0, h + 0.2, -d / 2 + 0.2);
    B(g, w * 0.5, 0.18, 0.02, C.red, 0, h + 0.32, -d / 2 + 0.14);
    // Goods on the counter.
    for (let i = 0; i < 4; i++) B(g, 0.25, 0.3, 0.2, [C.red, C.yellow, C.blue, C.green][i], -0.75 + i * 0.5, 1.23, -d / 2 - 0.1);
  } else {
    B(g, w, 0.15, d, C.dark, 0, 0, 0);
    B(g, w, 0.6, d - 0.4, C.teal, 0.1, 0.15, 0.2, 0.08);
    const wall = B(g, 0.1, 1.2, d, C.teal, -w / 2 - 0.6, 0.05, 0.2);
    wall.rotation.z = -1.45;
    const roof = B(g, w + 0.3, 0.2, d + 0.3, C.white, 0.4, 0.75, 0.3);
    roof.rotation.set(0.25, 0.2, -0.3);
    for (let i = 0; i < 6; i++) {
      const sl = B(g, w / 6, 0.05, 0.9, i % 2 ? C.white : C.red, -1.4 + i * 0.5, 0.05, -1.6 - (i % 2) * 0.3, i * 0.4);
      sl.rotation.z = 0.1;
    }
    for (let i = 0; i < 4; i++) B(g, 0.25, 0.3, 0.2, [C.red, C.yellow, C.blue, C.green][i], -0.9 + i * 0.6, 0, -2.2 + (i % 2) * 0.4, i);
  }
}
export function bikeRack(g) {
  for (let i = 0; i < 4; i++) {
    const x = -1.2 + i * 0.8;
    B(g, 0.06, 0.7, 0.06, C.metal, x, 0, -0.25);
    B(g, 0.06, 0.7, 0.06, C.metal, x, 0, 0.25);
    B(g, 0.06, 0.06, 0.56, C.metal, x, 0.7, 0);
  }
  // Two angular bikes leaning in the rack.
  [[-0.8, C.red], [0.8, C.blue]].forEach(([x, c]) => {
    const b = G(g, x, 0, 0, Math.PI / 2);
    for (const z of [-0.5, 0.5]) {
      const w = add(b, new THREE.TorusGeometry(0.3, 0.035, 4, 8), C.rubber, 0, 0.32, z);
      w.rotation.y = Math.PI / 2;
    }
    const fr = B(b, 0.05, 0.05, 0.9, c, 0, 0.55, 0);
    fr.rotation.x = 0.1;
    B(b, 0.05, 0.4, 0.05, c, 0, 0.32, -0.15);
    B(b, 0.2, 0.05, 0.12, C.dark, 0, 0.72, -0.15);
    B(b, 0.45, 0.04, 0.04, C.dark, 0, 0.82, 0.45);
  });
}
export function iceTruck(g, wrecked = false) {
  // Ice cream van: cab with windscreen, box body with a serving hatch and
  // awning, a giant cone on the roof, pastel-free bright pink and mint.
  const body = wrecked ? 0x4a3f44 : 0xe0367a, trim = wrecked ? 0x2f2a2e : 0x2fa36b, W = 2.0, L = 4.6;
  for (const z of [-1.45, 1.4])
    for (const s of [-1, 1]) {
      const w = cyl(g, 0.38, 0.38, 0.28, C.rubber, s * (W / 2 - 0.1), 0.38 - 0.14, z, 10);
      w.rotation.z = Math.PI / 2;
      w.position.y = wrecked ? 0.28 : 0.38;
    }
  const lift = wrecked ? -0.1 : 0;
  B(g, W, 0.9, L, body, 0, 0.35 + lift, 0);
  B(g, W, 1.3, 2.9, body, 0, 1.25 + lift, 0.75);
  B(g, W - 0.1, 0.7, 1.3, body, 0, 1.25 + lift, -1.4); // cab
  B(g, W - 0.3, 0.55, 0.05, C.glassDark, 0, 1.35 + lift, -2.06);
  for (const s of [-1, 1]) B(g, 0.04, 0.45, 0.8, C.glassDark, s * (W / 2 - 0.03), 1.4 + lift, -1.4);
  B(g, W + 0.04, 0.16, L + 0.04, trim, 0, 0.9 + lift, 0);
  B(g, W + 0.04, 0.14, 2.94, trim, 0, 2.42 + lift, 0.75);
  // Serving hatch (right side), counter, awning.
  B(g, 0.04, 0.8, 1.6, wrecked ? 0x141316 : 0xfff1c0, W / 2 + 0.01, 1.4 + lift, 0.8);
  B(g, 0.35, 0.06, 1.7, C.white, W / 2 + 0.18, 1.35 + lift, 0.8);
  if (!wrecked) {
    for (let i = 0; i < 5; i++) {
      const sl = B(g, 0.7, 0.04, 0.34, i % 2 ? C.white : 0x2fa36b, W / 2 + 0.3, 2.25, 0.12 + i * 0.34);
      sl.rotation.z = -0.35;
    }
    // Giant cone on the roof: wafer cone, three scoops, a cherry.
    const cone = add(g, new THREE.ConeGeometry(0.35, 0.9, 6), 0xd99a4a, 0, 3.15, 0.8);
    cone.rotation.x = Math.PI;
    ico(g, 0.38, 0xfff4cf, 0, 3.75, 0.8);
    ico(g, 0.3, 0xe0367a, 0.1, 4.08, 0.75);
    ico(g, 0.12, C.red, 0.12, 4.38, 0.75);
  } else {
    const cone = add(g, new THREE.ConeGeometry(0.35, 0.9, 6), 0x5a4a3a, 0.9, 2.62, 1.5);
    cone.rotation.z = 1.9;
  }
  B(g, W + 0.06, 0.22, 0.2, C.trim, 0, 0.35 + lift, -2.36);
  for (const s of [-1, 1]) B(g, 0.32, 0.14, 0.05, wrecked ? 0x3a3438 : 0xfff6d2, s * 0.65, 0.75 + lift, -2.33);
}
export function forklift(g) {
  // Small forklift: body, cab cage, mast and forks (front is -z).
  B(g, 1.2, 0.5, 2.0, C.yellow, 0, 0.3, 0);
  B(g, 1.0, 0.25, 0.7, C.dark, 0, 0.8, 0.5);
  for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.75], [0.5, 0.75]]) B(g, 0.07, 1.1, 0.07, C.dark, x, 0.8, z);
  B(g, 1.1, 0.07, 1.25, C.yellow, 0, 1.9, 0.18);
  for (const s of [-0.45, 0.45]) B(g, 0.08, 2.2, 0.08, C.dark, s, 0.2, -1.05);
  B(g, 1.0, 0.1, 0.08, C.dark, 0, 1.0, -1.05);
  for (const s of [-0.3, 0.3]) B(g, 0.12, 0.06, 1.0, C.dark, s, 0.12, -1.6);
  for (const [x, z] of [[-0.62, -0.6], [0.62, -0.6], [-0.62, 0.7], [0.62, 0.7]]) {
    const w = cyl(g, 0.3, 0.3, 0.22, C.rubber, x, 0.3, z, 8);
    w.rotation.z = Math.PI / 2;
  }
}
export function lampPole(g) {
  cyl(g, 0.22, 0.26, 0.5, C.stone, 0, 0, 0, 6);
  cyl(g, 0.08, 0.11, 6.2, C.dark, 0, 0.5, 0, 6);
  B(g, 1.6, 0.12, 0.12, C.dark, 0, 6.6, 0);
  for (const x of [-0.7, 0.7]) {
    B(g, 0.5, 0.18, 0.4, C.dark, x, 6.45, 0);
    B(g, 0.42, 0.04, 0.32, 0xfff1c0, x, 6.42, 0);
  }
}
export function cone(g) {
  B(g, 0.5, 0.06, 0.5, C.dark, 0, 0, 0);
  add(g, new THREE.CylinderGeometry(0.04, 0.2, 0.7, 6), C.orange, 0, 0.41, 0);
  add(g, new THREE.CylinderGeometry(0.11, 0.14, 0.12, 6), C.white, 0, 0.42, 0);
}
export function barrier(g) {
  // Plastic barrier: red and white blocks with feet.
  for (let i = 0; i < 4; i++) B(g, 0.5, 0.8, 0.45, i % 2 ? C.white : C.red, -0.75 + i * 0.5, 0.1, 0);
  for (const x of [-0.8, 0.8]) B(g, 0.3, 0.1, 0.8, C.dark, x, 0, 0);
  B(g, 2.0, 0.08, 0.5, C.white, 0, 0.9, 0);
}
export function crate(g) {
  B(g, 0.9, 0.9, 0.9, 0xc9935a, 0, 0, 0);
  for (const s of [-1, 1]) {
    B(g, 0.92, 0.1, 0.92, 0x9c6a3a, 0, s > 0 ? 0.78 : 0.02, 0);
    const brace = B(g, 0.08, 1.15, 0.02, 0x9c6a3a, 0, -0.12, s * 0.46);
    brace.rotation.z = 0.78;
    brace.position.y = 0.45 - 0.575;
  }
}
export function pallet(g) {
  for (let l = 0; l < 3; l++) {
    B(g, 1.2, 0.05, 1.0, 0xb98a55, 0, l * 0.18, 0);
    for (const x of [-0.5, 0, 0.5]) B(g, 0.12, 0.1, 1.0, 0x8f6a3e, x, l * 0.18 + 0.05, 0);
  }
  B(g, 1.0, 0.6, 0.8, l2c(), 0, 0.59, 0);
  B(g, 1.02, 0.08, 0.3, C.white, 0, 0.85, 0);
}
function l2c() {
  return 0x2457c5;
}
// Static yard decor (baked): parking bays, site cabin, containers, dirt
// pile, pipes. `y` is a yard from plan.js; pieces placed in its frame.
export function yardDecor(root, y) {
  const g = G(root, y.x, 0.03, y.z, y.ry);
  // Local axes: x = along (u), z = outward (v). Slab 0.02 thick.
  const TOP = 0.02;
  B(g, 19, 0.02, 12.2, y.kind === "parking" ? 0x4a494f : y.kind === "construction" ? 0x8a7a64 : 0x9a968e, 0, 0, 0);
  if (y.kind === "parking") {
    for (let b = 0; b <= 6; b++) B(g, 0.12, 0.01, 5.2, C.lineWhite, -9 + b * 3, TOP + 0.02, 3.2);
    for (let b = 0; b < 6; b++) B(g, 1.6, 0.14, 0.25, C.stone, -7.5 + b * 3, TOP, 5.6);
    B(g, 18, 0.01, 0.12, C.lineYellow, 0, TOP + 0.02, 0.4);
    for (const u of [-6, 0, 6]) {
      B(g, 1.6, 0.012, 0.3, C.lineWhite, u, TOP + 0.02, -2.4);
      const head = cyl(g, 0, 0.45, 0.012, C.lineWhite, u + 1.0, TOP + 0.02, -2.4, 3);
      head.rotation.y = -Math.PI / 2;
    }
    // Pay machine against the edge.
    B(g, 0.6, 1.5, 0.4, C.blue, 0, TOP, 5.8);
    B(g, 0.4, 0.3, 0.02, C.glassDark, 0, TOP + 1.0, 5.59);
  } else if (y.kind === "construction") {
    // Site cabin (solid, against the edge): raised, windows, door, steps.
    const cab = G(g, -6.0, TOP, 4.6);
    B(cab, 6.0, 0.3, 2.6, C.dark, 0, 0, 0);
    B(cab, 6.0, 2.3, 2.6, C.yellow, 0, 0.3, 0);
    B(cab, 6.1, 0.15, 2.7, C.white, 0, 2.6, 0);
    for (const x of [-1.8, 1.0]) B(cab, 1.2, 0.8, 0.04, C.glassDark, x, 1.3, -1.32);
    B(cab, 0.9, 1.9, 0.04, C.trim, 2.3, 0.35, -1.32);
    B(cab, 1.0, 0.3, 0.5, C.metal, 2.3, 0, -1.6);
    // Dirt pile (angular mound), pipe stack, rebar bundle, wheelbarrow.
    const pile = add(g, new THREE.ConeGeometry(2.0, 1.6, 6), 0x7a5a3a, 6.6, TOP + 0.8, 1.6);
    pile.scale.z = 0.7;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3 - i; j++) {
        const p = cyl(g, 0.3, 0.3, 3.0, C.orange, 0, 0, 0, 8);
        p.rotation.z = Math.PI / 2;
        p.position.set(-1.6 + 0 * i, TOP + 0.3 + i * 0.52, -0.2 + (j + i * 0.5) * 0.62);
        p.position.x = -1.8;
        p.position.z = 1.2 + (j + i * 0.5) * 0.62;
      }
    for (let i = 0; i < 6; i++) B(g, 3.2, 0.06, 0.06, 0x8a3b2a, 2.2, TOP + 0.06 * (i % 3), 1.4 + i * 0.12);
  } else {
    // Asphalt with yellow bay lines in front of the containers.
    for (const u of [-9, 0, 9]) B(g, 0.12, 0.01, 6, C.lineYellow, u, TOP + 0.02, 2.8);
  }
  // Containers (solid boxes in the layout): corrugated, doors, colours.
  const containers = y.kind === "construction" ? [3.8] : y.kind === "storage" ? [-5.2, 4.4] : [];
  containers.forEach((u, i) => {
    const c = G(g, u, TOP, 4.7);
    const col = [C.red, C.blue, C.green, C.orange][(Math.round(y.x + y.z) + i) & 3];
    B(c, 6.0, 2.5, 2.4, col, 0, 0, 0);
    for (let k = 0; k < 14; k++) B(c, 0.08, 2.3, 0.04, col, -2.8 + k * 0.43, 0.1, -1.22);
    for (const s of [-1, 1]) B(c, 0.06, 2.4, 2.42, C.dark, s * 2.98, 0.05, 0);
    B(c, 6.02, 0.12, 2.42, C.dark, 0, 2.4, 0);
  });
}

// ------------------------------------------------ outer-ring site props --
export function brush(g, broken = false) {
  // Car-wash roller: steel frame top, core, tufts of blue and red bristles.
  const h = 2.6;
  if (!broken) {
    B(g, 0.5, 0.25, 0.5, C.metal, 0, h + 0.3, 0);
    cyl(g, 0.06, 0.06, h + 0.3, C.metal, 0, 0.1, 0, 6);
    for (let k = 0; k < 7; k++)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k * 0.5;
        const t = B(g, 0.08, 0.32, 0.4, k % 2 ? 0x2457c5 : 0xd62f2a, Math.sin(a) * 0.24, 0.2 + k * 0.36, Math.cos(a) * 0.24, a);
        t.rotation.x = 0.2;
      }
  } else {
    // Snapped off and lying on the floor, tufts scattered.
    const r = G(g, 0, 0.3, 0, 0.4);
    r.rotation.z = Math.PI / 2;
    cyl(r, 0.06, 0.06, h, C.metal, 0, -h / 2, 0, 6);
    for (let k = 0; k < 6; k++) B(r, 0.42, 0.3, 0.42, k % 2 ? 0x2457c5 : 0xd62f2a, 0, -h / 2 + 0.2 + k * 0.4, 0, k);
    for (let i = 0; i < 8; i++) B(g, 0.1, 0.06, 0.35, i % 2 ? 0x2457c5 : 0xd62f2a, Math.cos(i) * 1.2, 0, Math.sin(i * 1.7) * 1.0, i);
  }
}
export function stall(g, broken = false) {
  // Market stall: trestle table with produce, four posts, striped awning,
  // name board.
  const w = 3.4, d = 1.8;
  const produce = [0xe8401c, 0xf5c01a, 0x5cb23a, 0xf0781e, 0x7a3fb8];
  if (!broken) {
    B(g, w, 0.08, d * 0.8, 0xc9935a, 0, 0.85, -0.1);
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) for (const z of [-d / 2 + 0.2, d / 2 - 0.4]) B(g, 0.08, 0.85, 0.08, 0x9c6a3a, x, 0, z);
    for (let i = 0; i < 5; i++) {
      B(g, 0.6, 0.18, 0.5, 0xb98a55, -1.3 + i * 0.65, 0.93, -0.25);
      for (let k = 0; k < 4; k++) ico(g, 0.1, produce[i], -1.42 + i * 0.65 + (k % 2) * 0.22, 1.16, -0.35 + Math.floor(k / 2) * 0.2);
    }
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) B(g, 0.08, 2.4, 0.08, C.white, x, 0, z);
    for (let i = 0; i < 6; i++) {
      const s = B(g, w / 6, 0.05, d + 0.6, i % 2 ? C.white : [C.red, C.blue, C.green][Math.abs(Math.round(i / 2)) % 3], -w / 2 + w / 12 + (i * w) / 6, 2.4, -0.1);
      s.rotation.x = 0.18;
    }
    B(g, w * 0.7, 0.4, 0.06, C.yellow, 0, 2.6, -d / 2 - 0.35);
  } else {
    // Awning down over the smashed table, posts snapped, produce spilled.
    const aw = G(g, 0.2, 0.6, 0.2, 0.15);
    aw.rotation.z = 0.35;
    for (let i = 0; i < 6; i++) B(aw, w / 6, 0.05, d + 0.6, i % 2 ? C.white : C.red, -w / 2 + w / 12 + (i * w) / 6, 0, 0);
    const tb = B(g, w, 0.08, d * 0.8, 0xc9935a, -0.3, 0.2, -0.3, 0.2);
    tb.rotation.x = 0.3;
    for (let i = 0; i < 4; i++) {
      const p = B(g, 0.08, 1.2, 0.08, C.white, -1.6 + i * 1.1, 0.05, -1.2 + (i % 2) * 1.8, i);
      p.rotation.z = 1.3;
    }
    for (let i = 0; i < 14; i++) ico(g, 0.1, produce[i % 5], Math.cos(i * 1.3) * (0.8 + (i % 4) * 0.5), 0.08, -1.2 + Math.sin(i * 2.1) * 1.3);
  }
}
export function booth(g, broken = false) {
  // Security booth: windows all round, flat roof with an overhang.
  B(g, 1.6, 0.2, 1.6, C.dark, 0, 0, 0);
  B(g, 1.5, 1.0, 1.5, C.white, 0, 0.2, 0);
  for (let f = 0; f < 4; f++) {
    const fg = G(g, 0, 0, 0, (f * Math.PI) / 2);
    B(fg, 1.2, 0.9, 0.04, broken ? 0x141316 : C.glass, 0, 1.25, 0.76);
    if (broken) for (let i = 0; i < 3; i++) B(fg, 0.3, 0.2, 0.03, C.glass, -0.45 + i * 0.45, 1.25 + (i % 2) * 0.5, 0.77, 0, i);
  }
  for (const [x, z] of [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.72], [0.72, 0.72]]) B(g, 0.08, 1.0, 0.08, C.dark, x, 1.2, z);
  const roof = B(g, 2.0, 0.2, 2.0, C.blue, 0, 2.2, 0);
  if (broken) {
    roof.rotation.z = 0.25;
    roof.position.y = 2.05;
  }
}
export function flagpole(g) {
  cyl(g, 0.12, 0.15, 0.3, C.stone, 0, 0, 0, 6);
  cyl(g, 0.04, 0.05, 6.0, C.chrome, 0, 0.3, 0, 6);
  ico(g, 0.08, C.yellow, 0, 6.35, 0);
  const fl = B(g, 1.4, 0.9, 0.03, C.red, 0.72, 5.2, 0);
  fl.rotation.y = 0.15;
  B(g, 1.4, 0.3, 0.035, C.yellow, 0.72, 5.5, 0);
}
