// One BatchedMesh for every prop, loose piece and parked vehicle of the
// locations (all share the baked vertex-colour material): many different
// models, each instance with its own matrix, colour and visibility, drawn
// in one call (plus one for shadows), culled per instance. It grows as
// models and instances are added.
import * as THREE from "three";
import { bakedMaterial } from "./parts.js";

export class PropBatch {
  constructor(scene) {
    this.maxV = 60000;
    this.maxI = 512;
    this.usedV = 0;
    this.usedI = 0;
    this.mesh = new THREE.BatchedMesh(this.maxI, this.maxV, 0, bakedMaterial);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // per-instance culling instead
    this.mesh.perObjectFrustumCulled = true;
    this.mesh.sortObjects = false;
    scene.add(this.mesh);
    this.ids = new Map();
    this.white = new THREE.Color(1, 1, 1);
  }
  // A model (non-indexed position/normal/color geometry), added once.
  geometry(key, make) {
    if (this.ids.has(key)) return this.ids.get(key);
    const g = make();
    const n = g.attributes.position.count;
    if (this.usedV + n > this.maxV) {
      this.maxV = Math.max(this.maxV * 2, this.usedV + n);
      this.mesh.setGeometrySize(this.maxV, 0);
    }
    const id = this.mesh.addGeometry(g);
    this.usedV += n;
    this.ids.set(key, id);
    return id;
  }
  instance(geometryId, visible = true) {
    if (this.usedI >= this.maxI) {
      this.maxI *= 2;
      this.mesh.setInstanceCount(this.maxI);
    }
    this.usedI++;
    const id = this.mesh.addInstance(geometryId);
    this.mesh.setColorAt(id, this.white);
    this.mesh.setVisibleAt(id, visible);
    return id;
  }
  matrix(id, m) {
    this.mesh.setMatrixAt(id, m);
  }
  color(id, c) {
    this.mesh.setColorAt(id, c);
  }
  visible(id, v) {
    this.mesh.setVisibleAt(id, v);
  }
}

// Fallback for browsers without WEBGL_multi_draw (three.js would otherwise
// draw a BatchedMesh one instance at a time): one InstancedMesh per model,
// same interface. Hidden instances are scaled to nothing.
export class PropInstances {
  constructor(scene) {
    this.scene = scene;
    this.models = [];
    this.byKey = new Map();
    this.handles = [];
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }
  geometry(key, make) {
    if (this.byKey.has(key)) return this.byKey.get(key);
    const id = this.models.length;
    this.models.push({ g: make(), groups: new Map() });
    this.byKey.set(key, id);
    return id;
  }
  // Instances are grouped by 60 m map cell (from where they start), each
  // group culled as a whole; pooled pieces with no position: one group.
  group(model, x, z) {
    const key = x == null ? "all" : `${Math.floor(x / 60)},${Math.floor(z / 60)}`;
    if (!model.groups.has(key)) model.groups.set(key, { key, mesh: null, cap: 0, used: 0, shown: 0 });
    return model.groups.get(key);
  }
  grow(model, grp, cap) {
    const mesh = new THREE.InstancedMesh(model.g, bakedMaterial, cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.castShadow = mesh.receiveShadow = true;
    if (grp.key === "all") mesh.frustumCulled = false;
    else {
      const [cx, cz] = grp.key.split(",").map(Number);
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * 60, 2, (cz + 0.5) * 60), 60 * 0.75 + 30);
    }
    if (grp.mesh) {
      mesh.instanceMatrix.array.set(grp.mesh.instanceMatrix.array);
      mesh.instanceColor.array.set(grp.mesh.instanceColor.array);
      this.scene.remove(grp.mesh);
      grp.mesh.dispose();
    }
    mesh.count = grp.used;
    this.scene.add(mesh);
    grp.mesh = mesh;
    grp.cap = cap;
  }
  instance(geometryId, visible = true, x, z) {
    const model = this.models[geometryId];
    const grp = this.group(model, x, z);
    if (grp.used >= grp.cap) this.grow(model, grp, Math.max(8, grp.cap * 2));
    const slot = grp.used++;
    grp.mesh.count = grp.used;
    const h = this.handles.length;
    this.handles.push({ grp, slot, m: new THREE.Matrix4(), visible });
    if (visible) grp.shown++;
    grp.mesh.visible = grp.shown > 0;
    grp.mesh.setMatrixAt(slot, this.zero);
    grp.mesh.instanceMatrix.needsUpdate = true;
    return h;
  }
  write(h) {
    const x = this.handles[h];
    x.grp.mesh.setMatrixAt(x.slot, x.visible ? x.m : this.zero);
    x.grp.mesh.instanceMatrix.needsUpdate = true;
  }
  matrix(h, m) {
    this.handles[h].m.copy(m);
    this.write(h);
  }
  color(h, c) {
    const x = this.handles[h];
    x.grp.mesh.setColorAt(x.slot, c);
    x.grp.mesh.instanceColor.needsUpdate = true;
  }
  visible(h, v) {
    const x = this.handles[h];
    if (x.visible !== v) {
      x.grp.shown += v ? 1 : -1;
      x.grp.mesh.visible = x.grp.shown > 0; // a group with nothing shown is not drawn
    }
    x.visible = v;
    this.write(h);
  }
}
