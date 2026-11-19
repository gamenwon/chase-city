import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { VehicleTrails, trailIntensity, SkidMarks, SKID_CAPACITY, skidAmount } from "../src/render/trails.js";
import { ChaseCamera } from "../src/render/camera.js";
import { soundTargets } from "../src/audio/sound.js";
test("rear particle and skid pools stay bounded, stop during briefing/pause and reset cleanly", () => {
  const scene = new THREE.Scene(),
    trails = new VehicleTrails(scene),
    p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24, turn: 1.75, slip: 3 };
  trails.update(p, 0.1, false);
  assert.ok(trails.dust.every((p) => !p.mesh.visible));
  for (let i = 0; i < 1200; i++) trails.update(p, 1 / 60, true);
  assert.equal(trails.dust.length, 48);
  // 48 dust puffs + the skid-mark chunks (8 instanced meshes).
  assert.equal(scene.children.length, 56);
  assert.ok(trails.dust.some((p) => p.mesh.visible && p.mesh.position.z > 0));
  const ages = trails.dust.map((p) => p.age);
  trails.update(p, 0, true);
  assert.deepEqual(
    trails.dust.map((p) => p.age),
    ages,
  );
  trails.reset();
  assert.ok(trails.dust.every((p) => !p.mesh.visible));
  assert.equal(trails.skids.count, 0);
});

// Drive a car for `seconds` with steering `turn` (the sim's own turn rate).
function drive(marks, p, seconds, turn) {
  for (let f = 0; f < seconds * 60; f++) {
    p.turn = turn;
    p.angle += turn * (1 / 60);
    p.vx = -Math.sin(p.angle) * 24;
    p.vz = -Math.cos(p.angle) * 24;
    p.x += p.vx / 60;
    p.z += p.vz / 60;
    marks.update(p, true);
  }
}
test("skid marks: only on a hard fast turn, from both rear tires, curving with the slide", () => {
  const marks = new SkidMarks(new THREE.Scene());
  const p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24, turn: 0 };
  drive(marks, p, 2, 0); // straight
  assert.equal(marks.count, 0);
  drive(marks, p, 2, 0.6); // gentle steering
  assert.equal(skidAmount({ ...p, turn: 0.6 }), 0);
  assert.equal(marks.count, 0);
  drive(marks, p, 1.5, 1.75); // hard turn at speed
  const n = marks.count;
  assert.ok(n > 100 && n < marks.per, `${n} strips`);
  const mesh = marks.chunks[0].mesh;
  // Both tires, about the same number each, along a curve (headings change).
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const headings = new Set();
  for (let i = 0; i < n; i++) {
    mesh.getMatrixAt(i, m);
    m.decompose(pos, q, s);
    assert.ok(Math.abs(pos.y - 0.135) < 1e-6); // on the road surface
    assert.ok(s.z > 0.3 && s.z < 0.6); // short strips, no stretched gaps
    headings.add(Math.round(new THREE.Euler().setFromQuaternion(q).y * 10));
  }
  assert.ok(headings.size > 10, "the trail curves");
  // Straight again: the trail stops, the marks stay.
  drive(marks, p, 3, 0);
  assert.equal(marks.count, n);
  // Culled by stretch: the chunk's bounds hold its strips.
  assert.ok(mesh.visible && mesh.frustumCulled && mesh.boundingSphere.radius > 1);
});
test("skid marks: bounded memory, oldest reused first, cleared on restart", () => {
  const marks = new SkidMarks(new THREE.Scene(), 500, 4);
  const p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24, turn: 0 };
  drive(marks, p, 10, 1.75);
  assert.equal(marks.count, 500);
  assert.ok(marks.total > 500);
  // The newest strip is where the car just was (the oldest were reused).
  const m = new THREE.Matrix4(), pos = new THREE.Vector3();
  const last = (marks.next + 499) % 500;
  marks.chunks[Math.floor(last / marks.per)].mesh.getMatrixAt(last % marks.per, m);
  pos.setFromMatrixPosition(m);
  assert.ok(Math.hypot(pos.x - p.x, pos.z - p.z) < 3);
  marks.reset();
  assert.equal(marks.count, 0);
  assert.equal(SKID_CAPACITY, 6000);
});
test("turn/slip intensifies both rear effects and skid sound without a drift control", () => {
  const p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24, turn: 0, slip: 0 },
    turning = { ...p, turn: 1.7, slip: 2 };
  assert.ok(trailIntensity(turning).turn > trailIntensity(p).turn);
  assert.ok(
    soundTargets({ player: turning, police: [] }).skidGain >
      soundTargets({ player: p, police: [] }).skidGain,
  );
});
test("shared real camera projection excludes behind-camera/off-screen points and opaque blockers", () => {
  const rig = new ChaseCamera(1100, 740),
    p = { x: 0, z: 8 };
  rig.update(p, 1);
  assert.ok(rig.visible({ x: 0, z: 8 }, []));
  assert.equal(rig.visible({ x: 2000, z: 2000 }, []), false);
  const b = { x: 15, z: 28, w: 12, d: 12, h: 40 };
  assert.equal(rig.visible({ x: 0, z: 8 }, [b]), false);
  assert.equal(
    rig.visible({ x: 0, z: 8 }, [{ bounds: b, opacity: 0.35 }]),
    true,
  );
});
