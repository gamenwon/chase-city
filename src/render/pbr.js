// Material test pass (evaluation): the same models, camera, lights and
// day/night look, with surface materials instead of flat colours, on a
// few chosen things only:
//   road       asphalt (grain, worn patches, cracks): detail + normal map,
//              rough
//   sidewalk   paving blocks with joints: detail + normal map
//   building   one type: the brick walls of the city blocks (running
//              bond, recessed mortar): detail + normal map
//   vehicle    the five player cars, split into paint (clear coat),
//              metal, glass, rubber and plastic, with a shared sky
//              reflection map and baked-in shading toward the sills
//   contact    a soft dark contact shadow under the cars
// The ground and the buildings keep their single merged meshes: a shader
// patch on their existing materials picks the surface by vertex colour and
// face direction, maps it in world space and can be switched on and off
// live (uniform uPbr), so before/after shots come from the same frame.
// Mobile: textures are generated once (512 px), no extra draw calls on the
// ground or buildings, one reflection map for the whole scene.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { asphaltTextures, pavingTextures, brickTextures } from "./textures.js";
import { K } from "./kit.js";
import { buildRaw, PLAYER_MODELS } from "./cartoon.js";

export class MaterialPass {
  constructor(renderer, scene, theme) {
    this.renderer = renderer;
    this.scene = scene;
    this.on = false;
    this.night = false;
    const pm = new THREE.PMREMGenerator(renderer);
    this.env = pm.fromScene(skyEnvironment(), 0.02).texture;
    pm.dispose();
    const as = asphaltTextures(), pv = pavingTextures(), br = brickTextures();
    this.uniforms = {
      uPbr: { value: 0 },
      uAsD: { value: as.detail }, uAsN: { value: as.normal },
      uPvD: { value: pv.detail }, uPvN: { value: pv.normal },
      uBrD: { value: br.detail }, uBrN: { value: br.normal },
      uRoad: { value: new THREE.Color(theme.road) },
      uWalk: { value: new THREE.Color(K.walk) },
      uBrick: { value: new THREE.Color(K.brick) },
      uNormalScale: { value: 0.85 },
    };
    this.patched = new WeakSet();
    this.shadows = new ContactShadows(scene);
    this.vehicleMats = vehicleMaterials(this.env);
  }
  // Ground (roads, sidewalks) and buildings: patch their materials once.
  patch(material) {
    if (!material || this.patched.has(material)) return;
    this.patched.add(material);
    const U = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vPbrWorld;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
  vec4 pbrWP = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    pbrWP = batchingMatrix * pbrWP;
  #endif
  #ifdef USE_INSTANCING
    pbrWP = instanceMatrix * pbrWP;
  #endif
  vPbrWorld = (modelMatrix * pbrWP).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vPbrWorld;
uniform float uPbr, uNormalScale;
uniform sampler2D uAsD, uAsN, uPvD, uPvN, uBrD, uBrN;
uniform vec3 uRoad, uWalk, uBrick;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
  float pbrKind = 0.0;
  vec3 pbrNM = vec3(0.0, 0.0, 1.0);
  vec3 pbrWN = inverseTransformDirection(normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))), viewMatrix);
  #ifdef USE_COLOR
  if (uPbr > 0.5) {
    vec3 vc = vColor.rgb;
    if (pbrWN.y > 0.6 && distance(vc, uRoad) < 0.02) {
      vec2 uv = vPbrWorld.xz / 8.0;
      diffuseColor.rgb *= texture2D(uAsD, uv).r * 2.0;
      pbrNM = texture2D(uAsN, uv).xyz * 2.0 - 1.0;
      pbrKind = 1.0;
    } else if (pbrWN.y > 0.6 && distance(vc, uWalk) < 0.02) {
      vec2 uv = vPbrWorld.xz / 2.0;
      diffuseColor.rgb *= texture2D(uPvD, uv).r * 2.0;
      pbrNM = texture2D(uPvN, uv).xyz * 2.0 - 1.0;
      pbrKind = 2.0;
    } else if (abs(pbrWN.y) < 0.35 && distance(vc, uBrick) < 0.03) {
      float h = abs(pbrWN.x) > abs(pbrWN.z) ? vPbrWorld.z : vPbrWorld.x;
      vec2 uv = vec2(h / 2.0, vPbrWorld.y / 1.0);
      diffuseColor.rgb *= texture2D(uBrD, uv).r * 2.0;
      pbrNM = texture2D(uBrN, uv).xyz * 2.0 - 1.0;
      pbrKind = 3.0;
    }
  }
  #endif`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
  if (pbrKind > 0.5) roughnessFactor = pbrKind < 1.5 ? 0.93 : pbrKind < 2.5 ? 0.82 : 0.9;`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
  if (pbrKind > 0.5) {
    vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0), N = vec3(0.0, 1.0, 0.0);
    if (pbrKind > 2.5) {
      N = normalize(vec3(pbrWN.x, 0.0, pbrWN.z));
      T = abs(pbrWN.x) > abs(pbrWN.z) ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      B = vec3(0.0, 1.0, 0.0);
    }
    vec3 wn = normalize(T * pbrNM.x * uNormalScale + B * pbrNM.y * uNormalScale + N * max(0.2, pbrNM.z));
    normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  }`,
        );
    };
    material.needsUpdate = true;
  }
  set(on) {
    this.on = on;
    this.uniforms.uPbr.value = on ? 1 : 0;
    this.shadows.group.visible = on;
  }
  setNight(night) {
    this.night = night;
    for (const m of Object.values(this.vehicleMats)) if (m.envMapIntensity != null) m.envMapIntensity = (night ? 0.35 : 1) * (m.userData.env ?? 1);
  }
  // A player car with surface materials (null if the id is unknown).
  vehicle(id) {
    const make = PLAYER_MODELS[id];
    return make ? materialize(buildRaw(make), this.vehicleMats) : null;
  }
  update(sim) {
    if (this.on) this.shadows.update(sim);
  }
}

// ------------------------------------------------------------- vehicles
// The reflection map: a sky dome (bright zenith, pale warm horizon, a
// darker street below) and one soft sun patch, prefiltered once (PMREM).
function skyEnvironment() {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const top = new THREE.Color(0x8fc4ff), hor = new THREE.Color(0xfff4e2), low = new THREE.Color(0x4a4a50), floor = new THREE.Color(0x26262b);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 10;
    if (h >= 0) c.copy(hor).lerp(top, Math.pow(h, 0.6));
    else c.copy(low).lerp(floor, Math.min(1, -h * 2.5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(6) }));
  sun.position.set(-4, 7, 4);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  return scene;
}
const CLASS = new Map([
  [0x2a74c8, "glass"], [0x9fd6ff, "glass"],
  [0x1d1c21, "rubber"], [0x141317, "rubber"],
  [0x2b2a30, "plastic"], [0x1f1e24, "plastic"],
  [0x9aa0a8, "metal"], [0x55535c, "metal"], [0xb9bdc4, "metal"], [0x8c9198, "metal"], [0x6a6e76, "metal"],
]);
function vehicleMaterials(env) {
  const mk = (M, o, envScale = 1) => {
    const m = new M({ vertexColors: true, flatShading: true, envMap: env, ...o });
    m.userData.env = envScale;
    m.envMapIntensity = envScale;
    return m;
  };
  return {
    // Paint: a satin base under a glossy clear coat. The sky map makes the
    // roof and hood pick up a bright sky and the sides a darker street, so
    // the shape reads without washing the colour out.
    paint: mk(THREE.MeshPhysicalMaterial, { roughness: 0.55, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.1 }, 0.38),
    metal: mk(THREE.MeshStandardMaterial, { roughness: 0.38, metalness: 0.65 }, 0.9),
    glass: mk(THREE.MeshPhysicalMaterial, { roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 }, 0.6),
    rubber: mk(THREE.MeshStandardMaterial, { roughness: 0.95, metalness: 0 }, 0.15),
    plastic: mk(THREE.MeshStandardMaterial, { roughness: 0.62, metalness: 0 }, 0.4),
  };
}
// Merge an unbaked model's parts by surface class (one mesh per class,
// per wheel too), keeping lamps (emissive) and decals as they are.
function materialize(outer, mats) {
  const inner = outer.children[0];
  inner.updateMatrixWorld(true);
  const wheels = new Set(inner.userData.wheels || []);
  // Height range of the body in the inner model's frame (for the baked
  // occlusion): from the lowest body part up about a metre.
  let yLow = Infinity;
  inner.traverse((o) => {
    if (!o.isMesh) return;
    for (let q = o.parent; q && q !== inner; q = q.parent) if (wheels.has(q)) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inner.matrixWorld.clone().invert(), o.matrixWorld));
    yLow = Math.min(yLow, b.min.y);
  });
  const ySpan = 0.9;
  const merge = (root, isWheel) => {
    const inv = root.matrixWorld.clone().invert();
    const by = new Map();
    const remove = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!isWheel) for (let q = o.parent; q && q !== root; q = q.parent) if (wheels.has(q)) return;
      if (o.material.map || (o.material.emissive && o.material.emissive.getHex() !== 0)) return; // decals, lamps
      const hex = o.material.color.getHex();
      const cls = CLASS.get(hex) || "paint";
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const c = o.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
      // Baked occlusion: the body darkens toward the sills and the
      // underside (not the wheels, not the glass), so the car sits on the
      // road instead of glowing evenly.
      const pos = g.attributes.position;
      for (let i = 0; i < n; i++) {
        const y = pos.getY(i);
        const k = isWheel || cls === "glass" ? 1 : 0.6 + 0.4 * Math.min(1, Math.max(0, (y - yLow) / ySpan));
        col.set([c.r * k, c.g * k, c.b * k], i * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      (by.get(cls) || by.set(cls, []).get(cls)).push(g);
      remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    for (const [cls, list] of by) {
      const m = new THREE.Mesh(mergeGeometries(list), mats[cls]);
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
  };
  merge(inner, false);
  for (const w of wheels) merge(w, true);
  outer.userData.pbr = true;
  return outer;
}

// ------------------------------------------------------ contact shadows
// A soft dark ellipse on the ground under each car (radial gradient,
// instanced, one draw call): grounds the car, fades as it leaves the
// ground (jumps).
class ContactShadows {
  constructor(scene) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, "rgba(0,0,0,0.85)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, 64);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.visible = false;
    scene.add(this.group);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  update(sim) {
    let n = 0;
    const put = (b, w, l) => {
      if (n >= 64 || !b) return;
      const y = b.y || 0;
      const ground = b.level === 1 ? y : 0;
      const lift = Math.max(0, y - ground);
      const k = Math.max(0, 1 - lift / 4);
      if (k <= 0.02) return;
      this.q.setFromAxisAngle(this.up, b.angle || 0);
      this.m.compose(this.v.set(b.x, ground + 0.12, b.z), this.q, this.s.set(w * (1 + lift * 0.1), 1, l * (1 + lift * 0.1)));
      this.mesh.setMatrixAt(n++, this.m);
    };
    const p = sim.player;
    put(p, 2.4, 3.6);
    for (const c of sim.police) if (c.state === "active") put(c, 2.4, 3.6);
    if (sim.target && sim.target.state !== "wrecked") put(sim.target, 2.4, 3.6);
    for (const t of sim.city?.traffic || []) if (Math.abs(t.x - p.x) < 70 && Math.abs(t.z - p.z) < 70) put(t, 2.4, 3.8);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
