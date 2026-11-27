// DESTROYER on screen (game/destroyer.js): the truck (cartoon.js
// destroyerTruck; the material pass's detailed build when it is on), its
// health over it once hit, charred wrecks left in the street, and the
// circular charge gauge on the ground under the player's car.
//
// Gauge: a flat ring a little wider than the car, world-aligned (it does
// not turn with the car), a dark see-through track and a bright red arc
// filling clockwise; brighter with a soft pulse near the end, a short red
// flash when full; hidden otherwise. One small mesh, one cheap shader.
import * as THREE from "three";
import { destroyerTruck } from "./cartoon.js";
import { jumpPitch } from "../game/jumps.js";

const RING_IN = 2.7, RING_OUT = 3.4;

export class DestroyerRenderer {
  constructor(scene) {
    this.scene = scene;
    this.gfx = null;
    this.car = destroyerTruck();
    this.car.visible = false;
    scene.add(this.car);
    // Charred wrecks (persistent; the newest few).
    this.charMat = new THREE.MeshStandardMaterial({ color: 0x1c1a1a, roughness: 1, flatShading: true });
    this.wrecks = [];
    // Health bar: two thin boxes over the truck, shown for a while after a hit.
    const barGeo = new THREE.PlaneGeometry(1, 1);
    this.bar = new THREE.Group();
    this.barBack = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x111114, transparent: true, opacity: 0.75, depthTest: false }));
    this.barFill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false }));
    this.barBack.scale.set(2.6, 0.32, 1);
    this.barFill.position.z = 0.01;
    this.bar.add(this.barBack, this.barFill);
    this.bar.renderOrder = 20;
    this.barBack.renderOrder = 20;
    this.barFill.renderOrder = 21;
    this.bar.visible = false;
    scene.add(this.bar);
    // The gauge.
    const ring = new THREE.RingGeometry(RING_IN, RING_OUT, 72, 1);
    this.gaugeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // (Seen through a deck or a building, as the player's own outline.)
      depthTest: false,
      uniforms: { uProgress: { value: 0 }, uPulse: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vP;
        uniform float uProgress, uPulse, uFlash;
        void main() {
          // 0 at the top (screen-away side), growing clockwise seen from above.
          float a = atan(vP.x, vP.y);
          float t = fract(a / 6.2831853 + 1.0);
          float r = length(vP);
          float edge = smoothstep(${RING_IN.toFixed(2)}, ${(RING_IN + 0.08).toFixed(2)}, r) * (1.0 - smoothstep(${(RING_OUT - 0.08).toFixed(2)}, ${RING_OUT.toFixed(2)}, r));
          vec3 red = mix(vec3(0.92, 0.08, 0.1), vec3(1.0, 0.32, 0.28), uPulse);
          vec4 c = t <= uProgress ? vec4(red, 0.95) : vec4(0.05, 0.05, 0.06, 0.42);
          c = mix(c, vec4(1.0, 0.25, 0.2, 1.0), uFlash);
          gl_FragColor = vec4(c.rgb, c.a * edge);
        }`,
    });
    this.gauge = new THREE.Mesh(ring, this.gaugeMat);
    this.gauge.rotation.x = -Math.PI / 2;
    this.gauge.renderOrder = 30;
    this.gauge.visible = false;
    scene.add(this.gauge);
    this.lastId = null;
  }
  setGfx(gfx) {
    const want = gfx?.on ? gfx : null;
    if (want === this.gfx) return;
    this.gfx = want;
    const old = this.car;
    this.car = want ? want.model(destroyerTruck) : destroyerTruck();
    this.car.visible = old.visible;
    this.car.position.copy(old.position);
    this.car.rotation.copy(old.rotation);
    this.scene.remove(old);
    this.scene.add(this.car);
  }
  reset() {
    this.car.visible = this.gauge.visible = this.bar.visible = false;
    for (const w of this.wrecks) this.scene.remove(w);
    this.wrecks = [];
    this.lastId = null;
  }
  addWreck(d) {
    const m = destroyerTruck();
    m.traverse((o) => {
      if (o.isMesh) o.material = this.charMat;
    });
    m.position.set(d.x, 0, d.z);
    m.rotation.set(0.06, d.angle + 0.4, 0.12);
    m.scale.y = 0.9;
    this.scene.add(m);
    this.wrecks.push(m);
    if (this.wrecks.length > 3) this.scene.remove(this.wrecks.shift());
  }
  update(sim, camera) {
    const d = sim.destroyer, now = sim.elapsed;
    if (!d) {
      this.car.visible = this.gauge.visible = this.bar.visible = false;
      return;
    }
    if (d.state === "wrecked") {
      if (this.car.visible) this.addWreck(d);
      this.car.visible = this.gauge.visible = this.bar.visible = false;
      return;
    }
    this.car.visible = true;
    this.car.position.set(d.x, d.y || 0, d.z);
    // A rumble while charging, a lean into the lunge.
    const charging = d.state === "charge" ? d.charge : 0;
    const shake = charging > 0 ? Math.sin(now * 40) * 0.03 * charging : 0;
    this.car.rotation.set(jumpPitch(d) + (d.state === "attack" ? -0.06 : 0), d.angle, shake, "YXZ");
    // Health over it for 4 s after a hit.
    const hurt = d.health < d.maxHealth && now - (d.lastHitAt ?? -9) < 4;
    this.bar.visible = hurt;
    if (hurt && camera) {
      const k = Math.max(0, d.health / d.maxHealth);
      this.bar.position.set(d.x, (d.y || 0) + 4.6, d.z);
      this.bar.quaternion.copy(camera.quaternion);
      this.barFill.scale.set(2.5 * k, 0.22, 1);
      this.barFill.position.x = -1.25 * (1 - k);
    }
    // The gauge under the player while it charges (and a flash at 100%).
    const p = sim.player;
    const flash = d.flashAt != null && now - d.flashAt < 0.3 ? 1 - (now - d.flashAt) / 0.3 : 0;
    const show = (d.state === "charge" && d.charge > 0) || flash > 0;
    this.gauge.visible = show;
    if (show) {
      this.gauge.position.set(p.x, (p.y || 0) + 0.14, p.z);
      const prog = flash > 0 ? 1 : d.charge;
      this.gaugeMat.uniforms.uProgress.value = prog;
      this.gaugeMat.uniforms.uPulse.value = prog > 0.75 ? 0.5 + 0.5 * Math.sin(now * 18) : 0;
      this.gaugeMat.uniforms.uFlash.value = flash;
    }
  }
}
