import * as THREE from "three";

// V1.8 driver's-view picture-in-picture: a bonnet camera drawn into a small
// screen rectangle (the #pip frame) on the same canvas after the top view.
// It reuses the scene and the frame's shadow map, so the extra cost is one
// more pass of draw calls over a small number of pixels.
export const BONNET = Object.freeze({ right: 0, up: 1.3, forward: 0.95 });

export class BonnetCamera {
  constructor() {
    // 110 m is past what the low bonnet view can see between buildings.
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 110);
    this.target = new THREE.Vector3();
    this.rect = null;
    this.lastPassMs = 0;
  }
  // Sit just in front of the windscreen over the bonnet and look down the road.
  update(player) {
    const fx = -Math.sin(player.angle),
      fz = -Math.cos(player.angle);
    this.camera.position.set(
      player.x + fx * BONNET.forward,
      BONNET.up,
      player.z + fz * BONNET.forward,
    );
    this.target.set(player.x + fx * 25, 0.9, player.z + fz * 25);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }
  // The frame rectangle in canvas CSS pixels with the origin at the bottom
  // left, as WebGL viewports expect; null when the frame is not on screen.
  frameRect(frame, canvas) {
    if (!frame || frame.hidden) return null;
    const f = frame.getBoundingClientRect(),
      c = canvas.getBoundingClientRect();
    const w = Math.round(f.width - 4),
      h = Math.round(f.height - 4);
    if (w < 40 || h < 24) return null;
    return {
      x: Math.round(f.left - c.left + 2),
      y: Math.round(c.bottom - f.bottom + 2),
      w,
      h,
    };
  }
  // Draw the bonnet view inside the rectangle. Buildings faded for the top
  // camera are shown solid here, and the shared shadow map is not redrawn.
  render(renderer, scene, buildings, rect) {
    const start = performance.now();
    this.camera.aspect = rect.w / rect.h;
    this.camera.updateProjectionMatrix();
    const faded = buildings.filter((b) => b?.mesh?.material && b.mesh.material.opacity < 1);
    const opacities = faded.map((b) => b.mesh.material.opacity);
    for (const b of faded) b.mesh.material.opacity = 1;
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
    renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
    try {
      renderer.render(scene, this.camera);
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.shadowMap.autoUpdate = shadows;
      faded.forEach((b, i) => (b.mesh.material.opacity = opacities[i]));
    }
    this.rect = rect;
    this.lastPassMs = performance.now() - start;
    this.lastPassCalls = renderer.info.render.calls;
  }
}
