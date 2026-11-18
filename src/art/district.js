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
// From references 4 and 5 (see docs/art-direction-v3.md).
export const C = {
  sky: 0xbfd3e6,
  asphalt: 0x4d4447,
  asphaltDark: 0x41393c,
  lineWhite: 0xfbf8f4,
  lineYellow: 0xf2c14e,
  walk: 0xd7cbbc,
  walkJoint: 0xc4b6a6,
  curb: 0xf4eade,
  concrete: 0xc9c2b8,
  grass: 0x4fae5f,
  grassDark: 0x3e9452,
  path: 0xe2c79f,
  leaf: [0x2f9a63, 0x3fae74, 0x58b85a],
  trunk: 0x8b5a3c,
  red: 0xd8443f,
  redDark: 0xa83236,
  blue: 0x3f5fbf,
  blueDark: 0x2f4594,
  cream: 0xf3deb5,
  creamLight: 0xfbf3e2,
  orange: 0xf39b6b,
  orangeDark: 0xe0703e,
  mint: 0xaac7b8,
  green: 0x6b8c6e,
  teal: 0x44655a,
  peach: 0xe8cba3,
  yellow: 0xf2c14e,
  glass: 0x9fd3d8,
  glassDark: 0x3e4a63,
  white: 0xfbf8f4,
  metal: 0x5b5560,
  dark: 0x2e2a30,
  court: 0x5d555f,
  ball: 0xe8823c,
  water: 0x63c6e0,
  player: 0xe0367a, // hot magenta getaway car: unique in the palette
  fire: [0xffd64a, 0xff9a2e, 0xff5a2a],
  smoke: 0x5b5560,
  scorch: 0x2b2427,
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
// Angular boxy cars (references 4/5): flat panels, tapered glass cabin,
// square lights, separate bumpers, chunky wheels. About 3.6 x 1.9 m:
// within the game's 2.1 x 3.6 m car box.
function wheels(p, track, base, r = 0.4) {
  for (const x of [-track, track])
    for (const z of [-base, base]) {
      const w = add(p, new THREE.CylinderGeometry(r, r, 0.34, 10), C.dark, x, r, z);
      w.rotation.z = Math.PI / 2;
      const h = add(p, new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.36, 6), 0xbfbac4, x, r, z);
      h.rotation.z = Math.PI / 2;
    }
}
function carLights(p, front, back, y, w = 0.55) {
  for (const x of [-w, w]) {
    B(p, 0.42, 0.18, 0.08, 0xfff4c8, x, y, front, 0, { emissive: 0xffe8a0, emissiveIntensity: 0.4 });
    B(p, 0.42, 0.16, 0.08, 0xe0303a, x, y, back, 0, { emissive: 0xb01020, emissiveIntensity: 0.3 });
  }
}
function sedan(color, { stripe = null, taxi = false } = {}) {
  const g = new THREE.Group();
  B(g, 1.9, 0.62, 3.8, color, 0, 0.34, 0);
  frustum(g, 1.7, 2.0, 0.7, 0.78, C.glassDark, 0, 0.96, 0.15);
  B(g, 1.36, 0.08, 1.5, color, 0, 1.66, 0.15);
  B(g, 1.96, 0.2, 0.25, 0x3a353b, 0, 0.3, -1.9);
  B(g, 1.96, 0.2, 0.25, 0x3a353b, 0, 0.3, 1.9);
  carLights(g, -1.91, 1.91, 0.66);
  if (stripe)
    for (const x of [-0.25, 0.25]) {
      B(g, 0.22, 0.02, 3.81, stripe, x, 0.96, 0);
      B(g, 0.22, 0.02, 1.5, stripe, x, 1.74, 0.15);
    }
  if (taxi) B(g, 0.6, 0.25, 0.3, 0x2e2a30, 0, 1.74, 0.15);
  wheels(g, 0.92, 1.2);
  return g;
}
export function playerCar() {
  // A low muscle coupe: long bonnet, short cabin set back, rear spoiler.
  const g = new THREE.Group();
  B(g, 1.95, 0.58, 3.9, C.player, 0, 0.34, 0);
  B(g, 1.7, 0.12, 1.4, C.player, 0, 0.92, -1.15); // raised bonnet
  B(g, 0.5, 0.18, 0.7, C.dark, 0, 1.0, -1.2); // bonnet scoop
  frustum(g, 1.7, 1.75, 0.62, 0.74, C.glassDark, 0, 0.92, 0.45);
  B(g, 1.3, 0.07, 1.25, C.player, 0, 1.53, 0.45);
  for (const x of [-0.28, 0.28]) {
    B(g, 0.22, 0.02, 3.91, C.white, x, 0.92, 0);
    B(g, 0.22, 0.02, 1.25, C.white, x, 1.6, 0.45);
  }
  B(g, 1.9, 0.08, 0.36, C.dark, 0, 1.24, 1.82); // spoiler
  for (const x of [-0.75, 0.75]) B(g, 0.08, 0.3, 0.14, C.dark, x, 0.92, 1.82);
  B(g, 2.0, 0.2, 0.25, C.dark, 0, 0.3, -1.98);
  B(g, 2.0, 0.2, 0.25, C.dark, 0, 0.3, 1.98);
  carLights(g, -1.96, 1.96, 0.66, 0.6);
  for (const x of [-0.45, 0.45]) cyl(g, 0.08, 0.08, 0.2, 0x8a8590, x, 0.18, 2.05);
  wheels(g, 0.93, 1.25, 0.44);
  return g;
}
export function policeCar() {
  const g = new THREE.Group();
  B(g, 1.98, 0.66, 3.95, C.dark, 0, 0.34, 0);
  B(g, 2.0, 0.5, 1.6, C.white, 0, 0.42, 0.1); // white doors
  frustum(g, 1.78, 2.0, 0.72, 0.78, C.glassDark, 0, 1.0, 0.15);
  B(g, 1.4, 0.1, 1.55, C.white, 0, 1.72, 0.15);
  B(g, 1.3, 0.12, 0.42, C.metal, 0, 1.82, 0.15);
  B(g, 0.58, 0.2, 0.36, 0xff3a4c, -0.34, 1.94, 0.15, 0, { emissive: 0xff2040, emissiveIntensity: 0.8 });
  B(g, 0.58, 0.2, 0.36, 0x3a7dff, 0.34, 1.94, 0.15, 0, { emissive: 0x2a60ff, emissiveIntensity: 0.8 });
  B(g, 1.7, 0.42, 0.14, C.metal, 0, 0.22, -2.1); // push bar
  for (const x of [-0.5, 0.5]) B(g, 0.12, 0.3, 0.3, C.metal, x, 0.3, -1.95);
  B(g, 2.04, 0.2, 0.25, 0x3a353b, 0, 0.3, 1.98);
  for (const x of [-1.01, 1.01]) {
    const s = add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 5), C.yellow, x, 0.7, 0.1);
    s.rotation.z = Math.PI / 2;
  }
  carLights(g, -1.98, 1.98, 0.7);
  wheels(g, 0.95, 1.25, 0.42);
  return g;
}
function pickup(color) {
  const g = new THREE.Group();
  B(g, 2.0, 0.7, 4.3, color, 0, 0.4, 0);
  B(g, 1.9, 0.75, 1.5, color, 0, 1.1, -0.45);
  B(g, 1.7, 0.5, 0.06, C.glassDark, 0, 1.25, -1.21);
  for (const x of [-0.96, 0.96]) B(g, 0.06, 0.45, 1.1, C.glassDark, x, 1.25, -0.45);
  B(g, 1.7, 0.08, 1.9, 0x8f7b62, 0, 1.0, 1.05);
  B(g, 2.04, 0.22, 0.25, 0x6a6470, 0, 0.32, -2.15);
  carLights(g, -2.16, 2.16, 0.78);
  wheels(g, 0.98, 1.4, 0.48);
  return g;
}
function van(color) {
  const g = new THREE.Group();
  B(g, 2.0, 1.75, 4.4, color, 0, 0.35, 0.1);
  frustum(g, 2.0, 0.9, 0.7, 0.86, color, 0, 0.35, -2.4);
  B(g, 1.8, 0.6, 0.06, C.glassDark, 0, 1.3, -2.11);
  for (const x of [-1.01, 1.01]) B(g, 0.04, 0.5, 2.4, C.glassDark, x, 1.4, -0.2);
  B(g, 2.02, 0.12, 4.4, 0x4cc6b9, 0, 0.9, 0.1);
  carLights(g, -2.86, 2.32, 0.6);
  wheels(g, 0.96, 1.5, 0.42);
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
  const g = G(p, x, y, z, ry);
  B(g, w + 0.24, h + 0.24, 0.12, frame, 0, -0.12, 0);
  B(g, w, h, 0.14, C.glass, 0, 0, 0.02);
  B(g, 0.06, h, 0.16, frame, 0, 0, 0.03);
  if (sill) B(g, w + 0.4, 0.12, 0.3, frame, 0, -0.2, 0.1);
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
        B(p, w + 0.9, 0.12, 0.9, frame, x0 + i * every, y - h / 2 - 0.3, depth / 2 + 0.45);
        for (let r = 0; r <= 6; r++)
          B(p, 0.06, 0.7, 0.06, frame, x0 + i * every - (w + 0.8) / 2 + r * ((w + 0.8) / 6), y - h / 2 - 0.18, depth / 2 + 0.86);
        B(p, w + 0.9, 0.08, 0.08, frame, x0 + i * every, y - h / 2 + 0.5, depth / 2 + 0.86);
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
  B(p, 0.25, h, d, c, w / 2, y, 0);
  B(p, 0.25, h, d, c, -w / 2, y, 0);
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
// 4. Cream corner café with a chamfered corner and striped awning (ref 4).
function cornerCafe(p, x, z, ry = 0) {
  const g = G(p, x, 0, z, ry);
  const W = 10, D = 10, H = 7.4;
  B(g, W, H, D, C.cream, 0, 0, 0);
  const cut = B(g, 3.0, H + 0.01, 3.0, C.cream, W / 2 - 0.9, 0, D / 2 - 0.9, Math.PI / 4);
  cut.scale.set(1, 1, 0.3);
  B(g, W + 0.3, 0.3, D + 0.3, 0xe6cd9c, 0, H, 0);
  parapet(g, W, D, H + 0.3, 0xe6cd9c, 0.5);
  facade(g, W, D, 2, 3.4, { frame: C.white, every: 2.4, w: 1.0, h: 1.3, from: 1 });
  const side = G(g, 0, 0, 0, Math.PI / 2);
  facade(side, D, W, 2, 3.4, { frame: C.white, every: 2.4, w: 1.0, h: 1.3, from: 1 });
  // Shopfront glazing on both street faces + door + awnings.
  B(g, W - 3, 2.3, 0.2, C.glass, -1, 0.3, D / 2 + 0.02);
  B(g, 0.2, 2.3, D - 3, C.glass, W / 2 + 0.02, 0.3, -1);
  awning(g, W - 2.4, -1.2, 3.1, D / 2, C.red, C.white);
  awning(g, D - 2.4, W / 2, 3.1, -1.2, C.red, C.white, 1.3, Math.PI / 2);
  signBoard(g, "CAFE", 2.6, 0.7, -1, 3.65, D / 2 + 0.12, 0, "#3e3438", "#fbe8c4");
  // Chimneys and a menu board.
  for (const s of [-1, 1]) B(g, 0.7, 1.2, 0.7, 0xe6cd9c, 1.6 + s * 0.5, H + 0.3, -3);
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

  // ---- NE: gas station and red billboard block.
  B(g, 30, 0.31, 24, C.concrete, 22, 0, -24); // forecourt
  for (let x = 8; x <= 36; x += 3.5) slab(g, 0.05, 24, 0.01, 0xb3ab9f, x, -24, 0.31);
  // Convenience store.
  const mart = P(22, -41);
  B(mart, 18, 4.8, 8, C.white, 0, 0, 0);
  B(mart, 18.3, 0.9, 8.3, 0x3f8f6e, 0, 4.8, 0);
  B(mart, 14, 2.6, 0.2, C.glass, -1, 0.3, 4.02);
  B(mart, 1.6, 2.6, 0.22, C.dark, 7, 0.0, 4.03);
  signBoard(mart, "24 MART", 6, 0.8, -1, 5.25, 4.2, 0, "#3f8f6e", "#ffffff");
  rooftopKit(mart, 18, 8, 5.7, 3);
  bins(P(32, -36), 0, 0);
  // Price pylon.
  const pylon = P(35, -10);
  B(pylon, 0.4, 5.0, 0.4, C.metal, 0, 0, 0);
  B(pylon, 2.4, 3.0, 0.4, 0x3f8f6e, 0, 4.0, 0);
  signBoard(pylon, "GAS", 2.0, 0.9, 0, 6.3, 0.22, 0, "#3f8f6e", "#ffd64a");
  for (let i = 0; i < 3; i++) B(pylon, 1.8, 0.5, 0.42, i === 0 ? C.yellow : C.white, 0, 4.3 + i * 0.7, 0);
  site(g, "gas", 22, -22, "boom", (b, a) => {
    // Canopy on four columns, two pump islands, a pickup filling up.
    const cB = G(b, 22, top, -22);
    for (const [sx, sz] of [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5]]) B(cB, 0.5, 5.2, 0.5, C.white, sx, 0, sz);
    B(cB, 17, 0.8, 11, C.white, 0, 5.2, 0);
    fascia(cB, 17, 11, 5.3, 0x3f8f6e);
    for (let i = -3; i <= 3; i++) B(cB, 1.2, 0.05, 0.4, 0xfff4cf, i * 2.2, 5.15, 0, 0, { emissive: 0xffe9a8, emissiveIntensity: 0.6 });
    for (const sx of [-3, 3]) {
      B(cB, 1.4, 0.3, 6.4, C.curb, sx, 0, 0);
      for (const sz of [-1.6, 1.6]) {
        const pump = G(cB, sx, 0.3, sz);
        B(pump, 0.9, 1.9, 0.7, C.red, 0, 0, 0);
        B(pump, 0.7, 0.5, 0.05, C.glassDark, 0, 1.2, 0.36);
        B(pump, 0.9, 0.2, 0.7, C.white, 0, 1.9, 0);
        B(pump, 0.12, 0.6, 0.12, C.dark, 0.5, 0.6, 0.2);
      }
    }
    const truck = G(b, 17.2, top, -20.8, 0);
    truck.add(pickup(0xd8c49c));
    // A police car pulling onto the forecourt after the player.
    const copIn = G(b, 11.5, top, -12.5, Math.PI * 0.82);
    copIn.add(policeCar());
    // Wrecked: canopy slumped onto one side, columns buckled, pumps blown
    // apart, scorch mark, fires and smoke; the police car caught in the
    // blast is flipped and blackened.
    const cA = G(a, 22, top, -22);
    slab(cA, 16, 12, 0.02, C.scorch, 0, 0, 0.32);
    for (const [sx, sz, rz] of [[-6, -3.5, 0.5], [6, -3.5, -0.1], [-6, 3.5, 0.6], [6, 3.5, 0]]) {
      const col = B(cA, 0.5, sx < 0 ? 3.2 : 5.2, 0.5, 0xd9d2cc, sx, 0, sz);
      col.rotation.z = rz;
    }
    const roof = G(cA, 1.0, 2.6, 0);
    roof.rotation.z = 0.36;
    B(roof, 17, 0.8, 11, 0xd9d2cc, 0, 0, 0);
    fascia(roof, 17, 11, 0.1, 0x2f6a52);
    for (const sx of [-3, 3]) {
      B(cA, 1.4, 0.3, 6.4, 0x9a938c, sx, 0, 0);
      for (const sz of [-1.6, 1.6]) {
        const base = B(cA, 0.9, 0.5, 0.7, 0x7a2b2e, sx, 0.3, sz);
        base.rotation.y = sz;
        const top2 = B(cA, 0.9, 1.0, 0.7, 0x8a2f30, sx + 1.8 * Math.sign(sz), 0.0, sz * 2.4);
        top2.rotation.set(1.4, sz, 0.3);
        debris(top2);
      }
    }
    for (let i = 0; i < 14; i++) {
      const d = B(cA, 0.5 + (i % 3) * 0.3, 0.12, 0.4 + (i % 2) * 0.3, i % 3 ? 0xd9d2cc : C.red, Math.cos(i * 2.4) * (7 + (i % 4)), 0, Math.sin(i * 2.4) * (6 + (i % 3)), i);
      debris(d);
    }
    const wreck = G(a, 17.2, top, -20.8, 0.4);
    const pk = pickup(0x6d5f52);
    pk.rotation.z = 2.6;
    pk.position.y = 1.6;
    wreck.add(pk);
    // The police car caught by the blast: thrown onto its roof, scorched.
    const copOut = G(a, 9.8, top, -10.8, Math.PI * 0.6);
    const burnt = policeCar();
    burnt.traverse((o) => {
      if (o.isMesh) o.material = M(o.material.color.getHex() === C.white ? 0x6a6266 : 0x2b2427);
    });
    burnt.rotation.z = Math.PI - 0.25;
    burnt.position.y = 1.9;
    copOut.add(burnt);
    const bar = B(a, 1.3, 0.3, 0.42, 0x6a6266, 7.2, top, -8.6, 0.7);
    debris(bar);
    flames(G(a, 9.8, top + 0.3, -10.8), [[0, 0, 0]]);
    // Blown-in shop windows and glass across the forecourt.
    B(a, 14, 2.6, 0.22, 0x2b2427, 21, top + 0.3, -36.95);
    for (let i = 0; i < 16; i++) debris(B(a, 0.35, 0.03, 0.25, C.glass, 13 + i * 1.1, top + 0.02, -35.5 + (i % 4) * 0.8, i));
    flames(cA, [[-3, 0.3, -1], [3.5, 0.3, 1.5], [-4.6, 0.3, 2.4], [0, 0.3, 4.8]]);
    smoke(cA, [[-3, 3, -1, 1.6], [-2.4, 6, -0.4, 1.3], [3.6, 3.4, 1.4, 1.5], [3, 7, 1, 1.2], [-1, 9, 0, 1.0]]);
  });
  redBillboard(P(43, -26), 0, 0, 0);
  streetLight(P(33, -AV - 1), 0, 0);

  // ---- SW: public park with a fountain, paths and trees.
  slab(g, R - ST - 3, R - AV - 3, 0.36, C.grass, -(R + ST) / 2, (R + AV) / 2);
  for (const [w, d, x, z, ry] of [
    [3, 46, -28, 29, 0.78],
    [3, 46, -28, 29, -0.78],
    [42, 3, -28, 29, 0],
  ]) {
    const s = slab(g, w, d, 0.04, C.path, x, z, 0.36);
    s.rotation.y = ry;
  }
  site(g, "fountain", -28, 29, "splash", (b, a) => {
    const fB = G(b, -28, 0.4, 29);
    cyl(fB, 5.0, 5.2, 0.8, C.curb, 0, 0, 0, 8);
    cyl(fB, 4.4, 4.4, 0.82, C.water, 0, 0, 0, 8, { roughness: 0.2 });
    cyl(fB, 0.7, 0.9, 2.0, C.curb, 0, 0.8, 0, 8);
    cyl(fB, 1.9, 0.9, 0.5, C.curb, 0, 2.8, 0, 8);
    cyl(fB, 1.6, 1.6, 0.52, C.water, 0, 2.8, 0, 8, { roughness: 0.2 });
    cyl(fB, 0.25, 0.35, 1.0, C.curb, 0, 3.3, 0, 6);
    add(fB, new THREE.ConeGeometry(0.9, 1.6, 8, 1, true), 0xbfeefa, 0, 4.8, 0, { transparent: true, opacity: 0.55, roughness: 0.1 });
    // Wrecked: rim split into chunks, column toppled, a huge water geyser
    // and a spreading puddle.
    const fA = G(a, -28, 0.4, 29);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const chunk = B(fA, 3.6, 0.8, 0.6, C.curb, Math.cos(ang) * (5.2 + (i % 3) * 0.6), 0, Math.sin(ang) * (5.2 + (i % 3) * 0.6), -ang + Math.PI / 2);
      chunk.rotation.z = (i % 2 ? 0.3 : -0.2);
      if (i % 3 === 0) debris(chunk);
    }
    cyl(fA, 6.5, 6.5, 0.1, C.water, 0, 0, 0, 10, { roughness: 0.15 });
    const col = G(fA, 3.0, 0.5, -1.0);
    col.rotation.z = Math.PI / 2 - 0.2;
    cyl(col, 0.7, 0.9, 2.0, C.curb, 0, 0, 0, 8);
    cyl(col, 1.9, 0.9, 0.5, C.curb, 0, 2.0, 0, 8);
    debris(col);
    const geyser = add(fA, new THREE.CylinderGeometry(0.6, 1.4, 11, 8, 1, true), 0x9fe6ff, 0, 5.5, 0, { transparent: true, opacity: 0.55, roughness: 0.05 });
    geyser.userData.fx = "geyser";
    geyser.castShadow = false;
    for (let i = 0; i < 14; i++) {
      const d = add(fA, new THREE.IcosahedronGeometry(0.5 + (i % 3) * 0.2, 0), 0xbff0ff, Math.cos(i) * (1 + (i % 4)), 9 + (i % 5) * 0.8, Math.sin(i) * (1 + (i % 4)), { transparent: true, opacity: 0.7, roughness: 0.05 });
      d.userData.fx = "spray";
      d.castShadow = false;
    }
  });
  for (const [x, z, k, s] of [[-44, 12, 0, 1.1], [-40, 45, 1, 1], [-14, 44, 2, 1.2], [-12, 14, 1, 0.9], [-45, 28, 0, 1], [-28, 45, 2, 1.1], [-20, 20, 0, 0.8], [-36, 38, 1, 0.9]])
    tree(P(x, z), 0, 0, k, s);
  for (const [x, z, ry] of [[-21, 29, Math.PI / 2], [-35, 29, -Math.PI / 2], [-28, 36, Math.PI], [-28, 22, 0]]) bench(P(x, z), 0, 0, ry);
  picketFence(P(-28, AV + 3.4), 0, 0, 34, 0, 0x6b5a4e);
  for (const [x, z] of [[-40, 18], [-16, 40]]) streetLight(P(x, z), 0, 0);
  // Swing set (reference 4) at the park's corner.
  const swing = P(-44, 44, 0.4);
  for (const s of [-1.6, 1.6]) {
    const l1 = B(swing, 0.12, 3.2, 0.12, 0xd9734f, s, 0, -0.6);
    l1.rotation.x = 0.2;
    const l2 = B(swing, 0.12, 3.2, 0.12, 0xd9734f, s, 0, 0.6);
    l2.rotation.x = -0.2;
  }
  B(swing, 3.4, 0.12, 0.12, 0xd9734f, 0, 3.05, 0);
  for (const s of [-0.7, 0.7]) {
    B(swing, 0.03, 2.0, 0.03, C.metal, s, 1.0, 0);
    B(swing, 0.5, 0.06, 0.25, C.dark, s, 1.0, 0);
  }

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
  cornerCafe(P(13.5, 13.5), 0, 0, Math.PI);
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
      const shade = [0x4a4448, 0x6a6468, 0x8d878b, 0xb2adb0][i];
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
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
// Bright warm sun from the upper left, crisp readable shadows; a purple-
// tinted ground light keeps shade colourful (references 4 and 5).
scene.add(new THREE.HemisphereLight(0xfff6ee, 0x7a5c84, 1.5));
const sun = new THREE.DirectionalLight(0xfff0dc, 3.0);
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
  for (let i = 0; i < n; i++) {
    const color = big ? C.fire[i % 3] : kind === "splash" ? 0xbff0ff : 0xf3e8da;
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
      e.vy -= 9 * dt;
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
