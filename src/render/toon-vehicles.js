// Stylized vehicle collection (art direction: exaggerated cartoon toys).
// Short wheelbases, wheels pushed to the corners and oversized, tall or
// squashed cabins with big windows, chunky bumpers and lamps, one strong
// signature feature each (racing stripes, a huge wing, a roof light bar, a
// giant ice-cream cone). Built from simple shapes and baked like every
// game car (kit.js bakeVehicle): one painted body mesh, one mesh per lamp
// material, one per wheel (wheels keep their groups: they spin and steer).
// Front is -z; footprint fits the game's car shape after CAR_SCALE.
import * as THREE from "three";
import { K, B, add, slant, bakeVehicle, scaled } from "./kit.js";

const GLASS = 0x2d4a66;
const SHINE = 0xbfe6ff;
const LAMP = { emissive: 0xfff0c0, emissiveIntensity: 0.6 };
const TAIL = { emissive: 0xb0101c, emissiveIntensity: 0.45 };

function cyl(p, r, len, c, x, y, z, axis = "x", seg = 14, o) {
  const m = add(p, new THREE.CylinderGeometry(r, r, len, seg), c, x, y, z, o);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  return m;
}
// A chunky cartoon wheel: fat tyre, big coloured rim, hub; optional tread.
function wheel(p, x, z, r, w, rim, tread = false) {
  const g = new THREE.Group();
  g.position.set(x, r, z);
  g.rotation.order = "YXZ";
  p.add(g);
  const s = Math.sign(x) || 1;
  cyl(g, r, w, K.rubber, 0, 0, 0, "x", 16);
  cyl(g, r * 0.62, w + 0.04, rim, s * 0.01, 0, 0, "x", 12);
  cyl(g, r * 0.22, w + 0.1, K.chrome, s * 0.02, 0, 0, "x", 8);
  if (tread)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lug = add(g, new THREE.BoxGeometry(w + 0.04, 0.12, 0.2), 0x161519, 0, Math.sin(a) * r, Math.cos(a) * r);
      lug.rotation.x = -a;
    }
  (p.userData.wheels ||= []).push(g);
  return g;
}
// Big glass panes with a cartoon highlight stripe.
function pane(p, w, h, x, y, z, ry = 0, tilt = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(tilt, ry, 0, "YXZ");
  p.add(g);
  add(g, new THREE.BoxGeometry(w, h, 0.04), GLASS, 0, 0, 0, { roughness: 0.15 });
  const s = add(g, new THREE.BoxGeometry(w * 0.16, h * 0.9, 0.05), SHINE, -w * 0.2, 0, 0.005, { roughness: 0.15 });
  s.rotation.z = 0.5;
  return g;
}
function roundLamp(p, r, x, y, z, color = 0xfff6d2, o = LAMP) {
  cyl(p, r + 0.05, 0.1, K.chrome, x, y, z, "z", 14);
  cyl(p, r, 0.12, color, x, y, z - 0.01, "z", 14, o);
}
function textSign(text, bg, fg, w, h) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = `900 ${Math.round(c.height * 0.62)}px "Arial Black", Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// ---------------------------------------------------------------- 01 MINI
// A tall bubbly hatch: wheels at the corners, a cabin almost as tall as
// the body is long, a white roof, twin white racing stripes, big round
// eyes for headlamps.
export function miniCar() {
  const g = new THREE.Group();
  const RED = 0xd8262c, W = 2.08, L = 3.1, r = 0.52, clear = 0.32;
  const belt = clear + 0.62;
  // Body with a short bonnet sloping down to a round nose.
  B(g, W, 0.48, L - 0.1, RED, 0, clear, 0);
  B(g, W, 0.14, L - 0.9, RED, 0, clear + 0.48, 0.38);
  slant(g, 0, { y: clear + 0.36, z: -L / 2 + 0.02 }, { y: belt, z: -0.46 }, W, 0.22, RED);
  for (const s of [-1, 1]) slant(g, s * (W / 2 - 0.08), { y: clear + 0.36, z: -L / 2 + 0.06 }, { y: belt - 0.04, z: -0.5 }, 0.16, 0.24, RED);
  for (const z of [-1.0, 1.0]) {
    for (const s of [-1, 1]) B(g, 0.2, 0.18, r * 2.4, K.trim, s * (W / 2 + 0.02), 2 * r - 0.1, z); // flares
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.1), z, r, 0.44, 0xf4f4f0);
  }
  // Tall cabin, big windows.
  const roof = 2.28, zf = -0.46, zr = 1.4;
  slant(g, 0, { y: belt, z: zf }, { y: roof - 0.06, z: zf + 0.34 }, W - 0.22, 0.08, RED);
  pane(g, W - 0.44, roof - belt - 0.22, 0, (belt + roof) / 2 - 0.05, zf + 0.15, 0, -0.3);
  B(g, W - 0.12, 0.16, zr - zf - 0.2, 0xf4f4f0, 0, roof - 0.08, (zf + zr) / 2 + 0.1); // white roof
  for (const s of [-1, 1]) {
    B(g, 0.1, roof - belt, 0.14, RED, s * (W / 2 - 0.1), belt, zf + 0.32);
    B(g, 0.1, roof - belt, 0.14, RED, s * (W / 2 - 0.1), belt, zr - 0.08);
    B(g, 0.1, roof - belt, 0.1, RED, s * (W / 2 - 0.1), belt, 0.55);
    pane(g, 0.82, roof - belt - 0.3, s * (W / 2 - 0.08), (belt + roof) / 2 - 0.06, 0.03, Math.PI / 2);
    pane(g, 0.62, roof - belt - 0.3, s * (W / 2 - 0.08), (belt + roof) / 2 - 0.06, 1.0, Math.PI / 2);
    B(g, 0.12, 0.16, 0.22, RED, s * (W / 2 + 0.1), belt + 0.02, zf + 0.2); // mirrors
  }
  pane(g, W - 0.44, roof - belt - 0.3, 0, (belt + roof) / 2 - 0.06, zr + 0.02);
  // Racing stripes over the bonnet, roof and tail.
  for (const x of [-0.24, 0.24]) {
    slant(g, x, { y: clear + 0.47, z: -L / 2 + 0.05 }, { y: belt + 0.11, z: -0.5 }, 0.2, 0.02, 0xf4f4f0);
    B(g, 0.2, 0.015, 1.7, RED, x, roof + 0.08, (zf + zr) / 2 + 0.1);
  }
  // Face: big round lamps, small grille, chunky chrome bumpers, fog lamps.
  for (const s of [-1, 1]) {
    roundLamp(g, 0.22, s * 0.62, clear + 0.42, -L / 2);
    roundLamp(g, 0.08, s * 0.34, clear + 0.06, -L / 2 - 0.12, 0xffe08a);
    B(g, 0.3, 0.2, 0.06, 0xd8202c, s * 0.68, clear + 0.36, L / 2 - 0.04, 0, TAIL);
  }
  B(g, 0.6, 0.22, 0.05, K.trim, 0, clear + 0.32, -L / 2 - 0.02);
  for (const z of [-L / 2 - 0.08, L / 2 + 0.04]) B(g, W + 0.12, 0.2, 0.2, K.chrome, 0, clear - 0.08, z);
  bakeVehicle(g);
  return scaled(g);
}

// ------------------------------------------------------------ 02 SUPERCAR
// Low, wide and short: a wedge nose, a small bubble canopy far back, huge
// rear wheels, side intakes, a giant rear wing on pylons.
export function superCar() {
  const g = new THREE.Group();
  const Y = 0xffc414, D = 0x1d1c22, W = 2.34, L = 3.8, clear = 0.2;
  B(g, W, 0.46, L - 0.2, Y, 0, clear, 0.05);
  slant(g, 0, { y: clear + 0.26, z: -L / 2 }, { y: clear + 0.5, z: -0.6 }, W - 0.08, 0.2, Y); // wedge nose
  for (const [z, r] of [[-1.15, 0.43], [1.2, 0.5]]) {
    for (const s of [-1, 1]) B(g, 0.18, 0.14, r * 2.5, Y, s * (W / 2 + 0.02), 2 * r - 0.1, z);
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.12), z, r, 0.46, 0x1d1c22);
  }
  // Canopy.
  const belt = clear + 0.5, roof = belt + 0.56;
  slant(g, 0, { y: belt, z: -0.55 }, { y: roof, z: 0.05 }, W - 0.72, 0.06, D);
  pane(g, W - 0.82, 0.62, 0, belt + 0.28, -0.25, 0, -1.0);
  B(g, W - 0.66, 0.1, 0.75, Y, 0, roof - 0.04, 0.42);
  B(g, 0.26, 0.11, 0.75, D, 0, roof - 0.03, 0.42);
  slant(g, 0, { y: roof, z: 0.8 }, { y: belt + 0.02, z: 1.5 }, W - 0.72, 0.06, D);
  for (const s of [-1, 1]) {
    pane(g, 0.9, 0.4, s * (W / 2 - 0.36), belt + 0.24, 0.2, Math.PI / 2);
    // Side intake behind the door, side skirt.
    B(g, 0.06, 0.3, 0.6, D, s * (W / 2 + 0.01), clear + 0.1, 0.6);
    B(g, 0.08, 0.1, L - 1.4, D, s * (W / 2 + 0.02), clear - 0.02, 0);
    // Angular headlamps, slanted.
    const h = B(g, 0.6, 0.08, 0.2, 0xfff6d2, s * 0.68, clear + 0.38, -L / 2 + 0.36, s * 0.35, LAMP);
    h.rotation.x = -0.25;
    B(g, 0.55, 0.1, 0.06, 0xd8202c, s * 0.62, clear + 0.32, L / 2 - 0.12, 0, TAIL);
    // Wing pylons.
    B(g, 0.08, 0.5, 0.2, D, s * 0.72, clear + 0.46, 1.65);
  }
  B(g, W + 0.14, 0.07, 0.56, D, 0, clear + 0.95, 1.7); // wing
  for (const s of [-1, 1]) B(g, 0.06, 0.26, 0.6, D, s * (W / 2 + 0.08), clear + 0.8, 1.7);
  // Front splitter, big intakes, diffuser, exhausts, bonnet stripes.
  B(g, W + 0.06, 0.06, 0.3, D, 0, clear - 0.04, -L / 2 + 0.05);
  for (const s of [-1, 1]) B(g, 0.55, 0.18, 0.06, D, s * 0.6, clear + 0.08, -L / 2 - 0.04);
  B(g, W - 0.4, 0.16, 0.06, D, 0, clear + 0.02, L / 2 - 0.08);
  for (const x of [-0.2, 0.2]) cyl(g, 0.08, 0.2, K.chrome, x, clear + 0.12, L / 2 - 0.02, "z", 10);
  for (const x of [-0.16, 0.16]) B(g, 0.18, 0.015, 1.3, D, x, clear + 0.5, -1.2);
  bakeVehicle(g);
  return scaled(g);
}

// ------------------------------------------------------------- 04 SUV
// A tall stubby off-roader: huge treaded tyres, a boxy cabin as tall as
// the body, bull bar, roof rack with a bank of lamps, spare wheel, snorkel.
export function suvCar() {
  const g = new THREE.Group();
  const GR = 0x4f9a3a, D = 0x232227, W = 2.16, L = 3.35, r = 0.6, clear = 0.58;
  const belt = clear + 0.72;
  B(g, W, 0.72, L - 0.1, GR, 0, clear, 0);
  for (const z of [-1.02, 1.02]) {
    for (const s of [-1, 1]) B(g, 0.3, 0.2, r * 2.3, D, s * (W / 2 + 0.06), 2 * r - 0.1, z); // flares
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.08), z, r, 0.5, 0xd9d6cf, true);
  }
  B(g, W - 0.2, 0.06, 0.95, GR, 0, belt, -1.15); // bonnet
  // Boxy cabin, near-vertical glass.
  const roof = belt + 1.06, zf = -0.66, zr = L / 2 - 0.02;
  slant(g, 0, { y: belt, z: zf }, { y: roof, z: zf + 0.18 }, W - 0.1, 0.08, GR);
  pane(g, W - 0.36, roof - belt - 0.2, 0, (belt + roof) / 2, zf + 0.04, 0, -0.17);
  B(g, W - 0.04, 0.14, zr - zf - 0.1, 0xf4f4f0, 0, roof - 0.1, (zf + zr) / 2 + 0.06); // white roof
  for (const s of [-1, 1]) {
    for (const z of [zf + 0.14, -0.05 + 0.4, zr - 0.08]) B(g, 0.1, roof - belt, 0.14, GR, s * (W / 2 - 0.05), belt, z);
    pane(g, 0.62, roof - belt - 0.26, s * (W / 2 - 0.03), (belt + roof) / 2, 0.0, Math.PI / 2);
    pane(g, 0.88, roof - belt - 0.26, s * (W / 2 - 0.03), (belt + roof) / 2, 0.98, Math.PI / 2);
    B(g, 0.12, 0.2, 0.26, D, s * (W / 2 + 0.12), belt + 0.06, zf + 0.12);
  }
  pane(g, W - 0.5, roof - belt - 0.3, 0, (belt + roof) / 2, zr + 0.02);
  // Roof rack and its lamp bank.
  for (const z of [zf + 0.12, (zf + zr) / 2 + 0.1, zr - 0.15]) B(g, W - 0.1, 0.07, 0.08, D, 0, roof + 0.14, z);
  for (const s of [-1, 1]) B(g, 0.08, 0.14, 1.9, D, s * (W / 2 - 0.1), roof + 0.04, (zf + zr) / 2 + 0.1);
  for (let i = 0; i < 4; i++) roundLamp(g, 0.13, -0.6 + i * 0.4, roof + 0.34, zf + 0.12);
  // Face: round lamps, slatted grille, bull bar with winch.
  for (const s of [-1, 1]) {
    roundLamp(g, 0.18, s * 0.66, clear + 0.44, -L / 2);
    B(g, 0.24, 0.24, 0.06, 0xd8202c, s * 0.78, clear + 0.4, L / 2 - 0.04, 0, TAIL);
  }
  B(g, 0.8, 0.42, 0.05, D, 0, clear + 0.22, -L / 2 - 0.02);
  for (let i = 0; i < 5; i++) B(g, 0.06, 0.36, 0.06, 0x55535c, -0.32 + i * 0.16, clear + 0.25, -L / 2 - 0.05);
  B(g, W + 0.14, 0.28, 0.26, D, 0, clear - 0.18, -L / 2 - 0.16);
  for (const s of [-1, 1]) B(g, 0.1, 0.62, 0.1, D, s * 0.5, clear - 0.04, -L / 2 - 0.28);
  B(g, 1.1, 0.08, 0.1, D, 0, clear + 0.52, -L / 2 - 0.28);
  B(g, 0.34, 0.18, 0.18, 0x55535c, 0, clear - 0.06, -L / 2 - 0.34);
  B(g, W + 0.1, 0.24, 0.22, D, 0, clear - 0.12, L / 2 + 0.04);
  // Spare wheel on the tail door, snorkel on the right pillar.
  cyl(g, r * 0.82, 0.28, K.rubber, 0, clear + 0.8, L / 2 + 0.2, "z", 14);
  cyl(g, r * 0.48, 0.3, 0xd9d6cf, 0, clear + 0.8, L / 2 + 0.22, "z", 10);
  B(g, 0.14, roof - clear + 0.1, 0.14, D, W / 2 + 0.08, clear + 0.2, zf + 0.06);
  B(g, 0.24, 0.12, 0.28, D, W / 2 + 0.08, roof + 0.28, zf + 0.06);
  bakeVehicle(g);
  return scaled(g);
}

// ----------------------------------------------------- 05 ICE CREAM TRUCK
// A tall pastel van: short snub cab, a big box body, a serving window with
// tubs under a striped awning, a giant cone with three scoops on the roof,
// a loudspeaker, an ICE CREAM board.
export function iceCreamTruck() {
  const g = new THREE.Group();
  const BL = 0x8fd3ec, PK = 0xff8fc0, W = 2.22, L = 3.9, r = 0.45, clear = 0.32;
  // Cab nose and box body.
  B(g, W - 0.1, 0.72, 0.95, BL, 0, clear, -1.45);
  B(g, W, 2.08, 2.98, BL, 0, clear, 0.46);
  B(g, W + 0.02, 0.24, 3.9, PK, 0, clear + 0.36, 0.0); // pink band
  B(g, W + 0.02, 0.12, 2.98, 0xf4f4f0, 0, clear + 2.0, 0.46);
  for (const z of [-1.18, 1.25]) {
    for (const s of [-1, 1]) B(g, 0.16, 0.14, r * 2.4, 0xf4f4f0, s * (W / 2 + 0.02), 2 * r - 0.08, z);
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.12), z, r, 0.4, PK);
  }
  // Big windscreen and cab side windows.
  pane(g, W - 0.34, 0.86, 0, clear + 1.42, -1.03, 0, -0.08);
  for (const s of [-1, 1]) pane(g, 0.6, 0.72, s * (W / 2 + 0.01), clear + 1.4, -0.66, Math.PI / 2);
  // Serving window (right side): dark hatch, tubs, striped awning.
  const sx = W / 2 + 0.02;
  B(g, 0.04, 0.9, 1.6, 0x3a2a3a, sx, clear + 0.95, 0.62);
  for (let i = 0; i < 4; i++) {
    B(g, 0.26, 0.18, 0.3, [0xff8fc0, 0x8fe8c8, 0xfff0b8, 0xb88a5a][i], sx + 0.06, clear + 0.98, 0.02 + i * 0.4);
    add(g, new THREE.SphereGeometry(0.12, 8, 6), [0xff8fc0, 0x8fe8c8, 0xfff0b8, 0xb88a5a][i], sx + 0.06, clear + 1.2, 0.02 + i * 0.4);
  }
  B(g, 0.34, 0.06, 1.7, 0xf4f4f0, sx + 0.14, clear + 0.9, 0.62);
  const aw = new THREE.Group();
  aw.position.set(sx, clear + 2.0, 0.62);
  aw.rotation.z = -0.45;
  g.add(aw);
  for (let i = 0; i < 8; i++) B(aw, 0.7, 0.04, 0.2, i % 2 ? 0xf4f4f0 : PK, 0.35, 0, -0.7 + i * 0.2);
  B(aw, 0.04, 0.16, 1.62, PK, 0.7, -0.14, 0);
  // Ice-cream pictures on the left side.
  for (let i = 0; i < 3; i++) {
    const z = -0.1 + i * 0.6;
    add(g, new THREE.ConeGeometry(0.14, 0.4, 8), 0xe0a65a, -sx - 0.02, clear + 1.0, z).rotation.x = Math.PI;
    add(g, new THREE.SphereGeometry(0.16, 8, 6), [PK, 0x8fe8c8, 0xfff0b8][i], -sx - 0.02, clear + 1.3, z);
  }
  // Roof: the giant cone and scoops, loudspeaker, the board.
  const top = clear + 2.08;
  const cone = add(g, new THREE.ConeGeometry(0.5, 1.2, 10), 0xe0a65a, 0, top + 0.6, 0.85);
  cone.rotation.x = Math.PI;
  for (let i = 0; i < 4; i++) B(g, 0.88 - i * 0.18, 0.04, 0.04, 0xb5742a, 0, top + 0.95 - i * 0.24, 0.85 - 0.44 + i * 0.09);
  add(g, new THREE.SphereGeometry(0.55, 10, 8), PK, 0, top + 1.42, 0.85);
  add(g, new THREE.SphereGeometry(0.46, 10, 8), 0x8fe8c8, 0.05, top + 1.9, 0.82);
  add(g, new THREE.SphereGeometry(0.36, 10, 8), 0xfff0b8, -0.04, top + 2.3, 0.86);
  add(g, new THREE.SphereGeometry(0.11, 6, 5), 0xd8202c, 0, top + 2.62, 0.86);
  const horn = add(g, new THREE.CylinderGeometry(0.28, 0.08, 0.5, 10), 0xf4f4f0, 0.55, top + 0.42, -0.55);
  horn.rotation.x = -Math.PI / 2 + 0.25;
  B(g, 0.1, 0.32, 0.1, 0x55535c, 0.55, top, -0.45);
  B(g, W - 0.3, 0.5, 0.1, PK, 0, top + 0.02, -0.95);
  // Face.
  for (const s of [-1, 1]) {
    roundLamp(g, 0.18, s * 0.64, clear + 0.42, -1.93);
    B(g, 0.26, 0.26, 0.06, 0xd8202c, s * 0.82, clear + 0.62, L / 2 - 0.04, 0, TAIL);
  }
  B(g, 0.7, 0.34, 0.05, 0xf4f4f0, 0, clear + 0.26, -1.94);
  for (let i = 0; i < 3; i++) B(g, 0.62, 0.04, 0.06, 0x9fb3c7, 0, clear + 0.32 + i * 0.1, -1.96);
  for (const z of [-1.98, L / 2 + 0.04]) B(g, W + 0.1, 0.2, 0.2, K.chrome, 0, clear - 0.08, z);
  bakeVehicle(g);
  // The ICE CREAM board (a texture: kept out of the bake).
  const sign = textSign("ICE CREAM", "#ff5fa8", "#ffffff", W - 0.4, 0.4);
  sign.position.set(0, top + 0.27, -1.01);
  sign.rotation.y = Math.PI;
  g.add(sign);
  const side = textSign("ICE CREAM", "#ffffff", "#ff5fa8", 1.7, 0.36);
  side.position.set(-sx - 0.03, clear + 1.75, 0.6);
  side.rotation.y = -Math.PI / 2;
  g.add(side);
  return scaled(g);
}

// --------------------------------------------------------- 03 MUSCLE CAR
// A long bonnet with a chrome blower poking through it, a small cabin set
// far back, fat rear tyres under wide hips, twin white stripes nose to
// tail, a wide grille with four round lamps.
export function muscleCar() {
  const g = new THREE.Group();
  const BL = 0x2457d5, D = 0x1d1c22, W = 2.24, L = 3.8, clear = 0.26;
  const belt = clear + 0.6;
  B(g, W, 0.6, L - 0.1, BL, 0, clear, 0);
  for (const [z, r, w] of [[-1.2, 0.46, 0.42], [1.22, 0.55, 0.56]]) {
    for (const s of [-1, 1]) B(g, 0.24, 0.2, r * 2.4, BL, s * (W / 2 + 0.06), 2 * r - 0.12, z); // hips
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.1), z, r, w, K.chrome);
  }
  // Bonnet bulge and the blower with three red-capped stacks.
  B(g, 0.9, 0.12, 1.5, BL, 0, belt, -0.95);
  B(g, 0.62, 0.26, 0.7, K.chrome, 0, belt + 0.12, -0.95);
  for (let i = 0; i < 3; i++) {
    cyl(g, 0.12, 0.3, K.chrome, -0.22 + i * 0.22, belt + 0.52, -0.95, "y", 10);
    cyl(g, 0.13, 0.08, 0xd8202c, -0.22 + i * 0.22, belt + 0.7, -0.95, "y", 10);
  }
  // Small cabin, set back.
  const roof = belt + 0.78, zf = 0.0, zr = 1.25;
  slant(g, 0, { y: belt, z: zf - 0.1 }, { y: roof, z: zf + 0.3 }, W - 0.3, 0.07, BL);
  pane(g, W - 0.5, roof - belt - 0.16, 0, (belt + roof) / 2, zf + 0.1, 0, -0.55);
  B(g, W - 0.4, 0.1, zr - zf - 0.4, BL, 0, roof - 0.06, (zf + zr) / 2 + 0.15);
  slant(g, 0, { y: roof, z: zr - 0.05 }, { y: belt, z: zr + 0.45 }, W - 0.36, 0.07, D);
  for (const s of [-1, 1]) {
    pane(g, 0.8, roof - belt - 0.2, s * (W / 2 - 0.19), (belt + roof) / 2, (zf + zr) / 2 + 0.15, Math.PI / 2);
    B(g, 0.12, 0.14, 0.2, BL, s * (W / 2 + 0.06), belt + 0.02, zf + 0.1);
  }
  // Stripes, wide grille and four round lamps, chrome bumpers, ducktail.
  for (const x of [-0.26, 0.26]) {
    B(g, 0.22, 0.015, 1.6, 0xf4f4f0, x, belt + 0.12, -1.2);
    B(g, 0.22, 0.015, zr - zf - 0.4, 0xf4f4f0, x, roof + 0.04, (zf + zr) / 2 + 0.15);
    B(g, 0.22, 0.015, 0.5, 0xf4f4f0, x, belt, 1.65);
  }
  B(g, W - 0.3, 0.36, 0.06, D, 0, clear + 0.16, -L / 2);
  for (let i = 0; i < 4; i++) B(g, W - 0.5, 0.03, 0.07, K.chrome, 0, clear + 0.2 + i * 0.08, -L / 2 - 0.01);
  for (const x of [-0.82, -0.52, 0.52, 0.82]) roundLamp(g, 0.12, x, clear + 0.36, -L / 2 - 0.03);
  for (const s of [-1, 1]) B(g, 0.5, 0.14, 0.06, 0xd8202c, s * 0.62, clear + 0.42, L / 2 - 0.04, 0, TAIL);
  for (const z of [-L / 2 - 0.06, L / 2 + 0.03]) B(g, W + 0.1, 0.18, 0.18, K.chrome, 0, clear - 0.04, z);
  B(g, W - 0.2, 0.1, 0.24, BL, 0, belt, L / 2 - 0.12);
  for (const s of [-1, 1]) cyl(g, 0.09, 0.3, K.chrome, s * 0.55, clear + 0.06, L / 2 + 0.06, "z", 10);
  bakeVehicle(g);
  return scaled(g);
}

// ------------------------------------------------------ 06 MONSTER TRUCK
// A little pickup perched on four enormous treaded tyres: visible yellow
// springs and a black frame, flames down the sides, a roof light bar.
export function monsterTruck() {
  const g = new THREE.Group();
  const PU = 0x7a3ad0, D = 0x1d1c22, W = 1.86, L = 3.1, r = 0.9, lift = 1.28;
  // Frame and springs.
  B(g, 0.9, 0.2, L - 0.4, D, 0, lift - 0.3, 0);
  for (const z of [-1.08, 1.08]) {
    B(g, W + 0.7, 0.14, 0.18, D, 0, r - 0.07, z); // axle
    for (const s of [-1, 1]) {
      cyl(g, 0.13, lift - r + 0.25, 0xf5c01a, s * 0.62, (r + lift) / 2 - 0.05, z, "y", 10);
      for (let i = 0; i < 4; i++) cyl(g, 0.17, 0.04, 0xf5c01a, s * 0.62, r + 0.05 + i * 0.1, z, "y", 10);
      wheel(g, s * (W / 2 + 0.34), z, r, 0.72, 0x9da1a8, true);
    }
  }
  // Body: pickup with a small cab, flames on the sides.
  B(g, W, 0.62, L, PU, 0, lift, 0);
  const belt = lift + 0.62, roof = belt + 0.72, zf = -0.45, zr = 0.45;
  slant(g, 0, { y: belt, z: zf - 0.12 }, { y: roof, z: zf + 0.12 }, W - 0.12, 0.08, PU);
  pane(g, W - 0.34, roof - belt - 0.16, 0, (belt + roof) / 2, zf, 0, -0.3);
  B(g, W - 0.08, 0.12, zr - zf, PU, 0, roof - 0.08, (zf + zr) / 2 + 0.06);
  B(g, W - 0.08, roof - belt, 0.1, PU, 0, belt, zr + 0.02);
  for (const sx of [-1, 1]) {
    pane(g, 0.62, roof - belt - 0.2, sx * (W / 2 - 0.04), (belt + roof) / 2, 0.02, Math.PI / 2);
    // Bed walls.
    B(g, 0.1, 0.3, L / 2 - 0.5, PU, sx * (W / 2 - 0.05), belt, L / 4 + 0.2);
    // Flames: three yellow tongues and an orange core along each side.
    for (let i = 0; i < 3; i++) {
      const f = B(g, 0.04, 0.16, 0.9 - i * 0.18, 0xf5c01a, sx * (W / 2 + 0.01), lift + 0.12 + i * 0.16, -0.7 + i * 0.25);
      f.rotation.x = 0.12;
      B(g, 0.05, 0.08, 0.5 - i * 0.1, 0xff7a1a, sx * (W / 2 + 0.015), lift + 0.16 + i * 0.16, -0.75 + i * 0.25);
    }
  }
  B(g, W - 0.1, 0.06, L / 2 - 0.5, D, 0, belt - 0.02, L / 4 + 0.2);
  // Light bar, face.
  B(g, W - 0.3, 0.1, 0.18, D, 0, roof + 0.06, zf + 0.12);
  for (let i = 0; i < 3; i++) roundLamp(g, 0.12, -0.45 + i * 0.45, roof + 0.3, zf + 0.06);
  for (const s of [-1, 1]) {
    roundLamp(g, 0.15, s * 0.6, lift + 0.36, -L / 2 - 0.01);
    B(g, 0.22, 0.22, 0.06, 0xd8202c, s * 0.7, lift + 0.32, L / 2 - 0.04, 0, TAIL);
  }
  B(g, 0.7, 0.36, 0.05, D, 0, lift + 0.18, -L / 2 - 0.02);
  for (const z of [-L / 2 - 0.08, L / 2 + 0.04]) B(g, W + 0.06, 0.22, 0.22, K.chrome, 0, lift - 0.1, z);
  bakeVehicle(g);
  return scaled(g);
}

// ---------------------------------------------------------- 07 BULLDOZER
// Two chunky tracks, a tall short cab on a roll cage, the engine house
// behind with an exhaust, an oversized curved blade up front on arms, an
// orange beacon on the roof.
export function bulldozer() {
  const g = new THREE.Group();
  const Y = 0xf5c01a, D = 0x1d1c22, GR = 0x55535c, W = 2.1, L = 3.0;
  // Tracks: a black band with rounded ends, road wheels (they turn).
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.28);
    B(g, 0.56, 0.7, L - 0.7, D, x, 0.02, 0);
    for (const z of [-(L - 0.7) / 2, (L - 0.7) / 2]) cyl(g, 0.36, 0.56, D, x, 0.38, z, "x", 12);
    for (let i = 0; i < 6; i++) B(g, 0.6, 0.06, 0.12, 0x2a292e, x, 0.73, -1.0 + i * 0.4);
    for (const z of [-0.75, 0, 0.75]) wheel(g, x + sx * 0.02, z, 0.26, 0.6, GR);
  }
  // Body: engine house, cab on a cage.
  B(g, W - 0.5, 0.5, L - 0.4, Y, 0, 0.72, 0.1);
  B(g, W - 0.7, 0.7, 1.1, Y, 0, 1.22, 0.75);
  for (let i = 0; i < 4; i++) B(g, W - 0.66, 0.04, 0.06, D, 0, 1.4 + i * 0.12, 1.32);
  cyl(g, 0.08, 0.9, GR, 0.45, 2.2, 0.55, "y", 8);
  const belt = 1.22, roof = 2.5, zf = -0.75, zr = 0.2;
  for (const sx of [-1, 1]) for (const z of [zf, zr]) B(g, 0.12, roof - belt, 0.12, Y, sx * (W / 2 - 0.38), belt, z);
  pane(g, W - 0.9, roof - belt - 0.2, 0, (belt + roof) / 2, zf, 0, 0);
  for (const sx of [-1, 1]) pane(g, zr - zf - 0.14, roof - belt - 0.2, sx * (W / 2 - 0.38), (belt + roof) / 2, (zf + zr) / 2, Math.PI / 2);
  pane(g, W - 0.9, roof - belt - 0.3, 0, (belt + roof) / 2, zr);
  B(g, W - 0.5, 0.14, zr - zf + 0.3, Y, 0, roof, (zf + zr) / 2);
  // Beacon (lamp material: glows).
  cyl(g, 0.16, 0.24, 0xff8a1a, 0, roof + 0.26, (zf + zr) / 2, "y", 10, { emissive: 0xff7a00, emissiveIntensity: 0.8 });
  // Blade: three slanted panels (a curve), a steel edge, two push arms.
  const bz = -L / 2 - 0.55, BW = W + 0.4;
  slant(g, 0, { y: 0.06, z: bz - 0.05 }, { y: 0.55, z: bz + 0.08 }, BW, 0.12, Y);
  slant(g, 0, { y: 0.55, z: bz + 0.08 }, { y: 1.0, z: bz + 0.06 }, BW, 0.12, Y);
  slant(g, 0, { y: 1.0, z: bz + 0.06 }, { y: 1.3, z: bz - 0.12 }, BW, 0.12, Y);
  B(g, BW + 0.02, 0.1, 0.16, GR, 0, 0.02, bz - 0.1);
  for (const sx of [-1, 1]) {
    B(g, 0.1, 1.2, 0.14, D, sx * (BW / 2 - 0.02), 0.06, bz + 0.05);
    slant(g, sx * (W / 2 - 0.28), { y: 0.5, z: bz + 0.15 }, { y: 0.8, z: -0.9 }, 0.16, 0.16, D);
    roundLamp(g, 0.1, sx * 0.55, 1.18, -L / 2 + 0.2);
  }
  bakeVehicle(g);
  return scaled(g);
}

// ------------------------------------------------------ 08 ARMORED TRUCK
// A short, tall steel box: a heavy push bar and grille, small thick
// windows, riveted plates, a blue band with a gold $ badge, two orange
// beacons on the roof.
export function armoredTruck() {
  const g = new THREE.Group();
  const GY = 0x9aa1ab, BLU = 0x23365e, D = 0x1d1c22, W = 2.2, L = 3.6, r = 0.52, clear = 0.42;
  B(g, W - 0.1, 0.8, 0.85, GY, 0, clear, -1.35);
  B(g, W, 2.0, 2.75, GY, 0, clear, 0.42);
  B(g, W + 0.02, 0.36, 3.6, BLU, 0, clear + 0.2, 0.0);
  for (const z of [-1.1, 1.18]) {
    for (const s of [-1, 1]) B(g, 0.22, 0.2, r * 2.3, D, s * (W / 2 + 0.04), 2 * r - 0.1, z);
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.1), z, r, 0.48, 0x55535c);
  }
  // Windscreen (small, thick frame), side slits.
  const top = clear + 2.0;
  B(g, W - 0.2, 0.9, 0.1, D, 0, clear + 0.95, -0.96);
  pane(g, W - 0.6, 0.56, 0, clear + 1.4, -1.02, 0, -0.05);
  for (const s of [-1, 1]) {
    pane(g, 0.42, 0.34, s * (W / 2 + 0.01), clear + 1.5, -0.62, Math.PI / 2);
    pane(g, 0.5, 0.18, s * (W / 2 + 0.01), clear + 1.62, 0.9, Math.PI / 2);
    // Riveted plates.
    for (let i = 0; i < 4; i++) for (const y of [clear + 0.68, clear + 1.92]) B(g, 0.05, 0.05, 0.05, 0x6a717b, s * (W / 2 + 0.02), y, -0.7 + i * 0.75);
    B(g, 0.03, 1.2, 0.04, 0x6a717b, s * (W / 2 + 0.015), clear + 0.7, 0.3);
  }
  // Roof: beacons and a hatch.
  B(g, 0.8, 0.1, 0.8, 0x6a717b, 0, top, 0.6);
  for (const s of [-1, 1]) cyl(g, 0.14, 0.22, 0xff8a1a, s * 0.65, top + 0.11, -0.7, "y", 10, { emissive: 0xff7a00, emissiveIntensity: 0.8 });
  // Face: heavy grille, square lamps, push bar.
  B(g, 1.1, 0.5, 0.06, D, 0, clear + 0.18, -1.79);
  for (let i = 0; i < 6; i++) B(g, 0.06, 0.44, 0.08, 0x6a717b, -0.45 + i * 0.18, clear + 0.21, -1.81);
  for (const s of [-1, 1]) {
    B(g, 0.3, 0.24, 0.06, 0xfff6d2, s * 0.78, clear + 0.36, -1.8, 0, LAMP);
    B(g, 0.3, 0.3, 0.06, 0xd8202c, s * 0.82, clear + 0.7, L / 2 + 0.04, 0, TAIL);
  }
  B(g, W + 0.2, 0.34, 0.3, D, 0, clear - 0.2, -1.98);
  for (const s of [-1, 1]) B(g, 0.12, 0.6, 0.12, D, s * 0.55, clear - 0.04, -2.06);
  B(g, W + 0.06, 0.26, 0.24, D, 0, clear - 0.12, L / 2 + 0.1);
  // Rear doors seam.
  B(g, 0.04, 1.7, 0.03, 0x6a717b, 0, clear + 0.15, L / 2 + 0.25);
  bakeVehicle(g);
  // Gold $ badges on both sides.
  for (const s of [-1, 1]) {
    const badge = textSign("$", "#e8b21a", "#23365e", 0.62, 0.62);
    badge.position.set(s * (W / 2 + 0.03), clear + 1.25, 0.45);
    badge.rotation.y = (s * Math.PI) / 2;
    g.add(badge);
  }
  return scaled(g);
}

// ------------------------------------------------- HEAVY POLICE (CITY CHAOS)
// Blinking light-bar lenses: separate materials (the renderer toggles
// them), kept out of the bake like the patrol car's.
function lightBar(g, y, z, w = 1.5) {
  const D = 0x1d1c22;
  B(g, w, 0.1, 0.4, D, 0, y, z);
  const red = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.2, 0.36), new THREE.MeshStandardMaterial({ color: 0xff2a3c, emissive: 0xff2040, emissiveIntensity: 0.9, flatShading: true }));
  red.position.set(-w * 0.27, y + 0.15, z);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.2, 0.36), new THREE.MeshStandardMaterial({ color: 0x2a6dff, emissive: 0x2a60ff, emissiveIntensity: 0.9, flatShading: true }));
  blue.position.set(w * 0.27, y + 0.15, z);
  g.add(red, blue);
  B(g, 0.2, 0.16, 0.36, 0xf4f4f0, 0, y + 0.13, z);
  return { red, blue };
}
function policeText(g, text, W, y, z, w = 1.3, h = 0.34) {
  for (const s of [-1, 1]) {
    const t = textSign(text, "#f4f4f0", "#1d1c22", w, h);
    t.position.set(s * (W / 2 + 0.03), y, z);
    t.rotation.y = (s * Math.PI) / 2;
    g.add(t);
  }
}
// Heavy police SUV: a tall boxy black-and-white SUV on big tyres, white
// doors and roof, a huge black push bumper, a full-width light bar.
export function policeSuv() {
  const g = new THREE.Group();
  const BK = 0x1d1c22, WH = 0xf4f4f0, W = 2.2, L = 3.45, r = 0.6, clear = 0.56;
  const belt = clear + 0.74;
  B(g, W, 0.74, L - 0.1, BK, 0, clear, 0);
  for (const s of [-1, 1]) B(g, 0.06, 0.66, 1.7, WH, s * (W / 2 + 0.02), clear + 0.04, 0.1); // white doors
  for (const z of [-1.05, 1.05]) {
    for (const s of [-1, 1]) B(g, 0.3, 0.2, r * 2.3, BK, s * (W / 2 + 0.06), 2 * r - 0.1, z);
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.08), z, r, 0.52, 0x9da1a8, true);
  }
  B(g, W - 0.2, 0.06, 0.95, BK, 0, belt, -1.18);
  const roof = belt + 1.02, zf = -0.68, zr = L / 2 - 0.02;
  slant(g, 0, { y: belt, z: zf }, { y: roof, z: zf + 0.2 }, W - 0.1, 0.08, WH);
  pane(g, W - 0.36, roof - belt - 0.2, 0, (belt + roof) / 2, zf + 0.04, 0, -0.18);
  B(g, W - 0.04, 0.14, zr - zf - 0.1, WH, 0, roof - 0.1, (zf + zr) / 2 + 0.06);
  for (const s of [-1, 1]) {
    for (const z of [zf + 0.14, 0.38, zr - 0.08]) B(g, 0.1, roof - belt, 0.14, WH, s * (W / 2 - 0.05), belt, z);
    pane(g, 0.62, roof - belt - 0.26, s * (W / 2 - 0.03), (belt + roof) / 2, 0.0, Math.PI / 2);
    pane(g, 0.88, roof - belt - 0.26, s * (W / 2 - 0.03), (belt + roof) / 2, 0.98, Math.PI / 2);
    const star = cyl(g, 0.2, 0.03, 0xf5c01a, s * (W / 2 + 0.07), clear + 0.42, -0.55, "x", 5);
    star.rotation.x = Math.PI / 2;
  }
  pane(g, W - 0.5, roof - belt - 0.3, 0, (belt + roof) / 2, zr + 0.02);
  const lens = lightBar(g, roof + 0.02, -0.1, 1.7);
  // Face: lamps, black grille, a massive push bumper.
  for (const s of [-1, 1]) {
    roundLamp(g, 0.17, s * 0.66, clear + 0.46, -L / 2);
    B(g, 0.24, 0.24, 0.06, 0xd8202c, s * 0.78, clear + 0.4, L / 2 - 0.04, 0, TAIL);
  }
  B(g, 0.9, 0.42, 0.05, 0x2f2e35, 0, clear + 0.22, -L / 2 - 0.02);
  B(g, W + 0.3, 0.42, 0.34, BK, 0, clear - 0.24, -L / 2 - 0.2);
  for (const s of [-1, 1]) B(g, 0.14, 0.8, 0.14, BK, s * 0.45, clear - 0.1, -L / 2 - 0.36);
  B(g, 1.2, 0.12, 0.14, BK, 0, clear + 0.62, -L / 2 - 0.36);
  B(g, W + 0.1, 0.26, 0.24, BK, 0, clear - 0.12, L / 2 + 0.04);
  bakeVehicle(g, [lens.red, lens.blue]);
  policeText(g, "POLICE", W, clear + 0.36, 0.25);
  const out = scaled(g);
  out.userData.red = lens.red;
  out.userData.blue = lens.blue;
  return out;
}
// Police armored truck: short and tall, dark navy armour with white
// POLICE panels, a reinforced ram bumper, slit windows, a light bar and a
// roof hatch.
export function policeArmored() {
  const g = new THREE.Group();
  const NV = 0x1f2a44, WH = 0xf4f4f0, D = 0x15151a, W = 2.3, L = 3.55, r = 0.58, clear = 0.46;
  B(g, W - 0.1, 0.86, 0.85, NV, 0, clear, -1.3);
  B(g, W, 2.15, 2.7, NV, 0, clear, 0.42);
  for (const s of [-1, 1]) B(g, 0.05, 0.62, 2.3, WH, s * (W / 2 + 0.02), clear + 0.75, 0.45); // white band
  for (const z of [-1.08, 1.15]) {
    for (const s of [-1, 1]) B(g, 0.24, 0.22, r * 2.3, D, s * (W / 2 + 0.05), 2 * r - 0.1, z);
    for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.1), z, r, 0.52, 0x55535c, true);
  }
  const top = clear + 2.15;
  B(g, W - 0.2, 0.92, 0.1, D, 0, clear + 1.0, -0.92);
  pane(g, W - 0.7, 0.42, 0, clear + 1.5, -0.98, 0, -0.04);
  for (const s of [-1, 1]) {
    pane(g, 0.4, 0.26, s * (W / 2 + 0.01), clear + 1.65, -0.6, Math.PI / 2);
    for (let i = 0; i < 4; i++) for (const y of [clear + 0.3, clear + 1.95]) B(g, 0.05, 0.05, 0.05, 0x6a717b, s * (W / 2 + 0.02), y, -0.65 + i * 0.75);
  }
  B(g, 0.9, 0.12, 0.9, 0x2b3757, 0, top, 0.6);
  const lens = lightBar(g, top + 0.02, -0.45, 1.8);
  // Ram bumper: a thick wedge plate across the whole front.
  B(g, 1.1, 0.5, 0.06, D, 0, clear + 0.2, -1.75);
  for (const s of [-1, 1]) {
    B(g, 0.3, 0.22, 0.06, 0xfff6d2, s * 0.8, clear + 0.4, -1.76, 0, LAMP);
    B(g, 0.3, 0.3, 0.06, 0xd8202c, s * 0.84, clear + 0.7, L / 2 + 0.04, 0, TAIL);
  }
  const ram = B(g, W + 0.4, 0.55, 0.36, D, 0, clear - 0.3, -2.0);
  void ram;
  for (const s of [-1, 1]) B(g, 0.16, 0.7, 0.16, D, s * 0.6, clear - 0.1, -1.9);
  B(g, W + 0.06, 0.28, 0.26, D, 0, clear - 0.12, L / 2 + 0.1);
  bakeVehicle(g, [lens.red, lens.blue]);
  policeText(g, "POLICE", W, clear + 1.06, 0.45, 1.6, 0.44);
  const front = textSign("POLICE", "#f4f4f0", "#1f2a44", 1.0, 0.24);
  front.position.set(0, clear + 1.15, -0.975);
  front.rotation.y = Math.PI;
  g.add(front);
  const out = scaled(g);
  out.userData.red = lens.red;
  out.userData.blue = lens.blue;
  return out;
}

export const TOON_MODELS = { mini: miniCar, super: superCar, muscle: muscleCar, suv: suvCar, icecream: iceCreamTruck, monster: monsterTruck, dozer: bulldozer, armored: armoredTruck };
