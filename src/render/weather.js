// Weather (test build): the same city, materials, light and effects
// changed; no gameplay change (car handling stays as it is for now).
//   clear   the day or night look as before
//   snow    snow on every upward surface (roofs, pavements, parks, the
//           facilities, car tops), thin slush on the roads, falling flakes,
//           continuous tyre tracks behind the player, snow powder kicked up
//           behind moving cars; a bright, cool, hazy light
//   rain    an overcast sky and dimmer light, closer haze, rain streaks,
//           wet darker ground with lower roughness and puddle patches that
//           pick up the sky (the existing prefiltered sky map: no real-time
//           reflections), spray behind moving cars
// Mobile: one shader add-on (a few lines, uniform-driven) on the existing
// lit materials, patched once on first use; flakes and streaks move in
// the vertex shader (one draw call each, fewer on phones); a small pool of
// puffs. Works in both orientations (everything follows the camera).
import * as THREE from "three";
import { bakedMaterial } from "./kit.js";
import { groundHeight } from "../game/jumps.js";

const SNOW_SKY = 0xdbe4ec, RAIN_SKY = 0x7d8993;

function softDot(size = 64, inner = 0.15) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Weather {
  constructor(renderer, { mobile = false, roadColor = 0x37363b } = {}) {
    this.r = renderer;
    this.mode = "clear";
    this.mobile = mobile;
    this.uniforms = {
      uSnow: { value: 0 },
      uRain: { value: 0 },
      uWxRoad: { value: new THREE.Color(roadColor) },
      uWxTracks: { value: null },
    };
    this.patched = new WeakSet();
    this.extra = new Set(); // other street surfaces (hill streets): wet like the ground
    this.dot = softDot();
    this.buildTracks();
    this.buildSnow();
    this.buildRain();
    this.buildPuffs();
    this.time = 0;
  }
  // ------------------------------------------------------ materials --
  patchScene() {
    // Cars keep their colours (the player's, the police, traffic): they
    // must read clearly on white ground.
    const keep = new Set();
    const grab = (root) => root?.traverse?.((o) => o.material && (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => keep.add(m)));
    grab(this.r.player);
    // Police barricades and cones stay clean (no snow on top).
    for (const m of this.r.roadEvents?.materials?.values?.() || []) keep.add(m);
    for (const m of this.r.police || []) grab(m);
    for (const m of Object.values(this.r.cityLife?.carMeshes || {})) grab(m);
    // (The shared baked material is also every facility block's ground and
    // decor: those must get snow, so it is not kept out.)
    keep.delete(bakedMaterial);
    this.r.scene.traverse((o) => {
      if (!o.material || o.userData.xray || o.isPoints || o.isLine || o.isSprite) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!keep.has(m)) this.patch(m);
    });
  }
  patch(m) {
    if (!m || this.patched.has(m) || (m.transparent && !m.userData.wxFade) || m.userData.noWeather || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
    this.patched.add(m);
    const U = this.uniforms, prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (shader, r) => {
      prev?.call(m, shader, r);
      Object.assign(shader.uniforms, U);
      // (The elevated deck: snowed over like the streets below look.)
      if (m.userData.wxNoSlush) shader.fragmentShader = "#define WX_NO_SLUSH\n" + shader.fragmentShader;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWxWorld;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          {
            vec4 wxp = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
              wxp = batchingMatrix * wxp;
            #endif
            #ifdef USE_INSTANCING
              wxp = instanceMatrix * wxp;
            #endif
            vWxWorld = (modelMatrix * wxp).xyz;
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vWxWorld;
          uniform float uSnow;
          uniform float uRain;
          uniform vec3 uWxRoad;
          uniform sampler2D uWxTracks;
          float wxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float wxNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(wxHash(i), wxHash(i + vec2(1.0, 0.0)), f.x), mix(wxHash(i + vec2(0.0, 1.0)), wxHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          if (uSnow + uRain > 0.001) {
            vec3 wxN = inverseTransformDirection(normal, viewMatrix);
            float up = smoothstep(0.45, 0.85, wxN.y);
            float n = wxNoise(vWxWorld.xz * 0.35) * 0.6 + wxNoise(vWxWorld.xz * 1.7) * 0.4;
            float road = 0.0;
            #if defined(USE_COLOR) && !defined(WX_NO_SLUSH)
              road = 1.0 - smoothstep(0.015, 0.05, distance(vColor.rgb, uWxRoad));
            #endif
            // Snow: thick on roofs, pavements and grass, thin slush on the
            // roads (worn into darker ruts), a light frost on the walls.
            float cover = uSnow * up * mix(0.72, 1.0, n) * (1.0 - road * mix(0.72, 0.5, n));
            // Tyre tracks: where cars have driven, the surface shows through.
            // (Two layers by height: the streets (red) and, above 3.2 m,
            // the elevated road's deck and the tall hill's top (green), so
            // tracks on the deck do not show on the street under it.)
            vec4 wxT = texture2D(uWxTracks, (vWxWorld.xz + 120.0) / 240.0);
            cover *= 1.0 - 0.92 * min(1.0, vWxWorld.y > 3.2 ? wxT.g : wxT.r);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), clamp(cover, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), uSnow * 0.1 * (1.0 - up));
            // Rain: wet, darker upward surfaces, darker still in puddles.
            float puddle = smoothstep(0.62, 0.78, n) * (0.4 + 0.6 * road);
            float wet = uRain * up;
            diffuseColor.rgb *= 1.0 - wet * (0.28 + 0.3 * puddle);
            #ifdef STANDARD
              roughnessFactor = mix(roughnessFactor, mix(0.32, 0.06, puddle), wet);
              roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor + 0.1), uSnow * up);
            #endif
          }`,
        );
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : "") + (m.userData.wxNoSlush ? "|wxns" : "|wx");
    m.needsUpdate = true;
  }
  // Wet ground picks up the sky (prefiltered map, no real-time
  // reflection): only the ground and the buildings, only in the rain.
  setWet(on) {
    const env = this.r.gfx?.env;
    for (const m of [this.r.world?.material, this.r.world?.buildingMaterial, ...this.extra]) {
      if (!m || !env) continue;
      const want = on ? env : null;
      if (m.envMap !== want) {
        m.envMap = want;
        m.envMapIntensity = on ? 0.55 : 1;
        m.needsUpdate = true;
      }
    }
  }
  // A street surface drawn on its own (hill streets): the same weather.
  addSurface(m) {
    this.extra.add(m);
    this.patch(m);
    if (this.mode === "rain") this.setWet(true);
  }
  // ---------------------------------------------------- snow tracks --
  // A map of where cars have driven (the whole city, 240 m square): each
  // car's rear tyres draw lines in it; the snow thins out along them, so
  // the asphalt, the court, the plaza... shows in the tracks. Uploaded a
  // few times a second, only in the snow.
  buildTracks() {
    const n = this.mobile ? 768 : 1024;
    const c = document.createElement("canvas");
    c.width = c.height = n;
    this.trackCtx = c.getContext("2d");
    this.trackCtx.fillStyle = "#000";
    this.trackCtx.fillRect(0, 0, n, n);
    this.trackN = n;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    // (Canvas row = world z, as the shader reads it: not flipped.)
    t.flipY = false;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    this.trackTex = t;
    this.uniforms.uWxTracks.value = t;
    this.trackLast = new Map();
    this.trackClock = 0;
  }
  clearTracks() {
    this.trackCtx.globalCompositeOperation = "source-over";
    this.trackCtx.fillStyle = "#000";
    this.trackCtx.fillRect(0, 0, this.trackN, this.trackN);
    this.trackTex.needsUpdate = true;
    this.trackLast = new Map();
  }
  paintTracks(sim, center, dt) {
    if (sim.runNumber !== this.trackRun || sim.layout !== this.trackLayout) {
      this.trackRun = sim.runNumber;
      this.trackLayout = sim.layout;
      this.clearTracks();
    }
    const k = this.trackN / 240, g = this.trackCtx;
    // Added up (each layer in its own channel; a lane driven again and
    // again wears deeper); butt ends, so the joins do not double up.
    g.globalCompositeOperation = "lighter";
    g.lineCap = "butt";
    const w = Math.max(1.2, 0.34 * k);
    const cars = [sim.player, ...sim.police.filter((c) => c.state === "active"), ...(sim.target?.state === "fleeing" ? [sim.target] : [])];
    for (const t of sim.city?.traffic || []) if (!t.parked && t.state !== "wreck" && Math.abs(t.x - center.x) < 70 && Math.abs(t.z - center.z) < 70) cars.push(t);
    let drew = false;
    for (const c of cars) {
      if (c.air || c.falling) {
        this.trackLast.delete(c);
        continue;
      }
      // High up (the deck, the upper part of its ramps, the top of the
      // tall hill): the upper layer, as the shader picks it by height.
      const cy = c.level > 0 ? c.y || 0 : groundHeight(sim.layout?.mounds || [], c.x, c.z);
      const deck = cy > 3.2;
      const fx = -Math.sin(c.angle), fz = -Math.cos(c.angle), rx = Math.cos(c.angle), rz = -Math.sin(c.angle);
      const pts = [-1, 1].map((s) => [c.x - fx * 1.1 + rx * s * 0.7, c.z - fz * 1.1 + rz * s * 0.7]);
      const last = this.trackLast.get(c);
      if (last) {
        const d = Math.hypot(pts[0][0] - last.pts[0][0], pts[0][1] - last.pts[0][1]);
        if (d < 0.25) continue;
        if (d < 4 && last.deck === deck) {
          // Faint driving straight; the full, deep track in a turn or a
          // slide (how fast it turns per metre, how much it slides sideways).
          let da = c.angle - last.angle;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          const slide = Math.abs((c.vx || 0) * rx + (c.vz || 0) * rz);
          const turn = Math.min(1, Math.max(0, (Math.abs(da) / d - 0.025) / 0.09, (slide - 1.5) / 4));
          const a = 0.46 + 0.42 * turn;
          g.strokeStyle = deck ? `rgba(0,255,0,${a})` : `rgba(255,0,0,${a})`;
          g.lineWidth = w * (0.9 + 0.15 * turn);
          g.beginPath();
          for (let i = 0; i < 2; i++) {
            g.moveTo((last.pts[i][0] + 120) * k, (last.pts[i][1] + 120) * k);
            g.lineTo((pts[i][0] + 120) * k, (pts[i][1] + 120) * k);
          }
          g.stroke();
          drew = true;
        }
      }
      this.trackLast.set(c, { pts, angle: c.angle, deck });
    }
    this.trackClock += dt;
    if (drew && this.trackClock > (this.mobile ? 0.25 : 0.15)) {
      this.trackClock = 0;
      this.trackTex.needsUpdate = true;
    }
  }
  // ----------------------------------------------------- particles --
  volumeMaterial(vertex, fragment, extra = {}) {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(70, 34, 70) }, uMap: { value: this.dot }, uScale: { value: 300 }, ...extra },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
    });
  }
  buildSnow() {
    const n = this.mobile ? 320 : 500;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([Math.random() * 70, Math.random() * 34, Math.random() * 70], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    const m = this.volumeMaterial(
      `attribute float seed;
      uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform float uScale;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * (1.4 + seed * 0.9), uBox.y);
        p.x += sin(uTime * 0.7 + seed * 40.0) * 0.9;
        p.z += cos(uTime * 0.5 + seed * 31.0) * 0.7;
        vec3 w = vec3(uCenter.x + mod(p.x - uCenter.x + uBox.x * 0.5, uBox.x) - uBox.x * 0.5, p.y + uCenter.y, uCenter.z + mod(p.z - uCenter.z + uBox.z * 0.5, uBox.z) - uBox.z * 0.5);
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        // (Big enough to read from the chase camera, like the rain.)
        gl_PointSize = clamp((0.3 + seed * 0.3) * uScale / -mv.z, 1.8, 9.0);
      }`,
      `uniform sampler2D uMap;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(1.0, 1.0, 1.0, t.a * 0.8);
      }`,
    );
    this.snow = new THREE.Points(g, m);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.snow.renderOrder = 5;
    this.r.scene.add(this.snow);
  }
  buildRain() {
    const n = this.mobile ? 700 : 1300;
    const pos = new Float32Array(n * 6), seed = new Float32Array(n * 2), end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 70, y = Math.random() * 34, z = Math.random() * 70, s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      seed.set([s, s], i * 2);
      end.set([0, 1], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("end", new THREE.BufferAttribute(end, 1));
    const m = this.volumeMaterial(
      `attribute float seed; attribute float end;
      uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox;
      varying float vEnd;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * (20.0 + seed * 6.0), uBox.y);
        vec3 w = vec3(uCenter.x + mod(p.x - uCenter.x + uBox.x * 0.5, uBox.x) - uBox.x * 0.5, p.y + uCenter.y, uCenter.z + mod(p.z - uCenter.z + uBox.z * 0.5, uBox.z) - uBox.z * 0.5);
        // A streak: the lower end trails down and a little sideways.
        w += end * vec3(0.12, -1.1, 0.06);
        vEnd = end;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
      }`,
      `varying float vEnd;
      void main() { gl_FragColor = vec4(0.82, 0.88, 0.95, 0.42 * (1.0 - vEnd * 0.6)); }`,
    );
    this.rain = new THREE.LineSegments(g, m);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 5;
    this.r.scene.add(this.rain);
  }
  buildPuffs() {
    this.puffs = [];
    for (let i = 0; i < (this.mobile ? 28 : 44); i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.r.scene.add(s);
      this.puffs.push({ s, age: 99, life: 0.7, vx: 0, vy: 0, vz: 0, size: 1 });
    }
    this.puffIndex = 0;
    this.puffClock = 0;
  }
  puff(x, y, z, vx, vz, kind) {
    const p = this.puffs[this.puffIndex++ % this.puffs.length];
    Object.assign(p, { age: 0, life: kind === "snow" ? 0.75 : 0.55, vx: vx + (Math.random() - 0.5) * 1.2, vy: kind === "snow" ? 1.0 : 0.6, vz: vz + (Math.random() - 0.5) * 1.2, size: kind === "snow" ? 0.7 : 0.9, kind });
    p.s.position.set(x, y, z);
    p.s.material.color.set(kind === "snow" ? 0xffffff : 0xd6dee6);
    p.s.visible = true;
  }
  // ------------------------------------------------------------ mode --
  set(mode) {
    this.mode = mode === "snow" || mode === "rain" ? mode : "clear";
    if (this.mode !== "clear" && !this.patchedOnce) {
      this.patchedOnce = true;
      this.patchScene();
    } else if (this.mode !== "clear") this.patchScene(); // (models built since)
    this.uniforms.uSnow.value = this.mode === "snow" ? 1 : 0;
    this.uniforms.uRain.value = this.mode === "rain" ? 1 : 0;
    this.snow.visible = this.mode === "snow";
    this.rain.visible = this.mode === "rain";
    this.setWet(this.mode === "rain");
    if (this.mode === "clear") for (const p of this.puffs) p.s.visible = false;
  }
  // The light and sky for the weather (after the day look is applied).
  applyLook(scene) {
    const fog = scene.scene.fog;
    this.fog0 ||= { near: fog.near, far: fog.far };
    fog.near = this.fog0.near;
    fog.far = this.fog0.far;
    if (this.mode === "clear" || scene.tod === "night") return;
    const sky = new THREE.Color(this.mode === "snow" ? SNOW_SKY : RAIN_SKY);
    scene.renderer.setClearColor(sky);
    fog.color.copy(sky);
    if (this.mode === "snow") {
      fog.near = this.fog0.near * 0.7;
      fog.far = this.fog0.far * 0.8;
      scene.hemi.color.set(0xeaf1ff);
      scene.hemi.groundColor.set(0xc2ccd6);
      scene.hemi.intensity *= 1.1;
      scene.sun.color.set(0xf2f6ff);
      scene.sun.intensity *= 0.8;
    } else {
      fog.near = this.fog0.near * 0.45;
      fog.far = this.fog0.far * 0.7;
      scene.hemi.color.set(0x9ba7b2);
      scene.hemi.groundColor.set(0x474c52);
      scene.hemi.intensity *= 0.85;
      scene.sun.color.set(0xc6d0d9);
      scene.sun.intensity *= 0.4;
      scene.renderer.toneMappingExposure *= 0.95;
    }
  }
  update(sim, dt, center) {
    if (this.mode === "clear") return;
    // The street props (trees, benches...) are built with each new city,
    // after the weather came on: snow on them too.
    const city = this.r.cityLife?.city;
    if (city && city !== this.patchedCity) {
      this.patchedCity = city;
      this.patchScene();
    }
    this.time += dt;
    if (this.mode === "snow" && dt > 0) this.paintTracks(sim, center, dt);
    for (const m of [this.snow.material, this.rain.material]) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uCenter.value.set(center.x, (center.y || 0) - 2, center.z);
      m.uniforms.uScale.value = 900 * Math.min(2, (this.r.renderer.getPixelRatio() * innerHeight) / 800);
    }
    // Powder / spray behind moving cars near the camera.
    this.puffClock += dt;
    if (this.puffClock > 0.045 && dt > 0) {
      this.puffClock = 0;
      const cars = [sim.player, ...sim.police.filter((c) => c.state === "active" && Math.hypot(c.x - center.x, c.z - center.z) < 40)];
      for (const c of cars.slice(0, 4)) {
        const sp = Math.hypot(c.vx || 0, c.vz || 0);
        if (sp < 6 || c.air) continue;
        const fx = -Math.sin(c.angle), fz = -Math.cos(c.angle), rx = Math.cos(c.angle), rz = -Math.sin(c.angle);
        const side = Math.random() < 0.5 ? -1 : 1;
        this.puff(c.x - fx * 1.3 + rx * side * 0.7, (c.y || 0) + 0.3, c.z - fz * 1.3 + rz * side * 0.7, -fx * sp * 0.15, -fz * sp * 0.15, this.mode);
      }
    }
    for (const p of this.puffs) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const k = p.age / p.life;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.size * (1 + k * 1.8));
      p.s.material.opacity = (1 - k) * (p.kind === "snow" ? 0.75 : 0.45);
      if (p.age >= p.life) p.s.visible = false;
    }
  }
}
