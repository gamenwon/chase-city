import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// V1.9 city interaction in the real game page (real requestAnimationFrame
// loop, city on, the device's own budget). Each scenario only places the
// player (and, where needed, the person or car it is about) when START is
// pressed; the city, police and physics then run unmodified. Filmed, with
// an overhead evidence frame every 0.25 s of game time and a state log.
const OUT = process.env.FIX_OUT || "test-results/v19-city";
test.use({ video: "on" });

async function play(page, name, seconds) {
  await page.goto("/?debug&mission=survival60");
  await page.evaluate(
    async ({ name }) => {
      const city = await import("/src/game/city.js");
      const { CONFIG } = await import("/src/game/config.js");
      const { sim: s, renderer: r } = window.__CHASE__;
      r.renderer.setPixelRatio(0.75);
      r.renderer.setSize(innerWidth, innerHeight);
      const start = s.start.bind(s);
      const setups = {
        // A bin on the kerb ahead at moderate speed.
        trash() {
          const prop = s.city.props.find(
            (p) =>
              p.kind === "trash" &&
              p.angle === Math.PI / 2 &&
              p.x > -40 &&
              p.x < 40 &&
              p.z > 0 &&
              p.z < 70,
          );
          const road = Math.round(prop.z / 30) * 30,
            side = Math.sign(prop.z - road);
          Object.assign(s.player, {
            x: prop.x,
            z: prop.z - side * 6,
            angle: side > 0 ? Math.PI : 0,
            vx: 0,
            vz: side * 12,
            speed: 12,
          });
          return { focus: prop, view: [-6, 9, -side * 9] };
        },
        // A street tree hit at full speed: it goes down across the kerb.
        tree() {
          const prop = s.city.props.find(
            (p) =>
              p.kind === "tree" &&
              p.angle === Math.PI / 2 &&
              p.x > -40 &&
              p.x < 40 &&
              p.z > 0 &&
              p.z < 70,
          );
          const road = Math.round(prop.z / 30) * 30,
            side = Math.sign(prop.z - road);
          Object.assign(s.player, {
            x: prop.x,
            z: prop.z - side * 9,
            angle: side > 0 ? Math.PI : 0,
            vx: 0,
            vz: side * 22,
            speed: 22,
          });
          return { focus: prop, view: [-7, 10, -side * 10] };
        },
        // Three people crossing the road ahead of the player.
        peds() {
          Object.assign(s.player, {
            x: 2.75,
            z: 40,
            angle: 0,
            vx: 0,
            vz: -20,
            speed: 20,
          });
          const people = [0, 1, 2].map((i) =>
            city.addPedestrian(s.city, {
              x: 0.5 + i * 1.6,
              z: 15 - i * 0.7,
              cx: 15,
              cz: 15,
              u: 0,
              walk: 0.8,
              react: [0.15, 0.35, 0.55][i],
              state: "cross",
              cross: {
                to: { cx: -15, cz: 15 },
                end: { x: -6.2, z: 15 - i * 0.7 },
              },
            }),
          );
          return {
            focus: { x: 2.75, z: 15 },
            view: [-9, 10, 9],
            people: people.map((p) => p.id),
          };
        },
        // A civilian car ahead; police pour in behind the player.
        traffic() {
          Object.assign(s.player, {
            x: -70,
            z: 2.75 + 0,
            angle: -Math.PI / 2,
            vx: 18,
            vz: 0,
            speed: 18,
          });
          const lane = { axis: "x", line: 0, dir: 1 };
          const car = city.addTraffic(
            s.city,
            lane,
            -45,
            city.laneCenter(lane),
            { cruise: 9, speed: 9 },
          );
          return { focus: car, view: [-8, 10, 9], car: car.id };
        },
      };
      s.start = () => {
        start();
        s.reinforcementsEnabled = false;
        s.barricadesEnabled = false;
        window.__setup = setups[name]();
        s.previousPlayer = { x: s.player.x, z: s.player.z };
        s.cameraRig.update(s.player, 0);
      };
      const log = (window.__v19 = { frames: [], shots: [], events: [] });
      let nextLog = 0,
        nextShot = 0,
        seen = 0;
      const canvas = r.renderer.domElement;
      const render = r.render.bind(r);
      const drone = r.camera.clone();
      drone.fov = 55;
      drone.updateProjectionMatrix();
      r.render = (...args) => {
        render(...args);
        if (window.__CHASE__.state === "ready" || !window.__setup) return;
        if (s.elapsed >= nextShot) {
          nextShot += 0.25;
          const game = canvas.toDataURL("image/jpeg", 0.72);
          const f = window.__setup.focus;
          const [vx, vy, vz] = window.__setup.view;
          drone.position.set(f.x + vx, vy, f.z + vz);
          drone.lookAt(f.x, 0, f.z);
          drone.updateMatrixWorld();
          r.renderer.render(r.scene, drone);
          const close = canvas.toDataURL("image/jpeg", 0.8);
          render(args[0], 0, args[2]);
          log.shots.push({ t: s.elapsed, data: game, close });
        }
      };
      const sample = () => {
        const c = s.city;
        if (c && (s.elapsed >= nextLog || s.result)) {
          nextLog = s.elapsed + 0.1;
          log.frames.push({
            t: +s.elapsed.toFixed(3),
            player: {
              x: +s.player.x.toFixed(2),
              z: +s.player.z.toFixed(2),
              speed: +(s.player.groundSpeed || 0).toFixed(2),
            },
            health: s.health,
            stats: { ...c.stats },
            solids: c.solids.length,
            props: c.props
              .filter((p) => p.state !== "stand" || p.wobble > 0)
              .map((p) => ({
                id: p.id,
                kind: p.kind,
                state: p.state,
                x: +p.x.toFixed(2),
                z: +p.z.toFixed(2),
              })),
            peds: c.pedestrians.map((q) => ({
              id: q.id,
              state: q.state,
              x: +q.x.toFixed(2),
              z: +q.z.toFixed(2),
            })),
            traffic: c.traffic.map((t) => ({
              id: t.id,
              state: t.state,
              parked: t.parked,
              speed: +(t.speed || 0).toFixed(2),
              x: +t.x.toFixed(2),
              z: +t.z.toFixed(2),
              health: Math.round(t.health),
            })),
            explosions: s.stats.explosions,
            explosionCauses: s.events.map((e) => e.cause),
          });
          for (const e of c.events.filter((e) => e.id > seen))
            log.events.push(e);
          seen = c.eventId;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { name },
  );
  await page.locator("#start").click();
  await page.waitForFunction(
    (seconds) => {
      const { sim: s } = window.__CHASE__;
      return s.result || s.elapsed >= seconds;
    },
    seconds,
    { polling: 100, timeout: 300000 },
  );
  return page.evaluate(() => {
    const { sim: s } = window.__CHASE__;
    return {
      result: s.result,
      elapsed: s.elapsed,
      setup: window.__setup,
      perf: window.__CHASE__.perf,
      ...window.__v19,
    };
  });
}

function save(info, name, record) {
  mkdirSync(OUT, { recursive: true });
  const tag = `${info.project.name}-${name}`;
  record.shots.forEach((shot, i) => {
    const n = String(i).padStart(3, "0");
    writeFileSync(
      `${OUT}/${tag}-${n}.jpg`,
      Buffer.from(shot.data.split(",")[1], "base64"),
    );
    writeFileSync(
      `${OUT}/${tag}-close-${n}.jpg`,
      Buffer.from(shot.close.split(",")[1], "base64"),
    );
  });
  const { shots, ...rest } = record;
  writeFileSync(`${OUT}/${tag}-log.json`, JSON.stringify(rest, null, 1));
}
const last = (a) => a[a.length - 1];

test.describe("V1.9 city interaction", () => {
  test.setTimeout(400000);

  test("trash can: knocked flying, rubbish spills, it stays on the road", async ({
    page,
  }, info) => {
    const r = await play(page, "trash", 6);
    save(info, "trash", r);
    await page.screenshot({
      path: `${OUT}/${info.project.name}-trash-final.png`,
    });
    const id = r.setup.focus.id;
    const broke = r.events.find(
      (e) => e.type === "prop" && e.kind === "trash" && e.action === "break",
    );
    expect(broke).toBeTruthy();
    const end = last(r.frames).props.find((p) => p.id === id);
    expect(end.state).toBe("down");
    expect(last(r.frames).stats.trashKnocked).toBeGreaterThanOrEqual(1);
    // The city never sets off explosions or chains (police cars chasing
    // nearby may still crash into each other: vehicle crashes, not blasts).
    expect(last(r.frames).stats.cityExplosions).toBe(0);
    expect(last(r.frames).explosionCauses.every((c) => c !== "blast")).toBe(
      true,
    );
  });

  test("street tree: a hard hit fells it, it lies across the kerb as an obstacle", async ({
    page,
  }, info) => {
    const r = await play(page, "tree", 7);
    save(info, "tree", r);
    await page.screenshot({
      path: `${OUT}/${info.project.name}-tree-final.png`,
    });
    const id = r.setup.focus.id;
    const down = r.frames.find((f) =>
      f.props.some((p) => p.id === id && p.state === "down"),
    );
    expect(down).toBeTruthy();
    expect(last(r.frames).props.find((p) => p.id === id).state).toBe("down");
    expect(last(r.frames).solids).toBeGreaterThanOrEqual(1);
    expect(r.events.some((e) => e.kind === "tree" && e.action === "land")).toBe(
      true,
    );
    // The city never sets off explosions or chains (police cars chasing
    // nearby may still crash into each other: vehicle crashes, not blasts).
    expect(last(r.frames).stats.cityExplosions).toBe(0);
    expect(last(r.frames).explosionCauses.every((c) => c !== "blast")).toBe(
      true,
    );
  });

  test("pedestrians: people crossing ahead each react, run aside and nobody is hit", async ({
    page,
  }, info) => {
    const r = await play(page, "peds", 5);
    save(info, "peds", r);
    const ids = r.setup.people;
    const reacted = ids.map((id) =>
      r.frames.find((f) =>
        f.peds.some(
          (q) => q.id === id && ["alert", "flee", "dive"].includes(q.state),
        ),
      ),
    );
    expect(reacted.filter(Boolean).length).toBe(3);
    expect(last(r.frames).stats.pedestrianHits).toBe(0);
  });

  test("traffic: a chase coming through makes a car brake and honk; it gets pushed, never explodes", async ({
    page,
  }, info) => {
    const r = await play(page, "traffic", 9);
    save(info, "traffic", r);
    const id = r.setup.car;
    const track = r.frames
      .map((f) => f.traffic.find((t) => t.id === id))
      .filter(Boolean);
    expect(track.some((t) => t.state === "yield")).toBe(true);
    expect(Math.min(...track.map((t) => t.speed))).toBeLessThan(1.5);
    expect(
      r.events.some((e) => e.type === "traffic" && e.action === "honk"),
    ).toBe(true);
    // The city never sets off explosions or chains (police cars chasing
    // nearby may still crash into each other: vehicle crashes, not blasts).
    expect(last(r.frames).stats.cityExplosions).toBe(0);
    expect(last(r.frames).explosionCauses.every((c) => c !== "blast")).toBe(
      true,
    );
  });
});

// Frame rate with the city on, on the real frame loop, while chasing (an
// evasive weave). SwiftShader (software GL) here: compare, do not read the
// absolute numbers as phone FPS.
test("performance: frame time with the city on, governor log", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  await page.goto("/?debug&mission=survival60");
  await page.locator("#start").click();
  const result = await page.evaluate(async () => {
    const { sim: s, input, perf } = window.__CHASE__;
    Object.defineProperty(input, "left", {
      configurable: true,
      get: () => Math.floor(s.elapsed / 2) % 3 === 1,
    });
    const frames = [];
    await new Promise((done) => {
      let lastT = performance.now();
      const startT = lastT;
      const tick = (now) => {
        frames.push(now - lastT);
        lastT = now;
        if (now - startT < 15000) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    frames.sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      fps: +(1000 / mean).toFixed(1),
      p95ms: +frames[Math.floor(frames.length * 0.95)].toFixed(1),
      perf: JSON.parse(JSON.stringify(perf)),
      actors: {
        peds: s.city.pedestrians.length,
        traffic: s.city.traffic.length,
      },
      budget: s.cityBudget,
    };
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    `${OUT}/${info.project.name}-perf.json`,
    JSON.stringify(result, null, 1),
  );
  await info.attach("v19-perf", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(result.perf.profile).toBe(
    info.project.name.includes("iphone") ? "mobile" : "desktop",
  );
  expect(result.actors.peds).toBeLessThanOrEqual(result.budget.peds);
});
