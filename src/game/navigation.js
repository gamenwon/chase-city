import { spawnView, inspectSpawn } from "./spawning.js";
import { CONFIG } from "./config.js";
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Swept circle uses conservative expanded AABBs; no route can cut a building.
function segmentDistance(a, b, p) {
  const vx = b.x - a.x,
    vz = b.z - a.z,
    len2 = vx * vx + vz * vz || 1;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2),
  );
  return Math.hypot(a.x + vx * t - p.x, a.z + vz * t - p.z);
}
export function clearSegment(
  a,
  b,
  solids,
  radius = CONFIG.policeRadius + 0.25,
) {
  const minX = Math.min(a.x, b.x) - radius,
    maxX = Math.max(a.x, b.x) + radius,
    minZ = Math.min(a.z, b.z) - radius,
    maxZ = Math.max(a.z, b.z) + radius;
  for (const box of solids) {
    if (
      maxX < box.x - box.w / 2 ||
      minX > box.x + box.w / 2 ||
      maxZ < box.z - box.d / 2 ||
      minZ > box.z + box.d / 2
    )
      continue;
    let near = 0,
      far = 1;
    for (const key of ["x", "z"]) {
      const half = (key === "x" ? box.w : box.d) / 2 + radius,
        lo = box[key] - half,
        hi = box[key] + half,
        d = b[key] - a[key];
      if (Math.abs(d) < 1e-9) {
        if (a[key] < lo || a[key] > hi) {
          near = 2;
          break;
        }
        continue;
      }
      let u = (lo - a[key]) / d,
        v = (hi - a[key]) / d;
      if (u > v) [u, v] = [v, u];
      near = Math.max(near, u);
      far = Math.min(far, v);
      if (near > far) break;
    }
    if (near <= far && near <= 1 && far >= 0) return false;
  }
  return true;
}
// Points along a polyline at most `step` apart (both ends included).
export function resample(pts, step) {
  const out = [{ x: pts[0].x, z: pts[0].z }];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}
export class RoadNavigation {
  // graph: a generated city's road graph (world/citygen.js): nodes along
  // every road, alley and exit stub. Without it, the downtown grid.
  constructor(solids, graph = null) {
    this.solids = solids;
    this.nodes = [];
    this.map = new Map();
    this.searches = 0;
    this.revision = 0;
    if (graph) {
      this.buildFromGraph(graph);
      return;
    }
    for (let x = -90; x <= 90; x += 10)
      for (let z = -90; z <= 90; z += 10) {
        const node = { x, z, id: this.nodes.length, neighbors: [] };
        if (
          (x % 30 === 0 || z % 30 === 0) &&
          clearSegment(node, node, solids)
        ) {
          this.nodes.push(node);
          this.map.set(`${x},${z}`, node);
        }
      }
    for (const n of this.nodes)
      for (const [dx, dz] of [
        [10, 0],
        [-10, 0],
        [0, 10],
        [0, -10],
      ]) {
        const other = this.map.get(`${n.x + dx},${n.z + dz}`);
        if (other && this.clear(n, other)) n.neighbors.push(other.id);
      }
  }
  buildFromGraph(graph) {
    const add = (x, z) => {
      const k = `${x},${z}`;
      let n = this.map.get(k);
      if (n) return n;
      n = { x, z, id: this.nodes.length, neighbors: [] };
      if (!this.allowed(n) || !clearSegment(n, n, this.solids)) return null;
      this.nodes.push(n);
      this.map.set(k, n);
      return n;
    };
    const link = (a, b) => {
      if (!a || !b || a === b || a.neighbors.includes(b.id) || !this.clear(a, b)) return;
      a.neighbors.push(b.id);
      b.neighbors.push(a.id);
    };
    const edges = [...graph.edges.filter((e) => e.kind === "road"), ...graph.edges.filter((e) => e.kind !== "road")];
    let opId = 0;
    for (const e of edges) {
      const made = [];
      let prev = null;
      if (e.kind === "overpass") {
        // V2.1: deck nodes on level 1 (above the ground solids), joined to
        // the ground only at the two ramp feet.
        const id = opId++;
        const pts = resample(e.pts, 9);
        pts.forEach((p, k) => {
          let n;
          if (k === 0 || k === pts.length - 1) {
            n = add(p.x, p.z);
            if (n) Object.assign(n, { foot: true, op: id });
          } else {
            n = { x: p.x, z: p.z, id: this.nodes.length, neighbors: [], level: 1, op: id };
            this.nodes.push(n);
            this.map.set(`${p.x},${p.z}|1`, n);
          }
          if (n && prev) link(prev, n);
          prev = n;
        });
        continue;
      }
      for (const p of resample(e.pts, 9)) {
        const n = add(p.x, p.z);
        if (n && prev) link(prev, n);
        if (n) made.push(n);
        prev = n;
      }
      for (const n of made) n.edge ??= e.id;
      // Alleys and exit stubs join the roads at their ends.
      if (e.kind !== "road" && made.length)
        for (const end of [made[0], made.at(-1)]) {
          const near = this.nodes
            .filter((o) => o !== end && !made.includes(o))
            .map((o) => ({ o, d: distance(o, end) }))
            .filter((v) => v.d < 11)
            .sort((a, b) => a.d - b.d)
            .slice(0, 3);
          for (const { o } of near) link(end, o);
        }
    }
    this.graph = graph;
  }
  stripBypasses() {
    this.baseNodeCount ??= this.nodes.length;
    this.nodes.length = this.baseNodeCount;
    for (const n of this.nodes)
      n.neighbors = n.neighbors.filter((id) => id < this.baseNodeCount);
  }
  buildBypasses() {
    // V2.1: holes broken through low-rise buildings become nodes linked to
    // what they can see, so a corridor through a building is a route.
    for (const h of this.holes || []) {
      const n = { x: h.x, z: h.z, id: this.nodes.length, neighbors: [] };
      if (!this.clear(n, n)) continue;
      const links = this.nodes
        .filter((o) => !o.level)
        .map((o) => ({ o, d: distance(n, o) }))
        .filter((v) => v.d < 14 && v.d > 0.5)
        .sort((a, b) => a.d - b.d)
        .filter((v) => this.clear(n, v.o))
        .slice(0, 8);
      if (!links.length) continue;
      this.nodes.push(n);
      for (const { o } of links) {
        n.neighbors.push(o.id);
        o.neighbors.push(n.id);
      }
    }
    for (const w of this.solids.filter((b) => b.kind === "wreck"))
      for (const x of [w.x - w.w / 2 - 1.8, w.x + w.w / 2 + 1.8])
        for (const z of [w.z - w.d / 2 - 1.8, w.z + w.d / 2 + 1.8]) {
          const n = { x, z, id: this.nodes.length, neighbors: [] };
          if (!this.clear(n, n)) continue;
          const links = this.nodes
            .map((o) => ({ o, d: distance(n, o) }))
            .filter((v) => v.d < 28)
            .sort((a, b) => a.d - b.d)
            .filter((v) => this.clear(n, v.o))
            .slice(0, 12);
          if (!links.length) continue;
          this.nodes.push(n);
          for (const { o } of links) {
            n.neighbors.push(o.id);
            o.neighbors.push(n.id);
          }
        }
  }
  setSolids(solids) {
    this.stripBypasses();
    this.solids = solids;
    this.buildBypasses();
    this.revision++;
  }
  addExit(exit) {
    this.stripBypasses();
    this.exit = exit;
    for (let forward = 100; forward <= 150; forward += 10) {
      const x = exit.dx ? exit.dx * forward : exit.x,
        z = exit.dz ? exit.dz * forward : exit.z,
        key = `${x},${z}`;
      if (this.map.has(key)) continue;
      const n = { x, z, id: this.nodes.length, neighbors: [] };
      this.nodes.push(n);
      this.map.set(key, n);
      const prev = this.map.get(`${x - exit.dx * 10},${z - exit.dz * 10}`);
      if (prev) {
        n.neighbors.push(prev.id);
        prev.neighbors.push(n.id);
      }
    }
    this.baseNodeCount = this.nodes.length;
    this.buildBypasses();
    this.revision++;
  }
  allowed(point) {
    if (Math.abs(point.x) <= 106 && Math.abs(point.z) <= 106) return true;
    if (!this.exit) return false;
    const e = this.exit,
      forward = point.x * e.dx + point.z * e.dz,
      lateral = (point.x - e.x) * e.dz - (point.z - e.z) * e.dx;
    return forward >= 94 && forward <= 154 && Math.abs(lateral) <= 8;
  }
  // V2.1: the overpass came down: its deck leaves the network.
  killOverpass(id) {
    (this.deadOps ||= new Set()).add(id);
    for (const n of this.nodes) if (n.op === id && n.level === 1) n.dead = true;
    this.revision++;
  }
  clear(a, b, radius) {
    if (a.dead || b.dead) return false;
    const la = a.level || 0, lb = b.level || 0;
    if (la === 1 || lb === 1) {
      // On the deck there is nothing in the way (its parapets keep cars
      // on it); level changes only at a ramp foot.
      const op = a.op ?? b.op;
      if (this.deadOps?.has(op)) return false;
      if (la === lb) return true;
      return !!(a.foot || b.foot) && distance(a, b) < 10;
    }
    if (!this.allowed(a) || !this.allowed(b)) return false;
    return clearSegment(a, b, this.solids, radius);
  }
  nearest(point, visibleFrom = null, radius = CONFIG.policeRadius - 0.02) {
    const level = point.level || 0;
    const candidates = this.nodes
      .filter((n) => !n.dead && (n.level || 0) === level)
      .map((n) => ({ n, d: distance(n, point) }))
      .sort((a, b) => a.d - b.d);
    for (const { n } of candidates)
      if (
        this.clear(n, n) &&
        (!visibleFrom || this.clear(visibleFrom, n, radius))
      )
        return n;
    return null;
  }
  // `avoid` ({x, z, radius, penalty}) adds cost near a point so V1.8 front
  // blockers can take a parallel street around the player instead of queuing
  // behind it on the same road.
  findPath(start, goal, radius, avoid = null) {
    this.searches++;
    const from = this.nearest(start, start, radius),
      to = this.nearest(goal);
    if (!from || !to) return [];
    const open = new Set([from.id]),
      came = new Map(),
      g = new Map([[from.id, 0]]);
    const h = (n) => distance(n, to);
    while (open.size) {
      let id = -1,
        best = Infinity;
      for (const candidate of open) {
        const f = g.get(candidate) + h(this.nodes[candidate]);
        if (f < best) {
          best = f;
          id = candidate;
        }
      }
      if (id === to.id) {
        const path = [to];
        while (came.has(id)) {
          id = came.get(id);
          path.push(this.nodes[id]);
        }
        return path.reverse().map((n) => (n.level || n.foot ? { x: n.x, z: n.z, level: n.level || 0, op: n.op, foot: n.foot } : { x: n.x, z: n.z }));
      }
      open.delete(id);
      for (const next of this.nodes[id].neighbors) {
        if (!this.clear(this.nodes[id], this.nodes[next])) continue;
        const node = this.nodes[next];
        // avoid.segment: penalise a road stretch that passes the avoid point
        // (not just nodes near it) - nodes are far apart on a long block.
        const near = !avoid
          ? false
          : avoid.segment
            ? segmentDistance(this.nodes[id], node, avoid) < avoid.radius
            : next !== to.id && distance(node, avoid) < avoid.radius;
        const cost =
          g.get(id) +
          distance(this.nodes[id], node) +
          (near ? avoid.penalty : 0);
        if (cost < (g.get(next) ?? Infinity)) {
          came.set(next, id);
          g.set(next, cost);
          open.add(next);
        }
      }
    }
    return [];
  }
  spawn(player, fleet, id, generation = 0, camera = null) {
    const view = spawnView(camera);
    if (!view) return null;
    const heading = Number.isFinite(player.angle)
      ? player.angle
      : Math.atan2(-player.vx, -player.vz);
    const fx = -Math.sin(heading),
      fz = -Math.cos(heading);
    const candidates = this.nodes.filter((n) => {
      const d = distance(n, player),
        forward = (n.x - player.x) * fx + (n.z - player.z) * fz;
      return (
        (this.baseNodeCount === undefined || n.id < this.baseNodeCount) &&
        !n.level &&
        this.clear(n, n) &&
        d >= 45 &&
        d <= 115 &&
        forward <= -12 &&
        fleet.every((c) => c.state !== "active" || distance(n, c) > 9) &&
        inspectSpawn(view, n, 0).outside &&
        inspectSpawn(view, n, Math.PI / 2).outside
      );
    });
    candidates.sort((a, b) => {
      const score = (n) =>
        distance(n, player) +
        Math.abs((n.x - player.x) * fz - (n.z - player.z) * fx) * 0.22;
      return score(a) - score(b) || a.id - b.id;
    });
    if (!candidates.length) return null;
    const shift = (id + generation) % Math.min(4, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      const n = candidates[(i + shift) % candidates.length],
        route = this.findPath(n, player);
      if (route.length < 2) continue;
      const next = route[1],
        length = distance(n, next),
        vx = ((next.x - n.x) / length) * 18,
        vz = ((next.z - n.z) / length) * 18;
      const angle = Math.atan2(-vx, -vz),
        visibility = inspectSpawn(view, n, angle);
      if (!visibility.outside) continue;
      return {
        x: n.x,
        z: n.z,
        angle,
        vx,
        vz,
        route,
        spawnProof: {
          ...visibility,
          distance: distance(n, player),
          forward: (n.x - player.x) * fx + (n.z - player.z) * fz,
          road: true,
          routeLength: route.length,
        },
      };
    }
    return null;
  }
}
