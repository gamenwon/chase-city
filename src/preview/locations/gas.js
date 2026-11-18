// Gas station: concrete forecourt, canopy on columns over two pump
// islands (two pumps each), convenience store, price pylon. Hitting an
// island makes it explode (see runtime.js); the wrecked island, the
// slumped canopy, scorch marks and blown-in shop glass stay until restart.
import * as THREE from "three";
import { C, B, G, cyl, add, bake, signBoard, pieceMesh } from "./parts.js";
import { GAS, GAS_PLAN } from "./layout.js";

const TOP = 0.4;

function pump(g, broken = false) {
  // Plinth, body, brand head with price displays both sides, keypads,
  // three nozzles in holsters each side with hoses looping from the head.
  B(g, 1.0, 0.15, 0.8, 0x4a4850, 0, 0, 0);
  if (broken) {
    B(g, 0.9, 0.55, 0.7, 0x2b2729, 0, 0.15, 0);
    B(g, 0.5, 0.3, 0.5, 0x1f1c1e, 0.12, 0.7, 0.05, 0.4);
    return;
  }
  B(g, 0.9, 1.3, 0.7, C.white, 0, 0.15, 0);
  B(g, 0.92, 0.55, 0.72, C.red, 0, 1.45, 0);
  B(g, 0.94, 0.08, 0.74, C.yellow, 0, 1.45, 0);
  for (const s of [-1, 1]) {
    B(g, 0.6, 0.3, 0.02, C.glassDark, 0, 1.0, s * 0.36);
    B(g, 0.4, 0.08, 0.02, 0x5cf07a, 0, 1.08, s * 0.371);
    B(g, 0.22, 0.16, 0.03, 0x8f8f94, 0.25, 0.7, s * 0.365);
    [C.yellow, C.green, C.trim].forEach((c, i) => {
      const z = -0.2 + i * 0.2;
      B(g, 0.06, 0.24, 0.12, c, s * 0.48, 0.75, z);
      const curve = new THREE.CatmullRomCurve3(
        [[s * 0.3, 1.75, z], [s * 0.72, 1.5, z], [s * 0.8, 0.75, z], [s * 0.52, 0.86, z]].map(([x, y, zz]) => new THREE.Vector3(x, y, zz)),
      );
      add(g, new THREE.TubeGeometry(curve, 8, 0.045, 5, false), C.rubber);
    });
  }
}
function island(g, wrecked) {
  // Kerb island 6.4 x 1.2 with striped nose ends, a column on each end
  // (canopy supports), guard bollards, a bin with a squeegee.
  B(g, 6.4, 0.3, 1.2, wrecked ? 0x7d7a74 : C.curb, 0, 0, 0);
  for (const ex of [-1, 1]) {
    for (let i = 0; i < 4; i++) B(g, 0.6, 0.3, 0.3, i % 2 ? C.trim : C.yellow, ex * 3.05, 0, -0.45 + i * 0.3);
    // Column on a stone plinth with a red sleeve.
    B(g, 0.8, 0.5, 0.8, wrecked ? 0x6d6a66 : C.stone, ex * 2.45, 0.3, 0);
    if (!wrecked) {
      B(g, 0.45, 4.0, 0.45, 0xdfe3e8, ex * 2.45, 0.8, 0);
      B(g, 0.5, 0.45, 0.5, C.red, ex * 2.45, 1.6, 0);
    } else {
      const stub = B(g, 0.45, 1.6, 0.45, 0x8a8d93, ex * 2.45, 0.8, 0);
      stub.rotation.z = ex * 0.35;
    }
    for (const bz of [-0.42, 0.42]) {
      const bol = cyl(g, 0.09, 0.09, 0.9, C.yellow, ex * 3.15, 0.3, bz, 6);
      if (wrecked) {
        bol.rotation.set(bz, 0, ex * 1.2);
        bol.position.y = 0.55;
      }
    }
  }
  B(g, 0.45, 0.75, 0.38, C.green, 0, 0.3, 0);
  if (!wrecked) cyl(g, 0.16, 0.13, 0.35, C.blue, 0, 1.05, 0, 6);
  for (const px of [-1.3, 1.3]) pump(G(g, px, 0.3, 0), wrecked);
  if (wrecked) {
    // Scorch: irregular dark patches round the island, a black heart.
    for (const [sx, sz, r] of [[0, 0, 3.6], [1.8, 0.9, 2.2], [-2.2, -0.8, 2.4], [0.6, -1.6, 1.8]]) {
      const s = cyl(g, r, r, 0.02, C.ash, sx, -0.28, sz, 7);
      s.rotation.y = r;
    }
    cyl(g, 1.9, 1.5, 0.03, C.scorch, -0.3, -0.27, 0.2, 7);
  }
}
function canopyDeck(g, plan) {
  const { w, d } = plan;
  B(g, w, 0.3, d, C.white, 0, 0, 0);
  B(g, w - 0.3, 0.1, d - 0.3, 0x8a8781, 0, 0.3, 0);
  // Fascia: red band round the edge with a yellow stripe (4 pieces each).
  const band = (h, out, c, y) => {
    B(g, w + 2 * out, h, out, c, 0, y, d / 2 + out / 2);
    B(g, w + 2 * out, h, out, c, 0, y, -d / 2 - out / 2);
    B(g, out, h, d, c, w / 2 + out / 2, y, 0);
    B(g, out, h, d, c, -w / 2 - out / 2, y, 0);
  };
  band(1.0, 0.12, C.red, -0.3);
  band(0.14, 0.16, C.yellow, 0.42);
  for (let i = -2; i <= 2; i++)
    for (const lz of [-2.4, 0, 2.4]) B(g, 1.0, 0.04, 0.5, 0xfff4cf, i * 2.1, -0.04, lz);
}
function mart(g, plan) {
  const { w, d, h } = plan;
  B(g, w, 0.4, d, 0x5b5960, 0, 0, 0);
  B(g, w, h - 0.4, d, C.white, 0, 0.4, 0);
  B(g, w + 0.1, 0.9, d + 0.1, C.red, 0, h, 0);
  // Yellow stripe round the band (outside it, no overlap) and a parapet.
  for (const s of [-1, 1]) {
    B(g, w + 0.42, 0.16, 0.16, C.yellow, 0, h + 0.62, s * (d / 2 + 0.13));
    B(g, 0.16, 0.16, d + 0.1, C.yellow, s * (w / 2 + 0.13), h + 0.62, 0);
    B(g, w + 0.1, 0.35, 0.18, C.white, 0, h + 0.9, s * (d / 2 - 0.04));
    B(g, 0.18, 0.35, d - 0.26, C.white, s * (w / 2 - 0.04), h + 0.9, 0);
  }
  B(g, w - 0.4, 0.04, d - 0.4, 0x8a8781, 0, h + 0.9, 0);
  for (const ux of [-3.5, -1.0]) {
    B(g, 1.5, 0.8, 1.1, 0xcfd0d4, ux, h + 0.94, -0.8);
    cyl(g, 0.3, 0.3, 0.05, 0x6a6a70, ux, h + 1.74, -0.8, 8);
  }
  // Storefront frame in front of the glass (glass is a separate piece).
  const fz = d / 2 + 0.02;
  B(g, 11.0, 0.12, 0.14, 0xb9bcc2, -0.5, 0.4, fz);
  B(g, 11.0, 0.12, 0.14, 0xb9bcc2, -0.5, 2.9, fz);
  for (let i = 0; i <= 6; i++) if (i !== 3) B(g, 0.1, 2.38, 0.14, 0xb9bcc2, -6 + i * 1.83, 0.52, fz);
  // Sliding door bay (between mullions 2 and 4), header and frame.
  B(g, 1.9, 0.1, 0.16, 0x7a7d84, -0.51, 2.95, fz + 0.02);
  for (const s of [-1, 1]) B(g, 0.08, 2.38, 0.16, 0x7a7d84, -0.51 + s * 0.9, 0.52, fz + 0.02);
  for (const lx of [-1.1, 0.1]) B(g, 0.5, 0.12, 0.3, 0xfff1c0, lx, 3.2, fz + 0.15);
  // Side windows on the shop's west and east faces.
  for (const s of [-1, 1]) {
    B(g, 0.03, 1.4, 2.4, C.glass, s * (w / 2 + 0.015), 1.3, 0);
    B(g, 0.12, 0.1, 2.7, 0xb9bcc2, s * (w / 2 + 0.06), 1.2, 0);
    B(g, 0.12, 0.1, 2.7, 0xb9bcc2, s * (w / 2 + 0.06), 2.7, 0);
  }
  // Front kit: ice chest, vending machine, bench (inside the shop's box).
  const ice = G(g, 3.4, 0, fz + 0.45);
  B(ice, 1.6, 1.2, 0.8, C.white, 0, 0, 0);
  B(ice, 1.62, 0.2, 0.82, C.blue, 0, 1.2, 0);
  B(ice, 1.2, 0.3, 0.02, C.blue, 0, 0.6, 0.41);
  const vend = G(g, 5.6, 0, fz + 0.42);
  B(vend, 1.0, 1.9, 0.8, C.red, 0, 0, 0);
  B(vend, 0.6, 1.2, 0.02, C.glassDark, -0.12, 0.5, 0.41);
  B(vend, 0.15, 0.6, 0.02, 0xe0e0e0, 0.35, 0.9, 0.41);
  const bench = G(g, -4.6, 0, fz + 0.45, Math.PI);
  for (const s of [-0.8, 0.8]) B(bench, 0.08, 0.45, 0.5, C.dark, s, 0, 0);
  B(bench, 1.9, 0.08, 0.55, C.blue, 0, 0.45, 0);
}
function storefrontGlass(broken) {
  return pieceMesh((g) => {
    if (!broken) {
      for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) B(g, 1.72, 2.38, 0.03, C.glass, -6 + 0.915 + i * 1.83, 0.52, 0);
      for (const dx of [-0.45, 0.45]) B(g, 0.86, 2.38, 0.03, 0x4f6a7a, -0.51 + dx, 0.52, 0.02);
      for (const [px, c] of [[-5.1, C.yellow], [-3.2, C.blue], [1.8, C.orange], [3.6, C.green]]) B(g, 1.1, 0.85, 0.02, c, px, 1.5, 0.03);
    } else {
      // Glass gone: dark interior, jagged edges left in the frames.
      B(g, 10.9, 2.38, 0.03, 0x141316, -0.5, 0.52, -0.02);
      for (let i = 0; i < 7; i++) {
        const t = B(g, 0.5, 0.25 + (i % 3) * 0.15, 0.03, C.glass, -5.6 + i * 1.83, 0.52, 0);
        t.rotation.z = (i % 2 ? 1 : -1) * 0.5;
      }
    }
  });
}

export function buildGas(scene) {
  const root = new THREE.Group();
  root.position.set(GAS.x, 0, GAS.z);
  scene.add(root);
  const s = new THREE.Group();
  // Forecourt: concrete slabs with joints, drains, tank caps, oil stains,
  // lane arrows under the canopy.
  B(s, 18.4, 0.1, 18.4, C.concrete, 0, 0.3, 0);
  for (let v = -6; v <= 6; v += 3) {
    B(s, 0.05, 0.01, 18.4, C.concreteJoint, v, TOP, 0);
    B(s, 18.4, 0.01, 0.05, C.concreteJoint, 0, TOP, v);
  }
  for (const [x, z] of [[-7.5, 3.6], [5.6, 3.6]]) {
    B(s, 1.4, 0.012, 0.5, 0x2b2a2e, x, TOP, z);
    for (let i = 0; i < 6; i++) B(s, 0.06, 0.014, 0.5, 0x55535c, x - 0.6 + i * 0.24, TOP, z);
  }
  for (let i = 0; i < 4; i++) {
    cyl(s, 0.32, 0.32, 0.02, 0x55535c, 6.0 + i * 0.9, TOP, -1.4, 8);
    cyl(s, 0.2, 0.2, 0.025, [C.red, C.yellow, C.blue, C.green][i], 6.0 + i * 0.9, TOP, -1.4, 8);
  }
  for (const [x, z, r] of [[-3.0, 3.4, 1.0], [0.8, 3.9, 0.8], [-0.4, 8.2, 0.6]]) {
    const o = cyl(s, r, r * 0.8, 0.01, 0x6e6a66, x, TOP, z, 7);
    o.scale.z = 0.6;
  }
  for (const az of [3.6]) {
    B(s, 2.2, 0.012, 0.35, C.white, -6.6, TOP, az);
    const head = cyl(s, 0, 0.6, 0.012, C.white, -5.2, TOP, az, 3);
    head.rotation.y = -Math.PI / 2;
  }
  const mp = GAS_PLAN.mart;
  mart(G(s, mp.x, TOP, mp.z), mp);
  signBoard(s, "24 MART", 5, 0.7, mp.x - 0.5, TOP + mp.h + 0.45, mp.z + mp.d / 2 + 0.12, 0, "#d62f2a", "#ffffff");
  // Price pylon: plinth, posts, brand head, price rows (both faces).
  const py = GAS_PLAN.pylon;
  const pylon = G(s, py.x, TOP, py.z, 0);
  B(pylon, 2.6, 0.6, 0.9, C.stone, 0, 0, 0);
  for (const sx of [-1.0, 1.0]) B(pylon, 0.28, 4.4, 0.28, C.metal, sx, 0.6, 0);
  B(pylon, 2.5, 3.4, 0.45, C.white, 0, 3.0, 0);
  B(pylon, 2.6, 0.95, 0.5, C.red, 0, 6.4, 0);
  for (const f of [1, -1]) {
    signBoard(pylon, "GAS", 2.0, 0.6, 0, 6.9, f * 0.27, f > 0 ? 0 : Math.PI, "#d62f2a", "#ffe14a");
    ["REG 3.49", "PLUS 3.69", "DSL 3.89"].forEach((t, i) =>
      signBoard(pylon, t, 2.2, 0.62, 0, 5.6 - i * 0.9, f * 0.25, f > 0 ? 0 : Math.PI, "#232227", i === 2 ? "#5cb23a" : "#ffe14a"),
    );
  }
  const staticMesh = bake(s);
  root.add(staticMesh);

  // Dynamic: islands (intact and wrecked), canopy deck, shop glass.
  const islands = GAS_PLAN.islands.map((ip, k) => {
    const intact = pieceMesh((g) => island(g, false));
    const wrecked = pieceMesh((g) => island(g, true));
    for (const m of [intact, wrecked]) {
      m.position.set(ip.x, TOP, ip.z);
      root.add(m);
    }
    wrecked.visible = false;
    return { k, x: GAS.x + ip.x, z: GAS.z + ip.z, local: ip, intact, wrecked, state: "intact" };
  });
  const cp = GAS_PLAN.canopy;
  // The deck hangs from a pivot on its north or south edge so it can slump
  // toward whichever island blew up.
  const deck = pieceMesh((g) => canopyDeck(g, cp));
  const pivot = new THREE.Group();
  pivot.position.set(cp.x, TOP + cp.h + 0.3, cp.z);
  pivot.add(deck);
  root.add(pivot);
  // Canopy signs ride on the pivot with the deck (their boards are baked
  // into one mesh, their faces into one atlas).
  const signs = new THREE.Group();
  signBoard(signs, "GAS • 24H", 5.0, 0.56, 0, -0.22, cp.d / 2 + 0.2, 0, "#d62f2a", "#ffffff");
  signBoard(signs, "GAS", 2.4, 0.56, -cp.w / 2 - 0.2, -0.22, 0, -Math.PI / 2, "#d62f2a", "#ffe14a");
  pivot.add(bake(signs));
  const canopySigns = signs;
  const glass = storefrontGlass(false);
  const glassBroken = storefrontGlass(true);
  for (const m of [glass, glassBroken]) {
    m.position.set(mp.x, TOP, mp.z + mp.d / 2 + 0.035);
    root.add(m);
  }
  glassBroken.visible = false;
  // Bins at the forecourt edge (breakable, drawn instanced by runtime.js).
  const bins = [
    { x: GAS.x + 6.8, z: GAS.z + 0.6, ry: 0 },
    { x: GAS.x - 8.0, z: GAS.z - 1.6, ry: Math.PI / 2 },
  ];
  return { root, islands, canopy: { pivot, deck, plan: cp, signs: canopySigns, tilt: 0 }, glass, glassBroken, bins };
}
