export class Input {
  constructor(onPause) {
    this.keys = new Set();
    this.pointers = new Map();
    this.onPause = onPause;
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
        e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat && (e.code === "KeyP" || e.code === "Escape")) onPause();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });
    // Touch steering: the lower screen is split into a left and a right
    // half (#touch). Each finger steers by the half it is in *now*, read
    // from the live screen width, so sliding across the middle switches
    // and a rotated screen needs nothing recomputed. The two arrow buttons
    // only show which side is held.
    const zone = typeof document !== "undefined" ? document.querySelector("#touch") : null;
    if (zone) {
      const side = (e) => (e.clientX < window.innerWidth / 2 ? "left" : "right");
      zone.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try {
          if (e.isTrusted) zone.setPointerCapture(e.pointerId);
        } catch {}
        this.pointers.set(e.pointerId, side(e));
        this.mark();
      });
      zone.addEventListener("pointermove", (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, side(e));
        this.mark();
      });
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        zone.addEventListener(type, (e) => {
          this.pointers.delete(e.pointerId);
          this.mark();
        });
      zone.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }
  mark() {
    const held = new Set(this.pointers.values());
    for (const b of document.querySelectorAll("[data-control]")) b.classList.toggle("pressed", held.has(b.dataset.control));
  }
  clear() {
    this.keys.clear();
    this.pointers.clear();
    document
      .querySelectorAll(".pressed")
      .forEach((b) => b.classList.remove("pressed"));
  }
  get left() {
    return (
      this.keys.has("ArrowLeft") ||
      this.keys.has("KeyA") ||
      [...this.pointers.values()].includes("left")
    );
  }
  get right() {
    return (
      this.keys.has("ArrowRight") ||
      this.keys.has("KeyD") ||
      [...this.pointers.values()].includes("right")
    );
  }
}
