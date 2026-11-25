// Police helicopter drawing (game/helicopter.js flies it).
//   model     black-and-white police helicopter: rounded cabin, tinted
//             cockpit glass, white doors with POLICE, tail boom, fin,
//             skids, a searchlight under the nose, red/blue light bar;
//             main and tail rotors spin (a blurred disc plus blades)
//   day       a soft shadow on the ground under it (sun direction)
//   night     a searchlight: a pale pool of light on the road that follows
//             the car with a little lag, and a faint beam (additive, cheap,
//             never strong enough to hide the road, cars or coins)
// It never hides the car or the road ahead: whenever its outline on screen
// comes near the car or the stretch of road in front of it, it fades to a
// ghost (gameplay readability first). Unlit parts use emissive vertex
// colours for the lights; one mesh for the body.
import * as THREE from "three";
import { pieceGeometry, B, cyl } from "../preview/locations/parts.js";
import { heliBody } from "./cartoon.js";

function signTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#f4f4f0";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#1a1d24";
  g.font = '900 44px "Arial Black", Impact, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("POLICE", 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function bodyBuild(g) {
  const BLACK = 0x1f2128, WHITE = 0xf4f4f0, GLASS = 0x4a8fc8;
  // Cabin (nose toward -z), rounded with a few boxes.
  B(g, 2.2, 1.9, 4.0, BLACK, 0, -0.2, 0.2);
  B(g, 2.0, 0.6, 3.6, WHITE, 0, 1.7, 0.4); // white roof (seen from above)
  B(g, 2.24, 1.2, 2.2, WHITE, 0, 0.2, 0.6); // white doors
  const nose = B(g, 2.0, 1.5, 1.4, GLASS, 0, 0.0, -2.2);
  nose.rotation.x = 0.35;
  B(g, 2.05, 0.9, 1.2, GLASS, 0, 0.9, -1.25);
  for (const s of [-1, 1]) B(g, 0.05, 0.8, 1.6, GLASS, s * 1.13, 0.75, -0.6);
  // Tail boom, fin, stabiliser.
  B(g, 0.7, 0.7, 4.6, BLACK, 0, 0.8, 4.4);
  B(g, 0.3, 1.8, 0.9, BLACK, 0, 1.0, 6.6);
  B(g, 2.0, 0.12, 0.6, WHITE, 0, 1.0, 5.6);
  B(g, 0.32, 0.22, 4.4, WHITE, 0, 1.3, 4.4); // stripe
  // Engine housing and rotor mast.
  B(g, 1.4, 0.6, 1.8, 0x3a3d45, 0, 2.3, 0.8);
  cyl(g, 0.15, 0.15, 0.6, 0x55585f, 0, 2.9, 0.4, 6);
  // Skids.
  for (const s of [-1, 1]) {
    B(g, 0.14, 0.14, 4.2, 0x55585f, s * 1.15, -1.15, 0.2);
    for (const z of [-0.8, 1.2]) B(g, 0.1, 0.9, 0.1, 0x55585f, s * 1.05, -1.1, z);
  }
  // Searchlight under the nose.
  cyl(g, 0.28, 0.22, 0.4, 0x3a3d45, 0, -0.75, -1.5, 8);
}

export class HelicopterRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.mats = [];
    const mat = (m) => (this.mats.push(m), m);
    this.bodyMat = mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1, flatShading: true, transparent: true }));
    // (Cartoon redesign: angular white-and-blue body, cartoon.js; the old
    // build stays below for reference.)
    this.body = new THREE.Mesh(pieceGeometry(heliBody), this.bodyMat);
    this.body.castShadow = false; // its own cheap shadow disc instead
    this.group.add(this.body);
    // POLICE on both doors.
    const tex = signTexture();
    const signMat = mat(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), signMat);
      p.position.set(s * 1.13, 0.05, 1.0);
      p.rotation.y = (s * Math.PI) / 2;
      this.group.add(p);
    }
    // POLICE on the roof too (the chase camera looks down on it).
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5), signMat);
    roof.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    roof.position.set(0, 1.92, 1.0);
    this.group.add(roof);
    // Light bar: red and blue (flash alternately).
    this.red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.3), mat(new THREE.MeshBasicMaterial({ color: 0xff2a3c, transparent: true, toneMapped: false })));
    this.blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.3), mat(new THREE.MeshBasicMaterial({ color: 0x2a6dff, transparent: true, toneMapped: false })));
    this.red.position.set(-0.4, 2.0, 1.95);
    this.blue.position.set(0.4, 2.0, 1.95);
    this.group.add(this.red, this.blue);
    // Belly strobes.
    this.strobe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false })));
    this.strobe.position.set(0, -1.0, 1.6);
    this.group.add(this.strobe);
    // Main rotor: a faint blurred disc and two long blades.
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 3.15, 0.4);
    const blur = new THREE.Mesh(new THREE.CircleGeometry(5.4, 28).rotateX(-Math.PI / 2), mat(new THREE.MeshBasicMaterial({ color: 0x30333a, transparent: true, opacity: 0.18, depthWrite: false })));
    this.blurMat = blur.material;
    this.blurMat.userData.base = 0.18;
    this.rotor.add(blur);
    const bladeMat = mat(new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.6, transparent: true }));
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.06, 0.38), bladeMat);
      b.rotation.y = (i * Math.PI) / 2;
      this.rotor.add(b);
    }
    this.group.add(this.rotor);
    // Tail rotor.
    this.tail = new THREE.Group();
    this.tail.position.set(0.2, 1.75, 6.85);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.16), bladeMat);
      b.rotation.x = (i * Math.PI) / 2;
      this.tail.add(b);
    }
    this.group.add(this.tail);
    // Ground shadow (day) and searchlight (night).
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
    const glow = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.55, "rgba(255,255,255,0.55)");
      r.addColorStop(0.85, "rgba(255,255,255,0.12)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.pool = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ map: glow, color: 0xfff4d6, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.pool.renderOrder = 2;
    this.pool.visible = false;
    scene.add(this.pool);
    const cone = new THREE.CylinderGeometry(0.25, 1, 1, 18, 1, true);
    cone.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.beam.renderOrder = 2;
    this.beam.visible = false;
    scene.add(this.beam);
    this.opacity = 1;
    this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.box = new THREE.Box3();
    this.corners = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.sun = new THREE.Vector3(0.35, 1, 0.25).normalize();
  }
  setSun(dir) {
    if (dir) this.sun.copy(dir).normalize();
  }
  hide() {
    this.group.visible = this.shadow.visible = this.pool.visible = this.beam.visible = false;
  }
  update(sim, camera, night, dt) {
    // Tell the flight where it shows best on this screen (wide: out at the
    // side; tall phone: toward the top, off to one side).
    const aspect = camera?.aspect ?? 1.6;
    sim.heliView = aspect < 0.8 ? { side: 11, ahead: 24 } : aspect < 1.25 ? { side: 19, ahead: 14 } : { side: 30, ahead: 6 };
    const h = sim.heli;
    if (!h) return this.hide();
    const now = sim.elapsed;
    this.group.visible = true;
    this.group.position.set(h.x, h.y, h.z);
    this.group.rotation.set(h.pitch || 0, h.heading, h.bank || 0, "YXZ");
    this.group.scale.setScalar(1.35);
    this.rotor.rotation.y = h.rotor;
    this.tail.rotation.x = h.rotor * 1.7;
    // Lights: red / blue alternating, white belly strobe.
    const ph = Math.floor(now * 5) % 2;
    this.red.material.color.setHex(ph ? 0xff2a3c : 0x5a0c14);
    this.blue.material.color.setHex(ph ? 0x1a2a5a : 0x2a6dff);
    this.strobe.visible = now % 1.2 < 0.08;
    // Readability: fade when its outline on screen comes near the car or
    // the road just ahead of it.
    let want = 1;
    if (camera) {
      this.group.updateMatrixWorld(true);
      // Its outline on screen: the body and the rotor disc (radius 5.4).
      this.box.setFromObject(this.body);
      this.box.expandByVector(this.v.set(4.4, 0.6, 4.4));
      const { min, max } = this.box;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      let i = 0;
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        const c = this.corners[i++].set(x, y, z).project(camera);
        x0 = Math.min(x0, c.x);
        x1 = Math.max(x1, c.x);
        y0 = Math.min(y0, c.y);
        y1 = Math.max(y1, c.y);
      }
      // The car and, when it is driving, the road just ahead of it.
      const p = sim.player;
      const sp = Math.hypot(p.vx || 0, p.vz || 0);
      const keep = [[p.x, p.z]];
      if (sp > 6) for (const d of [8, 16]) keep.push([p.x - Math.sin(p.angle) * d, p.z - Math.cos(p.angle) * d]);
      const pad = 0.04;
      for (const [x, z] of keep) {
        const c = this.v.set(x, p.y || 0, z).project(camera);
        if (c.x > x0 - pad && c.x < x1 + pad && c.y > y0 - pad && c.y < y1 + pad) want = 0.22;
      }
      this.onScreen = x1 > -1 && x0 < 1 && y1 > -1 && y0 < 1;
    }
    this.opacity += (want - this.opacity) * Math.min(1, dt * 6);
    this.faded = this.opacity < 0.6;
    for (const m of this.mats) {
      if (m === this.blurMat) m.opacity = 0.18 * this.opacity;
      else m.opacity = this.opacity;
      m.depthWrite = this.opacity > 0.95;
    }
    // Day: a soft shadow along the sun direction; night: the searchlight.
    const groundY = 0.06;
    const s = (h.y - groundY) / Math.max(0.3, this.sun.y);
    this.shadow.visible = !night;
    this.shadow.position.set(h.x - this.sun.x * s, groundY + 0.03, h.z - this.sun.z * s);
    this.shadow.scale.set(4.3, 1, 6.0);
    this.shadow.rotation.y = h.heading;
    this.shadow.material.opacity = 0.2 * Math.min(1, 0.4 + this.opacity);
    this.pool.visible = this.beam.visible = night && h.mode !== "entry";
    if (night) {
      const R = 5.6;
      this.pool.position.set(h.spot.x, groundY + 0.04, h.spot.z);
      this.pool.scale.set(R, 1, R);
      // Beam from under the nose down to the pool.
      const fx = h.x - Math.sin(h.heading) * -1.5, fz = h.z - Math.cos(h.heading) * -1.5, fy = h.y - 0.9;
      const dx = h.spot.x - fx, dy = groundY - fy, dz = h.spot.z - fz, len = Math.hypot(dx, dy, dz);
      this.beam.position.set(fx, fy, fz);
      this.q.setFromUnitVectors(this.v.set(0, -1, 0), this.v.set(dx / len, dy / len, dz / len).clone());
      this.beam.quaternion.copy(this.q);
      this.beam.scale.set(R * 0.9, len, R * 0.9);
    }
  }
}
void bodyBuild;
