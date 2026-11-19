import { spawnView, inspectSpawn } from "../game/spawning.js";
import { WreckRenderer, wreckPose } from "./wrecks.js";
import * as THREE from "three";
import { RoadEventsRenderer } from "./road-events.js";
import { ChaseCamera } from "./camera.js";
import { VehicleTrails } from "./trails.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CONFIG } from "../game/config.js";
import { BuildingOcclusion } from "./occlusion.js";
import { ExplosionEffects } from "./explosions.js";
import { BonnetCamera } from "./pip.js";
import { OfficerRenderer } from "./officers.js";
import { CityLifeRenderer } from "./city.js";
import { NightLights, NIGHT } from "./night.js";
import { WaterJets } from "./water.js";
import { TargetRenderer } from "./target.js";
import { PickupRenderer } from "./pickups.js";
import { MAPS, DEFAULT_MAP } from "../world/maps.js";
import { K, buildingGroup, coloredGeometry, playerCar, policeCar, parkBench, bakeStatic } from "./kit.js";
const palette = [0xf34b32, 0xffbf22, 0x087cba, 0x13a783, 0xf38617, 0x2364ce];
export class CityRenderer {
  constructor(canvas, layout, options = {}) {
    // V1.9: phones get a lighter start (resolution, shadow map).
    const mobile = !!options.mobile;
    // V2.0: colours come from the map (downtown: the same colours as before).
    const theme = options.theme || MAPS[DEFAULT_MAP].theme;
    this.theme = theme;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(theme.sky);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(theme.sky, theme.fogNear, theme.fogFar);
    this.cameraRig = new ChaseCamera(innerWidth, innerHeight);
    this.camera = this.cameraRig.camera;
    // Clear, warm sun with readable shadows; neutral fill.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5f5a58, 1.35);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff2e0, 3.3);
    sun.position.set(-45, 90, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, {
      left: -90,
      right: 90,
      top: 90,
      bottom: -90,
      far: 220,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.sun = sun;
    this.materials = new Map();
    this.box(0, -0.7, 0, 225, 1, 225, theme.grass);
    this.box(0, -0.12, 0, 216, 0.3, 216, theme.pavement);
    for (let n = -90; n <= 90; n += 30) {
      this.box(n, 0.06, 0, 11, 0.08, 216, theme.road);
      this.box(0, 0.07, n, 216, 0.08, 11, theme.road);
      // Double yellow centre line on each stretch between junctions.
      for (let m = -105; m < 105; m += 30)
        for (const s of [-0.16, 0.16]) {
          this.box(n + s, 0.13, m + 15, 0.12, 0.025, 16, theme.marking);
          this.box(m + 15, 0.14, n + s, 16, 0.025, 0.12, theme.marking);
        }
      for (let m = -90; m <= 90; m += 30) {
        for (let side of [-1, 1])
          for (let t = -3; t <= 3; t += 1.2) {
            this.box(n + t, 0.15, m + side * 7, 0.65, 0.03, 2.5, K.lineWhite);
            this.box(n + side * 7, 0.15, m + t, 2.5, 0.03, 0.65, K.lineWhite);
          }
      }
    }
    for (let x = -75; x <= 105; x += 30)
      for (let z = -75; z <= 105; z += 30)
        if (x < 100 && z < 100) {
          // Pavement block: kerb ring, slabs with joints.
          this.box(x, 0.15, z, 19, 0.4, 19, K.curb);
          this.box(x, 0.16, z, 18.4, 0.4, 18.4, K.walk);
          for (let o = -7.5; o <= 7.5; o += 1.5) {
            this.box(x + o, 0.365, z, 0.05, 0.01, 18.4, K.walkJoint);
            this.box(x, 0.366, z + o, 18.4, 0.01, 0.05, K.walkJoint);
          }
        }
    for (const p of layout.parks) {
      // Lawn with mowing stripes, edged paved paths crossing at a small
      // square. Everything here is flat: cars can drive across a park.
      this.box(p.x, 0.39, p.z, 18, 0.2, 18, K.grass);
      for (let i = -2; i <= 2; i++) this.box(p.x, 0.495, p.z + i * 3.6, 18, 0.01, 1.8, K.grassStripe);
      this.box(p.x, 0.51, p.z, 2.4, 0.04, 18, K.pave);
      this.box(p.x, 0.515, p.z, 18, 0.04, 2.4, K.pave);
      for (const s of [-1, 1]) {
        this.box(p.x + s * 1.29, 0.51, p.z - 5.25, 0.18, 0.06, 7.5, K.paveEdge);
        this.box(p.x + s * 1.29, 0.51, p.z + 5.25, 0.18, 0.06, 7.5, K.paveEdge);
        this.box(p.x - 5.25, 0.51, p.z + s * 1.29, 7.5, 0.06, 0.18, K.paveEdge);
        this.box(p.x + 5.25, 0.51, p.z + s * 1.29, 7.5, 0.06, 0.18, K.paveEdge);
      }
      this.box(p.x, 0.52, p.z, 3.0, 0.045, 3.0, 0xb8ab92);
      // V1.9: the park trees are big (solid) city props, drawn by
      // CityLifeRenderer. The bench is the park's fixed obstacle (3 x 0.8).
      const bench = parkBench(this.scene, p.x + 4, p.z - 0.15, 0, 3.0);
      bench.position.y = 0.49;
      bakeStatic(bench);
    }
    this.buildings = [];
    const occlusionRay = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3(),
      rayTarget = new THREE.Vector3(),
      rayDirection = new THREE.Vector3();
    for (const b of layout.buildings) {
      // Street-facing sides (away from the block centre) get shopfronts.
      const cx = Math.round((b.x - 15) / 30) * 30 + 15,
        cz = Math.round((b.z - 15) / 30) * 30 + 15;
      const seed = Math.abs(Math.round(b.x * 7 + b.z * 13 + b.h * 3));
      const group = buildingGroup(b, seed, [Math.sign(b.x - cx), Math.sign(b.z - cz)]);
      const geometry = coloredGeometry(group, { dropDown: true, flush: b });
      geometry.translate(b.x, 0, b.z);
      const geometries = [geometry];
      const mesh = new THREE.Mesh(
        mergeGeometries(geometries),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true }),
      );
      geometries.forEach((g) => g.dispose());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.building = true;
      mesh.userData.components = [
        "body",
        "roof",
        "rooftop",
        "windows",
        "door",
        "sign",
        "balconies",
        "bands",
      ];
      mesh.geometry.computeBoundingBox();
      this.scene.add(mesh);
      mesh.updateMatrixWorld(true);
      this.buildings.push({
        mesh,
        bounds: b,
        visualBounds: mesh.geometry.boundingBox,
        opacity: 1,
        occluded: false,
        intersects(camera, target) {
          rayOrigin.set(camera.x, camera.y, camera.z);
          rayTarget.set(target.x, target.y, target.z);
          rayDirection.subVectors(rayTarget, rayOrigin);
          const distance = rayDirection.length();
          occlusionRay.set(rayOrigin, rayDirection.normalize());
          occlusionRay.far = Math.max(0, distance - 0.05);
          return occlusionRay.intersectObject(mesh, false).length > 0;
        },
      });
    }
    // V1.9: street trees, lamps, signs and bins are interactive city props
    // (src/game/city.js), drawn by CityLifeRenderer.
    this.batchStatic();
    // Approved art kit: magenta muscle car, black-and-white interceptors.
    this.player = playerCar();
    this.scene.add(this.player);
    this.police = Array.from({ length: CONFIG.policeCount }, () =>
      this.addPoliceCar(),
    );
    this.occlusion = new BuildingOcclusion(this.buildings);
    // Day / night (night.js): the day look is the scene as built.
    this.night = new NightLights(this.scene, layout);
    this.dayLook = {
      sky: new THREE.Color(theme.sky),
      hemiSky: this.hemi.color.clone(),
      hemiGround: this.hemi.groundColor.clone(),
      hemi: this.hemi.intensity,
      sun: this.sun.color.clone(),
      sunIntensity: this.sun.intensity,
      exposure: this.renderer.toneMappingExposure,
    };
    this.tod = "day";
    this.nightFlash = 0;
    // Every explosion that goes off near the player shakes the camera; the
    // links of a chain reaction each add their own kick.
    // Bigger blasts (a fuel island, a major one) hit harder and further.
    this.effects = new ExplosionEffects(this.scene, (event, scale = 1) => {
      const distance = Math.hypot(
        event.x - this.cameraRig.follow.x,
        event.z - this.cameraRig.follow.z,
      );
      const kick =
        Math.max(0, 1 - distance / (50 * Math.sqrt(scale))) *
        (0.45 + 0.15 * Math.min(event.chainDepth || 0, 2)) *
        Math.min(1.8, Math.pow(scale, 0.7));
      if (kick > 0) this.cameraRig.kick(kick);
      // At night a blast lights up the street for a moment.
      if (this.tod === "night") this.nightFlash = Math.max(this.nightFlash, Math.min(1.2, 0.35 + scale * 0.25) * Math.max(0, 1 - distance / 70));
    });
    this.trails = new VehicleTrails(this.scene);
    this.wreckRenderer = new WreckRenderer(this.scene);
    this.roadEvents = new RoadEventsRenderer(this.scene);
    this.officers = new OfficerRenderer(this.scene);
    this.cityLife = new CityLifeRenderer(this.scene);
    this.pickups = new PickupRenderer(this.scene);
    this.targetView = new TargetRenderer(this.scene);
    this.water = new WaterJets(this.scene);
    // V1.8 driver's-view PIP, drawn into the #pip frame when switched on.
    this.bonnet = new BonnetCamera();
    this.pipFrame = document.querySelector("#pip");
    this.pipEnabled = false;
    this.resetMetrics();
    this.follow = new THREE.Vector3(0, 0, 0);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  batchStatic() {
    const groups = new Map();
    for (const mesh of [...this.scene.children]) {
      if (!mesh.isMesh || mesh.userData.building) continue;
      mesh.updateMatrix();
      const key = mesh.material;
      const bucket = groups.get(key) || [];
      bucket.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
      groups.set(key, bucket);
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const [material, geometries] of groups) {
      const geometry = mergeGeometries(geometries);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
  }
  box(x, y, z, w, h, d, color, parent = this.scene) {
    let mat = this.materials.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      this.materials.set(color, mat);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = h > 0.3;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  tree(x, z) {
    this.box(x, 1, z, 0.45, 2, 0.45, 0x7f4926);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x168a37, flatShading: true }),
    );
    crown.position.set(x, 3, z);
    crown.scale.y = 1.25;
    crown.castShadow = true;
    this.scene.add(crown);
  }
  addPoliceCar() {
    const car = policeCar();
    this.scene.add(car);
    return car;
  }

  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h);
    this.cameraRig.resize(w, h);
  }
  render(sim, dt, running = sim.started && !sim.result) {
    const p = sim.player;
    this.player.position.set(p.x, 0, p.z);
    this.player.rotation.y = p.angle;
    this.player.rotation.z +=
      (-p.turn * 0.045 - this.player.rotation.z) * (1 - Math.exp(-dt * 9));
    for (const wheel of this.player.userData.wheels) {
      wheel.rotation.x = -sim.elapsed * p.speed;
      wheel.rotation.y = wheel.position.z < 0 ? p.turn * 0.15 : 0;
    }
    this.player.visible = !(
      sim.hitCooldown > 0.4 && Math.floor(sim.elapsed * 15) % 2
    );
    while (this.police.length < sim.police.length)
      this.police.push(this.addPoliceCar());
    for (let i = sim.police.length; i < this.police.length; i++)
      this.police[i].visible = false;
    sim.police.forEach((c, i) => {
      const mesh = this.police[i];
      mesh.visible = c.state === "active" || c.wreckAge < CONFIG.wreckSeconds;
      // A wreck launches, flips onto its roof and lands in the exact pose the
      // persistent wreck model uses. Staged chain-reaction cars (negative
      // wreckAge) stay put until their own explosion is shown.
      const pose =
        c.state === "wreck"
          ? wreckPose(c.wreckAge)
          : { y: 0, pitch: 0, roll: 0 };
      mesh.position.set(c.x, pose.y, c.z);
      mesh.rotation.set(
        pose.pitch,
        c.angle,
        c.state === "wreck" ? pose.roll : -c.turn * 0.04,
      );
      mesh.userData.red.visible =
        c.state === "active" && Math.floor(sim.elapsed * 8 + i) % 2 === 0;
      mesh.userData.blue.visible =
        c.state === "active" && !mesh.userData.red.visible;
      for (const wheel of mesh.userData.wheels) {
        wheel.rotation.x = -sim.elapsed * c.speed;
        wheel.rotation.y = wheel.position.z < 0 ? c.turn * 0.15 : 0;
      }
    });
    this.officers.update(sim, sim.elapsed);
    this.cityLife.update(sim.city, sim, this.camera, dt, (k) =>
      this.cameraRig.kick(k),
    );
    // Smoke that hides the player or a nearby police car turns see-through.
    this.effects.setViewers(this.camera.position, [
      p,
      ...(sim.target && sim.target.state !== "wrecked" ? [sim.target] : []),
      ...sim.police.filter(
        (c) => c.state === "active" && Math.abs(c.x - p.x) < 45 && Math.abs(c.z - p.z) < 45,
      ),
    ]);
    this.effects.update(sim.events, sim.elapsed);
    if (sim.cameraRig !== this.cameraRig || !running)
      this.cameraRig.update(p, dt);
    this.trails.update(p, dt, running);
    this.camera.updateMatrixWorld(true);
    this.player.updateMatrixWorld(true);
    this.roadEvents.update(sim, this.camera);
    this.pickups.update(sim, this.camera);
    this.targetView.update(sim, this.camera, (k) => this.cameraRig.kick(k));
    this.water.update(sim.city, sim.elapsed, this.camera);
    const spawnCameraView = spawnView(this.camera);
    for (const c of sim.police)
      if (c.spawnProof && c.state === "active") {
        const key = `${c.id}:${c.generation}`;
        if (!this.spawnFirstFrames.has(key)) {
          this.spawnFirstFrames.add(key);
          this.spawnDisplayLog.push({
            key,
            time: sim.elapsed,
            born: c.spawnedAt,
            age: sim.elapsed - c.spawnedAt,
            x: c.x,
            z: c.z,
            bodyOutside: inspectSpawn(spawnCameraView, c, c.angle, 0).outside,
            safeOutside: inspectSpawn(spawnCameraView, c, c.angle, 2).outside,
          });
        }
        if (
          !this.spawnEntryKeys.has(key) &&
          !inspectSpawn(spawnCameraView, c, c.angle, 0).outside &&
          this.cameraRig.visible(c, this.buildings)
        ) {
          this.spawnEntryKeys.add(key);
          this.spawnEntries.push({
            key,
            time: sim.elapsed,
            age: sim.elapsed - c.spawnedAt,
            x: c.x,
            z: c.z,
          });
        }
      }
    this.wreckRenderer.update(sim, this.camera);
    this.occlusion.update(this.camera.position, p, dt);
    if ((sim.timeOfDay || "day") !== this.tod) this.applyTimeOfDay(sim.timeOfDay || "day");
    if (this.tod === "night") {
      this.night.update(sim, this.buildings, this.camera, this.extraLamps);
      this.nightFlash *= Math.exp(-dt * 5);
      this.hemi.intensity = NIGHT.hemi + this.nightFlash * 1.6;
    }
    if (running) this.sampleMetrics(sim, dt);
    this.cameraRig.withShake(dt, sim.elapsed, () =>
      this.renderer.render(this.scene, this.camera),
    );
    this.lastMainCalls = this.renderer.info.render.calls;
    this.renderPip(p);
  }
  // V2.0: the on-screen arrow (escape gate, or the mission's next item).
  get guidanceView() {
    return this.roadEvents.view || this.pickups.view || this.targetView.view;
  }
  setPip(enabled) {
    this.pipEnabled = enabled;
    if (this.pipFrame) this.pipFrame.hidden = !enabled;
  }
  renderPip(player) {
    if (!this.pipEnabled) return;
    const rect = this.bonnet.frameRect(this.pipFrame, this.renderer.domElement);
    if (!rect) return;
    this.bonnet.update(player);
    this.bonnet.render(this.renderer, this.scene, this.buildings, rect);
  }
  captureFrame(width, height) {
    const target = new THREE.WebGLRenderTarget(width, height);
    const previous = this.renderer.getRenderTarget();
    const pixels = new Uint8Array(width * height * 4);
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      return pixels;
    } finally {
      this.renderer.setRenderTarget(previous);
      target.dispose();
    }
  }
  resetMetrics() {
    this.spawnFirstFrames = new Set();
    this.spawnEntryKeys = new Set();
    this.spawnDisplayLog = [];
    this.spawnEntries = [];
    this.screenMetrics = {
      sampledSeconds: 0,
      policeVisibleSeconds: 0,
      visibleExplosions: 0,
      explosions: 0,
      nearestDistanceTime: 0,
      chaseSeconds: 0,
    };
    this.metricTime = 0;
    this.lastExplosionMetric = 0;
  }
  sampleMetrics(sim, dt) {
    for (const event of sim.events)
      if (event.id > this.lastExplosionMetric) {
        this.lastExplosionMetric = event.id;
        this.screenMetrics.explosions++;
        if (this.cameraRig.visible({ ...event, y: 2 }, this.buildings))
          this.screenMetrics.visibleExplosions++;
      }
    this.metricTime += dt;
    if (this.metricTime < 0.2) return;
    const duration = this.metricTime;
    this.metricTime = 0;
    const active = sim.police.filter((c) => c.state === "active");
    const nearest = Math.min(
      220,
      ...active.map((c) => Math.hypot(c.x - sim.player.x, c.z - sim.player.z)),
    );
    this.screenMetrics.sampledSeconds += duration;
    this.screenMetrics.nearestDistanceTime += nearest * duration;
    if (nearest < 35) this.screenMetrics.chaseSeconds += duration;
    if (active.some((c) => this.cameraRig.visible(c, this.buildings)))
      this.screenMetrics.policeVisibleSeconds += duration;
  }
  // DAY: the scene as built (bright, colourful). NIGHT: dark blue sky and
  // fog, a cool moonlight that keeps every shape readable, glowing signs,
  // and the cheap night lights (night.js). Switched only between runs.
  applyTimeOfDay(tod) {
    this.tod = tod;
    const night = tod === "night", d = this.dayLook;
    const sky = night ? new THREE.Color(NIGHT.sky) : d.sky;
    this.renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);
    this.hemi.color.set(night ? NIGHT.hemiSky : d.hemiSky);
    this.hemi.groundColor.set(night ? NIGHT.hemiGround : d.hemiGround);
    this.hemi.intensity = night ? NIGHT.hemi : d.hemi;
    this.sun.color.set(night ? NIGHT.moon : d.sun);
    this.sun.intensity = night ? NIGHT.moonIntensity : d.sunIntensity;
    this.renderer.toneMappingExposure = night ? NIGHT.exposure : d.exposure;
    this.nightFlash = 0;
    this.night.setOn(night);
    // Signs and textured boards glow with their own picture at night;
    // emissive parts (police light bars, lamp heads) glow harder.
    this.scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (!m || !("emissive" in m)) continue;
        if (m.userData.dayEmissive === undefined) m.userData.dayEmissive = m.emissiveIntensity;
        if (m.map && !m.userData.sign) m.userData.sign = true;
        if (m.userData.sign) {
          m.emissiveMap = night ? m.map : null;
          m.emissive.set(night ? 0xffffff : 0x000000);
          m.emissiveIntensity = night ? 0.75 : m.userData.dayEmissive;
          m.needsUpdate = true;
        } else if (m.emissive.getHex() !== 0) m.emissiveIntensity = m.userData.dayEmissive * (night ? 1.8 : 1);
      }
    });
  }
  reset() {
    this.roadEvents.reset();
    this.wreckRenderer.reset();
    this.officers.reset();
    this.cityLife.reset();
    this.pickups.reset();
    this.targetView.reset();
    this.water.reset();
    this.cameraRig.reset();
    this.trails.reset();
    this.resetMetrics();
    this.follow.set(0, 0, 8);
    this.occlusion.reset();
    this.effects.reset();
    this.player.rotation.set(0, 0, 0);
  }
}
