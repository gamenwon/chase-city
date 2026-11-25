// Development tool: renders the vehicle-select thumbnails (and model
// review shots) from the real game models, all with the same
// three-quarter camera and studio lighting, on a transparent background.
// Used once to make public/vehicles/<id>.webp (scripts/thumbs.cjs drives
// it in a browser); the game itself only shows the finished images, so no
// 3D renderer runs per card.
import * as THREE from "three";
import { TOON_MODELS } from "../render/toon-vehicles.js";
import { playerCar } from "../render/kit.js";
import * as CARTOON from "../render/cartoon.js";
import { HelicopterRenderer } from "../render/helicopter.js";

// The player cars as the game draws them (render/scene.js PLAYER_MODELS).
export function playerModel(id) {
  const make = CARTOON.PLAYER_MODELS?.[id] || TOON_MODELS[id] || playerCar;
  return make();
}
// A model by name for review shots: a player id, a cartoon.js builder
// (policeCar, cityCar...), "heli", or "old:<id>" for the previous models.
function build(name) {
  if (name === "heli") {
    const holder = new THREE.Scene();
    const h = new HelicopterRenderer(holder);
    h.group.visible = true;
    h.shadow.visible = h.pool.visible = h.beam.visible = false;
    holder.remove(h.group);
    return h.group;
  }
  if (name.startsWith("old:")) {
    const id = name.slice(4);
    return (TOON_MODELS[id] || playerCar)();
  }
  if (typeof CARTOON[name] === "function") return CARTOON[name]();
  return playerModel(name);
}

export function renderObject(name, { width = 480, height = 300, view = "front", format = "image/webp" } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9aa8, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-6, 10, -4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 0.8);
  rim.position.set(6, 4, 6);
  scene.add(rim);
  const car = build(name);
  scene.add(car);
  // Frame it: three-quarter front (or rear) view, a little from above;
  // distance and aim fitted so the model's box fills the same share of
  // every image (the corners are projected and the view adjusted).
  const box = new THREE.Box3().setFromObject(car);
  const center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 200);
  const dir = view === "rear" ? new THREE.Vector3(0.66, 0.3, 0.7).normalize() : new THREE.Vector3(-0.66, 0.3, -0.7).normalize();
  const target = center.clone();
  let d = 12;
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of corners) {
      const q = c.clone().project(camera);
      x0 = Math.min(x0, q.x), x1 = Math.max(x1, q.x), y0 = Math.min(y0, q.y), y1 = Math.max(y1, q.y);
    }
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d, halfW = halfH * camera.aspect;
    target.addScaledVector(right, ((x0 + x1) / 2) * halfW).addScaledVector(up, ((y0 + y1) / 2) * halfH);
    d *= Math.max((x1 - x0) / 2 / 0.88, (y1 - y0) / 2 / 0.92);
  }
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL(format, 0.86);
  renderer.dispose();
  return url;
}
// The vehicle-select thumbnail of a player car.
export function renderThumb(id, width = 480, height = 300) {
  return renderObject(id, { width, height });
}
