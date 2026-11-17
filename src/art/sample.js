// V2.0 art sample: the current look next to a pastel, toy-like low-poly
// proposal (one short boxy car and a small street corner with shops and
// houses), for comparison before any change to the game's graphics.
// Separate page (art-sample.html); the game does not load this file.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const canvas = document.querySelector("#art");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.setScissorTest(true);

// -------------------------------------------------------------- helpers --
const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}:${JSON.stringify(opts)}`;
  if (!mats.has(key))
    mats.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts }),
    );
  return mats.get(key);
}
function add(parent, geometry, color, x, y, z, opts) {
  const m = new THREE.Mesh(geometry, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const box = (p, w, h, d, c, x, y, z, o) =>
  add(p, new THREE.BoxGeometry(w, h, d), c, x, y, z, o);
const rbox = (p, w, h, d, r, c, x, y, z, o) =>
  add(p, new RoundedBoxGeometry(w, h, d, 3, r), c, x, y, z, o);

// --------------------------------------------- current style (V1.9 look) --
// Same shapes and colours as src/render/scene.js uses now.
function currentScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x83c8d3);
  scene.add(new THREE.HemisphereLight(0xe9f9ff, 0x35513c, 2.2));
  const sun = new THREE.DirectionalLight(0xffefd6, 3);
  sun.position.set(-12, 22, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 });
  scene.add(sun);
  box(scene, 30, 1, 30, 0x116748, 0, -0.5, 0);
  box(scene, 26, 0.3, 26, 0x38535a, 0, 0.05, 0);
  box(scene, 26, 0.08, 7, 0x23373e, 0, 0.24, 4);
  for (let x = -11; x <= 11; x += 4)
    box(scene, 2.4, 0.03, 0.16, 0xf8eab6, x, 0.3, 4);
  const colors = [0xf34b32, 0xffbf22, 0x087cba];
  [
    [-7, -5, 9],
    [0, -5, 13],
    [7, -5, 7],
  ].forEach(([x, z, h], i) => {
    box(scene, 6, h, 6, colors[i], x, h / 2 + 0.2, z);
    box(scene, 6.1, 0.4, 6.1, 0xfff1c7, x, h + 0.4, z);
    for (let y = 2; y < h - 1; y += 2.2)
      for (const dx of [-1.6, 0, 1.6])
        box(scene, 0.9, 1, 0.1, 0x173749, x + dx, y, z + 3.02);
  });
  for (const x of [-11, 11]) {
    box(scene, 0.45, 2, 0.45, 0x7f4926, x, 1.2, 9);
    const crown = add(scene, new THREE.IcosahedronGeometry(1.7, 0), 0x168a37, x, 3.2, 9, { flatShading: true });
    crown.scale.y = 1.25;
  }
  const car = new THREE.Group();
  box(car, 1.8, 0.65, 3.4, 0xf34b32, 0, 0.65, 0);
  box(car, 1.5, 0.6, 1.6, 0x1a4955, 0, 1.15, 0.15);
  box(car, 1.55, 0.12, 1.45, 0xf34b32, 0, 1.5, 0.2);
  for (const x of [-0.95, 0.95])
    for (const z of [-1.05, 1.05]) box(car, 0.3, 0.65, 0.65, 0x17252b, x, 0.4, z);
  for (const x of [-0.55, 0.55]) {
    box(car, 0.45, 0.22, 0.06, 0xfff3c4, x, 0.7, -1.73);
    box(car, 0.45, 0.2, 0.06, 0xff3028, x, 0.7, 1.73);
  }
  box(car, 2, 0.15, 0.4, 0x172d36, 0, 1, 1.45);
  car.position.set(0, 0.25, 4);
  car.rotation.y = Math.PI / 2;
  scene.add(car);
  return { scene, car };
}

// ----------------------------------------- V2.0 pastel toy-like sample --
const P = {
  sky: 0xcdebf2,
  ground: 0xbfe3b4,
  walk: 0xf5ebdd,
  kerb: 0xe7d9c6,
  road: 0x9aa3b5,
  line: 0xfffaf0,
  trunk: 0xc29a74,
  leaf: [0x9fd88f, 0x86c98a, 0xb7e3a0],
};

function toyCar(color = 0xffb3c1) {
  const g = new THREE.Group();
  // Short, tall, rounded body: about 2.6 m long against the old 3.4 m.
  rbox(g, 1.9, 0.9, 2.6, 0.28, color, 0, 0.85, 0);
  rbox(g, 1.62, 0.78, 1.45, 0.24, 0xfff6ee, 0, 1.6, 0.18);
  // Windows (front, back, sides) as soft blue panels.
  rbox(g, 1.42, 0.5, 0.06, 0.04, 0x9fd3f5, 0, 1.62, -0.56, { roughness: 0.3 });
  rbox(g, 1.42, 0.46, 0.06, 0.04, 0x9fd3f5, 0, 1.62, 0.92, { roughness: 0.3 });
  for (const x of [-0.82, 0.82])
    rbox(g, 0.06, 0.46, 1.1, 0.04, 0x9fd3f5, x, 1.62, 0.18, { roughness: 0.3 });
  rbox(g, 1.7, 0.12, 1.5, 0.06, color, 0, 2.02, 0.18);
  // Chunky wheels with white hubs.
  for (const x of [-0.92, 0.92])
    for (const z of [-0.82, 0.82]) {
      const w = add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.34, 16), 0x5a5a6e, x, 0.42, z);
      w.rotation.z = Math.PI / 2;
      const hub = add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12), 0xfafafa, x, 0.42, z);
      hub.rotation.z = Math.PI / 2;
    }
  // Round headlights, small tail lights, bumpers.
  for (const x of [-0.55, 0.55]) {
    const h = add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16), 0xfff7c2, x, 0.95, -1.31, { emissive: 0xfff2a8, emissiveIntensity: 0.4 });
    h.rotation.x = Math.PI / 2;
    rbox(g, 0.3, 0.16, 0.06, 0.03, 0xff7f7f, x, 0.98, 1.31);
  }
  rbox(g, 1.95, 0.22, 0.24, 0.1, 0xf0e4d8, 0, 0.5, -1.3);
  rbox(g, 1.95, 0.22, 0.24, 0.1, 0xf0e4d8, 0, 0.5, 1.3);
  return g;
}

function tree(scene, x, z, s = 1, i = 0) {
  add(scene, new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.4 * s, 8), P.trunk, x, 0.9 * s, z);
  const leaf = P.leaf[i % P.leaf.length];
  add(scene, new THREE.IcosahedronGeometry(1.1 * s, 1), leaf, x, 2.2 * s, z, { flatShading: true });
  add(scene, new THREE.IcosahedronGeometry(0.75 * s, 1), leaf, x + 0.5 * s, 2.9 * s, z - 0.2 * s, { flatShading: true });
}

function shop(scene, x, z, wall, awning, sign) {
  const g = new THREE.Group();
  rbox(g, 5.4, 4.2, 4.4, 0.18, wall, 0, 2.1, 0);
  rbox(g, 5.7, 0.4, 4.7, 0.12, 0xfffaf2, 0, 4.35, 0);
  // Big display window and a door.
  rbox(g, 3.0, 1.7, 0.12, 0.06, 0xbfe4fb, -0.9, 1.4, 2.22, { roughness: 0.25 });
  rbox(g, 1.0, 2.2, 0.12, 0.06, 0x9c7b66, 1.7, 1.1, 2.22);
  // Striped awning.
  for (let k = 0; k < 6; k++)
    box(g, 0.9, 0.12, 1.2, k % 2 ? 0xfffaf2 : awning, -2.25 + k * 0.9, 2.75, 2.75).rotation.x = 0.35;
  // Sign board on the roof edge.
  rbox(g, 3.2, 0.8, 0.2, 0.1, sign, 0, 3.6, 2.3);
  box(g, 2.4, 0.18, 0.06, 0xffffff, 0, 3.62, 2.42);
  g.position.set(x, 0.25, z);
  scene.add(g);
}

function house(scene, x, z, wall, roof) {
  const g = new THREE.Group();
  rbox(g, 4.4, 3.0, 4.0, 0.16, wall, 0, 1.5, 0);
  const r = add(g, new THREE.CylinderGeometry(0.01, 3.4, 2.0, 4, 1), roof, 0, 4.0, 0, { flatShading: true });
  r.rotation.y = Math.PI / 4;
  r.scale.set(1, 1, 0.86);
  box(g, 0.6, 1.2, 0.6, 0xfffaf2, 1.2, 4.4, -0.6);
  rbox(g, 0.9, 1.7, 0.12, 0.05, 0xa98068, 0, 0.85, 2.02);
  for (const dx of [-1.4, 1.4])
    rbox(g, 0.9, 0.9, 0.12, 0.05, 0xbfe4fb, dx, 1.75, 2.02, { roughness: 0.25 });
  // Flower box and a little fence.
  rbox(g, 1.2, 0.3, 0.3, 0.08, 0xf6c9a8, 1.4, 1.15, 2.15);
  for (let k = -2; k <= 2; k++) box(g, 0.12, 0.6, 0.12, 0xfffaf2, k, 0.3, 2.9);
  box(g, 4.2, 0.1, 0.08, 0xfffaf2, 0, 0.5, 2.9);
  g.position.set(x, 0.25, z);
  scene.add(g);
}

function sampleScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.sky, 40, 80);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8d6c0, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.7);
  sun.position.set(-10, 20, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 });
  scene.add(sun);
  rbox(scene, 30, 1, 30, 0.3, P.ground, 0, -0.5, 0);
  rbox(scene, 26, 0.3, 11, 0.12, P.walk, 0, 0.1, -4.5);
  rbox(scene, 26, 0.3, 4, 0.12, P.walk, 0, 0.1, 9.5);
  rbox(scene, 26, 0.12, 6.4, 0.05, P.road, 0, 0.06, 4.2);
  for (let x = -11; x <= 11; x += 3.2)
    rbox(scene, 1.6, 0.03, 0.22, 0.08, P.line, x, 0.14, 4.2);
  // Zebra crossing.
  for (let z = 1.6; z <= 6.8; z += 0.9) box(scene, 2.4, 0.03, 0.5, P.line, 8.5, 0.14, z);
  shop(scene, -7.5, -5.5, 0xffd8cc, 0xff9b9b, 0xff9b9b);
  shop(scene, -1.6, -5.5, 0xd4eaff, 0x86baf5, 0x86baf5);
  house(scene, 4.6, -5.8, 0xfff1c4, 0xf2a593);
  house(scene, 10, -5.8, 0xdaf1d2, 0x8ec9a5);
  [[-11.5, -1], [1.6, -1.2], [12.2, -1.4], [-6, 10], [4, 10.4]].forEach(([x, z], i) =>
    tree(scene, x, z, i % 2 ? 0.85 : 1, i),
  );
  // Street lamp, bench, trash can (the destructible props, new style).
  add(scene, new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), 0x7d8aa3, -3.8, 1.95, 0.4);
  add(scene, new THREE.SphereGeometry(0.3, 12, 8), 0xfff4c9, -3.8, 3.75, 0.4, { emissive: 0xffeaa0, emissiveIntensity: 0.5 });
  rbox(scene, 1.8, 0.16, 0.6, 0.06, 0xd9a77f, 6.5, 0.75, 9.1);
  box(scene, 0.12, 0.5, 0.5, 0x7d8aa3, 5.8, 0.45, 9.1);
  box(scene, 0.12, 0.5, 0.5, 0x7d8aa3, 7.2, 0.45, 9.1);
  add(scene, new THREE.CylinderGeometry(0.34, 0.3, 0.8, 12), 0x8fcfb6, 9.6, 0.65, 0.5);
  add(scene, new THREE.CylinderGeometry(0.37, 0.37, 0.12, 12), 0x6fb69c, 9.6, 1.1, 0.5);
  const car = toyCar(0xffb3c1);
  car.position.set(0, 0.12, 4.2);
  car.rotation.y = Math.PI / 2;
  scene.add(car);
  const car2 = toyCar(0xffd77a);
  car2.position.set(-7.5, 0.12, 2.8);
  car2.rotation.y = -Math.PI / 2;
  car2.scale.setScalar(0.95);
  scene.add(car2);
  return { scene, car };
}

// ------------------------------------------------------------ view loop --
const views = [currentScene(), sampleScene()];
const labels = [...document.querySelectorAll(".label")];
const cameras = views.map(() => new THREE.PerspectiveCamera(36, 1, 0.1, 200));
let mode = "both"; // "both", "current", "sample"
let yaw = -0.55,
  pitch = 0.62,
  auto = true,
  drag = null;
const dist = () => (innerWidth < innerHeight ? 38 : 33);
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, yaw, pitch };
  auto = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
  pitch = Math.min(1.25, Math.max(0.25, drag.pitch + (e.clientY - drag.y) * 0.005));
});
canvas.addEventListener("pointerup", () => (drag = null));
for (const b of document.querySelectorAll("[data-mode]"))
  b.addEventListener("click", () => {
    mode = b.dataset.mode;
    for (const o of document.querySelectorAll("[data-mode]"))
      o.setAttribute("aria-pressed", String(o === b));
  });
document.querySelector("#spin").addEventListener("click", () => (auto = !auto));

function layout() {
  const w = innerWidth,
    h = innerHeight,
    portrait = h > w;
  renderer.setSize(w, h, false);
  if (mode !== "both") {
    const i = mode === "current" ? 0 : 1;
    return [[i, 0, 0, w, h]];
  }
  return portrait
    ? [
        [0, 0, h / 2, w, h / 2],
        [1, 0, 0, w, h / 2],
      ]
    : [
        [0, 0, 0, w / 2, h],
        [1, w / 2, 0, w / 2, h],
      ];
}
let last = 0;
function frame(ms) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ms - last) / 1000 || 0);
  last = ms;
  if (auto) yaw += dt * 0.18;
  const parts = layout();
  labels.forEach((l) => (l.hidden = true));
  for (const [i, x, y, w, h] of parts) {
    const cam = cameras[i];
    cam.aspect = w / h;
    const d = dist() * (w / h < 0.9 ? 1.25 : 1);
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    cam.lookAt(0, 1.2, 1.5);
    cam.updateProjectionMatrix();
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.render(views[i].scene, cam);
    const label = labels[i];
    label.hidden = false;
    Object.assign(label.style, {
      left: `${x + 12}px`,
      top: `${innerHeight - y - h + 12}px`,
    });
  }
}
requestAnimationFrame(frame);
