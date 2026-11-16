import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// V1.8 police AI fix: scenarios A-E reproduced in the real game page on the
// real requestAnimationFrame loop. Only the starting positions (player and
// police) are placed when START is pressed, and the player's own left/right
// input is scripted where a scenario needs it. Everything after that - police
// AI, roadblock/cordon planning, collisions, damage, officers, BUSTED - is
// the unmodified game. Each run is filmed (Playwright video) and the canvas
// is captured every 0.25 s of game time, with a state log every 0.1 s.
const SCENARIOS = {
  // A. Player drives into a building face and stops against it.
  A: {
    seconds: 12,
    player: { x: -40.4, z: -6, angle: Math.PI, vx: 0, vz: 20, speed: 20 },
    police: [
      [-38.5, -16],
      [-42.5, -19],
      [-55, -12],
      [-25, -8],
    ].map(([x, z]) => ({ x, z, angle: Math.PI, vz: 18 })),
    steer: [],
    view: [2, 11, -11],
  },
  // B. Player drives straight east; one officer is ahead, one behind.
  B: {
    seconds: 11,
    player: { x: -100, z: 0, angle: -Math.PI / 2, vx: 24, vz: 0, speed: 24 },
    police: [
      { x: -72, z: 1.5, angle: -Math.PI / 2, vx: 20 },
      { x: -110, z: 0, angle: -Math.PI / 2, vx: 20 },
      { x: -60, z: 60, angle: 0 },
      { x: 30, z: -60, angle: 0 },
    ],
    steer: [],
    view: [-13, 12, 7],
  },
  // B2. As B, with three officers on the cross street ahead: the block is
  // sized to the road width and uses all three to close it kerb to kerb.
  B2: {
    seconds: 12,
    player: { x: -100, z: 0, angle: -Math.PI / 2, vx: 24, vz: 0 },
    police: [
      { x: -108, z: 0, angle: -Math.PI / 2, vx: 20 },
      ...[12, 17, 22].map((z) => ({ x: -30, z, angle: 0, vz: -10 })),
      ...[-116, -124].map((x) => ({ x, z: 0, angle: -Math.PI / 2, vx: 20 })),
    ],
    steer: [],
    view: [-12, 14, 8],
  },
  // C. Two officers meet at a junction at chase speed (T-bone).
  C: {
    seconds: 6,
    focus: { x: 30, z: 30 },
    view: [-9, 15, -12],
    player: { x: 42, z: 30, angle: -Math.PI / 2, vx: 24, vz: 0 },
    police: [
      { x: 25, z: 30, angle: -Math.PI / 2, vx: 24 },
      { x: 30, z: 35, angle: 0, vz: -22 },
    ],
    steer: [],
  },
  // D. Same junction with a third officer close behind the first.
  D: {
    seconds: 6,
    focus: { x: 28, z: 30 },
    view: [-9, 15, -12],
    player: { x: 42, z: 30, angle: -Math.PI / 2, vx: 24, vz: 0 },
    police: [
      { x: 25, z: 30, angle: -Math.PI / 2, vx: 24 },
      { x: 30, z: 35, angle: 0, vz: -22 },
      { x: 19, z: 27.4, angle: -Math.PI / 2, vx: 22 },
    ],
    steer: [],
  },
  // E. As A, police a little further back; the player turns away along
  // the wall (left for 0.4 s) just before the cordon closes.
  E: {
    seconds: 8,
    player: { x: -40.4, z: -6, angle: Math.PI, vx: 0, vz: 20, speed: 20 },
    police: [
      [-38.5, -22],
      [-42.5, -26],
      [-55, -18],
      [-25, -14],
    ].map(([x, z]) => ({ x, z, angle: Math.PI, vz: 18 })),
    steer: [{ key: "left", from: 1.1, to: 1.5 }],
    view: [2, 13, -13],
  },
};

async function play(page, name) {
  const scenario = SCENARIOS[name];
  await page.goto("/?debug");
  await page.evaluate(async (scenario) => {
    const { makePolice } = await import("/src/game/police.js");
    const { sim: s, input, renderer: r } = window.__CHASE__;
    r.renderer.setPixelRatio(0.75);
    r.renderer.setSize(innerWidth, innerHeight);
    // Applied inside START, before the first frame: the same starting state
    // as the Node reproduction of the scenario.
    const start = s.start.bind(s);
    s.start = () => {
      start();
      s.reinforcementsEnabled = false;
      s.barricadesEnabled = false;
      Object.assign(s.player, scenario.player);
      s.police = scenario.police.map((c, i) => Object.assign(makePolice(i), c));
      s.cameraRig.update(s.player, 0);
    };
    // The player's own steering input, by game time.
    for (const key of ["left", "right"])
      Object.defineProperty(input, key, {
        configurable: true,
        get: () =>
          window.__CHASE__.state === "running" &&
          scenario.steer.some(
            (w) => w.key === key && s.elapsed > w.from && s.elapsed < w.to,
          ),
        set() {},
      });
    const log = (window.__fix = { frames: [], shots: [], events: [] });
    let nextLog = 0,
      nextShot = 0,
      seen = { cordon: 0, roadblock: 0, explosion: 0 };
    const canvas = r.renderer.domElement;
    const render = r.render.bind(r);
    // Evidence camera: a close overhead view of the same live scene (the
    // game camera can be behind a see-through building). It is drawn and
    // grabbed inside the frame, then the game view is drawn again, so the
    // screen (and the video) only ever shows the game camera.
    const drone = r.camera.clone();
    drone.fov = 55;
    drone.updateProjectionMatrix();
    r.render = (...args) => {
      render(...args);
      if (window.__CHASE__.state === "ready") return;
      if (s.elapsed >= nextShot) {
        nextShot += 0.25;
        const game = canvas.toDataURL("image/jpeg", 0.72);
        const f = scenario.focus || s.player;
        const [vx, vy, vz] = scenario.view;
        drone.position.set(f.x + vx, vy, f.z + vz);
        drone.lookAt(f.x, 0, f.z);
        drone.updateMatrixWorld();
        // Wrecks are culled to the camera that looks at them: let the
        // overhead camera see every wreck in its own view as well.
        r.wreckRenderer.update(s, drone);
        r.renderer.render(r.scene, drone);
        const close = canvas.toDataURL("image/jpeg", 0.8);
        render(...args.slice(0, 1), 0, ...args.slice(2));
        log.shots.push({ t: s.elapsed, data: game, close });
      }
    };
    const sample = () => {
      if (s.elapsed >= nextLog || s.result) {
        nextLog = s.elapsed + 0.1;
        const p = s.player;
        log.frames.push({
          t: +s.elapsed.toFixed(3),
          player: {
            x: +p.x.toFixed(2),
            z: +p.z.toFixed(2),
            speed: +(p.groundSpeed ?? 0).toFixed(2),
          },
          arrest: +s.arrest.toFixed(2),
          trapped: s.enclosure.trapped,
          reason: s.enclosure.reason,
          cordon: s.cordon && {
            id: s.cordon.id,
            slots: s.cordon.slots.length,
            releasing: !!s.cordon.releasing,
          },
          officers: s.officers.map((o) => ({
            id: o.id,
            car: o.carId,
            role: o.role,
            state: o.state,
            walking: !!o.walking,
          })),
          police: s.police.map((c) => ({
            id: c.id,
            state: c.state,
            block: c.blockState || null,
            kind: c.blockId ? c.blockKind || "roadblock" : null,
            mode: c.mode,
            x: +c.x.toFixed(2),
            z: +c.z.toFixed(2),
            angle: +c.angle.toFixed(3),
            speed: +Math.hypot(c.vx, c.vz).toFixed(2),
            health: Math.round(c.health),
          })),
          wrecks: s.wrecks.map((w) => ({
            id: w.id,
            x: +w.x.toFixed(2),
            z: +w.z.toFixed(2),
          })),
          result: s.result,
        });
      }
      for (const e of s.cordonEvents.slice(seen.cordon))
        log.events.push({ kind: "cordon", ...e });
      seen.cordon = s.cordonEvents.length;
      for (const e of s.roadblockEvents.slice(seen.roadblock))
        log.events.push({ kind: "roadblock", ...e });
      seen.roadblock = s.roadblockEvents.length;
      for (const e of s.events)
        if (e.id > seen.explosion) {
          seen.explosion = e.id;
          log.events.push({
            kind: "explosion",
            id: e.id,
            time: e.time,
            delay: e.delay,
            cause: e.cause,
            x: e.x,
            z: e.z,
          });
        }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, scenario);
  await page.locator("#start").click();
  await page.waitForFunction(
    (seconds) => {
      const { sim: s } = window.__CHASE__;
      return s.result || s.elapsed >= seconds;
    },
    scenario.seconds,
    { polling: 100, timeout: 300000 },
  );
  // Let the BUSTED flash show (900 ms) before the final screenshot.
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const { sim: s } = window.__CHASE__;
    return {
      result: s.result,
      elapsed: s.elapsed,
      stats: s.stats,
      busted: document.body.classList.contains("busted"),
      ...window.__fix,
    };
  });
}

function save(info, name, record, out) {
  mkdirSync(out, { recursive: true });
  record.shots.forEach((shot, i) => {
    const n = String(i).padStart(3, "0");
    writeFileSync(
      `${out}/${name}-${n}.jpg`,
      Buffer.from(shot.data.split(",")[1], "base64"),
    );
    writeFileSync(
      `${out}/${name}-close-${n}.jpg`,
      Buffer.from(shot.close.split(",")[1], "base64"),
    );
  });
  const { shots, ...rest } = record;
  writeFileSync(
    `${out}/${name}-log.json`,
    JSON.stringify(
      { ...rest, shots: shots.map((s, i) => ({ i, t: s.t })) },
      null,
      1,
    ),
  );
}

const OUT = process.env.FIX_OUT || "test-results/v18-police-fix";
const last = (a) => a[a.length - 1];

test.use({ video: "on" });
test.describe("V1.8 police AI fix scenarios", () => {
  test.setTimeout(400000);

  test("A: stopped against a wall -> real cordon -> cars stop -> officers out -> BUSTED", async ({
    page,
  }, info) => {
    const r = await play(page, "A");
    save(info, `${info.project.name}-A`, r, OUT);
    await page.screenshot({ path: `${OUT}/${info.project.name}-A-final.png` });
    expect(r.result).toBe("arrested");
    expect(r.busted).toBe(true);
    expect(r.stats.explosions).toBe(0);
    // Officers got out before the arrest and aimed at the car.
    const withOfficers = r.frames.filter((f) => f.officers.length >= 2);
    expect(withOfficers.length).toBeGreaterThan(5);
    expect(
      withOfficers.some((f) => f.officers.some((o) => o.role === "aim")),
    ).toBe(true);
    // During the 3-second count every cordon car is parked and still, and
    // there is no way out.
    const counting = r.frames.filter((f) => f.arrest > 0.3);
    expect(counting.length).toBeGreaterThan(10);
    for (const f of counting) {
      expect(f.trapped).toBe(true);
      for (const c of f.police.filter((c) => c.kind === "cordon"))
        expect(c.speed).toBeLessThan(0.05);
    }
    // ...and they hold position and heading.
    const first = counting[0],
      end = last(counting);
    for (const c of first.police.filter((c) => c.kind === "cordon")) {
      const later = end.police.find((d) => d.id === c.id);
      expect(Math.hypot(later.x - c.x, later.z - c.z)).toBeLessThan(0.05);
      expect(Math.abs(later.angle - c.angle)).toBeLessThan(0.05);
    }
  });

  test("B: player drives straight -> front car brakes and parks across its path -> player hits it", async ({
    page,
  }, info) => {
    const r = await play(page, "B");
    save(info, `${info.project.name}-B`, r, OUT);
    await page.screenshot({ path: `${OUT}/${info.project.name}-B-final.png` });
    const plan = r.events.find(
      (e) => e.kind === "roadblock" && e.type === "plan",
    );
    expect(plan).toBeTruthy();
    expect(plan.cars).toContain(0);
    // The front car is parked across the road, ahead of the player, before
    // the player gets there; it does not keep driving with the player.
    const held = r.frames.find((f) =>
      f.police.some((c) => c.id === 0 && c.block === "hold"),
    );
    expect(held).toBeTruthy();
    const car = held.police.find((c) => c.id === 0);
    expect(car.x).toBeGreaterThan(held.player.x + 3);
    // By the time the player reaches it, it has turned square across.
    const reached = r.frames.find((f) => f.t > held.t && f.player.speed < 1);
    expect(reached).toBeTruthy();
    const across = reached.police.find((c) => c.id === 0);
    expect(across.block).toBe("hold");
    expect(Math.abs(Math.sin(across.angle))).toBeLessThan(0.1);
    // The player is stopped by it, and the car stays put.
    const after = r.frames.filter((f) => f.t > held.t);
    expect(last(after).player.speed).toBeLessThan(1);
    expect(Math.abs(last(after).player.x - car.x)).toBeLessThan(6);
    const track = after
      .map((f) => f.police.find((c) => c.id === 0))
      .filter((c) => c.block === "hold");
    expect(track.length).toBeGreaterThan(10);
    expect(
      Math.max(...track.map((c) => Math.hypot(c.x - car.x, c.z - car.z))),
    ).toBeLessThan(0.3);
    expect(r.stats.explosions).toBe(0);
  });

  test("B2: wide road -> three cars block it kerb to kerb -> player stopped -> BUSTED", async ({
    page,
  }, info) => {
    const r = await play(page, "B2");
    save(info, `${info.project.name}-B2`, r, OUT);
    await page.screenshot({
      path: `${OUT}/${info.project.name}-B2-final.png`,
    });
    const plan = r.events.find(
      (e) => e.kind === "roadblock" && e.type === "plan",
    );
    expect(plan.cars.length).toBeGreaterThanOrEqual(2);
    expect(plan.partial).toBe(false);
    // Before the player arrives, the block cars are parked across the road
    // and together leave no gap a car could pass through.
    const up = r.frames.find(
      (f) =>
        f.police.filter((c) => c.kind === "roadblock" && c.block === "hold")
          .length >= 2,
    );
    expect(up).toBeTruthy();
    expect(up.player.x).toBeLessThan(plan.x - 3);
    expect(r.result).toBe("arrested");
    expect(r.stats.explosions).toBe(0);
  });

  test("C: two cars collide fast -> both wrecked and explode -> wrecks stay", async ({
    page,
  }, info) => {
    const r = await play(page, "C");
    save(info, `${info.project.name}-C`, r, OUT);
    await page.screenshot({ path: `${OUT}/${info.project.name}-C-final.png` });
    const blasts = r.events.filter((e) => e.kind === "explosion");
    expect(blasts.length).toBe(2);
    expect(blasts.every((e) => e.cause === "vehicle")).toBe(true);
    const end = last(r.frames);
    // Both cars are wrecks right after the crash (later the game sends
    // replacement cars, which is normal respawning).
    const crashed = r.frames.find((f) => f.t > 1);
    expect(crashed.police.every((c) => c.state === "wreck")).toBe(true);
    expect(end.wrecks.length).toBe(2);
    // Wrecks stay where they came to rest.
    const settled = r.frames.find((f) => f.t > 2);
    for (const w of settled.wrecks) {
      const later = end.wrecks.find((v) => v.id === w.id);
      expect(Math.hypot(later.x - w.x, later.z - w.z)).toBeLessThan(0.01);
    }
  });

  test("D: three cars close together -> only the two in the hard crash explode", async ({
    page,
  }, info) => {
    const r = await play(page, "D");
    save(info, `${info.project.name}-D`, r, OUT);
    await page.screenshot({ path: `${OUT}/${info.project.name}-D-final.png` });
    const blasts = r.events.filter((e) => e.kind === "explosion");
    expect(blasts.length).toBe(2);
    const end = last(r.frames);
    const third = end.police.find((c) => c.id === 2);
    expect(third.state).toBe("active");
    expect(third.health).toBeGreaterThan(50);
    // It carries on chasing after the crash.
    const t2 = r.frames.find((f) => f.t > 1.5).police.find((c) => c.id === 2);
    expect(Math.hypot(third.x - t2.x, third.z - t2.z)).toBeGreaterThan(10);
    expect(end.wrecks.length).toBe(2);
  });

  test("E: player gets out just before the cordon closes -> released -> chase resumes", async ({
    page,
  }, info) => {
    const r = await play(page, "E");
    save(info, `${info.project.name}-E`, r, OUT);
    await page.screenshot({ path: `${OUT}/${info.project.name}-E-final.png` });
    expect(r.result).not.toBe("arrested");
    const plan = r.events.find((e) => e.kind === "cordon" && e.type === "plan");
    const release = r.events.find(
      (e) => e.kind === "cordon" && e.type === "release",
    );
    expect(plan).toBeTruthy();
    expect(release?.reason).toBe("player-escaped");
    expect(release.sealedFor).toBe(0);
    // After the release no car is still parked for the old cordon and the
    // police are moving again.
    const after = r.frames.filter((f) => f.t > release.time + 0.3);
    expect(after.length).toBeGreaterThan(5);
    expect(
      after.some((f) =>
        f.police.some((c) => c.state === "active" && c.speed > 12),
      ),
    ).toBe(true);
    expect(after[0].police.filter((c) => c.kind === "cordon").length).toBe(0);
  });
});
