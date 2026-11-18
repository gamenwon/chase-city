// CHASE CITY art-direction revision: one representative city district in
// ANGULAR low-poly (sharp boxes, faceted trees, flat-shaded facets, crisp
// shadows), dense with architectural and street detail, with a gas station,
// a basketball court, a park with a fountain, a commercial street and
// several residential/commercial buildings in one road layout.
// Every destructible site has an intact and a wrecked state; the replay
// plays the destruction with cartoon effects. Separate preview page
// (art-district.html): the game is not changed.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ------------------------------------------------------------- palette --
// Vivid, near-primary city colours (references 4, 5, 7, 8): rich reds,
// yellows, blues, greens and oranges on buildings and vehicles; neutral
// stone/cream trims; dark asphalt for contrast; natural glass, rubber and
// metal. One accent per object so they do not all compete.
export const C = {
  sky: 0xa9c0d6,
  asphalt: 0x37363b,
  asphaltDark: 0x2e2d32,
  lineWhite: 0xf4f4f0,
  lineYellow: 0xf2b705,
  walk: 0xbdbab3,
  walkJoint: 0xa8a49c,
  curb: 0xd9d6cf,
  concrete: 0xb5b2ab,
  grass: 0x43a047,
  grassDark: 0x2f8a3a,
  path: 0xd8b47a,
  leaf: [0x2e8b3e, 0x3da04a, 0x5cb23a],
  trunk: 0x7a4a2a,
  red: 0xd62f2a,
  redDark: 0x9e2420,
  blue: 0x2457c5,
  blueDark: 0x1a3f94,
  cream: 0xefe3c8, // stone / trim neutral
  creamLight: 0xf6efe1,
  orange: 0xf0781e,
  orangeDark: 0xc95a12,
  mint: 0x2fa36b, // green shopfront
  green: 0x2f7d4f,
  teal: 0x1f6e6a,
  peach: 0xe8a33a, // amber
  yellow: 0xf5c01a,
  glass: 0x8fd0e8,
  glassDark: 0x22303f,
  white: 0xf4f4f0,
  metal: 0x55535c,
  chrome: 0xc9ccd3,
  rubber: 0x1f1e22,
  dark: 0x232227,
  court: 0x3a6ea5,
  ball: 0xf07a1e,
  water: 0x2fa4e0,
  brick: 0xb84a2e,
  stone: 0xe6dccb,
  storeGreen: 0x2c5a3a,
  player: 0xe0367a, // hot magenta getaway car: unique in the palette
  // Outer red-orange flame, orange body, yellow-hot core.
  fire: [0xe8401c, 0xff8a1a, 0xffe14a],
  smoke: 0x2c2a2e,
  scorch: 0x1f1c1e,
};

// ------------------------------------------------------------- helpers --
const mats = new Map();
function M(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key))
    mats.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0,
        flatShading: true,
        ...opts,
      }),
    );
  return mats.get(key);
}
function add(p, geo, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, M(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  p.add(m);
  return m;
}
const boxGeo = new Map();
function geoBox(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!boxGeo.has(k)) boxGeo.set(k, new THREE.BoxGeometry(w, h, d));
  return boxGeo.get(k);
}
// Box by its base centre (x, z) and bottom y.
const B = (p, w, h, d, c, x = 0, y = 0, z = 0, ry = 0, o) => {
  const m = add(p, geoBox(w, h, d), c, x, y + h / 2, z, o);
  m.rotation.y = ry;
  return m;
};
const cyl = (p, rt, rb, h, c, x, y, z, seg = 8, o) =>
  add(p, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z, o);
// Square frustum (tapered box): bottom w x d, top shrunk by `taper`.
function frustum(p, w, d, h, taper, c, x, y, z) {
  const g = new THREE.CylinderGeometry(taper * Math.SQRT1_2, Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w, 1, d);
  return add(p, g, c, x, y + h / 2, z);
}
// Gable roof: triangle profile w wide, h high, extruded d deep (along z).
function gable(p, w, h, d, c, x, y, z, ry = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const m = add(p, g, c, x, y, z);
  m.rotation.y = ry;
  return m;
}
const G = (p, x = 0, y = 0, z = 0, ry = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  p.add(g);
  return g;
};
function textTex(text, bg, fg, w = 512, h = 128, size = 72) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `900 ${size}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function signBoard(p, text, w, h, x, y, z, ry, bg, fg) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.15),
    [0, 0, 0, 0, 1, 0].map((i) =>
      i
        ? new THREE.MeshStandardMaterial({ map: textTex(text, bg, fg), roughness: 0.7 })
        : M(new THREE.Color(bg).getHex()),
    ),
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.userData.keep = true; // own textured material: not merged
  p.add(m);
  return m;
}
const debris = (m) => ((m.userData.debris = true), m);

// Merge every static mesh under `root` by material: a whole district in a
// few dozen draw calls (as the game would ship it: modular parts, baked).
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.keep || o.userData.debris || o.userData.fx) return;
    let skip = false;
    for (let a = o.parent; a && a !== root; a = a.parent)
      if (a.userData.debris || a.userData.fx || a.userData.keep) skip = true;
    if (skip || Array.isArray(o.material)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes))
      if (!["position", "normal"].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const list = buckets.get(o.material) || [];
    list.push(g);
    buckets.set(o.material, list);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [material, list] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(list), material);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
}

// --------------------------------------------------------- vehicles --
// Angular low-poly vehicles built like real ones (reference 7): body with
// wheel arches (dark wells and fender lips), tyres with rims and hubs, a
// cabin of A/B/C pillars, roof and separate glass panes, windscreen frame,
// door seams and handles, side mirrors, front and rear bumpers, grille,
// head- and tail-lights, number plates, and per-type equipment. Front is
// -z. A sedan is about 4.3 x 1.9 m.
const V = { well: 0x161519, seam: 0x1b1a1e, trim: 0x2a292e };
// A box between two points in the y-z plane (pillars, glass, struts).
function slant(p, x, a, b, w, t, c, o) {
  const dy = b.y - a.y,
    dz = b.z - a.z,
    len = Math.hypot(dy, dz);
  const m = add(p, new THREE.BoxGeometry(w, t, len), c, x, (a.y + b.y) / 2, (a.z + b.z) / 2, o);
  // Rx(θ) maps +z to (0, -sin θ, cos θ): point it along (dy, dz).
  m.rotation.x = Math.atan2(-dy, dz);
  return m;
}
function wheel(p, x, z, r, rim = C.chrome) {
  const s = Math.sign(x) || 1;
  const t = add(p, new THREE.CylinderGeometry(r, r, 0.3, 12), C.rubber, x, r, z);
  t.rotation.z = Math.PI / 2;
  const m = add(p, new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.06, 8), rim, x + s * 0.13, r, z);
  m.rotation.z = Math.PI / 2;
  const h = add(p, new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.08, 6), V.trim, x + s * 0.16, r, z);
  h.rotation.z = Math.PI / 2;
}
// Lower body with wheel wells, fender lips, rocker panels and the wheels.
function chassis(g, o) {
  const { L, W, clear, h, color, r, axles, rim = C.chrome, track = W / 2 - 0.16 } = o;
  B(g, W, h, L, color, 0, clear, 0);
  for (const z of axles) {
    // Dark wheel well slightly proud of the body side, lip above it.
    B(g, W + 0.02, r * 1.35, r * 2.5, V.well, 0, 0.12, z);
    B(g, W + 0.08, 0.08, r * 2.6, color, 0, 0.12 + r * 1.35, z);
    for (const s of [-1, 1]) wheel(g, s * track, z, r, rim);
  }
  // Rocker panels between the wheels.
  const gap = axles[axles.length - 1] - axles[0] - r * 2.6;
  if (gap > 0.2)
    B(g, W + 0.03, 0.12, gap, V.trim, 0, clear, (axles[0] + axles[axles.length - 1]) / 2);
}
// Cabin: A-pillars from the windscreen base to the roof, B and C pillars,
// roof, windscreen, rear and side glass, all separate pieces.
function cabin(g, o) {
  const { W, belt, roof, zf, zt1, zt2, zb, color, glass = C.glassDark, frame = color, inset = 0.14 } = o;
  const xw = W / 2 - inset;
  const fA = { y: belt, z: zf },
    fB = { y: roof, z: zt1 },
    rA = { y: roof, z: zt2 },
    rB = { y: belt, z: zb };
  B(g, W - 2 * inset + 0.1, 0.09, zt2 - zt1 + 0.06, frame, 0, roof - 0.02, (zt1 + zt2) / 2);
  for (const s of [-1, 1]) {
    slant(g, s * xw, fA, fB, 0.11, 0.11, frame); // A-pillar
    slant(g, s * xw, rA, rB, 0.16, 0.16, frame); // C-pillar
    B(g, 0.1, roof - belt, 0.12, frame, s * xw, belt, (zt1 + zt2) / 2); // B-pillar
    // Side glass: front and rear door windows between the pillars.
    B(g, 0.03, roof - belt - 0.08, (zt2 - zt1) / 2 - 0.1, glass, s * (xw - 0.02), belt + 0.02, zt1 + (zt2 - zt1) / 4 - 0.02, 0, { roughness: 0.2 });
    B(g, 0.03, roof - belt - 0.08, (zt2 - zt1) / 2 - 0.1, glass, s * (xw - 0.02), belt + 0.02, zt1 + (3 * (zt2 - zt1)) / 4 + 0.02, 0, { roughness: 0.2 });
  }
  // Windscreen with a thin frame along its top; rear window.
  slant(g, 0, { y: fA.y + 0.03, z: fA.z + 0.02 }, { y: fB.y - 0.04, z: fB.z - 0.01 }, 2 * xw - 0.1, 0.03, glass, { roughness: 0.2 });
  slant(g, 0, { y: rA.y - 0.04, z: rA.z + 0.01 }, { y: rB.y + 0.03, z: rB.z - 0.02 }, 2 * xw - 0.16, 0.03, glass, { roughness: 0.2 });
  B(g, 2 * xw, 0.06, 0.1, V.trim, 0, belt - 0.03, zf + 0.04); // wiper/cowl line
}
function doorsAndMirrors(g, o) {
  const { W, clear, belt, seams, handles, mirrorZ, color } = o;
  for (const s of [-1, 1]) {
    for (const z of seams) B(g, 0.02, belt - clear - 0.12, 0.03, V.seam, s * (W / 2 + 0.02), clear + 0.1, z);
    for (const z of handles) B(g, 0.04, 0.05, 0.22, V.trim, s * (W / 2 + 0.02), belt - 0.2, z);
    // Mirror: arm and housing at the A-pillar base.
    B(g, 0.22, 0.05, 0.06, V.trim, s * (W / 2 + 0.08), belt + 0.02, mirrorZ);
    B(g, 0.12, 0.16, 0.2, color, s * (W / 2 + 0.22), belt - 0.02, mirrorZ);
  }
}
function ends(g, o) {
  const { W, L, clear, h, bumper = V.trim, grille = V.trim, rear = true, lightW = 0.36 } = o;
  const zf = -L / 2,
    zr = L / 2;
  // Bumpers wrap a little round the corners.
  B(g, W + 0.08, 0.24, 0.22, bumper, 0, clear - 0.08, zf - 0.04);
  B(g, W + 0.08, 0.24, 0.22, bumper, 0, clear - 0.08, zr + 0.04);
  // Grille with slats, headlights with a lens and a housing.
  B(g, W * 0.46, h * 0.42, 0.05, grille, 0, clear + h * 0.28, zf - 0.02);
  for (let i = 0; i < 3; i++) B(g, W * 0.42, 0.03, 0.06, C.chrome, 0, clear + h * 0.33 + i * 0.07, zf - 0.03);
  for (const s of [-1, 1]) {
    B(g, lightW + 0.06, 0.2, 0.05, V.trim, s * (W / 2 - lightW / 2 - 0.1), clear + h * 0.48, zf - 0.02);
    B(g, lightW, 0.14, 0.06, 0xfff6d2, s * (W / 2 - lightW / 2 - 0.1), clear + h * 0.48 + 0.03, zf - 0.03, 0, { emissive: 0xffe9a8, emissiveIntensity: 0.5 });
    B(g, 0.12, 0.08, 0.06, 0xffa02a, s * (W / 2 - 0.08), clear + h * 0.3, zf - 0.02);
    if (rear) B(g, lightW, 0.18, 0.06, 0xd8202c, s * (W / 2 - lightW / 2 - 0.08), clear + h * 0.55, zr + 0.02, 0, { emissive: 0xa0101c, emissiveIntensity: 0.4 });
  }
  B(g, 0.46, 0.15, 0.03, C.white, 0, clear + 0.0, zf - 0.16);
  if (rear) B(g, 0.46, 0.15, 0.03, C.white, 0, clear + 0.0, zr + 0.16);
}
// A four-door sedan; variants by colour and equipment.
function sedanShell(color, opt = {}) {
  const g = new THREE.Group();
  const W = 1.9, L = 4.3, clear = 0.32, h = 0.58, belt = clear + h, roof = 1.5, r = 0.36;
  chassis(g, { L, W, clear, h, color, r, axles: [-1.35, 1.35], rim: opt.rim });
  // Bonnet and boot slope a touch: a raised bonnet panel.
  B(g, W - 0.3, 0.05, 1.0, color, 0, belt, -1.55);
  cabin(g, { W, belt, roof, zf: -0.75, zt1: -0.15, zt2: 0.78, zb: 1.25, color: opt.cabin || color, frame: opt.frame || opt.cabin || color });
  doorsAndMirrors(g, { W, clear, belt, seams: [-0.75, 0.2, 1.1], handles: [-0.05, 0.85], mirrorZ: -0.62, color: opt.mirror || color });
  ends(g, { W, L, clear, h, bumper: opt.bumper || V.trim });
  return { g, W, L, clear, h, belt, roof };
}
export function sedan(color, { taxi = false } = {}) {
  const s = sedanShell(color, { rim: taxi ? 0x9da1a8 : C.chrome });
  if (taxi) {
    // Chequered belt line and a roof sign on two brackets.
    for (let i = 0; i < 16; i++)
      for (const side of [-1, 1])
        B(s.g, 0.02, 0.08, 0.24, (i + (side > 0 ? 0 : 1)) % 2 ? V.trim : C.white, side * (s.W / 2 + 0.04), s.belt - 0.14, -1.85 + i * 0.25);
    B(s.g, 0.8, 0.28, 0.32, C.white, 0, s.roof + 0.1, 0.2);
    B(s.g, 0.82, 0.08, 0.34, V.trim, 0, s.roof + 0.06, 0.2);
    for (const x of [-0.25, 0.25]) B(s.g, 0.06, 0.08, 0.06, V.trim, x, s.roof + 0.04, 0.2);
  }
  return s.g;
}
export function playerCar() {
  // Muscle coupe: long bonnet with a scoop, short cabin set back, wide
  // rear arches, spoiler, side pipes, twin stripes. Hot magenta.
  const g = new THREE.Group();
  const W = 1.96, L = 4.35, clear = 0.26, h = 0.56, belt = clear + h, roof = 1.3, r = 0.38;
  chassis(g, { L, W, clear, h, color: C.player, r, axles: [-1.38, 1.4], rim: C.chrome });
  B(g, W + 0.16, 0.1, r * 2.7, C.player, 0, 0.12 + r * 1.35 + 0.02, 1.4); // wide rear arches
  B(g, W - 0.5, 0.12, 1.5, C.player, 0, belt, -1.25); // bonnet bulge
  B(g, 0.56, 0.16, 0.6, V.trim, 0, belt + 0.12, -1.05); // scoop
  B(g, 0.46, 0.08, 0.04, C.chrome, 0, belt + 0.18, -1.36);
  cabin(g, { W, belt, roof, zf: -0.4, zt1: 0.1, zt2: 0.8, zb: 1.45, color: C.player });
  doorsAndMirrors(g, { W, clear, belt, seams: [-0.38, 0.95], handles: [0.75], mirrorZ: -0.28, color: C.player });
  ends(g, { W, L, clear, h, bumper: C.chrome, lightW: 0.3 });
  // Spoiler on two posts; side exhaust pipes.
  B(g, W - 0.1, 0.06, 0.34, V.trim, 0, belt + 0.36, 1.92);
  for (const x of [-0.7, 0.7]) B(g, 0.08, 0.36, 0.12, V.trim, x, belt, 1.92);
  for (const s of [-1, 1]) {
    const e = add(g, new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), C.chrome, s * (W / 2 + 0.06), clear + 0.04, 0.3);
    e.rotation.x = Math.PI / 2;
  }
  // Twin white stripes over bonnet, roof and boot (on top, not through).
  for (const x of [-0.25, 0.25]) {
    B(g, 0.2, 0.012, 1.45, C.white, x, belt + 0.12, -1.25);
    B(g, 0.2, 0.012, 0.72, C.white, x, roof + 0.025, 0.45);
    B(g, 0.2, 0.012, 0.8, C.white, x, belt, 1.75);
  }
  return g;
}
export function policeCar() {
  // Black-and-white interceptor: white doors and roof, light bar on a
  // frame, push bar, spotlight, antenna, star badges.
  const s = sedanShell(V.trim, { cabin: C.white, frame: V.trim, bumper: V.trim, mirror: V.trim, rim: 0x9da1a8 });
  const g = s.g;
  for (const side of [-1, 1]) {
    B(g, 0.012, s.h - 0.06, 1.85, C.white, side * (s.W / 2 + 0.004), s.clear + 0.04, 0.17);
    const star = add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 5), C.yellow, side * (s.W / 2 + 0.02), s.belt - 0.28, -0.3);
    star.rotation.z = Math.PI / 2;
  }
  // Light bar: base, two feet, red/blue lenses, white centre.
  const lb = G(g, 0, s.roof + 0.04, 0.15);
  for (const x of [-0.55, 0.55]) B(lb, 0.12, 0.06, 0.3, V.trim, x, 0, 0);
  B(lb, 1.4, 0.08, 0.36, V.trim, 0, 0.06, 0);
  B(lb, 0.56, 0.16, 0.32, 0xff2a3c, -0.4, 0.14, 0, 0, { emissive: 0xff2040, emissiveIntensity: 0.8 });
  B(lb, 0.56, 0.16, 0.32, 0x2a6dff, 0.4, 0.14, 0, 0, { emissive: 0x2a60ff, emissiveIntensity: 0.8 });
  B(lb, 0.22, 0.12, 0.3, C.white, 0, 0.14, 0, 0, { emissive: 0xffffff, emissiveIntensity: 0.3 });
  // Push bar frame on the front bumper.
  const zf = -s.L / 2 - 0.2;
  for (const x of [-0.42, 0.42]) B(g, 0.08, 0.62, 0.08, V.trim, x, s.clear - 0.2, zf - 0.1);
  for (const y of [0.18, 0.42]) B(g, 1.0, 0.07, 0.08, V.trim, 0, s.clear + y - 0.2, zf - 0.1);
  // A-pillar spotlight and a roof antenna.
  B(g, 0.14, 0.14, 0.2, C.chrome, -s.W / 2 - 0.05, s.belt + 0.1, -0.68);
  add(g, new THREE.CylinderGeometry(0.01, 0.015, 0.8, 4), V.trim, 0.5, s.roof + 0.4, 0.7);
  return g;
}
function pickup(color) {
  // Crew-cab pickup: tall bonnet, cab, open bed with walls and tailgate.
  const g = new THREE.Group();
  const W = 2.0, L = 4.9, clear = 0.42, h = 0.66, belt = clear + h, roof = 1.85, r = 0.46;
  chassis(g, { L, W, clear, h, color, r, axles: [-1.55, 1.45], rim: 0x9da1a8 });
  cabin(g, { W, belt, roof, zf: -0.85, zt1: -0.45, zt2: 0.25, zb: 0.45, color, inset: 0.12 });
  doorsAndMirrors(g, { W, clear, belt, seams: [-0.85, -0.1], handles: [-0.3], mirrorZ: -0.75, color: V.trim });
  ends(g, { W, L, clear, h, bumper: C.chrome, rear: true, lightW: 0.4 });
  // Bed: floor, walls, tailgate, roll bar.
  B(g, W - 0.24, 0.05, 1.85, 0x4a463f, 0, belt - 0.02, 1.48);
  for (const s of [-1, 1]) B(g, 0.1, 0.42, 1.95, color, s * (W / 2 - 0.05), belt, 1.48);
  B(g, W, 0.42, 0.1, color, 0, belt, 0.5);
  B(g, W, 0.42, 0.1, color, 0, belt, L / 2 - 0.05);
  B(g, W - 0.3, 0.06, 0.06, V.trim, 0, belt + 0.48, 0.58);
  for (const x of [-0.8, 0.8]) B(g, 0.06, 0.48, 0.06, V.trim, x, belt, 0.58);
  for (const x of [-0.5, 0, 0.5]) B(g, 0.2, 0.06, 0.08, 0xffa02a, x, roof + 0.05, -0.2, 0, { emissive: 0xff8a10, emissiveIntensity: 0.3 });
  return g;
}
function van(color) {
  // Box delivery truck: short-nosed cab, tall cargo box with a stripe and
  // a roll-up rear door.
  const g = new THREE.Group();
  const W = 2.1, L = 5.4, clear = 0.42, h = 0.7, belt = clear + h, r = 0.45;
  chassis(g, { L, W, clear, h, color: C.white, r, axles: [-1.75, 1.8], rim: 0x9da1a8 });
  cabin(g, { W, belt, roof: 2.15, zf: -2.2, zt1: -1.75, zt2: -0.9, zb: -0.85, color: C.white, inset: 0.1 });
  doorsAndMirrors(g, { W, clear, belt, seams: [-2.1, -1.0], handles: [-1.2], mirrorZ: -2.05, color: V.trim });
  ends(g, { W, L, clear, h, bumper: V.trim, rear: false, lightW: 0.38 });
  B(g, W + 0.06, 2.0, 3.3, C.white, 0, belt - 0.05, 0.95);
  for (const s of [-1, 1]) B(g, 0.02, 0.3, 3.3, color, s * (W / 2 + 0.035), belt + 0.7, 0.95);
  for (let i = 0; i < 8; i++) B(g, W - 0.3, 0.02, 0.03, 0xb9bcc2, 0, belt + 0.1 + i * 0.22, 2.62);
  for (const s of [-1, 1]) B(g, 0.3, 0.16, 0.06, 0xd8202c, s * (W / 2 - 0.2), belt - 0.3, 2.62, 0, { emissive: 0xa0101c, emissiveIntensity: 0.4 });
  return g;
}

// ------------------------------------------------- street furniture --
function tree(p, x, z, k = 0, s = 1) {
  // Faceted canopy clumps (icosahedron, detail 0) on a kinked trunk.
  const g = G(p, x, 0, z, k * 1.7);
  const t1 = add(g, new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.8 * s, 5), C.trunk, 0, 0.9 * s, 0);
  const t2 = add(g, new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.4 * s, 5), C.trunk, 0.25 * s, 2.3 * s, 0);
  t2.rotation.z = -0.3;
  t1.userData.trunk = t2.userData.trunk = true;
  const leaf = C.leaf[k % 3];
  const c1 = add(g, new THREE.IcosahedronGeometry(1.5 * s, 0), leaf, 0.5 * s, 3.5 * s, 0);
  c1.scale.y = 0.75;
  const c2 = add(g, new THREE.IcosahedronGeometry(0.95 * s, 0), leaf, -0.9 * s, 2.7 * s, 0.4 * s);
  c2.scale.y = 0.8;
  c2.rotation.y = 0.7;
  return g;
}
function conifer(p, x, z, s = 1) {
  const g = G(p, x, 0, z);
  cyl(g, 0.14 * s, 0.18 * s, 0.8 * s, C.trunk, 0, 0, 0, 5);
  add(g, new THREE.ConeGeometry(1.0 * s, 2.6 * s, 6), C.leaf[0], 0, 1.9 * s, 0);
  return g;
}
function streetLight(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  cyl(g, 0.22, 0.26, 0.3, C.metal, 0, 0, 0, 6);
  cyl(g, 0.08, 0.1, 4.6, C.metal, 0, 0.3, 0, 6);
  B(g, 0.1, 0.1, 1.2, C.metal, 0, 4.8, -0.55);
  B(g, 0.42, 0.18, 0.62, C.metal, 0, 4.7, -1.15);
  B(g, 0.34, 0.06, 0.5, 0xfff1c0, 0, 4.66, -1.15, 0, { emissive: 0xffd98a, emissiveIntensity: 0.7 });
  return g;
}
function trafficLight(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  cyl(g, 0.1, 0.12, 5.2, C.dark, 0, 0, 0, 6);
  B(g, 0.12, 0.12, 3.4, C.dark, 0, 5.0, -1.6);
  for (const zz of [-0.1, -3.0]) {
    const h = G(g, 0, zz === -0.1 ? 2.6 : 4.4, zz);
    B(h, 0.42, 1.2, 0.36, C.dark, 0, 0, 0);
    [0xff4040, 0xffc040, 0x40d070].forEach((c, i) =>
      B(h, 0.26, 0.26, 0.06, c, 0, 0.9 - i * 0.36, -0.2, 0, { emissive: c, emissiveIntensity: i === 2 ? 0.9 : 0.15 }),
    );
  }
  return g;
}
function stopSign(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  B(g, 0.08, 2.4, 0.08, C.metal, 0, 0, 0);
  const s = add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8), 0xd8443f, 0, 2.5, 0);
  s.rotation.x = Math.PI / 2;
  s.rotation.y = Math.PI / 8;
  return g;
}
function bench(p, x, z, ry = 0, color = 0xc77a45) {
  const g = G(p, x, 0, z, ry);
  B(g, 2.0, 0.08, 0.6, color, 0, 0.5, 0);
  B(g, 2.0, 0.42, 0.08, color, 0, 0.62, 0.3);
  for (const s of [-0.85, 0.85]) B(g, 0.1, 0.5, 0.55, C.metal, s, 0, 0.02);
  return g;
}
function bins(p, x, z, ry = 0) {
  // Recycling pair (reference 5): blue and yellow lids.
  const g = G(p, x, 0, z, ry);
  B(g, 0.8, 1.0, 0.8, 0x5e7a8f, -0.45, 0, 0);
  B(g, 0.84, 0.12, 0.84, 0x6cb6e0, -0.45, 1.0, 0);
  B(g, 0.8, 1.0, 0.8, 0x5e7a8f, 0.45, 0, 0);
  B(g, 0.84, 0.12, 0.84, C.yellow, 0.45, 1.0, 0);
  return g;
}
function hydrant(p, x, z) {
  const g = G(p, x, 0, z);
  cyl(g, 0.22, 0.26, 0.7, C.red, 0, 0, 0, 6);
  cyl(g, 0.12, 0.24, 0.24, C.red, 0, 0.7, 0, 6);
  B(g, 0.6, 0.14, 0.14, C.red, 0, 0.42, 0);
  return g;
}
function planter(p, x, z, len = 3.4, ry = 0) {
  // Long stone planter with a clipped faceted hedge (reference 5).
  const g = G(p, x, 0, z, ry);
  B(g, len, 0.45, 0.9, C.curb, 0, 0, 0);
  B(g, len - 0.2, 0.55, 0.7, C.leaf[0], 0, 0.45, 0);
  return g;
}
function picketFence(p, x, z, len, ry = 0, color = C.white) {
  const g = G(p, x, 0, z, ry);
  const n = Math.round(len / 0.4);
  for (let i = 0; i <= n; i++) B(g, 0.1, 1.0, 0.08, color, -len / 2 + i * 0.4, 0, 0);
  B(g, len, 0.08, 0.06, color, 0, 0.75, 0.05);
  B(g, len, 0.08, 0.06, color, 0, 0.35, 0.05);
  return g;
}
function crate(p, x, y, z, c = 0xc9935a, s = 0.6) {
  return B(p, s, s, s, c, x, y, z);
}

// ---------------------------------------------------------- buildings --
// Shared facade kit: windows with frames and sills, balconies with
// railings, cornice bands, parapets, rooftop units. All rectangular parts,
// so a whole facade bakes into a few draw calls.
function windowAt(p, x, y, z, w, h, frame, ry = 0, sill = true) {
  // A recessed window: the frame stands 0.22 m proud of the wall, the glass
  // sits at the back of it, with a mullion, a transom, a lintel and a sill.
  // Nothing passes through anything else.
  const g = G(p, x, y, z, ry);
  const fd = 0.22,
    bar = 0.12;
  B(g, w + 2 * bar, bar, fd, frame, 0, h / 2, fd / 2);
  B(g, w + 2 * bar, bar, fd, frame, 0, -h / 2 - bar, fd / 2);
  B(g, bar, h, fd, frame, -w / 2 - bar / 2, -h / 2, fd / 2);
  B(g, bar, h, fd, frame, w / 2 + bar / 2, -h / 2, fd / 2);
  B(g, w, h, 0.03, C.glass, 0, -h / 2, 0.015, 0, { roughness: 0.25 });
  B(g, 0.05, h, 0.08, frame, 0, -h / 2, 0.07);
  B(g, w, 0.05, 0.08, frame, 0, h * 0.18, 0.07);
  B(g, w + 2 * bar + 0.2, 0.14, fd + 0.06, frame, 0, h / 2 + bar, (fd + 0.06) / 2);
  if (sill) B(g, w + 2 * bar + 0.2, 0.1, fd + 0.14, frame, 0, -h / 2 - bar - 0.1, (fd + 0.14) / 2);
  return g;
}
// Windows on one face (local z = depth/2 facing +z) for `floors`.
function facade(p, width, depth, floors, floorH, opts) {
  const { frame = C.white, every = 2.2, w = 1.1, h = 1.4, from = 1, balcony = null, start = 0.4 } = opts;
  const n = Math.max(1, Math.floor((width - 1) / every));
  const x0 = -((n - 1) * every) / 2;
  for (let f = from; f < floors; f++) {
    const y = start + f * floorH + floorH * 0.45;
    for (let i = 0; i < n; i++) {
      windowAt(p, x0 + i * every, y, depth / 2 + 0.02, w, h, frame);
      if (balcony && (f + i) % balcony === 0) {
        B(p, w + 0.9, 0.12, 0.9, frame, x0 + i * every, y - h / 2 - 0.42, depth / 2 + 0.45);
        for (let r = 0; r <= 6; r++)
          B(p, 0.06, 0.7, 0.06, frame, x0 + i * every - (w + 0.8) / 2 + r * ((w + 0.8) / 6), y - h / 2 - 0.3, depth / 2 + 0.86);
        B(p, w + 0.9, 0.08, 0.08, frame, x0 + i * every, y - h / 2 + 0.4, depth / 2 + 0.86);
      }
    }
  }
}
function rooftopKit(p, w, d, y, seed = 0) {
  B(p, 1.4, 0.8, 1.0, 0xc5c0c8, -w / 4, y, -d / 4 + (seed % 2));
  B(p, 0.9, 0.5, 0.9, 0xc5c0c8, -w / 4 + 1.8, y, -d / 4);
  B(p, 0.8, 0.6, 0.8, 0x8f8a94, w / 3, y, d / 4);
  cyl(p, 0.05, 0.05, 1.8, C.metal, w / 4, y, -d / 3, 4);
}
function parapet(p, w, d, y, c, h = 0.6) {
  B(p, w + 0.2, h, 0.25, c, 0, y, d / 2);
  B(p, w + 0.2, h, 0.25, c, 0, y, -d / 2);
  B(p, 0.25, h, d - 0.25, c, w / 2 - 0.025, y, 0);
  B(p, 0.25, h, d - 0.25, c, -w / 2 + 0.025, y, 0);
}
function awning(p, w, x, y, z, a, b, depth = 1.3, ry = 0) {
  const g = G(p, x, y, z, ry);
  const n = Math.max(2, Math.round(w / 0.55));
  for (let i = 0; i < n; i++) {
    const s = B(g, w / n, 0.1, depth, i % 2 ? b : a, -w / 2 + (i + 0.5) * (w / n), 0, depth / 2);
    s.rotation.x = 0.35;
  }
  // Scalloped front edge.
  for (let i = 0; i < n; i++) B(g, w / n, 0.3, 0.06, i % 2 ? b : a, -w / 2 + (i + 0.5) * (w / n), -0.6, depth - 0.05);
  return g;
}

// 1. Orange apartment block (reference 5): 6 floors, balconies, entrance.
function orangeApartment(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  const W = 13, D = 10, F = 6, FH = 3;
  B(g, W, F * FH + 0.6, D, C.orange, 0, 0, 0);
  for (let f = 1; f <= F; f++) B(g, W + 0.3, 0.25, D + 0.3, C.orangeDark, 0, f * FH + 0.3, 0);
  facade(g, W, D, F, FH, { frame: C.creamLight, every: 2.6, w: 1.3, h: 1.5, from: 1, balcony: 2 });
  const side = G(g, 0, 0, 0, Math.PI / 2);
  facade(side, D, W, F, FH, { frame: C.creamLight, every: 2.6, w: 1.2, h: 1.5, from: 1 });
  // Entrance: stepped plinth, revolving-door bay, canopy.
  B(g, 4.2, 0.3, 1.6, 0x8f4a2e, 0, 0, D / 2 + 0.6);
  B(g, 3.6, 0.3, 1.2, 0x8f4a2e, 0, 0.3, D / 2 + 0.5);
  B(g, 2.6, 2.6, 0.2, C.glassDark, 0, 0.6, D / 2 + 0.05);
  B(g, 3.6, 0.25, 2.0, 0xc89a55, 0, 3.0, D / 2 + 1.0);
  // Shop window and billboard at street level.
  B(g, 3.6, 2.2, 0.2, C.glass, -4.2, 0.6, D / 2 + 0.05);
  B(g, 3.4, 2.4, 0.2, C.yellow, 4.3, 0.7, D / 2 + 0.1);
  B(g, 1.4, 1.6, 0.22, C.dark, 4.3, 1.1, D / 2 + 0.12);
  parapet(g, W, D, F * FH + 0.6, C.orangeDark);
  rooftopKit(g, W, D, F * FH + 0.6, 1);
  cyl(g, 1.0, 1.0, 1.8, 0x9fb3c7, 3.5, F * FH + 1.6, -2, 8);
  for (const a of [-1, 1]) cyl(g, 0.07, 0.07, 1.0, C.metal, 3.5 + a * 0.7, F * FH + 0.6, -2, 4);
  return g;
}
// 2. Red block with a rooftop billboard (reference 4).
function redBillboard(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  const W = 9, D = 10, F = 4, FH = 3.1;
  B(g, W, F * FH + 0.5, D, C.red, 0, 0, 0);
  facade(g, W, D, F, FH, { frame: C.redDark, every: 2.0, w: 0.9, h: 1.4, from: 1 });
  const side = G(g, 0, 0, 0, -Math.PI / 2);
  facade(side, D, W, F, FH, { frame: C.redDark, every: 2.0, w: 0.9, h: 1.4, from: 1 });
  // Ground floor: dark awning over a glazed shopfront.
  B(g, W - 1, 2.4, 0.2, C.glass, 0, 0.3, D / 2 + 0.02);
  B(g, W - 0.6, 0.4, 1.2, C.dark, 0, 2.9, D / 2 + 0.6);
  parapet(g, W, D, F * FH + 0.5, C.redDark, 0.5);
  // Billboard on two legs.
  const b = G(g, 0, F * FH + 0.5, -1, 0);
  for (const s of [-2, 2]) B(b, 0.2, 2.2, 0.2, C.dark, s, 0, 0);
  B(b, 5.8, 3.2, 0.25, C.white, 0, 2.0, 0);
  const stripe = B(b, 1.2, 3.6, 0.27, C.yellow, 0.4, 1.8, 0);
  stripe.rotation.z = 0.5;
  B(b, 5.8, 0.25, 0.6, C.dark, 0, 1.8, 0.2);
  return g;
}
// 3. Blue residential with solar panels (reference 4).
function blueResidential(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  const W = 10, D = 11, F = 5, FH = 3;
  B(g, W, F * FH + 0.5, D, C.blue, 0, 0, 0);
  facade(g, W, D, F, FH, { frame: C.white, every: 2.2, w: 1.0, h: 1.5, from: 1, balcony: 3 });
  const side = G(g, 0, 0, 0, Math.PI / 2);
  facade(side, D, W, F, FH, { frame: C.white, every: 2.2, w: 1.0, h: 1.5, from: 1 });
  B(g, 1.6, 2.4, 0.2, C.blueDark, 0, 0.3, D / 2 + 0.05);
  B(g, 2.4, 0.2, 1.2, C.white, 0, 2.8, D / 2 + 0.55);
  for (const s of [-1.1, 1.1]) windowAt(g, s * 2.6, 1.6, D / 2 + 0.02, 1.4, 1.3, C.white);
  parapet(g, W, D, F * FH + 0.5, C.blueDark, 0.5);
  for (const sx of [-1.5, 1.6]) {
    const panel = B(g, 2.4, 0.08, 3.2, 0x6f8fd8, sx, F * FH + 1.2, 0.5, 0, { roughness: 0.25, metalness: 0.2 });
    panel.rotation.x = -0.4;
    B(g, 0.1, 0.8, 0.1, C.metal, sx, F * FH + 0.5, 1.4);
  }
  B(g, 1.0, 1.2, 1.0, C.blueDark, -3.5, F * FH + 0.5, -3.5);
  return g;
}
// 4. Landmark: a brick corner building with a wine shop (reference 8).
// Green timber shopfront with pilasters, display windows and a sign band;
// two brick upper floors with stone quoins and string courses; square
// windows with blinds, an AC unit and a planter on the first floor, arched
// windows on the second; a dentil cornice; rooftop HVAC, ducting and vents;
// a downpipe; awning with a bar counter and stools; old street lamps.
// Every piece is placed against, never through, its neighbour.
const brickTex = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#d9c6b3";
    g.fillRect(0, 0, 256, 256);
    const rows = 16,
      bh = 256 / rows,
      bw = 256 / 4;
    for (let r = 0; r < rows; r++)
      for (let i = -1; i < 5; i++) {
        const x = i * bw + (r % 2 ? bw / 2 : 0);
        const v = ((r * 7 + i * 13) % 5) - 2;
        g.fillStyle = `rgb(${184 + v * 8},${74 + v * 5},${46 + v * 3})`;
        g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      }
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };
})();
// A brick-faced box: texture tiled at about 1 m x 1 m per tile.
function brickBox(p, w, h, d, x, y, z) {
  const face = (u, v) => {
    const t = brickTex().clone();
    t.needsUpdate = true;
    t.repeat.set(u, v);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  };
  const side = face(d / 1.0, h / 1.0),
    front = face(w / 1.0, h / 1.0),
    top = M(0x8f3b26);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, front, front]);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  m.userData.keep = true; // textured: not merged
  p.add(m);
  return m;
}
// Window with blinds half drawn (no mullion, so slats never cross it).
function blindsWindow(p, x, y, z, w, h, frame) {
  const g = G(p, x, y, z);
  const fd = 0.22,
    bar = 0.12;
  B(g, w + 2 * bar, bar, fd, frame, 0, h / 2, fd / 2);
  B(g, w + 2 * bar, bar, fd, frame, 0, -h / 2 - bar, fd / 2);
  B(g, bar, h, fd, frame, -w / 2 - bar / 2, -h / 2, fd / 2);
  B(g, bar, h, fd, frame, w / 2 + bar / 2, -h / 2, fd / 2);
  B(g, w, h, 0.03, C.glass, 0, -h / 2, 0.015, 0, { roughness: 0.25 });
  for (let i = 0; i < 9; i++) B(g, w - 0.04, 0.04, 0.02, C.white, 0, h / 2 - 0.08 - i * 0.09, 0.045);
  B(g, w + 2 * bar + 0.2, 0.14, fd + 0.06, frame, 0, h / 2 + bar, (fd + 0.06) / 2);
  B(g, w + 2 * bar + 0.2, 0.1, fd + 0.14, frame, 0, -h / 2 - bar - 0.1, (fd + 0.14) / 2);
  return { g, sillTop: -h / 2 - bar, sillBottom: -h / 2 - bar - 0.1 };
}
// Round-headed window (angular arch: 6 segments) with a keystone.
function archWindow(p, x, y, z, w, hs, frame) {
  const g = G(p, x, y, z);
  const rO = w / 2 + 0.14,
    rI = w / 2;
  const outer = new THREE.Shape();
  outer.moveTo(-rO, 0);
  outer.lineTo(rO, 0);
  outer.lineTo(rO, hs);
  outer.absarc(0, hs, rO, 0, Math.PI, false);
  outer.lineTo(-rO, 0);
  const hole = new THREE.Path();
  hole.moveTo(-rI, 0.14);
  hole.lineTo(rI, 0.14);
  hole.lineTo(rI, hs);
  hole.absarc(0, hs, rI, 0, Math.PI, false);
  hole.lineTo(-rI, 0.14);
  outer.holes.push(hole);
  add(g, new THREE.ExtrudeGeometry(outer, { depth: 0.22, bevelEnabled: false, curveSegments: 3 }), frame, 0, 0, 0);
  const glass = new THREE.Shape();
  glass.moveTo(-rI, 0.14);
  glass.lineTo(rI, 0.14);
  glass.lineTo(rI, hs);
  glass.absarc(0, hs, rI, 0, Math.PI, false);
  glass.lineTo(-rI, 0.14);
  add(g, new THREE.ExtrudeGeometry(glass, { depth: 0.03, bevelEnabled: false, curveSegments: 3 }), C.glass, 0, 0, 0, { roughness: 0.25 });
  B(g, 0.05, hs + rI - 0.14, 0.06, frame, 0, 0.14, 0.05); // glazing bar
  B(g, w, 0.05, 0.06, frame, 0, hs, 0.05);
  B(g, 0.26, 0.34, 0.26, frame, 0, hs + rO - 0.2, 0.0); // keystone
  B(g, w + 0.5, 0.1, 0.36, frame, 0, -0.1, 0.18); // sill
  return g;
}
function oldLamp(p, x, z) {
  const g = G(p, x, 0, z);
  const bronze = 0xb8692f;
  cyl(g, 0.2, 0.26, 0.4, bronze, 0, 0, 0, 6);
  cyl(g, 0.07, 0.09, 3.2, bronze, 0, 0.4, 0, 6);
  cyl(g, 0.16, 0.12, 0.16, bronze, 0, 3.6, 0, 6);
  B(g, 0.36, 0.5, 0.36, 0xffd98a, 0, 3.76, 0, 0, { emissive: 0xffb84a, emissiveIntensity: 0.8 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.05, 0.5, 0.05, bronze, sx * 0.2, 3.76, sz * 0.2);
  add(g, new THREE.ConeGeometry(0.34, 0.34, 4), bronze, 0, 4.43, 0).rotation.y = Math.PI / 4;
  return g;
}
function landmark(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  const W = 9, D = 9, GF = 4.2, F1 = 3.3, F2 = 3.3;
  const top = GF + F1 + F2; // 10.8
  const green = C.storeGreen,
    gold = 0xe2b84a,
    stone = C.stone;
  // Shop interior (seen through the glass): dark warm room with shelves.
  B(g, W - 1.0, GF - 0.6, D - 1.0, 0x3a2a1e, 0, 0.3, 0);
  // Upper floors in brick on a stone ledge; string course between them.
  brickBox(g, W, F1 + F2, D, 0, GF, 0);
  B(g, W + 0.6, 0.3, D + 0.6, stone, 0, GF - 0.05, 0);
  B(g, W + 0.3, 0.25, D + 0.3, stone, 0, GF + F1, 0);
  // Cornice: band, dentils, cap.
  B(g, W + 0.5, 0.4, D + 0.5, stone, 0, top, 0);
  B(g, W + 0.7, 0.2, D + 0.7, stone, 0, top + 0.4, 0);
  for (let i = 0; i < 20; i++) {
    const s = -W / 2 + 0.25 + i * ((W - 0.5) / 19);
    B(g, 0.16, 0.16, 0.12, stone, s, top - 0.16, D / 2 + 0.06);
    B(g, 0.12, 0.16, 0.16, stone, W / 2 + 0.06, top - 0.16, -s);
  }
  // Stone quoins on the three street-visible corners (wrap the corner;
  // front pieces run to the corner, side pieces stop at it: no overlap).
  for (let r = 0; r < Math.floor((F1 + F2 - 0.3) / 0.36); r++) {
    const y = GF + 0.3 + r * 0.36,
      long = r % 2 === 0;
    const a = long ? 0.9 : 0.55,
      b = long ? 0.55 : 0.9;
    B(g, a + 0.1, 0.3, 0.1, stone, W / 2 - a / 2 + 0.05, y, D / 2 + 0.05);
    B(g, 0.1, 0.3, b, stone, W / 2 + 0.05, y, D / 2 - b / 2);
    B(g, a + 0.1, 0.3, 0.1, stone, -W / 2 + a / 2 - 0.05, y, D / 2 + 0.05);
    B(g, 0.1, 0.3, b, stone, W / 2 + 0.05, y, -D / 2 + b / 2);
  }
  // The two street faces (local +z and +x) share one facade recipe.
  const faces = [G(g, 0, 0, 0, 0), G(g, 0, 0, 0, Math.PI / 2)];
  faces.forEach((f, k) => {
    const half = (k === 0 ? D : W) / 2,
      span = k === 0 ? W : D;
    // Shopfront: plinth, pilasters, display glass with mullions, transom.
    B(f, span, 0.5, 0.3, green, 0, 0, half + 0.15);
    const bays = [-span / 2 + 0.25, -span / 6, span / 6, span / 2 - 0.25];
    for (const bx of bays) B(f, 0.46, GF - 0.9, 0.36, green, bx, 0.5, half + 0.18);
    for (let b = 0; b < 3; b++) {
      const cx = (bays[b] + bays[b + 1]) / 2,
        bw = bays[b + 1] - bays[b] - 0.46;
      const isDoor = k === 0 && b === 1;
      if (isDoor) {
        B(f, bw, 2.6, 0.06, green, 0, 0.5, half + 0.03);
        B(f, bw - 0.5, 2.0, 0.03, 0xf2c27a, cx, 0.75, half + 0.07, 0, { emissive: 0xc8781e, emissiveIntensity: 0.35 });
        B(f, 0.06, 0.3, 0.08, gold, cx + bw / 2 - 0.4, 1.6, half + 0.1);
      } else {
        B(f, bw, 2.5, 0.03, 0xf2c27a, cx, 0.6, half + 0.015, 0, { transparent: true, opacity: 0.55, emissive: 0xc8781e, emissiveIntensity: 0.3 });
        B(f, 0.06, 2.5, 0.08, green, cx, 0.6, half + 0.06);
        B(f, bw, 0.06, 0.08, green, cx, 2.5, half + 0.06);
      }
      // Wine shelves behind the glass (inside the room, clear of it).
      for (let s = 0; s < 3; s++) B(f, bw - 0.3, 0.05, 0.3, 0x8a5a32, cx, 0.9 + s * 0.6, half - 0.65);
      for (let n = 0; n < 6; n++) B(f, 0.08, 0.26, 0.08, [0x6a1f2a, 0x2c5a3a, 0xc9a24a][n % 3], cx - bw / 2 + 0.4 + n * ((bw - 0.8) / 5), 0.95, half - 0.65);
    }
    B(f, span, 0.6, 0.2, green, 0, 3.0, half + 0.1); // transom panel
    signBoard(f, k === 0 ? "CORNER WINES" : "WINE STORE", span * 0.62, 0.5, 0, 3.3, half + 0.28, 0, "#2c5a3a", "#e2b84a");
    B(f, span + 0.1, 0.18, 0.5, stone, 0, GF - 0.48, half + 0.25); // shopfront cornice
    for (const bx of [bays[0] + 0.6, bays[3] - 0.6]) {
      // Wall lanterns on brackets.
      B(f, 0.06, 0.06, 0.3, 0x3a2a1e, bx, 2.95, half + 0.5);
      B(f, 0.22, 0.32, 0.22, 0xffd98a, bx, 2.75, half + 0.7, 0, { emissive: 0xffb84a, emissiveIntensity: 0.8 });
    }
    // First floor: two windows with blinds; an AC unit under one, a planter
    // on the other's sill.
    const y1 = GF + 1.7;
    [-span / 4, span / 4].forEach((wx, i) => {
      const win = blindsWindow(f, wx, y1, half + 0.02, 1.1, 1.5, stone);
      if (i === (k === 0 ? 0 : 1)) {
        const ac = G(f, wx, y1 + win.sillBottom - 0.02 - 0.5, half);
        B(ac, 0.8, 0.5, 0.55, 0xe4e4e0, 0, 0, 0.3);
        for (let s = 0; s < 4; s++) B(ac, 0.5, 0.03, 0.02, 0x8f8f94, -0.08, 0.1 + s * 0.09, 0.585);
        const fan = add(ac, new THREE.CylinderGeometry(0.13, 0.13, 0.02, 8), 0x8f8f94, 0.26, 0.25, 0.585);
        fan.rotation.x = Math.PI / 2;
        B(ac, 0.08, 0.06, 0.6, C.metal, 0, -0.06, 0.3);
      } else {
        const pl = G(f, wx, y1 + win.sillTop, half + 0.02 + 0.26);
        B(pl, 1.0, 0.24, 0.28, 0x8a5a32, 0, 0, 0.14);
        for (const px of [-0.3, 0, 0.3]) add(pl, new THREE.IcosahedronGeometry(0.17, 0), C.leaf[2], px, 0.38, 0.14);
      }
    });
    // Second floor: arched windows.
    for (const wx of [-span / 4, span / 4]) archWindow(f, wx, GF + F1 + 0.55, half + 0.02, 1.0, 1.25, stone);
  });
  // Awning over the side shopfront with a bar counter and stools beneath.
  awning(faces[1], 5.2, 0, GF - 1.05, W / 2 + 0.36, 0xd62f2a, 0xd62f2a, 1.5);
  const bar = G(faces[1], 0, 0, W / 2 + 1.25);
  B(bar, 4.0, 0.08, 0.5, 0x9a6a3a, 0, 1.05, 0);
  for (const s of [-1.6, 1.6]) B(bar, 0.08, 1.05, 0.08, 0x3a2a1e, s, 0, 0);
  for (const s of [-1.2, 0, 1.2]) {
    cyl(bar, 0.2, 0.2, 0.06, 0xc9612a, s, 0.72, 0.6, 8);
    for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) B(bar, 0.04, 0.72, 0.04, 0xc9612a, s + dx, 0, 0.6 + dz);
  }
  // A-frame chalkboard and crates by the door.
  const board = G(faces[0], 1.9, 0, D / 2 + 1.0);
  const l1 = B(board, 0.7, 1.0, 0.05, 0x2a2a2a, 0, 0, 0.15);
  l1.rotation.x = -0.25;
  const l2 = B(board, 0.7, 1.0, 0.05, 0x2a2a2a, 0, 0, -0.15);
  l2.rotation.x = 0.25;
  const crates = G(faces[0], -1.1, 0, D / 2 + 0.75);
  B(crates, 0.55, 0.4, 0.4, 0x2f5fbf, 0, 0, 0);
  B(crates, 0.55, 0.4, 0.4, 0x2c5a3a, 0.6, 0, 0);
  B(crates, 0.55, 0.4, 0.4, 0xd62f2a, 0.3, 0.4, 0);
  // Roof: membrane, parapet, HVAC with fans, ducting with an elbow, vents,
  // a chimney stack and a hatch.
  const r0 = top + 0.6;
  B(g, W + 0.3, 0.05, D + 0.3, 0x55525a, 0, r0, 0);
  parapet(g, W + 0.5, D + 0.5, r0, stone, 0.45);
  B(g, 2.0, 0.9, 1.2, 0xcfd0d4, -1.6, r0, -1.8);
  for (const fx of [-2.1, -1.1]) {
    cyl(g, 0.34, 0.34, 0.06, 0x6a6a70, fx, r0 + 0.9, -1.8, 8);
    B(g, 0.6, 0.02, 0.06, 0x3a3a40, fx, r0 + 0.96, -1.8);
  }
  B(g, 3.2, 0.5, 0.5, 0xb9bcc2, 1.0, r0 + 0.35, -1.8);
  B(g, 0.5, 0.85, 0.5, 0xb9bcc2, 2.85, r0, -1.8);
  B(g, 0.6, 0.45, 0.6, 0xb9bcc2, -0.35, r0 + 0.2, -1.8);
  for (const [vx, vz] of [[2.5, 2.0], [1.4, 2.6]]) {
    cyl(g, 0.12, 0.12, 0.7, C.metal, vx, r0, vz, 6);
    cyl(g, 0.22, 0.22, 0.08, C.metal, vx, r0 + 0.7, vz, 6);
  }
  brickBox(g, 0.9, 1.4, 0.9, -3.2, r0, 2.9);
  B(g, 1.0, 0.12, 1.0, stone, -3.2, r0 + 1.4, 2.9);
  B(g, 1.1, 0.25, 1.1, 0x6a6a70, 0.4, r0, 1.2);
  // Downpipe on the side wall, clear of every projection, with brackets
  // and a gutter outlet into the cornice.
  const px = W / 2 + 0.5,
    pz = -D / 2 + 1.3;
  cyl(g, 0.08, 0.08, top + 0.2, 0x7a7d84, px, 0, pz, 6);
  B(g, 0.45, 0.14, 0.14, 0x7a7d84, W / 2 + 0.36, top + 0.1, pz);
  for (const by of [2.0, 6.0, 9.2]) B(g, 0.5, 0.06, 0.06, 0x55525a, W / 2 + 0.25, by, pz);
  // Old street lamps on the corner pavement.
  oldLamp(g, W / 2 + 1.6, D / 2 + 1.6);
  oldLamp(g, -W / 2 + 0.6, D / 2 + 1.7);
  return g;
}
// 5. Narrow shops in a row: varied colours, roofs and signs.
function shop(p, x, z, W, colors, name, roof, ry = 0) {
  const [wall, trim, aw1, aw2] = colors;
  const g = G(p, x, 0, z, ry);
  const D = 9, H = roof === "tall" ? 9.6 : 6.6;
  B(g, W, H, D, wall, 0, 0, 0);
  for (let f = 1; f <= (H > 7 ? 2 : 1); f++) B(g, W + 0.2, 0.2, D + 0.2, trim, 0, f * 3.3, 0);
  facade(g, W, D, H > 7 ? 3 : 2, 3.3, { frame: trim, every: 2.0, w: 0.9, h: 1.3, from: 1, balcony: H > 7 ? 2 : 0 });
  B(g, W - 1.2, 2.3, 0.2, C.glass, 0, 0.3, D / 2 + 0.02);
  B(g, 0.9, 2.4, 0.22, C.dark, W / 2 - 0.9, 0.0, D / 2 + 0.03);
  awning(g, W - 0.6, 0, 3.0, D / 2, aw1, aw2, 1.4);
  signBoard(g, name, W - 1.2, 0.7, 0, 3.55, D / 2 + 0.1, 0, "#" + new THREE.Color(trim).getHexString(), "#ffffff");
  if (roof === "gable") gable(g, W + 0.4, 2.4, D + 0.4, C.teal, 0, H, 0, Math.PI / 2);
  else if (roof === "mansard") {
    frustum(g, W + 0.3, D + 0.3, 2.0, 0.6, C.teal, 0, H, 0);
    for (const s of [-1, 1]) B(g, 1.0, 1.0, 0.6, C.creamLight, s * (W / 4), H + 0.3, D / 2 - 0.4);
  } else {
    parapet(g, W, D, H, trim, 0.6);
    rooftopKit(g, W, D, H, 2);
  }
  // Flower boxes under the upper windows.
  for (const s of [-1, 1]) B(g, 1.1, 0.25, 0.3, 0x58b85a, s * 1.0, 4.0, D / 2 + 0.25);
  return g;
}

// ------------------------------------------------------------- terrain --
function slab(p, w, d, h, c, x, z, y = 0) {
  return B(p, w, h, d, c, x, y, z);
}
// Pavement around a block (x0..x1, z0..x1), kerb on the road side.
function pavement(p, x0, x1, z0, z1) {
  slab(p, x1 - x0, z1 - z0, 0.3, C.walk, (x0 + x1) / 2, (z0 + z1) / 2);
  // Tile joints.
  for (let x = x0 + 1.5; x < x1; x += 1.5) slab(p, 0.05, z1 - z0, 0.01, C.walkJoint, x, (z0 + z1) / 2, 0.3);
  for (let z = z0 + 1.5; z < z1; z += 1.5) slab(p, x1 - x0, 0.05, 0.01, C.walkJoint, (x0 + x1) / 2, z, 0.3);
}
function kerbRect(p, x0, x1, z0, z1) {
  slab(p, x1 - x0 + 0.3, 0.3, 0.34, C.curb, (x0 + x1) / 2, z0);
  slab(p, x1 - x0 + 0.3, 0.3, 0.34, C.curb, (x0 + x1) / 2, z1);
  slab(p, 0.3, z1 - z0, 0.34, C.curb, x0, (z0 + z1) / 2);
  slab(p, 0.3, z1 - z0, 0.34, C.curb, x1, (z0 + z1) / 2);
}

// ------------------------------------------------------- the district --
// Road grid: an avenue along x (z = 0, 4 lanes, 12 m) crossing a street
// along z (x = 0, 2 lanes, 10 m). Blocks: NW commercial street, NE gas
// station + red block, SW park, SE basketball court + residential + café.
// Roads run on past the district into a dimmer surrounding city.
const AV = 6, ST = 5, R = 52; // half widths; district half size
function roads(p) {
  slab(p, 2 * R + 60, 2 * AV, 0.1, C.asphalt, 0, 0);
  slab(p, 2 * ST, 2 * R + 60, 0.1, C.asphalt, 0, 0);
  // Avenue: double yellow centre line, dashed white lane lines.
  for (const s of [-0.18, 0.18]) slab(p, 2 * R + 60, 0.14, 0.02, C.lineYellow, 0, s, 0.1);
  for (let x = -R - 30; x < R + 30; x += 4) {
    if (Math.abs(x) < ST + 6) continue;
    for (const s of [-3, 3]) slab(p, 2.0, 0.16, 0.02, C.lineWhite, x, s, 0.1);
  }
  for (let z = -R - 30; z < R + 30; z += 4) {
    if (Math.abs(z) < AV + 6) continue;
    slab(p, 0.16, 2.0, 0.02, C.lineWhite, 0, z, 0.1);
  }
  // Zebra crossings and stop lines on all four arms.
  for (let i = -5; i <= 5; i++) {
    for (const s of [-1, 1]) {
      slab(p, 0.7, 3.2, 0.02, C.lineWhite, i * 1.05, s * (AV + 2.2), 0.11);
    }
  }
  for (let i = -4; i <= 4; i++)
    for (const s of [-1, 1]) slab(p, 3.2, 0.7, 0.02, C.lineWhite, s * (ST + 2.2), i * 1.2, 0.11);
  // Tyre marks: the getaway car's trail across the junction.
  for (let i = 0; i < 18; i++) {
    const m = slab(p, 1.4, 0.32, 0.015, 0x2b2427, -18 + i * 1.3, 2.4 + Math.sin(i * 0.35) * 0.7, 0.12);
    m.rotation.y = Math.cos(i * 0.35) * 0.3;
    const n = slab(p, 1.4, 0.32, 0.015, 0x2b2427, -18 + i * 1.3, 4.0 + Math.sin(i * 0.35) * 0.7, 0.12);
    n.rotation.y = Math.cos(i * 0.35) * 0.3;
  }
}
// Plain filler buildings round the district (one draw call after baking).
function surroundings(p) {
  const pal = [C.peach, C.mint, C.cream, C.orange, C.blue, C.red, C.green];
  let k = 0;
  for (let a = -R - 26; a <= R + 26; a += 13)
    for (const b of [-R - 12, R + 12]) {
      for (const [x, z] of [[a, b], [b, a]]) {
        if (Math.abs(x) < ST + 4 || Math.abs(z) < AV + 4) continue;
        // The camera looks from the south-west: keep that side low (yards
        // and trees) so it never hides the district.
        const near = z > R || x < -R;
        if (near) {
          B(p, 10, 0.4, 10, C.grassDark, x, 0, z);
          tree(p, x - 2, z + 1, k++ % 3, 0.9);
          continue;
        }
        const h = 6 + ((k * 7) % 4) * 3.5;
        B(p, 10, h, 10, pal[k++ % pal.length], x, 0, z);
        B(p, 10.3, 0.4, 10.3, 0xe9dfd0, x, h, z);
      }
    }
}

// Each site: { name, centre, before: Group, after: Group, fx: "boom"|... }
const sites = [];
function site(p, name, cx, cz, fx, build) {
  const before = G(p);
  const after = G(p);
  build(before, after);
  after.visible = false;
  // Baked on their own (they switch on and off), not into the district.
  before.userData.keep = after.userData.keep = true;
  sites.push({ name, cx, cz, fx, before, after });
}

function district(root) {
  const g = G(root);
  // Ground: the city continues past the edge.
  slab(g, 400, 400, 0.1, 0x6d6466, 0, 0, -0.12);
  roads(g);
  surroundings(g);
  const blocks = {
    nw: [-R, -ST, -R, -AV],
    ne: [ST, R, -R, -AV],
    sw: [-R, -ST, AV, R],
    se: [ST, R, AV, R],
  };
  for (const [x0, x1, z0, z1] of Object.values(blocks)) {
    pavement(g, x0, x1, z0, z1);
    kerbRect(g, x0, x1, z0, z1);
  }
  const top = 0.3;
  const P = (x, z, ry = 0) => G(g, x, top, z, ry);

  // ---- NW: commercial street facing the avenue (fronts at z = -AV-4).
  const fronts = -AV - 4.5;
  shop(P(-44, fronts - 4.5), 0, 0, 7.5, [C.mint, C.teal, C.teal, C.white], "BAKERY", "gable");
  shop(P(-36, fronts - 4.5), 0, 0, 7.5, [C.yellow, 0xb5651d, 0xe0703e, C.white], "PIZZA", "flat");
  shop(P(-28, fronts - 4.5), 0, 0, 7.5, [C.peach, 0x7c3c26, 0x3f5fbf, C.white], "BOOKS", "tall");
  orangeApartment(P(-31, -40), 0, 0);
  conifer(P(-45, -40), 0, 0);
  conifer(P(-47, -34), 0, 0, 0.8);
  // Café with a terrace (destructible) + fruit stall.
  site(g, "cafe", -16, -12, "dust", (b, a) => {
    const cafeB = G(b, -16, top, fronts - 4.5);
    const cafeA = G(a, -16, top, fronts - 4.5);
    for (const [gg, broken] of [[cafeB, false], [cafeA, true]]) {
      const W = 10, D = 9;
      B(gg, W, 6.4, D, C.creamLight, 0, 0, 0);
      facade(gg, W, D, 2, 3.2, { frame: 0x7c3c26, every: 2.4, w: 1.0, h: 1.3, from: 1 });
      B(gg, W - 1.2, 2.4, 0.2, C.glass, 0, 0.3, D / 2 + 0.02, 0, broken ? { transparent: true, opacity: 0.25 } : undefined);
      parapet(gg, W, D, 6.4, 0x7c3c26, 0.5);
      signBoard(gg, "CAFE", 3.2, 0.8, 0, 3.5, D / 2 + 0.12, 0, "#7c3c26", "#fbe8c4");
      if (!broken) awning(gg, W - 0.4, 0, 3.0, D / 2, 0x3f8f6e, C.white, 1.6);
      else {
        // Torn awning: one half hanging down, the other on the pavement.
        const left = awning(gg, (W - 0.4) / 2, -(W - 0.4) / 4, 3.0, D / 2, 0x3f8f6e, C.white, 1.6);
        left.rotation.x = 0.9;
        const right = awning(gg, (W - 0.4) / 2, (W - 0.4) / 4 + 0.6, 0.15, D / 2 + 2.6, 0x3f8f6e, C.white, 1.6);
        right.rotation.set(-1.25, 0.4, 0.1);
        debris(right);
        for (let i = 0; i < 6; i++) debris(B(gg, 0.3, 0.04, 0.4, C.glass, -3 + i * 1.1, 0.02, D / 2 + 1.2 + (i % 3) * 0.6, i));
      }
    }
    // Terrace: tables, chairs, parasols.
    for (let i = 0; i < 3; i++) {
      const tx = -19.5 + i * 3.5, tz = -AV - 2.2;
      const tB = G(b, tx, top, tz);
      cyl(tB, 0.55, 0.55, 0.06, C.white, 0, 0.75, 0, 8);
      cyl(tB, 0.05, 0.05, 0.75, C.metal, 0, 0, 0, 4);
      cyl(tB, 0.04, 0.04, 2.3, C.metal, 0, 0.8, 0, 4);
      add(tB, new THREE.ConeGeometry(1.3, 0.5, 8), i % 2 ? C.red : 0x3f8f6e, 0, 3.2, 0);
      for (const s of [-1, 1]) {
        B(tB, 0.45, 0.06, 0.45, 0xc77a45, s * 0.85, 0.45, 0);
        B(tB, 0.06, 0.5, 0.45, 0xc77a45, s * 1.06, 0.48, 0);
      }
      // Broken: table flipped, chairs and parasol flung.
      const tA = G(a, tx, top, tz);
      const top_ = cyl(tA, 0.55, 0.55, 0.06, C.white, 0.6, 0.55, 0.4, 8);
      top_.rotation.x = 1.5;
      debris(top_);
      const um = add(tA, new THREE.ConeGeometry(1.3, 0.5, 8), i % 2 ? C.red : 0x3f8f6e, -1.2, 0.4, 1.2);
      um.rotation.z = 1.2;
      debris(um);
      for (const s of [-1, 1]) {
        const ch = B(tA, 0.45, 0.06, 0.45, 0xc77a45, s * 1.6, 0.03, 1.0 + s * 0.4, s);
        debris(ch);
      }
    }
  });
  site(g, "stall", -23, -12, "dust", (b, a) => {
    const sB = G(b, -24, top, -AV - 2.0);
    B(sB, 2.6, 0.9, 1.2, 0xb87352, 0, 0, 0);
    for (let i = 0; i < 4; i++) crate(sB, -0.95 + i * 0.63, 0.9, 0, 0xc9935a, 0.55);
    for (let i = 0; i < 12; i++)
      add(sB, new THREE.IcosahedronGeometry(0.13, 0), [0xff5a3c, 0xffd64a, 0x7cc24a][i % 3], -1.1 + (i % 6) * 0.42, 1.55, -0.15 + Math.floor(i / 6) * 0.3);
    awning(sB, 2.8, 0, 2.4, -0.4, C.orangeDark, C.white, 1.4);
    for (const s of [-1.3, 1.3]) B(sB, 0.08, 2.4, 0.08, C.metal, s, 0, 0.9);
    const sA = G(a, -24, top, -AV - 2.0);
    const counter = B(sA, 2.6, 0.9, 1.2, 0xb87352, 0, 0, 0.3, 0.3);
    counter.rotation.z = 0.25;
    for (let i = 0; i < 5; i++) {
      const c = crate(sA, -1.5 + i * 0.9, 0, 1.4 + (i % 2) * 0.8, 0xc9935a, 0.5);
      c.rotation.set(i * 0.4, i, 0.3);
      debris(c);
    }
    for (let i = 0; i < 16; i++)
      debris(add(sA, new THREE.IcosahedronGeometry(0.13, 0), [0xff5a3c, 0xffd64a, 0x7cc24a][i % 3], -2.5 + Math.cos(i * 1.7) * 2.6, 0.13, 1.8 + Math.sin(i * 2.3) * 1.4));
  });
  bins(P(-40, -AV - 1.2), 0, 0);
  planter(P(-32, -AV - 1.5), 0, 0);
  hydrant(P(-12, -AV - 1.0), 0, 0);

  // ---- NE: gas station (detailed) and red billboard block.
  // Forecourt: concrete slabs with joints both ways, drains, tank fill
  // caps, oil stains, lane arrows; kerb aprons to the road.
  const FX = 23, FZ = -21.5, FW = 30, FD = 25;
  B(g, FW, 0.31, FD, C.concrete, FX, 0, FZ);
  for (let x = FX - FW / 2 + 3; x < FX + FW / 2; x += 3) slab(g, 0.05, FD, 0.01, 0x9f9c95, x, FZ, 0.31);
  for (let z = FZ - FD / 2 + 3; z < FZ + FD / 2; z += 3) slab(g, FW, 0.05, 0.01, 0x9f9c95, FX, z, 0.31);
  for (const [x, z] of [[12, -12], [33, -12]]) {
    slab(g, 1.4, 0.5, 0.012, 0x2b2a2e, x, z, 0.315);
    for (let i = 0; i < 6; i++) slab(g, 0.06, 0.5, 0.014, 0x55535c, x - 0.6 + i * 0.24, z, 0.315);
  }
  for (let i = 0; i < 4; i++) {
    cyl(g, 0.32, 0.32, 0.03, 0x55535c, 12 + i * 1.0, 0.31, -31.2, 8);
    cyl(g, 0.2, 0.2, 0.035, [C.red, C.yellow, C.blue, C.green][i], 12 + i * 1.0, 0.31, -31.2, 8);
  }
  for (const [x, z, s] of [[19, -19, 1.2], [25.5, -24, 0.9], [20, -26, 0.7]]) {
    const o = add(g, new THREE.CylinderGeometry(s, s * 0.8, 0.012, 7), 0x6e6a66, x, 0.316, z);
    o.scale.z = 0.6;
  }
  // Lane arrows (shaft + head) leading under the canopy.
  for (const ax of [14.5, 29.5]) {
    slab(g, 0.35, 2.2, 0.012, C.lineWhite, ax, -13.5, 0.315);
    const head = add(g, new THREE.CylinderGeometry(0, 0.7, 0.012, 3), C.lineWhite, ax, 0.32, -15.0);
    head.rotation.y = Math.PI;
  }
  for (const ax of [11, 35]) slab(g, 4.5, 3.0, 0.31, C.concrete, ax, -7.5, 0); // driveway aprons
  // Convenience store: plinth, white walls, aluminium-framed glazing,
  // sliding doors, brand band with sign and stripe, posters, ice chest,
  // propane cage, vending machine, bench, roof plant behind a parapet.
  const mart = P(23, -41);
  const MW = 18, MD = 8, MH = 4.6;
  B(mart, MW, 0.4, MD, 0x5b5960, 0, 0, 0);
  B(mart, MW, MH - 0.4, MD, C.white, 0, 0.4, 0);
  B(mart, MW + 0.1, 0.9, MD + 0.1, C.red, 0, MH, 0);
  fascia(mart, MW + 0.1, MD + 0.1, MH + 0.9, C.yellow, 0.16); // stripe round the edge only
  B(mart, MW - 0.2, 0.04, MD - 0.2, 0x8a8781, 0, MH + 0.9, 0); // roof membrane
  signBoard(mart, "24 MART", 6, 0.75, -1, MH + 0.45, MD / 2 + 0.13, 0, "#d62f2a", "#ffffff");
  // Storefront frame (mullions sit in front of the glass, never through).
  const fz = MD / 2 + 0.02;
  B(mart, 14.4, 0.12, 0.14, 0xb9bcc2, -1, 0.4, fz);
  B(mart, 14.4, 0.12, 0.14, 0xb9bcc2, -1, 3.0, fz);
  for (let i = 0; i <= 8; i++) if (i !== 4 && i !== 5) B(mart, 0.1, 2.48, 0.14, 0xb9bcc2, -8.2 + i * 1.8, 0.52, fz);
  // Sliding doors (between mullions 4 and 5): frames + darker glass.
  for (const dx of [-0.4, 0.4]) {
    B(mart, 0.8, 2.48, 0.04, 0x4f6a7a, -1 + 0.8 + dx - 0.4 + 0.4, 0.52, fz + 0.02);
  }
  B(mart, 1.8, 0.1, 0.16, 0x7a7d84, -0.2, 3.12, fz + 0.02);
  for (const s of [-1, 1]) B(mart, 0.08, 2.48, 0.16, 0x7a7d84, -0.2 + s * 0.86, 0.52, fz + 0.02);
  // Posters on the glass (thin, in front of it, between mullions).
  for (const [px, c] of [[-7.3, C.yellow], [-5.5, C.blue], [3.5, C.orange], [5.3, C.green]]) B(mart, 1.2, 0.9, 0.02, c, px, 1.6, fz + 0.04);
  // Lights over the door.
  for (const lx of [-1.2, 0.8]) B(mart, 0.5, 0.12, 0.3, 0xfff1c0, lx, 3.3, fz + 0.15, 0, { emissive: 0xffd98a, emissiveIntensity: 0.6 });
  const ice = G(mart, 3.2, 0, fz + 0.6);
  B(ice, 1.6, 1.2, 0.8, C.white, 0, 0, 0);
  B(ice, 1.62, 0.2, 0.82, C.blue, 0, 1.2, 0);
  B(ice, 1.2, 0.3, 0.02, C.blue, 0, 0.6, 0.41);
  const vend = G(mart, 6.9, 0, fz + 0.5);
  B(vend, 1.0, 1.9, 0.8, C.red, 0, 0, 0);
  B(vend, 0.6, 1.2, 0.02, C.glassDark, -0.12, 0.5, 0.41);
  B(vend, 0.15, 0.6, 0.02, 0xe0e0e0, 0.35, 0.9, 0.41);
  // Propane cage at the shop's side.
  const cage = G(mart, -MW / 2 - 0.9, 0, 1.5);
  B(cage, 1.4, 0.08, 1.0, C.metal, 0, 0, 0);
  for (const [cx, cz] of [[-0.65, -0.45], [0.65, -0.45], [-0.65, 0.45], [0.65, 0.45]]) B(cage, 0.06, 1.6, 0.06, C.metal, cx, 0.08, cz);
  B(cage, 1.4, 0.06, 1.0, C.metal, 0, 1.68, 0);
  for (let i = 0; i < 3; i++) cyl(cage, 0.16, 0.16, 0.7, 0xdfe3e8, -0.4 + i * 0.4, 0.1, 0, 8);
  for (let i = 0; i < 9; i++) B(cage, 0.02, 1.5, 0.02, C.metal, -0.6 + i * 0.15, 0.13, 0.48);
  bench(mart, -6.5, fz + 0.9, Math.PI, C.blue);
  parapet(mart, MW, MD, MH + 1.06, C.white, 0.35);
  for (const [ux, uz] of [[-5, -1.5], [-2.4, -1.5]]) {
    B(mart, 1.6, 0.8, 1.2, 0xcfd0d4, ux, MH + 1.06, uz);
    cyl(mart, 0.3, 0.3, 0.05, 0x6a6a70, ux, MH + 1.86, uz, 8);
  }
  B(mart, 3.0, 0.4, 0.4, 0xb9bcc2, 1.4, MH + 1.3, -1.5);
  // Air / water machine and vacuum post by the forecourt edge.
  const air = P(36.5, -31);
  B(air, 0.7, 1.4, 0.5, C.blue, 0, 0, 0);
  B(air, 0.5, 0.35, 0.02, C.glassDark, 0, 0.9, 0.26);
  B(air, 0.2, 0.2, 0.06, C.yellow, 0, 0.5, 0.26);
  B(air, 0.08, 0.6, 0.08, C.dark, 0.42, 0.4, 0);
  const vac = P(36.5, -27.5);
  cyl(vac, 0.15, 0.18, 2.4, C.yellow, 0, 0, 0, 6);
  B(vac, 0.8, 0.6, 0.6, C.yellow, 0, 2.4, 0);
  B(vac, 0.04, 1.6, 0.04, C.dark, 0.32, 0.8, 0.32);
  // Price pylon: stone plinth, two posts, brand head, three price rows.
  const pylon = P(36.5, -11);
  B(pylon, 3.0, 0.6, 1.0, C.stone, 0, 0, 0);
  for (const s of [-1.1, 1.1]) B(pylon, 0.3, 4.6, 0.3, C.metal, s, 0.6, 0);
  B(pylon, 2.8, 3.6, 0.5, C.white, 0, 3.2, 0);
  B(pylon, 2.9, 1.0, 0.56, C.red, 0, 6.8, 0);
  signBoard(pylon, "GAS", 2.2, 0.7, 0, 7.3, 0.3, 0, "#d62f2a", "#ffe14a");
  ["REG 3.49", "PLUS 3.69", "DSL 3.89"].forEach((txt, i) =>
    signBoard(pylon, txt, 2.4, 0.7, 0, 5.9 - i * 0.95, 0.27, 0, "#232227", i === 2 ? "#5cb23a" : "#ffe14a"),
  );
  // A pump: plinth, body, brand head with displays both sides, keypad,
  // nozzles in holsters, a looped hose (angular tube) to each nozzle.
  const hose = (p, pts) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return add(p, new THREE.TubeGeometry(curve, 10, 0.045, 5, false), C.rubber);
  };
  function pump(p, x, z, broken = false) {
    const g2 = G(p, x, 0.3, z);
    B(g2, 1.0, 0.15, 0.8, 0x4a4850, 0, 0, 0);
    B(g2, 0.9, 1.3, 0.7, broken ? 0x3a3438 : C.white, 0, 0.15, 0);
    if (broken) return g2;
    B(g2, 0.92, 0.55, 0.72, C.red, 0, 1.45, 0);
    B(g2, 0.94, 0.08, 0.74, C.yellow, 0, 1.45, 0);
    for (const s of [-1, 1]) {
      B(g2, 0.6, 0.3, 0.02, C.glassDark, 0, 1.0, s * 0.36);
      B(g2, 0.4, 0.08, 0.02, 0x5cf07a, 0, 1.08, s * 0.37, 0, { emissive: 0x2ad050, emissiveIntensity: 0.6 });
      B(g2, 0.22, 0.16, 0.03, 0x8f8f94, 0.25, 0.7, s * 0.365);
      // Nozzles in holsters on the side, hoses looping from the top.
      [C.yellow, C.green, V.trim].forEach((c, i) => {
        B(g2, 0.06, 0.24, 0.12, c, s * 0.47, 0.75, -0.2 + i * 0.2);
        hose(g2, [[s * 0.3, 1.75, -0.2 + i * 0.2], [s * 0.75, 1.5, -0.2 + i * 0.2], [s * 0.85, 0.7, -0.2 + i * 0.2], [s * 0.5, 0.85, -0.2 + i * 0.2]]);
      });
    }
    return g2;
  }
  site(g, "gas", 22, -22, "boom", (b, a) => {
    const CX = 22, CZ = -22, CW = 17, CD = 11, CH = 5.2;
    const island = (p, ix, wrecked) => {
      B(p, 1.4, 0.3, 6.4, wrecked ? 0x8a8781 : C.curb, ix, 0, 0);
      for (const ez of [-3.4, 3.4]) {
        for (let i = 0; i < 4; i++) B(p, 0.35, 0.3, 0.6, i % 2 ? V.trim : C.yellow, ix - 0.525 + i * 0.35, 0, ez);
        for (const bx of [-0.5, 0.5]) {
          const bol = cyl(p, 0.1, 0.1, 1.0, C.yellow, ix + bx, 0.3, ez + Math.sign(ez) * 0.15, 6);
          if (wrecked) {
            bol.rotation.z = bx * 1.6;
            bol.position.y = 0.4;
          }
        }
      }
      B(p, 0.5, 0.8, 0.4, C.green, ix, 0.3, -2.7); // bin with squeegee
      if (!wrecked) cyl(p, 0.18, 0.15, 0.4, C.blue, ix, 1.1, -2.7, 6);
    };
    // Before: columns on plinths with guard bollards, canopy deck with
    // lights underneath, red brand fascia with a yellow stripe and signs.
    const cB = G(b, CX, top, CZ);
    for (const [sx, sz] of [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5]]) {
      B(cB, 1.0, 0.6, 1.0, C.stone, sx, 0, sz);
      B(cB, 0.55, CH - 0.6, 0.55, 0xdfe3e8, sx, 0.6, sz);
      B(cB, 0.6, 0.5, 0.6, C.red, sx, 1.6, sz);
    }
    B(cB, CW, 0.3, CD, C.white, 0, CH, 0);
    for (let i = -3; i <= 3; i++)
      for (const lz of [-2.5, 2.5]) B(cB, 1.0, 0.04, 0.6, 0xfff4cf, i * 2.3, CH - 0.04, lz, 0, { emissive: 0xffe9a8, emissiveIntensity: 0.7 });
    fascia(cB, CW, CD, CH, C.red, 1.0);
    B(cB, CW + 0.3, 0.14, 0.04, C.yellow, 0, CH + 0.25, CD / 2 + 0.14);
    B(cB, 0.04, 0.14, CD + 0.3, C.yellow, -CW / 2 - 0.14, CH + 0.25, 0);
    B(cB, CW - 0.3, 0.1, CD - 0.3, 0x8a8781, 0, CH + 0.3, 0); // deck roof inside the fascia
    signBoard(cB, "GAS  •  24H", 6.0, 0.56, 0, CH + 0.68, CD / 2 + 0.25, 0, "#d62f2a", "#ffffff");
    signBoard(cB, "GAS", 2.6, 0.56, -CW / 2 - 0.25, CH + 0.68, 0, -Math.PI / 2, "#d62f2a", "#ffe14a");
    for (const ix of [-3, 3]) {
      island(cB, ix, false);
      for (const pz of [-1.6, 1.6]) pump(cB, ix, pz);
    }
    const ext = G(cB, -6, 0.6, 3.5);
    cyl(ext, 0.14, 0.14, 0.6, C.red, 0.45, 0.4, 0, 8);
    G(b, 17.2, top, -20.8, 0).add(pickup(0xd8c49c));
    // A police car pulling onto the forecourt after the player.
    G(b, 11.5, top, -12.5, Math.PI * 0.82).add(policeCar());
    // Shop glazing (intact).
    B(b, 14.2, 2.48, 0.03, C.glass, 23 - 1, top + 0.52, -41 + MD / 2 + 0.015, 0, { roughness: 0.2 });

    // After: crater and scorch, columns snapped or buckled, the canopy
    // slumped onto its broken corner, pumps blown off their plinths (heads
    // tumbling, hoses torn), bollards bent, fires and black smoke; the
    // pickup and the police car flipped and burnt; shop glass blown in.
    const cA = G(a, CX, top, CZ);
    // Scorch: an irregular dark patch, a darker blast mark at its heart.
    for (const [sx, sz, r] of [[-1.5, 0.5, 4.6], [2.5, -1.2, 3.2], [-4.2, 2.0, 2.6], [1.0, 3.2, 2.4]]) {
      const s = add(cA, new THREE.CylinderGeometry(r, r, 0.02, 7), 0x3a3437, sx, 0.32, sz);
      s.rotation.y = r;
    }
    add(cA, new THREE.CylinderGeometry(2.4, 1.8, 0.03, 7), 0x1f1c1e, -2.5, 0.335, -0.5);
    for (const [sx, sz, h, rz, rx] of [[-6, -3.5, 2.0, 0.6, 0.1], [6, -3.5, CH - 0.6, -0.08, 0], [-6, 3.5, 1.4, 0, 0], [6, 3.5, CH - 0.9, 0.05, -0.1]]) {
      B(cA, 1.0, 0.6, 1.0, 0x8a8781, sx, 0, sz);
      const col = B(cA, 0.55, h, 0.55, 0x9a9da3, sx, 0.6, sz);
      col.rotation.set(rx, 0, rz);
    }
    const deck = G(cA, 1.2, 2.9, 0.4);
    deck.rotation.set(0.05, 0.06, 0.32);
    B(deck, CW, 0.3, CD, 0xc9c5c0, 0, 0, 0);
    fascia(deck, CW, CD, 0, 0x8e2420, 1.0);
    B(deck, CW - 0.3, 0.1, CD - 0.3, 0x55525a, 0, 0.3, 0);
    for (const ix of [-3, 3]) {
      island(cA, ix, true);
      for (const pz of [-1.6, 1.6]) {
        pump(cA, ix, pz, true);
        const head = B(cA, 0.92, 0.55, 0.72, 0x8e2420, ix + 2.4 * Math.sign(pz + 0.1), 0.3, pz * 2.8);
        head.rotation.set(1.2, pz, 0.5);
        debris(head);
        const torn = hose(cA, [[ix, 0.7, pz], [ix + 1.2, 0.35, pz + 0.6], [ix + 2.2, 0.35, pz + 0.3]]);
        debris(torn);
      }
    }
    for (let i = 0; i < 18; i++)
      debris(B(cA, 0.4 + (i % 3) * 0.35, 0.1, 0.3 + (i % 2) * 0.3, [0x9a9da3, C.red, C.white, C.yellow][i % 4], Math.cos(i * 2.4) * (7 + (i % 5)), 0, Math.sin(i * 2.4) * (6 + (i % 4)), i));
    const wreck = G(a, 17.2, top, -20.8, 0.4);
    const pk = pickup(0x4a3f38);
    pk.rotation.z = 2.6;
    pk.position.y = 1.6;
    wreck.add(pk);
    const copOut = G(a, 9.8, top, -10.8, Math.PI * 0.6);
    const burnt = policeCar();
    burnt.traverse((o) => {
      if (o.isMesh) o.material = M(o.material.color.getHex() === C.white ? 0x5a5458 : 0x1f1c1e);
    });
    burnt.rotation.z = Math.PI - 0.25;
    burnt.position.y = 1.9;
    copOut.add(burnt);
    debris(B(a, 1.3, 0.3, 0.42, 0x5a5458, 7.2, top, -8.6, 0.7));
    flames(G(a, 9.8, top + 0.3, -10.8), [[0, 0, 0]]);
    // Shop: glass gone (dark interior), shards on the forecourt.
    B(a, 14.2, 2.48, 0.03, 0x141316, 22, top + 0.52, -41 + MD / 2 + 0.015);
    for (let i = 0; i < 18; i++) debris(B(a, 0.35, 0.03, 0.25, C.glass, 13 + i * 1.0, top + 0.02, -35.6 + (i % 4) * 0.8, i));
    flames(cA, [[-3, 0.3, -1], [3.5, 0.3, 1.5], [-4.6, 0.3, 2.4], [0.4, 0.3, 4.6], [-1.5, 0.3, -2.8]]);
    smoke(cA, [[-3, 3, -1, 1.6], [-2.4, 6, -0.4, 1.3], [3.6, 3.4, 1.4, 1.5], [3, 7, 1, 1.2], [-1, 9, 0, 1.0]]);
  });
  redBillboard(P(43, -26), 0, 0, 0);
  streetLight(P(30, -AV - 1), 0, 0);

  // ---- SW: public park (detailed). Lawns with mowing stripes, paved paths
  // with edging, a round plaza with a tiered fountain, flower beds, hedges,
  // park benches, lamps, bins, a drinking fountain, a playground on a
  // rubber surface, a pavilion, an iron fence with gate openings.
  const PX = -28.5, PZ = 29, PW = R - ST - 3, PD = R - AV - 3; // 44 x 43
  slab(g, PW, PD, 0.36, C.grass, PX, PZ);
  for (let i = 0; i < 7; i++) slab(g, PW, 3, 0.004, 0x4caa50, PX, PZ - PD / 2 + 3 + i * 6, 0.36);
  const pave = 0xcbbfa8, edge = 0x8f8778;
  const path = (x, z, w, d) => {
    slab(g, w, d, 0.05, pave, x, z, 0.364);
    if (w > d) for (const s of [-1, 1]) slab(g, w, 0.18, 0.09, edge, x, z + s * (d / 2 + 0.09), 0.364);
    else for (const s of [-1, 1]) slab(g, 0.18, d, 0.09, edge, x + s * (w / 2 + 0.09), z, 0.364);
  };
  const PR = 9.5; // plaza radius
  path(PX, PZ - PD / 2 + (PD / 2 - PR) / 2, 3.2, PD / 2 - PR);
  path(PX, PZ + PD / 2 - (PD / 2 - PR) / 2, 3.2, PD / 2 - PR);
  path(PX - PW / 2 + (PW / 2 - PR) / 2, PZ, PW / 2 - PR, 3.2);
  path(PX + PW / 2 - (PW / 2 - PR) / 2, PZ, PW / 2 - PR, 3.2);
  // Plaza: two paving rings and an edge ring (octagonal, stacked, no
  // coplanar overlap).
  cyl(g, PR + 0.2, PR + 0.2, 0.08, edge, PX, 0.36, PZ, 8);
  cyl(g, PR, PR, 0.1, pave, PX, 0.36, PZ, 8);
  cyl(g, PR - 1.6, PR - 1.6, 0.11, 0xb8ab92, PX, 0.36, PZ, 8);
  cyl(g, PR - 2.4, PR - 2.4, 0.12, pave, PX, 0.36, PZ, 8);
  site(g, "fountain", PX, PZ, "splash", (b, a) => {
    // Tiered fountain: octagonal step, basin walls with coping, water,
    // pedestal with spouts, two bowls, finial; arcs of water.
    const fB = G(b, PX, 0.48, PZ);
    octPrism(fB, 5.6, 0, 0.2, C.stone, 0);
    octPrism(fB, 5.0, 4.4, 0.7, C.stone, 0.2); // basin wall
    octPrism(fB, 5.15, 4.3, 0.14, 0xd9cdb8, 0.9); // coping
    octPrism(fB, 4.4, 0, 0.5, C.water, 0.2, { roughness: 0.15 });
    octPrism(fB, 3.2, 2.9, 0.02, 0x6fc6ef, 0.7, { roughness: 0.15 }); // ripple ring
    cyl(fB, 1.1, 1.3, 0.6, C.stone, 0, 0.8, 0, 8);
    cyl(fB, 0.55, 0.7, 1.8, C.stone, 0, 1.4, 0, 8);
    for (let i = 0; i < 4; i++) {
      const sp = B(fB, 0.2, 0.2, 0.4, 0xb8692f, Math.cos(i * Math.PI / 2) * 0.75, 1.9, Math.sin(i * Math.PI / 2) * 0.75, -i * Math.PI / 2 + Math.PI / 2);
      void sp;
    }
    cyl(fB, 2.0, 0.7, 0.45, C.stone, 0, 3.2, 0, 8);
    cyl(fB, 1.85, 1.85, 0.04, C.water, 0, 3.58, 0, 8, { roughness: 0.15 }); // below the rim
    cyl(fB, 0.3, 0.4, 0.9, C.stone, 0, 3.65, 0, 8);
    cyl(fB, 1.0, 0.4, 0.3, C.stone, 0, 4.55, 0, 8);
    cyl(fB, 0.92, 0.92, 0.04, C.water, 0, 4.8, 0, 8, { roughness: 0.15 });
    add(fB, new THREE.OctahedronGeometry(0.28, 0), 0xb8692f, 0, 5.2, 0);
    // Water: a falling veil from each bowl and four arcing jets.
    const veil = (r, y, h) => {
      const m = add(fB, new THREE.CylinderGeometry(r, r + 0.15, h, 8, 1, true), 0xbfeefa, 0, y, 0, { transparent: true, opacity: 0.45, roughness: 0.05 });
      m.castShadow = false;
    };
    // From each bowl's rim down to the water below it.
    veil(2.02, (3.65 + 0.7) / 2, 3.65 - 0.7);
    veil(1.0, (4.85 + 3.62) / 2, 4.85 - 3.62);
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(Math.cos(ang) * 0.95, 1.9, Math.sin(ang) * 0.95),
        new THREE.Vector3(Math.cos(ang) * 2.2, 2.9, Math.sin(ang) * 2.2),
        new THREE.Vector3(Math.cos(ang) * 3.2, 0.85, Math.sin(ang) * 3.2),
      );
      const jet = add(fB, new THREE.TubeGeometry(curve, 8, 0.07, 5, false), 0xbfeefa, 0, 0, 0, { transparent: true, opacity: 0.7 });
      jet.castShadow = false;
    }
    // After: basin walls knocked out and thrown, the pedestal snapped, the
    // bowls rolled across the plaza, a geyser and water over the plaza.
    const fA = G(a, PX, 0.48, PZ);
    cyl(fA, 5.6, 5.6, 0.2, 0x9a958c, 0, 0, 0, 8);
    cyl(fA, 8.6, 8.6, 0.06, C.water, 0, 0.0, 0, 10, { roughness: 0.1, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const out = i % 3 === 0 ? 2.4 : i % 3 === 1 ? 0.6 : 0;
      const w = B(fA, 3.6, 0.7, 0.45, C.stone, Math.cos(ang) * (4.55 + out), 0.2 - (out ? 0.15 : 0), Math.sin(ang) * (4.55 + out), -ang + Math.PI / 2 + out * 0.2);
      if (out > 1) {
        w.rotation.z = 0.5;
        debris(w);
      }
    }
    cyl(fA, 1.1, 1.3, 0.6, 0x9a958c, 0, 0.2, 0, 8);
    const stub = cyl(fA, 0.55, 0.7, 0.6, C.stone, 0, 0.8, 0, 8);
    stub.rotation.z = 0.2;
    const shaft = G(fA, 2.6, 0.5, -1.4);
    shaft.rotation.set(0.2, 0.4, Math.PI / 2 - 0.15);
    cyl(shaft, 0.55, 0.7, 1.4, C.stone, 0, 0, 0, 8);
    debris(shaft);
    const bowl = G(fA, -5.8, 0.2, 3.2);
    bowl.rotation.set(0.6, 0, 0.4);
    cyl(bowl, 2.0, 0.7, 0.45, C.stone, 0, 0, 0, 8);
    debris(bowl);
    const bowl2 = G(fA, 4.5, 0.2, 5.5);
    bowl2.rotation.set(-0.5, 0, 0.8);
    cyl(bowl2, 1.0, 0.4, 0.3, C.stone, 0, 0, 0, 8);
    debris(bowl2);
    const geyser = add(fA, new THREE.CylinderGeometry(0.5, 1.5, 12, 8, 1, true), 0x9fe6ff, 0, 6.2, 0, { transparent: true, opacity: 0.55, roughness: 0.05 });
    geyser.userData.fx = "geyser";
    geyser.castShadow = false;
    for (let i = 0; i < 16; i++) {
      const d = add(fA, new THREE.IcosahedronGeometry(0.5 + (i % 3) * 0.25, 0), 0xbff0ff, Math.cos(i) * (1 + (i % 5)), 9.5 + (i % 5) * 0.9, Math.sin(i) * (1 + (i % 5)), { transparent: true, opacity: 0.7, roughness: 0.05 });
      d.userData.fx = "spray";
      d.castShadow = false;
    }
  });
  // Park furniture.
  const parkBench = (x, z, ry) => {
    const pb = P(x, z, ry);
    for (const s of [-0.9, 0.9]) {
      B(pb, 0.08, 0.45, 0.55, 0x1f3a2a, s, 0, 0);
      B(pb, 0.08, 0.5, 0.08, 0x1f3a2a, s, 0.45, 0.25);
      B(pb, 0.08, 0.06, 0.5, 0x1f3a2a, s, 0.68, 0.0);
    }
    for (let i = 0; i < 3; i++) B(pb, 2.0, 0.05, 0.14, 0xb5703a, 0, 0.45, -0.18 + i * 0.17);
    for (let i = 0; i < 2; i++) B(pb, 2.0, 0.12, 0.04, 0xb5703a, 0, 0.62 + i * 0.2, 0.3);
  };
  const parkLamp = (x, z) => {
    const l = P(x, z);
    cyl(l, 0.18, 0.22, 0.3, 0x1f2a24, 0, 0, 0, 6);
    cyl(l, 0.06, 0.07, 3.4, 0x1f2a24, 0, 0.3, 0, 6);
    B(l, 0.42, 0.06, 0.42, 0x1f2a24, 0, 3.7, 0);
    B(l, 0.32, 0.45, 0.32, 0xfff1c0, 0, 3.76, 0, 0, { emissive: 0xffd98a, emissiveIntensity: 0.7 });
    add(l, new THREE.ConeGeometry(0.32, 0.3, 4), 0x1f2a24, 0, 4.36, 0).rotation.y = Math.PI / 4;
  };
  const parkBin = (x, z) => {
    const pb = P(x, z);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      B(pb, 0.16, 0.85, 0.05, 0x2f7d4f, Math.cos(ang) * 0.3, 0, Math.sin(ang) * 0.3, -ang + Math.PI / 2);
    }
    cyl(pb, 0.36, 0.36, 0.08, 0x1f3a2a, 0, 0.85, 0, 8);
  };
  const flowerBed = (x, z, w, d) => {
    const fb = P(x, z);
    for (const s of [-1, 1]) {
      B(fb, w, 0.35, 0.15, 0x8a5a32, 0, 0, s * (d / 2 - 0.075));
      B(fb, 0.15, 0.35, d - 0.3, 0x8a5a32, s * (w / 2 - 0.075), 0, 0);
    }
    B(fb, w - 0.3, 0.3, d - 0.3, 0x5a3a22, 0, 0, 0);
    const cols = [C.red, C.yellow, 0xe0367a, C.orange, 0xffffff];
    for (let i = 0; i < Math.floor(w * d * 2.2); i++) {
      const fx = -w / 2 + 0.35 + ((i * 0.618) % 1) * (w - 0.7);
      const fz = -d / 2 + 0.35 + ((i * 0.381 + 0.17) % 1) * (d - 0.7);
      B(fb, 0.04, 0.25, 0.04, C.leaf[0], fx, 0.3, fz);
      add(fb, new THREE.OctahedronGeometry(0.13, 0), cols[i % cols.length], fx, 0.62, fz);
    }
  };
  const hedge = (x, z, w, d) => B(P(x, z), w, 0.9, d, 0x2e7d3a, 0, 0, 0);
  // Symmetric plaza layout round the fountain (an 8-fold plan):
  // - four flower beds on the diagonals, all at the same radius, laid
  //   along the circle (tangent), clear of the fountain step and the edge;
  // - a pair of benches flanking each of the four path entrances, at the
  //   same radius and offset, facing the fountain;
  // - a bin beside each bed on the diagonal; lamps flank each path.
  const flowerBedAt = (x, z, w, d, ry) => {
    const fb = P(x, z, ry);
    for (const s of [-1, 1]) {
      B(fb, w, 0.35, 0.15, 0x8a5a32, 0, 0, s * (d / 2 - 0.075));
      B(fb, 0.15, 0.35, d - 0.3, 0x8a5a32, s * (w / 2 - 0.075), 0, 0);
    }
    B(fb, w - 0.3, 0.3, d - 0.3, 0x5a3a22, 0, 0, 0);
    const cols = [C.red, C.yellow, 0xe0367a, C.orange];
    const nx = Math.round((w - 0.5) / 0.4), nz = Math.round((d - 0.5) / 0.4);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const fx = -w / 2 + 0.45 + i * ((w - 0.9) / Math.max(1, nx - 1));
        const fz = -d / 2 + 0.45 + j * ((d - 0.9) / Math.max(1, nz - 1));
        B(fb, 0.04, 0.25, 0.04, C.leaf[0], fx, 0.3, fz);
        add(fb, new THREE.OctahedronGeometry(0.13, 0), cols[(i + j) % cols.length], fx, 0.62, fz);
      }
  };
  const BR = 7.4; // bed radius
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const a = Math.atan2(dz, dx);
    // Long side along the circle: rotate so local x is tangent.
    flowerBedAt(PX + Math.cos(a) * BR, PZ + Math.sin(a) * BR, 3.0, 1.2, -a - Math.PI / 2);
    parkBin(PX + Math.cos(a) * 9.0, PZ + Math.sin(a) * 9.0);
  }
  const SR = 8.0, SO = 2.7; // bench radius and offset from the path axis
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2; // path directions: +x, +z, -x, -z
    const ux = Math.cos(a), uz = Math.sin(a);
    for (const s of [-1, 1]) {
      const x = PX + ux * SR - uz * s * SO,
        z = PZ + uz * SR + ux * s * SO;
      // Face the fountain: the bench's back (+z local) points outward.
      parkBench(x, z, Math.atan2(ux, uz));
    }
  }
  for (const [x, z] of [[PX - 3.0, PZ - 12], [PX + 3.0, PZ - 12], [PX - 3.0, PZ + 12], [PX + 3.0, PZ + 12], [PX - 12, PZ - 3.0], [PX - 12, PZ + 3.0], [PX + 12, PZ - 3.0], [PX + 12, PZ + 3.0]]) parkLamp(x, z);
  // Drinking fountain.
  const drink = P(PX + 3.4, PZ - 16);
  B(drink, 0.5, 0.9, 0.5, C.stone, 0, 0, 0);
  cyl(drink, 0.35, 0.25, 0.15, 0x9da1a8, 0, 0.9, 0, 8);
  // Hedges lining the cross paths near the plaza.
  for (const s of [-1, 1]) {
    hedge(PX + s * 2.2, PZ - 15, 0.7, 8);
    hedge(PX + s * 2.2, PZ + 15, 0.7, 8);
    hedge(PX - 15, PZ + s * 2.2, 8, 0.7);
    hedge(PX + 15, PZ + s * 2.2, 8, 0.7);
  }
  // Trees: tall faceted crowns and cone conifers, off the paths.
  for (const [x, z, k, s] of [[-45, 13, 0, 1.25], [-38, 15, 1, 1.0], [-45, 22, 2, 1.1], [-19, 22, 0, 1.0], [-14, 14.5, 1, 1.15], [-20, 47.5, 2, 1.2], [-12, 36, 0, 1.0], [-36, 47, 1, 0.9], [-24, 46, 0, 1.0]])
    tree(P(x, z), 0, 0, k, s);
  for (const [x, z, s] of [[-48, 33.5, 1.2], [-48, 37.5, 1.0], [-10, 25, 1.1], [-36, 19, 0.9]]) conifer(P(x, z), 0, 0, s);
  // Playground on a rubber surface: slide tower, swings, seesaw, sandpit.
  const PG = P(-41, 41);
  slab(PG, 12, 11, 0.06, 0xd9502f, 0, 0, 0.06);
  for (const s of [-1, 1]) {
    slab(PG, 12.3, 0.15, 0.2, 0x5a5560, 0, s * 5.57, 0);
    slab(PG, 0.15, 11, 0.2, 0x5a5560, s * 6.07, 0, 0);
  }
  const tower = G(PG, -2.5, 0.12, -2);
  for (const [tx, tz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B(tower, 0.14, 3.6, 0.14, C.blue, tx, 0, tz);
  B(tower, 1.8, 0.12, 1.8, C.yellow, 0, 1.6, 0);
  for (const s of [-1, 1]) B(tower, 1.74, 0.06, 0.06, C.red, 0, 2.4, s * 0.8);
  add(tower, new THREE.ConeGeometry(1.5, 1.0, 4), C.red, 0, 4.1, 0).rotation.y = Math.PI / 4;
  for (let i = 0; i < 5; i++) B(tower, 0.6, 0.06, 0.12, C.yellow, -0.0, 0.3 + i * 0.3, -0.95 - i * 0.12).rotation.x = 0; // ladder rungs
  for (const s of [-0.32, 0.32]) {
    const rail = B(tower, 0.06, 0.06, 1.0, C.blue, s, 0, -1.2);
    rail.rotation.x = 1.0;
  }
  const slide = G(tower, 0, 1.6, 0.9);
  slide.rotation.x = 0.55;
  B(slide, 0.8, 0.06, 3.2, C.yellow, 0, -0.06, 1.6);
  for (const s of [-0.43, 0.43]) B(slide, 0.06, 0.25, 3.2, C.orange, s, 0, 1.6);
  const sw = G(PG, 2.6, 0.12, -2.4);
  for (const s of [-1.8, 1.8]) {
    const l1 = B(sw, 0.12, 3.0, 0.12, C.green, s, 0, -0.5);
    l1.rotation.x = 0.2;
    const l2 = B(sw, 0.12, 3.0, 0.12, C.green, s, 0, 0.5);
    l2.rotation.x = -0.2;
  }
  B(sw, 3.8, 0.12, 0.12, C.green, 0, 2.86, 0);
  for (const s of [-0.75, 0.75]) {
    for (const t of [-0.18, 0.18]) B(sw, 0.03, 1.9, 0.03, C.metal, s + t, 0.95, 0);
    B(sw, 0.5, 0.06, 0.25, V.trim, s, 0.92, 0);
  }
  const see = G(PG, 2.6, 0.12, 2.6, 0.3);
  B(see, 0.4, 0.45, 0.3, C.metal, 0, 0, 0);
  const plank = B(see, 3.2, 0.1, 0.32, C.red, 0, 0.45, 0);
  plank.rotation.z = 0.18;
  for (const s of [-1.3, 1.3]) B(see, 0.06, 0.28, 0.3, C.yellow, s, 0.45 + s * 0.18 + 0.05, 0);
  const sand = G(PG, -2.6, 0.12, 2.8);
  for (const s of [-1, 1]) {
    B(sand, 3.0, 0.3, 0.15, 0x8a5a32, 0, 0, s * 1.2);
    B(sand, 0.15, 0.3, 2.25, 0x8a5a32, s * 1.43, 0, 0);
  }
  B(sand, 2.7, 0.22, 2.25, 0xe6c88a, 0, 0, 0);
  // Pavilion: eight posts, a raised floor and an angular roof.
  const pav = P(-15.5, 41.5);
  cyl(pav, 3.0, 3.0, 0.35, C.stone, 0, 0, 0, 8);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    B(pav, 0.18, 2.8, 0.18, C.white, Math.cos(ang) * 2.6, 0.35, Math.sin(ang) * 2.6);
  }
  cyl(pav, 3.2, 3.2, 0.25, C.white, 0, 3.15, 0, 8);
  add(pav, new THREE.ConeGeometry(3.5, 1.8, 8), C.teal, 0, 4.3, 0).rotation.y = Math.PI / 8;
  add(pav, new THREE.OctahedronGeometry(0.2, 0), C.yellow, 0, 5.35, 0);
  // Iron fence round the park with openings at the four gates.
  const ironRun = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const f = P((x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    for (let i = 0; i <= Math.round(len / 2); i++) {
      const px = -len / 2 + (i * len) / Math.round(len / 2);
      B(f, 0.12, 1.2, 0.12, 0x1f2a24, px, 0, 0);
      add(f, new THREE.ConeGeometry(0.09, 0.2, 4), 0x1f2a24, px, 1.3, 0);
    }
    for (const y of [0.15, 0.95]) B(f, len, 0.05, 0.05, 0x1f2a24, 0, y, 0);
    for (let i = 0; i < Math.floor(len / 0.25); i++) B(f, 0.025, 0.85, 0.025, 0x1f2a24, -len / 2 + 0.12 + i * 0.25, 0.15, 0);
  };
  const fx0 = PX - PW / 2 + 0.3, fx1 = PX + PW / 2 - 0.3, fz0 = PZ - PD / 2 + 0.3, fz1 = PZ + PD / 2 - 0.3;
  ironRun(fx0, fz0, PX - 2.6, fz0);
  ironRun(PX + 2.6, fz0, -14, fz0);
  ironRun(fx0, fz1, PX - 2.6, fz1);
  ironRun(PX + 2.6, fz1, fx1, fz1);
  ironRun(fx0, fz0, fx0, PZ - 2.6);
  ironRun(fx0, PZ + 2.6, fx0, fz1);
  ironRun(fx1, fz0 + 6, fx1, PZ - 2.6);
  ironRun(fx1, PZ + 2.6, fx1, fz1);
  signBoard(P(PX + 3.4, fz0 - 0.2), "CITY PARK", 2.8, 0.6, 0, 1.6, 0, 0, "#2f7d4f", "#ffffff");
  B(P(PX + 3.4, fz0 - 0.2), 0.1, 1.3, 0.1, 0x1f2a24, -1.2, 0, 0);
  B(P(PX + 3.4, fz0 - 0.2), 0.1, 1.3, 0.1, 0x1f2a24, 1.2, 0, 0);

  // ---- SE: basketball court, residential, corner café.
  site(g, "court", 29, 36, "dust", (b, a) => {
    const cx = 29, cz = 36, W = 26, D = 15;
    for (const gg of [b, a]) {
      const c = G(gg, cx, top, cz);
      slab(c, W, D, 0.05, C.court, 0, 0, 0);
      // Lines: border, centre line and circle, keys.
      for (const [w, d, x, z] of [[W - 1, 0.12, 0, -(D - 1) / 2], [W - 1, 0.12, 0, (D - 1) / 2], [0.12, D - 1, -(W - 1) / 2, 0], [0.12, D - 1, (W - 1) / 2, 0], [0.12, D - 1, 0, 0]])
        slab(c, w, d, 0.01, C.lineWhite, x, z, 0.05);
      const ring = add(c, new THREE.RingGeometry(1.6, 1.75, 16), C.lineWhite, 0, 0.07, 0);
      ring.rotation.x = -Math.PI / 2;
      for (const s of [-1, 1]) {
        slab(c, 0.12, 4.0, 0.01, C.lineWhite, s * (W / 2 - 5.5), 0, 0.05);
        slab(c, 5, 0.12, 0.01, C.lineWhite, s * (W / 2 - 3), -2, 0.05);
        slab(c, 5, 0.12, 0.01, C.lineWhite, s * (W / 2 - 3), 2, 0.05);
      }
    }
    const intact = G(b, cx, top, cz);
    const broken = G(a, cx, top, cz);
    // Chain-link fence: posts + dark mesh panels round the court.
    const panel = (gp, x, z, len, ry, down = 0) => {
      const f = G(gp, x, 0, z, ry);
      if (down) {
        f.rotation.x = down;
        f.position.y = 0.15;
      }
      B(f, len, 2.4, 0.04, 0x3a353b, 0, 0, 0, 0, { transparent: true, opacity: 0.55 });
      B(f, len, 0.08, 0.08, C.metal, 0, 2.4, 0);
      B(f, 0.1, 2.5, 0.1, C.metal, -len / 2, 0, 0);
      return f;
    };
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 2.2 + i * 4.3;
      panel(intact, x, -D / 2 - 0.6, 4.3, 0);
      panel(intact, x, D / 2 + 0.6, 4.3, 0);
      // Broken: the street-side run is flattened, the far run leans.
      const flat = panel(broken, x + (i % 2) * 0.4, -D / 2 - 1.2 - (i % 3) * 0.4, 4.3, (i % 2) * 0.2, i < 4 ? -Math.PI / 2 : -0.4);
      if (i < 4) debris(flat);
      panel(broken, x, D / 2 + 0.6, 4.3, 0, i === 2 ? -0.5 : 0);
    }
    for (const s of [-1, 1]) {
      panel(intact, s * (W / 2 + 0.6), 0, D + 1.2, Math.PI / 2);
      panel(broken, s * (W / 2 + 0.6), 0, D + 1.2, Math.PI / 2, s < 0 ? -0.3 : 0);
    }
    // Hoops: pole, arm, backboard, rim.
    const hoop = (gp, s) => {
      const h = G(gp, s * (W / 2 - 1.0), 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      B(h, 0.2, 3.4, 0.2, C.metal, 0, 0, -0.6);
      B(h, 0.15, 0.15, 1.0, C.metal, 0, 3.3, -0.1);
      B(h, 1.8, 1.1, 0.08, C.white, 0, 3.0, 0.4);
      B(h, 0.6, 0.45, 0.09, 0xd8443f, 0, 3.05, 0.4);
      const rim = add(h, new THREE.TorusGeometry(0.25, 0.03, 4, 10), C.ball, 0, 3.0, 0.7);
      rim.rotation.x = Math.PI / 2;
      return h;
    };
    hoop(intact, -1);
    hoop(intact, 1);
    hoop(broken, 1);
    const bent = hoop(broken, -1);
    bent.rotation.z = 1.1;
    bent.position.y = 0.1;
    debris(bent);
    // Balls: two on court before; a dozen scattered after.
    for (const [x, z] of [[-3, 2], [6, -3]]) add(intact, new THREE.IcosahedronGeometry(0.3, 1), C.ball, x, 0.35, z);
    for (let i = 0; i < 12; i++)
      debris(add(broken, new THREE.IcosahedronGeometry(0.3, 1), C.ball, Math.cos(i * 2.2) * (4 + i), 0.35, Math.sin(i * 2.2) * 5 - 4 - (i % 3) * 2));
    for (const s of [-6, 6]) {
      bench(intact, s, -D / 2 - 2.0, Math.PI, 0x3f8f6e);
      const bb = bench(broken, s + 1, -D / 2 - 3.2, Math.PI + 0.8, 0x3f8f6e);
      bb.rotation.z = s > 0 ? 1.4 : 0;
      debris(bb);
    }
  });
  blueResidential(P(43, 15), 0, 0, Math.PI);
  landmark(P(13.5, 13.5), 0, 0, Math.PI);
  for (const [x, z] of [[23, 13], [33, 13]]) {
    const h = P(x, z, Math.PI);
    B(h, 7, 6, 7, x < 30 ? C.peach : C.mint, 0, 0, 0);
    gable(h, 7.6, 2.6, 7.6, x < 30 ? C.red : C.teal, 0, 6, 0, 0);
    facade(h, 7, 7, 2, 3, { frame: C.white, every: 2.4, w: 1.0, h: 1.3, from: 0, start: 0.2 });
    B(h, 1.2, 2.2, 0.2, C.dark, 2.2, 0, 3.52);
    B(h, 0.6, 1.4, 0.6, C.creamLight, -2, 7, -1.5);
  }
  bins(P(19, AV + 1.2), 0, 0);
  hydrant(P(40, AV + 1.0), 0, 0);

  // ---- Street furniture along the roads (destructible ones in "props").
  for (const [x, z, ry] of [[ST + 1, -AV - 1, Math.PI], [-ST - 1, AV + 1, 0], [-ST - 1, -AV - 1, Math.PI / 2], [ST + 1, AV + 1, -Math.PI / 2]])
    trafficLight(P(x, z), 0, 0, ry);
  stopSign(P(-ST - 1.2, AV + 7), 0, 0);
  for (const [x, z] of [[-44, -AV - 1.2], [44, AV + 1.2], [-ST - 1.2, 40], [ST + 1.2, -44]]) streetLight(P(x, z), 0, 0, x > 0 ? 0 : Math.PI);
  for (const [x, z] of [[14, AV + 2], [-44, AV + 1.6], [ST + 1.6, 28]]) planter(P(x, z), 0, 0, 3.4, Math.abs(x) < 8 ? Math.PI / 2 : 0);
  site(g, "props", -9, 10, "dust", (b, a) => {
    // A street tree, a streetlight, a sign and a fence run by the park
    // corner where the getaway car went over the kerb.
    tree(G(b, -9, top, AV + 2.2), 0, 0, 1, 1);
    streetLight(G(b, -14, top, AV + 1.0), 0, 0, Math.PI);
    picketFence(G(b, -9, top, AV + 3.4), 0, 0, 8, 0, 0x6b5a4e);
    const signB = G(b, -6.6, top, AV + 1.2);
    B(signB, 0.08, 2.4, 0.08, C.metal, 0, 0, 0);
    B(signB, 0.9, 0.9, 0.06, 0x3a7dff, 0, 2.2, 0);
    // After: tree flat on the pavement, lamp bent over, sign flattened,
    // fence pickets thrown about.
    const tA = G(a, -9, top, AV + 2.2);
    cyl(tA, 0.22, 0.26, 0.5, C.trunk, 0, 0, 0, 5);
    const down = tree(tA, 0.6, 0.3, 1, 1);
    down.rotation.set(0, 0.3, -Math.PI / 2 + 0.15);
    down.position.y = 0.3;
    debris(down);
    const lA = G(a, -14, top, AV + 1.0, Math.PI);
    cyl(lA, 0.22, 0.26, 0.3, C.metal, 0, 0, 0, 6);
    cyl(lA, 0.08, 0.1, 2.0, C.metal, 0, 0.3, 0, 6);
    const head = G(lA, 0, 2.3, 0);
    head.rotation.x = 1.3;
    cyl(head, 0.08, 0.08, 2.6, C.metal, 0, 0, 0, 6);
    B(head, 0.42, 0.18, 0.62, C.metal, 0, 2.6, -0.4);
    const sA = G(a, -6.6, top, AV + 1.2);
    const pole = B(sA, 0.08, 2.4, 0.08, C.metal, 0, 0, 0);
    pole.rotation.z = 1.35;
    const plate = B(sA, 0.9, 0.9, 0.06, 0x3a7dff, 2.0, 0.05, 0.2);
    plate.rotation.x = Math.PI / 2;
    debris(plate);
    for (let i = 0; i < 9; i++) {
      const pk = B(a, 0.1, 1.0, 0.08, 0x6b5a4e, -12 + i * 0.9, top + 0.05, AV + 3.4 + (i % 3) * 0.5);
      pk.rotation.set(Math.PI / 2, i * 0.7, 0);
      debris(pk);
    }
    picketFence(G(a, -6.0, top, AV + 3.4), 0, 0, 2, 0, 0x6b5a4e);
  });

  // ---- Vehicles: the chase through the junction.
  // (Vehicles stay separate meshes: lights blink, and in the game they move.)
  const player = G(g, -14, 0.1, 3.0, -Math.PI / 2 + 0.12);
  player.add(playerCar());
  const cop1 = G(g, -24, 0.1, 3.4, -Math.PI / 2);
  cop1.add(policeCar());
  const cop2 = G(g, 2.6, 0.1, -16, Math.PI);
  cop2.add(policeCar());
  // Parked along the north kerb: the vehicle samples side by side.
  G(g, -46, 0.1, -4.6, -Math.PI / 2).add(sedan(C.yellow, { taxi: true }));
  G(g, -40.4, 0.1, -4.6, -Math.PI / 2).add(sedan(C.blue));
  G(g, -34.2, 0.1, -4.6, -Math.PI / 2).add(pickup(C.red));
  G(g, -27.2, 0.1, -4.6, -Math.PI / 2).add(van(C.orange));
  G(g, 14, 0.1, -3.0, Math.PI / 2).add(sedan(C.yellow, { taxi: true }));
  G(g, 30, 0.1, -3.0, Math.PI / 2).add(sedan(0x4cc6b9));
  G(g, 26, 0.1, AV - 1.3, -Math.PI / 2).add(van(C.white));
  G(g, -2.6, 0.1, 22, 0).add(sedan(0xe8603c));
  for (const v of [player, cop1, cop2]) v.userData.keep = true;
  g.traverse((o) => {
    if (o.isGroup && o.children.some((c) => c.isGroup === false) && o.parent === g && o.position.y === 0.1) o.userData.keep = true;
  });
  return { g, cops: [cop1, cop2], player };
}

// Octagonal prism or ring (rIn > 0), one solid piece: corners meet exactly.
// Oriented like an 8-sided cylinder (a vertex on +z).
function octPrism(p, rOut, rIn, h, c, y = 0, o) {
  const poly = (r) => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return new THREE.Vector2(Math.sin(a) * r, Math.cos(a) * r);
  });
  const s = new THREE.Shape(poly(rOut));
  if (rIn > 0) s.holes.push(new THREE.Path(poly(rIn).reverse()));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  // Shape is in x/y, extruded along z: rotating +90° about x maps shape y
  // to +z (vertex on +z) and the extrusion to -y; lift it by h.
  g.rotateX(Math.PI / 2);
  g.translate(0, h, 0);
  return add(p, g, c, 0, y, 0, o);
}

// Coloured band round a slab's edge (no overlapping faces).
function fascia(p, w, d, y, c, h = 0.62) {
  B(p, w + 0.24, h, 0.12, c, 0, y, d / 2 + 0.06);
  B(p, w + 0.24, h, 0.12, c, 0, y, -d / 2 - 0.06);
  B(p, 0.12, h, d, c, w / 2 + 0.06, y, 0);
  B(p, 0.12, h, d, c, -w / 2 - 0.06, y, 0);
}

// ------------------------------------------------- fire, smoke, effects --
function flames(p, spots) {
  for (const [x, y, z] of spots) {
    const f = G(p, x, y, z);
    f.userData.fx = "flame";
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * 0.7, oz = (k % 2) * 0.5;
      C.fire.forEach((c, i) => {
        const s = (k === 1 ? 1.4 : 1) * (1 - i * 0.25);
        const m = add(f, new THREE.ConeGeometry(0.75 * s, 2.4 * s, 5), c, ox, 1.2 * s, oz, { emissive: c, emissiveIntensity: 0.9 });
        m.castShadow = false;
      });
    }
  }
}
// A column of soft faceted puffs, lighter and wider as it rises.
function smoke(p, spots) {
  for (const [x, y, z, s] of spots) {
    for (let i = 0; i < 4; i++) {
      const shade = [0x141316, 0x232126, 0x37343a, 0x4f4c53][i];
      const m = add(p, new THREE.IcosahedronGeometry(s * (0.8 + i * 0.35), 1), shade, x + i * 0.5, y + i * 1.8, z - i * 0.3, { transparent: true, opacity: 0.75 - i * 0.12 });
      m.userData.fx = "smoke";
      m.userData.base = y + i * 1.8;
      m.castShadow = false;
    }
  }
}

// ---------------------------------------------------------------- scene --
const canvas = document.querySelector("#view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
// Bright warm sun from the upper left, crisp readable shadows; a purple-
// tinted ground light keeps shade colourful (references 4 and 5).
scene.add(new THREE.HemisphereLight(0xffffff, 0x5f5a58, 1.35));
const sun = new THREE.DirectionalLight(0xfff2e0, 3.3);
sun.position.set(-40, 70, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 220 });
scene.add(sun);

const world = district(scene);
// Bake all static scenery and each site's states into few draw calls.
for (const s of sites) {
  bake(s.before);
  bake(s.after);
}
bake(world.g);

// Isometric-style camera (references 4/5).
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 600);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.42;
controls.minPolarAngle = Math.PI * 0.12;
controls.minZoom = 0.4;
controls.maxZoom = 6;
const VIEWS = {
  all: { target: [0, 0, 0], zoom: 1, az: -0.62 },
  gas: { target: [22, 2, -24], zoom: 2.4, az: -0.5 },
  court: { target: [29, 1, 33], zoom: 2.4, az: -0.75 },
  park: { target: [-28, 1, 28], zoom: 2.3, az: -0.55 },
  street: { target: [-27, 3, -14], zoom: 2.3, az: -0.35 },
  chase: { target: [-12, 1, 1], zoom: 3.6, az: -0.95 },
  cars: { target: [-35.5, 1, -3.2], zoom: 4.6, az: -0.45 },
  hero: { target: [-17, 1, 3.2], zoom: 7.5, az: -0.75 },
  landmark: { target: [13.5, 5, 13.5], zoom: 3.6, az: -2.35 },
};
let fly = null;
const viewSize = 70;
function frameCamera() {
  const a = innerWidth / innerHeight;
  const h = a < 1 ? viewSize / a : viewSize;
  camera.left = (-h * a) / 2;
  camera.right = (h * a) / 2;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.updateProjectionMatrix();
}
function camPos(target, az) {
  const d = 150,
    el = 0.62;
  return new THREE.Vector3(
    target.x + Math.sin(az) * Math.cos(el) * d,
    target.y + Math.sin(el) * d,
    target.z + Math.cos(az) * Math.cos(el) * d,
  );
}
function goTo(name, instant = false) {
  const v = VIEWS[name];
  const target = new THREE.Vector3(...v.target);
  const to = { target, pos: camPos(target, v.az), zoom: v.zoom };
  if (instant) {
    controls.target.copy(to.target);
    camera.position.copy(to.pos);
    camera.zoom = to.zoom;
    camera.updateProjectionMatrix();
    fly = null;
  } else
    fly = {
      from: { target: controls.target.clone(), pos: camera.position.clone(), zoom: camera.zoom },
      to,
      t: 0,
    };
  for (const b of document.querySelectorAll("[data-view]"))
    b.setAttribute("aria-pressed", String(b.dataset.view === name));
}

// ----------------------------------------------------- state & replay --
let wrecked = false;
function setWrecked(on) {
  wrecked = on;
  replay = null;
  for (const s of sites) {
    s.before.visible = !on;
    s.after.visible = on;
  }
  document.querySelector("#state").textContent = on ? "파괴 후" : "파괴 전";
  document.querySelector("#state").setAttribute("aria-pressed", String(on));
}
const effects = [];
function burst(x, z, kind) {
  const big = kind === "boom";
  // Fireball (faceted), shockwave ring, flying chunks; dust or water for
  // the others. Cartoon only.
  const n = big ? 10 : 7;
  if (big) {
    // Yellow-hot core first, then red-orange flame balls and black smoke.
    const core = add(scene, new THREE.IcosahedronGeometry(3.0, 0), 0xfff2a0, x, 2, z, { transparent: true, opacity: 1, emissive: 0xffe060, emissiveIntensity: 1.4 });
    core.castShadow = false;
    effects.push({ m: core, vx: 0, vy: 2, vz: 0, life: 0, grow: 1.8, max: 0.5 });
    for (let i = 0; i < 6; i++) {
      const s = add(scene, new THREE.IcosahedronGeometry(2.0, 0), [0x141316, 0x232126][i % 2], x + (i - 3) * 0.8, 3, z, { transparent: true, opacity: 0.9 });
      s.castShadow = false;
      effects.push({ m: s, vx: (i - 3) * 0.6, vy: 4 + i * 0.5, vz: (i % 2) - 0.5, life: -0.25, grow: 1.2, max: 2.2, smoke: true });
    }
  }
  for (let i = 0; i < n; i++) {
    const color = big ? C.fire[i % 3] : kind === "splash" ? 0xbff0ff : 0xe6e1d8;
    const m = add(scene, new THREE.IcosahedronGeometry(big ? 2.2 : 1.0, 0), color, x, 1.5, z, {
      transparent: true,
      opacity: 0.95,
      emissive: big ? color : 0,
      emissiveIntensity: big ? 0.9 : 0,
    });
    m.castShadow = false;
    const a = (i / n) * Math.PI * 2;
    effects.push({ m, vx: Math.cos(a) * (big ? 9 : 5), vy: big ? 7 + (i % 3) * 3 : 3, vz: Math.sin(a) * (big ? 9 : 5), life: 0, grow: big ? 2.6 : 1.4, max: big ? 1.3 : 0.9 });
  }
  if (big) {
    const ring = add(scene, new THREE.TorusGeometry(2, 0.35, 4, 24), 0xffe08a, x, 0.6, z, { transparent: true, opacity: 0.9, emissive: 0xffc040, emissiveIntensity: 1 });
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    effects.push({ m: ring, ring: true, life: 0, max: 0.8 });
  }
}
let replay = null;
function startReplay() {
  setWrecked(false);
  goTo("all");
  const order = ["props", "stall", "cafe", "court", "fountain", "gas"];
  replay = {
    t: 0,
    steps: order.map((name, i) => ({ s: sites.find((x) => x.name === name), at: 1.0 + i * 1.1, done: false })),
  };
}
function stepReplay(dt) {
  if (!replay) return;
  replay.t += dt;
  for (const st of replay.steps) {
    if (st.done || replay.t < st.at) continue;
    st.done = true;
    const s = st.s;
    s.before.visible = false;
    s.after.visible = true;
    burst(s.cx, s.cz, s.fx);
    st.pieces = [];
    s.after.traverse((o) => {
      if (o.userData.debris) {
        st.pieces.push({ o, end: o.position.clone(), endRot: o.rotation.clone() });
      }
    });
    st.k = 0;
  }
  let busy = false;
  for (const st of replay.steps) {
    if (!st.done) {
      busy = true;
      continue;
    }
    if (st.k >= 1) continue;
    busy = true;
    st.k = Math.min(1, st.k + dt / 0.8);
    const k = st.k;
    for (const p of st.pieces) {
      const from = p.o.parent.worldToLocal(new THREE.Vector3(st.s.cx, 2, st.s.cz));
      p.o.position.lerpVectors(from, p.end, k);
      p.o.position.y += Math.sin(k * Math.PI) * 5;
      p.o.rotation.set(p.endRot.x + (1 - k) * 6, p.endRot.y + (1 - k) * 4, p.endRot.z + (1 - k) * 3);
    }
  }
  if (!busy) {
    replay = null;
    wrecked = true;
    document.querySelector("#state").textContent = "파괴 후";
    document.querySelector("#state").setAttribute("aria-pressed", "true");
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  frameCamera();
}
addEventListener("resize", resize);
resize();
goTo("all", true);
setWrecked(false);
for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => goTo(b.dataset.view));
document.querySelector("#state").addEventListener("click", () => setWrecked(!wrecked));
document.querySelector("#replay").addEventListener("click", startReplay);

const animated = [];
scene.traverse((o) => o.userData.fx && animated.push(o));
let last = performance.now();
const stats = document.querySelector("#stats");
let statT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 0.9);
    const e = 1 - Math.pow(1 - fly.t, 3);
    controls.target.lerpVectors(fly.from.target, fly.to.target, e);
    camera.position.lerpVectors(fly.from.pos, fly.to.pos, e);
    camera.zoom = fly.from.zoom + (fly.to.zoom - fly.from.zoom) * e;
    camera.updateProjectionMatrix();
    if (fly.t >= 1) fly = null;
  }
  const blink = Math.floor(now / 250) % 2;
  for (const cop of world.cops)
    cop.traverse((o) => {
      if (o.material?.emissive?.getHex() === 0xff2040) o.material.emissiveIntensity = blink ? 1.4 : 0.15;
      if (o.material?.emissive?.getHex() === 0x2a60ff) o.material.emissiveIntensity = blink ? 0.15 : 1.4;
    });
  for (const o of animated) {
    if (o.userData.fx === "flame") o.scale.y = 1 + Math.sin(now / 90 + o.position.x) * 0.15;
    else if (o.userData.fx === "smoke") o.position.y = o.userData.base + Math.sin(now / 900 + o.position.x) * 0.4;
    else if (o.userData.fx === "geyser") o.scale.set(1 + Math.sin(now / 120) * 0.05, 1 + Math.sin(now / 200) * 0.04, 1);
    else if (o.userData.fx === "spray") o.position.y += Math.sin(now / 150 + o.position.x) * 0.01;
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life += dt;
    if (e.ring) {
      e.m.scale.setScalar(1 + e.life * 14);
      e.m.material.opacity = Math.max(0, 0.9 - e.life * 1.2);
    } else {
      if (e.life < 0) {
        e.m.visible = false;
        continue;
      }
      e.m.visible = true;
      if (!e.smoke) e.vy -= 9 * dt;
      e.m.position.x += e.vx * dt;
      e.m.position.y = Math.max(0.5, e.m.position.y + e.vy * dt);
      e.m.position.z += e.vz * dt;
      e.m.scale.setScalar(1 + e.life * e.grow);
      e.m.material.opacity = Math.max(0, 0.95 - e.life / e.max);
    }
    if (e.life > e.max) {
      scene.remove(e.m);
      effects.splice(i, 1);
    }
  }
  stepReplay(dt);
  controls.update();
  renderer.render(scene, camera);
  statT += dt;
  if (statT > 0.5) {
    statT = 0;
    stats.textContent = `그리기 ${renderer.info.render.calls}회 · 삼각형 ${Math.round(renderer.info.render.triangles / 1000)}k`;
  }
}
requestAnimationFrame(frame);
window.__ART__ = { goTo, setWrecked, startReplay, sites };
